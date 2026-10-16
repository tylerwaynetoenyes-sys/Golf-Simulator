// Gateway Arch National Park, for the par-3 course on its grounds: the Arch
// at true scale on its mapped axis, the Old Courthouse at the head of the
// grounds, the grounds' ponds and walks, all at their OpenStreetMap places on
// the course's own ground (fit), in map axes (+x east, +z south) from the
// Arch's centre, 38.6247°N 90.1848°W (assets/landmarks/gatewayarch).
//   the Arch (Saarinen, 1965): 630 ft high and 630 ft between the outer
//     faces of its legs, stainless steel (scene/skyline.js)
//   the Old Courthouse (1839-62): a Greek-revival cross with four porticoes
//     and a cast-iron dome on a drum, the tallest building in the city until
//     1894; the Dred Scott case was first tried here
// Surfaces are photographed PBR sets (js/scene/pbr.js).
import * as THREE from 'three';
import { archGeometry, archMaterial } from '../../scene/skyline.js';
import { pbr } from '../../scene/pbr.js';
import { place, bx, cy, Batch, pavingMeshes } from './riverfront.js';

const BASE = new URL('../../../assets/landmarks/gatewayarch/', import.meta.url).href;
let DATA = null;
const ready = fetch(`${BASE}ground.json`).then((r) => (r.ok ? r.json() : null)).then((j) => (DATA = j)).catch(() => null);

/** A fluted column: base, shaft, simple capital. */
function column(r, h) {
  const g = new THREE.CylinderGeometry(r * 0.88, r, h - r * 1.6, 20).translate(0, r * 0.6 + (h - r * 1.6) / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 - 0.035 * (0.5 + 0.5 * Math.cos(a * 20)); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  g.computeVertexNormals();
  return g;
}

// the Old Courthouse, its east portico toward the Arch (+x)
export function courthouse(m) {
  const B = new Batch();
  const H = 17;
  // the cross: two wings each way from the rotunda
  B.add(m.lime, bx(64, H, 26, 0, 0, 0), bx(26, H, 64, 0, 0, 0));
  B.add(m.trim, bx(65, 1.4, 27, 0, H, 0), bx(27, 1.4, 65, 0, H, 0));
  // low-pitched roofs over the wings
  const roof = (len, ry) => {
    const s = new THREE.Shape(); s.moveTo(-13.5, 0); s.lineTo(0, 3.5); s.lineTo(13.5, 0); s.closePath();
    return place(new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }).translate(0, 0, -len / 2), 0, H + 1.4, 0, ry);
  };
  B.add(m.metal, roof(65, 0), roof(65, Math.PI / 2));
  // four porticoes of six columns under pediments
  const col = column(0.85, 12);
  for (let k = 0; k < 4; k++) {
    const ry = (k * Math.PI) / 2, cs = Math.cos(ry), sn = Math.sin(ry);
    for (let i = 0; i < 6; i++) {
      const a = -9 + i * 3.6, d = 32 + 4;
      B.add(m.lime, place(col.clone(), cs * d - sn * a, 2.6, sn * d + cs * a));
    }
    B.add(m.lime, place(new THREE.BoxGeometry(8, 2.6, 22).translate(0, 1.3, 0), cs * 36, 0, sn * 36, -ry));
    B.add(m.trim, place(new THREE.BoxGeometry(8.5, 2.2, 22).translate(0, 1.1, 0), cs * 36, 14.6, sn * 36, -ry));
    const ped = new THREE.Shape(); ped.moveTo(-11, 0); ped.lineTo(0, 3.6); ped.lineTo(11, 0); ped.closePath();
    B.add(m.trim, place(new THREE.ExtrudeGeometry(ped, { depth: 8.5, bevelEnabled: false }).translate(0, 0, -4.25).rotateY(Math.PI / 2), cs * 36, 16.8, sn * 36, -ry));
  }
  // the drum, the cast-iron dome, the lantern
  B.add(m.lime, cy(14, 14, 10, 0, H + 1.4, 0, 40));
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; B.add(m.lime, place(column(0.6, 8.5), Math.cos(a) * 14.6, H + 2.4, Math.sin(a) * 14.6)); }
  B.add(m.trim, cy(15.2, 15.2, 1.2, 0, H + 11.2, 0, 40));
  B.add(m.dome, place(new THREE.SphereGeometry(13.6, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.25, 1), 0, H + 12.4, 0));
  B.add(m.lime, cy(3, 3.2, 5, 0, H + 29, 0, 20));
  B.add(m.dome, place(new THREE.SphereGeometry(3.2, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, H + 34, 0));
  return B;
}

export default function build() {
  const group = new THREE.Group();
  const glow = [];
  const archMat = archMaterial();
  const res = {
    group, glow, arch: archMat, trees: [],
    fit(holder, T, opts = {}) {
      if (!opts.course) return;
      holder.updateMatrix();
      const L = holder.matrix.clone(), w = new THREE.Vector3();
      const toW = (x, z) => w.set(x, 0, z).applyMatrix4(L);
      const gy = (x, z) => { toW(x, z); return (T.drawnHeight(w.x, w.z) - holder.position.y) / holder.scale.y; };
      const inPlay = (x, z) => { toW(x, z); const pr = T.project(w.x, w.z); return Math.abs(pr.d) < T.oobLateral + 6 && pr.s > -40 && pr.s < T.length + 60; };
      const go = (D) => lay(D, gy, inPlay);
      if (DATA) go(DATA); else ready.then((d) => d && go(d));
    },
  };
  function lay(D, gy, inPlay) {
    const m = {
      lime: pbr('white_sandstone_bricks', { scale: 2.4, glow: 0xffe2b8, night: 0.4 }),
      trim: pbr('white_plaster_02', { scale: 2.5, tint: 0xf2ece0 }),
      metal: pbr('metal_plate', { scale: 2, tint: 0x6f7a74, metal: 0.3 }),
      dome: pbr('metal_plate', { scale: 2, tint: 0x5a6a62, metal: 0.35 }),
    };
    glow.push(m.lime);
    // the Arch: its legs on the mapped axis (south leg to north leg), centred on the monument
    const ax = -32, az = 64, bxx = 2, bz = -44, cx = -15, cz = 11;
    const yaw = Math.atan2(-(bz - az), bxx - ax); // the arch geometry spans local x
    const arch = new THREE.Mesh(archGeometry(1.0).geometry, archMat);
    arch.position.set(cx, gy(cx, cz) - 0.3, cz);
    arch.rotation.y = yaw;
    arch.castShadow = true;
    group.add(arch);
    // the Old Courthouse, at the head of the grounds
    const ct = new THREE.Group();
    courthouse(m).build(ct);
    ct.position.set(-390, gy(-390, -110), -110);
    ct.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    group.add(ct);
    // the walks and the streets round the grounds
    for (const mesh of pavingMeshes(D, gy, inPlay)) group.add(mesh);
  }
  return res;
}
