// Saint Louis Zoo (Forest Park): the 1904 World's Fair Flight Cage, the 1930
// Mission-revival Bird House, McDonnell Polar Bear Point, a savanna paddock
// (giraffes, zebras, elephants), the flamingo pond, curving visitor paths and
// the Emerson Zooline Railroad (2-ft gauge loop) with a steam-outline train.
// Local frame: -Z = direction of play, +X = golfer's right. The zoo sits to the
// right of the fairway, so its -X side (Flight Cage broadside, west promenade)
// and its +Z side (Bird House, flamingos, station) are the show faces.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, lit, seeded, canvasTex } from './kit.js';

// ---------------------------------------------------------------- helpers
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
function xf(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  return _m.compose(_p, _q, _s);
}
/** Collects geometry pieces with a per-piece vertex colour, merges into one mesh. */
class Merge {
  constructor() { this.list = []; }
  add(geo, color, m = null, jitter = 0, rnd = null) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (m) g.applyMatrix4(m);
    _c.set(color);
    if (jitter && rnd) { const f = 1 + (rnd() - 0.5) * 2 * jitter; _c.multiplyScalar(f); }
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.clearGroups();
    this.list.push(g);
    return this;
  }
  mesh(material) {
    const g = mergeGeometries(this.list, false);
    g.computeBoundingSphere();
    const o = new THREE.Mesh(g, material);
    o.castShadow = true; o.receiveShadow = true;
    return o;
  }
  geometry() { return mergeGeometries(this.list, false); }
}
function inst(geo, material, list, animated = false) {
  const im = new THREE.InstancedMesh(geo, material, list.length);
  list.forEach((o, i) => {
    im.setMatrixAt(i, xf(o.x, o.y || 0, o.z, o.rx || 0, o.ry || 0, o.rz || 0, o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1));
    if (o.color !== undefined) im.setColorAt(i, _c.set(o.color));
  });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = true; im.receiveShadow = true;
  if (animated) im.frustumCulled = false;
  else { im.computeBoundingBox(); im.computeBoundingSphere(); }
  return im;
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
/** Flat strip following points (XZ), top at height y. */
function ribbon(pts, w, y, closed = false) {
  const n = pts.length, pos = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const a = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)];
    const b = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const nx = -dz, nz = dx;
    if (i > 0) acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    pos.push(pts[i].x + nx * w / 2, y, pts[i].z + nz * w / 2, pts[i].x - nx * w / 2, y, pts[i].z - nz * w / 2);
    uv.push(0, acc / w, 1, acc / w);
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const k = i * 2, k2 = ((i + 1) % n) * 2;
    idx.push(k, k2, k + 1, k + 1, k2, k2 + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const nrm = new Float32Array(pos.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}
function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
/** Faceted boulder. */
function rockGeo(seed, rough = 0.32) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = hash3(Math.round(x * 50) + seed, Math.round(y * 50), Math.round(z * 50));
    const f = 1 + (h - 0.5) * 2 * rough;
    p.setXYZ(i, x * f, y * f, z * f);
  }
  g.computeVertexNormals();
  return g;
}
/** Hip roof: footprint w (x) × d (z), height h, ridge along x. */
function hipRoof(w, d, h) {
  const rx = Math.max(0, w / 2 - d / 2);
  const A = [-w / 2, 0, -d / 2], B = [w / 2, 0, -d / 2], C = [w / 2, 0, d / 2], D = [-w / 2, 0, d / 2];
  const R1 = [-rx, h, 0], R2 = [rx, h, 0];
  const tris = [D, C, R2, D, R2, R1, B, A, R1, B, R1, R2, A, D, R1, C, B, R2];
  const pos = [], uv = [];
  const slope = Math.hypot(h, d / 2) / h;
  for (let i = 0; i < tris.length; i += 3) {
    const f = Math.floor(i / 3);
    const endFace = f >= 4;
    for (let k = 0; k < 3; k++) {
      const v = tris[i + k];
      pos.push(...v);
      uv.push((endFace ? v[2] : v[0]) / 0.9, (h - v[1]) * slope / 0.42);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
function scaleUV(g, su, sv, swap = false) {
  const u = g.attributes.uv;
  for (let i = 0; i < u.count; i++) {
    let a = u.getX(i), b = u.getY(i);
    if (swap) [a, b] = [b, a];
    u.setXY(i, a * su, b * sv);
  }
  return g;
}
/** A cylinder spanning from a to b. */
function strut(a, b, r0, r1 = r0, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r1, r0, d.length(), seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
/** Precomputed arc-length lookup for a curve: pos(s, out) and heading. */
function lut(curve, n, closed) {
  const pts = curve.getSpacedPoints(n);
  if (closed) pts.pop();
  const L = curve.getLength();
  const N = pts.length;
  const xs = new Float32Array(N), zs = new Float32Array(N);
  pts.forEach((p, i) => { xs[i] = p.x; zs[i] = p.z; });
  const step = closed ? L / N : L / (N - 1);
  return {
    L, pts,
    pos(s, out) {
      let f;
      if (closed) { s = ((s % L) + L) % L; f = s / step; } else { f = Math.min(Math.max(s, 0), L) / step; }
      let i0 = Math.floor(f); const u = f - i0;
      let i1 = i0 + 1;
      if (closed) { i0 %= N; i1 %= N; } else { i0 = Math.min(i0, N - 1); i1 = Math.min(i1, N - 1); }
      out.x = xs[i0] + (xs[i1] - xs[i0]) * u; out.z = zs[i0] + (zs[i1] - zs[i0]) * u;
      return out;
    },
  };
}

// ---------------------------------------------------------------- textures
function meshTex() {
  return canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(38,46,42,0.07)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(40,48,44,0.55)'; g.lineWidth = 1.5;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * 16); g.lineTo(w, i * 16); g.stroke();
    }
  }, [1, 1]);
}
function giraffeTex() {
  const r = seeded(41);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#efe2c2'; g.fillRect(0, 0, w, h);
    const n = 4, cs = w / n;
    for (let i = -1; i <= n; i++) for (let j = -1; j <= n; j++) {
      const cx = (i + 0.5 + (r() - 0.5) * 0.3) * cs, cy = (j + 0.5 + (j % 2) * 0.5 + (r() - 0.5) * 0.3) * cs;
      g.fillStyle = ['#8a4520', '#9a5126', '#7c3c1a'][Math.floor(r() * 3)];
      g.beginPath();
      const k = 5 + Math.floor(r() * 3);
      for (let a = 0; a < k; a++) {
        const ang = (a / k) * Math.PI * 2 + r() * 0.4, rr = cs * (0.4 + r() * 0.06);
        const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr;
        a ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath(); g.fill();
    }
  }, [1, 1]);
}
function zebraTex() {
  const r = seeded(7);
  return canvasTex(256, 32, (g, w, h) => {
    g.fillStyle = '#f2efe6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#17171a';
    let x = 0;
    while (x < w) { const sw = 5 + r() * 4; g.fillRect(x, 0, sw, h); x += sw + 5 + r() * 4; }
  }, [1, 1]);
}
function dirtTex() {
  const r = seeded(19);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#bba57a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) {
      const v = r();
      g.fillStyle = v < 0.45 ? 'rgba(140,120,80,0.35)' : v < 0.8 ? 'rgba(214,196,150,0.35)' : 'rgba(120,135,70,0.45)';
      const s = 2 + r() * 9;
      g.fillRect(r() * w, r() * h, s, s * (0.4 + r()));
    }
  }, [6, 6]);
}
function tileTex() {
  return canvasTex(64, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#7e2f1d'); gr.addColorStop(0.35, '#b85434'); gr.addColorStop(0.6, '#c4643f'); gr.addColorStop(1, '#7e2f1d');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(60,20,12,0.55)'; g.fillRect(0, h - 7, w, 7);
    g.fillStyle = 'rgba(255,220,190,0.08)'; g.fillRect(0, 0, w, 5);
  }, [1, 1]);
}
/** Stucco wall with arched windows; drawn in metres (wm × hm). */
function stuccoFacade(wm, hm, draw) {
  const S = 40;
  const mk = (emissive) => canvasTex(Math.round(wm * S), Math.round(hm * S), (g, w, h) => {
    g.save(); g.scale(S, S);
    if (!emissive) {
      g.fillStyle = '#e8dcc3'; g.fillRect(0, 0, wm, hm);
      const r = seeded(3);
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '160,140,110' : '255,250,235'},0.12)`; g.fillRect(r() * wm, r() * hm, 0.3 + r(), 0.2 + r() * 0.5); }
      g.fillStyle = '#b9a989'; g.fillRect(0, hm - 0.7, wm, 0.7); // plinth
      g.fillStyle = 'rgba(120,100,70,0.25)'; g.fillRect(0, 0, wm, 0.25);
    } else { g.fillStyle = '#000'; g.fillRect(0, 0, wm, hm); }
    draw(g, emissive);
    g.restore();
  });
  const map = mk(false), em = mk(true);
  const m = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.92 });
  m.userData.night = 1.25;
  return m;
}
function archWin(g, x, y, w, h, emissive, lamp = '#ffcf8a') {
  // x,y = bottom-left in canvas-metres (y down), arch on top
  const top = y - h;
  if (!emissive) {
    g.fillStyle = '#c9b48f';
    g.beginPath(); g.moveTo(x - 0.18, y + 0.1); g.lineTo(x - 0.18, top + w / 2); g.arc(x + w / 2, top + w / 2, w / 2 + 0.18, Math.PI, 0); g.lineTo(x + w + 0.18, y + 0.1); g.closePath(); g.fill();
  }
  g.fillStyle = emissive ? lamp : '#26302f';
  g.beginPath(); g.moveTo(x, y); g.lineTo(x, top + w / 2); g.arc(x + w / 2, top + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y); g.closePath(); g.fill();
  g.strokeStyle = emissive ? 'rgba(80,50,20,0.9)' : '#e9e0cc'; g.lineWidth = 0.06;
  g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, top + 0.1); g.moveTo(x, y - h * 0.45); g.lineTo(x + w, y - h * 0.45); g.stroke();
}

// ---------------------------------------------------------------- animals (facing +X)
function giraffeGeos() {
  const body = new Merge(), neck = new Merge();
  const tan = 0xffffff, leg = 0xf3e6c8, dark = 0x3a2a1e;
  body.add(scaleUV(new THREE.SphereGeometry(1, 16, 10), 3, 2), tan, xf(0, 2.32, 0, 0, 0, 0.13, 1.12, 0.6, 0.44));
  body.add(scaleUV(new THREE.SphereGeometry(1, 12, 8), 2, 1.5), tan, xf(0.55, 2.5, 0, 0, 0, 0.3, 0.55, 0.55, 0.42));
  for (const [lx, lz] of [[0.72, 0.22], [0.72, -0.22], [-0.78, 0.22], [-0.78, -0.22]]) {
    body.add(scaleUV(new THREE.CylinderGeometry(0.1, 0.065, 2.05, 7), 1, 3), leg, xf(lx, 1.05, lz));
    body.add(new THREE.CylinderGeometry(0.075, 0.08, 0.12, 7), dark, xf(lx, 0.06, lz));
  }
  body.add(strut(V3(-1.08, 2.45, 0), V3(-1.25, 1.55, 0), 0.04), leg);
  body.add(new THREE.SphereGeometry(0.08, 6, 4), dark, xf(-1.26, 1.5, 0, 0, 0, 0, 1, 1.8, 1));
  // neck pivot at (0.82, 2.55, 0) — neck built relative to the pivot
  const a = 0.42, L = 2.35, tx = Math.sin(a) * L, ty = Math.cos(a) * L;
  neck.add(scaleUV(strut(V3(0, 0, 0), V3(tx, ty, 0), 0.3, 0.14, 9), 2, 3), tan);
  neck.add(strut(V3(-0.2, 0.2, 0), V3(tx - 0.15, ty - 0.05, 0), 0.04, 0.03, 4), 0x6b4022);
  neck.add(scaleUV(new THREE.SphereGeometry(1, 10, 7), 1, 1), tan, xf(tx + 0.22, ty + 0.05, 0, 0, 0, -0.55, 0.36, 0.15, 0.13));
  neck.add(new THREE.SphereGeometry(0.08, 6, 4), 0x5a4030, xf(tx + 0.5, ty - 0.13, 0));
  for (const s of [-1, 1]) {
    neck.add(new THREE.CylinderGeometry(0.025, 0.03, 0.2, 5), dark, xf(tx + 0.02, ty + 0.2, s * 0.06));
    neck.add(new THREE.SphereGeometry(0.04, 5, 4), dark, xf(tx + 0.02, ty + 0.31, s * 0.06));
    neck.add(new THREE.ConeGeometry(0.05, 0.16, 5), leg, xf(tx - 0.05, ty + 0.1, s * 0.13, s * 1.2, 0, 0));
  }
  return { body: body.geometry(), neck: neck.geometry() };
}
function zebraGeo() {
  const z = new Merge(), wh = 0xffffff, dark = 0x1c1c1e;
  z.add(scaleUV(new THREE.SphereGeometry(1, 14, 9), 9, 1), wh, xf(0, 1.02, 0, 0, 0, 0.04, 0.85, 0.4, 0.29));
  for (const [lx, lz] of [[0.55, 0.13], [0.55, -0.13], [-0.58, 0.13], [-0.58, -0.13]]) {
    z.add(scaleUV(new THREE.CylinderGeometry(0.065, 0.045, 0.82, 6), 7, 1, true), wh, xf(lx, 0.45, lz));
    z.add(new THREE.CylinderGeometry(0.05, 0.055, 0.08, 6), dark, xf(lx, 0.04, lz));
  }
  z.add(scaleUV(strut(V3(0.62, 1.1, 0), V3(0.98, 1.55, 0), 0.19, 0.12, 8), 6, 1, true), wh);
  z.add(scaleUV(new THREE.SphereGeometry(1, 10, 6), 4, 1), wh, xf(1.15, 1.4, 0, 0, 0, -1.0, 0.3, 0.12, 0.1));
  z.add(new THREE.SphereGeometry(0.08, 6, 4), dark, xf(1.32, 1.16, 0));
  z.add(new THREE.BoxGeometry(0.5, 0.1, 0.04), dark, xf(0.84, 1.42, 0, 0, 0, 0.9));
  z.add(strut(V3(-0.82, 1.1, 0), V3(-0.92, 0.6, 0), 0.025), dark);
  for (const s of [-1, 1]) z.add(new THREE.ConeGeometry(0.04, 0.16, 4), wh, xf(1.02, 1.62, s * 0.07));
  return z.geometry();
}
function elephantGeo() {
  const e = new Merge(), gr = 0x8b8681, dk = 0x6d6965;
  e.add(new THREE.SphereGeometry(1, 16, 12), gr, xf(0, 2.15, 0, 0, 0, 0.05, 1.7, 1.12, 0.95));
  for (const [lx, lz] of [[1.0, 0.48], [1.0, -0.48], [-1.05, 0.5], [-1.05, -0.5]]) {
    e.add(new THREE.CylinderGeometry(0.36, 0.34, 1.7, 9), gr, xf(lx, 0.85, lz));
    e.add(new THREE.CylinderGeometry(0.37, 0.37, 0.08, 9), 0x9d978f, xf(lx, 0.04, lz));
  }
  e.add(new THREE.SphereGeometry(0.85, 14, 10), gr, xf(1.75, 2.7, 0, 0, 0, 0, 0.85, 1, 0.82));
  for (const s of [-1, 1]) {
    e.add(new THREE.SphereGeometry(1, 10, 8), dk, xf(1.45, 2.65, s * 0.72, s * 0.25, s * 0.35, 0, 0.12, 0.95, 0.8));
    e.add(strut(V3(2.15, 2.2, s * 0.25), V3(2.6, 1.75, s * 0.32), 0.07, 0.03, 6), 0xeee4cc);
  }
  e.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(2.3, 2.5, 0), V3(2.6, 1.9, 0), V3(2.72, 1.1, 0), V3(2.8, 0.45, 0), V3(2.95, 0.3, 0)]), 16, 0.16, 7), gr);
  e.add(strut(V3(-1.68, 2.4, 0), V3(-1.8, 1.4, 0), 0.04), dk);
  return e.geometry();
}
function bearGeo() {
  const b = new Merge(), c = 0xf0e9d8, dk = 0x1c1c1c;
  b.add(new THREE.SphereGeometry(1, 14, 10), c, xf(0, 0.95, 0, 0, 0, 0.02, 1.05, 0.56, 0.52));
  b.add(new THREE.SphereGeometry(0.55, 12, 8), c, xf(0.75, 1.0, 0, 0, 0, 0, 1, 0.9, 0.85));
  for (const [lx, lz] of [[0.75, 0.24], [0.75, -0.24], [-0.68, 0.26], [-0.68, -0.26]]) {
    b.add(new THREE.CylinderGeometry(0.17, 0.19, 0.75, 8), c, xf(lx, 0.37, lz));
  }
  b.add(new THREE.SphereGeometry(1, 10, 8), c, xf(1.3, 1.08, 0, 0, 0, -0.2, 0.34, 0.24, 0.24));
  b.add(new THREE.SphereGeometry(1, 8, 6), c, xf(1.6, 1.0, 0, 0, 0, -0.15, 0.17, 0.12, 0.13));
  b.add(new THREE.SphereGeometry(0.05, 6, 4), dk, xf(1.76, 1.02, 0));
  for (const s of [-1, 1]) b.add(new THREE.SphereGeometry(0.06, 6, 4), c, xf(1.22, 1.3, s * 0.15));
  return b.geometry();
}
function waderGeo(body, legC, bill, k = 1) {
  const w = new Merge();
  w.add(new THREE.SphereGeometry(1, 10, 7), body, xf(0, 1.0 * k, 0, 0, 0, 0.15, 0.3 * k, 0.17 * k, 0.16 * k));
  w.add(new THREE.ConeGeometry(0.1 * k, 0.25 * k, 5), body, xf(-0.33 * k, 1.03 * k, 0, 0, 0, Math.PI / 2 + 0.3));
  w.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0.22, 1.02, 0), V3(0.32, 1.25, 0), V3(0.17, 1.45, 0), V3(0.24, 1.62, 0), V3(0.36, 1.6, 0)].map((v) => v.multiplyScalar(k))), 10, 0.032 * k, 5), body);
  w.add(new THREE.SphereGeometry(0.065 * k, 7, 5), body, xf(0.38 * k, 1.61 * k, 0));
  w.add(new THREE.ConeGeometry(0.035 * k, 0.16 * k, 5), bill, xf(0.48 * k, 1.56 * k, 0, 0, 0, -2.1));
  for (const s of [-1, 1]) w.add(new THREE.CylinderGeometry(0.014 * k, 0.012 * k, 0.9 * k, 4), legC, xf(0.02 * k, 0.45 * k, s * 0.05 * k));
  return w.geometry();
}
function flyerGeo() {
  const g = new THREE.BufferGeometry();
  // body + two wings with raised tips (flap = scale y)
  const p = [
    0.28, 0, 0, -0.05, 0, 0.6, -0.05, 0, 0.06, // right wing (tip at z +0.6)
    0.28, 0, 0, -0.05, 0, -0.06, -0.05, 0, -0.6,
    0.32, 0, 0, -0.35, 0.02, 0.05, -0.35, 0.02, -0.05,
  ];
  // lift wing tips
  p[4] = 0.25; p[16] = 0.25;
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}
function personGeos() {
  const legs = new Merge(), torso = new Merge(), head = new Merge();
  legs.add(new THREE.BoxGeometry(0.15, 0.84, 0.18), 0xffffff, xf(-0.09, 0.42, 0));
  legs.add(new THREE.BoxGeometry(0.15, 0.84, 0.18), 0xffffff, xf(0.09, 0.42, 0));
  torso.add(new THREE.BoxGeometry(0.42, 0.6, 0.24), 0xffffff, xf(0, 1.13, 0));
  torso.add(new THREE.BoxGeometry(0.09, 0.56, 0.11), 0xffffff, xf(0.26, 1.12, 0, 0, 0, 0.06));
  torso.add(new THREE.BoxGeometry(0.09, 0.56, 0.11), 0xffffff, xf(-0.26, 1.12, 0, 0, 0, -0.06));
  head.add(new THREE.SphereGeometry(0.115, 8, 6), 0xffffff, xf(0, 1.6, 0, 0, 0, 0, 1, 1.12, 1));
  head.add(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 6), 0xffffff, xf(0, 1.45, 0));
  return { legs: legs.geometry(), torso: torso.geometry(), head: head.geometry() };
}
const SHIRTS = [0xd9473b, 0x2f6db5, 0xf2f0ea, 0x3d8a5a, 0xf0b33c, 0x7a4fa0, 0x1f2a38, 0xe27aa0, 0x58a6c9, 0xc6c1b3, 0x9b2335, 0x2a2a2a];
const PANTS = [0x2c3442, 0x5a5348, 0x1d2129, 0x7d6e58, 0x3b4f6b, 0xb9ab8c];
const SKIN = [0x8d5524, 0xc68642, 0xe0ac69, 0xf1c27d, 0x5c3a21, 0xd8a47f];

// ---------------------------------------------------------------- build
export default function build() {
  const group = new THREE.Group();
  const glow = [];
  const rnd = seeded(1904);
  const vcMat = mat(0xffffff, { vertexColors: true, roughness: 0.88 });
  const vcMetal = mat(0xffffff, { vertexColors: true, roughness: 0.5, metalness: 0.45 });
  const vcPaint = mat(0xffffff, { vertexColors: true, roughness: 0.45, metalness: 0.15 });
  const water = new THREE.MeshStandardMaterial({ color: 0x3f6f78, roughness: 0.08, metalness: 0.25 });
  const M = new Merge(); // static ground-level & architecture bits (vertex coloured)
  const MF = new Merge(); // steel frames
  const W = new Merge(); // water
  const zones = []; // exclusion areas for trees: {x,z,rx,rz}
  const ell = (x, z, rx, rz) => zones.push({ x, z, rx, rz });

  // ---------- railroad loop (Emerson Zooline, 2-ft gauge)
  const rail = new THREE.CatmullRomCurve3([
    V3(-67, 0, -55), V3(-58, 0, -81), V3(-28, 0, -87), V3(10, 0, -86), V3(44, 0, -84), V3(63, 0, -72), V3(67, 0, -40),
    V3(67, 0, 0), V3(67, 0, 40), V3(63, 0, 73), V3(44, 0, 86), V3(10, 0, 87), V3(-28, 0, 86), V3(-58, 0, 82), V3(-67, 0, 58), V3(-68, 0, 0),
  ], true, 'centripetal');
  const RL = lut(rail, 900, true);
  const railPts = RL.pts;
  M.add(ribbon(railPts, 2.0, 0.07, true), 0x8a8073);
  {
    const off = (pts, d) => pts.map((p, i) => {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
      return V3(p.x - dz / l * d, 0, p.z + dx / l * d);
    });
    MF.add(ribbon(off(railPts, 0.305), 0.07, 0.24, true), 0x5d5650);
    MF.add(ribbon(off(railPts, -0.305), 0.07, 0.24, true), 0x5d5650);
    const ties = [];
    const nT = Math.floor(RL.L / 0.7), tp = V3(0, 0, 0), tq = V3(0, 0, 0);
    for (let i = 0; i < nT; i++) {
      RL.pos(i * 0.7, tp); RL.pos(i * 0.7 + 0.2, tq);
      ties.push({ x: tp.x, y: 0.1, z: tp.z, ry: Math.atan2(tq.x - tp.x, tq.z - tp.z) });
    }
    const tieIM = inst(new THREE.BoxGeometry(1.15, 0.12, 0.18), mat(0x4a3b2e, { roughness: 0.95 }), ties);
    tieIM.castShadow = false;
    group.add(tieIM);
  }

  // ---------- visitor paths
  const pathDefs = [
    [[-6, 90], [-9, 70], [-15, 48], [-14, 25], [-18, 0], [-16, -30], [-8, -50], [-12, -68], [-20, -78]],
    [[-66, 38], [-42, 39], [-16, 46], [8, 47], [30, 45], [50, 50], [61, 46]],
    [[-12, -52], [-36, -54], [-59, -47], [-60, -10], [-59, 24], [-52, 34], [-42, 39]],
    [[-16, -32], [5, -37], [30, -37], [52, -35]],
    [[52, -35], [60, -14], [60, 14], [58, 34], [50, 50]],
    [[-15, 48], [-8, 60], [6, 74], [24, 78], [40, 76]],
  ];
  const paths = pathDefs.map((d) => lut(new THREE.CatmullRomCurve3(d.map(([x, z]) => V3(x, 0, z)), false, 'centripetal'), 120, false));
  for (const P of paths) {
    M.add(ribbon(P.pts, 4.2, 0.075), 0xbfb3a0);
    M.add(ribbon(P.pts, 4.9, 0.06), 0x7d7466);
  }
  const nearPath = (x, z, d) => paths.some((P) => P.pts.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < d * d));
  const nearRail = (x, z, d) => railPts.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < d * d);

  // ---------- lamps along paths
  const lampPosts = [], lampHeads = [];
  paths.forEach((P, pi) => {
    const tp = V3(0, 0, 0), tq = V3(0, 0, 0);
    for (let s = 6 + pi * 3; s < P.L - 3; s += 17) {
      P.pos(s, tp); P.pos(s + 0.5, tq);
      const dx = tq.x - tp.x, dz = tq.z - tp.z, l = Math.hypot(dx, dz) || 1;
      const side = (Math.floor(s / 17) % 2 ? 1 : -1) * 2.7;
      const x = tp.x - dz / l * side, z = tp.z + dx / l * side;
      lampPosts.push({ x, z });
      lampHeads.push({ x, y: 3.75, z });
    }
  });
  {
    const pg = new Merge();
    pg.add(new THREE.CylinderGeometry(0.06, 0.09, 3.5, 6), 0x1f2b25, xf(0, 1.75, 0));
    pg.add(new THREE.CylinderGeometry(0.16, 0.2, 0.35, 6), 0x1f2b25, xf(0, 0.17, 0));
    pg.add(new THREE.CylinderGeometry(0.2, 0.1, 0.15, 6), 0x1f2b25, xf(0, 3.5, 0));
    pg.add(new THREE.ConeGeometry(0.26, 0.22, 6), 0x1f2b25, xf(0, 4.12, 0));
    group.add(inst(pg.geometry(), vcMetal, lampPosts));
    const lampMat = lit(0xfff3d6, 0xffc87a, { night: 3.0, roughness: 0.3 });
    glow.push(lampMat);
    const heads = inst(new THREE.SphereGeometry(0.3, 10, 8), lampMat, lampHeads);
    heads.castShadow = false;
    group.add(heads);
    // warm light pools on the paving (invisible by day: black + additive)
    const poolTex = canvasTex(64, 64, (g, w, h) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const poolMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb45e, emissiveMap: poolTex, emissiveIntensity: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    poolMat.userData.night = 0.9;
    glow.push(poolMat);
    const pools = inst(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), poolMat, lampPosts.map((p) => ({ x: p.x, y: 0.12, z: p.z })));
    pools.castShadow = false; pools.receiveShadow = false;
    pools.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, opacity: 0, alphaTest: 0.5 });
    group.add(pools);
  }

  // ---------- Flight Cage (1904): 69.5 × 25.6 × 15.2 m, long axis along Z
  {
    const cx = -40, cz = -11, Wd = 25.6, Ln = 69.5, hw = 8.6, H = 15.2;
    ell(cx, cz, Wd / 2 + 3, Ln / 2 + 3);
    const prof = [];
    prof.push([-Wd / 2, 0]);
    const ARC = 18;
    for (let i = 0; i <= ARC; i++) {
      const th = Math.PI - (i / ARC) * Math.PI;
      prof.push([Math.cos(th) * Wd / 2, hw + Math.sin(th) * (H - hw)]);
    }
    prof.push([Wd / 2, 0]);
    // mesh skin (sweep + end caps)
    const pos = [], uv = [], idx = [];
    let acc = 0;
    prof.forEach(([x, y], i) => {
      if (i) acc += Math.hypot(x - prof[i - 1][0], y - prof[i - 1][1]);
      pos.push(x, y, -Ln / 2, x, y, Ln / 2);
      uv.push(acc / 1.6, 0, acc / 1.6, Ln / 1.6);
      if (i < prof.length - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    });
    const skin = new THREE.BufferGeometry();
    skin.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    skin.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    skin.setIndex(idx); skin.computeVertexNormals();
    const shape = new THREE.Shape(prof.map(([x, y]) => new THREE.Vector2(x, y)));
    const capA = scaleUV(new THREE.ShapeGeometry(shape), 1 / 1.6, 1 / 1.6).translate(0, 0, Ln / 2);
    const capB = capA.clone().translate(0, 0, -Ln);
    const skinG = mergeGeometries([skin.toNonIndexed(), capA.toNonIndexed(), capB.toNonIndexed()], false);
    const meshMat = new THREE.MeshStandardMaterial({ map: meshTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.35 });
    const cage = new THREE.Mesh(skinG, meshMat);
    cage.position.set(cx, 0, cz);
    cage.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, opacity: 0, alphaTest: 0.5 });
    cage.renderOrder = 2;
    group.add(cage);
    // portal ribs every bay + purlins + bracing
    const frameC = 0x2e3a33;
    const bays = 12;
    for (let b = 0; b <= bays; b++) {
      const z = cz - Ln / 2 + (b / bays) * Ln;
      const pts = prof.map(([x, y]) => V3(cx + x, y, z));
      for (let i = 0; i < pts.length - 1; i++) MF.add(strut(pts[i], pts[i + 1], 0.16, 0.16, 6), frameC);
      MF.add(new THREE.BoxGeometry(0.9, 0.5, 0.9), 0x8f8a80, xf(cx - Wd / 2, 0.25, z));
      MF.add(new THREE.BoxGeometry(0.9, 0.5, 0.9), 0x8f8a80, xf(cx + Wd / 2, 0.25, z));
      if (b < bays) {
        const z2 = cz - Ln / 2 + ((b + 1) / bays) * Ln;
        for (const sx of [-1, 1]) {
          MF.add(strut(V3(cx + sx * Wd / 2, 0.5, z), V3(cx + sx * Wd / 2, hw, z2), 0.05), frameC);
          MF.add(strut(V3(cx + sx * Wd / 2, hw, z), V3(cx + sx * Wd / 2, 0.5, z2), 0.05), frameC);
        }
      }
    }
    const purl = [1, 2, 4, 6, 9, 12, 14, 16, 18, 19];
    for (const i of purl) {
      const [x, y] = prof[i];
      MF.add(strut(V3(cx + x, y, cz - Ln / 2), V3(cx + x, y, cz + Ln / 2), 0.09, 0.09, 5), frameC);
    }
    for (const sx of [-1, 1]) MF.add(strut(V3(cx + sx * Wd / 2, 4.2, cz - Ln / 2), V3(cx + sx * Wd / 2, 4.2, cz + Ln / 2), 0.07, 0.07, 5), frameC);
    // end-wall verticals and entrance vestibules
    for (const ez of [cz - Ln / 2, cz + Ln / 2]) {
      for (const fx of [-8, -4, 4, 8]) {
        const y = hw + Math.sqrt(Math.max(0, 1 - (fx / (Wd / 2)) ** 2)) * (H - hw);
        MF.add(strut(V3(cx + fx, 0, ez), V3(cx + fx, y, ez), 0.1), frameC);
      }
      const dz = Math.sign(ez - cz) * 2;
      M.add(new THREE.BoxGeometry(4.6, 3.4, 4), 0x33423a, xf(cx, 1.7, ez + dz));
      M.add(new THREE.BoxGeometry(5.2, 0.3, 4.6), 0x24302a, xf(cx, 3.5, ez + dz));
      M.add(new THREE.BoxGeometry(2.2, 2.6, 0.1), 0x151b18, xf(cx, 1.3, ez + dz * 2 + Math.sign(dz) * 0.01));
    }
    // interior: marsh ground, pond, boardwalk, cypress, rocks
    M.add(new THREE.BoxGeometry(Wd - 0.6, 0.08, Ln - 0.6), 0x55693c, xf(cx, 0.04, cz));
    W.add(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), 0xffffff, xf(cx + 4, 0.14, cz - 4, 0, 0, 0, 7, 1, 17));
    M.add(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), 0x6b5a3f, xf(cx + 4, 0.1, cz - 4, 0, 0, 0, 8.2, 1, 18.5));
    M.add(new THREE.BoxGeometry(2.6, 0.3, Ln - 2), 0x8a6a48, xf(cx - 7, 0.15, cz));
    for (let i = 0; i < 22; i++) M.add(new THREE.BoxGeometry(0.1, 1.0, 0.1), 0x5a4532, xf(cx - 8.3, 0.5, cz - Ln / 2 + 2 + i * 3.1));
    M.add(new THREE.BoxGeometry(0.08, 0.08, Ln - 2), 0x5a4532, xf(cx - 8.3, 1.0, cz));
    const cyp = [[-6, -28], [9, -26], [-3, -15], [10, -9], [-5, 2], [9, 8], [0, 16], [-8, 24], [8, 26], [3, -31]];
    cyp.forEach(([x, z], i) => {
      const h = 8 + (i * 7 % 5) * 0.9;
      const X = cx + x, Z = cz + z;
      M.add(new THREE.CylinderGeometry(0.2, 0.6, h * 0.55, 7), 0x6e4f3a, xf(X, h * 0.275, Z));
      M.add(new THREE.ConeGeometry(2.3, h * 0.75, 8), 0x55683a, xf(X, h * 0.55, Z), 0.12, rnd);
      M.add(new THREE.ConeGeometry(1.6, h * 0.45, 8), 0x627446, xf(X, h * 0.88, Z), 0.12, rnd);
      for (let k = 0; k < 4; k++) M.add(new THREE.ConeGeometry(0.1, 0.5, 4), 0x6e4f3a, xf(X + Math.cos(k * 1.6) * 1.4, 0.25, Z + Math.sin(k * 1.6) * 1.4)); // knees
    });
    for (let i = 0; i < 9; i++) M.add(rockGeo(i), 0x8d877a, xf(cx + (rnd() - 0.5) * 18, 0.2, cz + (rnd() - 0.5) * 60, 0, rnd() * 3, 0, 0.8 + rnd(), 0.5 + rnd() * 0.4, 0.8 + rnd()), 0.1, rnd);
    for (let i = 0; i < 26; i++) M.add(new THREE.IcosahedronGeometry(1, 0), 0x5f7a3c, xf(cx + (rnd() - 0.5) * 22, 0.3, cz + (rnd() - 0.5) * 64, 0, rnd() * 3, 0, 0.9 + rnd(), 0.6, 0.9 + rnd()), 0.15, rnd);
  }

  // ---------- Bird House (Mission revival, 1930), front at +Z / plaza at -Z
  {
    const bx = -44, bz = 61;
    ell(bx, bz, 17, 9);
    const wing = stuccoFacade(9, 6.5, (g, em) => {
      for (let i = 0; i < 3; i++) archWin(g, 1.05 + i * 2.75, 5.3, 1.4, 3.3, em);
    });
    const pav = stuccoFacade(9, 9.5, (g, em) => {
      archWin(g, 3.0, 8.8, 3.0, 4.6, em, '#ffd79a');
      if (!em) {
        g.fillStyle = '#c9a777'; for (let i = 0; i < 9; i++) g.fillRect(2.6 + i * 0.45, 3.65, 0.25, 0.25);
        g.fillStyle = '#b9a989'; g.fillRect(0.6, 0.6, 0.35, 8.9); g.fillRect(8.05, 0.6, 0.35, 8.9);
      }
      g.fillStyle = em ? '#ffcf8a' : '#2a3331';
      g.beginPath(); g.arc(4.5, 2.2, 0.75, 0, Math.PI * 2); g.fill();
      if (!em) { g.strokeStyle = '#c4a272'; g.lineWidth = 0.18; g.stroke(); }
    });
    glow.push(wing, pav);
    const wingG = new THREE.BoxGeometry(9, 6.5, 9);
    for (const sx of [-1, 1]) {
      const o = new THREE.Mesh(wingG, wing); o.position.set(bx + sx * 9, 3.25, bz); group.add(o);
    }
    const pv = new THREE.Mesh(new THREE.BoxGeometry(9, 9.5, 9.6), pav); pv.position.set(bx, 4.75, bz); group.add(pv);
    const roofM = new THREE.MeshStandardMaterial({ map: tileTex(), roughness: 0.7 });
    roofM.map.wrapS = roofM.map.wrapT = THREE.RepeatWrapping;
    const rG = mergeGeometries([
      hipRoof(28.4, 10.2, 2.9).translate(bx, 6.6, bz),
      hipRoof(10.2, 10.8, 3.6).rotateY(0).translate(bx, 9.6, bz),
    ].map((g) => g.index ? g.toNonIndexed() : g), false);
    const roof = new THREE.Mesh(rG, roofM); group.add(roof);
    // eaves, cornices, curvilinear Mission parapet on the pavilion (both faces)
    M.add(new THREE.BoxGeometry(28.6, 0.35, 10.4), 0xd8c9ad, xf(bx, 6.3, bz));
    M.add(new THREE.BoxGeometry(10, 0.4, 10.6), 0xd8c9ad, xf(bx, 9.3, bz));
    const ps = new THREE.Shape();
    ps.moveTo(-4.6, 0); ps.lineTo(-4.6, 0.6); ps.quadraticCurveTo(-3.6, 0.7, -3.2, 1.6); ps.quadraticCurveTo(-2.6, 2.8, -1.2, 2.9);
    ps.quadraticCurveTo(0, 3.6, 1.2, 2.9); ps.quadraticCurveTo(2.6, 2.8, 3.2, 1.6); ps.quadraticCurveTo(3.6, 0.7, 4.6, 0.6); ps.lineTo(4.6, 0);
    const parG = new THREE.ExtrudeGeometry(ps, { depth: 0.45, bevelEnabled: false, curveSegments: 6 });
    for (const sz of [-1, 1]) {
      M.add(parG, 0xe6d9bf, xf(bx, 9.45, bz + sz * 4.85 - 0.225));
      M.add(new THREE.BoxGeometry(0.9, 0.9, 0.5), 0xc9b48f, xf(bx, 11.6, bz + sz * 4.85));
      // bird finials on the gable shoulders
      for (const sx of [-1, 1]) M.add(new THREE.ConeGeometry(0.25, 0.7, 6), 0xb05a3a, xf(bx + sx * 4.4, 10.4, bz + sz * 4.85));
    }
    // beam ends under the eaves
    for (let i = 0; i < 26; i++) for (const sz of [-1, 1]) M.add(new THREE.BoxGeometry(0.18, 0.22, 0.6), 0x5a3a24, xf(bx - 13 + i * 1.04, 6.05, bz + sz * 4.75));
    // terrace + steps on both faces, planters with flowers
    M.add(new THREE.BoxGeometry(30, 0.35, 13.2), 0xbdb09a, xf(bx, 0, bz));
    for (const sz of [-1, 1]) {
      M.add(new THREE.BoxGeometry(6, 0.2, 1.6), 0xcfc4b0, xf(bx, 0, bz + sz * 7.2));
      for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
        const px = bx + sx * (6 + k * 3.6), pz = bz + sz * 5.6;
        M.add(new THREE.BoxGeometry(1.4, 0.6, 1.0), 0xa9835c, xf(px, 0.35, pz));
        M.add(new THREE.SphereGeometry(0.62, 8, 6), [0xd8435a, 0xf0b43c, 0xa3478f][(k + (sx > 0)) % 3], xf(px, 1.05, pz, 0, 0, 0, 1, 0.55, 0.8), 0.1, rnd);
      }
    }
  }

  // ---------- Savanna paddock (River's Edge style)
  const sav = { x0: 3, x1: 55, z0: -28, z1: 36 };
  {
    ell((sav.x0 + sav.x1) / 2, (sav.z0 + sav.z1) / 2, 30, 35);
    const s = new THREE.Shape();
    const r = 8, { x0, x1, z0, z1 } = sav;
    s.moveTo(x0 + r, z0); s.lineTo(x1 - r, z0); s.quadraticCurveTo(x1, z0, x1, z0 + r); s.lineTo(x1, z1 - r); s.quadraticCurveTo(x1, z1, x1 - r, z1);
    s.lineTo(x0 + r, z1); s.quadraticCurveTo(x0, z1, x0, z1 - r); s.lineTo(x0, z0 + r); s.quadraticCurveTo(x0, z0, x0 + r, z0);
    const gGeo = new THREE.ShapeGeometry(s, 8).rotateX(Math.PI / 2);
    // ShapeGeometry in XY -> rotate so shape Y becomes world Z (+), face up
    gGeo.scale(1, 1, 1);
    const ix = gGeo.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; }
    const pa = gGeo.attributes.position;
    for (let i = 0; i < pa.count; i++) pa.setY(i, 0.09);
    gGeo.computeVertexNormals();
    const nA = gGeo.attributes.normal; for (let i = 0; i < nA.count; i++) nA.setXYZ(i, 0, 1, 0);
    scaleUV(gGeo, 1 / 10, 1 / 10);
    const ground = new THREE.Mesh(gGeo, new THREE.MeshStandardMaterial({ map: dirtTex(), roughness: 1 }));
    ground.material.map.repeat.set(1, 1);
    ground.receiveShadow = true;
    group.add(ground);
    // log-and-cable fence around perimeter
    const peri = s.getSpacedPoints(110);
    const posts = [];
    for (let i = 0; i < peri.length - 1; i++) {
      const a = peri[i], b = peri[i + 1];
      posts.push({ x: a.x, z: a.y });
      for (const y of [0.55, 1.15]) M.add(strut(V3(a.x, y, a.y), V3(b.x, y, b.y), 0.05, 0.05, 4), 0x6b5440);
    }
    group.add(inst(new THREE.CylinderGeometry(0.1, 0.12, 1.5, 6).translate(0, 0.75, 0), mat(0x5d4636, { roughness: 0.95 }), posts));
    // waterhole, kopje rocks, acacias, grass tufts
    W.add(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), 0xffffff, xf(44, 0.16, 24, 0, 0.3, 0, 7, 1, 4.5));
    M.add(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), 0x7a6343, xf(44, 0.12, 24, 0, 0.3, 0, 8.4, 1, 5.8));
    for (let i = 0; i < 9; i++) M.add(rockGeo(20 + i), 0xa3907a, xf(46 + (rnd() - 0.5) * 9, 0.2, -16 + (rnd() - 0.5) * 9, 0, rnd() * 3, 0, 1.4 + rnd() * 1.8, 0.9 + rnd() * 1.3, 1.3 + rnd() * 1.6), 0.08, rnd);
    for (const [ax, az, h] of [[14, -18, 6.2], [30, 28, 5.5], [50, 4, 6.8], [9, 12, 5.0]]) {
      M.add(strut(V3(ax, 0, az), V3(ax + 0.6, h * 0.75, az + 0.3), 0.28, 0.18, 6), 0x5b4535);
      M.add(strut(V3(ax + 0.5, h * 0.65, az + 0.25), V3(ax - 1.4, h * 0.95, az - 0.6), 0.12, 0.08, 5), 0x5b4535);
      M.add(new THREE.SphereGeometry(1, 12, 6), 0x5c6b34, xf(ax, h, az, 0, rnd() * 3, 0, 4.2, 0.7, 3.6), 0.1, rnd);
      M.add(new THREE.SphereGeometry(1, 10, 5), 0x66763c, xf(ax - 1.2, h + 0.4, az - 0.4, 0, 0, 0, 2.4, 0.5, 2.2), 0.1, rnd);
    }
    for (let i = 0; i < 70; i++) {
      const x = sav.x0 + 3 + rnd() * (sav.x1 - sav.x0 - 6), z = sav.z0 + 3 + rnd() * (sav.z1 - sav.z0 - 6);
      M.add(new THREE.ConeGeometry(0.35, 0.6, 5), 0x9d9a55, xf(x, 0.38, z), 0.15, rnd);
    }
  }

  // ---------- McDonnell Polar Bear Point
  {
    const px = 33, pz = -60;
    ell(px, pz, 25, 19);
    M.add(new THREE.CircleGeometry(1, 30).rotateX(-Math.PI / 2), 0xd3cfc6, xf(px, 0.08, pz, 0, 0, 0, 23, 1, 17));
    W.add(new THREE.CircleGeometry(1, 30).rotateX(-Math.PI / 2), 0xffffff, xf(px - 3, 0.45, pz + 2, 0, 0.2, 0, 11, 1, 6.5));
    // rock ring rising toward the back (-Z) into a cliff
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2;
      const back = Math.max(0, -Math.sin(a)); // 1 at the -Z side
      const rr = 13 + rnd() * 4 + back * 2;
      const x = px - 3 + Math.cos(a) * rr * 1.3, z = pz + 2 + Math.sin(a) * rr * 0.9;
      if (Math.sin(a) > 0.55 && Math.abs(Math.cos(a)) < 0.6) continue; // open viewing front
      const sc = 1.6 + rnd() * 1.4 + back * 2.6;
      M.add(rockGeo(100 + i, 0.28), 0xe2ddd2, xf(x, sc * 0.35, z, rnd(), rnd() * 3, rnd() * 0.4, sc * (1 + rnd() * 0.6), sc * (0.7 + back * 0.8), sc), 0.06, rnd);
    }
    for (let i = 0; i < 7; i++) M.add(rockGeo(200 + i, 0.25), 0xd8d3c8, xf(px - 3 + (rnd() - 0.5) * 16, 0.4, pz + 2 + (rnd() - 0.5) * 8, 0, rnd() * 3, 0, 1 + rnd(), 0.4, 1 + rnd()), 0.06, rnd);
    // viewing glass wall + railing at the open (+Z) front
    const gl = new THREE.MeshStandardMaterial({ color: 0x9fc4cc, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.35, depthWrite: false });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(18, 2.0, 0.1), gl);
    glass.position.set(px - 3, 1.0, pz + 15.2);
    glass.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, opacity: 0, alphaTest: 0.5 });
    group.add(glass);
    M.add(new THREE.BoxGeometry(18.4, 0.12, 0.3), 0x2f3a3c, xf(px - 3, 2.0, pz + 15.2));
    M.add(new THREE.BoxGeometry(18.4, 0.4, 0.4), 0x8b8578, xf(px - 3, 0, pz + 15.2));
    // shade pavilion (white tensile canopy) at the viewing area
    M.add(new THREE.ConeGeometry(5.5, 1.6, 4, 1, true), 0xf2f0ea, xf(px + 13, 4.2, pz + 16, 0, Math.PI / 4, 0));
    for (const [dx, dz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) M.add(new THREE.CylinderGeometry(0.08, 0.08, 4.2, 6), 0x3a3f42, xf(px + 13 + dx, 2.1, pz + 16 + dz));
  }

  // ---------- Flamingo pond (front, +Z)
  {
    const fx = 12, fz = 62;
    ell(fx, fz, 15, 10);
    W.add(new THREE.CircleGeometry(1, 30).rotateX(-Math.PI / 2), 0xffffff, xf(fx, 0.14, fz, 0, -0.15, 0, 12, 1, 7));
    M.add(new THREE.CircleGeometry(1, 30).rotateX(-Math.PI / 2), 0x6f6248, xf(fx, 0.1, fz, 0, -0.15, 0, 13.4, 1, 8.2));
    // low rail + reeds
    const rp = [];
    for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; rp.push(V3(fx + Math.cos(a) * 14.6, 0, fz + Math.sin(a) * 9.2)); }
    for (let i = 0; i < 40; i++) {
      M.add(strut(V3(rp[i].x, 1.0, rp[i].z), V3(rp[i + 1].x, 1.0, rp[i + 1].z), 0.035, 0.035, 4), 0x2c3530);
      M.add(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 4), 0x2c3530, xf(rp[i].x, 0.5, rp[i].z));
    }
    for (let i = 0; i < 30; i++) { const a = rnd() * Math.PI * 2; M.add(new THREE.ConeGeometry(0.3, 1.3, 5), 0x6d7d3a, xf(fx + Math.cos(a) * 11.5, 0.65, fz + Math.sin(a) * 6.6), 0.15, rnd); }
  }

  // ---------- Zooline station (front right)
  {
    const sx = 36, sz = 80.5;
    ell(sx, sz, 9, 4);
    M.add(new THREE.BoxGeometry(16, 0.6, 3.2), 0xb7ab97, xf(sx, 0, sz));
    for (let i = 0; i < 6; i++) M.add(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 6), 0x2e4a36, xf(sx - 7 + i * 2.8, 0.6, sz - 0.6));
    M.add(new THREE.BoxGeometry(17, 0.25, 4.2), 0x2e4a36, xf(sx, 3.8, sz));
    M.add(hipRoof(17, 4.4, 1.1), 0x8e3b2a, xf(sx, 4.05, sz));
    M.add(new THREE.BoxGeometry(5, 2.9, 2.2), 0xe2d6bd, xf(sx + 4, 0.6, sz - 1.4));
  }

  // ---------- shade trees (instanced), avoiding exhibits, paths and track
  {
    const trunks = [], crowns = [], crowns2 = [];
    const inZone = (x, z) => zones.some((q) => ((x - q.x) / q.rx) ** 2 + ((z - q.z) / q.rz) ** 2 < 1);
    let tries = 0;
    while (trunks.length < 62 && tries++ < 4000) {
      const x = -69 + rnd() * 138, z = -89 + rnd() * 178;
      if (inZone(x, z) || (z > 72 && rnd() < 0.6) || nearPath(x, z, 4.2) || nearRail(x, z, 3.2)) continue;
      if (trunks.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 36)) continue;
      const h = (z > 55 ? 5.5 : 7) + rnd() * (z > 55 ? 3 : 6), s = h / 10;
      const hue = [0x3f6a2c, 0x4a7532, 0x37602a, 0x56803a, 0x426b34][Math.floor(rnd() * 5)];
      trunks.push({ x, z, ry: rnd() * 6, s, sx: s, sy: s, sz: s });
      crowns.push({ x, y: h * 0.72, z, ry: rnd() * 6, sx: s * (3.2 + rnd()), sy: s * (2.6 + rnd() * 0.6), sz: s * (3.0 + rnd()), color: hue });
      crowns2.push({ x: x + (rnd() - 0.5) * 2.4 * s, y: h * 0.86, z: z + (rnd() - 0.5) * 2.4 * s, ry: rnd() * 6, sx: s * 2.2, sy: s * 1.8, sz: s * 2.2, color: hue });
    }
    group.add(inst(new THREE.CylinderGeometry(0.16, 0.28, 7, 6).translate(0, 3.5, 0), mat(0x5a4636, { roughness: 0.95 }), trunks));
    const cg = mergeVertices(rockGeo(9, 0.22).deleteAttribute('normal').deleteAttribute('uv')); cg.computeVertexNormals();
    const cm = mat(0xffffff, { roughness: 0.9 });
    group.add(inst(cg, cm, crowns), inst(cg, cm, crowns2));
  }

  // ---------- animals
  const animals = [];
  const tex = { giraffe: giraffeTex(), zebra: zebraTex() };
  for (const t of Object.values(tex)) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  const gir = giraffeGeos();
  const girMat = mat(0xffffff, { vertexColors: true, map: tex.giraffe, roughness: 0.85 });
  const giraffes = [{ x: 20, z: 2, ry: 0.6 }, { x: 27, z: 10, ry: 2.5 }, { x: 36, z: -8, ry: -0.8 }, { x: 15, z: -12, ry: 1.9 }];
  group.add(inst(gir.body, girMat, giraffes));
  const neckIM = inst(gir.neck, girMat, giraffes.map((g) => ({ ...g })), true);
  group.add(neckIM);
  const girBase = giraffes.map((g) => new THREE.Matrix4().compose(V3(g.x, 0, g.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, g.ry, 0)), V3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(0.82, 2.55, 0)));
  const zebras = [];
  for (let i = 0; i < 7; i++) zebras.push({ x: 33 + (rnd() - 0.5) * 16, z: 18 + (rnd() - 0.5) * 12, ry: rnd() * 6.28, s: 0.95 + rnd() * 0.1 });
  group.add(inst(zebraGeo(), mat(0xffffff, { vertexColors: true, map: tex.zebra, roughness: 0.8 }), zebras));
  group.add(inst(elephantGeo(), mat(0xffffff, { vertexColors: true, roughness: 0.95 }), [{ x: 12, z: 25, ry: -0.4 }, { x: 18, z: 29, ry: -0.9, s: 0.92 }, { x: 40, z: 30, ry: 2.8, s: 0.65 }]));
  group.add(inst(bearGeo(), mat(0xffffff, { vertexColors: true, roughness: 0.9 }), [{ x: 24, y: 3.0, z: -70, ry: 0.4 }, { x: 38, z: -51, ry: 2.6 }, { x: 28, y: -0.55, z: -56, ry: -0.7 }]));
  const flam = [];
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2, rr = 0.35 + rnd() * 0.5;
    flam.push({ x: 12 + Math.cos(a) * 12 * rr, z: 62 + Math.sin(a) * 7 * rr, ry: rnd() * 6.28, s: 0.9 + rnd() * 0.2 });
  }
  group.add(inst(waderGeo(0xf08a90, 0xe58a8e, 0x1d1d1d), mat(0xffffff, { vertexColors: true, roughness: 0.8 }), flam));
  const egrets = [];
  for (let i = 0; i < 12; i++) egrets.push({ x: -36 + (rnd() - 0.5) * 10, z: -15 + (rnd() - 0.5) * 30, ry: rnd() * 6.28, s: 0.8 + rnd() * 0.2 });
  group.add(inst(waderGeo(0xf7f6f2, 0x2a2a2a, 0xe0b23a, 0.85), mat(0xffffff, { vertexColors: true, roughness: 0.8 }), egrets));
  // birds circling inside the cage
  const flyers = [];
  for (let i = 0; i < 18; i++) flyers.push({ cx: -40 + (rnd() - 0.5) * 6, cz: -11 + (rnd() - 0.5) * 36, r: 3.5 + rnd() * 5, y: 5 + rnd() * 7, w: (0.35 + rnd() * 0.3) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * 6.28, color: [0xf6f4ee, 0xe0563b, 0xf2a0a8, 0x2d2d2d][Math.floor(rnd() * 4)] });
  const flyIM = inst(flyerGeo(), mat(0xffffff, { roughness: 0.8, side: THREE.DoubleSide }), flyers.map((f) => ({ x: f.cx, y: f.y, z: f.cz, color: f.color })), true);
  flyIM.castShadow = false;
  group.add(flyIM);

  // ---------- visitors (static crowds + walkers)
  const pg = personGeos();
  const people = [];
  const addP = (x, z, ry, s = 1) => people.push({ x, z, ry, s });
  // walkers first
  const walkers = [];
  for (let i = 0; i < 34; i++) {
    const pi = i % paths.length;
    walkers.push({ P: paths[pi], s0: rnd() * paths[pi].L * 2, v: (1.0 + rnd() * 0.5) * (rnd() < 0.5 ? 1 : -1), off: (rnd() - 0.5) * 2.6, k: rnd() < 0.18 ? 0.62 : 0.94 + rnd() * 0.12 });
    addP(0, 0, 0, walkers[i].k);
  }
  const clusterAt = (x, z, n, sp, face) => { for (let i = 0; i < n; i++) addP(x + (rnd() - 0.5) * sp, z + (rnd() - 0.5) * sp * 0.5, face + (rnd() - 0.5), rnd() < 0.2 ? 0.62 : 0.95 + rnd() * 0.1); };
  clusterAt(-58, -20, 6, 8, Math.PI / 2); clusterAt(-58, 8, 5, 8, Math.PI / 2);
  clusterAt(-47, -11, 4, 14, 0); // inside the cage on the boardwalk
  clusterAt(-44, 50, 8, 10, -Math.PI / 2); clusterAt(-44, 72, 5, 10, Math.PI / 2);
  clusterAt(12, 72.5, 7, 12, -Math.PI / 2); clusterAt(4, 52, 5, 8, Math.PI / 2);
  clusterAt(30, -42, 9, 14, Math.PI / 2); clusterAt(46, -40, 4, 6, Math.PI);
  clusterAt(-1, 6, 5, 4, 0); clusterAt(-1, -18, 4, 4, 0); clusterAt(30, 41, 6, 14, -Math.PI / 2);
  clusterAt(34, 79.5, 7, 12, 0);
  const shirt = people.map(() => SHIRTS[Math.floor(rnd() * SHIRTS.length)]);
  const pants = people.map(() => PANTS[Math.floor(rnd() * PANTS.length)]);
  const skin = people.map(() => SKIN[Math.floor(rnd() * SKIN.length)]);
  const pMat = mat(0xffffff, { roughness: 0.85 });
  const imL = inst(pg.legs, pMat, people.map((p, i) => ({ ...p, color: pants[i] })), true);
  const imT = inst(pg.torso, pMat, people.map((p, i) => ({ ...p, color: shirt[i] })), true);
  const imH = inst(pg.head, pMat, people.map((p, i) => ({ ...p, color: skin[i] })), true);
  group.add(imL, imT, imH);

  // ---------- train: steam-outline loco + 3 open cars (built facing +Z)
  const train = [];
  {
    const loco = new Merge();
    const blk = 0x1d1f22, red = 0x8f2a20, brass = 0xc9a24a, grn = 0x2f5b3e;
    loco.add(new THREE.BoxGeometry(1.4, 0.3, 5.2), blk, xf(0, 0.55, 0.1));
    loco.add(new THREE.BoxGeometry(1.75, 0.12, 5.4), red, xf(0, 0.76, 0.1));
    loco.add(new THREE.CylinderGeometry(0.56, 0.56, 2.9, 14), blk, xf(0, 1.42, 1.0, Math.PI / 2));
    loco.add(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 14), brass, xf(0, 1.42, 0.2, Math.PI / 2));
    loco.add(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 14), brass, xf(0, 1.42, 1.6, Math.PI / 2));
    loco.add(new THREE.CylinderGeometry(0.58, 0.58, 0.55, 14), 0x2a2c30, xf(0, 1.42, 2.55, Math.PI / 2));
    loco.add(new THREE.CylinderGeometry(0.13, 0.15, 0.8, 8), blk, xf(0, 2.25, 2.35));
    loco.add(new THREE.CylinderGeometry(0.42, 0.14, 0.6, 10), blk, xf(0, 2.95, 2.35));
    loco.add(new THREE.SphereGeometry(0.26, 10, 6), brass, xf(0, 2.0, 1.2));
    loco.add(new THREE.SphereGeometry(0.2, 10, 6), brass, xf(0, 1.98, 0.4));
    loco.add(new THREE.BoxGeometry(0.42, 0.38, 0.38), blk, xf(0, 2.15, 2.75));
    loco.add(new THREE.ConeGeometry(0.85, 0.75, 4), red, xf(0, 0.52, 2.95, Math.PI / 2 - 0.5, Math.PI / 4, 0, 1, 1, 0.55));
    loco.add(new THREE.BoxGeometry(1.75, 1.75, 1.6), red, xf(0, 1.65, -1.05));
    loco.add(new THREE.BoxGeometry(1.78, 0.6, 1.1), 0x16181a, xf(0, 2.0, -1.05));
    loco.add(new THREE.BoxGeometry(2.0, 0.12, 1.95), blk, xf(0, 2.6, -1.05));
    loco.add(new THREE.BoxGeometry(1.6, 0.8, 1.2), grn, xf(0, 0.9, -2.35));
    for (const sx of [-1, 1]) {
      for (const wz of [-0.3, 0.7, 1.7]) loco.add(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 14), red, xf(sx * 0.72, 0.45, wz, 0, 0, Math.PI / 2));
      loco.add(new THREE.BoxGeometry(0.06, 0.08, 2.1), 0x9a9a9a, xf(sx * 0.8, 0.45, 0.7));
      loco.add(new THREE.CylinderGeometry(0.2, 0.2, 0.7, 10), blk, xf(sx * 0.62, 0.75, 2.2, Math.PI / 2));
    }
    const lgeo = loco.geometry();
    const lampM = lit(0xfff1c8, 0xffd88a, { night: 3, roughness: 0.2 });
    glow.push(lampM);
    const lo = new THREE.Group();
    lo.add(new THREE.Mesh(lgeo, vcPaint));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), lampM); lens.position.set(0, 2.17, 2.945); lo.add(lens);
    lo.userData.len = 5.6;
    train.push(lo);
    const car = new Merge();
    car.add(new THREE.BoxGeometry(1.8, 0.22, 5.6), 0x2f5b3e, xf(0, 0.62, 0));
    car.add(new THREE.BoxGeometry(1.86, 0.35, 5.66), 0x8f2a20, xf(0, 0.4, 0));
    for (const bz of [-1.9, -0.65, 0.6, 1.85]) {
      car.add(new THREE.BoxGeometry(1.6, 0.1, 0.45), 0x7a5536, xf(0, 1.1, bz));
      car.add(new THREE.BoxGeometry(1.6, 0.5, 0.08), 0x7a5536, xf(0, 1.3, bz - 0.24));
    }
    for (const sx of [-1, 1]) {
      for (const pz of [-2.7, -0.9, 0.9, 2.7]) car.add(new THREE.CylinderGeometry(0.04, 0.04, 1.75, 5), 0xc9a24a, xf(sx * 0.85, 1.6, pz));
      for (const wz of [-1.8, 1.8]) car.add(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10), blk, xf(sx * 0.62, 0.28, wz, 0, 0, Math.PI / 2));
    }
    car.add(new THREE.BoxGeometry(2.0, 0.1, 5.9), 0xeee5d0, xf(0, 2.5, 0));
    car.add(new THREE.BoxGeometry(2.04, 0.18, 5.94), 0x8f2a20, xf(0, 2.38, 0));
    const cgeo = car.geometry();
    for (let c = 0; c < 3; c++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(cgeo, vcPaint));
      // seated riders
      const riders = new Merge();
      [-1.9, -0.65, 0.6, 1.85].forEach((bz, j) => {
        for (const sx of [-0.45, 0.45]) {
          if (rnd() < 0.3) continue;
          riders.add(new THREE.BoxGeometry(0.4, 0.55, 0.24), SHIRTS[Math.floor(rnd() * SHIRTS.length)], xf(sx, 1.42, bz + 0.05));
          riders.add(new THREE.SphereGeometry(0.11, 7, 5), SKIN[Math.floor(rnd() * SKIN.length)], xf(sx, 1.85, bz + 0.05));
        }
      });
      if (riders.list.length) g.add(riders.mesh(vcMat));
      g.userData.len = 6.2;
      train.push(g);
    }
    train.forEach((o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } }); group.add(o); });
  }

  // ---------- finalize merged static meshes
  group.add(M.mesh(vcMat));
  group.add(MF.mesh(vcMetal));
  const wm = W.mesh(water); wm.castShadow = false; group.add(wm);

  // ---------- animation
  const tA = V3(0, 0, 0), tB = V3(0, 0, 0), dm = new THREE.Object3D();
  const mN = new THREE.Matrix4(), mR = new THREE.Matrix4();
  const nW = walkers.length;
  function update(t) {
    // train
    let s = (t * 3.6) % RL.L;
    for (const o of train) {
      RL.pos(s + 1.9, tA); RL.pos(s - 1.9, tB);
      o.position.set((tA.x + tB.x) / 2, 0.12, (tA.z + tB.z) / 2);
      o.rotation.y = Math.atan2(tA.x - tB.x, tA.z - tB.z);
      s -= o.userData.len;
    }
    // walkers
    for (let i = 0; i < nW; i++) {
      const w = walkers[i], L = w.P.L;
      let u = ((w.s0 + w.v * t) % (2 * L) + 2 * L) % (2 * L);
      const back = u > L; if (back) u = 2 * L - u;
      w.P.pos(u, tA); w.P.pos(u + (back ? -0.6 : 0.6), tB);
      const dx = tB.x - tA.x, dz = tB.z - tA.z, l = Math.hypot(dx, dz) || 1;
      const side = back ? -w.off : w.off;
      dm.position.set(tA.x - dz / l * side, 0.08 + Math.abs(Math.sin(t * 6 + i)) * 0.03, tA.z + dx / l * side);
      dm.rotation.set(0, Math.atan2(dx, dz), 0);
      dm.scale.setScalar(w.k);
      dm.updateMatrix();
      imL.setMatrixAt(i, dm.matrix); imT.setMatrixAt(i, dm.matrix); imH.setMatrixAt(i, dm.matrix);
    }
    imL.instanceMatrix.needsUpdate = imT.instanceMatrix.needsUpdate = imH.instanceMatrix.needsUpdate = true;
    // giraffe necks
    for (let i = 0; i < girBase.length; i++) {
      const a = Math.sin(t * 0.6 + i * 1.7) * 0.12 - 0.04 + Math.sin(t * 0.23 + i) * 0.08;
      mR.makeRotationFromEuler(_e.set(Math.sin(t * 0.4 + i * 2.1) * 0.15, Math.sin(t * 0.31 + i) * 0.35, a));
      mN.multiplyMatrices(girBase[i], mR);
      neckIM.setMatrixAt(i, mN);
    }
    neckIM.instanceMatrix.needsUpdate = true;
    // birds circling in the Flight Cage
    for (let i = 0; i < flyers.length; i++) {
      const f = flyers[i], a = f.ph + f.w * t;
      dm.position.set(f.cx + Math.cos(a) * f.r, f.y + Math.sin(t * 0.7 + f.ph) * 0.8, f.cz + Math.sin(a) * f.r * 1.6);
      dm.rotation.set(0, -a - (f.w > 0 ? Math.PI / 2 : -Math.PI / 2), Math.sin(a) * 0.2 * Math.sign(f.w));
      dm.scale.set(1, Math.sin(t * 9 + f.ph * 3) * 1.8, 1);
      dm.updateMatrix();
      flyIM.setMatrixAt(i, dm.matrix);
    }
    flyIM.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { group, glow, update };
}
