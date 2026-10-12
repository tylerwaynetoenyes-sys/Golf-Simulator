"""Device links: real BLE (bleak) and an in-process mock.

A link owns the transport and an `R10Session`, and reports progress through
`on_status(state, message, extra)` and decoded protocol events through
`on_event(event)`. States: scanning -> found -> connecting -> handshake -> ready.
"""

from __future__ import annotations

import asyncio
import logging
import random
import sys
import time
from typing import Awaitable, Callable

from . import protocol as P
from .client import DeviceInfoReceived, R10Session
from .mock import FakeR10, random_shot

log = logging.getLogger("r10bridge.link")

StatusCb = Callable[[str, str, dict], Awaitable[None] | None]
EventCb = Callable[[object], Awaitable[None] | None]


class LinkError(Exception):
    """Raised with a machine-readable `code` the UI maps to a friendly message."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


async def _maybe(r):
    if asyncio.iscoroutine(r):
        await r


class BaseLink:
    name = "base"

    def __init__(self, on_status: StatusCb, on_event: EventCb):
        self.on_status = on_status
        self.on_event = on_event
        self.session: R10Session | None = None
        self.device: dict = {}
        self.disconnected = asyncio.Event()

    async def status(self, state: str, message: str = "", **extra) -> None:
        await _maybe(self.on_status(state, message, extra))

    async def connect(self, scan_timeout: float = 20.0, address: str | None = None) -> None:
        raise NotImplementedError

    async def disconnect(self) -> None:
        raise NotImplementedError

    async def send_shot_config(self, **kwargs) -> None:
        if self.session:
            self.session.send_shot_config(**kwargs)

    async def wake(self) -> None:
        """Re-arm the radar (WakeUpRequest). Safe to call any time after the handshake."""
        if self.session:
            self.session.send_wakeup()

    async def restart_handshake(self) -> None:
        """Resend MultiLink REGISTER if the device never answered the first one."""
        if self.session:
            self.session.start()

    @property
    def phase(self) -> str:
        return self.session.phase if self.session else "none"

    async def _emit(self, events: list) -> None:
        for ev in events:
            if isinstance(ev, DeviceInfoReceived):
                i = ev.info
                self.device.update({"firmware": f"{i.software_version / 100:.2f}", "unitId": i.unit_id,
                                    "product": i.product_number})
            await _maybe(self.on_event(ev))


# ── Real hardware ─────────────────────────────────────────────────────────


def _looks_like_r10(name: str) -> bool:
    n = (name or "").lower()
    return "approach r10" in n or n.startswith("r10") or ("approach" in n and "r10" in n)


def _is_r10(device, adv) -> bool:
    name = (adv.local_name or getattr(device, "name", None) or "") if adv else (getattr(device, "name", "") or "")
    if "approach r10" in name.lower():
        return True
    mfr = getattr(adv, "manufacturer_data", None) or {}
    data = mfr.get(P.GARMIN_MANUFACTURER_ID)
    if data is not None and len(data) >= 2:
        return (data[0] | (data[1] << 8)) == P.R10_PRODUCT_ID
    return False


class BleLink(BaseLink):
    name = "ble"

    def __init__(self, on_status: StatusCb, on_event: EventCb):
        super().__init__(on_status, on_event)
        self.client = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._write_q: asyncio.Queue[tuple[str, bytes]] = asyncio.Queue()
        self._writer_task: asyncio.Task | None = None
        self._rx_q: asyncio.Queue[bytes] = asyncio.Queue()
        self._rx_task: asyncio.Task | None = None
        self.last_rx = 0.0
        self.seen: list[str] = []

    async def _fallback_scan(self, BleakScanner, seconds: float = 5.0):
        """Second pass: full discovery, matching looser names, remembering what we saw."""
        try:
            found = await BleakScanner.discover(timeout=seconds, return_adv=True)
        except Exception as e:  # adapter trouble surfaces in the first pass
            log.debug("fallback scan failed: %s", e)
            return None
        best = None
        seen = []
        for _addr, (dev, adv) in found.items():
            name = adv.local_name or dev.name or ""
            seen.append((adv.rssi if adv.rssi is not None else -999, name or dev.address))
            if _is_r10(dev, adv) or _looks_like_r10(name):
                if best is None or (adv.rssi or -999) > (best[1].rssi or -999):
                    best = (dev, adv)
        seen.sort(reverse=True)
        self.seen = [f"{n} ({r} dBm)" for r, n in seen[:8]]
        return best[0] if best else None

    async def connect(self, scan_timeout: float = 20.0, address: str | None = None) -> None:
        try:
            from bleak import BleakClient, BleakScanner
            from bleak.exc import BleakError
        except ImportError as e:  # pragma: no cover
            raise LinkError("bleak_missing", "Python package 'bleak' is not installed (pip install -r requirements.txt)") from e

        self._loop = asyncio.get_running_loop()
        await self.status("scanning", "Looking for an Approach R10 nearby")

        device = None
        try:
            if address:
                device = await BleakScanner.find_device_by_address(address, timeout=scan_timeout)
            else:
                device = await BleakScanner.find_device_by_filter(_is_r10, timeout=scan_timeout)
        except BleakError as e:
            msg = str(e)
            low = msg.lower()
            if "powered" in low or "not available" in low or "no bluetooth adapter" in low or "adapter" in low:
                raise LinkError("bluetooth_off", f"Bluetooth is unavailable: {msg}") from e
            raise LinkError("scan_failed", f"Bluetooth scan failed: {msg}") from e
        except OSError as e:
            raise LinkError("bluetooth_off", f"Bluetooth is unavailable: {e}") from e

        if device is None and not address:
            await self.status("scanning", "Still looking — doing a wider scan")
            device = await self._fallback_scan(BleakScanner)
        if device is None:
            nearby = f" Nearby: {', '.join(self.seen)}." if self.seen else " No Bluetooth devices were visible at all."
            raise LinkError(
                "not_found",
                "No Approach R10 found. Power it on, hold the button until the LED is solid blue, "
                "and make sure it isn't connected to the Garmin Golf app." + nearby,
            )

        self.device = {"name": device.name or P.R10_NAME, "address": device.address}
        await self.status("found", f"Found {self.device['name']}", device=self.device)
        await self.status("connecting", "Connecting and pairing", device=self.device)

        def _on_disconnect(_c) -> None:
            if self._loop:
                self._loop.call_soon_threadsafe(self.disconnected.set)

        try:
            try:
                self.client = BleakClient(device, disconnected_callback=_on_disconnect, timeout=20.0, pair=True)
            except TypeError:  # older bleak without the pair kwarg
                self.client = BleakClient(device, disconnected_callback=_on_disconnect, timeout=20.0)
            await self.client.connect()
            if sys.platform.startswith("linux") or sys.platform == "win32":
                try:
                    await self.client.pair()
                except Exception as e:  # already bonded, or OS handles pairing
                    log.debug("pair() ignored: %s", e)
        except asyncio.TimeoutError as e:
            raise LinkError("connect_timeout", "The R10 didn't answer the connection request. Move closer and try again.") from e
        except BleakError as e:
            msg = str(e)
            low = msg.lower()
            if "auth" in low or "pair" in low or "bond" in low or "insufficient" in low:
                raise LinkError("pairing_failed", f"Pairing was rejected: {msg}") from e
            raise LinkError("connect_failed", f"Couldn't connect: {msg}") from e
        except (OSError, ValueError, RuntimeError) as e:
            raise LinkError("connect_failed", f"Couldn't connect: {e}") from e

        try:
            await self.status("handshake", "Securing link and arming radar", device=self.device)
            self.session = R10Session(self._queue_data, self._queue_register, mtu=20)
            self._writer_task = asyncio.create_task(self._writer())
            self._rx_task = asyncio.create_task(self._reader())
            await self.client.start_notify(P.CHAR_NOTIFY_REGISTER_UUID, self._on_notify)
            self.session.start()
        except Exception as e:
            await self.disconnect()
            low = str(e).lower()
            if "not found" in low or "characteristic" in low:
                raise LinkError(
                    "unsupported",
                    "Connected, but the MultiLink service is missing. Is this an Approach R10 with current firmware?",
                ) from e
            if "auth" in low or "encrypt" in low or "insufficient" in low:
                raise LinkError("pairing_failed", "The R10 requires pairing. Pair it once in your OS Bluetooth settings.") from e
            raise LinkError("connect_failed", f"Setup failed: {e}") from e

    def _on_notify(self, _char, data: bytearray) -> None:
        # bleak may call from a backend thread
        self.last_rx = time.monotonic()
        if self._loop:
            self._loop.call_soon_threadsafe(self._rx_q.put_nowait, bytes(data))

    async def _reader(self) -> None:
        while True:
            chunk = await self._rx_q.get()
            assert self.session is not None
            await self._emit(self.session.feed(chunk))

    def _queue_data(self, chunk: bytes) -> None:
        self._write_q.put_nowait(("data", chunk))

    def _queue_register(self, data: bytes) -> None:
        self._write_q.put_nowait(("register", data))

    async def _writer(self) -> None:
        while True:
            kind, data = await self._write_q.get()
            try:
                if kind == "register":
                    await self.client.write_gatt_char(P.CHAR_NOTIFY_REGISTER_UUID, data, response=True)
                else:
                    await self.client.write_gatt_char(P.CHAR_WRITE_UUID, data, response=False)
                    # Write-without-response can be dropped by some adapters when
                    # flooded; a few ms between chunks keeps multi-chunk frames intact.
                    await asyncio.sleep(0.004)
            except Exception as e:  # link dropped mid-write
                log.warning("BLE write failed: %s", e)
                self.disconnected.set()
                return

    async def disconnect(self) -> None:
        for t in (self._writer_task, self._rx_task):
            if t:
                t.cancel()
        self._writer_task = self._rx_task = None
        if self.client is not None:
            try:
                if self.client.is_connected:
                    await self.client.disconnect()
            except Exception:
                pass
        self.client = None
        self.session = None
        self.disconnected.set()


# ── Mock hardware ─────────────────────────────────────────────────────────


class MockLink(BaseLink):
    """Simulated R10 with realistic connection timing and optional auto shots."""

    name = "mock"

    def __init__(self, on_status: StatusCb, on_event: EventCb, auto_shot_interval: float = 0.0,
                 fail: str | None = None, drop_after: float = 0.0, fast: bool = False):
        super().__init__(on_status, on_event)
        self.fake: FakeR10 | None = None
        self.auto_shot_interval = auto_shot_interval
        self.fail = fail
        self.drop_after = drop_after
        self.speed = 0.05 if fast else 1.0
        self.last_rx = 0.0
        self._auto_task: asyncio.Task | None = None
        self._drop_task: asyncio.Task | None = None
        self._pending: list[bytes] = []
        self.rng = random.Random()

    async def connect(self, scan_timeout: float = 20.0, address: str | None = None) -> None:
        k = self.speed
        await self.status("scanning", "Looking for an Approach R10 nearby")
        await asyncio.sleep(1.6 * k)
        if self.fail == "not_found":
            await asyncio.sleep(2.0 * k)
            raise LinkError("not_found", "No Approach R10 found (simulated). Nearby: Tyler's iPhone (-48 dBm), Living Room TV (-71 dBm).")
        self.device = {"name": "Approach R10 (Simulated)", "address": "MO:CK:R1:0:00:01"}
        await self.status("found", f"Found {self.device['name']}", device=self.device)
        await asyncio.sleep(0.5 * k)
        await self.status("connecting", "Connecting and pairing", device=self.device)
        await asyncio.sleep(0.9 * k)
        if self.fail == "pairing_failed":
            raise LinkError("pairing_failed", "Pairing was rejected (simulated).")
        await self.status("handshake", "Securing link and arming radar", device=self.device)
        await asyncio.sleep(0.4 * k)

        self.session = R10Session(self._to_device_data, self._to_device_register)
        self.fake = FakeR10(self._from_device)
        self.disconnected.clear()
        self.session.start()
        await self._pump()
        if self.auto_shot_interval > 0:
            self._auto_task = asyncio.create_task(self._auto())
        if self.drop_after > 0:
            self._drop_task = asyncio.create_task(self._drop())

    async def _drop(self) -> None:
        await asyncio.sleep(self.drop_after)
        log.info("mock: simulating a Bluetooth drop")
        self.fake = None
        self.session = None
        self.disconnected.set()

    def _to_device_register(self, data: bytes) -> None:
        assert self.fake is not None
        self.fake.on_register_write(data)

    def _to_device_data(self, chunk: bytes) -> None:
        assert self.fake is not None
        self.fake.on_data_write(chunk)

    def _from_device(self, chunk: bytes) -> None:
        self.last_rx = time.monotonic()
        self._pending.append(chunk)

    async def _pump(self) -> None:
        # Deliver device notifications in order, re-entrantly safe.
        while self._pending:
            chunk = self._pending.pop(0)
            assert self.session is not None
            await self._emit(self.session.feed(chunk))

    async def swing(self, club: str = "7I", shot: dict | None = None) -> None:
        if not self.fake:
            return
        self.fake.swing(shot or random_shot(club, self.rng))
        await self._pump()

    async def send_shot_config(self, **kwargs) -> None:
        await super().send_shot_config(**kwargs)
        await self._pump()

    async def wake(self) -> None:
        await super().wake()
        await self._pump()

    async def _auto(self) -> None:
        clubs = ["DR", "7I", "PW", "5I", "3W", "9I"]
        i = 0
        while True:
            await asyncio.sleep(self.auto_shot_interval)
            await self.swing(clubs[i % len(clubs)])
            i += 1

    async def disconnect(self) -> None:
        for t in (self._auto_task, self._drop_task):
            if t:
                t.cancel()
        self._auto_task = self._drop_task = None
        self.fake = None
        self.session = None
        self.disconnected.set()
