// Life at the water's edge: cattails and reeds standing in the shallows, lily
// pads (a few in flower) out on the water, and drifts of duckweed and algae in
// the still corners. Everything is instanced (a handful of draw calls per hole)
// and sways in the wind in the vertex shader. Placement walks each shoreline,
// in patches from a smooth noise, so stands grow in clumps with open water and
// bare bank between them, as they do.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { waterMaterials } from './river.js';

const C = (r, g, b) => new THREE.Color(r, g, b);

/** A colour per vertex on a geometry (merged plants carry their own colours). */
function paint(g, col, tip = null) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  let top = -Infinity, bot = Infinity;
  for (let i = 0; i < p.count; i++) { top = Math.max(top, p.getY(i)); bot = Math.min(bot, p.getY(i)); }
  const k = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    k.copy(col);
    if (tip) k.lerp(tip, Math.pow((p.getY(i) - bot) / (top - bot || 1), 2));
    c.set([k.r, k.g, k.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const strip = (g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g.index ? g.toNonIndexed() : g; };

/** A strap leaf: a narrow blade of length L arching out from the base toward (dx, dz). */
function blade(L, w, ang, lean, rnd, n = 5) {
  const pos = [];
  const pt = (t, side) => {
    const bend = lean * t * t;
    const x = Math.cos(ang) * bend, z = Math.sin(ang) * bend, y = L * t * (1 - 0.25 * lean * t);
    const half = (w / 2) * (1 - t * 0.92);
    return [x - Math.sin(ang) * half * side, y, z + Math.cos(ang) * half * side];
  };
  for (let i = 0; i < n; i++) {
    const a = i / n, b = (i + 1) / n;
    pos.push(...pt(a, -1), ...pt(a, 1), ...pt(b, 1), ...pt(a, -1), ...pt(b, 1), ...pt(b, -1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// `lo`: the same clump for distance, from the same draws: half the leaves (a
// little wider, fewer segments), coarse heads and plumes
function cattailClump(lo = false) {
  const parts = [];
  for (let i = 0; i < 16; i++) {
    const L = 1.1 + rnd() * 0.8, a = rnd() * 6.28, lean = 0.25 + rnd() * 0.5;
    if (!lo || i % 2 === 0) parts.push(paint(lo ? blade(L, 0.07, a, lean, rnd, 2) : blade(L, 0.04, a, lean, rnd), C(0.33, 0.42, 0.16), C(0.6, 0.57, 0.3)));
  }
  for (let i = 0; i < 4; i++) {
    const h = 1.5 + rnd() * 0.5, ox = (rnd() - 0.5) * 0.25, oz = (rnd() - 0.5) * 0.25;
    if (lo) { parts.push(paint(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 4, 1, true).translate(ox, h - 0.18, oz), C(0.28, 0.17, 0.09))); continue; }
    parts.push(paint(new THREE.CylinderGeometry(0.006, 0.009, h, 4).translate(ox, h / 2, oz), C(0.32, 0.38, 0.18)));
    parts.push(paint(new THREE.CapsuleGeometry(0.03, 0.22, 3, 8).translate(ox, h - 0.18, oz), C(0.28, 0.17, 0.09))); // the brown head
    parts.push(paint(new THREE.CylinderGeometry(0.002, 0.004, 0.16, 3).translate(ox, h + 0.03, oz), C(0.45, 0.4, 0.25)));
  }
  return mergeGeometries(parts.map(strip));
}
function reedClump(lo = false) {
  const parts = [];
  for (let i = 0; i < 22; i++) {
    const h = 1.6 + rnd() * 0.9, a = rnd() * 6.28, ox = Math.cos(a) * rnd() * 0.3, oz = Math.sin(a) * rnd() * 0.3;
    const lean = 0.1 + rnd() * 0.2, keep = !lo || i % 2 === 0;
    if (keep) parts.push(paint((lo ? blade(h, 0.03, a, lean, rnd, 2) : blade(h, 0.016, a, lean, rnd)).translate(ox, 0, oz), C(0.33, 0.4, 0.17), C(0.6, 0.56, 0.32)));
    // the feathery plume, purple-brown going to straw
    if (rnd() < 0.6 && keep) parts.push(paint(new THREE.ConeGeometry(0.06, 0.3, lo ? 3 : 5, 1, lo).rotateX(Math.PI).translate(ox + Math.cos(a) * 0.15, h + 0.05, oz + Math.sin(a) * 0.15), C(0.66, 0.6, 0.46)));
  }
  return mergeGeometries(parts.map(strip));
}
/** A clump and its distant version, from the same draws (the sequence goes on from the full one). */
function withLo(make) {
  const s0 = seed, hi = make(false), s1 = seed;
  seed = s0;
  const lo = make(true);
  seed = s1;
  return { hi, lo };
}
function lilyPad() {
  // a disc with its notch, a touch dished
  const g = new THREE.CircleGeometry(1, 18, 0.25, Math.PI * 2 - 0.5).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getZ(i)); p.setY(i, r * r * 0.04); }
  g.computeVertexNormals();
  return strip(paint(g, C(0.13, 0.24, 0.08), C(0.22, 0.32, 0.1)));
}
function lilyFlower() {
  const parts = [];
  for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 6.28 + ring * 0.4, tilt = ring ? 0.5 : 0.9;
    parts.push(paint(new THREE.ConeGeometry(0.035, 0.11, 4).rotateZ(-Math.PI / 2 + tilt).translate(0.05, 0.04 + ring * 0.015, 0).rotateY(a), ring ? C(0.98, 0.95, 0.92) : C(0.97, 0.85, 0.88)));
  }
  parts.push(paint(new THREE.SphereGeometry(0.025, 8, 6).translate(0, 0.06, 0), C(0.95, 0.8, 0.25)));
  return mergeGeometries(parts.map(strip));
}
function weedTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.clearRect(0, 0, 128, 128);
  let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    const a = r() * 6.28, d = Math.pow(r(), 0.6) * 60;
    g.fillStyle = `rgba(${150 + r() * 50},${180 + r() * 40},${60 + r() * 40},${0.6 + r() * 0.4})`;
    g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1 + r() * 2.2, 0, 6.29); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// one set of plant geometries and materials for every hole
let KIT = null;
function kit() {
  if (KIT) return KIT;
  seed = 11;
  const uni = { uTime: { value: 0 }, uDay: { value: 1 }, uCloud: { value: 0.2 } };
  const sway = (m, k) => {
    m.uniforms = uni; // the environment drives uTime (see river.js waterMaterials)
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uni.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec2 ip = vec2(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xz;
          #endif
          float h = max(position.y, 0.0);
          float wv = sin(uTime * 1.6 + ip.x * 0.31 + ip.y * 0.17) + 0.4 * sin(uTime * 3.7 + ip.x * 0.9);
          transformed.x += wv * h * h * ${k.toFixed(3)};
          transformed.z += wv * h * h * ${(k * 0.5).toFixed(3)};
        }`);
    };
    m.customProgramCacheKey = () => `shoreSway${k}`;
    waterMaterials.add(m);
    return m;
  };
  const plant = sway(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }), 0.025);
  const pad = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const flower = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: 0x222018 });
  const weed = new THREE.MeshStandardMaterial({ map: weedTexture(), transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  KIT = {
    cattail: [withLo(cattailClump), withLo(cattailClump), withLo(cattailClump)], reed: [withLo(reedClump), withLo(reedClump)], pad: lilyPad(), flower: lilyFlower(),
    weed: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), plant, padM: pad, flowerM: flower, weedM: weed,
  };
  return KIT;
}

const noise = (x, z) => 0.5 + 0.5 * Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2.3) * Math.cos(z * 0.09 - x * 0.05 + Math.sin(x * 0.031));

/**
 * Plants round water. `rings`: [{ pts: [[x, z], ...] (closed outline, any winding),
 * level }]. `skip(x, z)` keeps them off what must stay clear (a green, a tee).
 * `budget` caps the clumps per kind. `chunked(group, matrices, hi, lo, mat, opts)`
 * (CourseWorld._chunked) bins the cattails and reeds into cells that drop out
 * of view and out of the shadow camera on their own, and draw a lighter clump
 * past `lodAt`; without it each kind is one InstancedMesh at full detail.
 */
export function shoreLife(rings, { skip = () => false, budget = 900, chunked = null } = {}) {
  const K = kit();
  const group = new THREE.Group();
  const lists = { cattail: K.cattail.map(() => []), reed: K.reed.map(() => []), pad: [], flower: [], weed: [] };
  let count = 0;
  for (const { pts, level } of rings) {
    if (!pts || pts.length < 3) continue;
    let A = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) A += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    const inward = A > 0 ? 1 : -1; // which side of an edge is the water
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 0.01) continue;
      const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, nx = -uz * inward, nz = ux * inward; // (nx, nz) points into the water
      for (let t = rnd() * 0.9; t < L; t += 0.9) {
        if (count > budget) break;
        const x0 = a[0] + ux * t, z0 = a[1] + uz * t;
        const n = noise(x0, z0), n2 = noise(z0 * 1.7 + 40, x0 * 1.3 - 20);
        const at = (inset, jitter = 0.5) => [x0 + nx * inset + (rnd() - 0.5) * jitter, z0 + nz * inset + (rnd() - 0.5) * jitter];
        if (n > 0.6) {
          // a stand of cattails in the shallows, thickest in the middle of a patch
          const [x, z] = at(0.2 + rnd() * 1.6);
          if (!skip(x, z)) { lists.cattail[Math.floor(rnd() * K.cattail.length)].push([x, level - 0.25, z, rnd() * 6.28, 0.8 + rnd() * 0.45]); count++; }
          if (n > 0.75 && rnd() < 0.7) { const [x2, z2] = at(0.6 + rnd() * 1.8); if (!skip(x2, z2)) lists.cattail[Math.floor(rnd() * K.cattail.length)].push([x2, level - 0.3, z2, rnd() * 6.28, 0.8 + rnd() * 0.4]); }
        } else if (n > 0.42 && rnd() < 0.7) {
          const [x, z] = at(rnd() * 1.2);
          if (!skip(x, z)) { lists.reed[Math.floor(rnd() * K.reed.length)].push([x, level - 0.2, z, rnd() * 6.28, 0.85 + rnd() * 0.4]); count++; }
        }
        // lily pads out in still water, in rafts
        if (n2 > 0.72 && rnd() < 0.55) {
          for (let k = 0; k < 4; k++) {
            const [x, z] = at(2 + rnd() * 6, 2.5);
            if (skip(x, z)) continue;
            lists.pad.push([x, level + 0.015, z, rnd() * 6.28, 0.12 + rnd() * 0.16]);
            if (rnd() < 0.08) lists.flower.push([x + 0.05, level + 0.02, z, rnd() * 6.28, 0.9 + rnd() * 0.4]);
          }
        }
        // duckweed and algae drifted into the margin
        if (n2 < 0.18 && rnd() < 0.4) {
          const [x, z] = at(0.4 + rnd() * 1.5, 1);
          if (!skip(x, z)) lists.weed.push([x, level + 0.01, z, rnd() * 6.28, 1.2 + rnd() * 2.2]);
        }
      }
    }
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const inst = (geo, mat, list, { shadow = true, flat = false } = {}) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, y, z, r, k], i) => im.setMatrixAt(i, m4.compose(v.set(x, y, z), q.setFromEuler(e.set(0, r, 0)), flat ? s.set(k, 1, k) : s.set(k, k, k))));
    im.castShadow = shadow; im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
  };
  const CELL = 80;
  const plants = (kinds, lists) => {
    if (!chunked) return kinds.forEach((g, i) => inst(g.hi, K.plant, lists[i]));
    // chunked: one clump per kind in each cell (they still differ cell to cell),
    // so a cell is one draw per kind, not one per clump shape
    const by = kinds.map(() => []);
    for (const it of lists.flat()) {
      const cx = Math.floor(it[0] / CELL), cz = Math.floor(it[2] / CELL);
      by[(((cx * 73856093) ^ (cz * 19349663)) >>> 0) % kinds.length].push(m4.compose(v.set(it[0], it[1], it[2]), q.setFromEuler(e.set(0, it[3], 0)), s.setScalar(it[4])).clone());
    }
    kinds.forEach((g, i) => by[i].length && chunked(group, by[i], g.hi, g.lo, K.plant, { cell: CELL, lodAt: 45, far: 600, shadow: true }));
  };
  plants(K.cattail, lists.cattail);
  plants(K.reed, lists.reed);
  inst(K.pad, K.padM, lists.pad, { shadow: false, flat: true });
  inst(K.flower, K.flowerM, lists.flower, { shadow: false });
  inst(K.weed, K.weedM, lists.weed, { shadow: false, flat: true });
  return group;
}

/** The outline of an elliptical pond (centre, radii, heading), as a ring. */
export function ellipseRing(p, n = 48) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, ex = Math.cos(a) * p.rx, ez = Math.sin(a) * p.rz;
    pts.push([p.x + ex * -p.dirz + ez * p.dirx, p.z + ex * p.dirx + ez * p.dirz]);
  }
  return pts;
}
