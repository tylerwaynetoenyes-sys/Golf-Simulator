// The Seine at the Champ de Mars, laid on the Paris course's own ground (fit),
// in its DEM axes (+x east, +z south, origin 48.8556°N 2.2986°E). The river
// outline, the bridges' footprints and the Île aux Cygnes are OpenStreetMap
// (assets/landmarks/paris/seine.json); the course carves the bed (riverbed)
// so the water meets the quays. From published descriptions:
//   the quays: cut-limestone walls from the water to the street, a stone
//     parapet along the top and a row of plane trees behind it
//   Pont d'Iéna (1814): five elliptical stone arches, imperial eagles over
//     the piers, and four equestrian warriors on pedestals at its ends
//   Pont de Bir-Hakeim (1905): two levels, a road on steel arches below and
//     Métro line 6 above on a colonnade of cast-iron columns, crossing the
//     upstream tip of the Île aux Cygnes on a stone arch
//   Passerelle Debilly (1900): a footbridge on a shallow steel arch, painted
//     dark green
//   Pont Alexandre III (1900): one low steel arch, with four tall stone pylons
//     crowned by gilded Fames
//   the Île aux Cygnes: a narrow embankment island with an avenue of trees,
//     and at its downstream tip the 11.5 m Statue of Liberty replica (1889)
//     facing west toward New York
//   bateaux-mouches: long, low sightseeing boats with glass cabins
import * as THREE from 'three';
import { mat, lit, canvasTex, tree, SLOT } from './kit.js';
import { pbr, painted } from '../../scene/pbr.js';
import { place, bx, cy, span, Batch } from './riverfront.js';
import { crowdAt } from '../../scene/crowd.js';
import { model } from '../../scene/models.js';

const BASE = new URL('../../../assets/landmarks/paris/', import.meta.url).href;
let DATA = null;
const ready = fetch(`${BASE}seine.json`).then((r) => (r.ok ? r.json() : null)).then((j) => (DATA = j)).catch(() => null);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const LIBERTY = [-1387, 620]; // 48.85003°N 2.27966°E

function resample(p, step) {
  const out = [];
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i], [bx2, bz] = p[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx2 - ax, bz - az) / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx2 - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return out;
}
const area = (p) => { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return a / 2; };
function inside(p, x, z) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/** A bridge's side elevation with arch openings, extruded across its width. */
function archedSpan(L, top, spring, arches, W, rise) {
  const s = new THREE.Shape();
  s.moveTo(-L / 2, spring - 3); s.lineTo(L / 2, spring - 3); s.lineTo(L / 2, top); s.lineTo(-L / 2, top); s.closePath();
  const pier = (L - 0) / arches;
  for (let k = 0; k < arches; k++) {
    const c = -L / 2 + pier * (k + 0.5), half = pier * 0.42;
    const h = new THREE.Path();
    h.moveTo(c - half, spring - 3);
    h.lineTo(c - half, spring);
    h.absellipse(c, spring, half, rise, Math.PI, 0, true);
    h.lineTo(c + half, spring - 3);
    h.closePath();
    s.holes.push(h);
  }
  return new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: false, curveSegments: 18 }).translate(0, 0, -W / 2);
}


// The statue alone, cut from the harbor model (one mesh: island, fort, pedestal and
// statue): the triangles above the top of the pedestal, scaled to the replica's
// 11.5 m. Cut once and kept.
const LADY_TURN = Math.PI * 0.5; // her face to the west, down the river toward New York
let _lady = null;
function libertyFigure(M) {
  if (!M) return null;
  if (!_lady) {
    M.updateMatrixWorld(true);
    let mesh = null; M.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh) return null;
    const g = mesh.geometry, pos = g.attributes.position, uv = g.attributes.uv, idx = g.index;
    const mw = mesh.matrixWorld, v = new THREE.Vector3();
    const world = new Float32Array(pos.count * 3);
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(mw); world.set([v.x, v.y, v.z], i * 3); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); }
    const cut = minY + (maxY - minY) * 0.505; // the statue stands on the upper half (46 of 93 m)
    const P = [], U = [];
    const n = idx ? idx.count : pos.count;
    let cx = 0, cz = 0, c = 0;
    for (let t = 0; t < n; t += 3) {
      const ids = [0, 1, 2].map((k) => (idx ? idx.getX(t + k) : t + k));
      if (ids.some((i) => world[i * 3 + 1] < cut)) continue;
      for (const i of ids) { P.push(world[i * 3], world[i * 3 + 1] - cut, world[i * 3 + 2]); if (uv) U.push(uv.getX(i), uv.getY(i)); cx += world[i * 3]; cz += world[i * 3 + 2]; c++; }
    }
    cx /= c; cz /= c;
    for (let i = 0; i < P.length; i += 3) { P[i] -= cx; P[i + 2] -= cz; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    if (U.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    geo.computeVertexNormals();
    const k = 11.5 / (maxY - cut);
    geo.scale(k, k, k);
    _lady = new THREE.Mesh(geo, mesh.material);
    _lady.castShadow = true;
  }
  return _lady.clone();
}

export function seine() {
  const group = new THREE.Group();
  const glow = [];
  const trees = [];
  const live = { boats: [], trains: [] };
  const update = (t) => {
    for (const b of live.boats) {
      const u = b.userData, P = u.path, L = u.len;
      let d = (u.d0 + t * u.v) % (2 * L); if (d < 0) d += 2 * L;
      const fwd = d < L, s = fwd ? d : 2 * L - d;
      let i = 0; while (i < P.length - 2 && u.cum[i + 1] < s) i++;
      const k = (s - u.cum[i]) / (u.cum[i + 1] - u.cum[i] || 1);
      const x = P[i][0] + (P[i + 1][0] - P[i][0]) * k, z = P[i][1] + (P[i + 1][1] - P[i][1]) * k;
      b.position.set(x + u.side * -Math.sin(u.ang[i]), u.y + Math.sin(t * 0.9 + u.d0) * 0.05, z + u.side * Math.cos(u.ang[i]));
      b.rotation.y = -u.ang[i] + (fwd ? 0 : Math.PI);
    }
    for (const tr of live.trains) {
      const u = tr.userData, s = ((t * 14 + u.ph) % (u.L * 3)) - u.L * 1;
      tr.visible = s > -u.L * 0.55 && s < u.L * 0.55;
      tr.position.set(u.c[0] + u.ux * s, u.y, u.c[1] + u.uz * s);
    }
  };
  const res = {
    group, glow, update, trees,
    fit(holder, T, opts = {}) {
      if (!opts.course) return;
      holder.updateMatrix();
      const Lm = holder.matrix.clone(), w = new THREE.Vector3();
      const toW = (x, z) => w.set(x, 0, z).applyMatrix4(Lm);
      const gy = (x, z) => { toW(x, z); return (T.drawnHeight(w.x, w.z) - holder.position.y) / holder.scale.y; };
      const onField = (x, z, pad = 0) => { toW(x, z); const pr = T.project(w.x, w.z); return Math.abs(pr.d) < Math.max(T.fwHalf || 0, 14) + 10 + pad && pr.s > -20 && pr.s < T.length + 30; };
      const near = (x, z, R) => { toW(x, z); const pr = T.project(w.x, w.z); return Math.abs(pr.d) < R && pr.s > -R && pr.s < T.length + R; };
      const wl = T.seaLevel != null ? (T.seaLevel - holder.position.y) / holder.scale.y : null;
      const Li = Lm.clone().invert();
      const atHole = (sv, d) => { const p = T.pointAt(sv); w.set(p.x + p.rx * d, 0, p.z + p.rz * d).applyMatrix4(Li); return [w.x, w.z]; };
      const go = (D) => wl != null && lay(D, { gy, onField, near, wl, T, atHole });
      if (DATA) go(DATA); else ready.then((d) => d && go(d));
    },
  };

  function lay(D, { gy, onField, near, wl, T, atHole }) {
    let s = 17;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const stone = pbr('white_sandstone_bricks', { scale: 2.4, tint: 0xe6dccb, glow: 0xffe2b8, night: 0.25 });
    const coping = pbr('white_plaster_02', { scale: 2, tint: 0xddd5c6 });
    const steel = pbr('painted_steel', { scale: 2, tint: 0x4d5a52, metal: 0.4, rough: 0.55 });
    const metroSteel = pbr('painted_steel', { scale: 2, tint: 0x5f6b62, metal: 0.4, rough: 0.55 });
    const asphalt = pbr('asphalt_02', { scale: 5, tint: 0x9a9a9a, offset: -2 });
    const gold = painted(0xd8b04a, { metalness: 0.9, roughness: 0.3 });
    const bronze = painted(0x3d4536, { metalness: 0.8, roughness: 0.45 });
    glow.push(stone);
    const spots = [];

    // ── the quays: a limestone wall from the water up to the street, a parapet, plane trees ──
    const ring = D.water[0];
    const out = area(ring) > 0 ? -1 : 1; // which side of each edge is the bank
    const Q = new Batch();
    const pts = resample([...ring, ring[0]], 7);
    let run = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!L) continue;
      const nx = (-(b[1] - a[1]) / L) * out, nz = ((b[0] - a[0]) / L) * out; // toward the bank
      if (!near(a[0], a[1], 1600)) { run += L; continue; }
      const ta = Math.max(gy(a[0] + nx * 4, a[1] + nz * 4), wl + 1.4), tb = Math.max(gy(b[0] + nx * 4, b[1] + nz * 4), wl + 1.4);
      const bot = wl - 1.5;
      Q.add(stone, span(V(a[0] + nx * 0.6, ta, a[1] + nz * 0.6), V(b[0] + nx * 0.6, tb, b[1] + nz * 0.6), 1.2, Math.max(ta, tb) - bot));
      Q.add(coping, span(V(a[0] + nx * 0.6, ta + 1.0, a[1] + nz * 0.6), V(b[0] + nx * 0.6, tb + 1.0, b[1] + nz * 0.6), 0.6, 1.0));
      Q.add(coping, span(V(a[0] + nx * 0.6, ta + 1.08, a[1] + nz * 0.6), V(b[0] + nx * 0.6, tb + 1.08, b[1] + nz * 0.6), 0.75, 0.1));
      run += L;
      if (run % 9 < L && near(a[0], a[1], 450)) {
        const x = a[0] + nx * 6.5, z = a[1] + nz * 6.5;
        if (!onField(x, z, 8)) trees.push(tree(x, gy(x, z), z, 15 + rnd() * 5, 4.5 + rnd(), { slot: SLOT.sycamore }));
      }
      if (rnd() < 0.09 && near(a[0], a[1], 350)) { const x = a[0] + nx * (2.5 + rnd() * 4), z = a[1] + nz * (2.5 + rnd() * 4); if (!onField(x, z)) spots.push([x, gy(x, z) + 0.05, z, rnd() < 0.4 ? Math.atan2(-nx, -nz) : Math.atan2(b[0] - a[0], b[1] - a[1]) + (rnd() < 0.5 ? 0 : Math.PI)]); }
    }
    Q.build(group);

    // ── the Île aux Cygnes: a stone-walled embankment with its avenue of trees ──
    const isl = D.island;
    if (isl) {
      const top = wl + 3;
      const I = new Batch();
      const ip = resample([...isl, isl[0]], 7);
      for (let i = 0; i < ip.length; i++) {
        const a = ip[i], b = ip[(i + 1) % ip.length];
        I.add(stone, span(V(a[0], top, a[1]), V(b[0], top, b[1]), 1.2, top - wl + 1.5));
      }
      I.build(group);
      const tris = THREE.ShapeUtils.triangulateShape(isl.map(([x, z]) => new THREE.Vector2(x, z)), []);
      const pos = [], uv = [];
      for (const [i0, i1, i2] of tris) {
        const ny = (isl[i1][1] - isl[i0][1]) * (isl[i2][0] - isl[i0][0]) - (isl[i1][0] - isl[i0][0]) * (isl[i2][1] - isl[i0][1]);
        for (const k of ny >= 0 ? [i0, i1, i2] : [i0, i2, i1]) { pos.push(isl[k][0], top, isl[k][1]); uv.push(isl[k][0] / 6, isl[k][1] / 6); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      const walk = new THREE.Mesh(g, pbr('gravel_stones', { scale: 3, tint: 0xd8cdb8, offset: -1 }));
      walk.receiveShadow = true; group.add(walk);
      // the Allée des Cygnes: two rows of trees down its spine
      const [w0, e0] = [isl.reduce((m, q) => (q[0] < m[0] ? q : m)), isl.reduce((m, q) => (q[0] > m[0] ? q : m))];
      const ux = e0[0] - w0[0], uz = e0[1] - w0[1], L = Math.hypot(ux, uz);
      for (let d = 30; d < L - 30; d += 10) for (const side of [-1, 1]) {
        const x = w0[0] + (ux * d) / L + (-uz / L) * side * 4.5, z = w0[1] + (uz * d) / L + (ux / L) * side * 4.5;
        if (inside(isl, x, z)) trees.push(tree(x, top, z, 14 + rnd() * 4, 4, { slot: SLOT.sycamore }));
      }
      // the Statue of Liberty replica at the downstream tip, facing west toward New York
      const M = model('statue');
      const ped = new Batch();
      ped.add(stone, bx(5, 9, 5, 0, 0, 0), bx(6, 1, 6, 0, 0, 0), bx(4.4, 1.2, 4.4, 0, 9, 0));
      const pg = new THREE.Group(); ped.build(pg);
      pg.position.set(LIBERTY[0], top, LIBERTY[1]);
      group.add(pg);
      const lady = libertyFigure(M);
      if (lady) {
        lady.position.set(LIBERTY[0], top + 10.2, LIBERTY[1]);
        lady.rotation.y = LADY_TURN;
        group.add(lady);
      } else {
        const fig = new Batch();
        fig.add(bronze, cy(0.9, 1.4, 7, 0, 10.2, 0, 12), place(new THREE.SphereGeometry(0.6, 12, 8), 0, 17.8, 0), cy(0.12, 0.12, 3, 0.9, 17, 0, 6), cy(0.3, 0.2, 0.6, 0.9, 20, 0, 8));
        const fg = new THREE.Group(); fig.build(fg); fg.position.set(LIBERTY[0], top, LIBERTY[1]); group.add(fg);
      }
    }

    // ── the bridges ──
    for (const b of D.bridges || []) {
      if (!near(b.c[0], b.c[1], 1400)) continue;
      const ux = Math.cos(b.a), uz = Math.sin(b.a);
      const ends = [[b.c[0] - (ux * b.L) / 2, b.c[1] - (uz * b.L) / 2], [b.c[0] + (ux * b.L) / 2, b.c[1] + (uz * b.L) / 2]];
      const deck = Math.max(wl + 7, Math.min(gy(...ends[0]), gy(...ends[1])) + 0.3);
      const g = new THREE.Group();
      g.position.set(b.c[0], 0, b.c[1]);
      g.rotation.y = -b.a; // local +x along the bridge
      const B = new Batch();
      const W = b.W, L = b.L;
      // the roadway and pavements, and a parapet each side
      B.add(asphalt, bx(L, 0.3, W - 6, 0, deck - 0.3, 0));
      for (const sd of [-1, 1]) B.add(coping, bx(L, 0.32, 3, 0, deck - 0.3, sd * (W / 2 - 1.5)));
      if (/Iéna|Invalides|Alma|Grenelle|Mirabeau/.test(b.n)) {
        // stone arches (Alma and Grenelle are steel and concrete now, but read the same from the course)
        const arches = /Iéna/.test(b.n) ? 5 : /Mirabeau/.test(b.n) ? 3 : /Invalides/.test(b.n) ? 4 : 3;
        const span0 = /Mirabeau/.test(b.n) ? steel : stone;
        B.add(span0, archedSpan(L * 0.9, deck - 0.3, wl + 1.2, arches, W - 1, Math.min(deck - wl - 2.6, 9)));
        for (const sd of [-1, 1]) {
          for (let k = 0; k < Math.round(L / 0.45); k++) B.add(coping, cy(0.13, 0.15, 0.9, -L / 2 + k * 0.45, deck + 0.02, sd * (W / 2 - 0.3), 6));
          B.add(coping, bx(L, 0.18, 0.5, 0, deck + 0.9, sd * (W / 2 - 0.3)));
        }
        if (/Iéna/.test(b.n)) {
          // the imperial eagles over the piers, and the four warriors at the ends
          for (let k = 1; k < arches; k++) for (const sd of [-1, 1]) {
            const x = -L * 0.45 + (L * 0.9 * k) / arches;
            B.add(coping, place(new THREE.CircleGeometry(1.6, 18), x, deck - 3.5, sd * (W / 2 + 0.05), sd > 0 ? 0 : Math.PI));
          }
          for (const ex of [-1, 1]) for (const sd of [-1, 1]) {
            B.add(stone, bx(4, 5, 3, ex * (L / 2 - 2), deck, sd * (W / 2 - 1.5)));
            B.add(bronze, place(new THREE.CapsuleGeometry(0.7, 2.2, 4, 10).rotateZ(Math.PI / 2), ex * (L / 2 - 2), deck + 6.3, sd * (W / 2 - 1.5)));
            B.add(bronze, cy(0.4, 0.5, 2.6, ex * (L / 2 - 2) - 0.2, deck + 6.4, sd * (W / 2 - 1.5), 8));
            B.add(bronze, place(new THREE.SphereGeometry(0.33, 10, 8), ex * (L / 2 - 2) - 0.2, deck + 9.2, sd * (W / 2 - 1.5)));
            for (const lx of [-1.2, 1.2]) B.add(bronze, cy(0.13, 0.13, 1.4, ex * (L / 2 - 2) + lx, deck + 5, sd * (W / 2 - 1.5), 6));
          }
          // tourists crossing, looking at the tower
          for (let k = 0; k < 40; k++) { const x = (rnd() - 0.5) * L * 0.9, sd = rnd() < 0.5 ? -1 : 1, z = sd * (W / 2 - 1.5 + (rnd() - 0.5) * 2); const wx = b.c[0] + ux * x - uz * z, wz = b.c[1] + uz * x + ux * z; if (!onField(wx, wz)) spots.push([wx, deck + 0.05, wz, rnd() * 6.28]); }
        }
      } else if (/Bir-Hakeim/.test(b.n)) {
        // the road deck on steel arches, the Métro viaduct above on its iron colonnade
        for (let sd = -1; sd <= 1; sd += 0.5) for (let k = 0; k < 4; k++) {
          const x0 = -L / 2 + (L / 4) * k, x1 = x0 + L / 4;
          for (let j = 0; j < 12; j++) {
            const t0 = j / 12, t1 = (j + 1) / 12, y = (t) => deck - 0.4 - Math.max(0.6, (deck - wl - 1.5) * (1 - Math.sin(Math.PI * t)));
            B.add(steel, span(V(x0 + (x1 - x0) * t0, y(t0), sd * (W / 2 - 1.5)), V(x0 + (x1 - x0) * t1, y(t1), sd * (W / 2 - 1.5)), 0.7, 1.4));
          }
          // the masonry piers between the spans
          if (k) B.add(stone, bx(4, deck - wl, W, x0, wl - 1, 0));
        }
        const vy = deck + 8.5;
        B.add(metroSteel, bx(L, 1.0, 7, 0, vy + 0.4, 0));
        for (const sd of [-1, 1]) B.add(metroSteel, bx(L, 1.1, 0.12, 0, vy + 1.4, sd * 4));
        for (let x = -L / 2 + 4; x < L / 2; x += 8.5) for (const sd of [-1, 1]) B.add(metroSteel, cy(0.24, 0.32, 8.9, x, deck, sd * 2.6, 10));
        // a line 6 train, five pale cars with a blue band
        const train = new THREE.Group();
        const carM = mat(0xe8e6df, { roughness: 0.5, metalness: 0.2 }), band = mat(0x2c5aa0), win = lit(0x30383f, 0xffe7b8, { night: 0.9, roughness: 0.2 });
        for (let k = 0; k < 5; k++) {
          const c = new THREE.Group();
          c.add(new THREE.Mesh(new THREE.BoxGeometry(15, 3.1, 2.6).translate(0, 1.55, 0), carM));
          c.add(new THREE.Mesh(new THREE.BoxGeometry(15.05, 0.35, 2.65).translate(0, 0.9, 0), band));
          c.add(new THREE.Mesh(new THREE.BoxGeometry(13, 1, 2.66).translate(0, 2, 0), win));
          c.position.x = k * 15.4 - 31;
          train.add(c);
        }
        glow.push(win);
        const tg = new THREE.Group(); tg.add(train);
        tg.rotation.y = -b.a;
        tg.userData = { c: b.c, ux, uz, L, y: vy + 1.4, ph: rnd() * 200 };
        group.add(tg); live.trains.push(tg);
      } else if (/Debilly/.test(b.n)) {
        // a footbridge on a shallow arch of dark green steel
        for (const sd of [-1, 1]) for (let j = 0; j < 16; j++) {
          const t0 = j / 16, t1 = (j + 1) / 16, y = (t) => wl + 2 + (deck - wl - 2.5) * Math.sin(Math.PI * t);
          B.add(steel, span(V(-L * 0.42 + L * 0.84 * t0, y(t0), sd * (W / 2 - 0.5)), V(-L * 0.42 + L * 0.84 * t1, y(t1), sd * (W / 2 - 0.5)), 0.5, 1.1));
          B.add(steel, bx(0.12, 1.1, 0.12, -L / 2 + L * t0, deck, sd * (W / 2 - 0.2)));
        }
        for (const sd of [-1, 1]) B.add(steel, bx(L, 0.12, 0.15, 0, deck + 1.1, sd * (W / 2 - 0.2)));
      } else if (/Alexandre/.test(b.n)) {
        B.add(steel, archedSpan(L * 0.9, deck - 0.3, wl + 1.2, 1, W - 1, Math.min(deck - wl - 2, 7)));
        for (const ex of [-1, 1]) for (const sd of [-1, 1]) {
          B.add(stone, bx(5, 17, 5, ex * (L / 2 + 4), deck, sd * (W / 2 + 3)));
          B.add(gold, place(new THREE.ConeGeometry(1.4, 4.2, 10).translate(0, 2.1, 0), ex * (L / 2 + 4), deck + 17, sd * (W / 2 + 3)));
          B.add(gold, place(new THREE.SphereGeometry(0.5, 10, 8), ex * (L / 2 + 4), deck + 21.6, sd * (W / 2 + 3)));
        }
      } else {
        // the rail viaducts: steel girders on stone piers
        B.add(steel, bx(L, 2.4, W * 0.5, 0, deck - 2.4, 0));
        for (let x = -L / 2 + 30; x < L / 2; x += 45) B.add(stone, bx(4, deck - wl, W * 0.5, x, wl - 1, 0));
      }
      B.build(g);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      group.add(g);
    }

    // ── bateaux-mouches on a line down the middle of the river ──
    const mid = (D.bridges || []).filter((b) => /Iéna|Debilly|Alma|Invalides|Alexandre/.test(b.n)).map((b) => b.c).sort((a, b) => a[0] - b[0]);
    if (mid.length > 1 && isl) {
      // and on downstream past the tower to the head of the island
      const head = isl.reduce((m, q) => (q[0] > m[0] ? q : m));
      const path = [[head[0] + 60, head[1] - 40], ...mid];
      const cum = [0], ang = [];
      for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
      for (let i = 0; i < path.length - 1; i++) ang.push(Math.atan2(path[i + 1][1] - path[i][1], path[i + 1][0] - path[i][0]));
      const hullM = mat(0xf2f1ec, { roughness: 0.5 }), trim = mat(0x1d3a5a, { roughness: 0.6 });
      const glass = painted(0x4c5c64, { roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.28, depthWrite: false });
      for (let k = 0; k < 4; k++) {
        const boat = new THREE.Group();
        const hull = new THREE.BoxGeometry(36, 2, 7, 12, 1, 1);
        const p = hull.attributes.position;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i), f = Math.max(0, (x - 12) / 6); p.setZ(i, p.getZ(i) * (1 - 0.7 * f * f)); }
        hull.computeVertexNormals();
        boat.add(new THREE.Mesh(hull, hullM));
        boat.add(new THREE.Mesh(new THREE.BoxGeometry(36.1, 0.4, 7.05).translate(0, -0.2, 0), trim));
        boat.add(new THREE.Mesh(new THREE.BoxGeometry(26, 2.1, 6.2).translate(-2, 2.05, 0), glass));
        boat.add(new THREE.Mesh(new THREE.BoxGeometry(26.2, 0.15, 6.4).translate(-2, 3.15, 0), hullM));
        boat.add(new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 3).translate(13, 2.2, 0), hullM)); // the wheelhouse
        boat.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        // passengers in the glass cabin, on its floor, looking out at the city
        const on = [];
        for (let i = 0; i < 30; i++) { const sd = rnd() < 0.5 ? -1 : 1; on.push([-14 + rnd() * 23, 1.0, sd * (1.6 + rnd() * 1.2), sd > 0 ? 0 : Math.PI]); }
        const crew = crowdAt(on, rnd); if (crew) boat.add(crew);
        boat.userData = { path, cum, ang, len: cum[cum.length - 1], d0: k * cum[cum.length - 1] * 0.5 + rnd() * 100, v: 3.2 + rnd() * 1.2, side: (k % 2 ? 1 : -1) * 12, y: wl + 0.9 };
        group.add(boat); live.boats.push(boat);
      }
    }

    // Parisians on the lawns either side of the hole: strollers, picnics, a game of pétanque
    {
      const edge = Math.max(T.fwHalf || 0, 14), river = D.water[0];
      for (let i = 0; i < 80; i++) {
        const sAt = T.length * rnd(), d = (rnd() < 0.5 ? -1 : 1) * (edge + 14 + rnd() * 28);
        const [x, z] = atHole(sAt, d), [tx, tz] = atHole(sAt, 0);
        if (inside(river, x, z)) continue;
        spots.push([x, gy(x, z), z, Math.atan2(tx - x, tz - z) + (rnd() - 0.5) * 2]);
      }
    }
    const crowd = crowdAt(spots, rnd);
    if (crowd) group.add(crowd);
  }
  return res;
}

export default { seine };
