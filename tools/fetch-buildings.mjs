// Real buildings around a course, from OpenStreetMap footprints and heights.
// Every building within --near metres of the course centre, and beyond that
// only the tall ones (--tall metres and up) out to --far: the skyline.
// Writes assets/courses/<id>/buildings.json in the course's DEM frame
// (metres, +x east, +z south, centred on dem.json's lat/lon).
//
//   node tools/fetch-buildings.mjs <id> [--near 900] [--far 6000] [--tall 60] [--at lat,lon] [--skip lat,lon,r]...
//
// --at moves the centre of the near ring (e.g. onto Lower Manhattan for a
// course across the water); --skip drops footprints inside a circle (where
// the course's own holes run).
// Height: `height`, else `building:levels` × 3.3 m (+ roof), else a default.
// Data © OpenStreetMap contributors, ODbL 1.0.
import { readFile, writeFile } from 'node:fs/promises';

const argv = process.argv.slice(2);
const id = argv[0];
if (!id) { console.error('usage: node tools/fetch-buildings.mjs <id> [--near m] [--far m] [--tall m] [--at lat,lon] [--skip lat,lon,r]'); process.exit(1); }
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const NEAR = Number(opt('near', 900)), FAR = Number(opt('far', 6000)), TALL = Number(opt('tall', 60));
const skips = argv.flatMap((a, i) => (a === '--skip' ? [argv[i + 1].split(',').map(Number)] : []));
const meta = JSON.parse(await readFile(new URL(`../assets/courses/${id}/dem.json`, import.meta.url)));
const LAT0 = meta.lat, LON0 = meta.lon;
const [atLat, atLon] = (opt('at', `${LAT0},${LON0}`)).split(',').map(Number);
const mLat = (Math.PI / 180) * 6378137, mLon = mLat * Math.cos((LAT0 * Math.PI) / 180);
const xy = (lat, lon) => [(lon - LON0) * mLon, -(lat - LAT0) * mLat];
const box = (lat, lon, r) => { const dl = r / 111320, dn = r / (111320 * Math.cos((lat * Math.PI) / 180)); return `${lat - dl},${lon - dn},${lat + dl},${lon + dn}`; };

async function overpass(q) {
  for (let i = 0; i < 6; i++) {
    for (const ep of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
      try {
        const r = await fetch(ep, { method: 'POST', body: new URLSearchParams({ data: q }), headers: { 'User-Agent': 'Fairway-golf/1.0 (private, non-commercial)' }, signal: AbortSignal.timeout(180000) });
        if (r.ok) return (await r.json()).elements;
        console.warn(`  ${ep}: ${r.status}`);
      } catch (e) { console.warn(`  ${ep}: ${e.message}`); }
    }
    await new Promise((r) => setTimeout(r, 4000 * (i + 1)));
  }
  throw new Error('Overpass unavailable');
}

const heightOf = (t) => {
  const num = (v) => { const n = parseFloat(String(v || '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const h = num(t.height) ?? num(t['building:height']);
  if (h) return h;
  const lv = num(t['building:levels']);
  if (lv) return lv * 3.3 + (num(t['roof:levels']) || 0) * 3;
  return null;
};

const near = await overpass(`[out:json][timeout:170];(way["building"](${box(atLat, atLon, NEAR)});relation["building"](${box(atLat, atLon, NEAR)}););out tags geom;`);
console.log(`near: ${near.length} footprints`);
let far = [];
if (FAR > NEAR) {
  far = await overpass(`[out:json][timeout:170];(way["building"]["height"](${box(atLat, atLon, FAR)});way["building"]["building:levels"](${box(atLat, atLon, FAR)});relation["building"]["height"](${box(atLat, atLon, FAR)}););out tags geom;`);
  far = far.filter((e) => (heightOf(e.tags || {}) || 0) >= TALL);
  console.log(`far: ${far.length} tall buildings (≥ ${TALL} m)`);
}

const seen = new Set();
const out = [];
for (const e of [...near, ...far]) {
  if (seen.has(e.id)) continue;
  seen.add(e.id);
  const t = e.tags || {};
  if (['construction', 'roof', 'bridge'].includes(t.building)) continue;
  const ring = e.geometry || e.members?.find((m) => m.role === 'outer' && m.geometry)?.geometry;
  if (!ring || ring.length < 4) continue;
  const pts = ring.map((g) => xy(g.lat, g.lon));
  const cLat = ring.reduce((a, g) => a + g.lat, 0) / ring.length, cLon = ring.reduce((a, g) => a + g.lon, 0) / ring.length;
  if (skips.some(([la, lo, r]) => Math.hypot((cLon - lo) * mLon, (cLat - la) * mLat) < r)) continue;
  const h = heightOf(t);
  const minH = parseFloat(t.min_height) || 0;
  const p = [];
  for (let i = 0; i < pts.length - 1; i++) p.push(Math.round(pts[i][0] * 10) / 10, Math.round(pts[i][1] * 10) / 10);
  const b = { p, h: h ? Math.round(h * 10) / 10 : null };
  if (minH) b.mh = minH;
  if (t.name) b.n = t.name;
  if (t['roof:shape']) b.r = t['roof:shape'];
  if (t['building:material'] || t['building:colour']) b.m = t['building:colour'] || t['building:material'];
  out.push(b);
}
const file = new URL(`../assets/courses/${id}/buildings.json`, import.meta.url);
await writeFile(file, JSON.stringify({ source: '© OpenStreetMap contributors (ODbL 1.0)', lat: LAT0, lon: LON0, buildings: out }));
console.log(`wrote ${out.length} buildings to assets/courses/${id}/buildings.json`);
