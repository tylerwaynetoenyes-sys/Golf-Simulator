// Wildlife bodies: real models (Sketchfab, CC BY; credited in docs/SOURCES.md),
// reduced in Blender (tools/blender/wildlife.py) to one mesh of 2.5–7k
// triangles with its photographed coat, Draco and WebP. Every file is recentred
// on its feet with its length along Z and the head toward -Z.
//
// A species is drawn as one InstancedMesh (one draw call, plus the shadow
// pass). The models are static, so they move in the vertex shader, driven per
// instance by `aAnim` = (phase, head, gait, flap):
//   head  quadrupeds and standing birds lower the head to graze (1) or lift
//         it (0); the gator lifts its head with negative values
//   gait  the legs swing in a diagonal walk / trot (0 still … 1 full stride);
//         the gator's tail sways instead
//   flap  birds in the air beat their wings (0 gliding … 1 full beat)
// The shadow pass gets the same deformation (customDepthMaterial).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// file, rig, rig parameters (model metres: y up, head toward -Z; z of the neck
// pivot, its height, the head's full turn in radians, the top of the legs,
// the z between fore and hind legs, the stride in radians, strides per
// second at full gait, the z where the tail starts; for wings, the
// half-width of the body and the beats per second)
const SPECIES = {
  gator: { file: 'gator.glb', rig: 'gator', neck: [-1.0, 0.42, 0.22], tail: 0.3 },
  deer_buck: { file: 'deer_buck.glb', rig: 'quad', neck: [-0.3, 0.85, 1.45], legs: [0.58, 0.0, 0.42, 1.9] },
  deer_doe: { file: 'deer_doe.glb', rig: 'quad', neck: [-0.3, 0.85, 1.45], legs: [0.58, 0.0, 0.42, 1.9] },
  sheep: { file: 'sheep.glb', rig: 'quad', neck: [-0.3, 0.62, 1.15], legs: [0.31, 0.0, 0.38, 2.2] },
  squirrel: { file: 'squirrel.glb', rig: 'quad', neck: [-0.13, 0.1, 0.5], legs: [0.075, 0.0, 0.6, 5.0] },
  // birds walk on two legs: every vertex counts as a fore leg (split far behind)
  goose: { file: 'goose.glb', rig: 'quad', neck: [-0.1, 0.32, 1.35], legs: [0.19, 9, 0.35, 2.2] },
  mallard: { file: 'mallard.glb', rig: 'quad', neck: [-0.1, 0.22, 1.0], legs: [0.08, 9, 0.3, 3.0] },
  heron: { file: 'heron.glb', rig: 'quad', neck: [-0.05, 0.78, 0.6], legs: [0.45, 9, 0.28, 1.1] },
  egret: { file: 'egret.glb', rig: 'quad', neck: [-0.05, 0.7, 0.6], legs: [0.4, 9, 0.28, 1.1] },
  sealion: { file: 'sealion.glb', rig: 'quad', neck: [-0.1, 0.9, 0.35] },
  harborseal: { file: 'harborseal.glb', rig: 'quad', neck: [-0.5, 0.5, 0.3] },
  goose_fly: { file: 'goose_fly.glb', rig: 'wings', wings: [0.12, 2.6] },
  eagle: { file: 'eagle.glb', rig: 'wings', wings: [0.16, 1.6] },
  gull: { file: 'gull.glb', rig: 'wings', wings: [0.1, 2.8] },
};

let loader = null;
const ready = new Map();

function load(kind) {
  if (ready.has(kind)) return ready.get(kind);
  if (!loader) {
    loader = new GLTFLoader();
    loader.setDRACOLoader(new DRACOLoader().setDecoderPath(new URL('../../vendor/three/addons/libs/draco/gltf/', import.meta.url).href));
  }
  const p = loader.loadAsync(new URL(`../../assets/models/wildlife/${SPECIES[kind].file}`, import.meta.url).href).then((g) => {
    let mesh = null;
    g.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    mesh.updateWorldMatrix(true, false);
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    geo.computeBoundingSphere();
    return { geo, map: mesh.material.map || null, vc: !!geo.attributes.color };
  }).catch((e) => { console.warn(`wildlife ${kind} unavailable`, e); return null; });
  ready.set(kind, p);
  return p;
}

/** Fetch the models a course will use (browser only). */
export function preloadFauna(kinds) {
  if (typeof window === 'undefined') return Promise.resolve();
  return Promise.all([...new Set(kinds)].filter((k) => SPECIES[k]).map(load));
}

export const uFauna = { uTime: { value: 0 } };

function rigChunk(sp) {
  const n = sp.neck || [0, 0, 0], l = sp.legs || [0, 0, 0, 0], w = sp.wings || [0, 0];
  const f = (v) => Number(v).toFixed(4);
  const head = `
  // the head and neck pitch down (graze) or up about the neck's base
  {
    float d = ${f(n[0])} - transformed.z;
    float k = smoothstep(0.0, 0.18, d);
    float a = -aAnim.y * ${f(n[2])} * k;
    vec2 r = vec2(transformed.y - ${f(n[1])}, transformed.z - ${f(n[0])});
    float c = cos(a), s = sin(a);
    transformed.y = ${f(n[1])} + r.x * c - r.y * s;
    transformed.z = ${f(n[0])} + r.x * s + r.y * c;
  }`;
  if (sp.rig === 'wings') {
    return `
  {
    float ax = abs(transformed.x) - ${f(w[0])};
    if (ax > 0.0) {
      float t = uTime * ${f(w[1])} * 6.2832 + aAnim.x;
      // a full beat when flapping, a slight dihedral flex when gliding
      float a = sin(t) * 0.75 * aAnim.w + 0.08 + 0.04 * sin(t * 0.21);
      float sx = sign(transformed.x);
      transformed.y += ax * sin(a);
      transformed.x = sx * (${f(w[0])} + ax * cos(a));
    }
  }`;
  }
  if (sp.rig === 'gator') {
    return `${head}
  {
    // the tail sweeps side to side as it swims or slides
    float u = max(0.0, transformed.z - ${f(sp.tail)});
    float t = uTime * 1.6 + aAnim.x;
    transformed.x += sin(t - u * 2.2) * u * u * 0.22 * aAnim.z;
    // and a little life at rest
    transformed.x += sin(uTime * 0.31 + aAnim.x) * u * u * 0.025;
  }`;
  }
  return `${head}
  {
    // legs: a diagonal walk / trot, swinging from the top of the leg
    float top = ${f(l[0])};
    if (top > 0.0 && transformed.y < top && aAnim.z > 0.001) {
      float wgt = smoothstep(top, top * 0.62, transformed.y);
      float fore = transformed.z < ${f(l[1])} ? 0.0 : 3.1416;
      float side = transformed.x > 0.0 ? 3.1416 : 0.0;
      float ph = uTime * ${f(l[3])} * 6.2832 + aAnim.x + fore + side;
      float a = sin(ph) * ${f(l[2])} * aAnim.z * wgt;
      float h = top - transformed.y;
      transformed.z += sin(a) * h;
      transformed.y += (1.0 - cos(a)) * h + max(0.0, cos(ph)) * 0.12 * top * aAnim.z * wgt;
    }
  }`;
}

function patch(mat, sp) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uFauna.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aAnim;\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${rigChunk(sp)}`);
  };
  mat.customProgramCacheKey = () => `fauna_${sp.rig}_${(sp.neck || []).join()}_${(sp.legs || []).join()}_${(sp.wings || []).join()}`;
  return mat;
}

/**
 * A herd of one species: an InstancedMesh of up to `cap` animals, drawn at
 * once and filled in when the model arrives. `tint` multiplies the coat (a
 * grey squirrel from the fox squirrel's, a hawk from the eagle).
 */
export class Herd {
  constructor(kind, cap, { tint = 0xffffff, shadow = true, grey = 0 } = {}) {
    this.kind = kind;
    const sp = SPECIES[kind];
    this.geo = new THREE.BufferGeometry();
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.anim.setUsage(THREE.DynamicDrawUsage);
    this.mat = patch(new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, color: tint }), sp);
    // a desaturated coat (grey squirrel, the egret's whites), mixed in the fragment shader
    if (grey > 0) {
      const base = this.mat.onBeforeCompile;
      this.mat.onBeforeCompile = (sh) => {
        base(sh);
        sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  { float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l), ${grey.toFixed(3)}); }`);
      };
      const key = this.mat.customProgramCacheKey;
      this.mat.customProgramCacheKey = () => `${key()}_g${grey}`;
    }
    this.depth = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), sp);
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, cap);
    this.mesh.count = 0;
    this.mesh.visible = false; // until an animal is added
    this.mesh.castShadow = shadow;
    this.mesh.receiveShadow = true;
    this.mesh.customDepthMaterial = this.depth;
    this.mesh.userData.noOcclude = true; // seen, not faded like the trees (js/scene/occlusion.js)
    this.mesh.frustumCulled = false; // a handful of animals spread over a hole; their bounds move
    this.cap = cap;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ'); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
    load(kind).then((m) => {
      if (!m) return;
      this.geo.copy(m.geo);
      this.geo.setAttribute('aAnim', this.anim);
      this.mat.map = m.map;
      this.mat.vertexColors = m.vc;
      this.mat.needsUpdate = true;
    });
    this.geo.setAttribute('aAnim', this.anim);
  }

  /** Claim the next instance slot (or -1 when full). */
  add() {
    if (this.mesh.count >= this.cap) return -1;
    this.mesh.visible = true;
    return this.mesh.count++;
  }

  /** Place instance i: position, heading (yaw 0 = facing -Z), pitch, roll, scale, animation. */
  set(i, x, y, z, yaw, s = 1, pitch = 0, roll = 0) {
    this._e.set(pitch, yaw, roll);
    this.mesh.setMatrixAt(i, this._m.compose(this._v.set(x, y, z), this._q.setFromEuler(this._e), this._s.set(s, s, s)));
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  pose(i, phase, head, gait, flap) {
    const a = this.anim.array;
    a[i * 4] = phase; a[i * 4 + 1] = head; a[i * 4 + 2] = gait; a[i * 4 + 3] = flap;
    this.anim.needsUpdate = true;
  }
}

// ── rigged animals: skinned meshes with their animation baked in the GLB ──
// (tools/blender/wildlife_rig.py). Each animal is its own clone of the rig
// with an AnimationMixer; clips cross-fade by name. Clips play in place: the
// ground speed each one was authored at travels in the file (clipSpeeds), so
// an animal moves exactly as fast as its feet do.

// file; which way the model faces (+1: glTF +Z); clip names by role; real size
// (scale applied to the file); `bodyOf`: share another kind's clips
export const RIGS = {
  doe: { file: 'deer_doe.glb', face: 1, scale: 1.0, clips: { idle: 'Stand_Breathing_01', graze: 'Stand_Eating_01', look: 'Stand_Idle_02', walk: 'WalkSlow', walkFast: 'Walk', trot: 'Trot', run: 'Run', turnL: 'Trans_TurnL', turnR: 'Trans_TurnR' } },
  buck: { file: 'deer_buck.glb', face: 1, scale: 1.08, clipsFrom: 'doe' },
  sheep: { file: 'sheep_rig.glb', face: 1, scale: 1.0, clips: { idle: 'idle', graze: 'graze', look: 'look', walk: 'walk', trot: 'trot', run: 'run' } },
  gator: { file: 'gator.glb', face: 1, scale: 0.9, clips: { bask: 'bask', alert: 'alert', walk: 'walk', slide: 'slide', swim: 'swim', float: 'float', idle: 'bask' } },
};

const rigReady = new Map();
function loadRig(kind) {
  if (rigReady.has(kind)) return rigReady.get(kind);
  const R = RIGS[kind];
  if (!loader) {
    loader = new GLTFLoader();
    loader.setDRACOLoader(new DRACOLoader().setDecoderPath(new URL('../../vendor/three/addons/libs/draco/gltf/', import.meta.url).href));
  }
  const p = Promise.all([
    loader.loadAsync(new URL(`../../assets/models/wildlife/${R.file}`, import.meta.url).href),
    R.clipsFrom ? loadRig(R.clipsFrom) : null,
  ]).then(([g, src]) => {
    let speeds = {};
    g.scene.traverse((o) => {
      if (o.userData?.clipSpeeds) { try { speeds = JSON.parse(o.userData.clipSpeeds); } catch { /* none */ } }
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    const clips = src ? src.clips : new Map(g.animations.map((c) => [c.name, c]));
    if (src) speeds = src.speeds;
    // feet on the ground and centred, in the bind pose
    const box = new THREE.Box3().setFromObject(g.scene);
    const off = new THREE.Vector3(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    return { scene: g.scene, clips, speeds, off, size: box.getSize(new THREE.Vector3()) };
  }).catch((e) => { console.warn(`wildlife rig ${kind} unavailable`, e); return null; });
  rigReady.set(kind, p);
  return p;
}

/** Fetch rigged animals (browser only). */
export function preloadRigs(kinds) {
  if (typeof window === 'undefined') return Promise.resolve();
  return Promise.all([...new Set(kinds)].filter((k) => RIGS[k]).map(loadRig));
}

const tinted = new Map(); // material + tint key → material
function tintMaterial(m, tint, grey) {
  const key = `${m.uuid}|${tint}|${grey}`;
  if (tinted.has(key)) return tinted.get(key);
  const t = m.clone();
  t.color.multiply(new THREE.Color(tint));
  if (grey > 0) {
    t.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  { float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l), ${grey.toFixed(3)}); }`);
    };
    t.customProgramCacheKey = () => `grey${grey}`;
  }
  tinted.set(key, t);
  return t;
}

/**
 * One rigged animal. `root` is placed by the caller (feet at its origin,
 * facing -Z at yaw 0); the model fills in when its file arrives.
 */
export class Beast {
  constructor(kind, { scale = 1, tint = null, grey = 0 } = {}) {
    this.kind = kind;
    this.root = new THREE.Group();
    this.root.name = `beast_${kind}`;
    this.root.userData.noOcclude = true;
    this.scale = scale * (RIGS[kind]?.scale || 1);
    this.mixer = null;
    this.actions = new Map();
    this.current = null;
    this.want = ['idle', {}];
    this.speeds = {};
    this.awake = true;
    loadRig(kind).then((m) => {
      if (!m) return;
      const R = RIGS[kind], names = RIGS[R.clipsFrom || kind]?.clips || R.clips;
      const body = cloneSkinned(m.scene);
      if (tint != null || grey > 0) body.traverse((o) => { if (o.isMesh) o.material = tintMaterial(o.material, tint ?? 0xffffff, grey); });
      const pivot = new THREE.Group();
      pivot.add(body);
      body.position.copy(m.off);
      pivot.rotation.y = R.face > 0 ? Math.PI : 0;
      pivot.scale.setScalar(this.scale);
      this.root.add(pivot);
      this.mixer = new THREE.AnimationMixer(body);
      for (const [role, clipName] of Object.entries(names)) {
        const c = m.clips.get(clipName);
        if (c) this.actions.set(role, this.mixer.clipAction(c));
      }
      // ground speeds are keyed by clip (its name, or with a lower-case first letter)
      for (const [role, clipName] of Object.entries(names)) {
        const v = m.speeds[clipName] ?? m.speeds[clipName[0].toLowerCase() + clipName.slice(1)] ?? 0;
        this.speeds[role] = v * this.scale;
      }
      this.size = m.size.clone().multiplyScalar(this.scale);
      const [n, o] = this.want; this.current = null; this.play(n, o);
    });
  }

  has(role) { return this.actions.has(role); }

  /** Cross-fade to the clip for `role`. once: play through and hold the last frame. */
  play(role, { fade = 0.4, once = false, timeScale = 1, offset = Math.random() } = {}) {
    this.want = [role, { fade, once, timeScale, offset }];
    const a = this.actions.get(role);
    if (!a) return;
    a.timeScale = timeScale;
    if (this.current === a) return;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    if (!once) a.time = offset * a.getClip().duration;
    a.enabled = true;
    a.play();
    if (this.current) this.current.crossFadeTo(a, fade, false); else a.fadeIn(Math.min(fade, 0.1));
    this.current = a;
    this.role = role;
  }

  speed(role) { return this.speeds[role] || 0; }

  update(dt) { if (this.mixer && this.awake) this.mixer.update(dt); }
}
