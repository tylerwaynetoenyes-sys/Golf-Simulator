# Decals and engravings ("stamps"): wordmarks, numbers, grooves, scorelines,
# milling. Each is an image laid on the head by a planar (or cylindrical)
# projection in the high-poly material, then baked down with everything else.
#   RGBA image: paint colour and coverage (alpha)
#   L image: engraving depth, 1 = `depth` mm deep
# Text is set in Jost (assets/fonts, SIL OFL).
import os
import tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
WOFF = os.path.join(HERE, '..', '..', 'assets', 'fonts', 'jost-latin-wght.woff2')
_ttf = None
PX = 24  # pixels per mm for text stamps


def font(size_px, weight=500):
    global _ttf
    if _ttf is None:
        from fontTools.ttLib import TTFont
        f = TTFont(WOFF)
        f.flavor = None
        _ttf = os.path.join(tempfile.gettempdir(), 'fairway-jost.ttf')
        f.save(_ttf)
    ft = ImageFont.truetype(_ttf, int(size_px))
    ft.set_variation_by_axes([weight])
    return ft


def text_mask(txt, cap_mm, weight=500, track=0.0, italic=0.0, px=PX):
    """White-on-black text, cap height `cap_mm`, tracking in em, italic as shear."""
    size = cap_mm * px / 0.7  # Jost caps are ~0.7 em
    ft = font(size, weight)
    # lay out glyph by glyph for tracking
    widths = [ft.getlength(c) for c in txt]
    total = sum(widths) + track * size * (len(txt) - 1)
    pad = int(size * 0.4 + abs(italic) * size)
    W, H = int(total + 2 * pad), int(size * 1.5 + 2 * pad)
    img = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(img)
    x = pad
    for c, w in zip(txt, widths):
        d.text((x, pad), c, font=ft, fill=255)
        x += w + track * size
    if italic:
        img = img.transform(img.size, Image.AFFINE, (1, -italic, italic * H * 0.75, 0, 1, 0), resample=Image.BICUBIC)
    bb = img.getbbox()
    return img.crop(bb) if bb else img


class Canvas:
    """A stamp being composed, w x h mm, with a colour layer and a depth layer."""

    def __init__(self, w_mm, h_mm, px=PX):
        self.w, self.h, self.px = w_mm, h_mm, px
        self.W, self.H = max(8, int(w_mm * px)), max(8, int(h_mm * px))
        self.rgba = np.zeros((self.H, self.W, 4), np.float32)
        self.depth = np.zeros((self.H, self.W), np.float32)

    def _place(self, mask, cx_mm, cy_mm, h_mm=None, w_mm=None, rot=0):
        m = mask
        if rot:
            m = m.rotate(rot, expand=True, resample=Image.BICUBIC)
        if h_mm:
            s = h_mm * self.px / m.size[1]
        elif w_mm:
            s = w_mm * self.px / m.size[0]
        else:
            s = 1.0
        m = m.resize((max(1, int(m.size[0] * s)), max(1, int(m.size[1] * s))), Image.LANCZOS)
        a = np.asarray(m, np.float32) / 255
        x0 = int(cx_mm * self.px - a.shape[1] / 2)
        y0 = int((self.h - cy_mm) * self.px - a.shape[0] / 2)  # cy up from the bottom
        out = np.zeros((self.H, self.W), np.float32)
        ys, xs = slice(max(0, y0), min(self.H, y0 + a.shape[0])), slice(max(0, x0), min(self.W, x0 + a.shape[1]))
        out[ys, xs] = a[ys.start - y0:ys.stop - y0, xs.start - x0:xs.stop - x0]
        return out

    def paint(self, mask, color, cx, cy, h=None, w=None, rot=0, engrave=0.0):
        """Paint a mask (PIL L image) in `color` (sRGB hex), optionally engraved too."""
        a = self._place(mask, cx, cy, h, w, rot) if isinstance(mask, Image.Image) else mask
        if color is not None:
            c = np.array([int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)], np.float32)
            self.rgba[..., :3] = self.rgba[..., :3] * (1 - a[..., None]) + c * a[..., None]
            self.rgba[..., 3] = np.maximum(self.rgba[..., 3], a)
        if engrave:
            self.depth = np.maximum(self.depth, a * engrave)
        return a

    def text(self, txt, color, cx, cy, cap, weight=500, track=0.0, italic=0.0, engrave=0.0, w=None, rot=0):
        m = text_mask(txt, cap, weight, track, italic)
        # scale by cap height: the mask's height is ~ cap (plus descenders); keep proportions
        hm = m.size[1] / (cap * PX / 1.0)
        return self.paint(m, color, cx, cy, h=None if w else cap * hm, w=w, rot=rot, engrave=engrave)

    def shape(self, draw_fn, color, engrave=0.0):
        """draw_fn(ImageDraw, px) draws white on a full-size L image (y down, in px)."""
        img = Image.new('L', (self.W, self.H), 0)
        draw_fn(ImageDraw.Draw(img), self.px)
        a = np.asarray(img, np.float32) / 255
        return self.paint(a, color, 0, 0, engrave=engrave)

    def save(self, base):
        """Writes base.png (colour) and base_h.png (depth); returns which exist."""
        out = {}
        if self.rgba[..., 3].max() > 0:
            Image.fromarray((np.clip(self.rgba, 0, 1) * 255).astype(np.uint8), 'RGBA').save(base + '.png')
            out['img'] = base + '.png'
        if self.depth.max() > 0:
            dmax = float(self.depth.max())
            Image.fromarray((self.depth / dmax * 255).astype(np.uint8), 'L').save(base + '_h.png')
            out['hgt'] = base + '_h.png'
            out['depth'] = dmax
        return out


def grooves(w_mm, h_mm, n, pitch, width=0.85, depth=0.45, inset=1.2, px=20, taper=None, end_r=True):
    """
    Face grooves to the USGA rule (<= 0.889 mm wide, <= 0.508 mm deep), as a
    depth map: U-section with rounded edges and rounded ends. Row i runs
    across the full width (or taper(i) -> (u0, u1) in mm).
    """
    W, H = int(w_mm * px), int(h_mm * px)
    u = (np.arange(W) + 0.5) / px
    v = (np.arange(H) + 0.5) / px
    U, V = np.meshgrid(u, v[::-1])
    D = np.zeros((H, W), np.float32)
    for i in range(n):
        vc = inset + i * pitch
        u0, u1 = taper(i) if taper else (0.8, w_mm - 0.8)
        dv = np.abs(V - vc) / (width / 2)
        prof = np.clip(1 - dv ** 4, 0, 1)  # flat-bottomed U with a radius at the edges
        if end_r:
            du = np.minimum(U - u0, u1 - U) / (width / 2)
            prof = prof * np.clip(du, 0, 1) ** 0.5 * (U > u0) * (U < u1)
        D = np.maximum(D, prof)
    return D * depth


def lines(w_mm, h_mm, pitch, width, px=20, mask=None):
    """Fine horizontal lines (driver face scorelines, laser etch)."""
    W, H = int(w_mm * px), int(h_mm * px)
    v = (np.arange(H) + 0.5) / px
    d = np.abs(((v[::-1] + pitch / 2) % pitch) - pitch / 2)
    L = np.clip(1 - d / (width / 2), 0, 1)[:, None] * np.ones((1, W), np.float32)
    if mask is not None:
        L *= mask
    return L.astype(np.float32)


def save_depth(D, base):
    dmax = float(D.max()) or 1.0
    Image.fromarray((D / dmax * 255).astype(np.uint8), 'L').save(base + '_h.png')
    return dict(hgt=base + '_h.png', depth=dmax)


def save_rgba(A, base):
    Image.fromarray((np.clip(A, 0, 1) * 255).astype(np.uint8), 'RGBA').save(base + '.png')
    return dict(img=base + '.png')
