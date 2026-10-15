// Per-instance frustum culling for instanced crowds, cars and boats. Three.js
// culls an InstancedMesh as a whole (one bounding sphere round every
// instance), so a lot or a marina spread along the river draws every car and
// boat in it as soon as one of them is in view. Here each instance is tested
// against the camera every time the view changes, and the ones in view are
// packed to the front of the instance buffer: the same picture, only the
// figures on screen cost triangles. Nothing here casts shadows (cull() is for
// meshes with castShadow off), so the shadow pass never sees a culled set.
import * as THREE from 'three';

const sets = new Set();
const frustum = new THREE.Frustum();
const pv = new THREE.Matrix4();
const sphere = new THREE.Sphere();
let viewKey = '';

/**
 * Cull `inst` per instance from now on. Its matrices (and colours) as set now
 * become the source; later moves go through the returned record's set(i, m4).
 * `radius` is a bounding radius per instance in metres, or with `scaled` in
 * the geometry's own units (times each instance's scale: boats sized per slip).
 */
export function cull(inst, radius, { scaled = false } = {}) {
  const n = inst.count;
  if (!inst.boundingSphere) inst.computeBoundingSphere(); // three's own whole-set test, once, over all of them
  const rec = {
    inst, n, radius, scaled,
    src: inst.instanceMatrix.array.slice(0, n * 16),
    col: inst.instanceColor ? inst.instanceColor.array.slice(0, n * 3) : null,
    key: '', dirty: true, seen: false,
    set(i, m4) { m4.toArray(this.src, i * 16); this.dirty = true; },
  };
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // kept out of JSON: three.js copies userData through JSON when a parent is cloned
  Object.defineProperty(inst.userData, 'cull', { value: rec, enumerable: false, writable: true, configurable: true });
  sets.add(rec);
  return rec;
}

function inScene(o) {
  while (o.parent) o = o.parent;
  return o.isScene;
}

/** Re-pack every culled set for the camera (call once a frame, before rendering). */
export function updateInstanceCulling(camera) {
  if (!sets.size || !camera) return;
  camera.updateMatrixWorld();
  pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(pv);
  viewKey = pv.elements.map((v) => v.toFixed(3)).join(',');
  for (const rec of sets) {
    if (!inScene(rec.inst)) { if (rec.seen) sets.delete(rec); continue; } // its hole has been replaced
    rec.seen = true;
    // re-pack when the view, the instances or their group (laid out after build) move
    const w = rec.inst.matrixWorld.elements, key = `${viewKey}|${w[0]},${w[2]},${w[12]},${w[13]},${w[14]}`;
    if (rec.key === key && !rec.dirty) continue;
    rec.key = key; rec.dirty = false;
    pack(rec);
  }
}

function pack(rec) {
  const { inst, n, src, col, radius, scaled } = rec;
  const dst = inst.instanceMatrix.array, cdst = col && inst.instanceColor.array;
  const w = inst.matrixWorld.elements;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 16;
    // instance origin in world space (the figure's feet, the car's or boat's centre)
    sphere.center.set(src[o + 12], src[o + 13], src[o + 14]).applyMatrix4(inst.matrixWorld);
    const s = scaled ? Math.hypot(src[o], src[o + 1], src[o + 2]) : 1;
    sphere.radius = radius * s * Math.hypot(w[0], w[1], w[2]);
    if (!frustum.intersectsSphere(sphere)) continue;
    dst.set(src.subarray(o, o + 16), k * 16);
    if (cdst) cdst.set(col.subarray(i * 3, i * 3 + 3), k * 3);
    k++;
  }
  inst.count = k;
  inst.instanceMatrix.needsUpdate = true;
  if (cdst) inst.instanceColor.needsUpdate = true;
}

/** How many culled instances are drawn / held (for tools/perf.mjs). */
export function instanceCullStats() {
  let drawn = 0, total = 0;
  for (const r of sets) if (inScene(r.inst)) { drawn += r.inst.count; total += r.n; }
  return { drawn, total };
}
