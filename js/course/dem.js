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
    cache.set(id, Promise.all([loadGrid(base, 'dem'), loadGrid(base, 'far')]).then(([dem, far]) => {
      const out = { dem, far };
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
export function prepareDemHoles(course, d) {
  return course.holes.map((h) => {
    const f = demFrame(d, h.pts[0], h.pts[1]);
    const line = h.pts.map(([X, Z]) => { const [x, z] = f.toLocal(X, Z); return [x / YD, z / YD]; });
    return { ...h, line, demFrame: f, course: course.id, theme: course.theme, elev: [[0, 0], [1, 0]] };
  });
}
