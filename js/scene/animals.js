// Livestock and game for the prairie landmarks: real models (Sketchfab, CC BY;
// credited in docs/SOURCES.md), reduced in Blender to one ~3k-triangle mesh
// with its photographed coat as a 512-1024 px texture:
//   bison: "Animated Free Bison" (AneesAnimates), posed standing
//   ox: "Brown Cow 3d model" (rt699448), drawn for the wagon teams' oxen
// Each is recentred on its feet with its length along Z, head toward -Z, and
// drawn instanced. Spots are [x, y, z, yaw, scale].
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// which way each file's head points along Z once loaded (+1 = +Z)
const FILES = { bison: ['bison.glb', -1, 0x9a7458], ox: ['ox.glb', 1, 0xffffff] };
const ready = new Map();
let loader = null;
function load(kind) {
  if (ready.has(kind)) return ready.get(kind);
  if (!loader) {
    loader = new GLTFLoader();
    loader.setDRACOLoader(new DRACOLoader().setDecoderPath(new URL('../../vendor/three/addons/libs/draco/gltf/', import.meta.url).href));
  }
  const [file, head, tint] = FILES[kind];
  const p = loader.loadAsync(new URL(`../../assets/models/animals/${file}`, import.meta.url).href).then((g) => {
    let mesh = null;
    g.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    mesh.updateWorldMatrix(true, false);
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if (head > 0) geo.rotateY(Math.PI); // head to -Z
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    geo.computeBoundingSphere();
    const src = mesh.material;
    // the coat photograph, darkened/warmed by tint (the bison's scan is pale and
    // cool); drawn double-sided: the reduction leaves pinholes
    const material = { map: src.map, color: new THREE.Color(tint) };
    return { geo, material };
  }).catch(() => null);
  ready.set(kind, p);
  return p;
}

/**
 * Instanced animals of one `kind` at `spots`: an InstancedMesh returned at
 * once, its geometry and material filled in place when the model loads (so
 * a clone made meanwhile, e.g. by mergeByMaterial, fills too). Stays empty
 * if the model cannot load.
 */
export function animalsAt(kind, spots) {
  const geo = new THREE.BufferGeometry();
  const material = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  const inst = new THREE.InstancedMesh(geo, material, Math.max(1, spots.length));
  inst.count = spots.length;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  spots.forEach(([x, y, z, r = 0, k = 1], i) => inst.setMatrixAt(i, m4.compose(v.set(x, y, z), q.setFromEuler(e.set(0, r, 0)), s.set(k, k, k))));
  inst.castShadow = true;
  inst.receiveShadow = true;
  inst.frustumCulled = false; // its bounds are unknown until the model arrives; a herd is cheap
  if (spots.length) {
    load(kind).then((m) => {
      if (!m) return;
      geo.copy(m.geo);
      material.map = m.material.map;
      material.color.copy(m.material.color);
      material.needsUpdate = true;
    });
  }
  return inst;
}
