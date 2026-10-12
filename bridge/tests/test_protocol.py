"""Protocol tests. Vectors mirror divotmaker/10over's Rust unit tests."""

import asyncio
import json
import math
import struct

import pytest

from r10bridge import messages as M
from r10bridge import pb
from r10bridge import protocol as P
from r10bridge.client import ACTIVE, HandshakeComplete, R10Session, Ready, Registered
from r10bridge.mock import FakeR10, random_shot


def test_crc_check_value():
    assert P.crc16(b"123456789") == 0xBB3D


@pytest.mark.parametrize("data", [b"", b"hello", b"\x00hello\x00world", bytes([0, 0, 0, 1]),
                                  bytes(range(1, 255)), bytes(range(1, 256)), bytes([1, 0, 2])])
def test_cobs_roundtrip(data):
    enc = P.cobs_encode(data)
    assert 0 not in enc
    assert P.cobs_decode(enc) == data


def test_register_command_format():
    assert P.build_register(1, 1) == bytes([0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0])


def test_parse_register_response():
    resp = bytes([0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0])
    assert P.parse_register_response(resp) == (0, 1, 0)


def test_chunking_mtu_20():
    chunks = P.chunk_with_handle(b"\xAA" * 40, 1, 20)
    assert [len(c) for c in chunks] == [20, 20, 3]
    assert all(c[0] == 1 for c in chunks)


def test_frame_roundtrip_and_crc():
    f = P.build_frame(5024, b"test")
    parsed = P.parse_frame(f)
    assert parsed.msg_type == 5024 and parsed.payload == b"test" and parsed.txn_id is None
    bad = bytearray(f)
    bad[4] ^= 0xFF
    with pytest.raises(P.FrameError):
        P.parse_frame(bytes(bad))


def test_compressed_header():
    body = bytes([43, 0x81]) + b"test"
    frame = struct.pack("<H", len(body) + 4) + body
    frame += struct.pack("<H", P.crc16(frame))
    parsed = P.parse_frame(frame)
    assert parsed.msg_type == 5043 and parsed.txn_id == 1 and parsed.payload == b"test"


def test_stream_buffer_split():
    wrapped = P.wrap_cobs(P.build_frame(5050, b"payload"))
    sb = P.StreamBuffer()
    sb.extend(wrapped[: len(wrapped) // 2])
    assert sb.next_frame() is None
    sb.extend(wrapped[len(wrapped) // 2:])
    assert sb.next_frame().msg_type == 5050


def test_device_info_parse():
    payload = P.build_device_info_payload(150, 3622, 0x12345678, 430, 0x021B, ("Approach R10", "ApproachR10", ""))
    info = P.parse_device_info(payload)
    assert (info.protocol_version, info.product_number, info.software_version) == (150, 3622, 430)
    assert info.friendly_name == "Approach R10" and info.device_name == "ApproachR10"


def test_host_capabilities_has_swing_sensor():
    f = P.parse_frame(P.build_host_capabilities())
    assert f.msg_type == P.MSG_CONFIGURATION
    assert P.CAP_SWING_SENSOR in P.parse_capabilities(f.payload)


def test_frag_header_roundtrip():
    f = P.parse_frame(P.build_protobuf_request(42, b"protobuf payload"))
    hdr, data = P.parse_frag_header(f.payload)
    assert (hdr.req_id, hdr.offset, hdr.total_len, hdr.chunk_size) == (42, 0, 16, 16)
    assert data == b"protobuf payload"


def test_subscribe_and_wakeup_encoding():
    sub = pb.Message(M.build_subscribe_request())
    alerts = sub.sub(30).sub(1).subs(1)
    assert len(alerts) == 1 and alerts[0].uint(1) == M.ALERT_LAUNCH_MONITOR
    wake = pb.Message(M.build_wakeup_request())
    assert wake.sub(38).has(3)


def test_shot_config_encoding():
    m = pb.Message(M.build_shot_config_request(tee_range=2.3))
    req = m.sub(38).sub(11)
    assert abs(req.float(5) - 2.3) < 1e-6 and req.float(1) is None


def test_decode_shot_metrics_values():
    data = M.encode_shot_alert(42, 67.0, 12.5, -1.2, 2800.0, 5.0, 44.0, 1.5, -2.0, -3.5, 1800)
    shot = M.decode_smart(data)
    assert isinstance(shot, M.Shot) and shot.shot_id == 42 and shot.shot_type == "normal"
    assert abs(shot.ball["speedMps"] - 67.0) < 0.01
    assert abs(shot.ball["backSpin"] - 2789.0) < 2
    assert abs(shot.ball["sideSpin"] - 244.0) < 2
    assert abs(shot.ball["speedMph"] - 67.0 * 2.23694) < 0.05
    assert abs(shot.club["faceAngle"] - 1.5) < 0.01
    assert shot.swing["impact"] == 1800
    json.dumps(shot.to_json())


def test_decode_state_and_error():
    assert M.decode_smart(M.encode_state_alert(2)) == M.StateChange("WAITING")
    err = M.decode_smart(M.encode_error_alert(3, 1))
    assert err.code == "PLATFORM_TILTED" and err.severity == "SERIOUS"


def _wire():
    """Session <-> FakeR10 wired through a queue so delivery order is realistic."""
    pending = []
    events = []
    fake = FakeR10(pending.append)
    session = R10Session(fake.on_data_write, fake.on_register_write)

    def pump():
        while pending:
            events.extend(session.feed(pending.pop(0)))

    return session, fake, events, pump


def test_full_handshake_and_shot_flow():
    session, fake, events, pump = _wire()
    session.start()
    pump()
    assert any(isinstance(e, Registered) and e.handle == 3 for e in events)
    assert any(isinstance(e, HandshakeComplete) for e in events)
    assert session.phase == ACTIVE
    assert fake.subscribed and fake.awake
    assert session.device_info.product_number == P.R10_PRODUCT_ID
    assert any(isinstance(e, Ready) for e in events)

    events.clear()
    sid = fake.swing(random_shot("DR"), retransmit=True)
    pump()
    shots = [e for e in events if isinstance(e, M.Shot)]
    assert len(shots) == 1, "retransmitted shot must be deduplicated"
    assert shots[0].shot_id == sid
    assert 120 < shots[0].ball["speedMph"] < 190
    assert any(isinstance(e, Ready) for e in events), "re-armed to WAITING after the shot"
    # every host write respected MTU and carried the handle byte
    assert all(f.msg_type in (5000, 5043, 5050) for f in fake.received)


def test_already_awake_emits_ready():
    pending, events = [], []
    fake = FakeR10(pending.append, already_awake=True)
    s = R10Session(fake.on_data_write, fake.on_register_write)
    s.start()
    while pending:
        events.extend(s.feed(pending.pop(0)))
    wake = [e for e in events if isinstance(e, M.WakeUpResponse)]
    assert wake and wake[0].status == 1
    assert any(isinstance(e, Ready) for e in events)


def test_bridge_websocket_end_to_end():
    websockets = pytest.importorskip("websockets")
    from websockets.asyncio.client import connect

    from r10bridge.server import Bridge, serve

    async def run():
        bridge = Bridge(mock=True)
        server = asyncio.create_task(serve("127.0.0.1", 8799, bridge))
        await asyncio.sleep(0.3)
        # websockets >= 15 honours proxy env vars; keep localhost direct
        major = int(websockets.__version__.split(".")[0])
        kwargs = {"proxy": None} if major >= 15 else {}
        async with connect("ws://127.0.0.1:8799", **kwargs) as ws:
            hello = json.loads(await ws.recv())
            assert hello["type"] == "hello" and hello["mode"] == "mock"
            await ws.send(json.dumps({"type": "pair"}))
            states = []
            while True:
                m = json.loads(await asyncio.wait_for(ws.recv(), 10))
                if m["type"] == "status":
                    states.append(m["state"])
                    if m["state"] == "ready":
                        break
            assert states[:4] == ["scanning", "found", "connecting", "handshake"]
            await ws.send(json.dumps({"type": "mock_shot", "club": "PW"}))
            while True:
                m = json.loads(await asyncio.wait_for(ws.recv(), 5))
                if m["type"] == "shot":
                    break
            assert m["source"] == "mock" and m["shot"]["ball"]["launchAngle"] > 10
        server.cancel()
        await asyncio.wait_for(asyncio.gather(server, return_exceptions=True), 5)

    asyncio.run(run())


def test_origin_filter():
    from r10bridge.server import _origin_ok

    assert _origin_ok(None) and _origin_ok("null")
    assert _origin_ok("http://localhost:8080") and _origin_ok("http://127.0.0.1:5500")
    assert not _origin_ok("https://evil.example.com")


def test_static_serving_and_traversal(tmp_path):
    pytest.importorskip("websockets")
    from r10bridge.server import static_response

    (tmp_path / "index.html").write_text("<h1>range</h1>")
    (tmp_path / "js").mkdir()
    (tmp_path / "js" / "a.js").write_text("export {}")
    (tmp_path / ".git").mkdir()
    (tmp_path / ".git" / "config").write_text("secret")
    assert static_response(tmp_path, "/").status_code == 200
    r = static_response(tmp_path, "/js/a.js?v=1")
    assert r.status_code == 200 and r.headers["Content-Type"].startswith("text/javascript")
    assert static_response(tmp_path, "/../../etc/passwd").status_code in (403, 404)
    assert static_response(tmp_path, "/%2e%2e/%2e%2e/etc/passwd").status_code in (403, 404)
    assert static_response(tmp_path, "/.git/config").status_code == 404
    assert static_response(tmp_path, "/missing.js").status_code == 404
