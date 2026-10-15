// Alton, Illinois riverfront (hole 4). Local +X faces the fairway; the
// Mississippi runs along local Z on the far (-X) side. Includes the Clark Bridge
// (1994: single concrete pylons carrying two planes of yellow-sheathed stays),
// the riverfront grain elevators, the Argosy Casino Alton (from 1991, the
// state's first riverboat casino; a glass-walled casino boat, not a steamer), the Riverfront Park amphitheater with its
// white tensile canopy, the marina and the river-walk promenade.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, lit, seeded, canvasTex, tree, SLOT } from './kit.js';

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

// ── the Argosy Casino Alton: a permanently moored casino boat ──
// Not a steamer: a broad three-deck vessel walled in tinted glass, its decks
// banded in the casino's purple, teal and red, with a lit marquee on the roof
// facing the course (+X) and a second one toward the river.
function casino(tex, glow, B, bulbPts) {
  const white = mat(0xf2f0ea, { roughness: 0.4 });
  const hull = mat(0x23314a, { roughness: 0.45, metalness: 0.3 });
  const gold = lit(0xd6ae4e, 0xffcf70, { metalness: 0.7, roughness: 0.3, night: 0.6 });
  const rail = mat(0xffffff, { roughness: 0.5 });
  const bands = [0x6a2a8c, 0x14868c, 0xb3202e].map((c) => lit(c, c, { roughness: 0.35, metalness: 0.2, night: 1.1 }));
  glow.push(gold, ...bands);
  // tinted glass with white mullions; slot machines and chandeliers glow behind it at night
  const glassTex = canvasTex(256, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#5f86a8'); gr.addColorStop(0.55, '#2c4a68'); gr.addColorStop(1, '#1d3249');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 6; i++) g.fillRect(i * 44 + 10, 0, 14, h); // sky reflections
    g.fillStyle = '#eceae4';
    for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 3, h);
    g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
  });
  const glassEm = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const cols = ['#ffcf7a', '#ff6fb0', '#7fe0ff', '#ffd98f', '#c58aff'];
    for (let x = 3; x < w; x += 32) for (let k = 0; k < 6; k++) { g.fillStyle = cols[(x + k * 7) % cols.length]; g.fillRect(x + 4 + k * 4, 20 + (k % 3) * 9, 3, 18); }
    g.fillStyle = '#ffe3a0'; g.fillRect(0, 6, w, 4);
  });
  for (const t of [glassTex, glassEm]) t.wrapS = THREE.RepeatWrapping;
  const glass = new THREE.MeshStandardMaterial({ map: glassTex, emissiveMap: glassEm, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.12, metalness: 0.5 });
  glass.userData.night = 1.6;
  glow.push(glass);
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
  // the barge hull, painted navy with a white boot top
  B.add(hull, bx(30, 3.0, 96, 0, -0.9, 0));
  B.add(white, bx(30.2, 0.5, 96.2, 0, 1.9, 0));
  // three casino decks, each glazed all round and capped with a colour band
  const decks = [[0, 2.4, 29, 92, 26, 86, 5.0], [1, 7.8, 27, 86, 24, 78, 4.6], [2, 12.8, 24, 72, 21, 62, 4.2]];
  for (const [k, y, sw, sl, ew, el, eh] of decks) {
    B.add(white, bx(sw, 0.45, sl, 0, y, 0));
    B.add(glass, band(ew, eh, el, 0, y + 0.45, 0));
    B.add(bands[k], bx(ew + 0.3, 0.7, el + 0.3, 0, y + 0.45 + eh - 0.7, 0));
    const yy = y + 0.45;
    for (const sd of [-1, 1]) {
      B.add(rail, bx(0.12, 0.1, sl - 0.4, sd * (sw / 2 - 0.25), yy + 1.05, 0), bx(sw - 0.4, 0.1, 0.12, 0, yy + 1.05, sd * (sl / 2 - 0.25)));
      B.add(gold, bx(0.06, 0.06, sl - 0.4, sd * (sw / 2 - 0.25), yy + 0.5, 0));
    }
    for (let z = -sl / 2 + 1; z <= sl / 2 - 1; z += 2.5) for (const sd of [-1, 1]) B.add(rail, bx(0.07, 1.05, 0.07, sd * (sw / 2 - 0.25), yy, z));
    // marquee bulbs along every deck edge
    for (let z = -sl / 2; z <= sl / 2; z += 1.4) bulbPts.push(sw / 2, y + 0.3, z, -sw / 2, y + 0.3, z);
    for (let x = -sw / 2; x <= sw / 2; x += 1.4) bulbPts.push(x, y + 0.3, sl / 2, x, y + 0.3, -sl / 2);
  }
  // roof, a glass atrium dome over the main stair, and the gold cornice
  B.add(white, bx(23, 0.4, 66, 0, 17.0, 0));
  B.add(gold, bx(23.3, 0.3, 66.3, 0, 17.1, 0));
  B.add(glass, place(new THREE.SphereGeometry(5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1), 0, 17.4, 14));
  for (let z = -32; z <= 32; z += 1.4) bulbPts.push(11.5, 17.5, z, -11.5, 17.5, z);
  // rooftop marquee: a lit sign box on a steel frame, one face to the course, one to the river
  const sign = canvasTex(512, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#4a1667'); gr.addColorStop(0.5, '#7a2394'); gr.addColorStop(1, '#4a1667');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f2c862'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#ffe08a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 74px Georgia, serif'; g.fillText('ARGOSY', w / 2, h * 0.42);
    g.font = '600 28px Georgia, serif'; g.fillText('C A S I N O   ·   A L T O N', w / 2, h * 0.8);
  });
  const signM = new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.4 });
  signM.userData.night = 1.3;
  glow.push(signM);
  const frame = mat(0x2a2d33, { metalness: 0.6, roughness: 0.4 });
  for (const z of [-11, 11]) B.add(frame, bx(0.5, 3.2, 0.5, 0, 17.4, z - 6));
  B.add(frame, bx(1.4, 6.6, 25, 0, 20.6, -6));
  const sm = new THREE.Group();
  for (const sd of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(24, 6).rotateY(sd * Math.PI / 2), signM);
    m.position.set(sd * 0.75, 23.9, -6);
    sm.add(m);
  }
  for (let z = -18; z <= 6; z += 1.2) bulbPts.push(0.9, 27.3, z, -0.9, 27.3, z, 0.9, 20.5, z, -0.9, 20.5, z);
  // the name low on the course side too, over the gangway
  const low = new THREE.Mesh(new THREE.PlaneGeometry(16, 4).rotateY(Math.PI / 2), signM);
  low.position.set(12.2, 8.6, 0);
  sm.add(low);
  return sm;
}

/**
 * A large overnight sternwheeler (from Tyler's photograph at the Alton
 * levee): five white decks with red trim and rows of cabin windows, a pilot
 * house, twin black stacks, and a big red stern paddle wheel. ~100 m long.
 */
function sternwheeler(B, glow) {
  const white = mat(0xf6f5f0, { roughness: 0.55 });
  const red = mat(0xb02a26, { roughness: 0.5 });
  const black = mat(0x18191b, { roughness: 0.6 });
  const blue = mat(0x2f5f8a, { roughness: 0.5 });
  const cabins = new THREE.MeshStandardMaterial({
    roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0,
    map: canvasTex(256, 32, (g, w, h) => { g.fillStyle = '#f6f5f0'; g.fillRect(0, 0, w, h); for (let i = 0; i < 16; i++) { g.fillStyle = '#2a3440'; g.fillRect(i * 16 + 3, 6, 10, 18); } g.fillStyle = '#b02a26'; g.fillRect(0, 28, w, 3); }),
    emissiveMap: canvasTex(256, 32, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); for (let i = 0; i < 16; i++) if ((i * 7) % 3) { g.fillStyle = '#ffd59a'; g.fillRect(i * 16 + 3, 6, 10, 18); } }),
  });
  cabins.map.wrapS = cabins.emissiveMap.wrapS = THREE.RepeatWrapping;
  cabins.userData.night = 1.2;
  glow.push(cabins);
  const band = (w, h, d, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
    const n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(n.getY(i)) > 0.5) { uv.setXY(i, 0.01, 0.5); continue; }
      uv.setX(i, uv.getX(i) * (Math.abs(n.getX(i)) > 0.5 ? d : w) / 16);
    }
    return g;
  };
  B.add(white, bx(17, 3, 98, 0, -1, 0));
  B.add(red, bx(17.2, 0.4, 98.2, 0, 1.8, 0));
  for (let k = 0; k < 5; k++) {
    const y = 2.2 + k * 3.1, L = 90 - k * 9, W = 16.4 - k * 0.8;
    B.add(cabins, band(W - 1.6, 2.6, L - 4, 0, y, -k * 2));
    B.add(white, bx(W, 0.35, L, 0, y + 2.65, -k * 2));
    for (const sx of [-1, 1]) B.add(white, bx(0.08, 1.0, L - 1, sx * (W / 2 - 0.2), y + 3.0, -k * 2));
  }
  B.add(blue, bx(9, 0.3, 30, 0, 17.6, -12)); // the sun deck's awning
  B.add(white, bx(6, 3, 6, 0, 17.9, -30)); // pilot house
  for (const sx of [-1, 1]) B.add(black, cy(0.9, 1.0, 12, sx * 3.2, 17.9, -36, 14));
  // the stern wheel, red with white bucket boards
  const wheel = new THREE.CylinderGeometry(7, 7, 14, 24, 1, false).rotateZ(Math.PI / 2);
  B.add(red, place(wheel, 0, 4.6, 54));
  for (let k = 0; k < 12; k++) B.add(white, place(new THREE.BoxGeometry(14.4, 0.35, 14.6), 0, 4.6, 54, 0, 1, 1, 1, (k / 12) * Math.PI));
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
  const river = new THREE.Mesh(new THREE.PlaneGeometry(108, 500).rotateX(-Math.PI / 2), water);
  river.position.set(-160 + 54, WY, 30);
  river.receiveShadow = true; river.castShadow = false;
  group.add(river);

  // ── quay wall, promenade and the park ──
  const stone = mat(0x9c958a, { roughness: 0.85 });
  const paving = mat(0xc9c1b2, { roughness: 0.8 });
  const grass = mat(0x5f8a40, { roughness: 0.95 });
  const ironM = mat(0x23272b, { metalness: 0.5, roughness: 0.5 });
  B.add(stone, bx(3, QY + 1.2, 500, -54.5, -1.2, 30)); // river wall
  B.add(paving, bx(10, QY, 500, -48, 0, 30)); // promenade
  B.add(ironM, bx(0.08, 0.06, 500, -55.8, QY + 1.0, 30)); // railing top
  for (let z = -219; z <= 279; z += 2.5) B.add(ironM, bx(0.05, 1.0, 0.05, -55.8, QY, z));
  // grassy bank from the promenade down to the park
  {
    const pos = [-43, QY, 280, -43, QY, -220, -38, 0, -220, -43, QY, 280, -38, 0, -220, -38, 0, 280];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) { g.setAttribute('position', new THREE.Float32BufferAttribute([-43, QY, 280, -38, 0, -220, -43, QY, -220, -43, QY, 280, -38, 0, 280, -38, 0, -220], 3)); g.computeVertexNormals(); }
    B.add(grass, g);
  }
  // promenade lamps (cast-iron posts with globes) and benches
  const lampHead = lit(0xfff6e4, 0xffd59a, { night: 2.4, roughness: 0.3 });
  glow.push(lampHead);
  const halos = [];
  for (let z = -215; z <= 275; z += 15) {
    B.add(ironM, cy(0.08, 0.12, 3.8, -51.8, QY, z, 6));
    B.add(lampHead, place(new THREE.SphereGeometry(0.28, 10, 8), -51.8, QY + 4.05, z));
    halos.push(-51.8, QY + 4.05, z);
    if (Math.abs(z % 30) < 1) B.add(mat(0x5a3e2a, { roughness: 0.8 }), bx(1.8, 0.45, 0.55, -45, QY, z + 7));
  }

  // ── Clark Bridge ──
  // the Illinois end lands to the left of the amphitheater (as you face the
  // river), east of it in reality (OSM: amphitheater 38.8875 −90.1819,
  // bridge 38.8840 −90.1754, marina 38.8849 −90.1770); the deck climbs out
  // over the marina, which sits partly beneath it, and the Argosy is moored
  // off to the right in clear view
  const S0 = new THREE.Vector3(56, 0, 230);
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
  const SEND = 300, sP = [160, 285]; // pylons in the river: just off the quay (clear of the silos), and mid-channel
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
    // the riverfront face of the headhouse: "Welcome to ALTON" over a painted
    // US flag, white like the bins (from Tyler's photograph)
    {
      const muralTex = canvasTex(256, 1024, (g, w, h) => {
        g.fillStyle = '#eeebe4'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#2b3a55';
        g.font = 'italic 600 46px Georgia, serif'; g.textAlign = 'center';
        g.fillText('Welcome', w / 2, 140); g.fillText('to', w / 2, 196);
        g.font = '700 84px Georgia, serif';
        g.fillText('ALTON', w / 2, 300);
        // the flag (stripes and canton), lower on the face
        const fx = 22, fy = 520, fw = w - 44, fh = fw * 0.55;
        for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#f4f2ee' : '#b22234'; g.fillRect(fx, fy + (i * fh) / 13, fw, fh / 13 + 0.5); }
        g.fillStyle = '#3c3b6e'; g.fillRect(fx, fy, fw * 0.4, (fh * 7) / 13);
        g.fillStyle = '#ffffff';
        for (let r = 0; r < 9; r++) for (let c = 0; c < (r % 2 ? 5 : 6); c++) g.fillRect(fx + 6 + c * 15 + (r % 2 ? 7 : 0), fy + 5 + r * 8.6, 3, 3);
      });
      const muralM = new THREE.MeshStandardMaterial({ map: muralTex, roughness: 0.85, emissive: 0xfff0d8, emissiveMap: muralTex, emissiveIntensity: 0 });
      muralM.userData.night = 0.4;
      glow.push(muralM);
      // on the river face, as in life, and on the face toward the golf
      for (const [x, ry] of [[-32.08, -Math.PI / 2], [-19.92, Math.PI / 2]]) {
        const face = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 50.4), muralM);
        face.rotation.y = ry;
        face.position.set(x, 25.5, 92);
        group.add(face);
      }
    }
    // windows on the headhouse
    const hw = lit(0x2d353c, 0xffcf8a, { night: 0.7 });
    glow.push(hw);
    for (let y = 6; y < 50; y += 6) B.add(hw, bx(2, 1.6, 0.2, -20, y, 85.4));
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
    B.add(pav, bx(8, 4.2, 22, -33, 0, -40)); // kept low: the boat stays in view from the course
    B.add(mat(0x6a2a8c), bx(9.4, 0.6, 23.4, -33, 4.2, -40));
    B.add(mat(0xc9a24a, { metalness: 0.6, roughness: 0.4 }), bx(9.6, 0.3, 23.6, -33, 4.8, -40));
    B.add(lit(0x2a2f36, 0xffd38a, { night: 1.2 }), bx(0.2, 3.2, 8, -28.9, 0.3, -40));
    glow.push(B.m.get([...B.m.keys()].pop())?.[0] ? [...B.m.keys()].pop() : pav);
    B.add(paving, bx(14, 0.08, 30, -38, 0, -40));
  }

  // ── a big sternwheeler tied up at the levee below the elevators ──
  {
    const sg = new THREE.Group();
    const SB = new Batch();
    sternwheeler(SB, glow);
    SB.build(sg);
    sg.position.set(-80, WY + 1.2, 200); // upstream of the bridge
    group.add(sg);
  }

  // ── Riverfront Park amphitheater: tensile canopy over the stage, lawn bowl ──
  const SC = new THREE.Vector3(-36, 0, 40); // stage centre
  {
    const conc = mat(0xcfc9bd, { roughness: 0.8 });
    // (from Tyler's photographs) a circular brick-red stage plaza with
    // concentric bands, a long white arched membrane on stone-block pylons,
    // a round fountain in the plaza behind and a splash pad beside it
    const brick = lit(0x8a3d30, 0xffb46a, { night: 0.5, roughness: 0.9 });
    const brickL = mat(0xa45a46, { roughness: 0.9 });
    glow.push(brick);
    B.add(conc, place(new THREE.CylinderGeometry(19, 19.4, 1.1, 48).translate(0, 0.55, 0), SC.x - 4, 0, SC.z));
    B.add(brick, place(new THREE.CylinderGeometry(18.4, 18.4, 0.12, 48).translate(0, 0.06, 0), SC.x - 4, 1.1, SC.z));
    for (const r of [6, 11, 15.5]) B.add(brickL, place(new THREE.TorusGeometry(r, 0.25, 4, 48).rotateX(Math.PI / 2), SC.x - 4, 1.24, SC.z));
    // stone pylons: split-face limestone block, two at each end of the canopy
    const stoneTex = canvasTex(64, 128, (c, w, h) => {
      const r = seeded(77);
      c.fillStyle = '#b9ad96'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < w; x += 32) { const v = 165 + r() * 40; c.fillStyle = `rgb(${v},${v - 8},${v - 24})`; c.fillRect(x + 1, y + 1, 30, 14); }
    }, [1, 3]);
    const stone = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 1 });
    const pylons = [[SC.x - 9, SC.z - 19], [SC.x + 3, SC.z - 19], [SC.x - 9, SC.z + 19], [SC.x + 3, SC.z + 19]];
    for (const [x, z] of pylons) B.add(stone, bx(2.6, 10, 2.6, x, 0, z), bx(3.2, 0.6, 3.2, x, 10, z));
    // the membrane: a long barrel vault, highest along its centre line,
    // with the seams of its arched ribs
    const mem = new THREE.MeshStandardMaterial({ color: 0xfbfaf6, roughness: 0.6, side: THREE.DoubleSide, emissive: 0xffd7a8, emissiveIntensity: 0 });
    mem.userData.night = 0.55;
    glow.push(mem);
    const nu = 16, nv = 32, Lz = 42, Wx = 16;
    const pos = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      const x = SC.x - 3 - Wx / 2 + u * Wx, z = SC.z - Lz / 2 + v * Lz;
      const across = Math.sin(u * Math.PI); // the vault's cross-section
      const along = 1 - 0.18 * (2 * v - 1) ** 2; // a gentle saddle toward the ends
      const y = 10.6 + 3.2 * across * along + 0.25 * Math.sin(v * Math.PI * 10) * across; // rib seams
      pos.push(x, y, z);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b2 = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b2, b2, c, d); }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    mg.setIndex(idx); mg.computeVertexNormals();
    const memMesh = new THREE.Mesh(mg, mem);
    memMesh.castShadow = true;
    group.add(memMesh);
    // steel edge beams along the long sides, resting on the pylons
    const mast = mat(0xd9dcde, { metalness: 0.5, roughness: 0.4 });
    for (const x of [SC.x - 11, SC.x + 5]) B.add(mast, span(new THREE.Vector3(x, 10.7, SC.z - 21), new THREE.Vector3(x, 10.7, SC.z + 21), 0.6, 0.6));
    // the fountain plaza behind the stage, and the splash pad
    const water = mat(0x4f8aa0, { roughness: 0.1, metalness: 0.3 });
    B.add(conc, place(new THREE.CylinderGeometry(6, 6.2, 0.8, 32).translate(0, 0.4, 0), SC.x - 30, 0, SC.z));
    B.add(water, place(new THREE.CylinderGeometry(5.3, 5.3, 0.1, 32).translate(0, 0.05, 0), SC.x - 30, 0.72, SC.z));
    B.add(paving, place(new THREE.CylinderGeometry(13, 13, 0.06, 40).translate(0, 0.03, 0), SC.x - 30, 0, SC.z));
    const pad = mat(0x3fa0c8, { roughness: 0.6 }), padG = mat(0x6cc070, { roughness: 0.6 });
    B.add(pad, place(new THREE.CylinderGeometry(9, 9, 0.08, 36).translate(0, 0.04, 0), SC.x - 20, 0, SC.z + 36));
    B.add(padG, place(new THREE.CylinderGeometry(4.5, 4.5, 0.1, 24).translate(0, 0.05, 0), SC.x - 23, 0.02, SC.z + 33));
    halos.push(SC.x - 30, 2.2, SC.z);
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
    // none moored against the bridge pier
    const pier = P(sP[0]);
    for (let i = boatInst.length - 1; i >= 0; i--) if (Math.hypot(boatInst[i][0] - pier.x, boatInst[i][1] - pier.z) < 12) boatInst.splice(i, 1);
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
  for (let z = -200; z <= 80; z += 11) if (Math.abs(z + 40) > 26 && Math.abs(z - 40) > 22) { const r = 2.6 + rnd(); tl.push(tree(-40.5 + (rnd() - 0.5), 0, z, r * 3.1, r, { slot: SLOT.maple })); }
  for (let i = 0; i < 40; i++) {
    const x = -30 + rnd() * 85, z = -200 + rnd() * 330;
    const dB = Math.abs((x - S0.x) * N.x + (z - S0.z) * N.z);
    const alongB = (x - S0.x) * D.x + (z - S0.z) * D.z;
    if (Math.hypot(x - SC.x, z - SC.z) < 72 && x > SC.x - 10) continue;
    if (dB < 18 && alongB > -5 && alongB < 140) continue;
    if (x < 10 && z > 80) continue;
    if (Math.abs(z + 40) < 32 && x < 25) continue; // a clear view of the casino from the course
    const r = 3 + rnd() * 1.6;
    tl.push(tree(x, 0, z, r * 3.1, r));
  }
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
  return { group, glow, update, trees: tl };
}
