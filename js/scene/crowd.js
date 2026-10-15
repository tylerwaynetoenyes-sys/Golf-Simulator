// Crowds of real scanned people (Renderpeople / deep3dstudio scans, the
// ~1.5k-triangle set in assets/models/people_lo.glb; see models.js), drawn
// instanced: every figure of the set is one InstancedMesh per material, so a
// lawn of spectators costs a handful of draw calls. Spots are [x, y, z, yaw]
// with the figure facing +Z at yaw 0.
import * as THREE from 'three';
import { model } from './models.js';

/** A group of instanced scanned people at `spots`, or null if the scans aren't loaded. */
export function crowdAt(spots, rnd = Math.random) {
  const P = model('peopleLo') || model('people');
  if (!P || !P.children.length || !spots.length) return null;
  P.updateMatrixWorld(true);
  const figs = P.children.map((fig) => {
    // the scan keeps its own turn and scale (glTF Z-up); only its place in the set goes
    const own = new THREE.Matrix4().compose(new THREE.Vector3(), fig.quaternion, fig.scale);
    const inv = fig.matrixWorld.clone().invert();
    const parts = [];
    fig.traverse((o) => { if (o.isMesh) parts.push({ geo: o.geometry, mat: o.material, rel: own.clone().multiply(inv).multiply(o.matrixWorld) }); });
    return parts;
  }).filter((p) => p.length);
  const per = figs.map(() => []);
  for (const s of spots) per[Math.floor(rnd() * figs.length)].push(s);
  const g = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  figs.forEach((parts, k) => {
    const list = per[k];
    if (!list.length) return;
    for (const { geo, mat, rel } of parts) {
      const inst = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach(([x, y, z, r], i) => {
        const s = 0.94 + rnd() * 0.1;
        m4.compose(v.set(x, y, z), q.setFromEuler(e.set(0, r ?? rnd() * Math.PI * 2, 0)), sc.set(s, s, s)).multiply(rel);
        inst.setMatrixAt(i, m4);
      });
      inst.castShadow = false;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      g.add(inst);
    }
  });
  return g;
}
