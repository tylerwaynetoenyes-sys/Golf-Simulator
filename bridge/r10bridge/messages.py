"""R10 protobuf application messages (Smart container, field 30/38).

Field numbers follow 10over's proto/GDISmart.proto, GDIEventSharing.proto and
GDILaunchMonitor.proto.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from . import pb

# Smart container extensions
SMART_EVENT_SHARING = 30
SMART_LAUNCH_MONITOR = 38

ALERT_LAUNCH_MONITOR = 8

DEVICE_STATES = {
    0: "STANDBY",
    1: "INTERFERENCE_TEST",
    2: "WAITING",
    3: "RECORDING",
    4: "PROCESSING",
    5: "ERROR",
}

ERROR_CODES = {0: "UNKNOWN", 1: "OVERHEATING", 2: "RADAR_SATURATION", 3: "PLATFORM_TILTED"}
ERROR_SEVERITY = {0: "WARNING", 1: "SERIOUS", 2: "FATAL"}
SPIN_CALC = {0: "ratio", 1: "ball_flight", 2: "other", 3: "measured"}
BALL_TYPE = {0: "unknown", 1: "conventional", 2: "marked"}

MPS_TO_MPH = 2.2369362920544


# ── builders ──


def build_subscribe_request() -> bytes:
    alert = pb.f_varint(1, ALERT_LAUNCH_MONITOR)
    sub_req = pb.f_msg(1, alert)  # SubscribeRequest.alerts
    es = pb.f_msg(1, sub_req)  # EventSharingService.subscribe_request
    return pb.f_msg(SMART_EVENT_SHARING, es)


def build_wakeup_request() -> bytes:
    lm = pb.f_msg(3, b"")  # Service.wake_up_request = {}
    return pb.f_msg(SMART_LAUNCH_MONITOR, lm)


def build_shot_config_request(
    temperature: float | None = None,
    humidity: float | None = None,
    altitude: float | None = None,
    air_density: float | None = None,
    tee_range: float | None = None,
) -> bytes:
    body = b""
    for i, v in enumerate((temperature, humidity, altitude, air_density, tee_range), start=1):
        if v is not None:
            body += pb.f_float(i, v)
    lm = pb.f_msg(11, body)
    return pb.f_msg(SMART_LAUNCH_MONITOR, lm)


# ── decoded events ──


@dataclass
class SubscribeResponse:
    success: bool


@dataclass
class WakeUpResponse:
    status: int  # 0 SUCCESS, 1 ALREADY_AWAKE, 2 UNKNOWN_ERROR


@dataclass
class ShotConfigResponse:
    success: bool


@dataclass
class StateChange:
    state: str


@dataclass
class DeviceError:
    code: str
    severity: str
    tilt: tuple[float, float] | None = None


@dataclass
class CalibrationStatus:
    status: int
    result: int


@dataclass
class Shot:
    shot_id: int
    shot_type: str
    ball: dict | None = None
    club: dict | None = None
    swing: dict | None = None
    extra: dict = field(default_factory=dict)

    def to_json(self) -> dict:
        return {
            "id": self.shot_id,
            "shotType": self.shot_type,
            "ball": self.ball,
            "club": self.club,
            "swing": self.swing,
        }


@dataclass
class Unknown:
    pass


def _r(v: float | None, nd: int = 2) -> float:
    return round(float(v or 0.0), nd)


def decode_metrics(m: pb.Message) -> Shot:
    ball = None
    b = m.sub(3)
    if b is not None:
        speed = b.float(3, 0.0) or 0.0
        axis = b.float(4, 0.0) or 0.0
        total = b.float(5, 0.0) or 0.0
        rad = math.radians(axis)
        ball = {
            "speedMps": _r(speed, 3),
            "speedMph": _r(speed * MPS_TO_MPH, 2),
            "launchAngle": _r(b.float(1, 0.0)),
            "launchDirection": _r(b.float(2, 0.0)),
            "spinAxis": _r(axis),
            "totalSpin": _r(total, 0),
            "backSpin": _r(total * math.cos(rad), 0),
            "sideSpin": _r(total * math.sin(rad), 0),
            "spinCalc": SPIN_CALC.get(b.uint(6, 0) or 0, "other"),
            "ballType": BALL_TYPE.get(b.uint(7, 0) or 0, "unknown"),
        }
    club = None
    c = m.sub(4)
    if c is not None:
        chs = c.float(1, 0.0) or 0.0
        club = {
            "speedMps": _r(chs, 3),
            "speedMph": _r(chs * MPS_TO_MPH, 2),
            "faceAngle": _r(c.float(2, 0.0)),
            "path": _r(c.float(3, 0.0)),
            "attackAngle": _r(c.float(4, 0.0)),
        }
    swing = None
    s = m.sub(5)
    if s is not None:
        swing = {
            "backswingStart": s.uint(1, 0),
            "downswingStart": s.uint(2, 0),
            "impact": s.uint(3, 0),
            "followThroughEnd": s.uint(4, 0),
        }
        bs, ds, imp = swing["backswingStart"], swing["downswingStart"], swing["impact"]
        if bs and ds and imp and bs < ds < imp:
            swing["backswingMs"] = ds - bs
            swing["downswingMs"] = imp - ds
            swing["tempo"] = round((ds - bs) / (imp - ds), 2)
    return Shot(
        shot_id=m.uint(1, 0) or 0,
        shot_type="normal" if (m.uint(2, 0) == 1) else "practice",
        ball=ball,
        club=club,
        swing=swing,
    )


def decode_smart(data: bytes):
    smart = pb.Message(data)
    es = smart.sub(SMART_EVENT_SHARING)
    if es is not None:
        resp = es.sub(2)
        if resp is not None:
            statuses = resp.subs(1)
            ok = bool(statuses) and (statuses[0].uint(1, 1) == 0)
            return SubscribeResponse(ok)
        notif = es.sub(3)
        if notif is not None:
            details = notif.sub(1001)
            if details is None:
                return Unknown()
            metrics = details.sub(2)
            if metrics is not None:
                return decode_metrics(metrics)
            state = details.sub(1)
            if state is not None and state.uint(1) is not None:
                st = DEVICE_STATES.get(state.uint(1))  # type: ignore[arg-type]
                if st:
                    return StateChange(st)
            err = details.sub(3)
            if err is not None:
                tilt = err.sub(3)
                return DeviceError(
                    ERROR_CODES.get(err.uint(1, 0) or 0, "UNKNOWN"),
                    ERROR_SEVERITY.get(err.uint(2, 0) or 0, "WARNING"),
                    (tilt.float(1, 0.0), tilt.float(2, 0.0)) if tilt is not None else None,  # type: ignore[arg-type]
                )
            cal = details.sub(4)
            if cal is not None:
                return CalibrationStatus(cal.uint(1, 0) or 0, cal.uint(2, 0) or 0)
        return Unknown()
    lm = smart.sub(SMART_LAUNCH_MONITOR)
    if lm is not None:
        wake = lm.sub(4)
        if wake is not None:
            return WakeUpResponse(wake.uint(1, 0) or 0)
        scr = lm.sub(12)
        if scr is not None:
            return ShotConfigResponse(bool(scr.bool(1, False)))
    return Unknown()


# ── encoders used by the mock device / tests ──


def encode_alert(details_body: bytes) -> bytes:
    notif = pb.f_varint(1, ALERT_LAUNCH_MONITOR) + pb.f_msg(1001, details_body)
    return pb.f_msg(SMART_EVENT_SHARING, pb.f_msg(3, notif))


def encode_state_alert(state: int) -> bytes:
    return encode_alert(pb.f_msg(1, pb.f_varint(1, state)))


def encode_error_alert(code: int, severity: int) -> bytes:
    return encode_alert(pb.f_msg(3, pb.f_varint(1, code) + pb.f_varint(2, severity)))


def encode_shot_alert(
    shot_id: int,
    ball_speed_mps: float,
    launch_angle: float,
    launch_direction: float,
    total_spin: float,
    spin_axis: float,
    club_speed_mps: float | None = None,
    face: float = 0.0,
    path: float = 0.0,
    attack: float = 0.0,
    impact_ms: int | None = None,
) -> bytes:
    ball = (
        pb.f_float(1, launch_angle)
        + pb.f_float(2, launch_direction)
        + pb.f_float(3, ball_speed_mps)
        + pb.f_float(4, spin_axis)
        + pb.f_float(5, total_spin)
        + pb.f_varint(6, 0)
        + pb.f_varint(7, 1)
    )
    metrics = pb.f_varint(1, shot_id) + pb.f_varint(2, 1) + pb.f_msg(3, ball)
    if club_speed_mps is not None:
        club = pb.f_float(1, club_speed_mps) + pb.f_float(2, face) + pb.f_float(3, path) + pb.f_float(4, attack)
        metrics += pb.f_msg(4, club)
    if impact_ms is not None:
        swing = (
            pb.f_varint(1, impact_ms - 1050)
            + pb.f_varint(2, impact_ms - 300)
            + pb.f_varint(3, impact_ms)
            + pb.f_varint(4, impact_ms + 900)
        )
        metrics += pb.f_msg(5, swing)
    return encode_alert(pb.f_msg(2, metrics))


def encode_subscribe_response(success: bool = True) -> bytes:
    st = pb.f_varint(1, 0 if success else 1) + pb.f_msg(2, pb.f_varint(1, ALERT_LAUNCH_MONITOR))
    return pb.f_msg(SMART_EVENT_SHARING, pb.f_msg(2, pb.f_msg(1, st)))


def encode_wakeup_response(status: int = 0) -> bytes:
    return pb.f_msg(SMART_LAUNCH_MONITOR, pb.f_msg(4, pb.f_varint(1, status)))


def encode_shot_config_response(success: bool = True) -> bytes:
    return pb.f_msg(SMART_LAUNCH_MONITOR, pb.f_msg(12, pb.f_varint(1, int(success))))
