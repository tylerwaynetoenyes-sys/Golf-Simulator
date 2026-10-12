"""WebSocket server: relays R10 shots to the browser game as JSON.

Protocol (JSON text frames, version 1)

Game -> bridge
    {"type": "pair", "address": "optional BLE address"}
    {"type": "disconnect"}
    {"type": "reconnect"}                          drop the link and connect again
    {"type": "wake"}                               re-arm the radar (WakeUpRequest)
    {"type": "shot_config", "teeRangeYards": 2.3, "temperatureC": 20, ...}
    {"type": "diag"}                               -> {"type": "diag", ...}
    {"type": "mock_shot", "club": "DR"}            (mock mode only)
    {"type": "ping"}

Bridge -> game
    {"type": "hello", "bridge": "alton-r10-bridge", "version": "...", "protocol": 1,
     "mode": "ble"|"mock", "status": {...last status...}}
    {"type": "status", "state": "idle|scanning|found|connecting|handshake|ready|
                                  reconnecting|disconnected|error",
     "message": "...", "code": "not_found|pairing_failed|...", "device": {...}}
    {"type": "device_state", "state": "WAITING|RECORDING|PROCESSING|..."}
    {"type": "shot", "source": "r10"|"mock", "receivedAt": 1712345678901, "shot": {...}}
    {"type": "misread", "shot": {...}}             radar saw a swing but no ball data
    {"type": "device_error", "code": "PLATFORM_TILTED", "severity": "WARNING"}
    {"type": "heartbeat", "link": "ready", "deviceState": "WAITING", "shots": 12,
     "lastShotAgo": 40.2, "lastRxAgo": 1.3, "uptime": 812}       every 5 s
    {"type": "pong"}
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import time
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from . import __version__
from . import messages as M
from .client import DeviceInfoReceived, HandshakeComplete, ProtocolError, Ready, Registered
from .links import BaseLink, BleLink, LinkError, MockLink

log = logging.getLogger("r10bridge.server")

ALLOWED_ORIGIN_HOSTS = ("localhost", "127.0.0.1", "[::1]")

# Failures worth retrying automatically before bothering the player.
TRANSIENT = {"connect_failed", "connect_timeout", "handshake_timeout", "scan_failed"}
HEARTBEAT_S = 5.0


class Bridge:
    def __init__(self, mock: bool = False, auto_shot_interval: float = 0.0, mock_fail: str | None = None,
                 address: str | None = None, scan_timeout: float = 20.0, auto_reconnect: bool = True,
                 mock_drop: float = 0.0, mock_fast: bool = False):
        self.mock = mock
        self.auto_shot_interval = auto_shot_interval
        self.mock_fail = mock_fail
        self.mock_drop = mock_drop
        self.mock_fast = mock_fast
        self.address = address
        self.scan_timeout = scan_timeout
        self.auto_reconnect = auto_reconnect
        self.clients: set = set()
        self.link: BaseLink | None = None
        self.last_status: dict[str, Any] = {"type": "status", "state": "idle", "message": "Not connected"}
        self._connect_task: asyncio.Task | None = None
        self._watch_task: asyncio.Task | None = None
        self._hb_task: asyncio.Task | None = None
        self._user_disconnect = False
        self.device_state: str | None = None
        self.shots = 0
        self.last_shot_at = 0.0
        self.started = time.monotonic()
        self._last_wake = 0.0
        self._standby_since = 0.0

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
            self.last_shot_at = time.monotonic()
            if not ev.ball or not b.get("speedMps"):
                log.warning("SHOT #%s had no ball data (misread)", ev.shot_id)
                await self.broadcast({"type": "misread", "shot": ev.to_json()})
                return
            self.shots += 1
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
            self.device_state = "WAITING"
            if self.last_status.get("state") != "ready":
                await self._on_status("ready", "R10 armed and waiting for a shot",
                                      {"device": self.link.device if self.link else {}})
        elif isinstance(ev, M.StateChange):
            self.device_state = ev.state
            self._standby_since = time.monotonic() if ev.state == "STANDBY" else 0.0
            await self.broadcast({"type": "device_state", "state": ev.state})
        elif isinstance(ev, M.DeviceError):
            log.warning("device error %s (%s)", ev.code, ev.severity)
            await self.broadcast({"type": "device_error", "code": ev.code, "severity": ev.severity,
                                  "tilt": ev.tilt})
        elif isinstance(ev, (Registered, HandshakeComplete, DeviceInfoReceived)):
            log.debug("%s", ev)
        elif isinstance(ev, ProtocolError):
            log.warning("protocol: %s", ev.message)

    # ── link lifecycle ──

    def _make_link(self) -> BaseLink:
        if self.mock:
            return MockLink(self._on_status, self._on_event, self.auto_shot_interval, self.mock_fail,
                            drop_after=self.mock_drop, fast=self.mock_fast)
        return BleLink(self._on_status, self._on_event)

    @property
    def linked(self) -> bool:
        return self.link is not None and self.last_status.get("state") == "ready"

    async def pair(self, address: str | None = None) -> None:
        if self._connect_task and not self._connect_task.done():
            return  # already in progress; status updates will flow
        if self.linked:
            await self.broadcast(self.last_status)
            return
        self._user_disconnect = False
        self._connect_task = asyncio.create_task(self._connect_with_retries(address or self.address))

    async def _connect_with_retries(self, address: str | None, attempts: int = 3) -> bool:
        for attempt in range(1, attempts + 1):
            code = await self._connect(address, report=attempt == attempts)
            if code is None:
                return True
            if code not in TRANSIENT or self._user_disconnect:
                return False
            if attempt < attempts:
                log.info("transient failure (%s); retrying (%d/%d)", code, attempt + 1, attempts)
                await self.broadcast({"type": "status", "state": "connecting", "message":
                                      f"Retrying the connection ({attempt + 1} of {attempts})",
                                      "device": self.link.device if self.link else {}})
                await asyncio.sleep(1.5 * attempt)
        return False

    async def _connect(self, address: str | None, report: bool = True) -> str | None:
        """One connection attempt. Returns None on success, else the failure code."""
        if self.link:
            await self.link.disconnect()
        self.link = link = self._make_link()
        self.device_state = None
        try:
            await link.connect(self.scan_timeout, address)
            # Wait for the protocol handshake to reach Ready; nudge it once if the
            # REGISTER got lost (it happens on busy adapters).
            nudged = False
            for i in range(120):
                if self.last_status.get("state") == "ready":
                    break
                if i == 50 and not nudged and link.phase == "registering":
                    log.info("no REGISTER response yet; resending")
                    nudged = True
                    await link.restart_handshake()
                if i == 80 and link.phase in ("subscribing", "waking_up", "active"):
                    await link.wake()
                await asyncio.sleep(0.1)
            else:
                raise LinkError("handshake_timeout", "Connected, but the R10 never armed. Power-cycle it and retry.")
            self._watch_task = asyncio.create_task(self._watch(link))
            return None
        except LinkError as e:
            await link.disconnect()
            if report or e.code not in TRANSIENT:
                await self.broadcast({"type": "status", "state": "error", "code": e.code, "message": str(e)})
            log.warning("connect failed: %s (%s)", e, e.code)
            return e.code
        except asyncio.CancelledError:
            await link.disconnect()
            raise
        except Exception as e:  # pragma: no cover - unexpected backend failure
            log.exception("connect failed")
            await link.disconnect()
            if report:
                await self.broadcast({"type": "status", "state": "error", "code": "unknown", "message": str(e)})
            return "unknown"

    async def _watch(self, link: BaseLink) -> None:
        link.disconnected.clear()
        await link.disconnected.wait()
        if self._user_disconnect or link is not self.link:
            return
        await self.broadcast({"type": "status", "state": "disconnected", "code": "link_lost",
                              "message": "Lost the R10. It may have gone to sleep or out of range."})
        if not self.auto_reconnect:
            return
        attempt = 0
        # Keep trying for as long as the player hasn't disconnected on purpose.
        while not self._user_disconnect:
            attempt += 1
            await asyncio.sleep(min(2 * attempt, 10))
            if self._user_disconnect:
                return
            hint = "" if attempt < 4 else " Check the R10 is on and in range."
            await self.broadcast({"type": "status", "state": "reconnecting", "attempt": attempt,
                                  "message": f"Reconnecting (attempt {attempt}).{hint}"})
            if await self._connect(self.address, report=False) is None:
                return

    async def reconnect(self) -> None:
        if self._connect_task and not self._connect_task.done():
            return
        self._user_disconnect = False
        if self.link:
            old = self.link
            self.link = None
            await old.disconnect()
        self._connect_task = asyncio.create_task(self._connect_with_retries(self.address))

    async def disconnect(self) -> None:
        self._user_disconnect = True
        if self._connect_task and not self._connect_task.done():
            self._connect_task.cancel()
        if self.link:
            await self.link.disconnect()
            self.link = None
        self.device_state = None
        await self.broadcast({"type": "status", "state": "idle", "message": "Disconnected"})

    async def shutdown(self) -> None:
        self._user_disconnect = True
        for t in (self._connect_task, self._watch_task, self._hb_task):
            if t and not t.done():
                t.cancel()
        if self.link:
            try:
                await asyncio.wait_for(self.link.disconnect(), 3)
            except (asyncio.TimeoutError, Exception):
                pass
            self.link = None

    # ── heartbeat + radar keep-alive ──

    def diagnostics(self) -> dict:
        now = time.monotonic()
        link = self.link
        return {
            "link": self.last_status.get("state"),
            "deviceState": self.device_state,
            "phase": link.phase if link else "none",
            "device": link.device if link else {},
            "shots": self.shots,
            "lastShotAgo": round(now - self.last_shot_at, 1) if self.last_shot_at else None,
            "lastRxAgo": round(now - link.last_rx, 1) if link and getattr(link, "last_rx", 0) else None,
            "uptime": round(now - self.started),
            "mode": "mock" if self.mock else "ble",
            "version": __version__,
        }

    async def heartbeat_loop(self) -> None:
        while True:
            await asyncio.sleep(HEARTBEAT_S)
            try:
                if self.linked and self.device_state == "STANDBY" and self._standby_since:
                    now = time.monotonic()
                    if now - self._standby_since > 6 and now - self._last_wake > 10:
                        log.info("radar is in standby; re-arming")
                        self._last_wake = now
                        await self.link.wake()
                if self.clients:
                    await self.broadcast({"type": "heartbeat", **self.diagnostics()})
            except asyncio.CancelledError:
                raise
            except Exception:  # never let the heartbeat die
                log.exception("heartbeat")

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
                if isinstance(msg, dict):
                    try:
                        await self._handle(ws, msg)
                    except Exception:
                        log.exception("handling %s", msg.get("type"))
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
        elif t == "reconnect":
            await self.reconnect()
        elif t == "wake" and self.link:
            self._last_wake = time.monotonic()
            await self.link.wake()
        elif t == "status":
            await ws.send(json.dumps(self.last_status))
        elif t == "diag":
            await ws.send(json.dumps({"type": "diag", **self.diagnostics()}))
        elif t == "shot_config" and self.link:
            await self.link.send_shot_config(
                temperature=msg.get("temperatureC"), humidity=msg.get("humidity"),
                altitude=msg.get("altitudeM"), air_density=msg.get("airDensity"),
                tee_range=msg.get("teeRangeYards"),
            )
        elif t == "mock_shot" and isinstance(self.link, MockLink):
            await self.link.swing(str(msg.get("club", "7I")))


ALLOW_LAN = False


def _origin_ok(origin: str | None, allow_lan: bool | None = None) -> bool:
    if allow_lan is None:
        allow_lan = ALLOW_LAN
    if not origin or origin == "null":  # file:// pages and non-browser clients
        return True
    try:
        host = origin.split("://", 1)[1].split("/", 1)[0]
        hostname = host.rsplit(":", 1)[0] if not host.startswith("[") else host.split("]")[0] + "]"
    except IndexError:
        return False
    if hostname in ALLOWED_ORIGIN_HOSTS:
        return True
    if allow_lan:
        if hostname.endswith(".local"):
            return True
        try:
            ip = ipaddress.ip_address(hostname.strip("[]"))
            return ip.is_private or ip.is_loopback or ip.is_link_local
        except ValueError:
            return False
    return False


CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".ktx2": "image/ktx2", ".hdr": "application/octet-stream",
    ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".woff2": "font/woff2", ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
}


def static_response(web_root: Path, raw_path: str):
    """Serve a file from the game directory (GET only, no directory listing)."""
    from websockets.datastructures import Headers
    from websockets.http11 import Response

    path = unquote(raw_path.split("?", 1)[0].split("#", 1)[0])
    if path.endswith("/"):
        path += "index.html"
    root = web_root.resolve()
    target = (root / path.lstrip("/")).resolve()
    if root not in target.parents and target != root:
        return Response(403, "Forbidden", Headers([("Content-Type", "text/plain")]), b"forbidden\n")
    if not target.is_file() or any(part.startswith(".") for part in target.relative_to(root).parts):
        return Response(404, "Not Found", Headers([("Content-Type", "text/plain")]), b"not found\n")
    body = target.read_bytes()
    ctype = CONTENT_TYPES.get(target.suffix.lower(), "application/octet-stream")
    headers = Headers([("Content-Type", ctype), ("Content-Length", str(len(body))), ("Cache-Control", "no-cache")])
    return Response(200, "OK", headers, body)


async def serve(host: str, port: int, bridge: Bridge, auto_pair: bool = False, web_root: Path | None = None) -> None:
    from websockets.asyncio.server import serve as ws_serve
    from websockets.datastructures import Headers
    from websockets.http11 import Response

    def process_request(connection, request):
        is_ws = "websocket" in request.headers.get("Upgrade", "").lower()
        if not is_ws:
            if web_root is not None:
                return static_response(web_root, request.path)
            return Response(426, "Upgrade Required", Headers([("Content-Type", "text/plain")]), b"WebSocket only\n")
        if not _origin_ok(request.headers.get("Origin")):
            return Response(403, "Forbidden", Headers([("Content-Type", "text/plain")]), b"origin not allowed\n")
        return None

    server = await ws_serve(bridge.handler, host, port, process_request=process_request,
                            ping_interval=20, ping_timeout=20)
    log.info("R10 bridge listening on ws://%s:%d  (%s mode)", host, port, "MOCK" if bridge.mock else "BLE")
    if web_root is not None:
        log.info("Game available at  http://%s:%d/", "localhost" if host in ("127.0.0.1", "0.0.0.0") else host, port)
    bridge._hb_task = asyncio.create_task(bridge.heartbeat_loop())
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
