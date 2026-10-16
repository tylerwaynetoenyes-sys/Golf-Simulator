// The real city round a course: OpenStreetMap footprints extruded to their
// mapped heights on the real ground (tools/fetch-buildings.mjs). Styles:
//   paris  Haussmann blocks: cut-limestone fronts with tall French windows
//          and iron balcony rails, grey zinc mansard roofs
//   nyc    glass curtain walls on the towers, brick and stone below
// Geometry is merged per 400 m cell so off-screen blocks are culled; lit
// windows glow at night (the materials go in CourseWorld's glow list).
import * as THREE from 'three';
import { pbr } from '../scene/pbr.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const CELL = 400;

function inside(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

function tex(w, h, draw, linear = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

let rs = 7;
const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);

/** One texture tile is 4 bays by 2 floors. */
const STYLE = {
  // houses round a course: one or two storeys under a hipped roof (see hipRoof)
  carmel: { roof: 'hip', house: true, lamp: '#ffd7a0' },
  florida: { roof: 'hip', house: true, lamp: '#ffe0b0' },
  midwest: { roof: 'hip', house: true, lamp: '#ffd090' },
  paris: {
    bay: 3.4, floor: 3.25, roof: 'mansard',
    facade: (g, w, h) => {
      g.fillStyle = '#d8ccb2'; g.fillRect(0, 0, w, h);
      // limestone courses
      g.fillStyle = 'rgba(120,100,70,0.12)';
      for (let y = 0; y < h; y += h / 12) g.fillRect(0, y, w, 1.5);
      const bw = w / 4, fh = h / 2;
      for (let f = 0; f < 2; f++) for (let b = 0; b < 4; b++) {
        const x = b * bw + bw * 0.27, y = f * fh + fh * 0.16, ww = bw * 0.46, wh = fh * 0.66;
        g.fillStyle = '#c7b897'; g.fillRect(x - 3, y - 4, ww + 6, wh + 8); // moulded surround
        g.fillStyle = '#39424b'; g.fillRect(x, y, ww, wh);
        g.fillStyle = 'rgba(210,225,235,0.25)'; g.fillRect(x + 2, y + 2, ww * 0.4, wh - 4);
        g.strokeStyle = '#d9cfb8'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + ww / 2, y); g.lineTo(x + ww / 2, y + wh); g.stroke();
        // wrought-iron balcony rail across the bottom of the window
        g.fillStyle = '#1d1f22'; g.fillRect(x - 4, y + wh - 10, ww + 8, 3);
        for (let k = 0; k <= 6; k++) g.fillRect(x - 3 + (k * (ww + 6)) / 6, y + wh - 10, 1.5, 12);
      }
    },
    lamp: '#ffcf8a', wall: 0xffffff, zinc: 0x6f7b85, cap: 0x5d666e,
  },
  nyc: {
    bay: 3.0, floor: 3.4, roof: 'flat',
    // pre-war Manhattan: limestone, buff brick and brown brick, punched windows with sills
    // and a cornice band every few floors; glass only on the supertall and the odd modern tower
    walls: [['#c9bea9', '#b3a78f'], ['#b39a7a', '#9d8467'], ['#8c6250', '#76503f'], ['#a9a59d', '#928e86']].map(([base, band]) => (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      // brick or stone grain
      for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rnd() * 0.05})`; g.fillRect(rnd() * w, rnd() * h, 3 + rnd() * 6, 1.5); }
      g.fillStyle = band; g.fillRect(0, 0, w, 5); // the band course at each second floor
      const bw = w / 4, fh = h / 2;
      for (let f = 0; f < 2; f++) for (let b = 0; b < 4; b++) {
        const x = b * bw + bw * 0.25, y = f * fh + fh * 0.2, ww = bw * 0.5, wh = fh * 0.58;
        g.fillStyle = '#262c31'; g.fillRect(x, y, ww, wh);
        g.fillStyle = 'rgba(190,205,215,0.22)'; g.fillRect(x + 2, y + 2, ww * 0.45, wh * 0.5); // a sky reflection in the upper sash
        g.fillStyle = '#d9d0bf'; g.fillRect(x - 2, y + wh, ww + 4, 3); // the sill
        g.fillStyle = 'rgba(30,30,30,0.35)'; g.fillRect(x, y + wh * 0.5, ww, 2); // the meeting rail
      }
    }),
    glass: (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, '#8a9ba3'); gr.addColorStop(0.5, '#5d6f78'); gr.addColorStop(1, '#748890');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(25,30,34,0.7)';
      for (let y = 0; y < h; y += h / 2) g.fillRect(0, y, w, 4); // spandrels
      for (let x = 0; x < w; x += w / 4) g.fillRect(x, 0, 2, h); // mullions
    },
    glassOver: 150, // metres: Billionaires' Row and the Midtown towers
    lamp: '#fff1d0', wall: 0xffffff, zinc: 0x555a60, cap: 0x5e5a55,
  },
};

// Real surfaces: photographed stone, brick and slate (js/scene/pbr.js, triplanar at true
// scale), with the windows drawn into the wall by the facade shader (recessed glass that
// reflects the sky, frames, sills, balconies, lit at random after dark).
const REAL = {
  // Pebble Beach (photographed along the 1st and 18th): warm cream stucco and tan stone under
  // grey-brown shake roofs, the odd Spanish Revival house in red tile; white-trimmed windows
  carmel: {
    walls: [
      ['white_stucco', { scale: 3, tint: 0xf1e8d8 }, { bay: 4.2, floor: 3.0, win: [0.3, 0.7, 0.3, 0.8], frame: 0xf4f1ea, lit: 0.35 }],
      ['white_sandstone_bricks', { scale: 2.8, tint: 0xe6d6bc }, { bay: 4.2, floor: 3.0, win: [0.3, 0.7, 0.3, 0.8], frame: 0xf4f1ea, lit: 0.35 }],
      ['white_plaster_02', { scale: 3, tint: 0xe9dcc6 }, { bay: 4.2, floor: 3.0, win: [0.3, 0.7, 0.3, 0.8], frame: 0xf4f1ea, lit: 0.35 }],
    ],
    roofs: [['roof_slates_02', { scale: 1.6, tint: 0x8a7f74 }], ['roof_slates_02', { scale: 1.6, tint: 0x6f665e }], ['clay_roof_tiles_02', { scale: 2, tint: 0xd09a7c }]],
    glass: null,
    roof: ['roof_slates_02', { scale: 1.6, tint: 0x7a7068 }],
    cap: ['roof_slates_02', { scale: 1.6, tint: 0x7a7068 }],
  },
  // Ponte Vedra (the Stadium clubhouse and the homes round it): cream and sand stucco under barrel tile
  florida: {
    walls: [
      ['white_stucco', { scale: 3, tint: 0xf3e9d6 }, { bay: 4.2, floor: 3.0, win: [0.3, 0.7, 0.3, 0.8], frame: 0xf4f1ea, lit: 0.35 }],
      ['white_stucco', { scale: 3, tint: 0xead6bb }, { bay: 4.2, floor: 3.0, win: [0.3, 0.7, 0.3, 0.8], frame: 0xf4f1ea, lit: 0.35 }],
      ['white_plaster_02', { scale: 3, tint: 0xf2ece2 }, { bay: 4.2, floor: 3.0, win: [0.3, 0.7, 0.3, 0.8], frame: 0xf4f1ea, lit: 0.35 }],
    ],
    roofs: [['clay_roof_tiles_02', { scale: 2, tint: 0xe0ae8c }], ['clay_roof_tiles_02', { scale: 2, tint: 0xc9a68e }]],
    glass: null,
    roof: ['clay_roof_tiles_02', { scale: 2, tint: 0xe0ae8c }],
    cap: ['clay_roof_tiles_02', { scale: 2, tint: 0xd8a888 }],
  },
  // Godfrey, Illinois (the Rolling Hills clubhouse is a low ranch): tan brick and beige siding under brown shingles
  midwest: {
    walls: [
      ['white_sandstone_bricks', { scale: 2.6, tint: 0xdcc09c }, { bay: 4.2, floor: 3.0, win: [0.3, 0.7, 0.3, 0.8], frame: 0xf4f1ea, lit: 0.35 }], // tan brick
      ['wood_planks_grey', { scale: 1.6, tint: 0xece4d4 }, { bay: 4.2, floor: 3.0, win: [0.3, 0.7, 0.3, 0.8], frame: 0xf6f4ee, lit: 0.35 }],
      ['wood_planks_grey', { scale: 1.6, tint: 0xd8ccb4 }, { bay: 4.2, floor: 3.0, win: [0.3, 0.7, 0.3, 0.8], frame: 0xf6f4ee, lit: 0.35 }],
    ],
    roofs: [['roof_slates_02', { scale: 1.4, tint: 0x6a5a4c }], ['roof_slates_02', { scale: 1.4, tint: 0x55504a }]],
    glass: null,
    roof: ['roof_slates_02', { scale: 1.4, tint: 0x6a5a4c }],
    cap: ['roof_slates_02', { scale: 1.4, tint: 0x6a5a4c }],
  },
  paris: {
    walls: [
      // cut limestone with a shopfront on the ground floor and the iron balconies on the 2nd and 5th
      ['white_sandstone_bricks', { scale: 3.2, tint: 0xf4ead6 }, { bay: 3.4, floor: 3.2, win: [0.3, 0.7, 0.12, 0.86], frame: 0xece6da, balcony: 1, shop: 4.6, lit: 0.42 }],
      ['white_sandstone_bricks', { scale: 3.2, tint: 0xe9dcc4 }, { bay: 3.4, floor: 3.2, win: [0.3, 0.7, 0.12, 0.86], frame: 0xf2ede4, balcony: 1, shop: 4.6, lit: 0.36 }],
      ['white_plaster_02', { scale: 3, tint: 0xeee2cc }, { bay: 3.2, floor: 3.0, win: [0.3, 0.7, 0.14, 0.84], frame: 0xf4f0e8, balcony: 0.3, shop: 4.2, lit: 0.4 }],
    ],
    glass: null,
    roof: ['roof_slates_02', { scale: 2, tint: 0x8892a0 }], // zinc and slate mansards
    cap: ['concrete_wall_008', { scale: 4, tint: 0x8f8a84 }],
  },
  nyc: {
    walls: [
      ['white_sandstone_bricks', { scale: 3, tint: 0xe6dccb, bright: 1.4 }, { bay: 3, floor: 3.4, win: [0.27, 0.73, 0.2, 0.8], frame: 0xf0ece2, lit: 0.45 }],
      ['white_sandstone_bricks', { scale: 2.6, tint: 0xdcc6a4, bright: 1.35 }, { bay: 3, floor: 3.3, win: [0.28, 0.72, 0.2, 0.8], frame: 0xece6da, lit: 0.45 }], // buff brick
      ['red_brick', { scale: 2.4, tint: 0xb4a49c, bright: 1.3 }, { bay: 3, floor: 3.3, win: [0.28, 0.72, 0.2, 0.8], frame: 0x2a2f2c, lit: 0.45 }],
      ['concrete_wall_008', { scale: 4, tint: 0xd4cfc6, bright: 1.35 }, { bay: 3, floor: 3.4, win: [0.2, 0.8, 0.22, 0.78], frame: 0x3a3e42, lit: 0.4 }],
    ],
    // curtain walls: a slim grid of mullions and spandrels round all but floor-to-ceiling glass
    glass: ['painted_steel', { scale: 3, tint: 0x6a7378, metal: 0.5 }, { bay: 1.6, floor: 4, win: [0.04, 0.96, 0.1, 0.92], frame: 0x30363a, lit: 0.3 }],
    roof: ['roof_slates_02', { scale: 2, tint: 0x6f6a66 }],
    cap: ['gravel_stones', { scale: 3, tint: 0x9a958e }],
  },
};

function windowsGlow(lampColor) {
  return tex(256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const bw = w / 4, fh = h / 2;
    for (let f = 0; f < 2; f++) for (let b = 0; b < 4; b++) {
      if (rnd() < 0.5) { g.fillStyle = lampColor; g.fillRect(b * bw + bw * 0.27, f * fh + fh * 0.16, bw * 0.46, fh * 0.66); }
    }
  });
}

// average colour of each roof texture (linear), so a building's aerial colour can be laid over it
const MEAN = Object.fromEntries(Object.entries({ clay: [0x96, 0x52, 0x2e], slate: [0x92, 0x87, 0x77], flat: [0x8d, 0x85, 0x70] })
  .map(([k, c]) => [k, c.map((v) => (v / 255) ** 2.2)]));

/** Which roof (from the LiDAR's flat or pitched, and the aerial colour), and the tint that turns the texture into that colour. */
function roofKind(hex, pitched = true) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(...c), mn = Math.min(...c), v = mx, sat = mx ? (mx - mn) / mx : 0;
  let hue = 0;
  if (mx > mn) {
    const [r, g, bb] = c, d = mx - mn;
    hue = mx === r ? ((g - bb) / d) % 6 : mx === g ? (bb - r) / d + 2 : (r - g) / d + 4;
    hue = (hue * 60 + 360) % 360;
  }
  // the LiDAR says flat or pitched; the colour says tile or not
  const kind = sat > 0.22 && (hue < 42 || hue > 335) && v > 0.25 && pitched ? 'clay' : !pitched ? 'flat' : 'slate';
  const tint = c.map((x, i) => Math.min(2.2, Math.max(0.25, x ** 2.2 / MEAN[kind][i])));
  return { kind, tint };
}

/** Clip a polygon to an axis-aligned rectangle (Sutherland-Hodgman). */
function clipRect(poly, x0, z0, x1, z1) {
  let out = poly;
  for (const [ax, sgn, lim] of [[0, 1, x0], [0, -1, x1], [1, 1, z0], [1, -1, z1]]) {
    const inp = out; out = [];
    if (!inp.length) break;
    for (let i = 0; i < inp.length; i++) {
      const p = inp[i], q = inp[(i + 1) % inp.length];
      const pi = (p[ax] - lim) * sgn >= 0, qi = (q[ax] - lim) * sgn >= 0;
      if (pi) out.push(p);
      if (pi !== qi) { const t = (lim - p[ax]) / (q[ax] - p[ax]); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
  }
  return out;
}

/**
 * A building measured by LiDAR (tools/fetch-building-shapes.py; its `roof`
 * height map and `c` roof colour): walls from
 * the ground up to the surveyed roof (so gable ends and towers rise where they
 * are), and the roof itself from the height map, in tile, slate or a pale
 * flat roof chosen and tinted from the aerial photograph.
 */
function surveyed(b, pts, h0, base, W, C, F, step, wallStep = 1.5, gAt = () => base) {
  const r = b.roof, rows = r.d.length / r.w;
  // roof height (m above the ground) at a hole-local point, bilinear between cell centres
  const H = (x, z) => {
    const [X, Z] = F.toDem(x, z);
    const fi = Math.min(r.w - 1.001, Math.max(0, (X - r.x) / r.c - 0.5)), fj = Math.min(rows - 1.001, Math.max(0, (Z - r.z) / r.c - 0.5));
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const g = (a, bb) => r.d[bb * r.w + a] / 10;
    return g(i, j) * (1 - u) * (1 - v) + g(i + 1, j) * u * (1 - v) + g(i, j + 1) * (1 - u) * v + g(i + 1, j + 1) * u * v;
  };
  const n = pts.length;
  // walls: each side in steps of at most 1.5 m, its top read from the roof just inside the wall
  let run = 0;
  const off = Math.floor(rnd() * 300) * 3.4 * 4;
  for (let i = 0; i < n; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % n];
    const L = Math.hypot(x2 - x1, z2 - z1);
    if (L < 0.05) continue;
    let nx = -(z2 - z1) / L, nz = (x2 - x1) / L;
    if (!inside(pts, (x1 + x2) / 2 + nx * 0.4, (z1 + z2) / 2 + nz * 0.4)) { nx = -nx; nz = -nz; }
    const m = Math.max(1, Math.ceil(L / wallStep));
    const top = (t) => { const x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t; return [x, z, base + Math.max(2.2, H(x + nx * 0.6, z + nz * 0.6)), gAt(x, z)]; };
    let a = top(0);
    for (let k = 1; k <= m; k++) {
      const bb = top(k / m);
      const u0 = off + run + (L * (k - 1)) / m, u1 = off + run + (L * k) / m;
      W.push([a[0], h0, a[1], u0, h0 - a[3]], [bb[0], h0, bb[1], u1, h0 - bb[3]], [bb[0], bb[2], bb[1], u1, bb[2] - bb[3]], [a[0], h0, a[1], u0, h0 - a[3]], [bb[0], bb[2], bb[1], u1, bb[2] - bb[3]], [a[0], a[2], a[1], u0, a[2] - a[3]]);
      a = bb;
    }
    run += L;
  }
  // the roof: the footprint cut into step-sized cells, each lifted to the surveyed heights
  const { kind, tint } = roofKind(b.c || '#8a8278', (b.h ?? 0) - (b.e ?? 0) > 1.0);
  const list = C.mroof[kind];
  const put = (x, z) => list.push([x, base + Math.max(2.2, H(x, z)) + 0.05, z, 0, 0, tint[0], tint[1], tint[2]]);
  let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
  for (const [x, z] of pts) { bx0 = Math.min(bx0, x); bz0 = Math.min(bz0, z); bx1 = Math.max(bx1, x); bz1 = Math.max(bz1, z); }
  for (let z = bz0; z < bz1; z += step) {
    for (let x = bx0; x < bx1; x += step) {
      const xa = x, xb = Math.min(bx1, x + step), za = z, zb = Math.min(bz1, z + step);
      const corners = [[xa, za], [xb, za], [xb, zb], [xa, zb]];
      const full = corners.every(([cx, cz]) => inside(pts, cx, cz)) && !pts.some(([px, pz]) => px > xa && px < xb && pz > za && pz < zb);
      if (full) {
        for (const k of [0, 1, 2, 0, 2, 3]) put(...corners[k]);
        continue;
      }
      const piece = clipRect(pts, xa, za, xb, zb);
      if (piece.length < 3) continue;
      let tris;
      try { tris = THREE.ShapeUtils.triangulateShape(piece.map(([px, pz]) => new THREE.Vector2(px, pz)), []); } catch { tris = []; }
      for (const t of tris) for (const k of t) put(...piece[k]);
    }
  }
}

/**
 * A hipped roof for a house: the footprint's smallest enclosing rectangle
 * (aligned to one of its own walls), an eave 0.45 m out, the ridge along the
 * long side at about 22°. Null when the footprint fills less than half of that
 * rectangle (an L or a courtyard), so a flat roof is used instead.
 * Returns triangle vertices [x, y, z, u, v].
 */
function hipRoof(pts, y0) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % n]; area += x1 * z2 - x2 * z1; }
  area = Math.abs(area) / 2;
  let best = null;
  for (let i = 0; i < n; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % n];
    const L = Math.hypot(x2 - x1, z2 - z1);
    if (L < 1) continue;
    const ux = (x2 - x1) / L, uz = (z2 - z1) / L, vx = -uz, vz = ux;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of pts) { const a = x * ux + z * uz, b = x * vx + z * vz; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
    const A = (a1 - a0) * (b1 - b0);
    if (!best || A < best.A) best = { A, ux, uz, vx, vz, a0, a1, b0, b1 };
  }
  if (!best || area / best.A < 0.5) return null;
  let { ux, uz, vx, vz, a0, a1, b0, b1 } = best;
  // the ridge runs along the long side
  if (a1 - a0 < b1 - b0) { [ux, uz, vx, vz, a0, a1, b0, b1] = [vx, vz, -ux, -uz, b0, b1, -a1, -a0]; }
  const e = 0.45;
  a0 -= e; a1 += e; b0 -= e; b1 += e;
  const half = (b1 - b0) / 2, rise = half * 0.4;
  const at = (a, b, y) => [a * ux + b * vx, y, a * uz + b * vz];
  const bm = (b0 + b1) / 2;
  const c = [at(a0, b0, y0), at(a1, b0, y0), at(a1, b1, y0), at(a0, b1, y0)];
  const r0 = at(Math.min(a0 + half, (a0 + a1) / 2), bm, y0 + rise), r1 = at(Math.max(a1 - half, (a0 + a1) / 2), bm, y0 + rise);
  const tri = (p, q, r) => [[...p, 0, 0], [...q, 1, 0], [...r, 0.5, 1]];
  // two long slopes (as two triangles each) and two hip ends, wound to face out and up
  const v = [
    ...tri(c[0], r1, c[1]), ...tri(c[0], r0, r1),
    ...tri(c[2], r0, c[3]), ...tri(c[2], r1, r0),
    ...tri(c[1], r1, c[2]), ...tri(c[3], r0, c[0]),
  ];
  return v.map((p) => [p[0], p[1], p[2], p[3], p[4]]);
}

/**
 * @param data   buildings.json ({buildings:[{p:[x,z,...], h, mh}]}), DEM frame
 * @param T      HoleTerrain (with its DEM frame T.F)
 * @param style  'paris' | 'nyc'
 * @param pull   {from, k}: beyond `from` metres, distances shrink by k
 *               (a long-lens view: the far skyline at true size, nearer)
 * @returns {{group, glow:THREE.Material[], haze:THREE.Material[]}}
 */
export function buildCity(data, T, style = 'paris', pull = null) {
  const S = STYLE[style] || STYLE.paris;
  rs = 7;
  const R = REAL[style] || REAL.paris;
  const real = ([id, o, facade]) => pbr(id, { ...o, side: THREE.DoubleSide, ...(facade ? { facade } : {}) });
  const walls = R.walls.map(real);
  const mats = {
    wall: walls[0],
    glass: R.glass ? real(R.glass) : null,
    zinc: real(R.roof),
    cap: real(R.cap),
  };
  const roofMats = (R.roofs || []).map(([id, o]) => pbr(id, { ...o, side: THREE.DoubleSide }));
  // surveyed roofs (tools/fetch-building-shapes.py): the real material, tinted per building to its aerial colour
  const MROOF = {
    clay: pbr('clay_roof_tiles_02', { scale: 2, side: THREE.DoubleSide, vertex: true }),
    slate: pbr('roof_slates_02', { scale: 1.6, side: THREE.DoubleSide, vertex: true }),
    flat: pbr('concrete_wall_008', { scale: 4, side: THREE.DoubleSide, vertex: true }),
  };
  // walls tagged in OpenStreetMap (building:material, building:colour): that material, or that colour
  // laid over the style's stone (rounded to a coarse palette, so a few materials serve every tagged building)
  const fac = R.walls[0][2];
  const TAGMAT = { brick: ['red_brick', 2.4], stone: ['white_sandstone_bricks', 3], limestone: ['white_sandstone_bricks', 3], sandstone: ['sandstone_blocks_08', 2.5],
    concrete: ['concrete_wall_008', 4], plaster: ['white_stucco', 3], stucco: ['white_stucco', 3], wood: ['wood_planks_grey', 2], timber_framing: ['wood_planks_grey', 2],
    metal: ['painted_steel', 2], metal_plates: ['painted_steel', 2], steel: ['painted_steel', 2] };
  const NAMED = { white: 0xf0eee8, beige: 0xd9c7a5, black: 0x3a3836, brown: 0x7a5a44, red: 0xa8483a, gray: 0x9a9894, grey: 0x9a9894, lightgrey: 0xc8c6c2, lightgray: 0xc8c6c2,
    silver: 0xc0c0bc, darkgray: 0x5a5856, darkgrey: 0x5a5856, yellow: 0xd8c070, tan: 0xc8a97e, cream: 0xefe6cc, blue: 0x6a7a9a, green: 0x6a8a6a, orange: 0xc87a48, pink: 0xd8a8a0 };
  const tagMats = new Map();
  const tagWall = (m) => {
    const t = String(m).toLowerCase().trim();
    let key, make;
    if (t === 'glass' || t === 'mirror') {
      if (!mats.glass) return null;
      key = 'glass'; make = () => mats.glass;
    } else if (TAGMAT[t]) {
      key = t; make = () => pbr(TAGMAT[t][0], { scale: TAGMAT[t][1], side: THREE.DoubleSide, facade: fac, bright: 1.3 });
    } else {
      const hex = t.startsWith('#') && /^#[0-9a-f]{6}$/.test(t) ? parseInt(t.slice(1), 16) : NAMED[t];
      if (hex == null) return null;
      const q = (v) => Math.min(255, Math.round(v / 40) * 40 + 12);
      const qh = (q((hex >> 16) & 255) << 16) | (q((hex >> 8) & 255) << 8) | q(hex & 255);
      key = `c${qh}`; make = () => pbr('white_sandstone_bricks', { scale: 3, tint: qh, bright: 2, side: THREE.DoubleSide, facade: fac });
    }
    if (!tagMats.has(key)) tagMats.set(key, make());
    return key;
  };
  const seats = []; // [x, z, base]: where each building stands (for the ground check)
  const cells = new Map();
  const cell = (x, z) => {
    const k = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    if (!cells.has(k)) cells.set(k, { wall: walls.map(() => []), tag: new Map(), roof: roofMats.map(() => []), mroof: { clay: [], slate: [], flat: [] }, glass: [], zinc: [], cap: [] });
    return cells.get(k);
  };
  const F = T.F;
  for (const b of data.buildings) {
    const n = b.p.length / 2;
    if (n < 3) continue;
    let pts = [];
    for (let i = 0; i < n; i++) pts.push(F.toLocal(b.p[i * 2], b.p[i * 2 + 1]));
    if (pull) {
      // move the whole footprint in toward the course, keeping its shape
      let mx = 0, mz = 0;
      for (const [x, z] of pts) { mx += x; mz += z; }
      mx /= n; mz /= n;
      const d = Math.hypot(mx, mz);
      if (d > pull.from) {
        const s2 = (pull.from + (d - pull.from) * pull.k) / d;
        const dx = mx * (s2 - 1), dz = mz * (s2 - 1);
        pts = pts.map(([x, z]) => [x + dx, z + dz]);
      }
    }
    let cx = 0, cz = 0, area = 0;
    for (let i = 0; i < n; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % n];
      area += x1 * z2 - x2 * z1; cx += x1; cz += z1;
    }
    cx /= n; cz /= n;
    area /= 2;
    if (Math.abs(area) < 12) continue;
    // keep the field of play clear
    // (every corner and edge midpoint, not just the middle: a big footprint behind the tee can reach over it)
    // (round a course's own houses, only what really stands in the line of play: the clubhouse
    // behind the first tee and the homes along the out-of-bounds line are where they really are)
    const inPlay = S.house
      ? (x, z) => { const pr = T.project(x, z); return Math.abs(pr.d) < T.oobLateral * 0.7 && pr.s > -6 && pr.s < T.length + 15; }
      : (x, z) => { const pr = T.project(x, z); return Math.abs(pr.d) < T.oobLateral + 4 && pr.s > -40 && pr.s < T.length + 60; };
    if (inPlay(cx, cz) || pts.some(([x, z], i) => { const [x2, z2] = pts[(i + 1) % n]; return inPlay(x, z) || inPlay((x + x2) / 2, (z + z2) / 2); })) continue;
    // seated on its own ground: walls reach below the lowest corner (no gap on a slope), and the
    // building stands from the footprint's average ground, eaves clear of the highest corner
    const gs = pts.map(([x, z]) => T.drawnHeight(x, z));
    gs.push(T.drawnHeight(cx, cz));
    const gMin = Math.min(...gs), gMax = Math.max(...gs), gMean = gs.reduce((a, v) => a + v, 0) / gs.length;
    const h0 = gMin - 0.6;
    // a gentle lot is built from its high side, foundation showing downhill, so no floor is ever
    // buried; a steep one is terraced into the slope from its average ground
    const seat = gMax - gMin < 1.8 ? gMax : gMean;
    seats.push([cx, cz, seat]);
    // houses: one or two storeys, a clubhouse or lodge two or three (OSM rarely says)
    const A = Math.abs(area);
    let h = b.h || (S.house ? (A < 120 ? 3.6 : A < 350 ? (rnd() < 0.45 ? 6.2 : 3.6) + rnd() * 0.6 : A < 1500 ? 7 + rnd() * 1.5 : 9.5 + rnd() * 2) : style === 'paris' ? 18.5 + rnd() * 3.5 : 14 + rnd() * 8);
    const tall = S.glassOver ? h > S.glassOver || (h > 70 && rnd() < 0.18) : h > 45;
    const mansard = S.roof === 'mansard' && h > 11 && h < 45 && Math.abs(area) > 60;
    const base = Math.max(seat, gMax + 2.4 - (mansard ? h - 3.6 : h));
    const wallTop = base + (mansard ? h - 3.6 : h);
    const C = cell(cx, cz);
    let W = tall && mats.glass ? C.glass : C.wall[Math.floor(rnd() * walls.length)];
    const tk = b.m ? tagWall(b.m) : null;
    if (tk === 'glass') W = C.glass;
    else if (tk) { if (!C.tag.has(tk)) C.tag.set(tk, []); W = C.tag.get(tk); }
    // surveyed: walls up to the measured roof, and the roof as the LiDAR saw it
    if (b.roof?.d && !pull) {
      // detail by distance from the hole: true roof shape near play, a silhouette far off
      const pr = T.project(cx, cz);
      const far = Math.max(0, Math.abs(pr.d) - 30, -pr.s, pr.s - T.length);
      const step = far < 150 ? 1.5 : far < 450 ? 3 : 5;
      surveyed(b, pts, h0, Math.max(seat, gMax + 2.2 - (b.e ?? 2.2)), W, C, F, step, far < 150 ? 1.5 : far < 450 ? 3 : 6, (x, z) => T.drawnHeight(x, z));
      continue;
    }
    // walls: u in bays round the perimeter, v in floors
    let run = 0;
    const off = Math.floor(rnd() * 300) * 3.4 * 4;
    for (let i = 0; i < n; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % n];
      const L = Math.hypot(x2 - x1, z2 - z1);
      // facade coordinates in metres: along the wall (from a random whole bay, so
      // neighbours' lit windows differ) and up from the ground at that corner (on a slope
      // the floors stay level with the street, not buried on the uphill side)
      const u0 = off + run, u1 = off + run + L;
      const g1 = T.drawnHeight(x1, z1), g2 = T.drawnHeight(x2, z2);
      W.push([x1, h0, z1, u0, h0 - g1], [x2, h0, z2, u1, h0 - g2], [x2, wallTop, z2, u1, wallTop - g2], [x1, h0, z1, u0, h0 - g1], [x2, wallTop, z2, u1, wallTop - g2], [x1, wallTop, z1, u0, wallTop - g1]);
      run += L;
    }
    // houses: a hipped roof over the footprint's best-fit rectangle, when the footprint fills it
    if (S.roof === 'hip' && roofMats.length) {
      const roof = hipRoof(pts, wallTop);
      if (roof) {
        const list = C.roof[Math.floor(rnd() * roofMats.length)];
        for (const v of roof) list.push(v);
        continue;
      }
    }
    // roof: a zinc mansard stepping in 2.2 m, then a flat cap
    let top = pts, topY = wallTop;
    if (mansard) {
      const inset = 2.2;
      const inner = pts.map(([x, z], i) => {
        const [xa, za] = pts[(i - 1 + n) % n], [xb, zb] = pts[(i + 1) % n];
        let n1x = z - za, n1z = -(x - xa), n2x = zb - z, n2z = -(xb - x);
        const l1 = Math.hypot(n1x, n1z) || 1, l2 = Math.hypot(n2x, n2z) || 1;
        n1x /= l1; n1z /= l1; n2x /= l2; n2z /= l2;
        let mx = n1x + n2x, mz = n1z + n2z;
        const ml = Math.hypot(mx, mz) || 1;
        mx /= ml; mz /= ml;
        const k = Math.min(3, 1 / Math.max(0.35, Math.abs(mx * n1x + mz * n1z)));
        // step along the bisector, whichever way is inside the footprint
        const a = [x - mx * inset * k, z - mz * inset * k];
        return inside(pts, a[0], a[1]) ? a : [x + mx * inset * k, z + mz * inset * k];
      });
      for (let i = 0; i < n; i++) {
        const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % n];
        const [a1, b1] = inner[i], [a2, b2] = inner[(i + 1) % n];
        const yt = wallTop + 3.6;
        C.zinc.push([x1, wallTop, z1, 0, 0], [x2, wallTop, z2, 1, 0], [a2, yt, b2, 1, 1], [x1, wallTop, z1, 0, 0], [a2, yt, b2, 1, 1], [a1, yt, b1, 0, 1]);
      }
      top = inner; topY = wallTop + 3.6;
    }
    const contour = top.map(([x, z]) => new THREE.Vector2(x, z));
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { tris = []; }
    for (const [a, bb, c] of tris) {
      // wind so the cap faces up
      for (const k of [a, c, bb]) C.cap.push([top[k][0], topY, top[k][1], 0, 0]);
    }
  }
  const group = new THREE.Group();
  for (const [, C] of cells) {
    for (const [kind, list] of Object.entries(C.mroof)) {
      if (!list.length) continue;
      const pos = new Float32Array(list.length * 3), col = new Float32Array(list.length * 3), uv = new Float32Array(list.length * 2);
      list.forEach((v, i) => { pos.set([v[0], v[1], v[2]], i * 3); col.set([v[5], v[6], v[7]], i * 3); uv.set([v[3], v[4]], i * 2); });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      // neighbouring cells share their corners: weld them (a quarter of the vertices, smooth shading)
      const welded = mergeVertices(geo, 1e-3);
      welded.computeVertexNormals();
      welded.computeBoundingSphere();
      const mesh = new THREE.Mesh(welded, MROOF[kind]);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      group.add(mesh);
    }
    const sets = [...walls.map((m, i) => [m, C.wall[i]]), ...[...C.tag].map(([k, list]) => [tagMats.get(k), list]), ...roofMats.map((m, i) => [m, C.roof[i]]), ...['glass', 'zinc', 'cap'].map((k) => [mats[k], C[k]])];
    for (const [material, list] of sets) {
      if (!list.length || !material) continue;
      const pos = new Float32Array(list.length * 3), uv = new Float32Array(list.length * 2);
      list.forEach((v, i) => { pos.set([v[0], v[1], v[2]], i * 3); uv.set([v[3], v[4]], i * 2); });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  const all = [...walls, ...tagMats.values(), ...roofMats, ...Object.values(MROOF), ...Object.values(mats).filter((m) => m && !walls.includes(m))];
  group.userData.seats = seats;
  return { group, glow: [...walls, ...tagMats.values(), mats.glass].filter(Boolean), haze: [...new Set(all)] };
}
