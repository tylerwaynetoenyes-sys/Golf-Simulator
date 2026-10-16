# Shafts and grips for each set: lathe profiles (metres, tip at 0) and their
# textures. tools/blender/shafts.py turns them into <set>/shafts.glb.
#
#  - steel: stepped, after the True Temper Dynamic Gold pattern: a parallel
#    0.370" (irons) or 0.335" (woods) tip, ten steps of ~0.017" about 1.5"
#    apart, then a taper to the 0.600" butt.
#  - graphite: a smooth taper from the same tips to the 0.600" butt.
#  - grips: 10.5" (267 mm), 0.90" over the cap, ~0.78" at the bottom.
#  - the hockey stick: a 1.25" x 0.75" wooden shaft, its top taped.
# Shafts are authored 1 m long and stretched to each club in the game; the
# texture spends most of its rows on the label zone just below the grip.
import json
import math
import os
import sys
import numpy as np
from PIL import Image
from stamps import text_mask

BUTT = 7.62  # mm radius (0.600")
LABEL = (0.40, 0.62)  # m along the authored shaft
TEXW, TEXH = 256, 1024


def v_of(s):
    """Texture v (0 tip .. 1 butt) for a position s (m) along the authored shaft."""
    a, b = LABEL
    return np.interp(s, [0, a, b, 1.0], [0, 0.1, 0.9, 1.0])


def steel_profile(tip):
    pts = [(0.0, tip), (0.10, tip)]
    r = tip
    for k in range(10):
        s = 0.10 + 0.038 * k
        pts += [(s - 0.0007, r), (s + 0.0007, r + 0.215)]
        r += 0.215
        pts.append((s + 0.019, r))
    for s in np.linspace(0.49, 1.0, 12):
        pts.append((s, r + (BUTT - r) * ((s - 0.48) / 0.52) ** 1.2))
    return pts


def graphite_profile(tip):
    return [(s, tip + (BUTT - tip) * (1 - (1 - min(s / 0.94, 1)) ** 1.7)) for s in np.linspace(0, 1, 26)]


def grip_profile():
    # (s from the grip's bottom in m, outer radius mm); closes over the cap
    pts = [(0.0, 8.0), (0.004, 9.6), (0.02, 9.5)]
    for s in np.linspace(0.04, 0.245, 10):
        pts.append((s, 9.5 + 1.75 * ((s - 0.04) / 0.205) ** 1.1))
    pts += [(0.256, 11.4), (0.262, 11.6), (0.266, 11.3), (0.2685, 10.0), (0.2697, 7.0), (0.2702, 0.0)]
    return pts


def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255


class Tex:
    """A base-colour + roughness/metal texture over (u around, v along)."""

    def __init__(self, W, H, color, rough, metal):
        self.W, self.H = W, H
        self.rgb = np.ones((H, W, 3), np.float32) * hexrgb(color)
        self.rough = np.full((H, W), rough, np.float32)
        self.metal = np.full((H, W), metal, np.float32)
        self.height = np.zeros((H, W), np.float32)

    def region(self, u0, u1, v0, v1):
        """Pixel slices for u (0..1) and v (0..1, v=0 at the tip/bottom)."""
        r0, r1 = int((1 - v1) * self.H), int((1 - v0) * self.H)
        c0, c1 = int(u0 * self.W), int(u1 * self.W)
        return slice(r0, r1), slice(c0, c1)

    def fill(self, u0, u1, v0, v1, color, rough=None, metal=None):
        rs, cs = self.region(u0, u1, v0, v1)
        self.rgb[rs, cs] = hexrgb(color)
        if rough is not None:
            self.rough[rs, cs] = rough
        if metal is not None:
            self.metal[rs, cs] = metal

    def text_along(self, txt, color, u_c, v0, v1, cap_frac, weight=600, track=0.1, italic=0.0, rough=None, metal=None):
        """
        Text reading along the shaft (tip toward butt), centred at u_c and in
        v0..v1; its height is cap_frac of the circumference. `self.circ` (mm
        around) and `self.rpm` (texture rows per mm along, in this zone) keep
        the letters' true proportions on the stretched mapping.
        """
        m = text_mask(txt, 4.0, weight, track, italic)
        Lpx, Hpx = m.size
        cols = max(2, int(cap_frac * self.W))
        h_mm = cap_frac * self.circ
        rows = int(Lpx / Hpx * h_mm * self.rpm)
        rs, cs = self.region(0, 1, v0, v1)
        zone = rs.stop - rs.start
        if rows > zone:
            cols = max(2, int(cols * zone / rows))
            rows = zone
        m = m.rotate(90, expand=True).resize((cols, max(2, rows)), Image.LANCZOS)
        a = np.asarray(m, np.float32) / 255
        r0 = rs.start + (zone - a.shape[0]) // 2
        c0 = int(u_c * self.W - a.shape[1] / 2)
        sub = (slice(r0, r0 + a.shape[0]), slice(c0, c0 + a.shape[1]))
        A = a[..., None]
        self.rgb[sub] = self.rgb[sub] * (1 - A) + hexrgb(color) * A
        if rough is not None:
            self.rough[sub] = self.rough[sub] * (1 - a) + rough * a
        if metal is not None:
            self.metal[sub] = self.metal[sub] * (1 - a) + metal * a

    def save(self, base, normal_strength=0.0):
        Image.fromarray((np.clip(self.rgb, 0, 1) * 255).astype(np.uint8)).save(base + '_base.png')
        orm = np.dstack([np.ones_like(self.rough), self.rough, self.metal])
        Image.fromarray((np.clip(orm, 0, 1) * 255).astype(np.uint8)).save(base + '_orm.png')
        out = dict(base=base + '_base.png', orm=base + '_orm.png')
        if normal_strength:
            h = self.height
            gy, gx = np.gradient(h)
            n = np.dstack([-gx * normal_strength, gy * normal_strength, np.ones_like(h)])
            n /= np.linalg.norm(n, axis=2, keepdims=True)
            Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(base + '_nrm.png')
            out['nrm'] = base + '_nrm.png'
        return out


# ── per set ──
SHAFTS = {
    'tour': dict(wood=('graphite', '#11141c', 0.22, 'VENT-LESS', 'BLUE 6 S', '#2f6fe0'),
                 iron=('steel', '#d6d9dd', 0.12, 'Dynamic Gilt', 'S300', '#c9a24a'),
                 grip=('rubber', '#1b1b1c', 'GOLF PRUDE', 'TOUR VELVEETA', '#f2f2f2')),
    'cavity': dict(wood=('graphite', '#2b2d31', 0.3, 'PONG', 'ALTA-ISH CB 55', '#ff7a1a'),
                   iron=('steel', '#d6d9dd', 0.12, 'PONG AWT-ISH', '2.0', '#1f4fd1'),
                   grip=('rubber', '#3a3d42', 'PONG', '360-ISH', '#4f8ff7')),
    'gi': dict(wood=('graphite', '#9ea2a8', 0.25, 'BIG BIRDIE', '50 · R', '#d2232a'),
               iron=('graphite', '#2a2c30', 0.3, 'RECOIL-ISH', '65 F2', '#d2232a'),
               grip=('rubber', '#1b1b1c', 'Callaweigh', 'MAX GRIP', '#d2232a')),
    'black': dict(wood=('graphite', '#0d0d0f', 0.28, 'FUJIKURIOUS', 'VENTLESS BLACK 6 X', '#e0282e'),
                  iron=('steel_black', '#2b2c30', 0.28, 'KBS-ISH TOUR', 'BLACK 120', '#e8e8e8'),
                  grip=('rubber', '#121213', 'GOLF PRUDE', 'MCC-ISH', '#9a9a9a')),
    'persimmon': dict(wood=('steel', '#d6d9dd', 0.12, 'TRUE TEMPO', 'DYNAMIC · S', '#c9a24a'),
                      iron=('steel', '#d6d9dd', 0.12, 'TRUE TEMPO', 'DYNAMIC · S', '#c9a24a'),
                      grip=('leather', '#3b2416', 'MacGREGGOR', '', '#c9a24a')),
}


def shaft_tex(kind, color, rough, name, sub, accent, base):
    metal = 1.0 if kind.startswith('steel') else 0.0
    t = Tex(TEXW, TEXH, color, rough, metal)
    t.circ = 2 * math.pi * 6.3
    t.rpm = 0.8 * TEXH / ((LABEL[1] - LABEL[0]) * 1000)
    if kind.startswith('steel'):
        # a wrap-around label below the grip: dark band, the name in the accent
        t.fill(0.30, 0.70, 0.30, 0.82, '#141414' if kind == 'steel' else '#e8e8e8', rough=0.35, metal=0.0)
        fg = '#e8e8e8' if kind == 'steel' else '#141414'
        t.text_along(name, accent if kind == 'steel' else '#141414', 0.5, 0.34, 0.66, 0.16, weight=700)
        t.text_along(sub, fg, 0.5, 0.67, 0.80, 0.10, weight=600)
        # brushed steel: a hint of streaking along the length
        n = np.random.default_rng(1).normal(0, 1, (1, TEXW)).repeat(TEXH, 0)
        t.rgb *= (1 + 0.015 * n)[..., None]
    else:
        # graphite: gloss paint, the name long down the shaft, a coloured band at the tip of the label
        t.fill(0.0, 1.0, 0.16, 0.19, accent, rough=0.25)
        t.text_along(name, accent, 0.5, 0.22, 0.70, 0.20, weight=800, track=0.12)
        t.text_along(sub, '#e8e8e8', 0.5, 0.72, 0.88, 0.11, weight=600)
        t.fill(0.0, 1.0, 0.0, 0.012, '#0b0b0b', rough=0.3)
    return t.save(base)


def grip_tex(kind, color, name, sub, accent, base):
    W, H = 384, 1536  # 63 mm around x 270 mm
    t = Tex(W, H, color, 0.85, 0.0)
    t.circ, t.rpm = 63.0, H / 270.0
    yy, xx = np.mgrid[0:H, 0:W]
    umm = xx / W * 63.0
    vmm = (H - yy) / H * 270.0
    if kind == 'rubber':
        # a velvet-style texture: a fine raised diamond lattice, 1.6 mm pitch
        a = ((umm + vmm) / 1.6) % 1
        b = ((umm - vmm) / 1.6) % 1
        h = np.minimum(np.minimum(a, 1 - a), np.minimum(b, 1 - b))
        t.height = np.clip(h * 6, 0, 1).astype(np.float32) * 0.6
        # a smooth band with the logo down the top of the grip
        band = (np.abs(umm - 31.5) < 6.5) & (vmm > 40) & (vmm < 230)
        t.height[band] = 0.6
        t.text_along(name, accent, 0.5, 0.20, 0.62, 0.13, weight=800, track=0.12)
        if sub:
            t.text_along(sub, accent, 0.5, 0.64, 0.84, 0.06, weight=600, track=0.2)
        # the cap end and the bottom collar are smooth
        t.height[vmm > 255] = 0.6
        t.height[vmm < 6] = 0.6
        t.rgb *= (0.96 + 0.08 * t.height / 0.6)[..., None]  # the pads catch the light, the channels hold dirt
        return t.save(base, normal_strength=3.0)
    # leather: a spiral wrap, 22 mm per turn, its edge overlapping the last turn, perforated
    ph = ((vmm + umm * (22.0 / 63.0)) / 22.0) % 1
    t.height = (ph * 0.8 + np.where(ph > 0.93, (1 - ph) * 8, 0)).astype(np.float32)
    perf = ((np.abs(ph - 0.45) < 0.02) & ((umm % 3.0) < 0.9))
    t.height[perf] -= 0.6
    rng = np.random.default_rng(3)
    grain = 1 + 0.05 * rng.normal(0, 1, (H, W))
    t.rgb *= (grain * (0.9 + 0.1 * ph))[..., None]
    t.rough = (0.6 + 0.1 * rng.random((H, W))).astype(np.float32)
    # the black rubber cap and collar of an old leather grip
    cap = vmm > 258
    t.rgb[cap] = hexrgb('#101010')
    t.rgb[vmm < 8] = hexrgb('#101010')
    t.height[cap | (vmm < 8)] = 0.4
    t.text_along(name, accent, 0.5, 0.88, 0.95, 0.04, weight=700)
    return t.save(base, normal_strength=4.0)


def hockey_tex(base):
    # the shaft: light wood, its grain running the length, the name printed down it
    t = Tex(256, 1024, '#c79c66', 0.55, 0.0)
    t.circ, t.rpm = 102.0, 1024 / 1000.0
    rng = np.random.default_rng(4)
    g = np.cumsum(rng.normal(0, 1, 256))
    g = (g - g.min()) / (np.ptp(g) + 1e-6)
    t.rgb *= (0.88 + 0.2 * np.sin(g * 40)[None, :, None] * 0.5)
    t.text_along('HAPPY GILMOUR', '#141414', 0.25, 0.25, 0.75, 0.30, weight=800, track=0.1)
    t.text_along('HAPPY GILMOUR', '#141414', 0.75, 0.25, 0.75, 0.30, weight=800, track=0.1)
    a = t.save(base + '_hshaft')
    # the knob: white tape wound round the top
    g2 = Tex(256, 1024, '#efefea', 0.8, 0.0)
    yy, xx = np.mgrid[0:1024, 0:256]
    ph = ((1024 - yy) / 1024 * 270 / 19.0 + xx / 256 * 0.6) % 1
    g2.height = (ph * 0.6 + np.where(ph > 0.92, (1 - ph) * 6, 0)).astype(np.float32)
    g2.rgb *= (0.97 + 0.03 * ph)[..., None]
    b = g2.save(base + '_hgrip', normal_strength=3.0)
    return a, b


if __name__ == '__main__':
    out = sys.argv[1]
    for sid, S in SHAFTS.items():
        d = os.path.join(out, sid)
        os.makedirs(d, exist_ok=True)
        spec = {}
        for part in ('wood', 'iron'):
            kind, color, rough, name, sub, accent = S[part]
            tip = 4.25 if part == 'wood' else 4.70
            prof = steel_profile(tip) if kind.startswith('steel') else graphite_profile(tip)
            spec['shaft_' + part] = dict(profile=prof, tex=shaft_tex(kind, color, rough, name, sub, accent, os.path.join(d, 'shaft_' + part)))
        kind, color, name, sub, accent = S['grip']
        spec['grip'] = dict(profile=grip_profile(), tex=grip_tex(kind, color, name, sub, accent, os.path.join(d, 'grip')))
        json.dump(spec, open(os.path.join(d, 'shafts.json'), 'w'), indent=1, default=float)
        print(sid, 'ok')
    d = os.path.join(out, 'hockey')
    os.makedirs(d, exist_ok=True)
    a, b = hockey_tex(os.path.join(d, 'h'))
    json.dump(dict(hshaft=dict(rect=[32.0, 19.0, 3.5], tex=a), hgrip=dict(rect=[34.0, 21.0, 4.5], knob=True, tex=b)),
              open(os.path.join(d, 'shafts.json'), 'w'), indent=1)
    print('hockey ok')
