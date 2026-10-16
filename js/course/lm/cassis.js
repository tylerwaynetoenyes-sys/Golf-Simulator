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
import { pbr, painted } from '../../scene/pbr.js';
import { boatFleet } from '../../scene/boats.js';
import { Batch, bx, cy, place, span } from './riverfront.js';

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
  const leaf = painted(0xffffff, { roughness: 0.85 });
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
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.6, 14), painted(0x2f8a4a, { emissive: 0x40ff70, emissiveIntensity: 0, roughness: 0.1, metalness: 0.3 }));
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


// ── the vignoble: the appellation's vines over the whole plateau, beyond the field of play ──
// Parcels on a grid in map axes, each with its own row direction, laid on the course's
// real ground: tilled ochre soil, rows of goblet vines as leafy hedges (cheap at any
// count), dry-stone restanques holding the steeper ones, cypress windbreaks on some
// tracks, and the odd parcel left to garrigue and olives.
let _vineMat = null;
function vineMaterial() {
  if (_vineMat) return _vineMat;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 128);
  let q = 7; const r = () => ((q = (q * 16807) % 2147483647) / 2147483647);
  // stocks: a gnarled trunk every 1.3 m (the texture tile is 3.9 m)
  g.strokeStyle = '#4a3a2c';
  for (let k = 0; k < 3; k++) { const x = 40 + k * 85; g.lineWidth = 5; g.beginPath(); g.moveTo(x, 128); g.quadraticCurveTo(x + 6, 100, x - 2, 70); g.stroke(); }
  // the leaf mass: a goblet of leaves on each stock, gaps between, densest at the top
  for (let i = 0; i < 2400; i++) {
    const k = Math.floor(r() * 3), ang = r() * 6.28, rad = Math.pow(r(), 0.7) * 40;
    const x = 40 + k * 85 + Math.cos(ang) * rad, y = 48 + Math.sin(ang) * rad * 0.9 - 12;
    if (y > 96) continue;
    const l = 22 + r() * 22, h = 70 + r() * 40, sat = 35 + r() * 25;
    g.fillStyle = `hsl(${h},${sat}%,${l}%)`;
    g.beginPath(); g.ellipse(x, y + 4, 3 + r() * 4, 2 + r() * 3, r() * 3, 0, 6.29); g.fill();
  }
  // hand-made mip levels with the alpha boosted at each step, so a row keeps its
  // coverage into the distance instead of dissolving under the alpha test
  const mips = [c];
  for (let w = 128, h = 64; w >= 1 && h >= 1; w >>= 1, h = Math.max(1, h >> 1)) {
    const m = document.createElement('canvas'); m.width = w; m.height = h;
    const mg = m.getContext('2d'); mg.drawImage(mips[mips.length - 1], 0, 0, w, h);
    const d = mg.getImageData(0, 0, w, h);
    for (let i = 3; i < d.data.length; i += 4) d.data[i] = Math.min(255, d.data[i] * 1.45);
    mg.putImageData(d, 0, 0);
    mips.push(m);
    if (w === 1) break;
  }
  const t = new THREE.Texture(c);
  t.mipmaps = mips;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8;
  _vineMat = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.28, alphaToCoverage: true, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85 });
  return _vineMat;
}

function vignoble() {
  const group = new THREE.Group();
  const trees = [];
  let occ = null;
  const res = {
    group, glow: [], trees,
    occupies: (x, z) => (occ ? occ(x, z) : false),
    fit(holder, T, opts = {}) {
      if (!opts.course) return;
      holder.updateMatrix();
      const L = holder.matrix.clone(), Li = L.clone().invert(), w = new THREE.Vector3();
      const toW = (x, z) => w.set(x, 0, z).applyMatrix4(L);
      const gy = (x, z) => { toW(x, z); return (T.drawnHeight(w.x, w.z) - holder.position.y) / holder.scale.y; };
      const prj = (x, z) => { toW(x, z); return T.project(w.x, w.z); };
      const wl = T.seaLevel != null ? (T.seaLevel - holder.position.y) / holder.scale.y : -1e9;
      const corridor = Math.max(T.fwHalf || 0, 14) + 22;
      const clearOf = (x, z) => { const pr = prj(x, z); if (pr.s > -40 && pr.s < T.length + 45 && Math.abs(pr.d) < corridor) return false; toW(x, z); return T.greenEdge(w.x, w.z) > 30 && Math.hypot(w.x, w.z) > 40; };
      const rnd = seeded(1936 + (T.hole?.n || 0));
      const hash = (i, j) => { const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return v - Math.floor(v); };
      const CELL = 46, TRACK = 4, P = CELL - TRACK;
      const parcels = new Map();
      // the cells round this hole, out to 420 m either side
      const ends = [prj(0, 0)];
      const b = new THREE.Box3();
      for (let sv = -60; sv <= T.length + 60; sv += 30) { const p = T.pointAt(Math.max(0, Math.min(T.length, sv))); for (const d of [-430, 430]) { w.set(p.x + p.rx * d, 0, p.z + p.rz * d).applyMatrix4(Li); b.expandByPoint(w.clone()); } }
      const soilP = [], soilC = [], rowP = [], rowN = [], rowU = [], rowC = [], wallG = new Batch();
      const stone = pbr('sandstone_blocks_08', { scale: 0.9, tint: 0xf0e4d0, bright: 1.2 });
      const col = new THREE.Color();
      for (let i = Math.floor(b.min.x / CELL); i <= Math.floor(b.max.x / CELL); i++) for (let j = Math.floor(b.min.z / CELL); j <= Math.floor(b.max.z / CELL); j++) {
        const hx = hash(i + 0.5, j), hz = hash(i, j + 0.5);
        const x0 = i * CELL + TRACK / 2 + hx * 6, z0 = j * CELL + TRACK / 2 + hz * 6, cx = x0 + P / 2, cz = z0 + P / 2;
        if (cz > 380) continue; // the town and the port
        const pr = prj(cx, cz);
        if (Math.abs(pr.d) > 440 || pr.s < -200 || pr.s > T.length + 200) continue;
        if (![[x0, z0], [x0 + P, z0], [x0, z0 + P], [x0 + P, z0 + P], [cx, cz]].every(([x, z]) => clearOf(x, z))) continue;
        const ys = [gy(x0, z0), gy(x0 + P, z0), gy(x0, z0 + P), gy(x0 + P, z0 + P)];
        if (Math.min(...ys) < wl + 4) continue;
        const slope = (Math.max(...ys) - Math.min(...ys)) / P;
        if (slope > 0.32) continue;
        const h = hash(i, j);
        if (h < 0.22) { // garrigue and a few olives
          for (let k = 0; k < 3; k++) { const x = x0 + rnd() * P, z = z0 + rnd() * P; trees.push(tree(x, gy(x, z), z, 4 + rnd() * 2, 2.4, { slot: OLIVE })); }
          continue;
        }
        parcels.set(`${i},${j}`, 1);
        // the soil, draped
        const N = 7, st = P / N;
        // pale, stony limestone soil, a little redder toward Cap Canaille
        // (with a little of the rows' green in it: from afar, where the rows thin out, a parcel still reads as vines)
        const soil = col.setHSL(0.08 + h * 0.02, 0.12 + h * 0.1, 0.66 + h * 0.08).clone().lerp(new THREE.Color(0x5f7434), 0.5);
        const Y = (x, z) => gy(x, z) + 0.06;
        for (let a = 0; a < N; a++) for (let c = 0; c < N; c++) {
          const xa = x0 + a * st, za = z0 + c * st, xb = xa + st, zb = za + st;
          soilP.push(xa, Y(xa, za), za, xa, Y(xa, zb), zb, xb, Y(xb, zb), zb, xa, Y(xa, za), za, xb, Y(xb, zb), zb, xb, Y(xb, za), za);
          for (let v = 0; v < 6; v++) soilC.push(soil.r, soil.g, soil.b);
        }
        // the rows: along x or along z, 2.3 m apart, a leafy tent over each
        const alongX = h > 0.58;
        const leaf = col.setHSL(0.24 + (h - 0.5) * 0.06, 0.45, 0.82 + h * 0.12).clone();
        const span2 = P - 6 * Math.max(hx, hz);
        for (let rr = 1.2; rr < span2 - 0.8; rr += 2.3) {
          const seg = 3.9;
          for (let t = 0.8; t < span2 - 0.8; t += seg) {
            const t1 = Math.min(span2 - 0.8, t + seg);
            const A = alongX ? [x0 + t, z0 + rr] : [x0 + rr, z0 + t], B2 = alongX ? [x0 + t1, z0 + rr] : [x0 + rr, z0 + t1];
            const ya = gy(...A), yb = gy(...B2);
            const ox = alongX ? 0 : 0.5, oz = alongX ? 0.5 : 0;
            const u0 = t / 3.9, u1 = t1 / 3.9;
            for (const sd of [-1, 1]) {
              // a slanted face from the foot of the canopy out at the side, up to the ridge
              const p = [A[0] + ox * sd * 0.8, ya + 0.1, A[1] + oz * sd * 0.8, B2[0] + ox * sd * 0.8, yb + 0.1, B2[1] + oz * sd * 0.8, B2[0], yb + 1.15, B2[1], A[0], ya + 1.15, A[1]];
              rowP.push(...p.slice(0, 3), ...p.slice(3, 6), ...p.slice(6, 9), ...p.slice(0, 3), ...p.slice(6, 9), ...p.slice(9, 12));
              rowU.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
              const n = [ox * sd * 0.8, 1, oz * sd * 0.8];
              for (let v = 0; v < 6; v++) { rowN.push(...n); rowC.push(leaf.r, leaf.g, leaf.b); }
            }
          }
        }
        // a dry-stone restanque along the downhill edge of a steep parcel
        if (slope > 0.1) {
          const lowZ = ys[0] + ys[1] < ys[2] + ys[3];
          const zz = lowZ ? z0 - 0.5 : z0 + P + 0.5;
          for (let t = 0; t < P; t += 6) wallG.add(stone, span(new THREE.Vector3(x0 + t, gy(x0 + t, zz) + 0.9, zz), new THREE.Vector3(x0 + t + 6, gy(x0 + t + 6, zz) + 0.9, zz), 0.7, 1.6));
        }
        // a windbreak of cypresses along the north track of some parcels (the mistral comes from the north)
        if (h > 0.9) for (let x = x0; x < x0 + P; x += 3.6) trees.push(tree(x, gy(x, z0 - 2), z0 - 2, 10 + rnd() * 5, 1.3, { slot: CYPRESS }));
      }
      const mk = (P2, C, extra, material) => {
        if (!P2.length) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
        for (const [k, v, n] of extra) geo.setAttribute(k, new THREE.Float32BufferAttribute(v, n));
        if (!extra.some(([k]) => k === 'normal')) geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, material);
        m.receiveShadow = true;
        group.add(m);
        return m;
      };
      mk(soilP, soilC, [], pbr('brown_mud_dry', { scale: 3, tint: 0xffffff, vertex: true, offset: -2 }));
      const rows = mk(rowP, rowC, [['normal', rowN, 3], ['uv', rowU, 2]], vineMaterial());
      if (rows) rows.castShadow = true;
      wallG.build(group);
      occ = (wx, wz) => {
        w.set(wx, 0, wz).applyMatrix4(Li);
        const i = Math.floor(w.x / CELL), j = Math.floor(w.z / CELL);
        return parcels.has(`${i},${j}`);
      };
    },
  };
  return res;
}

export default { vineyard, vignoble, phare, cassisport, chateau };
