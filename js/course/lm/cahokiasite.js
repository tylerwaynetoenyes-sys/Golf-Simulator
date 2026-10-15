// Cahokia Mounds State Historic Site, Collinsville, Illinois, for the course
// on its grounds: what stands there today, at the OpenStreetMap places, laid
// on the course's own ground (fit), in map axes (+x east, +z south) from the
// summit of Monks Mound, 38.6603°N 90.0618°W (assets/landmarks/cahokia).
// The mounds themselves are in the ground: the course's elevation is the 1 m
// USGS LiDAR (tools/fetch-lidar.py), so Monks Mound, the Twin Mounds and the
// rest stand at their surveyed shapes.
//   Woodhenge: the reconstructed circle of red cedar posts west of Monks
//     Mound, one of several sun calendars the city built (OSM: ~130 m across)
//   the stair up the south face of Monks Mound, from the Grand Plaza
//   the reconstructed stockade: the log palisade with bastions that walled
//     the central precinct, a section rebuilt east of the plaza
//   the Interpretive Center, on its footprint
//   a neighbourhood of thatched, clay-daubed houses outside the palisade
// Surfaces are photographed PBR sets (js/scene/pbr.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pbr } from '../../scene/pbr.js';
import { place, bx, Batch, pavingMeshes } from './riverfront.js';

const BASE = new URL('../../../assets/landmarks/cahokia/', import.meta.url).href;
let DATA = null;
const ready = fetch(`${BASE}ground.json`).then((r) => (r.ok ? r.json() : null)).then((j) => (DATA = j)).catch(() => null);

export default function build() {
  const group = new THREE.Group();
  group.name = 'cahokiasite';
  const glow = [];
  const res = {
    group, glow, trees: [],
    fit(holder, T, opts = {}) {
      if (!opts.course) return;
      holder.updateMatrix();
      const L = holder.matrix.clone(), w = new THREE.Vector3();
      const toW = (x, z) => w.set(x, 0, z).applyMatrix4(L);
      const gy = (x, z) => { toW(x, z); return (T.baseGround(w.x, w.z) - holder.position.y) / holder.scale.y; };
      const inPlay = (x, z) => { toW(x, z); const pr = T.project(w.x, w.z); return Math.abs(pr.d) < T.oobLateral + 6 && pr.s > -40 && pr.s < T.length + 60; };
      const go = (D) => lay(D, gy, inPlay);
      if (DATA) go(DATA); else ready.then((d) => d && go(d));
    },
  };
  function lay(D, gy, inPlay) {
    const m = {
      cedar: pbr('bark_brown_02', { scale: 1.2, tint: 0xb07a58 }),
      log: pbr('bark_brown_02', { scale: 1.2, tint: 0x8c7058 }),
      daub: pbr('white_plaster_02', { scale: 2.5, tint: 0xc9b08a }), // clay plaster over the palisade
      conc: pbr('brushed_concrete', { scale: 2.5, tint: 0xd8d2c4 }),
      wood: pbr('brown_planks_08', { scale: 2 }),
      rail: pbr('metal_plate', { scale: 1, tint: 0x3a3e44, metal: 0.4 }),
      centre: pbr('concrete_wall_008', { scale: 3, tint: 0xcdbb9c }),
    };
    const B = new Batch();
    // ── Woodhenge: posts round the circle, the observation post at its centre ──
    {
      const cx = -1152, cz = 45, R = 62, n = 48;
      const posts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R, h = 6.2 + ((i * 7) % 5) * 0.12;
        posts.push(new THREE.CylinderGeometry(0.28, 0.34, h, 10).translate(x, gy(x, z) - 0.6 + h / 2, z));
      }
      posts.push(new THREE.CylinderGeometry(0.34, 0.4, 7.5, 10).translate(cx, gy(cx, cz) - 0.6 + 3.75, cz));
      B.add(m.cedar, mergeGeometries(posts));
    }
    // ── the stair up Monks Mound's south face, from the plaza to the summit ──
    {
      const x = -56, z0 = 150, z1 = 24, steps = [];
      for (let z = z0; z > z1; z -= 0.42) {
        const y = gy(x, z);
        steps.push(new THREE.BoxGeometry(3.2, 0.25, 0.46).translate(x, y + 0.05, z));
      }
      B.add(m.conc, mergeGeometries(steps));
      for (const s of [-1, 1]) for (let z = z0; z > z1 + 2; z -= 2.5) {
        const a = new THREE.Vector3(x + s * 1.7, gy(x, z) + 1.0, z), b = new THREE.Vector3(x + s * 1.7, gy(x, z - 2.5) + 1.0, z - 2.5);
        B.add(m.rail, new THREE.CylinderGeometry(0.04, 0.04, a.distanceTo(b), 6).rotateX(Math.PI / 2).lookAt(new THREE.Vector3(0, b.y - a.y, b.z - a.z)).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2));
        B.add(m.rail, bx(0.06, 1.0, 0.06, x + s * 1.7, gy(x, z), z));
      }
    }
    // ── the reconstructed stockade east of the Grand Plaza: logs, clay daub, bastions ──
    {
      const pts = [[250, -140], [262, 40], [255, 220]];
      const logs = [], daub = [];
      for (let k = 0; k < pts.length - 1; k++) {
        const [ax, az] = pts[k], [bx2, bz] = pts[k + 1], L = Math.hypot(bx2 - ax, bz - az);
        const n = Math.floor(L / 0.42), dx = (bx2 - ax) / L, dz = (bz - az) / L;
        for (let i = 0; i < n; i++) {
          const x = ax + dx * i * 0.42, z = az + dz * i * 0.42, y = gy(x, z) - 0.3;
          logs.push(new THREE.CylinderGeometry(0.2, 0.22, 4.4, 8).translate(x, y + 2.2, z));
        }
        // the clay plaster that sheathed the lower wall
        const mid = [(ax + bx2) / 2, (az + bz) / 2];
        daub.push(place(new THREE.BoxGeometry(0.5, 2.6, L).translate(0, 1.3, 0), mid[0] - 0.05, gy(mid[0], mid[1]) - 0.3, mid[1], Math.atan2(dx, dz)));
        // bastions every ~40 m: square towers projecting outward (east)
        for (let s = 20; s < L - 10; s += 40) {
          const x = ax + dx * s + 3, z = az + dz * s, y = gy(x, z) - 0.3;
          for (const [ox, oz] of [[-2.5, -2.5], [2.5, -2.5], [2.5, 2.5], [-2.5, 2.5]]) logs.push(new THREE.CylinderGeometry(0.24, 0.26, 6, 8).translate(x + ox, y + 3, z + oz));
          for (let t = -2.5; t <= 2.5; t += 0.45) logs.push(new THREE.CylinderGeometry(0.2, 0.22, 5.2, 8).translate(x + 2.5, y + 2.6, z + t), new THREE.CylinderGeometry(0.2, 0.22, 5.2, 8).translate(x + t, y + 2.6, z - 2.5), new THREE.CylinderGeometry(0.2, 0.22, 5.2, 8).translate(x + t, y + 2.6, z + 2.5));
          daub.push(bx(5.6, 0.25, 5.6, x, y + 5.2, z));
        }
      }
      B.add(m.log, mergeGeometries(logs));
      B.add(m.daub, ...daub);
    }
    // ── a neighbourhood of Mississippian houses outside the palisade, as the
    // excavations found them: rectangular pole-and-trench walls plastered with
    // clay daub, steep roofs thatched with prairie grass, a hearth outside ──
    {
      const thatch = pbr('thatch_roof_angled', { scale: 1.6, tint: 0xd2b27a });
      let seed = 1050;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const walls = [], poles = [], roofs = [], doors = [], hearth = [];
      for (let i = 0; i < 14; i++) {
        const x = 300 + (i % 4) * 24 + (rnd() - 0.5) * 9, z = -40 + Math.floor(i / 4) * 26 + (rnd() - 0.5) * 9;
        if (inPlay(x, z)) continue;
        const w = 4.6 + rnd() * 2, d = 3.6 + rnd() * 1.4, h = 1.9, ry = (rnd() - 0.5) * 0.5, y = gy(x, z) - 0.15;
        walls.push(place(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), x, y, z, ry));
        // the posts set in the wall trenches show at the corners and along the eaves
        for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) poles.push(place(new THREE.CylinderGeometry(0.09, 0.11, h + 0.3, 7).translate(px, (h + 0.3) / 2, pz), x, y, z, ry));
        // a hipped roof of thatch, deep at the eaves
        roofs.push(place(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(w + 1.1, 2.8 + rnd() * 0.6, d + 1.1), x, y + h - 0.15, z, ry));
        doors.push(place(new THREE.BoxGeometry(0.8, 1.3, 0.12).translate(0, 0.65, d / 2 + 0.01), x, y, z, ry));
        // the hearth in the yard: a ring of stones
        const hx = x + Math.sin(ry) * (d / 2 + 2.4), hz = z + Math.cos(ry) * (d / 2 + 2.4);
        for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; hearth.push(new THREE.DodecahedronGeometry(0.16 + rnd() * 0.06, 1).translate(hx + Math.cos(a) * 0.55, gy(hx, hz) + 0.05, hz + Math.sin(a) * 0.55)); }
      }
      if (walls.length) {
        B.add(m.daub, ...walls);
        B.add(m.log, ...poles);
        B.add(thatch, ...roofs);
        B.add(m.rail, ...doors);
        B.add(m.conc, ...hearth);
      }
    }
    // ── the Interpretive Center on its footprint, and any other buildings off the field ──
    for (const b of D.buildings) {
      let p = b.p;
      if (p.length > 2 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p = p.slice(0, -1);
      if (p.length < 3) continue;
      const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cz = p.reduce((s, q) => s + q[1], 0) / p.length;
      if (inPlay(cx, cz)) continue;
      const y = Math.min(...p.map(([x, z]) => gy(x, z))) - 0.3, h = b.h || 7;
      const shape = new THREE.Shape(p.map(([x, z]) => new THREE.Vector2(x, -z)));
      B.add(m.centre, new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y, 0));
    }
    const g = new THREE.Group();
    B.build(g);
    g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    group.add(g);
    for (const mesh of pavingMeshes(D, gy, inPlay, { paths: true })) group.add(mesh);
  }
  return res;
}
