"""Tiny dependency-free protobuf (proto2 wire format) encoder/decoder.

The R10 messages are small and use only varints, 32-bit floats and nested
messages, so a schema-less reader is enough and keeps the bridge free of
protoc/codegen steps. Field numbers mirror 10over's proto/*.proto files.
"""

from __future__ import annotations

import struct
from typing import Iterable

WT_VARINT = 0
WT_I64 = 1
WT_LEN = 2
WT_I32 = 5


class PbError(ValueError):
    pass


# ── encoding ──


def enc_varint(v: int) -> bytes:
    if v < 0:
        v &= (1 << 64) - 1
    out = bytearray()
    while True:
        b = v & 0x7F
        v >>= 7
        if v:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def _tag(field: int, wt: int) -> bytes:
    return enc_varint((field << 3) | wt)


def f_varint(field: int, v: int) -> bytes:
    return _tag(field, WT_VARINT) + enc_varint(int(v))


def f_float(field: int, v: float) -> bytes:
    return _tag(field, WT_I32) + struct.pack("<f", float(v))


def f_msg(field: int, body: bytes) -> bytes:
    return _tag(field, WT_LEN) + enc_varint(len(body)) + body


def msg(*parts: Iterable[bytes] | bytes) -> bytes:
    return b"".join(p for p in parts if p)  # type: ignore[arg-type]


# ── decoding ──


def _dec_varint(data: bytes, pos: int) -> tuple[int, int]:
    result = 0
    shift = 0
    while True:
        if pos >= len(data):
            raise PbError("truncated varint")
        b = data[pos]
        pos += 1
        result |= (b & 0x7F) << shift
        if not b & 0x80:
            return result, pos
        shift += 7
        if shift > 63:
            raise PbError("varint too long")


class Message:
    """Decoded message: field number -> list of raw values (int | bytes)."""

    __slots__ = ("fields",)

    def __init__(self, data: bytes):
        self.fields: dict[int, list[tuple[int, int | bytes]]] = {}
        pos = 0
        n = len(data)
        while pos < n:
            key, pos = _dec_varint(data, pos)
            field, wt = key >> 3, key & 7
            if wt == WT_VARINT:
                val, pos = _dec_varint(data, pos)
            elif wt == WT_I32:
                if pos + 4 > n:
                    raise PbError("truncated fixed32")
                val = data[pos:pos + 4]
                pos += 4
            elif wt == WT_I64:
                if pos + 8 > n:
                    raise PbError("truncated fixed64")
                val = data[pos:pos + 8]
                pos += 8
            elif wt == WT_LEN:
                ln, pos = _dec_varint(data, pos)
                if pos + ln > n:
                    raise PbError("truncated length-delimited field")
                val = data[pos:pos + ln]
                pos += ln
            else:
                raise PbError(f"unsupported wire type {wt}")
            self.fields.setdefault(field, []).append((wt, val))

    def has(self, field: int) -> bool:
        return field in self.fields

    def sub(self, field: int) -> "Message | None":
        vals = self.fields.get(field)
        if not vals:
            return None
        wt, v = vals[-1]
        if wt != WT_LEN:
            return None
        return Message(v)  # type: ignore[arg-type]

    def subs(self, field: int) -> list["Message"]:
        return [Message(v) for wt, v in self.fields.get(field, []) if wt == WT_LEN]  # type: ignore[arg-type]

    def uint(self, field: int, default: int | None = None) -> int | None:
        vals = self.fields.get(field)
        if not vals:
            return default
        wt, v = vals[-1]
        if wt == WT_VARINT:
            return int(v)  # type: ignore[arg-type]
        if wt == WT_LEN and v:  # packed repeated: take last element
            items = self.uints(field)
            return items[-1] if items else default
        return default

    def uints(self, field: int) -> list[int]:
        out: list[int] = []
        for wt, v in self.fields.get(field, []):
            if wt == WT_VARINT:
                out.append(int(v))  # type: ignore[arg-type]
            elif wt == WT_LEN:  # packed
                pos = 0
                while pos < len(v):  # type: ignore[arg-type]
                    x, pos = _dec_varint(v, pos)  # type: ignore[arg-type]
                    out.append(x)
        return out

    def float(self, field: int, default: float | None = None) -> float | None:
        vals = self.fields.get(field)
        if not vals:
            return default
        wt, v = vals[-1]
        if wt == WT_I32:
            return struct.unpack("<f", v)[0]  # type: ignore[arg-type]
        return default

    def bool(self, field: int, default: bool | None = None) -> bool | None:
        v = self.uint(field)
        return default if v is None else bool(v)
