# Golf balls: 1.68" (42.67 mm) diameter, with real dimple layouts.
# Dimples sit on the vertices of a geodesic subdivision of an icosahedron
# (10n²+2 points: 362 at n=6, 252 at n=5) or an octahedron (4n²+2: 326 at
# n=9), turned so a 3-fold axis is the pole, with a dimple-free parting line
# on the equator where the mould halves meet. Each dimple is a spherical cap
# with a rounded lip, sized to its neighbours (so a layout has two or three
# sizes, as real balls do), ~0.2-0.3 mm deep.
import math
import numpy as np
from heads import R
from stamps import Canvas
from scipy.spatial import cKDTree

RADIUS = 21.335  # mm


def geodesic(base, n):
    """Vertices of a frequency-n geodesic sphere on a polyhedron (verts, faces)."""
    V, F = base
    pts = []
    for a, b, c in F:
        A, B, C = V[a], V[b], V[c]
        for i in range(n + 1):
            for j in range(n + 1 - i):
                k = n - i - j
                p = (A * i + B * j + C * k) / n
                pts.append(p / np.linalg.norm(p))
    P = np.array(pts)
    # dedupe shared edge points
    keys = np.round(P * 1e6).astype(np.int64)
    _, idx = np.unique(keys, axis=0, return_index=True)
    return P[np.sort(idx)]


def icosahedron():
    t = (1 + 5 ** 0.5) / 2
    V = np.array([[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
                  [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]], float)
    V /= np.linalg.norm(V, axis=1, keepdims=True)
    F = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
         (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    # a vertex at each pole (y)
    z = V[0]
    rot = rot_to(z, np.array([0, 1.0, 0]))
    return V @ rot.T, F


def octahedron():
    V = np.array([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], float)
    F = [(0, 2, 4), (4, 2, 1), (1, 2, 5), (5, 2, 0), (0, 4, 3), (4, 1, 3), (1, 5, 3), (5, 0, 3)]
    return V, F


def rot_to(a, b):
    a, b = a / np.linalg.norm(a), b / np.linalg.norm(b)
    v = np.cross(a, b)
    c = a @ b
    if np.linalg.norm(v) < 1e-9:
        return np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K / (1 + c)


def seam(P, axis, gap=0.012):
    """
    Turn a layout so `axis` is the pole and clear a parting line on the
    equator: dimples that would straddle it move off it (alternately up and
    down for those right on it), as the two halves of a mould require.
    """
    P = P @ rot_to(axis / np.linalg.norm(axis), np.array([0, 1.0, 0])).T
    nn = cKDTree(P).query(P, k=2)[0][:, 1]
    r = nn * 0.46
    y = P[:, 1].copy()
    on = np.abs(y) < 1e-6
    lon = np.arctan2(P[:, 2], P[:, 0])
    sgn = np.where(on, np.where((np.round(lon / (2 * np.pi) * on.sum()).astype(int) % 2) == 0, 1, -1), np.sign(y))
    need = np.abs(y) < r + gap
    y[need] = sgn[need] * np.maximum(np.abs(y[need]), r[need] + gap)
    P[:, 1] = y
    xz = np.sqrt(np.clip(1 - y * y, 0, 1)) / np.maximum(np.hypot(P[:, 0], P[:, 2]), 1e-9)
    P[:, 0] *= xz
    P[:, 2] *= xz
    # relax the crowding that leaves: neighbours closer than the layout's
    # spacing push apart, every dimple staying on its own side of the seam
    med = np.median(nn)
    hemi = np.sign(P[:, 1])
    for _ in range(60):
        t = cKDTree(P)
        pairs = t.query_pairs(med * 1.05, output_type='ndarray')
        if len(pairs) == 0:
            break
        d = P[pairs[:, 0]] - P[pairs[:, 1]]
        L = np.linalg.norm(d, axis=1, keepdims=True)
        f = d / np.maximum(L, 1e-9) * (med * 1.05 - L) * 0.25
        F = np.zeros_like(P)
        np.add.at(F, pairs[:, 0], f)
        np.add.at(F, pairs[:, 1], -f)
        P += F
        P /= np.linalg.norm(P, axis=1, keepdims=True)
        lim = med * 0.46 + gap
        bad = hemi * P[:, 1] < lim
        P[bad, 1] = hemi[bad] * lim
        P /= np.linalg.norm(P, axis=1, keepdims=True)
    return P


def layout(kind):
    """Dimple centres (unit vectors) for a named layout."""
    V, F = icosahedron()
    if kind == 'icosa362':
        # a 3-fold axis through a face centre as the poles: only six dimples lie on the seam
        return seam(geodesic((V, F), 6), V[0] + V[11] + V[5])
    if kind == 'icosa252':
        return seam(geodesic((V, F), 5), V[0] + V[11] + V[5])
    if kind == 'octa326':
        Vo, Fo = octahedron()
        return seam(geodesic((Vo, Fo), 9), Vo[0] + Vo[2] + Vo[4])
    raise ValueError(kind)


BALLS = {
    # id: layout, depth (mm), coverage (dimple radius as a share of half the neighbour spacing), finish
    'tour': dict(layout='icosa362', depth=0.26, cover=0.93, color='#f7f6f2', rough=0.30, coat=0.05),
    'tourx': dict(layout='icosa362', depth=0.28, cover=0.92, color='#f6f6f3', rough=0.30, coat=0.05),
    'softur': dict(layout='octa326', depth=0.25, cover=0.94, color='#f8f7f3', rough=0.32, coat=0.06),
    'distance': dict(layout='octa326', depth=0.22, cover=0.90, color='#f5f5f2', rough=0.24, coat=0.0),
    'soft': dict(layout='icosa252', depth=0.24, cover=0.92, color='#e6ea47', rough=0.62, coat=0.0),
    'range': dict(layout='octa326', depth=0.21, cover=0.88, color='#f2f1ec', rough=0.36, coat=0.0, stripe='#d2232a'),
    'limited': dict(layout='icosa252', depth=0.17, cover=0.82, color='#f2e23a', rough=0.42, coat=0.0, stripe='#151515'),
}

PRINT = {
    'tour': ('Titlewest', 'Pro V-Neck 1', '1', '#141414', '#141414'),
    'tourx': ('Titlewest', 'Pro V-Neck 1x', '1', '#141414', '#c8102e'),
    'softur': ('Bridgetone', 'TOUR B-ISH', '2', '#141414', '#1f4fd1'),
    'distance': ('Top Fright', 'XL DISTANCE-ISH', '3', '#141414', '#e86a10'),
    'soft': ('Callaweigh', 'Supersofty', '4', '#141414', '#d2232a'),
    'range': ('RANGE', 'PRACTICE', '', '#d2232a', '#d2232a'),
    'limited': ('LIMITED', 'FLIGHT', '', '#151515', '#151515'),
}


def sphere_mesh(n=180):
    """A geodesic sphere (icosahedral, frequency n) as verts, faces."""
    V0, F0 = icosahedron()
    verts, faces, index = [], [], {}

    def vid(key, p):
        if key not in index:
            index[key] = len(verts)
            verts.append(p / np.linalg.norm(p))
        return index[key]
    for a, b, c in F0:
        A, B, C = V0[a], V0[b], V0[c]
        grid = {}
        for i in range(n + 1):
            for j in range(n + 1 - i):
                k = n - i - j
                p = (A * i + B * j + C * k) / n
                key = tuple(np.round(p / np.linalg.norm(p) * 1e7).astype(np.int64))
                grid[(i, j)] = vid(key, p)
        for i in range(n):
            for j in range(n - i):
                faces.append((grid[(i, j)], grid[(i + 1, j)], grid[(i, j + 1)]))
                if i + j < n - 1:
                    faces.append((grid[(i + 1, j)], grid[(i + 1, j + 1)], grid[(i, j + 1)]))
    V = np.array(verts)
    F = np.array(faces, np.int32)
    # outward winding
    c = V[F].mean(1)
    nrm = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    flip = (nrm * c).sum(1) < 0
    F[flip] = F[flip][:, ::-1]
    return V, F


def ball(bid, n=200):
    cfg = BALLS[bid]
    D = layout(cfg['layout'])
    tree = cKDTree(D)
    dd, _ = tree.query(D, k=2)
    nn = dd[:, 1]  # chord to the nearest neighbour (unit sphere)
    rad = nn * 0.5 * cfg['cover']  # dimple radius (chord, unit sphere)
    V, F = sphere_mesh(n)
    # depth at each vertex: deepest dimple covering it (spherical cap with a rounded lip)
    dist, idx = tree.query(V, k=3)
    h = np.zeros(len(V))
    for k in range(3):
        r = rad[idx[:, k]]
        t = np.clip(dist[:, k] / r, 0, 1)
        prof = np.where(t < 0.82, 1 - (t / 1.0) ** 2, (1 - 0.82 ** 2) * (1 - (t - 0.82) / 0.18) ** 2)
        prof = np.where(t >= 1, 0, prof)
        h = np.maximum(h, prof)
    depth = cfg['depth']
    Vm = V * (RADIUS - depth * h)[:, None]
    # vertex normals
    fn = np.cross(Vm[F[:, 1]] - Vm[F[:, 0]], Vm[F[:, 2]] - Vm[F[:, 0]])
    N = np.zeros_like(Vm)
    for k in range(3):
        np.add.at(N, F[:, k], fn)
    N /= np.linalg.norm(N, axis=1, keepdims=True)
    # finish
    col = np.tile(lin(cfg['color']), (len(V), 1))
    if cfg.get('stripe'):
        band = np.abs(V[:, 1]) < (1.6 / RADIUS)
        col[band] = lin(cfg['stripe'])
    rough = np.full(len(V), cfg['rough'])
    metal = np.zeros(len(V))
    return Vm.astype(np.float32), F, N.astype(np.float32), col, rough, metal, len(D)


def lin(hexc):
    c = np.array([int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def ball_stamps(bid, base):
    brand, model, num, c1, c2 = PRINT[bid]
    out = []
    # side 1: wordmark and model, printed around the -z side (the side that faces the camera behind the ball)
    c = Canvas(30, 16, px=40)
    if bid in ('range', 'limited'):
        c.text(brand, c1, 15, 10.0, 2.8, weight=800, track=0.18)
        c.text(model, c2, 15, 5.6, 1.6, weight=700, track=0.3)
    else:
        it = -0.2 if brand in ('Titlewest', 'Callaweigh') else 0.0
        c.text(brand, c1, 15, 9.6, 2.6, weight=600 if it else 700, italic=it)
        c.text(model, c2, 15, 5.4, 1.35, weight=650, track=0.12)
    f1 = c.save(base + '_side1')
    oy = 7.5 if bid in ('range', 'limited') else 0.0  # range prints sit clear of the stripe
    out.append(dict(mode='plane', o=[0, oy, 0], u=[-1, 0, 0], v=[0, 1, 0], n=[0, 0, -1], w=30, h=16, region=None, facing=0.35,
                    rough=None, metal=None, keep=False, paintRough=0.4, **f1))
    if num:
        c = Canvas(14, 14, px=40)
        c.text(num, c2, 7, 7, 4.6, weight=600)
        f2 = c.save(base + '_num')
        out.append(dict(mode='plane', o=[0, 0, 0], u=[0, 0, -1], v=[0, 1, 0], n=[1, 0, 0], w=14, h=14, region=None, facing=0.45,
                        rough=None, metal=None, keep=False, paintRough=0.4, **f2))
    # side 2: an alignment line with the model, opposite the logo
    c = Canvas(34, 10, px=40)
    if bid not in ('range', 'limited'):
        c.shape(lambda dr, px: dr.rectangle([2 * px, 4.6 * px, 32 * px, 5.4 * px], fill=255), c1)
        c.text(model.upper(), c1, 17, 7.2, 1.2, weight=600, track=0.2)
        f3 = c.save(base + '_line')
        out.append(dict(mode='plane', o=[0, 0, 0], u=[1, 0, 0], v=[0, 1, 0], n=[0, 0, 1], w=34, h=10, region=None, facing=0.3,
                        rough=None, metal=None, keep=False, paintRough=0.4, **f3))
    return out
