// Alton Legends plaza: a small brick-paved plaza honouring two Alton natives.
// Left: Robert Wadlow (1918–1940, 8 ft 11.1 in — the tallest person on
// record), a life-size bronze standing upright in a suit beside a replica of
// his oversized armchair, as on College Avenue. Right: Miles Davis (born in
// Alton, 1926), after Preston Jackson's 2015 bronze — leaning back, trumpet
// raised toward the sky — on a granite plinth. Granite plinths with bronze
// plaques, a bench, two lamp posts, low plantings and an inlaid row of bronze
// musical notes and a wave line in the paving near Miles.
// Front faces +Z. Footprint x∈[-14,14], z∈[-10,10]; Wadlow ~3.0 m to the crown.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, lit, seeded, canvasTex, boulderGeometry } from './kit.js';
import { pbr } from '../../scene/pbr.js';

function batcher() {
  const lists = new Map();
  const tmp = new THREE.Matrix4();
  return {
    add(o, parent = null) {
      o.updateMatrix();
      let g = o.geometry.clone();
      g.applyMatrix4(parent ? tmp.copy(parent).multiply(o.matrix) : o.matrix);
      if (g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!lists.has(o.material)) lists.set(o.material, []);
      lists.get(o.material).push(g);
      return o;
    },
    build(group) {
      for (const [m, geos] of lists) {
        const mesh = new THREE.Mesh(mergeGeometries(geos), m);
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh);
      }
    },
  };
}
function M(geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
  return o;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
/** Capsule from a to b. sx/sz squash the cross-section (local, before orienting). */
function limb(a, b, r, m, sx = 1, sz = 1, twist = 0) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, L), 4, 10).scale(sx, 1, sz).rotateY(twist);
  const o = new THREE.Mesh(g, m);
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(UP, d.normalize());
  return o;
}
function ell(rx, ry, rz, m, p, rot = [0, 0, 0], seg = 14) {
  const o = new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.max(8, seg * 0.7 | 0)), m);
  o.scale.set(rx, ry, rz); o.position.copy(p); o.rotation.set(...rot);
  return o;
}

export default function build() {
  const group = new THREE.Group();
  const B = batcher();
  const rnd = seeded(1940);

  // photographed surfaces (pbr.js): cast bronze (steel's mottled finish under
  // a bronze tint reads as patina), grey granite, brick pavers, bark mulch
  const bronze = pbr('painted_steel', { scale: 0.35, tint: 0xd09868, metal: 0.55, rough: 0.5, bright: 1.2, glow: 0xffb06a, night: 0.22 });
  const bronzeDark = pbr('painted_steel', { scale: 0.35, tint: 0x907058, metal: 0.5, rough: 0.55, glow: 0xff9a50, night: 0.15 });
  const brass = pbr('painted_steel', { scale: 0.3, tint: 0xf0c060, metal: 0.95, rough: 0.35, bright: 1.6 });
  const brick = pbr('red_brick', { scale: 1.1, tint: 0xd8b0a0 });
  const granite = pbr('granite_wall', { scale: 4, tint: 0xc0cce8, bright: 1.3 }); // big scale: one stone's grain, not coursed blocks
  const graniteDark = pbr('granite_wall', { scale: 4, tint: 0x6a6a74, rough: 0.5 });
  const iron = pbr('painted_steel', { scale: 0.6, tint: 0x25282a, metal: 0.6 });
  const lampM = lit(0xfff3d8, 0xffd59a, { night: 2.0, roughness: 0.3 });
  const upM = lit(0xd8d4c8, 0xffe2b0, { night: 2.2, roughness: 0.3 });
  const wood = pbr('brown_planks_08', { scale: 0.8, tint: 0x9a7050 });
  const hedge = pbr('grass_ground', { scale: 0.45, tint: 0x5a8848, rough: 0.9 }); // clipped boxwood: fine leaf texture
  const mulch = pbr('bark_brown_02', { scale: 0.5, tint: 0x8a6a58 });
  const glow = [bronze, bronzeDark, lampM, upM];

  // ---------- paving ----------
  B.add(M(new THREE.BoxGeometry(28, 0.12, 20), granite, 0, 0.06, 0));
  B.add(M(new THREE.BoxGeometry(26.6, 0.04, 18.6), brick, 0, 0.14, 0));
  // granite bands framing the two statue bays
  for (const x of [-6, 6]) {
    B.add(M(new THREE.BoxGeometry(7.6, 0.05, 0.35), granite, x, 0.15, 3.1));
    B.add(M(new THREE.BoxGeometry(7.6, 0.05, 0.35), granite, x, 0.15, -4.9));
    for (const dx of [-3.8, 3.8]) B.add(M(new THREE.BoxGeometry(0.35, 0.05, 8.35), granite, x + dx, 0.15, -0.9));
  }
  B.add(M(new THREE.BoxGeometry(0.5, 0.05, 18.6), granite, 0, 0.15, 0));

  // ---------- Robert Wadlow ----------
  const WX = -5.4, WZ = -1.2;
  // (from Tyler's photographs) a broad grey granite plinth, its front face
  // cut with his name and dates; granite benches and sloped tablets nearby
  const inscr = new THREE.MeshStandardMaterial({
    roughness: 0.6, transparent: true, // the lettering only, cut into the granite face
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    map: canvasTex(512, 96, (c, w, h) => {
      c.fillStyle = '#d9c9a0'; c.textAlign = 'center';
      c.font = '600 34px Georgia, serif'; c.fillText('ROBERT PERSHING WADLOW', w / 2, 42);
      c.font = '500 24px Georgia, serif'; c.fillText('FEBRUARY 22, 1918 — JULY 15, 1940', w / 2, 78);
    }),
  });
  B.add(M(new THREE.BoxGeometry(2.7, 0.46, 2.3), granite, WX, 0.15 + 0.23, WZ));
  B.add(M(new THREE.PlaneGeometry(2.4, 0.42), inscr, WX, 0.38, WZ + 1.153));
  figureWadlow(new THREE.Matrix4().compose(V(WX, 0.61, WZ), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.12, 0)), V(1, 1, 1)));
  for (const [x, z, ry] of [[WX - 3.6, WZ - 2.6, 0.3], [WX + 2.6, WZ - 3.0, -0.2]]) {
    for (const dx of [-0.7, 0.7]) B.add(M(new THREE.BoxGeometry(0.3, 0.42, 0.42), granite, x + dx * Math.cos(ry), 0.36, z - dx * Math.sin(ry), 0, ry, 0));
    B.add(M(new THREE.BoxGeometry(1.9, 0.12, 0.5), granite, x, 0.62, z, 0, ry, 0));
  }
  for (const [x, ry] of [[WX - 4.6, 0.5], [WX + 4.0, -0.5]]) B.add(M(new THREE.BoxGeometry(1.4, 0.5, 0.9), granite, x, 0.35, WZ + 1.6, -0.35, ry, 0));
  // his armchair (replica, bronze)
  chair(new THREE.Matrix4().compose(V(WX - 2.4, 0.14, WZ + 0.1), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.25, 0)), V(1, 1, 1)));

  // ---------- Miles Davis ----------
  const MX = 6, MZ = -1.2, PH = 0.95;
  // (from Tyler's photographs) a round concrete plinth on a wider round
  // base, set in the brick and engraved-granite paving, a bronze foot plate,
  // and a rough limestone planter wall behind
  const concrete = pbr('concrete_wall_008', { scale: 1.5, tint: 0xd2dcf6, bright: 1.3 });
  B.add(M(new THREE.CylinderGeometry(1.25, 1.25, 0.12, 32), concrete, MX, 0.2, MZ));
  B.add(M(new THREE.CylinderGeometry(0.85, 0.88, PH - 0.2, 32), concrete, MX, 0.26 + (PH - 0.2) / 2, MZ));
  B.add(M(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 6), bronzeDark, MX, PH + 0.18, MZ));
  {
    // dry-laid blocks of rough-faced limestone
    const lime = pbr('rock_face_03', { scale: 0.7, tint: 0xf0e8d8, bright: 1.2 });
    for (let i = 0; i < 16; i++) {
      const a = -2.4 + (i / 15) * 1.6, r = 3.1;
      for (let row = 0; row < 2; row++) {
        const blk = M(new THREE.BoxGeometry(0.7 + rnd() * 0.25, 0.32, 0.45), lime, MX + Math.cos(a) * r, 0.3 + row * 0.33, MZ + Math.sin(a) * r, (rnd() - 0.5) * 0.06, -a, 0);
        B.add(blk);
      }
    }
  }
  plaque(MX, 0.45, MZ + 0.76, 0.5, 0.3);
  figureMiles(new THREE.Matrix4().compose(V(MX, PH + 0.16, MZ), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.25, 0)), V(1, 1, 1)));
  // inlaid notes and a wave line in the paving
  for (let i = 0; i < 7; i++) {
    const x = 3.2 + i * 0.95, z = 4.4 + Math.sin(i * 1.1) * 0.25;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 12), brass);
    head.scale.set(1.35, 1, 1); head.position.set(x, 0.165, z); head.rotation.y = 0.4; B.add(head);
    B.add(M(new THREE.BoxGeometry(0.03, 0.012, 0.42), brass, x + 0.13, 0.165, z - 0.2));
    if (i % 2 === 0) B.add(M(new THREE.BoxGeometry(0.16, 0.012, 0.035), brass, x + 0.2, 0.165, z - 0.38, 0, -0.5, 0));
  }
  {
    const pts = []; for (let i = 0; i <= 40; i++) { const u = i / 40; pts.push(V(2.4 + u * 7.4, 0.16, 5.4 + Math.sin(u * Math.PI * 4) * 0.22)); }
    const w = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.035, 4), brass);
    w.scale.y = 0.4; w.position.y = 0.1; B.add(w);
  }

  // ---------- bench, lamps, uplights, plantings ----------
  {
    const bx = 0, bz = 6.2;
    for (const dx of [-0.85, 0.85]) B.add(M(new THREE.BoxGeometry(0.3, 0.42, 0.5), granite, bx + dx, 0.35, bz));
    for (let k = 0; k < 4; k++) B.add(M(new THREE.BoxGeometry(2.1, 0.05, 0.11), wood, bx, 0.585, bz - 0.19 + k * 0.125));
  }
  for (const [x, z] of [[-11.5, 6.5], [11.5, 6.5]]) {
    B.add(M(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 10), iron, x, 0.4, z));
    B.add(M(new THREE.CylinderGeometry(0.055, 0.075, 3.4, 8), iron, x, 2.3, z));
    B.add(M(new THREE.CylinderGeometry(0.12, 0.07, 0.25, 8), iron, x, 4.05, z));
    B.add(M(new THREE.CylinderGeometry(0.2, 0.14, 0.55, 6), lampM, x, 4.45, z));
    B.add(M(new THREE.ConeGeometry(0.3, 0.3, 6), iron, x, 4.87, z));
    B.add(M(new THREE.SphereGeometry(0.05, 6, 4), iron, x, 5.05, z));
  }
  for (const [x, z] of [[WX - 1.3, WZ + 2.0], [WX + 1.3, WZ + 2.0], [MX - 1.1, MZ + 1.9], [MX + 1.1, MZ + 1.9]]) {
    B.add(M(new THREE.CylinderGeometry(0.12, 0.14, 0.1, 10), iron, x, 0.2, z));
    B.add(M(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 10), upM, x, 0.26, z));
  }
  // planting beds along the back and the outer edges
  const shrubs = [];
  for (const [x0, x1, z] of [[-13, -1, -8.3], [1, 13, -8.3]]) {
    B.add(M(new THREE.BoxGeometry(x1 - x0, 0.32, 2.4), granite, (x0 + x1) / 2, 0.16, z));
    B.add(M(new THREE.BoxGeometry(x1 - x0 - 0.3, 0.06, 2.1), mulch, (x0 + x1) / 2, 0.33, z));
    for (let x = x0 + 0.7; x < x1 - 0.5; x += 1.05) shrubs.push([x, 0.36, z + (rnd() - 0.5) * 0.4, 0.5 + rnd() * 0.12]);
  }
  for (const sx of [-1, 1]) {
    B.add(M(new THREE.BoxGeometry(1.8, 0.32, 9), granite, sx * 12.6, 0.16, 0.5));
    B.add(M(new THREE.BoxGeometry(1.5, 0.06, 8.7), mulch, sx * 12.6, 0.33, 0.5));
    for (let z = -3.4; z < 4.6; z += 1.0) shrubs.push([sx * 12.6, 0.36, z, 0.42 + rnd() * 0.1]);
  }
  B.build(group);
  const sh = new THREE.InstancedMesh(boulderGeometry(1, seeded(5), { detail: 3, flat: 1 }), hedge, shrubs.length);
  const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), mat(0xffffff, { roughness: 0.8 }), shrubs.length * 3);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V(1, 1, 1), p = V(0, 0, 0), c = new THREE.Color();
  shrubs.forEach(([x, y, z, r], i) => {
    m4.compose(p.set(x, y + r * 0.6, z), q.setFromEuler(new THREE.Euler(0, rnd() * 3, 0)), s.set(r, r * 0.8, r)); sh.setMatrixAt(i, m4);
    sh.setColorAt(i, c.setHSL(0.27, 0.15, 0.85 + rnd() * 0.15));
    for (let k = 0; k < 3; k++) {
      m4.compose(p.set(x + (rnd() - 0.5) * r * 1.6, y + 0.1, z + (rnd() - 0.5) * r * 1.6 + r * 0.6), q.identity(), s.set(0.09, 0.07, 0.09));
      fl.setMatrixAt(i * 3 + k, m4); fl.setColorAt(i * 3 + k, c.set([0xd8423a, 0xf2e6c8, 0x8a5ac0][(i + k) % 3]));
    }
  });
  group.add(sh, fl);

  return { group, glow };

  // ---------- figures ----------
  function plaque(x, y, z, w, h) {
    const o = M(new THREE.BoxGeometry(w, h, 0.025), bronzeDark, x, y, z, -0.15, 0, 0); B.add(o);
  }
  /** Robert Wadlow, 2.72 m, standing upright in a three-piece suit, glasses. */
  function figureWadlow(P) {
    const H = 2.72, b = bronze, d = bronzeDark;
    const y = (f) => f * H;
    // shoes (very long, as his were)
    for (const sx of [-1, 1]) {
      const sh = ell(0.075, 0.06, 0.23, d, V(sx * 0.12, 0.06, 0.07)); B.add(sh, P);
      B.add(M(new THREE.BoxGeometry(0.15, 0.04, 0.42), d, sx * 0.12, 0.02, 0.07), P);
    }
    const hipY = y(0.485), kneeY = y(0.275), ankY = y(0.045);
    for (const sx of [-1, 1]) {
      B.add(limb(V(sx * 0.11, hipY, 0), V(sx * 0.115, kneeY, 0.01), 0.085, b), P); // thigh (trouser)
      B.add(limb(V(sx * 0.115, kneeY, 0.01), V(sx * 0.12, ankY + 0.05, 0), 0.07, b), P); // shin
      B.add(M(new THREE.CylinderGeometry(0.085, 0.09, 0.05, 10), b, sx * 0.12, ankY + 0.07, 0.0), P); // trouser cuff
    }
    // jacket body: tapered lathe from hem to shoulders
    const prof = [[0.01, 0], [0.205, 0], [0.19, 0.18], [0.175, 0.36], [0.2, 0.62], [0.215, 0.82], [0.16, 0.92], [0.07, 0.95], [0.01, 0.95]]
      .map(([r, t]) => new THREE.Vector2(r, y(0.43) + t * (y(0.82) - y(0.43))));
    const jacket = new THREE.Mesh(new THREE.LatheGeometry(prof, 20).scale(1, 1, 0.62), b);
    B.add(jacket, P);
    // lapels / opening and buttons
    for (const sx of [-1, 1]) B.add(M(new THREE.BoxGeometry(0.06, 0.42, 0.02), d, sx * 0.05, y(0.71), 0.13, 0, 0, sx * 0.18), P);
    for (let k = 0; k < 3; k++) B.add(M(new THREE.SphereGeometry(0.013, 6, 4), d, 0, y(0.55) + k * 0.1, 0.122), P);
    // shirt collar + tie
    B.add(M(new THREE.CylinderGeometry(0.06, 0.07, 0.07, 10), b, 0, y(0.835), 0.0), P);
    B.add(M(new THREE.BoxGeometry(0.045, 0.3, 0.02), d, 0, y(0.73), 0.135, -0.08, 0, 0), P);
    // neck + head
    B.add(limb(V(0, y(0.82), 0), V(0, y(0.86), 0.005), 0.05, b), P);
    const hc = V(0, y(0.905), 0.01);
    B.add(ell(0.083, 0.11, 0.098, b, hc), P);
    B.add(ell(0.07, 0.045, 0.06, b, V(0, hc.y - 0.07, 0.035)), P); // jaw
    B.add(ell(0.04, 0.012, 0.02, d, V(0, hc.y - 0.05, 0.088), [0, 0, 0], 8), P); // the smile
    B.add(ell(0.088, 0.06, 0.1, d, V(0, hc.y + 0.05, -0.006)), P); // hair
    B.add(ell(0.017, 0.03, 0.022, b, V(0, hc.y - 0.01, 0.1), [0.2, 0, 0], 8), P); // nose
    for (const sx of [-1, 1]) {
      B.add(ell(0.014, 0.028, 0.02, b, V(sx * 0.083, hc.y, 0.0), [0, 0, 0], 8), P); // ears

    }
    // arms hanging naturally at his sides, slight bend
    const shY = y(0.805);
    for (const sx of [-1, 1]) {
      // his left hand (+x) rests forward on the cane
      const sh = V(sx * 0.2, shY, 0), el = V(sx * 0.235, y(0.62), sx > 0 ? 0.04 : -0.02), wr = sx > 0 ? V(0.26, y(0.47), 0.16) : V(sx * 0.225, y(0.465), 0.05);
      B.add(ell(0.085, 0.08, 0.08, b, sh), P); // shoulder pad
      B.add(limb(sh, el, 0.058, b), P);
      B.add(limb(el, wr, 0.05, b), P);
      B.add(M(new THREE.CylinderGeometry(0.052, 0.056, 0.05, 10), d, wr.x, wr.y + 0.01, wr.z, 0.2, 0, 0), P); // cuff
      const hand = ell(0.032, 0.085, 0.05, b, V(wr.x - sx * 0.003, wr.y - 0.085, wr.z + 0.012), [0.1, 0, -sx * 0.05], 10);
      B.add(hand, P);
    }
    // the cane: a slim shaft from his hand to the plinth, a crook under the palm
    B.add(limb(V(0.27, y(0.44), 0.18), V(0.32, 0.0, 0.34), 0.012, d), P);
    B.add(M(new THREE.TorusGeometry(0.035, 0.011, 6, 10, Math.PI), d, 0.27, y(0.445), 0.15, 0, Math.PI / 2, 0), P);
  }
  /** Miles Davis, after Preston Jackson: leaning back, trumpet raised skyward. */
  function figureMiles(P0) {
    const H = 1.8, b = bronze, d = bronzeDark;
    const y = (f) => f * H;
    // feet / legs: left leg forward, knees soft, weight back
    const hipY = y(0.49);
    const lean = new THREE.Matrix4().makeRotationX(-0.46); // leaning far back from the hips
    const pelvis = V(0, hipY, -0.06);
    const UB = new THREE.Matrix4().makeTranslation(pelvis.x, pelvis.y, pelvis.z).multiply(lean).multiply(new THREE.Matrix4().makeTranslation(-pelvis.x, -pelvis.y, -pelvis.z));
    const P = P0, PU = P0.clone().multiply(UB);
    const legs = [
      { sx: -1, hip: V(-0.09, hipY, -0.04), knee: V(-0.1, y(0.27), 0.12), ank: V(-0.11, y(0.05), 0.2) },
      { sx: 1, hip: V(0.09, hipY, -0.08), knee: V(0.11, y(0.27), -0.12), ank: V(0.12, y(0.05), -0.26) },
    ];
    for (const L of legs) {
      B.add(limb(L.hip, L.knee, 0.07, b), P);
      B.add(limb(L.knee, L.ank, 0.058, b), P);
      // the flared trousers of the time
      const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.115, 0.34, 12), b);
      flare.position.set(L.ank.x, L.ank.y + 0.12, L.ank.z);
      flare.quaternion.setFromUnitVectors(V(0, 1, 0), L.knee.clone().sub(L.ank).normalize());
      B.add(flare, P);
      B.add(ell(0.055, 0.045, 0.14, d, V(L.ank.x, 0.05, L.ank.z + 0.07)), P);
    }
    B.add(ell(0.17, 0.11, 0.12, b, V(0, hipY + 0.02, -0.06)), P); // hips
    // upper body in the leaning frame: loose shirt/jacket
    const prof = [[0.01, 0], [0.16, 0], [0.15, 0.12], [0.165, 0.3], [0.19, 0.42], [0.13, 0.5], [0.06, 0.52], [0.01, 0.52]]
      .map(([r, t]) => new THREE.Vector2(r, hipY - 0.05 + t * 0.9 * H * 0.5 / 0.52 * 0.6));
    B.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 18).scale(1, 1, 0.66).translate(0, 0, -0.06), b), PU);
    const neckBase = V(0, y(0.815), -0.06);
    B.add(limb(neckBase, V(0, y(0.86), -0.07), 0.045, b), PU);
    // head tilted further back, facing up along the horn
    const hc = V(0, y(0.905), -0.08);
    const HP = PU.clone().multiply(new THREE.Matrix4().makeTranslation(hc.x, hc.y, hc.z)).multiply(new THREE.Matrix4().makeRotationX(0.12));
    B.add(ell(0.075, 0.1, 0.09, b, V(0, 0, 0)), HP);
    B.add(ell(0.064, 0.042, 0.055, b, V(0, -0.065, 0.03)), HP);
    B.add(ell(0.08, 0.05, 0.088, d, V(0, 0.05, -0.012)), HP);
    B.add(ell(0.015, 0.026, 0.02, b, V(0, -0.005, 0.09), [0.2, 0, 0], 8), HP);
    for (const sx of [-1, 1]) B.add(ell(0.013, 0.025, 0.018, b, V(sx * 0.075, 0, 0), [0, 0, 0], 8), HP);
    // trumpet: mouthpiece at the lips, held out forward and a touch up
    const mouth = V(0, -0.04, 0.095);
    const TP = HP.clone().multiply(new THREE.Matrix4().makeTranslation(mouth.x, mouth.y, mouth.z)).multiply(new THREE.Matrix4().makeRotationX(0.18));
    B.add(M(new THREE.CylinderGeometry(0.008, 0.012, 0.06, 8).rotateX(Math.PI / 2), brass, 0, 0, 0.03), TP);
    B.add(M(new THREE.CylinderGeometry(0.009, 0.009, 0.3, 8).rotateX(Math.PI / 2), brass, 0, 0, 0.2), TP);
    B.add(M(new THREE.CylinderGeometry(0.009, 0.009, 0.3, 8).rotateX(Math.PI / 2), brass, 0, -0.045, 0.2), TP);
    for (let k = 0; k < 3; k++) B.add(M(new THREE.CylinderGeometry(0.012, 0.012, 0.11, 8), brass, 0, -0.03, 0.16 + k * 0.03), TP);
    const bell = [];
    for (let i = 0; i <= 10; i++) { const u = i / 10; bell.push(new THREE.Vector2(0.01 + 0.07 * Math.pow(u, 3), u * 0.2)); }
    B.add(M(new THREE.LatheGeometry(bell, 16).rotateX(Math.PI / 2), brass, 0, 0, 0.33), TP);
    // arms raised to hold the horn
    const shY = y(0.8);
    const lhand = V(0, -0.03, 0.17).applyMatrix4(TP), rhand = V(0.0, -0.01, 0.2).applyMatrix4(TP);
    const inv = PU.clone().invert();
    for (const [sx, hw] of [[-1, lhand], [1, rhand]]) {
      const hand = hw.clone().applyMatrix4(inv); // into the torso frame
      hand.x += sx * 0.04;
      const sh = V(sx * 0.17, shY, -0.06);
      const el = V(sx * 0.27, (sh.y + hand.y) / 2 - 0.08, (sh.z + hand.z) / 2 + 0.06);
      B.add(ell(0.07, 0.065, 0.07, b, sh), PU);
      B.add(limb(sh, el, 0.048, b), PU);
      B.add(limb(el, hand, 0.042, b), PU);
      B.add(ell(0.03, 0.05, 0.045, b, hand), PU);
    }
  }
  function chair(P) {
    const b = bronzeDark;
    // generous upholstered armchair scaled to an 8'11" man
    B.add(M(new THREE.BoxGeometry(1.25, 0.5, 1.05), b, 0, 0.32, 0), P); // base
    B.add(ell(0.58, 0.12, 0.5, b, V(0, 0.64, 0.04)), P); // seat cushion
    B.add(M(new THREE.BoxGeometry(1.25, 1.15, 0.22), b, 0, 1.0, -0.43, -0.08, 0, 0), P); // back
    B.add(ell(0.62, 0.14, 0.15, b, V(0, 1.6, -0.47)), P); // rounded top rail
    for (const sx of [-1, 1]) {
      B.add(M(new THREE.BoxGeometry(0.2, 0.45, 1.05), b, sx * 0.6, 0.78, 0), P);
      B.add(limb(V(sx * 0.6, 1.02, -0.5), V(sx * 0.6, 1.02, 0.52), 0.11, b), P);
      for (const z of [-0.45, 0.45]) B.add(M(new THREE.CylinderGeometry(0.05, 0.035, 0.12, 8), b, sx * 0.55, 0.0, z), P);
    }
    B.add(M(new THREE.BoxGeometry(1.4, 0.1, 1.2), graniteDark, 0, 0.0, 0), P);
  }
}
