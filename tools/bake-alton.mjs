// Bake the real ground and map features for the Alton riverfront landmark
// (Confluence hole 4) into assets/landmarks/alton/.
//
//   node tools/bake-alton.mjs <osm.json> [--out assets/landmarks/<id>] [--lat --lon]
//        [--ux e,n --uz e,n] [--box x0,x1,z0,z1] [--step m] [--no-sat]
//
// Defaults are the Alton riverfront's. Other places use the same bake in
// their own frame, e.g. Forest Park in map axes (+x east, +z south):
//   --out assets/landmarks/forestpark --lat 38.6385 --lon -90.2875 --ux 1,0 --uz 0,-1
//
// <osm.json> is an Overpass `out geom` dump of both banks round the Clark
// Bridge (bbox 38.850,-90.215,38.905,-90.145: buildings, parking, highways,
// rail, landuse, leisure, man_made, natural, islands and the river relation
// 2307560). Writes:
//   ground.bin   Int16 heights (decimetres, local y) then Uint8 land cover,
//                a grid in the landmark's own frame
//   ground.json  the grid, the frame and every feature in local metres
//   sat.jpg      EOxCloudless 2024 warped into the same frame (needs macOS sips)
//
// The frame is the riverfront's: origin at the amphitheater, +x inland
// (north-east, square to the Alton shore), +z downstream along it (south-east,
// toward the Clark Bridge), y up. Elevation: AWS Terrarium tiles (USGS 3DEP /
// NED). Needs pngjs (npm i pngjs, or PNGJS=/path/to/pngjs).
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

let PNG;
try { ({ PNG } = await import('pngjs')); } catch { ({ PNG } = await import(process.env.PNGJS)); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(3);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const nums = (v) => v.split(',').map(Number);
const OUT = join(ROOT, opt('out', 'assets/landmarks/alton'));
// Alton: the amphitheater; the shore between the Argosy and the marina runs 128° (fit to OSM)
const LAT0 = Number(opt('lat', 38.8877)), LON0 = Number(opt('lon', -90.1814));
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180), KY = 110950;
const UX = nums(opt('ux', '0.616,0.7876')), UZ = nums(opt('uz', '0.7876,-0.616'));
const [X0, X1, Z0, Z1] = nums(opt('box', '-2100,1300,-1700,1700'));
const STEP = Number(opt('step', 12));
const SAT_ON = !argv.includes('--no-sat');
const NX = Math.round((X1 - X0) / STEP) + 1, NZ = Math.round((Z1 - Z0) / STEP) + 1;

const toLocal = (lat, lon) => {
  const E = (lon - LON0) * KX, N = (lat - LAT0) * KY;
  return [UX[0] * E + UX[1] * N, UZ[0] * E + UZ[1] * N];
};
const toGeo = (x, z) => {
  // inverse of the rotation above (orthonormal axes)
  const E = UX[0] * x + UZ[0] * z, N = UX[1] * x + UZ[1] * z;
  return [LAT0 + N / KY, LON0 + E / KX];
};
const r1 = (v) => Math.round(v * 10) / 10;

// ── elevation ──
const tiles = new Map();
async function tile(z, x, y) {
  const k = `${z}/${x}/${y}`;
  if (!tiles.has(k)) tiles.set(k, (async () => {
    for (let i = 0; ; i++) {
      try {
        const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${k}.png`);
        if (!r.ok) throw new Error(r.status);
        return PNG.sync.read(Buffer.from(await r.arrayBuffer()));
      } catch (e) { if (i > 3) throw e; await new Promise((s) => setTimeout(s, 400 * 2 ** i)); }
    }
  })());
  return tiles.get(k);
}
const merc = (lat, lon, z) => [((lon + 180) / 360) * 2 ** z * 256, ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z * 256];
async function elev(lat, lon, z = 15) {
  const [fx, fy] = merc(lat, lon, z);
  const px = Math.floor(fx - 0.5), py = Math.floor(fy - 0.5), tx = fx - 0.5 - px, ty = fy - 0.5 - py;
  const s = async (X, Y) => {
    const t = await tile(z, Math.floor(X / 256), Math.floor(Y / 256));
    const i = ((Y % 256) * 256 + (X % 256)) * 4;
    return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
  };
  const [a, b, c, d] = await Promise.all([s(px, py), s(px + 1, py), s(px, py + 1), s(px + 1, py + 1)]);
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

// ── OSM ──
const osm = JSON.parse(await readFile(process.argv[2], 'utf8')).elements;
const ring = (g) => g.map((p) => toLocal(p.lat, p.lon));
/** Stitch a multipolygon's member ways into closed rings, by role. */
function rings(rel) {
  const out = { outer: [], inner: [] };
  for (const role of ['outer', 'inner']) {
    const segs = rel.members.filter((m) => m.type === 'way' && m.role === role && m.geometry).map((m) => m.geometry.map((p) => [p.lat, p.lon]));
    while (segs.length) {
      let cur = segs.shift();
      for (let guard = 0; guard < 5000; guard++) {
        const a = cur[0], b = cur[cur.length - 1];
        if (a[0] === b[0] && a[1] === b[1] && cur.length > 3) break;
        const i = segs.findIndex((s) => (s[0][0] === b[0] && s[0][1] === b[1]) || (s[s.length - 1][0] === b[0] && s[s.length - 1][1] === b[1]));
        if (i < 0) break;
        let s = segs.splice(i, 1)[0];
        if (s[0][0] !== b[0] || s[0][1] !== b[1]) s = s.reverse();
        cur = cur.concat(s.slice(1));
      }
      out[role].push(cur.map(([la, lo]) => toLocal(la, lo)));
    }
  }
  return out;
}
function inside(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const bbox = (p) => p.reduce((b, [x, z]) => [Math.min(b[0], x), Math.min(b[1], z), Math.max(b[2], x), Math.max(b[3], z)], [1e9, 1e9, -1e9, -1e9]);
const inGrid = (b) => b[2] > X0 && b[0] < X1 && b[3] > Z0 && b[1] < Z1;

// land cover classes (painted in this order, later wins)
const C = { field: 0, water: 1, wood: 2, wetland: 3, urban: 4, paved: 5, farm: 6, grass: 7, sand: 8 };
const areas = []; // [class, outerRings, innerRings]
for (const e of osm) {
  const t = e.tags || {};
  let cls = null;
  if (t.natural === 'water' || t.waterway === 'riverbank') cls = C.water;
  else if (t.natural === 'wood' || t.landuse === 'forest') cls = C.wood;
  else if (t.natural === 'wetland') cls = C.wetland;
  else if (['residential', 'commercial', 'industrial', 'retail', 'railway', 'port'].includes(t.landuse)) cls = C.urban;
  else if (t.amenity === 'parking') cls = C.paved;
  else if (t.landuse === 'farmland') cls = C.farm;
  else if (['grass', 'meadow', 'recreation_ground', 'village_green'].includes(t.landuse) || ['park', 'pitch', 'dog_park'].includes(t.leisure)) cls = C.grass;
  else if (['beach', 'sand', 'bare_rock', 'scree'].includes(t.natural)) cls = C.sand;
  else if (t.place === 'island' || t.place === 'islet') cls = C.field;
  if (cls == null) continue;
  if (e.type === 'relation') { const r = rings(e); areas.push([cls, r.outer, r.inner, t]); }
  else if (e.geometry && e.geometry.length > 3) areas.push([cls, [ring(e.geometry)], [], t]);
}
// paint order: big things first, so ponds on islands and lots in parks win
const order = [C.field, C.farm, C.grass, C.urban, C.wood, C.wetland, C.sand, C.paved, C.water];
areas.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]) || (a[2].length ? 0 : 1) - (b[2].length ? 0 : 1));
// islands sit inside the river's outer ring: paint them after the water
const islands = areas.filter((a) => a[3].place === 'island' || a[3].place === 'islet');

const cls = new Uint8Array(NX * NZ).fill(C.field);
function paint([c, outer, inner]) {
  for (const o of outer) {
    const b = bbox(o);
    if (!inGrid(b)) continue;
    const i0 = Math.max(0, Math.floor((b[0] - X0) / STEP)), i1 = Math.min(NX - 1, Math.ceil((b[2] - X0) / STEP));
    const j0 = Math.max(0, Math.floor((b[1] - Z0) / STEP)), j1 = Math.min(NZ - 1, Math.ceil((b[3] - Z0) / STEP));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = X0 + i * STEP, z = Z0 + j * STEP;
      if (inside(o, x, z) && !inner.some((h) => inside(h, x, z))) cls[j * NX + i] = c;
    }
  }
}
for (const a of areas) if (!islands.includes(a)) paint(a);
for (const a of islands) paint([C.field, a[1], []]);
// ponds and woods on the islands go back on top
for (const a of areas) if (!islands.includes(a) && a[0] !== C.field && a[1].some((o) => islands.some((I) => I[1].some((io) => inside(io, ...o[0]))))) paint(a);

// ── heights ──
const [aLat, aLon] = toGeo(0, 0);
const ref = await elev(aLat, aLon);
const pools = [];
const RIVER = !argv.includes('--no-river'); // a park has lakes at their own levels: no pool to flood
for (const [x, z] of RIVER ? [[-400, -100], [-450, 200], [-500, -600], [-300, 900]] : [[0, 0], [0, 0]]) pools.push(await elev(...toGeo(x, z)));
pools.sort((a, b) => a - b);
const pool = pools[1] - ref; // the pool above Mel Price Lock, relative to the amphitheater
console.log(`amphitheater ${ref.toFixed(1)} m, river pool ${(pool + ref).toFixed(1)} m (local ${pool.toFixed(2)})`);
const H = new Int16Array(NX * NZ);
const jobs = [];
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) jobs.push([i, j]);
for (let k = 0; k < jobs.length; k += 400) {
  await Promise.all(jobs.slice(k, k + 400).map(async ([i, j]) => {
    const n = j * NX + i;
    let h = (await elev(...toGeo(X0 + i * STEP, Z0 + j * STEP))) - ref;
    // the DEM reads the water surface: drop the river bed below it, lift land clear
    if (RIVER) {
      if (cls[n] === C.water) h = pool - 2.5;
      else h = Math.max(h, pool + 0.5);
    }
    H[n] = Math.round(h * 10);
  }));
  process.stdout.write(`\r  heights ${Math.min(jobs.length, k + 400)}/${jobs.length}`);
}
console.log();

// ── features ──
const feat = { buildings: [], parking: [], roads: [], rail: [], piers: [], breakwaters: [], points: {} };
const HW = { motorway: 12, trunk: 11, primary: 9, secondary: 8, tertiary: 7, residential: 6, unclassified: 6, service: 4, motorway_link: 6, trunk_link: 6, primary_link: 6, cycleway: 2.5, footway: 1.8, path: 1.6 };
for (const e of osm) {
  const t = e.tags || {};
  if (!e.geometry || e.type !== 'way') continue;
  const p = ring(e.geometry);
  const b = bbox(p);
  if (!inGrid(b)) continue;
  const pts = p.map(([x, z]) => [r1(x), r1(z)]);
  if (t.building) {
    let h = parseFloat(t.height) || (parseFloat(t['building:levels']) ? parseFloat(t['building:levels']) * 3.3 + 1 : 0);
    const kind = t.man_made === 'silo' ? 'silo' : t.amenity === 'casino' ? 'casino' : t.building;
    feat.buildings.push({ p: pts, h: r1(h), k: kind, n: t.name || undefined });
  } else if (t.amenity === 'parking') feat.parking.push(pts);
  else if (t.highway && HW[t.highway]) feat.roads.push({ p: pts, w: HW[t.highway], k: t.highway, b: t.bridge === 'yes' ? 1 : 0, n: t.name || undefined, l: +(t.layer || 0) });
  else if (t.railway === 'rail') feat.rail.push({ p: pts, b: t.bridge === 'yes' ? 1 : 0 });
  else if (t.man_made === 'pier') feat.piers.push(pts);
  else if (t.man_made === 'breakwater' || t.man_made === 'groyne') feat.breakwaters.push(pts);
  else if (t.man_made === 'bridge' && t.name === 'Clark Bridge') feat.clarkOutline = pts;
  else if (t.man_made === 'tower' && t['tower:type'] === 'observation') feat.points.tower = [r1((b[0] + b[2]) / 2), r1((b[1] + b[3]) / 2)];
  if ((t.natural === 'water' || t.water) && t.name) (feat.lakes ||= []).push({ n: t.name, p: pts });
}
// named lakes and basins mapped as multipolygons
for (const e of osm) {
  const t = e.tags || {};
  if (e.type === 'relation' && (t.natural === 'water' || t.water) && t.name) {
    const r = rings(e);
    for (const o of r.outer) if (inGrid(bbox(o))) (feat.lakes ||= []).push({ n: t.name, p: o.map(([x, z]) => [r1(x), r1(z)]) });
  }
}
for (const e of osm) {
  const t = e.tags || {};
  if (e.type === 'node' && t.name) {
    const [x, z] = toLocal(e.lat, e.lon);
    if (x > X0 && x < X1 && z > Z0 && z < Z1) feat.points[t.name] = [r1(x), r1(z)];
  }
}
feat.pool = r1(pool);

// ── satellite colour, warped into the grid (EOxCloudless 2024, zoom 15) ──
const SAT = 1024, sz = 15;
if (SAT_ON) {
const tmp = join(tmpdir(), 'alton-sat');
await mkdir(tmp, { recursive: true });
const satTiles = new Map();
function bmp(file) {
  return readFile(file).then((buf) => {
    const off = buf.readUInt32LE(10), w = buf.readInt32LE(18), h = buf.readInt32LE(22), bpp = buf.readUInt16LE(28) / 8;
    const row = Math.ceil((w * bpp) / 4) * 4;
    return { w, h: Math.abs(h), px: (x, y) => { const yy = h > 0 ? Math.abs(h) - 1 - y : y; const o = off + yy * row + x * bpp; return [buf[o + 2], buf[o + 1], buf[o]]; } };
  });
}
async function satTile(x, y) {
  const k = `${x}_${y}`;
  if (!satTiles.has(k)) satTiles.set(k, (async () => {
    const jpg = join(tmp, `${k}.jpg`), bm = join(tmp, `${k}.bmp`);
    const r = await fetch(`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/${sz}/${y}/${x}.jpg`, { headers: { 'User-Agent': 'Fairway golf (private, non-commercial)' } });
    await writeFile(jpg, Buffer.from(await r.arrayBuffer()));
    execFileSync('sips', ['-s', 'format', 'bmp', jpg, '--out', bm], { stdio: 'ignore' });
    return bmp(bm);
  })());
  return satTiles.get(k);
}
const img = Buffer.alloc(SAT * SAT * 3);
for (let j = 0; j < SAT; j++) {
  const row = [];
  for (let i = 0; i < SAT; i++) row.push((async () => {
    const x = X0 + ((i + 0.5) / SAT) * (X1 - X0), z = Z0 + ((j + 0.5) / SAT) * (Z1 - Z0);
    const [fx, fy] = merc(...toGeo(x, z), sz);
    const t = await satTile(Math.floor(fx / 256), Math.floor(fy / 256));
    const c = t.px(Math.floor(fx) % 256, Math.floor(fy) % 256);
    img.set(c, (j * SAT + i) * 3);
  })());
  await Promise.all(row);
  if (j % 64 === 0) process.stdout.write(`\r  sat ${j}/${SAT}`);
}
console.log();
// write a 24-bit BMP (rows bottom-up), let sips make the JPEG
{
  const row = SAT * 3, buf = Buffer.alloc(54 + row * SAT);
  buf.write('BM'); buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(SAT, 18); buf.writeInt32LE(SAT, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(row * SAT, 34);
  for (let j = 0; j < SAT; j++) for (let i = 0; i < SAT; i++) {
    const s = (j * SAT + i) * 3, d = 54 + (SAT - 1 - j) * row + i * 3;
    buf[d] = img[s + 2]; buf[d + 1] = img[s + 1]; buf[d + 2] = img[s];
  }
  await mkdir(OUT, { recursive: true });
  const bm = join(tmp, 'sat.bmp');
  await writeFile(bm, buf);
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', bm, '--out', join(OUT, 'sat.jpg')], { stdio: 'ignore' });
}
await rm(tmp, { recursive: true, force: true });
}
await mkdir(OUT, { recursive: true });

const bin = Buffer.alloc(NX * NZ * 3);
Buffer.from(H.buffer).copy(bin, 0);
Buffer.from(cls.buffer).copy(bin, NX * NZ * 2);
await writeFile(join(OUT, 'ground.bin'), bin);
await writeFile(join(OUT, 'ground.json'), JSON.stringify({
  note: 'Alton riverfront, local frame: origin the amphitheater, +x inland (NE), +z downstream (SE). Elevation AWS Terrarium (USGS 3DEP/NED); map data (c) OpenStreetMap contributors, ODbL; sat.jpg EOxCloudless 2024 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2024), CC BY-NC-SA 4.0.',
  origin: [LAT0, LON0], ux: UX, uz: UZ,
  grid: { x0: X0, z0: Z0, step: STEP, nx: NX, nz: NZ, classes: C },
  ...feat,
}));
console.log(`wrote ${OUT}: ${NX}x${NZ} grid, ${feat.buildings.length} buildings, ${feat.roads.length} roads, ${feat.piers.length} piers, ${feat.parking.length} lots`);
