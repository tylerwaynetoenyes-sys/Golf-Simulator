# r10bridge

A small local bridge between a **Garmin Approach R10** and the Fairway game.
It connects to the R10 over Bluetooth LE, speaks the R10's MultiLink → COBS →
GFDI → protobuf protocol, and streams every shot as JSON over a WebSocket on
`ws://localhost:8765`. The same port also serves the game itself over HTTP, so
one command runs everything.

The protocol layers are a pure-Python port of
[divotmaker/10over](https://github.com/divotmaker/10over) (MIT OR Apache-2.0),
the open-source Rust client for the R10. See its
[`docs/WIRE.md`](https://github.com/divotmaker/10over/blob/main/docs/WIRE.md) and
[`docs/SEQUENCE.md`](https://github.com/divotmaker/10over/blob/main/docs/SEQUENCE.md)
for the full specification. Like 10over, this project is an interoperability
tool. It isn't affiliated with Garmin and doesn't unlock any paid features.

## Install

Python 3.10 or newer.

```bash
cd bridge
pip install -r requirements.txt      # bleak (Bluetooth) + websockets
```

On Windows, use `py -m pip install -r requirements.txt` if `pip` isn't on your PATH.

## Run

```bash
python -m r10bridge            # BLE mode; open http://localhost:8765
python -m r10bridge --open     # also opens the game in your browser
python -m r10bridge --mock     # simulated R10, no hardware needed
```

| Option | What it does |
|---|---|
| `--port 8765` | WebSocket + HTTP port |
| `--host 127.0.0.1` | Bind address. The default is local only. |
| `--lan` | Bind to `0.0.0.0` and accept the game from other devices on your Wi-Fi (an iPad, a smart-TV browser). Prints the addresses to open, including `http://<name>.local:8765/?tv`. Home networks only. |
| `--diagnose` | Step-by-step check (Python and library versions, Bluetooth adapter, scan with signal strength, connect, arm the radar, wait for one shot), then exit. Start here when something doesn't work. |
| `--address XX:XX:…` | Connect to a specific R10 (BLE address on Linux/Windows, UUID on macOS) instead of scanning by name |
| `--scan-timeout 20` | Seconds to scan before reporting "not found" |
| `--auto-pair` | Start connecting at launch instead of waiting for the game's **Pair** button |
| `--no-reconnect` | Don't retry automatically when the R10 drops |
| `--open` | Open the game in your default browser |
| `--log-file PATH` | Rotating log (default `~/.r10bridge/bridge.log`). Attach it when reporting a problem. |
| `--mock` | Simulate an R10 through the full protocol stack |
| `--mock-shots 8` | In mock mode, fire a simulated shot every 8 seconds |
| `--mock-fail not_found\|pairing_failed` | In mock mode, rehearse an error screen |
| `--mock-drop 20` | In mock mode, drop the link after 20 s (rehearses reconnect) |
| `--web-root DIR` / `--no-web` | Serve the game from another folder / WebSocket only |
| `-v` | Verbose protocol logging |

On a Mac that may sleep during a round, run it under `caffeinate`:
`caffeinate -dims python -m r10bridge`.

## Pairing the R10

1. Turn the R10 on, then **hold its button until the LED is solid blue** (pairing mode).
   A flashing blue LED means it's trying to reconnect to a phone instead.
2. Close the Garmin Golf app, or turn off Bluetooth on your phone. The R10 talks
   to one device at a time.
3. Start the bridge and press **Pair Garmin R10** in the game.

The bridge scans for a device named `Approach R10` (or with Garmin's manufacturer
ID `0x0087` and product ID `3622`), connects, and asks the OS to bond.

| OS | Notes |
|---|---|
| **Windows 10/11** | Works out of the box. If pairing is refused, add it once under *Settings → Bluetooth & devices → Add device*. |
| **macOS** | The first run triggers a Bluetooth permission prompt for your terminal app; allow it (*System Settings → Privacy & Security → Bluetooth*). macOS bonds automatically. Devices are addressed by UUID, not MAC. |
| **Linux (BlueZ)** | If `pair()` is refused, bond once by hand: `bluetoothctl`, `scan on`, `pair <addr>`, `trust <addr>`. |

**Placement** (Garmin Quick Start Manual): put the R10 on the ground 1.8–2.4 m
(6–8 ft) behind the ball, level, with its red alignment line pointing at the
target. Indoors, leave at least 2.4 m (8 ft) between the ball and the net.

**Status light** (Garmin owner's manual): solid blue = pairing mode; flashing
blue = reconnecting to a phone it already knows; flashing green = ready for a
shot; solid red = busy (reading a shot); flashing red = error (reset the R10).

### Troubleshooting

| Symptom | Fix |
|---|---|
| Game says *Bridge not running* | Start `python -m r10bridge` and open the game from `http://localhost:8765` (not the file). Port busy: `--port 8766` and set *Settings → Bridge address*. |
| *No R10 found* | Light solid blue? Phone app closed / phone Bluetooth off? Run `--diagnose` to see every device the adapter can hear. |
| Pairs, then drops | macOS: *System Settings → Bluetooth → Approach R10 → Forget This Device*, then pair again. Windows: remove it under *Bluetooth & devices*. Power-cycle the R10. |
| Connected, but shots don't register | Light should flash green before you swing. Press *Re-arm radar* in the R10 popover or help panel. Check 6–8 ft directly behind the ball, aimed through it, level, with nothing moving or reflective in front. "Saw the swing but not the ball" means alignment or distance. |
| macOS never asks for Bluetooth | *System Settings → Privacy & Security → Bluetooth*: enable your terminal app (Terminal, iTerm, VS Code), then restart it. |
| iPad can't open the game | Bridge started with `--lan`? Same Wi-Fi? Try the IP address the bridge prints instead of `.local`. Allow incoming connections for Python if macOS asks. |


## WebSocket protocol (v1)

Besides the messages below, the bridge sends
`{"type":"heartbeat","link","deviceState","phase","shots","lastShotAgo","lastRxAgo","uptime","mode","version"}`
every 5 s, `{"type":"misread"}` when the radar reported a swing without ball
data, and answers `{"type":"wake"}` (re-arm the radar), `{"type":"reconnect"}`
and `{"type":"diag"}`.


All frames are JSON text.

**Game → bridge**

```jsonc
{"type": "pair"}                       // scan + connect (optional "address")
{"type": "disconnect"}
{"type": "shot_config", "teeRangeYards": 2.3, "temperatureC": 18, "humidity": 0.65, "altitudeM": 190}
{"type": "mock_shot", "club": "DR"}    // mock mode only
{"type": "ping"}
```

**Bridge → game**

```jsonc
{"type": "hello", "bridge": "alton-r10-bridge", "version": "1.0.0", "protocol": 1, "mode": "ble", "status": {…}}
{"type": "status", "state": "scanning|found|connecting|handshake|ready|reconnecting|disconnected|error|idle",
 "message": "…", "code": "not_found|pairing_failed|bluetooth_off|connect_timeout|…", "device": {"name": "…", "address": "…", "firmware": "4.30"}}
{"type": "device_state", "state": "WAITING|RECORDING|PROCESSING|STANDBY|INTERFERENCE_TEST|ERROR"}
{"type": "device_error", "code": "PLATFORM_TILTED|RADAR_SATURATION|OVERHEATING", "severity": "WARNING|SERIOUS|FATAL"}
{"type": "shot", "source": "r10", "receivedAt": 1760300000000, "shot": {
  "id": 42, "shotType": "normal",
  "ball": {"speedMps": 67.0, "speedMph": 149.9, "launchAngle": 12.5, "launchDirection": -1.2,
           "spinAxis": 5.0, "totalSpin": 2800, "backSpin": 2789, "sideSpin": 244, "spinCalc": "ratio"},
  "club": {"speedMps": 44.0, "speedMph": 98.4, "faceAngle": 1.5, "path": -2.0, "attackAngle": -3.5},
  "swing": {"backswingStart": …, "downswingStart": …, "impact": …, "tempo": 3.0}
}}
```

Sign conventions: `launchDirection` is positive to the right, and positive
`spinAxis` curves the ball right (a fade for a right-handed golfer).
`backSpin = totalSpin·cos(axis)` and `sideSpin = totalSpin·sin(axis)`.
Duplicate shots are filtered by `id` (the R10 retransmits unacknowledged alerts).

## How it works

```
r10bridge/
  protocol.py   CRC-16/ARC, COBS, GFDI frames, MultiLink register/handle routing
  pb.py         tiny schema-less protobuf reader/writer (no protoc step)
  messages.py   Smart container: subscribe, wake-up, shot config, alert decoding
  client.py     sans-IO session state machine (register → 5024 → 5050 → subscribe → wake → shots)
  links.py      BleLink (bleak) and MockLink (in-process fake R10)
  mock.py       FakeR10: the device side of the protocol, for tests and --mock
  server.py     WebSocket server, reconnect logic, origin check, static file serving
```

## Tests

```bash
pip install pytest
python -m pytest
```

The tests cover the protocol vectors from 10over (CRC check value, COBS edge
cases, register frames, compressed headers, fragment headers) plus a full
handshake against the fake R10, shot de-duplication, the `ALREADY_AWAKE` path,
an end-to-end WebSocket pair-and-shot run, and static-file path traversal.
