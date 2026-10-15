// A Mississippi sternwheeler tied up at the St. Louis levee: three white
// decks with railings and turned posts, an ornate pilot house, twin feathered
// stacks, a red stern paddle wheel that turns slowly, string lights along the
// decks, and a cobblestone levee with bollards and a gangway. Long axis is
// local X; the levee is on the +Z side, toward the golfer.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, lit, box, cyl, seeded, canvasTex, landmarkWater } from './kit.js';
import { pbr } from '../../scene/pbr.js';
import { crowdAt } from '../../scene/crowd.js';

export default function build() {
  const g = new THREE.Group();
  const glow = [];
  const rnd = seeded(1817);
  const boat = new THREE.Group();

  // painted steel and timber
  const white = pbr('white_plaster_02', { scale: 2.5, tint: 0xfbfaf6, bright: 1.8, glow: 0xffd9a0, night: 0.35 });
  const trim = pbr('metal_plate', { scale: 2, tint: 0xb03a30, metal: 0.1 });
  const dark = pbr('metal_plate', { scale: 2, tint: 0x2a2c30, metal: 0.35 });
  const deck = pbr('brown_planks_08', { scale: 2 });
  const windowMat = lit(0x2a3440, 0xffd59a, { night: 1.4, roughness: 0.15, metalness: 0.3 });
  glow.push(white, windowMat);

  // hull: long, shallow, slightly raked bow
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-36, -7); hullShape.lineTo(30, -7); hullShape.quadraticCurveTo(40, -5, 42, 0);
  hullShape.quadraticCurveTo(40, 5, 30, 7); hullShape.lineTo(-36, 7); hullShape.closePath();
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(hullShape, { depth: 2.6, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -1.2, 0), pbr('metal_plate', { scale: 2.5, tint: 0xf4f2ec, bright: 1.6, metal: 0.15 }));
  hull.castShadow = true;
  boat.add(hull);
  boat.add(box(78, 0.35, 14.4, trim, 2, 1.25, 0)); // red sheer stripe
  boat.add(box(74, 0.2, 14, deck, 0, 1.4, 0));

  // three decks, each a bit shorter, with windows and overhangs
  const decks = [
    { x0: -32, x1: 30, y: 1.6, h: 3.2, w: 12.6 },
    { x0: -30, x1: 22, y: 5.0, h: 3.0, w: 11.4 },
    { x0: -18, x1: 10, y: 8.2, h: 2.6, w: 9.0 },
  ];
  const posts = [];
  const rails = [];
  for (const d of decks) {
    const L = d.x1 - d.x0;
    const cx = (d.x0 + d.x1) / 2;
    boat.add(box(L, d.h, d.w - 2.2, white, cx, d.y, 0));
    boat.add(box(L - 2, d.h * 0.42, d.w - 2.1, windowMat, cx, d.y + d.h * 0.38, 0));
    boat.add(box(L + 2.4, 0.22, d.w + 0.6, white, cx, d.y + d.h, 0)); // deck above / roof
    boat.add(box(L + 2.4, 0.3, 0.12, trim, cx, d.y + d.h - 0.3, d.w / 2 + 0.3));
    boat.add(box(L + 2.4, 0.3, 0.12, trim, cx, d.y + d.h - 0.3, -d.w / 2 - 0.3));
    // turned posts and railings on the open promenade
    for (let x = d.x0 - 1; x <= d.x1 + 1; x += 2.2) {
      for (const z of [d.w / 2, -d.w / 2]) posts.push(new THREE.CylinderGeometry(0.08, 0.1, d.h, 6).translate(x, d.y + d.h / 2, z));
    }
    for (const z of [d.w / 2, -d.w / 2]) {
      rails.push(new THREE.BoxGeometry(L + 2.4, 0.08, 0.08).translate(cx, d.y + 1.05, z));
      rails.push(new THREE.BoxGeometry(L + 2.4, 0.05, 0.05).translate(cx, d.y + 0.55, z));
    }
  }
  const postMesh = new THREE.Mesh(mergeGeometries(posts), white);
  const railMesh = new THREE.Mesh(mergeGeometries(rails), white);
  postMesh.castShadow = railMesh.castShadow = true;
  boat.add(postMesh, railMesh);

  // pilot house with cresting
  boat.add(box(6, 3.2, 6, white, 2, 11.0, 0));
  boat.add(box(6.3, 1.4, 6.3, windowMat, 2, 12.1, 0));
  const roofG = new THREE.Mesh(new THREE.ConeGeometry(4.6, 1.6, 4), dark);
  roofG.rotation.y = Math.PI / 4;
  roofG.position.set(2, 15.0, 0);
  boat.add(roofG);
  for (let i = 0; i < 12; i++) boat.add(box(0.12, 0.6, 0.12, mat(0xc9a24a, { metalness: 0.7, roughness: 0.4 }), -1 + (i % 4) * 2, 14.4, i < 4 ? 3.1 : i < 8 ? -3.1 : 0));

  // twin stacks with feathered crowns, forward of the pilot house
  for (const z of [-2.8, 2.8]) {
    boat.add(cyl(0.75, 0.85, 14, dark, 16, 8.2, z, 14));
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 0.8, 1.6, 12, 1, true), dark);
    crown.position.set(16, 22.9, z);
    boat.add(crown);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 4), dark);
      f.position.set(16 + Math.cos(a) * 1.3, 24.0, z + Math.sin(a) * 1.3);
      boat.add(f);
    }
  }
  boat.add(box(0.2, 0.4, 5.6, trim, 16, 18, 0)); // spreader between stacks

  // name boards
  const nameMat = new THREE.MeshStandardMaterial({
    map: canvasTex(512, 96, (c, w, h) => {
      c.fillStyle = '#f3efe6'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#9a2b22'; c.lineWidth = 6; c.strokeRect(4, 4, w - 8, h - 8);
      c.font = 'bold 52px Georgia'; c.fillStyle = '#9a2b22'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('TOM SAWYER', w / 2, h / 2 + 2);
    }),
    roughness: 0.6,
  });
  for (const z of [6.0, -6.0]) {
    const nb = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), nameMat);
    nb.position.set(-6, 9.4, z * 1.0);
    nb.rotation.y = z > 0 ? 0 : Math.PI;
    boat.add(nb);
  }

  // stern paddle wheel
  const wheel = new THREE.Group();
  const red = pbr('brown_planks_08', { scale: 1.5, tint: 0xff7060 });
  const R = 6;
  for (const z of [-5.2, 5.2]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.18, 6, 32), red);
    rim.position.z = z;
    wheel.add(rim);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.16, R * 2, 0.16), red);
      spoke.rotation.z = a;
      spoke.position.z = z;
      wheel.add(spoke);
    }
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const bucket = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 10.6), red);
    bucket.position.set(Math.cos(a) * (R - 0.6), Math.sin(a) * (R - 0.6), 0);
    bucket.rotation.z = a;
    wheel.add(bucket);
  }
  wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 11.6, 10).rotateX(Math.PI / 2), dark));
  wheel.position.set(-42.5, 4.2, 0);
  wheel.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  boat.add(wheel);
  boat.add(box(1.2, 0.4, 12, white, -42.5, 10.4, 0)); // wheel housing beam
  for (const z of [-6.2, 6.2]) boat.add(box(9, 0.3, 0.25, white, -39, 8.6, z));

  // string lights along each deck edge
  const bulbMat = lit(0xfff3d0, 0xffe2a8, { night: 2.4 });
  glow.push(bulbMat);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 6, 4), bulbMat, 240);
  const m4 = new THREE.Matrix4();
  let bn = 0;
  for (const d of decks) {
    for (const z of [d.w / 2 + 0.35, -d.w / 2 - 0.35]) {
      for (let x = d.x0 - 1; x <= d.x1 + 1 && bn < 240; x += 1.3) {
        m4.makeTranslation(x, d.y + d.h - 0.5 - Math.abs(Math.sin(x * 0.5)) * 0.15, z);
        bulbs.setMatrixAt(bn++, m4);
      }
    }
  }
  bulbs.count = bn;
  boat.add(bulbs);

  // passengers at the rails of the upper decks: the scanned people
  const pax = [];
  for (let i = 0; i < 14; i++) {
    const d = decks[1 + (i % 2)], side = rnd() < 0.5 ? 1 : -1;
    pax.push([d.x0 + rnd() * (d.x1 - d.x0), d.y + d.h + 0.1, side * (d.w / 2 - 0.6), side > 0 ? 0 : Math.PI]);
  }
  const people = crowdAt(pax, rnd);
  if (people) boat.add(people);

  // moored below the tee, off to the left so the shot to the island is clear
  const BOAT_X = -48;
  boat.position.set(BOAT_X, 0, -112);
  g.add(boat);

  // ── the floating restaurant on the right: a riverboat front on a steel barge, in the
  // spirit of the old McBarge that served burgers below the Arch from 1980 to 2000 ──
  const barge = new THREE.Group();
  {
    const red = pbr('metal_plate', { scale: 2, tint: 0xc4302a, metal: 0.15 });
    const gold = pbr('metal_plate', { scale: 2, tint: 0xf2b630, metal: 0.25, bright: 1.3 });
    const hullM = pbr('metal_plate', { scale: 2.5, tint: 0x3c3f44, metal: 0.4 });
    const glass = lit(0x24303a, 0xffd59a, { night: 1.5, roughness: 0.12, metalness: 0.3 });
    glow.push(glass);
    barge.add(box(60, 2.2, 20, hullM, 0, -1.1, 0)); // the steel barge
    barge.add(box(60.4, 0.25, 20.4, red, 0, 1.0, 0));
    barge.add(box(52, 4.2, 15, white, 0, 1.1, 0)); // the dining hall
    barge.add(box(50, 2.2, 15.1, glass, 0, 2.2, 0)); // its long windows
    barge.add(box(54, 0.35, 17, red, 0, 5.3, 0)); // the deck above
    barge.add(box(30, 3.2, 11, white, 4, 5.6, 0));
    barge.add(box(28, 1.4, 11.1, glass, 4, 6.6, 0));
    barge.add(box(32, 0.3, 13, gold, 4, 8.8, 0)); // a bright yellow roof edge
    // the false riverboat front: twin stacks with feathered crowns and a dummy stern wheel
    for (const z of [-3.2, 3.2]) { barge.add(cyl(0.7, 0.8, 9, dark, 16, 9, z, 14)); barge.add(cyl(1.3, 0.75, 1.2, gold, 16, 18, z, 14)); }
    const wheelF = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 12, 20, 1, true).rotateX(Math.PI / 2).rotateY(Math.PI / 2), red);
    wheelF.position.set(-31, 4, 0);
    barge.add(wheelF);
    const sign = new THREE.MeshStandardMaterial({ map: canvasTex(512, 96, (c, w, h) => { c.fillStyle = '#c4302a'; c.fillRect(0, 0, w, h); c.font = 'bold 62px Georgia'; c.fillStyle = '#ffd24a'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('RIVERFRONT EATS', w / 2, h / 2 + 4); }), roughness: 0.7 });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(22, 4.1), sign);
    sm.position.set(4, 10.6, 6.6);
    barge.add(sm);
    const pax2 = [];
    for (let i = 0; i < 14; i++) pax2.push([-20 + rnd() * 40, 5.65, -4 + rnd() * 8, rnd() * 6.28]);
    const crowd2 = crowdAt(pax2, rnd);
    if (crowd2) barge.add(crowd2);
    barge.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }
  barge.position.set(56, 0, -120);
  barge.rotation.y = 0.2;
  g.add(barge);

  // ── the levee: cobblestone slope, bollards, gangway; the river is the hole's own ──
  // the levee's granite setts, sloping down to the water
  const levee = new THREE.Mesh(new THREE.PlaneGeometry(300, 16), pbr('cobblestone_floor_08', { scale: 2.5, tint: 0xd8d0c4 }));
  levee.rotation.x = -Math.PI / 2 + 0.2;
  levee.position.set(0, 1.2, 9.5);
  levee.receiveShadow = true;
  g.add(levee);
  const iron = pbr('metal_plate', { scale: 1, tint: 0x2c2e32, metal: 0.6 });
  for (let x = -140; x <= 140; x += 12.5) g.add(cyl(0.35, 0.45, 0.9, iron, x, 0.2, 3, 10));

  // soft stack smoke
  const smokeTex = canvasTex(64, 64, (c, w, h) => {
    const grd = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(235,235,235,0.55)'); grd.addColorStop(1, 'rgba(235,235,235,0)');
    c.fillStyle = grd; c.fillRect(0, 0, w, h);
  });
  const puffs = [];
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.userData = { z: i % 2 ? 2.8 : -2.8, phase: i / 14 };
    boat.add(s);
    puffs.push(s);
  }

  // both boats ride on the hole's river: its level, in this frame, found by fit
  let floatY = 0;
  return {
    group: g,
    glow,
    pad: false, // the levee meets the river: no levelling
    fit(holder, T) {
      holder.updateMatrix();
      const M = holder.matrix, w = new THREE.Vector3();
      for (const z of [-100, -110, -90]) {
        w.set(0, 0, z).applyMatrix4(M);
        const tr = T.terrain(w.x, w.z);
        if (tr.surface === 'water') { floatY = (tr.height - holder.position.y) / holder.scale.y + 0.3; break; }
      }
      barge.position.y = floatY;
    },
    update(t, dt) {
      wheel.rotation.z = -t * 0.35;
      boat.position.y = floatY + Math.sin(t * 0.6) * 0.06;
      boat.rotation.x = Math.sin(t * 0.45) * 0.004;
      for (const s of puffs) {
        const u = (t * 0.08 + s.userData.phase) % 1;
        s.position.set(16 - u * 9, 25 + u * 12, s.userData.z + u * 3);
        const k = 2 + u * 7;
        s.scale.set(k, k, 1);
        s.material.opacity = 0.45 * Math.sin(Math.PI * u);
      }
    },
  };
}
