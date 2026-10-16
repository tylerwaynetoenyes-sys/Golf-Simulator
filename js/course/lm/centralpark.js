// Central Park, Manhattan: the park's landmarks at their mapped places, laid
// on the course's own ground (fit), in the course's DEM axes (+x east,
// +z south) from 40.7812°N 73.9665°W. Positions, lakes and paths from
// OpenStreetMap (assets/landmarks/centralpark); surfaces are photographed PBR
// sets (js/scene/pbr.js). From published descriptions:
//   Bethesda Terrace (Vaux and Mould, 1860s): a two-level terrace of Nova
//     Scotia sandstone; the upper terrace on the Mall's axis, a balustrade
//     over the arcade, and wide stairs down to the fountain plaza on The Lake
//   Angel of the Waters (Emma Stebbins, 1873): a winged bronze angel on a
//     column over two tiers of basins, her right hand raised in blessing,
//     water falling from the upper basin into a wide round pool
//   Bow Bridge (1862): a shallow cast-iron arch over The Lake, cream
//     painted, its railing a run of interlaced circles, with planter urns
//   Belvedere Castle (1869): a small Victorian folly in grey Manhattan schist
//     on Vista Rock, a crenellated square tower and an open pavilion
//   Cleopatra's Needle: a red granite obelisk of Thutmose III, 21 m, raised
//     behind the Metropolitan Museum in 1881
//   the Reservoir's iron fence and running track, the park's benches and
//     its Henry Bacon lamp posts, and rowboats on The Lake
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, lit, canvasTex, boulderGeometry } from './kit.js';
import { pbr, painted } from '../../scene/pbr.js';
import { createWaterMaterial } from '../../scene/river.js';
import { shoreLife } from '../../scene/shore.js';
let _lakeWater = null; // one water for every hole's lakes
import { place, bx, cy, rod, span, Batch, pavingMeshes } from './riverfront.js';
import { crowdAt } from '../../scene/crowd.js';
import { cull } from '../../scene/instanceCull.js';

const BASE = new URL('../../../assets/landmarks/centralpark/', import.meta.url).href;
let DATA = null;
const ready = fetch(`${BASE}ground.json`).then((r) => (r.ok ? r.json() : null)).then((j) => (DATA = j)).catch(() => null);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// the park's long axis: Manhattan's grid runs 29° east of true north
const UP = [Math.sin(0.506), -Math.cos(0.506)];
const RY_UP = -0.506; // a group turned so its -z points uptown

const M = () => ({
  sand: pbr('sandstone_blocks_08', { scale: 2.2, tint: 0xf0d9bc, glow: 0xffd9a8, night: 0.3 }),
  sandTrim: pbr('white_sandstone_bricks', { scale: 2.2, tint: 0xf2e2c8 }),
  schist: pbr('gray_rocks', { scale: 1.6, tint: 0x9a9c98 }), // grey Manhattan schist, rough-laid
  granite: pbr('white_sandstone_bricks', { scale: 2, tint: 0xc9c6bf }),
  rock: pbr('gray_rocks', { scale: 2.4, tint: 0x8e918c }),
  // weathered Aswan granite: pink-grey, finely speckled, streaked by a century of New York weather
  redGranite: new THREE.MeshStandardMaterial({ roughness: 0.82, map: canvasTex(256, 512, (c, w, h) => {
    c.fillStyle = '#a58c80'; c.fillRect(0, 0, w, h);
    let q = 9; const r = () => ((q = (q * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 9000; i++) { const v = r(); c.fillStyle = v < 0.45 ? 'rgba(60,45,42,0.35)' : v < 0.8 ? 'rgba(220,200,190,0.35)' : 'rgba(150,90,80,0.4)'; c.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    for (let i = 0; i < 40; i++) { const x = r() * w, gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(70,60,58,0)'); gr.addColorStop(1, 'rgba(70,60,58,0.22)'); c.fillStyle = gr; c.fillRect(x, 0, 2 + r() * 6, h); }
  }) }),
  paving: pbr('cobblestone_floor_08', { scale: 3, tint: 0xd4c4ac, offset: -2 }),
  slate: pbr('roof_slates_02', { scale: 2 }),
  iron: pbr('painted_steel', { scale: 1.5, tint: 0xf1e8d2, metal: 0.2, rough: 0.6 }),
  darkIron: pbr('painted_steel', { scale: 1.5, tint: 0x2f3a33, metal: 0.4, rough: 0.55 }),
  wood: pbr('brown_planks_08', { scale: 1.2 }),
});
const bronze = () => painted(0x3f4a3a, { metalness: 0.8, roughness: 0.45 });

/** Point-in-polygon and the centroid of a polygon [[x, z], ...]. */
function inside(p, x, z) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const centroid = (p) => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
const open = (p) => (p.length > 2 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1] ? p.slice(0, -1) : p);
function edgeDist(p, x, z) {
  let m = Infinity;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [ax, az] = p[j], [bx2, bz] = p[i], dx = bx2 - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0;
    m = Math.min(m, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return m;
}

/** A round-headed arch opening cut through a wall slab (w wide, h to the crown). */
function archWall(W, H, depth, w, h, xs) {
  const s = new THREE.Shape();
  s.moveTo(-W / 2, 0); s.lineTo(W / 2, 0); s.lineTo(W / 2, H); s.lineTo(-W / 2, H); s.closePath();
  for (const x of xs) {
    const a = new THREE.Path();
    a.moveTo(x - w / 2, 0); a.lineTo(x - w / 2, h - w / 2); a.absarc(x, h - w / 2, w / 2, Math.PI, 0, true); a.lineTo(x + w / 2, 0); a.closePath();
    s.holes.push(a);
  }
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 14 }).translate(0, 0, -depth / 2);
}

/** A stone balustrade from P to Q: plinth, turned balusters, handrail. */
function balustrade(B, m, P, Q, h = 1.05) {
  B.add(m.sandTrim, span(V(P.x, P.y + 0.18, P.z), V(Q.x, Q.y + 0.18, Q.z), 0.5, 0.18));
  B.add(m.sandTrim, span(V(P.x, P.y + h, P.z), V(Q.x, Q.y + h, Q.z), 0.42, 0.14));
  const L = P.distanceTo(Q), n = Math.max(2, Math.round(L / 0.42));
  const bal = new THREE.LatheGeometry([[0.07, 0], [0.12, 0.08], [0.07, 0.2], [0.13, 0.42], [0.06, 0.66], [0.09, 0.72], [0.1, 0.74]].map(([r, y]) => new THREE.Vector2(r, y)), 8);
  for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; B.add(m.sandTrim, place(bal.clone(), P.x + (Q.x - P.x) * t, P.y + (Q.y - P.y) * t + 0.18, P.z + (Q.z - P.z) * t)); }
}

// ── the Angel of the Waters, over Bethesda Fountain ──
function fountain(m, br) {
  const B = new Batch();
  // the column and its two basins, the upper one carried on four cherubs (here a fluted drum)
  B.add(m.sandTrim, cy(2.6, 3, 0.9, 0, 0, 0, 32));
  B.add(m.sandTrim, cy(1.4, 1.7, 1.6, 0, 0.9, 0, 24));
  B.add(m.sandTrim, place(new THREE.LatheGeometry([[0.6, 0], [3.4, 0.5], [4.6, 0.95], [4.6, 1.2], [4.3, 1.2], [3.2, 0.85]].map(([r, y]) => new THREE.Vector2(r, y)), 40), 0, 2.4, 0));
  B.add(br, cy(0.75, 0.9, 1.7, 0, 3.4, 0, 16));
  B.add(br, place(new THREE.LatheGeometry([[0.3, 0], [1.7, 0.35], [2.4, 0.7], [2.4, 0.85], [2.2, 0.85], [1.6, 0.55]].map(([r, y]) => new THREE.Vector2(r, y)), 32), 0, 5.0, 0));
  B.add(br, cy(0.45, 0.55, 1.1, 0, 5.8, 0, 12));
  // the angel: robed figure, wings swept up and back, right arm raised (she faces north, down the lake)
  const y0 = 6.9;
  B.add(br, place(new THREE.LatheGeometry([[0.62, 0], [0.55, 0.4], [0.42, 1.1], [0.3, 1.6], [0.36, 1.85], [0.2, 2.0]].map(([r, y]) => new THREE.Vector2(r, y)), 18), 0, y0, 0));
  B.add(br, place(new THREE.SphereGeometry(0.19, 14, 10), 0, y0 + 2.18, -0.03));
  B.add(br, rod(V(0.28, y0 + 1.8, 0), V(0.5, y0 + 2.75, -0.3), 0.07, 6));
  B.add(br, rod(V(-0.28, y0 + 1.8, 0), V(-0.42, y0 + 1.2, -0.25), 0.07, 6)); // the lily in her left hand
  const wing = new THREE.Shape();
  wing.moveTo(0, 0); wing.bezierCurveTo(0.6, 0.6, 1.0, 1.6, 0.85, 2.5); wing.bezierCurveTo(0.5, 2.0, 0.3, 1.0, 0, 0.6); wing.closePath();
  const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.08, bevelEnabled: false, curveSegments: 10 });
  for (const s of [-1, 1]) B.add(br, place(wg.clone().scale(s, 1, 1), s * 0.14, y0 + 1.3, 0.22, s * 0.35, 1, 1, 1, -0.25));
  return B;
}

// ── Bethesda Terrace: the upper terrace wall, its arcade and the grand stairs ──
function terrace(m, rise) {
  const B = new Batch();
  const W = 64, H = Math.max(3, rise);
  // the arcade front facing the fountain (local -z), three arches in the middle
  B.add(m.sand, place(archWall(W, H, 2.4, 4.4, Math.min(H - 0.8, 5), [-6, 0, 6]), 0, 0, 0));
  B.add(mat(0x2a2522, { roughness: 0.9 }), bx(18, Math.min(H - 0.8, 5), 0.3, 0, 0, 1.4)); // the shadowed arcade within
  B.add(m.sandTrim, bx(W + 0.6, 0.45, 2.9, 0, H, 0));
  balustrade(B, m, V(-W / 2, H + 0.45, -1), V(-9, H + 0.45, -1));
  balustrade(B, m, V(9, H + 0.45, -1), V(W / 2, H + 0.45, -1));
  // the grand stairs down either side of the arcade, toward the fountain
  for (const sx of [-1, 1]) {
    const n = Math.round(H / 0.17);
    for (let k = 0; k < n; k++) {
      const y = H - (k + 1) * 0.17;
      B.add(m.sandTrim, bx(9, 0.17, 0.36, sx * 13.5, y, -1.2 - k * 0.36 - 0.18));
    }
    B.add(m.sand, place(new THREE.BoxGeometry(1, 1, n * 0.36).translate(0, 0.5, -n * 0.18), sx * 8.5, 0, -1.2, 0, 1, H + 0.9, 1));
    B.add(m.sand, place(new THREE.BoxGeometry(1, 1, n * 0.36).translate(0, 0.5, -n * 0.18), sx * 18.5, 0, -1.2, 0, 1, H + 0.9, 1));
  }
  // the upper terrace's paving behind the balustrade
  B.add(m.paving, bx(W, 0.2, 14, 0, H + 0.25, 8));
  return B;
}

// ── Bow Bridge, a cast-iron arch from A to B ──
function bowBridge(m, A, Bp, deckAt, ground) {
  const B = new Batch();
  const rail = canvasTex(256, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.strokeStyle = '#f2ead6'; c.lineWidth = 5;
    c.strokeRect(2, 2, w - 4, h - 4);
    for (let x = 32; x < w; x += 64) { c.beginPath(); c.arc(x, h / 2, 26, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(x + 32, h / 2, 26, 0, Math.PI * 2); c.stroke(); }
  });
  const railM = new THREE.MeshStandardMaterial({ map: rail, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.2 });
  const dx = Bp[0] - A[0], dz = Bp[1] - A[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
  const N = 24, half = 2.6;
  const P = (t, o, dy = 0) => V(A[0] + dx * t + nx * o, deckAt(t) + dy, A[1] + dz * t + nz * o);
  for (let k = 0; k < N; k++) {
    const t0 = k / N, t1 = (k + 1) / N;
    B.add(m.wood, span(P(t0, 0), P(t1, 0), half * 2, 0.18));
    B.add(m.iron, span(P(t0, 0, -0.18), P(t1, 0, -0.18), half * 2 + 0.3, 0.4)); // the iron fascia
    for (const s of [-1, 1]) {
      const a = P(t0, s * half), b = P(t1, s * half);
      const g = new THREE.PlaneGeometry(a.distanceTo(b), 0.95);
      const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), b.clone().sub(a).normalize());
      g.applyQuaternion(q).translate((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.5, (a.z + b.z) / 2);
      B.add(railM, g);
      B.add(m.iron, span(V(a.x, a.y + 1.02, a.z), V(b.x, b.y + 1.02, b.z), 0.16, 0.08));
    }
  }
  // the bow: the arched girders under each edge, in the shallow curve the bridge is named for
  for (const s of [-1, 1]) for (let k = 0; k < N; k++) {
    const t0 = k / N, t1 = (k + 1) / N, sag = (t) => -0.9 - 1.1 * (1 - Math.sin(Math.PI * t));
    B.add(m.iron, span(P(t0, s * (half + 0.1), sag(t0)), P(t1, s * (half + 0.1), sag(t1)), 0.3, 0.5));
  }
  // planter urns at the ends and the crown, and stone abutments
  const urn = new THREE.LatheGeometry([[0.12, 0], [0.3, 0.1], [0.18, 0.35], [0.42, 0.75], [0.48, 0.85]].map(([r, y]) => new THREE.Vector2(r, y)), 16);
  for (const t of [0.02, 0.5, 0.98]) for (const s of [-1, 1]) { const p = P(t, s * half, 1.05); B.add(m.iron, place(urn.clone(), p.x, p.y, p.z)); }
  // the stone abutments the arch springs from, down into the banks
  for (const [ta, tb] of [[0, 0.16], [0.84, 1]]) {
    const pa = P(ta, 0), pb = P(tb, 0), mid = P((ta + tb) / 2, 0), len = pa.distanceTo(pb) + 0.4;
    const base = Math.min(ground(A[0] + dx * ta, A[1] + dz * ta), ground(A[0] + dx * tb, A[1] + dz * tb)) - 1.5;
    const hgt = Math.max(1, Math.min(pa.y, pb.y) - 0.5 - base);
    B.add(m.granite, place(new THREE.BoxGeometry(len * 0.8, hgt, half * 2 + 0.8).translate(0, hgt / 2, 0), mid.x, base, mid.z, -Math.atan2(dz, dx)));
  }
  return B;
}

// ── Belvedere Castle on Vista Rock (front to local -z) ──
function castle(m) {
  const B = new Batch();
  const merlons = (w, d, y, step = 1.1) => {
    for (let x = -w / 2 + 0.3; x <= w / 2 - 0.3; x += step) { B.add(m.schist, bx(0.6, 0.8, 0.5, x, y, -d / 2 + 0.25), bx(0.6, 0.8, 0.5, x, y, d / 2 - 0.25)); }
    for (let z = -d / 2 + 0.3; z <= d / 2 - 0.3; z += step) { B.add(m.schist, bx(0.5, 0.8, 0.6, -w / 2 + 0.25, y, z), bx(0.5, 0.8, 0.6, w / 2 - 0.25, y, z)); }
  };
  // the main hall
  B.add(m.schist, bx(14, 7.5, 9, 0, 0, 0));
  B.add(m.granite, bx(14.4, 0.4, 9.4, 0, 7.5, 0));
  merlons(14.4, 9.4, 7.9);
  // the square tower at the east end, taller, with a slim corner turret
  B.add(m.schist, bx(5.6, 16.5, 5.6, 7.5, 0, -1.5));
  B.add(m.granite, bx(6, 0.4, 6, 7.5, 16.5, -1.5));
  for (const [x, z] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5], [0, -2.5], [0, 2.5], [-2.5, 0], [2.5, 0]]) B.add(m.schist, bx(0.8, 0.9, 0.8, 7.5 + x, 16.9, -1.5 + z));
  B.add(m.schist, cy(0.9, 0.9, 19.5, 10.2, 0, -4.2, 14));
  B.add(m.granite, cy(1.05, 1.05, 0.35, 10.2, 19.5, -4.2, 14));
  B.add(m.slate, place(new THREE.ConeGeometry(1.15, 3, 14).translate(0, 1.5, 0), 10.2, 19.85, -4.2));
  B.add(m.darkIron, cy(0.03, 0.03, 2.5, 7.5, 17.3, -1.5, 4)); // the weather station's mast
  // the open pavilion at the west end: posts under a pointed slate roof
  for (const [x, z] of [[-11, -3], [-11, 3], [-7.5, -3], [-7.5, 3]]) B.add(m.darkIron, cy(0.14, 0.14, 4, x, 0, z, 8));
  B.add(pbr('roof_slates_02', { scale: 2, tint: 0x6a7076 }), place(new THREE.ConeGeometry(4.8, 3.2, 4).rotateY(Math.PI / 4).scale(0.85, 1, 1.25).translate(0, 1.6, 0), -9.25, 4, 0));
  // pointed windows, dark, lit at night
  const win = lit(0x23282a, 0xffcf8a, { night: 0.7, roughness: 0.3 });
  for (const x of [-4, 0, 4]) B.add(win, bx(1.1, 2.4, 0.2, x, 3, -4.55));
  B.add(win, bx(1, 2.2, 0.2, 7.5, 9, -4.35));
  // the rock it stands on, round its foot
  return B;
}

// ── Cleopatra's Needle ──
function needle(m) {
  const B = new Batch();
  for (let k = 0; k < 3; k++) B.add(m.granite, bx(7 - k * 1.4, 0.45, 7 - k * 1.4, 0, k * 0.45, 0));
  B.add(m.granite, bx(3.4, 2.2, 3.4, 0, 1.35, 0));
  const glyph = canvasTex(64, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(50,30,24,0.55)';
    let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let y = 6; y < h - 6; y += 9) for (let x = 20; x < 46; x += 9) if (r() < 0.7) c.fillRect(x + r() * 2, y, 3 + r() * 4, 2 + r() * 5);
  });
  const shaft = new THREE.CylinderGeometry(1.15, 1.65, 20.2, 4, 1).rotateY(Math.PI / 4).translate(0, 10.1 + 3.55, 0);
  B.add(m.redGranite, shaft);
  // the hieroglyphs, cut in a column down each face (worn away low down on the weather side)
  B.add(new THREE.MeshStandardMaterial({ map: glyph, transparent: true, alphaTest: 0.1, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }), new THREE.CylinderGeometry(1.16, 1.66, 20.2, 4, 1, true).rotateY(Math.PI / 4).translate(0, 10.1 + 3.55, 0));
  B.add(m.redGranite, place(new THREE.ConeGeometry(1.63, 1.6, 4).rotateY(Math.PI / 4).translate(0, 0.8, 0), 0, 23.75, 0));
  return B;
}

/** A Henry Bacon lamp post: fluted cast-iron post, a lantern on top. */
function lampGeo() {
  const post = mergeGeometries([
    new THREE.CylinderGeometry(0.16, 0.22, 0.6, 10).translate(0, 0.3, 0),
    new THREE.CylinderGeometry(0.06, 0.09, 3.1, 8).translate(0, 2.15, 0),
    new THREE.CylinderGeometry(0.16, 0.08, 0.2, 10).translate(0, 3.75, 0),
  ]);
  const glass = new THREE.SphereGeometry(0.22, 12, 8).scale(1, 1.3, 1).translate(0, 4.05, 0);
  return { post, glass };
}
/** A park bench: slatted seat and back on iron ends (faces +z). */
function benchGeo() {
  const wood = [];
  for (let k = 0; k < 3; k++) wood.push(new THREE.BoxGeometry(1.9, 0.04, 0.11).translate(0, 0.44, -0.05 + k * 0.14));
  for (let k = 0; k < 3; k++) wood.push(new THREE.BoxGeometry(1.9, 0.1, 0.03).rotateX(-0.2).translate(0, 0.6 + k * 0.13, -0.15 - k * 0.03));
  const iron = [];
  for (const x of [-0.85, 0.85]) iron.push(new THREE.BoxGeometry(0.06, 0.44, 0.45).translate(x, 0.22, 0.05), new THREE.BoxGeometry(0.06, 0.45, 0.06).rotateX(-0.2).translate(x, 0.68, -0.2));
  return { wood: mergeGeometries(wood), iron: mergeGeometries(iron) };
}
/** A rowboat (bow to +x), with its rower facing the stern. */
function rowboatGeo() {
  const hull = new THREE.BoxGeometry(4, 0.55, 1.35, 8, 2, 2);
  const p = hull.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), k = Math.max(0, (Math.abs(x) - 0.8) / 1.2);
    p.setZ(i, p.getZ(i) * (1 - 0.85 * k * k) * (y < 0 ? 0.75 : 1));
    if (y < 0) p.setY(i, y + 0.12 * k);
  }
  hull.computeVertexNormals();
  const rower = mergeGeometries([
    new THREE.CylinderGeometry(0.2, 0.24, 0.65, 10).translate(0, 0.6, 0),
    new THREE.SphereGeometry(0.13, 10, 8).translate(0, 1.05, 0),
  ]);
  const oars = mergeGeometries([new THREE.CylinderGeometry(0.03, 0.03, 3.4, 5).rotateX(Math.PI / 2).rotateY(0.25).translate(0.2, 0.55, 0)]);
  return { hull, rower, oars };
}

export default function build() {
  const group = new THREE.Group();
  const glow = [];
  const live = { boats: [], spray: [] };
  const update = (t) => {
    for (const b of live.boats) {
      const u = b.userData, a = u.a0 + t * u.w;
      b.position.set(u.cx + Math.cos(a) * u.r, u.y + Math.sin(t * 1.3 + u.ph) * 0.04, u.cz + Math.sin(a) * u.r);
      b.rotation.y = -a + (u.w > 0 ? 0 : Math.PI);
      b.rotation.z = Math.sin(t * 1.1 + u.ph) * 0.03;
    }
    for (const s of live.spray) { s.material.map.offset.y = -t * 1.6; s.material.opacity = 0.55 + 0.08 * Math.sin(t * 6 + s.userData.ph); }
  };
  const res = {
    group, glow, update, trees: [],
    fit(holder, T, opts = {}) {
      if (!opts.course) return;
      holder.updateMatrix();
      const L = holder.matrix.clone(), w = new THREE.Vector3();
      const toW = (x, z) => w.set(x, 0, z).applyMatrix4(L);
      const gy = (x, z) => { toW(x, z); return (T.baseGround(w.x, w.z) - holder.position.y) / holder.scale.y; };
      const onField = (x, z, pad = 0) => { toW(x, z); const pr = T.project(w.x, w.z); return Math.abs(pr.d) < Math.max(T.fwHalf || 0, 14) + 10 + pad && pr.s > -20 && pr.s < T.length + 30; };
      const inPlay = (x, z) => { toW(x, z); const pr = T.project(w.x, w.z); return Math.abs(pr.d) < T.oobLateral + 6 && pr.s > -40 && pr.s < T.length + 60; };
      const Li = L.clone().invert();
      const atHole = (s, d) => { const p = T.pointAt(s); w.set(p.x + p.rx * d, 0, p.z + p.rz * d).applyMatrix4(Li); return [w.x, w.z]; };
      // how far a point is from this hole, for what is worth dressing
      const near = (x, z, R) => { toW(x, z); const pr = T.project(w.x, w.z); return Math.abs(pr.d) < R && pr.s > -R && pr.s < T.length + R; };
      const go = (D) => lay(D, { gy, onField, inPlay, near, T, atHole });
      if (DATA) go(DATA); else ready.then((d) => d && go(d));
    },
  };

  function lay(D, H) {
    const { gy, onField, inPlay, near } = H;
    const m = M();
    glow.push(m.sand);
    let s = 11;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const put = (B, x, z, ry = 0, y = null) => {
      const g = new THREE.Group();
      B.build(g);
      g.position.set(x, y ?? gy(x, z), z);
      g.rotation.y = ry;
      g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      group.add(g);
      return g;
    };
    const lake = (re) => (D.lakes || []).find((l) => re.test(l.n));
    const shoreOf = (p) => Math.min(...p.map(([x, z]) => gy(x, z)));

    // ── the lakes: water at the level of their own shores ──
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
    const water = (_lakeWater ||= createWaterMaterial({ tint: 0x34483f, flow: 0.1 })); // the shared water: sky reflections, sun glint, ripples
    const levels = new Map();
    const shoreRings = [];
    for (const l of D.lakes || []) {
      const p = open(l.p);
      if (p.length < 3) continue;
      const shore = shoreOf(p);
      levels.set(l, shore - 0.25);
      if (!/Fountain|Conservatory|Reservoir/.test(l.n) && p.some(([x, z]) => near(x, z, 400))) shoreRings.push({ pts: p, level: shore - 0.25 });
      const tris = THREE.ShapeUtils.triangulateShape(p.map(([x, z]) => new THREE.Vector2(x, z)), []);
      const pos = [], uv = [];
      for (const [i0, i1, i2] of tris) {
        const ny = (p[i1][1] - p[i0][1]) * (p[i2][0] - p[i0][0]) - (p[i1][0] - p[i0][0]) * (p[i2][1] - p[i0][1]);
        for (const k of ny >= 0 ? [i0, i1, i2] : [i0, i2, i1]) { pos.push(p[k][0], shore - 0.25, p[k][1]); uv.push(p[k][0] / 14, p[k][1] / 14); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      const wm = new THREE.Mesh(geo, water);
      wm.receiveShadow = true;
      group.add(wm);
      // the fountains and Conservatory Water have stone kerbs
      if (/Fountain|Conservatory/.test(l.n)) {
        const K = new Batch();
        for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; K.add(m.granite, span(V(a[0], shore + 0.45, a[1]), V(b[0], shore + 0.45, b[1]), 0.8, 0.9)); }
        K.build(group);
      }
    }

    group.add(shoreLife(shoreRings, { skip: (x, z) => inPlay(x, z) || !near(x, z, 400), budget: 700 }));

    // ── Bethesda Fountain and Terrace ──
    const bf = lake(/Bethesda Fountain/);
    if (bf) {
      const p = open(bf.p), [fx, fz] = centroid(p), wy = levels.get(bf) ?? gy(fx, fz);
      const br = bronze();
      put(fountain(m, br), fx, fz, RY_UP, wy - 0.2);
      // the curtain of water falling from the upper basin
      const streaks = canvasTex(256, 128, (c, w, h) => {
        c.clearRect(0, 0, w, h);
        let q = 5; const r2 = () => ((q = (q * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 160; i++) {
          const x = r2() * w, a = 0.15 + r2() * 0.5, len = h * (0.5 + r2() * 0.5);
          const gr = c.createLinearGradient(0, 0, 0, len);
          gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = gr; c.fillRect(x, 0, 1 + r2() * 2, len);
        }
      }, [10, 1]);
      const sprayM = new THREE.MeshStandardMaterial({ map: streaks, color: 0xeef4f6, transparent: true, opacity: 0.32, roughness: 0.2, depthWrite: false, side: THREE.DoubleSide });
      for (const [r, y0, h] of [[2.4, 5.8, 2.3], [4.55, 3.55, 3.6]]) {
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.05, r + 0.5, h, 48, 1, true).translate(0, -h / 2, 0), sprayM.clone());
        sp.position.set(fx, wy - 0.2 + y0, fz);
        sp.userData.ph = r;
        group.add(sp); live.spray.push(sp);
      }
      // the plaza round the pool, and the terrace on the Mall's axis to the south
      const plazaY = gy(fx - UP[0] * 22, fz - UP[1] * 22);
      const tx = fx - UP[0] * 34, tz = fz - UP[1] * 34;
      const upper = gy(fx - UP[0] * 50, fz - UP[1] * 50);
      put(terrace(m, upper - plazaY), tx, tz, RY_UP, plazaY - 0.05);
      const plaza = new THREE.Mesh(new THREE.PlaneGeometry(66, 40).rotateX(-Math.PI / 2).translate(0, 0, 6), m.paving);
      plaza.position.set(fx, plazaY + 0.08, fz);
      plaza.rotation.y = RY_UP;
      plaza.receiveShadow = true;
      group.add(plaza);
    }

    // ── Bow Bridge over The Lake ──
    const bow = (D.roads || []).find((r) => r.n === 'Bow Bridge');
    if (bow) {
      const A = bow.p[0], Bq = bow.p[bow.p.length - 1];
      const dx = Bq[0] - A[0], dz = Bq[1] - A[1];
      // run out a little each way onto the banks
      const A2 = [A[0] - dx * 0.08, A[1] - dz * 0.08], B2 = [Bq[0] + dx * 0.08, Bq[1] + dz * 0.08];
      const ya = gy(...A2), yb = gy(...B2), the = lake(/^The Lake$/), wl = the ? levels.get(the) : Math.min(ya, yb) - 1;
      const deckAt = (t) => Math.max(ya + (yb - ya) * t, wl + 1.6) + 1.3 * Math.sin(Math.PI * t) + 0.25;
      put(bowBridge(m, A2, B2, deckAt, gy), 0, 0, 0, 0);
      // strollers on the bridge
      const spots = [];
      for (let k = 0; k < 9; k++) { const t = 0.15 + 0.7 * rnd(), o = (rnd() - 0.5) * 3.6; spots.push([A2[0] + (B2[0] - A2[0]) * t - dz / Math.hypot(dx, dz) * o, deckAt(t), A2[1] + (B2[1] - A2[1]) * t + dx / Math.hypot(dx, dz) * o, rnd() < 0.5 ? Math.atan2(-dz, dx) + Math.PI / 2 : rnd() * 6.28]); }
      const c = crowdAt(spots, rnd); if (c) group.add(c);
    }

    // ── Belvedere Castle, on the top of Vista Rock, front to Turtle Pond ──
    {
      const cx = -203, cz = 205;
      let top = -Infinity;
      for (let x = -9; x <= 9; x += 3) for (let z = -6; z <= 6; z += 3) top = Math.max(top, gy(cx + x, cz + z));
      // the castle's long side faces Turtle Pond to the south-east
      const tp = lake(/Turtle Pond/), [px, pz] = tp ? centroid(open(tp.p)) : [-120, 187];
      const ry = Math.atan2(cx - px, cz - pz);
      const g = put(castle(m), cx, cz, ry, top - 0.6);
      // Vista Rock: a schist outcrop under it, breaking out of the slope
      const rr = () => rnd();
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 + rr() * 0.3, R = 10 + rr() * 3, x = Math.cos(a) * R, z = Math.sin(a) * R * 0.75;
        const b = new THREE.Mesh(boulderGeometry(2.2 + rr() * 2, rr, { flat: 0.4 }), m.rock);
        const wx = cx + x * Math.cos(ry) + z * Math.sin(ry), wz = cz - x * Math.sin(ry) + z * Math.cos(ry);
        b.position.set(x, gy(wx, wz) - (top - 0.6) - 1.4 - rr() * 0.8, z); b.rotation.y = rr() * 6; b.receiveShadow = true;
        g.add(b);
      }
    }

    // ── Cleopatra's Needle behind the Met ──
    put(needle(m), 92, 172, RY_UP);

    // ── the Reservoir: its iron fence on the track's inner edge ──
    const resv = lake(/Reservoir/);
    if (resv) {
      const p = open(resv.p), [rcx, rcz] = centroid(p), shore = levels.get(resv) + 0.25;
      const posts = [];
      const F = new Batch();
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        // a few metres out from the water, on the bank
        const out = (q) => { const dx = q[0] - rcx, dz = q[1] - rcz, d = Math.hypot(dx, dz) || 1; return [q[0] + (dx / d) * 4, q[1] + (dz / d) * 4]; };
        const A = out(a), Bq = out(b);
        if (!near(A[0], A[1], 260) || inPlay(A[0], A[1])) continue;
        const ya = Math.max(gy(...A), shore), yb = Math.max(gy(...Bq), shore);
        F.add(m.darkIron, span(V(A[0], ya + 1.2, A[1]), V(Bq[0], yb + 1.2, Bq[1]), 0.05, 0.05), span(V(A[0], ya + 0.25, A[1]), V(Bq[0], yb + 0.25, Bq[1]), 0.05, 0.05));
        const L = Math.hypot(Bq[0] - A[0], Bq[1] - A[1]);
        for (let t = 0; t < L; t += 2.5) { const x = A[0] + ((Bq[0] - A[0]) * t) / L, z = A[1] + ((Bq[1] - A[1]) * t) / L; posts.push([x, ya + ((yb - ya) * t) / L, z]); }
      }
      F.build(group);
      if (posts.length) {
        const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 5).translate(0, 0.65, 0), m.darkIron, posts.length);
        posts.forEach(([x, y, z], i) => pm.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y, z)));
        cull(pm, 6); group.add(pm);
      }
    }

    // ── rowboats on The Lake ──
    const the = lake(/^The Lake$/);
    if (the) {
      const p = open(the.p), wl = levels.get(the);
      const G = rowboatGeo();
      const hullM = pbr('wood_planks_grey', { scale: 1, tint: 0x9aa6a8 });
      const shirt = [0xc0392b, 0x2e86c1, 0xf4f1ea, 0x1e8449, 0xd4ac0d, 0x6c3483];
      const skin = mat(0xc89f7c), oarM = mat(0x8a6a44);
      let n = 0;
      for (let tries = 0; tries < 400 && n < 14; tries++) {
        const bb = p.reduce((b, [x, z]) => [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)], [1e9, -1e9, 1e9, -1e9]);
        const x = bb[0] + rnd() * (bb[1] - bb[0]), z = bb[2] + rnd() * (bb[3] - bb[2]);
        if (!inside(p, x, z) || edgeDist(p, x, z) < 9 || onField(x, z, 6)) continue;
        const boat = new THREE.Group();
        boat.add(new THREE.Mesh(G.hull, hullM));
        const r = new THREE.Mesh(G.rower, mat(shirt[n % shirt.length])); r.position.x = -0.2; boat.add(r);
        const h = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), skin); h.position.set(-0.2, 1.05, 0); boat.add(h);
        boat.add(new THREE.Mesh(G.oars, oarM));
        if (rnd() < 0.6) { const q = new THREE.Mesh(G.rower, mat(shirt[(n + 3) % shirt.length])); q.position.x = 1.1; q.scale.setScalar(0.92); boat.add(q); }
        boat.userData = { cx: x, cz: z, r: 2 + rnd() * 4, a0: rnd() * 6.28, w: (rnd() < 0.5 ? -1 : 1) * (0.02 + rnd() * 0.03), y: wl + 0.18, ph: rnd() * 6 };
        boat.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        group.add(boat); live.boats.push(boat); n++;
      }
    }

    // ── the paths, drives and the city's streets beyond, kept off the field of play ──
    for (const mesh of pavingMeshes(D, gy, inPlay, { paths: true })) group.add(mesh);

    // ── benches and lamp posts along the paths near this hole, and people on them ──
    const benches = [], lamps = [], spots = [];
    for (const r of D.roads || []) {
      if (!['footway', 'path'].includes(r.k) || r.b) continue;
      const w2 = (r.w || 3) / 2;
      let run = rnd() * 20;
      for (let i = 0; i + 1 < r.p.length; i++) {
        const [ax, az] = r.p[i], [cx, cz] = r.p[i + 1], L = Math.hypot(cx - ax, cz - az);
        if (!L || !near(ax, az, 230)) { run += L; continue; }
        const ux = (cx - ax) / L, uz = (cz - az) / L, nx = -uz, nz = ux;
        for (let t = 0; t < L; t += 3) {
          run += 3;
          const x = ax + ux * t, z = az + uz * t;
          if (onField(x, z, 4)) continue;
          if (run % 26 < 3) { const bx2 = x + nx * (w2 + 0.7), bz = z + nz * (w2 + 0.7); benches.push([bx2, gy(bx2, bz), bz, Math.atan2(-nx, -nz)]); if (rnd() < 0.35) spots.push([bx2 - nx * 0.9, gy(bx2, bz), bz - nz * 0.9, Math.atan2(-nx, -nz)]); }
          if (run % 31 < 3) { const lx = x - nx * (w2 + 0.5), lz = z - nz * (w2 + 0.5); lamps.push([lx, gy(lx, lz), lz]); }
          if (rnd() < 0.05) spots.push([x + nx * (rnd() - 0.5) * w2, gy(x, z), z, Math.atan2(ux, uz) + (rnd() < 0.5 ? 0 : Math.PI)]);
        }
      }
    }
    const inst = (geo, material, list, rot = true) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, material, list.length);
      const q = new THREE.Quaternion(), M4 = new THREE.Matrix4();
      list.forEach(([x, y, z, ry = 0], i) => { q.setFromAxisAngle(V(0, 1, 0), rot ? ry : 0); im.setMatrixAt(i, M4.compose(V(x, y, z), q, V(1, 1, 1))); });
      im.castShadow = true; im.receiveShadow = true;
      cull(im, 5); group.add(im);
    };
    const bg = benchGeo(), lg = lampGeo();
    inst(bg.wood, pbr('brown_planks_08', { scale: 0.6, tint: 0x8a6a48 }), benches);
    inst(bg.iron, m.darkIron, benches);
    inst(lg.post, m.darkIron, lamps, false);
    const globe = lit(0xf2efe6, 0xffd89a, { night: 1.2, roughness: 0.3 });
    glow.push(globe);
    inst(lg.glass, globe, lamps, false);

    // ── visitors: the plaza at Bethesda, Strawberry Fields, the lawns beside this hole ──
    if (bf) {
      const [fx, fz] = centroid(open(bf.p)), y = gy(fx - UP[0] * 22, fz - UP[1] * 22);
      for (let i = 0; i < 60; i++) { const a = rnd() * 6.28, r = 8 + rnd() * 20, x = fx + Math.cos(a) * r, z = fz + Math.sin(a) * r; if (onField(x, z)) continue; spots.push([x, y + 0.08, z, Math.atan2(fx - x, fz - z) + (rnd() - 0.5) * 1.5]); }
    }
    const sf = (D.roads || []).find((r) => r.n === 'Strawberry Fields');
    if (sf) {
      // the Imagine mosaic, a circle at the bend of the path, ringed by visitors
      const [mx, mz] = sf.p[Math.floor(sf.p.length * 0.45)], my = gy(mx, mz);
      const mos = canvasTex(256, 256, (c, w, h) => {
        c.fillStyle = '#d9d2c4'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#3a3633'; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2, 0, 6.28); c.fill();
        c.fillStyle = '#e9e4d8';
        for (let k = 0; k < 24; k++) { const a = (k / 24) * 6.28; c.save(); c.translate(w / 2, h / 2); c.rotate(a); c.beginPath(); c.moveTo(-6, -30); c.lineTo(6, -30); c.lineTo(14, -w / 2 + 6); c.lineTo(-14, -w / 2 + 6); c.closePath(); c.fill(); c.restore(); }
        c.beginPath(); c.arc(w / 2, h / 2, 30, 0, 6.28); c.fill();
        c.fillStyle = '#3a3633'; c.font = 'bold 15px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('IMAGINE', w / 2, h / 2);
      });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(5.5, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: mos, roughness: 0.6 }));
      disc.position.set(mx, my + 0.1, mz); group.add(disc);
      for (let i = 0; i < 26; i++) { const a = rnd() * 6.28, r = 6.3 + rnd() * 2.5, x = mx + Math.cos(a) * r, z = mz + Math.sin(a) * r; if (onField(x, z)) continue; spots.push([x, gy(x, z), z, Math.atan2(mx - x, mz - z)]); }
    }
    {
      // picnickers and walkers on the lawns either side of the hole, off its edge
      const { T, atHole } = H, edge = Math.max(T.fwHalf || 0, 14);
      for (let i = 0; i < 70; i++) {
        const sAt = T.length * rnd(), d = (rnd() < 0.5 ? -1 : 1) * (edge + 14 + rnd() * 30);
        const [x, z] = atHole(sAt, d), [tx, tz] = atHole(sAt, 0);
        if ((D.lakes || []).some((l) => inside(l.p, x, z))) continue;
        spots.push([x, gy(x, z), z, Math.atan2(tx - x, tz - z) + (rnd() - 0.5) * 1.6]);
      }
    }
    const crowd = crowdAt(spots, rnd);
    if (crowd) group.add(crowd);
  }
  return res;
}
