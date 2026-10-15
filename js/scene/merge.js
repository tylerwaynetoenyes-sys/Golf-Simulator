// One draw call per material instead of one per part, for things that only
// ever move as a whole: a Sketchfab car is ~30 meshes (doors, bumpers,
// dashboard...), a wagon train hundreds (every spoke). Drawn twice when they
// cast shadows, those parts added up to most of a frame's draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Replace `obj`'s descendants with one mesh per material, in `obj`'s own
 * space (obj keeps its transform, name and userData); lines become one set
 * of segments per material. Skinned, morphing, instanced and multi-material
 * meshes and points are left as they are, and so is
 * any object that has fewer than `min` meshes. Returns obj.
 */
export function mergeByMaterial(obj, min = 4) {
  // levels of detail must stay apart
  let lod = false;
  obj.traverse((o) => { if (o.isLOD) lod = true; });
  if (lod) return obj;
  obj.updateMatrixWorld(true);
  const groups = new Map();
  const lines = new Map();
  const keep = [];
  let meshes = 0;
  obj.traverse((o) => {
    if (o === obj) return;
    if (o.isLine && !Array.isArray(o.material)) {
      // wires: every line (strip or segments) becomes segments, merged per material
      if (!lines.has(o.material)) lines.set(o.material, []);
      lines.get(o.material).push(o);
      return;
    }
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || o.morphTargetInfluences) {
      if (o.isMesh || o.isPoints || o.isLine || o.isSprite) keep.push(o);
      return;
    }
    meshes++;
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material).push(o);
  });
  if (meshes < min) return obj;
  const inv = obj.matrixWorld.clone().invert();
  const rel = new THREE.Matrix4();
  // what stays unmerged keeps its place in obj's space
  const kept = keep.map((o) => {
    rel.multiplyMatrices(inv, o.matrixWorld);
    const c = o.clone(false);
    rel.decompose(c.position, c.quaternion, c.scale);
    return c;
  });
  const out = [];
  for (const [mat, list] of groups) {
    const indexed = list.every((o) => o.geometry.index);
    const names = list.map((o) => Object.keys(o.geometry.attributes).sort().join());
    const geos = list.map((o) => {
      let g = o.geometry.clone().applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld));
      if (!indexed && g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.morphAttributes)) delete g.morphAttributes[k];
      return g;
    });
    const merged = names.every((n) => n === names[0]) ? mergeGeometries(geos) : null;
    const parts = merged ? [[merged, list]] : geos.map((g, i) => [g, [list[i]]]);
    for (const [geo, src] of parts) {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = src.some((o) => o.castShadow);
      m.receiveShadow = src.some((o) => o.receiveShadow);
      out.push(m);
    }
  }
  for (const [mat, list] of lines) {
    const pts = [];
    const p = new THREE.Vector3();
    for (const o of list) {
      rel.multiplyMatrices(inv, o.matrixWorld);
      const pos = o.geometry.attributes.position;
      const idx = o.geometry.index;
      const at = (i) => p.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(rel).toArray();
      const n = idx ? idx.count : pos.count;
      if (o.isLineSegments) for (let i = 0; i + 1 < n; i += 2) pts.push(...at(i), ...at(i + 1));
      else for (let i = 0; i + 1 < n; i++) pts.push(...at(i), ...at(i + 1));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    out.push(new THREE.LineSegments(geo, mat));
  }
  for (const c of [...obj.children]) obj.remove(c);
  for (const m of [...out, ...kept]) obj.add(m);
  return obj;
}
