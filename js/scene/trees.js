// Course trees. Each species slot (an index into VARIANTS) draws with a
// real model from js/scene/treeModels.js (bark and alpha-tested leaf cards,
// near models plus impostor cards at range); the procedural tree of the same
// slot below stands in while models load or if one is missing.
//
// Every planted tree is also returned as a collision record
// {x, z, y0, top, r, kind} so the ball can be stopped by canopies and the
// camera can stay out of them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadSpecies, species, buildForest, updateForests, setTreeWind } from './treeModels.js';
import { pbr } from './pbr.js';

/** The model each species slot draws with (VARIANTS index → SPECIES name). */
const SLOT_MODEL = [
  'oak', 'beech', 'maple', 'elm', // white oak, younger oak, sugar maple, sycamore
  'juniper', 'spruce', // eastern red cedar, conifer
  'elm', 'juniper', 'pine', // cottonwood, Rocky Mountain juniper, ponderosa
  'acacia', 'olive', 'juniper', // stone pine / Monterey cypress, olive, Italian cypress
  'palm', 'oldtree', // sabal palm, a dead snag
];

/** Whether a species slot's model is loaded (else it draws procedurally). */
export const slotHasModel = (slot) => !!species(SLOT_MODEL[slot >= 100 ? 10 : slot]);

/** Index of the scanned olive (kept for older THEME_TREES lists). */
export const HERO = () => 10;

let loading = null;
/**
 * Load the models a course's trees need (browser only); pass the course id
 * and theme, or nothing for every species.
 */
export function loadHeroTrees(courseId, theme) {
  const sets = [THEME_TREES[courseId], THEME_TREES[theme]].filter(Boolean);
  const slots = sets.length ? sets.flatMap((t) => [...t.broad, ...t.conifer]) : SLOT_MODEL.map((_, i) => i);
  const names = [...new Set(slots.map((i) => SLOT_MODEL[i >= 100 ? 10 : i]))];
  loading = Promise.all([loading, loadSpecies(names)]);
  return loading;
}

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

/**
 * Ponderosa pine: tall straight trunk with cinnamon plated bark, bare for
 * the lower half, then short upturned limbs carrying clumped needle tufts
 * in an open, flat-topped crown.
 */
function ponderosa(seed, { height = 22 } = {}) {
  const rnd = seeded(seed);
  const wood = [];
  const leaves = [];
  const H = height;
  const trunk = new THREE.CylinderGeometry(0.16, 0.42, H * 0.96, 8, 1, true).translate(0, H * 0.48 - 0.3, 0);
  trunk.deleteAttribute('uv');
  wood.push(trunk);
  const crown = new THREE.Vector3(0, H * 0.72, 0);
  const crownR = H * 0.2;
  const tint = 0x3f5c27;
  const whorls = 7;
  for (let i = 0; i < whorls; i++) {
    const u = i / (whorls - 1);
    const y = H * (0.5 + u * 0.44);
    const n = 3 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd() * 1.2 + i;
      const reach = crownR * (1.05 - u * 0.55) * (0.7 + rnd() * 0.4);
      const tip = new THREE.Vector3(Math.cos(a) * reach, y + reach * 0.25, Math.sin(a) * reach);
      wood.push(limb(new THREE.Vector3(0, y, 0), tip, 0.09, 0.03, 0.4, rnd));
      leaves.push(cluster(tip, crownR * (0.34 + rnd() * 0.12) * (1 - u * 0.3), crown, crownR * 1.4, tint, rnd));
    }
  }
  leaves.push(cluster(new THREE.Vector3(0, H * 0.97, 0), crownR * 0.34, crown, crownR * 1.4, tint, rnd));
  const w = mergeGeometries(wood);
  // cinnamon-orange plates on the trunk, darker toward the crown
  const p = w.attributes.position;
  const col = new Float32Array(p.count * 3);
  const lo = new THREE.Color(0x9a5a33), hi = new THREE.Color(0x4a3a2c), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    c.copy(lo).lerp(hi, THREE.MathUtils.smoothstep(y, H * 0.3, H * 0.8)).multiplyScalar(0.85 + 0.3 * hash3(p.getX(i) * 9, y * 3, p.getZ(i) * 9));
    col.set([c.r, c.g, c.b], i * 3);
  }
  w.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return { wood: w, leaves: mergeGeometries(leaves), height: H, radius: crownR * 1.2, crownY: H * 0.46, kind: 'pine' };
}

/**
 * Rocky Mountain juniper: a small, shaggy, blue-grey tree, often several
 * stems from the base, irregular and rounded rather than a clean cone.
 */
function juniper(seed, { height = 6 } = {}) {
  const rnd = seeded(seed);
  const wood = [];
  const leaves = [];
  const H = height;
  const crown = new THREE.Vector3(0, H * 0.5, 0);
  const crownR = H * 0.32;
  const tint = 0x4d6150;
  const stems = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < stems; i++) {
    const a = rnd() * Math.PI * 2;
    const top = new THREE.Vector3(Math.cos(a) * H * 0.12, H * (0.55 + rnd() * 0.2), Math.sin(a) * H * 0.12);
    wood.push(limb(new THREE.Vector3(0, -0.2, 0), top, 0.14, 0.05, 0.5, rnd));
  }
  for (let i = 0; i < 9; i++) {
    const u = i / 8;
    const a = rnd() * Math.PI * 2, rr = crownR * (1 - u * 0.7) * (0.3 + rnd() * 0.7);
    const c = new THREE.Vector3(Math.cos(a) * rr, H * (0.22 + u * 0.66), Math.sin(a) * rr);
    leaves.push(cluster(c, crownR * (0.55 - u * 0.25) * (0.8 + rnd() * 0.4), crown, crownR * 1.5, tint, rnd));
  }
  const w = mergeGeometries(wood);
  return { wood: w, leaves: mergeGeometries(leaves), height: H, radius: crownR * 1.1, crownY: H * 0.1, kind: 'cedar' };
}

/**
 * Stone (umbrella) pine, Pinus pinea: a bare, often leaning trunk that forks
 * high into a broad, flat-topped canopy, the silhouette of the Provençal coast.
 */
function stonepine(seed, { height = 14 } = {}) {
  const rnd = seeded(seed);
  const wood = [], leaves = [];
  const lean = new THREE.Vector3((rnd() - 0.5) * 2.4, height * 0.62, (rnd() - 0.5) * 2.4);
  wood.push(limb(new THREE.Vector3(0, -0.3, 0), lean, 0.34, 0.24, 1.2, rnd));
  const crown = new THREE.Vector3(lean.x, height * 0.82, lean.z);
  const crownR = height * 0.42;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rnd();
    const tip = new THREE.Vector3(crown.x + Math.cos(a) * crownR * 0.6, height * 0.8, crown.z + Math.sin(a) * crownR * 0.6);
    wood.push(limb(lean.clone(), tip, 0.18, 0.06, 0.8, rnd));
  }
  for (let i = 0; i < 11; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * crownR * 0.8;
    const c = new THREE.Vector3(crown.x + Math.cos(a) * r, height * (0.84 + rnd() * 0.06), crown.z + Math.sin(a) * r);
    const g = cluster(c, crownR * (0.36 + rnd() * 0.12), crown, crownR * 1.2, 0x3f5a2a, rnd);
    g.translate(-c.x, -c.y, -c.z).scale(1, 0.55, 1).translate(c.x, c.y, c.z); // flatten each tuft
    leaves.push(g);
  }
  const w = mergeGeometries(wood);
  return { wood: w, leaves: mergeGeometries(leaves), height, radius: crownR, crownY: height * 0.7, kind: 'broad' };
}

/** Olive: a short, gnarled grey trunk and a loose silver-green crown. */
function olive(seed, { height = 6 } = {}) {
  const rnd = seeded(seed);
  const wood = [], leaves = [];
  const top = new THREE.Vector3((rnd() - 0.5) * 0.8, height * 0.35, (rnd() - 0.5) * 0.8);
  wood.push(limb(new THREE.Vector3(0, -0.2, 0), top, 0.3, 0.2, 0.9, rnd));
  const crown = new THREE.Vector3(top.x, height * 0.62, top.z);
  const crownR = height * 0.4;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rnd();
    const tip = new THREE.Vector3(crown.x + Math.cos(a) * crownR * 0.7, height * (0.55 + rnd() * 0.2), crown.z + Math.sin(a) * crownR * 0.7);
    wood.push(limb(top.clone(), tip, 0.12, 0.04, 0.8, rnd));
    leaves.push(cluster(tip, crownR * (0.45 + rnd() * 0.15), crown, crownR * 1.3, 0x7d8a5e, rnd));
  }
  return { wood: mergeGeometries(wood), leaves: mergeGeometries(leaves), height, radius: crownR * 1.1, crownY: height * 0.35, kind: 'broad' };
}

/** Italian cypress: a dark, narrow flame. */
function cypressTree(seed, { height = 13 } = {}) {
  const rnd = seeded(seed);
  const trunk = new THREE.CylinderGeometry(0.1, 0.18, 1.6, 6).translate(0, 0.5, 0);
  trunk.deleteAttribute('uv');
  const g = new THREE.CylinderGeometry(0.15, 1.1, height, 10, 6);
  g.deleteAttribute('uv');
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const tint = new THREE.Color(0x26402a);
  for (let i = 0; i < p.count; i++) {
    const u = (p.getY(i) + height / 2) / height;
    const k = (Math.sin(Math.min(1, u * 1.35) * Math.PI) * (1 - u * 0.45) + 0.12) * (0.92 + rnd() * 0.16);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) + height / 2 + 0.6, p.getZ(i) * k);
    const ao = 0.6 + 0.5 * u;
    col.set([tint.r * ao, tint.g * ao, tint.b * ao], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return { wood: trunk, leaves: g, height, radius: 1.0, crownY: 1.2, kind: 'cedar' };
}

const VARIANTS = [
  (s) => broadleaf(s, { height: 13, spread: 1.05, tint: 0x4a7330 }), // white oak
  (s) => broadleaf(s + 1, { height: 12, spread: 0.95, tint: 0x557d2c }), // oak, younger
  (s) => broadleaf(s + 2, { height: 14, spread: 0.85, tint: 0x5a8434 }), // sugar maple
  (s) => broadleaf(s + 3, { height: 16, spread: 0.9, tint: 0x5f8a3a, bark: 0x6a604f, barkHi: 0xe6e0d0 }), // sycamore
  (s) => cedar(s + 4, { height: 9 }),
  (s) => cedar(s + 5, { height: 12 }),
  // the West: plains cottonwood (broad, pale bark, bright leaves), Rocky
  // Mountain juniper and ponderosa pine on the bluffs
  (s) => broadleaf(s + 6, { height: 21, spread: 1.25, tint: 0x7c9a38, bark: 0x6f675b, barkHi: 0x9c9586 }),
  (s) => juniper(s + 7, { height: 6 }),
  (s) => ponderosa(s + 8, { height: 22 }),
  // Provence: stone pine, olive, Italian cypress
  (s) => stonepine(s + 9, { height: 14 }),
  (s) => olive(s + 10, { height: 6 }),
  (s) => cypressTree(s + 11, { height: 13 }),
  // Florida: sabal palm (an umbrella crown stands in until the model loads)
  (s) => stonepine(s + 12, { height: 11 }),
  // derelict lots: a dead tree
  (s) => broadleaf(s + 13, { height: 10, spread: 0.7, tint: 0x5d6640 }),
];

/** Tree species index sets per course theme. */
export const THEME_TREES = {
  parkland: { broad: [0, 1, 2, 3], conifer: [4, 5], density: 1 },
  western: { broad: [6], conifer: [7, 7, 8], density: 0.45, conifersFirst: true, scatter: 1 },
  // Scotts Bluff: open shortgrass prairie; ponderosa and juniper on the bluff slopes, cottonwoods in the draws
  oregon: { broad: [6], conifer: [7, 7, 8], density: 0.16, conifersFirst: true, scatter: 0.5 },
  // Provence: umbrella pines and Aleppo pines on the slopes, olives and
  // cypresses lower down
  coastal: { broad: [9, 10, 10, 10], conifer: [9, 8, 11], density: 0.6, conifersFirst: true, scatter: 0.8 },
  // East St. Louis bottomland: cottonwood, silver maple, sycamore, dead snags
  industrial: { broad: [6, 2, 3, 13], conifer: [4], density: 0.55, scatter: 0.5 },
  // the Bois de Boulogne: oaks, chestnuts, planes and the odd conifer
  paris: { broad: [0, 1, 2, 3], conifer: [4, 5], density: 0.95, scatter: 0.7 },
  urban: { broad: [0, 2, 3], conifer: [4], density: 0.85, scatter: 0.6 },
  harbor: { broad: [0, 2], conifer: [4], density: 0.15, scatter: 0 }, // links-style, open to the water
  // per course, ahead of the theme:
  // Pebble Beach: Monterey cypress on the cliffs, Monterey pine inland
  pebble: { broad: [9, 9, 0], conifer: [8, 9], density: 0.5, conifersFirst: true, scatter: 0.7 },
  // Forest Park: open lawns under big oaks, maples and sycamores, the odd pine
  forestpark: { broad: [0, 2, 3, 1], conifer: [4, 5], density: 0.62, scatter: 0.4 },
  // Central Park: American elms, oaks, London planes and maples over open lawns
  centralpark: { broad: [0, 2, 3, 1], conifer: [0, 3], density: 0.9, scatter: 0.6 },
  // Cahokia: open mown grounds, woods along the creeks and ponds
  cahokia: { broad: [0, 2, 3, 6], conifer: [4], density: 0.16, scatter: 0.12 },
  // the Zoo: shade trees along its walks, not woods: the exhibits and the crowds stay in view
  stlzoo: { broad: [0, 2, 3, 1], conifer: [4], density: 0.18, scatter: 0.15 }, // the city's open ground stays open, so the mounds read
  // Confluence Point: the open farmland of the American Bottom, tree lines along the ditches
  confluencepoint: { broad: [6, 2, 3], conifer: [4], density: 0.3, scatter: 0.25 },
  // Alton: river-bottom cottonwoods, silver maples and sycamores, open parks along the water
  alton: { broad: [6, 2, 3, 0], conifer: [4], density: 0.5, scatter: 0.45 },
  // Rock Spring Park, on the bluff above the river: white and red oak, sugar maple and hickory over mown
  // parkland, sycamores in the ravines, eastern red cedar and the odd planted spruce (the trees stand where the LiDAR found them)
  rockspring: { broad: [0, 0, 2, 1, 3], conifer: [4, 4, 5], density: 0.9, scatter: 0.5 },
  // The Woodlands: oak-hickory on the bluffs, sycamores and cottonwoods along the West Fork, maples round the houses, the odd red cedar
  woodlands: { broad: [0, 2, 3, 6, 1], conifer: [4], density: 0.7, scatter: 0.5 },
  // TPC Sawgrass: live oaks, sabal palms and slash pine
  sawgrass: { broad: [0, 12, 12, 1], conifer: [8], density: 0.75, scatter: 0.6 },
  // Augusta National: tall loblolly pines (the pine model) over oaks and magnolias
  augusta: { broad: [0, 1, 2], conifer: [8], density: 0.9, conifersFirst: true, scatter: 0.4 },
  // Whistling Straits: open dunes; the few trees (surveyed) are oaks, maples and spruce windbreaks inland
  whistlingstraits: { broad: [0, 2, 3], conifer: [4, 5], density: 0.12, scatter: 0.08 },
  // Torrey Pines: the Torrey pine itself (open, wind-bent crowns on the bluffs, taller inland), the odd eucalyptus
  torreypines: { broad: [9, 9, 8, 3], conifer: [8, 9], density: 0.45, conifersFirst: true, scatter: 0.6 },
  // the Sandhills: longleaf pine over everything, turkey oak in the understorey (Pinehurst's
  // trees.json comes from a canopy-height raster, which can't tell a pine's crown from an oak's,
  // so even "broad" crowns are mostly pines)
  sandhills: { broad: [8, 8, 1], conifer: [8], density: 0.7, conifersFirst: true, scatter: 0.5 },
};

/** The tree set for a hole: its course's own, else its theme's. */
export const treesFor = (hole) => THEME_TREES[hole.course] || THEME_TREES[hole.theme] || THEME_TREES.parkland;

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
  // surveyed trees (LiDAR) give a height and crown radius: size the model to them
  const fit = (s, height, radius) => {
    if (!s.height) return;
    s.scale = s.height / height;
    if (s.crown) s.squash = Math.min(1.8, Math.max(0.55, s.crown / (radius * s.scale)));
  };
  const group = new THREE.Group();
  const records = [];
  const leafMat = leafMaterial();
  const barkMat = pbr('bark_brown_02', { scale: 1.2, tint: 0xb8a690 }); // real bark on the drawn trees too
  const sycBarkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const by = vs.map(() => []);
  const modelled = [];
  const tint = new THREE.Color(), white = new THREE.Color(1, 1, 1);
  for (const s of spots) {
    const slot = s.variant >= 100 ? 10 : s.variant % vs.length;
    const rec = species(SLOT_MODEL[slot]);
    if (!rec) { s.variant = slot; by[slot].push(s); continue; }
    // the model at the slot's design height, or at the surveyed one
    let sy = s.scale * (vs[slot].height / rec.height), sx = sy * s.squash;
    if (s.height) {
      sy = s.height / rec.height;
      sx = s.crown ? sy * Math.min(1.8, Math.max(0.55, s.crown / (rec.radius * sy))) : sy;
    }
    // a little variety in the foliage: hue, and a lighter or darker crown
    tint.setHSL(s.hue, 0.3 + s.sat * 0.2, 0.55);
    const t = white.clone().lerp(tint, 0.22).multiplyScalar(0.86 + s.light * 0.24);
    modelled.push({ rec, x: s.x, y: s.y, z: s.z, rot: s.rot, sx, sy, tint: t });
    records.push({ far: !!s.far, x: s.x, z: s.z, y0: s.y + rec.crownY * sy, top: s.y + rec.height * sy, r: rec.radius * sx, kind: rec.kind });
  }
  if (modelled.length) group.add(buildForest(modelled));
  const tc = new THREE.Color();
  vs.forEach((v, i) => {
    const list = by[i];
    if (!list.length) return;
    const wood = new THREE.InstancedMesh(v.wood, v.wood.attributes.color ? sycBarkMat : barkMat, list.length);
    const leaves = new THREE.InstancedMesh(v.leaves, leafMat, list.length);
    list.forEach((s, k) => {
      fit(s, v.height, v.radius);
      q.setFromAxisAngle(up, s.rot);
      sc.set(s.scale * s.squash, s.scale, s.scale * s.squash);
      m4.compose(p.set(s.x, s.y, s.z), q, sc);
      wood.setMatrixAt(k, m4);
      leaves.setMatrixAt(k, m4);
      leaves.setColorAt(k, tc.setHSL(s.hue, 0.16 + s.sat * 0.2, 0.62 + s.light * 0.22));
      records.push({ far: !!s.far, x: s.x, z: s.z, y0: s.y + v.crownY * s.scale, top: s.y + v.height * s.scale, r: v.radius * s.scale * s.squash, kind: v.kind });
    });
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    wood.castShadow = leaves.castShadow = true;
    wood.receiveShadow = leaves.receiveShadow = true;
    group.add(wood, leaves);
  });
  return { group, records };
}

export const TREE_VARIANTS = VARIANTS.length;

/** Shared wind sway for all leaves; with a camera, the near / impostor split too. */
export function updateTrees(t, wind, camera = null) {
  swayUniforms.uTime.value = t;
  swayUniforms.uWind.value = wind;
  setTreeWind(t, wind);
  if (camera) updateForests(camera);
}
