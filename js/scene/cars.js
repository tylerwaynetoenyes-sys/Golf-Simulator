// Parked and passing cars: real car models (Sketchfab, CC BY; credited in
// docs/SOURCES.md), reduced in Blender to one mesh each with the parts'
// colours in its vertices and the bodywork flagged (attribute _paint), so a
// whole lot of one model draws in one call and every car gets its own paint.
//   Ford Everest, Skoda Karoq (SUVs), VW Polo (hatchback), Honda Odyssey (minivan)
// Models face down their length along local Z; spots are [x, y, z, yaw].
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { cull } from './instanceCull.js';

// ~1.4k triangles each: parked cars are seen from the course, 100 m and more away
const FILES = ['everest_lo', 'karoq_lo', 'polo_lo', 'odyssey_lo'];
let ready = null;
function load() {
  if (ready) return ready;
  const l = new GLTFLoader();
  l.setDRACOLoader(new DRACOLoader().setDecoderPath(new URL('../../vendor/three/addons/libs/draco/gltf/', import.meta.url).href));
  ready = Promise.all(FILES.map((f) => l.loadAsync(new URL(`../../assets/models/cars/${f}.glb`, import.meta.url).href).then((g) => {
    let geo = null;
    g.scene.traverse((o) => { if (o.isMesh && !geo) { o.updateWorldMatrix(true, false); geo = o.geometry.clone().applyMatrix4(o.matrixWorld); } });
    if (!geo.attributes._paint) geo.setAttribute('_paint', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
    geo.computeBoundingBox();
    return geo;
  }).catch(() => null)));
  return ready;
}
if (typeof window !== 'undefined') load(); // fetch early: they are small

// everyday paint, weighted the way a lot looks: white, black, silver and grey first
const PAINT = [0xf2f2f0, 0xf2f2f0, 0xeceeee, 0x15171a, 0x1d1f22, 0xb7bbbf, 0xa6aaae, 0x6e7378, 0x4a4f54, 0x7a1d1d, 0x1f3a66, 0x2d4f7a, 0x3c4a3a, 0x8a7b62, 0x5a2830];
let material = null;
function carMaterial() {
  if (material) return material;
  material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.35 });
  material.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _paint;')
      .replace('#include <color_vertex>', `
        vColor = vec4(1.0);
        #if defined( USE_COLOR_ALPHA )
          vColor = color;
        #elif defined( USE_COLOR )
          vColor.rgb = color;
        #endif
        #ifdef USE_INSTANCING_COLOR
          // the instance colour is the car's paint: only on the bodywork
          vColor.rgb = mix(vColor.rgb, instanceColor.rgb, _paint);
        #endif`);
  };
  material.customProgramCacheKey = () => 'carPaint';
  return material;
}

/**
 * Cars at `spots` ([x, y, z, yaw], yaw as for a box 4.6 m long along x),
 * dealt out across the models; resolves to a Group (empty if the models
 * could not load). `max` caps how many are drawn (nearest `near` first).
 */
export async function carsAt(spots, rnd = Math.random, { max = 80, near = null } = {}) {
  const geos = (await load()).filter(Boolean);
  const g = new THREE.Group();
  if (!geos.length || !spots.length) return g;
  let list = spots;
  if (near) list = [...spots].sort((a, b) => Math.hypot(a[0] - near[0], a[2] - near[1]) - Math.hypot(b[0] - near[0], b[2] - near[1]));
  list = list.slice(0, max);
  const per = geos.map(() => []);
  for (const s of list) per[Math.floor(rnd() * geos.length)].push(s);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
  geos.forEach((geo, k) => {
    if (!per[k].length) return;
    const inst = new THREE.InstancedMesh(geo, carMaterial(), per[k].length);
    per[k].forEach(([x, y, z, r], i) => {
      inst.setMatrixAt(i, m4.compose(v.set(x, y - 0.02, z), q.setFromEuler(e.set(0, r + Math.PI / 2, 0)), one));
      inst.setColorAt(i, c.set(PAINT[Math.floor(rnd() * PAINT.length)]));
    });
    inst.castShadow = false;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    cull(inst, 3); // a car from its centre
    g.add(inst);
  });
  return g;
}
