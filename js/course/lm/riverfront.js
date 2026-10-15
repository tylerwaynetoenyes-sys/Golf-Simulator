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
import { mat, lit, seeded, canvasTex, tree, SLOT, boulderGeometry } from './kit.js';
import { pbr } from '../../scene/pbr.js';
import { carsAt } from '../../scene/cars.js';
import { crowdAt } from '../../scene/crowd.js';
import { boatFleet } from '../../scene/boats.js';
import { loadHouses, housesLoaded, housesAt } from '../../scene/houses.js';

// the baked map, fetched as soon as the module loads (long before a hole is built)
const BASE = new URL('../../../assets/landmarks/alton/', import.meta.url).href;
// the parks and what's in them (tools/bake-park.py), optional
let PARK = null;
const parkReady = fetch(`${BASE}park.json`).then((r) => (r.ok ? r.json() : null)).then((j) => (PARK = j)).catch(() => null);
let DATA = null;
const ready = Promise.all([
  parkReady.then(() => loadHouses()),
  fetch(`${BASE}ground.json`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  fetch(`${BASE}ground.bin`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))),
]).then(([, j, bin]) => {
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
export function place(g, x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz); _o.scale.set(sx, sy, sz); _o.updateMatrix();
  return g.applyMatrix4(_o.matrix);
}
export const bx = (w, h, d, x, y, z, ry = 0) => place(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), x, y, z, ry);
export const cy = (rt, rb, h, x, y, z, seg = 12) => place(new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, h / 2, 0), x, y, z);
const _up = new THREE.Vector3(0, 1, 0);
/** Cylinder from A to B. */
export function rod(A, B, r, seg = 4) {
  const d = new THREE.Vector3().subVectors(B, A);
  const L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true);
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d.normalize());
  g.applyQuaternion(q);
  return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}
/** Box spanning P→Q (top surface on the P–Q line), width across, depth below. */
export function span(P, Q, width, depth, lat = 0) {
  const xa = new THREE.Vector3().subVectors(Q, P);
  const L = xa.length(); xa.normalize();
  const za = new THREE.Vector3().crossVectors(xa, _up).normalize();
  const ya = new THREE.Vector3().crossVectors(za, xa);
  const m = new THREE.Matrix4().makeBasis(xa, ya, za);
  const g = new THREE.BoxGeometry(L, depth, width).translate(0, -depth / 2, lat).applyMatrix4(m);
  return g.translate((P.x + Q.x) / 2, (P.y + Q.y) / 2, (P.z + Q.z) / 2);
}
export class Batch {
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
/** Real scanned people at [x,y,z,rotY] spots (instanced; none if the scans aren't loaded). */
function crowd(group, spots, rnd) {
  const g = crowdAt(spots, rnd);
  if (g) group.add(g);
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
  // painted steel, standing-seam roofs and stucco: photographed sets, tinted to the casino's colours
  const navy = pbr('metal_plate', { scale: 2, tint: 0x2a3550, metal: 0.25, rough: 0.8 });
  const red = pbr('metal_plate', { scale: 2, tint: 0xd8483c, metal: 0.1 });
  const redRoof = pbr('corrugated_iron', { scale: 1.6, tint: 0xe0574f, metal: 0.25 });
  const yellow = pbr('white_plaster_02', { scale: 3, tint: 0xf6c24a, glow: 0xffd57a, night: 0.5 });
  const orange = pbr('white_plaster_02', { scale: 3, tint: 0xf08a3c });
  const cream = pbr('white_plaster_02', { scale: 3, tint: 0xf4ecd8 });
  const green = pbr('metal_plate', { scale: 1.5, tint: 0x54b45a, metal: 0.25, glow: 0x9dff9a, night: 0.35 });
  const blueRoof = pbr('corrugated_iron', { scale: 1.4, tint: 0x5a8fe0, metal: 0.3 });
  const gold = lit(0xd8b04a, 0xffd27a, { metalness: 0.7, roughness: 0.3, night: 0.7 });
  const stone = pbr('granite_wall', { scale: 2, tint: 0xd8c8a8 });
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
    const signM = new THREE.MeshStandardMaterial({ map: letters, transparent: true, alphaTest: 0.4, side: THREE.FrontSide, roughness: 0.4, emissive: 0xe9fff0, emissiveMap: letters, emissiveIntensity: 0 });
    signM.userData.night = 1.4;
    glow.push(signM);
    for (const s of [-1, 1]) {
      // one face each way, each read the right way round from its own side
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
    const pile = pbr('corrugated_iron', { scale: 1.2, tint: 0xf09a3a, metal: 0.3 });
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
  const navy = pbr('metal_plate', { scale: 2, tint: 0x283048, metal: 0.25, rough: 0.8 });
  const red = pbr('metal_plate', { scale: 2, tint: 0xd23a3a, metal: 0.1 });
  const redRoof = pbr('corrugated_iron', { scale: 1.4, tint: 0xc8403e, metal: 0.2 });
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
  B.add(pbr('metal_plate', { scale: 2, tint: 0x62aaf0, metal: 0.15 }), bx(16, 4, 48, 0, -2.6, 0));
  B.add(mat(0xf2c53d, { roughness: 0.5 }), bx(16.3, 0.8, 48.3, 0, 1.2, 0), bx(14.6, 0.6, 40, 0, 6.2, -2));
  B.add(lit(0x23415e, 0xffd28a, { night: 0.6, roughness: 0.25 }), bx(14, 4, 42, 0, 2.0, -2));
  B.add(pbr('white_plaster_02', { scale: 3 }), bx(12, 3.2, 28, 0, 6.8, -5));
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
  void tex;
  const silo = pbr('concrete_wall_008', { scale: 5, tint: 0xf4f2ec });
  const roofM = pbr('brushed_concrete', { scale: 4, tint: 0xb0aca4 });
  const steel = pbr('metal_plate', { scale: 2, tint: 0x8c9196, metal: 0.4 });
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
  B.add(pbr('corrugated_iron', { scale: 1.6, tint: 0xd2cec6, metal: 0.3 }), bx(22, 11, 140, -108, ya, -650));
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
  const deckM = pbr('asphalt_02', { scale: 6, tint: 0xc8c8c8 });
  const girder = pbr('metal_plate', { scale: 2.5, tint: 0xd0d4d8, metal: 0.4 });
  const concrete = pbr('concrete_wall_008', { scale: 5, tint: 0xece8e0 });
  const iron = pbr('metal_plate', { scale: 1, tint: 0x3a3e44, metal: 0.5 });
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
  const conc = pbr('concrete_wall_008', { scale: 3, tint: 0xd8d2c6 });
  const steel = pbr('metal_plate', { scale: 1, tint: 0x3a3e44, metal: 0.5 });
  const granite = pbr('granite_wall', { scale: 1.5, tint: 0xc8c4be });
  const brick = pbr('red_bricks_02', { scale: 1.6 });
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
  B.add(pbr('brushed_concrete', { scale: 3 }), span(new THREE.Vector3(rp[0] + 14, gy(rp[0] + 14, rp[1]) + 0.1, rp[1]), new THREE.Vector3(rp[0] - 14, WY - 1.2, rp[1]), 8, 0.4));
}

/**
 * A large overnight sternwheeler (from Tyler's photograph at the Alton
 * levee): five white decks with red trim and rows of cabin windows, a pilot
 * house, twin black stacks, and a big red stern paddle wheel. ~100 m long.
 */
function sternwheeler(B, glow) {
  const white = pbr('white_plaster_02', { scale: 2.5, tint: 0xfbfaf6 });
  const red = pbr('metal_plate', { scale: 2, tint: 0xc23a34, metal: 0.1 });
  const black = pbr('metal_plate', { scale: 2, tint: 0x2a2c30, metal: 0.3 });
  const blue = pbr('corrugated_iron', { scale: 1.4, tint: 0x4a7aa8, metal: 0.2 });
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
export function tow(glow) {
  const g = new THREE.Group();
  const B = new Batch();
  const rust = pbr('metal_plate', { scale: 2, tint: 0x8a5a40, metal: 0.3 });
  const black = pbr('metal_plate', { scale: 2, tint: 0x2c2e32, metal: 0.3 });
  const covers = [pbr('corrugated_iron', { scale: 1.5, tint: 0x5a86b0 }), pbr('corrugated_iron', { scale: 1.5, tint: 0xb08050 }), pbr('corrugated_iron', { scale: 1.5, tint: 0x6a8a68 })];
  const white = pbr('white_plaster_02', { scale: 2.5 });
  const red = pbr('metal_plate', { scale: 2, tint: 0xc03a34, metal: 0.1 });
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
/**
 * The real houses (scene/houses.js) for the town's house footprints near the
 * riverfront: the type that suits each footprint, scaled to it and turned to
 * face its nearest street. Returns the footprints it took (by index).
 */
function townHouses(D, gy, skip, rnd, out, { near = 480, cap = 110 } = {}) {
  const taken = new Set();
  if (!housesLoaded()) return taken;
  // street points on a 30 m grid, for "which way is the street"
  const cells = new Map(), key = (x, z) => `${Math.floor(x / 30)},${Math.floor(z / 30)}`;
  for (const r of D.roads) {
    if (!STREETS.has(r.k)) continue;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i], [bx2, bz2] = r.p[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx2 - ax, bz2 - az) / 5));
      for (let k = 0; k <= n; k++) { const x = ax + ((bx2 - ax) * k) / n, z = az + ((bz2 - az) * k) / n, kk = key(x, z); if (!cells.has(kk)) cells.set(kk, []); cells.get(kk).push(x, z); }
    }
  }
  const street = (x, z) => {
    let best = null, bd = 45 * 45;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const c = cells.get(`${Math.floor(x / 30) + i},${Math.floor(z / 30) + j}`);
      if (c) for (let k = 0; k < c.length; k += 2) { const d = (c[k] - x) ** 2 + (c[k + 1] - z) ** 2; if (d < bd) { bd = d; best = [c[k], c[k + 1]]; } }
    }
    return best;
  };
  const cand = [];
  D.buildings.forEach((b, idx) => {
    let pts = b.p;
    if (pts.length > 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1);
    if (pts.length < 4 || pts.length > 10) return;
    const cx = pts.reduce((s2, q) => s2 + q[0], 0) / pts.length, cz = pts.reduce((s2, q) => s2 + q[1], 0) / pts.length;
    const dist = Math.hypot(cx, cz);
    if (dist > near || skip(cx, cz, b)) return;
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length]; area += x1 * z2 - x2 * z1; }
    const A = Math.abs(area / 2), k = b.k;
    const homey = ['house', 'detached', 'residential', 'semidetached_house', 'terrace', 'bungalow'].includes(k) || (k === 'yes' && A < 350);
    const shop = ['commercial', 'retail'].includes(k);
    if (!homey && !shop) return;
    cand.push({ idx, pts, cx, cz, A, dist, shop });
  });
  cand.sort((a, b) => a.dist - b.dist);
  for (const c of cand.slice(0, cap)) {
    const st = street(c.cx, c.cz);
    if (!st) continue;
    // the footprint's oriented box, along its longest side
    let best = 0, ang = 0;
    for (let i = 0; i < c.pts.length; i++) { const [x1, z1] = c.pts[i], [x2, z2] = c.pts[(i + 1) % c.pts.length]; const l = Math.hypot(x2 - x1, z2 - z1); if (l > best) { best = l; ang = Math.atan2(z2 - z1, x2 - x1); } }
    const ca = Math.cos(ang), sa = Math.sin(ang);
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of c.pts) { const a = (x - c.cx) * ca + (z - c.cz) * sa, bb = -(x - c.cx) * sa + (z - c.cz) * ca; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, bb); b1 = Math.max(b1, bb); }
    const mx = c.cx + ((a0 + a1) / 2) * ca - ((b0 + b1) / 2) * sa, mz = c.cz + ((a0 + a1) / 2) * sa + ((b0 + b1) / 2) * ca;
    // face the street: the box axis nearer the street direction is the house's depth
    let rx = st[0] - mx, rz = st[1] - mz;
    const alongA = Math.abs(rx * ca + rz * sa) > Math.abs(-rx * sa + rz * ca);
    const ux = alongA ? ca : -sa, uz = alongA ? sa : ca, sgn = Math.sign(rx * ux + rz * uz) || 1;
    rx = ux * sgn; rz = uz * sgn;
    const d = alongA ? a1 - a0 : b1 - b0, w = alongA ? b1 - b0 : a1 - a0;
    const r = rnd();
    let type;
    if (c.shop || (c.A > 150 && w / Math.max(d, 1) > 2)) type = 'brick_shop';
    else if (c.A >= 140 && Math.max(w, d) / Math.min(w, d) < 1.5) type = 'foursquare';
    else if (c.A < 95) type = c.dist < 300 ? (r < 0.55 ? 'brick_narrow' : 'frame_gable') : (r < 0.75 ? 'frame_gable' : 'brick_narrow');
    else type = r < 0.5 ? 'brick_cottage' : r < 0.8 ? 'frame_gable' : 'foursquare';
    const y = Math.min(...c.pts.map(([x, z]) => gy(x, z)));
    out.push({ type, x: mx, y, z: mz, yaw: Math.atan2(rx, rz), w, d });
    taken.add(c.idx);
  }
  return taken;
}

export function townMeshes(D, gy, skip, glow, rnd, houses = null) {
  // near the riverfront the houses are the real models; the rest stay extruded,
  // with photographed walls (red brick, buff limestone, painted clapboard)
  // tinted per building, gravel and slate roofs, and real windows: glass set
  // in the wall with stone sills and lintels, some lit at night, shopfronts
  // along the ground floor of the bigger buildings
  const taken = houses ? townHouses(D, gy, skip, rnd, houses) : new Set();
  const M = {
    brick: pbr('red_brick', { scale: 1.6, vertex: true }),
    stone: pbr('white_sandstone_bricks', { scale: 1.8, vertex: true }),
    siding: pbr('white_plaster_02', { scale: 2, bright: 1.5, vertex: true }),
    flat: pbr('gravel_stones', { scale: 1.6, vertex: true }),
    pitched: pbr('roof_slates_02', { scale: 1.4, vertex: true }),
    trim: pbr('white_sandstone_bricks', { scale: 1.2, tint: 0xf2ece0, bright: 1.2 }),
    glass: mat(0x44505c, { roughness: 0.1, metalness: 0.5 }),
    lamp: lit(0x44505c, 0xffd29a, { night: 1.1, roughness: 0.08, metalness: 0.6 }),
  };
  glow.push(M.lamp);
  const BRICK = [0xc89888, 0xb88878, 0xa88070, 0xd0a090, 0x987068, 0xc09080]; // firings of red brick, weathered
  const STONE = [0xfff0d8, 0xf0e4d0, 0xe8dcc8]; // buff limestone and cream terra cotta
  const SIDING = [0xe8e4da, 0xd8d4c6, 0xc9cfd2, 0xe1d6bd, 0xa9b7c0, 0xf0ece2];
  const ROOF = [0xb8b8b8, 0xa8a49e, 0xb8a090, 0x9a9ea2, 0xc0b0a0];
  // big cells: the whole town is ~120k triangles, and every cell costs a
  // draw call per material (eight of them)
  const cells = new Map();
  const cell = (x, z) => {
    const k = `${Math.floor(x / 1500)},${Math.floor(z / 1500)}`;
    if (!cells.has(k)) cells.set(k, new Map());
    return cells.get(k);
  };
  const list = (C, m) => {
    if (!C.has(m)) C.set(m, { p: [], n: [], c: [] });
    return C.get(m);
  };
  const col = new THREE.Color(), white = new THREE.Color(1, 1, 1);
  let core = null; // a point inside the building: roof faces turn away from it
  const tri = (R, a, b, c, color) => {
    let ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (core && n[0] * ((a[0] + b[0] + c[0]) / 3 - core[0]) + n[1] * ((a[1] + b[1] + c[1]) / 3 - core[1]) + n[2] * ((a[2] + b[2] + c[2]) / 3 - core[2]) < 0) {
      [b, c] = [c, b]; n = n.map((v) => -v);
    }
    const l = Math.hypot(...n) || 1;
    for (const p of [a, b, c]) { R.p.push(...p); R.n.push(n[0] / l, n[1] / l, n[2] / l); R.c.push(color.r, color.g, color.b); }
  };
  /** A flat rectangle on a wall: along (dx, dz) from u0 to u1, y0 to y1, `out` metres proud, facing (nx, nz). */
  const panel = (R, x1, z1, dx, dz, nx, nz, u0, u1, y0, y1, out, color = white) => {
    const P = (u, y) => [x1 + dx * u + nx * out, y, z1 + dz * u + nz * out];
    for (const q of [P(u0, y0), P(u1, y1), P(u1, y0), P(u0, y0), P(u0, y1), P(u1, y1)]) { R.p.push(...q); R.n.push(nx, 0, nz); R.c.push(color.r, color.g, color.b); }
  };
  /** A ledge (sill, cornice): its top and its front face. */
  const ledge = (R, x1, z1, dx, dz, nx, nz, u0, u1, y, hgt, depth) => {
    panel(R, x1, z1, dx, dz, nx, nz, u0, u1, y - hgt, y, depth);
    const P = (u, t) => [x1 + dx * u + nx * t, y, z1 + dz * u + nz * t];
    for (const q of [P(u0, 0), P(u1, depth), P(u1, 0), P(u0, 0), P(u0, depth), P(u1, depth)]) { R.p.push(...q); R.n.push(0, 1, 0); R.c.push(1, 1, 1); }
  };
  D.buildings.forEach((b, bi) => { if (taken.has(bi)) b._model = true; });
  for (const b of D.buildings) {
    if (b._model) { delete b._model; continue; }
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
    const house = ['house', 'detached', 'residential', 'semidetached_house', 'terrace', 'bungalow'].includes(k) || (k === 'yes' && A < 350);
    const shed = ['garage', 'garages', 'shed', 'carport', 'roof'].includes(k);
    if (!h) {
      if (shed) h = 3;
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
    core = [cx, top - 1, cz];
    const stoneFront = !house && rnd() < 0.3;
    const wallM = house ? M.siding : stoneFront ? M.stone : M.brick;
    col.set(house ? SIDING[Math.floor(rnd() * SIDING.length)] : stoneFront ? STONE[Math.floor(rnd() * STONE.length)] : BRICK[Math.floor(rnd() * BRICK.length)]);
    const W = list(C, wallM), G = list(C, M.glass), L = list(C, M.lamp), T = list(C, M.trim);
    const floorH = house ? 2.9 : 3.6, shop = !house && !shed && A > 120 && ['yes', 'commercial', 'retail', 'office', 'apartments', 'hotel'].includes(k);
    for (let i = 0; i < pts.length; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
      const len = Math.hypot(x2 - x1, z2 - z1);
      if (len < 0.05) continue;
      const dx = (x2 - x1) / len, dz = (z2 - z1) / len, nx = dz, nz = -dx;
      // wound to face outward (the footprint is counter-clockwise in x/z), so every wall shows from outside
      panel(W, x1, z1, dx, dz, nx, nz, 0, len, y0, top, 0, col);
      // far-off houses are a few pixels across: their windows would only cost triangles
      if (shed || len < 2.4 || (house && Math.hypot(cx, cz) > 900)) continue;
      // windows, bay by bay and floor by floor
      const bays = Math.max(1, Math.floor(len / (house ? 3.6 : 3.3))), bw = len / bays;
      const floors = Math.max(1, Math.floor((top - lo - 0.8) / floorH));
      for (let f = 0; f < floors; f++) {
        const base = lo + f * floorH;
        if (f === 0 && shop && len > 6) {
          // the shopfront: plate glass between brick piers, a stone band over it
          for (let j = 0; j < bays; j++) {
            const u = j * bw;
            if (gy(x1 + dx * (u + bw / 2), z1 + dz * (u + bw / 2)) > base + 0.5) continue;
            panel(rnd() < 0.6 ? L : G, x1, z1, dx, dz, nx, nz, u + 0.35, u + bw - 0.35, base + 0.5, base + 3.0, 0.03);
          }
          ledge(T, x1, z1, dx, dz, nx, nz, 0, len, base + 3.5, 0.45, 0.2);
          continue;
        }
        const wy = base + (house ? 0.9 : 1.0), wh = house ? 1.5 : 1.9;
        if (wy + wh > top - 0.5) break;
        let any = false;
        for (let j = 0; j < bays; j++) {
          const um = (j + 0.5) * bw, ww = Math.min(house ? 1.0 : 1.2, bw * 0.5);
          if (gy(x1 + dx * um, z1 + dz * um) > wy - 0.2) continue;
          panel(rnd() < 0.4 ? L : G, x1, z1, dx, dz, nx, nz, um - ww / 2, um + ww / 2, wy, wy + wh, 0.03);
          any = true;
        }
        // the brick blocks' stone sill and lintel courses run the length of each floor
        if (any && !house) {
          panel(T, x1, z1, dx, dz, nx, nz, 0, len, wy - 0.16, wy, 0.06);
          panel(T, x1, z1, dx, dz, nx, nz, 0, len, wy + wh, wy + wh + 0.3, 0.05);
        }
      }
      // a stone cornice along the top of the commercial blocks
      if (!house) ledge(T, x1, z1, dx, dz, nx, nz, -0.15, len + 0.15, top, 0.5, 0.3);
    }
    // roofs: pitched over the small houses, flat (gravel inside the cornice) on the rest
    col.set(ROOF[Math.floor(rnd() * ROOF.length)]);
    if (house && pts.length <= 8) {
      const R = list(C, M.pitched);
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
      tri(R, e1, r1, e2, col); tri(R, e2, r1, r2, col);
      tri(R, e3, r2, e4, col); tri(R, e4, r2, r1, col);
      tri(R, e1, e4, r1, col); tri(R, e2, r2, e3, col);
    } else {
      const R = list(C, M.flat);
      const contour = pts.map(([x, z]) => new THREE.Vector2(x, z));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      for (const [a, bb, c] of tris) tri(R, [pts[a][0], top, pts[a][1]], [pts[c][0], top, pts[c][1]], [pts[bb][0], top, pts[bb][1]], col);
      if (k === 'church' || k === 'cathedral') {
        // a spire over the front
        const s = 3.2, sh = h * 1.6, sx = pts[0][0] * 0.7 + cx * 0.3, sz = pts[0][1] * 0.7 + cz * 0.3;
        const base = [[sx - s, top, sz - s], [sx + s, top, sz - s], [sx + s, top, sz + s], [sx - s, top, sz + s]];
        const apex = [sx, top + sh, sz];
        col.set(0xa0a4aa);
        for (let i = 0; i < 4; i++) tri(list(C, M.pitched), base[i], apex, base[(i + 1) % 4], col);
      }
    }
  }
  const meshes = [];
  for (const C of cells.values()) {
    for (const [m, R] of C) {
      if (!R.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(R.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(R.n, 3));
      if (m.vertexColors) g.setAttribute('color', new THREE.Float32BufferAttribute(R.c, 3));
      meshes.push(new THREE.Mesh(g, m));
    }
  }
  for (const m of meshes) { m.castShadow = false; m.receiveShadow = true; }
  return meshes;
}

const STREETS = new Set(['residential', 'tertiary', 'secondary', 'primary', 'unclassified', 'living_street']);
const LINED = new Set(['tertiary', 'secondary', 'primary', 'trunk']);
/** Wind every triangle of a flat list counter-clockwise seen from above. */
function faceUp(a) {
  for (let i = 0; i < a.length; i += 9) {
    const ny = (a[i + 5] - a[i + 2]) * (a[i + 6] - a[i]) - (a[i + 3] - a[i]) * (a[i + 8] - a[i + 2]);
    if (ny < 0) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; }
  }
}
/** Streets and paths draped on the ground; the lots as flat asphalt. */
export function pavingMeshes(D, gy, skipAt, { paths = true, sidewalks = false } = {}) {
  const { x0, z0, step, nx, nz } = D.grid;
  const onMap = (x, z) => x > x0 + 6 && x < x0 + (nx - 1) * step - 6 && z > z0 + 6 && z < z0 + (nz - 1) * step - 6;
  const asphalt = pbr('asphalt_02', { scale: 5, tint: sidewalks ? 0x8c9094 : 0xd8d8d8, offset: -2 });
  const pathM = pbr('brushed_concrete', { scale: 4, tint: 0xe8e2d6, offset: -2 });
  const lotM = pbr('asphalt_02', { scale: 6, tint: 0xc8c8c8, offset: -1 });
  const roads = { [asphalt.uuid]: [], [pathM.uuid]: [] };
  const walks = [], curbs = [], lines = [];
  for (const r of D.roads) {
    if (r.b) continue; // bridges and ramps: the Clark Bridge is modelled, the rest are lost in the trees
    const path = ['footway', 'path', 'cycleway'].includes(r.k);
    if (path && !paths && r.k !== 'cycleway') continue; // narrow paths: the imagery has them
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
    // town streets get a sidewalk each side, a grass verge between
    const walkSides = sidewalks && STREETS.has(r.k);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bxx, bz] = pts[i + 1];
      if (skipAt((ax + bxx) / 2, (az + bz) / 2) || !onMap(ax, az) || !onMap(bxx, bz)) continue;
      const L = Math.hypot(bxx - ax, bz - az) || 1, ux = -(bz - az) / L, uz = (bxx - ax) / L, nx = ux * w, nz = uz * w;
      const ya = gy(ax, az) + 0.15, yb = gy(bxx, bz) + 0.15;
      list.push(ax - nx, ya, az - nz, bxx - nx, yb, bz - nz, bxx + nx, yb, bz + nz, ax - nx, ya, az - nz, bxx + nx, yb, bz + nz, ax + nx, ya, az + nz);
      const strip = (out, o0, o1, dy, cut = 0) => {
        const yA = ya + dy, yB = yb + dy, a0x = ax + (bxx - ax) * cut, a0z = az + (bz - az) * cut;
        out.push(a0x + ux * o0, yA, a0z + uz * o0, bxx + ux * o0, yB, bz + uz * o0, bxx + ux * o1, yB, bz + uz * o1, a0x + ux * o0, yA, a0z + uz * o0, bxx + ux * o1, yB, bz + uz * o1, a0x + ux * o1, yA, a0z + uz * o1);
      };
      if (walkSides) for (const s of [-1, 1]) {
        strip(curbs, s * w, s * (w + 0.25), 0.15); // the curb, a step up from the gutter
        strip(walks, s * (w + 1.0), s * (w + 2.5), 0.12); // the sidewalk past a grass verge
      }
      // a dashed yellow centre line on the through streets
      if (sidewalks && LINED.has(r.k) && i % 2 === 0) strip(lines, -0.07, 0.07, 0.02, 0.4);
    }
  }
  const meshes = [];
  const curbM = pbr('concrete_wall_008', { scale: 1.5, tint: 0xd0d8e8, bright: 1.3 });
  const lineM = mat(0xd8b03a, { roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  for (const [m, list] of [[asphalt, roads[asphalt.uuid]], [pathM, roads[pathM.uuid]], [pathM, walks], [curbM, curbs], [lineM, lines]]) {
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



/** Point in polygon (x/z). */
function inPoly(x, z, p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [x1, z1] = p[i], [x2, z2] = p[j];
    if ((z1 > z) !== (z2 > z) && x < ((x2 - x1) * (z - z1)) / (z2 - z1) + x1) c = !c;
  }
  return c;
}

/** Galvanised chain-link (ambientCG Fence003, CC0): the wire's colour, its holes as alpha, 0.35 m a tile. */
let _chain = null;
function chainLink() {
  if (_chain) return _chain;
  const base = new URL('../../../assets/textures/fence/', import.meta.url).href, L = new THREE.TextureLoader();
  const t = (f, srgb) => { const x = L.load(base + f); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; x.anisotropy = 8; return x; };
  _chain = new THREE.MeshStandardMaterial({ map: t('chainlink_diff.jpg', true), alphaMap: t('chainlink_opacity.jpg'), normalMap: t('chainlink_nor_gl.jpg'), roughnessMap: t('chainlink_rough.jpg'), transparent: true, depthWrite: false, side: THREE.DoubleSide, metalness: 0.35, roughness: 0.8, color: 0xffffff });
  // blended, not alpha-tested: far off the mipmapped wire becomes the grey haze a chain-link fence is
  // the wire covers ~15% of a tile; mipmapped that fades to nothing, where a
  // real fence reads as a grey screen: lift the coverage
  _chain.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n diffuseColor.a = min(1.0, diffuseColor.a * 2.6);'); };
  _chain.customProgramCacheKey = () => 'chainlink';
  return _chain;
}

/**
 * A rock-pile dike along a polyline at the water: a mound of quarried riprap
 * (its surface photographed rock), boulders heaped along the crest and
 * tumbled down the flanks. `crest` is the height above the water.
 */
function riprap(B, line, wy, rnd, { base = 12, crest = 1.6, boulders = true } = {}) {
  const pile = pbr('gray_rocks', { scale: 2.5, tint: 0xd8d8d4 });
  const rock = pbr('rock_boulder_dry', { scale: 1.6, tint: 0xd0d2d4 });
  for (let i = 0; i < line.length - 1; i++) {
    const A = new THREE.Vector2(line[i][0], line[i][1]), Bv = new THREE.Vector2(line[i + 1][0], line[i + 1][1]);
    const L = A.distanceTo(Bv);
    if (L < 1) continue;
    const d = Bv.clone().sub(A).divideScalar(L), nrm = new THREE.Vector2(-d.y, d.x);
    // the mound: a rounded cross-section swept along the segment, lumpy along its length
    const segs = Math.max(2, Math.ceil(L / 3)), prof = [[-1, -2.5], [-0.7, 0.2], [-0.35, 0.85], [0, 1], [0.35, 0.85], [0.7, 0.2], [1, -2.5]];
    const pos = [];
    const at = (u, k) => {
      const t = u / segs, c = A.clone().lerp(Bv, t), w = base / 2, [px, py] = prof[k];
      const lump = 1 + Math.sin(t * L * 0.9 + k) * 0.08 + Math.sin(t * L * 2.3 + k * 2) * 0.05;
      return [c.x + nrm.x * px * w * lump, wy + (py > 0 ? py * crest * lump : py), c.y + nrm.y * px * w * lump];
    };
    for (let u = 0; u < segs; u++) for (let k = 0; k < prof.length - 1; k++) {
      const a = at(u, k), b = at(u + 1, k), c = at(u + 1, k + 1), e = at(u, k + 1);
      pos.push(...a, ...c, ...b, ...a, ...e, ...c);
    }
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    B.add(pile, g);
    if (!boulders) continue;
    for (let t = 0; t < L; t += 2.6) for (let k = 0; k < 2; k++) {
      const o = (rnd() - 0.5) * base * 0.8, c = A.clone().addScaledVector(d, t + rnd() * 2.6).addScaledVector(nrm, o);
      const r = 0.45 + rnd() * 0.6, y = wy + crest * Math.max(0, 1 - Math.abs(o) / (base * 0.5)) * 0.9;
      B.add(rock, place(boulderGeometry(r, rnd, { detail: 1, flat: 0.65 }), c.x, y, c.y, rnd() * 6.28));
    }
  }
}

/**
 * Riverfront Park as it is (OpenStreetMap, park.json): the black ornamental
 * fence along the river walk, lamp standards along it, the two picnic
 * pavilions, the restroom, the playground, picnic tables, benches, drinking
 * fountains, the fitness station, the interpretive signs on the walk and the
 * "Sail" sculpture. Built into the batch on the course's ground.
 */
function parkDressing(PK, B, gy, skipAt, glow) {
  const iron = pbr('metal_plate', { scale: 0.6, tint: 0x24272a, metal: 0.6 });
  const slab = pbr('brushed_concrete', { scale: 2.5, tint: 0xe8e2d6, bright: 1.2 });
  const brick = pbr('red_bricks_02', { scale: 1.4, tint: 0xf0d8cc });
  const roofM = pbr('corrugated_iron', { scale: 1, tint: 0x4f6a58, metal: 0.4 });
  const timber = pbr('brown_planks_08', { scale: 1.2, tint: 0xd8c0a0 });
  const steel = pbr('metal_plate', { scale: 0.8, tint: 0xc8ccd0, metal: 0.85, rough: 0.5 });
  const green = pbr('metal_plate', { scale: 0.8, tint: 0x2f6a4a, metal: 0.35 });
  const mulch = pbr('bark_brown_02', { scale: 1, tint: 0xb08868, offset: -2 });
  const plastic = { y: mat(0xe8b830, { roughness: 0.45 }), r: mat(0xc0402e, { roughness: 0.45 }), b: mat(0x2f62a8, { roughness: 0.45 }), k: mat(0x1c1c1e, { roughness: 0.6 }) };
  const lampM = lit(0xfff4dc, 0xffd59a, { night: 2.2, roughness: 0.3 });
  glow.push(lampM);
  const ok = (x, z) => !skipAt(x, z);
  const park = PK.parks.find((p) => p.n === 'Riverfront Park');
  if (!park) return;
  // ── the flood wall: the park runs level to its edge, where a concrete wall
  // drops straight into the river; a black picket fence on a curb along its top ──
  const wallM = pbr('concrete_wall_008', { scale: 3, tint: 0xc4cee4, bright: 1.15 });
  const capM = pbr('brushed_concrete', { scale: 2, tint: 0xd8e0ee, bright: 1.25 });
  const walkM = pbr('brushed_concrete', { scale: 3, tint: 0xe4e6ea, bright: 1.15 });
  const edge = park.p, fence = [];
  for (let i = 0; i < edge.length - 1; i++) {
    const [x1, z1] = edge[i], [x2, z2] = edge[i + 1];
    if (x1 > -140 || x2 > -140 || Math.abs(z2 - z1) < Math.abs(x2 - x1)) continue; // the shore side only
    const L = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.ceil(L / 6));
    for (let k = 0; k < n; k++) {
      const a0 = k / n, a1 = (k + 1) / n;
      const P = new THREE.Vector3(x1 + (x2 - x1) * a0, 0, z1 + (z2 - z1) * a0), Q = new THREE.Vector3(x1 + (x2 - x1) * a1, 0, z1 + (z2 - z1) * a1);
      if (!ok(P.x, P.z) || !ok(Q.x, Q.z)) continue;
      // the wall's top sits at the park's level just inside it
      P.y = Math.max(gy(P.x + 12, P.z), gy(P.x + 16, P.z)) + 0.05; Q.y = Math.max(gy(Q.x + 12, Q.z), gy(Q.x + 16, Q.z)) + 0.05;
      B.add(wallM, span(P, Q, 0.7, P.y - (WY - 2), -0.35));
      B.add(capM, span(P.clone().setY(P.y + 0.12), Q.clone().setY(Q.y + 0.12), 0.9, 0.12, -0.35));
      // the river walk on top: level concrete from the wall back to the lawn
      B.add(walkM, span(P.clone().setY(P.y + 0.06), Q.clone().setY(Q.y + 0.06), 12, P.y + 0.06 - (WY - 1), -6.3)); // (+lat is riverward along these edges)
      fence.push([P.clone().setY(P.y + 0.12), Q.clone().setY(Q.y + 0.12)]);
    }
  }
  // the modern black steel picket fence on a low concrete curb along the wall's edge:
  // square posts every 2.4 m, top and bottom rails, pickets at 11 cm
  const black = pbr('metal_plate', { scale: 0.5, tint: 0x2a2c2e, metal: 0.5, rough: 0.7 });
  const galv = pbr('metal_plate', { scale: 0.5, tint: 0xd8dee4, bright: 1.6, metal: 0.35, rough: 0.8 }); // galvanised, dull grey
  for (const [P, Q] of fence) {
    const L = P.distanceTo(Q);
    B.add(capM, span(P.clone().setY(P.y + 0.45), Q.clone().setY(Q.y + 0.45), 0.4, 0.45, 0.1));
    const y0 = 0.45;
    for (let t = 0; t < L; t += 0.11) {
      const X = P.clone().lerp(Q, t / L), post = (t % 2.4) < 0.11;
      B.add(black, bx(post ? 0.08 : 0.02, post ? 1.32 : 1.2, post ? 0.08 : 0.02, X.x, X.y + y0, X.z, -Math.atan2(Q.z - P.z, Q.x - P.x)));
    }
    for (const h of [y0 + 0.1, y0 + 1.12]) B.add(black, span(P.clone().setY(P.y + h + 0.04), Q.clone().setY(Q.y + h + 0.04), 0.05, 0.04));
  }
  // the river walk's lamps: tall black poles with dome shades
  for (let i = 0; i < fence.length; i += 4) {
    const [P] = fence[i], x = P.x + 5, z = P.z;
    if (!ok(x, z)) continue;
    const y = gy(x, z);
    B.add(black, cy(0.07, 0.1, 5.2, x, y, z, 8), bx(0.06, 0.06, 0.5, x, y + 5.1, z));
    B.add(black, place(new THREE.SphereGeometry(0.32, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1), x, y + 5.0, z + 0.45));
    B.add(lampM, place(new THREE.CircleGeometry(0.28, 12).rotateX(Math.PI / 2), x, y + 4.99, z + 0.45));
  }
  // the USGS river gauge by the walk: a raised concrete pad in a chain-link cage
  for (const pt of PK.points) {
    if (pt.k !== 'man_made=monitoring_station' || !ok(pt.p[0], pt.p[1])) continue;
    const [x, z] = pt.p, y = gy(x + 8, z) + 0.05, s2 = 3.2, H = 2.4;
    B.add(wallM, bx(s2 * 2, 1.1, s2 * 2, x, y - 0.4, z));
    const cage = [], uvs = [];
    const C = [[x - s2, z - s2], [x + s2, z - s2], [x + s2, z + s2], [x - s2, z + s2]];
    let run = 0;
    for (let k = 0; k < 4; k++) {
      const [x1, z1] = C[k], [x2, z2] = C[(k + 1) % 4], y1 = y + 0.7, L = s2 * 2;
      cage.push(x1, y1, z1, x2, y1, z2, x2, y1 + H, z2, x1, y1, z1, x2, y1 + H, z2, x1, y1 + H, z1);
      uvs.push(run / 0.35, 0, (run + L) / 0.35, 0, (run + L) / 0.35, H / 0.35, run / 0.35, 0, (run + L) / 0.35, H / 0.35, run / 0.35, H / 0.35);
      run += L;
      B.add(galv, cy(0.04, 0.04, H, x1, y1, z1, 8), rod(new THREE.Vector3(x1, y1 + H, z1), new THREE.Vector3(x2, y1 + H, z2), 0.025, 5));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(cage, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    B.add(chainLink(), g);
  }
  // ── the park buildings: two open picnic pavilions, the brick restroom ──
  for (const b of PK.buildings) {
    let p = b.p;
    if (p.length > 2 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p = p.slice(0, -1);
    const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cz = p.reduce((s, q) => s + q[1], 0) / p.length;
    if (!inPoly(cx, cz, park.p) || !ok(cx, cz)) continue;
    const ang = Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]);
    const w = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]), d = Math.hypot(p[2][0] - p[1][0], p[2][1] - p[1][1]);
    const y = Math.min(...p.map(([x, z]) => gy(x, z)));
    const ry = -ang, c = Math.cos(ang), sn = Math.sin(ang);
    const at = (u, v) => [cx + u * c - v * sn, cz + u * sn + v * c];
    if (b.k === 'shelter') {
      B.add(slab, bx(w + 1, 0.25, d + 1, cx, y - 0.1, cz, ry));
      for (const u of [-w / 2 + 0.4, 0, w / 2 - 0.4]) for (const v of [-d / 2 + 0.4, d / 2 - 0.4]) { const [x, z] = at(u, v); B.add(timber, bx(0.3, 3, 0.3, x, y, z, ry)); }
      B.add(timber, bx(w + 0.4, 0.35, d + 0.4, cx, y + 3, cz, ry));
      B.add(roofM, place(hipRoofGeo(w + 1.2, d + 1.2, 2.2), cx, y + 3.35, cz, ry));
      for (const v of [-1.6, 1.6]) { const [x, z] = at(0, v); picnicTable(B, timber, iron, x, y, z, ry); }
    } else {
      B.add(brick, bx(w, 3.2, d, cx, y - 0.2, cz, ry));
      B.add(slab, bx(w + 0.3, 0.3, d + 0.3, cx, y + 3.0, cz, ry));
      B.add(roofM, place(hipRoofGeo(w + 1, d + 1, 1.8), cx, y + 3.3, cz, ry));
      for (const u of [-w / 4, w / 4]) { const [x, z] = at(u, d / 2 + 0.03); B.add(green, bx(1, 2.1, 0.06, x, y, z, ry)); }
    }
  }
  // ── the playground: rubber-mulch bed, a play structure with decks, slides and a climber, swings ──
  for (const a of PK.areas) {
    if (a.k !== 'playground') continue;
    const cx = a.p.reduce((s, q) => s + q[0], 0) / a.p.length, cz = a.p.reduce((s, q) => s + q[1], 0) / a.p.length;
    if (!inPoly(cx, cz, park.p) || !ok(cx, cz)) continue;
    const y = gy(cx, cz);
    const tris = THREE.ShapeUtils.triangulateShape(a.p.map(([x, z]) => new THREE.Vector2(x, z)), []);
    const pos = [];
    for (const t of tris) for (const k of t) pos.push(a.p[k][0], gy(a.p[k][0], a.p[k][1]) + 0.12, a.p[k][1]);
    faceUp(pos);
    B.add(mulch, new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)));
    // the structure: two decks at 1.2 m and 1.8 m on posts, roofs, a tube slide and a wave slide, a ladder
    for (const [dx, dz, h] of [[-2, 0, 1.2], [1.6, 0, 1.8]]) {
      for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.add(green, cy(0.06, 0.06, h + 1.6, cx + dx + ox * 1.1, y, cz + dz + oz * 1.1, 8));
      B.add(steel, bx(2.2, 0.08, 2.2, cx + dx, y + h, cz + dz));
      B.add(plastic.b, place(new THREE.ConeGeometry(1.7, 0.9, 4).rotateY(Math.PI / 4).translate(0, 0.45, 0), cx + dx, y + h + 1.6, cz + dz));
      for (const s of [-1, 1]) B.add(green, bx(2.2, 0.05, 0.05, cx + dx, y + h + 0.9, cz + dz + s * 1.1));
    }
    B.add(plastic.y, span(new THREE.Vector3(cx - 3.1, y + 1.2, cz), new THREE.Vector3(cx - 6.4, y + 0.3, cz), 0.7, 0.06));
    for (const s of [-1, 1]) B.add(plastic.y, span(new THREE.Vector3(cx - 3.1, y + 1.45, cz + s * 0.35), new THREE.Vector3(cx - 6.4, y + 0.55, cz + s * 0.35), 0.05, 0.25));
    const tube = [];
    for (let k = 0; k <= 12; k++) { const t = k / 12, an = t * Math.PI * 1.2; tube.push(new THREE.Vector3(cx + 2.7 + Math.sin(an) * 1.8, y + 1.8 - t * 1.4, cz + 1.1 + (1 - Math.cos(an)) * 1.8)); }
    B.add(plastic.r, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tube), 24, 0.45, 10, false));
    for (let k = 0; k < 6; k++) B.add(steel, bx(0.6, 0.04, 0.04, cx - 2, y + 0.2 * k, cz - 1.3));
    // a swing set: an A-frame beam with four seats on chains
    const sx = cx + 1, sz = cz - 5;
    for (const e of [-3, 3]) for (const s of [-1, 1]) B.add(green, span(new THREE.Vector3(sx + e, y + 2.6, sz), new THREE.Vector3(sx + e, y, sz + s * 1.2), 0.08, 0.08));
    B.add(green, bx(6.2, 0.1, 0.1, sx, y + 2.55, sz));
    for (const e of [-2.1, -0.7, 0.7, 2.1]) {
      for (const s of [-0.22, 0.22]) B.add(steel, bx(0.02, 2.0, 0.02, sx + e + s, y + 0.55, sz));
      B.add(plastic.k, bx(0.5, 0.05, 0.2, sx + e, y + 0.5, sz));
    }
  }
  // ── the things on the lawn and the walk ──
  for (const pt of PK.points) {
    const [x, z] = pt.p;
    if (!inPoly(x, z, park.p) || !ok(x, z)) continue;
    const y = gy(x, z), ry = (x * 7 + z * 13) % 6.28;
    if (pt.k === 'leisure=picnic_table') picnicTable(B, timber, iron, x, y, z, ry);
    else if (pt.k === 'amenity=bench') { B.add(timber, bx(1.8, 0.06, 0.45, x, y + 0.45, z, ry), bx(1.8, 0.4, 0.05, x, y + 0.55, z - 0.2, ry)); for (const s of [-0.8, 0.8]) B.add(iron, bx(0.06, 0.45, 0.45, x + s, y, z, ry)); }
    else if (pt.k === 'amenity=drinking_water') { B.add(steel, cy(0.16, 0.2, 0.95, x, y, z, 12), cy(0.26, 0.2, 0.12, x, y + 0.95, z, 12)); }
    else if (pt.k === 'leisure=fitness_station') { for (const s of [-1, 0, 1]) B.add(green, cy(0.06, 0.06, 2.2, x + s * 1.2, y, z, 8)); B.add(steel, bx(2.4, 0.05, 0.05, x, y + 2.1, z), bx(1.2, 0.05, 0.05, x - 0.6, y + 1.4, z)); }
    else if (pt.k === 'tourism=information') infoBoard(B, iron, pt.n, x, y, z, glow);
    else if (pt.k === 'tourism=artwork' && pt.n === 'Sail') {
      // a stainless sail on its mast, catching the light off the river
      const sail = new THREE.BufferGeometry();
      const v = [];
      for (let i = 0; i < 8; i++) {
        const a = i / 8, b = (i + 1) / 8, bulge = (t) => Math.sin(t * Math.PI) * 0.6 * (1 - t);
        const P = (t, h) => [x + bulge(h) + 0.1, y + 1 + h * 6, z + (1 - h) * 3.2 * t];
        for (const [p, q, r] of [[P(0, a), P(1, a), P(1, b)], [P(0, a), P(1, b), P(0, b)]]) v.push(...p, ...q, ...r, ...p, ...r, ...q);
      }
      sail.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); sail.computeVertexNormals();
      B.add(steel, sail, cy(0.08, 0.1, 7.4, x, y, z, 10), bx(1.2, 0.5, 1.2, x, y, z + 0.8));
    }
  }
}

/** A hipped roof w × d (x × z), ridge height h, eaves at y = 0. */
function hipRoofGeo(w, d, h) {
  const W = w / 2, D = d / 2, r = Math.max(0, W - D);
  const a = [-W, 0, -D], b = [W, 0, -D], c = [W, 0, D], e = [-W, 0, D], p = [-r, h, 0], q = [r, h, 0];
  const t = [...e, ...c, ...q, ...e, ...q, ...p, ...b, ...a, ...p, ...b, ...p, ...q, ...c, ...b, ...q, ...a, ...e, ...p];
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(t, 3));
  g.computeVertexNormals();
  return g;
}

/** A plank picnic table on a steel frame, seats both sides. */
function picnicTable(B, wood, iron, x, y, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const at = (u, v) => [x + u * c + v * s, z - u * s + v * c];
  B.add(wood, bx(1.9, 0.06, 0.8, x, y + 0.74, z, ry));
  for (const v of [-0.62, 0.62]) { const [px, pz] = at(0, v); B.add(wood, bx(1.9, 0.05, 0.28, px, y + 0.44, pz, ry)); }
  for (const u of [-0.7, 0.7]) { const [px, pz] = at(u, 0); B.add(iron, bx(0.05, 0.74, 1.5, px, y, pz, ry)); }
}

/** An interpretive sign: a dark framed panel on two posts, its title lettered on. */
function infoBoard(B, iron, name, x, y, z, glow) {
  const tex = canvasTex(256, 160, (c, w, h) => {
    c.fillStyle = '#1f3a4a'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8e2d0'; c.fillRect(10, 40, w - 20, h - 50);
    c.fillStyle = '#f4efe2'; c.font = '600 18px Georgia'; c.textAlign = 'center'; c.fillText(name || 'Riverfront Park', w / 2, 27);
    c.fillStyle = '#6a7a80';
    for (let i = 0; i < 7; i++) c.fillRect(20, 52 + i * 13, (w - 40) * (i % 3 === 2 ? 0.6 : 1), 4);
  });
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  // lectern style: the panel faces the walk (+X, inland) and leans back
  B.add(iron, cy(0.05, 0.05, 1.0, x, y, z - 0.6, 6), cy(0.05, 0.05, 1.0, x, y, z + 0.6, 6));
  B.add(iron, place(new THREE.BoxGeometry(0.08, 0.9, 1.5), x - 0.02, y + 1.15, z, 0, 1, 1, 1, 0, -0.5));
  B.add(m, place(new THREE.PlaneGeometry(1.4, 0.85).rotateY(Math.PI / 2), x + 0.03, y + 1.17, z, 0, 1, 1, 1, 0, -0.5));
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
  const paving = pbr('brushed_concrete', { scale: 3, tint: 0xeee6d8 });

  // ── Riverfront Park amphitheater: tensile canopy over the stage, lawn bowl ──
  const SC = new THREE.Vector3(-25, 0, 0); // stage centre (the mapped theatre is centred on the origin)
  {
    const conc = pbr('concrete_wall_008', { scale: 3, tint: 0xf0ebe0 });
    // (from Tyler's photographs) a circular brick-red stage plaza with
    // concentric bands, a long white arched membrane on stone-block pylons,
    // a round fountain in the plaza behind and a splash pad beside it
    const brick = lit(0x8a3d30, 0xffb46a, { night: 0.5, roughness: 0.9 });
    const brickL = pbr('red_bricks_02', { scale: 1.4, tint: 0xe8c0b0 });
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
    void stoneTex;
    const stone = pbr('sandstone_blocks_08', { scale: 1.2, tint: 0xf0e2c8, bright: 1.2 }); // split-face limestone
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
    // the parks keep their own buildings (pavilions, restrooms: parkDressing), not the town's houses
    const parks = (PARK?.parks || []).map((p) => p.p);
    const inPark = (x, z) => parks.some((p) => inPoly(x, z, p));
    const skipB = (x, z, b) => edge(x, z) < 70 || b.k === 'casino' || b.k === 'silo' || inPark(x, z) || keep.some(([a, bb, c, d]) => x > a && x < bb && z > c && z < d);
    const houseSpots = [];
    for (const m of townMeshes(D, gy, skipB, glow, rnd, houseSpots)) ext.add(m);
    const homes = housesAt(houseSpots, rnd);
    if (homes) ext.add(homes);
    for (const m of pavingMeshes(D, gy, skipAt, { sidewalks: true })) ext.add(m);

    const EB = new Batch();
    // Riverfront Park's fence, pavilions, restroom, playground and furniture (flat clutter: no shadow pass)
    if (PARK) {
      const PB = new Batch();
      parkDressing(PARK, PB, gy, (x, z) => skipAt(x, z) || Math.hypot(x - SC.x, z - SC.z) < 24, glow);
      for (const mesh of PB.build(ext, false)) mesh.userData.noShadow = true;
    }
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
      const dock = pbr('brushed_concrete', { scale: 2.5, tint: 0xe4dccb });
      const roofs = [pbr('corrugated_iron', { scale: 1.4, tint: 0x5a8ed8, metal: 0.4 }), pbr('corrugated_iron', { scale: 1.4, tint: 0x4a7cc8, metal: 0.4 })]; // the slips' blue metal roofs
      const post = pbr('metal_plate', { scale: 1, tint: 0xa0a4a8, metal: 0.4 });
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
      // the rock-pile dikes: the marina's breakwater from the end of the park
      // nearly to the bridge, and the wing dikes out in the channel, just awash
      const RB = new Batch();
      for (const p of D.breakwaters) {
        const cx = p[0][0], cz = p[0][1];
        if (Math.hypot(cx, cz) > 1300 || p.length < 2) continue;
        const marina = Math.abs(cx + 167) < 5 && Math.abs(cz - 219) < 5;
        riprap(RB, p, WY, rnd, marina ? { base: 13, crest: 1.8 } : { base: 8, crest: 0.4, boulders: false });
      }
      for (const mesh of RB.build(ext, false)) mesh.userData.noShadow = true;
    }
    // real cruisers and runabouts in the slips (js/scene/boats.js), bobbing
    // about a third of the slips taken (the roofs hide the rest from the course)
    for (let i = boats.length - 1; i >= 0; i--) if (rnd() > 0.34) boats.splice(i, 1);
    boatFleet(boats.length, rnd).then((f) => { if (f) { ext.add(f.group); live.boats = { boats, fleet: f }; } });

    // a towboat pushing hopper barges up the channel
    const towG = tow(glow);
    towG.position.set(-470, WY, 0);
    ext.add(towG);
    live.tow = towG;

    // parked cars (the casino's lots fullest) and the traffic on the bridge
    // real cars (js/scene/cars.js): the casino's lot fills first, then the nearest lots; traffic on the bridge
    carsAt(parkedCars(D, gy, skipAt, rnd, (x, z) => Math.hypot(x + 150, z + 470) < 260), rnd, { max: 80, near: [-150, -470] }).then((g) => ext.add(g));
    carsAt(carSpots, rnd, { max: 26 }).then((g) => ext.add(g));

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
      const { boats, fleet } = live.boats;
      for (let i = 0; i < boats.length; i++) {
        const [x, z, yaw, L] = boats[i], ph = i * 1.7;
        e.set(Math.sin(t * 0.8 + ph) * 0.025, yaw + Math.PI / 2, Math.sin(t * 1.1 + ph) * 0.02);
        fleet.place(i, x, WY + Math.sin(t * 0.9 + ph) * 0.07, z, e, L);
      }
      fleet.done(); // all placed: cull them per boat from here on
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
