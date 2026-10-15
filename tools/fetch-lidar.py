#!/usr/bin/env python3
"""Bake a course DEM from USGS 3DEP 1-metre LiDAR (bare earth, public domain).

    python tools/fetch-lidar.py <courseId> <lat> <lon> [--size 1800] [--step 1]
                                [--far 16000] [--far-step 32]
                                [--prefer IL_10CountyNRCS_D23,IL_SouthCentral_2021_D21]

Asks the USGS TNM Access API for "Digital Elevation Model (DEM) 1 meter"
tiles over the course, ranks them (the --prefer projects first, in order, then
the newest), and reads only the window it needs from each Cloud-Optimized
GeoTIFF over HTTP (the backdrop reads the tiles' own overviews, so nothing is
downloaded whole). Each sample takes the best-ranked project that has data
there; anything no LiDAR covers falls back to the Terrarium tiles that
tools/fetch-dem.mjs uses.

Writes the same two grids as tools/fetch-dem.mjs, in the same frame
(centred on lat/lon, +x east, +z south, metres; js/course/dem.js reads them):

  assets/courses/<id>/dem.bin/.json   the playing area, --size m at --step m
  assets/courses/<id>/far.bin/.json   the surround, --far m at --far-step m

Heights are Uint16 centimetres above the grid minimum (NAVD88 metres).
Runs with rasterio + numpy + Pillow (the eo-mcp sandbox Python has them).
"""
import argparse
import io
import json
import math
import os
import sys
import urllib.parse
import urllib.request

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.warp import reproject, transform_bounds
from rasterio.windows import from_bounds

R = 6378137.0
UA = 'Fairway-golf-importer/1.0 (+https://github.com/tylerwaynetoenyes-sys/Golf-Simulator)'
TNM = 'https://tnmaccess.nationalmap.gov/api/v1/products'
DATASET = 'Digital Elevation Model (DEM) 1 meter'
PREFER = 'IL_10CountyNRCS_D23,IL_SouthCentral_2021_D21'

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('id')
ap.add_argument('lat', type=float)
ap.add_argument('lon', type=float)
ap.add_argument('--size', type=float, default=1800)
ap.add_argument('--step', type=float, default=1)
ap.add_argument('--far', type=float, default=16000)
ap.add_argument('--far-step', type=float, default=32)
ap.add_argument('--prefer', default=PREFER, help='comma-separated 3DEP project names, best first')
args = ap.parse_args()
LAT, LON = args.lat, args.lon
PREF = [p for p in args.prefer.split(',') if p]

# The game's frame is an equirectangular projection on a sphere of radius R
# with true scale at the course latitude: x = R cos(lat0) dLon, z = -R dLat.
LOCAL = CRS.from_proj4(f'+proj=eqc +lat_ts={LAT} +lat_0={LAT} +lon_0={LON} +x_0=0 +y_0=0 +a={R} +b={R} +units=m +no_defs')
os.environ.setdefault('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')
os.environ.setdefault('CPL_VSIL_CURL_ALLOWED_EXTENSIONS', '.tif')
os.environ.setdefault('GDAL_HTTP_MAX_RETRY', '4')
os.environ.setdefault('GDAL_HTTP_RETRY_DELAY', '1')


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


def tiles_over(bounds_ll):
    """3DEP 1 m tiles intersecting a lon/lat box, best first."""
    w, s, e, n = bounds_ll
    q = urllib.parse.urlencode({'datasets': DATASET, 'bbox': f'{w},{s},{e},{n}', 'max': 500, 'outputFormat': 'JSON'})
    items = json.loads(get(f'{TNM}?{q}'))['items']
    out = []
    for it in items:
        url = it.get('downloadURL') or ''
        if not url.endswith('.tif') or '/Projects/' not in url:
            continue
        project = url.split('/Projects/')[1].split('/')[0]
        out.append({'url': url, 'project': project, 'date': it.get('publicationDate', ''), 'title': it.get('title', '')})

    def rank(t):
        p = PREF.index(t['project']) if t['project'] in PREF else len(PREF)
        return (p, ''.join(chr(255 - ord(c)) for c in t['date']))  # newest first

    return sorted(out, key=rank)


def lidar_grid(size, step, ref):
    """Sample the LiDAR mosaic on the course grid; NaN where no tile has data.

    A tile's sample is used only within SANITY metres of `ref` (the coarse
    Terrarium heights): a few published tiles carry constant-value strips
    along their edges (x74y431 of IL_10CountyNRCS_D23 reads 92.3 m on a
    170 m hillside), and those fall through to the next-ranked tile.
    """
    n = int(round(size / step)) + 1
    half = size / 2
    # sample k sits at -half + k*step: pixel centres, north row first
    dst_t = from_origin(-half - step / 2, half + step / 2, step, step)
    dst = np.full((n, n), np.nan, dtype=np.float32)
    ll = transform_bounds(LOCAL, 'EPSG:4326', -half - step, -half - step, half + step, half + step, densify_pts=21)
    tiles = tiles_over(ll)
    print(f'  {len(tiles)} LiDAR tiles: ' + ', '.join(sorted({t["project"] for t in tiles})))
    used = []
    for t in tiles:
        if not np.isnan(dst).any():
            break
        try:
            src = rasterio.open('/vsicurl/' + t['url'])
        except Exception as e:  # noqa: BLE001
            print(f'  skip {t["title"]}: {e}')
            continue
        with src:
            pad = 4 * step
            b = transform_bounds(LOCAL, src.crs, -half - pad, -half - pad, half + pad, half + pad, densify_pts=21)
            sb = src.bounds
            b = (max(b[0], sb.left), max(b[1], sb.bottom), min(b[2], sb.right), min(b[3], sb.top))
            if b[0] >= b[2] or b[1] >= b[3]:
                continue
            win = from_bounds(*b, transform=src.transform).round_offsets().round_lengths()
            # coarse grids read the tile's overviews (about two source pixels per sample)
            dec = max(1, int(step / (2 * src.res[0])))
            shape = (max(1, int(win.height // dec)), max(1, int(win.width // dec)))
            arr = src.read(1, window=win, out_shape=shape, masked=True,
                           resampling=Resampling.average if dec > 1 else Resampling.nearest).astype(np.float32)
            arr = arr.filled(np.nan)
            # the outermost valid pixels of a tile (and its overviews) mix in the
            # nodata ring: drop them, so seams come from the neighbouring tile
            bad = np.isnan(arr) | (arr < -1000)
            edge = bad.copy()
            edge[1:] |= bad[:-1]; edge[:-1] |= bad[1:]; edge[:, 1:] |= bad[:, :-1]; edge[:, :-1] |= bad[:, 1:]
            arr[edge] = np.nan
            if np.isnan(arr).all():
                continue
            wt = src.window_transform(win) * rasterio.Affine.scale(win.width / shape[1], win.height / shape[0])
            tmp = np.full((n, n), np.nan, dtype=np.float32)
            reproject(arr, tmp, src_transform=wt, src_crs=src.crs, src_nodata=np.nan,
                      dst_transform=dst_t, dst_crs=LOCAL, dst_nodata=np.nan, resampling=Resampling.bilinear)
            fill = np.isnan(dst) & ~np.isnan(tmp) & (np.abs(tmp - ref) < SANITY)
            if fill.any():
                dst[fill] = tmp[fill]
                used.append({'tile': t['title'], 'project': t['project'], 'published': t['date'], 'samples': int(fill.sum())})
                print(f'  {t["title"]}: {fill.sum()} samples ({100 * fill.sum() / dst.size:.1f}%)')
    return dst, used


_tcache = {}


SANITY = 15.0


def terrarium_fill(dst, size, step):
    """Fill NaN samples from the Terrarium tiles (the same source as fetch-dem.mjs)."""
    miss = np.isnan(dst)
    if not miss.any():
        return 0
    n = dst.shape[0]
    half = size / 2
    j, i = np.nonzero(miss)
    x = -half + i * step
    z = -half + j * step
    lat = LAT - z / ((math.pi / 180) * R)
    lon = LON + x / ((math.pi / 180) * R * math.cos(math.radians(LAT)))
    zoom = max(1, min(15, round(math.log2(156543 * math.cos(math.radians(LAT)) / step))))
    fx = (lon + 180) / 360 * 2 ** zoom * 256 - 0.5
    lr = np.radians(lat)
    fy = (1 - np.log(np.tan(lr) + 1 / np.cos(lr)) / math.pi) / 2 * 2 ** zoom * 256 - 0.5
    from PIL import Image

    def tile(tx, ty):
        k = (zoom, tx, ty)
        if k not in _tcache:
            png = get(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{zoom}/{tx}/{ty}.png')
            a = np.asarray(Image.open(io.BytesIO(png)).convert('RGB'), dtype=np.float64)
            _tcache[k] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
        return _tcache[k]

    def px(X, Y):
        out = np.empty(X.shape)
        tx, ty = X // 256, Y // 256
        for a, b in set(zip(tx.tolist(), ty.tolist())):
            m = (tx == a) & (ty == b)
            out[m] = tile(a, b)[Y[m] % 256, X[m] % 256]
        return out

    x0, y0 = np.floor(fx).astype(np.int64), np.floor(fy).astype(np.int64)
    u, v = fx - x0, fy - y0
    h = (px(x0, y0) * (1 - u) * (1 - v) + px(x0 + 1, y0) * u * (1 - v)
         + px(x0, y0 + 1) * (1 - u) * v + px(x0 + 1, y0 + 1) * u * v)
    dst[j, i] = h
    return int(miss.sum())


def bake(name, size, step):
    print(f'{name}: {size:g} m at {step:g} m')
    n = int(round(size / step)) + 1
    ref = np.full((n, n), np.nan, dtype=np.float32)
    terrarium_fill(ref, size, step)
    h, used = lidar_grid(size, step, ref)
    miss = np.isnan(h)
    h[miss] = ref[miss]
    filled = int(miss.sum())
    if filled:
        print(f'  {filled} samples ({100 * filled / h.size:.1f}%) outside the LiDAR: Terrarium tiles')
    lo, hi = float(np.nanmin(h)), float(np.nanmax(h))
    if hi - lo > 655:
        sys.exit(f'{name}: relief {hi - lo:.0f} m does not fit Uint16 centimetres')
    q = np.round((h - lo) * 100).astype('<u2')
    d = os.path.join('assets/courses', args.id)
    os.makedirs(d, exist_ok=True)
    q.tofile(os.path.join(d, f'{name}.bin'))
    n = h.shape[0]
    projects = sorted({u['project'] for u in used})
    meta = {
        'lat': LAT, 'lon': LON, 'size': size, 'step': step, 'n': n,
        'min': round(lo, 2), 'max': round(hi, 2),
        'lidar': bool(used) and filled == 0,
        'source': f'USGS 3DEP 1 m bare-earth DEM ({", ".join(projects)}), public domain'
                  + (f'; {100 * filled / h.size:.1f}% from Terrarium tiles (AWS Open Data)' if filled else ''),
        'tiles': used,
    }
    with open(os.path.join(d, f'{name}.json'), 'w') as f:
        f.write(json.dumps(meta, indent=2) + '\n')
    print(f'  {n}×{n}, {lo:.2f}–{hi:.2f} m → {d}/{name}.bin')


bake('dem', args.size, args.step)
bake('far', args.far, args.far_step)
