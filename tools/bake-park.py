#!/usr/bin/env python3
"""Park features from an OpenStreetMap extract, in a landmark's local frame.

    curl -o park.osm "https://api.openstreetmap.org/api/0.6/map?bbox=-90.1925,38.8805,-90.1700,38.8935"
    python3 tools/bake-park.py park.osm assets/landmarks/alton/park.json \
        --lat 38.8877 --lon -90.1814 --ux 0.616,0.7876 --uz 0.7876,-0.616

Same frame as tools/bake-alton.mjs (origin, +x along ux, +z along uz, metres).
Writes the parks' outlines and what's in them: shelters, toilets and other
park buildings, playgrounds, fences, picnic tables, benches, drinking water,
fitness stations, information boards and artworks, with their names.
"""
import argparse
import json
import math
import xml.etree.ElementTree as ET

ap = argparse.ArgumentParser()
ap.add_argument('osm')
ap.add_argument('out')
ap.add_argument('--lat', type=float, required=True)
ap.add_argument('--lon', type=float, required=True)
ap.add_argument('--ux', default='1,0')
ap.add_argument('--uz', default='0,-1')
a = ap.parse_args()
UX = [float(v) for v in a.ux.split(',')]
UZ = [float(v) for v in a.uz.split(',')]
KX, KY = 111320 * math.cos(math.radians(a.lat)), 110950


def loc(lat, lon):
    e, n = (lon - a.lon) * KX, (lat - a.lat) * KY
    return [round(UX[0] * e + UX[1] * n, 1), round(UZ[0] * e + UZ[1] * n, 1)]


root = ET.parse(a.osm).getroot()
nodes = {}
out = {'note': 'OpenStreetMap contributors, ODbL. Local frame as ground.json.', 'parks': [], 'buildings': [], 'areas': [], 'lines': [], 'points': []}
POINT = {('leisure', 'picnic_table'), ('amenity', 'bench'), ('amenity', 'drinking_water'), ('leisure', 'fitness_station'),
         ('tourism', 'information'), ('tourism', 'artwork'), ('amenity', 'waste_basket'), ('historic', 'memorial'),
         ('historic', 'monument'), ('highway', 'street_lamp'), ('man_made', 'flagpole'), ('amenity', 'fountain'), ('man_made', 'monitoring_station')}
for n in root.iter('node'):
    nodes[n.get('id')] = (float(n.get('lat')), float(n.get('lon')))
    tags = {t.get('k'): t.get('v') for t in n.iter('tag')}
    kind = next((f'{k}={v}' for k, v in tags.items() if (k, v) in POINT), None)
    if kind:
        out['points'].append({'k': kind, 'n': tags.get('name'), 'p': loc(*nodes[n.get('id')])})
for w in root.iter('way'):
    tags = {t.get('k'): t.get('v') for t in w.iter('tag')}
    pts = [loc(*nodes[nd.get('ref')]) for nd in w.iter('nd') if nd.get('ref') in nodes]
    if len(pts) < 2:
        continue
    if tags.get('leisure') == 'park':
        out['parks'].append({'n': tags.get('name'), 'p': pts})
    elif tags.get('building') or tags.get('amenity') in ('shelter', 'toilets'):
        if tags.get('amenity') in ('shelter', 'toilets'):
            out['buildings'].append({'k': tags.get('amenity'), 't': tags.get('shelter_type'), 'p': pts})
    elif tags.get('leisure') in ('playground', 'swimming_pool', 'garden') or tags.get('amenity') == 'fountain':
        out['areas'].append({'k': tags.get('leisure') or tags.get('amenity'), 'n': tags.get('name'), 'p': pts})
    elif tags.get('barrier') in ('fence', 'wall', 'retaining_wall', 'gate'):
        out['lines'].append({'k': tags['barrier'], 'p': pts})
json.dump(out, open(a.out, 'w'), separators=(',', ':'))
print(f"wrote {a.out}: {len(out['parks'])} parks, {len(out['buildings'])} park buildings, {len(out['areas'])} areas, {len(out['lines'])} lines, {len(out['points'])} points")
