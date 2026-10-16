// Confluence Point, Hartford, Illinois: the Lewis & Clark sites at the
// meeting of the Missouri and the Mississippi, laid on the course's own ground
// (fit) at their OpenStreetMap places, in map axes (+x east, +z south) from
// 38.810°N 90.135°W (assets/landmarks/confluence, tools/bake-alton.mjs).
//   Lewis & Clark Confluence Tower (2010): two shafts for Lewis and Clark,
//     one an open steel stair, the other the glazed elevator, joined by
//     lookout platforms at 50, 100 and 150 ft; 180 ft to the top
//   Camp River Dubois: the replica of the expedition's winter camp of
//     1803-04, a stockade of upright logs with corner blockhouses and huts
//   the Lewis & Clark Interpretive Center, on its footprint
//   the overlook at the confluence itself (Confluence Point State Park)
//   the refinery's storage tanks along the levee, and the roads
// Surfaces are photographed PBR sets (js/scene/pbr.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lit } from './kit.js';
import { pbr, painted } from '../../scene/pbr.js';
import { place, bx, cy, span, Batch, pavingMeshes } from './riverfront.js';

const BASE = new URL('../../../assets/landmarks/confluence/', import.meta.url).href;
let DATA = null;
const ready = fetch(`${BASE}ground.json`).then((r) => (r.ok ? r.json() : null)).then((j) => (DATA = j)).catch(() => null);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FT = 0.3048;

export function materials() {
  return {
    conc: pbr('concrete_wall_008', { scale: 3.5, tint: 0xeeeae2 }),
    steel: pbr('metal_plate', { scale: 1.5, tint: 0xdfe3e6, metal: 0.35 }),
    dark: pbr('metal_plate', { scale: 1.5, tint: 0x4a5058, metal: 0.4 }),
    glass: painted(0x9fb8c6, { roughness: 0.06, metalness: 0.6, transparent: true, opacity: 0.55 }),
    bark: pbr('bark_brown_02', { scale: 1.4, tint: 0x8c7660 }),
    planks: pbr('brown_planks_08', { scale: 2 }),
    granite: pbr('granite_wall', { scale: 1.5, tint: 0xc8c4bc }),
    paving: pbr('brushed_concrete', { scale: 3 }),
    tank: pbr('metal_plate', { scale: 3, tint: 0xf2f2ee, metal: 0.25 }),
  };
}

// ── the Confluence Tower: two shafts, three lookouts, the canopy on top ──
export function confluenceTower(m, glow) {
  const B = new Batch();
  const H = 180 * FT, gap = 9, w = 5.2;
  B.add(m.paving, place(new THREE.CylinderGeometry(26, 26, 0.3, 48).translate(0, 0.15, 0), 0, 0, 0));
  // the elevator shaft (Clark): a clad concrete core with a glazed face
  B.add(m.conc, bx(w, H - 2, w, 0, 0, -gap / 2 - w / 2));
  B.add(m.glass, bx(w * 0.6, H - 6, 0.3, 0, 3, -gap / 2 + 0.05));
  // the stair shaft (Lewis): an open steel frame round flights of stairs
  for (const [ax, az] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.add(m.steel, bx(0.5, H - 2, 0.5, ax * (w / 2 - 0.25), 0, gap / 2 + w / 2 + az * (w / 2 - 0.25)));
  const flights = Math.floor((H - 4) / 3.2);
  for (let k = 0; k < flights; k++) {
    const y = k * 3.2, s = k % 2 ? 1 : -1, z0 = gap / 2 + 0.6, z1 = gap / 2 + w - 0.6;
    B.add(m.dark, span(V(s * 1.1, y, z0), V(s * 1.1, y + 3.2, z1), 1.3, 0.25));
    B.add(m.steel, bx(w, 0.12, 0.12, 0, y + 3.2, gap / 2 + 0.25), bx(w, 0.12, 0.12, 0, y + 3.2, gap / 2 + w - 0.25));
    for (const sx of [-1, 1]) B.add(m.steel, span(V(sx * (w / 2 - 0.25), y, gap / 2 + 0.25), V(sx * (w / 2 - 0.25), y + 3.2, gap / 2 + w - 0.25), 0.12, 0.12));
  }
  // the lookouts at 50, 100 and 150 ft: decks bridging the shafts and wrapping them
  for (const ft of [50, 100, 150]) {
    const y = ft * FT;
    B.add(m.conc, bx(16, 0.6, gap + w * 2 + 6, 0, y - 0.6, 0));
    B.add(m.glass, bx(16.2, 1.1, 0.12, 0, y, -(gap + w * 2 + 6) / 2), bx(16.2, 1.1, 0.12, 0, y, (gap + w * 2 + 6) / 2), bx(0.12, 1.1, gap + w * 2 + 6, -8.1, y, 0), bx(0.12, 1.1, gap + w * 2 + 6, 8.1, y, 0));
    B.add(m.steel, bx(16.4, 0.1, 0.1, 0, y + 1.1, -(gap + w * 2 + 6) / 2), bx(16.4, 0.1, 0.1, 0, y + 1.1, (gap + w * 2 + 6) / 2));
  }
  // the canopy over the top deck, and the masts
  B.add(m.steel, bx(18, 0.5, gap + w * 2 + 8, 0, H - 1.5, 0));
  for (const [x, z] of [[-7.5, -11], [7.5, -11], [-7.5, 11], [7.5, 11]]) B.add(m.steel, cy(0.15, 0.15, 3.5, x, 150 * FT, z, 8));
  const beacon = lit(0xffffff, 0xff3a2a, { night: 2 });
  glow.push(beacon);
  B.add(beacon, place(new THREE.SphereGeometry(0.5, 12, 8), 0, H - 0.6, -gap / 2 - w / 2));
  return B;
}

// ── Camp River Dubois: a stockade of upright logs, blockhouses at the corners, huts inside ──
function campDubois(m) {
  const B = new Batch();
  const W = 40, D = 30, r = 0.17, h = 3.8;
  const log = new THREE.CylinderGeometry(r, r * 1.08, h, 7).translate(0, h / 2, 0);
  const sharp = new THREE.ConeGeometry(r, 0.45, 7).translate(0, h + 0.22, 0);
  const pal = [];
  const wall = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / (r * 2.05));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, k = 0.92 + ((i * 37) % 9) / 60;
      pal.push(log.clone().scale(1, k, 1).translate(x, 0, z), sharp.clone().translate(0, h * (k - 1), 0).translate(x, 0, z));
    }
  };
  wall(-W / 2, -D / 2, W / 2, -D / 2); wall(W / 2, -D / 2, W / 2, D / 2); wall(W / 2, D / 2, 3, D / 2); wall(-3, D / 2, -W / 2, D / 2); wall(-W / 2, D / 2, -W / 2, -D / 2);
  B.add(m.bark, mergeGeometries(pal));
  // a log house: walls of stacked horizontal logs, a plank roof
  const cabin = (cx, cz, w, d, wh, ry = 0) => {
    const parts = [];
    for (let y = 0.15; y < wh; y += 0.34) {
      parts.push(new THREE.CylinderGeometry(0.17, 0.17, w + 0.5, 7).rotateZ(Math.PI / 2).translate(0, y, -d / 2), new THREE.CylinderGeometry(0.17, 0.17, w + 0.5, 7).rotateZ(Math.PI / 2).translate(0, y, d / 2));
      parts.push(new THREE.CylinderGeometry(0.17, 0.17, d + 0.5, 7).rotateX(Math.PI / 2).translate(-w / 2, y + 0.17, 0), new THREE.CylinderGeometry(0.17, 0.17, d + 0.5, 7).rotateX(Math.PI / 2).translate(w / 2, y + 0.17, 0));
    }
    B.add(m.bark, place(mergeGeometries(parts), cx, 0, cz, ry));
    const s = new THREE.Shape(); s.moveTo(-w / 2 - 0.6, 0); s.lineTo(0, w * 0.42); s.lineTo(w / 2 + 0.6, 0); s.closePath();
    B.add(m.planks, place(new THREE.ExtrudeGeometry(s, { depth: d + 1, bevelEnabled: false }).translate(0, wh, -(d + 1) / 2), cx, 0, cz, ry));
  };
  // blockhouses: two storeys, the upper one overhanging
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, D / 2]]) {
    cabin(x, z, 6, 6, 3.2);
    cabin(x, z, 7.4, 7.4, 2.8);
  }
  // the barracks huts round the parade ground
  for (const [x, z] of [[-12, -9], [-4, -9], [4, -9], [12, -9]]) cabin(x, z, 7, 5.5, 2.6);
  cabin(-12, 8, 8, 6, 2.6); cabin(12, 8, 8, 6, 2.6);
  // the flagstaff
  B.add(m.bark, cy(0.12, 0.16, 14, 0, 0, 2, 7));
  return B;
}

// the overlook at the confluence point: a stone plaza, a granite marker, rails
function overlook(m) {
  const B = new Batch();
  B.add(m.granite, place(new THREE.CylinderGeometry(9, 9.3, 0.6, 40).translate(0, 0.3, 0), 0, -0.2, 0));
  B.add(m.granite, bx(2.4, 1.6, 0.8, 0, 0.4, -2));
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 18) B.add(m.dark, cy(0.05, 0.05, 1.1, Math.cos(a) * 8.6, 0.4, Math.sin(a) * 8.6, 6));
  B.add(m.dark, place(new THREE.TorusGeometry(8.6, 0.05, 6, 64).rotateX(Math.PI / 2), 0, 1.5, 0));
  return B;
}

export default function build() {
  const group = new THREE.Group();
  const glow = [];
  const res = {
    group, glow, trees: [],
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
    const m = materials();
    const put = (B, x, z, ry = 0) => {
      const g = new THREE.Group();
      B.build(g);
      g.position.set(x, gy(x, z), z);
      g.rotation.y = ry;
      g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      group.add(g);
    };
    put(confluenceTower(m, glow), 2979, -102);
    put(campDubois(m), 2777, 923, 0.15);
    put(overlook(m), 1343, -678);
    // the interpretive centre, the camp's cabin and the rest on their footprints;
    // the refinery's tanks as tanks
    const TB = new Batch();
    for (const b of D.buildings) {
      let p = b.p;
      if (p.length > 2 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p = p.slice(0, -1);
      if (p.length < 3 || b.n === 'Camp Dubois') continue;
      const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cz = p.reduce((s, q) => s + q[1], 0) / p.length;
      if (inPlay(cx, cz)) continue;
      const y = Math.min(...p.map(([x, z]) => gy(x, z))) - 0.3;
      if (b.k === 'storage_tank') {
        const r = Math.max(...p.map(([x, z]) => Math.hypot(x - cx, z - cz)));
        const h = b.h || Math.min(16, 6 + r * 0.45);
        TB.add(m.tank, place(new THREE.CylinderGeometry(r, r, h, 32).translate(0, h / 2, 0), cx, y, cz));
        TB.add(m.dark, place(new THREE.CylinderGeometry(r * 1.01, r * 1.01, 0.3, 32).translate(0, h, 0), cx, y, cz));
        continue;
      }
      const h = b.h || (b.n ? 9 : 6);
      const shape = new THREE.Shape(p.map(([x, z]) => new THREE.Vector2(x, -z)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y, 0);
      TB.add(b.n ? m.planks : m.steel, geo);
      if (b.n) TB.add(m.glass, new THREE.ExtrudeGeometry(shape, { depth: 2.2, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y + 1, 0).scale(1.005, 1, 1.005));
    }
    const tg = new THREE.Group(); TB.build(tg); tg.traverse((o) => { if (o.isMesh) o.castShadow = false; }); group.add(tg);
    for (const mesh of pavingMeshes(D, gy, inPlay, { paths: false })) group.add(mesh);
  }
  return res;
}
