"""In-process fake Garmin R10 that speaks the real wire protocol.

Used by `--mock` mode and the test-suite: every shot goes through MultiLink,
COBS, GFDI, CRC and protobuf exactly as it would from hardware, so the whole
decode path is exercised without a device.
"""

from __future__ import annotations

import random
import struct
from typing import Callable

from . import messages as M
from . import protocol as P

# Typical good-amateur numbers per club: (ball mph, launch deg, spin rpm, club mph)
CLUB_PROFILES = {
    "DR": (160.0, 12.0, 2600.0, 108.0),
    "3W": (150.0, 11.5, 3500.0, 102.0),
    "5I": (132.0, 12.5, 5200.0, 90.0),
    "7I": (120.0, 16.3, 7000.0, 84.0),
    "9I": (108.0, 20.5, 8400.0, 78.0),
    "PW": (100.0, 24.2, 9300.0, 74.0),
    "SW": (80.0, 30.0, 10000.0, 66.0),
}


def random_shot(club: str = "7I", rng: random.Random | None = None) -> dict:
    rng = rng or random.Random()
    speed, launch, spin, chs = CLUB_PROFILES.get(club.upper(), CLUB_PROFILES["7I"])
    quality = rng.gauss(0, 1)
    ball_mph = speed * (1 + 0.04 * max(-2.5, min(1.2, quality)))
    face = rng.gauss(0, 2.2)
    path = rng.gauss(0, 3.0)
    launch_dir = 0.8 * face + 0.2 * path
    spin_axis = max(-25.0, min(25.0, 3.2 * (face - path) + rng.gauss(0, 1.5)))
    return {
        "ball_speed_mps": ball_mph / M.MPS_TO_MPH,
        "launch_angle": launch + rng.gauss(0, 1.4),
        "launch_direction": launch_dir,
        "total_spin": spin * (1 + rng.gauss(0, 0.08)),
        "spin_axis": spin_axis,
        "club_speed_mps": chs * (ball_mph / speed) / M.MPS_TO_MPH,
        "face": face,
        "path": path,
        "attack": -3.0 if club.upper() not in ("DR",) else 2.0 + rng.gauss(0, 1),
    }


class FakeR10:
    """Device side of the protocol. Wire `notify` to the host's `feed`."""

    def __init__(self, notify: Callable[[bytes], None], handle: int = 3, mtu: int = 20, already_awake: bool = False):
        self.notify = notify
        self.handle = handle
        self.mtu = mtu
        self.already_awake = already_awake
        self.stream = P.StreamBuffer()
        self.registered = False
        self.subscribed = False
        self.awake = False
        self.shot_id = 100
        self.txn = 0
        self.received: list[P.GfdiFrame] = []
        self.impact_clock = 5_000_000

    # host -> device
    def on_register_write(self, data: bytes) -> None:
        assert len(data) == 13 and data[1] == 0x00, "bad REGISTER"
        txn_id, svc = struct.unpack_from("<QH", data, 2)
        self.notify(P.build_register_response(txn_id, svc, 0, self.handle))
        self.registered = True
        info = P.build_device_info_payload(150, P.R10_PRODUCT_ID, 0x0BADF00D, 430, 0x021B,
                                           ("Approach R10", "ApproachR10", "Approach R10"))
        self._send_frame(P.build_frame(P.MSG_DEVICE_INFO, info))

    def on_data_write(self, chunk: bytes) -> None:
        assert chunk[0] == self.handle, "missing handle byte"
        assert len(chunk) <= self.mtu, "chunk exceeds MTU"
        self.stream.extend(chunk[1:])
        while (frame := self.stream.next_frame()) is not None:
            self.received.append(frame)
            self._handle(frame)

    def _handle(self, f: P.GfdiFrame) -> None:
        if f.msg_type == P.MSG_ACK:
            orig = f.payload[0] | (f.payload[1] << 8)
            if orig == P.MSG_DEVICE_INFO:
                # optional FIT messages, then capabilities
                self._send_frame(P.build_frame(P.MSG_FIT_DEFINITION, b"\x01\x02\x03"))
                self._send_frame(P.build_frame(P.MSG_CONFIGURATION, P.build_capabilities_payload([1, 3, 30, 76])))
            return
        if f.msg_type == P.MSG_CONFIGURATION:
            caps = P.parse_capabilities(f.payload)
            assert P.CAP_SWING_SENSOR in caps, "host must advertise SwingSensor"
            self._send_frame(P.build_ack(P.MSG_CONFIGURATION, 0))
            return
        if f.msg_type == P.MSG_PROTOBUF_REQUEST:
            hdr, data = P.parse_frag_header(f.payload)
            self._send_frame(P.build_ack(P.MSG_PROTOBUF_REQUEST, 0))
            if data == M.build_subscribe_request():
                self.subscribed = True
                self._send_pb(M.encode_subscribe_response(True), response=True, req_id=hdr.req_id)
            elif data == M.build_wakeup_request():
                status = 1 if (self.already_awake or self.awake) else 0
                self.awake = True
                self._send_pb(M.encode_wakeup_response(status), response=True, req_id=hdr.req_id)
                if status == 0:
                    self._send_pb(M.encode_state_alert(1))
                    self._send_pb(M.encode_state_alert(2))
            else:
                self._send_pb(M.encode_shot_config_response(True), response=True, req_id=hdr.req_id)

    # device -> host
    def _send_frame(self, frame: bytes) -> None:
        for c in P.chunk_with_handle(P.wrap_cobs(frame), self.handle, self.mtu):
            self.notify(c)

    def _send_pb(self, pb_data: bytes, response: bool = False, req_id: int = 0) -> None:
        payload = P.build_frag_payload(req_id or self.txn, pb_data)
        mtype = P.MSG_PROTOBUF_RESPONSE if response else P.MSG_PROTOBUF_REQUEST
        # R10 uses compressed 2-byte headers for protobuf traffic.
        self.txn = (self.txn + 1) & 0x7F
        body = bytes([mtype - 5000, self.txn | 0x80]) + payload
        frame = struct.pack("<H", len(body) + 4) + body
        frame += struct.pack("<H", P.crc16(frame))
        self._send_frame(frame)

    def swing(self, shot: dict, retransmit: bool = False) -> int:
        """Simulate a full swing: RECORDING -> PROCESSING -> metrics -> WAITING."""
        self.shot_id += 1
        self.impact_clock += 30_000
        self._send_pb(M.encode_state_alert(3))
        self._send_pb(M.encode_state_alert(4))
        pbm = M.encode_shot_alert(
            self.shot_id,
            shot["ball_speed_mps"],
            shot["launch_angle"],
            shot["launch_direction"],
            shot["total_spin"],
            shot["spin_axis"],
            shot.get("club_speed_mps"),
            shot.get("face", 0.0),
            shot.get("path", 0.0),
            shot.get("attack", 0.0),
            self.impact_clock,
        )
        self._send_pb(pbm)
        if retransmit:
            self._send_pb(pbm)
        self._send_pb(M.encode_state_alert(2))
        return self.shot_id

    def raise_error(self, code: int = 3, severity: int = 0) -> None:
        self._send_pb(M.encode_error_alert(code, severity))
