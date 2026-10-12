"""Sans-IO Garmin R10 session state machine (port of 10over's `Client`).

Feed every BLE notification from characteristic 6A4E2810 into `feed()`; it
returns high-level events and calls the two write callbacks for anything that
must go back to the device. No BLE or asyncio dependency, so it is fully unit
testable against the in-process mock device.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Callable

from . import messages as M
from . import protocol as P

log = logging.getLogger("r10bridge.client")

SHOT_DEDUP_WINDOW_S = 60.0

# phases
REGISTERING = "registering"
WAIT_DEVICE_INFO = "wait_device_info"
WAIT_CAPABILITIES = "wait_capabilities"
WAIT_CAPABILITIES_ACK = "wait_capabilities_ack"
SUBSCRIBING = "subscribing"
WAKING_UP = "waking_up"
ACTIVE = "active"


@dataclass
class Registered:
    handle: int


@dataclass
class DeviceInfoReceived:
    info: P.DeviceInfo


@dataclass
class HandshakeComplete:
    pass


@dataclass
class Ready:
    """Device armed and waiting for a shot."""


@dataclass
class ProtocolError:
    message: str


class R10Session:
    def __init__(
        self,
        write_data: Callable[[bytes], None],
        write_register: Callable[[bytes], None],
        mtu: int = 20,
        clock: Callable[[], float] = time.monotonic,
    ):
        self._write_data = write_data
        self._write_register = write_register
        self.mtu = min(mtu, 20)
        self.handle = 0
        self.phase = REGISTERING
        self.stream = P.StreamBuffer()
        self._req_id = 1
        self._recent_shots: list[tuple[int, float]] = []
        self.last_state: str | None = None
        self.device_info: P.DeviceInfo | None = None
        self._clock = clock

    # ── outbound ──

    def start(self) -> None:
        self.phase = REGISTERING
        self._write_register(P.build_register(1, P.MULTILINK_SERVICE_GFDI))

    def _send_frame(self, frame: bytes) -> None:
        for chunk in P.chunk_with_handle(P.wrap_cobs(frame), self.handle, self.mtu):
            self._write_data(chunk)

    def _send_ack(self, orig: int, status: int = 0, payload: bytes = b"") -> None:
        self._send_frame(P.build_ack(orig, status, payload))

    def _next_req_id(self) -> int:
        rid = self._req_id
        self._req_id = (self._req_id + 1) & 0xFFFF
        return rid

    def _send_pb(self, pb_data: bytes) -> None:
        self._send_frame(P.build_protobuf_request(self._next_req_id(), pb_data))

    def send_wakeup(self) -> None:
        self._send_pb(M.build_wakeup_request())

    def send_shot_config(self, **kwargs) -> None:
        self._send_pb(M.build_shot_config_request(**kwargs))

    # ── inbound ──

    def feed(self, chunk: bytes) -> list:
        """Process one BLE notification. Returns a list of events."""
        events: list = []
        chunk = bytes(chunk)
        if self.phase == REGISTERING:
            parsed = P.parse_register_response(chunk)
            if parsed is not None:
                status, handle, _flags = parsed
                if status != 0:
                    events.append(
                        ProtocolError(f"MultiLink REGISTER failed: {P.REGISTER_STATUS.get(status, status)}")
                    )
                    return events
                self.handle = handle
                self.phase = WAIT_DEVICE_INFO
                events.append(Registered(handle))
                return events
        data = P.strip_handle(chunk, self.handle)
        if data is None:
            return events
        try:
            self.stream.extend(data)
        except P.FrameError as e:
            events.append(ProtocolError(str(e)))
            return events
        while True:
            try:
                frame = self.stream.next_frame()
            except (P.FrameError, P.CobsError) as e:
                events.append(ProtocolError(str(e)))
                continue
            if frame is None:
                break
            events.extend(self._dispatch(frame))
        return events

    def _dispatch(self, frame: P.GfdiFrame) -> list:
        t = frame.msg_type
        if t == P.MSG_DEVICE_INFO:
            try:
                self.device_info = P.parse_device_info(frame.payload)
            except P.FrameError as e:
                return [ProtocolError(str(e))]
            self._send_frame(P.build_device_info_response())
            self.phase = WAIT_CAPABILITIES
            return [DeviceInfoReceived(self.device_info)]
        if t == P.MSG_CONFIGURATION:
            self._send_ack(P.MSG_CONFIGURATION, 0, b"")
            self._send_frame(P.build_host_capabilities())
            self.phase = WAIT_CAPABILITIES_ACK
            return []
        if t == P.MSG_ACK:
            return self._handle_ack(frame.payload)
        if t in (P.MSG_FIT_DEFINITION, P.MSG_FIT_DATA):
            self._send_ack(t, 0, b"\x00")
            return []
        if t in (P.MSG_PROTOBUF_REQUEST, P.MSG_PROTOBUF_RESPONSE):
            events = self._handle_protobuf(frame.payload)
            self._send_ack(t, 0, b"")
            return events
        return []

    def _handle_ack(self, payload: bytes) -> list:
        if len(payload) < 3:
            return []
        orig = payload[0] | (payload[1] << 8)
        status = payload[2]
        if status != 0:
            return [ProtocolError(f"device NAK for message {orig} (status {status})")]
        if orig == P.MSG_CONFIGURATION and self.phase == WAIT_CAPABILITIES_ACK:
            self.phase = SUBSCRIBING
            self._send_pb(M.build_subscribe_request())
            return [HandshakeComplete()]
        return []

    def _handle_protobuf(self, payload: bytes) -> list:
        try:
            _hdr, pb_data = P.parse_frag_header(payload)
            ev = M.decode_smart(pb_data)
        except Exception as e:  # malformed protobuf: report, keep session alive
            return [ProtocolError(f"protobuf decode failed: {e}")]

        if isinstance(ev, M.SubscribeResponse):
            if self.phase == SUBSCRIBING:
                self.phase = WAKING_UP
                self.send_wakeup()
            return [ev]
        if isinstance(ev, M.WakeUpResponse):
            if self.phase == WAKING_UP:
                self.phase = ACTIVE
            out: list = [ev]
            if ev.status == 1:  # ALREADY_AWAKE: no WAITING transition will come
                self.last_state = "WAITING"
                out.append(Ready())
            return out
        if isinstance(ev, M.StateChange):
            changed = self.last_state != ev.state
            self.last_state = ev.state
            if not changed:
                return []
            if ev.state == "WAITING":
                return [ev, Ready()]
            if ev.state == "STANDBY" and self.phase == ACTIVE:
                self.send_wakeup()  # dozed off mid-session: re-arm
            return [ev]
        if isinstance(ev, M.Shot):
            now = self._clock()
            self._recent_shots = [(i, t) for i, t in self._recent_shots if now - t < SHOT_DEDUP_WINDOW_S]
            if any(i == ev.shot_id for i, _ in self._recent_shots):
                return []  # retransmit
            self._recent_shots.append((ev.shot_id, now))
            return [ev]
        if isinstance(ev, (M.DeviceError, M.ShotConfigResponse)):
            return [ev]
        return []
