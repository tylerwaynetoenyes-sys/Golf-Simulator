#!/usr/bin/env python3
"""Plant a course's real trees from the USGS 3DEP LiDAR point cloud (public domain).

    python tools/fetch-trees.py <courseId> [--project IL_10CountyNRCS_D23 | --ept IL_10CoNRCS_3_D23]
                                [--cache ~/.cache/fairway/lpc] [--cell 0.5]
                                [--min-height 4] [--crs EPSG:3436]

Needs the course's 1 m bare-earth DEM first (tools/fetch-lidar.py); the tree
area is that grid (centre, size) from assets/courses/<id>/dem.json.

1. Asks the USGS TNM Access API for "Lidar Point Cloud (LPC)" tiles over the
   grid, keeps the --project flight and downloads its LAZ tiles into --cache
   (about 150 MB each; kept, so a rerun reads them from disk).
2. Projects the returns into the game frame (+x east, +z south, metres from
   the course centre) and takes their height above the bare-earth DEM. The
   highest vegetation return (ASPRS classes 4 and 5: the flight is classified,
   so roofs, wires and poles are left out) per --cell metres is the canopy
   height model (CHM).
3. Smooths the CHM and finds tree tops: local maxima at least --min-height
   tall, in a window that widens with height (big oaks have broad, lumpy
   crowns).
4. Measures each crown along eight rays (out to where the canopy falls away or
   climbs into the next tree) and calls it a conifer when the crown is narrow
   for its height, or compact and opaque in this leaf-off flight.

Writes assets/courses/<id>/trees.json:
  {"source", "tiles", "cell", "minHeight", "count",
   "trees": [[x, z, height, crownRadius, conifer], ...]}   metres, DEM frame

Runs with numpy + scipy + laspy[lazrs] + pyproj:
    uv venv /tmp/lidarenv && uv pip install -p /tmp/lidarenv numpy scipy "laspy[lazrs]" pyproj
"""
import argparse
import io
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

import laspy
import numpy as np
from pyproj import CRS, Transformer
from scipy import ndimage

R = 6378137.0
UA = 'Fairway-golf-importer/1.0 (+https://github.com/tylerwaynetoenyes-sys/Golf-Simulator)'
TNM = 'https://tnmaccess.nationalmap.gov/api/v1/products'
DATASET = 'Lidar Point Cloud (LPC)'

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('id')
ap.add_argument('--project', default='IL_10CountyNRCS_D23', help='3DEP point-cloud project to use')
ap.add_argument('--cache', default=os.path.expanduser('~/.cache/fairway/lpc'))
ap.add_argument('--cell', type=float, default=0.5, help='CHM cell size, metres')
ap.add_argument('--min-height', type=float, default=4.0, help='shortest tree kept, metres')
ap.add_argument('--fresh', action='store_true', help='re-read the tiles even if gridded returns are cached')
ap.add_argument('--ept', default=None, help='read the flight from this usgs-lidar-public EPT work unit (e.g. IL_10CoNRCS_3_D23) instead of the LAZ tiles')
ap.add_argument('--crs', default=None, help='override the tiles\' horizontal CRS (if a header lacks it)')
args = ap.parse_args()

D = os.path.join('assets/courses', args.id)
with open(os.path.join(D, 'dem.json')) as f:
    meta = json.load(f)
LAT, LON = meta['lat'], meta['lon']
HALF = meta['size'] / 2
M_LAT = math.pi / 180 * R
M_LON = M_LAT * math.cos(math.radians(LAT))


def get(url, timeout=60):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for i in range(8):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 (network: retry anything, backing off up to a minute)
            if i == 7:
                raise
            print(f'  retry {url[:80]}… ({e})', file=sys.stderr)
            time.sleep(min(60, 2 ** i))
    return None


def tiles():
    dlat, dlon = HALF / M_LAT, HALF / M_LON
    q = urllib.parse.urlencode({'datasets': DATASET, 'bbox': f'{LON - dlon},{LAT - dlat},{LON + dlon},{LAT + dlat}',
                                'max': 500, 'outputFormat': 'JSON'})
    out = []
    for it in json.loads(get(f'{TNM}?{q}'))['items']:
        url = it.get('downloadURL') or ''
        if url.endswith('.laz') and f'/Projects/{args.project}/' in url:
            out.append({'url': url, 'title': it['title'], 'bytes': it.get('sizeInBytes') or 0, 'date': it.get('publicationDate', '')})
    if not out:
        sys.exit(f'no {args.project} point-cloud tiles over {args.id}')
    return out


def download(t):
    os.makedirs(args.cache, exist_ok=True)
    path = os.path.join(args.cache, t['url'].rsplit('/', 1)[1])
    if os.path.exists(path) and (not t['bytes'] or os.path.getsize(path) == t['bytes']):
        return path
    print(f'  downloading {t["title"]} ({t["bytes"] / 1e6:.0f} MB)')
    tmp = path + '.part'
    req = urllib.request.Request(t['url'], headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=120) as r, open(tmp, 'wb') as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    os.replace(tmp, path)
    return path


# the bare-earth DEM, bilinear (as js/course/dem.js samples it)
dem_n, dem_step = meta['n'], meta['step']
dem = (meta['min'] + np.fromfile(os.path.join(D, 'dem.bin'), dtype='<u2').astype(np.float32) / 100).reshape(dem_n, dem_n)


def ground(x, z):
    fi = np.clip((x + HALF) / dem_step, 0, dem_n - 1.001)
    fj = np.clip((z + HALF) / dem_step, 0, dem_n - 1.001)
    i, j = fi.astype(np.int64), fj.astype(np.int64)
    u, v = fi - i, fj - j
    return (dem[j, i] * (1 - u) * (1 - v) + dem[j, i + 1] * u * (1 - v)
            + dem[j + 1, i] * (1 - u) * v + dem[j + 1, i + 1] * u * v)


CELL = args.cell
N = int(round(2 * HALF / CELL))
chm = np.zeros((N, N), np.float32)        # tallest vegetation return above the ground
n_first = np.zeros((N, N), np.uint16)     # pulses
n_high = np.zeros((N, N), np.uint16)      # pulses stopped above 2 m


def grid(x, z, y, cls, first):
    """Add returns (game-frame x, z; NAVD88 height y in metres) to the grids; returns first returns kept."""
    inside = (np.abs(x) < HALF - 1) & (np.abs(z) < HALF - 1)
    x, z, cls, first = x[inside], z[inside], cls[inside], first[inside]
    hag = y[inside] - ground(x, z)
    ci = ((x + HALF) / CELL).astype(np.int64)
    cj = ((z + HALF) / CELL).astype(np.int64)
    k = cj * N + ci
    veg = (cls == 4) | (cls == 5)
    np.maximum.at(chm.ravel(), k[veg], np.clip(hag[veg], 0, 60).astype(np.float32))
    for g_, m in ((n_first, first), (n_high, first & (hag > 2))):
        g = np.bincount(k[m], minlength=N * N).reshape(N, N)
        np.minimum(g_.astype(np.int64) + g, 65535, out=g)
        g_[:] = g
    return int(first.sum())


def accumulate(path):
    with laspy.open(path, laz_backend=laspy.LazBackend.LazrsParallel) as r:
        crs = CRS.from_user_input(args.crs) if args.crs else r.header.parse_crs()
        if crs is None:
            sys.exit(f'{path}: no CRS in the header; pass --crs')
        h2 = crs.sub_crs_list[0] if crs.is_compound else crs
        unit = h2.axis_info[0].unit_conversion_factor  # metres per horizontal unit
        vunit = crs.sub_crs_list[1].axis_info[0].unit_conversion_factor if crs.is_compound else unit
        tr = Transformer.from_crs(h2, 'EPSG:4326', always_xy=True)
        kept = 0
        for pts in r.chunk_iterator(4_000_000):
            cls = np.asarray(pts.classification)
            first = np.asarray(pts.return_number) == 1
            use = (first | (cls == 4) | (cls == 5)) & (cls != 7) & (cls != 18)
            lon, lat = tr.transform(np.asarray(pts.x[use]), np.asarray(pts.y[use]))
            kept += grid((lon - LON) * M_LON, -(lat - LAT) * M_LAT, np.asarray(pts.z[use], np.float64) * vunit, cls[use], first[use])
        return kept, crs.name, unit


# --ept: the same flight from the public usgs-lidar-public Entwine bucket
# (EPSG:3857, metres), read node by node over the grid: no tiles on disk, and
# quick when rockyweb.usgs.gov is slow
EPT = 'https://s3-us-west-2.amazonaws.com/usgs-lidar-public'


def ept_nodes(work):
    meta_ = json.loads(get(f'{EPT}/{work}/ept.json'))
    b = meta_['bounds']
    to_merc = Transformer.from_crs('EPSG:4326', 'EPSG:3857', always_xy=True)
    xs, ys = to_merc.transform([LON - HALF / M_LON, LON + HALF / M_LON], [LAT - HALF / M_LAT, LAT + HALF / M_LAT])
    mx0, mx1, my0, my1 = min(xs), max(xs), min(ys), max(ys)
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


def ept_read(work, key):
    las = laspy.read(io.BytesIO(get(f'{EPT}/{work}/ept-data/{key}.laz', timeout=120)), laz_backend=laspy.LazBackend.LazrsParallel)
    cls = np.asarray(las.classification)
    first = np.asarray(las.return_number) == 1
    use = (first | (cls == 4) | (cls == 5)) & (cls != 7) & (cls != 18)
    return np.asarray(las.x)[use], np.asarray(las.y)[use], np.asarray(las.z, np.float64)[use], cls[use], first[use]


# the gridded returns are kept beside the tiles, so tuning the steps below
# doesn't mean reading 2-3 GB of LAZ again
grids = os.path.join(args.cache, f'{args.id}-{args.ept or args.project}-{CELL:g}.npz')
if os.path.exists(grids) and not args.fresh:
    g = np.load(grids, allow_pickle=False)
    chm, n_first, n_high = g['chm'], g['n_first'], g['n_high']
    used = json.loads(str(g['used']))
    print(f'{args.id}: gridded returns from {grids}')
elif args.ept:
    from concurrent.futures import ThreadPoolExecutor
    keys = ept_nodes(args.ept)
    print(f'{args.id}: {len(keys)} EPT nodes of {args.ept} over {2 * HALF:g} m')
    from_merc = Transformer.from_crs('EPSG:3857', 'EPSG:4326', always_xy=True)
    kept = 0
    with ThreadPoolExecutor(8) as ex:
        for done, (mx, my, y, cls, first) in enumerate(ex.map(lambda k: ept_read(args.ept, k), keys)):
            lon, lat = from_merc.transform(mx, my)
            kept += grid((lon - LON) * M_LON, -(lat - LAT) * M_LAT, y, cls, first)
            if done % 200 == 0:
                print(f'    {done}/{len(keys)} nodes, {kept} first returns so far')
    used = [{'ept': args.ept, 'nodes': len(keys), 'firstReturns': kept}]
else:
    src = tiles()
    print(f'{args.id}: {len(src)} {args.project} tiles over {2 * HALF:g} m')
    used = []
    for t in src:
        path = download(t)
        kept, crs_name, unit = accumulate(path)
        print(f'  {t["title"]}: {kept} first returns in the course grid ({crs_name})')
        if kept:
            used.append({'tile': t['title'], 'published': t['date'], 'firstReturns': kept})
if not os.path.exists(grids) or args.fresh:
    np.savez_compressed(grids, chm=chm, n_first=n_first, n_high=n_high, used=json.dumps(used))

# tree tops: maxima of the smoothed CHM, in a window that grows with height
cs = ndimage.gaussian_filter(chm, sigma=1.0 / CELL)
tops = np.zeros_like(cs, dtype=bool)
for lo, hi, rad in ((0, 10, 2.0), (10, 18, 3.0), (18, 25, 4.0), (25, 99, 5.0)):
    k = int(round(rad / CELL))
    yy, xx = np.mgrid[-k:k + 1, -k:k + 1]
    peak = cs == ndimage.maximum_filter(cs, footprint=(xx * xx + yy * yy) <= k * k)
    tops |= peak & (cs >= max(lo, args.min_height)) & (cs < hi)
tj, ti = np.nonzero(tops)
h = cs[tj, ti]

# crown radius along eight rays: out until the canopy falls below 40% of the
# top (or 2 m), or rises 1 m above the lowest point passed (the next crown)
ang = np.arange(8) * math.pi / 4
steps = np.arange(1, int(14 / CELL) + 1)
ri = np.clip(np.rint(ti[:, None, None] + np.cos(ang)[None, :, None] * steps[None, None, :]), 0, N - 1).astype(np.int64)
rj = np.clip(np.rint(tj[:, None, None] + np.sin(ang)[None, :, None] * steps[None, None, :]), 0, N - 1).astype(np.int64)
prof = cs[rj, ri]
low = np.minimum.accumulate(prof, axis=2)
stop = (prof < np.maximum(2.0, 0.4 * h)[:, None, None]) | (prof > low + 1.0)
stop[:, :, -1] = True
reach = np.argmax(stop, axis=2) * CELL + CELL / 2
crown = np.clip(np.mean(reach, axis=1), 1.0, 0.45 * h + 2)

# conifers: narrow for their height, or a compact crown that stops nearly every
# pulse high up (evergreen needles in a leaf-off flight). Density alone doesn't
# separate them: dense bare oak woods stop ~80% of pulses too.
k = max(1, int(round(1.5 / CELL)))
dense = ndimage.uniform_filter(n_high.astype(np.float32), 2 * k + 1) / np.maximum(ndimage.uniform_filter(n_first.astype(np.float32), 2 * k + 1), 1e-3)
conifer = ((crown / h) < 0.22) | ((dense[tj, ti] > 0.95) & ((crown / h) < 0.35))

x = -HALF + (ti + 0.5) * CELL
z = -HALF + (tj + 0.5) * CELL
order = np.lexsort((x, z))
trees = [[round(float(x[i]), 1), round(float(z[i]), 1), round(float(h[i]), 1), round(float(crown[i]), 1), int(conifer[i])] for i in order]
out = {
    'source': f'USGS 3DEP LiDAR point cloud ({args.ept or args.project}), public domain: vegetation returns over the 1 m bare-earth DEM',
    'tiles': used, 'cell': CELL, 'minHeight': args.min_height, 'count': len(trees),
    'heights': {p: round(float(np.percentile(h, q)), 1) for p, q in (('p10', 10), ('median', 50), ('p90', 90), ('max', 100))},
    'conifers': int(conifer.sum()),
    'trees': trees,
}
with open(os.path.join(D, 'trees.json'), 'w') as f:
    f.write(json.dumps({k: v for k, v in out.items() if k != 'trees'}, indent=1)[:-2] + ',\n "trees": [\n'
            + ',\n'.join(json.dumps(t, separators=(',', ':')) for t in trees) + '\n ]\n}\n')
print(f'  {len(trees)} trees (median {out["heights"]["median"]} m, tallest {out["heights"]["max"]} m, '
      f'{out["conifers"]} conifers) → {D}/trees.json')
# a CHM preview for checking against the aerial (not committed)
np.save(os.path.join(args.cache, f'{args.id}-chm.npy'), cs.astype(np.float16))
