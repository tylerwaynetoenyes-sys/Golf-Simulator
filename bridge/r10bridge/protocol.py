"""Low-level Garmin R10 wire protocol: CRC-16/ARC, COBS, GFDI framing, MultiLink.

A faithful Python port of the framing layers in divotmaker/10over
(https://github.com/divotmaker/10over, MIT/Apache-2.0). See docs/WIRE.md there
for the full specification. All integers are little-endian.

Stack (top to bottom):
    protobuf (Smart container)  -> messages.py
    14-byte fragmentation header
    GFDI frame (length | type | payload | crc16)
    COBS with 0x00 delimiters
    MultiLink handle byte prefix on every BLE chunk
    BLE GATT (6A4E2810 notify/register, 6A4E2820 write)
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field

# ── GATT UUIDs (Garmin MultiLink) ──────────────────────────────────────────

MULTILINK_SERVICE_UUID = "6a4e2800-667b-11e3-949a-0800200c9a66"
CHAR_NOTIFY_REGISTER_UUID = "6a4e2810-667b-11e3-949a-0800200c9a66"  # notify + REGISTER
CHAR_WRITE_UUID = "6a4e2820-667b-11e3-949a-0800200c9a66"  # outbound GFDI data

GARMIN_MANUFACTURER_ID = 0x0087
R10_PRODUCT_ID = 3622
R10_NAME = "Approach R10"

# ── GFDI message types ─────────────────────────────────────────────────────

MSG_ACK = 5000
MSG_FIT_DEFINITION = 5011
MSG_FIT_DATA = 5012
MSG_DEVICE_INFO = 5024
MSG_PROTOBUF_REQUEST = 5043
MSG_PROTOBUF_RESPONSE = 5044
MSG_CONFIGURATION = 5050

CAP_SWING_SENSOR = 30

# ── CRC-16/ARC (nibble table, as in WIRE.md §4) ───────────────────────────

_CRC_TABLE = (
    0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
    0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,
)


def crc16(data: bytes) -> int:
    crc = 0
    for b in data:
        tmp = ((crc >> 4) & 0x0FFF) ^ _CRC_TABLE[crc & 0xF] ^ _CRC_TABLE[b & 0xF]
        crc = ((tmp >> 4) & 0x0FFF) ^ _CRC_TABLE[tmp & 0xF] ^ _CRC_TABLE[(b >> 4) & 0xF]
    return crc


# ── COBS ───────────────────────────────────────────────────────────────────


class CobsError(ValueError):
    pass


def cobs_encode(data: bytes) -> bytes:
    out = bytearray()
    i = 0
    n = len(data)
    while i < n:
        start = i
        while i < n and data[i] != 0 and (i - start) < 0xFE:
            i += 1
        out.append(i - start + 1)
        out += data[start:i]
        if i < n and data[i] == 0:
            i += 1
    return bytes(out)


def cobs_decode(data: bytes) -> bytes:
    out = bytearray()
    i = 0
    n = len(data)
    while i < n:
        code = data[i]
        if code == 0:
            break
        i += 1
        for _ in range(1, code):
            if i >= n:
                raise CobsError("COBS decode error: malformed input")
            out.append(data[i])
            i += 1
        if code < 0xFF and i < n:
            out.append(0)
    if out and out[-1] == 0:
        out.pop()
    return bytes(out)


def wrap_cobs(frame: bytes) -> bytes:
    return b"\x00" + cobs_encode(frame) + b"\x00"


# ── GFDI frames ────────────────────────────────────────────────────────────


class FrameError(ValueError):
    pass


@dataclass
class GfdiFrame:
    msg_type: int
    payload: bytes
    txn_id: int | None = None


def build_frame(msg_type: int, payload: bytes) -> bytes:
    length = 2 + 2 + len(payload) + 2
    frame = struct.pack("<HH", length, msg_type) + payload
    return frame + struct.pack("<H", crc16(frame))


def parse_frame(frame: bytes) -> GfdiFrame:
    if len(frame) < 6:
        raise FrameError(f"frame too short ({len(frame)} < 6)")
    crc_recv = struct.unpack_from("<H", frame, len(frame) - 2)[0]
    crc_calc = crc16(frame[:-2])
    if crc_recv != crc_calc:
        raise FrameError(f"CRC mismatch (expected {crc_calc:#06x}, got {crc_recv:#06x})")
    if frame[3] & 0x80:
        # compressed header: [len][type-5000][txn|0x80]
        return GfdiFrame(frame[2] + 5000, bytes(frame[4:-2]), frame[3] & 0x7F)
    msg_type = struct.unpack_from("<H", frame, 2)[0]
    return GfdiFrame(msg_type, bytes(frame[4:-2]), None)


def build_ack(orig_msg_type: int, status: int = 0, payload: bytes = b"") -> bytes:
    return build_frame(MSG_ACK, struct.pack("<HB", orig_msg_type, status) + payload)


@dataclass
class DeviceInfo:
    protocol_version: int
    product_number: int
    unit_id: int
    software_version: int
    max_packet_size: int
    friendly_name: str
    device_name: str
    model_name: str


def _read_lp_string(data: bytes, pos: int) -> tuple[str, int]:
    if pos >= len(data):
        return "", pos
    n = data[pos]
    pos += 1
    if pos + n > len(data):
        return "", pos
    return data[pos:pos + n].decode("utf-8", "replace"), pos + n


def parse_device_info(payload: bytes) -> DeviceInfo:
    if len(payload) < 12:
        raise FrameError(f"device info too short ({len(payload)} < 12)")
    pv, prod, unit, sw, mps = struct.unpack_from("<HHIHH", payload, 0)
    pos = 12
    friendly, pos = _read_lp_string(payload, pos)
    device, pos = _read_lp_string(payload, pos)
    model, pos = _read_lp_string(payload, pos)
    return DeviceInfo(pv, prod, unit, sw, mps, friendly, device, model)


def build_device_info_payload(
    protocol_version: int, product: int, unit_id: int, sw: int, mps: int, names: tuple[str, str, str]
) -> bytes:
    out = bytearray(struct.pack("<HHIHH", protocol_version, product, unit_id, sw, mps))
    for s in names:
        b = s.encode()
        out.append(len(b))
        out += b
    return bytes(out)


def build_device_info_response() -> bytes:
    """ACK(5024) carrying the host info block (WIRE.md §7.1)."""
    host = bytearray(struct.pack("<HHIHH", 150, 0xFFFF, 0xFFFFFFFF, 100, 0xFFFF))
    for s in (b"alton-range", b"Bridge", b"Desktop"):
        host.append(len(s))
        host += s
    host.append(0x01)
    return build_ack(MSG_DEVICE_INFO, 0, bytes(host))


def parse_capabilities(payload: bytes) -> list[int]:
    if not payload:
        return []
    size = payload[0]
    bitmap = payload[1:1 + size]
    return [i * 8 + bit for i, byte in enumerate(bitmap) for bit in range(8) if byte & (1 << bit)]


def build_capabilities_payload(bits: list[int], size: int = 13) -> bytes:
    bitmap = bytearray(size)
    for b in bits:
        bitmap[b // 8] |= 1 << (b % 8)
    return bytes([size]) + bytes(bitmap)


def build_host_capabilities() -> bytes:
    return build_frame(MSG_CONFIGURATION, build_capabilities_payload([CAP_SWING_SENSOR]))


# ── Protobuf fragmentation header (14 bytes) ──────────────────────────────


@dataclass
class FragHeader:
    req_id: int
    offset: int
    total_len: int
    chunk_size: int


def parse_frag_header(payload: bytes) -> tuple[FragHeader, bytes]:
    if len(payload) < 14:
        raise FrameError(f"fragment header too short ({len(payload)} < 14)")
    req_id, offset, total, chunk = struct.unpack_from("<HIII", payload, 0)
    return FragHeader(req_id, offset, total, chunk), bytes(payload[14:14 + chunk])


def build_frag_payload(req_id: int, pb_data: bytes) -> bytes:
    n = len(pb_data)
    return struct.pack("<HIII", req_id & 0xFFFF, 0, n, n) + pb_data


def build_protobuf_request(req_id: int, pb_data: bytes) -> bytes:
    return build_frame(MSG_PROTOBUF_REQUEST, build_frag_payload(req_id, pb_data))


# ── Stream reassembly ─────────────────────────────────────────────────────

STREAM_BUFFER_MAX = 64 * 1024


@dataclass
class StreamBuffer:
    buf: bytearray = field(default_factory=bytearray)

    def extend(self, data: bytes) -> None:
        if len(self.buf) + len(data) > STREAM_BUFFER_MAX:
            self.buf.clear()
            raise FrameError("stream buffer overflow; buffer reset")
        self.buf += data

    def next_frame(self) -> GfdiFrame | None:
        """Return the next complete frame, or None. Raises on a corrupt frame."""
        while True:
            try:
                start = self.buf.index(0)
                end = self.buf.index(0, start + 1)
            except ValueError:
                return None
            cobs_data = bytes(self.buf[start + 1:end])
            del self.buf[:end + 1]
            if not cobs_data:
                continue
            return parse_frame(cobs_decode(cobs_data))


# ── MultiLink ──────────────────────────────────────────────────────────────

MULTILINK_SERVICE_GFDI = 1

REGISTER_STATUS = {
    0: "SUCCESS",
    1: "INVALID_SERVICE_ID",
    2: "PENDING_AUTH",
    3: "ALREADY_IN_USE",
    4: "REJECTED",
}


def build_register(txn_id: int = 1, service_id: int = MULTILINK_SERVICE_GFDI) -> bytes:
    return b"\x00\x00" + struct.pack("<QH", txn_id, service_id) + b"\x00"


def parse_register_response(data: bytes) -> tuple[int, int, int] | None:
    """Return (status, handle, flags) or None if not a REGISTER_RESPONSE."""
    if len(data) < 15 or data[1] != 0x01:
        return None
    return data[12], data[13], data[14]


def build_register_response(txn_id: int, service_id: int, status: int, handle: int) -> bytes:
    return b"\x00\x01" + struct.pack("<QHBBH", txn_id, service_id, status, handle, 0)


def strip_handle(chunk: bytes, handle: int) -> bytes | None:
    if chunk and chunk[0] == handle:
        return bytes(chunk[1:])
    return None


def chunk_with_handle(data: bytes, handle: int, mtu: int = 20) -> list[bytes]:
    per = max(mtu - 1, 0)
    if per == 0:
        return []
    return [bytes([handle]) + data[i:i + per] for i in range(0, len(data), per)]
