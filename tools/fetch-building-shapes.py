#!/usr/bin/env python3
"""Measure every building round a course from the USGS 3DEP LiDAR point cloud
and colour its roof from the USGS/NAIP aerial photograph (both public domain).

    python tools/fetch-building-shapes.py <courseId> --project <3DEP work unit> [--cell 0.75]

Needs assets/courses/<id>/buildings.json (tools/fetch-buildings.mjs: the OSM
footprints). For each footprint:

1. Height: the LiDAR returns inside it (ASPRS class 6 "building" where the
   flight is classified that way, otherwise the unclassified first returns,
   never vegetation or noise), against the bare ground (class 2) in a ring
   2-6 m outside it. h = the ridge (98th percentile), e = the eaves (8th).
   Returns more than 3 m above the roof's median that are green in the aerial
   photograph are trees over the roof, left out and filled from the roof round
   them (where there is no photograph, more than 6 m above; on a house-sized
   footprint, anything 7 m above its roof: dark cypress reads black, not green).
2. Shape: the roof itself, as a --cell metre height map over the footprint's
   box (decimetres above the ground; gaps filled from the nearest return, a
   3x3 median against chimneys and aerials). The game builds the walls up to
   it and the roof from it, so gables, hips, flat decks and towers come out
   as surveyed.
3. Colour: the median colour of the roof in the aerial photograph (the
   footprint shrunk 1 m, so lawns and drives at its edge don't count; tree
   crowns over the roof and deep shadow left out, and no colour at all when
   less than a third of the roof is clear), which
   the game uses to choose clay tile, shingle/slate or a pale flat roof and
   to tint it.

The point cloud is read from the public usgs-lidar-public bucket (Entwine
format, EPSG:3857), only the pieces over the buildings, nothing kept on disk.
Work units by location: github.com/hobuinc/usgs-lidar boundaries/resources.geojson
(Pebble Beach CA_FEMA_Z4_B1_2018, TPC Sawgrass FL_Peninsular_FDEM_StJohns_2018,
Rolling Hills IL_10CoNRCS_3_D23). Runs with numpy + scipy + laspy[lazrs] +
pyproj + pillow.
"""
import argparse
import io
import json
import math
import os
import sys
import urllib.parse
import urllib.request

import laspy
import numpy as np
from PIL import Image, ImageDraw
from pyproj import CRS, Transformer
from scipy import ndimage

R = 6378137.0
UA = 'Fairway-golf-importer/1.0 (+https://github.com/tylerwaynetoenyes-sys/Golf-Simulator)'
TNM = 'https://tnmaccess.nationalmap.gov/api/v1/products'
IMAGERY = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/export'

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('id')
ap.add_argument('--project', required=True, help='3DEP work unit in the public usgs-lidar-public EPT bucket (hobuinc/usgs-lidar boundaries)')
ap.add_argument('--cell', type=float, default=0.75, help='roof height-map cell, metres')
args = ap.parse_args()

D = os.path.join('assets/courses', args.id)
with open(os.path.join(D, 'buildings.json')) as f:
    data = json.load(f)
LAT, LON = data['lat'], data['lon']
M_LAT = math.pi / 180 * R
M_LON = M_LAT * math.cos(math.radians(LAT))
B = data['buildings']
polys = [np.array(b['p'], np.float64).reshape(-1, 2) for b in B]
allp = np.vstack(polys)
X0, Z0 = allp[:, 0].min() - 12, allp[:, 1].min() - 12
X1, Z1 = allp[:, 0].max() + 12, allp[:, 1].max() + 12
CELL = args.cell
NX, NZ = int(math.ceil((X1 - X0) / CELL)), int(math.ceil((Z1 - Z0) / CELL))
print(f'{args.id}: {len(B)} footprints over {X1 - X0:.0f} x {Z1 - Z0:.0f} m ({NX} x {NZ} cells)')


def get(url, timeout=90):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for i in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 (network: retry anything)
            if i == 3:
                raise
            print(f'  retry {url[:80]}... ({e})', file=sys.stderr)
    return None


def to_ll(x, z):
    return LON + x / M_LON, LAT - z / M_LAT


# ── the footprints as a label raster (0 = none, k+1 = building k) ──
lab_img = Image.new('I', (NX, NZ), 0)
dr = ImageDraw.Draw(lab_img)
for k, p in enumerate(polys):
    dr.polygon([((x - X0) / CELL, (z - Z0) / CELL) for x, z in p], fill=k + 1)
label = np.array(lab_img, np.int32)

# ── LiDAR: the roof (highest return) and the ground (lowest class 2) per cell ──
roof = np.full((NZ, NX), -1e9, np.float32)
gnd = np.full((NZ, NX), 1e9, np.float32)


EPT = 'https://s3-us-west-2.amazonaws.com/usgs-lidar-public'
to_merc = Transformer.from_crs('EPSG:4326', 'EPSG:3857', always_xy=True)
from_merc = Transformer.from_crs('EPSG:3857', 'EPSG:4326', always_xy=True)


def nodes(work):
    """The Entwine (EPT) nodes of a 3DEP work unit that touch the buildings' box, at every depth."""
    meta = json.loads(get(f'{EPT}/{work}/ept.json'))
    b = meta['bounds']
    lo0, la1 = to_ll(X0, Z0)
    lo1, la0 = to_ll(X1, Z1)
    (mx0, mx1), (my0, my1) = sorted(to_merc.transform([lo0, lo1], [la0, la1])[0]), sorted(to_merc.transform([lo0, lo1], [la0, la1])[1])
    out = []

    def walk(hier, key):
        d, x, y, zz = map(int, key.split('-'))
        size = (b[3] - b[0]) / (1 << d)
        nx0, ny0 = b[0] + x * size, b[1] + y * size
        if nx0 > mx1 or nx0 + size < mx0 or ny0 > my1 or ny0 + size < my0:
            return
        n = hier.get(key)
        if n is None:
            return
        if n == -1:
            hier = json.loads(get(f'{EPT}/{work}/ept-hierarchy/{key}.json'))
            n = hier.get(key, 0)
        if n > 0:
            out.append(key)
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    walk(hier, f'{d + 1}-{2 * x + dx}-{2 * y + dy}-{2 * zz + dz}')

    walk(json.loads(get(f'{EPT}/{work}/ept-hierarchy/0-0-0-0.json')), '0-0-0-0')
    return out


def read_node(work, key):
    raw = get(f'{EPT}/{work}/ept-data/{key}.laz', timeout=120)
    las = laspy.read(io.BytesIO(raw), laz_backend=laspy.LazBackend.LazrsParallel)
    return np.asarray(las.x), np.asarray(las.y), np.asarray(las.z), np.asarray(las.classification), np.asarray(las.return_number)


def accumulate(pts):
    mx, my, mz, cls, rn = pts
    has6 = bool((cls == 6).any())
    rf = (cls == 6) if has6 else ((rn == 1) & (cls == 1))
    gm = cls == 2
    use = rf | gm
    if not use.any():
        return 0, 0
    lon, lat = from_merc.transform(mx[use], my[use])
    x = (lon - LON) * M_LON
    z = -(lat - LAT) * M_LAT
    i = ((x - X0) / CELL).astype(np.int64)
    j = ((z - Z0) / CELL).astype(np.int64)
    ok = (i >= 0) & (i < NX) & (j >= 0) & (j < NZ)
    rf2, gm2 = rf[use][ok], gm[use][ok]
    k = (j * NX + i)[ok]
    y = mz[use][ok].astype(np.float32)
    np.maximum.at(roof.ravel(), k[rf2], y[rf2])
    np.minimum.at(gnd.ravel(), k[gm2], y[gm2])
    return int(rf2.sum()), int(gm2.sum())


from concurrent.futures import ThreadPoolExecutor
GRIDS = os.path.expanduser(f'~/.cache/fairway/shapes/{args.id}-{args.project}-{CELL:g}.npz')
if os.path.exists(GRIDS):
    _g = np.load(GRIDS)
    if _g['roof'].shape == roof.shape:
        roof[:], gnd[:] = _g['roof'], _g['gnd']
        print(f'  gridded returns from {GRIDS}')
keys = [] if (roof > -1e8).any() else nodes(args.project)
print(f'  {len(keys)} EPT nodes of {args.project} over the buildings')
nb = ng = 0
with ThreadPoolExecutor(8) as ex:
    for done, pts in enumerate(ex.map(lambda k: read_node(args.project, k), keys)):
        a, c = accumulate(pts)
        nb += a
        ng += c
        if done % 50 == 0:
            print(f'    {done}/{len(keys)} nodes, {nb} roof and {ng} ground returns so far')
print(f'  {nb} roof and {ng} ground returns in the area')
if keys:
    os.makedirs(os.path.dirname(GRIDS), exist_ok=True)
    np.savez_compressed(GRIDS, roof=roof, gnd=gnd)
used = [args.project]

# ── aerial photograph over the same area, in 0.5 m pieces of 1000 px ──
PIECE = 500.0
photo = np.zeros((NZ, NX, 3), np.uint8)
have = np.zeros((NZ, NX), bool)
for pz in np.arange(Z0, Z1, PIECE):
    for px in np.arange(X0, X1, PIECE):
        bx1, bz1 = min(px + PIECE, X1), min(pz + PIECE, Z1)
        # does any footprint touch this piece?
        if not label[int((pz - Z0) / CELL):int((bz1 - Z0) / CELL) + 1, int((px - X0) / CELL):int((bx1 - X0) / CELL) + 1].any():
            continue
        lo0, la1 = to_ll(px, pz)
        lo1, la0 = to_ll(bx1, bz1)
        w, h = int((bx1 - px) / CELL), int((bz1 - pz) / CELL)
        q = urllib.parse.urlencode({'bbox': f'{lo0},{la0},{lo1},{la1}', 'bboxSR': 4326, 'imageSR': 4326,
                                    'size': f'{w},{h}', 'format': 'jpg', 'f': 'image'})
        img = np.array(Image.open(io.BytesIO(get(f'{IMAGERY}?{q}'))).convert('RGB').resize((w, h)))
        i0, j0 = int(round((px - X0) / CELL)), int(round((pz - Z0) / CELL))
        hh, ww = min(h, NZ - j0), min(w, NX - i0)
        photo[j0:j0 + hh, i0:i0 + ww] = img[:hh, :ww]
        have[j0:j0 + hh, i0:i0 + ww] = True
print(f'  aerial photograph: {have.mean() * 100:.0f}% of the area')

# ── per building ──
roof_ok = roof > -1e8
gnd_ok = gnd < 1e8
objs = ndimage.find_objects(label)
measured = 0
for k, sl in enumerate(objs):
    b = B[k]
    for key in ('e', 'roof', 'c'):
        b.pop(key, None)
    if sl is None:
        continue
    pad = int(math.ceil(7 / CELL))
    js, is_ = slice(max(0, sl[0].start - pad), min(NZ, sl[0].stop + pad)), slice(max(0, sl[1].start - pad), min(NX, sl[1].stop + pad))
    m = label[js, is_] == k + 1
    if m.sum() < 4:
        continue
    # ground: the bare earth in a ring 2-6 m outside the walls
    ring = ndimage.binary_dilation(m, iterations=int(6 / CELL)) & ~ndimage.binary_dilation(m, iterations=max(1, int(2 / CELL)))
    g = gnd[js, is_][ring & gnd_ok[js, is_]]
    rv = roof[js, is_][m & roof_ok[js, is_]]
    if len(g) < 3 or len(rv) < max(4, 0.25 * m.sum()):
        continue
    g0 = float(np.median(g))
    hgt = rv - g0
    hgt = hgt[(hgt > 1.5) & (hgt < 120)]
    if len(hgt) < max(4, 0.2 * m.sum()):
        continue
    # trees over the roof (Monterey pines at Pebble): returns well above the roof's middle that are
    # green in the aerial photograph are canopy (a tower or a taller wing stays: it isn't green)
    med = float(np.median(hgt))
    j0, j1, i0, i1 = max(0, sl[0].start - 1), min(NZ, sl[0].stop + 1), max(0, sl[1].start - 1), min(NX, sl[1].stop + 1)
    ph = photo[j0:j1, i0:i1].astype(np.int16)
    green = (2 * ph[..., 1] - ph[..., 0] - ph[..., 2] > 14) & (ph[..., 1] > ph[..., 0]) & have[j0:j1, i0:i1]
    sub = roof[j0:j1, i0:i1] - g0
    house = m.sum() * CELL * CELL < 800  # a house has no tower 7 m above its roof (dark cypress isn't 'green' in the photo)
    canopy = (sub > med + 3.0) & (green | ~have[j0:j1, i0:i1] & (sub > med + 6.0)) | ((sub > med + 7.0) if house else False)
    fp = (label[j0:j1, i0:i1] == k + 1) & roof_ok[j0:j1, i0:i1] & (sub > 1.5) & (sub < 120) & ~canopy
    hgt = sub[fp]
    if len(hgt) < 4:
        continue
    ridge, eave = float(np.percentile(hgt, 98)), float(np.percentile(hgt, 8))
    # the roof height map over the footprint's box (plus one cell), gaps (and canopy) from the nearest roof return
    inside = fp
    _, (nj, ni) = ndimage.distance_transform_edt(~inside, return_indices=True)
    filled = sub[nj, ni]
    filled = ndimage.median_filter(filled, size=3)
    b['h'] = round(ridge, 1)
    b['e'] = round(max(2.2, eave), 1)
    b['roof'] = {'x': round(X0 + i0 * CELL, 2), 'z': round(Z0 + j0 * CELL, 2), 'c': CELL, 'w': int(i1 - i0),
              'd': [int(round(v * 10)) for v in np.clip(filled, 0, 120).ravel()]}
    # roof colour: the footprint shrunk a metre, in the photograph
    core = ndimage.binary_erosion(label[j0:j1, i0:i1] == k + 1, iterations=max(1, int(1 / CELL))) & have[j0:j1, i0:i1]
    if core.sum() < 3:
        core = (label[j0:j1, i0:i1] == k + 1) & have[j0:j1, i0:i1]
    if core.sum():
        px = photo[j0:j1, i0:i1][core].astype(np.float32)
        # leave out the trees over the roof (green dominant) and the deepest shadow
        r_, g_, b_ = px[:, 0], px[:, 1], px[:, 2]
        keep = ~((2 * g_ - r_ - b_ > 14) & (g_ > r_)) & (px.max(1) > 40)
        if keep.sum() >= max(3, 0.3 * len(px)):
            c = np.median(px[keep], axis=0)
            b['c'] = '#%02x%02x%02x' % tuple(int(v) for v in c)
    measured += 1

data['shapes'] = {'source': f'USGS 3DEP {args.project} (public domain); roof colour: USGS The National Map imagery (NAIP, public domain)',
                  'cell': CELL, 'tiles': used, 'measured': measured}
with open(os.path.join(D, 'buildings.json'), 'w') as f:
    json.dump(data, f, separators=(',', ':'))
hs = [b['h'] for b in B if b.get('roof')]
print(f'{args.id}: measured {measured} of {len(B)} buildings; ridge heights {min(hs):.1f}-{max(hs):.1f} m, median {np.median(hs):.1f} m' if hs else f'{args.id}: nothing measured')
