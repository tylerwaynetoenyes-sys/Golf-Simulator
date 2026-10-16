# Signed-distance modelling for the equipment: fields are numpy functions of
# an (N, 3) array of points in millimetres, negative inside. A head is built
# by combining a few of them (smooth unions and intersections give the fillets
# and rounded edges a casting has), then meshed with marching cubes.
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage.measure import marching_cubes


def smin(a, b, k):
    """Smooth union (polynomial), blend radius about k."""
    if k <= 0:
        return np.minimum(a, b)
    h = np.maximum(k - np.abs(a - b), 0) / k
    return np.minimum(a, b) - h * h * k * 0.25


def smax(a, b, k):
    """Smooth intersection."""
    return -smin(-a, -b, k)


def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def catmull(points, n=400, closed=True):
    """A smooth closed (or open) curve through control points."""
    P = np.asarray(points, float)
    m = len(P)
    out = []
    segs = m if closed else m - 1
    per = max(4, n // segs)
    for i in range(segs):
        p0, p1 = P[(i - 1) % m if closed else max(i - 1, 0)], P[i]
        p2 = P[(i + 1) % m] if closed else P[min(i + 1, m - 1)]
        p3 = P[(i + 2) % m] if closed else P[min(i + 2, m - 1)]
        for t in np.linspace(0, 1, per, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    if not closed:
        out.append(P[-1])
    return np.array(out)


class Shape2D:
    """
    A 2D signed distance (mm) from a closed outline, rasterised at `res`
    pixels per mm and sampled bilinearly; outside the raster it falls back
    to the distance from the raster's box.
    """

    def __init__(self, outline, res=10, pad=20.0):
        pts = np.asarray(outline, float)
        self.lo = pts.min(0) - pad
        hi = pts.max(0) + pad
        self.res = res
        w, h = np.ceil((hi - self.lo) * res).astype(int) + 1
        img = Image.new('L', (int(w), int(h)), 0)
        q = (pts - self.lo) * res
        ImageDraw.Draw(img).polygon([tuple(p) for p in q], fill=255)
        inside = np.asarray(img).T > 127  # [ix, iy]
        din = ndimage.distance_transform_edt(inside)
        dout = ndimage.distance_transform_edt(~inside)
        d = (dout - din) / res
        d[inside] += 0.5 / res
        # the EDT is exact only to the pixel: smooth its ripples, which would
        # otherwise print as fine ridges on every surface it shapes
        self.d = ndimage.gaussian_filter(d, 2.0).astype(np.float32)
        self.shape = self.d.shape

    def __call__(self, u, v):
        iu = (u - self.lo[0]) * self.res
        iv = (v - self.lo[1]) * self.res
        cu = np.clip(iu, 0, self.shape[0] - 1)
        cv = np.clip(iv, 0, self.shape[1] - 1)
        d = ndimage.map_coordinates(self.d, [cu, cv], order=1, mode='nearest')
        # outside the raster: add how far past its edge we are
        ex = np.hypot(iu - cu, iv - cv) / self.res
        return d + ex


def capsule(P, a, b, r):
    a, b = np.asarray(a, float), np.asarray(b, float)
    pa = P - a
    ba = b - a
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1)
    return np.linalg.norm(pa - h[:, None] * ba, axis=1) - r


def tube(P, origin, axis, s0, s1, r0, r1, round_=0.6):
    """A capped tapered cylinder along `axis` (unit) from s0 to s1, radius r0 → r1."""
    axis = np.asarray(axis, float)
    q = P - np.asarray(origin, float)
    s = q @ axis
    rad = np.linalg.norm(q - s[:, None] * axis, axis=1)
    t = np.clip((s - s0) / (s1 - s0), 0, 1)
    R = r0 + (r1 - r0) * t
    d_r = rad - R
    d_s = np.maximum(s0 - s, s - s1)
    return smax(d_r, d_s, round_)


def rbox2(u, v, cu, cv, hw, hh, r):
    """Rounded rectangle in 2D."""
    qx = np.abs(u - cu) - hw + r
    qy = np.abs(v - cv) - hh + r
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r


def mesh_sdf(field, lo, hi, h, chunk=24):
    """Evaluate `field` on a grid (spacing h mm) and mesh its zero set."""
    lo = np.asarray(lo, float)
    hi = np.asarray(hi, float)
    n = np.ceil((hi - lo) / h).astype(int) + 1
    xs = lo[0] + np.arange(n[0]) * h
    ys = lo[1] + np.arange(n[1]) * h
    zs = lo[2] + np.arange(n[2]) * h
    vol = np.empty(n, np.float32)
    Y, Z = np.meshgrid(ys, zs, indexing='ij')
    Y = Y.ravel().astype(np.float32)
    Z = Z.ravel().astype(np.float32)
    for i in range(0, n[0], chunk):
        xi = xs[i:i + chunk]
        P = np.empty((len(xi) * len(Y), 3), np.float32)
        P[:, 0] = np.repeat(xi, len(Y))
        P[:, 1] = np.tile(Y, len(xi))
        P[:, 2] = np.tile(Z, len(xi))
        vol[i:i + len(xi)] = field(P).reshape(len(xi), n[1], n[2])
    # close the volume so the mesh is watertight
    vol[0], vol[-1], vol[:, 0], vol[:, -1], vol[:, :, 0], vol[:, :, -1] = (np.abs(vol).max(),) * 6
    verts, faces, normals, _ = marching_cubes(vol, 0.0, spacing=(h, h, h), gradient_direction='ascent')
    verts += lo
    # skimage winds these inward for an inside-negative field: flip to outward
    return verts.astype(np.float32), faces[:, ::-1].astype(np.int32).copy(), normals.astype(np.float32)


def field_normals(field, P, e=0.05):
    """Outward normals of a field at points (central differences)."""
    g = np.zeros_like(P)
    for k in range(3):
        d = np.zeros(3, np.float32)
        d[k] = e
        g[:, k] = field(P + d) - field(P - d)
    return g / np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)


def volume_cc(verts, faces):
    v0, v1, v2 = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
    return abs(np.einsum('ij,ij->i', v0, np.cross(v1, v2)).sum() / 6.0) / 1000.0
