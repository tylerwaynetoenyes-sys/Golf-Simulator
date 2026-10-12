// Asset slots for Blender/glTF content and scanned characters.
//
// Every visual element that may later be replaced by an authored model has a
// slot here. A slot with `url: null` keeps the procedural version built in
// code. Point a slot at a .glb (exported from Blender with +Y up, metres,
// origin at the object's base) and it is loaded, placed with the transform
// below, and swapped in for the procedural mesh — no other code changes.
//
// Characters: the `golfer` slot expects a rigged glTF with an animation clip
// named "swing" (and optionally "idle"). Shot data arrives just after impact,
// so `characters.swing()` starts the clip at its impact point.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const ASSET_MANIFEST = {
  golfer: { url: null, position: [-0.55, 0, 0.35], rotationY: Math.PI / 2, scale: 1, castShadow: true },
  arch: { url: null, replaces: 'arch' },
  bridge: { url: null, replaces: 'bridge' },
  riverboat: { url: null, replaces: 'riverboat' },
  canopy: { url: null, replaces: 'canopy' },
  sign: { url: null, replaces: 'altonSign' },
};

const loader = new GLTFLoader();

/** Where impact sits in the "swing" clip, as a fraction of its duration. */
export const IMPACT_FRACTION = 0.55;

export async function loadSlot(name) {
  const slot = ASSET_MANIFEST[name];
  if (!slot || !slot.url) return null;
  try {
    const gltf = await loader.loadAsync(slot.url);
    const root = gltf.scene;
    if (slot.position) root.position.fromArray(slot.position);
    if (slot.rotationY) root.rotation.y = slot.rotationY;
    if (slot.scale) root.scale.setScalar(slot.scale);
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = !!slot.castShadow;
        o.receiveShadow = true;
      }
    });
    return { root, animations: gltf.animations };
  } catch (e) {
    console.warn(`[assets] slot "${name}" failed to load (${slot.url}); keeping procedural version`, e);
    return null;
  }
}

/** Optional golfer character. No-ops cleanly until a model is provided. */
export class Characters {
  constructor(scene) {
    this.scene = scene;
    this.mixer = null;
    this.actions = {};
    this.ready = this._init();
  }

  async _init() {
    const loaded = await loadSlot('golfer');
    if (!loaded) return false;
    this.scene.add(loaded.root);
    this.mixer = new THREE.AnimationMixer(loaded.root);
    for (const clip of loaded.animations) this.actions[clip.name.toLowerCase()] = this.mixer.clipAction(clip);
    this.actions.idle?.play();
    return true;
  }

  /** Play the swing from `secondsBeforeImpact` ahead of its impact frame. */
  swing(secondsBeforeImpact = 0) {
    const a = this.actions.swing;
    if (!a) return;
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.time = Math.max(0, a.getClip().duration * IMPACT_FRACTION - secondsBeforeImpact);
    a.play();
  }

  update(dt) { this.mixer?.update(dt); }
}
