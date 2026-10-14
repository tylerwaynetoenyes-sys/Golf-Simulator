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
  return { meta, h, at, half };
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
  const m = d.dem.half - 40;
  const ax = Math.abs(x), az = Math.abs(z);
  if (ax < m && az < m) return d.dem.at(x, z);
  const far = d.far.at(x, z);
  if (ax > d.dem.half || az > d.dem.half) return far;
  const k = Math.min(1, Math.max((ax - m) / 40, (az - m) / 40));
  return d.dem.at(x, z) * (1 - k) + far * k;
}
