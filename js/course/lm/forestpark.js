// Forest Park, St. Louis: the park's landmarks at their mapped places, laid on
// the course's own ground (fit), in map axes (+x east, +z south) from
// 38.6385°N 90.2875°W. Positions and footprints from OpenStreetMap
// (assets/landmarks/forestpark, tools/bake-alton.mjs); surfaces are
// photographed PBR sets (js/scene/pbr.js). From published descriptions:
//   Saint Louis Art Museum: Cass Gilbert's Palace of Fine Arts (1904), the
//     one building of the World's Fair built to last. A central block with a
//     great arched entrance between paired Corinthian columns, "DEDICATED TO
//     ART AND FREE TO ALL" on the attic, the skylit sculpture hall's vault,
//     and lower wings, in limestone, facing north down Art Hill
//   Apotheosis of St. Louis (Charles Niehaus, 1906): Louis IX on horseback
//     holding his sword hilt-up as a cross, bronze on a granite pedestal
//   Emerson Grand Basin: the fair's "Main Picture"; stone coping and a line
//     of fountain jets
//   Missouri History Museum: the Jefferson Memorial Building (1913), a
//     limestone loggia of columns between two wings
//   World's Fair Pavilion (1909) on Government Hill: an open arcade under a
//     red clay-tile roof
//   Jewel Box (1936): an Art Deco greenhouse of stepped glass walls
//   McDonnell Planetarium (Gyo Obata, 1963): a thin concrete hyperboloid
//   The Muny (1917): the stage house and its fan of 11,000 seats
//   the Zoo's Flight Cage (1904 fair): a steel-ribbed mesh vault
//   the Boathouse on Post-Dispatch Lake
// plus the park's lakes and its drives and paths.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, lit, canvasTex } from './kit.js';
import { pbr } from '../../scene/pbr.js';
import { createWaterMaterial } from '../../scene/river.js';
import { shoreLife } from '../../scene/shore.js';
let _lakeWater = null; // one water for every hole's lakes
import { place, bx, cy, rod, span, Batch, pavingMeshes } from './riverfront.js';

const BASE = new URL('../../../assets/landmarks/forestpark/', import.meta.url).href;
let DATA = null;
const ready = fetch(`${BASE}ground.json`).then((r) => (r.ok ? r.json() : null)).then((j) => (DATA = j)).catch(() => null);

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// shared surfaces
const M = () => ({
  lime: pbr('white_sandstone_bricks', { scale: 2.6, glow: 0xffe2b8, night: 0.35 }),
  limeTrim: pbr('white_plaster_02', { scale: 2.5, tint: 0xefe8da }),
  conc: pbr('concrete_wall_008', { scale: 4, tint: 0xf2f0ea }),
  granite: pbr('granite_wall', { scale: 2, tint: 0xb9b4ad }),
  tile: pbr('clay_roof_tiles_02', { scale: 2.4 }),
  brick: pbr('red_bricks_02', { scale: 2.2 }),
  plaster: pbr('white_plaster_02', { scale: 3 }),
  steel: pbr('metal_plate', { scale: 2, metal: 0.3, tint: 0x8a9095, rough: 0.8 }),
  green: pbr('metal_plate', { scale: 2, metal: 0.15, tint: 0x8fc2a8, rough: 0.9 }), // weathered copper
  slate: pbr('roof_slates_02', { scale: 2 }),
});

/** A Corinthian column: base, fluted shaft (24 sides), flared capital. */
function column(r, h) {
  const parts = [];
  parts.push(new THREE.CylinderGeometry(r * 1.35, r * 1.45, r * 0.9, 24).translate(0, r * 0.45, 0));
  const shaft = new THREE.CylinderGeometry(r * 0.88, r, h - r * 3.2, 24, 1);
  // flutes: pull every other vertex in a touch
  const p = shaft.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 - 0.035 * (0.5 + 0.5 * Math.cos(a * 24));
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
  }
  shaft.computeVertexNormals();
  parts.push(shaft.translate(0, r * 0.9 + (h - r * 3.2) / 2, 0));
  parts.push(new THREE.CylinderGeometry(r * 1.45, r * 0.9, r * 1.7, 24).translate(0, h - r * 2.3 + r * 0.85, 0)); // acanthus bell
  parts.push(new THREE.BoxGeometry(r * 3, r * 0.6, r * 3).translate(0, h - r * 0.3, 0)); // abacus
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; }));
}
const at = (g, x, y, z, ry = 0) => place(g.clone(), x, y, z, ry);

/** An extruded round-headed arch outline (for arcades and the great portal). */
function archFrame(w, h, depth, jamb = 1.2) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 - jamb, 0); s.lineTo(w / 2 + jamb, 0); s.lineTo(w / 2 + jamb, h + jamb); s.lineTo(-w / 2 - jamb, h + jamb); s.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-w / 2, 0); hole.lineTo(-w / 2, h - w / 2); hole.absarc(0, h - w / 2, w / 2, Math.PI, 0, true); hole.lineTo(w / 2, 0); hole.closePath();
  s.holes.push(hole);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 16 }).translate(0, 0, -depth / 2);
}

function lettering(text, w, h, color = '#3b3326') {
  const t = canvasTex(1024, 96, (c, W, H) => {
    c.clearRect(0, 0, W, H); c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '600 54px "Times New Roman", Georgia, serif';
    c.fillText(text.split('').join(String.fromCharCode(8202)), W / 2, H / 2 + 4);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, roughness: 0.9 }));
}

// ── Saint Louis Art Museum (front to -z, north) ──
function artMuseum(m, group) {
  const B = new Batch();
  // terrace and podium
  B.add(m.granite, bx(150, 1.6, 92, 0, -1.2, 6));
  B.add(m.lime, bx(56, 3.2, 64, 0, 0.4, 4));
  // the central block and its attic
  B.add(m.lime, bx(54, 20, 60, 0, 3.6, 4));
  B.add(m.limeTrim, bx(56, 1.4, 62, 0, 23.6, 4), bx(55, 4.5, 61, 0, 25, 4));
  // the great arch: a deep round-headed portal in the north face
  B.add(m.lime, place(archFrame(17, 19, 3.4, 4), 0, 3.6, -27));
  B.add(mat(0x3a3d40, { roughness: 0.4, metalness: 0.3 }), bx(17, 19, 0.3, 0, 3.6, -25)); // the glazed screen in it
  // paired columns either side of the arch, on pedestals, carrying the entablature
  const col = column(0.85, 14.5);
  for (const sx of [-1, 1]) for (const dx of [12.5, 15.2, 21.5, 24.2]) {
    B.add(m.lime, bx(2.6, 3.4, 2.6, sx * dx, 3.6, -31));
    B.add(m.lime, at(col, sx * dx, 7, -31));
  }
  B.add(m.limeTrim, bx(56, 2.2, 4, 0, 21.4, -31)); // entablature
  // the inscription across the attic
  const ins = lettering('DEDICATED TO ART AND FREE TO ALL', 40, 3.6);
  ins.position.set(0, 26.6, -26.6); ins.rotation.y = Math.PI;
  group.add(ins);
  // the sculpture hall's skylit barrel vault
  B.add(m.green, place(new THREE.CylinderGeometry(10, 10, 46, 24, 1, false, Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), 0, 29.4, 6));
  B.add(mat(0xb9c7cc, { roughness: 0.15, metalness: 0.5 }), place(new THREE.CylinderGeometry(10.15, 10.15, 40, 24, 1, false, Math.PI / 2 + 0.6, Math.PI - 1.2).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), 0, 29.4, 6));
  // wings east and west: lower, pilastered, with tall windows
  const win = lit(0x2f3a42, 0xffd8a0, { night: 0.8, roughness: 0.2 });
  for (const sx of [-1, 1]) {
    B.add(m.lime, bx(44, 14, 54, sx * 50, 3.6, 8));
    B.add(m.limeTrim, bx(45, 1.2, 55, sx * 50, 17.6, 8), bx(44.5, 2.4, 54.5, sx * 50, 18.8, 8));
    for (let k = 0; k < 7; k++) {
      const x = sx * (30 + k * 6.2);
      B.add(m.limeTrim, bx(1.3, 12, 1, x, 4.6, -19.4)); // pilasters
      if (k < 6) B.add(win, bx(2.6, 6.4, 0.4, x + sx * 3.1, 7.6, -19.2));
    }
    // a low pyramidal skylight on each wing
    B.add(mat(0x8f9da3, { roughness: 0.3, metalness: 0.5 }), place(new THREE.ConeGeometry(18, 4, 4).rotateY(Math.PI / 4).scale(1.1, 1, 1.3).translate(0, 2, 0), sx * 50, 21.2, 8));
  }
  // the 2013 east building (David Chipperfield): low, dark polished concrete
  B.add(mat(0x3d3f42, { roughness: 0.35, metalness: 0.1 }), bx(46, 9, 70, 98, 1.6, 30));
  // the steps down to the statue
  for (let k = 0; k < 10; k++) B.add(m.granite, bx(36 - k * 0.4, 0.4, 1.2, 0, 3.6 - (k + 1) * 0.42, -33 - k * 1.2));
  return B;
}

// ── the Apotheosis of St. Louis: Louis IX on horseback, sword raised hilt-up ──
function apotheosis(m) {
  const B = new Batch();
  const bronze = new THREE.MeshStandardMaterial({ color: 0x4a3a26, metalness: 0.85, roughness: 0.42 });
  B.add(m.granite, bx(5.4, 1, 9, 0, 0, 0), bx(4.2, 6.2, 7.6, 0, 1, 0), bx(4.8, 0.6, 8.2, 0, 7.2, 0));
  const y0 = 7.8;
  const cap = (r, l, x, y, z, rx = 0, rz = 0) => place(new THREE.CapsuleGeometry(r, l, 6, 14), x, y, z, 0, 1, 1, 1, rx, rz);
  // the horse (head to the north, -z), in a walk
  B.add(bronze, cap(0.85, 2.6, 0, y0 + 2.2, 0, Math.PI / 2)); // barrel
  B.add(bronze, cap(0.42, 1.5, 0, y0 + 3.3, -2.2, -0.75)); // neck
  B.add(bronze, cap(0.3, 0.9, 0, y0 + 3.7, -3.0, -1.35)); // head
  B.add(bronze, place(new THREE.ConeGeometry(0.12, 0.3, 6), -0.15, y0 + 4.2, -2.75), place(new THREE.ConeGeometry(0.12, 0.3, 6), 0.15, y0 + 4.2, -2.75)); // ears
  for (const [x, z, rx] of [[-0.45, -1.3, -0.25], [0.45, -1.1, 0.15], [-0.45, 1.3, 0.12], [0.45, 1.4, -0.2]]) B.add(bronze, cap(0.2, 1.7, x, y0 + 0.95, z, rx));
  B.add(bronze, cap(0.16, 1.2, 0, y0 + 2.2, 2.3, 0.9)); // tail
  // the king: cloak, crown, and the sword held up by the blade as a cross
  B.add(bronze, cap(0.42, 1.0, 0, y0 + 3.9, 0.1)); // torso
  B.add(bronze, place(new THREE.ConeGeometry(0.85, 1.9, 14).translate(0, -0.95, 0), 0, y0 + 4.2, 0.35)); // cloak
  B.add(bronze, place(new THREE.SphereGeometry(0.27, 14, 10), 0, y0 + 4.95, 0.05));
  B.add(bronze, cy(0.26, 0.24, 0.22, 0, y0 + 5.15, 0.05, 12)); // crown
  B.add(bronze, rod(V(0.4, y0 + 4.2, -0.1), V(0.55, y0 + 5.4, -0.55), 0.09, 8)); // raised arm
  B.add(bronze, rod(V(0.55, y0 + 4.6, -0.55), V(0.55, y0 + 6.6, -0.55), 0.05, 6)); // blade
  B.add(bronze, bx(0.7, 0.08, 0.08, 0.55, y0 + 6.1, -0.55)); // crossguard
  for (const s of [-1, 1]) B.add(bronze, cap(0.15, 1.1, s * 0.55, y0 + 3.0, 0, 0, s * 0.35)); // legs astride
  return B;
}

// ── Missouri History Museum: Jefferson Memorial Building (loggia to +z, south) ──
function historyMuseum(m) {
  const B = new Batch();
  B.add(m.granite, bx(110, 1.4, 60, 0, -1, 0));
  for (const sx of [-1, 1]) {
    B.add(m.lime, bx(34, 15, 40, sx * 33, 0.4, 0));
    B.add(m.limeTrim, bx(35, 1.2, 41, sx * 33, 15.4, 0), bx(34.5, 2.2, 40.5, sx * 33, 16.6, 0));
    const win = lit(0x2f3a42, 0xffd8a0, { night: 0.7, roughness: 0.2 });
    for (let k = 0; k < 4; k++) B.add(win, bx(2.4, 5.5, 0.4, sx * (20 + k * 8), 5, 20.1));
  }
  // the loggia: a colonnade of Ionic columns between the wings, under one entablature
  B.add(m.lime, bx(32, 1.6, 22, 0, 0.4, 6));
  const col = column(0.7, 11.5);
  for (let k = 0; k < 6; k++) B.add(m.lime, at(col, -12.5 + k * 5, 2, 15));
  B.add(m.limeTrim, bx(32, 2.4, 4, 0, 13.5, 15), bx(32.5, 2.6, 22, 0, 15.9, 6));
  B.add(m.lime, bx(30, 11.5, 1, 0, 2, 2)); // the back wall of the loggia
  // the Emerson Center addition behind (2000): limestone and a glass atrium
  B.add(m.lime, bx(70, 12, 30, 0, 0.4, -36));
  B.add(new THREE.MeshStandardMaterial({ color: 0x9fb3bd, roughness: 0.08, metalness: 0.6 }), bx(24, 13, 12, 0, 0.4, -18));
  return B;
}

// ── the World's Fair Pavilion: an open arcade under a red tile roof ──
function pavilion(m) {
  const B = new Batch();
  const W = 54, D = 34;
  B.add(m.granite, bx(W + 6, 1.2, D + 6, 0, -0.6, 0));
  B.add(m.plaster, bx(W + 4, 0.3, D + 4, 0, 0.6, 0));
  const arch = archFrame(4.2, 6.2, 1.1, 0.9);
  for (let x = -W / 2 + 3; x <= W / 2 - 3; x += 6) for (const z of [-D / 2, D / 2]) B.add(m.plaster, at(arch, x, 0.9, z));
  for (let z = -D / 2 + 3; z <= D / 2 - 3; z += 6) for (const x of [-W / 2, W / 2]) B.add(m.plaster, at(arch, x, 0.9, z, Math.PI / 2));
  B.add(m.plaster, bx(W + 1.5, 1.4, D + 1.5, 0, 8, 0)); // the frieze over the arcade
  // hipped tile roof, and the raised clerestory over the middle
  B.add(m.tile, place(new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4).scale((W + 4) * 0.72, 7, (D + 4) * 0.72).translate(0, 3.5, 0), 0, 9.4, 0));
  B.add(m.plaster, bx(20, 4, 10, 0, 13.4, 0));
  B.add(m.tile, place(new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4).scale(16, 3.5, 9).translate(0, 1.75, 0), 0, 17.4, 0));
  // the fountain terrace below it to the south
  B.add(m.granite, place(new THREE.CylinderGeometry(9, 9.4, 1, 40).translate(0, 0.5, 0), 0, -1.5, D / 2 + 18));
  B.add(new THREE.MeshStandardMaterial({ color: 0x3f6f7a, roughness: 0.05, metalness: 0.3 }), place(new THREE.CylinderGeometry(8.2, 8.2, 0.1, 40), 0, -0.45, D / 2 + 18));
  return B;
}

// ── the Jewel Box: stepped walls of glass on a steel frame (long axis north-south) ──
function jewelBox(m) {
  const B = new Batch();
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe0e4, roughness: 0.04, metalness: 0.55, transparent: true, opacity: 0.55, emissive: 0xffe6b0, emissiveIntensity: 0 });
  glass.userData.night = 0.8;
  const tiers = [[17, 4.5, 44], [14, 3.6, 38], [11, 3.2, 31], [8, 3, 23], [5, 2.6, 15]];
  let y = 0.6;
  B.add(m.granite, bx(20, 0.8, 48, 0, -0.2, 0));
  for (const [w, h, d] of tiers) {
    B.add(glass, bx(w, h, d, 0, y, 0));
    // mullions every 1.3 m, transoms top and bottom
    for (let z = -d / 2; z <= d / 2 + 0.01; z += 1.3) for (const sx of [-1, 1]) B.add(m.steel, bx(0.12, h, 0.18, sx * w / 2, y, z));
    for (let x = -w / 2; x <= w / 2 + 0.01; x += 1.3) for (const sz of [-1, 1]) B.add(m.steel, bx(0.18, h, 0.12, x, y, sz * d / 2));
    B.add(m.steel, bx(w + 0.4, 0.35, d + 0.4, 0, y + h - 0.2, 0));
    y += h;
  }
  return { B, glass };
}

// ── McDonnell Planetarium: a thin concrete hyperboloid ──
function planetarium(m) {
  const B = new Batch();
  // the shell's profile: a wide skirt, a waist high up, a slight lip
  const pts = new THREE.SplineCurve([[30, 0], [24, 4], [19.5, 9], [16.6, 14], [15.6, 19], [16.4, 23], [18.2, 26]].map(([r, y]) => new THREE.Vector2(r, y))).getPoints(28);
  B.add(m.conc, new THREE.LatheGeometry(pts, 48));
  B.add(m.conc, place(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p.x - 0.5, p.y)).reverse(), 48), 0, 0, 0));
  B.add(m.conc, place(new THREE.SphereGeometry(5.5, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 26, 0)); // the observatory dome
  B.add(m.conc, cy(5.6, 5.6, 1.5, 0, 25, 0, 24));
  B.add(mat(0x2c3338, { roughness: 0.2, metalness: 0.4 }), cy(27, 27, 4, 0, 0, 0, 48)); // the glazed ground floor
  return B;
}

// ── The Muny: stage house to the north, its fan of seats to the south ──
function muny(m) {
  const B = new Batch();
  B.add(m.conc, bx(56, 24, 22, 0, 0, -48)); // stage house
  B.add(m.limeTrim, bx(40, 1.6, 1, 0, 14, -36.8)); // proscenium head
  B.add(mat(0x1d2024, { roughness: 0.9 }), bx(38, 13.5, 0.5, 0, 0.6, -36.9)); // the stage opening
  // the stepped bank of 11,000 green seats, row on row (concrete risers, seat-green treads)
  const seatM = pbr('metal_plate', { scale: 1.2, metal: 0.1, tint: 0x5e9a74, rough: 0.7 });
  for (let row = 0; row < 46; row += 2) {
    const r = 18 + (row + 2) * 1.6;
    B.add(seatM, place(new THREE.CylinderGeometry(r, r, 0.84, 40, 1, false, -1.15 + Math.PI / 2, 2.3).translate(0, 0.42, 0), 0, row * 0.42, -38));
    B.add(m.conc, place(new THREE.CylinderGeometry(r + 0.3, r + 0.3, 0.3, 40, 1, true, -1.15 + Math.PI / 2, 2.3).translate(0, 0.84, 0), 0, row * 0.42, -38));
  }
  return { B, seats: new THREE.Group() };
}

// ── the Flight Cage: a 69 x 25 m mesh vault on steel ribs (long axis east-west) ──
export function flightCage(m) {
  const B = new Batch();
  const meshTex = canvasTex(64, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.strokeStyle = 'rgba(40,44,46,0.95)'; c.lineWidth = 2; for (let i = 0; i <= w; i += 8) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, h); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(w, i); c.stroke(); } }, [60, 18]);
  const net = new THREE.MeshStandardMaterial({ map: meshTex, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, roughness: 0.7, metalness: 0.4 });
  const L = 69, R = 12.5, H = 15;
  const vault = new THREE.CylinderGeometry(R, R, L, 32, 1, true, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).scale(1, H / R, 1);
  B.add(net, vault);
  B.add(net, place(new THREE.CircleGeometry(R, 24, 0, Math.PI).scale(1, H / R, 1), -L / 2, 0, 0, Math.PI / 2), place(new THREE.CircleGeometry(R, 24, 0, Math.PI).scale(1, H / R, 1), L / 2, 0, 0, -Math.PI / 2));
  for (let x = -L / 2; x <= L / 2 + 0.01; x += L / 12) B.add(m.steel, place(new THREE.TorusGeometry(R, 0.18, 6, 28, Math.PI).scale(1, H / R, 1), x, 0, 0, Math.PI / 2));
  B.add(m.steel, span(V(-L / 2, H, 0), V(L / 2, H, 0), 0.3, 0.3));
  return B;
}

// ── the Boathouse on Post-Dispatch Lake ──
function boathouse(m) {
  const B = new Batch();
  B.add(m.brick, bx(32, 4, 14, 0, 0, 0));
  B.add(m.plaster, bx(32, 3.4, 14, 0, 4, 0));
  for (let x = -15; x <= 15; x += 2.5) B.add(mat(0x3b2a1e, { roughness: 0.8 }), bx(0.25, 3.4, 14.2, x, 4, 0)); // half-timbering
  const s = new THREE.Shape(); s.moveTo(-8.5, 0); s.lineTo(0, 6.5); s.lineTo(8.5, 0); s.closePath();
  B.add(m.slate, new THREE.ExtrudeGeometry(s, { depth: 34, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-17, 7.4, 0));
  B.add(pbr('brushed_concrete', { scale: 3 }), bx(36, 0.5, 8, 0, -0.6, 10)); // the landing
  return B;
}

export default function build() {
  const group = new THREE.Group();
  const glow = [];
  const live = { jets: [], seats: null };
  const update = (t) => {
    for (const j of live.jets) { const k = 0.9 + 0.1 * Math.sin(t * 3 + j.userData.ph); j.scale.set(1, k, 1); }
  };
  const res = {
    group, glow, update, trees: [],
    fit(holder, T, opts = {}) {
      if (!opts.course) return;
      holder.updateMatrix();
      const L = holder.matrix.clone(), w = new THREE.Vector3();
      const toW = (x, z) => w.set(x, 0, z).applyMatrix4(L);
      const gy = (x, z) => { toW(x, z); return (T.baseGround(w.x, w.z) - holder.position.y) / holder.scale.y; };
      const inPlay = (x, z) => { toW(x, z); const pr = T.project(w.x, w.z); return Math.abs(pr.d) < T.oobLateral + 6 && pr.s > -40 && pr.s < T.length + 60; };
      const go = (D) => lay(D, gy, inPlay);
      if (DATA) go(DATA); else ready.then((d) => d && go(d));
    },
  };

  function lay(D, gy, inPlay) {
    const m = M();
    glow.push(m.lime);
    const put = (B, x, z, ry = 0, dy = 0) => {
      const g = new THREE.Group();
      B.build(g);
      g.position.set(x, gy(x, z) + dy, z);
      g.rotation.y = ry;
      // landmarks stand off the field of play: they take shadows, they don't cast them
      g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      group.add(g);
      return g;
    };
    // the museum's front is north (-z) and the statue below it, on Art Hill
    const am = new THREE.Group();
    put(artMuseum(m, am), -600, -60);
    am.position.set(-600, gy(-600, -60), -60);
    group.add(am);
    put(apotheosis(m), -575, -144, 0, -0.5);
    put(historyMuseum(m), 147, -741, Math.PI); // loggia to the south, facing the park
    put(pavilion(m), 168, 219);
    { const { B, glass } = jewelBox(m); glow.push(glass); put(B, 628, 365); }
    put(planetarium(m), 1444, 807);
    { const { B, seats } = muny(m); const g = put(B, 762, -134); g.add(seats); }
    put(flightCage(m), 1, 329);
    put(boathouse(m), 218, -179, 0.3);

    // the lakes and basins: water at the level of their own shores
    const ripple = canvasTex(256, 256, (g, wd, h) => {
      const img = g.createImageData(wd, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < wd; x++) {
        const a = (x / wd) * Math.PI * 2, b = (y / h) * Math.PI * 2;
        const dx = Math.cos(a * 3 + Math.sin(b * 2)) * 0.5 + Math.cos(a * 7 + b * 2) * 0.25, dy = Math.cos(b * 5 + Math.sin(a * 3)) * 0.5 + Math.cos(b * 11 - a * 4) * 0.2;
        const k = (y * wd + x) * 4; img.data[k] = 128 + dx * 60; img.data[k + 1] = 128 + dy * 60; img.data[k + 2] = 255; img.data[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    });
    ripple.colorSpace = THREE.NoColorSpace; ripple.wrapS = ripple.wrapT = THREE.RepeatWrapping;
    const water = (_lakeWater ||= createWaterMaterial({ tint: 0x3a5048, flow: 0.1 })); // the shared water: sky reflections, sun glint, ripples
    const coping = m.granite;
    const shoreRings = [];
    for (const lake of D.lakes || []) {
      let p = lake.p;
      if (p.length > 2 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p = p.slice(0, -1);
      if (p.length < 3) continue;
      const shore = Math.min(...p.map(([x, z]) => gy(x, z)));
      if (!/Grand Basin|Fountain/.test(lake.n)) shoreRings.push({ pts: p, level: shore - 0.25 });
      const tris = THREE.ShapeUtils.triangulateShape(p.map(([x, z]) => new THREE.Vector2(x, z)), []);
      const pos = [], uv = [];
      for (const t of tris) {
        // wind each triangle to face up
        const [i0, i1, i2] = t, ny = (p[i1][1] - p[i0][1]) * (p[i2][0] - p[i0][0]) - (p[i1][0] - p[i0][0]) * (p[i2][1] - p[i0][1]);
        for (const k of ny >= 0 ? [i0, i1, i2] : [i0, i2, i1]) { pos.push(p[k][0], shore - 0.25, p[k][1]); uv.push(p[k][0] / 14, p[k][1] / 14); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      const wm = new THREE.Mesh(geo, water);
      wm.receiveShadow = true;
      group.add(wm);
      // the Grand Basin and the fountains: a stone kerb and a line of jets
      if (/Grand Basin|Fountain/.test(lake.n)) {
        const K = new Batch();
        for (let i = 0; i < p.length; i++) {
          const a = p[i], b = p[(i + 1) % p.length];
          K.add(coping, span(V(a[0], shore + 0.35, a[1]), V(b[0], shore + 0.35, b[1]), 1.1, 0.9));
        }
        K.build(group);
        if (/Grand Basin/.test(lake.n)) {
          const jetM = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.38, roughness: 0.3, depthWrite: false, side: THREE.DoubleSide });
          const cx = p.reduce((s, q) => s + q[0], 0) / p.length;
          const zs = p.map((q) => q[1]), z0 = Math.min(...zs), z1 = Math.max(...zs);
          for (let k = 0; k < 9; k++) {
            const z = z0 + ((k + 1) / 10) * (z1 - z0);
            // a slim column of spray, widening as it falls back
            const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.18, 6, 12, 1, true).translate(0, 3, 0), jetM);
            jet.position.set(cx, shore - 0.2, z);
            jet.userData.ph = k;
            group.add(jet);
            live.jets.push(jet);
          }
        }
      }
    }
    // reeds, cattails and lily pads round the natural lakes (the hole's own pond grows its own)
    group.add(shoreLife(shoreRings, { skip: inPlay, budget: 700 }));
    // the park's drives and paths (lots too), kept off the field of play
    for (const mesh of pavingMeshes(D, gy, inPlay, { paths: false })) group.add(mesh);
  }
  return res;
}
