#!/usr/bin/env python3
"""Plant a course's real trees from the USGS 3DEP LiDAR point cloud (public domain).

    python tools/fetch-trees.py <courseId> [--project IL_10CountyNRCS_D23]
                                [--cache ~/.cache/fairway/lpc] [--cell 0.5]
                                [--min-height 4] [--crs EPSG:3436]
    python tools/fetch-trees.py <courseId> --chm-raster meta [--cell 1]

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

Where no public point cloud covers a course, --chm-raster takes the canopy
height model from a raster instead of step 2: a GeoTIFF path or URL, or
"meta" for Meta and WRI's 1 m Global Canopy Height Map (CC BY 4.0, on AWS Open
Data; heights from Maxar imagery, so a few metres less exact than LiDAR). With
no leaf-off pulse density, a tree is a conifer when its crown is narrow for
its height alone.

Writes assets/courses/<id>/trees.json:
  {"source", "tiles", "cell", "minHeight", "count",
   "trees": [[x, z, height, crownRadius, conifer], ...]}   metres, DEM frame

Runs with numpy + scipy + laspy[lazrs] + pyproj:
    uv venv /tmp/lidarenv && uv pip install -p /tmp/lidarenv numpy scipy "laspy[lazrs]" pyproj
"""
import argparse
import json
import math
import os
import sys
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
ap.add_argument('--crs', default=None, help='override the tiles\' horizontal CRS (if a header lacks it)')
ap.add_argument('--chm-raster', default=None, help='canopy height GeoTIFF (path/URL), or "meta", instead of the point cloud')
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
    for i in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 (network: retry anything)
            if i == 3:
                raise
            print(f'  retry {url[:80]}… ({e})', file=sys.stderr)
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
            x = (lon - LON) * M_LON
            z = -(lat - LAT) * M_LAT
            inside = (np.abs(x) < HALF - 1) & (np.abs(z) < HALF - 1)
            x, z = x[inside], z[inside]
            hag = np.asarray(pts.z[use], np.float64)[inside] * vunit - ground(x, z)
            cls, first = cls[use][inside], first[use][inside]
            ci = ((x + HALF) / CELL).astype(np.int64)
            cj = ((z + HALF) / CELL).astype(np.int64)
            k = cj * N + ci
            veg = (cls == 4) | (cls == 5)
            np.maximum.at(chm.ravel(), k[veg], np.clip(hag[veg], 0, 60).astype(np.float32))
            for grid, m in ((n_first, first), (n_high, first & (hag > 2))):
                g = np.bincount(k[m], minlength=N * N).reshape(N, N)
                np.minimum(grid.astype(np.int64) + g, 65535, out=g)
                grid[:] = g
            kept += int(first.sum())
        return kept, crs.name, unit


META_CHM = 'https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/chm'


def raster_chm(src_path):
    """Resample a canopy-height raster onto the CHM grid (max of the source pixels)."""
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.transform import from_origin
    from rasterio.warp import reproject
    if src_path == 'meta':
        # the zoom-9 web-mercator tile (quadkey) under the course centre
        z, n = 9, 2 ** 9
        tx = int((LON + 180) / 360 * n)
        ty = int((1 - math.log(math.tan(math.radians(LAT)) + 1 / math.cos(math.radians(LAT))) / math.pi) / 2 * n)
        qk = ''.join(str(((tx >> (i - 1)) & 1) + 2 * ((ty >> (i - 1)) & 1)) for i in range(z, 0, -1))
        url = f'{META_CHM}/{qk}.tif'
        src_path = download({'url': url, 'title': f'Meta canopy height tile {qk}', 'bytes': 0})
    local = CRS.from_proj4(f'+proj=eqc +lat_ts={LAT} +lat_0={LAT} +lon_0={LON} +x_0=0 +y_0=0 +a={R} +b={R} +units=m +no_defs')
    out = np.zeros((N, N), np.float32)
    with rasterio.open(src_path) as src:
        reproject(rasterio.band(src, 1), out, dst_transform=from_origin(-HALF, HALF, CELL, CELL),
                  dst_crs=local.to_wkt(), dst_nodata=0, resampling=Resampling.max if CELL > src.res[0] else Resampling.bilinear)
    return np.clip(out, 0, 60), src_path


raster = None
# the gridded returns are kept beside the tiles, so tuning the steps below
# doesn't mean reading 2-3 GB of LAZ again
grids = os.path.join(args.cache, f'{args.id}-{args.project}-{CELL:g}.npz')
if args.chm_raster:
    chm, raster = raster_chm(args.chm_raster)
    used = [{'raster': os.path.basename(raster)}]
    print(f'{args.id}: canopy heights from {raster}')
elif os.path.exists(grids) and not args.fresh:
    g = np.load(grids, allow_pickle=False)
    chm, n_first, n_high = g['chm'], g['n_first'], g['n_high']
    used = json.loads(str(g['used']))
    print(f'{args.id}: gridded returns from {grids}')
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
if raster:
    conifer = (crown / h) < 0.35  # no pulse density from a raster: the crown's shape alone

x = -HALF + (ti + 0.5) * CELL
z = -HALF + (tj + 0.5) * CELL
order = np.lexsort((x, z))
trees = [[round(float(x[i]), 1), round(float(z[i]), 1), round(float(h[i]), 1), round(float(crown[i]), 1), int(conifer[i])] for i in order]
out = {
    'source': ('Meta and WRI Global Canopy Height Map (1 m, CC BY 4.0, AWS Open Data)' if args.chm_raster == 'meta'
               else f'canopy height raster {os.path.basename(raster)}') if raster else
              f'USGS 3DEP LiDAR point cloud ({args.project}), public domain: vegetation returns over the 1 m bare-earth DEM',
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
