"""CLI entry point: python -m r10bridge [--mock] [--port 8765]"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from . import __version__
from .server import Bridge, serve


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="r10bridge", description="Garmin Approach R10 -> WebSocket bridge for Alton Range")
    ap.add_argument("--host", default="127.0.0.1", help="bind address (default 127.0.0.1, local only)")
    ap.add_argument("--port", type=int, default=8765, help="WebSocket port (default 8765)")
    ap.add_argument("--address", help="connect to this BLE address/UUID instead of scanning by name")
    ap.add_argument("--scan-timeout", type=float, default=20.0, help="seconds to scan before reporting not found")
    ap.add_argument("--auto-pair", action="store_true", help="start connecting immediately instead of waiting for the game")
    ap.add_argument("--no-reconnect", action="store_true", help="don't auto-reconnect when the R10 drops")
    ap.add_argument("--mock", action="store_true", help="simulate an R10 (no hardware needed)")
    ap.add_argument("--mock-shots", type=float, default=0.0, metavar="SECONDS",
                    help="in mock mode, fire a simulated shot every N seconds")
    ap.add_argument("--mock-fail", choices=["not_found", "pairing_failed"], help="in mock mode, simulate a failure")
    ap.add_argument("-v", "--verbose", action="store_true")
    ap.add_argument("--version", action="version", version=f"r10bridge {__version__}")
    args = ap.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)-7s %(message)s", datefmt="%H:%M:%S")
    if not args.verbose:
        logging.getLogger("websockets").setLevel(logging.WARNING)

    bridge = Bridge(mock=args.mock, auto_shot_interval=args.mock_shots, mock_fail=args.mock_fail,
                    address=args.address, scan_timeout=args.scan_timeout, auto_reconnect=not args.no_reconnect)
    try:
        asyncio.run(serve(args.host, args.port, bridge, auto_pair=args.auto_pair))
    except KeyboardInterrupt:
        print("\nbridge stopped")
    except OSError as e:
        print(f"error: {e}", file=sys.stderr)
        if "address already in use" in str(e).lower():
            print(f"Port {args.port} is busy. Is another bridge already running?", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
