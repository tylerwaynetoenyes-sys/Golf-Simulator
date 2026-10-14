// Cathedral Basilica of Saint Louis (dedicated 1914). Romanesque-Revival
// exterior in grey granite, green-tiled central dome on an arcaded drum, two
// square towers flanking the east front with green cupolas and crosses, a
// deep triple-arched portico on polished granite columns, a raised podium
// with steps, and a paved plaza with lawns, trees and lamp posts.
// Front faces +Z (toward the golfer). Footprint x∈[-55,55], z∈[-75,45], ~70 m to the cross.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, lit, box, cyl, seeded, canvasTex } from './kit.js';

// ---------- batching: merge everything that shares a material ----------
function batcher() {
  const lists = new Map();
  const tmp = new THREE.Matrix4();
  return {
    add(o, proj = null, parent = null) {
      o.updateMatrix();
      let g = o.geometry.clone();
      g.applyMatrix4(parent ? tmp.copy(parent).multiply(o.matrix) : o.matrix);
      if (g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (proj) boxUV(g, proj);
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
/** World-space box projection so textures keep a constant scale. */
function boxUV(g, { s = 4, swap = false }) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); if (swap) { const t = u; u = v; v = t; } }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u / s, v / s);
  }
}
function archPath(path, w, h, y0 = 0) {
  const r = w / 2;
  path.moveTo(-r, y0); path.lineTo(r, y0); path.lineTo(r, h - r); path.absarc(0, h - r, r, 0, Math.PI, false); path.lineTo(-r, y0);
  return path;
}
const archShape = (w, h) => archPath(new THREE.Shape(), w, h);
function mesh(geo, m, x = 0, y = 0, z = 0, ry = 0, rx = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z); o.rotation.set(rx, ry, 0);
  return o;
}
/** Prism along Z from a 2D (x,y) outline, z from z0 to z1. */
function prismZ(pts, z0, z1) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: false }).translate(0, 0, z0);
}
/** Prism along X from a 2D (z,y) outline, x from x0 to x1. */
function prismX(pts, x0, x1) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  return new THREE.ExtrudeGeometry(s, { depth: x1 - x0, bevelEnabled: false }).translate(0, 0, -x1).rotateY(-Math.PI / 2);
}

// ---------- textures ----------
function graniteTex() {
  const rnd = seeded(91);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#a7a8a3'; g.fillRect(0, 0, w, h);
    const rows = 7, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 0.5;
      for (let c = -1; c < 4; c++) {
        const x = (c + off) * (w / 3.3);
        const t = 150 + rnd() * 26 | 0;
        g.fillStyle = `rgb(${t},${t + 1},${t - 3})`;
        g.fillRect(x + 1, r * rh + 1, w / 3.3 - 2, rh - 2);
      }
    }
    for (let i = 0; i < 5000; i++) {
      const v = rnd() < 0.5 ? 90 + rnd() * 40 : 190 + rnd() * 50;
      g.fillStyle = `rgba(${v},${v},${v - 4},0.35)`;
      g.fillRect(rnd() * w, rnd() * h, 1.2, 1.2);
    }
    g.strokeStyle = 'rgba(70,70,68,0.55)'; g.lineWidth = 1.2;
    for (let r = 0; r <= rows; r++) { g.beginPath(); g.moveTo(0, r * rh); g.lineTo(w, r * rh); g.stroke(); }
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 0.5;
      for (let c = 0; c < 4; c++) { const x = (c + off) * (w / 3.3); g.beginPath(); g.moveTo(x, r * rh); g.lineTo(x, (r + 1) * rh); g.stroke(); }
    }
  }, [1, 1]);
}
function tileTex(base = '#3f7a5e') {
  const rnd = seeded(17);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const rows = 16, cols = 16, rh = h / rows, cw = w / cols;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = (c + (r % 2) * 0.5) * cw, y = r * rh;
      const l = 40 + rnd() * 22;
      g.fillStyle = `hsl(${150 + rnd() * 14},${30 + rnd() * 12}%,${l * 0.62}%)`;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + cw, y); g.lineTo(x + cw, y + rh * 0.6);
      g.quadraticCurveTo(x + cw / 2, y + rh * 1.15, x, y + rh * 0.6); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(15,35,25,0.55)'; g.lineWidth = 1; g.stroke();
    }
  }, [1, 1]);
}
function paverTex() {
  const rnd = seeded(5);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b8b3a8'; g.fillRect(0, 0, w, h);
    const n = 8, s = w / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const t = 168 + rnd() * 30 | 0;
      g.fillStyle = `rgb(${t},${t - 3},${t - 10})`; g.fillRect(c * s + 1, r * s + 1, s - 2, s - 2);
    }
  }, [1, 1]);
}
function grassTex() {
  const rnd = seeded(3);
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#5f8a3e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `hsl(${88 + rnd() * 18},${40 + rnd() * 15}%,${28 + rnd() * 14}%)`; g.fillRect(rnd() * w, rnd() * h, 1, 2); }
    g.fillStyle = 'rgba(255,255,255,0.05)'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 16, h);
  }, [1, 1]);
}

export default function build() {
  const group = new THREE.Group();
  const B = batcher();
  const rnd = seeded(1914);

  const gTex = graniteTex();
  const stone = lit(0xffffff, 0xffc890, { map: gTex, emissiveMap: gTex, roughness: 0.86, night: 0.13 });
  const stoneFront = lit(0xf4f4f0, 0xffc890, { map: gTex, emissiveMap: gTex, roughness: 0.86, night: 0.3 });
  const trim = lit(0xd9d9d3, 0xffc890, { map: gTex, emissiveMap: gTex, roughness: 0.8, night: 0.22 });
  const polished = mat(0x6d6460, { roughness: 0.28, metalness: 0.05 });
  const tiles = mat(0xffffff, { map: tileTex(), roughness: 0.55, metalness: 0.1 });
  const dTex = tileTex('#3c7a60'); dTex.repeat.set(10, 4);
  const tilesDome = lit(0xffffff, 0x9fe0c0, { map: dTex, emissiveMap: dTex, roughness: 0.45, metalness: 0.12, night: 0.35 });
  const ribM = mat(0x5f8f78, { roughness: 0.5, metalness: 0.2 });
  const glass = lit(0x1e252c, 0xffb560, { roughness: 0.25, metalness: 0.3, night: 1.0 });
  const louver = mat(0x2a2b2a, { roughness: 0.9 });
  const doorM = lit(0x3b2a1e, 0xffa850, { roughness: 0.5, metalness: 0.4, night: 0.5 });
  const gold = mat(0xd8b25a, { roughness: 0.3, metalness: 0.9 });
  const pavers = mat(0xffffff, { map: paverTex(), roughness: 0.9 });
  const grass = mat(0xffffff, { map: grassTex(), roughness: 1 });
  const ironM = mat(0x1f2324, { roughness: 0.5, metalness: 0.6 });
  const lampM = lit(0xfff2d6, 0xffd08a, { night: 1.8, roughness: 0.3 });
  const glow = [stone, stoneFront, trim, glass, doorM, lampM, tilesDome];

  const S = { s: 4 }; // stone projection
  const Y0 = 1.4; // podium height

  // ---------- ground: plaza, lawns, podium, steps ----------
  B.add(box(110, 0.06, 120, grass, 0, 0, -15), { s: 8 });
  B.add(box(44, 0.1, 22, pavers, 0, 0, 34), { s: 6 });
  B.add(box(8, 0.1, 13, pavers, 0, 0, 45 - 6.5), { s: 6 });
  B.add(box(70, 0.09, 4, pavers, 0, 0, 24), { s: 6 }); // walk across the front
  B.add(box(64, Y0, 86, stone, 0, 0, -21), S); // podium z ∈ [-64, 22]
  B.add(box(65, 0.25, 87, trim, 0, Y0 - 0.25, -21), S);
  for (let i = 0; i < 7; i++) { // front steps
    const h = Y0 * (7 - i) / 7;
    B.add(box(36, h, 0.45, trim, 0, 0, 22 + 0.22 + i * 0.45), S);
  }
  for (const sx of [-1, 1]) B.add(box(1.6, Y0 + 0.9, 3.4, trim, sx * 18.8, 0, 23.6), S); // cheek walls

  // ---------- nave + aisles ----------
  const NW = 17.5; // nave half width
  const NAVE_H = 26, NAVE_RIDGE = 8.5;
  const zFront = 14, zEnd = -57;
  B.add(box(NW * 2, NAVE_H, zFront - zEnd, stone, 0, Y0, (zFront + zEnd) / 2), S);
  B.add(mesh(prismZ([[-NW - 0.8, 0], [NW + 0.8, 0], [0, NAVE_RIDGE]], zEnd, zFront + 0.3), tiles, 0, Y0 + NAVE_H), { s: 3, swap: true });
  // front gable (stone, proud of the roof)
  B.add(mesh(prismZ([[-NW, 0], [NW, 0], [0, NAVE_RIDGE + 0.4]], zFront - 0.6, zFront + 0.6), stoneFront, 0, Y0 + NAVE_H), S);
  // aisles
  const AW = 8, AISLE_H = 15;
  for (const sx of [-1, 1]) {
    for (const [z0, z1] of [[3, -6], [-34, -57]]) {
      const cx = sx * (NW + AW / 2);
      B.add(box(AW, AISLE_H, z0 - z1, stone, cx, Y0, (z0 + z1) / 2), S);
      const pts = sx > 0 ? [[NW, 0], [NW + AW + 0.8, 0], [NW, 3.4]] : [[-NW - AW - 0.8, 0], [-NW, 0], [-NW, 3.4]];
      B.add(mesh(prismZ(pts, z1 - 0.4, z0 + 0.4), tiles, 0, Y0 + AISLE_H), { s: 3, swap: true });
      // aisle windows
      for (let z = z0 - 2.2; z > z1 + 1.5; z -= 4.2) addWin(sx * (NW + AW + 0.02), Y0 + 5.5, z, 1.8, 5.5, sx * Math.PI / 2);
      corbels(B, trim, [sx * (NW + AW + 0.25), Y0 + AISLE_H - 0.7, z0], [sx * (NW + AW + 0.25), Y0 + AISLE_H - 0.7, z1], 'z');
      B.add(box(0.7, 0.45, z0 - z1 + 0.6, trim, sx * (NW + AW), Y0 + AISLE_H - 0.45, (z0 + z1) / 2), S);
    }
    // nave clerestory
    for (const [z0, z1] of [[2, -6], [-34, -56]]) {
      for (let z = z0 - 2; z > z1 + 1; z -= 3.6) addWin(sx * (NW + 0.02), Y0 + AISLE_H + 3.6, z, 1.7, 5.2, sx * Math.PI / 2);
    }
    corbels(B, trim, [sx * (NW + 0.25), Y0 + NAVE_H - 0.8, zFront], [sx * (NW + 0.25), Y0 + NAVE_H - 0.8, zEnd], 'z');
    B.add(box(0.8, 0.5, zFront - zEnd, trim, sx * NW, Y0 + NAVE_H - 0.5, (zFront + zEnd) / 2), S);
    // buttress pilasters on aisle walls
    for (let z = 2; z > -57; z -= 8.4) if (z > -6 || z < -34) B.add(box(1.0, AISLE_H - 1, 1.2, stone, sx * (NW + AW + 0.4), Y0, z), S);
  }

  // ---------- transept ----------
  const TX = 38, TZ0 = -6, TZ1 = -34, TR = 8.5;
  B.add(box(TX * 2, NAVE_H, TZ0 - TZ1, stone, 0, Y0, (TZ0 + TZ1) / 2), S);
  B.add(mesh(prismX([[TZ0 + 0.8, 0], [TZ1 - 0.8, 0], [(TZ0 + TZ1) / 2, TR + 1]], -TX - 0.3, TX + 0.3), tiles, 0, Y0 + NAVE_H), { s: 3 });
  for (const sx of [-1, 1]) {
    // gable ends with rose + triple windows
    B.add(mesh(prismX([[TZ0, 0], [TZ1, 0], [(TZ0 + TZ1) / 2, TR + 1.4]], sx * TX - 0.6, sx * TX + 0.6), stoneFront, 0, Y0 + NAVE_H), S);
    rose(sx * (TX + 0.05), Y0 + 19, (TZ0 + TZ1) / 2, 3.4, sx * Math.PI / 2);
    for (const dz of [-6, 0, 6]) addWin(sx * (TX + 0.05), Y0 + 4.5, (TZ0 + TZ1) / 2 + dz, 2.6, dz ? 8 : 9.5, sx * Math.PI / 2);
    corbelRake(sx);
    // front & back faces of transept arms
    for (const [zf, ry] of [[TZ0 + 0.02, 0], [TZ1 - 0.02, Math.PI]]) {
      for (const x of [22, 27.5, 33]) {
        addWin(sx * x, Y0 + 4.5, zf, 2.2, 7, ry);
        addWin(sx * x, Y0 + 15.5, zf, 2.2, 6.5, ry);
      }
      corbels(B, trim, [sx * (NW + AW), Y0 + NAVE_H - 0.8, zf + (ry ? -0.25 : 0.25)], [sx * TX, Y0 + NAVE_H - 0.8, zf + (ry ? -0.25 : 0.25)], 'x');
    }
    for (const z of [TZ0, TZ1]) B.add(box(TX - NW, 0.5, 0.8, trim, sx * (NW + TX) / 2, Y0 + NAVE_H - 0.5, z), S);
    // corner buttresses
    for (const z of [TZ0, TZ1]) B.add(box(1.6, NAVE_H + 1, 1.6, stone, sx * (TX - 0.2), Y0, z), S);
  }

  // ---------- apse ----------
  const AR = 16.5, AZ = zEnd;
  B.add(mesh(new THREE.CylinderGeometry(AR, AR, 22, 28, 1, false, Math.PI / 2, Math.PI), stone, 0, Y0 + 11, AZ), S);
  B.add(mesh(new THREE.ConeGeometry(AR + 0.8, 8, 28, 1, true, Math.PI / 2, Math.PI), tiles, 0, Y0 + 26, AZ), { s: 3 });
  for (let i = 0; i < 7; i++) {
    const a = Math.PI / 2 + (i + 0.5) / 7 * Math.PI; // around back half
    const x = Math.sin(a) * (AR + 0.02), z = AZ + Math.cos(a) * (AR + 0.02);
    addWin(x, Y0 + 9, z, 2.1, 7.5, a);
    const xb = Math.sin(a + Math.PI / 14) * (AR + 0.3), zb = AZ + Math.cos(a + Math.PI / 14) * (AR + 0.3);
    if (i < 6) B.add(mesh(new THREE.BoxGeometry(1.1, 21, 1.1), stone, xb, Y0 + 10.5, zb, a), S);
  }
  B.add(mesh(new THREE.CylinderGeometry(AR + 0.6, AR + 0.6, 0.6, 28, 1, false, Math.PI / 2, Math.PI), trim, 0, Y0 + 21.7, AZ), S);

  // ---------- crossing: square base, drum, dome, lantern ----------
  const CZ = (TZ0 + TZ1) / 2;
  B.add(box(30, 6, 30, stone, 0, Y0 + NAVE_H, CZ), S);
  B.add(box(31.2, 0.7, 31.2, trim, 0, Y0 + NAVE_H + 6, CZ), S);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    B.add(mesh(new THREE.CylinderGeometry(1.8, 1.8, 9, 8), stone, sx * 13.4, Y0 + NAVE_H + 4.5, CZ + sz * 13.4), S);
    B.add(mesh(new THREE.ConeGeometry(2.2, 3.5, 8), tiles, sx * 13.4, Y0 + NAVE_H + 10.75, CZ + sz * 13.4), { s: 2 });
  }
  const DY = Y0 + NAVE_H + 6.7, DR = 13, DH = 12;
  B.add(mesh(new THREE.CylinderGeometry(DR, DR + 0.3, DH, 40), stone, 0, DY + DH / 2, CZ), S);
  B.add(mesh(new THREE.CylinderGeometry(DR + 0.8, DR + 0.8, 0.6, 40), trim, 0, DY + 0.3, CZ), S);
  B.add(mesh(new THREE.CylinderGeometry(DR + 0.9, DR + 0.5, 0.9, 40), trim, 0, DY + DH - 0.1, CZ), S);
  const NWD = 16;
  for (let i = 0; i < NWD; i++) {
    const a = (i + 0.5) / NWD * Math.PI * 2;
    addWin(Math.sin(a) * (DR + 0.05), DY + 2.6, CZ + Math.cos(a) * (DR + 0.05), 2.2, 7, a);
    const ap = i / NWD * Math.PI * 2;
    B.add(mesh(new THREE.BoxGeometry(0.9, DH - 1, 0.7), trim, Math.sin(ap) * (DR + 0.25), DY + DH / 2, CZ + Math.cos(ap) * (DR + 0.25), ap), S);
    // corbel table under the drum cornice
    for (let k = 0; k < 4; k++) {
      const ac = ap + (k + 0.5) / 4 * (Math.PI * 2 / NWD);
      B.add(mesh(new THREE.BoxGeometry(0.35, 0.5, 0.4), trim, Math.sin(ac) * (DR + 0.2), DY + DH - 1.1, CZ + Math.cos(ac) * (DR + 0.2), ac), null);
    }
  }
  // main dome (slightly raised profile) + ribs
  const R = DR + 0.4, H = 13.5, prof = [];
  for (let i = 0; i <= 18; i++) { const t = i / 18 * Math.PI / 2; prof.push(new THREE.Vector2(Math.max(0.01, R * Math.cos(t)), H * Math.sin(t))); }
  const dY = DY + DH + 0.35;
  B.add(mesh(new THREE.LatheGeometry(prof, 44), tilesDome, 0, dY, CZ));
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, pts = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10 * Math.PI / 2 * 0.93; const r = R * Math.cos(t) + 0.12; pts.push(new THREE.Vector3(Math.sin(a) * r, dY + H * Math.sin(t) + 0.1, CZ + Math.cos(a) * r)); }
    B.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.22, 5), ribM));
  }
  // lantern
  const LY = dY + H - 0.6;
  B.add(mesh(new THREE.CylinderGeometry(3.3, 3.5, 1, 16), trim, 0, LY + 0.5, CZ), S);
  B.add(mesh(new THREE.CylinderGeometry(2.6, 2.6, 5, 16), stone, 0, LY + 3.5, CZ), S);
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2; addWin(Math.sin(a) * 2.62, LY + 1.6, CZ + Math.cos(a) * 2.62, 0.9, 3, a, false); }
  B.add(mesh(new THREE.CylinderGeometry(3.0, 3.0, 0.5, 16), trim, 0, LY + 6.25, CZ), S);
  B.add(mesh(new THREE.SphereGeometry(2.8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), tilesDome, 0, LY + 6.5, CZ));
  B.add(mesh(new THREE.SphereGeometry(0.55, 10, 8), gold, 0, LY + 9.6, CZ));
  crossAt(0, LY + 10, CZ, 4.6, gold);

  // ---------- west front: towers, gable, rose, portico ----------
  const TWW = 11, TWX = NW + TWW / 2, TWZ0 = 3, TWZ1 = 15;
  const TWH = 34;
  for (const sx of [-1, 1]) {
    const cx = sx * TWX, cz = (TWZ0 + TWZ1) / 2, d = TWZ1 - TWZ0;
    B.add(box(TWW, TWH, d, stoneFront, cx, Y0, cz), S);
    // corner pilasters
    for (const ex of [-1, 1]) B.add(box(1.2, TWH - 1, 1.2, stoneFront, cx + ex * (TWW / 2 - 0.2), Y0, TWZ1 - 0.2 + 0.4), S);
    for (const yb of [10, 22, TWH - 0.6]) B.add(box(TWW + 0.8, 0.6, d + 0.8, trim, cx, Y0 + yb, cz), S);
    // front windows stacked
    addWin(cx, Y0 + 3.5, TWZ1 + 0.02, 2.0, 5.2, 0);
    addWin(cx, Y0 + 13.5, TWZ1 + 0.02, 2.2, 6.5, 0);
    addWin(sx * (TWX + TWW / 2 + 0.02), Y0 + 13.5, cz, 2.2, 6.5, sx * Math.PI / 2);
    // belfry: paired arched openings on all four faces
    for (const [fx, fz, ry] of [[0, d / 2, 0], [TWW / 2, 0, Math.PI / 2], [-TWW / 2, 0, -Math.PI / 2], [0, -d / 2, Math.PI]]) {
      for (const o of [-1.6, 1.6]) {
        const ox = Math.cos(ry) * o, oz = -Math.sin(ry) * o;
        addWin(cx + fx + ox + Math.sin(ry) * 0.02, Y0 + 24.5, cz + fz + oz + Math.cos(ry) * 0.02, 2.2, 7.2, ry, true, louver);
      }
    }
    corbels(B, trim, [cx - TWW / 2, Y0 + TWH - 1.1, TWZ1 + 0.25], [cx + TWW / 2, Y0 + TWH - 1.1, TWZ1 + 0.25], 'x');
    // parapet with corner pinnacles
    B.add(box(TWW, 1.2, d, stone, cx, Y0 + TWH, cz), S);
    for (const ex of [-1, 1]) for (const ez of [-1, 1]) {
      B.add(box(1.3, 2.2, 1.3, trim, cx + ex * (TWW / 2 - 0.65), Y0 + TWH, cz + ez * (d / 2 - 0.65)), S);
      B.add(mesh(new THREE.ConeGeometry(0.85, 2.2, 4), tiles, cx + ex * (TWW / 2 - 0.65), Y0 + TWH + 3.3, cz + ez * (d / 2 - 0.65), Math.PI / 4), { s: 2 });
    }
    // octagonal drum + green cupola + lantern + cross
    const ty = Y0 + TWH + 1.2;
    B.add(mesh(new THREE.CylinderGeometry(4.0, 4.3, 4.2, 8), stoneFront, cx, ty + 2.1, cz, Math.PI / 8), S);
    for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2 + Math.PI / 8 - Math.PI / 8; addWin(cx + Math.sin(a) * 3.75, ty + 0.8, cz + Math.cos(a) * 3.75, 0.9, 2.6, a, false, louver); }
    B.add(mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.45, 8), trim, cx, ty + 4.35, cz, Math.PI / 8), S);
    const cp = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12 * Math.PI / 2; cp.push(new THREE.Vector2(Math.max(0.01, 4.3 * Math.cos(t)), 5.6 * Math.sin(t))); }
    B.add(mesh(new THREE.LatheGeometry(cp, 24), tilesDome, cx, ty + 4.55, cz));
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, pts = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8 * Math.PI / 2 * 0.9; const r = 4.3 * Math.cos(t) + 0.08; pts.push(new THREE.Vector3(cx + Math.sin(a) * r, ty + 4.6 + 5.6 * Math.sin(t), cz + Math.cos(a) * r)); }
      B.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.13, 4), ribM));
    }
    B.add(mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.8, 8), stone, cx, ty + 10.6, cz), S);
    B.add(mesh(new THREE.SphereGeometry(1.0, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), tilesDome, cx, ty + 11.5, cz));
    B.add(mesh(new THREE.SphereGeometry(0.3, 8, 6), gold, cx, ty + 12.7, cz));
    crossAt(cx, ty + 12.9, cz, 2.8, gold);
  }
  // central gable face: rose + arcade of windows + corbelled rake
  rose(0, Y0 + 24.5, zFront + 0.62, 4.0, 0);
  for (const dx of [-8.5, -4.25, 0, 4.25, 8.5]) addWin(dx, Y0 + 13.6, zFront + 0.02, 2.4, dx ? 6.6 : 7.4, 0);
  B.add(box(NW * 2, 0.6, 1.2, trim, 0, Y0 + 12.6, zFront + 0.2), S);
  B.add(box(NW * 2, 0.6, 1.0, trim, 0, Y0 + NAVE_H - 0.6, zFront + 0.4), S);
  corbels(B, trim, [-NW, Y0 + NAVE_H - 1.3, zFront + 0.35], [NW, Y0 + NAVE_H - 1.3, zFront + 0.35], 'x');
  for (const sx of [-1, 1]) {
    const L = Math.hypot(NW, NAVE_RIDGE + 0.4), a = Math.atan2(NAVE_RIDGE + 0.4, NW);
    const o = new THREE.Mesh(new THREE.BoxGeometry(L + 0.8, 0.6, 1.6), trim);
    o.position.set(sx * NW / 2, Y0 + NAVE_H + (NAVE_RIDGE + 0.4) / 2 + 0.25, zFront + 0.1); o.rotation.z = -sx * a; B.add(o, S);
    for (let i = 1; i < 14; i++) {
      const u = i / 14; const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.4), trim);
      c.position.set(sx * NW * (1 - u), Y0 + NAVE_H + (NAVE_RIDGE + 0.4) * u - 0.4, zFront + 0.75); B.add(c);
    }
  }
  crossAt(0, Y0 + NAVE_H + NAVE_RIDGE + 0.4, zFront, 2.6, trim);

  // portico: three round arches, paired polished-granite columns, deep porch
  const PZ0 = zFront, PZ1 = 21.2, PW = 30, PH = 11.5;
  const front = archHoles(PW, PH, [-9.2, 0, 9.2], 6.2, 8.6);
  B.add(mesh(new THREE.ExtrudeGeometry(front, { depth: 1.3, bevelEnabled: false, curveSegments: 12 }), stoneFront, 0, Y0, PZ1 - 1.3), S);
  for (const sx of [-1, 1]) {
    const side = archHoles(PZ1 - PZ0 - 1.3, PH, [0], 3.6, 7.2);
    B.add(mesh(new THREE.ExtrudeGeometry(side, { depth: 1.2, bevelEnabled: false, curveSegments: 10 }), stoneFront, sx * (PW / 2 - (sx > 0 ? 1.2 : 0)), Y0, PZ0 + (PZ1 - PZ0 - 1.3) / 2, Math.PI / 2), S);
  }
  B.add(box(PW + 1.2, 0.8, PZ1 - PZ0 + 1.0, trim, 0, Y0 + PH, (PZ0 + PZ1) / 2 + 0.3), S);
  B.add(box(PW, 1.4, PZ1 - PZ0, stoneFront, 0, Y0 + PH + 0.8, (PZ0 + PZ1) / 2), S);
  B.add(mesh(prismZ([[-PW / 2 - 0.4, 0], [PW / 2 + 0.4, 0], [0, 3.2]], PZ0 + 0.5, PZ1 + 0.4), tiles, 0, Y0 + PH + 2.2), { s: 3, swap: true });
  B.add(mesh(prismZ([[-PW / 2, 0], [PW / 2, 0], [0, 3.4]], PZ1 - 0.2, PZ1 + 0.5), stoneFront, 0, Y0 + PH + 2.0), S);
  corbels(B, trim, [-PW / 2, Y0 + PH - 0.5, PZ1 + 0.25], [PW / 2, Y0 + PH - 0.5, PZ1 + 0.25], 'x');
  // arch voussoir bands
  for (const ax of [-9.2, 0, 9.2]) {
    // simple archivolt: half torus
    const tor = new THREE.Mesh(new THREE.TorusGeometry(3.45, 0.38, 6, 20, Math.PI), trim);
    tor.position.set(ax, Y0 + 8.6 - 3.1, PZ1 + 0.1); B.add(tor, S);
    // paired columns at each arch jamb
    for (const jx of [-1, 1]) for (const k of [0, 1]) {
      const x = ax + jx * (3.1 + 0.55), z = PZ1 - 0.25 - k * 0.9;
      B.add(cyl(0.32, 0.36, 5.2, polished, x, Y0 + 0.5, z, 12));
      B.add(box(0.95, 0.5, 0.95, trim, x, Y0, z), S);
      B.add(mesh(new THREE.CylinderGeometry(0.55, 0.36, 0.7, 8), trim, x, Y0 + 6.05, z), S);
    }
  }
  // doors in the porch
  for (const dx of [-9.2, 0, 9.2]) {
    B.add(mesh(new THREE.ExtrudeGeometry(archShape(3.6, 6.8), { depth: 0.15, bevelEnabled: false, curveSegments: 10 }), doorM, dx, Y0, zFront + 0.02));
    B.add(mesh(new THREE.ExtrudeGeometry(archRing(3.6, 6.8, 0.6), { depth: 0.4, bevelEnabled: false, curveSegments: 10 }), trim, dx, Y0, zFront + 0.02), S);
  }

  // ---------- plaza furniture: lamp posts + trees + benches ----------
  const lampPos = [];
  for (const sx of [-1, 1]) {
    for (const z of [28, 35, 42]) lampPos.push([sx * 21, z]);
    for (const z of [-10, -40]) lampPos.push([sx * 40, z]);
    lampPos.push([sx * 5.5, 43]);
  }
  for (const [x, z] of lampPos) {
    B.add(cyl(0.22, 0.3, 0.6, ironM, x, 0, z, 8));
    B.add(cyl(0.07, 0.1, 3.9, ironM, x, 0.6, z, 6));
    B.add(cyl(0.22, 0.12, 0.3, ironM, x, 4.5, z, 6));
    B.add(mesh(new THREE.SphereGeometry(0.36, 10, 6), lampM, x, 4.95, z));
  }
  for (const sx of [-1, 1]) for (const z of [31.5, 38.5]) B.add(box(0.6, 0.45, 2.4, mat(0x4a3628), sx * 19, 0, z));
  B.build(group);

  // trees (instanced)
  const trees = [];
  const tr2 = seeded(77);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) trees.push([sx * (27 + (i % 2) * 5), 27 + i * 4.7, 0.9]);
    for (let i = 0; i < 6; i++) trees.push([sx * (44 + tr2() * 8), 40 - i * 17 + tr2() * 5, 1.25]);
    for (let i = 0; i < 4; i++) trees.push([sx * (36 + tr2() * 6), -48 - i * 7, 1.0]);
  }
  const trunkG = new THREE.CylinderGeometry(0.16, 0.24, 1, 6).translate(0, 0.5, 0);
  const crownG = new THREE.IcosahedronGeometry(1, 1);
  const trunks = new THREE.InstancedMesh(trunkG, mat(0x4a3a2c), trees.length);
  const crowns = new THREE.InstancedMesh(crownG, mat(0xffffff, { roughness: 0.95, flatShading: true }), trees.length * 3);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), col = new THREE.Color();
  trees.forEach(([x, z, s], i) => {
    const h = (3.2 + tr2() * 1.2) * s;
    M.compose(pv.set(x, 0, z), q.identity(), sv.set(s, h, s)); trunks.setMatrixAt(i, M);
    for (let k = 0; k < 3; k++) {
      const r = (2.1 + tr2() * 0.7) * s;
      const ox = (tr2() - 0.5) * 1.6 * s, oz = (tr2() - 0.5) * 1.6 * s;
      M.compose(pv.set(x + ox, h + r * 0.55 + k * 0.5 * s, z + oz), q.setFromEuler(new THREE.Euler(tr2(), tr2() * 3, 0)), sv.set(r, r * 0.85, r));
      crowns.setMatrixAt(i * 3 + k, M);
      crowns.setColorAt(i * 3 + k, col.setHSL(0.25 + tr2() * 0.05, 0.5, 0.15 + tr2() * 0.07));
    }
  });
  group.add(trunks, crowns);

  // a few visitors on the plaza
  const peopleG = [], pr = seeded(8);
  const shirts = [0x2f4f7f, 0x8a3a3a, 0xd8d0c0, 0x3d5c3a, 0x6b5b8a, 0x222222];
  const pb = batcher();
  const pmats = shirts.map((c) => mat(c)), legM = mat(0x2c3442), skinM = mat(0xc89070, { roughness: 0.6 });
  for (let i = 0; i < 9; i++) {
    const x = (pr() - 0.5) * 30, z = 26 + pr() * 17, ry = pr() * 6;
    const P = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
    pb.add(box(0.34, 0.86, 0.22, legM), null, P);
    pb.add(box(0.44, 0.62, 0.26, pmats[i % pmats.length], 0, 0.86, 0), null, P);
    pb.add(sphere12(0.115, skinM, 0, 1.62, 0), null, P);
  }
  pb.build(group);
  group.traverse((o) => { if (o.isMesh && o !== trunks && o !== crowns) o.receiveShadow = true; });

  return { group, glow };

  // ---------- helpers (closures over B and materials) ----------
  function addWin(x, y, z, w, h, ry, surround = true, gm = glass) {
    B.add(mesh(new THREE.ExtrudeGeometry(archShape(w, h), { depth: 0.12, bevelEnabled: false, curveSegments: 8 }), gm, x, y, z, ry));
    if (surround) B.add(mesh(new THREE.ExtrudeGeometry(archRing(w, h, Math.min(0.5, w * 0.22)), { depth: 0.42, bevelEnabled: false, curveSegments: 8 }), trim, x, y, z, ry), S);
  }
  function rose(x, y, z, r, ry) {
    B.add(mesh(new THREE.CylinderGeometry(r, r, 0.15, 28).rotateX(Math.PI / 2), glass, x, y, z, ry));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.25, 0.42, 6, 32), trim);
    ring.position.set(x, y, z); ring.rotation.y = ry; B.add(ring, S);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(r * 0.32, 0.18, 5, 16), trim);
    inner.position.set(x, y, z); inner.rotation.y = ry; B.add(inner, S);
    for (let i = 0; i < 12; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.16, r * 0.7, 0.3), trim);
      const P = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
      sp.position.set(Math.sin(i / 12 * Math.PI * 2) * r * 0.66, Math.cos(i / 12 * Math.PI * 2) * r * 0.66, 0.05);
      sp.rotation.z = -i / 12 * Math.PI * 2;
      B.add(sp, null, P);
    }
  }
  function crossAt(x, y, z, h, m) {
    B.add(box(0.28, h, 0.28, m, x, y, z));
    B.add(box(h * 0.55, 0.28, 0.28, m, x, y + h * 0.62, z));
  }
  function corbelRake(sx) {
    const z0 = TZ0, z1 = TZ1, zc = (z0 + z1) / 2, hh = TR + 1.4, half = (z0 - z1) / 2;
    for (const sz of [-1, 1]) {
      const L = Math.hypot(half, hh), a = Math.atan2(hh, half);
      const o = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, L + 0.8), trim);
      o.position.set(sx * TX, Y0 + NAVE_H + hh / 2 + 0.25, zc + sz * half / 2); o.rotation.x = sz * a; B.add(o, S);
    }
  }
}

function sphere12(r, m, x, y, z) { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 6), m); o.position.set(x, y, z); return o; }
function archRing(w, h, t) {
  const s = archPath(new THREE.Shape(), w + 2 * t, h + t, -0.3);
  s.holes.push(archPath(new THREE.Path(), w, h, 0));
  return s;
}
/** Rectangle W×H (centred on x=0, base y=0) with arched openings. */
function archHoles(W, H, xs, w, h) {
  const s = new THREE.Shape();
  s.moveTo(-W / 2, 0); s.lineTo(-W / 2, H); s.lineTo(W / 2, H); s.lineTo(W / 2, 0);
  // run along the base between openings so holes touch nothing (start slightly above base)
  s.lineTo(-W / 2, 0);
  for (const x of xs) {
    const p = new THREE.Path(), r = w / 2;
    p.moveTo(x - r, 0.25); p.lineTo(x - r, h - r); p.absarc(x, h - r, r, Math.PI, 0, true); p.lineTo(x + r, 0.25); p.lineTo(x - r, 0.25);
    s.holes.push(p);
  }
  return s;
}
/** Row of small corbels (blocks) from a to b along axis ('x' or 'z'). */
function corbels(B, m, a, b, axis) {
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(2, Math.floor(len / 0.95));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const c = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? 0.38 : 0.5, 0.5, axis === 'x' ? 0.5 : 0.38), m);
    c.position.set(a[0] + (b[0] - a[0]) * u, a[1], a[2] + (b[2] - a[2]) * u);
    B.add(c);
  }
}
