// Old Chain of Rocks Bridge (1929, Route 66): a long run of Pratt/Parker
// through-trusses on concrete piers with cutwaters, famous for its 22° bend in
// mid-river. Below it the "chain of rocks" ledges churn the Mississippi into
// rapids, and upstream stand the castle-like water intake towers (1894 round,
// 1915 square). The bridge leaves the near bank at -X/+Z and runs off toward
// +X/-Z. Footprint x -120..520, z -300..60.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, lit, seeded, canvasTex } from './kit.js';

const DEG = Math.PI / 180;
const XMIN = -120, XMAX = 520, ZMIN = -300, ZMAX = 60;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }

// ---- bridge alignment --------------------------------------------------------
const A = new THREE.Vector2(-104, 40);
const TH1 = -22 * DEG, TH2 = TH1 - 22 * DEG; // the famous 22° bend
const L1 = 330, L2 = 288;
const D1 = new THREE.Vector2(Math.cos(TH1), Math.sin(TH1));
const D2 = new THREE.Vector2(Math.cos(TH2), Math.sin(TH2));
const B = A.clone().addScaledVector(D1, L1);
const LEN = L1 + L2;
const DECK = 12.5;
function deckY(s) { return 3 + (DECK - 3) * smooth(0, 74, s) - 2.5 * smooth(LEN - 26, LEN, s); }
/** World point at chainage s, transverse offset t (+t = upstream / toward +Z), height y. */
function P(s, t, y, out = new THREE.Vector3()) {
  let o, d;
  if (s <= L1) { o = A; d = D1; s -= 0; } else { o = B; d = D2; s -= L1; }
  let nx = -d.y, nz = d.x;
  if (Math.abs(s - (o === A ? L1 : 0)) < 1e-6) { // mitre at the bend
    const k = 1 / Math.cos(11 * DEG);
    nx = (-(D1.y + D2.y) / 2) / Math.cos(11 * DEG) * k; nz = ((D1.x + D2.x) / 2) / Math.cos(11 * DEG) * k;
  }
  return out.set(o.x + d.x * s + nx * t, y, o.y + d.y * s + nz * t);
}
function dirAt(s) { return s <= L1 ? D1 : D2; }

// ---- the river -------------------------------------------------------------
const RN = new THREE.Vector2(0.839, -0.545); // normal across the river, pointing to the far bank
const NEAR = new THREE.Vector2(-58, 22), FAR = new THREE.Vector2(392, -268);
function riverDepth(x, z) {
  const q = x * 0.545 + z * 0.839; // along-river coordinate
  const dN = (x - NEAR.x) * RN.x + (z - NEAR.y) * RN.y + 5 * Math.sin(q * 0.021) + 3 * Math.sin(q * 0.057 + 1);
  const dF = (FAR.x - x) * RN.x + (FAR.y - z) * RN.y + 8 * Math.sin(q * 0.017 + 2);
  return Math.min(dN, dF);
}

/** Sweep a closed cross-section (array of [t, y]) along chainages; returns a geometry. */
function sweep(ss, prof, yOf) {
  const pos = [], idx = [];
  const v = new THREE.Vector3();
  const n = prof.length;
  for (const s of ss) for (const [t, y] of prof) { P(s, t, yOf(s) + y, v); pos.push(v.x, v.y, v.z); }
  for (let i = 0; i < ss.length - 1; i++) for (let k = 0; k < n; k++) {
    const a = i * n + k, b = i * n + ((k + 1) % n), c = a + n, d = b + n;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
  return ng;
}
function chain(s0, s1, step) {
  const out = [];
  for (let s = s0; s < s1 - 1e-3; s += step) out.push(s);
  if (s0 < L1 && s1 > L1 && !out.includes(L1)) { out.push(L1); out.sort((a, b) => a - b); }
  out.push(s1);
  return out;
}

export default function build() {
  const g = new THREE.Group();
  const glow = [];

  // ---- water -------------------------------------------------------------
  const ripple = canvasTex(256, 256, (c, w, h) => {
    const r = seeded(12);
    c.fillStyle = '#808080'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const v = 90 + r() * 90;
      c.strokeStyle = `rgba(${v},${v},${v},0.5)`; c.lineWidth = 1 + r() * 2;
      const x = r() * w, y = r() * h, l = 6 + r() * 26;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + l / 2, y + (r() - 0.5) * 6, x + l, y); c.stroke();
    }
  }, [40, 40]);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, transparent: true, roughness: 0.22, metalness: 0.15,
    bumpMap: ripple, bumpScale: 0.6, depthWrite: false,
  });
  {
    const NX = 96, NZ = 54;
    const geo = new THREE.PlaneGeometry(XMAX - XMIN, ZMAX - ZMIN, NX, NZ).rotateX(-Math.PI / 2).translate((XMIN + XMAX) / 2, 0.12, (ZMIN + ZMAX) / 2);
    const p = geo.attributes.position;
    const col = new Float32Array(p.count * 4);
    const deep = new THREE.Color(0x34403a), mud = new THREE.Color(0x6b6248), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const d = riverDepth(x, z);
      const edge = Math.min(x - XMIN, XMAX - x, z - ZMIN, ZMAX - z);
      const a = smooth(-2, 9, d) * smooth(0, 70, edge);
      c.copy(mud).lerp(deep, smooth(0, 60, d));
      c.multiplyScalar(0.92 + 0.12 * hash2(x * 0.05, z * 0.05));
      col[i * 4] = c.r; col[i * 4 + 1] = c.g; col[i * 4 + 2] = c.b; col[i * 4 + 3] = a;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const water = new THREE.Mesh(geo, waterMat);
    water.receiveShadow = true;
    water.renderOrder = 1;
    g.add(water);
  }

  // shore: muddy sand fringe and riprap along the near bank
  {
    const parts = [];
    const r = seeded(808);
    const v = new THREE.Vector3();
    // fringe strip on the near bank
    const strip = [];
    for (let q = -150; q <= 60; q += 6) {
      const bx = NEAR.x + 0.545 * q, bz = NEAR.y + 0.839 * q;
      if (bz > ZMAX - 2 || bx < XMIN + 2) continue;
      strip.push([bx, bz]);
    }
    for (const [bx, bz] of strip) {
      for (let k = 0; k < 4; k++) {
        const s = 0.6 + r() * 1.4;
        const geo = new THREE.DodecahedronGeometry(s, 0).scale(1.3, 0.6, 1);
        geo.rotateY(r() * 6);
        const o = (r() - 0.3) * 10;
        geo.translate(bx + RN.x * o + (r() - 0.5) * 5, 0.2, bz + RN.y * o + (r() - 0.5) * 5);
        parts.push(geo);
      }
    }
    const rip = new THREE.Mesh(mergeGeometries(parts.map((x) => x.index ? x.toNonIndexed() : x)), mat(0x8b8577, { roughness: 1, flatShading: true }));
    rip.receiveShadow = true;
    g.add(rip);
    void v;
  }

  // ---- piers -----------------------------------------------------------
  const concrete = lit(0xbdb5a5, 0xffe6c4, { roughness: 0.92, night: 0.12 });
  glow.push(concrete);
  const trussSpans = [[74, 152], [152, 242], [242, L1], [L1, 420], [420, 508], [508, 592]];
  {
    const parts = [];
    const shape = new THREE.Shape();
    // plan: long across the deck (t), pointed cutwaters both ends
    shape.moveTo(-1.8, -5.6); shape.lineTo(0, -8.4); shape.lineTo(1.8, -5.6); shape.lineTo(1.8, 5.6); shape.lineTo(0, 8.4); shape.lineTo(-1.8, 5.6); shape.closePath();
    const pierS = new Set();
    for (const [a, b] of trussSpans) { pierS.add(a); pierS.add(b); }
    for (const s of pierS) {
      const y0 = -1, h = deckY(s) - 1.4 - y0;
      const d = s === L1 ? D1.clone().add(D2).normalize() : dirAt(s);
      const ang = Math.atan2(d.y, d.x);
      const pg = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2).translate(0, y0, 0);
      // batter: narrow the shaft towards the cap
      const pp = pg.attributes.position;
      for (let i = 0; i < pp.count; i++) { const k = 1 - 0.1 * (pp.getY(i) - y0) / h; pp.setX(i, pp.getX(i) * k); pp.setZ(i, pp.getZ(i) * (0.94 + 0.06 * k)); }
      const cap = new THREE.BoxGeometry(4.8, 1.2, 12.4).translate(0, y0 + h + 0.6, 0);
      const foot = new THREE.BoxGeometry(5.2, 1.6, 14).translate(0, -0.6, 0);
      for (const gg of [pg, cap, foot]) {
        gg.rotateY(-ang);
        const c = P(s, 0, 0);
        gg.translate(c.x, 0, c.z);
        parts.push(gg.index ? gg.toNonIndexed() : gg);
      }
    }
    // approach bents on the near bank and the far end
    for (const s of [18, 36, 54, 600, 610]) {
      for (const t of [-3.4, 3.4]) {
        const c = P(s, t, 0);
        const h = deckY(s) - 1.2;
        parts.push(new THREE.CylinderGeometry(0.55, 0.65, h, 10).translate(c.x, h / 2, c.z).toNonIndexed());
      }
      const d = dirAt(s); const c = P(s, 0, 0);
      parts.push(new THREE.BoxGeometry(1.4, 1.0, 9.6).rotateY(-Math.atan2(d.y, d.x)).translate(c.x, deckY(s) - 1.6, c.z).toNonIndexed());
    }
    // abutments
    for (const [s, dir] of [[0, -1], [LEN, 1]]) {
      const d = dirAt(s), c = P(s, 0, 0);
      parts.push(new THREE.BoxGeometry(6, deckY(s) + 0.2, 12).rotateY(-Math.atan2(d.y, d.x)).translate(c.x + d.x * dir * 2, (deckY(s) + 0.2) / 2 - 0.2, c.z + d.y * dir * 2).toNonIndexed());
    }
    // waterline staining via vertex colour
    const all = mergeGeometries(parts.map((x) => { if (!x.attributes.uv) x.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2)); return x; }));
    const pc = all.attributes.position;
    const col = new Float32Array(pc.count * 3);
    for (let i = 0; i < pc.count; i++) {
      const y = pc.getY(i);
      const k = y < 2.5 ? 0.55 + 0.15 * y / 2.5 : 1 - 0.08 * hash2(pc.getX(i), y);
      col[i * 3] = k; col[i * 3 + 1] = k * 0.98; col[i * 3 + 2] = k * 0.94;
    }
    all.setAttribute('color', new THREE.BufferAttribute(col, 3));
    concrete.vertexColors = true;
    const piers = new THREE.Mesh(all, concrete);
    piers.receiveShadow = true;
    g.add(piers);
  }

  // ---- deck, sidewalk curbs and railings ---------------------------------------
  {
    const ss = chain(0, LEN, 6);
    const deck = sweep(ss, [[-5, 0], [5, 0], [5, -1.0], [-5, -1.0]], deckY);
    const girder = sweep(chain(0, 74, 6), [[-3.8, -1], [-3.0, -1], [-3.0, -2.6], [-3.8, -2.6]], deckY);
    const girder2 = sweep(chain(0, 74, 6), [[3.0, -1], [3.8, -1], [3.8, -2.6], [3.0, -2.6]], deckY);
    const curbs = [sweep(ss, [[-4.4, 0.25], [-3.6, 0.25], [-3.6, 0], [-4.4, 0]], deckY), sweep(ss, [[3.6, 0.25], [4.4, 0.25], [4.4, 0], [3.6, 0]], deckY)];
    const dg = new THREE.Mesh(mergeGeometries([deck, girder, girder2, ...curbs]), mat(0x8f8a82, { roughness: 0.95 }));
    dg.receiveShadow = true;
    g.add(dg);
    const railMat = mat(0x6c7068, { metalness: 0.5, roughness: 0.6 });
    const rails = [];
    for (const t of [-4.85, 4.85]) {
      rails.push(sweep(ss, [[t - 0.06, 1.15], [t + 0.06, 1.15], [t + 0.06, 1.0], [t - 0.06, 1.0]], deckY));
      rails.push(sweep(ss, [[t - 0.04, 0.6], [t + 0.04, 0.6], [t + 0.04, 0.52], [t - 0.04, 0.52]], deckY));
    }
    g.add(new THREE.Mesh(mergeGeometries(rails), railMat));
  }

  // ---- trusses (instanced thin boxes) -------------------------------------------------
  const steel = lit(0x80867d, 0xcfd8e6, { metalness: 0.45, roughness: 0.55, night: 0.18 });
  glow.push(steel);
  {
    const mats = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), mid = new THREE.Vector3(), dv = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    function member(a, b, w, d) {
      dv.subVectors(b, a); const len = dv.length(); dv.divideScalar(len);
      q.setFromUnitVectors(up, dv);
      mid.addVectors(a, b).multiplyScalar(0.5);
      sc.set(w, len, d);
      mats.push(m4.compose(mid, q, sc).clone());
    }
    const T = 4.7;
    for (const [s0, s1] of trussSpans) {
      const L = s1 - s0;
      const n = Math.max(6, Math.round(L / 8.6));
      const yb = DECK + 0.1;
      const hEnd = 7.2, hMid = L > 85 ? 11 : 9.2;
      const sAt = (i) => s0 + 0.9 + ((L - 1.8) * i) / n;
      const hAt = (i) => hEnd + (hMid - hEnd) * Math.sin((Math.PI * i) / n);
      const bot = (i, t) => P(sAt(i), t, yb);
      const top = (i, t) => P(sAt(i), t, yb + hAt(i));
      for (const t of [-T, T]) {
        for (let i = 0; i < n; i++) member(bot(i, t), bot(i + 1, t), 0.55, 0.7);
        for (let i = 1; i < n - 1; i++) member(top(i, t), top(i + 1, t), 0.75, 0.7);
        member(bot(0, t), top(1, t), 0.75, 0.7);
        member(bot(n, t), top(n - 1, t), 0.75, 0.7);
        for (let i = 1; i < n; i++) member(bot(i, t), top(i, t), 0.36, 0.5);
        for (let i = 1; i < n - 1; i++) {
          if (i < n / 2) member(top(i, t), bot(i + 1, t), 0.26, 0.42);
          else member(top(i + 1, t), bot(i, t), 0.26, 0.42);
          // counters in the middle panels
          if (Math.abs(i + 0.5 - n / 2) < 1.6) {
            if (i < n / 2) member(top(i + 1, t), bot(i, t), 0.14, 0.2);
            else member(top(i, t), bot(i + 1, t), 0.14, 0.2);
          }
        }
      }
      // top lateral struts + X bracing, sway struts
      for (let i = 1; i < n; i++) {
        member(top(i, -T), top(i, T), 0.35, 0.5);
        const ys = yb + hAt(i) - 1.6;
        member(P(sAt(i), -T, ys), P(sAt(i), T, ys), 0.22, 0.3);
        member(P(sAt(i), -T, ys), P(sAt(i), 0, yb + hAt(i) - 0.2), 0.14, 0.18);
        member(P(sAt(i), T, ys), P(sAt(i), 0, yb + hAt(i) - 0.2), 0.14, 0.18);
      }
      for (let i = 1; i < n - 1; i++) {
        member(top(i, -T), top(i + 1, T), 0.14, 0.14);
        member(top(i, T), top(i + 1, -T), 0.14, 0.14);
      }
      // portal bracing at both ends
      for (const [e, f] of [[0, 1], [n, n - 1]]) {
        const pa = (t, k) => bot(e, t).lerp(top(f, t), k);
        member(pa(-T, 0.78), pa(T, 0.78), 0.5, 0.6);
        member(pa(-T, 0.93), pa(T, 0.93), 0.3, 0.4);
        member(pa(-T, 0.58), pa(-T, 0.78).lerp(pa(T, 0.78), 0.3), 0.22, 0.3);
        member(pa(T, 0.58), pa(T, 0.78).lerp(pa(-T, 0.78), 0.3), 0.22, 0.3);
        for (let k = 0; k < 4; k++) member(pa(-T, 0.78).lerp(pa(T, 0.78), k / 4), pa(-T, 0.93).lerp(pa(T, 0.93), (k + 1) / 4), 0.1, 0.12);
      }
      // floor beams poking out below the deck
      for (let i = 0; i <= n; i++) member(P(sAt(i), -T - 0.3, yb - 1.4), P(sAt(i), T + 0.3, yb - 1.4), 0.5, 0.9);
    }
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), steel, mats.length);
    mats.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.receiveShadow = true;
    g.add(inst);
  }

  // ---- lamp posts (subtle night lights) -------------------------------------------
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, emissive: 0xffd7a0, emissiveIntensity: 0 });
  lampMat.userData.night = 2.2;
  glow.push(lampMat);
  {
    const lamps = [];
    for (let s = 20; s < LEN - 10; s += 34) for (const t of [-4.6, 4.6]) lamps.push([s + (t > 0 ? 17 : 0), t]);
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 4.2, 6).translate(0, 2.1, 0), mat(0x3d403c, { metalness: 0.5 }), lamps.length);
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 8, 6), lampMat, lamps.length);
    const m4 = new THREE.Matrix4(), v = new THREE.Vector3();
    lamps.forEach(([s, t], i) => {
      P(s, t, deckY(s), v);
      m4.makeTranslation(v.x, v.y, v.z); poles.setMatrixAt(i, m4);
      m4.makeTranslation(v.x, v.y + 4.3, v.z); heads.setMatrixAt(i, m4);
    });
    poles.castShadow = heads.castShadow = false;
    g.add(poles, heads);
  }

  // ---- the chain of rocks: ledges and rapids ----------------------------------------
  const foamMats = [];
  {
    const r = seeded(66);
    const rocks = [];
    const lines = [{ t: -22, s0: 100, s1: 540 }, { t: -46, s0: 130, s1: 500 }, { t: -70, s0: 170, s1: 470 }];
    const v = new THREE.Vector3();
    for (const L of lines) {
      for (let k = 0; k < 95; k++) {
        const s = L.s0 + r() * (L.s1 - L.s0);
        const t = L.t + (r() - 0.5) * 9 + 4 * Math.sin(s * 0.05);
        P(s, t, 0, v);
        if (riverDepth(v.x, v.z) < 15) continue;
        const sz = 0.5 + r() * r() * 2.8;
        rocks.push({ x: v.x, z: v.z, s: sz, ry: r() * 6, sy: 0.35 + r() * 0.35, sx: 1 + r() * 0.8 });
      }
    }
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const inst = new THREE.InstancedMesh(rockGeo, mat(0x6e675a, { roughness: 0.9, flatShading: true }), rocks.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const col = new THREE.Color();
    rocks.forEach((k, i) => {
      q.setFromEuler(e.set(0, k.ry, 0));
      m4.compose(new THREE.Vector3(k.x, 0.05, k.z), q, new THREE.Vector3(k.s * k.sx, k.s * k.sy, k.s));
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, col.setHSL(0.1, 0.08 + 0.05 * hash2(i, 1), 0.36 + 0.18 * hash2(i, 2)));
    });
    inst.receiveShadow = true;
    g.add(inst);
    // foam ribbons just downstream of each ledge
    const foamTex = (seed) => canvasTex(256, 256, (c, w, h) => {
      const rr = seeded(seed);
      c.clearRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        const x = rr() * w, y = rr() * h;
        const fall = Math.sin((y / h) * Math.PI); // dense in the middle of the ribbon
        if (rr() > fall) continue;
        c.fillStyle = `rgba(255,255,255,${0.12 + rr() * 0.4})`;
        c.beginPath(); c.ellipse(x, y, 1 + rr() * 4, 3 + rr() * 14, 0, 0, 7); c.fill();
      }
    }, null);
    for (const [seed, op, rep] of [[3, 0.75, 6], [9, 0.55, 9]]) {
      const tex = foamTex(seed);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(rep * 8, 1);
      const fm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: op, depthWrite: false, color: 0xf2f4ee });
      fm.userData.base = op;
      foamMats.push(fm);
      const ribbons = [];
      for (const L of lines) {
        const ss = chain(L.s0, L.s1, 10);
        const pos = [], uv = [], idx = [];
        ss.forEach((s, i) => {
          for (const [t, vv] of [[L.t - 1, 0], [L.t - 15, 1]]) {
            const p = P(s, t + 4 * Math.sin(s * 0.05), 0.2 + seed * 0.01);
            pos.push(p.x, p.y, p.z); uv.push((s - L.s0) / (L.s1 - L.s0), vv);
          }
          if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        });
        const rg = new THREE.BufferGeometry();
        rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        rg.setIndex(idx);
        ribbons.push(rg);
      }
      const fmesh = new THREE.Mesh(mergeGeometries(ribbons), fm);
      fmesh.renderOrder = 2;
      fmesh.castShadow = false;
      g.add(fmesh);
    }
  }

  // ---- water intake towers ----------------------------------------------------
  const stone = lit(0xd3c8b2, 0xffd9a8, { roughness: 0.85, night: 0.55 });
  glow.push(stone);
  const slate = mat(0x4b4f55, { roughness: 0.6, metalness: 0.1 });
  const dark = mat(0x1d1f22, { roughness: 0.6 });
  const winLit = new THREE.MeshStandardMaterial({ color: 0x23282c, emissive: 0xffc982, emissiveIntensity: 0, roughness: 0.4 });
  winLit.userData.night = 0.9;
  glow.push(winLit);
  {
    const st = [], sl = [], dk = [], wl = [];
    const add = (arr, geo) => arr.push(geo.index ? geo.toNonIndexed() : geo);
    // 1894 tower: round, crenellated, conical roof
    {
      const X = 52, Z = 4, R = 6.6;
      add(st, new THREE.CylinderGeometry(R + 1.8, R + 2.4, 3, 28).translate(X, 0.5, Z)); // footing
      add(st, new THREE.CylinderGeometry(R, R + 0.4, 15, 28).translate(X, 9.5, Z));
      add(st, new THREE.CylinderGeometry(R + 0.35, R + 0.35, 0.6, 28).translate(X, 7.4, Z)); // string course
      add(st, new THREE.CylinderGeometry(R + 0.9, R + 0.3, 1.2, 28).translate(X, 17.6, Z)); // corbel
      add(st, new THREE.CylinderGeometry(R + 0.9, R + 0.9, 1.4, 28, 1, true).translate(X, 18.9, Z));
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        add(st, new THREE.BoxGeometry(1.3, 1.1, 0.7).rotateY(-a + Math.PI / 2).translate(X + Math.cos(a) * (R + 0.9), 20.15, Z + Math.sin(a) * (R + 0.9)));
      }
      add(sl, new THREE.ConeGeometry(R - 0.2, 10.5, 28).translate(X, 19.6 + 5.25, Z));
      add(sl, new THREE.CylinderGeometry(0.08, 0.1, 2.2, 6).translate(X, 31, Z));
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.2;
        for (const [y, h] of [[10.5, 3.2], [3.6, 2.4]]) {
          const wgeo = new THREE.CylinderGeometry(0.75, 0.75, 0.35, 10, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(0).translate(0, h / 2, 0);
          const rect = new THREE.BoxGeometry(1.5, h, 0.35);
          for (const gg of [rect, wgeo]) {
            gg.rotateY(-a + Math.PI / 2);
            gg.translate(X + Math.cos(a) * (R + 0.05), y, Z + Math.sin(a) * (R + 0.05));
            add(y > 5 ? wl : dk, gg);
          }
        }
      }
    }
    // 1915 tower: square, corner turrets, crenellated parapet
    {
      const X = 150, Z = -36, W = 12, H = 17;
      const rot = (geo) => geo.rotateY(-TH1).translate(X, 0, Z);
      add(st, rot(new THREE.BoxGeometry(W + 4, 3, W + 4).translate(0, 0.5, 0)));
      add(st, rot(new THREE.BoxGeometry(W, H, W).translate(0, 2 + H / 2, 0)));
      add(st, rot(new THREE.BoxGeometry(W + 0.6, 0.6, W + 0.6).translate(0, 8, 0)));
      add(st, rot(new THREE.BoxGeometry(W + 1.4, 1.0, W + 1.4).translate(0, 2 + H + 0.5, 0)));
      add(st, rot(new THREE.BoxGeometry(W + 1.4, 1.2, W + 1.4).translate(0, 2 + H + 1.6, 0)));
      for (const side of [0, 1, 2, 3]) {
        for (let k = 0; k < 6; k++) {
          const u = -W / 2 + 1 + k * 2;
          const geo = new THREE.BoxGeometry(1.1, 1.0, 0.7).translate(u, 2 + H + 2.7, W / 2 + 0.35).rotateY((side * Math.PI) / 2);
          add(st, rot(geo));
        }
        // windows: tall arched pair per face, plus a low row
        for (const u of [-2.2, 2.2]) {
          const rect = new THREE.BoxGeometry(1.6, 4.6, 0.3).translate(u, 11.6, W / 2 + 0.02).rotateY((side * Math.PI) / 2);
          const arch = new THREE.CylinderGeometry(0.8, 0.8, 0.3, 10, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(u, 13.9, W / 2 + 0.02).rotateY((side * Math.PI) / 2);
          add(wl, rot(rect)); add(wl, rot(arch));
          add(dk, rot(new THREE.BoxGeometry(1.2, 2.0, 0.3).translate(u, 4.4, W / 2 + 0.02).rotateY((side * Math.PI) / 2)));
        }
      }
      add(sl, rot(new THREE.ConeGeometry(W * 0.62, 4.5, 4).rotateY(Math.PI / 4).translate(0, 2 + H + 1 + 2.25, 0)));
      for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = (cx * W) / 2, z = (cz * W) / 2;
        add(st, rot(new THREE.CylinderGeometry(1.9, 1.9, H + 3.4, 16).translate(x, 2 + (H + 3.4) / 2, z)));
        add(st, rot(new THREE.CylinderGeometry(2.3, 1.9, 0.8, 16).translate(x, 2 + H + 3.6, z)));
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          add(st, rot(new THREE.BoxGeometry(0.8, 0.8, 0.5).rotateY(-a).translate(x + Math.cos(a) * 2.1, 2 + H + 4.4, z + Math.sin(a) * 2.1)));
        }
        add(sl, rot(new THREE.ConeGeometry(1.9, 4.2, 16).translate(x, 2 + H + 4.0 + 2.1, z)));
        add(wl, rot(new THREE.BoxGeometry(0.5, 1.6, 0.5).translate(x + cx * 1.75, 15, z + cz * 1.75)));
      }
    }
    const tm = new THREE.Mesh(mergeGeometries(st), stone);
    tm.receiveShadow = true;
    g.add(tm, new THREE.Mesh(mergeGeometries(sl), slate), new THREE.Mesh(mergeGeometries(dk), dark), new THREE.Mesh(mergeGeometries(wl), winLit));
  }

  // ---- riparian woods on the far bank and along the near shore ----------------------
  {
    const leaf = [], wood = [];
    const r = seeded(2025);
    const greens = [0x4b6331, 0x5a7038, 0x3f5a2c, 0x667a3d, 0x52683a];
    const tree = (x, z, s) => {
      const h = (5 + r() * 4) * s;
      wood.push(new THREE.CylinderGeometry(0.25 * s, 0.4 * s, h, 5).translate(x, h / 2, z).toNonIndexed());
      const base = new THREE.Color(greens[Math.floor(r() * greens.length)]);
      for (let k = 0; k < 4; k++) {
        const rr = (2.6 + r() * 2.2) * s, a = r() * 6.28, d = k ? (1.5 + r() * 2.5) * s : 0;
        const sg = new THREE.SphereGeometry(rr, 7, 5).scale(1, 0.85, 1).translate(x + Math.cos(a) * d, h + (r() - 0.2) * 2.5 * s + 1.2 * s, z + Math.sin(a) * d).toNonIndexed();
        const c = base.clone().offsetHSL(0, 0, (r() - 0.5) * 0.08);
        const n = sg.attributes.position.count, col = new Float32Array(n * 3);
        sg.computeBoundingBox();
        for (let i = 0; i < n; i++) { const kk = 0.7 + 0.3 * (sg.attributes.position.getY(i) - sg.boundingBox.min.y) / (2 * rr); col[i * 3] = c.r * kk; col[i * 3 + 1] = c.g * kk; col[i * 3 + 2] = c.b * kk; }
        sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
        leaf.push(sg);
      }
    };
    // far bank (where the bridge lands)
    for (let n = 0; n < 70; n++) {
      const q = -60 + r() * 280;
      const off = 8 + r() * 45;
      const x = FAR.x + 0.545 * q + RN.x * off, z = FAR.y + 0.839 * q + RN.y * off;
      if (x > XMAX - 4 || z < ZMIN + 4 || z > ZMAX - 4) continue;
      tree(x, z, 1 + r() * 0.5);
    }
    // a few cottonwoods on the near bank, kept clear of the view
    for (let n = 0; n < 9; n++) {
      const q = -150 + r() * 120;
      const x = NEAR.x + 0.545 * q - RN.x * (6 + r() * 12), z = NEAR.y + 0.839 * q - RN.y * (6 + r() * 12);
      if (x < XMIN + 4) continue;
      tree(x, z, 1.1 + r() * 0.4);
    }
    // far-bank ground: a low grassy bank so the trees don't float on water
    const bank = [];
    for (let q = -80; q <= 240; q += 8) {
      for (let k = 0; k < 2; k++) {
        const off = 4 + k * 16;
        const x = FAR.x + 0.545 * q + RN.x * off, z = FAR.y + 0.839 * q + RN.y * off;
        bank.push([x, z]);
      }
    }
    const bankGeo = [];
    for (const [x, z] of bank) {
      if (x > XMAX - 2 || z < ZMIN + 2 || z > ZMAX) continue;
      bankGeo.push(new THREE.CylinderGeometry(10, 13, 1.6, 7).translate(x, 0.2, z).toNonIndexed());
    }
    const wm = new THREE.Mesh(mergeGeometries(wood), mat(0x4a3e30));
    const lm = new THREE.Mesh(mergeGeometries(leaf), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    const bm = new THREE.Mesh(mergeGeometries(bankGeo), mat(0x5f7a3c, { roughness: 1 }));
    bm.receiveShadow = true;
    g.add(wm, lm, bm);
  }

  // ---- gulls over the rapids ----------------------------------------------------
  const gulls = [];
  {
    const white = mat(0xf4f4f0, { roughness: 0.7, side: THREE.DoubleSide });
    const grey = mat(0x9aa0a6, { roughness: 0.7, side: THREE.DoubleSide });
    const wing = new THREE.Shape([new THREE.Vector2(0, 0.08), new THREE.Vector2(0.45, 0.06), new THREE.Vector2(0.75, -0.04), new THREE.Vector2(0.4, -0.1), new THREE.Vector2(0, -0.1)]);
    const wingGeo = new THREE.ShapeGeometry(wing).rotateX(Math.PI / 2);
    const r = seeded(77);
    const v = new THREE.Vector3();
    for (let k = 0; k < 6; k++) {
      const b = new THREE.Group();
      b.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4).scale(1, 0.9, 3.2), white));
      const wl = new THREE.Group(), wr = new THREE.Group();
      wr.add(new THREE.Mesh(wingGeo, grey));
      const lmm = new THREE.Mesh(wingGeo, grey); lmm.scale.x = -1; wl.add(lmm);
      b.add(wl, wr);
      b.scale.setScalar(1.6);
      b.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      g.add(b);
      P(160 + k * 55, -35 - r() * 30, 0, v);
      gulls.push({ b, wl, wr, cx: v.x, cz: v.z, rad: 14 + r() * 22, h: 7 + r() * 14, sp: (0.25 + r() * 0.2) * (k % 2 ? 1 : -1), ph: r() * 6, fl: 5 + r() * 2 });
    }
  }

  return {
    group: g,
    glow,
    update(t, dt, day) {
      ripple.offset.set(t * 0.004, t * 0.006);
      foamMats[0].map.offset.set(t * 0.002, -t * 0.09);
      foamMats[1].map.offset.set(-t * 0.003, -t * 0.14);
      foamMats[0].opacity = foamMats[0].userData.base * (0.85 + 0.15 * Math.sin(t * 2.3));
      foamMats[1].opacity = foamMats[1].userData.base * (0.8 + 0.2 * Math.sin(t * 3.1 + 1));
      for (const e of gulls) {
        const a = e.ph + t * e.sp;
        const s = Math.sign(e.sp);
        e.b.position.set(e.cx + Math.cos(a) * e.rad, e.h + Math.sin(t * 0.5 + e.ph) * 1.5, e.cz + Math.sin(a) * e.rad);
        e.b.rotation.set(0, -a + (s > 0 ? Math.PI : 0), 0);
        e.b.rotateZ(-0.35 * s);
        const flap = Math.sin(t * e.fl + e.ph) * (Math.sin(t * 0.7 + e.ph) > 0 ? 0.55 : 0.08);
        e.wr.rotation.z = flap; e.wl.rotation.z = -flap;
      }
    },
  };
}
