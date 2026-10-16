// The Saint Louis Zoo in Forest Park, for the course through it: the zoo's
// buildings on their OpenStreetMap footprints (assets/landmarks/forestpark,
// the same map as the park round it), its animals in their exhibits, rocks and
// rail fences round the yards, and visitors on the walks, laid on the course's
// own ground (fit), in map axes (+x east, +z south) from 38.6385°N 90.2875°W.
// The Flight Cage, the World's Fair Pavilion and the lakes are drawn by
// js/course/lm/forestpark.js, which the course lays alongside this.
//   animals: scanned and sculpted models from Sketchfab (CC BY, credited in
//     docs/SOURCES.md), with their own photographed textures, in
//     assets/models/zoo_animals.glb
//   exhibits, roughly where the zoo keeps them: giraffes, zebras and lions in
//     Red Rocks; Asian elephants at River's Edge; polar bears by Peabody Hall;
//     flamingos wading in Wood Duck Pond; California sea lions and harbor
//     seals hauled out on the rocks of Sea Lion Sound (the zoo's penguins live
//     indoors, in Penguin & Puffin Coast, so none stand out here)
// Surfaces are photographed PBR sets (js/scene/pbr.js).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { pbr, painted } from '../../scene/pbr.js';
import { model } from '../../scene/models.js';
import { crowdAt } from '../../scene/crowd.js';
import { seeded, landmarkWater } from './kit.js';
import { place, bx, span, Batch } from './riverfront.js';

const BASE = new URL('../../../assets/landmarks/forestpark/', import.meta.url).href;
let DATA = null;
const ready = fetch(`${BASE}ground.json`).then((r) => (r.ok ? r.json() : null)).then((j) => (DATA = j)).catch(() => null);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// the zoo, in this frame
const inZoo = (x, z) => x > -800 && x < 225 && z > 110 && z < 650;
// the park landmark module draws these
const DRAWN = /World's Fair Pavilion/;

// exhibits: [animal, count, centre x, z, spread (m), fence radius (0 = none)]
const EXHIBITS = [
  ['giraffe', 3, 188, 492, 14, 26],
  ['zebra', 5, 205, 520, 12, 0],
  ['lion', 2, 214, 600, 6, 14],
  ['elephant', 3, -520, 420, 12, 24],
  ['polarbear', 2, -140, 350, 6, 13],
];

/** A weathered boulder: a sphere pushed out of round by smooth lumps, flattened to sit low. */
function boulder(r, rnd) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(r, 4).deleteAttribute('normal').deleteAttribute('uv'));
  const p = g.attributes.position, v = new THREE.Vector3();
  const f = [0, 1, 2, 3].map((i) => [1.3 + i * 1.6 + rnd() * 2, rnd() * 6, 3 + i * 2.5 + rnd() * 3, rnd() * 6]);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let k = 1;
    for (const [a, b, c, d] of f) k += 0.16 * Math.sin(v.x * a + b) * Math.cos(v.z * a - b) + 0.06 * Math.abs(Math.sin(v.y * c + d + v.x * c));
    // a few flat-cracked faces, as weathered sandstone breaks
    k = Math.min(k, 1.08 + 0.1 * Math.sin(v.x * 2.1 + f[0][1]));
    p.setXYZ(i, v.x * r * k, v.y * r * k * (v.y > 0 ? 0.62 : 0.3), v.z * r * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A tile roof for any footprint: the bevel of a thin extrusion slopes it in from the eaves. */
function tileRoof(shape, rise) {
  return new THREE.ExtrudeGeometry(shape, { depth: 0.01, bevelEnabled: true, bevelThickness: rise, bevelSize: rise * 1.6, bevelOffset: -rise * 1.6 + 0.5, bevelSegments: 1 });
}

export default function build() {
  const group = new THREE.Group();
  group.name = 'zoogrounds';
  const glow = [];
  const res = {
    group, glow, trees: [],
    fit(holder, T, opts = {}) {
      if (!opts.course) return;
      holder.updateMatrix();
      const L = holder.matrix.clone(), w = new THREE.Vector3();
      const toW = (x, z) => w.set(x, 0, z).applyMatrix4(L);
      const gy = (x, z) => { toW(x, z); return (T.baseGround(w.x, w.z) - holder.position.y) / holder.scale.y; };
      // the field of play itself: fairway, green and a little either side
      const onField = (x, z, pad = 0) => { toW(x, z); const pr = T.project(w.x, w.z); return Math.abs(pr.d) < Math.max(T.fwHalf || 0, 14) + 10 + pad && pr.s > -20 && pr.s < T.length + 30; };
      // hole terms (arc length s, lateral d) to this frame, for the exhibit and the gallery beside the hole
      const Li = L.clone().invert();
      const atHole = (s, d) => { const p = T.pointAt(s); w.set(p.x + p.rx * d, 0, p.z + p.rz * d).applyMatrix4(Li); return [w.x, w.z]; };
      const go = (D) => lay(D, gy, onField, { T, atHole });
      if (DATA) go(DATA); else ready.then((d) => d && go(d));
    },
  };

  function lay(D, gy, onField, H = null) {
    // the zoo's exhibits, and one more close beside this hole (clear of the map's buildings and ponds)
    const ex = [...EXHIBITS];
    if (H) {
      const { T, atHole } = H;
      const free = (x, z, R) => !(D.buildings || []).some((b) => b.p.some(([bx2, bz]) => Math.hypot(bx2 - x, bz - z) < R + 8))
        && !(D.lakes || []).some((l) => l.p.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < R + 6));
      // the hole's own exhibit, named for what it is: [kind, count, spread, fence radius], extras
      const name = T.hole?.name || '';
      const theme = /Primate/.test(name) ? { kinds: [['gorilla', 2, 6], ['orangutan', 2, 5]], R: 13, climb: true }
        : /Sea Lion/.test(name) ? { kinds: [['sealion', 4, 6], ['harborseal', 3, 5]], R: 13, pool: true }
        : /River/.test(name) ? { kinds: [['hippo', 3, 5], ['elephant', 2, 8]], R: 16, pool: true }
        : /Red Rocks/.test(name) ? { kinds: [['lion', 2, 5], ['giraffe', 2, 7]], R: 14 }
        : /Penguin/.test(name) ? { kinds: [['polarbear', 2, 5]], R: 11, pool: true }
        : { kinds: [[['giraffe', 'zebra', 'elephant', 'lion', 'polarbear'][Math.floor(T.length) % 5], 3, 7]], R: 13 };
      const off = Math.max(T.fwHalf || 0, 14) + 10 + theme.R;
      // toward the green, where the player looks: the nearest free spot either side
      outer: for (const f of [0.62, 0.78, 0.48, 0.9, 0.35]) {
        for (const side of [1, -1]) {
          const [x, z] = atHole(T.length * f, side * off);
          if (!inZoo(x, z) || !free(x, z, theme.R)) continue;
          theme.kinds.forEach(([k, n, sp], i) => ex.push([k, n, x, z, sp, i === 0 ? theme.R : 0, i === 0 ? theme : null]));
          break outer;
        }
      }
    }
    const rnd = seeded(1904);
    const m = {
      brick: pbr('red_bricks_02', { scale: 2.2 }),
      stucco: pbr('white_stucco', { scale: 3, tint: 0xf0e4cc }),
      stone: pbr('white_sandstone_bricks', { scale: 2.4, tint: 0xe8dcc4 }),
      trim: pbr('white_plaster_02', { scale: 2.5, tint: 0xf2ece0 }),
      tile: pbr('clay_roof_tiles_02', { scale: 2.4 }),
      flat: pbr('concrete_wall_008', { scale: 4, tint: 0xa8a49c }),
      rock: pbr('rock_face_03', { scale: 1.6, tint: 0xb48a72 }), // the red rock of Red Rocks
      grey: pbr('rock_face_03', { scale: 1.6 }),
      rail: pbr('wood_planks_grey', { scale: 1.5, tint: 0x9a8a74 }),
      canvas: pbr('rough_linen', { scale: 1.2, tint: 0x2f6b4f, side: THREE.DoubleSide }), // the zoo's green awnings
      iron: pbr('painted_steel', { scale: 1, tint: 0x2c3431, metal: 0.5 }),
    };
    const glass = painted(0x1c2428, { roughness: 0.08, metalness: 0.6, envMapIntensity: 1.2 });
    const inside = (p, x, z) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
    const B = new Batch();

    // ── the zoo's buildings, on their footprints ──
    for (const b of D.buildings) {
      let p = b.p;
      if (p.length > 2 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p = p.slice(0, -1);
      if (p.length < 3) continue;
      const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cz = p.reduce((s, q) => s + q[1], 0) / p.length;
      if (!inZoo(cx, cz) || DRAWN.test(b.n || '')) continue;
      if (p.some(([x, z]) => onField(x, z, -6))) continue;
      const area = Math.abs(p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;
      if (area < 12) continue;
      const big = area > 1400;
      const h = Math.min(b.h || 0, 12) || (big ? 9 : area > 300 ? 6.5 : 4.2);
      const y = Math.min(...p.map(([x, z]) => gy(x, z))) - 0.4;
      const shape = new THREE.Shape(p.map(([x, z]) => new THREE.Vector2(x, -z)));
      const up = (g) => g.rotateX(-Math.PI / 2);
      // the old zoo is brick and stone under red tile; the kiosks are stucco
      const wall = /Primate House|Herpetarium|Antelope|Peabody/.test(b.n || '') ? m.stone : area < 120 ? m.stucco : (cx * 7 + cz) % 3 < 1.2 ? m.stucco : m.brick;
      B.add(wall, up(new THREE.ExtrudeGeometry(shape, { depth: h + 0.4, bevelEnabled: false })).translate(0, y, 0));
      // tall windows in stone surrounds along every wall long enough, a band per storey, and a plinth
      const storeys = Math.max(1, Math.floor(h / 4));
      // the kiosks and stands: a serving counter under a canvas awning on the longest wall, a door on the next
      if (area < 120) {
        let li = 0, lmax = 0;
        for (let i = 0; i < p.length; i++) { const a = p[i], c = p[(i + 1) % p.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L > lmax) { lmax = L; li = i; } }
        for (const [k, kind] of [[li, 'counter'], [(li + 1) % p.length, 'door']]) {
          const a = p[k], c = p[(k + 1) % p.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
          if (L < 1.6) continue;
          const ux = (c[0] - a[0]) / L, uz = (c[1] - a[1]) / L;
          let nx = uz, nz = -ux;
          if (inside(p, (a[0] + c[0]) / 2 + nx * 0.6, (a[1] + c[1]) / 2 + nz * 0.6)) { nx = -nx; nz = -nz; }
          const ry = Math.atan2(nx, nz), mx = (a[0] + c[0]) / 2 + nx * 0.06, mz = (a[1] + c[1]) / 2 + nz * 0.06;
          if (kind === 'door') { B.add(m.rail, bx(Math.min(1.0, L * 0.4), 2.1, 0.12, mx, y + 0.4, mz, ry)); continue; }
          const w = Math.min(L - 0.8, 4.2);
          B.add(m.rail, bx(w + 0.2, 0.12, 0.55, mx + nx * 0.22, y + 1.4, mz + nz * 0.22, ry)); // the counter
          B.add(glass, bx(w, 1.15, 0.1, mx, y + 1.55, mz, ry));
          // the awning: sloped canvas on its two iron brackets
          const wy = y + Math.min(h, 3.1) + 0.1, d = 1.3;
          B.add(m.canvas, span(V(mx - ux * (w / 2 + 0.2), wy, mz - uz * (w / 2 + 0.2)), V(mx + ux * (w / 2 + 0.2), wy, mz + uz * (w / 2 + 0.2)), d, 0.04, 0).translate(0, 0, 0).applyMatrix4(new THREE.Matrix4().makeTranslation(-mx, -wy, -mz)).applyMatrix4(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(ux, 0, uz), -0.38)).applyMatrix4(new THREE.Matrix4().makeTranslation(mx + nx * d * 0.46, wy - 0.24, mz + nz * d * 0.46)));
          for (const sgn of [-1, 1]) B.add(m.iron, span(V(mx + ux * sgn * w / 2, wy - 0.7, mz + uz * sgn * w / 2), V(mx + ux * sgn * w / 2 + nx * 1.1, wy - 0.45, mz + uz * sgn * w / 2 + nz * 1.1), 0.04, 0.04));
        }
      }
      for (let i = 0; i < p.length; i++) {
        const a = p[i], c = p[(i + 1) % p.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
        const ux = (c[0] - a[0]) / L, uz = (c[1] - a[1]) / L;
        let nx = uz, nz = -ux;
        if (inside(p, (a[0] + c[0]) / 2 + nx * 0.6, (a[1] + c[1]) / 2 + nz * 0.6)) { nx = -nx; nz = -nz; }
        const ry = Math.atan2(nx, nz);
        B.add(m.trim, span(V(a[0] + nx * 0.06, y + 0.9, a[1] + nz * 0.06), V(c[0] + nx * 0.06, y + 0.9, c[1] + nz * 0.06), 0.25, 0.5));
        if (L < 5) continue;
        const n = Math.floor((L - 2) / 3.6), off = (L - (n - 1) * 3.6) / 2;
        for (let k = 0; k < n; k++) {
          const t = off + k * 3.6, x = a[0] + ux * t + nx * 0.05, z = a[1] + uz * t + nz * 0.05;
          for (let st = 0; st < storeys; st++) {
            const wy = y + 1.5 + st * 4, wh = Math.min(2.4, h - 1.6 - st * 4);
            if (wh < 1.2) continue;
            B.add(m.trim, bx(1.7, wh + 0.5, 0.16, x, wy - 0.25, z, ry));
            B.add(glass, bx(1.25, wh, 0.2, x + nx * 0.02, wy, z + nz * 0.02, ry));
            // a round head over the window, in the 1920s zoo style
            if (wall === m.stone || wall === m.brick) B.add(m.trim, place(new THREE.CylinderGeometry(0.85, 0.85, 0.16, 16, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), x, wy + wh, z, ry));
          }
        }
      }
      if (big) {
        // a flat roof behind a stone parapet
        B.add(m.flat, up(new THREE.ShapeGeometry(shape)).translate(0, y + h + 0.3, 0));
        for (let i = 0; i < p.length; i++) {
          const a = p[i], c = p[(i + 1) % p.length];
          B.add(m.trim, span(V(a[0], y + h + 0.4, a[1]), V(c[0], y + h + 0.4, c[1]), 0.45, 0.9));
        }
      } else {
        const rise = Math.min(3.2, Math.sqrt(area) * 0.16);
        B.add(m.tile, up(tileRoof(shape, rise)).translate(0, y + h + 0.4, 0));
        for (let i = 0; i < p.length; i++) {
          const a = p[i], c = p[(i + 1) % p.length];
          B.add(m.trim, span(V(a[0], y + h + 0.1, a[1]), V(c[0], y + h + 0.1, c[1]), 0.3, 0.5));
        }
      }
    }

    // ── the exhibits: rocks and a post-and-rail fence round each yard ──
    const rocks = [], greyRocks = [], rails = [], scans = [];
    for (const [kind, , x0, z0, spread, R] of ex) {
      const red = kind !== 'polarbear' && kind !== 'penguin';
      const n = kind === 'penguin' ? 7 : 6;
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, d = spread * 0.6 + rnd() * (R ? R - spread * 0.6 - 2 : spread);
        const x = x0 + Math.cos(a) * d, z = z0 + Math.sin(a) * d, r = (kind === 'penguin' ? 0.9 : 1.6) + rnd() * 1.6;
        if (onField(x, z)) continue;
        scans.push({ x, z, r, red, yaw: rnd() * 6, v: rnd() < 0.5 ? 0 : 1 });
      }
      if (!R) continue;
      const seg = Math.max(12, Math.round((R * Math.PI * 2) / 3));
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2, b2 = ((i + 1) / seg) * Math.PI * 2;
        const x = x0 + Math.cos(a) * R, z = z0 + Math.sin(a) * R, x2 = x0 + Math.cos(b2) * R, z2 = z0 + Math.sin(b2) * R;
        if (onField(x, z)) continue;
        const y = gy(x, z), y2 = gy(x2, z2);
        rails.push(bx(0.14, 1.3, 0.14, x, y - 0.1, z));
        for (const hh of [0.55, 1.1]) rails.push(span(V(x, y + hh, z), V(x2, y2 + hh, z2), 0.08, 0.12));
      }
    }
    // scanned boulders (assets/models/zoo_rocks.glb), instanced per scan; carved ones if it isn't loaded
    const rockSet = model('zooRocks');
    const scanMeshes = [];
    rockSet?.traverse((o) => { if (o.isMesh) scanMeshes.push(o); });
    if (scanMeshes.length) {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      for (const red of [true, false]) scanMeshes.forEach((src, v) => {
        const list = scans.filter((s) => s.red === red && s.v % scanMeshes.length === v);
        if (!list.length) return;
        let mat = src.material;
        mat.roughness = 0.95; mat.metalness = 0; // dry stone
        if (!red) { mat = mat.clone(); mat.color = new THREE.Color(0x9aa1a6); } // the grey granite of the cold-water yards
        const im = new THREE.InstancedMesh(src.geometry, mat, list.length);
        list.forEach((s, i) => {
          const k = s.r * 2.2;
          q.setFromAxisAngle(up, s.yaw);
          m4.compose(new THREE.Vector3(s.x, gy(s.x, s.z) - k * 0.12, s.z), q, new THREE.Vector3(k, k * (0.8 + (i % 3) * 0.15), k));
          im.setMatrixAt(i, m4);
        });
        im.receiveShadow = true;
        group.add(im);
      });
    } else for (const s of scans) (s.red ? rocks : greyRocks).push(boulder(s.r, rnd).rotateY(s.yaw).translate(s.x, gy(s.x, s.z) + s.r * 0.2, s.z));
    if (rocks.length) B.add(m.rock, ...rocks);
    if (greyRocks.length) B.add(m.grey, ...greyRocks);
    if (rails.length) B.add(m.rail, ...rails);
    const g = new THREE.Group();
    B.build(g);
    g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    group.add(g);

    // ── the animals ──
    const set = model('zooAnimals');
    const B2 = new Batch();
    if (set) {
      const proto = {};
      set.traverse((o) => {
        if (o.isMesh) for (const mm of Array.isArray(o.material) ? o.material : [o.material]) {
          // bodies are opaque; only the hair cards (the zebra's mane) need their alpha
          const hair = /Hair/i.test(mm.name);
          mm.transparent = false;
          mm.depthWrite = true;
          mm.alphaTest = hair ? 0.5 : 0;
          if (!hair) mm.alphaMap = null;
          mm.side = hair ? THREE.DoubleSide : THREE.FrontSide;
        }
      });
      for (const c of set.children) proto[c.name] = c;
      // the primates, hippos (zoo_more) and the sea lions and seals (zoo_marine)
      for (const extra of [model('zooMore'), model('zooMarine')]) for (const c of extra?.children || []) proto[c.name] = c;
      const place1 = (kind, x, z, yaw, s = 1, dy = 0) => {
        const p = proto[kind];
        if (!p) return;
        const a = p.clone(true);
        a.position.set(x, gy(x, z) + dy, z);
        a.rotation.y = yaw;
        a.scale.setScalar(s);
        a.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        group.add(a);
      };
      const water = landmarkWater();
      const bark = pbr('bark_brown_02', { scale: 1.2, tint: 0x9a7a5c });
      for (const [kind, n, x0, z0, spread, , extra] of ex) {
        const y0 = gy(x0, z0);
        if (extra?.pool) {
          // a pool in the middle of the yard: the swimmers in it, the rest round its rim
          const pr = Math.max(4, spread);
          const pool = new THREE.Mesh(new THREE.CircleGeometry(pr, 40).rotateX(-Math.PI / 2), water);
          pool.position.set(x0, y0 + 0.12, z0);
          group.add(pool);
          extra.poolR = pr;
        }
        if (extra?.climb) {
          // a climbing frame of logs and ropes for the apes
          const parts = [];
          for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; parts.push(new THREE.CylinderGeometry(0.18, 0.24, 6, 8).translate(x0 + Math.cos(a) * 3, y0 + 3, z0 + Math.sin(a) * 3)); }
          for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4, b = ((k + 1) / 4) * Math.PI * 2 + 0.4; parts.push(span(V(x0 + Math.cos(a) * 3, y0 + 5.2, z0 + Math.sin(a) * 3), V(x0 + Math.cos(b) * 3, y0 + 4.6, z0 + Math.sin(b) * 3), 0.2, 0.2)); }
          parts.push(new THREE.BoxGeometry(4, 0.25, 4).translate(x0, y0 + 3.2, z0));
          B2.add(bark, ...parts);
        }
        const swimmer = kind === 'hippo' || kind === 'harborseal';
        for (let i = 0; i < n; i++) {
          const a = rnd() * Math.PI * 2;
          const pr = ex.find((e) => e[2] === x0 && e[3] === z0 && e[6]?.poolR)?.[6]?.poolR;
          const d = pr ? (swimmer ? rnd() * pr * 0.6 : pr + 1.2 + rnd() * 3) : rnd() * spread;
          const x = x0 + Math.cos(a) * d, z = z0 + Math.sin(a) * d;
          if (onField(x, z)) continue;
          // a hippo half under the water; the others on the bank, facing the walk
          place1(kind, x, z, rnd() * Math.PI * 2, 0.85 + rnd() * 0.25, pr && swimmer ? -0.7 : 0);
        }
      }
      // sea lions and harbor seals hauled out on rocks along Sea Lion Sound's shore
      const sound = (D.lakes || []).find((l) => l.n === 'Sea Lion Sound');
      const marine = model('zooMarine');
      if (sound && marine) {
        const mp = {}; for (const c of marine.children) mp[c.name] = c;
        const q = sound.p, n = q.length, lvl = Math.min(...q.map(([x, z]) => gy(x, z)));
        const cx = q.reduce((s2, r) => s2 + r[0], 0) / n, cz = q.reduce((s2, r) => s2 + r[1], 0) / n;
        const scan = scanMeshes[1] || scanMeshes[0];
        const wet = scan && scan.material.clone(); if (wet) { wet.color = new THREE.Color(0x8a8f92); wet.roughness = 0.55; } // wet granite at the waterline
        for (let i = 0; i < 9; i++) {
          const e = q[Math.floor((i + 0.3) * n / 9)], x = e[0] + (cx - e[0]) * 0.06, z = e[1] + (cz - e[1]) * 0.06;
          if (onField(x, z, -16)) continue; // in the hazard is fine, on the fairway is not
          const kind = i % 3 === 1 ? 'harborseal' : 'sealion';
          const a = mp[kind]?.clone(true); if (!a) continue;
          // a flat haul-out rock just at the waterline
          const base = Math.max(gy(x, z), lvl) - 0.3;
          let top = base + 0.5;
          if (scan) {
            scan.geometry.boundingBox || scan.geometry.computeBoundingBox();
            const rk = new THREE.Mesh(scan.geometry, wet), k = 2.6 + rnd() * 1.2;
            top = base + k * 0.55 * scan.geometry.boundingBox.max.y * 0.82;
            rk.position.set(x, base, z); rk.rotation.y = rnd() * 6.3; rk.scale.set(k, k * 0.55, k);
            rk.receiveShadow = true; group.add(rk);
          } else B2.add(m.grey, boulder(1.3 + rnd() * 0.6, rnd).scale(1.2, 0.55, 1.2).translate(x, lvl - 0.25, z));
          a.position.set(x, top, z);
          a.rotation.y = Math.atan2(cx - x, cz - z) + (rnd() - 0.5) * 1.4;
          a.scale.setScalar(0.85 + rnd() * 0.3);
          a.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
          group.add(a);
        }
        if (B2.m.size) { const g2 = new THREE.Group(); B2.build(g2); group.add(g2); }
      }
      // flamingos wading at the edge of Wood Duck Pond, their feet in the water
      const pond = (D.lakes || []).find((l) => l.n === 'Wood Duck Pond');
      if (pond) {
        let p = pond.p;
        if (p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p = p.slice(0, -1);
        // the pond's surface, just over the mown ground the LiDAR gives inside it
        let top = -Infinity;
        for (const [x, z] of p) top = Math.max(top, gy(x * 0.6 + p[0][0] * 0.4, z * 0.6 + p[0][1] * 0.4));
        const shore = top + 0.1;
        const tris = THREE.ShapeUtils.triangulateShape(p.map(([x, z]) => new THREE.Vector2(x, z)), []);
        const pos = [];
        for (const [i0, i1, i2] of tris) {
          const ny = (p[i1][1] - p[i0][1]) * (p[i2][0] - p[i0][0]) - (p[i1][0] - p[i0][0]) * (p[i2][1] - p[i0][1]);
          for (const k of ny >= 0 ? [i0, i1, i2] : [i0, i2, i1]) pos.push(p[k][0], shore, p[k][1]);
        }
        const wg = new THREE.BufferGeometry();
        wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        wg.computeVertexNormals();
        const wm = new THREE.Mesh(wg, landmarkWater());
        wm.receiveShadow = true;
        group.add(wm);
        const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cz = p.reduce((s, q) => s + q[1], 0) / p.length;
        for (let i = 0; i < 9; i++) {
          const q = p[Math.floor(rnd() * p.length)], k = 0.78 + rnd() * 0.12;
          const x = cx + (q[0] - cx) * k, z = cz + (q[1] - cz) * k;
          if (onField(x, z)) continue;
          const a = proto.flamingo?.clone(true);
          if (!a) break;
          a.position.set(x, shore - 0.3, z);
          a.rotation.y = rnd() * Math.PI * 2;
          a.scale.setScalar(0.9 + rnd() * 0.2);
          a.traverse((o) => { if (o.isMesh) o.castShadow = true; });
          group.add(a);
        }
      }
    }

    if (B2.m.size) { const g3 = new THREE.Group(); B2.build(g3); group.add(g3); } // the climbing frame

    // ── visitors along the zoo's walks ──
    const spots = [];
    for (const r of D.roads || []) {
      if (!r.p || r.n && /Drive|Avenue/.test(r.n)) continue;
      for (let i = 0; i + 1 < r.p.length && spots.length < 420; i++) {
        const [ax, az] = r.p[i], [cx, cz] = r.p[i + 1];
        if (!inZoo(ax, az) || rnd() > 0.8) continue;
        const t = rnd(), x = ax + (cx - ax) * t + (rnd() - 0.5) * 2, z = az + (cz - az) * t + (rnd() - 0.5) * 2;
        if (onField(x, z, 4)) continue;
        spots.push([x, gy(x, z), z, Math.atan2(cx - ax, cz - az) + (rnd() < 0.5 ? 0 : Math.PI)]);
      }
    }
    // and at the rails of the yards, looking in
    for (const [, , x0, z0, , R] of ex) {
      if (!R) continue;
      for (let i = 0; i < 6; i++) {
        const a = rnd() * Math.PI * 2, x = x0 + Math.cos(a) * (R + 1.2), z = z0 + Math.sin(a) * (R + 1.2);
        if (onField(x, z, 4)) continue;
        spots.push([x, gy(x, z), z, Math.atan2(x0 - x, z0 - z)]);
      }
    }
    // and a gallery along this hole, off the edge of play, turned to watch
    if (H) {
      const { T, atHole } = H, edge = Math.max(T.fwHalf || 0, 14);
      for (let i = 0; i < 44; i++) {
        const sAt = T.length * (0.15 + 0.85 * rnd()), d = (rnd() < 0.5 ? -1 : 1) * (edge + 12 + rnd() * 6);
        const [x, z] = atHole(sAt, d), [tx, tz] = atHole(sAt, 0);
        if (!inZoo(x, z)) continue;
        spots.push([x, gy(x, z), z, Math.atan2(tx - x, tz - z) + (rnd() - 0.5) * 0.8]);
      }
    }
    const crowd = crowdAt(spots, rnd);
    if (crowd) group.add(crowd);
  }
  return res;
}
