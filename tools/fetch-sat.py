"""Satellite ground colour for the DEM courses.

For each course, mosaic cloud-free Copernicus Sentinel-2 L2A true-colour
scenes (the 10 m "visual" product, served as Cloud-Optimised GeoTIFFs from the
AWS Open Data registry via the Earth Search STAC API) into the course's DEM
frame: a square centred on the course's lat/lon, x east and z south, the same
extent as assets/courses/<id>/far.json. Writes assets/courses/<id>/sat.jpg.

Copernicus Sentinel data is free and open (Copernicus data policy); credit:
"Contains modified Copernicus Sentinel data <year>".

Needs Python with rasterio, numpy and Pillow:
    python tools/fetch-sat.py [course ...]
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
    ids = sys.argv[1:] or ['oregon', 'eaststl', 'paris', 'cassis', 'liberty']
    for cid in ids:
        print(cid, f'{build(cid) * 100:.1f}% covered')
