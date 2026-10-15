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

const COPPER = 0x7fae98; // weathered verdigris

function statueofliberty() {
  const g = new THREE.Group();
  const lawn = mat(0x5f8a46, { roughness: 1 });
  const granite = lit(0xb8afa2, 0xffe2b8, { night: 0.5 });
  const concrete = lit(0xcfc8bb, 0xffe2b8, { night: 0.35 });
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
  // the detailed statue (Dystopia, Sketchfab, CC BY) replaces the sculpted
  // stand-in when it's loaded: 46 m from her heel to the torch
  const M = model('statue');
  if (M) {
    st.clear();
    const bb = new THREE.Box3().setFromObject(M);
    const h = bb.max.y - bb.min.y;
    M.scale.setScalar(46 / h);
    const c = bb.getCenter(new THREE.Vector3()).multiplyScalar(46 / h);
    M.position.set(-c.x, -bb.min.y * (46 / h), -c.z);
    M.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color(0x9fe8cf);
      o.material.emissiveIntensity = 0;
      o.material.userData.night = 0.35;
      cu.userData.statueMats = (cu.userData.statueMats || []).concat(o.material);
    });
    st.add(M);
  }
  st.rotation.y = -0.65; // she faces south-east, to the Narrows
  g.add(st);
  const sm = cu.userData.statueMats || [];
  return { group: g, glow: [granite, concrete, cu, ...sm], haze: [granite, concrete, cu, lawn, ...sm] };
}

function ellisisland() {
  const g = new THREE.Group();
  const brick = facadeMaterial('#9a4b33', { cols: 14, rows: 4, win: '#2a2d33', lamp: '#ffd9a0', seed: 12 });
  const stone = lit(0xd9d2c3, 0xffe2b8, { night: 0.4 });
  const cu = lit(COPPER, 0xc8ffe6, { night: 0.3 });
  const lawn = mat(0x5f8a46, { roughness: 1 });
  const isl = new THREE.Mesh(new THREE.BoxGeometry(260, 2, 150), lawn);
  isl.position.y = -0.6;
  g.add(isl);
  g.add(box(103, 18, 30, brick, 0, 0.4, 0));
  g.add(box(105, 1.4, 32, stone, 0, 18.4, 0));
  g.add(box(30, 6, 22, stone, 0, 19.6, 0)); // the central arched block
  for (const x of [-15, 15]) for (const z of [-9, 9]) {
    g.add(box(6, 14, 6, stone, x, 18.4, z));
    const d = new THREE.Mesh(new THREE.SphereGeometry(3.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), cu);
    d.position.set(x, 32.4, z);
    g.add(d);
    g.add(cyl(0.3, 0.3, 4, cu, x, 35.5, z, 6));
  }
  // the ferry slip and the hospital wings across it
  g.add(box(70, 12, 18, brick, 70, 0.4, 40));
  return { group: g, glow: [brick, stone], haze: [brick, stone, cu, lawn] };
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
