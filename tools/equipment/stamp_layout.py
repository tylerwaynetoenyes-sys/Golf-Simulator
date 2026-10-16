# Where each set's stamps go on each head: face grooves and scorelines, the
# sole and back wordmarks, numbers, alignment marks, colour codes, whipping.
import math
import numpy as np
from PIL import ImageDraw
from heads import R
from sets import SETS, LABEL
from stamps import Canvas, grooves, lines, save_depth, save_rgba, text_mask

X = np.array([1.0, 0, 0])


def _v(a):
    return [float(t) for t in a]


def plane(o, u, v, n, w, h, files, region=None, facing=0.3, rough=None, metal=None, keep=False, paint_rough=0.42):
    d = dict(mode='plane', o=_v(o), u=_v(u), v=_v(v), n=_v(n), w=w, h=h, region=region, facing=facing,
             rough=rough, metal=metal, keep=keep, paintRough=paint_rough)
    d.update(files)
    return d


def cyl(o, axis, ref, r, h, files, region=None, rough=None, keep=False, paint_rough=0.42):
    d = dict(mode='cyl', o=_v(o), u=_v(ref), v=_v(axis), n=None, w=2 * math.pi * r, h=h, region=region, facing=-2,
             rough=rough, metal=None, keep=keep, paintRough=paint_rough)
    d.update(files)
    return d


def rrect(draw, px, x0, y0, x1, y1, r, H):
    draw.rounded_rectangle([x0 * px, (H - y1) * px, x1 * px, (H - y0) * px], radius=r * px, fill=255)


def iron_stamps(sid, cid, head, base):
    S = SETS[sid]
    m = head.meta
    P0, fu, no = np.array(m['P0']), np.array(m['faceUp']), np.array(m['faceNormal'])
    ub0, ub1, xs, vt, vh = m['ub0'], m['ub1'], m['xs'], m['vt'], m['vh']
    Lb = ub1 - ub0
    wedge = m['style'] == 'wedge'
    out = []
    # ── face: grooves (USGA: <= 0.889 mm wide, <= 0.508 mm deep) and the blasted scoring area ──
    fw, fh = Lb + 6, vt + 2
    u_lo = ub0 - 3
    pitch = 3.45 if wedge else 3.6
    gw = Lb * (0.74 if wedge else 0.70)
    gu0 = xs + 1 - gw / 2 - (2 if wedge else 0)
    gu1 = gu0 + gw + (6 if wedge else 0)
    n = m['grooves']
    D = grooves(fw, fh, n, pitch, width=0.86, depth=0.48, inset=1 + 4.4,
                taper=lambda i: (gu0 - u_lo, gu1 - u_lo - (0.25 * i * (vt - vh) / Lb * 3 if not wedge else 0)))
    def blast(dr, px):
        rrect(dr, px, gu0 - u_lo - 3, 1.2, gu1 - u_lo + 3, 4.4 + (n - 1) * pitch + 3.2, 2.5, fh)
    img = Canvas(fw, fh, px=20)
    img.shape(blast, '#000000')
    A = img.rgba
    if wedge:
        # fly-cut milling: fine concentric arcs across the face, in the roughness
        H, W = A.shape[:2]
        yy, xx = np.mgrid[0:H, 0:W] / 20.0
        rr = np.hypot(xx - fw * 0.5, (fh - yy) + 60)
        A[..., 3] *= 0.75 + 0.25 * (np.sin(rr * 2 * math.pi / 0.9) > 0)
    files = save_rgba(A, base + '_face')
    files.update(save_depth(D, base + '_face'))
    o = P0 + X * (u_lo + fw / 2) + fu * (fh / 2 - 1)
    out.append(plane(o, X, fu, no, fw, fh, files, region=[R['FACE']], facing=0.6, rough=0.42 if S['metal'][1] < 0.3 else 0.55, keep=True))

    # ── back: wordmark, model, number ──
    # projected halfway between straight back and square to the back of the
    # blade, so high lofts (whose backs face the ground) still take it on the back
    bn = -no * 0.5 + np.array([0, 0, 0.5])
    bn /= np.linalg.norm(bn)
    bv = np.array([0, bn[2], -bn[1]])
    k = float(fu @ bv)  # face-plane heights → heights on this projection
    cb = Canvas(Lb + 6, (vt + 4) * k)
    fill = S['fill']
    style = m['style']
    num = LABEL[cid]
    if style == 'blade':
        vy = 0.27 * vt * k
        if sid == 'tour':
            cb.text('Titlewest', fill, Lb * 0.47, vy, 4.0, weight=560, italic=-0.22, engrave=0.18)
            cb.text('FORGED', fill, Lb * 0.47 - 12, vy + 7.5, 1.4, weight=500, track=0.25, engrave=0.1)
        elif sid == 'black':
            cb.text('TaylerMaid', fill, Lb * 0.46, vy, 3.8, weight=640, engrave=0.15)
            cb.text('P·7-ish MB', S['accent'], Lb * 0.46 - 8, vy + 7, 1.6, weight=600, track=0.12, engrave=0.08)
        else:  # persimmon set's 1975 blades
            cb.text('MacGREGGOR', fill, Lb * 0.47, vy, 3.6, weight=700, track=0.06, engrave=0.2)
            cb.text('TOURNEY', S['accent'], Lb * 0.47, vy + 6.5, 2.0, weight=600, track=0.3, engrave=0.12)
        cb.text(num, fill, Lb - 9, 0.64 * vt * k, 6.5 if len(num) == 1 else 5, weight=600, engrave=0.25)
    elif style in ('cavity', 'gi'):
        vy = 0.44 * vt * k
        white = '#f4f4f4'
        if sid == 'cavity':
            cb.text('PONG', white, Lb * 0.5, vy + 0.6, 3.8, weight=800, track=0.18)
            cb.text('i-Ish', S['accent'], Lb * 0.5 + 15, vy - 0.4, 2.4, weight=500)
            cb.text(num, fill, Lb - 9.5, 0.66 * vt * k, 5.0, weight=600, engrave=0.2)
        else:
            cb.text('BIG BIRDIE', white, Lb * 0.5 - 4, vy + 1.6, 3.0, weight=700, track=0.08)
            cb.text('OS', S['accent'], Lb * 0.5 + 18, vy + 0.2, 5.6, weight=800, italic=-0.2)
            cb.text('Callaweigh', white, Lb * 0.5 - 4, vy - 3.0, 1.9, weight=500, italic=-0.2)
            cb.text(num, S['accent'], Lb - 9, 0.7 * vt * k, 6.0, weight=800, engrave=0.15)
    else:  # wedge
        vy = 0.30 * vt * k
        name = {'tour': 'Vokay', 'cavity': 'PONG', 'gi': 'Callaweigh', 'black': 'TaylerMaid', 'persimmon': 'MacGREGGOR'}[sid]
        cb.text(name, fill, Lb * 0.44, vy, 3.4, weight=600, italic=-0.2 if sid in ('tour', 'gi') else 0, engrave=0.18)
        cb.text(S['wedge'], S['accent'], Lb * 0.44, vy + 6, 1.8, weight=600, track=0.12, engrave=0.1)
        cb.text(num, fill, Lb - 11, 0.66 * vt * k, 7.0, weight=600, engrave=0.25)
        cb.text(str(m['bounce']), S['accent'], Lb - 11, 0.66 * vt * k - 7.5, 3.2, weight=600, engrave=0.15)
    files = cb.save(base + '_back')
    o = P0 + X * (ub0 - 3 + (Lb + 6) / 2) + fu * ((vt + 4) / 2 - 2)
    regs = [R['BODY'], R['BADGE'], R['CAVITY']]
    out.append(plane(o, X, bv, bn, Lb + 6, (vt + 4) * k, files, region=regs, facing=0.2, paint_rough=0.5))

    # ── the colour code dot on the hosel (Pong) ──
    if S.get('dot'):
        ax = np.array(m['axis'])
        s = m['hoselTop'] - 13
        cd = Canvas(8, 8)
        cd.shape(lambda dr, px: dr.ellipse([1.6 * px, 1.6 * px, 6.4 * px, 6.4 * px], fill=255), S['dot'], engrave=0.15)
        out.append(plane(ax * s, X, np.array([0, 1, 0]), np.array([0, 0, 1.0]), 8, 8, cd.save(base + '_dot'),
                         region=[R['HOSEL']], facing=0.5, paint_rough=0.3))
    return out


def wood_stamps(sid, cid, head, base):
    S = SETS[sid]
    m = head.meta
    Fc, fu, no = np.array(m['faceCenter']), np.array(m['faceUp']), np.array(m['faceNormal'])
    x0, W, D, Fh, zc = m['x0'], m['W'], m['D'], m['Fh'], m['zc']
    fam = m['family']
    out = []
    # ── face ──
    if fam == 'persimmon':
        fw, fh = 64, 40
        c = Canvas(fw, fh, px=20)
        cx, cy = fw / 2, fh / 2
        rx, ry = 26, 15.5

        def ell(k, col):
            c.shape(lambda dr, px: dr.ellipse([(cx - rx - k) * px, (fh - cy - ry - k) * px, (cx + rx + k) * px, (fh - cy + ry + k) * px], fill=255), col)
        ell(1.6, '#111111')
        ell(1.0, '#f0ece2')
        ell(0.4, '#111111')
        ell(0.0, SETS[sid]['wood']['insert'][0])
        # scorelines across the insert, painted white
        for i in range(-3, 4):
            yv = cy + i * 3.8
            hw = rx * math.sqrt(max(0, 1 - ((yv - cy) / (ry + 0.1)) ** 2)) - 3.5
            if hw > 3:
                c.shape(lambda dr, px, yv=yv, hw=hw: dr.rounded_rectangle([(cx - hw) * px, (fh - yv - 0.45) * px, (cx + hw) * px, (fh - yv + 0.45) * px], radius=0.4 * px, fill=255), '#e8e4da', engrave=0.4)
        # four brass screws
        for sx, sy in [(-15, 9.5), (15, 9.5), (-15, -9.5), (15, -9.5)]:
            c.shape(lambda dr, px, sx=sx, sy=sy: dr.ellipse([(cx + sx - 1.9) * px, (fh - cy - sy - 1.9) * px, (cx + sx + 1.9) * px, (fh - cy - sy + 1.9) * px], fill=255), '#c9a44c', engrave=0.05)
            c.shape(lambda dr, px, sx=sx, sy=sy: dr.rectangle([(cx + sx - 1.5) * px, (fh - cy - sy - 0.22) * px, (cx + sx + 1.5) * px, (fh - cy - sy + 0.22) * px], fill=255), '#5a4520', engrave=0.3)
        c.text('EYE-O-MAGIC', '#c9a44c', cx, cy - ry - 2.6 + 0.0, 1.0, weight=600, track=0.3)
        files = c.save(base + '_face')
        out.append(plane(Fc, -X, fu, no, fw, fh, files, region=[R['FACE']], facing=0.6, paint_rough=0.25))  # read from in front
    else:
        fw, fh = W * 0.84, Fh * 0.86
        if fam == 'driver':
            D2 = lines(fw, fh, 3.4, 0.32, px=20) * 0.12
        else:
            D2 = lines(fw, fh, 3.3, 0.62, px=20) * 0.28
        H2, W2 = D2.shape
        yy, xx = np.mgrid[0:H2, 0:W2] / 20.0
        # scorelines only in the middle of the face, ends rounded off
        ex = np.clip(1 - ((xx - fw / 2) / (fw * (0.31 if fam == 'driver' else 0.29))) ** 8, 0, 1)
        ey = np.clip(1 - ((yy - fh / 2) / (fh * 0.38)) ** 8, 0, 1)
        D2 *= (ex * ey)
        A = np.zeros((H2, W2, 4), np.float32)
        A[..., 3] = (np.clip(1 - ((xx - fw / 2) / (fw * 0.42)) ** 6, 0, 1) * np.clip(1 - ((yy - fh / 2) / (fh * 0.47)) ** 6, 0, 1))
        files = save_rgba(A, base + '_face')
        files.update(save_depth(D2, base + '_face'))
        out.append(plane(Fc, X, fu, no, fw, fh, files, region=[R['FACE']], facing=0.6, rough=0.48, keep=True))

    # ── sole: brand, model, loft / club number ──
    su, sv, sn = -X, np.array([0, 0, -1.0]), np.array([0, -1.0, 0])
    sw, sh = W * 0.9, D * 0.9
    cs = Canvas(sw, sh)
    num = LABEL[cid]
    white = '#efefef'
    if fam == 'persimmon':
        # engraved into the brass plate, black fill; the number on the heel side
        cs.text('MacGREGGOR', '#1a1a1a', sw * 0.5, sh * 0.52, 3.6, weight=700, track=0.08, engrave=0.25)
        cs.text('TOURNEY', '#1a1a1a', sw * 0.5, sh * 0.40, 2.2, weight=600, track=0.35, engrave=0.2)
        cs.text({'DR9': '1', 'DR': '1', 'DR12': '1', '3W': '3', '5W': '4', '7W': '5', '3H': '7', '4H': '9'}[cid], '#1a1a1a', sw * 0.5, sh * 0.70, 5.5, weight=600, engrave=0.3)
        for (px_, py_) in [(0.5, 0.86), (0.3, 0.25), (0.7, 0.25)]:
            cx_, cy_ = sw * px_, sh * py_
            cs.shape(lambda dr, px, cx_=cx_, cy_=cy_: dr.ellipse([(cx_ - 2.4) * px, (sh - cy_ - 2.4) * px, (cx_ + 2.4) * px, (sh - cy_ + 2.4) * px], fill=255), '#b08d3c', engrave=0.05)
            cs.shape(lambda dr, px, cx_=cx_, cy_=cy_: dr.rectangle([(cx_ - 2.0) * px, (sh - cy_ - 0.28) * px, (cx_ + 2.0) * px, (sh - cy_ + 0.28) * px], fill=255), '#3a2a10', engrave=0.4)
        regs = [R['PLATE']]
    else:
        model = S[fam]
        if sid == 'tour':
            cs.text('Titlewest', white, sw * 0.5, sh * 0.55, 5.2, weight=560, italic=-0.22)
            cs.text(model, S['accent'], sw * 0.5, sh * 0.42, 2.8, weight=650, track=0.15)
        elif sid == 'cavity':
            cs.text('PONG', white, sw * 0.5, sh * 0.55, 5.6, weight=800, track=0.2)
            cs.text(model, S['accent'], sw * 0.5, sh * 0.43, 2.6, weight=600, track=0.12)
        elif sid == 'gi':
            cs.text('Callaweigh', white, sw * 0.5, sh * 0.56, 4.6, weight=600, italic=-0.22)
            cs.text(model, S['accent'], sw * 0.5, sh * 0.44, 3.0, weight=800, track=0.06, italic=-0.15)
        else:
            cs.text('TaylerMaid', white, sw * 0.5, sh * 0.56, 4.8, weight=700)
            cs.text(model, S['accent'], sw * 0.5, sh * 0.44, 2.8, weight=700, track=0.3)
        cs.text(num, white, sw * 0.80, sh * 0.30, 5.0 if len(num) <= 2 else 3.4, weight=600)
        regs = [R['SOLE'], R['SKIRT']]
    files = cs.save(base + '_sole')
    so = np.array([x0 + W * 0.5, 0, zc + D * 0.5])
    out.append(plane(so, su, sv, sn, sw, sh, files, region=regs, facing=0.35, paint_rough=0.4))

    # ── crown: alignment aid / chevron / vintage decal ──
    cc = Canvas(40, 30)
    cu, cv = 20, 15
    if fam == 'persimmon':
        cc.text('MacGREGGOR', '#c9a44c', cu, 8, 1.8, weight=700, track=0.1)
        co = np.array([Fc[0], 0, zc + D * 0.70])
        regs = [R['WOOD']]
    else:
        co = np.array([Fc[0], 0, zc + 9])
        regs = [R['CROWN']]
        if sid == 'tour':
            cc.shape(lambda dr, px: dr.polygon([(cu * px, (30 - cv - 2.2) * px), ((cu - 1.7) * px, (30 - cv + 1.4) * px), ((cu + 1.7) * px, (30 - cv + 1.4) * px)], fill=255), '#9a9ca0')
        elif sid == 'gi':
            for k, cl in ((0, '#7d8288'),):
                cc.shape(lambda dr, px: dr.line([((cu - 5) * px, (30 - cv + 2) * px), (cu * px, (30 - cv - 2) * px), ((cu + 5) * px, (30 - cv + 2) * px)], fill=255, width=int(1.1 * px)), cl)
        elif sid == 'black':
            cc.shape(lambda dr, px: dr.rounded_rectangle([(cu - 0.4) * px, (30 - cv - 4) * px, (cu + 0.4) * px, (30 - cv + 4) * px], radius=0.4 * px, fill=255), '#d8d8d8')
    files = cc.save(base + '_crown')
    if files:
        out.append(plane(co, X, np.array([0, 0, -1.0]), np.array([0, 1.0, 0]), 40, 30, files, region=regs, facing=0.5, paint_rough=0.2))

    # ── the hosel: adjustable sleeve ticks, or persimmon whipping ──
    ax = np.array(m['axis'])
    ref = np.array([0, 0, 1.0])
    if fam == 'persimmon':
        r = 7.5
        hh = 32
        cw = Canvas(2 * math.pi * r, hh, px=20)
        H3, W3 = cw.depth.shape
        yy, xx = np.mgrid[0:H3, 0:W3] / 20.0
        ph = (yy + xx * 0.02) % 0.55
        cw.depth = (np.clip(1 - np.abs(ph - 0.275) / 0.275, 0, 1) ** 0.6 * 0.12).astype(np.float32)
        files = cw.save(base + '_whip')
        out.append(cyl(ax * (m['hoselTop'] - 15), ax, ref, r, hh, files, region=[R['WHIP']]))
    else:
        r = 7.0
        hh = 20
        cw = Canvas(2 * math.pi * r, hh, px=20)
        circ = 2 * math.pi * r
        for i, t in enumerate(['STD', '+1', 'D', '-1', 'L']):
            uu = circ * (0.5 + (i - 2) * 0.09)
            cw.text(t, '#e8e8e8', uu, hh * 0.35, 1.3, weight=600)
            cw.shape(lambda dr, px, uu=uu: dr.rectangle([(uu - 0.15) * px, (hh * 0.55) * px, (uu + 0.15) * px, (hh * 0.75) * px], fill=255), '#e8e8e8')
        files = cw.save(base + '_sleeve')
        out.append(cyl(ax * (m['hoselTop'] - 12), ax, ref, r, hh, files, region=[R['SLEEVE']], paint_rough=0.4))
    return out


def hockey_stamps(head, base):
    m = head.meta
    # overlapping turns of friction tape: a ridge every ~22 mm, on the diagonal
    c = Canvas(330, 90, px=8)
    H, W = c.depth.shape
    yy, xx = np.mgrid[0:H, 0:W] / 8.0
    t = (xx + yy * 0.45) % 22.0
    c.depth = (np.clip(1 - np.abs(t - 0.6) / 0.6, 0, 1) * 0.35 + 0.05 * (np.sin(xx * 9) * np.sin(yy * 9) > 0)).astype(np.float32)
    files = c.save(base + '_tape')
    return [plane(np.array([160.0, 40, 0]), X, np.array([0, 1.0, 0]), np.array([0, 0, -1.0]), 330, 90, files,
                  region=[R['TAPE']], facing=-2)]


def stamps_for(sid, cid, head, base):
    fam = head.meta['family']
    if fam == 'hockey':
        return hockey_stamps(head, base)
    if fam == 'iron':
        return iron_stamps(sid, cid, head, base)
    return wood_stamps(sid, cid, head, base)
