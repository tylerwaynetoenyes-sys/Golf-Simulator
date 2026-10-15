// Import a real golf course from OpenStreetMap (hole lines, greens,
// fairways, bunkers, water) with its scorecard from OpenGolfAPI, onto real
// elevation. Writes js/course/courses/<id>.js and bakes the course DEM.
//
//   node tools/import-course.mjs --id liberty --q "Liberty National" [--state NJ]
//   node tools/import-course.mjs --id mycourse --lat 40.698 --lon -74.068 [--radius 1400]
//
// Options:
//   --id <id>            course id (file name, DEM folder)
//   --q "<name>"         find the course with OpenGolfAPI (US courses): location + scorecard
//   --lat/--lon          or give the location directly (anywhere OSM has golf=hole ways)
//   --radius <m>         search radius for OSM features (default 1600)
//   --course "<name>"    keep only hole lines inside the OSM golf course of this
//                        name (needed where courses touch, e.g. Monterey Peninsula)
//   --holes 1-9          which holes to keep (default: all mapped)
//   --name, --place      display name and place (default from OpenGolfAPI / OSM)
//   --theme <t>          parkland | western | coastal | urban (default parkland)
//   --no-dem             skip the elevation bake (tools/fetch-dem.mjs)
//   --lidar              bake 1 m USGS 3DEP LiDAR instead (tools/fetch-lidar.py;
//                        US only; python with rasterio, or set LIDAR_PY)
//   --outlines           keep the real OSM outlines of greens, fairways,
//                        bunkers and ponds instead of reducing them to ellipses
//   --card <file.json>   scorecard typed in from the course's own card, for
//                        courses OpenGolfAPI lacks (par, handicap, tees; see
//                        assets/courses/rollinghills/scorecard.json)
//   --dry                print what would be written
//
// Data: © OpenStreetMap contributors (ODbL 1.0); scorecards via OpenGolfAPI
// (ODbL 1.0). The generated module carries that attribution; keep it.
import { writeFile, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => {
  if (v.startsWith('--')) a.push([v.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return a;
}, []));
if (!args.id || (!args.q && !(args.lat && args.lon))) {
  console.error('usage: node tools/import-course.mjs --id <id> (--q "<course name>" | --lat <lat> --lon <lon>) [--radius m] [--holes 1-9] [--theme t]');
  process.exit(1);
}
const UA = 'Fairway-golf-importer/1.0 (+https://github.com/tylerwaynetoenyes-sys/Golf-Simulator)';
const YD = 0.9144;

async function getJSON(url, opts = {}) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(opts.timeout || 60000), headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
      if (r.status === 429 || r.status >= 500) throw new Error(`${r.status}`);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await r.json();
    } catch (e) {
      if (i === 3) throw e;
      await new Promise((res) => setTimeout(res, 1500 * 2 ** i));
    }
  }
  return null;
}

// ── 1. where, and the scorecard ──
let lat = Number(args.lat), lon = Number(args.lon), card = null, ogName = null, ogCity = null, cardFile = null;
if (args.card) {
  cardFile = JSON.parse(await readFile(args.card, 'utf8'));
  const back = cardFile.back || Object.keys(cardFile.tees)[0];
  card = new Map(cardFile.par.map((par, i) => [i + 1, {
    par, handicap_index: cardFile.handicap?.[i], back, yardages: Object.fromEntries(Object.entries(cardFile.tees).map(([t, y]) => [t, y[i]])),
  }]));
}
if (args.q) {
  const q = new URLSearchParams({ q: args.q, ...(args.state ? { state: args.state } : {}) });
  const s = await getJSON(`https://api.opengolfapi.org/v1/courses/search?${q}`);
  // prefer the course whose name matches the query, not just the first hit
  const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const list = s?.courses || [];
  const c = list.find((x) => norm(x.course_name || x.name) === norm(args.q) || norm(x.name) === norm(args.q))
    || list.find((x) => norm(x.name).includes(norm(args.q))) || list[0];
  if (!c) { console.error(`OpenGolfAPI found no course for "${args.q}"`); process.exit(1); }
  console.log(`OpenGolfAPI: ${c.name}, ${c.city} ${c.state} (par ${c.par})`);
  if (!args.lat) { lat = c.latitude; lon = c.longitude; }
  ogName = c.course_name || c.name; ogCity = `${c.city}, ${c.state}`;
  if (!card) try {
    const h = await getJSON(`https://api.opengolfapi.org/v1/courses/${c.id}/holes`);
    card = new Map((h?.holes || []).map((x) => [x.number, x]));
  } catch { /* scorecard is optional */ }
}

// ── 2. OSM golf features around it ──
const R = Number(args.radius) || 1600;
const dLat = R / 111320, dLon = R / (111320 * Math.cos((lat * Math.PI) / 180));
const bbox = `${lat - dLat},${lon - dLon},${lat + dLat},${lon + dLon}`;
const query = `[out:json][timeout:90];
(
  ${args.course ? `area["leisure"="golf_course"]["name"="${String(args.course).replace(/"/g, '')}"]->.c;
  way["golf"="hole"](area.c)(${bbox});` : `way["golf"="hole"](${bbox});`}
  way["golf"~"^(green|fairway|bunker|tee|water_hazard|lateral_water_hazard)$"](${bbox});
  way["natural"="water"](${bbox});
  ${args.outlines ? `relation["golf"="fairway"](${bbox});` : ''}
  way["leisure"="golf_course"](${bbox});
  relation["leisure"="golf_course"](${bbox});
);
out tags geom;`;
let osm = null;
for (const ep of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
  try {
    osm = await getJSON(ep, { method: 'POST', body: new URLSearchParams({ data: query }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    break;
  } catch (e) { console.warn(`Overpass ${ep}: ${e.message}`); }
}
if (!osm) { console.error('Overpass unavailable; try again shortly.'); process.exit(1); }
const els = osm.elements || [];
const holesOsm = els.filter((e) => e.tags?.golf === 'hole' && e.geometry?.length >= 2);
if (!holesOsm.length) { console.error('No golf=hole ways mapped here. Map them on openstreetmap.org, or route the holes by hand.'); process.exit(1); }
const courseTag = els.find((e) => e.tags?.leisure === 'golf_course' && e.tags?.name && (!args.course || e.tags.name === args.course)) || els.find((e) => e.tags?.leisure === 'golf_course' && e.tags?.name);

// ── 3. local metres: +x east, +z south, centred on the holes ──
let minLa = Infinity, maxLa = -Infinity, minLo = Infinity, maxLo = -Infinity;
for (const h of holesOsm) for (const g of h.geometry) { minLa = Math.min(minLa, g.lat); maxLa = Math.max(maxLa, g.lat); minLo = Math.min(minLo, g.lon); maxLo = Math.max(maxLo, g.lon); }
const LAT0 = +((minLa + maxLa) / 2).toFixed(5), LON0 = +((minLo + maxLo) / 2).toFixed(5);
const mLat = (Math.PI / 180) * 6378137, mLon = mLat * Math.cos((LAT0 * Math.PI) / 180);
const xy = (g) => [(g.lon - LON0) * mLon, -(g.lat - LAT0) * mLat];
const ring = (g) => { const p = g.map(xy); if (p.length > 2 && Math.hypot(p[0][0] - p.at(-1)[0], p[0][1] - p.at(-1)[1]) < 0.01) p.pop(); return p; };
/** A way's ring, or a multipolygon's outer ring (its outer members joined end to end). */
function poly(e) {
  if (e.type !== 'relation') return ring(e.geometry || []);
  const segs = (e.members || []).filter((m) => m.role === 'outer' && m.geometry?.length).map((m) => m.geometry.map((g) => [g.lat, g.lon]));
  if (!segs.length) return [];
  const out = segs.shift();
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  while (segs.length) {
    const end = out.at(-1);
    const i = segs.findIndex((sg) => same(sg[0], end) || same(sg.at(-1), end));
    if (i < 0) break;
    const sg = segs.splice(i, 1)[0];
    out.push(...(same(sg[0], end) ? sg : sg.reverse()).slice(1));
  }
  return ring(out.map(([la, lo]) => ({ lat: la, lon: lo })));
}
/** Douglas–Peucker on a closed outline, to `tol` metres, coordinates to 0.1 m. */
function simplifyRing(p, tol = 0.35) {
  if (p.length < 5) return p.map(([x, z]) => [+x.toFixed(1), +z.toFixed(1)]);
  let far = 0, fd = 0;
  for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i][0] - p[0][0], p[i][1] - p[0][1]); if (d > fd) { fd = d; far = i; } }
  const dp = (pts) => {
    const [ax, az] = pts[0], [bx, bz] = pts.at(-1);
    const L = Math.hypot(bx - ax, bz - az) || 1;
    let best = -1, bd = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / L;
      if (d > bd) { bd = d; best = i; }
    }
    return bd > tol ? [...dp(pts.slice(0, best + 1)), ...dp(pts.slice(best)).slice(1)] : [pts[0], pts.at(-1)];
  };
  const a = dp(p.slice(0, far + 1)), b = dp([...p.slice(far), p[0]]);
  return [...a, ...b.slice(1, -1)].map(([x, z]) => [+x.toFixed(1), +z.toFixed(1)]);
}
const area = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length]; a += x1 * z2 - x2 * z1; } return Math.abs(a) / 2; };
const centroid = (p) => p.reduce((a, [x, z]) => [a[0] + x / p.length, a[1] + z / p.length], [0, 0]);

/** Douglas–Peucker down to at most `max` points. */
function simplify(pts, tol = 6, max = 4) {
  const dp = (a, b) => {
    let best = -1, bd = 0;
    const [ax, az] = pts[a], [bx, bz] = pts[b];
    const L = Math.hypot(bx - ax, bz - az) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / L;
      if (d > bd) { bd = d; best = i; }
    }
    return bd > tol ? [...dp(a, best), ...dp(best, b).slice(1)] : [a, b];
  };
  let keep = dp(0, pts.length - 1);
  while (keep.length > max) {
    // drop the interior point that bends the line least
    let worst = 1, wd = Infinity;
    for (let i = 1; i < keep.length - 1; i++) {
      const [ax, az] = pts[keep[i - 1]], [bx, bz] = pts[keep[i + 1]], [px, pz] = pts[keep[i]];
      const d = Math.abs((bx - ax) * (az - pz) - (ax - px) * (bz - az)) / (Math.hypot(bx - ax, bz - az) || 1);
      if (d < wd) { wd = d; worst = i; }
    }
    keep.splice(worst, 1);
  }
  return keep.map((i) => pts[i].map((v) => Math.round(v)));
}

/** Arc length and signed lateral offset (+ right of play) of a point against a polyline. */
function project(line, [x, z]) {
  let best = null, s0 = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1];
    const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
    const u = Math.max(i ? 0 : -60, Math.min(i === line.length - 2 ? L + 60 : L, (x - ax) * dx + (z - az) * dz));
    const cx = ax + dx * u, cz = az + dz * u;
    const dist = Math.hypot(x - cx, z - cz);
    // right of travel is (-dz, dx) in this frame (+x east, +z south)
    const off = (x - cx) * -dz + (z - cz) * dx;
    if (!best || dist < best.dist) best = { s: s0 + u, off, dist };
    s0 += L;
  }
  return { ...best, len: s0 };
}

const greens = els.filter((e) => e.tags?.golf === 'green').map(poly);
const fairways = els.filter((e) => e.tags?.golf === 'fairway').map(poly).filter((p) => p.length > 2);
const bunkers = els.filter((e) => e.tags?.golf === 'bunker').map(poly);
const waters = els.filter((e) => /water_hazard/.test(e.tags?.golf || '') || e.tags?.natural === 'water').map(poly);

let [h0, h1] = (args.holes ? String(args.holes) : '1-99').split('-').map(Number);
h1 ||= h0;
// every bunker / pond belongs to the one hole line it sits nearest
const allLines = holesOsm.map((e) => ({ ref: parseInt(e.tags.ref, 10), line: e.geometry.map(xy) }));
const owner = (c) => {
  let best = null, bd = Infinity;
  for (const l of allLines) { const q = project(l.line, c); if (q.dist < bd) { bd = q.dist; best = l.ref; } }
  return best;
};
const bunkerOwner = bunkers.map((p) => owner(centroid(p)));
const waterOwner = waters.map((p) => owner(centroid(p)));
const holes = holesOsm
  .map((e) => ({ e, ref: parseInt(e.tags.ref, 10) }))
  .filter((h) => Number.isFinite(h.ref) && h.ref >= h0 && h.ref <= h1)
  .sort((a, b) => a.ref - b.ref)
  // one way per hole number (some courses map each tee set)
  .filter((h, i, all) => all.findIndex((o) => o.ref === h.ref) === i)
  .map(({ e, ref }) => {
    const raw = e.geometry.map(xy);
    const pts = simplify(raw);
    const sc = card?.get(ref);
    const par = sc?.par || parseInt(e.tags.par, 10) || (pts.length > 2 ? 4 : 3); // the official scorecard wins
    const end = raw[raw.length - 1];
    // the green polygon nearest the end of the hole line
    let g = null, gd = Infinity;
    for (const p of greens) { const c = centroid(p); const d = Math.hypot(c[0] - end[0], c[1] - end[1]); if (d < gd) { gd = d; g = p; } }
    const greenR = g && gd < 45 ? Math.max(11, Math.min(19, Math.sqrt(area(g) / Math.PI))) : 14;
    const fwPolys = [];
    const pr = project(pts, end);
    // fairway width from the fairway polygons along this hole (area / length)
    let fwA = 0, fwL = 0, fwS = Infinity;
    for (const p of fairways) {
      const c = centroid(p); const q = project(pts, c);
      if (q.dist > 45 || q.s < 0 || q.s > q.len) continue;
      fwPolys.push(p);
      fwA += area(p);
      let lo = Infinity, hi = -Infinity;
      for (const v of p) { const pv = project(pts, v); lo = Math.min(lo, pv.s); hi = Math.max(hi, pv.s); }
      fwL += Math.max(1, hi - lo);
      fwS = Math.min(fwS, lo);
    }
    const fw = par > 3 ? (fwL ? Math.round(Math.max(24, Math.min(46, fwA / fwL))) : 32) : 0;
    const near = (list, owners) => list.map((p, i) => ({ p, c: centroid(p), own: owners[i] })).filter((o) => o.own === ref)
      .map((o) => ({ ...o, q: project(pts, o.c) })).filter((o) => o.q.dist < 70 && o.q.s > 30 && o.q.s < o.q.len + 40);
    const ext = (p, q) => {
      // extents along and across the line of play
      const a = Math.sqrt(area(p));
      return { rx: +(Math.max(4, Math.min(22, a * 0.62))).toFixed(1), rz: +(Math.max(3, Math.min(30, a * 0.48))).toFixed(1) };
    };
    const bk = near(bunkers, bunkerOwner).slice(0, 6).map((o) => ({ t: +(o.q.s / o.q.len).toFixed(2), off: Math.round(o.q.off), ...ext(o.p, o.q) }));
    const wt = near(waters, waterOwner).filter((o) => area(o.p) > 150).slice(0, 2).map((o) => ({ t: +(o.q.s / o.q.len).toFixed(2), off: Math.round(o.q.off), ...ext(o.p, o.q), level: -0.8 }));
    const yards = sc?.yardages ? (sc.back ? sc.yardages[sc.back] : Math.max(...Object.values(sc.yardages).filter(Number.isFinite))) : Math.round(pr.len / YD);
    const from = sc?.back ? `the ${sc.back} tees` : 'the back tees';
    // real outlines: every bunker and pond along the hole, whichever hole it was mapped nearest
    const along = (list) => list.map((p) => ({ p, q: project(pts, centroid(p)) }))
      .filter((o) => o.q.dist < 90 && o.q.s > -30 && o.q.s < o.q.len + 60);
    const outlines = args.outlines ? {
      bunkers: along(bunkers).map((o) => ({ poly: simplifyRing(o.p) })),
      water: along(waters).filter((o) => area(o.p) > 150).map((o) => ({ poly: simplifyRing(o.p, 0.6) })),
      ...(fwPolys.length ? { fairways: fwPolys.map((p) => simplifyRing(p, 0.6)) } : {}),
    } : null;
    return {
      n: ref, name: e.tags.name || `Hole ${ref}`, par,
      note: `${par === 3 ? 'Par 3' : `Par ${par}`}, ${yards} yards from ${from}.${sc?.handicap_index ? ` ${cardFile ? 'Handicap' : 'Stroke index'} ${sc.handicap_index}.` : ''}`,
      pts, fw, ...(fw && Number.isFinite(fwS) ? { fwStart: Math.round(Math.max(60, fwS) / YD) } : {}),
      green: { r: Math.round(greenR), slope: [0.006, -0.008], ...(outlines && g && gd < 45 ? { poly: simplifyRing(g, 0.25) } : {}) }, pin: [0, -2],
      bunkers: outlines ? outlines.bunkers : bk, water: outlines ? outlines.water : wt,
      ...(outlines?.fairways ? { fairways: outlines.fairways } : {}),
      lm: { type: 'none', at: [0, 0] },
    };
  });

/** Compact JS literal: one hole per block, arrays and small objects inline. */
function js(v, ind = '') {
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x !== 'object' || (Array.isArray(x) && x.every((y) => typeof y !== 'object')))) return `[${v.map((x) => js(x)).join(', ')}]`;
    return `[${v.map((x) => js(x, ind)).join(', ')}]`;
  }
  if (v && typeof v === 'object') return `{ ${Object.entries(v).map(([k, x]) => `${k}: ${js(x, ind)}`).join(', ')} }`;
  return JSON.stringify(v);
}
const holeSrc = (h) => {
  const { n, name: nm, par, note, pts, ...rest } = h;
  return `    {\n      n: ${n}, name: ${js(nm)}, par: ${par},\n      note: ${js(note)},\n      pts: ${js(pts)},\n${Object.entries(rest).map(([k, v]) => `      ${k}: ${js(v)},`).join('\n')}\n    }`;
};

const name = args.name || courseTag?.tags?.name || ogName || args.id;
const place = args.place || ogCity || '';
const cardSrc = cardFile ? `the club's own card (${cardFile.source.replace(/^.*?(https?:\/\/\S+).*$/, '$1')})` : 'OpenGolfAPI';
const elevSrc = args.lidar ? 'USGS 3DEP 1 m LiDAR (public domain)' : 'AWS Terrain Tiles';
const src = `// ${name}${place ? ` · ${place}` : ''}. Imported by tools/import-course.mjs on
// ${new Date().toISOString().slice(0, 10)}: hole lines, greens, fairways, bunkers and water from
// OpenStreetMap${args.outlines ? ' (real outlines)' : ''}; scorecard from ${cardSrc};
// elevation from ${elevSrc}. Points are DEM-frame metres
// (+x east, +z south, origin ${LAT0}°, ${LON0}°).
// Data © OpenStreetMap contributors (ODbL 1.0), https://www.openstreetmap.org/copyright
export default {
  id: '${args.id}',
  name: ${JSON.stringify(name)},
  place: ${JSON.stringify(place)},
  theme: '${args.theme || 'parkland'}',
  dem: true,
  origin: [${LAT0}, ${LON0}],
  blurb: ${JSON.stringify(`${holes.length} holes routed exactly as mapped on OpenStreetMap, on real elevation.`)},
  credit: ${JSON.stringify(`Holes © OpenStreetMap contributors (ODbL); scorecard ${cardFile ? 'from the club\'s own card' : 'via OpenGolfAPI (ODbL)'}; elevation: ${args.lidar ? 'USGS 3DEP 1 m LiDAR (public domain)' : 'AWS Terrain Tiles'}`)},
  holes: [
${holes.map(holeSrc).join(',\n')},
  ],
};
`;
if (args.dry) { console.log(src); process.exit(0); }
await writeFile(`js/course/courses/${args.id}.js`, src);
console.log(`wrote js/course/courses/${args.id}.js: ${holes.length} holes, par ${holes.reduce((a, h) => a + h.par, 0)}`);

// ── 4. register it ──
const reg = await readFile('js/course/courses.js', 'utf8');
if (!reg.includes(`./courses/${args.id}.js`)) {
  const out = reg
    .replace(/(import oregon from '\.\/courses\/oregon\.js';)/, `$1\nimport ${args.id} from './courses/${args.id}.js';`)
    .replace(/export const COURSES = \[([^\]]*)\];/, (m, list) => `export const COURSES = [${list.trim()}, ${args.id}];`);
  await writeFile('js/course/courses.js', out);
  console.log('registered in js/course/courses.js');
}

// ── 5. elevation ──
if (!args['no-dem'] && args.lidar) {
  // 1 m over the playing area (every hole plus 320 m), LiDAR overviews beyond
  let ext = 0;
  for (const h of holes) for (const [x, z] of h.pts) ext = Math.max(ext, Math.abs(x), Math.abs(z));
  const size = Math.ceil((2 * (ext + 320)) / 100) * 100;
  console.log(`baking 1 m LiDAR over ${size} m…`);
  const py = process.env.LIDAR_PY || 'python3';
  const r = spawnSync(py, ['-I', 'tools/fetch-lidar.py', args.id, String(LAT0), String(LON0), '--size', String(size)], { stdio: 'inherit' });
  if (r.status) process.exit(r.status);
} else if (!args['no-dem']) {
  console.log('baking elevation…');
  const r = spawnSync(process.execPath, ['tools/fetch-dem.mjs', args.id, String(LAT0), String(LON0), '4000', '8', '16000', '64'], { stdio: 'inherit' });
  if (r.status) process.exit(r.status);
}
console.log(`done. Check it with: node tools/holes-check.mjs ${args.id}`);
