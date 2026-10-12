"""WebSocket server: relays R10 shots to the browser game as JSON.

Protocol (JSON text frames, version 1)

Game -> bridge
    {"type": "pair", "address": "optional BLE address"}
    {"type": "disconnect"}
    {"type": "shot_config", "teeRangeYards": 7, "temperatureC": 20, ...}
    {"type": "mock_shot", "club": "DR"}           (mock mode only)
    {"type": "ping"}

Bridge -> game
    {"type": "hello", "bridge": "alton-r10-bridge", "version": "...", "protocol": 1,
     "mode": "ble"|"mock", "status": {...last status...}}
    {"type": "status", "state": "idle|scanning|found|connecting|handshake|ready|
                                  reconnecting|disconnected|error",
     "message": "...", "code": "not_found|pairing_failed|...", "device": {...}}
    {"type": "device_state", "state": "WAITING|RECORDING|PROCESSING|..."}
    {"type": "shot", "source": "r10"|"mock", "receivedAt": 1712345678901, "shot": {...}}
    {"type": "device_error", "code": "PLATFORM_TILTED", "severity": "WARNING"}
    {"type": "pong"}
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from . import __version__
from . import messages as M
from .client import DeviceInfoReceived, HandshakeComplete, ProtocolError, Ready, Registered
from .links import BaseLink, BleLink, LinkError, MockLink

log = logging.getLogger("r10bridge.server")

ALLOWED_ORIGIN_HOSTS = ("localhost", "127.0.0.1", "[::1]")


class Bridge:
    def __init__(self, mock: bool = False, auto_shot_interval: float = 0.0, mock_fail: str | None = None,
                 address: str | None = None, scan_timeout: float = 20.0, auto_reconnect: bool = True):
        self.mock = mock
        self.auto_shot_interval = auto_shot_interval
        self.mock_fail = mock_fail
        self.address = address
        self.scan_timeout = scan_timeout
        self.auto_reconnect = auto_reconnect
        self.clients: set = set()
        self.link: BaseLink | None = None
        self.last_status: dict[str, Any] = {"type": "status", "state": "idle", "message": "Not connected"}
        self._connect_task: asyncio.Task | None = None
        self._watch_task: asyncio.Task | None = None
        self._user_disconnect = False

    # ── broadcasting ──

    async def broadcast(self, msg: dict) -> None:
        if msg.get("type") == "status":
            self.last_status = msg
        data = json.dumps(msg)
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)

    async def _on_status(self, state: str, message: str, extra: dict) -> None:
        log.info("[%s] %s", state, message)
        await self.broadcast({"type": "status", "state": state, "message": message, **extra})

    async def _on_event(self, ev: object) -> None:
        if isinstance(ev, M.Shot):
            b = ev.ball or {}
            log.info("SHOT #%s  %.1f mph  VLA %.1f  HLA %.1f  spin %.0f  axis %.1f",
                     ev.shot_id, b.get("speedMph", 0), b.get("launchAngle", 0),
                     b.get("launchDirection", 0), b.get("totalSpin", 0), b.get("spinAxis", 0))
            await self.broadcast({
                "type": "shot",
                "source": "mock" if self.mock else "r10",
                "receivedAt": int(time.time() * 1000),
                "shot": ev.to_json(),
            })
        elif isinstance(ev, Ready):
            if self.last_status.get("state") != "ready":
                await self._on_status("ready", "R10 armed and waiting for a shot",
                                      {"device": self.link.device if self.link else {}})
        elif isinstance(ev, M.StateChange):
            await self.broadcast({"type": "device_state", "state": ev.state})
        elif isinstance(ev, M.DeviceError):
            log.warning("device error %s (%s)", ev.code, ev.severity)
            await self.broadcast({"type": "device_error", "code": ev.code, "severity": ev.severity,
                                  "tilt": ev.tilt})
        elif isinstance(ev, DeviceInfoReceived):
            i = ev.info
            if self.link:
                self.link.device.update({"firmware": f"{i.software_version / 100:.2f}", "unitId": i.unit_id,
                                         "product": i.product_number})
        elif isinstance(ev, (Registered, HandshakeComplete)):
            log.debug("%s", ev)
        elif isinstance(ev, ProtocolError):
            log.warning("protocol: %s", ev.message)

    # ── link lifecycle ──

    def _make_link(self) -> BaseLink:
        if self.mock:
            return MockLink(self._on_status, self._on_event, self.auto_shot_interval, self.mock_fail)
        return BleLink(self._on_status, self._on_event)

    async def pair(self, address: str | None = None) -> None:
        if self._connect_task and not self._connect_task.done():
            return  # already in progress; status updates will flow
        if self.link and self.last_status.get("state") == "ready":
            await self.broadcast(self.last_status)
            return
        self._user_disconnect = False
        self._connect_task = asyncio.create_task(self._connect(address or self.address))

    async def _connect(self, address: str | None, attempt_label: str | None = None) -> bool:
        if self.link:
            await self.link.disconnect()
        self.link = self._make_link()
        try:
            await self.link.connect(self.scan_timeout, address)
            # Wait for the protocol handshake to reach Ready.
            for _ in range(100):
                if self.last_status.get("state") == "ready":
                    break
                await asyncio.sleep(0.1)
            else:
                raise LinkError("handshake_timeout", "Connected, but the R10 never armed. Power-cycle it and retry.")
            self._watch_task = asyncio.create_task(self._watch(self.link))
            return True
        except LinkError as e:
            await self.link.disconnect()
            await self.broadcast({"type": "status", "state": "error", "code": e.code, "message": str(e)})
            return False
        except Exception as e:  # pragma: no cover - unexpected backend failure
            log.exception("connect failed")
            if self.link:
                await self.link.disconnect()
            await self.broadcast({"type": "status", "state": "error", "code": "unknown", "message": str(e)})
            return False

    async def _watch(self, link: BaseLink) -> None:
        link.disconnected.clear()
        await link.disconnected.wait()
        if self._user_disconnect or link is not self.link:
            return
        await self.broadcast({"type": "status", "state": "disconnected", "code": "link_lost",
                              "message": "Lost the R10. It may have gone to sleep or out of range."})
        if not self.auto_reconnect:
            return
        for attempt in range(1, 6):
            await asyncio.sleep(min(2 * attempt, 8))
            if self._user_disconnect:
                return
            await self.broadcast({"type": "status", "state": "reconnecting", "attempt": attempt,
                                  "message": f"Reconnecting (attempt {attempt} of 5)"})
            if await self._connect(self.address):
                return

    async def disconnect(self) -> None:
        self._user_disconnect = True
        if self._connect_task and not self._connect_task.done():
            self._connect_task.cancel()
        if self.link:
            await self.link.disconnect()
            self.link = None
        await self.broadcast({"type": "status", "state": "idle", "message": "Disconnected"})

    async def shutdown(self) -> None:
        self._user_disconnect = True
        for t in (self._connect_task, self._watch_task):
            if t and not t.done():
                t.cancel()
        if self.link:
            try:
                await asyncio.wait_for(self.link.disconnect(), 3)
            except (asyncio.TimeoutError, Exception):
                pass
            self.link = None

    # ── websocket handler ──

    async def handler(self, ws) -> None:
        self.clients.add(ws)
        log.info("game connected (%d client%s)", len(self.clients), "" if len(self.clients) == 1 else "s")
        try:
            await ws.send(json.dumps({
                "type": "hello", "bridge": "alton-r10-bridge", "version": __version__, "protocol": 1,
                "mode": "mock" if self.mock else "ble", "status": self.last_status,
            }))
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except (TypeError, ValueError):
                    continue
                await self._handle(ws, msg)
        except Exception as e:
            log.debug("client closed: %s", e)
        finally:
            self.clients.discard(ws)
            log.info("game disconnected")

    async def _handle(self, ws, msg: dict) -> None:
        t = msg.get("type")
        if t == "ping":
            await ws.send(json.dumps({"type": "pong", "t": msg.get("t")}))
        elif t == "pair":
            await self.pair(msg.get("address"))
        elif t == "disconnect":
            await self.disconnect()
        elif t == "status":
            await ws.send(json.dumps(self.last_status))
        elif t == "shot_config" and self.link:
            await self.link.send_shot_config(
                temperature=msg.get("temperatureC"), humidity=msg.get("humidity"),
                altitude=msg.get("altitudeM"), air_density=msg.get("airDensity"),
                tee_range=msg.get("teeRangeYards"),
            )
        elif t == "mock_shot" and isinstance(self.link, MockLink):
            await self.link.swing(str(msg.get("club", "7I")))


def _origin_ok(origin: str | None) -> bool:
    if not origin or origin == "null":  # file:// pages and non-browser clients
        return True
    try:
        host = origin.split("://", 1)[1].split("/", 1)[0]
        hostname = host.rsplit(":", 1)[0] if not host.startswith("[") else host.split("]")[0] + "]"
    except IndexError:
        return False
    return hostname in ALLOWED_ORIGIN_HOSTS


async def serve(host: str, port: int, bridge: Bridge, auto_pair: bool = False) -> None:
    from websockets.asyncio.server import serve as ws_serve
    from websockets.http11 import Response
    from websockets.datastructures import Headers

    def process_request(connection, request):
        if not _origin_ok(request.headers.get("Origin")):
            return Response(403, "Forbidden", Headers([("Content-Type", "text/plain")]), b"origin not allowed\n")
        return None

    server = await ws_serve(bridge.handler, host, port, process_request=process_request,
                            ping_interval=20, ping_timeout=20)
    log.info("R10 bridge listening on ws://%s:%d  (%s mode)", host, port, "MOCK" if bridge.mock else "BLE")
    try:
        if auto_pair:
            await bridge.pair()
        await server.serve_forever()
    finally:
        await bridge.shutdown()
        server.close()
        try:
            await asyncio.wait_for(server.wait_closed(), 3)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            pass
