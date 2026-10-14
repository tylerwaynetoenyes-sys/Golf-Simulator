"""CLI entry point: python -m r10bridge [--mock] [--lan] [--port 8765] [--diagnose]"""

from __future__ import annotations

import argparse
import asyncio
import logging
import logging.handlers
import socket
import sys
import webbrowser
from pathlib import Path

from . import __version__
from . import server as S
from .server import Bridge, serve

DEFAULT_WEB_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LOG = Path.home() / ".r10bridge" / "bridge.log"


def lan_addresses() -> list[str]:
    """Best-effort list of this machine's LAN IPv4 addresses."""
    ips: set[str] = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))  # no packets sent; picks the outbound interface
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith("127."))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="r10bridge", description="Garmin Approach R10 -> WebSocket bridge for Fairway")
    ap.add_argument("--host", default=None, help="bind address (default 127.0.0.1; 0.0.0.0 with --lan)")
    ap.add_argument("--port", type=int, default=8765, help="WebSocket + HTTP port (default 8765)")
    ap.add_argument("--lan", action="store_true",
                    help="allow other devices on your Wi-Fi (iPad, TV browser) to open the game from this computer")
    ap.add_argument("--address", help="connect to this BLE address/UUID instead of scanning by name")
    ap.add_argument("--scan-timeout", type=float, default=20.0, help="seconds to scan before reporting not found")
    ap.add_argument("--auto-pair", action="store_true", help="start connecting immediately instead of waiting for the game")
    ap.add_argument("--no-reconnect", action="store_true", help="don't auto-reconnect when the R10 drops")
    ap.add_argument("--diagnose", action="store_true", help="run a step-by-step Bluetooth/R10 check and exit")
    ap.add_argument("--mock", action="store_true", help="simulate an R10 (no hardware needed)")
    ap.add_argument("--mock-shots", type=float, default=0.0, metavar="SECONDS",
                    help="in mock mode, fire a simulated shot every N seconds")
    ap.add_argument("--mock-fail", choices=["not_found", "pairing_failed"], help="in mock mode, simulate a failure")
    ap.add_argument("--mock-drop", type=float, default=0.0, metavar="SECONDS",
                    help="in mock mode, drop the Bluetooth link N seconds after connecting (tests reconnect)")
    ap.add_argument("--web-root", type=Path, default=DEFAULT_WEB_ROOT,
                    help="serve the game from this directory over HTTP on the same port (default: repo root)")
    ap.add_argument("--no-web", action="store_true", help="WebSocket only; don't serve the game files")
    ap.add_argument("--open", action="store_true", help="open the game in your default browser")
    ap.add_argument("--log-file", type=Path, default=DEFAULT_LOG, help=f"log file (default {DEFAULT_LOG})")
    ap.add_argument("-v", "--verbose", action="store_true")
    ap.add_argument("--version", action="version", version=f"r10bridge {__version__}")
    args = ap.parse_args(argv)

    level = logging.DEBUG if args.verbose else logging.INFO
    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(message)s", datefmt="%H:%M:%S")
    root = logging.getLogger()
    root.setLevel(level)
    console = logging.StreamHandler()
    console.setFormatter(fmt)
    root.addHandler(console)
    try:
        args.log_file.parent.mkdir(parents=True, exist_ok=True)
        fh = logging.handlers.RotatingFileHandler(args.log_file, maxBytes=2_000_000, backupCount=3, encoding="utf-8")
        fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s %(name)s %(message)s"))
        fh.setLevel(logging.DEBUG)
        root.addHandler(fh)
        root.setLevel(logging.DEBUG)
        console.setLevel(level)
    except OSError as e:
        print(f"(not writing a log file: {e})", file=sys.stderr)
    if not args.verbose:
        logging.getLogger("websockets").setLevel(logging.WARNING)
        logging.getLogger("bleak").setLevel(logging.INFO)

    if args.diagnose:
        from .diagnose import run
        try:
            return asyncio.run(run(mock=args.mock, address=args.address))
        except KeyboardInterrupt:
            return 1

    host = args.host or ("0.0.0.0" if args.lan else "127.0.0.1")
    S.ALLOW_LAN = args.lan or host not in ("127.0.0.1", "localhost", "::1")

    bridge = Bridge(mock=args.mock, auto_shot_interval=args.mock_shots, mock_fail=args.mock_fail,
                    address=args.address, scan_timeout=args.scan_timeout, auto_reconnect=not args.no_reconnect,
                    mock_drop=args.mock_drop)
    web_root = None
    if not args.no_web:
        if (args.web_root / "index.html").is_file():
            web_root = args.web_root
        else:
            logging.warning("no index.html in %s; serving WebSocket only", args.web_root)

    if web_root is not None:
        print("\n  Fairway is ready.")
        print(f"    On this computer:   http://localhost:{args.port}/")
        if S.ALLOW_LAN:
            for ip in lan_addresses():
                print(f"    On iPad / other:    http://{ip}:{args.port}/")
            print(f"    (or http://{socket.gethostname().split('.')[0]}.local:{args.port}/ on Apple devices)")
        print(f"    Big screen / TV:    add ?tv to the URL, e.g. http://localhost:{args.port}/?tv")
        print(f"  Log file: {args.log_file}\n")
    if args.open and web_root is not None:
        webbrowser.open(f"http://localhost:{args.port}/")
    try:
        asyncio.run(serve(host, args.port, bridge, auto_pair=args.auto_pair, web_root=web_root))
    except KeyboardInterrupt:
        print("\nbridge stopped")
    except OSError as e:
        print(f"error: {e}", file=sys.stderr)
        if "address already in use" in str(e).lower() or getattr(e, "errno", None) in (48, 98, 10048):
            print(f"Port {args.port} is busy. Is another bridge already running? "
                  f"Close it, or use --port {args.port + 1}.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
