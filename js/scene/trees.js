// Procedural parkland trees for the course: a few hand-tuned variants of
// Mississippi-bluff species (white oak, sugar maple, sycamore, eastern red
// cedar), each a trunk with real branches and a canopy of lumpy leaf clusters
// shaded with baked ambient occlusion. Variants are merged once and drawn
// with instancing; leaves sway in the wind in the vertex shader.
//
// Every planted tree is also returned as a collision record
// {x, z, y0, top, r, kind} so the ball can be stopped by canopies and the
// camera can stay out of them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash3(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/** Branch as a tapered tube along a gentle curve. */
function limb(from, to, r0, r1, bend, rnd) {
  const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3((rnd() - 0.5) * bend, bend * 0.4, (rnd() - 0.5) * bend));
  const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
  const g = new THREE.TubeGeometry(curve, 5, 1, 6, false);
  // taper: scale each ring's radius from r0 to r1
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const rings = 6, per = 7;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < rings; i++) {
    const u = i / (rings - 1);
    curve.getPointAt(u, c);
    const r = r0 + (r1 - r0) * u;
    for (let k = 0; k < per; k++) {
      const idx = i * per + k;
      v.fromBufferAttribute(n, idx);
      p.setXYZ(idx, c.x + v.x * r, c.y + v.y * r, c.z + v.z * r);
    }
  }
  g.deleteAttribute('uv');
  return g;
}

/**
 * A leaf cluster: icosphere, displaced, with vertex colours carrying the
 * canopy's ambient occlusion (darker underneath and toward the core) and
 * normals bent outward from the canopy centre so the crown shades as one
 * soft volume instead of faceted blobs.
 */
function cluster(center, radius, crown, crownR, tint, rnd) {
  const g = new THREE.IcosahedronGeometry(radius, 1);
  g.deleteAttribute('uv');
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const nrm = new Float32Array(p.count * 3);
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  const base = new THREE.Color(tint);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = 1 + (hash3(v.x + center.x, v.y + center.y, v.z + center.z) - 0.5) * 0.42;
    v.multiplyScalar(d).add(center);
    p.setXYZ(i, v.x, v.y, v.z);
    w.copy(v).sub(crown);
    const out = Math.min(1, w.length() / crownR);
    const up = THREE.MathUtils.clamp((v.y - (crown.y - crownR)) / (2 * crownR), 0, 1);
    const ao = 0.42 + 0.38 * out + 0.32 * up;
    const jitter = 0.92 + rnd() * 0.16;
    col[i * 3] = base.r * ao * jitter;
    col[i * 3 + 1] = base.g * ao * jitter;
    col[i * 3 + 2] = base.b * ao * jitter * 0.96;
    w.normalize();
    nrm.set([w.x, w.y, w.z], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}

/** Broadleaf: trunk, 4–6 scaffold limbs, crown of clusters at the limb tips. */
function broadleaf(seed, { height = 11, spread = 1, tint = 0x4f7a2e, bark = 0x5b4a3a, barkHi = null } = {}) {
  const rnd = seeded(seed);
  const wood = [];
  const leaves = [];
  const trunkH = height * (0.34 + rnd() * 0.08);
  const r0 = 0.32 + rnd() * 0.08;
  const top = new THREE.Vector3((rnd() - 0.5) * 0.6, trunkH, (rnd() - 0.5) * 0.6);
  wood.push(limb(new THREE.Vector3(0, -0.3, 0), top, r0, r0 * 0.7, 0.5, rnd));
  const crown = new THREE.Vector3(top.x, height * 0.64, top.z);
  const crownR = height * 0.36 * spread;
  const nLimbs = 4 + Math.floor(rnd() * 3);
  const tips = [];
  for (let i = 0; i < nLimbs; i++) {
    const a = (i / nLimbs) * Math.PI * 2 + rnd() * 0.8;
    const reach = crownR * (0.55 + rnd() * 0.35);
    const tip = new THREE.Vector3(crown.x + Math.cos(a) * reach, crown.y + (rnd() - 0.2) * crownR * 0.6, crown.z + Math.sin(a) * reach);
    wood.push(limb(top.clone(), tip, r0 * 0.55, r0 * 0.14, 1.2, rnd));
    tips.push(tip);
  }
  // clusters: one per limb tip, a few filling the top and the core
  const pts = [...tips];
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2, rr = crownR * rnd() * 0.45;
    pts.push(new THREE.Vector3(crown.x + Math.cos(a) * rr, crown.y + crownR * (0.25 + rnd() * 0.45), crown.z + Math.sin(a) * rr));
  }
  for (const c of pts) leaves.push(cluster(c, crownR * (0.48 + rnd() * 0.2), crown, crownR * 1.3, tint, rnd));
  const w = mergeGeometries(wood);
  if (barkHi) {
    // sycamore: pale mottled upper bark, darker at the foot
    const p = w.attributes.position;
    const col = new Float32Array(p.count * 3);
    const lo = new THREE.Color(bark), hi = new THREE.Color(barkHi), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const m = THREE.MathUtils.smoothstep(y, 1.5, 4) * (0.7 + 0.3 * hash3(p.getX(i) * 3, y * 2, p.getZ(i) * 3));
      c.copy(lo).lerp(hi, m);
      col.set([c.r, c.g, c.b], i * 3);
    }
    w.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  return { wood: w, leaves: mergeGeometries(leaves), height, radius: crownR * 1.15, crownY: crown.y - crownR * 0.9, kind: 'broad' };
}

/** Eastern red cedar: dense, narrow, dark spire of stacked jagged tiers. */
function cedar(seed, { height = 9 } = {}) {
  const rnd = seeded(seed);
  const wood = [new THREE.CylinderGeometry(0.12, 0.2, height * 0.5, 6).translate(0, height * 0.25 - 0.2, 0)];
  const leaves = [];
  const tint = new THREE.Color(0x2f4a2a);
  const tiers = 6;
  for (let i = 0; i < tiers; i++) {
    const u = i / (tiers - 1);
    const r = (1 - u * 0.82) * height * 0.2 * (0.9 + rnd() * 0.2);
    const h = height * 0.3;
    const g = new THREE.ConeGeometry(r, h, 9, 2, false);
    g.deleteAttribute('uv');
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    const y0 = height * 0.12 + u * height * 0.62;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const j = 1 + (hash3(x + i, y, z) - 0.5) * 0.5;
      p.setXYZ(k, x * j, y + y0 + h / 2, z * j);
      const ao = 0.5 + 0.5 * (y / h + 0.5) * 0.6 + u * 0.25;
      col.set([tint.r * ao, tint.g * ao, tint.b * ao], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    leaves.push(g);
  }
  return { wood: mergeGeometries(wood), leaves: mergeGeometries(leaves), height, radius: height * 0.2, crownY: height * 0.12, kind: 'cedar' };
}

const VARIANTS = [
  (s) => broadleaf(s, { height: 13, spread: 1.05, tint: 0x4a7330 }), // white oak
  (s) => broadleaf(s + 1, { height: 12, spread: 0.95, tint: 0x557d2c }), // oak, younger
  (s) => broadleaf(s + 2, { height: 14, spread: 0.85, tint: 0x5a8434 }), // sugar maple
  (s) => broadleaf(s + 3, { height: 16, spread: 0.9, tint: 0x5f8a3a, bark: 0x6a604f, barkHi: 0xe6e0d0 }), // sycamore
  (s) => cedar(s + 4, { height: 9 }),
  (s) => cedar(s + 5, { height: 12 }),
];

let cache = null;
function variants() {
  if (cache) return cache;
  cache = VARIANTS.map((f, i) => f(1000 + i * 17));
  // shared across holes: never disposed with a hole's scenery
  for (const v of cache) { v.wood.userData.shared = true; v.leaves.userData.shared = true; }
  return cache;
}

const swayUniforms = { uTime: { value: 0 }, uWind: { value: 0.3 } };

function leafMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = swayUniforms.uTime;
    sh.uniforms.uWind = swayUniforms.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = instanceMatrix[3].xyz;
#else
  vec3 ip = vec3(0.0);
#endif
  float ph = ip.x * 0.11 + ip.z * 0.07;
  float k = max(0.0, transformed.y - 2.0) * 0.012 * (0.35 + uWind);
  transformed.x += sin(uTime * 1.3 + ph) * k + sin(uTime * 3.1 + ph * 3.0 + transformed.y) * k * 0.25;
  transformed.z += cos(uTime * 1.1 + ph) * k * 0.6;`);
  };
  m.customProgramCacheKey = () => 'leafSway';
  return m;
}

/**
 * Plant trees for a hole. `spots` is [{x, z, y, scale, variant}] already
 * placed by the caller; returns {group, records}.
 */
export function plantTrees(spots) {
  const vs = variants();
  const group = new THREE.Group();
  const records = [];
  const leafMat = leafMaterial();
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x4e3f31, roughness: 0.95 });
  const sycBarkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const by = vs.map(() => []);
  for (const s of spots) by[s.variant % vs.length].push(s);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const tc = new THREE.Color();
  vs.forEach((v, i) => {
    const list = by[i];
    if (!list.length) return;
    const wood = new THREE.InstancedMesh(v.wood, v.wood.attributes.color ? sycBarkMat : barkMat, list.length);
    const leaves = new THREE.InstancedMesh(v.leaves, leafMat, list.length);
    list.forEach((s, k) => {
      q.setFromAxisAngle(up, s.rot);
      sc.set(s.scale * s.squash, s.scale, s.scale * s.squash);
      m4.compose(p.set(s.x, s.y, s.z), q, sc);
      wood.setMatrixAt(k, m4);
      leaves.setMatrixAt(k, m4);
      leaves.setColorAt(k, tc.setHSL(s.hue, 0.16 + s.sat * 0.2, 0.62 + s.light * 0.22));
      records.push({ x: s.x, z: s.z, y0: s.y + v.crownY * s.scale, top: s.y + v.height * s.scale, r: v.radius * s.scale * s.squash, kind: v.kind });
    });
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    wood.castShadow = leaves.castShadow = true;
    wood.receiveShadow = leaves.receiveShadow = true;
    group.add(wood, leaves);
  });
  return { group, records };
}

export const TREE_VARIANTS = VARIANTS.length;

/** Shared wind sway for all leaves. */
export function updateTrees(t, wind) {
  swayUniforms.uTime.value = t;
  swayUniforms.uWind.value = wind;
}
