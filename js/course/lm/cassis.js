// Cassis landmarks, from published descriptions:
//   the vineyards of the Cassis AOC (1936, among the first appellations in
//     France): vines in rows on stone terraces (restanques), a bastide with
//     ochre walls, a terracotta roof and painted shutters, Italian cypresses
//   the port: pastel houses round the harbour, traditional pointus (small
//     wooden fishing boats, brightly painted), and a white harbour light
//   the Château de Cassis: medieval walls and towers on the rock above the
//     port (now a hotel)
// Cap Canaille itself comes from the elevation data; CourseWorld tints its
// cliffs ochre-red. Far landmarks are modelled in map axes (+x east, +z south).
import * as THREE from 'three';
import { mat, lit, seeded, tree, boulderGeometry } from './kit.js';
import { pbr } from '../../scene/pbr.js';
import { boatFleet } from '../../scene/boats.js';
import { Batch, bx, cy, place } from './riverfront.js';

const CYPRESS = 11, OLIVE = 10; // the course's Italian cypress and olive models (scene/trees.js)
const built = (B) => { const g = new THREE.Group(); B.build(g); return g; };

// Provençal stucco in its ochres and creams, terracotta canal tiles, painted shutters
const STUCCO = [0xf6dcb0, 0xf8e4c0, 0xeec894, 0xf4d4bc, 0xf8ecd4, 0xecd0a8, 0xf0c8a0];
const stucco = (c, glow = null) => pbr('white_plaster_02', { scale: 2, tint: c, bright: 1.6, ...(glow ? { glow, night: 0.25 } : {}) });
const tiles = () => pbr('clay_roof_tiles_02', { scale: 1.2, tint: 0xf0a080 });
const SHUTTER = [0x6f8fa0, 0x7a9a6a, 0x8aa6b3, 0x5a7a8a];
const shutterMat = (c) => pbr('brown_planks_08', { scale: 0.8, tint: c, bright: 1.6 });

/** A Provençal house into the batch: stucco walls, shuttered windows on its front (+Z) and back, a canal-tile roof. */
function house(B, M, w, h, d, x, z, ry, rnd, wall, shut) {
  const g = (geo) => place(geo, x, 0, z, ry);
  B.add(wall, g(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0)));
  const sh = new THREE.Shape(); sh.moveTo(-d / 2 - 0.4, 0); sh.lineTo(0, Math.min(2.2, d * 0.22)); sh.lineTo(d / 2 + 0.4, 0); sh.closePath();
  B.add(M.tile, g(new THREE.ExtrudeGeometry(sh, { depth: w + 0.6, bevelEnabled: false }).translate(0, h, -(w + 0.6) / 2).rotateY(Math.PI / 2)));
  const cols = Math.max(2, Math.floor(w / 3)), rows = Math.max(1, Math.floor((h - 1) / 3));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) for (const s of [1, -1]) {
    const wx = -w / 2 + (c + 0.5) * (w / cols), wy = 1.1 + r * 3, wz = s * (d / 2 + 0.02);
    B.add(M.glass, g(new THREE.BoxGeometry(0.9, 1.4, 0.06).translate(wx, wy + 0.7, wz)));
    const open = rnd() < 0.6;
    for (const k of [-1, 1]) B.add(shut, g(new THREE.BoxGeometry(0.5, 1.5, 0.06).translate(wx + k * (open ? 0.75 : 0.25), wy + 0.75, wz + s * 0.04)));
  }
}

function bastide(rnd) {
  const B = new Batch();
  const walls = stucco(STUCCO[Math.floor(rnd() * 3)], 0xffd28a);
  const M = { tile: tiles(), glass: lit(0x2a2c30, 0xffd28a, { night: 0.8, roughness: 0.1, metalness: 0.4 }) };
  house(B, M, 14, 7, 9, 0, 0, 0, rnd, walls, shutterMat(SHUTTER[Math.floor(rnd() * 4)]));
  return { g: built(B), walls, glass: M.glass };
}

function vineyard() {
  const rnd = seeded(1936);
  const B = new Batch();
  const stone = pbr('sandstone_blocks_08', { scale: 0.9, tint: 0xf0e4d0, bright: 1.2 });
  const wood = pbr('bark_brown_02', { scale: 0.6, tint: 0x9a8270 });
  const wire = pbr('metal_plate', { scale: 0.5, tint: 0x9a9ca0, metal: 0.8 });
  // the vines: goblet-trained stocks with a lumpy leaf canopy, each one its own shape, in colour-varied instances
  const leaf = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const canopy = boulderGeometry(0.62, rnd, { detail: 1, flat: 0.7 });
  const n = 3 * 14 * 22;
  const im = new THREE.InstancedMesh(canopy, leaf, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  let k = 0;
  for (let t = 0; t < 3; t++) {
    // a dry-stone restanque holding each terrace
    B.add(stone, bx(70, 1.1, 0.9, 0, t * 1.2 - 0.6, -t * 30 - 1));
    for (let r = 0; r < 14; r++) {
      const z = -t * 30 - 4 - r * 2;
      for (let i = 0; i < 22; i++) {
        const x = -31 + i * 3 + (rnd() - 0.5) * 0.3;
        sc.set(1 + rnd() * 0.5, 0.8 + rnd() * 0.4, 0.75 + rnd() * 0.2);
        im.setMatrixAt(k, m4.compose(p.set(x, t * 1.2 + 0.85, z), q.setFromEuler(e.set(0, rnd() * 6.28, 0)), sc));
        im.setColorAt(k++, col.setHSL(0.22 + rnd() * 0.05, 0.45 + rnd() * 0.15, 0.13 + rnd() * 0.06));
        B.add(wood, cy(0.05, 0.08, 0.7, x, t * 1.2, z, 5));
      }
      // end posts and the training wire
      B.add(wood, cy(0.05, 0.06, 1.4, -33, t * 1.2, z, 5), cy(0.05, 0.06, 1.4, 33, t * 1.2, z, 5));
      B.add(wire, bx(66, 0.02, 0.02, 0, t * 1.2 + 0.9, z));
    }
  }
  im.castShadow = true;
  const g = built(B);
  g.add(im);
  const b = bastide(rnd);
  b.g.position.set(48, 0, -40);
  b.g.rotation.y = -0.4;
  g.add(b.g);
  // a line of Italian cypresses as a windbreak, olives by the house
  const trees = [];
  for (let i = 0; i < 7; i++) trees.push(tree(40 + i * 3.4, 0, -18, 11 + rnd() * 5, 1.4, { slot: CYPRESS }));
  for (let i = 0; i < 3; i++) trees.push(tree(56 + i * 5, 0, -48 + rnd() * 4, 5 + rnd(), 2.6, { slot: OLIVE }));
  return { group: g, glow: [b.walls, b.glass], trees };
}

function phare() {
  // the harbour light: a white tower on the end of the stone jetty, green lantern (port side)
  const B = new Batch();
  const white = pbr('white_plaster_02', { scale: 1.5, tint: 0xfaf8f4, bright: 1.9, glow: 0xffffff, night: 0.3 });
  const jetty = pbr('sandstone_blocks_08', { scale: 2, tint: 0xf0e6d6, bright: 1.25 });
  const green = pbr('metal_plate', { scale: 0.8, tint: 0x3a9a5a, metal: 0.3 });
  const rnd = seeded(73);
  B.add(jetty, bx(10, 2, 70, 0, -1.5, 30));
  // riprap of fallen blocks along the jetty's seaward side
  const riprap = pbr('rock_face_03', { scale: 2, tint: 0xd8d0c8 });
  for (let i = 0; i < 24; i++) B.add(riprap, place(boulderGeometry(1 + rnd() * 0.8, rnd, { detail: 1, flat: 0.6 }), -5.5 - rnd() * 1.5, -1, -2 + i * 3, rnd() * 6));
  B.add(white, cy(1.6, 2.1, 11, 0, 0, 0, 20), cy(2.2, 2.2, 0.5, 0, 11, 0, 20));
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; B.add(green, cy(0.03, 0.03, 0.9, Math.cos(a) * 2.1, 11.5, Math.sin(a) * 2.1, 4)); }
  B.add(green, cy(0.2, 1.2, 1, 0, 13.1, 0, 14));
  const g = built(B);
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.6, 14), new THREE.MeshStandardMaterial({ color: 0x2f8a4a, emissive: 0x40ff70, emissiveIntensity: 0, roughness: 0.1, metalness: 0.3 }));
  lantern.position.y = 12.3;
  g.add(lantern);
  return { group: g, glow: [white], update(t, dt, day) { lantern.material.emissiveIntensity = (1 - day) * (Math.sin(t * 2.1) > 0.3 ? 2.2 : 0.1); } };
}

/** The port: quays, pastel houses climbing from the water, moored boats. */
function cassisport() {
  const rnd = seeded(1214);
  const B = new Batch();
  const M = { tile: tiles(), glass: lit(0x2e2e30, 0xffd18a, { night: 0.9, roughness: 0.1, metalness: 0.4 }) };
  const walls = STUCCO.map((c) => stucco(c, 0xffd18a));
  const shutters = SHUTTER.map(shutterMat);
  // houses in terraces around the harbour, in map axes (the harbour opens south)
  for (let i = 0; i < 90; i++) {
    const a = Math.PI * (0.05 + rnd() * 0.9), r = 70 + rnd() * 260;
    const x = Math.cos(a) * r * 1.4, z = -Math.sin(a) * r * 0.9;
    if (x > 300) continue; // the home hole runs down to the beach east of the town
    const w = 8 + rnd() * 8, d = 8 + rnd() * 6, h = 7 + Math.floor(rnd() * 3) * 3;
    house(B, M, w, h, d, x, z, -a + Math.PI / 2, rnd, walls[Math.floor(rnd() * walls.length)], shutters[Math.floor(rnd() * shutters.length)]);
  }
  // the quay: cut stone with bollards
  const quay = pbr('sandstone_blocks_08', { scale: 2, tint: 0xf0e6d6, bright: 1.25 });
  B.add(quay, bx(220, 1.4, 12, 0, -1, 30));
  const iron = pbr('metal_plate', { scale: 0.6, tint: 0x2a2c30, metal: 0.6 });
  for (let x = -104; x <= 104; x += 8) B.add(iron, cy(0.18, 0.22, 0.5, x, 0.4, 35.6, 8));
  const g = built(B);
  // real boats along the quay (js/scene/boats.js), 7-10 m, bobbing in place
  const slots = Array.from({ length: 26 }, (_, i) => ({ x: -100 + i * 8, z: 44 + (i % 2) * 2, L: 7 + rnd() * 3, yaw: (rnd() - 0.5) * 0.2, ph: rnd() * 6 }));
  let fleet = null;
  boatFleet(slots.length, rnd).then((f) => { if (f) { fleet = f; g.add(f.group); } });
  const e = new THREE.Euler();
  return {
    group: g,
    glow: [...walls, M.glass],
    haze: [...walls, M.tile, quay],
    update(t) {
      if (!fleet) return;
      slots.forEach((b, i) => fleet.place(i, b.x, -0.3 + Math.sin(t * 0.9 + b.ph) * 0.06, b.z, e.set(Math.sin(t * 0.7 + b.ph) * 0.03, Math.PI / 2 + b.yaw, Math.sin(t + b.ph) * 0.02), b.L));
      if (!fleet.bounded) { fleet.done?.(); fleet.bounded = true; }
    },
  };
}

function chateau() {
  // medieval walls and round towers of the local limestone, on the rock over the port
  const stone = pbr('sandstone_blocks_08', { scale: 1.6, tint: 0xf0e0c8, bright: 1.15, glow: 0xffd9a0, night: 0.55 });
  const B = new Batch();
  B.add(stone, bx(60, 9, 34, 0, 0, 0));
  for (const [x, z] of [[-30, -17], [30, -17], [-30, 17], [30, 17]]) {
    B.add(stone, cy(4.5, 5.2, 14, x, 0, z, 24), cy(5, 5, 0.5, x, 14, z, 24));
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; B.add(stone, bx(1.2, 1.4, 1.2, x + Math.cos(a) * 4.4, 14.5, z + Math.sin(a) * 4.4, -a)); }
  }
  for (let i = -28; i <= 28; i += 3) for (const z of [-17, 17]) B.add(stone, bx(1.4, 1.4, 1, i, 9, z));
  B.add(stone, bx(12, 18, 12, -8, 0, 0)); // the keep
  for (let i = -5; i <= 5; i += 2.5) for (const z of [-6, 6]) B.add(stone, bx(1.2, 1.3, 0.9, -8 + i, 18, z));
  const glass = lit(0x2a2c30, 0xffd9a0, { night: 0.9, roughness: 0.1 });
  for (let i = -24; i <= 24; i += 6) for (const z of [-17.03, 17.03]) B.add(glass, bx(1.1, 1.8, 0.05, i, 4, z));
  return { group: built(B), glow: [stone, glass], haze: [stone] };
}

export default { vineyard, phare, cassisport, chateau };
