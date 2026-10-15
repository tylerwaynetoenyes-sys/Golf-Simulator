// New York Harbor landmarks for the Statue of Liberty course, from published
// dimensions:
//   Statue of Liberty (1886): copper statue 46 m (151 ft 1 in) from heel to
//     torch, on a 27 m granite pedestal over a 20 m concrete foundation
//     inside Fort Wood's eleven-point star; 93 m ground to torch
//   Ellis Island main building (1900): French Renaissance, red brick with
//     limestone trim, ~103 m long, four copper-domed towers ~30 m
//   One World Trade Center (2014): 541 m (1,776 ft) to the spire tip, square
//     base twisting to an octagon of eight tall isosceles triangles
//   Empire State Building (1931): 443 m to the antenna tip
// These are far landmarks, modelled in map axes (+x east, +z south) and
// placed at their real latitude/longitude by CourseWorld.
import * as THREE from 'three';
import { model } from '../../scene/models.js';
import { mat, lit, box, cyl, sphere, seeded, facadeMaterial } from './kit.js';
import { pbr } from '../../scene/pbr.js';
import { Batch, bx, cy, place } from './riverfront.js';

const COPPER = 0x7fae98; // weathered verdigris

function statueofliberty() {
  const g = new THREE.Group();
  const lawn = mat(0x5f8a46, { roughness: 1 });
  const granite = pbr('granite_wall', { scale: 2, tint: 0xd8c8b8, bright: 1.2, glow: 0xffe2b8, night: 0.5 });
  const concrete = pbr('concrete_wall_008', { scale: 3, tint: 0xd2dcf2, bright: 1.3, glow: 0xffe2b8, night: 0.35 });
  const cu = lit(COPPER, 0xc8ffe6, { night: 0.45, roughness: 0.7, metalness: 0.15 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2c25a, emissive: 0xffc04a, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.3 });
  // Liberty Island: ~6 ha of lawn and paths, just above the water
  const island = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.05, 2.2, 40), lawn);
  island.scale.set(150, 1, 95);
  island.position.y = -0.4;
  g.add(island);
  // Fort Wood: an eleven-point star of granite walls
  const star = new THREE.Shape();
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2, r = i % 2 ? 31 : 46;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r); else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const fort = new THREE.Mesh(new THREE.ExtrudeGeometry(star, { depth: 7, bevelEnabled: false }).rotateX(-Math.PI / 2), concrete);
  fort.position.y = 0.6;
  g.add(fort);
  // foundation (stepped) and pedestal
  g.add(box(28, 13, 28, concrete, 0, 7, 0));
  g.add(box(20, 4, 20, granite, 0, 20, 0));
  g.add(box(17, 18, 17, granite, 0, 24, 0));
  g.add(box(19, 2.4, 19, granite, 0, 42, 0));
  g.add(box(14, 3, 14, granite, 0, 44.4, 0));
  // the statue (46 m heel to torch, facing south-east toward the Narrows):
  // a draped robe with deep vertical folds, the raised right arm (12.8 m),
  // the torch with its gold-leaf flame, the crown's seven rays, and the
  // tablet (7.2 m) held against her left side
  const st = new THREE.Group();
  st.position.y = 47.4;
  const prof = [[0, 0], [6.9, 0], [6.6, 3], [5.6, 9], [4.7, 14], [4.25, 17], [4.5, 21], [4.75, 24.5], [4.3, 27], [2.8, 28.8], [1.35, 29.6], [0, 29.8]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const robeGeo = new THREE.LatheGeometry(prof, 64);
  {
    const pp = robeGeo.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 0.01) continue;
      const a = Math.atan2(z, x);
      // folds hang from the shoulders and spread toward the hem
      const k = Math.max(0, 1 - y / 27);
      const fold = Math.sin(a * 11 + Math.sin(a * 3) * 1.5) * 0.42 * k + Math.sin(a * 23) * 0.12 * k;
      // the cloak sweeps back on the left, the right foot steps forward
      const sweep = (Math.cos(a - 2.4) > 0 ? Math.cos(a - 2.4) * 0.9 : 0) * k;
      const nr = r + fold + sweep;
      pp.setX(i, (x / r) * nr); pp.setZ(i, (z / r) * nr);
    }
    robeGeo.computeVertexNormals();
  }
  st.add(new THREE.Mesh(robeGeo, cu));
  // head and neck, the face toward +Z (the front)
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 16), cu);
  head.scale.set(1.75, 2.15, 1.95);
  head.position.set(0, 31.3, 0.25);
  st.add(head);
  st.add(cyl(1.25, 1.45, 1.8, cu, 0, 29.2, 0.1, 14));
  // the crown: a diadem and seven rays
  const band = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.38, 8, 28), cu);
  band.rotation.x = Math.PI / 2 - 0.12;
  band.position.set(0, 32.9, 0.1);
  st.add(band);
  for (let i = 0; i < 7; i++) {
    const a = (-0.85 + (i / 6) * 1.7);
    const ray = new THREE.Mesh(new THREE.ConeGeometry(0.34, 3.1, 4), cu);
    const dir = new THREE.Vector3(Math.sin(a) * 1, 0.55, Math.cos(a) * 0.55).normalize();
    ray.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    ray.position.set(Math.sin(a) * 2.05, 33.0, Math.cos(a) * 1.4).addScaledVector(dir, 1.5);
    st.add(ray);
  }
  // raised right arm: sleeve falling back from the shoulder to the hand
  const limb = (from, to, r0, r1, m) => {
    const d = new THREE.Vector3().subVectors(to, from);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, d.length(), 14), m);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    mesh.position.copy(from).addScaledVector(d, 0.5);
    return mesh;
  };
  const shoulder = new THREE.Vector3(3.9, 26.6, -0.2), hand = new THREE.Vector3(5.3, 39.2, -0.6);
  st.add(limb(shoulder, new THREE.Vector3(4.6, 32.5, -0.4), 1.8, 1.25, cu)); // the loose sleeve
  st.add(limb(new THREE.Vector3(4.6, 32.5, -0.4), hand, 1.0, 0.75, cu));
  st.add(sphere(0.95, cu, hand.x, hand.y, hand.z, 12));
  // the torch: handle, balcony and a gold-leaf flame
  st.add(cyl(0.55, 0.45, 2.9, cu, 5.35, 39.6, -0.6, 10));
  st.add(cyl(1.55, 0.7, 1.1, cu, 5.4, 42.4, -0.6, 16));
  const flame = new THREE.Mesh(new THREE.ConeGeometry(1.15, 3.3, 14), gold);
  flame.position.set(5.4, 45.1, -0.6);
  st.add(flame);
  // left arm bent, holding the tablet (July IV MDCCLXXVI) against her side
  st.add(limb(new THREE.Vector3(-3.9, 26.2, 0.2), new THREE.Vector3(-4.7, 21.5, 1.3), 1.4, 1.0, cu));
  const tab = box(4.1, 7.2, 0.9, cu, -4.6, 17.6, 1.9);
  tab.rotation.z = 0.2;
  tab.rotation.x = -0.12;
  st.add(tab);
  st.rotation.y = -0.65; // she faces south-east, to the Narrows
  g.add(st);
  // the photogrammetry scan (CMBC, Sketchfab, CC BY): statue, pedestal, Fort
  // Wood and Liberty Island at real scale (93 m to the torch), centred on her.
  // It replaces everything above when it's loaded.
  const M = model('statue');
  if (M) {
    g.clear();
    const sm = [];
    M.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      o.material.emissive = new THREE.Color(0x9fe8cf);
      o.material.emissiveIntensity = 0;
      o.material.userData.night = 0.25; // the floodlit statue at night
      sm.push(o.material);
    });
    g.add(M);
    return { group: g, glow: [...new Set(sm)], haze: [...new Set(sm)] };
  }
  return { group: g, glow: [granite, concrete, cu], haze: [granite, concrete, cu, lawn] };
}

/** Round-headed opening outline (w wide, h to the crown) as a flat pane facing +Z. */
function archPane(w, h) {
  const s = new THREE.Shape(), r = w / 2;
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r); s.absarc(0, h - r, r, 0, Math.PI, false); s.closePath();
  return new THREE.ShapeGeometry(s, 8);
}

function ellisisland() {
  // the Main Building (Boring & Tilton, 1900): red Flemish-bond brick with
  // limestone quoins and trim, three great arched windows over the entrance
  // into the Registry Room, four towers with copper cupolas, hipped roofs
  const brick = pbr('red_bricks_02', { scale: 1.8, tint: 0xf0d8cc, glow: 0xffd9a0, night: 0.25 });
  const stone = pbr('white_sandstone_bricks', { scale: 1.5, tint: 0xf4ece0, bright: 1.3, glow: 0xffe2b8, night: 0.4 });
  const roof = pbr('roof_slates_02', { scale: 1.5, tint: 0x9aa0a8 });
  const cu = pbr('metal_plate', { scale: 1.5, tint: 0xa8e0c8, bright: 1.5, metal: 0.25, glow: 0xc8ffe6, night: 0.3 });
  const glass = lit(0x232a32, 0xffd9a0, { night: 0.9, roughness: 0.08, metalness: 0.5 });
  const lawn = mat(0x5f8a46, { roughness: 1 });
  const seawall = pbr('granite_wall', { scale: 2, tint: 0xb8c0cc });
  const B = new Batch();
  const isl = new THREE.Mesh(new THREE.BoxGeometry(260, 2, 150), lawn);
  isl.position.y = -0.6;
  B.add(seawall, bx(262.4, 2.0, 152.4, 0, -1.8, 0));
  const L = 103, D = 30, H = 18;
  B.add(brick, bx(L, H, D, 0, 0.4, 0));
  B.add(stone, bx(L + 0.6, 1.6, D + 0.6, 0, 0.4, 0), bx(L + 1.2, 1.2, D + 1.2, 0, H + 0.4, 0));
  // quoins at the corners and either side of the centre pavilion
  for (const x of [-L / 2, -16, 16, L / 2]) for (const z of [-D / 2, D / 2]) for (let y = 2; y < H; y += 1.4) B.add(stone, bx(1.2, 0.7, 1.2, x, y + 0.4, z));
  // two storeys of windows along both long fronts, stone sills and heads
  for (let i = 0; i < 24; i++) {
    const x = -L / 2 + 3 + i * ((L - 6) / 23);
    if (Math.abs(x) < 17) continue;
    for (const y of [4, 11]) for (const s of [1, -1]) {
      B.add(glass, place(archPane(1.6, 3.6), x, y, s * (D / 2 + 0.03), s > 0 ? 0 : Math.PI));
      B.add(stone, bx(2.0, 0.25, 0.4, x, y - 0.25, s * (D / 2 + 0.1)));
    }
  }
  // the centre: three tall arched windows of the Registry Room over the entrance canopy
  B.add(brick, bx(32, H + 6, D + 2, 0, 0.4, 0));
  for (const x of [-9, 0, 9]) for (const s of [1, -1]) B.add(glass, place(archPane(6, 12), x, 7, s * (D / 2 + 1.04), s > 0 ? 0 : Math.PI));
  B.add(stone, bx(33, 1.4, D + 3, 0, H + 6.4, 0));
  B.add(roof, place(new THREE.CylinderGeometry(0.01, 20, 7, 4, 1).rotateY(Math.PI / 4).scale(1.1, 1, 0.75).translate(0, 3.5, 0), 0, H + 7.8, 0));
  B.add(cu, bx(20, 1.2, 4, 0, 4.2, D / 2 + 3)); // the entrance canopy
  // the four towers: brick shafts with stone belts, open belfries, copper domes and lanterns
  for (const x of [-15, 15]) for (const z of [-9, 9]) {
    B.add(brick, bx(6, 14, 6, x, H + 0.4, z));
    B.add(stone, bx(6.6, 0.8, 6.6, x, H + 8, z), bx(6.8, 1, 6.8, x, H + 14.4, z));
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) B.add(glass, place(archPane(2.2, 4), x + Math.sin(ry) * 3.02, H + 9.2, z + Math.cos(ry) * 3.02, ry));
    B.add(cu, place(new THREE.SphereGeometry(3.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.35, 1), x, H + 15.4, z));
    B.add(cu, cy(0.6, 0.8, 2.4, x, H + 20.2, z, 10), place(new THREE.SphereGeometry(0.8, 10, 6), x, H + 23.2, z), cy(0.05, 0.12, 2.5, x, H + 23.6, z, 5));
  }
  // the hipped roofs of the wings
  for (const s of [-1, 1]) B.add(roof, place(new THREE.CylinderGeometry(0.01, 22, 6, 4, 1).rotateY(Math.PI / 4).scale(1.0, 1, 0.72).translate(0, 3, 0), s * 34, H + 1.6, 0));
  // the ferry slip and the hospital wings across it
  B.add(brick, bx(70, 12, 18, 70, 0.4, 40));
  B.add(stone, bx(70.6, 1, 18.6, 70, 12.4, 40));
  B.add(roof, place(new THREE.CylinderGeometry(0.01, 26, 4, 4, 1).rotateY(Math.PI / 4).scale(1.35, 1, 0.5).translate(0, 2, 0), 70, 13.4, 40));
  for (let i = 0; i < 14; i++) for (const y of [3, 8]) B.add(glass, place(archPane(1.4, 2.8), 70 - 32 + i * 4.9, y, 49.03));
  const g = new THREE.Group();
  g.add(isl);
  B.build(g);
  return { group: g, glow: [brick, stone, cu, glass], haze: [brick, stone, roof, cu, glass, lawn, seawall] };
}

/** One tower: a box (or a set-back stack) with a lit window facade. */
function tower(w, h, d, facade, cap = null) {
  const t = new THREE.Group();
  t.add(box(w, h, d, facade));
  if (cap) t.add(box(w * 0.7, h * 0.08, d * 0.7, cap, 0, h, 0));
  return t;
}

function manhattan() {
  const g = new THREE.Group();
  const rnd = seeded(1776);
  const glassA = facadeMaterial('#3c5466', { cols: 10, rows: 24, win: '#1d2a36', lamp: '#ffe2b0', seed: 3 });
  const glassB = facadeMaterial('#6d7f8c', { cols: 8, rows: 20, win: '#26323d', lamp: '#fff0d0', seed: 5 });
  const stoneA = facadeMaterial('#b9a98f', { cols: 8, rows: 18, win: '#2c2a28', lamp: '#ffd59a', seed: 7 });
  const stoneB = facadeMaterial('#8f857a', { cols: 6, rows: 16, win: '#2a2826', lamp: '#ffd59a', seed: 9 });
  const facades = [glassA, glassB, stoneA, stoneB];
  const roof = lit(0x5b6168, 0xff6a5a, { night: 0.8 });
  // One World Trade Center: square base twisting to an octagon (eight
  // triangular facets), roof at 417 m, spire to 541 m
  const owtc = new THREE.Group();
  const shaft = new THREE.CylinderGeometry(Math.SQRT1_2 * 30, Math.SQRT1_2 * 61, 330, 4, 1);
  const m1 = new THREE.MeshStandardMaterial({ color: 0x9fb8c8, metalness: 0.75, roughness: 0.18, emissive: 0x7fa0c0, emissiveIntensity: 0 });
  m1.userData.night = 0.35;
  const body = new THREE.Mesh(shaft, m1);
  body.rotation.y = Math.PI / 4;
  body.position.y = 56 + 165;
  owtc.add(body);
  owtc.add(box(61, 56, 61, stoneB));
  owtc.add(box(26, 9, 26, roof, 0, 386, 0));
  owtc.add(cyl(0.9, 2.2, 124, mat(0xdfe3e6, { metalness: 0.8, roughness: 0.3 }), 0, 395, 0, 8));
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  beacon.position.y = 520;
  owtc.add(beacon);
  g.add(owtc);
  const glows = [m1, roof, ...facades];
  // the rest of the Financial District and Battery Park City, in map axes
  // (+x east, +z south) around One WTC; heights from the skyline's real range
  const named = [
    // [x, z, w, d, h, facade]
    [150, 40, 46, 46, 329, glassA], // 3 WTC
    [190, 140, 46, 40, 298, glassB], // 4 WTC
    [-40, -120, 40, 40, 228, glassA], // 7 WTC
    [380, -160, 34, 30, 241, stoneA], // Woolworth Building
    [520, 380, 32, 32, 290, stoneB], // 70 Pine Street
    [330, 470, 34, 34, 283, stoneA], // 40 Wall Street
    [-330, 150, 54, 54, 225, glassB], // Brookfield Place
  ];
  for (const [x, z, w, d, h, f] of named) { const t = tower(w, h, d, f, roof); t.position.set(x, 0, z); g.add(t); }
  for (let i = 0; i < 110; i++) {
    const a = rnd() * Math.PI * 2, r = 140 + Math.sqrt(rnd()) * 900;
    const x = Math.cos(a) * r * 0.9 + 200, z = Math.sin(a) * r * 1.25 + 250;
    const near = Math.max(0, 1 - r / 1100);
    const h = 50 + rnd() * (90 + 170 * near);
    const t = tower(18 + rnd() * 28, h, 18 + rnd() * 28, facades[Math.floor(rnd() * 4)], rnd() < 0.5 ? roof : null);
    t.position.set(x, 0, z);
    t.rotation.y = (rnd() - 0.5) * 0.3;
    g.add(t);
  }
  // Empire State Building, 4.1 km north-north-east of One WTC
  const esb = new THREE.Group();
  esb.add(box(130, 25, 57, stoneA));
  esb.add(box(70, 290, 57, stoneA, 0, 25, 0));
  esb.add(box(50, 45, 40, stoneA, 0, 315, 0));
  esb.add(box(24, 22, 24, stoneB, 0, 360, 0));
  esb.add(cyl(4, 8, 25, stoneB, 0, 382, 0, 10));
  esb.add(cyl(0.6, 1.4, 36, mat(0xd8d8d8), 0, 407, 0, 6));
  esb.position.set(2350, 0, -3900);
  g.add(esb);
  return {
    group: g,
    glow: glows,
    haze: [m1, roof, ...facades],
    update(t, dt, day) { beacon.material.color.setScalar(day > 0.5 ? 0.9 : (Math.sin(t * 2.2) > 0.6 ? 2.5 : 0.25)); },
  };
}

/**
 * Bald eagles riding the harbor wind: a few birds circling slowly over the
 * hole (2 m wingspan, white head and tail).
 */
function eagles() {
  const g = new THREE.Group();
  const rnd = seeded(1782);
  const dark = mat(0x3a2a1e, { roughness: 0.9, side: THREE.DoubleSide });
  const white = mat(0xf2efe6, { roughness: 0.8 });
  const birds = [];
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.55, 4, 8).rotateX(Math.PI / 2), dark);
    b.add(body);
    b.add(sphere(0.12, white, 0, 0.04, -0.42, 10));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.35, 6).rotateX(-Math.PI / 2), white);
    tail.position.z = 0.48;
    b.add(tail);
    const wingGeo = new THREE.PlaneGeometry(1.0, 0.42).translate(0.5, 0, 0).rotateX(-Math.PI / 2);
    const lw = new THREE.Mesh(wingGeo, dark), rw = new THREE.Mesh(wingGeo, dark);
    rw.scale.x = -1;
    b.add(lw, rw);
    b.userData = { lw, rw, r: 40 + rnd() * 60, h: 35 + rnd() * 40, w: (0.08 + rnd() * 0.06) * (rnd() < 0.5 ? 1 : -1), p: rnd() * 6.28 };
    g.add(b);
    birds.push(b);
  }
  return {
    group: g,
    glow: [],
    update(t) {
      for (const b of birds) {
        const u = b.userData;
        const a = u.p + t * u.w;
        b.position.set(Math.cos(a) * u.r, u.h + Math.sin(t * 0.3 + u.p) * 4, Math.sin(a) * u.r);
        b.rotation.y = -a + (u.w > 0 ? 0 : Math.PI);
        b.rotation.z = u.w > 0 ? 0.25 : -0.25; // banked into the turn
        const flap = Math.max(0, Math.sin(t * 1.3 + u.p * 3)) ** 8 * 0.5; // mostly soaring, the odd wingbeat
        u.lw.rotation.z = 0.08 + flap;
        u.rw.rotation.z = -0.08 - flap;
      }
    },
  };
}

export default { statueofliberty, ellisisland, manhattan, eagles };
