"""`python -m r10bridge --diagnose`: a step-by-step check for test day.

1. Python + package versions
2. Bluetooth adapter is on and scanning works
3. Lists nearby Bluetooth devices, strongest first, flagging anything Garmin
4. Connects to the R10, runs the full handshake, waits for the radar to arm
5. Optionally waits for one real swing and prints the numbers

Exits 0 when the R10 armed (and a shot arrived, if one was requested), else 1.
"""

from __future__ import annotations

import asyncio
import platform
import sys
import time

from . import __version__
from . import messages as M
from . import protocol as P
from .client import Ready
from .links import BleLink, LinkError, MockLink, _is_r10, _looks_like_r10

_TTY = sys.stdout.isatty()
OK = "\033[32m✓\033[0m" if _TTY else "[ok]"
BAD = "\033[31m✗\033[0m" if _TTY else "[FAIL]"
INFO = "\033[36m•\033[0m" if _TTY else "-"


def _p(mark: str, text: str) -> None:
    print(f"  {mark} {text}", flush=True)


async def run(mock: bool = False, wait_shot: float = 30.0, address: str | None = None) -> int:
    print(f"\nr10bridge {__version__} diagnostics\n")
    _p(INFO, f"Python {platform.python_version()} on {platform.system()} {platform.release()} ({platform.machine()})")
    if sys.version_info < (3, 10):
        _p(BAD, "Python 3.10 or newer is required")
        return 1
    try:
        import websockets
        _p(OK, f"websockets {websockets.__version__}")
    except ImportError:
        _p(BAD, "websockets missing: pip install -r requirements.txt")
        return 1

    if not mock:
        try:
            import bleak
            from bleak import BleakScanner
            _p(OK, f"bleak {getattr(bleak, '__version__', '')}".strip())
        except ImportError:
            _p(BAD, "bleak missing: pip install -r requirements.txt")
            return 1

        print("\n  Scanning for 8 seconds…")
        try:
            found = await BleakScanner.discover(timeout=8.0, return_adv=True)
        except Exception as e:
            _p(BAD, f"Bluetooth scan failed: {e}")
            if platform.system() == "Darwin":
                _p(INFO, "macOS: System Settings → Privacy & Security → Bluetooth → allow your terminal app, then retry.")
            else:
                _p(INFO, "Turn Bluetooth on and make sure no other app holds the adapter.")
            return 1
        _p(OK, f"Bluetooth adapter is working ({len(found)} device(s) visible)")
        rows = []
        for _addr, (dev, adv) in found.items():
            name = adv.local_name or dev.name or "(no name)"
            garmin = P.GARMIN_MANUFACTURER_ID in (adv.manufacturer_data or {})
            r10 = _is_r10(dev, adv) or _looks_like_r10(name)
            rows.append((adv.rssi if adv.rssi is not None else -999, name, dev.address, garmin, r10))
        rows.sort(reverse=True)
        for rssi, name, addr, garmin, r10 in rows[:15]:
            tag = "  ← Approach R10" if r10 else ("  (Garmin)" if garmin else "")
            print(f"      {rssi:>5} dBm  {name[:28]:<28} {addr}{tag}")
        r10s = [r for r in rows if r[4]]
        if not r10s and not address:
            _p(BAD, "No Approach R10 in range.")
            _p(INFO, "Turn it on, hold its button until the LED is SOLID blue, close the Garmin Golf app, retry.")
            return 1
        if r10s:
            _p(OK, f"R10 found at {r10s[0][2]} ({r10s[0][0]} dBm)")
            if r10s[0][0] < -85:
                _p(INFO, "Signal is weak; move the computer closer to the R10.")

    print("\n  Connecting and running the handshake…")
    events: list = []
    statuses: list = []
    ready = asyncio.Event()
    shot_box: dict = {}

    async def on_status(state, message, extra):
        statuses.append(state)
        _p(INFO, f"{state:<10} {message}")

    async def on_event(ev):
        events.append(ev)
        if isinstance(ev, Ready):
            ready.set()
        elif isinstance(ev, M.Shot) and ev.ball:
            shot_box["shot"] = ev

    link = MockLink(on_status, on_event, fast=True) if mock else BleLink(on_status, on_event)
    t0 = time.monotonic()
    try:
        await link.connect(20.0, address)
        await asyncio.wait_for(ready.wait(), 15)
    except LinkError as e:
        _p(BAD, f"{e.code}: {e}")
        await link.disconnect()
        return 1
    except asyncio.TimeoutError:
        _p(BAD, f"Connected but the radar never armed (phase: {link.phase}). Power-cycle the R10 and retry.")
        await link.disconnect()
        return 1
    _p(OK, f"Radar armed in {time.monotonic() - t0:.1f}s · firmware {link.device.get('firmware', '?')}")

    code = 0
    if wait_shot > 0:
        print(f"\n  Take a swing within {wait_shot:.0f} seconds (Ctrl+C to skip)…")
        if mock:
            await asyncio.sleep(0.5)
            await link.swing("7I")
        try:
            for _ in range(int(wait_shot * 10)):
                if "shot" in shot_box:
                    break
                await asyncio.sleep(0.1)
        except asyncio.CancelledError:
            pass
        shot = shot_box.get("shot")
        if shot:
            b = shot.ball
            _p(OK, f"Shot received: {b['speedMph']:.1f} mph, launch {b['launchAngle']:.1f}°, "
                   f"spin {b['totalSpin']:.0f} rpm, axis {b['spinAxis']:.1f}°")
        else:
            _p(BAD, "No shot arrived. Check the R10 is 1.8–2.4 m (6–8 ft) behind the ball, level, aimed at the target.")
            code = 1
    await link.disconnect()
    print("\n  " + ("All checks passed. Start the bridge with: python -m r10bridge" if code == 0 else "Fix the item above and run again."))
    return code
