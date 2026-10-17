// Wildlife bodies: real animals (Sketchfab, CC BY; credited in docs/SOURCES.md),
// rigged and animated in Blender (tools/blender/wildlife_rig/), the clips baked
// into each GLB: the deer's are WildMesh 3D's own professional animation, the
// rest are authored there (the alligator's bask, slide, swim and float; the
// birds' grazing, walking, take-off and wingbeats; the sheep's grazing walk).
// Every file faces glTF +Z with its feet on the ground.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

let loader = null;

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
  goose: { file: 'goose_rig.glb', face: 1, scale: 1.0, clips: { idle: 'idle', graze: 'graze', walk: 'walk', alert: 'alert', hiss: 'hiss', run: 'run' } },
  heron: { file: 'heron_rig.glb', face: 1, scale: 1.0, clips: { idle: 'idle', stalk: 'stalk', strike: 'strike', alert: 'alert', crouch: 'crouch' } },
  egret: { file: 'egret_rig.glb', face: 1, scale: 1.0, clips: { idle: 'idle', stalk: 'stalk', strike: 'strike', alert: 'alert', crouch: 'crouch' } },
  mallard: { file: 'mallard_rig.glb', face: 1, scale: 1.0, clips: { idle: 'idle', dabble: 'dabble', preen: 'preen' } },
  squirrel: { file: 'squirrel_rig.glb', face: 1, scale: 1.0, clips: { idle: 'idle', graze: 'graze', look: 'look', walk: 'walk', trot: 'trot', run: 'run', sit: 'sit' } },
  sealion: { file: 'sealion_rig.glb', face: 1, scale: 0.85, clips: { idle: 'idle', look: 'look', bark: 'bark' } },
  harborseal: { file: 'harborseal_rig.glb', face: 1, scale: 1.0, clips: { idle: 'idle', look: 'look', banana: 'banana' } },
  goose_fly: { file: 'goose_fly_rig.glb', face: 1, scale: 1.0, clips: { flap: 'flap', glide: 'glide', takeoff: 'takeoff' } },
  heron_fly: { file: 'heron_fly.glb', face: 1, scale: 0.85, clips: { flap: 'flap', glide: 'glide', takeoff: 'takeoff' } },
  egret_fly: { file: 'egret_fly.glb', face: 1, scale: 0.75, clips: { flap: 'flap', glide: 'glide', takeoff: 'takeoff' } },
  pelican: { file: 'pelican.glb', face: 1, scale: 0.95, clips: { flap: 'flap', glide: 'glide', takeoff: 'takeoff' } },
  osprey: { file: 'osprey.glb', face: 1, scale: 1.0, clips: { flap: 'flap', glide: 'glide', takeoff: 'takeoff' } },
  eagle: { file: 'eagle_rig.glb', face: 1, scale: 1.0, clips: { flap: 'flap', glide: 'glide', takeoff: 'takeoff' } },
  gull: { file: 'gull_rig.glb', face: 1, scale: 1.0, clips: { flap: 'flap', glide: 'glide', takeoff: 'takeoff' } },
  gator: { file: 'gator.glb', face: 1, scale: 0.9, clips: { bask: 'bask', alert: 'alert', walk: 'walk', slide: 'slide', swim: 'swim', float: 'float', idle: 'bask' } },
};

const rigReady = new Map();
function loadRig(kind) {
  if (!RIGS[kind]) return Promise.resolve(null);
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
  constructor(kind, { scale = 1, tint = null, grey = 0, shadow = true } = {}) {
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
      body.traverse((o) => {
        if (!o.isMesh) return;
        if (tint != null || grey > 0) o.material = tintMaterial(o.material, tint ?? 0xffffff, grey);
        o.castShadow = shadow;
      });
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

  /** Place it: feet at (x, y, z), heading `yaw` (0 faces -Z), pitch and roll in radians. */
  place(x, y, z, yaw, pitch = 0, roll = 0) {
    this.root.position.set(x, y, z);
    this.root.rotation.set(pitch, yaw, roll, 'YXZ');
  }

  update(dt) { if (this.mixer && this.awake) this.mixer.update(dt); }
}
