// Real tree models for the courses (evolveduk's photographic set on
// Sketchfab, CC BY, plus Poly Haven's scanned olive; credited in
// docs/SOURCES.md). Each model is bark plus alpha-tested leaf cards, a few
// thousand triangles, exported Draco-compressed by tools/blender/trees.py.
//
// Drawing: every tree has two levels of detail.
// - near: the model itself, instanced per species, for the closest trees in
//   view (capped, so a wood beside the tee can't blow the triangle budget);
//   the nearest of those cast shadows;
// - far: an impostor, a camera-facing card cut from eight views of the model
//   baked once at load (one draw call per species for the whole forest).
// The split is redone each frame from the camera (`updateForests`).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/**
 * Species models. `height` is the size a tree of scale 1 stands at; `kind`
 * feeds the camera's canopy checks (broad / pine / cedar).
 */
export const SPECIES = {
  oak: { url: 'trees/oak.glb', height: 13, kind: 'broad' },
  beech: { url: 'trees/beech.glb', height: 13, kind: 'broad' },
  maple: { url: 'trees/maple.glb', height: 14, kind: 'broad' },
  elm: { url: 'trees/elm.glb', height: 16, kind: 'broad' },
  oldtree: { url: 'trees/oldtree.glb', height: 12, kind: 'broad' },
  acacia: { url: 'trees/acacia.glb', height: 11, kind: 'broad' }, // flat crown: umbrella pine, Monterey cypress
  pine: { url: 'trees/pine.glb', height: 22, kind: 'pine' }, // ponderosa
  spruce: { url: 'trees/spruce.glb', height: 13, kind: 'cedar' },
  juniper: { url: 'trees/juniper.glb', height: 8, kind: 'cedar' }, // a narrow column: red cedar, Italian cypress
  palm: { url: 'trees/palm.glb', height: 11, kind: 'broad' },
  olive: { url: 'island_tree_02.glb', height: 6.5, kind: 'broad' }, // Poly Haven scan, ~35k triangles
};

/** Near-model budget (the rest draw as impostors). */
export const LOD = {
  near: 150, // m: models inside, impostors beyond
  maxNear: 110, // models drawn at most (whole forest)
  nearTris: 520000, // and their triangle budget
  shadowNear: 70, maxShadow: 45, shadowTris: 220000, // the ones that cast shadows
};

let draco = null;
function loader() {
  const l = new GLTFLoader();
  draco ||= new DRACOLoader().setDecoderPath(new URL('../../vendor/three/addons/libs/draco/gltf/', import.meta.url).href);
  l.setDRACOLoader(draco);
  return l;
}

const models = new Map(); // name → model record, or null when it failed
const pending = new Map();

/** Load species models (browser only). Resolves when all have settled. */
export function loadSpecies(names) {
  if (typeof window === 'undefined') return Promise.resolve();
  return Promise.all(names.map((name) => {
    if (models.has(name)) return null;
    if (pending.has(name)) return pending.get(name);
    const src = SPECIES[name];
    const p = loader().loadAsync(new URL(`../../assets/models/${src.url}`, import.meta.url).href)
      .then((g) => models.set(name, prepare(name, g.scene, src)))
      .catch((e) => { console.warn(`tree ${name} unavailable`, e); models.set(name, null); });
    pending.set(name, p);
    return p;
  }));
}

/** A loaded species, or null. */
export const species = (name) => models.get(name) || null;

const sway = { uTime: { value: 0 }, uWind: { value: 0.3 } };
export function setTreeWind(t, wind) {
  sway.uTime.value = t;
  sway.uWind.value = wind;
}

/**
 * Alpha-tested cards thin out with distance as mipmaps average their alpha
 * away; scaling alpha up with the mip level keeps the crown full.
 */
const MIP_ALPHA = `#ifdef USE_MAP
  vec2 tsz = vec2(textureSize(map, 0));
  vec2 ddx = dFdx(vMapUv * tsz), ddy = dFdy(vMapUv * tsz);
  float mipLevel = max(0.0, 0.5 * log2(max(dot(ddx, ddx), dot(ddy, ddy))));
  diffuseColor.a *= 1.0 + mipLevel * 0.28;
#endif
#include <alphatest_fragment>`;

/** Leaves move with the wind, more toward the crown and the branch tips. */
function addSway(m, amount) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = sway.uTime;
    sh.uniforms.uWind = sway.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = instanceMatrix[3].xyz;
#else
  vec3 ip = vec3(0.0);
#endif
  float ph = ip.x * 0.11 + ip.z * 0.07;
  float k = max(0.0, transformed.y - 2.0) * ${amount.toFixed(4)} * (0.35 + uWind);
  float flick = sin(uTime * 4.7 + ph * 5.0 + dot(transformed, vec3(1.7, 0.9, 1.3))) * 0.035 * (0.3 + uWind);
  transformed.x += sin(uTime * 1.3 + ph) * k + flick;
  transformed.z += cos(uTime * 1.1 + ph) * k * 0.6;
  transformed.y += flick * 0.6;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', MIP_ALPHA)
      // crown normals face out on both sides of a card (no back-face flip)
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace(/gl_FrontFacing \? 1\.0 : - ?1\.0/, '1.0'));
  };
  m.customProgramCacheKey = () => `treeSway${amount}`;
}

/** Normalise a loaded model: one geometry per material, base at y = 0, sized. */
function prepare(name, scene, src) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const k = src.height / Math.max(0.01, box.max.y - box.min.y);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const parts = [];
  let tris = 0;
  const leafBox = new THREE.Box3();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    geo.translate(-cx, -box.min.y, -cz).scale(k, k, k);
    for (const a of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(a)) geo.deleteAttribute(a);
    geo.computeBoundingSphere();
    const m = o.material;
    const leaf = m.alphaTest > 0 || m.transparent || !!m.alphaMap;
    m.metalness = 0;
    m.metalnessMap = null;
    if (leaf) {
      m.transparent = false;
      m.alphaTest = THREE.MathUtils.clamp(m.alphaTest || 0.3, 0.2, 0.4);
      m.side = THREE.DoubleSide;
      m.roughness = 0.85;
      m.roughnessMap = null;
      m.normalMap = null; // cards: the normal map only adds shimmer at range
      m.shadowSide = THREE.DoubleSide;
      addSway(m, name === 'palm' ? 0.02 : 0.012);
      geo.computeBoundingBox();
      leafBox.union(geo.boundingBox);
    } else {
      m.side = THREE.FrontSide;
      m.roughness = Math.max(m.roughness, 0.85);
    }
    m.needsUpdate = true;
    tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    geo.userData.shared = true;
    parts.push({ geometry: geo, material: m, leaf });
  });
  // leaf cards shade as one soft crown: normals mostly radial from its centre
  if (!leafBox.isEmpty()) {
    const c = leafBox.getCenter(new THREE.Vector3());
    const half = leafBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const v = new THREE.Vector3(), nv = new THREE.Vector3();
    for (const p of parts) {
      if (!p.leaf) continue;
      const pos = p.geometry.attributes.position;
      let nrm = p.geometry.attributes.normal;
      if (!nrm) { p.geometry.computeVertexNormals(); nrm = p.geometry.attributes.normal; }
      for (let i = 0; i < pos.count; i++) {
        v.set((pos.getX(i) - c.x) / half.x, (pos.getY(i) - c.y) / half.y + 0.45, (pos.getZ(i) - c.z) / half.z).normalize(); // a sky bias
        nv.fromBufferAttribute(nrm, i);
        if (nv.dot(v) < 0) nv.negate();
        nv.lerp(v, 0.8).normalize();
        nrm.setXYZ(i, nv.x, nv.y, nv.z);
      }
      nrm.needsUpdate = true;
    }
  }
  // collision and camera checks: the crown is where the leaves are
  const H = src.height;
  const crownY = leafBox.isEmpty() ? H * 0.35 : Math.max(0.5, leafBox.min.y);
  const radius = leafBox.isEmpty() ? H * 0.3
    : (Math.max(leafBox.max.x - leafBox.min.x, leafBox.max.z - leafBox.min.z) / 2) * 0.85;
  const rec = { name, parts, height: H, radius, crownY, kind: src.kind, tris, impostor: null };
  rec.impostor = bakeImpostor(rec);
  return rec;
}

// ── impostors ────────────────────────────────────────────────────────────
const VIEWS = 8;
let bakeRenderer = null;

/**
 * Render the model from VIEWS directions around it into one atlas (albedo,
 * unlit; the scene lights the card), in a throwaway WebGL context, read back
 * as plain pixels so transparent texels keep a colour for clean mipmaps.
 */
function bakeImpostor(rec) {
  const H = rec.height;
  let R = 0;
  for (const p of rec.parts) {
    const pos = p.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) R = Math.max(R, Math.hypot(pos.getX(i), pos.getZ(i)));
  }
  const W = 2 * R;
  const cellH = Math.round(256 * Math.min(1, H / W));
  const cellW = Math.round(256 * Math.min(1, W / H));
  const atlasW = cellW * VIEWS, atlasH = cellH;
  try {
    bakeRenderer ||= new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: false });
  } catch (e) {
    return null;
  }
  const r = bakeRenderer;
  const rt = new THREE.WebGLRenderTarget(atlasW, atlasH, { colorSpace: THREE.SRGBColorSpace });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  for (const p of rec.parts) {
    const src = p.material;
    const m = new THREE.MeshBasicMaterial({ map: src.map, color: src.color, alphaTest: p.leaf ? src.alphaTest * 0.8 : 0, side: THREE.DoubleSide });
    scene.add(new THREE.Mesh(p.geometry, m));
  }
  // a little shading so the card isn't flat: darker toward the core and the base
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.material.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vP;\nuniform float uH; uniform float uR;`)
        .replace('#include <opaque_fragment>', `float core = clamp(length(vP.xz) / max(uR, 0.01), 0.0, 1.0);
  float up = clamp(vP.y / uH, 0.0, 1.0);
  outgoingLight *= 0.62 + 0.28 * core + 0.22 * up;
#include <opaque_fragment>`);
      sh.uniforms.uH = { value: H };
      sh.uniforms.uR = { value: R };
    };
  });
  const cam = new THREE.OrthographicCamera(-W / 2, W / 2, H, 0, 0.1, W * 4 + 10);
  r.setRenderTarget(rt);
  r.setClearColor(0x000000, 0);
  r.clear();
  r.setScissorTest(true);
  for (let k = 0; k < VIEWS; k++) {
    const a = (k / VIEWS) * Math.PI * 2;
    cam.position.set(Math.sin(a) * W * 2, 0, Math.cos(a) * W * 2);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    r.setViewport(k * cellW, 0, cellW, cellH);
    r.setScissor(k * cellW, 0, cellW, cellH);
    r.render(scene, cam);
  }
  r.setScissorTest(false);
  const px = new Uint8Array(atlasW * atlasH * 4);
  r.readRenderTargetPixels(rt, 0, 0, atlasW, atlasH, px);
  r.setRenderTarget(null);
  rt.dispose();
  scene.traverse((o) => o.isMesh && o.material.dispose());
  bleed(px, atlasW, atlasH);
  const tex = new THREE.DataTexture(px, atlasW, atlasH, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return { texture: tex, width: W, height: H };
}

/** Spread each opaque texel's colour into its transparent neighbours. */
function bleed(px, w, h) {
  const filled = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) filled[i] = px[i * 4 + 3] > 0 ? 1 : 0;
  for (let pass = 0; pass < 8; pass++) {
    const next = filled.slice();
    let changed = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (filled[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const X = x + dx, Y = y + dy;
            if (X < 0 || Y < 0 || X >= w || Y >= h || !filled[Y * w + X]) continue;
            const j = (Y * w + X) * 4;
            r += px[j]; g += px[j + 1]; b += px[j + 2]; n++;
          }
        }
        if (!n) continue;
        px[i * 4] = r / n; px[i * 4 + 1] = g / n; px[i * 4 + 2] = b / n; // alpha stays 0
        next[i] = 1;
        changed = true;
      }
    }
    filled.set(next);
    if (!changed) break;
  }
}

/** Camera-facing (about the vertical) card, the view picked by bearing. */
const IMPOSTOR_SHADE = 'vec3(0.74, 0.76, 0.7)';
function impostorMaterial(imp) {
  const m = new THREE.MeshStandardMaterial({ map: imp.texture, alphaTest: 0.4, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 iPos;   // x, y, z, rotation
attribute vec3 iSize;  // width, height, hidden
attribute vec3 iTint;
varying vec3 vTint;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
  vec3 toCam = cameraPosition - iPos.xyz;
  float az = atan(toCam.x, toCam.z) - iPos.w;
  float view = mod(floor(az / 6.2831853 * ${VIEWS}.0 + 0.5), ${VIEWS}.0);
  #ifdef USE_MAP
  vMapUv = vec2((view + uv.x) / ${VIEWS}.0, uv.y);
  #endif`)
      .replace('#include <beginnormal_vertex>', `vec3 tc = cameraPosition - iPos.xyz; tc.y = 0.0;
  vec3 objectNormal = normalize(normalize(tc + vec3(1e-4, 0.0, 0.0)) * 0.7 + vec3(0.0, 0.75, 0.0));`)
      .replace('#include <begin_vertex>', `vec3 fw = cameraPosition - iPos.xyz; fw.y = 0.0;
  fw = normalize(fw + vec3(1e-4, 0.0, 0.0));
  vec3 right = vec3(fw.z, 0.0, -fw.x);
  vec3 transformed = iPos.xyz + right * position.x * iSize.x + vec3(0.0, position.y * iSize.y, 0.0);
  if (iSize.z > 0.5) transformed = iPos.xyz - vec3(0.0, 1000.0, 0.0);
  vTint = iTint;`)
      .replace('#include <project_vertex>', `vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;`)
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(transformed, 1.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTint;')
      // a model's crown shades itself (shadow map, inner leaves); the flat
      // card can't, so its albedo carries that darkening
      .replace('#include <map_fragment>', `#include <map_fragment>\n  diffuseColor.rgb *= vTint * ${IMPOSTOR_SHADE};`)
      .replace('#include <alphatest_fragment>', MIP_ALPHA);
  };
  m.customProgramCacheKey = () => `treeImpostor${IMPOSTOR_SHADE}`;
  return m;
}

// ── a planted forest ─────────────────────────────────────────────────────
const forests = new Set();

/**
 * Instance trees of loaded species. `list` is [{rec, x, y, z, rot, sx, sy, tint}]
 * (sx the horizontal scale, sy the vertical). Returns a Group whose
 * `userData.forest` is refreshed by updateForests().
 */
export function buildForest(list) {
  const group = new THREE.Group();
  group.name = 'forest';
  const bySpecies = new Map();
  for (const t of list) {
    if (!bySpecies.has(t.rec)) bySpecies.set(t.rec, []);
    bySpecies.get(t.rec).push(t);
  }
  const sets = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const [rec, trees] of bySpecies) {
    const n = trees.length;
    const mats = new Float32Array(n * 16);
    const tints = new Float32Array(n * 3);
    const radii = new Float32Array(n);
    trees.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rot);
      m4.compose(p.set(t.x, t.y, t.z), q, s.set(t.sx, t.sy, t.sx));
      m4.toArray(mats, i * 16);
      tints.set([t.tint.r, t.tint.g, t.tint.b], i * 3);
      radii[i] = Math.max(rec.height * t.sy, rec.radius * 2 * t.sx) * 0.6;
    });
    // near: two tiers, the closest casting shadows
    const tier = (cap, shadow) => {
      const meshes = rec.parts.map((part) => {
        const im = new THREE.InstancedMesh(part.geometry, part.material, cap);
        im.count = 0;
        im.frustumCulled = false; // culled per tree in updateForests
        im.castShadow = shadow;
        im.receiveShadow = true;
        if (part.leaf) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        group.add(im);
        return { im, leaf: part.leaf };
      });
      return { meshes, cap };
    };
    // no one species takes more than half the budget (the scanned olive is 35k)
    const nearCap = Math.min(n, LOD.maxNear, Math.max(4, Math.floor(LOD.nearTris * 0.5 / rec.tris)));
    const tiers = [tier(Math.min(nearCap, LOD.maxShadow), true), tier(nearCap, false)];
    // far: one impostor card per tree
    let imp = null;
    if (rec.impostor) {
      const g = new THREE.InstancedBufferGeometry();
      const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
      g.index = plane.index;
      g.setAttribute('position', plane.attributes.position);
      g.setAttribute('normal', plane.attributes.normal);
      g.setAttribute('uv', plane.attributes.uv);
      const iPos = new Float32Array(n * 4), iSize = new Float32Array(n * 3);
      trees.forEach((t, i) => {
        iPos.set([t.x, t.y, t.z, t.rot], i * 4);
        iSize.set([rec.impostor.width * t.sx, rec.impostor.height * t.sy, 0], i * 3);
      });
      g.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 4));
      const sizeAttr = new THREE.InstancedBufferAttribute(iSize, 3);
      sizeAttr.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('iSize', sizeAttr);
      g.setAttribute('iTint', new THREE.InstancedBufferAttribute(tints, 3));
      g.instanceCount = n;
      const mesh = new THREE.Mesh(g, impostorMaterial(rec.impostor));
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      group.add(mesh);
      imp = { mesh, size: sizeAttr };
    }
    sets.push({ rec, trees, n, mats, tints, radii, tiers, imp, near: new Uint8Array(n) });
  }
  const forest = { group, sets, key: '' };
  group.userData.forest = forest;
  group.userData.dispose = () => forests.delete(forest);
  forests.add(forest);
  return group;
}

const frustum = new THREE.Frustum();
const pv = new THREE.Matrix4();
const sphere = new THREE.Sphere();
const camPos = new THREE.Vector3();

function inScene(o) {
  while (o.parent) o = o.parent;
  return o.isScene;
}

/** Re-split near models and impostors for the camera. */
export function updateForests(camera) {
  if (!camera) return;
  camera.updateMatrixWorld();
  camPos.setFromMatrixPosition(camera.matrixWorld);
  pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(pv);
  const key = pv.elements.map((v) => v.toFixed(3)).join(',');
  for (const f of forests) {
    if (!inScene(f.group)) { if (f.seen) forests.delete(f); continue; } // a hole that's been replaced
    f.seen = true;
    if (f.key === key) continue;
    f.key = key;
    splitForest(f);
  }
}

const cand = []; // flat triples: distance², set, tree
const order = [];
/** Nearest trees in view become models, within the count and triangle budgets. */
function splitForest(f) {
  cand.length = 0;
  const near2 = LOD.near * LOD.near;
  f.sets.forEach((set, si) => {
    const { n, mats, radii } = set;
    for (let i = 0; i < n; i++) {
      const x = mats[i * 16 + 12], y = mats[i * 16 + 13], z = mats[i * 16 + 14];
      const dx = x - camPos.x, dz = z - camPos.z, dy = y - camPos.y;
      const d2 = dx * dx + dz * dz + dy * dy;
      if (d2 > near2) continue;
      // a margin so shadows of trees just out of view still fall into it
      sphere.center.set(x, y + radii[i] * 0.6, z);
      sphere.radius = radii[i] + 12;
      if (!frustum.intersectsSphere(sphere)) continue;
      cand.push(d2, si, i);
    }
  });
  order.length = 0;
  for (let k = 0; k < cand.length; k += 3) order.push(k);
  order.sort((a, b) => cand[a] - cand[b]);
  const counts = f.sets.map(() => [0, 0]);
  for (const set of f.sets) set.near.fill(0);
  const shadow2 = LOD.shadowNear * LOD.shadowNear;
  let total = 0, tris = 0, shadows = 0, shadowTris = 0;
  for (const k of order) {
    if (total >= LOD.maxNear || tris >= LOD.nearTris) break;
    const si = cand[k + 1], i = cand[k + 2];
    const set = f.sets[si], c = counts[si], t = set.rec.tris;
    const [shadowTier, plainTier] = set.tiers;
    if (cand[k] < shadow2 && shadows < LOD.maxShadow && shadowTris + t <= LOD.shadowTris && c[0] < shadowTier.cap) {
      put(set, shadowTier, c[0]++, i);
      shadows++; shadowTris += t;
    } else if (c[1] < plainTier.cap && tris + t <= LOD.nearTris) {
      put(set, plainTier, c[1]++, i);
    } else continue;
    set.near[i] = 1;
    total++; tris += t;
  }
  f.sets.forEach((set, si) => {
    set.tiers.forEach((tier, ti) => {
      for (const { im } of tier.meshes) {
        im.count = counts[si][ti];
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    });
    if (set.imp) {
      const a = set.imp.size.array;
      for (let i = 0; i < set.n; i++) a[i * 3 + 2] = set.near[i];
      set.imp.size.needsUpdate = true;
    }
  });
}

function put(set, tier, slot, i) {
  for (const { im } of tier.meshes) {
    im.instanceMatrix.array.set(set.mats.subarray(i * 16, i * 16 + 16), slot * 16);
    if (im.instanceColor) im.instanceColor.array.set(set.tints.subarray(i * 3, i * 3 + 3), slot * 3);
  }
}

/** Triangles a forest would draw now (for the budget readout). */
export function forestStats() {
  let near = 0, far = 0, tris = 0;
  for (const f of forests) {
    for (const s of f.sets) {
      const k = s.tiers[0].meshes[0].im.count + s.tiers[1].meshes[0].im.count;
      near += k;
      far += s.n - k;
      tris += k * s.rec.tris + (s.n - k) * 2;
    }
  }
  return { near, far, tris };
}
