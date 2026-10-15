// Imported models (Sketchfab, CC BY; credited in docs/SOURCES.md), loaded
// once per course before its holes are built, then handed out as clones.
// Every model is optional: the procedural stand-ins draw when one is missing.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FILES = {
  eiffel: 'eiffel_tower.glb',
  statue: 'statue_of_liberty.glb',
  lowrider: 'lowrider_impala.glb',
  wreck: 'abandoned_sedan.glb',
  people: 'people_male.glb',
};
/** Which models each course uses. */
export const COURSE_MODELS = {
  paris: ['eiffel'],
  liberty: ['statue'],
  eaststl: ['lowrider', 'wreck', 'people'],
  sawgrass: ['people'],
};

const cache = new Map(); // name → THREE.Object3D (the loaded scene)
const pending = new Map();

function load(name) {
  if (cache.has(name)) return Promise.resolve(cache.get(name));
  if (pending.has(name)) return pending.get(name);
  const url = new URL(`../../assets/models/${FILES[name]}`, import.meta.url).href;
  const p = new GLTFLoader().loadAsync(url).then((g) => {
    g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    cache.set(name, g.scene);
    return g.scene;
  }).catch((e) => { console.warn(`model ${name} unavailable`, e); return null; });
  pending.set(name, p);
  return p;
}

/** Load what a course needs (browser only). */
export function preloadCourseModels(courseId) {
  if (typeof window === 'undefined') return Promise.resolve();
  return Promise.all((COURSE_MODELS[courseId] || []).map(load));
}

/** A clone of a loaded model, or null if it isn't loaded. Materials are shared. */
export function model(name) {
  const m = cache.get(name);
  return m ? m.clone(true) : null;
}

/** Size of a loaded model's bounding box (for placing it). */
export function modelBox(obj) {
  return new THREE.Box3().setFromObject(obj);
}
