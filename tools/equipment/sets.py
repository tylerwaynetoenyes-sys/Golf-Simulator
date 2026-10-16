# The six branded sets (js/data/equipment.js SETS): finishes per region and
# the stamps each head carries. The brands are parodies; nothing here is a
# real maker's logo or wordmark.
import math
import numpy as np
from heads import R, wood_head, iron_head, hockey_head
from stamps import Canvas, grooves, lines, save_depth, save_rgba, text_mask

# club id → (kind, loft, lie): lofts and lies match js/scene/club.js SPEC
SPEC = {
    'DR9': ('driver', 9, 58), 'DR': ('driver', 10.5, 58), 'DR12': ('driver', 12, 58.5),
    '3W': ('fairway', 15, 58.5), '5W': ('fairway', 18, 59), '7W': ('fairway', 21, 59.5),
    '3H': ('hybrid', 19, 59.5), '4H': ('hybrid', 22, 60),
    '3I': ('iron', 20, 60.5), '4I': ('iron', 22, 61), '5I': ('iron', 24, 61.5), '6I': ('iron', 27, 62),
    '7I': ('iron', 31, 62.5), '8I': ('iron', 35, 63), '9I': ('iron', 39, 63.5),
    'PW': ('iron', 45, 64), 'GW': ('wedge', 50, 64), 'SW': ('wedge', 56, 64), 'LW': ('wedge', 60, 64),
}
IRON_N = {'3I': 3, '4I': 4, '5I': 5, '6I': 6, '7I': 7, '8I': 8, '9I': 9, 'PW': 10}
LABEL = {'3I': '3', '4I': '4', '5I': '5', '6I': '6', '7I': '7', '8I': '8', '9I': '9', 'PW': 'P', 'GW': '50', 'SW': '56', 'LW': '60',
         '3W': '3', '5W': '5', '7W': '7', '3H': '3H', '4H': '4H', 'DR9': '9°', 'DR': '10.5°', 'DR12': '12°'}


def M(hexc, rough, metal):
    return (hexc, rough, metal)


CHROME = M('#d4d7dc', 0.10, 1.0)
SATIN = M('#bcc0c6', 0.34, 1.0)
PVD = M('#2b2c30', 0.28, 1.0)
FERRULE = M('#0c0c0d', 0.22, 0.0)

SETS = {
    'tour': dict(
        brand='Titlewest', model='Pro V-Neck MB', iron='blade', metal=CHROME, accent='#c8102e', fill='#111111',
        wood=dict(crown=M('#0e0f11', 0.10, 0.0), skirt=M('#4b4e54', 0.26, 1.0), sole=M('#6a6d73', 0.24, 1.0),
                  face=M('#8c8f94', 0.40, 1.0), sleeve=M('#18191c', 0.34, 0.6), weight=M('#cfd2d6', 0.18, 1.0),
                  port=M('#141415', 0.5, 0.0)),
        driver='TS-Eh', fairway='TS-Eh', hybrid='TS-Eh', wedge='Vokay SM-Eh', band='#c8102e',
        ports={'driver': [(0.52, 0.12, 6.5), (0.5, 0.86, 6.5)], 'fairway': [(0.5, 0.78, 5.5)], 'hybrid': []},
    ),
    'cavity': dict(
        brand='PONG', model='i-Ish CB', iron='cavity', metal=SATIN, accent='#ff7a1a', fill='#111111', dot='#1f4fd1',
        badge=M('#1d1f23', 0.38, 0.4),
        wood=dict(crown=M('#121315', 0.46, 0.0), skirt=M('#3a3d42', 0.32, 1.0), sole=M('#474a50', 0.30, 1.0),
                  face=M('#6f7378', 0.42, 1.0), sleeve=M('#18191c', 0.34, 0.6), weight=M('#b8bcc2', 0.25, 1.0),
                  port=M('#141415', 0.5, 0.0), turb=M('#2e3034', 0.4, 0.2)),
        driver='G-Whizz', fairway='G-Whizz', hybrid='G-Whizz', wedge='Glide-ish', band='#1f4fd1', turbulators=6,
        ports={'driver': [(0.5, 0.88, 6.0)], 'fairway': [(0.5, 0.8, 5.0)], 'hybrid': []},
    ),
    'gi': dict(
        brand='Callaweigh', model='Big Birdie OS', iron='gi', metal=SATIN, accent='#d2232a', fill='#111111',
        badge=M('#141518', 0.35, 0.3),
        wood=dict(crown=M('#23262b', 0.22, 0.55), skirt=M('#9a9ea4', 0.28, 1.0), sole=M('#b2b6bc', 0.26, 1.0),
                  face=M('#9da1a6', 0.40, 1.0), sleeve=M('#18191c', 0.34, 0.6), weight=M('#cfd2d6', 0.2, 1.0),
                  port=M('#141415', 0.5, 0.0)),
        driver='BIG BIRDIE MAX', fairway='BIG BIRDIE', hybrid='BIG BIRDIE', wedge='Mac Daddy-O', band='#d2232a',
        ports={'driver': [(0.5, 0.9, 8.0)], 'fairway': [(0.5, 0.82, 6.0)], 'hybrid': [(0.5, 0.78, 5.0)]},
    ),
    'black': dict(
        brand='TaylerMaid', model='Stealthy Black', iron='blade', metal=PVD, accent='#e0282e', fill='#f2f2f2',
        wood=dict(crown=M('#121315', 0.24, 0.0), skirt=M('#1b1c1f', 0.3, 0.8), sole=M('#202125', 0.30, 0.8),
                  face=M('#6a0f14', 0.30, 0.0), sleeve=M('#18191c', 0.34, 0.6), weight=M('#2a2b2e', 0.3, 1.0),
                  port=M('#c41f26', 0.35, 0.0)),
        driver='STEALTHY', fairway='STEALTHY', hybrid='STEALTHY', wedge='MG-ish', band='#e0282e',
        carbon_crown=True, carbon_face=True, slot=True,
        ports={'driver': [(0.5, 0.86, 6.0)], 'fairway': [], 'hybrid': []},
    ),
    'persimmon': dict(
        brand='MacGREGGOR', model='Tourney 1975', iron='blade', metal=CHROME, accent='#b5121b', fill='#111111',
        wood=dict(wood=M('#4a200f', 0.14, 0.0), plate=M('#c7a24a', 0.26, 1.0), insert=M('#7e0d11', 0.25, 0.0),
                  whip=M('#0b0b0b', 0.45, 0.0)),
        driver='TOURNEY', fairway='TOURNEY', hybrid='TOURNEY', wedge='TOURNEY', band='#b5121b', persimmon=True,
        ports={},
    ),
}


def lin(hexc):
    c = np.array([int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def make_head(sid, cid):
    if sid == 'hockey':
        return hockey_head()
    S = SETS[sid]
    kind, loft, lie = SPEC[cid]
    if kind in ('driver', 'fairway', 'hybrid'):
        fam = 'persimmon' if S.get('persimmon') else kind
        opts = {'ports': S['ports'].get(kind, []), 'turbulators': S.get('turbulators', 0) if kind == 'driver' else 0,
                'slot': S.get('slot', False) and kind in ('driver', 'fairway')}
        if fam == 'persimmon' and kind != 'driver':
            # persimmon fairways ("spoon", "baffy") were small, shallow versions of the driver
            k = {'fairway': 0.9, 'hybrid': 0.84}[kind]
            opts['dims'] = dict(W=93 * k, D=74 * k, Fh=43.5 * (0.82 if kind == 'fairway' else 0.78), Hb=31 * k * 0.85, hTop=80)
        if kind == 'driver' and sid == 'gi':
            opts['dims'] = dict(W=119, D=112, Fh=56, Hb=29)  # max: longer heel-toe and deeper, a touch shallower face
        if kind == 'driver' and sid == 'tour':
            opts['dims'] = dict(W=115, D=104, Fh=59.5, Hb=31)  # a deeper-faced, more compact tour head
        return wood_head(cid, loft, lie, fam, opts)
    if kind == 'wedge':
        return iron_head(cid, loft, lie, 'wedge', 11, {'grind': {50: 0, 56: 2.0, 60: 3.2}.get(loft, 0)})
    style = S['iron']
    opts = {}
    if style in ('cavity', 'gi'):
        n = IRON_N[cid]
        p = (n - 3) / 7
        vt = (49 + 6 * p) if style == 'cavity' else (52 + 6 * p)
        Lb = (77 + 2 * p) if style == 'cavity' else (81 + 2 * p)
        opts['badge'] = (3 + Lb * 0.5, 0.44 * vt, Lb * (0.27 if style == 'cavity' else 0.3), 5.5 if style == 'cavity' else 7.5)
    return iron_head(cid, loft, lie, style, IRON_N[cid], opts)


# ───────────── per-vertex finish ─────────────

def carbon(u, v, tow=2.6):
    """2x2 twill: which tow is on top, with a little shading across each tow."""
    iu, iv = np.floor(u / tow), np.floor(v / tow)
    over = ((iu + iv) // 2) % 2
    fu, fv = (u / tow) % 1, (v / tow) % 1
    shade = np.where(over > 0, np.sin(fv * math.pi), np.sin(fu * math.pi))
    return over, shade


def finish(sid, head, V, N, reg):
    """Base colour (linear), roughness and metalness per vertex."""
    S = SETS[sid] if sid != 'hockey' else None
    n = len(V)
    col = np.zeros((n, 3))
    rough = np.zeros(n)
    metal = np.zeros(n)

    def put(mask, m):
        col[mask] = lin(m[0])
        rough[mask] = m[1]
        metal[mask] = m[2]

    fam = head.meta['family']
    if sid == 'hockey':
        put(np.ones(n, bool), M('#c49a64', 0.55, 0.0))
        # straight grain along the shaft
        a = np.array(head.meta['axis'])
        s = V @ a
        g = 0.5 + 0.5 * np.sin(V[:, 2] * 1.7 + np.sin(s * 0.05) * 2.0)
        col *= (0.85 + 0.25 * g)[:, None]
        tape = reg == R['TAPE']
        put(tape, M('#121212', 0.82, 0.0))
        return col, rough, metal
    if fam == 'iron':
        put(np.ones(n, bool), S['metal'])
        if head.meta['style'] in ('cavity', 'gi'):
            put(reg == R['BADGE'], S['badge'])
            cav = reg == R['CAVITY']
            put(cav, (S['metal'][0], min(0.6, S['metal'][1] + 0.2), 1.0))
        put(reg == R['FERRULE'], FERRULE)
        put(reg == R['BAND'], M(S['band'], 0.3, 0.0))
        return col, rough, metal
    W = S['wood']
    if fam == 'persimmon':
        put(np.ones(n, bool), W['wood'])
        # persimmon: a fine, nearly straight grain running heel to toe, with
        # the odd darker streak, under a deep varnish
        x, y, z = V[:, 0], V[:, 1], V[:, 2]
        w = y * 0.9 + z * 0.35 + 1.4 * np.sin(x * 0.045 + 0.6) + 0.5 * np.sin(x * 0.13 + z * 0.05)
        fine = 0.5 + 0.5 * np.sin(w * 2 * np.pi / 0.9)
        streak = np.clip(np.sin(w * 2 * np.pi / 7.3 + np.sin(x * 0.07) * 0.8), 0, 1) ** 6
        k = 0.92 + 0.10 * fine - 0.22 * streak
        col *= k[:, None]
        # darker toward the toe and heel, as old finishes are
        put(reg == R['PLATE'], W['plate'])
        put(reg == R['WHIP'], W['whip'])
        put(reg == R['FERRULE'], FERRULE)
        put(reg == R['BAND'], M(S['band'], 0.3, 0.0))
        put(reg == R['FACE'], (W['wood'][0], 0.2, 0.0))
        face = reg == R['FACE']
        col[face] *= 0.9
        return col, rough, metal
    put(np.ones(n, bool), W['skirt'])
    put(reg == R['CROWN'], W['crown'])
    put(reg == R['SOLE'], W['sole'])
    put(reg == R['FACE'], W['face'])
    put(reg == R['SLEEVE'], W['sleeve'])
    put(reg == R['HOSEL'], W['skirt'])
    put(reg == R['PORT'], W['port'])
    put(reg == R['WEIGHT'], W['weight'])
    if 'turb' in W:
        put(reg == R['TURB'], W['turb'])
    put(reg == R['FERRULE'], FERRULE)
    put(reg == R['BAND'], M(S['band'], 0.3, 0.0))
    if S.get('carbon_crown'):
        m = reg == R['CROWN']
        over, sh = carbon(V[m, 0] + V[m, 2], V[m, 0] - V[m, 2])
        c = np.where(over[:, None] > 0, lin('#1a1b1e'), lin('#0d0e10'))
        col[m] = c * (0.7 + 0.5 * sh[:, None])
        rough[m] = 0.2
    if S.get('carbon_face'):
        m = reg == R['FACE']
        over, sh = carbon(V[m, 0] * 0.9 + V[m, 1] * 0.5, V[m, 1] * 0.9 - V[m, 0] * 0.5, 2.2)
        col[m] = lin('#6a0f14') * (0.75 + 0.35 * sh[:, None]) * np.where(over[:, None] > 0, 1.0, 0.8)
    return col, rough, metal
