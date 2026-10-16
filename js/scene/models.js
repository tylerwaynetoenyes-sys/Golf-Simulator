// Imported models (Sketchfab, CC BY; credited in docs/SOURCES.md), loaded
// once per course before its holes are built, then handed out as clones.
// Every model is optional: the procedural stand-ins draw when one is missing.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeByMaterial } from './merge.js';

// full-detail meshes ship Draco-compressed; the decoder is vendored
let draco = null;
function gltfLoader() {
  const l = new GLTFLoader();
  draco ||= new DRACOLoader().setDecoderPath(new URL('../../vendor/three/addons/libs/draco/gltf/', import.meta.url).href);
  l.setDRACOLoader(draco);
  return l;
}

const FILES = {
  eiffel: 'eiffel_tower.glb',
  statue: 'statue_of_liberty.glb',
  lowrider: 'lowrider_impala.glb',
  wreck: 'abandoned_sedan.glb',
  people: 'people_real.glb', // Renderpeople and deep3dstudio scans
  peopleLo: 'people_lo.glb', // the same four at ~1.5k triangles, for range
  rubble: 'rubble_concrete.glb', // a scanned heap of broken concrete (albentan2012)
  zooAnimals: 'zoo_animals.glb', // giraffe, elephant, zebra, penguin, flamingo, polar bear, lion (one node each)
  zooRocks: 'zoo_rocks.glb', // two scanned boulders (spogna, 3dhdscan), 1 m across
  zooMarine: 'zoo_marine.glb', // California sea lion (zhaoqinzzq) and harbor seal (c4rn4g3)
  zooMore: 'zoo_more.glb', // gorilla, orangutan (rt699448), hippo (psk98077)
  cahokiaPeople: 'cahokia_people.glb', // four Mississippian figures (MakeHuman, CC0), one node each
};
/** Which models each course uses. */
export const COURSE_MODELS = {
  paris: ['eiffel', 'peopleLo', 'statue'],
  liberty: ['statue'],
  range: ['peopleLo'], // the bays' crowds
  centralpark: ['peopleLo'],
  eaststl: ['lowrider', 'wreck', 'people', 'peopleLo', 'rubble'],
  sawgrass: ['people', 'peopleLo'],
  // the scanned crowds at the riverfront and in the parks (instanced, js/scene/crowd.js)
  confluence: ['peopleLo', 'zooAnimals', 'zooRocks', 'cahokiaPeople'], // the zoo hole's animals and boulders; the Monks Mound hole's villagers
  alton: ['peopleLo'],
  forestpark: ['peopleLo', 'zooAnimals', 'zooRocks', 'zooMarine', 'zooMore'], // the zoo is in the park
  stlzoo: ['zooAnimals', 'zooRocks', 'zooMarine', 'zooMore', 'peopleLo'],
  cahokia: ['cahokiaPeople'],
};

const cache = new Map(); // name → THREE.Object3D (the loaded scene)
const pending = new Map();

function load(name) {
  if (cache.has(name)) return Promise.resolve(cache.get(name));
  if (pending.has(name)) return pending.get(name);
  const url = new URL(`../../assets/models/${FILES[name]}`, import.meta.url).href;
  const p = gltfLoader().loadAsync(url).then((g) => {
    // one draw call per material for each model (each figure in the people set)
    for (const top of [...g.scene.children]) mergeByMaterial(top);
    g.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      // glTF transmission (the lowrider's glass) makes three.js render the
      // whole opaque scene a second time every frame to refract it: plain
      // tinted transparency reads the same at this size
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.transmission > 0) {
          m.opacity = Math.min(m.opacity, 0.25 + 0.4 * (1 - m.transmission));
          m.transmission = 0;
          m.transparent = true;
          m.depthWrite = false;
          o.castShadow = false;
        }
      }
    });
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

// ── equipment: club heads, shafts and grips, golf balls ──
// Built in Blender from published dimensions (tools/equipment, tools/blender/
// equipment.py): one GLB per head (assets/models/clubs/<set>/<club>.glb, with
// its face centre and shaft axis in the node's extras), one per set's shafts
// and grip, one per ball. Loaded on demand; callers draw the procedural
// stand-ins until a file arrives.
const eqCache = new Map(); // path → THREE.Object3D | null
const eqPending = new Map();

/** Load an equipment GLB by its path under assets/models; resolves to its scene (or null). */
export function loadEquipment(path) {
  if (eqCache.has(path)) return Promise.resolve(eqCache.get(path));
  if (eqPending.has(path)) return eqPending.get(path);
  if (typeof window === 'undefined') return Promise.resolve(null);
  const url = new URL(`../../assets/models/${path}`, import.meta.url).href;
  const p = gltfLoader().loadAsync(url).then((g) => {
    g.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
    });
    eqCache.set(path, g.scene);
    return g.scene;
  }).catch((e) => { console.warn(`equipment ${path} unavailable`, e); eqCache.set(path, null); return null; });
  eqPending.set(path, p);
  return p;
}

/** A loaded equipment scene (shared, not cloned), or undefined while it loads / null if missing. */
export function equipment(path) { return eqCache.get(path); }
