// Alton, Illinois riverfront (Confluence hole 4), laid out on the real map.
//
// The frame is the riverfront's own (tools/bake-alton.mjs): origin at the
// Riverfront Park amphitheater, +X inland (north-east, square to the shore),
// +Z downstream (south-east, toward the Clark Bridge), y = 0 the park's grade
// (130.9 m); the pool above Mel Price Lock lies 4 m below it. So, facing the
// river from the park, the marina and the bridge are on the left (+Z) and the
// Argosy and the grain elevators on the right (-Z), as they are.
//
// From OpenStreetMap, AWS Terrarium elevation (USGS 3DEP) and EOxCloudless
// imagery, baked into assets/landmarks/alton/: the ground both sides of a
// river 650-850 m wide, Ellis Island and the backwaters on the Missouri side,
// the bluffs, downtown Alton's buildings and streets, the parking lots and the
// marina's piers. Modelled on it at their mapped positions and sizes:
//   the Clark Bridge (1994): 1,408 m from the Alton interchange to the West
//     Alton levee; a 92-230-92 m cable-stayed main bridge on two single
//     concrete pylons 230 m apart with saddle-draped yellow stays, then the
//     long viaduct over the backwater (Structurae; pylons placed from the
//     aerial, on the OSM centreline)
//   the Argosy Casino Alton (from the photographs): the "Spirit of America",
//     navy hull, blue and pink decks, red stacks with gold crowns; the
//     pavilion barge with its blue glass rotunda, red metal roof, yellow
//     gable and the big green-framed ARGOSY sign; the green lattice gateway
//     tower with yellow cables over the truss gangway; its parking lots
//   the grain elevators upstream of the casino: white concrete bins and two
//     headhouses, "Welcome to ALTON" on the river face
//   the marina's covered slips, piers and breakwater, partly under the bridge
//   Lincoln Shields Recreation Area across the river: the concrete
//     observation tower ("the moon tower") on its levee mound at the point,
//     and the granite memorial in its brick plaza
// The ground meets the golf hole through fit(): inside the hole the hole's
// own ground wins, and the real ground eases to its level round the edge.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, lit, seeded, canvasTex, tree, SLOT } from './kit.js';

// the baked map, fetched as soon as the module loads (long before a hole is built)
const BASE = new URL('../../../assets/landmarks/alton/', import.meta.url).href;
let DATA = null;
const ready = Promise.all([
  fetch(`${BASE}ground.json`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  fetch(`${BASE}ground.bin`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))),
]).then(([j, bin]) => {
  const n = j.grid.nx * j.grid.nz;
  DATA = { ...j, H: new Int16Array(bin, 0, n), C: new Uint8Array(bin, n * 2, n) };
  return DATA;
}).catch((e) => { console.warn('Alton riverfront map not loaded', e); return null; });
const satTex = (() => {
  let t = null;
  return () => {
    if (t) return t;
    t = new THREE.TextureLoader().load(`${BASE}sat.jpg`);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
})();

const POOL = -4.0; // the river (Mel Price pool, 126.9 m), below the park
const WY = POOL;

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

// ── the Argosy Casino Alton (from Tyler's photographs) ──
// Built round the pavilion barge's centre, +X inland, +Z downstream, y = 0 at
// the water. The barge is the mapped footprint (45 x 87 m); the casino boat
// lies against it upstream, the gateway tower and gangway reach the bank at
// its downstream end.
const GREEN = 0x3e9a3f;
function argosy(glow, bulbPts) {
  const g = new THREE.Group();
  const B = new Batch();
  const navy = mat(0x1d2433, { roughness: 0.5, metalness: 0.3 });
  const red = mat(0xc8322c, { roughness: 0.5 });
  const redRoof = mat(0xc63a36, { roughness: 0.45, metalness: 0.35 });
  const yellow = lit(0xf0b734, 0xffd57a, { roughness: 0.6, night: 0.5 });
  const orange = mat(0xe57a2c, { roughness: 0.6 });
  const cream = mat(0xf0e6cf, { roughness: 0.7 });
  const green = lit(GREEN, 0x9dff9a, { roughness: 0.45, metalness: 0.4, night: 0.35 });
  const blueRoof = mat(0x3f78c8, { roughness: 0.35, metalness: 0.45 });
  const gold = lit(0xd8b04a, 0xffd27a, { metalness: 0.7, roughness: 0.3, night: 0.7 });
  const stone = mat(0xbfae8e, { roughness: 0.9 });
  glow.push(yellow, green, gold);

  // blue glass with green mullions (the rotunda), lit warm inside at night
  const glassTex = canvasTex(128, 128, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6fa6d6'); gr.addColorStop(1, '#2d5f93');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(10, 0, 18, h);
    c.fillStyle = '#4caf50';
    for (let x = 0; x < w; x += 16) c.fillRect(x, 0, 3, h);
    for (let y = 0; y < h; y += 21) c.fillRect(0, y, w, 3);
  }, [1, 1]);
  glassTex.wrapS = glassTex.wrapT = THREE.RepeatWrapping;
  const glass = new THREE.MeshStandardMaterial({ map: glassTex, emissive: 0xffc98a, emissiveIntensity: 0, roughness: 0.15, metalness: 0.4 });
  glass.userData.night = 0.9;
  glow.push(glass);

  // the barge
  B.add(navy, bx(47, 3.2, 89, 0, -2.6, 0));
  B.add(red, bx(47.3, 0.35, 89.3, 0, 0.5, 0));
  // the main hall: cream walls, long red standing-seam gable roof
  B.add(cream, bx(34, 7, 62, -2, 0.85, -8));
  {
    const roof = new THREE.Shape(); roof.moveTo(-18.5, 0); roof.lineTo(0, 7.5); roof.lineTo(18.5, 0); roof.closePath();
    B.add(redRoof, new THREE.ExtrudeGeometry(roof, { depth: 64, bevelEnabled: false }).translate(0, 0, -32).translate(-2, 7.85, -8));
  }
  // the yellow gable at the downstream end, its orange flank and round vent
  {
    const s = new THREE.Shape(); s.moveTo(-14, 0); s.lineTo(14, 0); s.lineTo(14, 9); s.lineTo(0, 17); s.lineTo(-14, 9); s.closePath();
    B.add(yellow, new THREE.ExtrudeGeometry(s, { depth: 14, bevelEnabled: false }).translate(4, 0.85, 22));
    B.add(orange, bx(8, 9, 14.2, 18, 0.85, 29), bx(10, 7, 12, -14, 0.85, 30));
    const ridge = new THREE.Shape(); ridge.moveTo(-15, 0); ridge.lineTo(0, 8.4); ridge.lineTo(15, 0); ridge.lineTo(15, 0.8); ridge.lineTo(0, 9.2); ridge.lineTo(-15, 0.8); ridge.closePath();
    B.add(redRoof, new THREE.ExtrudeGeometry(ridge, { depth: 15, bevelEnabled: false }).translate(4, 9.6, 21.5));
    B.add(cream, place(new THREE.CylinderGeometry(1.6, 1.6, 0.4, 20).rotateX(Math.PI / 2), 4, 12.4, 36.3));
    B.add(orange, place(new THREE.TorusGeometry(1.7, 0.25, 6, 20), 4, 12.4, 36.4));
  }
  // the blue glass rotunda on the river side, an octagon under a blue hip roof
  {
    const R = 9, H = 12, cx = -16, cz = 8;
    B.add(glass, place(new THREE.CylinderGeometry(R, R, H, 8, 1, true).translate(0, H / 2, 0), cx, 0.85, cz, Math.PI / 8));
    B.add(green, place(new THREE.CylinderGeometry(R + 0.3, R + 0.3, 0.6, 8).translate(0, 0.3, 0), cx, 0.85 + H, cz, Math.PI / 8));
    B.add(blueRoof, place(new THREE.ConeGeometry(R + 1.2, 5.5, 8).translate(0, 2.75, 0), cx, 1.45 + H, cz, Math.PI / 8));
    B.add(green, place(new THREE.ConeGeometry(0.5, 2.5, 6).translate(0, 1.25, 0), cx, 6.9 + H, cz));
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; B.add(green, bx(0.35, H, 0.35, cx + Math.cos(a) * R, 0.85, cz + Math.sin(a) * R)); }
  }
  // the ARGOSY sign: dark green letters on a green steel lattice frame, inland and upstream
  {
    const fx = 12, fz = -24, W = 34, Hs = 11, y0 = 16;
    for (const z of [fz - W / 2, fz - W / 6, fz + W / 6, fz + W / 2]) B.add(green, bx(0.6, y0 + Hs, 0.6, fx, 0.85, z));
    for (const y of [y0, y0 + Hs / 2, y0 + Hs]) B.add(green, bx(0.5, 0.5, W, fx, y, fz));
    for (let k = 0; k < 6; k++) {
      const z0 = fz - W / 2 + (k * W) / 6, z1 = z0 + W / 6;
      B.add(green, rod(new THREE.Vector3(fx, y0, z0), new THREE.Vector3(fx, y0 + Hs, z1), 0.18, 4), rod(new THREE.Vector3(fx, 8.5, z0), new THREE.Vector3(fx, y0, z1), 0.18, 4));
    }
    const letters = canvasTex(1024, 300, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = '#16341c'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = 'bold 250px Georgia, "Times New Roman", serif';
      c.fillText('ARGOSY', w / 2, h * 0.56);
    });
    const signM = new THREE.MeshStandardMaterial({ map: letters, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.4, emissive: 0xe9fff0, emissiveMap: letters, emissiveIntensity: 0 });
    signM.userData.night = 1.4;
    glow.push(signM);
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(W - 1, Hs - 1).rotateY(s * Math.PI / 2), signM);
      m.position.set(fx + s * 0.6, y0 + Hs / 2, fz);
      g.add(m);
    }
    for (let z = fz - W / 2; z <= fz + W / 2; z += 1.1) bulbPts.push(fx, y0 + Hs + 0.4, z);
  }
  // the green truss gangway to the bank, roofed, at the downstream end
  const gz = 40, gx0 = 23, gx1 = 66;
  {
    const yb = 3.2, yt = 7.4, w = 4.2;
    for (const s of [-1, 1]) {
      B.add(green, span(new THREE.Vector3(gx0, yb, gz + s * w / 2), new THREE.Vector3(gx1, yb, gz + s * w / 2), 0.5, 0.5));
      B.add(green, span(new THREE.Vector3(gx0, yt, gz + s * w / 2), new THREE.Vector3(gx1, yt, gz + s * w / 2), 0.5, 0.5));
      for (let x = gx0, k = 0; x < gx1; x += 4.3, k++) {
        B.add(green, rod(new THREE.Vector3(x, yb, gz + s * w / 2), new THREE.Vector3(x, yt, gz + s * w / 2), 0.14, 4));
        B.add(green, rod(new THREE.Vector3(x + (k % 2 ? 4.3 : 0), yb, gz + s * w / 2), new THREE.Vector3(x + (k % 2 ? 0 : 4.3), yt, gz + s * w / 2), 0.12, 4));
      }
    }
    B.add(green, bx(gx1 - gx0, 0.4, w + 1.4, (gx0 + gx1) / 2, yt + 0.2, gz));
    B.add(cream, bx(gx1 - gx0, 0.3, w, (gx0 + gx1) / 2, yb, gz));
  }
  // the gateway tower on its stone pier at the bank: two lattice legs, cross
  // girders and a crown, carrying yellow cables down over the gangway
  {
    const tx = gx1 - 3, tz = gz, leg = 2.6, sep = 10, Ht = 30;
    B.add(stone, bx(9, 6, 16, tx, -3, tz));
    // the orange corrugated sheet-pile cell round its foot
    const pile = mat(0xe08a2a, { roughness: 0.6, metalness: 0.3 });
    B.add(pile, bx(14, 3.6, 20, tx + 2, -3, tz));
    for (const s of [-1, 1]) {
      const lz = tz + s * sep / 2;
      for (const [ax, az] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.add(green, bx(0.45, Ht, 0.45, tx + ax * leg / 2, 3, lz + az * leg / 2));
      for (let y = 3; y < Ht + 3; y += 3) {
        B.add(green, bx(leg, 0.25, 0.3, tx, y, lz - leg / 2), bx(leg, 0.25, 0.3, tx, y, lz + leg / 2), bx(0.3, 0.25, leg, tx - leg / 2, y, lz), bx(0.3, 0.25, leg, tx + leg / 2, y, lz));
        B.add(green, rod(new THREE.Vector3(tx - leg / 2, y, lz - leg / 2), new THREE.Vector3(tx + leg / 2, y + 3, lz - leg / 2), 0.1, 4), rod(new THREE.Vector3(tx - leg / 2, y, lz + leg / 2), new THREE.Vector3(tx + leg / 2, y + 3, lz + leg / 2), 0.1, 4));
      }
      // collars where the girders meet the legs
      for (const y of [11, 21]) B.add(green, bx(leg + 1.2, 1.4, leg + 1.2, tx, y - 0.7, lz));
      B.add(green, place(new THREE.ConeGeometry(1.6, 2.4, 4).translate(0, 1.2, 0), tx, Ht + 3, lz, Math.PI / 4));
    }
    for (const y of [11, 21, Ht + 1.5]) B.add(green, bx(1.6, 1.6, sep, tx, y - 0.8, tz));
    // the arch-topped crown frame
    B.add(green, span(new THREE.Vector3(tx, Ht + 3.5, tz - sep / 2), new THREE.Vector3(tx, Ht + 6, tz), 1.2, 0.8), span(new THREE.Vector3(tx, Ht + 6, tz), new THREE.Vector3(tx, Ht + 3.5, tz + sep / 2), 1.2, 0.8));
    // yellow cables: from the tower top down to the gangway, and the back-stays inland
    const cable = lit(0xf4cf3a, 0xfff0a0, { roughness: 0.4, night: 0.3 });
    glow.push(cable);
    for (const s of [-1, 1]) {
      const top = new THREE.Vector3(tx, Ht + 2, tz + s * sep / 2);
      for (let k = 1; k <= 5; k++) B.add(cable, rod(top, new THREE.Vector3(tx - k * 7.5, 7.6, gz + s * 2.4), 0.12, 4));
      B.add(cable, rod(top, new THREE.Vector3(tx + 16, 2, tz + s * 6), 0.14, 4));
    }
    for (let y = 3; y < Ht; y += 3) bulbPts.push(tx, y, tz - sep / 2 - 1.5, tx, y, tz + sep / 2 + 1.5);
  }
  // marquee bulbs along the barge's eaves and the gable
  for (let z = -40; z <= 23; z += 1.4) bulbPts.push(-19.5, 8.2, z, 15.5, 8.2, z);
  for (let x = -10; x <= 18; x += 1.2) bulbPts.push(x, 0.85 + 9 + Math.max(0, 8 - Math.abs(x - 4) * 0.55), 36.2);
  B.build(g);
  return g;
}

// the "Spirit of America", the casino boat moored against the barge upstream:
// navy hull, a blue main deck with yellow pilasters and red-framed windows, a
// pink upper deck, the pilot house and two tall red stacks with gold crowns
function spiritOfAmerica(glow) {
  const g = new THREE.Group();
  const B = new Batch();
  const deckTex = (wall, pil, win) => canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = wall; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      c.fillStyle = pil; c.fillRect(i * 32, 0, 5, h);
      c.fillStyle = '#c0302a'; c.fillRect(i * 32 + 10, 14, 16, 30);
      c.fillStyle = win; c.fillRect(i * 32 + 12, 16, 12, 26);
    }
    c.fillStyle = pil; c.fillRect(0, 0, w, 6); c.fillRect(0, h - 5, w, 5);
  }, [1, 1]);
  const deckM = (t, glowCol) => {
    t.wrapS = THREE.RepeatWrapping;
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, emissive: glowCol, emissiveIntensity: 0 });
    m.userData.night = 0.5;
    glow.push(m);
    return m;
  };
  const blue = deckM(deckTex('#3b67b8', '#f2c53d', '#f4e9c6'), 0xffd28a);
  const pink = deckM(deckTex('#d98bb0', '#f4e3ea', '#f6efd8'), 0xffd28a);
  const navy = mat(0x1a2030, { roughness: 0.5, metalness: 0.3 });
  const red = mat(0xc32b2b, { roughness: 0.5 });
  const redRoof = mat(0xb5262a, { roughness: 0.5 });
  const gold = lit(0xdcb24a, 0xffd27a, { metalness: 0.7, roughness: 0.3, night: 0.8 });
  const yellow = mat(0xf2c53d, { roughness: 0.55 });
  glow.push(gold);
  const band = (w, h, d, x, y, z, tile = 9) => {
    const geo = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
    const n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(n.getY(i)) > 0.5) { uv.setXY(i, 0.01, 0.5); continue; }
      uv.setX(i, (uv.getX(i) * (Math.abs(n.getX(i)) > 0.5 ? d : w)) / tile);
    }
    return geo;
  };
  const L = 70, W = 21;
  B.add(navy, bx(W, 3.4, L, 0, -2.4, 0));
  B.add(red, bx(W + 0.3, 0.5, L + 0.3, 0, 0.9, 0));
  B.add(blue, band(W - 1, 5.2, L - 4, 0, 1.4, 0));
  B.add(yellow, bx(W + 0.4, 0.5, L - 2, 0, 6.6, 0));
  B.add(pink, band(W - 3, 4.6, L - 14, 0, 7.1, -3));
  B.add(red, bx(W - 1.6, 0.45, L - 12, 0, 11.7, -3));
  for (const s of [-1, 1]) { B.add(red, bx(0.12, 1.0, L - 13, s * (W / 2 - 0.9), 12.15, -3)); B.add(red, bx(0.12, 1.0, L - 3, s * (W / 2 + 0.1), 7.1, 0)); }
  // the pilot house: pink, glazed, under a red hip roof
  B.add(pink, band(9, 4, 9, 0, 12.15, -14, 9));
  B.add(redRoof, place(new THREE.ConeGeometry(7.4, 2.6, 4).translate(0, 1.3, 0), 0, 16.15, -14, Math.PI / 4));
  // twin red stacks, ringed in gold, crowned
  for (const s of [-1, 1]) {
    const x = s * 5.5, z = 20;
    B.add(red, cy(1.15, 1.25, 26, x, 12.15, z, 14));
    for (const y of [16, 24, 32]) B.add(gold, cy(1.3, 1.3, 0.45, x, 12.15 + y - 12, z, 14));
    B.add(gold, cy(2.0, 1.25, 1.2, x, 38.15, z, 14));
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; B.add(gold, place(new THREE.ConeGeometry(0.42, 1.8, 4).translate(0, 0.9, 0), x + Math.cos(a) * 1.6, 39.3, z + Math.sin(a) * 1.6)); }
  }
  // the spreaders and guys between the stacks
  for (const y of [22, 30]) B.add(mat(0x2a2a2a), bx(11, 0.15, 0.15, 0, y, 20));
  // a smaller pink tower aft with its own crowned stack
  B.add(pink, band(7, 6, 7, 0, 12.15, 28, 9));
  B.add(red, cy(0.6, 0.7, 10, 0, 18.15, 28, 10));
  B.add(gold, cy(1.0, 0.65, 0.8, 0, 28.15, 28, 10));
  B.build(g);
  return g;
}

/** The older blue-and-yellow boat tied up beyond it. */
function blueBoat() {
  const g = new THREE.Group();
  const B = new Batch();
  B.add(mat(0x4e9ad8, { roughness: 0.45 }), bx(16, 4, 48, 0, -2.6, 0));
  B.add(mat(0xf2c53d, { roughness: 0.5 }), bx(16.3, 0.8, 48.3, 0, 1.2, 0), bx(14.6, 0.6, 40, 0, 6.2, -2));
  B.add(lit(0x23415e, 0xffd28a, { night: 0.6, roughness: 0.25 }), bx(14, 4, 42, 0, 2.0, -2));
  B.add(mat(0xf3f1ea, { roughness: 0.5 }), bx(12, 3.2, 28, 0, 6.8, -5));
  B.add(mat(0x2a6cb8, { roughness: 0.4 }), bx(12.6, 0.4, 29, 0, 10, -5));
  B.add(mat(0xd13a2e, { roughness: 0.5 }), place(new THREE.BoxGeometry(5, 3, 7).translate(0, 1.5, 0), 0, 10.4, 20, 0));
  B.build(g);
  return g;
}

// ── the grain elevators upstream of the casino (mapped footprints) ──
// White slip-formed concrete: rows of bins with a gallery on top, two tall
// headhouses (the nearer with "Welcome to ALTON" and a flag on its river
// face, the farther with three small tanks on its roof), a low annex and the
// marine leg reaching out over the water. Local frame, y = 0 the park grade.
function elevators(B, glow, group, gy) {
  const tex = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#e4e0d6'; g.fillRect(0, 0, w, h);
    const r = seeded(5);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(80,72,60,${0.04 + r() * 0.08})`; g.fillRect(r() * w, r() * h * 0.3, 1 + r() * 3, h * (0.3 + r() * 0.7)); }
    for (let y = 0; y < h; y += 16) { g.fillStyle = 'rgba(0,0,0,0.04)'; g.fillRect(0, y, w, 1); }
  }, [1, 1]);
  const silo = mat(0xffffff, { map: tex, roughness: 0.9 });
  const roofM = mat(0x8b8780, { roughness: 0.8 });
  const steel = mat(0x7c7f80, { metalness: 0.4, roughness: 0.6 });
  const hw = lit(0x39424a, 0xffcf8a, { night: 0.7 });
  glow.push(hw);
  const bins = (x0, z0, rows, cols, r, h) => {
    const y = gy(x0 + rows * r, z0 + cols * r);
    for (let i = 0; i < rows; i++) for (let k = 0; k < cols; k++) {
      const x = x0 + i * r * 2, z = z0 + k * r * 2;
      B.add(silo, place(new THREE.CylinderGeometry(r, r, h, 18, 1, true).translate(0, h / 2, 0), x, y, z));
      B.add(roofM, cy(r, r, 0.4, x, y + h, z, 18));
    }
    B.add(silo, bx(rows * r * 2, 3, cols * r * 2, x0 + (rows - 1) * r, y + h, z0 + (cols - 1) * r)); // gallery
    return y;
  };
  // the main bins, three rows along the shore, and the upstream group
  bins(-162, -688, 3, 13, 4.3, 34);
  bins(-205, -884, 2, 9, 4.6, 30);
  // headhouse 1 with the mural, beside the main bins
  const y1 = gy(-176, -640);
  B.add(silo, bx(16, 62, 22, -176, y1, -640));
  B.add(roofM, bx(17, 1, 23, -176, y1 + 62, -640));
  B.add(silo, bx(9, 7, 10, -176, y1 + 63, -642));
  for (let y = 8; y < 60; y += 6) for (const z of [-646, -634]) B.add(hw, bx(0.2, 1.8, 2.4, -167.9, y1 + y, z));
  {
    const muralTex = canvasTex(256, 1024, (g, w, h) => {
      g.fillStyle = '#eeebe4'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#2b3a55';
      g.font = 'italic 600 46px Georgia, serif'; g.textAlign = 'center';
      g.fillText('Welcome', w / 2, 140); g.fillText('to', w / 2, 196);
      g.font = '700 84px Georgia, serif';
      g.fillText('ALTON', w / 2, 300);
      const fx = 22, fy = 520, fw = w - 44, fh = fw * 0.55;
      for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#f4f2ee' : '#b22234'; g.fillRect(fx, fy + (i * fh) / 13, fw, fh / 13 + 0.5); }
      g.fillStyle = '#3c3b6e'; g.fillRect(fx, fy, fw * 0.4, (fh * 7) / 13);
      g.fillStyle = '#ffffff';
      for (let r = 0; r < 9; r++) for (let c = 0; c < (r % 2 ? 5 : 6); c++) g.fillRect(fx + 6 + c * 15 + (r % 2 ? 7 : 0), fy + 5 + r * 8.6, 3, 3);
    });
    const muralM = new THREE.MeshStandardMaterial({ map: muralTex, roughness: 0.85, emissive: 0xfff0d8, emissiveMap: muralTex, emissiveIntensity: 0 });
    muralM.userData.night = 0.4;
    glow.push(muralM);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(21, 60), muralM);
    face.rotation.y = -Math.PI / 2;
    face.position.set(-184.08, y1 + 31, -640);
    group.add(face);
  }
  // headhouse 2 on the silo footprint, three tanks on its roof
  const y2 = gy(-192, -778);
  B.add(silo, bx(18, 56, 26, -192, y2, -778));
  B.add(roofM, bx(19, 1, 27, -192, y2 + 56, -778));
  for (const z of [-787, -778, -769]) B.add(silo, cy(3.4, 3.4, 9, -192, y2 + 57, z, 16), cy(3.5, 3.5, 0.4, -192, y2 + 66, z, 16));
  for (let y = 8; y < 54; y += 6) B.add(hw, bx(0.2, 1.8, 2.4, -182.9, y2 + y, -778));
  // the bins between the two headhouses
  bins(-200, -760, 2, 6, 4.2, 32);
  // the low annex inland, metal-roofed
  const ya = gy(-108, -650);
  B.add(mat(0xb9b4aa, { roughness: 0.8 }), bx(22, 11, 140, -108, ya, -650));
  B.add(roofM, bx(23, 0.6, 141, -108, ya + 11, -650));
  // conveyor gallery out to the marine leg over the water
  B.add(steel, span(new THREE.Vector3(-184, y1 + 40, -652), new THREE.Vector3(-222, 18, -652), 2.6, 2.8));
  B.add(steel, cy(1.4, 1.4, 24, -224, WY - 1, -652, 10), rod(new THREE.Vector3(-224, 17, -652), new THREE.Vector3(-232, WY + 4, -652), 0.5, 8));
  B.add(steel, rod(new THREE.Vector3(-204, gy(-204, -652), -652), new THREE.Vector3(-204, 29, -652), 0.45, 6));
}

// ── the Clark Bridge ──
// The centre line from OSM (both carriageways averaged): the curve down to
// the Alton interchange, then straight across 904 m to the West Alton levee.
const BRIDGE_IL = [[451, 617], [420, 632], [386, 648], [358, 659], [325, 671], [283, 683], [246, 691], [211, 697], [180, 701], [150, 702], [125, 701], [75, 696], [16, 682], [-25, 669]];
const BRIDGE_MO = [-878, 370];
function bridgePath() {
  const pts = [...BRIDGE_IL, BRIDGE_MO].map(([x, z]) => new THREE.Vector2(x, z));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const L = cum[cum.length - 1], shore = cum[BRIDGE_IL.length - 1];
  const at = (u) => {
    u = Math.max(0, Math.min(L, u));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < u) i++;
    const t = (u - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    const p = pts[i - 1].clone().lerp(pts[i], t);
    const d = pts[i].clone().sub(pts[i - 1]).normalize();
    return { x: p.x, z: p.y, dx: d.x, dz: d.y }; // Vector2: y is z
  };
  return { at, L, shore };
}
function clarkBridge(B, glow, halos, navLights, gy, carSpots) {
  const { at, L, shore } = bridgePath();
  // stations along the straight from the Illinois bank (s = u - shore):
  // side span 12-104, pylon 104, main span to the pylon at 334, side span to 426
  const PY = [104, 334], S0 = 12, S1 = 426;
  const H = (u) => {
    const s = u - shore;
    if (s < S0) { // the curve down to the interchange
      const k = Math.max(0, Math.min(1, (u - 0) / (shore + S0)));
      return 3.5 + (18 - 3.5) * Math.sin((k * Math.PI) / 2);
    }
    if (s <= S1) return 18 + 5 * Math.sin(((s - S0) / (S1 - S0)) * Math.PI);
    const k = (s - S1) / (L - shore - S1);
    return 18 - (18 - 2.5) * k * k * (3 - 2 * k) ** 0.5 * 0.9 - (18 - 2.5) * 0.1 * k;
  };
  const P = (u, lat = 0, dy = 0) => { const a = at(u); return new THREE.Vector3(a.x - a.dz * lat, H(u) + dy, a.z + a.dx * lat); };
  const deckM = mat(0x8f9294, { roughness: 0.8 });
  const girder = mat(0xb9bdc0, { roughness: 0.55, metalness: 0.35 });
  const concrete = mat(0xc9c5bc, { roughness: 0.8 });
  const iron = mat(0x2a2d31, { metalness: 0.5, roughness: 0.5 });
  const cableM = lit(0xf1d64a, 0xfff0a0, { roughness: 0.4, night: 0.35 });
  const lamp = lit(0xfff6e4, 0xffd59a, { night: 2.4, roughness: 0.3 });
  glow.push(cableM, lamp);
  const W = 15; // half the 30 m deck
  const step = 10;
  for (let u = 0; u < L; u += step) {
    const a = P(u), b = P(Math.min(L, u + step));
    B.add(deckM, span(a, b, W * 2, 0.4));
    for (const l of [-W + 0.5, W - 0.5]) {
      B.add(girder, span(P(u, l, -0.4), P(Math.min(L, u + step), l, -0.4), 1.0, 2.2));
      B.add(concrete, span(P(u, l * 0.98, 0.9), P(Math.min(L, u + step), l * 0.98, 0.9), 0.45, 0.9));
    }
    B.add(concrete, span(P(u, 0, 0.8), P(Math.min(L, u + step), 0, 0.8), 0.8, 0.8)); // median
  }
  // piers: twin columns on a footing, every ~46 m off the cable-stayed spans
  const pierAt = [];
  for (let u = 40; u < shore + S0 - 5; u += 46) pierAt.push(u);
  pierAt.push(shore + S0);
  for (let u = shore + S1; u < L - 20; u += 48) pierAt.push(u);
  pierAt.push(L - 8);
  for (const u of pierAt) {
    const c = P(u);
    for (const l of [-8, 8]) {
      const p = P(u, l);
      const g0 = Math.max(WY - 1, gy(p.x, p.z)) - 0.5;
      const h = c.y - 2.6 - g0;
      if (h < 0.4) continue;
      B.add(concrete, place(new THREE.CylinderGeometry(1.1, 1.25, h, 12).translate(0, h / 2, 0), p.x, g0, p.z));
    }
    const a = at(u);
    B.add(concrete, place(new THREE.BoxGeometry(2.6, 1.6, 22).translate(0, -0.8, 0), c.x, c.y - 2.4, c.z, Math.atan2(-a.dz, a.dx)));
  }
  // the two pylons: tapered concrete columns in the median, a saddle on top,
  // 22 stays over each saddle in two planes to the edge girders
  const TOP = 72; // 76 m above the pool
  for (const sp of PY) {
    const u = shore + sp, base = P(u), a = at(u), ry = Math.atan2(-a.dz, a.dx);
    B.add(concrete, place(new THREE.CylinderGeometry(9, 9.5, 4, 24).scale(1, 1, 0.55).translate(0, 2, 0), base.x, WY - 2.5, base.z, ry));
    const col = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const p = col.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = p.getY(i); p.setX(i, p.getX(i) * (7.5 - 3.6 * t)); p.setZ(i, p.getZ(i) * (5.6 - 2.4 * t)); p.setY(i, WY + t * (TOP - WY)); }
    col.computeVertexNormals();
    B.add(concrete, place(col, base.x, 0, base.z, ry));
    B.add(girder, place(new THREE.BoxGeometry(4.6, 2.8, 4.4).translate(0, 1.4, 0), base.x, TOP - 0.3, base.z, ry));
    for (const dir of [-1, 1]) for (let k = 0; k < 11; k++) {
      const s = u + dir * (14 + k * 8.2);
      for (const l of [-W + 0.8, W - 0.8]) {
        const top = P(u, l * 0.07); top.y = TOP - 1.2 - k * 0.7;
        B.add(cableM, rod(top, P(s, l, 0.5), 0.18, 4));
      }
    }
    navLights.push(base.x, TOP + 3.2, base.z);
  }
  // deck lights
  for (let u = 15; u < L; u += 34) for (const l of [-W + 0.6, W - 0.6]) {
    const p = P(u, l);
    B.add(iron, cy(0.1, 0.13, 9, p.x, p.y + 0.9, p.z, 5));
    const h = P(u, l * 0.88);
    B.add(lamp, place(new THREE.BoxGeometry(0.9, 0.25, 0.45), h.x, p.y + 9.9, h.z));
    halos.push(h.x, p.y + 9.8, h.z);
  }
  // traffic
  for (let i = 0; i < 26; i++) {
    const u = 30 + ((i * 0.618) % 1) * (L - 60), l = [-10.5, -6.5, 6.5, 10.5][i % 4];
    const p = P(u, l), a = at(u);
    carSpots.push([p.x, p.y, p.z, Math.atan2(-a.dz, a.dx) + (l > 0 ? Math.PI : 0)]);
  }
  return { P, at, L, shore, H };
}

// ── Lincoln Shields Recreation Area, West Alton, across the river ──
// The concrete observation tower ("the moon tower") on its levee mound at the
// point, with a railed steel deck and a stair; the granite smallpox memorial
// (2002) in its round brick plaza with granite benches; the boat ramp.
function lincolnShields(B, gy) {
  const conc = mat(0xb4ada1, { roughness: 0.85 });
  const steel = mat(0x2c3035, { metalness: 0.5, roughness: 0.5 });
  const granite = mat(0x9d9a95, { roughness: 0.6 });
  const brick = mat(0xa8704f, { roughness: 0.9 });
  const tx = -835, tz = -147, ty = gy(tx, tz);
  const y0 = ty - 0.3; // on the levee's crown (in the ground)
  B.add(conc, bx(7, 8.5, 7, tx, y0, tz));
  B.add(conc, bx(7.6, 0.5, 7.6, tx, y0 + 8.5, tz));
  B.add(steel, bx(9, 0.3, 9, tx, y0 + 9, tz)); // the viewing deck
  for (const s of [-1, 1]) {
    B.add(steel, bx(9, 0.08, 0.08, tx, y0 + 10.2, tz + s * 4.45), bx(0.08, 0.08, 9, tx + s * 4.45, y0 + 10.2, tz));
    for (let k = -4; k <= 4; k += 1) B.add(steel, bx(0.06, 1.1, 0.06, tx + k, y0 + 9.1, tz + s * 4.45), bx(0.06, 1.1, 0.06, tx + s * 4.45, y0 + 9.1, tz + k));
  }
  // the stair up its inland side
  B.add(steel, span(new THREE.Vector3(tx - 12, ty + 0.4, tz + 4.6), new THREE.Vector3(tx - 3.5, y0 + 9, tz + 4.6), 1.4, 0.4));
  B.add(steel, span(new THREE.Vector3(tx - 12, ty + 1.5, tz + 5.3), new THREE.Vector3(tx - 3.5, y0 + 10.1, tz + 5.3), 0.08, 0.08));
  // the memorial, 40 m behind it
  const mx = -875, mz = -150, my = gy(mx, mz);
  B.add(brick, place(new THREE.CylinderGeometry(12, 12, 0.3, 40).translate(0, 0.15, 0), mx, my, mz));
  B.add(granite, place(new THREE.CylinderGeometry(2.6, 2.6, 0.5, 24).translate(0, 0.25, 0), mx, my + 0.3, mz));
  B.add(granite, place(new THREE.CylinderGeometry(1.15, 1.7, 2.6, 24).translate(0, 1.3, 0), mx, my + 0.8, mz));
  B.add(granite, place(new THREE.CylinderGeometry(1.35, 1.15, 0.35, 24).translate(0, 0.17, 0), mx, my + 3.4, mz));
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; B.add(granite, bx(3.2, 0.55, 1.1, mx + Math.cos(a) * 7.5, my + 0.3, mz + Math.sin(a) * 7.5, -a)); }
  // the boat ramp into the backwater
  const rp = [-808, -103];
  B.add(mat(0xa8a49b, { roughness: 0.9 }), span(new THREE.Vector3(rp[0] + 14, gy(rp[0] + 14, rp[1]) + 0.1, rp[1]), new THREE.Vector3(rp[0] - 14, WY - 1.2, rp[1]), 8, 0.4));
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

// ── the real ground, the town and the river, from the baked map ──
const ROUGH = [0.05, 0.11, 0.022], LAWN = [0.055, 0.13, 0.026]; // linear
const CLS = { water: 1, wood: 2, wetland: 3, urban: 4, paved: 5, farm: 6, grass: 7 };
/** Heights the hole's way: `edge(x, z)` is how far (m) a local point lies
 * outside the hole's ground (negative inside), `holeY(x, z)` that ground's
 * local height. Returns the final heights and a bilinear sampler. */
function shapeGround(D, edge, holeY) {
  const { x0, z0, step, nx, nz } = D.grid;
  const Hf = new Float32Array(nx * nz);
  const cut = new Uint8Array(nx * nz);
  const blend = new Float32Array(nx * nz); // 1 where the ground takes the hole's own grass
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const n = j * nx + i, x = x0 + i * step, z = z0 + j * step;
    let h = D.H[n] / 10;
    const e = edge(x, z);
    if (e < -40) cut[n] = 1;
    if (e < 90 && D.C[n] !== CLS.water) {
      // ease onto the hole's ground over the last 90 m (and inside its edge)
      const w = e <= 0 ? 1 : 1 - (e / 90) ** 2 * (3 - 2 * (e / 90));
      blend[n] = w;
      h = Math.max(POOL + 0.5, h + (holeY(x, z) - h) * w);
    }
    Hf[n] = h;
  }
  const gy = (x, z) => {
    const fx = Math.max(0, Math.min(nx - 1.001, (x - x0) / step)), fz = Math.max(0, Math.min(nz - 1.001, (z - z0) / step));
    const i = Math.floor(fx), k = Math.floor(fz), tx = fx - i, tz = fz - k, n = k * nx + i;
    return (Hf[n] * (1 - tx) + Hf[n + 1] * tx) * (1 - tz) + (Hf[n + nx] * (1 - tx) + Hf[n + nx + 1] * tx) * tz;
  };
  const clsAt = (x, z) => {
    const i = Math.round((x - x0) / step), k = Math.round((z - z0) / step);
    return i < 0 || k < 0 || i >= nx || k >= nz ? 0 : D.C[k * nx + i];
  };
  return { Hf, cut, blend, gy, clsAt };
}

/** The ground mesh in chunks (so the far ones cull), skirted at the edge, and
 * the river's surface over the water cells. */
function groundMeshes(D, Hf, cut, blend, glow) {
  const { x0, z0, step, nx, nz } = D.grid;
  const W = (nx - 1) * step, Dz = (nz - 1) * step;
  const groundM = new THREE.MeshStandardMaterial({ map: satTex(), roughness: 0.95, color: 0xd2d4c8 });
  // the imagery is graded toward the course's greens: the lawns of the
  // riverfront park take the colour of mown grass, and the last 90 m round
  // the hole take its rough, so the two grounds meet without a seam
  groundM.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aTint;\nvarying vec4 vTint;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvTint = aTint;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vTint;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n  { vec3 c = diffuseColor.rgb; float l = dot(c, vec3(0.3, 0.55, 0.15)); diffuseColor.rgb = mix(mix(vec3(l), c, 1.25), vTint.rgb * clamp(0.65 + l * 3.0, 0.65, 1.35), vTint.a); }');
  };
  // the coarse backdrop's key: the real rock comes in on the bluffs' faces
  groundM.customProgramCacheKey = () => 'backdropGroundSat|alton';
  const out = [];
  const CH = 48;
  for (let cj = 0; cj < nz - 1; cj += CH) for (let ci = 0; ci < nx - 1; ci += CH) {
    const pos = [], uv = [], tint = [], idx = [];
    const map = new Map();
    const v = (i, j, skirt = 0) => {
      const key = j * nx + i + skirt * 1e7;
      if (map.has(key)) return map.get(key);
      const x = x0 + i * step, z = z0 + j * step;
      pos.push(x, Hf[j * nx + i] - skirt * 30, z);
      uv.push((x - x0) / W, 1 - (z - z0) / Dz);
      const n = j * nx + i, c = D.C[n];
      const lawn = c === CLS.grass ? 0.55 : 0, k = Math.max(blend[n], lawn);
      tint.push(...(blend[n] >= lawn ? ROUGH : LAWN), k);
      map.set(key, pos.length / 3 - 1);
      return pos.length / 3 - 1;
    };
    for (let j = cj; j < Math.min(nz - 1, cj + CH); j++) for (let i = ci; i < Math.min(nx - 1, ci + CH); i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      if (cut[a] && cut[b] && cut[c] && cut[d]) continue;
      const wet = (n) => D.C[n] === CLS.water;
      if (wet(a) && wet(b) && wet(c) && wet(d)) continue;
      idx.push(v(i, j), v(i, j + 1), v(i + 1, j), v(i + 1, j), v(i, j + 1), v(i + 1, j + 1));
    }
    // skirts down the outer edge so the patch never shows a lip
    const edgeQuad = (i0, j0, i1, j1) => { idx.push(v(i0, j0), v(i0, j0, 1), v(i1, j1), v(i1, j1), v(i0, j0, 1), v(i1, j1, 1)); };
    for (let i = ci; i < Math.min(nx - 1, ci + CH); i++) { if (cj === 0) edgeQuad(i + 1, 0, i, 0); if (cj + CH >= nz - 1) edgeQuad(i, nz - 1, i + 1, nz - 1); }
    for (let j = cj; j < Math.min(nz - 1, cj + CH); j++) { if (ci === 0) edgeQuad(0, j, 0, j + 1); if (ci + CH >= nx - 1) edgeQuad(nx - 1, j + 1, nx - 1, j); }
    if (!idx.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 4));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, groundM);
    m.receiveShadow = true;
    out.push(m);
  }
  // the river: one surface over every cell that touches water
  {
    const pos = [], idx = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      if (![a, a + 1, a + nx, a + nx + 1].some((n) => D.C[n] === CLS.water)) continue;
      if ([a, a + 1, a + nx, a + nx + 1].every((n) => cut[n])) continue;
      const k = pos.length / 3, x = x0 + i * step, z = z0 + j * step;
      pos.push(x, WY, z, x, WY, z + step, x + step, WY, z, x + step, WY, z + step);
      idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    const uv = [];
    for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] / 23, pos[i + 2] / 37);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    out.push(geo); // the caller gives it the animated water material
  }
  return out;
}

/** Downtown Alton and West Alton: OSM footprints extruded on the ground.
 * Brick and limestone commercial blocks with flat roofs, frame houses with
 * pitched ones, churches with spires. Merged per 400 m cell. */
function townMeshes(D, gy, skip, glow, rnd) {
  const facade = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#e6e2da'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 0; y < h; y += 8) c.fillRect(0, y, w, 1);
    const bw = w / 4, fh = h / 2;
    for (let f = 0; f < 2; f++) for (let b = 0; b < 4; b++) {
      const x = b * bw + bw * 0.28, y = f * fh + fh * 0.2, ww = bw * 0.44, wh = fh * 0.58;
      c.fillStyle = '#f2efe8'; c.fillRect(x - 3, y - 4, ww + 6, wh + 8);
      c.fillStyle = '#2d343c'; c.fillRect(x, y, ww, wh);
      c.fillStyle = 'rgba(200,215,230,0.25)'; c.fillRect(x + 2, y + 2, ww * 0.4, wh - 4);
      c.fillStyle = '#f2efe8'; c.fillRect(x, y + wh / 2 - 1, ww, 3);
    }
  });
  facade.wrapS = facade.wrapT = THREE.RepeatWrapping;
  const lamps = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    const r = seeded(11), bw = w / 4, fh = h / 2;
    for (let f = 0; f < 2; f++) for (let b = 0; b < 4; b++) if (r() < 0.45) { c.fillStyle = '#ffcf8a'; c.fillRect(b * bw + bw * 0.28, f * fh + fh * 0.2, bw * 0.44, fh * 0.58); }
  });
  lamps.wrapS = lamps.wrapT = THREE.RepeatWrapping;
  const wallM = new THREE.MeshStandardMaterial({ map: facade, vertexColors: true, roughness: 0.85, emissiveMap: lamps, emissive: 0xffffff, emissiveIntensity: 0 });
  wallM.userData.night = 0.9;
  glow.push(wallM);
  const roofM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const BRICK = [0xb8664c, 0xa65a43, 0xc27a5e, 0x9a5240, 0xd8c39e, 0xe6dfd2, 0xcdb68e];
  const SIDING = [0xe8e4da, 0xd8d4c6, 0xc9cfd2, 0xe1d6bd, 0xa9b7c0, 0xf0ece2];
  const ROOF = [0x4b4d50, 0x55524e, 0x5e4b3c, 0x3f4245, 0x6b5a4a];
  const cells = new Map();
  const cell = (x, z) => {
    const k = `${Math.floor(x / 400)},${Math.floor(z / 400)}`;
    if (!cells.has(k)) cells.set(k, { wall: { p: [], n: [], u: [], c: [] }, roof: { p: [], n: [], c: [] } });
    return cells.get(k);
  };
  const col = new THREE.Color();
  const tri = (R, a, b, c, color) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const l = Math.hypot(...n) || 1;
    for (const p of [a, b, c]) { R.p.push(...p); R.n.push(n[0] / l, n[1] / l, n[2] / l); R.c.push(color.r, color.g, color.b); }
  };
  for (const b of D.buildings) {
    let pts = b.p;
    if (pts.length > 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1);
    if (pts.length < 3) continue;
    let cx = 0, cz = 0, area = 0;
    for (let i = 0; i < pts.length; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length]; area += x1 * z2 - x2 * z1; cx += x1; cz += z1; }
    cx /= pts.length; cz /= pts.length; area /= 2;
    if (Math.abs(area) < 12 || skip(cx, cz, b)) continue;
    if (area < 0) pts = [...pts].reverse(); // counter-clockwise in x/z
    const A = Math.abs(area), k = b.k;
    let h = b.h;
    const house = ['house', 'detached', 'residential', 'semidetached_house', 'terrace', 'bungalow'].includes(k) || (k === 'yes' && A < 220);
    if (!h) {
      if (['garage', 'garages', 'shed', 'carport', 'roof'].includes(k)) h = 3;
      else if (house) h = 5.5 + rnd() * 2.5;
      else if (k === 'church' || k === 'cathedral') h = 14;
      else if (['apartments', 'hotel', 'hospital'].includes(k)) h = 12 + rnd() * 8;
      else if (['industrial', 'warehouse'].includes(k)) h = 8 + rnd() * 4;
      else h = A > 1500 ? 9 + rnd() * 6 : 7.5 + rnd() * 6;
    }
    let lo = Infinity, hi = -Infinity;
    for (const [x, z] of pts) { const y = gy(x, z); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    const y0 = lo - 0.6, top = hi + h;
    const C = cell(cx, cz);
    col.set(house ? SIDING[Math.floor(rnd() * SIDING.length)] : BRICK[Math.floor(rnd() * BRICK.length)]);
    // walls, with the facade tile scaled to 3.3 m bays and floors
    let run = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
      const len = Math.hypot(x2 - x1, z2 - z1);
      if (len < 0.05) continue;
      const nxv = (z2 - z1) / len, nzv = -(x2 - x1) / len;
      const u0 = run / 13.2, u1 = (run + len) / 13.2, v0 = 0, v1 = (top - y0) / 6.8;
      run += len;
      const W = C.wall;
      const quad = [[x1, y0, z1, u0, v0], [x2, y0, z2, u1, v0], [x2, top, z2, u1, v1], [x1, y0, z1, u0, v0], [x2, top, z2, u1, v1], [x1, top, z1, u0, v1]];
      for (const [x, y, z, u, vv] of quad) { W.p.push(x, y, z); W.n.push(nxv, 0, nzv); W.u.push(u, vv); W.c.push(col.r, col.g, col.b); }
    }
    // roofs: pitched over the small houses, flat (with a parapet look) on the rest
    col.set(ROOF[Math.floor(rnd() * ROOF.length)]);
    if (house && pts.length <= 8) {
      // a gable along the footprint's longer axis, over its oriented box
      let best = 0, ang = 0;
      for (let i = 0; i < pts.length; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length]; const l = Math.hypot(x2 - x1, z2 - z1); if (l > best) { best = l; ang = Math.atan2(z2 - z1, x2 - x1); } }
      const ca = Math.cos(ang), sa = Math.sin(ang);
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const [x, z] of pts) { const a = (x - cx) * ca + (z - cz) * sa, bb = -(x - cx) * sa + (z - cz) * ca; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, bb); b1 = Math.max(b1, bb); }
      const P = (a, bb, y) => [cx + a * ca - bb * sa, y, cz + a * sa + bb * ca];
      const rise = Math.min(4, (b1 - b0) * 0.42), bm = (b0 + b1) / 2, o = 0.4;
      const e1 = P(a0 - o, b0 - o, top), e2 = P(a1 + o, b0 - o, top), e3 = P(a1 + o, b1 + o, top), e4 = P(a0 - o, b1 + o, top);
      const r1 = P(a0 - o, bm, top + rise), r2 = P(a1 + o, bm, top + rise);
      tri(C.roof, e1, r1, e2, col); tri(C.roof, e2, r1, r2, col);
      tri(C.roof, e3, r2, e4, col); tri(C.roof, e4, r2, r1, col);
      tri(C.roof, e1, e4, r1, col); tri(C.roof, e2, r2, e3, col);
    } else {
      const contour = pts.map(([x, z]) => new THREE.Vector2(x, z));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      for (const [a, bb, c] of tris) tri(C.roof, [pts[a][0], top, pts[a][1]], [pts[c][0], top, pts[c][1]], [pts[bb][0], top, pts[bb][1]], col);
      if (k === 'church' || k === 'cathedral') {
        // a spire over the front
        const s = 3.2, sh = h * 1.6, sx = pts[0][0] * 0.7 + cx * 0.3, sz = pts[0][1] * 0.7 + cz * 0.3;
        const base = [[sx - s, top, sz - s], [sx + s, top, sz - s], [sx + s, top, sz + s], [sx - s, top, sz + s]];
        const apex = [sx, top + sh, sz];
        col.set(0x5d6166);
        for (let i = 0; i < 4; i++) tri(C.roof, base[i], apex, base[(i + 1) % 4], col);
      }
    }
  }
  const meshes = [];
  for (const C of cells.values()) {
    if (C.wall.p.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(C.wall.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(C.wall.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(C.wall.u, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(C.wall.c, 3));
      meshes.push(new THREE.Mesh(g, wallM));
    }
    if (C.roof.p.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(C.roof.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(C.roof.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(C.roof.c, 3));
      meshes.push(new THREE.Mesh(g, roofM));
    }
  }
  for (const m of meshes) { m.castShadow = false; m.receiveShadow = true; }
  return meshes;
}

/** Wind every triangle of a flat list counter-clockwise seen from above. */
function faceUp(a) {
  for (let i = 0; i < a.length; i += 9) {
    const ny = (a[i + 5] - a[i + 2]) * (a[i + 6] - a[i]) - (a[i + 3] - a[i]) * (a[i + 8] - a[i + 2]);
    if (ny < 0) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; }
  }
}
/** Streets and paths draped on the ground; the lots as flat asphalt. */
function pavingMeshes(D, gy, skipAt) {
  const { x0, z0, step, nx, nz } = D.grid;
  const onMap = (x, z) => x > x0 + 6 && x < x0 + (nx - 1) * step - 6 && z > z0 + 6 && z < z0 + (nz - 1) * step - 6;
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x5f6062, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const pathM = new THREE.MeshStandardMaterial({ color: 0xa79e8c, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const lotM = new THREE.MeshStandardMaterial({ color: 0x6a6c6e, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const roads = { [asphalt.uuid]: [], [pathM.uuid]: [] };
  for (const r of D.roads) {
    if (r.b) continue; // bridges and ramps: the Clark Bridge is modelled, the rest are lost in the trees
    const path = ['footway', 'path', 'cycleway'].includes(r.k);
    const list = roads[(path ? pathM : asphalt).uuid];
    const w = r.w / 2;
    // resample to <= 8 m so the ribbon follows the ground
    const pts = [];
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i], [bxx, bz] = r.p[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bxx - ax, bz - az) / 8));
      for (let k = 0; k < n; k++) pts.push([ax + ((bxx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    pts.push(r.p[r.p.length - 1]);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bxx, bz] = pts[i + 1];
      if (skipAt((ax + bxx) / 2, (az + bz) / 2) || !onMap(ax, az) || !onMap(bxx, bz)) continue;
      const L = Math.hypot(bxx - ax, bz - az) || 1, nx = -(bz - az) / L * w, nz = (bxx - ax) / L * w;
      const ya = gy(ax, az) + 0.15, yb = gy(bxx, bz) + 0.15;
      list.push(ax - nx, ya, az - nz, bxx - nx, yb, bz - nz, bxx + nx, yb, bz + nz, ax - nx, ya, az - nz, bxx + nx, yb, bz + nz, ax + nx, ya, az + nz);
    }
  }
  const meshes = [];
  for (const [m, list] of [[asphalt, roads[asphalt.uuid]], [pathM, roads[pathM.uuid]]]) {
    if (!list.length) continue;
    faceUp(list);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
    g.computeVertexNormals();
    meshes.push(new THREE.Mesh(g, m));
  }
  const lots = [];
  for (const p0 of D.parking) {
    let p = p0;
    if (p.length > 2 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p = p.slice(0, -1);
    if (p.length < 3) continue;
    const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cz = p.reduce((s, q) => s + q[1], 0) / p.length;
    if (skipAt(cx, cz)) continue;
    const tris = THREE.ShapeUtils.triangulateShape(p.map(([x, z]) => new THREE.Vector2(x, z)), []);
    for (const t of tris) for (const k of t) lots.push(p[k][0], gy(p[k][0], p[k][1]) + 0.22, p[k][1]);
  }
  if (lots.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(lots, 3));
    faceUp(lots);
    g.setAttribute('position', new THREE.Float32BufferAttribute(lots, 3));
    g.computeVertexNormals();
    meshes.push(new THREE.Mesh(g, lotM));
  }
  for (const m of meshes) { m.receiveShadow = true; m.castShadow = false; }
  return meshes;
}

/** Cars parked in the lots, in rows along each lot's longest side. */
function parkedCars(D, gy, skipAt, rnd, near) {
  const spots = [];
  for (const p0 of D.parking) {
    const p = p0.length > 2 && p0[0][0] === p0[p0.length - 1][0] ? p0.slice(0, -1) : p0;
    if (p.length < 3) continue;
    const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cz = p.reduce((s, q) => s + q[1], 0) / p.length;
    if (skipAt(cx, cz) || Math.hypot(cx, cz) > 1500) continue;
    let best = 0, ang = 0;
    for (let i = 0; i < p.length; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length]; const l = Math.hypot(x2 - x1, z2 - z1); if (l > best) { best = l; ang = Math.atan2(z2 - z1, x2 - x1); } }
    const ca = Math.cos(ang), sa = Math.sin(ang);
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of p) { const a = (x - cx) * ca + (z - cz) * sa, b = -(x - cx) * sa + (z - cz) * ca; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
    const busy = near(cx, cz) ? 0.5 : 0.28; // the casino's lots are fullest
    // double rows of 2.7 m stalls, a 7 m aisle between each pair
    for (let b = b0 + 3; b < b1 - 2; b += 17) for (const side of [0, 5.4]) for (let a = a0 + 2; a < a1 - 2; a += 2.7) {
      const x = cx + a * ca - (b + side) * sa, z = cz + a * sa + (b + side) * ca;
      let inside = false;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside; }
      if (!inside || rnd() > busy) continue;
      spots.push([x, gy(x, z) + 0.22, z, ang + Math.PI / 2 + (rnd() < 0.5 ? 0 : Math.PI)]);
    }
  }
  return spots;
}

/** Instanced cars at [x, y, z, yaw] (body + glasshouse), in everyday colours. */
function cars(spots, rnd) {
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(4.6, 0.8, 1.85).translate(0, 0.55, 0), mat(0xffffff, { roughness: 0.35, metalness: 0.5 }), spots.length);
  const top = new THREE.InstancedMesh(new THREE.BoxGeometry(2.5, 0.6, 1.6).translate(-0.2, 1.25, 0), mat(0x1c232b, { roughness: 0.15, metalness: 0.6 }), spots.length);
  const cols = [0xd9d9d9, 0x1d1f22, 0x8b8f94, 0xf2f2f0, 0xe8e8e6, 0x7a1d1d, 0x2b4b7a, 0x5a5f63, 0x9aa3a8, 0xc7c9cc, 0x3d4a3c];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
  spots.forEach(([x, y, z, r], i) => {
    m4.compose(v.set(x, y, z), q.setFromEuler(e.set(0, r, 0)), s);
    body.setMatrixAt(i, m4); top.setMatrixAt(i, m4);
    body.setColorAt(i, c.set(cols[Math.floor(rnd() * cols.length)]));
  });
  for (const m of [body, top]) { m.castShadow = false; m.receiveShadow = true; }
  return [body, top];
}

export default function build() {
  const group = new THREE.Group(); // the park round the amphitheater, in the hole's footprint
  const ext = new THREE.Group(); // everything else on the map: laid out by fit()
  const glow = [];
  const rnd = seeded(1994);
  const B = new Batch();
  const halo = haloTex();
  const halos = [];
  const grass = mat(0x5f8a40, { roughness: 0.95 });
  const paving = mat(0xc9c1b2, { roughness: 0.8 });

  // ── Riverfront Park amphitheater: tensile canopy over the stage, lawn bowl ──
  const SC = new THREE.Vector3(-25, 0, 0); // stage centre (the mapped theatre is centred on the origin)
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


  // the crowd on the lawn and two flags at the plaza
  const people = [];
  for (let i = 0; i < 70; i++) {
    const k = Math.floor(rnd() * 8), t = -0.9 + rnd() * 1.8, r = 14 + k * 4 + 1.5 + rnd() * 2;
    people.push([SC.x + Math.cos(t) * r, 0.42 * k + 0.42, SC.z + Math.sin(t) * r, Math.PI / 2 - t + Math.PI]);
  }
  for (let i = 0; i < 4; i++) people.push([SC.x - 2 + rnd() * 4, 1.5, SC.z - 6 + i * 4, -Math.PI / 2]);
  crowd(group, people, rnd);
  const flags = [];
  const fu = usFlagTex();
  for (const z of [-14, 14]) {
    B.add(mat(0xe0e0e0, { metalness: 0.5, roughness: 0.4 }), cy(0.07, 0.1, 12, SC.x - 44, 0, SC.z + z, 6));
    const f = flag(fu, 2.9, 1.55);
    f.position.set(SC.x - 44, 11.15, SC.z + z);
    f.rotation.y = Math.PI / 2;
    group.add(f);
    flags.push(f);
  }
  B.build(group);
  const halosMesh = bulbs(halos, 0xffd59a, 3.0, halo);
  group.add(halosMesh);
  group.add(ext);

  // the river's surface: muddy Mississippi green-brown, rippling downstream
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
  });
  ripple.colorSpace = THREE.NoColorSpace;
  ripple.wrapS = ripple.wrapT = THREE.RepeatWrapping;
  const water = new THREE.MeshStandardMaterial({ color: 0x5a5a45, roughness: 0.22, metalness: 0.08, normalMap: ripple, normalScale: new THREE.Vector2(0.3, 0.3) });

  // set by addWorld for the per-frame life
  const live = { bulbs: null, halos: null, nav: null, boats: null, tow: null };

  /** Lay the map out. `edge`/`holeY` describe the hole's ground (see shapeGround). */
  /**
   * Lay the map out. On its own (Confluence 4) it brings its ground and river:
   * `edge`/`holeY` describe the hole's ground (see shapeGround). On a real-
   * ground course (`onCourse`: {gy, inPlay}) the course has the ground, river
   * and woods already, so only the built things go down, on its ground.
   */
  function addWorld(D, edge, holeY, sync, onCourse = null) {
    let gy, skipAt, cut = null;
    if (onCourse) {
      gy = onCourse.gy;
      skipAt = onCourse.inPlay;
      edge = (x, z) => (onCourse.inPlay(x, z) ? -1 : 1e9);
      sync = false; // no extra trees: the course plants its own woods
    } else {
      const sg = shapeGround(D, edge, holeY);
      gy = sg.gy; cut = sg.cut;
      skipAt = (x, z) => edge(x, z) < 12;
      for (const m of groundMeshes(D, sg.Hf, sg.cut, sg.blend, glow)) ext.add(m.isMesh ? m : Object.assign(new THREE.Mesh(m, water), { receiveShadow: true }));
    }
    // set-piece areas the town keeps out of
    const keep = [[-240, -80, -905, -565], [-262, -135, -615, -380], [-75, 75, -75, 75]];
    const skipB = (x, z, b) => edge(x, z) < 70 || b.k === 'casino' || b.k === 'silo' || keep.some(([a, bb, c, d]) => x > a && x < bb && z > c && z < d);
    for (const m of townMeshes(D, gy, skipB, glow, rnd)) ext.add(m);
    for (const m of pavingMeshes(D, gy, skipAt)) ext.add(m);

    const EB = new Batch();
    const bulbPts = [], navPts = [], carSpots = [];
    // the Argosy: the pavilion barge on its footprint, the boats upstream of it
    {
      const ag = argosy(glow, bulbPts);
      ag.position.set(-220, WY, -448);
      ext.add(ag);
      const sp = spiritOfAmerica(glow);
      sp.position.set(-212, WY, -540);
      ext.add(sp);
      const bb = blueBoat();
      bb.position.set(-214, WY, -604);
      ext.add(bb);
      const bm = bulbs(bulbPts.map((v, i) => v + [-220, WY, -448][i % 3]), 0xffe2a0, 1.3, halo);
      ext.add(bm);
      live.bulbs = bm;
    }
    // a big overnight sternwheeler tied up at the levee below the park
    {
      const sg = new THREE.Group();
      const SB = new Batch();
      sternwheeler(SB, glow);
      SB.build(sg);
      sg.position.set(-206, WY + 1.2, -250);
      ext.add(sg);
    }
    elevators(EB, glow, ext, gy);
    const bHalos = [];
    clarkBridge(EB, glow, bHalos, navPts, gy, carSpots);
    lincolnShields(EB, gy);

    // the marina: floating docks on the mapped piers, covered slips over the
    // long ones (the blue and white roofs), cruisers in the slips, the breakwater
    const boats = [];
    {
      const dock = mat(0xb9ad98, { roughness: 0.85 });
      const roofs = [mat(0x7e9fc4, { roughness: 0.45, metalness: 0.4 }), mat(0xdfe3e6, { roughness: 0.45, metalness: 0.4 })];
      const post = mat(0x8a8e92, { metalness: 0.4, roughness: 0.6 });
      let r = 0;
      for (const p of D.piers) {
        const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cz = p.reduce((s, q) => s + q[1], 0) / p.length;
        if (!(cx > -140 && cx < 90 && cz > 200 && cz < 640)) continue;
        for (let i = 0; i < p.length - 1; i++) {
          const a = new THREE.Vector3(p[i][0], WY + 0.45, p[i][1]), b = new THREE.Vector3(p[i + 1][0], WY + 0.45, p[i + 1][1]);
          const L = a.distanceTo(b);
          if (L < 1) continue;
          EB.add(dock, span(a, b, 2.4, 0.4));
          if (L > 30) {
            // a covered slip: roof on posts, boats both sides beneath it
            EB.add(roofs[r++ % 2], span(a.clone().setY(WY + 6.2), b.clone().setY(WY + 6.2), 13, 0.3));
            const d = b.clone().sub(a).normalize(), nrm = new THREE.Vector3(-d.z, 0, d.x);
            for (let t = 4; t < L - 2; t += 8) for (const s of [-6, 6]) {
              const q = a.clone().addScaledVector(d, t).addScaledVector(nrm, s);
              EB.add(post, cy(0.12, 0.12, 6, q.x, WY + 0.4, q.z, 5));
            }
            for (let t = 4; t < L - 3; t += 5.2) for (const s of [-1, 1]) {
              if (rnd() < 0.25) continue;
              const q = a.clone().addScaledVector(d, t).addScaledVector(nrm, s * 3.6);
              boats.push([q.x, q.z, Math.atan2(-nrm.z * s, nrm.x * s), 7 + rnd() * 4]);
            }
          }
        }
      }
      const rip = mat(0x6e675d, { roughness: 1, flatShading: true });
      for (const p of D.breakwaters) {
        const cx = p[0][0], cz = p[0][1];
        if (Math.hypot(cx, cz) > 1300) continue;
        for (let i = 0; i < p.length - 1; i++) {
          // rock wing dikes, just breaking the surface
          const a = new THREE.Vector3(p[i][0], WY + 0.35, p[i][1]), b = new THREE.Vector3(p[i + 1][0], WY + 0.35, p[i + 1][1]);
          if (a.distanceTo(b) > 1) EB.add(rip, span(a, b, 6, 3));
        }
      }
    }
    const hullG = (() => {
      const s = new THREE.Shape();
      s.moveTo(-0.5, -0.5); s.lineTo(0.28, -0.5); s.quadraticCurveTo(0.5, -0.45, 0.5, 0); s.quadraticCurveTo(0.5, 0.45, 0.28, 0.5); s.lineTo(-0.5, 0.5); s.closePath();
      return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 4 }).rotateX(-Math.PI / 2).translate(0, -0.35, 0);
    })();
    const cabinG = mergeGeometries([new THREE.BoxGeometry(0.42, 0.55, 0.62).translate(-0.08, 0.92, 0), new THREE.BoxGeometry(0.1, 0.38, 0.56).translate(0.17, 0.85, 0)]);
    const hulls = new THREE.InstancedMesh(hullG, mat(0xffffff, { roughness: 0.35 }), boats.length);
    const cabins = new THREE.InstancedMesh(cabinG, mat(0xffffff, { roughness: 0.3, metalness: 0.2 }), boats.length);
    {
      const c = new THREE.Color(), hc = [0xf4f4f2, 0xf0ede6, 0x1c2c44, 0xf4f4f2, 0x7a1c1c, 0xe9eef2];
      boats.forEach((b, i) => { hulls.setColorAt(i, c.set(hc[i % hc.length])); cabins.setColorAt(i, c.set(i % 3 ? 0x2a3440 : 0xe8e6e0)); });
      hulls.castShadow = cabins.castShadow = false;
      ext.add(hulls, cabins);
    }
    live.boats = { boats, hulls, cabins };

    // a towboat pushing hopper barges up the channel
    const towG = tow(glow);
    towG.position.set(-470, WY, 0);
    ext.add(towG);
    live.tow = towG;

    // parked cars (the casino's lots fullest) and the traffic on the bridge
    for (const m of cars([...parkedCars(D, gy, skipAt, rnd, (x, z) => Math.hypot(x + 150, z + 470) < 260), ...carSpots], rnd)) ext.add(m);

    // walkers on the riverfront trail
    const walk = [];
    for (const r of D.roads) {
      if (!['footway', 'cycleway', 'path'].includes(r.k) || walk.length > 70) continue;
      for (const [x, z] of r.p) if (Math.hypot(x, z + 200) < 420 && !skipAt(x, z) && rnd() < 0.35) walk.push([x + (rnd() - 0.5) * 2, gy(x, z) + 0.15, z + (rnd() - 0.5) * 2]);
    }
    crowd(ext, walk, rnd);

    EB.build(ext);
    const navM = bulbs(navPts, 0xff3a2a, 7, halo);
    const hm = bulbs(bHalos, 0xffd59a, 3.0, halo);
    ext.add(navM, hm);
    live.nav = navM; live.halos = hm;

    // trees: the woods on the bluffs and Ellis Island, cottonwoods along the
    // water, the town's street trees, a few in the park (planted by the course
    // with its real tree models when the map is ready in time)
    if (sync) {
      const { x0, z0, step, nx, nz } = D.grid;
      const built = new Set();
      for (const b of D.buildings) for (const [x, z] of b.p) built.add(`${Math.round((x - x0) / step)},${Math.round((z - z0) / step)}`);
      for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
        const n = j * nx + i, c = D.C[n];
        const x = x0 + i * step + (rnd() - 0.5) * 9, z = z0 + j * step + (rnd() - 0.5) * 9;
        const p = c === CLS.wood ? 0.3 : c === CLS.wetland ? 0.08 : c === CLS.grass ? 0.035 : c === 0 ? (x > -60 ? 0.07 : 0.006) : 0;
        if (rnd() > p || cut[n] || edge(x, z) < 8 || built.has(`${i},${j}`)) continue;
        if (Math.hypot(x, z) < 80 || keep.some(([a, bb, cc, d]) => x > a && x < bb && z > cc && z < d)) continue;
        if (Math.abs(-(x - BRIDGE_MO[0]) * 0.3308 + (z - BRIDGE_MO[1]) * 0.9436) < 22 && x < -20) continue; // under the bridge
        const y = gy(x, z);
        if (y < POOL + 0.4) continue;
        const wet = y < POOL + 3.5;
        const h = (wet ? 18 : 12) + rnd() * 10;
        res.trees.push({ ...tree(x, y, z, h, h * (wet ? 0.34 : 0.3), { slot: wet ? SLOT.cottonwood : c === 0 && x > -60 ? SLOT.maple : rnd() < 0.55 ? SLOT.oak : SLOT.maple }), far: Math.hypot(x, z) > 420 });
      }
    }
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const update = (t, dt, day) => {
    const n = 1 - day;
    halosMesh.material.opacity = 0.9 * n;
    halosMesh.visible = n > 0.02;
    if (live.bulbs) { live.bulbs.material.opacity = n * (0.85 + 0.15 * Math.sin(t * 3.0)); live.bulbs.visible = n > 0.02; }
    if (live.halos) { live.halos.material.opacity = 0.9 * n; live.halos.visible = n > 0.02; }
    if (live.nav) { live.nav.material.opacity = n * (Math.sin(t * 2.2) > 0.2 ? 1 : 0.15); live.nav.visible = n > 0.02; }
    ripple.offset.set(0, (t * 0.01) % 1);
    if (live.boats) {
      const { boats, hulls, cabins } = live.boats;
      for (let i = 0; i < boats.length; i++) {
        const [x, z, yaw, L] = boats[i], ph = i * 1.7;
        e.set(Math.sin(t * 0.8 + ph) * 0.025, yaw, Math.sin(t * 1.1 + ph) * 0.02);
        m4.compose(v.set(x, WY + Math.sin(t * 0.9 + ph) * 0.07, z), q.setFromEuler(e), sc.set(L, L * 0.16, L * 0.34));
        hulls.setMatrixAt(i, m4);
        m4.compose(v.set(x, WY + Math.sin(t * 0.9 + ph) * 0.07 - L * 0.04, z), q, sc.set(L, L * 0.224, L * 0.34));
        cabins.setMatrixAt(i, m4);
      }
      hulls.instanceMatrix.needsUpdate = cabins.instanceMatrix.needsUpdate = true;
    }
    if (live.tow) {
      // up the channel at 1.4 m/s, round again from below the bridge
      live.tow.position.z = 1500 - ((t * 1.4 + 900) % 3000);
      live.tow.position.y = WY + Math.sin(t * 0.5) * 0.04;
    }
    for (let i = 0; i < flags.length; i++) flags[i].userData.wave(t, i * 1.3);
  };

  const res = {
    group, glow, update, trees: [],
    /** Lay the map on the hole's ground: called by the course once the landmark is placed. */
    fit(holder, T, opts = {}) {
      holder.updateMatrix();
      if (opts.course) {
        // on a real-ground course: stand on its ground, keep off its field of play
        const w = new THREE.Vector3();
        const L = holder.matrix.clone();
        const toW = (x, z) => w.set(x, 0, z).applyMatrix4(L);
        const gy = (x, z) => { toW(x, z); return (T.baseGround(w.x, w.z) - holder.position.y) / holder.scale.y; };
        const inPlay = (x, z) => { toW(x, z); const pr = T.project(w.x, w.z); return Math.abs(pr.d) < T.oobLateral + 6 && pr.s > -40 && pr.s < T.length + 60; };
        const go = (d) => addWorld(d, null, null, false, { gy, inPlay });
        if (DATA) go(DATA); else ready.then((d) => d && go(d));
        return;
      }
      // the map lives beside the holder (same transform), out of its footprint
      ext.position.copy(holder.position); ext.quaternion.copy(holder.quaternion); ext.scale.copy(holder.scale);
      holder.parent.add(ext);
      const M = holder.matrix.clone(), b = T.bounds(200), w = new THREE.Vector3();
      const toW = (x, z) => w.set(x, 0, z).applyMatrix4(M);
      const edge = (x, z) => { toW(x, z); return Math.max(b.minx - w.x, w.x - b.maxx, b.minz - w.z, w.z - b.maxz); };
      const holeY = (x, z) => { toW(x, z); return (T.meshHeight(w.x, w.z) - holder.position.y) / holder.scale.y; };
      if (DATA) addWorld(DATA, edge, holeY, true);
      else ready.then((d) => d && addWorld(d, edge, holeY, false));
    },
  };
  update(3, 0, 1);
  return res;
}
