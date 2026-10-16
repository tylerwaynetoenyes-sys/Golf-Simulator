# Club heads as signed-distance models, from published dimensions.
#
# Address frame, millimetres: +x toward the toe, +y up, +z away from the
# target (the face looks down -z). The shaft axis meets the ground at the
# origin O and rises toward the golfer along a = (-cos lie, sin lie, 0), so
# every head is built at its own loft and lie, soled flat.
#
# Figures (sources in docs/SOURCES.md, "Golf clubs"):
#  - 460 cc driver: ~4.8" heel to toe (122 mm), ~4.6" face to back, 2.4"
#    (61 mm) face height; face progression ~17 mm; bulge/roll 12"/11".
#  - fairway woods ~170-190 cc with 34-40 mm faces; hybrids 100-120 cc.
#  - persimmon drivers ~190-200 cc, deep 46-48 mm faces, pear shaped.
#  - irons: blade length ~75-80 mm, toe 48-56 mm, top line 5-9 mm, sole
#    15-27 mm, offset 2-7 mm, hosel OD 0.54" (13.7 mm) at the ferrule.
#  - grooves (USGA Appendix II / groove rule): width <= 0.035" (0.889 mm),
#    depth <= 0.020" (0.508 mm), separation >= 3x width, edge radius >= 0.010".
import math
import numpy as np
from sdf import Shape2D, catmull, smin, smax, sstep, tube, capsule, rbox2

# region ids (shared with tools/blender/equipment.py)
R = dict(BODY=0, FACE=1, CROWN=2, SOLE=3, HOSEL=4, FERRULE=5, BAND=6, BADGE=7, WEIGHT=8, PORT=9,
         INSERT=10, PLATE=11, WHIP=12, SLEEVE=13, TURB=14, SKIRT=15, TAPE=16, WOOD=17, CAVITY=18)


def axis_of(lie):
    L = math.radians(lie)
    return np.array([-math.cos(L), math.sin(L), 0.0])


class Head:
    """Field, bounds, a region classifier and metadata for one head."""

    def __init__(self, field, lo, hi, h, classify, meta, stamps=None, extra=None):
        self.field, self.lo, self.hi, self.h = field, lo, hi, h
        self.classify, self.meta = classify, meta
        self.stamps = stamps or []
        self.extra = extra or {}


# ───────────────────────── woods: driver, fairway, hybrid, persimmon ─────────────────────────

PLANS = {
    # top-view outlines, heel→toe (xn) and face→back (zn), normalised
    'driver': [(0.10, 0.02), (0.2, -0.11), (0.5, -0.15), (0.8, -0.11), (0.93, -0.02), (0.99, 0.14), (1.0, 0.32),
               (0.97, 0.52), (0.9, 0.70), (0.78, 0.85), (0.62, 0.95), (0.45, 0.99), (0.28, 0.95), (0.15, 0.84),
               (0.06, 0.66), (0.01, 0.45), (0.0, 0.26), (0.03, 0.10)],
    'fairway': [(0.05, 0.06), (0.13, -0.12), (0.5, -0.16), (0.87, -0.12), (0.975, 0.06), (1.0, 0.24), (0.985, 0.45),
                (0.93, 0.65), (0.81, 0.83), (0.64, 0.95), (0.46, 0.99), (0.29, 0.94), (0.15, 0.82), (0.06, 0.64),
                (0.01, 0.44), (0.0, 0.26), (0.015, 0.14)],
    'hybrid': [(0.05, 0.07), (0.13, -0.13), (0.5, -0.17), (0.87, -0.13), (0.975, 0.08), (1.0, 0.28), (0.975, 0.52),
               (0.89, 0.74), (0.73, 0.90), (0.52, 0.985), (0.32, 0.94), (0.16, 0.79), (0.06, 0.57), (0.005, 0.34),
               (0.012, 0.17)],
    'persimmon': [(0.07, 0.08), (0.15, -0.11), (0.5, -0.15), (0.86, -0.11), (0.97, 0.06), (1.0, 0.26), (0.98, 0.48),
                  (0.91, 0.70), (0.77, 0.88), (0.58, 0.985), (0.38, 0.97), (0.22, 0.84), (0.11, 0.63), (0.05, 0.42),
                  (0.035, 0.22)],
}

# per head size (mm): W heel-toe, D face-back, Fh face height, Hb back height,
# FP face progression, crown peak above the face top, sole curvature
WOOD_DIMS = {
    'driver': dict(W=117, D=108, Fh=58.5, Hb=30, FP=17, pk=3.5, zp=0.2, cx=1.5, sx=26, sz=17, yLE=4.5, bulge=305, roll=280,
                   hTop=70, sleeve=24, rH=(7.6, 6.9), plan='driver'),
    'fairway': dict(W=100, D=82, Fh=36, Hb=24, FP=15, pk=2.5, zp=0.18, cx=1.1, sx=20, sz=10, yLE=3.2, bulge=330, roll=300,
                    hTop=60, sleeve=22, rH=(7.2, 6.8), plan='fairway'),
    'hybrid': dict(W=94, D=58, Fh=36, Hb=26, FP=10, pk=2.0, zp=0.16, cx=1.15, sx=18, sz=9, yLE=3.0, bulge=360, roll=320,
                   hTop=60, sleeve=20, rH=(7.2, 6.8), plan='hybrid'),
    'persimmon': dict(W=93, D=74, Fh=43.5, Hb=31, FP=13, pk=2.5, zp=0.2, cx=0.95, sx=22, sz=12, yLE=4.0, bulge=255, roll=255,
                      hTop=88, sleeve=0, rH=(10.5, 6.2), plan='persimmon'),
}


def wood_head(cid, loft, lie, fam, opts=None):
    """fam: driver | fairway | hybrid | persimmon. opts: per-set extras (ports, turbulators, slot, size)."""
    o = dict(opts or {})
    d = dict(WOOD_DIMS[fam])
    d.update(o.get('dims', {}))
    W, D, Fh, Hb = d['W'], d['D'], d['Fh'], d['Hb']
    if fam == 'fairway':
        # 3W is the biggest; 5W/7W shrink a little
        k = {15: 1.0, 18: 0.965, 21: 0.94}.get(round(loft), 0.96)
        W, D, Fh, Hb = W * k, D * k, Fh * (0.97 + 0.03 * k), Hb * k
    a = axis_of(lie)
    L = math.radians(loft)
    n_out = np.array([0, math.sin(L), -math.cos(L)])
    f_up = np.array([0, math.cos(L), math.sin(L)])
    # where the shaft axis enters the crown, near the heel
    yEnt = 0.68 * Fh
    xEnt = -yEnt / math.tan(math.radians(lie))
    x0 = xEnt - 0.11 * W
    yc = 0.5 * Fh + 1.5
    yLE = d['yLE']
    zc = -d['FP'] + (yc - yLE) * math.tan(L)
    Fc = np.array([x0 + 0.54 * W, yc, zc])
    plan_pts = [(x0 + xn * W, zc + zn * D) for xn, zn in PLANS[d['plan']]]
    plan = Shape2D(catmull(plan_pts, 500), res=8)
    Hpk = Fh + d['pk']
    zp = d['zp']

    def crownH(x, z):
        xn = (x - x0) / W
        zn = (z - zc) / D
        t = np.clip((zn - zp) / (1 - zp), 0, 1)
        E = 1 - t ** d.get('ce', 1.7)
        X = 1 - d['cx'] * (xn - 0.53) ** 2
        return (Hb + (Hpk - Hb) * E) * X

    def soleH(x, z):
        xn = (x - x0) / W
        zn = (z - zc) / D
        return 0.25 + d['sx'] * (xn - 0.53) ** 2 + d['sz'] * np.clip(zn - 0.22, 0, None) ** 2

    sTop = d['hTop'] / math.sin(math.radians(lie))
    sFer = sTop + (14.0 if fam != 'persimmon' else 9.0)
    rTip = 4.45 if fam != 'persimmon' else 4.6  # 0.335" tip under a slim ferrule
    ports = o.get('ports', [])  # (xn, zn, radius) on the sole
    turb = o.get('turbulators', 0)
    slot = o.get('slot', False)

    def body(P):
        x, y, z = P[:, 0], P[:, 1], P[:, 2]
        b = smax(plan(x, z), y - crownH(x, z), d.get('kc', 14.0))
        b = smax(b, soleH(x, z) - y, 4.5)
        q = P - Fc
        qn = q @ n_out
        qx = q[:, 0]
        qv = q @ f_up
        face = qn + qx * qx / (2 * d['bulge']) + qv * qv / (2 * d['roll'])
        b = smax(b, face, 2.2)
        return b

    def field(P):
        b = body(P)
        x, y, z = P[:, 0], P[:, 1], P[:, 2]
        # hosel boss and the adjustable sleeve (or persimmon's wooden neck)
        hz = tube(P, (0, 0, 0), a, 8, sTop, d['rH'][0], d['rH'][1], 0.8)
        b = smin(b, hz, 5.0 if fam != 'persimmon' else 9.0)
        b = smax(b, soleH(x, z) - y, 2.0)
        # ferrule: tapers from the hosel to the shaft tip
        fer = tube(P, (0, 0, 0), a, sTop - 0.5, sFer, d['rH'][1] - 0.15, rTip + 0.35, 0.5)
        b = np.minimum(b, fer)
        for (pxn, pzn, pr) in ports:
            px, pz = x0 + pxn * W, zc + pzn * D
            py = float(soleH(np.array([px]), np.array([pz]))[0])
            cyl = smax(np.hypot(x - px, z - pz) - pr, y - (py + 4.0), 0.3)
            b = smax(b, -cyl, 0.6)  # the recess
            screw = smax(np.hypot(x - px, z - pz) - (pr - 0.9), (py + 0.7) - y, 0.4)  # the screw head, 0.7 mm below the sole line
            b = np.minimum(b, smax(screw, y - (py + 4.5), 0.1))
        if slot:
            # a speed slot just behind the leading edge, filled flush with polymer
            sx0 = x0 + 0.53 * W
            sz0 = zc + 0.07 * D
            s2 = rbox2(x, z, sx0, sz0, 0.30 * W, 2.4, 2.3)
            py = soleH(x, z)
            cut = smax(s2, y - (py + 3.5), 0.3)
            b = smax(b, -cut, 0.5)
            fill = smax(rbox2(x, z, sx0, sz0, 0.30 * W - 0.5, 1.9, 1.8), (py + 0.6) - y, 0.2)
            b = np.minimum(b, smax(fill, y - (py + 4.0), 0.1))
        if turb:
            # small aerodynamic ridges on the front of the crown
            for i in range(turb):
                tx = Fc[0] + (i - (turb - 1) / 2) * 6.5
                z1, z2 = zc + 4.5, zc + 15
                y1 = float(crownH(np.array([tx]), np.array([z1]))[0])
                y2 = float(crownH(np.array([tx]), np.array([z2]))[0])
                b = smin(b, capsule(P, (tx, y1 - 0.9, z1), (tx, y2 - 0.9, z2), 1.4), 0.8)
        return b

    hS = sFer
    tipP = a * hS
    lo = np.array([min(x0 - 6, tipP[0] - 10), -3, zc - 0.2 * D - 6])
    hi = np.array([x0 + W + 6, max(Hpk + 6, tipP[1] + 4), zc + D + 6])

    def classify(P, N):
        x, y, z = P[:, 0], P[:, 1], P[:, 2]
        reg = np.full(len(P), R['SKIRT'] if fam != 'persimmon' else R['WOOD'])
        q = P - a[None, :] * 0
        s = P @ a
        rad = np.linalg.norm(P - s[:, None] * a, axis=1)
        qn = (P - Fc) @ n_out
        qx = (P - Fc)[:, 0]
        qv = (P - Fc) @ f_up
        face = qn + qx * qx / (2 * d['bulge']) + qv * qv / (2 * d['roll'])
        is_face = (np.abs(face) < 0.35) & ((N @ n_out) > 0.75)
        if fam != 'persimmon':
            reg[(N[:, 1] > 0.3) & (y > 0.45 * Fh)] = R['CROWN']
            reg[(N[:, 1] < -0.35)] = R['SOLE']
            hos = (s > sTop - d['sleeve']) & (rad < d['rH'][0] + 1.2)
            reg[hos] = R['SLEEVE']
            boss = (s > 0.5 * sTop) & (s <= sTop - d['sleeve']) & (rad < d['rH'][0] + 2.5)
            reg[boss] = R['HOSEL']
        else:
            whip = (s > sTop - 30) & (s <= sTop + 0.2) & (rad < 11.5)
            reg[whip] = R['WHIP']
        reg[is_face] = R['FACE']
        reg[(s > sTop - 0.3) & (rad < 8)] = R['FERRULE']
        band = (s > sFer - 3.2) & (s < sFer - 2.0) & (rad < 8)
        reg[band] = R['BAND']
        for (pxn, pzn, pr) in ports:
            px, pz = x0 + pxn * W, zc + pzn * D
            r2 = np.hypot(x - px, z - pz)
            reg[(r2 < pr + 0.2) & (y < 8)] = R['PORT']
            reg[(r2 < pr - 0.8) & (y < 8)] = R['WEIGHT']
        if slot:
            sx0 = x0 + 0.53 * W
            sz0 = zc + 0.07 * D
            reg[(rbox2(x, z, sx0, sz0, 0.30 * W, 2.4, 2.3) < 0.15) & (y < 8)] = R['PORT']
        if turb:
            reg[(reg == R['CROWN']) & (np.abs(z - (zc + 9.5)) < 6.5) & (np.abs(x - Fc[0]) < turb * 3.4)
                & (y > crownH(x, z) - 0.45)] = R['TURB']
        if fam == 'persimmon':
            # brass sole plate inset from the sole edge
            plate = (plan(x, z) < -7) & (N[:, 1] < -0.6) & (z > zc + 0.06 * D)
            reg[plate] = R['PLATE']
        return reg

    meta = dict(id=cid, family=fam, loft=loft, lie=lie, faceCenter=Fc.tolist(), faceNormal=n_out.tolist(),
                faceUp=f_up.tolist(), axis=a.tolist(), shaftStart=float(sFer), hoselTop=float(sTop),
                tipRadius=rTip, x0=x0, W=W, D=D, Fh=Fh, zc=zc)
    extra = dict(crownH=crownH, soleH=soleH, plan=plan)
    h = 0.32 if fam == 'driver' else 0.28
    return Head(field, lo, hi, h, classify, meta, extra=extra)


# ───────────────────────── irons and wedges ─────────────────────────

def _arc(c, r, a0, a1, n=None):
    n = n or max(4, int(abs(a1 - a0) / 2))
    t = np.radians(np.linspace(a0, a1, n))
    return np.c_[c[0] + r * np.cos(t), c[1] + r * np.sin(t)]


def iron_outline(ub0, ub1, vt, vh, wedge=False):
    """The blade seen face-on (u heel→toe, v up the face), heel side open into the hosel."""
    rb = 16.0 if wedge else 11.0  # toe-bottom radius
    rt = (0.52 if wedge else 0.43) * vt  # toe-top radius
    lean = 3.0 if wedge else 1.5
    pts = [np.array([[ub0 - 4, -10], [ub1 - rb, -10]])]
    pts.append(_arc((ub1 - rb, -10 + rb), rb, -90, 0))
    ct = (ub1 - lean - rt, vt - rt)
    pts.append(np.array([[ub1, -10 + rb + 1], [ub1 - lean, ct[1]]]))
    pts.append(_arc(ct, rt, 0, 104))
    pts.append(np.array([[ub0 + 9, vh]]))
    pts.append(_arc((ub0 + 9, vh - 6), 6, 90, 160))
    pts.append(np.array([[ub0 - 1.5, 0.5 * vh], [ub0 - 4, 0]]))
    return np.vstack(pts)


def iron_head(cid, loft, lie, style, n=7, opts=None):
    """
    style: blade (muscle-back), cavity (players' cavity), gi (game improvement,
    wide sole and more offset), wedge (specialty wedge). n: 3..9 for irons,
    10 for PW; used to progress size, offset and sole width through the set.
    """
    o = dict(opts or {})
    L = math.radians(loft)
    a = axis_of(lie)
    p = (n - 3) / 7.0  # 0 long iron … 1 PW
    if style == 'blade':
        Lb, vt, vh = 75 + 2 * p, 47 + 6 * p, 31 + 2 * p
        off, W0, ttop = 3.2 - 1.6 * p, 14 + 4 * p, 5.0
        hM, sTopY = 17 + 3 * p, 59
    elif style == 'cavity':
        Lb, vt, vh = 77 + 2 * p, 49 + 6 * p, 32 + 2 * p
        off, W0, ttop = 4.2 - 2.0 * p, 18 + 4 * p, 6.2
        hM, sTopY = 13, 58
    elif style == 'gi':
        Lb, vt, vh = 81 + 2 * p, 52 + 6 * p, 33 + 2 * p
        off, W0, ttop = 6.8 - 2.6 * p, 24 + 4 * p, 8.0
        hM, sTopY = 16, 55
    else:  # wedge
        wl = {50: 0, 52: 0.2, 54: 0.4, 56: 0.6, 58: 0.8, 60: 1.0}.get(round(loft), 0.6)
        Lb, vt, vh = 79, 58 + 2 * wl, 33
        off, W0, ttop = -1.0, 20 + 12 * wl - (6 if loft >= 60 else 0), 6.0
        hM, sTopY = 15, 61
    Lb *= o.get('scale', 1.0)
    bounce = o.get('bounce', {'blade': 3, 'cavity': 4, 'gi': 5}.get(style, 10))
    if style == 'wedge':
        bounce = o.get('bounce', {50: 8, 52: 8, 54: 10, 56: 10, 58: 8, 60: 6}.get(round(loft), 10))
    rHb, rHt = 7.7, 6.6
    sTop = sTopY / math.sin(math.radians(lie))
    sFer = sTop + 15.0
    rTip = 4.55
    zLE = -rHb + off * 0.85
    ub0 = 3.0
    ub1 = ub0 + Lb
    xs = ub0 + 0.47 * Lb  # sweet spot, heel→toe
    zc = zLE + 0.42 * W0
    tb = math.tan(math.radians(bounce))
    yLE = 0.42 * W0 * tb + 0.25
    P0 = np.array([0, yLE, zLE])
    n_out = np.array([0, math.sin(L), -math.cos(L)])
    f_up = np.array([0, math.cos(L), math.sin(L)])
    grind = o.get('grind', 0.0)

    pts = iron_outline(ub0, ub1, vt, vh, style == 'wedge')
    outline = Shape2D(pts, res=10)

    def Wx(x):
        t = (x - xs) / (Lb * 0.5)
        return W0 * (1 - 0.22 * np.clip(t, -1.2, 1.2) ** 2) - np.where(t < 0, 1.5 * np.clip(-t, 0, 1), 0)

    def soleY(x, z):
        cam = (x - xs) ** 2 / (2 * 280.0)
        front = np.clip(zc - z, 0, None) * tb
        back = np.clip(z - zc, 0, None) ** 2 * 0.012
        y = cam + front + back
        if grind:
            # heel and trailing-edge relief (a C-style grind)
            tz = np.clip((z - zc) / (0.6 * W0), 0, 1)
            y = y + grind * tz * (np.clip((xs - 12 - x) / 22, 0, 1) ** 1.3 + 0.6 * np.clip((x - xs - 18) / 20, 0, 1) ** 1.3)
        return y

    def uvw(P):
        q = P - P0
        return P[:, 0], q @ f_up, -(q @ n_out)

    ring_w = {'cavity': 6.0, 'gi': 7.5}.get(style, 0)
    t_face = {'cavity': 3.3, 'gi': 2.8}.get(style, 0)
    t_ring = {'cavity': 7.4, 'gi': 9.6}.get(style, 0)
    badge = o.get('badge', None) if style in ('cavity', 'gi') else None  # (cu, cv, hw, hh)

    tTE = W0 * math.cos(L) + 1.0  # thickness needed to reach the trailing edge

    def back_field(P, u, v, w):
        x, y, z = P[:, 0], P[:, 1], P[:, 2]
        zTE = zLE + Wx(x)
        if style in ('blade', 'wedge'):
            if style == 'blade':
                vM = 0.5 * vt - 1 + 0.06 * (u - xs) - 0.004 * (u - xs) ** 2
                tM = tTE - 0.12 * v
            else:
                vM = 0.36 * vt - 0.003 * (u - xs) ** 2
                tM = tTE - 0.2 * v
            muscle = smax(smax(w - tM, v - vM, 3.5), z - zTE, 2.5)
            upper = w - (ttop + 1.0 * np.clip((u - ub0) / Lb, 0, 1))
            return smin(upper, muscle, 4.5)
        outl = outline(u, v)
        plate = w - t_face
        ring = smax(w - (t_ring + 1.5 * np.clip((u - xs) / (Lb / 2), 0, 1)), -(outl + ring_w), 0.9)
        vBar = (0.28 if style == 'cavity' else 0.34) * vt + 5.0 * np.clip(np.abs(x - xs) / (Lb / 2), 0, 1) ** 2
        bar = smax(smax(w - (tTE - 0.08 * v), v - vBar, 2.2), z - zTE, 2.0)
        bk = smin(smin(plate, ring, 1.0), bar, 2.0)
        if badge:
            cu, cv, hw, hh = badge
            bd = smax(rbox2(u, v, cu, cv, hw, hh, min(hh, 4.0)), np.abs(w - (t_face + 0.6)) - 1.0, 0.25)
            bk = np.minimum(bk, bd)
        return bk

    def field(P):
        u, v, w = uvw(P)
        x, y, z = P[:, 0], P[:, 1], P[:, 2]
        b = smax(outline(u, v), back_field(P, u, v, w), 1.4)
        b = smax(b, -w, 0.55)
        # the hosel runs down into the heel; the sole then cuts both
        hz = tube(P, (0, 0, 0), a, -6, sTop, rHb + 0.6, rHt, 0.6)
        b = smin(b, hz, 6.0)
        b = smax(b, soleY(x, z) - y, 1.2)
        fer = tube(P, (0, 0, 0), a, sTop - 0.5, sFer, rHt - 0.15, rTip + 0.35, 0.5)
        return np.minimum(b, fer)

    tipP = a * sFer
    lo = np.array([tipP[0] - 10, -3, zLE - 4])
    hi = np.array([ub1 + 6, max(vt * math.cos(L) + yLE + 6, tipP[1] + 4), zLE + max(W0, 14) + vt * math.sin(L) + 10])

    def classify(P, N):
        u, v, w = uvw(P)
        reg = np.full(len(P), R['BODY'])
        s = P @ a
        rad = np.linalg.norm(P - s[:, None] * a, axis=1)
        reg[(np.abs(w) < 0.3) & ((N @ n_out) > 0.85)] = R['FACE']
        reg[(N[:, 1] < -0.55) & (P[:, 1] < 6)] = R['SOLE']
        reg[(s > 15) & (rad < rHb + 1.0) & (np.abs(w) > 0.3)] = R['HOSEL']
        reg[(s > sTop - 0.3) & (rad < 8)] = R['FERRULE']
        reg[(s > sFer - 3.4) & (s < sFer - 2.2) & (rad < 8)] = R['BAND']
        if badge:
            cu, cv, hw, hh = badge
            reg[(rbox2(u, v, cu, cv, hw, hh, min(hh, 4.0)) < 0.1) & (w > t_face + 0.2) & ((N @ -n_out) > 0.6)] = R['BADGE']
        if style in ('cavity', 'gi'):
            cav = (w < t_face + 0.25) & (w > t_face - 0.25) & ((N @ -n_out) > 0.8) & (outline(u, v) < -ring_w + 0.5)
            reg[cav & (reg == R['BODY'])] = R['CAVITY']
        return reg

    # the scoring area: grooves start ~4.5 mm up the face and stop short of the top line
    v_top_c = vh + (vt - vh) * ((xs - ub0 - 9) / (Lb - 31))
    n_grooves = int((v_top_c - 9.0 - 4.5) / 3.6) + 1
    if style == 'wedge':
        n_grooves = int((v_top_c - 8.0 - 3.8) / 3.45) + 1
    meta = dict(id=cid, family='iron', style=style, loft=loft, lie=lie, bounce=bounce,
                faceCenter=(np.array(P0) + f_up * 18.5 + np.array([xs, 0, 0])).tolist(),
                faceNormal=n_out.tolist(), faceUp=f_up.tolist(), axis=a.tolist(), shaftStart=float(sFer),
                hoselTop=float(sTop), tipRadius=rTip, ub0=ub0, ub1=ub1, xs=xs, vt=vt, vh=vh, P0=P0.tolist(),
                grooves=n_grooves, offset=off, sole=W0)
    extra = dict(outline=outline, uvw=uvw, soleY=soleY, t_face=t_face)
    return Head(field, lo, hi, 0.24, classify, meta, extra=extra)


# ───────────────────────── Happy Gilmour's hockey stick ─────────────────────────

def hockey_head(lie=52):
    """
    A wooden ice-hockey stick blade (about 12.5" long, 3" tall, with a curve)
    and the bottom of its shaft, taped. The stick is held as a club, the blade
    soled flat, its face toward the target.
    """
    a = axis_of(lie)
    blade_len, blade_h, thick = 318.0, 76.0, 15.0
    # blade outline in the face plane (u toward the toe, v up)
    pts = [(-30, 30), (-22, 6), (-6, -1), (60, -1.5), (200, -1), (270, 2), (305, 10), (318, 30), (314, 58),
           (300, 72), (240, 76), (60, 72), (10, 70), (-18, 64)]
    outline = Shape2D(catmull(pts, 500), res=8)
    sTop = 300.0  # the head carries the shaft's bottom 30 cm (its taped heel and the hosel-like joint)
    # shaft cross-section ~ 1.25" x 0.75" (32 x 19 mm)

    def curve(u):
        # the blade curves away from the target toward the toe (a "mid" curve, ~12 mm deep)
        return 12.0 * np.clip(u / blade_len, 0, 1) ** 2

    def field(P):
        x, y, z = P[:, 0], P[:, 1], P[:, 2]
        u, v = x, y
        zc = curve(u)
        bl = smax(outline(u, v), np.abs(z - zc - thick * 0.5) - thick * 0.5, 1.5)
        bl = smax(bl, -y + 0.0, 1.0)
        # the shaft: a rounded rectangle along the axis
        s = P @ a
        perp = np.array([math.sin(math.radians(lie)), math.cos(math.radians(lie)), 0])
        pu = P @ perp
        pz = z - 9.5
        sh = smax(rbox2(pu, pz, 0, 0, 16, 9.5, 3.5), np.maximum(-s + 20, s - sTop), 0.5)
        return smin(bl, sh, 10.0)

    lo = np.array([a[0] * sTop - 30, -3, -12])
    hi = np.array([blade_len + 8, a[1] * sTop + 20, 40])

    def classify(P, N):
        x, y, z = P[:, 0], P[:, 1], P[:, 2]
        reg = np.full(len(P), R['WOOD'])
        s = P @ a
        # tape over the blade from heel to toe
        reg[(x > 12) & (s < 140)] = R['TAPE']
        reg[(x > 12) & (y < 80)] = R['TAPE']
        return reg

    meta = dict(id='HOCKEY', family='hockey', loft=4, lie=lie, faceCenter=[110.0, 32.0, curve(np.array([110.0]))[0] - 1],
                faceNormal=[0, 0.07, -1.0], faceUp=[0, 1, 0], axis=a.tolist(), shaftStart=sTop, hoselTop=sTop, tipRadius=9)
    return Head(field, lo, hi, 0.5, classify, meta, extra=dict(curve=curve))
