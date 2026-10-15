// The houses and people of Mississippian Cahokia, for any hole that wants a
// neighbourhood of the city round it (the Confluence's Monks Mound hole).
// Houses as the excavations found them: rectangular pole-and-trench walls
// plastered with clay daub, steep roofs thatched with prairie grass, a stone
// ring hearth in the yard. People are the MakeHuman figures dressed from the
// archaeological record (assets/models/cahokia_people.glb; see
// js/course/lm/cahokiasite.js and docs/SOURCES.md), drawn instanced.
import * as THREE from 'three';
import { pbr } from '../../scene/pbr.js';
import { model } from '../../scene/models.js';
import { cull } from '../../scene/instanceCull.js';
import { place } from './riverfront.js';

/** Houses at lots [x, z, yaw] on ground gy; returns their yards [hx, hz, yaw] (in front of each door). */
export function houses(B, lots, gy, rnd) {
  const daub = pbr('white_plaster_02', { scale: 2.5, tint: 0xc9b08a });
  const log = pbr('bark_brown_02', { scale: 1.2, tint: 0x8c7058 });
  const thatch = pbr('thatch_roof_angled', { scale: 1.6, tint: 0xd2b27a });
  const door = pbr('metal_plate', { scale: 1, tint: 0x241c16, metal: 0.1 });
  const stone = pbr('brushed_concrete', { scale: 2.5, tint: 0xd8d2c4 });
  const yards = [];
  for (const [x, z, ry] of lots) {
    const w = 4.6 + rnd() * 2, d = 3.6 + rnd() * 1.4, h = 1.9, y = gy(x, z) - 0.15;
    B.add(daub, place(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), x, y, z, ry));
    for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) B.add(log, place(new THREE.CylinderGeometry(0.09, 0.11, h + 0.3, 7).translate(px, (h + 0.3) / 2, pz), x, y, z, ry));
    B.add(thatch, place(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(w + 1.1, 2.8 + rnd() * 0.6, d + 1.1), x, y + h - 0.15, z, ry));
    B.add(door, place(new THREE.BoxGeometry(0.8, 1.3, 0.12).translate(0, 0.65, d / 2 + 0.01), x, y, z, ry));
    const hx = x + Math.sin(ry) * (d / 2 + 2.4), hz = z + Math.cos(ry) * (d / 2 + 2.4);
    for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; B.add(stone, new THREE.DodecahedronGeometry(0.16 + rnd() * 0.06, 1).translate(hx + Math.cos(a) * 0.55, gy(hx, hz) + 0.05, hz + Math.sin(a) * 0.55)); }
    yards.push([hx, hz, ry]);
  }
  return yards;
}

/** The figures: placed = {kind: [[x, y, z, yaw, scale], ...]}; adds instanced meshes to group. */
export function figures(group, placed) {
  const set = model('cahokiaPeople');
  if (!set) return;
  const proto = {};
  for (const c of set.children) proto[c.name] = c;
  set.traverse((o) => {
    if (!o.isMesh) return;
    for (const mm of Array.isArray(o.material) ? o.material : [o.material]) {
      const cut = mm.transparent || mm.alphaTest > 0;
      mm.transparent = false; mm.depthWrite = true;
      if (cut) { mm.alphaTest = 0.5; mm.side = THREE.DoubleSide; }
    }
  });
  set.updateMatrixWorld(true);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const [kind, list] of Object.entries(placed)) {
    const root = proto[kind];
    if (!root || !list.length) continue;
    const inv = root.matrixWorld.clone().invert();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const rel = inv.clone().multiply(o.matrixWorld);
      const inst = new THREE.InstancedMesh(o.geometry, o.material, list.length);
      list.forEach(([x, y, z, yaw, k], i) => inst.setMatrixAt(i, m4.compose(v.set(x, y, z), q.setFromAxisAngle(up, yaw), sc.set(k, k, k)).multiply(rel)));
      inst.castShadow = false;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      cull(inst, 2.4);
      group.add(inst);
    });
  }
}

export const KINDS = ['woman_basket', 'man_chunkey', 'woman_jar', 'man_thatch', 'elder_potter', 'girl', 'elder_man'];
