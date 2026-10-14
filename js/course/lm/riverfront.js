// Alton, Illinois riverfront (hole 4). Local +X faces the fairway; the
// Mississippi runs along local Z on the far (-X) side. Includes the Clark Bridge
// (1994: single concrete pylons carrying two planes of yellow-sheathed stays),
// the riverfront grain elevators, the Argosy Casino Alton (moored 1991, the
// state's first riverboat casino), the Riverfront Park amphitheater with its
// white tensile canopy, the marina and the river-walk promenade.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, lit, seeded, canvasTex } from './kit.js';

// ── helpers ─────────────────────────────────────────────────────────────────
const _o = new THREE.Object3D();
function place(g, x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz); _o.scale.set(sx, sy, sz); _o.updateMatrix();
  return g.applyMatrix4(_o.matrix);
}
const bx = (w, h, d, x, y, z, ry = 0) => place(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), x, y, z, ry);
const cy = (rt, rb, h, x, y, z, seg = 12) => place(new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, h / 2, 0), x, y, z);
const _up = new THREE.Vector3(0, 1, 0);
/** Cylinder from A to B. */
function rod(A, B, r, seg = 4) {
  const d = new THREE.Vector3().subVectors(B, A);
  const L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true);
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d.normalize());
  g.applyQuaternion(q);
  return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}
/** Box spanning P→Q (top surface on the P–Q line), width across, depth below. */
function span(P, Q, width, depth, lat = 0) {
  const xa = new THREE.Vector3().subVectors(Q, P);
  const L = xa.length(); xa.normalize();
  const za = new THREE.Vector3().crossVectors(xa, _up).normalize();
  const ya = new THREE.Vector3().crossVectors(za, xa);
  const m = new THREE.Matrix4().makeBasis(xa, ya, za);
  const g = new THREE.BoxGeometry(L, depth, width).translate(0, -depth / 2, lat).applyMatrix4(m);
  return g.translate((P.x + Q.x) / 2, (P.y + Q.y) / 2, (P.z + Q.z) / 2);
}
class Batch {
  constructor() { this.m = new Map(); }
  add(material, ...geoms) { if (!this.m.has(material)) this.m.set(material, []); this.m.get(material).push(...geoms); }
  build(group, shadow = true) {
    const out = [];
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
      group.add(mesh); out.push(mesh);
    }
    this.m.clear();
    return out;
  }
}
function haloTex() {
  return canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(255,240,215,0.5)'); gr.addColorStop(1, 'rgba(255,230,200,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
function bulbs(pts, color, size, tex) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const m = new THREE.PointsMaterial({ map: tex, color, size, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const p = new THREE.Points(g, m);
  p.castShadow = false;
  return p;
}
/** Instanced low-poly people at [x,y,z,rotY] spots. */
function crowd(group, spots, rnd) {
  const n = spots.length;
  const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.85, 0.2).translate(0, 0.425, 0), mat(0xffffff), n);
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.62, 0.25).translate(0, 1.16, 0), mat(0xffffff), n);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.6, 0), mat(0xffffff, { roughness: 0.6 }), n);
  const shirts = [0xc8443a, 0x2f5d8a, 0xe8e2d4, 0x3f6e48, 0xd9a441, 0x6b4b7a, 0x1e2a36, 0xe07a5f, 0x9bb7d4];
  const skins = [0x8d5524, 0xc68642, 0xe0ac69, 0xf1c27d, 0x5c3a21];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), e = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3();
  spots.forEach(([x, y, z, r], i) => {
    const s = 0.92 + rnd() * 0.14;
    m4.compose(v.set(x, y, z), q.setFromEuler(e.set(0, r ?? rnd() * 6.28, 0)), s3.set(s, s, s));
    legs.setMatrixAt(i, m4); body.setMatrixAt(i, m4); head.setMatrixAt(i, m4);
    legs.setColorAt(i, c.set(rnd() < 0.5 ? 0x2c3442 : 0x5a5348));
    body.setColorAt(i, c.set(shirts[Math.floor(rnd() * shirts.length)]));
    head.setColorAt(i, c.set(skins[Math.floor(rnd() * skins.length)]));
  });
  for (const m of [legs, body, head]) { m.castShadow = false; group.add(m); }
}
function trees(group, list, rnd) {
  const n = list.length;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 1, 5).translate(0, 0.5, 0), mat(0x4e4034, { roughness: 0.9 }), n);
  const crown = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 9, 6), mat(0xffffff, { roughness: 0.85 }), n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), v = new THREE.Vector3(), s = new THREE.Vector3();
  list.forEach(([x, y, z, r], i) => {
    const th = r * 1.1;
    trunk.setMatrixAt(i, m4.compose(v.set(x, y, z), q.identity(), s.set(1, th, 1)));
    crown.setMatrixAt(i, m4.compose(v.set(x, y + th + r * 0.85, z), q, s.set(r, r * 1.15, r)));
    crown.setColorAt(i, c.setHSL(0.23 + rnd() * 0.06, 0.38 + rnd() * 0.15, 0.24 + rnd() * 0.07));
  });
  group.add(trunk, crown);
}
/** A flag that waves by vertex displacement (no allocation per frame). */
function flag(tex, w, h) {
  const g = new THREE.PlaneGeometry(w, h, 10, 4).translate(w / 2, 0, 0);
  const base = g.attributes.position.array.slice();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
  m.castShadow = false;
  m.userData.wave = (t, ph) => {
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const x = base[i];
      p[i + 2] = Math.sin(x * 1.6 - t * 5.5 + ph) * 0.16 * (x / w) + Math.sin(x * 3.1 - t * 8 + ph) * 0.05 * (x / w);
    }
    g.attributes.position.needsUpdate = true;
  };
  return m;
}
function usFlagTex() {
  return canvasTex(190, 100, (g, w, h) => {
    for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#b22234'; g.fillRect(0, (i * h) / 13, w, h / 13 + 1); }
    g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, w * 0.4, (h * 7) / 13);
    g.fillStyle = '#fff';
    for (let r = 0; r < 9; r++) for (let c = 0; c < (r % 2 ? 5 : 6); c++) g.fillRect(4 + c * 12.4 + (r % 2) * 6.2, 3 + r * 5.6, 2, 2);
  });
}

// ── the Argosy Casino Alton: a permanently moored, steamboat-styled casino ──
function casino(tex, glow, B, bulbPts) {
  const white = mat(0xf3f1ea, { roughness: 0.55 });
  const hull = mat(0x1f2b38, { roughness: 0.5, metalness: 0.3 });
  const gold = lit(0xc9a24a, 0xffcf70, { metalness: 0.7, roughness: 0.35, night: 0.5 });
  const red = mat(0xa3202a, { roughness: 0.5 });
  const black = mat(0x16181b, { roughness: 0.6 });
  const rail = mat(0xffffff, { roughness: 0.5 });
  glow.push(gold);
  // window-band facade
  const winTex = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#f2efe6'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      const x = i * 32 + 7;
      g.fillStyle = '#26323e'; g.fillRect(x, 16, 18, 34);
      g.beginPath(); g.arc(x + 9, 16, 9, Math.PI, 0); g.fill();
    }
    g.fillStyle = '#b8902f'; g.fillRect(0, 58, w, 4);
    g.fillStyle = '#9a1f28'; g.fillRect(0, 2, w, 3);
  });
  const winEm = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      const x = i * 32 + 7;
      g.fillStyle = i % 3 === 1 ? '#ff9d5c' : '#ffd38a'; g.fillRect(x, 16, 18, 34);
      g.beginPath(); g.arc(x + 9, 16, 9, Math.PI, 0); g.fill();
    }
    g.fillStyle = '#ffcf70'; g.fillRect(0, 58, w, 4);
  });
  for (const t of [winTex, winEm]) { t.wrapS = THREE.RepeatWrapping; }
  const deckWin = new THREE.MeshStandardMaterial({ map: winTex, emissiveMap: winEm, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.5 });
  deckWin.userData.night = 1.4;
  glow.push(deckWin);
  const band = (w, h, d, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
    const n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(n.getY(i)) > 0.5) { uv.setXY(i, 0.01, 0.5); continue; }
      const L = Math.abs(n.getX(i)) > 0.5 ? d : w;
      uv.setX(i, uv.getX(i) * L / 9);
    }
    return g;
  };
  // hull / barge
  B.add(hull, bx(23, 2.6, 78, 0, -0.5, 0));
  B.add(red, bx(23.2, 0.35, 78.2, 0, 1.7, 0));
  const decks = [[0, 2.1, 22.4, 76, 18, 66, 4.6], [1, 7.0, 21, 72, 16.4, 58, 4.0], [2, 11.3, 19, 62, 13, 38, 3.4]];
  for (const [k, y, sw, sl, ew, el, eh] of decks) {
    B.add(white, bx(sw, 0.4, sl, 0, y, 0));
    B.add(gold, bx(sw + 0.15, 0.22, sl + 0.15, 0, y + 0.05, 0));
    B.add(deckWin, band(ew, eh, el, 0, y + 0.4, k === 2 ? -6 : 0));
    // railing posts + top rail around the deck edge
    const yy = y + 0.4;
    for (let z = -sl / 2 + 1; z <= sl / 2 - 1; z += 2) for (const s of [-1, 1]) B.add(rail, bx(0.07, 1.05, 0.07, s * (sw / 2 - 0.25), yy, z));
    for (let x = -sw / 2 + 1; x <= sw / 2 - 1; x += 2) for (const s of [-1, 1]) B.add(rail, bx(0.07, 1.05, 0.07, x, yy, s * (sl / 2 - 0.25)));
    for (const s of [-1, 1]) {
      B.add(rail, bx(0.12, 0.1, sl - 0.4, s * (sw / 2 - 0.25), yy + 1.05, 0), bx(sw - 0.4, 0.1, 0.12, 0, yy + 1.05, s * (sl / 2 - 0.25)));
      B.add(gold, bx(0.06, 0.06, sl - 0.4, s * (sw / 2 - 0.25), yy + 0.5, 0));
    }
    // white columns carrying the deck above
    if (k < 2) for (let z = -sl / 2 + 3; z <= sl / 2 - 3; z += 6) for (const s of [-1, 1]) B.add(white, bx(0.3, decks[k + 1][1] - yy, 0.3, s * (sw / 2 - 0.6), yy, z));
    // string lights along the shore side and the ends
    for (let z = -sl / 2; z <= sl / 2; z += 1.6) bulbPts.push(sw / 2, y + 0.3, z, -sw / 2, y + 0.3, z);
    for (let x = -sw / 2; x <= sw / 2; x += 1.6) bulbPts.push(x, y + 0.3, sl / 2, x, y + 0.3, -sl / 2);
  }
  // roof, pilot house and cresting
  B.add(white, bx(14.5, 0.35, 42, 0, 15.1, -6));
  B.add(gold, bx(14.7, 0.25, 42.2, 0, 15.15, -6));
  B.add(deckWin, band(7, 2.8, 7, 0, 15.45, -20));
  B.add(white, bx(8.2, 0.3, 8.2, 0, 18.25, -20));
  B.add(gold, place(new THREE.ConeGeometry(1.2, 1.4, 8).translate(0, 0.7, 0), 0, 18.55, -20));
  for (let x = -3.6; x <= 3.6; x += 0.9) B.add(gold, place(new THREE.ConeGeometry(0.18, 0.7, 4).translate(0, 0.35, 0), x, 18.55, -24.1));
  // twin decorative stacks with gold feathered crowns, forward of the pilot house
  for (const s of [-1, 1]) {
    B.add(black, cy(1.05, 1.15, 15, s * 4.4, 15.4, -27, 16));
    const crown = new THREE.CylinderGeometry(2.0, 1.2, 2.2, 16, 1, true);
    const p = crown.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { const k = (Math.round((Math.atan2(p.getZ(i), p.getX(i)) / (Math.PI * 2)) * 16) + 16) % 2; const f = k ? 1.0 : 0.7; p.setXYZ(i, p.getX(i) * f, p.getY(i) + (k ? 0.6 : 0), p.getZ(i) * f); }
    crown.computeVertexNormals();
    B.add(gold, place(crown, s * 4.4, 31.5, -27));
    B.add(gold, cy(1.2, 1.2, 0.4, s * 4.4, 23, -27, 16));
  }
  B.add(gold, bx(8.8, 0.25, 0.25, 0, 26, -27)); // spreader bar between stacks
  // decorative stern paddle wheel
  const wheel = new THREE.CylinderGeometry(5.2, 5.2, 15, 20, 1, false).rotateZ(Math.PI / 2);
  B.add(red, place(wheel, 0, 4.2, 41.6));
  for (let k = 0; k < 10; k++) B.add(white, place(new THREE.BoxGeometry(15.4, 0.3, 11), 0, 4.2, 41.6, 0, 1, 1, 1, (k / 10) * Math.PI));
  // sign on the shore side of the Texas deck
  const sign = canvasTex(512, 96, (g, w, h) => {
    g.fillStyle = '#7d1520'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d8b25a'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#f5d98a'; g.font = 'bold 56px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('ARGOSY CASINO', w / 2, h / 2 + 3);
  });
  const signM = new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.5 });
  signM.userData.night = 1.0;
  glow.push(signM);
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(20, 3.6).rotateY(Math.PI / 2), signM);
  sm.position.set(6.6, 13.4, 2);
  return sm;
}

// ── a Mississippi towboat pushing four covered hopper barges (moves along Z) ──
function tow(glow) {
  const g = new THREE.Group();
  const B = new Batch();
  const rust = mat(0x5a3b2b, { roughness: 0.85 });
  const black = mat(0x1d1f22, { roughness: 0.7 });
  const covers = [mat(0x355a7a, { roughness: 0.7 }), mat(0x8a5c34, { roughness: 0.8 }), mat(0x3f5f46, { roughness: 0.75 })];
  const white = mat(0xeeeeea, { roughness: 0.5 });
  const red = mat(0xa52a26, { roughness: 0.55 });
  const glass = lit(0x1e2a33, 0xffd89a, { night: 1.2, roughness: 0.2 });
  glow.push(glass);
  let i = 0;
  for (const z of [-30, -90]) for (const x of [-5.4, 5.4]) {
    B.add(black, bx(10.6, 3.3, 59, x, -1.6, z));
    B.add(rust, bx(10.7, 0.5, 59.1, x, 1.2, z));
    const cv = covers[i++ % 3];
    for (let k = 0; k < 4; k++) B.add(cv, place(new THREE.CylinderGeometry(4.2, 4.2, 13, 10, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, 0.36, 1).translate(0, 1.7, 0), x, 0, z - 22 + k * 14.6, Math.PI / 2 * 0));
  }
  // towboat astern (+Z)
  B.add(black, bx(11, 2.6, 36, 0, -1.2, 18.5));
  B.add(red, bx(11.1, 0.4, 36.1, 0, 1.3, 18.5));
  B.add(white, bx(9.5, 3, 24, 0, 1.7, 22), bx(8.5, 2.8, 16, 0, 4.7, 23), bx(6.5, 2.4, 6, 0, 7.5, 19));
  B.add(glass, bx(6.6, 1.2, 6.1, 0, 8.2, 19), bx(8.6, 0.8, 16.1, 0, 5.7, 23));
  B.add(white, bx(7.2, 0.3, 6.8, 0, 9.9, 19));
  for (const s of [-1, 1]) B.add(black, cy(0.45, 0.45, 5, s * 2.4, 7.5, 26, 10), bx(0.8, 4, 1, s * 4.5, 1.4, 0.5)); // stacks, push knees
  B.add(white, cy(0.06, 0.06, 4, 0, 10.2, 19, 4));
  B.build(g);
  return g;
}

export default function build() {
  const group = new THREE.Group();
  const glow = [];
  const rnd = seeded(1994);
  const B = new Batch();
  const halo = haloTex();
  const QY = 1.3; // promenade / quay height above the water line
  const WY = 0.12; // water surface

  // ── the river ──
  const ripple = canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = (x / w) * Math.PI * 2, b = (y / h) * Math.PI * 2;
      const dx = Math.cos(a * 3 + Math.sin(b * 2)) * 0.5 + Math.cos(a * 7 + b * 2) * 0.25;
      const dy = Math.cos(b * 5 + Math.sin(a * 3)) * 0.5 + Math.cos(b * 11 - a * 4) * 0.2;
      const k = (y * w + x) * 4;
      img.data[k] = 128 + dx * 60; img.data[k + 1] = 128 + dy * 60; img.data[k + 2] = 255; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, [14, 22]);
  ripple.colorSpace = THREE.NoColorSpace;
  const water = new THREE.MeshStandardMaterial({ color: 0x2c4847, roughness: 0.15, metalness: 0.2, normalMap: ripple, normalScale: new THREE.Vector2(0.35, 0.35) });
  const river = new THREE.Mesh(new THREE.PlaneGeometry(108, 360).rotateX(-Math.PI / 2), water);
  river.position.set(-160 + 54, WY, -40);
  river.receiveShadow = true; river.castShadow = false;
  group.add(river);

  // ── quay wall, promenade and the park ──
  const stone = mat(0x9c958a, { roughness: 0.85 });
  const paving = mat(0xc9c1b2, { roughness: 0.8 });
  const grass = mat(0x5f8a40, { roughness: 0.95 });
  const ironM = mat(0x23272b, { metalness: 0.5, roughness: 0.5 });
  B.add(stone, bx(3, QY + 1.2, 360, -54.5, -1.2, -40)); // river wall
  B.add(paving, bx(10, QY, 360, -48, 0, -40)); // promenade
  B.add(ironM, bx(0.08, 0.06, 360, -55.8, QY + 1.0, -40)); // railing top
  for (let z = -219; z <= 139; z += 2.5) B.add(ironM, bx(0.05, 1.0, 0.05, -55.8, QY, z));
  // grassy bank from the promenade down to the park
  {
    const pos = [-43, QY, 140, -43, QY, -220, -38, 0, -220, -43, QY, 140, -38, 0, -220, -38, 0, 140];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) { g.setAttribute('position', new THREE.Float32BufferAttribute([-43, QY, 140, -38, 0, -220, -43, QY, -220, -43, QY, 140, -38, 0, 140, -38, 0, -220], 3)); g.computeVertexNormals(); }
    B.add(grass, g);
  }
  // promenade lamps (cast-iron posts with globes) and benches
  const lampHead = lit(0xfff6e4, 0xffd59a, { night: 2.4, roughness: 0.3 });
  glow.push(lampHead);
  const halos = [];
  for (let z = -215; z <= 135; z += 15) {
    B.add(ironM, cy(0.08, 0.12, 3.8, -51.8, QY, z, 6));
    B.add(lampHead, place(new THREE.SphereGeometry(0.28, 10, 8), -51.8, QY + 4.05, z));
    halos.push(-51.8, QY + 4.05, z);
    if (Math.abs(z % 30) < 1) B.add(mat(0x5a3e2a, { roughness: 0.8 }), bx(1.8, 0.45, 0.55, -45, QY, z + 7));
  }

  // ── Clark Bridge ──
  const S0 = new THREE.Vector3(56, 0, -30);
  const th = 42 * Math.PI / 180;
  const D = new THREE.Vector3(-Math.cos(th), 0, -Math.sin(th));
  const N = new THREE.Vector3(-D.z, 0, D.x);
  const DH = 16; // deck height above water
  const H = (s) => (s < 110 ? 1 + (DH - 1) * Math.sin((s / 110) * Math.PI / 2) : DH + 0.6 * Math.sin(Math.min(1, (s - 110) / 190) * Math.PI));
  const P = (s, lat = 0, dy = 0) => new THREE.Vector3(S0.x + D.x * s + N.x * lat, H(s) + dy, S0.z + D.z * s + N.z * lat);
  const deckM = mat(0x8f9294, { roughness: 0.8 });
  const girder = mat(0xb9bdc0, { roughness: 0.55, metalness: 0.35 });
  const concrete = mat(0xc3c0b8, { roughness: 0.8 });
  const cableM = lit(0xf3e7a6, 0xfff2b0, { roughness: 0.4, night: 0.35 });
  glow.push(cableM);
  const SEND = 300, sP = [150, 275];
  for (let s = 0; s < SEND; s += 10) {
    const a = P(s), b = P(Math.min(SEND, s + 10));
    B.add(deckM, span(a, b, 24, 0.35));
    for (const l of [-11.6, 11.6]) {
      B.add(girder, span(P(s, 0, -0.35), P(Math.min(SEND, s + 10), 0, -0.35), 1.0, 2.1, l)); // edge girders
      B.add(concrete, span(P(s, 0, 0.9), P(Math.min(SEND, s + 10), 0, 0.9), 0.45, 0.9, l * 0.98)); // parapets
    }
    B.add(concrete, span(P(s, 0, 0.8), P(Math.min(SEND, s + 10), 0, 0.8), 0.7, 0.8)); // median barrier
  }
  // approach piers (on land) and the end pier
  for (const s of [22, 46, 70, 94, 118, 200, 300]) {
    const c = P(s), h = c.y - 2.4;
    if (h < 0.5) continue;
    for (const l of [-7, 7]) { const p = P(s, l); B.add(concrete, place(new THREE.CylinderGeometry(1.0, 1.1, h, 12).translate(0, h / 2, 0), p.x, 0, p.z)); }
    const cap = P(s, 0, -2.4);
    B.add(concrete, place(new THREE.BoxGeometry(2.4, 1.4, 19).translate(0, 0.7 - 1.4, 0), cap.x, cap.y + 0.1, cap.z, Math.atan2(-D.z, D.x)));
  }
  // pylons: single tapered concrete columns in the median, saddle on top
  const PYH = 54; // above the deck
  const deckLights = [];
  for (const sp of sP) {
    const base = P(sp);
    const ry = Math.atan2(-D.z, D.x);
    B.add(concrete, place(new THREE.CylinderGeometry(7, 7.5, 3, 20).scale(1, 1, 0.55).translate(0, 1.5, 0), base.x, -1.5 + WY, base.z, ry)); // pier
    const col = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const p = col.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = p.getY(i); p.setX(i, p.getX(i) * (6.5 - 2.8 * t)); p.setZ(i, p.getZ(i) * (5.0 - 1.6 * t)); p.setY(i, t * (base.y + PYH)); }
    col.computeVertexNormals();
    B.add(concrete, place(col, base.x, 0, base.z, ry));
    B.add(girder, place(new THREE.BoxGeometry(4.4, 2.6, 4.2).translate(0, 1.3, 0), base.x, base.y + PYH - 0.2, base.z, ry)); // saddle
    // two planes of stays from the saddle to the deck edges, fanned both ways
    for (const dir of [-1, 1]) for (let k = 0; k < 11; k++) {
      const s = sp + dir * (12 + k * 5.2);
      if (s > SEND - 1) continue;
      for (const l of [-11.2, 11.2]) {
        const top = P(sp, l * 0.06, PYH - 1.2 - k * 0.55);
        top.y = base.y + PYH - 1.2 - k * 0.55;
        B.add(cableM, rod(top, P(s, l, 0.4), 0.17, 4));
      }
    }
    deckLights.push(base.x, base.y + PYH + 3, base.z); // aviation light
  }
  // deck light poles
  for (let s = 15; s < SEND; s += 30) for (const l of [-11.6, 11.6]) {
    const p = P(s, l);
    B.add(ironM, cy(0.1, 0.12, 8, p.x, p.y + 0.9, p.z, 5));
    const h = P(s, l * 0.85);
    B.add(lampHead, place(new THREE.BoxGeometry(0.8, 0.25, 0.4), h.x, p.y + 8.9, h.z));
    halos.push(h.x, p.y + 8.8, h.z);
  }
  // a few cars on the bridge
  {
    const carCols = [0xd8d8d8, 0x2b2f36, 0x8a1c1c, 0x2c4a7a, 0xa9a9a9, 0x111111];
    for (let i = 0; i < 10; i++) {
      const s = 20 + rnd() * 270, l = [-8.2, -4.6, 4.6, 8.2][i % 4];
      const p = P(s, l);
      B.add(mat(carCols[i % carCols.length], { roughness: 0.35, metalness: 0.4 }), place(new THREE.BoxGeometry(4.5, 1.4, 1.9).translate(0, 0.9, 0), p.x, p.y, p.z, Math.atan2(-D.z, D.x)));
    }
  }

  // ── grain elevators (slip-formed concrete silos + headhouse) ──
  {
    const tex = canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = '#bdb7aa'; g.fillRect(0, 0, w, h);
      const r = seeded(5);
      for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(70,62,52,${0.05 + r() * 0.1})`; g.fillRect(r() * w, r() * h * 0.3, 1 + r() * 3, h * (0.3 + r() * 0.7)); }
      for (let y = 0; y < h; y += 16) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, y, w, 1); }
    }, [1, 1]);
    const silo = mat(0xffffff, { map: tex, roughness: 0.9 });
    const roofM = mat(0x8b8780, { roughness: 0.8 });
    const steel = mat(0x7c7f80, { metalness: 0.4, roughness: 0.6 });
    for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) {
      const x = -30 + r * 8.6, z = 102 + c * 6;
      B.add(silo, place(new THREE.CylinderGeometry(4.3, 4.3, 36, 18, 1, true).translate(0, 18, 0), x, 0, z, 0, 1, 1, 1));
      B.add(roofM, cy(4.3, 4.3, 0.4, x, 36, z, 18));
    }
    B.add(silo, bx(16, 2, 36, -25.7, 36.2, 117)); // gallery over the bins
    B.add(silo, bx(12, 52, 13, -26, 0, 92)); // headhouse
    B.add(roofM, bx(13, 1, 14, -26, 52, 92));
    B.add(silo, bx(8, 6, 9, -26, 53, 92));
    // conveyor gallery out to the river loading spout
    B.add(steel, span(new THREE.Vector3(-32, 30, 92), new THREE.Vector3(-58, 18, 92), 2.6, 2.8));
    B.add(steel, cy(1.2, 1.2, 18, -59, 0, 92, 10), rod(new THREE.Vector3(-59, 17, 92), new THREE.Vector3(-66, 4, 92), 0.45, 8));
    B.add(steel, rod(new THREE.Vector3(-46, 0, 92), new THREE.Vector3(-46, 24, 92), 0.4, 6));
    // windows on the headhouse
    const hw = lit(0x2d353c, 0xffcf8a, { night: 0.7 });
    glow.push(hw);
    for (let y = 6; y < 50; y += 6) B.add(hw, bx(2, 1.6, 0.2, -20, y, 85.4), bx(0.2, 1.6, 2, -19.9, y, 92));
  }

  // ── the casino, moored against the quay with a covered gangway ──
  const bulbPts = [];
  {
    const cg = new THREE.Group();
    const CB = new Batch();
    const sign = casino(null, glow, CB, bulbPts);
    CB.build(cg);
    cg.add(sign);
    const bulbsMesh = bulbs(bulbPts, 0xffd27a, 1.2, halo);
    cg.add(bulbsMesh);
    cg.position.set(-82, WY, -40);
    group.add(cg);
    group.userData.casinoBulbs = bulbsMesh;
    // gangway: glazed, lit walkway from the promenade to the boat
    const gw = lit(0xe9e6de, 0xffd9a0, { night: 0.8 });
    glow.push(gw);
    B.add(gw, bx(16, 0.4, 4, -63, QY + 0.3, -40));
    B.add(mat(0x9a1f28, { roughness: 0.5 }), place(new THREE.CylinderGeometry(2.4, 2.4, 16, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).rotateX(Math.PI / 2), -63, QY + 3.2, -40));
    for (let x = -70; x <= -56; x += 2) for (const s of [-1, 1]) B.add(ironM, bx(0.1, 2.6, 0.1, x, QY + 0.7, -40 + s * 1.9));
    // entrance pavilion on land
    const pav = lit(0xf1ede2, 0xffe2b0, { night: 0.6 });
    glow.push(pav);
    B.add(pav, bx(8, 7, 22, -33, 0, -40));
    B.add(mat(0x9a1f28), bx(9.4, 0.6, 23.4, -33, 7, -40));
    B.add(mat(0xc9a24a, { metalness: 0.6, roughness: 0.4 }), bx(9.6, 0.3, 23.6, -33, 7.6, -40));
    B.add(lit(0x2a2f36, 0xffd38a, { night: 1.2 }), bx(0.2, 3.5, 8, -28.9, 0.3, -40));
    glow.push(B.m.get([...B.m.keys()].pop())?.[0] ? [...B.m.keys()].pop() : pav);
    B.add(paving, bx(14, 0.08, 30, -38, 0, -40));
  }

  // ── Riverfront Park amphitheater: tensile canopy over the stage, lawn bowl ──
  const SC = new THREE.Vector3(-36, 0, 40); // stage centre
  {
    const conc = mat(0xcfc9bd, { roughness: 0.8 });
    const stageLit = lit(0x3a3330, 0xffb46a, { night: 1.3 });
    glow.push(stageLit);
    B.add(conc, bx(14, 1.4, 28, SC.x, 0, SC.z));
    B.add(stageLit, bx(13.6, 0.1, 27.4, SC.x, 1.4, SC.z));
    B.add(conc, bx(3, 8, 30, SC.x - 7.5, 0, SC.z)); // back wall
    // membrane: two peaked bays with scalloped edges
    const mem = new THREE.MeshStandardMaterial({ color: 0xfbfaf6, roughness: 0.6, side: THREE.DoubleSide, emissive: 0xffd7a8, emissiveIntensity: 0 });
    mem.userData.night = 0.55;
    glow.push(mem);
    const nu = 18, nv = 24;
    const pos = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      const x = SC.x - 9 + u * 20, z = SC.z - 17 + v * 34;
      const peak = (zc) => Math.exp(-(((z - zc) / 6.5) ** 2) - (((x - (SC.x - 1)) / 8) ** 2));
      const edge = Math.min(u, 1 - u, v, 1 - v);
      const y = 8.2 + 7.5 * Math.max(peak(SC.z - 8), peak(SC.z + 8)) + 1.6 * Math.min(1, edge * 6) - (u > 0.98 ? 0 : 0) + 1.2 * (1 - u);
      pos.push(x, y, z);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    mg.setIndex(idx); mg.computeVertexNormals();
    const memMesh = new THREE.Mesh(mg, mem);
    memMesh.castShadow = true;
    group.add(memMesh);
    // masts and edge cables
    const mast = mat(0xd9dcde, { metalness: 0.5, roughness: 0.4 });
    for (const zc of [SC.z - 8, SC.z + 8]) B.add(mast, rod(new THREE.Vector3(SC.x - 1, 1.4, zc), new THREE.Vector3(SC.x - 1, 16.5, zc), 0.22, 8));
    for (const [x, z] of [[SC.x + 11, SC.z - 17], [SC.x + 11, SC.z + 17], [SC.x + 11, SC.z], [SC.x - 9, SC.z - 17], [SC.x - 9, SC.z + 17]]) {
      B.add(mast, rod(new THREE.Vector3(x, 0, z), new THREE.Vector3(x - (x > SC.x ? 0.6 : -0.4), x > SC.x ? 9.0 : 10.2, z), 0.18, 8));
    }
    // terraced lawn bowl rising away from the stage (toward +X)
    const a0 = -1.05, a1 = 1.05, segs = 24;
    const rings = [];
    for (let k = 0; k <= 10; k++) rings.push([14 + k * 4, 0.42 * k]);
    const ringTop = (r0, r1, y) => {
      const p = [];
      for (let i = 0; i < segs; i++) {
        const t0 = a0 + (a1 - a0) * (i / segs), t1 = a0 + (a1 - a0) * ((i + 1) / segs);
        const A = [SC.x + Math.cos(t0) * r0, y, SC.z + Math.sin(t0) * r0], Bp = [SC.x + Math.cos(t1) * r0, y, SC.z + Math.sin(t1) * r0];
        const C = [SC.x + Math.cos(t1) * r1, y, SC.z + Math.sin(t1) * r1], Dd = [SC.x + Math.cos(t0) * r1, y, SC.z + Math.sin(t0) * r1];
        p.push(...A, ...C, ...Bp, ...A, ...Dd, ...C);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return g;
    };
    const riser = (r, y0, y1) => {
      const p = [];
      for (let i = 0; i < segs; i++) {
        const t0 = a0 + (a1 - a0) * (i / segs), t1 = a0 + (a1 - a0) * ((i + 1) / segs);
        const x0 = SC.x + Math.cos(t0) * r, z0 = SC.z + Math.sin(t0) * r, x1 = SC.x + Math.cos(t1) * r, z1 = SC.z + Math.sin(t1) * r;
        p.push(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z0);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return g;
    };
    for (let k = 0; k < rings.length - 1; k++) {
      const [r0, y] = rings[k], r1 = rings[k + 1][0], yN = rings[k + 1][1];
      B.add(grass, ringTop(r0, r1, y + 0.42));
      B.add(conc, riser(r1, y + 0.42, yN + 0.42)); // concrete seat-wall risers
      if (k < 5) for (let i = 0; i < segs; i += 1) { // bench seats on the front rows
        const t = a0 + (a1 - a0) * ((i + 0.5) / segs), r = r0 + 1;
        B.add(conc, bx(0.6, 0.45, (r * (a1 - a0)) / segs - 0.4, SC.x + Math.cos(t) * r, y + 0.42, SC.z + Math.sin(t) * r, -t));
      }
    }
    // outer berm sloping back to grade
    {
      const [rL, yL] = rings[rings.length - 1];
      const p = [];
      for (let i = 0; i < segs; i++) {
        const t0 = a0 + (a1 - a0) * (i / segs), t1 = a0 + (a1 - a0) * ((i + 1) / segs);
        const A = [SC.x + Math.cos(t0) * rL, yL + 0.42, SC.z + Math.sin(t0) * rL], Bq = [SC.x + Math.cos(t1) * rL, yL + 0.42, SC.z + Math.sin(t1) * rL];
        const C = [SC.x + Math.cos(t1) * (rL + 10), 0, SC.z + Math.sin(t1) * (rL + 10)], Dd = [SC.x + Math.cos(t0) * (rL + 10), 0, SC.z + Math.sin(t0) * (rL + 10)];
        p.push(...A, ...C, ...Bq, ...A, ...Dd, ...C);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals();
      if (g.attributes.normal.getY(0) < 0) { const a = g.attributes.position.array; for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; } g.computeVertexNormals(); }
      B.add(grass, g);
      // side walls closing the terraces
      for (const t of [a0, a1]) {
        const sh = new THREE.Shape();
        sh.moveTo(14, 0);
        for (const [r, y] of rings) { sh.lineTo(r, y + 0.42); }
        sh.lineTo(rL + 10, 0); sh.closePath();
        const sg = new THREE.ShapeGeometry(sh).rotateY(-t).translate(SC.x, 0, SC.z);
        B.add(conc, sg);
      }
    }
    // stage lights: a truss with cans, glowing at night
    B.add(mast, span(new THREE.Vector3(SC.x + 5, 8.6, SC.z - 13), new THREE.Vector3(SC.x + 5, 8.6, SC.z + 13), 0.5, 0.5));
    for (let z = -12; z <= 12; z += 3) halos.push(SC.x + 5, 8.2, SC.z + z);
  }

  // ── the marina: floating docks with moored cruisers ──
  const boatInst = [];
  {
    const dock = mat(0xb9ad98, { roughness: 0.85 });
    const float = mat(0x45484a, { roughness: 0.7 });
    B.add(dock, bx(44, 0.35, 2.4, -78, WY + 0.25, 62)); // main walk out from the quay
    B.add(float, bx(44, 0.3, 2.6, -78, WY - 0.05, 62));
    B.add(dock, bx(2.4, 0.35, 66, -99, WY + 0.25, 92));
    for (let z = 66; z <= 124; z += 9) for (const s of [-1, 1]) {
      B.add(dock, bx(12, 0.3, 1.2, -99 + s * 7, WY + 0.25, z));
      boatInst.push([-99 + s * 8, z + 4.5, s, 7.5 + rnd() * 4]);
    }
    for (let z = 70; z <= 120; z += 10) boatInst.push([-73 + (z % 20 ? 0 : 1), z, 1, 8 + rnd() * 3]);
    B.add(ironM, bx(0.4, 0.4, 0.4, -99, WY + 0.6, 125));
  }
  const hullG = (() => {
    const s = new THREE.Shape();
    s.moveTo(-0.5, -0.5); s.lineTo(0.28, -0.5); s.quadraticCurveTo(0.5, -0.45, 0.5, 0); s.quadraticCurveTo(0.5, 0.45, 0.28, 0.5); s.lineTo(-0.5, 0.5); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 4 }).rotateX(-Math.PI / 2).translate(0, -0.35, 0);
    return g;
  })();
  const cabinG = mergeGeometries([new THREE.BoxGeometry(0.42, 0.55, 0.62).translate(-0.08, 0.92, 0), new THREE.BoxGeometry(0.1, 0.38, 0.56).translate(0.17, 0.85, 0).rotateZ(0)]);
  const hulls = new THREE.InstancedMesh(hullG, mat(0xffffff, { roughness: 0.35 }), boatInst.length);
  const cabins = new THREE.InstancedMesh(cabinG, mat(0xffffff, { roughness: 0.3, metalness: 0.2 }), boatInst.length);
  {
    const c = new THREE.Color();
    const hc = [0xf4f4f2, 0xf0ede6, 0x1c2c44, 0xf4f4f2, 0x7a1c1c, 0xe9eef2];
    boatInst.forEach((b, i) => {
      hulls.setColorAt(i, c.set(hc[i % hc.length]));
      cabins.setColorAt(i, c.set(i % 3 ? 0x2a3440 : 0xe8e6e0));
    });
    group.add(hulls, cabins);
  }

  // ── barge tow moving upriver ──
  const towG = tow(glow);
  towG.position.set(-118, WY, 40);
  group.add(towG);

  // ── trees, people, flags ──
  const tl = [];
  for (let z = -200; z <= 80; z += 11) if (Math.abs(z + 40) > 16 && Math.abs(z - 40) > 22) tl.push([-40.5 + (rnd() - 0.5), 0, z, 2.6 + rnd()]);
  for (let i = 0; i < 40; i++) {
    const x = -30 + rnd() * 85, z = -200 + rnd() * 330;
    const dB = Math.abs((x - S0.x) * N.x + (z - S0.z) * N.z);
    const alongB = (x - S0.x) * D.x + (z - S0.z) * D.z;
    if (Math.hypot(x - SC.x, z - SC.z) < 72 && x > SC.x - 10) continue;
    if (dB < 18 && alongB > -5 && alongB < 140) continue;
    if (x < 10 && z > 80) continue;
    if (Math.abs(z + 40) < 18 && x < -20) continue;
    tl.push([x, 0, z, 3 + rnd() * 1.6]);
  }
  trees(group, tl, rnd);
  const people = [];
  for (let i = 0; i < 46; i++) people.push([-50 + (rnd() - 0.5) * 7, QY, -200 + rnd() * 320]);
  for (let i = 0; i < 70; i++) {
    const k = Math.floor(rnd() * 8), t = -0.9 + rnd() * 1.8, r = 14 + k * 4 + 1.5 + rnd() * 2;
    people.push([SC.x + Math.cos(t) * r, 0.42 * k + 0.42, SC.z + Math.sin(t) * r, Math.PI / 2 - t + Math.PI]);
  }
  for (let i = 0; i < 4; i++) people.push([SC.x - 2 + rnd() * 4, 1.5, SC.z - 6 + i * 4, -Math.PI / 2]);
  for (let i = 0; i < 10; i++) people.push([-38 + rnd() * 8, 0.08, -48 + rnd() * 16]);
  crowd(group, people, rnd);

  const flags = [];
  const fu = usFlagTex();
  for (const [x, y, z, h] of [[-27, 0, -53, 12], [-27, 0, -27, 12], [-82, 15.4 + WY, -60, 9], [-82, 15.4 + WY, 4, 6]]) {
    B.add(mat(0xe0e0e0, { metalness: 0.5, roughness: 0.4 }), cy(0.07, 0.1, h, x, y, z, 6));
    const f = flag(fu, 2.9, 1.55);
    f.position.set(x, y + h - 0.85, z);
    f.rotation.y = Math.PI / 2;
    group.add(f);
    flags.push(f);
  }

  const halosMesh = bulbs(halos, 0xffd59a, 3.0, halo);
  group.add(halosMesh);
  const navG = bulbs(deckLights, 0xff3a2a, 6, halo);
  group.add(navG);

  B.build(group);

  // ── per-frame life ──
  const casinoBulbs = group.userData.casinoBulbs;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const towZ0 = 120, towZ1 = -120, towSpan = towZ0 - towZ1;
  const update = (t, dt, day) => {
    const n = 1 - day;
    casinoBulbs.material.opacity = n * (0.85 + 0.15 * Math.sin(t * 3.0));
    halosMesh.material.opacity = 0.9 * n;
    navG.material.opacity = n * (Math.sin(t * 2.2) > 0.2 ? 1 : 0.15);
    casinoBulbs.visible = halosMesh.visible = n > 0.02;
    navG.visible = n > 0.02;
    ripple.offset.set(0, (t * 0.004) % 1);
    for (let i = 0; i < boatInst.length; i++) {
      const [x, z, s, L] = boatInst[i];
      const ph = i * 1.7;
      e.set(Math.sin(t * 0.8 + ph) * 0.025, s > 0 ? 0 : Math.PI, Math.sin(t * 1.1 + ph) * 0.02);
      m4.compose(v.set(x, WY + Math.sin(t * 0.9 + ph) * 0.07, z), q.setFromEuler(e), sc.set(L, L * 0.16, L * 0.34));
      hulls.setMatrixAt(i, m4);
      sc.set(L, L * 0.16 * 1.4, L * 0.34);
      m4.compose(v.set(x, WY + Math.sin(t * 0.9 + ph) * 0.07 - L * 0.04, z), q, sc);
      cabins.setMatrixAt(i, m4);
    }
    hulls.instanceMatrix.needsUpdate = cabins.instanceMatrix.needsUpdate = true;
    // the tow pushes slowly upriver (-Z), wrapping out of sight downriver
    const zt = towZ0 - ((t * 1.4 + 160) % towSpan);
    towG.position.z = zt;
    towG.position.y = WY + Math.sin(t * 0.5) * 0.04;
    for (let i = 0; i < flags.length; i++) flags[i].userData.wave(t, i * 1.3);
  };
  update(3, 0, 1);
  return { group, glow, update };
}
