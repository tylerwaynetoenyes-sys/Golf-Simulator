// Real elevation for a course, baked by tools/fetch-dem.mjs from the open
// Terrarium tiles (USGS 3DEP / SRTM). Two grids per course: `dem` (the playable
// area, a few metres per sample) and `far` (a wide, coarse backdrop). Both are
// Uint16 centimetres above the grid minimum, centred on the course origin,
// +x east and +z south.

const cache = new Map();

async function loadGrid(base, name) {
  const [meta, buf] = await Promise.all([
    fetch(`${base}/${name}.json`).then((r) => { if (!r.ok) throw new Error(`${name}.json ${r.status}`); return r.json(); }),
    fetch(`${base}/${name}.bin`).then((r) => { if (!r.ok) throw new Error(`${name}.bin ${r.status}`); return r.arrayBuffer(); }),
  ]);
  return gridFrom(meta, buf);
}

/**
 * Sentinel-2 true colour over the backdrop (tools/fetch-sat.py), in the same
 * frame as `far`. Browser only; resolves to null where it is missing.
 * `image` covers the extent with north at the top.
 */
async function loadSat(base) {
  if (typeof document === 'undefined') return null;
  try {
    const meta = await fetch(`${base}/sat.json`).then((r) => (r.ok ? r.json() : null));
    if (!meta) return null;
    const img = new Image();
    img.src = `${base}/sat.jpg`;
    await img.decode();
    const half = meta.size / 2;
    return { meta, image: img, inside: (x, z) => Math.abs(x) < half && Math.abs(z) < half };
  } catch (e) {
    console.warn('satellite colour unavailable', e);
    return null;
  }
}

/** OpenStreetMap buildings round the course (tools/fetch-buildings.mjs), if baked. Browser only. */
async function loadCity(base) {
  if (typeof document === 'undefined') return null;
  try {
    const r = await fetch(`${base}/buildings.json`);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/**
 * Surveyed trees (tools/fetch-trees.py, from the LiDAR point cloud), if baked:
 * [x, z, height, crownRadius, conifer] in DEM-frame metres. Browser only.
 */
async function loadTrees(base) {
  if (typeof document === 'undefined') return null;
  try {
    const r = await fetch(`${base}/trees.json`);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** A sampler over one baked grid (exported for the Node tools). */
export function gridFrom(meta, buf) {
  const q = new Uint16Array(buf);
  const h = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) h[i] = meta.min + q[i] / 100;
  const { n, step, size } = meta;
  const half = size / 2;
  /** Bilinear height (m above sea level) at DEM-frame metres; clamps at the edge. */
  const at = (x, z) => {
    const fi = Math.min(n - 1.001, Math.max(0, (x + half) / step));
    const fj = Math.min(n - 1.001, Math.max(0, (z + half) / step));
    const i = Math.floor(fi), j = Math.floor(fj);
    const u = fi - i, v = fj - j;
    const k = j * n + i;
    return h[k] * (1 - u) * (1 - v) + h[k + 1] * u * (1 - v) + h[k + n] * (1 - u) * v + h[k + n + 1] * u * v;
  };
  // Catmull-Rom bicubic: continuous slope across cells, so fairways roll
  // instead of creasing every `step` metres (what the ball and mesh play on).
  const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  const H = (i, j) => h[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))];
  const smooth = (x, z) => {
    const fi = Math.min(n - 1.001, Math.max(0, (x + half) / step));
    const fj = Math.min(n - 1.001, Math.max(0, (z + half) / step));
    const i = Math.floor(fi), j = Math.floor(fj);
    const u = fi - i, v = fj - j;
    const row = (jj) => cr(H(i - 1, jj), H(i, jj), H(i + 1, jj), H(i + 2, jj), u);
    return cr(row(j - 1), row(j), row(j + 1), row(j + 2), v);
  };
  return { meta, h, at, smooth, half };
}

/** Load (once) the elevation for a course; resolves to {dem, far}. */
export function loadDem(id) {
  if (!cache.has(id)) {
    const base = `assets/courses/${id}`;
    cache.set(id, Promise.all([loadGrid(base, 'dem'), loadGrid(base, 'far'), loadSat(base), loadCity(base), loadTrees(base)]).then(([dem, far, sat, city, trees]) => {
      const out = { dem, far, sat, city, trees };
      ready.set(id, out);
      return out;
    }).catch((e) => { cache.delete(id); throw e; }));
  }
  return cache.get(id);
}

const ready = new Map();
/** The loaded elevation for a course, or null if not loaded yet. */
export const demFor = (id) => ready.get(id) || null;

/**
 * Height in the playable area, blending into the backdrop grid outside it.
 * Returns metres above sea level at DEM-frame metres (x east, z south).
 */
export function demHeight(d, x, z) {
  const m = d.dem.half - 160;
  const ax = Math.abs(x), az = Math.abs(z);
  if (ax < m && az < m) return d.dem.smooth(x, z);
  const far = d.far.smooth(x, z);
  if (ax > d.dem.half - 8 || az > d.dem.half - 8) return far;
  let k = Math.min(1, Math.max((ax - m) / 152, (az - m) / 152));
  k = k * k * (3 - 2 * k);
  return d.dem.smooth(x, z) * (1 - k) + far * k;
}

/**
 * A hole's frame on the DEM: hole-local metres (+x golfer's right, -z down the
 * first segment, tee at the origin) to DEM-frame metres, and heights relative
 * to the tee. Built by prepareDemHoles; read by HoleTerrain and CourseWorld.
 */
export function demFrame(d, tee, next) {
  const len = Math.hypot(next[0] - tee[0], next[1] - tee[1]);
  const fx = (next[0] - tee[0]) / len, fz = (next[1] - tee[1]) / len;
  const rx = -fz, rz = fx; // golfer's right
  const ox = tee[0], oz = tee[1];
  const teeH = demHeight(d, ox, oz);
  const toDem = (x, z) => [ox + x * rx - z * fx, oz + x * rz - z * fz];
  const toLocal = (X, Z) => {
    const px = X - ox, pz = Z - oz;
    return [px * rx + pz * rz, -(px * fx + pz * fz)];
  };
  /** Ground height (m, tee = 0) at hole-local metres. */
  const height = (x, z) => demHeight(d, ox + x * rx - z * fx, oz + x * rz - z * fz) - teeH;
  // heading of the hole's forward axis, radians clockwise from north
  const bearing = Math.atan2(fx, -fz);
  return { ox, oz, fx, fz, rx, rz, teeH, toDem, toLocal, height, bearing, d };
}

const YD = 0.9144;
/**
 * DEM courses author holes in DEM-frame metres (`pts`). Turn each into the
 * standard hole shape (centre line in yards, tee at the origin, first
 * segment straight ahead) with its `demFrame` attached.
 */
/**
 * Drown false bars in a river: the Terrarium tiles smear the bank into the
 * channel, and with the pool drawn at its true level a strip of ground can
 * stand just above it, a "dike" that isn't there. `riverbed` polygons (DEM
 * metres) hold the ground at least `depth` below the water level, once.
 */
function carveRiverbed(d, polys, level, depth = 1.5) {
  if (d.carved || !polys?.length || level == null) return;
  d.carved = true;
  const inPoly = (x, z, p) => {
    let c = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [x1, z1] = p[i], [x2, z2] = p[j];
      if ((z1 > z) !== (z2 > z) && x < ((x2 - x1) * (z - z1)) / (z2 - z1) + x1) c = !c;
    }
    return c;
  };
  for (const g of [d.dem, d.far]) {
    const { n, step } = g.meta;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -g.half + i * step, z = -g.half + j * step, k = j * n + i;
      if (g.h[k] > level - depth && polys.some((p) => inPoly(x, z, p))) g.h[k] = level - depth;
    }
  }
}

export function prepareDemHoles(course, d) {
  carveRiverbed(d, course.riverbed, course.waterLevel);
  // far landmarks may be given by latitude/longitude: convert to DEM metres
  const { lat, lon } = d.dem.meta;
  const mLat = (Math.PI / 180) * 6378137, mLon = mLat * Math.cos((lat * Math.PI) / 180);
  const far = (course.far || []).map((f) => (f.ll ? { ...f, dem: [(f.ll[1] - lon) * mLon, -(f.ll[0] - lat) * mLat] } : f));
  return course.holes.map((h) => {
    const f = demFrame(d, h.pts[0], h.pts[1]);
    const line = h.pts.map(([X, Z]) => { const [x, z] = f.toLocal(X, Z); return [x / YD, z / YD]; });
    // mapped outlines (greens, bunkers, ponds, fairways) come in DEM metres too
    const loc = (p) => p.map(([X, Z]) => f.toLocal(X, Z));
    const withPoly = (o) => (o.poly ? { ...o, poly: loc(o.poly) } : o);
    return {
      ...h, line, demFrame: f, course: course.id, theme: course.theme, far, buildings: course.buildings ?? null, cityPull: course.cityPull ?? null, enrich: !!course.enrich, quays: !!course.quays, noShore: !!course.noShore, life: course.life || 'club',
      green: withPoly(h.green),
      bunkers: (h.bunkers || []).map(withPoly),
      ...(h.fairways ? { fairways: h.fairways.map(loc) } : {}),
      // sea or river surface (m above sea level): water wherever the ground is below it
      water: (h.water || []).map(withPoly), waterLevel: course.waterLevel ?? null, waterTint: course.waterTint ?? null,
      // regions where the rock is a different colour (DEM metres, radius, hex)
      rockZones: (course.rockZones || []).map((z) => (z.ll ? { ...z, dem: [(z.ll[1] - lon) * mLon, -(z.ll[0] - lat) * mLat] } : z)),
      elev: [[0, 0], [1, 0]],
    };
  });
}
