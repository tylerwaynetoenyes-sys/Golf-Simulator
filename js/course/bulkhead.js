// Pete Dye's bulkheads: where water comes up to a green, the bank is a wall of
// creosoted railroad ties stood on end side by side, their tops a hand or two
// above the water (TPC Sawgrass all round the island green at 17, and along
// the greens at 16 and 18). Found by casting rays out from the green to where
// the ground turns to water, then setting ties along that edge.
import * as THREE from 'three';
import { pbr } from '../scene/pbr.js';

const TIE = 0.23; // a tie's face, metres

/** @returns {THREE.Group} empty when no green on this hole meets water */
export function bulkheads(T, rnd = Math.random) {
  const group = new THREE.Group();
  if (!T.green || !T.ponds?.length) return group;
  const surf = (x, z) => T.terrain(x, z).surface;
  const level = (x, z) => {
    // the level of the pond this stretch of edge is on (by its outline, else the nearest ellipse)
    let best = null, bd = Infinity;
    for (const p of T.ponds) {
      const d = p.poly ? Math.max(0, p.poly.sd(x, z)) : Math.hypot(x - p.x, z - p.z) - Math.max(p.rx || 0, p.rz || 0);
      if (d < bd) { bd = d; best = p; }
    }
    return best ? best.level : T.meshHeight(x, z) - 0.5;
  };
  // the water's edge round the green: one point per degree, where it is within reach
  const gx = T.green.x, gz = T.green.z, R = T.greenR, N = 360;
  const edge = new Array(N).fill(null);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    let prev = null;
    for (let r = R * 0.5; r < R + 22; r += 0.4) {
      const x = gx + dx * r, z = gz + dz * r;
      // the wall stands at the water line, its face out over the water, its top level with the bank behind it
      if (surf(x, z) === 'water') { if (prev) edge[i] = [prev[0] + dx * 0.7, prev[1] + dz * 0.7, gx + dx * (r - 2.6), gz + dz * (r - 2.6)]; break; }
      prev = [x, z];
    }
  }
  // walk the edge in runs and set ties along each run
  const ties = [];
  for (let i = 0; i < N; i++) {
    const p = edge[i], q = edge[(i + 1) % N];
    if (!p || !q) continue;
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (L > 6) continue; // a jump between two separate stretches of water
    const n = Math.max(1, Math.round(L / TIE));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const lerp = (j) => p[j] + (q[j] - p[j]) * t;
      ties.push([lerp(0), lerp(1), Math.atan2(q[0] - p[0], q[1] - p[1]), lerp(2), lerp(3)]);
    }
  }
  if (!ties.length) return group;
  const geo = new THREE.BoxGeometry(TIE * 0.96, 1, 0.18);
  const mat = pbr('brown_planks_08', { scale: 0.6, tint: 0x5a4636 });
  const mesh = new THREE.InstancedMesh(geo, mat, ties.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  ties.forEach(([x, z, yaw, bx, bz], i) => {
    const w = level(x, z);
    // up to the top of the bank (a couple of metres in), so the grass slope is hidden behind the ties
    const bank = Math.max(T.meshHeight(x, z), T.meshHeight(bx, bz));
    const top = Math.max(bank + 0.04, w + 0.38) + rnd() * 0.06; // the tops a little uneven
    const bot = w - 0.6;
    q.setFromAxisAngle(up, yaw + (rnd() - 0.5) * 0.04);
    s.set(1, top - bot, 1);
    v.set(x, (top + bot) / 2, z);
    mesh.setMatrixAt(i, m.compose(v, q, s));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
