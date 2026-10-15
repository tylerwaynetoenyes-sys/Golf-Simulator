"""Satellite ground colour for the DEM courses.

Two sources:

  eox (default)  EOxCloudless 2024: EOX's seamless, colour-balanced, cloud-free
                 Sentinel-2 mosaic, read from its public WMTS tiles. Licence
                 CC BY-NC-SA 4.0: fine for Fairway as a private, non-commercial
                 game; commercial use would need EOX's paid licence. Credit:
                 "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH
                 (Contains modified Copernicus Sentinel data 2024)".
  sentinel       Mosaic cloud-free Copernicus Sentinel-2 L2A true-colour
                 scenes yourself (fully open data, any use; can show seams
                 between scenes).

For each course with the sentinel source, mosaic cloud-free Copernicus
Sentinel-2 L2A true-colour scenes (the 10 m "visual" product, served as Cloud-Optimised GeoTIFFs from the
AWS Open Data registry via the Earth Search STAC API) into the course's DEM
frame: a square centred on the course's lat/lon, x east and z south, the same
extent as assets/courses/<id>/far.json. Writes assets/courses/<id>/sat.jpg.

Copernicus Sentinel data is free and open (Copernicus data policy); credit:
"Contains modified Copernicus Sentinel data <year>".

Needs Python with rasterio, numpy and Pillow:
    python tools/fetch-sat.py [--source eox|sentinel] [course ...]
"""
import json
import os
import sys
import urllib.request

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.warp import Resampling, reproject, transform_bounds
from rasterio.transform import from_origin
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAC = 'https://earth-search.aws.element84.com/v1/search'
PX = 1536  # ~10 m per pixel over the 16 km backdrop: Sentinel-2's own resolution
# leaf-on season in each hemisphere's summer, a few recent years
SEASONS = [f'{y}-06-01T00:00:00Z/{y}-09-15T23:59:59Z' for y in (2024, 2023, 2022)]


def search(bbox, season):
    body = json.dumps({
        'collections': ['sentinel-2-l2a'], 'bbox': bbox, 'datetime': season, 'limit': 40,
        'query': {'eo:cloud_cover': {'lt': 8}},
        'sortby': [{'field': 'properties.eo:cloud_cover', 'direction': 'asc'}],
    }).encode()
    req = urllib.request.Request(STAC, body, {'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)['features']


EOX = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg'
EOX_CREDIT = 'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024), CC BY-NC-SA 4.0'
UA = {'User-Agent': 'Fairway-golf/1.0 (private, non-commercial; github.com/tylerwaynetoenyes-sys/Golf-Simulator)'}


def build_eox(cid, z=14):
    """Stitch EOxCloudless web-mercator tiles over the course, then warp them
    into the DEM frame."""
    import io
    import math
    import time
    meta = json.load(open(os.path.join(ROOT, 'assets/courses', cid, 'far.json')))
    lat, lon, size = meta['lat'], meta['lon'], meta['size']
    dst_crs = CRS.from_proj4(f'+proj=eqc +lat_ts={lat} +lat_0={lat} +lon_0={lon} +R=6378137 +units=m +no_defs')
    half = size / 2
    w, s_, e, n = transform_bounds(dst_crs, 'EPSG:4326', -half, -half, half, half)
    nt = 2 ** z
    tx = lambda lo: (lo + 180) / 360 * nt
    ty = lambda la: (1 - math.log(math.tan(math.radians(la)) + 1 / math.cos(math.radians(la))) / math.pi) / 2 * nt
    x0, x1 = int(tx(w)), int(tx(e))
    y0, y1 = int(ty(n)), int(ty(s_))
    mosaic = np.zeros((3, (y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), np.uint8)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            for attempt in range(4):
                try:
                    req = urllib.request.Request(EOX.format(z=z, x=x, y=y), headers=UA)
                    with urllib.request.urlopen(req, timeout=30) as r:
                        tile = np.asarray(Image.open(io.BytesIO(r.read())).convert('RGB'))
                    break
                except Exception:
                    if attempt == 3:
                        raise
                    time.sleep(1.5 * 2 ** attempt)
            mosaic[:, (y - y0) * 256:(y - y0 + 1) * 256, (x - x0) * 256:(x - x0 + 1) * 256] = np.transpose(tile, (2, 0, 1))
            time.sleep(0.05)
    world = 2 * math.pi * 6378137
    res_m = world / nt / 256
    src_tf = from_origin(-world / 2 + x0 * 256 * res_m, world / 2 - y0 * 256 * res_m, res_m, res_m)
    out = np.zeros((3, PX, PX), np.uint8)
    reproject(mosaic, out, src_transform=src_tf, src_crs='EPSG:3857',
              dst_transform=from_origin(-half, half, size / PX, size / PX), dst_crs=dst_crs, resampling=Resampling.average)
    Image.fromarray(np.transpose(out, (1, 2, 0))).save(os.path.join(ROOT, 'assets/courses', cid, 'sat.jpg'), quality=82, optimize=True)
    json.dump({'size': size, 'px': PX, 'source': 'EOxCloudless 2024 (s2cloudless-2024_3857, zoom %d)' % z, 'licence': 'CC BY-NC-SA 4.0',
               'credit': EOX_CREDIT}, open(os.path.join(ROOT, 'assets/courses', cid, 'sat.json'), 'w'), indent=1)
    print(f'  {cid}: {(x1 - x0 + 1) * (y1 - y0 + 1)} EOX tiles', flush=True)
    return 1.0


def build(cid):
    meta = json.load(open(os.path.join(ROOT, 'assets/courses', cid, 'far.json')))
    lat, lon, size = meta['lat'], meta['lon'], meta['size']
    # equirectangular about the course centre: exactly the DEM frame's metres
    dst_crs = CRS.from_proj4(f'+proj=eqc +lat_ts={lat} +lat_0={lat} +lon_0={lon} +R=6378137 +units=m +no_defs')
    half = size / 2
    res = size / PX
    dst_tf = from_origin(-half, half, res, res)  # row 0 = north (z = -half)
    bbox = list(transform_bounds(dst_crs, 'EPSG:4326', -half, -half, half, half))
    out = np.zeros((3, PX, PX), np.uint8)
    have = np.zeros((PX, PX), bool)
    used = []
    for season in SEASONS:
        for f in search(bbox, season):
            href = f['assets'].get('visual', {}).get('href')
            if not href:
                continue
            with rasterio.open(href) as src:
                buf = np.zeros((3, PX, PX), np.uint8)
                reproject(rasterio.band(src, [1, 2, 3]), buf, src_transform=src.transform, src_crs=src.crs,
                          dst_transform=dst_tf, dst_crs=dst_crs, resampling=Resampling.average, src_nodata=0, dst_nodata=0)
            got = buf.max(axis=0) > 0
            new = got & ~have
            if new.sum() < PX * PX * 0.002:
                continue
            out[:, new] = buf[:, new]
            have |= new
            used.append((f['id'], f['properties']['datetime'][:10], round(f['properties']['eo:cloud_cover'], 2)))
            print(f'  {cid}: {f["id"]} cloud {f["properties"]["eo:cloud_cover"]:.2f}% → {have.mean() * 100:.1f}% covered', flush=True)
            if have.all():
                break
        if have.all():
            break
    img = Image.fromarray(np.transpose(out, (1, 2, 0)))
    img.save(os.path.join(ROOT, 'assets/courses', cid, 'sat.jpg'), quality=82, optimize=True)
    years = sorted({d[:4] for _, d, _ in used})
    json.dump({'size': size, 'px': PX, 'scenes': used,
               'credit': f'Contains modified Copernicus Sentinel data {", ".join(years)}'},
              open(os.path.join(ROOT, 'assets/courses', cid, 'sat.json'), 'w'), indent=1)
    return have.mean()


if __name__ == '__main__':
    argv = sys.argv[1:]
    source = 'eox'
    if '--source' in argv:
        i = argv.index('--source')
        source = argv[i + 1]
        del argv[i:i + 2]
    ids = argv or ['oregon', 'eaststl', 'paris', 'cassis', 'liberty', 'pebble', 'sawgrass']
    for cid in ids:
        cov = build_eox(cid) if source == 'eox' else build(cid)
        print(cid, f'{cov * 100:.1f}% covered')
