// Boats in the marinas: real models (Sketchfab, CC BY; credited in
// docs/SOURCES.md), reduced in Blender to one vertex-coloured mesh each:
//   BAYCRUISER (d2u), an 11 m cabin cruiser · «Progress» runabout (isiosiusin)
// Each is recentred with its length along Z and its waterline at y = 0, then
// drawn instanced; place() sets one boat's matrix every frame (they bob).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const FILES = [['baycruiser_lo'], ['runabout_lo']]; // ~1-1.5k triangles each: seen from the course
let ready = null;
function load() {
  if (ready) return ready;
  const l = new GLTFLoader();
  l.setDRACOLoader(new DRACOLoader().setDecoderPath(new URL('../../vendor/three/addons/libs/draco/gltf/', import.meta.url).href));
  ready = Promise.all(FILES.map(([f]) => l.loadAsync(new URL(`../../assets/models/boats/${f}.glb`, import.meta.url).href).then((g) => {
    let geo = null;
    g.scene.traverse((o) => { if (o.isMesh && !geo) { o.updateWorldMatrix(true, false); geo = o.geometry.clone().applyMatrix4(o.matrixWorld); } });
    geo.computeBoundingBox();
    const b = geo.boundingBox, sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
    if (sx > sz) geo.rotateY(Math.PI / 2); // length along Z
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3());
    geo.translate(-c.x, 0, -c.z);
    // sit the waterline a little above the keel
    const lo = geo.boundingBox.min.y, hi = geo.boundingBox.max.y;
    geo.translate(0, -(lo + (hi - lo) * 0.18), 0);
    geo.computeBoundingBox();
    return { geo, len: geo.boundingBox.max.z - geo.boundingBox.min.z };
  }).catch(() => null)));
  return ready;
}
if (typeof window !== 'undefined') load();

/**
 * Instanced boats for `n` slips: resolves to {group, place(i, x, y, z, euler, L)}
 * where L is the boat's wanted length (its model is scaled to it), or null.
 */
export async function boatFleet(n, rnd = Math.random) {
  const models = (await load()).filter(Boolean);
  if (!models.length || !n) return null;
  const pick = Array.from({ length: n }, () => (rnd() < 0.62 ? 0 : models.length - 1));
  const counts = models.map((_, k) => pick.filter((p) => p === k).length);
  const index = []; const used = models.map(() => 0);
  for (const p of pick) index.push(used[p]++);
  const hullColours = [0xffffff, 0xffffff, 0xf4f0e6, 0xeef2f6, 0x1f2c44, 0xffffff];
  const mats = models.map(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.1 }));
  const insts = models.map((m, k) => {
    const inst = new THREE.InstancedMesh(m.geo, mats[k], Math.max(1, counts[k]));
    inst.count = counts[k];
    inst.castShadow = false; inst.receiveShadow = true;
    const c = new THREE.Color();
    for (let i = 0; i < counts[k]; i++) inst.setColorAt(i, c.set(hullColours[Math.floor(rnd() * hullColours.length)]));
    return inst;
  });
  const group = new THREE.Group();
  insts.forEach((i) => { if (i.count) group.add(i); });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  return {
    group,
    place(i, x, y, z, euler, L) {
      const k = pick[i], inst = insts[k], k2 = L / models[k].len;
      inst.setMatrixAt(index[i], m4.compose(v.set(x, y, z), q.setFromEuler(euler), s.set(k2, k2, k2)));
      inst.instanceMatrix.needsUpdate = true;
    },
    done() { for (const i of insts) i.computeBoundingSphere(); },
  };
}
