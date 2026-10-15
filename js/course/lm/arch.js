// Gateway Arch National Park, seen from the Illinois side (hole 1 / hole 18).
// The Arch (Saarinen, 1965) stands on the raised grounds Dan Kiley planted with
// curving tree-lined walks and two crescent reflecting ponds; the Grand
// Staircase drops to the levee toward the river (+Z, toward the golfer), and
// the Old Courthouse (iron dome, 1864) and downtown St. Louis rise behind (-Z).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { archGeometry, archMaterial } from '../../scene/skyline.js';
import { mat, lit, seeded, canvasTex, facadeMaterial, tree, SLOT } from './kit.js';

const GY = 5; // height of the Arch grounds above the levee

// ── small modelling helpers ─────────────────────────────────────────────────
const _o = new THREE.Object3D();
function place(g, x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz); _o.scale.set(sx, sy, sz); _o.updateMatrix();
  return g.applyMatrix4(_o.matrix);
}
const bx = (w, h, d, x, y, z, ry = 0) => place(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), x, y, z, ry);
const cy = (rt, rb, h, x, y, z, seg = 12) => place(new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, h / 2, 0), x, y, z);
class Batch {
  constructor() { this.m = new Map(); }
  add(material, ...geoms) { if (!this.m.has(material)) this.m.set(material, []); this.m.get(material).push(...geoms); }
  build(group, shadow = true) {
    for (const [material, list] of this.m) {
      const uv = list.every((g) => g.attributes.uv);
      const norm = list.map((g) => {
        const n = g.index ? g.toNonIndexed() : g;
        for (const k of Object.keys(n.attributes)) if (!(k === 'position' || k === 'normal' || (k === 'uv' && uv))) n.deleteAttribute(k);
        if (!n.attributes.normal) n.computeVertexNormals();
        return n;
      });
      const mesh = new THREE.Mesh(mergeGeometries(norm), material);
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.m.clear();
  }
}
/** Flat ribbon along a polyline of [x, z] points, at height y. */
function ribbon(pts, width, y) {
  const pos = [], uv = [], idx = [];
  let run = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    if (i) run += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const nx = -tz * width / 2, nz = tx * width / 2;
    pos.push(pts[i][0] + nx, y, pts[i][1] + nz, pts[i][0] - nx, y, pts[i][1] - nz);
    uv.push(0, run / width, 1, run / width);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure the ribbon faces up
  const n = g.attributes.normal;
  if (n.getY(0) < 0) { for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]; g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}
const bez = (p0, c, p1, n = 32) => {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return out;
};
/** Polygon (array of [x,z]) to an upward-facing flat mesh at height y. */
function flat(poly, y) {
  const s = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2).translate(0, y, 0);
}
/** Rounded rectangle outline in XZ (CCW seen from above). */
function rrect(x0, x1, z0, z1, r, n = 6) {
  const pts = [];
  const cs = [[x1 - r, z1 - r, Math.PI / 2], [x1 - r, z0 + r, 0], [x0 + r, z0 + r, -Math.PI / 2], [x0 + r, z1 - r, -Math.PI]];
  for (const [cx, cz, a0] of cs) for (let i = 0; i <= n; i++) {
    const a = a0 - (i / n) * (Math.PI / 2);
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}
/** A raised terrace: flat top (topPoly) with grassy banks down to botPoly (same vertex count). */
function mesa(top, bot, h) {
  const g = flat(top, h);
  const pos = [];
  const N = top.length;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const A = [top[i][0], h, top[i][1]], B = [top[j][0], h, top[j][1]], C = [bot[j][0], 0, bot[j][1]], D = [bot[i][0], 0, bot[i][1]];
    const ox = (bot[i][0] - top[i][0]), oz = (bot[i][1] - top[i][1]);
    for (const tri of [[A, B, C], [A, C, D]]) {
      const [p, q, r] = tri;
      const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
      const nx = uy * vz - uz * vy, nz = ux * vy - uy * vx;
      const t = nx * ox + nz * oz > 0 ? [p, q, r] : [p, r, q];
      for (const v of t) pos.push(...v);
    }
  }
  const s = new THREE.BufferGeometry();
  s.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv = [];
  for (let i = 0; i < pos.length; i += 3) uv.push(pos[i], -pos[i + 2]);
  s.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  s.computeVertexNormals();
  return [g, s];
}
/** Windowed tower shaft: box whose facade texture tiles per floor/bay. */
function shaft(w, h, d, x, y, z, rows, cols, floor = 3.8, bay = 3.2) {
  const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
  const n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(n.getY(i)) > 0.5) { uv.setXY(i, 0.02, 0.02); continue; }
    const span = Math.abs(n.getX(i)) > 0.5 ? d : w;
    uv.setXY(i, uv.getX(i) * span / (bay * cols), uv.getY(i) * h / (floor * rows));
  }
  return g;
}
function tiling(m) {
  for (const t of [m.map, m.emissiveMap]) if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; }
  return m;
}

export default function build() {
  const group = new THREE.Group();
  const glow = [];
  const rnd = seeded(1965);
  const B = new Batch();

  // ── materials ──
  const tr = seeded(77);
  const grassTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5e8a3f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = tr() * 30 - 15;
      g.fillStyle = `rgb(${94 + v | 0},${138 + v | 0},${63 + v * 0.5 | 0})`;
      g.fillRect(tr() * w, tr() * h, 3, 3);
    }
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, 0, w / 2, h);
  }, [1, 1]);
  grassTex.repeat.set(1 / 18, 1 / 18);
  const grass = mat(0xffffff, { map: grassTex, roughness: 0.95 });
  const walkM = mat(0xd9d2c3, { roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const granite = lit(0xc9c1b3, 0xffe2b8, { roughness: 0.7, night: 0.06 });
  const darkGranite = mat(0x6d6a66, { roughness: 0.55 });
  const coping = mat(0xbdb5a6, { roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const water = mat(0x34505c, { roughness: 0.06, metalness: 0.35, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  const asphalt = mat(0x45474a, { roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const cobbleTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#5b5148'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = (x * 37 + y * 91) % 23 - 11;
      g.fillStyle = `rgb(${120 + v},${108 + v},${94 + v})`;
      g.fillRect(x * 8 + (y % 2) * 4 + 1, y * 8 + 1, 6, 6);
    }
  }, [1, 1]);
  cobbleTex.repeat.set(1 / 3, 1 / 3);
  const cobble = mat(0xffffff, { map: cobbleTex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const steelDark = mat(0x2f3338, { metalness: 0.6, roughness: 0.45 });
  const lampHead = lit(0xf3efe2, 0xffd59a, { night: 2.2 });
  const upLens = lit(0x8a8f96, 0xfff3dd, { night: 3.0, metalness: 0.4, roughness: 0.3 });
  glow.push(granite, lampHead, upLens);

  // ── the Arch ──
  const a = archGeometry(1.0);
  const archMat = archMaterial();
  const arch = new THREE.Mesh(a.geometry, archMat);
  arch.position.y = GY;
  group.add(arch);
  const legX = a.span / 2;

  // ── the grounds terrace ──
  const top = rrect(-298, 298, -132, 66, 30);
  const bot = rrect(-314, 314, -148, 82, 46);
  const [lawnTop, lawnBank] = mesa(top, bot, GY);
  B.add(grass, lawnTop, lawnBank);

  // leg bases: granite plinth plaza around each leg (triangular legs, 16 m sides at grade)
  for (const s of [-1, 1]) {
    const ring = [];
    for (let i = 0; i < 28; i++) { const an = (i / 28) * Math.PI * 2; ring.push([s * legX + Math.cos(an) * 24, Math.sin(an) * 20]); }
    B.add(walkM, flat(ring, GY + 0.04));
    // granite curb ring
    for (let i = 0; i < 28; i++) {
      const a0 = (i / 28) * Math.PI * 2, a1 = ((i + 1) / 28) * Math.PI * 2;
      const x0 = s * legX + Math.cos(a0) * 24, z0 = Math.sin(a0) * 20, x1 = s * legX + Math.cos(a1) * 24, z1 = Math.sin(a1) * 20;
      const L = Math.hypot(x1 - x0, z1 - z0);
      B.add(granite, bx(L + 0.1, 0.45, 0.5, (x0 + x1) / 2, GY, (z0 + z1) / 2, -Math.atan2(z1 - z0, x1 - x0)));
    }
    // floodlight vaults: six fixtures facing the leg
    for (let k = 0; k < 6; k++) {
      const an = (k / 6) * Math.PI * 2 + 0.3;
      const fx = s * legX + Math.cos(an) * 15, fz = Math.sin(an) * 13;
      const ry = -Math.atan2(-(fz), s * legX - fx) ;
      B.add(darkGranite, bx(2.2, 0.35, 1.4, fx, GY, fz, ry));
      B.add(upLens, place(new THREE.BoxGeometry(1.7, 0.08, 1.0), fx, GY + 0.38, fz, ry));
    }
  }

  // ── reflecting ponds: crescents north and south of the Arch ──
  const pond = (s, grow) => {
    const C = [0, 70], R = 222, a0 = 0.5, a1 = 1.13;
    const out = [], inn = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30, an = a0 + (a1 - a0) * t;
      const hw = 11 * Math.pow(Math.sin(Math.PI * t), 0.55) + 2 + grow;
      const ux = Math.sin(an), uz = -Math.cos(an);
      out.push([s * (C[0] + ux * (R + hw)), C[1] + uz * (R + hw)]);
      inn.push([s * (C[0] + ux * (R - hw)), C[1] + uz * (R - hw)]);
    }
    const poly = out.concat(inn.reverse());
    return s > 0 ? poly : poly.reverse();
  };
  for (const s of [-1, 1]) {
    B.add(coping, flat(pond(s, 1.3), GY + 0.05));
    B.add(water, flat(pond(s, 0), GY + 0.09));
  }

  // ── Kiley's tree-lined walks ──
  const walks = [
    bez([-legX, 18], [0, 70], [legX, 18], 40), // front arc
    bez([-legX, -18], [0, -96], [legX, -18], 40), // back arc
    bez([0, -57], [0, -95], [0, -131], 10), // axis toward the Old Courthouse
    bez([0, 47], [0, 58], [0, 66], 4), // to the Grand Staircase
  ];
  for (const s of [-1, 1]) {
    walks.push(bez([s * (legX + 20), 10], [s * 190, 46], [s * 296, 26], 30)); // toward the north / south gates
    const arc = [];
    for (let i = 0; i <= 30; i++) { const an = 0.42 + (1.22 - 0.42) * (i / 30); arc.push([s * Math.sin(an) * 196, 70 - Math.cos(an) * 196]); }
    walks.push(arc); // pond-side promenade
    walks.push(bez([s * (legX + 18), -12], [s * 130, -60], [s * 120, -128], 24)); // back diagonal
  }
  for (const w of walks) B.add(walkM, ribbon(w, 4.6, GY + 0.06));

  // trees: allées on both sides of every walk
  const trees = [];
  const nearArch = (x, z) => Math.abs(z) < 26 && Math.abs(x) < legX + 30;
  const inPond = (x, z) => {
    const dx = Math.abs(x), dz = z - 70, r = Math.hypot(dx, dz), an = Math.atan2(dx, -dz);
    return Math.abs(r - 222) < 18 && an > 0.44 && an < 1.19;
  };
  const onTerrace = (x, z) => Math.abs(x) < 290 && z > -126 && z < 60;
  const tryTree = (x, z, r, allee = false) => { if (!nearArch(x, z) && !inPond(x, z) && onTerrace(x, z) && !(Math.abs(x) < 40 && z > 40)) trees.push([x, z, r, allee]); };
  for (const w of walks) {
    let acc = 0;
    for (let i = 1; i < w.length; i++) {
      const [x0, z0] = w[i - 1], [x1, z1] = w[i];
      const L = Math.hypot(x1 - x0, z1 - z0);
      acc += L;
      if (acc < 9) continue;
      acc = 0;
      const nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
      for (const sd of [-1, 1]) tryTree(x1 + nx * 5.5 * sd, z1 + nz * 5.5 * sd, 3.2 + rnd() * 0.8, true);
    }
  }
  // groves filling the grounds away from the walks
  for (let i = 0; i < 260; i++) {
    const x = (rnd() * 2 - 1) * 285, z = -125 + rnd() * 175;
    let ok = true;
    for (const w of walks) { for (const p of w) if (Math.hypot(p[0] - x, p[1] - z) < 8) { ok = false; break; } if (!ok) break; }
    if (ok) for (const t of trees) if (Math.hypot(t[0] - x, t[1] - z) < 7) { ok = false; break; }
    if (ok && z < 30) tryTree(x, z, 3.4 + rnd() * 1.4);
  }
  // the allées are London planes (they replaced Kiley's rose ash in 2017); oaks and maples in the groves
  const treeList = trees.map(([x, z, r, allee]) => tree(x, GY, z, r * 3.1, r, { slot: allee ? SLOT.sycamore : rnd() < 0.5 ? SLOT.oak : SLOT.maple }));

  // lamp standards along the front and back arcs and the levee
  const lamps = [];
  for (const w of walks.slice(0, 2)) for (let i = 2; i < w.length - 2; i += 4) lamps.push([w[i][0], GY, w[i][1] + (w === walks[0] ? 2.8 : -2.8)]);
  for (let x = -280; x <= 280; x += 28) lamps.push([x, 0, 101]);
  {
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 4.2, 6).translate(0, 2.1, 0), steelDark, lamps.length);
    const head = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.18, 0.5, 8).translate(0, 4.4, 0), lampHead, lamps.length);
    const m4 = new THREE.Matrix4();
    lamps.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); pole.setMatrixAt(i, m4); head.setMatrixAt(i, m4); });
    pole.castShadow = false;
    group.add(pole, head);
  }

  // ── the Grand Staircase down to the levee (+Z) ──
  const steps = 20, tread = 0.8, rise = GY / steps, SW = 70;
  for (let i = 0; i < steps; i++) {
    const h = GY - i * rise;
    B.add(granite, bx(SW, h, tread + 0.02, 0, 0, 66 + (i + 0.5) * tread));
    for (const s of [-1, 1]) B.add(darkGranite, bx(1.6, h + 0.5, tread + 0.02, s * (SW / 2 + 0.8), 0, 66 + (i + 0.5) * tread));
  }
  // landing + levee: Leonor K. Sullivan Blvd and the cobblestone wharf
  B.add(walkM, flat([[-150, 82], [150, 82], [150, 88], [-150, 88]], 0.05));
  B.add(asphalt, flat([[-320, 88], [320, 88], [320, 100], [-320, 100]], 0.04));
  B.add(cobble, flat([[-320, 100], [320, 100], [320, 140], [-320, 140]], 0.04));
  B.add(granite, bx(640, 0.25, 0.4, 0, 0, 88), bx(640, 0.25, 0.4, 0, 0, 100));

  // west entrance (2018): glazed crescent set into a lawn berm behind the Arch
  {
    const glass = new THREE.MeshStandardMaterial({ color: 0x3c4c58, roughness: 0.1, metalness: 0.6, emissive: 0xffe0b0, emissiveIntensity: 0 });
    glass.userData.night = 0.9;
    glow.push(glass);
    const arcG = new THREE.CylinderGeometry(22, 22, 4, 28, 1, true, Math.PI * 0.7, Math.PI * 0.6).translate(0, GY - 1.4 + 2, -62);
    B.add(glass, arcG);
    B.add(darkGranite, place(new THREE.CylinderGeometry(23.5, 23.5, 0.6, 28, 1, false, Math.PI * 0.7, Math.PI * 0.6), 0, GY + 0.9, -62));
    B.add(walkM, flat([[-16, -40], [16, -40], [12, -52], [-12, -52]], GY + 0.07));
  }

  // ── the Old Courthouse (1839–62, iron dome 1864), facing the Arch ──
  {
    const cg = new THREE.Group();
    const stone = lit(0xdcd1bb, 0xffd9a8, { night: 0.45 });
    const iron = lit(0x4a5753, 0x6d8079, { metalness: 0.55, roughness: 0.45, night: 0.35 });
    const roof = mat(0x6f6e69, { roughness: 0.6 });
    glow.push(stone, iron);
    const C = new Batch();
    C.add(stone, bx(58, 16, 22, 0, 0, 0), bx(22, 16, 58, 0, 0, 0)); // cross plan
    C.add(stone, bx(60, 1.2, 24, 0, 16, 0), bx(24, 1.2, 60, 0, 16, 0)); // cornice
    for (const r of [0, Math.PI / 2]) {
      const s = new THREE.Shape([new THREE.Vector2(-12, 0), new THREE.Vector2(12, 0), new THREE.Vector2(0, 4.2)]);
      const pr = new THREE.ExtrudeGeometry(s, { depth: 60, bevelEnabled: false }).translate(0, 0, -30).rotateY(r + Math.PI / 2).translate(0, 17.2, 0);
      C.add(roof, pr);
    }
    // east portico (facing +Z) with six columns and pediment
    for (let i = 0; i < 6; i++) C.add(stone, cy(0.8, 0.9, 13, -8 + i * 3.2, 2.5, 31.5));
    C.add(stone, bx(20, 2.5, 6, 0, 0, 31.5), bx(20, 1.8, 6, 0, 15.5, 31.5));
    C.add(stone, place(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-10, 0), new THREE.Vector2(10, 0), new THREE.Vector2(0, 3.6)]), { depth: 6, bevelEnabled: false }), 0, 17.3, 28.5));
    // rotunda: drum, colonnade, iron dome and lantern (top ~59 m)
    C.add(stone, cy(11, 11.5, 10, 0, 17, 0, 32));
    for (let k = 0; k < 16; k++) { const an = (k / 16) * Math.PI * 2; C.add(stone, cy(0.45, 0.5, 7.5, Math.cos(an) * 12, 27, Math.sin(an) * 12, 8)); }
    C.add(stone, cy(12.8, 12.8, 1.2, 0, 34.5, 0, 32), cy(9.6, 10.2, 4, 0, 35.7, 0, 32));
    C.add(iron, place(new THREE.SphereGeometry(10, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0, 39.6, 0, 0, 1, 1.15, 1));
    for (let k = 0; k < 16; k++) { // dome ribs
      const an = (k / 16) * Math.PI * 2;
      const pts = [];
      for (let i = 0; i <= 8; i++) { const p = (i / 8) * Math.PI / 2; pts.push(new THREE.Vector3(Math.cos(an) * Math.cos(p) * 10.15, 39.6 + Math.sin(p) * 11.5, Math.sin(an) * Math.cos(p) * 10.15)); }
      C.add(roof, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.18, 4));
    }
    C.add(iron, cy(1.9, 2.2, 5, 0, 50.5, 0, 12));
    for (let k = 0; k < 8; k++) { const an = (k / 8) * Math.PI * 2; C.add(stone, cy(0.15, 0.15, 3, Math.cos(an) * 2.2, 51, Math.sin(an) * 2.2, 5)); }
    C.add(iron, place(new THREE.SphereGeometry(2.3, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), 0, 55.5, 0, 0, 1, 1.3, 1), cy(0.1, 0.25, 1.4, 0, 58.4, 0, 6));
    // windows on the wings
    const winM = lit(0x2a3036, 0xffcf8a, { night: 0.9, roughness: 0.3 });
    glow.push(winM);
    for (let i = 0; i < 5; i++) for (const lvl of [3.2, 9.6]) for (const sx of [-1, 1]) {
      const x = sx * (13.5 + i * 3.4);
      C.add(winM, bx(1.4, 3.4, 0.3, x, lvl, 11.05), bx(1.4, 3.4, 0.3, x, lvl, -11.05));
      C.add(winM, bx(0.3, 3.4, 1.4, 11.05, lvl, x), bx(0.3, 3.4, 1.4, -11.05, lvl, x));
    }
    C.build(cg);
    cg.position.set(150, 0, -238);
    group.add(cg);
  }

  // ── downtown St. Louis behind the Arch ──
  {
    const fTan = tiling(facadeMaterial('#cbbfa8', { cols: 6, rows: 6, win: '#3a4048', seed: 3 }));
    const fGlass = tiling(facadeMaterial('#7d8d9a', { cols: 8, rows: 8, win: '#2c3a46', frame: '#a9b6c0', seed: 7 }));
    const fRed = tiling(facadeMaterial('#8c5a48', { cols: 6, rows: 6, win: '#30343a', seed: 11 }));
    const fLight = tiling(facadeMaterial('#d8d6d0', { cols: 6, rows: 6, win: '#46525e', seed: 13 }));
    glow.push(fTan, fGlass, fRed, fLight);
    const roofM = mat(0x7d7a74, { roughness: 0.7 });
    const copper = lit(0x5f8f7c, 0x9fd4bf, { roughness: 0.55, metalness: 0.25, night: 0.5 });
    const crownLit = lit(0xd9cfbd, 0xfff0d0, { night: 0.9 });
    glow.push(copper, crownLit);
    const T = new Batch();
    const facs = [fTan, fGlass, fRed, fLight];
    const R = (w, h, d, x, z, f, y = 0) => { T.add(f, shaft(w, h, d, x, y, z, 6, f === fGlass ? 8 : 6)); T.add(roofM, bx(w + 0.6, 1.2, d + 0.6, x, y + h, z)); };
    // Heights are drawn at ~0.62 of real so the Arch reads as it does from the river
    // (the real towers stand several blocks farther back than this footprint allows).
    // Metropolitan Square: granite shaft and green hipped copper roof
    R(36, 96, 36, -40, -236, fLight);
    T.add(crownLit, bx(32, 4, 32, -40, 97.2, -236));
    T.add(copper, place(new THREE.ConeGeometry(25, 16, 4).rotateY(Math.PI / 4).translate(0, 8, 0), -40, 101.2, -236));
    // One AT&T Center: stepped setbacks
    R(34, 76, 34, 66, -222, fTan);
    R(28, 18, 28, 66, -222, fTan, 77.2);
    R(21, 12, 21, 66, -222, fTan, 96.4);
    T.add(crownLit, place(new THREE.ConeGeometry(11, 6, 4).rotateY(Math.PI / 4).translate(0, 3, 0), 66, 109.6, -222));
    // One US Bank Plaza: glass slab
    R(32, 88, 24, -140, -228, fGlass);
    // Thomas F. Eagleton Courthouse: crowned with a drum and dome
    R(40, 80, 30, -235, -278, fLight);
    T.add(crownLit, cy(9, 11, 7, -235, 81.2, -278, 16));
    T.add(copper, place(new THREE.SphereGeometry(8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), -235, 88.2, -278));
    // Laclede Gas / One Bell / mid-rises
    R(28, 74, 28, 238, -210, fGlass);
    R(26, 60, 32, 196, -296, fRed);
    const spots = [[-95, -280, 46], [-165, -292, 36], [18, -290, 56], [245, -270, 40], [-285, -215, 30], [290, -240, 26],
      [-10, -306, 34], [100, -300, 44], [-260, -306, 38], [140, -305, 30], [-200, -250, 28], [300, -300, 24]];
    spots.forEach(([x, z, h], i) => {
      const w = 22 + (i * 7) % 14, d = 20 + (i * 11) % 16;
      R(w, h, d, x, z, facs[i % 4]);
    });
    // street-front row of older low blocks along Memorial Drive
    for (let x = -300, i = 0; x < 300; i++) {
      const w = 16 + (i * 13) % 18;
      if (Math.abs(x + w / 2 - 150) > 48) R(w - 2, 10 + (i * 7) % 14, 18, x + w / 2, -172 - (i % 3) * 4, facs[(i + 2) % 4]);
      x += w;
    }
    T.build(group);
  }

  // people strolling the grounds and the levee (instanced, three parts)
  {
    const spots = [];
    for (let i = 0; i < 90; i++) {
      const w = walks[Math.floor(rnd() * walks.length)];
      const p = w[Math.floor(rnd() * w.length)];
      spots.push([p[0] + (rnd() - 0.5) * 3, GY + 0.06, p[1] + (rnd() - 0.5) * 3]);
    }
    for (let i = 0; i < 40; i++) spots.push([(rnd() * 2 - 1) * 250, 0.04, 103 + rnd() * 30]);
    for (let i = 0; i < 26; i++) spots.push([(rnd() * 2 - 1) * 30, GY - (rnd() * 18 | 0) * rise, 66 + rnd() * 15]);
    // people on the stairs sit on their step
    for (let i = 130; i < spots.length; i++) { const k = Math.max(0, Math.min(steps - 1, Math.floor((spots[i][2] - 66) / tread))); spots[i][1] = GY - k * rise; }
    const n = spots.length;
    const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.85, 0.2).translate(0, 0.425, 0), mat(0xffffff), n);
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.62, 0.25).translate(0, 1.16, 0), mat(0xffffff), n);
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.6, 0), mat(0xffffff, { roughness: 0.6 }), n);
    const shirts = [0xc8443a, 0x2f5d8a, 0xe8e2d4, 0x3f6e48, 0xd9a441, 0x6b4b7a, 0x1e2a36, 0xe07a5f];
    const skins = [0x8d5524, 0xc68642, 0xe0ac69, 0xf1c27d, 0x5c3a21];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), e = new THREE.Euler();
    spots.forEach(([x, y, z], i) => {
      const s = 0.92 + rnd() * 0.14;
      m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(0, rnd() * 6.28, 0)), new THREE.Vector3(s, s, s));
      legs.setMatrixAt(i, m4); body.setMatrixAt(i, m4); head.setMatrixAt(i, m4);
      legs.setColorAt(i, c.set(rnd() < 0.5 ? 0x2c3442 : 0x5a5348));
      body.setColorAt(i, c.set(shirts[Math.floor(rnd() * shirts.length)]));
      head.setColorAt(i, c.set(skins[Math.floor(rnd() * skins.length)]));
    });
    for (const m of [legs, body, head]) { m.castShadow = false; group.add(m); }
  }

  // night: soft pools of floodlight round the legs and halos on the lamps
  const halo = canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,215,0.45)'); gr.addColorStop(1, 'rgba(255,230,200,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const poolM = new THREE.MeshBasicMaterial({ map: halo, color: 0xffe9c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const s of [-1, 1]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(56, 48).rotateX(-Math.PI / 2), poolM);
    pl.position.set(s * legX, GY + 0.15, 0);
    pl.castShadow = false; pl.renderOrder = 2;
    group.add(pl);
  }
  const hp = [];
  for (const [x, y, z] of lamps) hp.push(x, y + 4.45, z);
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
  const haloM = new THREE.PointsMaterial({ map: halo, color: 0xffd59a, size: 3.2, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const halos = new THREE.Points(hg, haloM);
  group.add(halos);

  B.build(group);
  const update = (t, dt, day) => {
    const n = 1 - day;
    poolM.opacity = 0.55 * n;
    haloM.opacity = 0.9 * n;
    halos.visible = n > 0.02;
  };
  return { group, glow, arch: archMat, update, trees: treeList };
}
