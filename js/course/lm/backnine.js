// The Confluence Course's back-nine landmarks, modelled after the real
// structures in photographed PBR surfaces (js/scene/pbr.js):
//   unionstation  St. Louis Union Station (Theodore Link, 1894): the
//                 Romanesque limestone headhouse on Market Street, red tile
//                 hipped roofs and dormers, the 230-ft clock tower with its
//                 corner turrets, and the bays of the steel train shed behind
//   climatron     the Missouri Botanical Garden's Climatron (1960): an
//                 aluminium geodesic dome 175 ft across and 70 ft high, its
//                 hexagonal frame outside the glazing, palms within
//   watertower    the Grand Avenue Water Tower (1871): a 154-ft white
//                 Corinthian column on a square stone pedestal, the iron
//                 lookout and lantern on its capital
//   confluence    the Lewis & Clark Confluence Tower (2010), as on the
//                 Confluence Point course (lm/confluencepoint.js)
//   locks         Melvin Price Locks and Dam: the concrete piers with their
//                 machinery houses, steel tainter gates, the service bridge and
//                 its gantry cranes, the lock walls with miter gates
//   pavilion      the World's Fair Pavilion in Forest Park (1909): a stucco
//                 arcade under red tile with a raised clerestory, on a
//                 balustraded terrace above its grand stair and fountain
// Local axes as in kit.js: +Z toward the tee (the faces you see), y = 0 grade.
import * as THREE from 'three';
import { lit, tree, SLOT, FT, landmarkWater as water } from './kit.js';
import { pbr } from '../../scene/pbr.js';
import { place, bx, cy, rod, Batch } from './riverfront.js';
import { confluenceTower, materials as confluenceMaterials } from './confluencepoint.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Window glass that lights up warm at night. */
function windowGlass(night = 0.9) {
  return lit(0x1c252c, 0xffd49a, { roughness: 0.08, metalness: 0.6, night });
}

/** A hipped roof: eaves w × d at y = 0, ridge height h (a pyramid when w = d). */
function hipRoof(w, d, h, over = 0.6) {
  const W = w / 2 + over, D = d / 2 + over, r = Math.max(0, W - D);
  const a = [-W, 0, -D], b = [W, 0, -D], c = [W, 0, D], e = [-W, 0, D], p = [-r, h, 0], q = [r, h, 0];
  const tri = [];
  const quad = (A, B, C, Dd) => tri.push(...A, ...B, ...C, ...A, ...C, ...Dd);
  quad(e, c, q, p); // front
  quad(b, a, p, q); // back
  tri.push(...c, ...b, ...q, ...a, ...e, ...p); // the hipped ends
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
  g.computeVertexNormals();
  return g;
}

/** A gable roof prism along X: width w, depth d, ridge height h. */
function gableRoof(w, d, h, over = 0.4) {
  const s = new THREE.Shape();
  s.moveTo(-d / 2 - over, 0); s.lineTo(0, h); s.lineTo(d / 2 + over, 0); s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: w + over * 2, bevelEnabled: false }).translate(0, 0, -(w + over * 2) / 2).rotateY(Math.PI / 2);
}

/** Round-headed opening outline (w wide, h to the crown), bottom-left at (x, y). */
function archPath(path, x, y, w, h) {
  const r = w / 2, spring = h - r;
  path.moveTo(x, y);
  path.lineTo(x + w, y);
  path.lineTo(x + w, y + spring);
  path.absarc(x + r, y + spring, r, 0, Math.PI, false);
  path.lineTo(x, y);
  return path;
}

/** A wall in the XY plane, thickness t (centred on z = 0), pierced by round-headed arches. */
function arcadeWall(w, h, t, arches) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.closePath();
  for (const [x, y, aw, ah] of arches) s.holes.push(archPath(new THREE.Path(), x - aw / 2, y, aw, ah));
  return new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -t / 2);
}

/** A round-headed glazed window (pane) facing +Z, its sill at y. */
function archPane(w, h, x, y, z, ry = 0) {
  const s = archPath(new THREE.Shape(), -w / 2, 0, w, h);
  return place(new THREE.ShapeGeometry(s, 8), x, y, z, ry);
}

/** The stone ring round a round-headed opening, facing +Z. */
function archRing(w, h, band, depth, x, y, z, ry = 0) {
  const r = w / 2, spring = h - r;
  const s = new THREE.Shape();
  s.moveTo(-r - band, spring); s.absarc(0, spring, r + band, Math.PI, 0, true); s.lineTo(r, spring);
  s.absarc(0, spring, r, 0, Math.PI, false); s.closePath();
  return place(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 }), x, y, z, ry);
}

/** A row of short balusters with a handrail and base, from (x0, z0) to (x1, z1) at height y. */
function balustrade(B, stone, x0, z0, x1, z1, y, h = 1.0, pitch = 0.5) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.floor(L / pitch)), ry = -Math.atan2(z1 - z0, x1 - x0);
  const bal = new THREE.LatheGeometry([[0.08, 0], [0.06, 0.16], [0.11, 0.42], [0.06, 0.66], [0.07, 0.74]].map(([r, yy]) => new THREE.Vector2(r, yy * (h - 0.2) / 0.74)), 5);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    B.add(stone, bal.clone().translate(x0 + (x1 - x0) * t, y + 0.1, z0 + (z1 - z0) * t));
  }
  B.add(stone, bx(L + 0.3, 0.12, 0.34, (x0 + x1) / 2, y, (z0 + z1) / 2, ry), bx(L + 0.3, 0.14, 0.36, (x0 + x1) / 2, y + h - 0.12, (z0 + z1) / 2, ry));
}

const build = (B) => { const g = new THREE.Group(); B.build(g); return g; };

// ── Union Station ───────────────────────────────────────────────────────────
function unionstation() {
  const glow = [];
  const stone = pbr('sandstone_blocks_08', { scale: 2.2, tint: 0xe6dfd0, glow: 0xffd9a8, night: 0.35 });
  const trim = pbr('white_sandstone_bricks', { scale: 1.6, tint: 0xe6dcc6 });
  const base = pbr('granite_wall', { scale: 1.6, tint: 0xa8a29a });
  const tile = pbr('clay_roof_tiles_02', { scale: 1.6, tint: 0xa85f4c });
  const copper = pbr('metal_plate', { scale: 1.2, tint: 0x5f8f7e, metal: 0.4, rough: 0.8 });
  const shed = pbr('corrugated_iron', { scale: 2, tint: 0x8c9196, metal: 0.4 });
  const steel = pbr('metal_plate', { scale: 1.5, tint: 0x3c4246, metal: 0.5 });
  const glass = windowGlass();
  const clock = lit(0xf3eedc, 0xfff1d0, { roughness: 0.6, night: 1.2 });
  glow.push(stone, glass, clock);
  const B = new Batch();
  const L = 120, D = 24, H = 16, f = D / 2;
  // the headhouse: granite plinth, limestone walls, a carved string course at each floor
  B.add(base, bx(L + 0.6, 1.4, D + 0.6, 0, 0, 0));
  B.add(stone, bx(L, H - 1.4, D, 0, 1.4, 0));
  for (const y of [1.4, 6.4, 11.2]) B.add(trim, bx(L + 0.5, 0.45, D + 0.5, 0, y, 0));
  B.add(trim, bx(L + 1.2, 0.9, D + 1.2, 0, H - 0.9, 0)); // the cornice
  // three storeys of round-headed windows, front and back, in pairs between piers
  const bays = 18;
  for (let i = 0; i < bays; i++) {
    const x = -L / 2 + (i + 0.5) * (L / bays);
    if (Math.abs(x) < 9) continue; // the Grand Hall entrance
    for (const [y, h] of [[2.4, 3.2], [7.2, 3.0], [12.0, 2.4]]) {
      for (const dx of [-0.85, 0.85]) {
        B.add(glass, archPane(1.2, h, x + dx, y, f + 0.03), archPane(1.2, h, x + dx, y, -f - 0.03, Math.PI));
        B.add(trim, archRing(1.2, h, 0.22, 0.18, x + dx, y, f));
      }
    }
    B.add(trim, bx(0.5, H - 2.3, 0.35, x + L / bays / 2, 1.4, f)); // pilaster between bays
  }
  // the Grand Hall: a projecting centre block with the great arched entrance and a gable
  B.add(stone, bx(20, H + 4, 4, 0, 0, f + 2));
  B.add(trim, archRing(9, 11, 0.9, 0.6, 0, 1.4, f + 4));
  B.add(glass, archPane(9, 11, 0, 1.4, f + 4.02));
  for (const dx of [-6.5, 6.5]) B.add(glass, archPane(2, 5, dx, 12.5, f + 4.02), archPane(2, 5, dx, 4, f + 4.02));
  B.add(tile, place(gableRoof(4, 22, 8), 0, H + 4, f + 2, Math.PI / 2));
  B.add(trim, place(gableRoof(0.6, 21, 7.4, 0), 0, H + 4, f + 4.1, Math.PI / 2));
  // the steep hipped roofs of the headhouse, with dormers
  B.add(tile, place(hipRoof(L, D, 13), 0, H, 0));
  for (let i = 0; i < 9; i++) {
    const x = -L / 2 + 8 + i * ((L - 16) / 8);
    if (Math.abs(x) < 10) continue;
    for (const s of [1, -1]) {
      B.add(stone, bx(2.6, 3, 2.4, x, H + 0.4, s * (f - 2.5)));
      B.add(tile, place(gableRoof(2.6, 3, 2, 0.25), x, H + 3.4, s * (f - 2.5), Math.PI / 2));
      B.add(glass, archPane(1.3, 2.2, x, H + 0.8, s * (f - 1.28), s > 0 ? 0 : Math.PI));
    }
  }
  // the clock tower: buttressed shaft, the belfry's arches, clocks, the steep spire and its turrets
  const tx = -30, tz = 8, T = 54, w = 11;
  B.add(base, bx(w + 1, 1.6, w + 1, tx, 0, tz));
  B.add(stone, bx(w, T, w, tx, 1.6, tz));
  for (const [ax, az] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.add(stone, bx(2.2, T - 6, 2.2, tx + ax * (w / 2), 1.6, tz + az * (w / 2)));
  for (const y of [18, 34, T - 12]) B.add(trim, bx(w + 0.6, 0.5, w + 0.6, tx, y, tz));
  for (let k = 0; k < 4; k++) {
    const ry = (k * Math.PI) / 2, c = Math.cos(ry), s = Math.sin(ry), o = w / 2 + 0.03;
    const at = (dx, y) => [tx + c * dx + s * o, y, tz - s * dx + c * o];
    for (const [dx, y, aw, ah] of [[0, 4, 2.4, 6], [-1.9, 22, 1.2, 5], [1.9, 22, 1.2, 5]]) { const [x, yy, z] = at(dx, y); B.add(glass, archPane(aw, ah, x, yy, z, ry)); }
    for (const dx of [-2.6, 0, 2.6]) { const [x, y, z] = at(dx, T - 10); B.add(steel, archPane(2, 6.5, x, y, z, ry)); }
    const [cx2, cy2, cz2] = at(0, T - 15.5);
    B.add(clock, place(new THREE.CircleGeometry(2.6, 32), cx2, cy2, cz2, ry));
    B.add(trim, place(new THREE.TorusGeometry(2.7, 0.22, 6, 32), cx2, cy2, cz2, ry));
    const [hx, hy, hz] = at(0, T - 15.5);
    B.add(steel, place(new THREE.BoxGeometry(0.16, 2.1, 0.06).translate(0, 0.9, 0.08), hx, hy, hz, ry, 1, 1, 1, 0, 0.6), place(new THREE.BoxGeometry(0.2, 1.5, 0.06).translate(0, 0.6, 0.08), hx, hy, hz, ry, 1, 1, 1, 0, -2.2));
  }
  B.add(trim, bx(w + 1.6, 1.2, w + 1.6, tx, T + 1.6 - 1.2, tz));
  B.add(tile, place(hipRoof(w + 0.4, w + 0.4, 17, 0.4), tx, T + 1.6, tz));
  for (const [ax, az] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = tx + ax * (w / 2 + 0.2), z = tz + az * (w / 2 + 0.2);
    B.add(stone, cy(1.3, 1.3, 5, x, T - 4.4, z, 14));
    B.add(tile, place(new THREE.ConeGeometry(1.6, 6, 14).translate(0, 3, 0), x, T + 0.6, z));
  }
  B.add(copper, cy(0.12, 0.3, 4, tx, T + 18.4, tz, 8));
  // the east tower and the round turret at the west end
  B.add(stone, bx(9, 28, 9, 32, 0, 9), bx(9.6, 0.6, 9.6, 32, 28, 9));
  B.add(tile, place(hipRoof(9.4, 9.4, 10, 0.4), 32, 28.6, 9));
  for (const dx of [-2, 2]) B.add(glass, archPane(1.4, 4, 32 + dx, 21, 13.53));
  B.add(stone, cy(5, 5, 24, 56, 0, 9, 24), cy(5.4, 5.4, 0.6, 56, 24, 9, 24));
  B.add(tile, place(new THREE.ConeGeometry(5.8, 11, 24).translate(0, 5.5, 0), 56, 24.6, 9));
  for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + (k - 2.5) * 0.3; B.add(glass, archPane(1, 3, 56 + Math.sin(a) * 5.02, 14, 9 + Math.cos(a) * 5.02, a)); }
  // the train shed behind: low-arched bays of corrugated roof on steel trusses
  const sw = 26, sd = 84, sz = -f - sd / 2;
  for (let k = 0; k < 4; k++) {
    const x = -52 + sw / 2 + k * sw;
    B.add(shed, place(new THREE.CylinderGeometry(sw * 0.85, sw * 0.85, sd, 24, 1, true, -0.55, 1.1).rotateX(-Math.PI / 2).translate(0, -sw * 0.85 * Math.cos(0.55), 0), x, 15, sz));
    for (let j = 0; j <= 6; j++) {
      const z = -f - j * (sd / 6);
      const R = sw * 0.85, pts = [];
      for (let i = 0; i <= 10; i++) { const a = -0.55 + (1.1 * i) / 10; pts.push(V(x + Math.sin(a) * R, 15 - R * Math.cos(0.55) + Math.cos(a) * R - 0.3, z)); }
      for (let i = 0; i < 10; i++) B.add(steel, rod(pts[i], pts[i + 1], 0.22, 4), rod(pts[i], V(pts[i].x, 9.5, z), 0.07, 3));
      B.add(steel, rod(V(x - sw / 2, 9.5, z), V(x + sw / 2, 9.5, z), 0.2, 4));
      B.add(steel, cy(0.35, 0.4, 9.5, x - sw / 2, 0, z, 8));
    }
  }
  const g = build(B);
  return { group: g, glow };
}

// ── the Climatron ───────────────────────────────────────────────────────────
function climatron() {
  const g = new THREE.Group();
  const glow = [];
  const alu = pbr('metal_plate', { scale: 1.2, tint: 0xd9dee2, metal: 0.85, rough: 0.55 });
  const conc = pbr('concrete_wall_008', { scale: 3, tint: 0xd2dcf2, bright: 1.3 });
  const paving = pbr('brushed_concrete', { scale: 3, tint: 0xd8d2c6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xd4e6e8, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, emissive: 0x9bd6a8, emissiveIntensity: 0 });
  glass.userData.night = 0.35;
  glow.push(glass);
  const B = new Batch();
  // a spherical cap 53.3 m across and 21.3 m high: radius from the chord
  const r = 26.7, h = 21.3, R = (r * r + h * h) / (2 * h), y0 = h - R;
  const ico = new THREE.IcosahedronGeometry(R, 5);
  const p = ico.attributes.position;
  const key = (v) => `${Math.round(v.x * 100)},${Math.round(v.y * 100)},${Math.round(v.z * 100)}`;
  const faces = [], edgeFaces = new Map();
  for (let i = 0; i < p.count; i += 3) {
    const v = [0, 1, 2].map((k) => V(p.getX(i + k), p.getY(i + k) + y0, p.getZ(i + k)));
    if (Math.min(v[0].y, v[1].y, v[2].y) < -0.2) continue;
    const fi = faces.length;
    faces.push(v);
    for (let k = 0; k < 3; k++) {
      const a = key(v[k]), b = key(v[(k + 1) % 3]), e = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!edgeFaces.has(e)) edgeFaces.set(e, []);
      edgeFaces.get(e).push(fi);
    }
  }
  // the glazing, and the hexagonal frame outside it: the dual net, one strut
  // between the centres of each pair of neighbouring triangles
  const pos = [];
  for (const v of faces) pos.push(v[0].x, v[0].y, v[0].z, v[1].x, v[1].y, v[1].z, v[2].x, v[2].y, v[2].z);
  const skin = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  skin.computeVertexNormals();
  const centre = faces.map((v) => v[0].clone().add(v[1]).add(v[2]).multiplyScalar(1 / 3).sub(V(0, y0, 0)).multiplyScalar(1.012).add(V(0, y0, 0)));
  for (const fs of edgeFaces.values()) if (fs.length === 2) B.add(alu, rod(centre[fs[0]], centre[fs[1]], 0.11, 4));
  // the ring beam and the low concrete base, the entrance and a paved apron
  B.add(conc, place(new THREE.CylinderGeometry(r + 0.6, r + 0.9, 1.4, 64, 1, true).translate(0, 0.7, 0), 0, 0, 0));
  B.add(alu, place(new THREE.TorusGeometry(r + 0.2, 0.35, 6, 64).rotateX(Math.PI / 2), 0, 1.4, 0));
  B.add(paving, place(new THREE.RingGeometry(r + 0.9, r + 7, 64, 1).rotateX(-Math.PI / 2), 0, 0.03, 0));
  B.add(conc, bx(8, 3.6, 5, 0, 0, r + 1.6), bx(9, 0.5, 6, 0, 3.6, r + 1.6));
  B.add(alu, bx(5, 2.6, 0.1, 0, 0.2, r + 4.15));
  B.build(g);
  const shell = new THREE.Mesh(skin, glass);
  shell.castShadow = false; shell.renderOrder = 2;
  g.add(shell);
  // the rainforest inside: palms and broadleaves under the glass
  const trees = [];
  for (let i = 0; i < 16; i++) {
    const a = i * 2.39996, d = 4 + Math.sqrt(i / 16) * 17;
    trees.push(tree(Math.cos(a) * d, 0, Math.sin(a) * d, 9 + ((i * 7) % 5) * 1.6 - d * 0.18, 3 + (i % 3), { slot: i % 3 ? 12 : SLOT.maple }));
  }
  return { group: g, glow, trees };
}

// ── the Grand Avenue Water Tower ────────────────────────────────────────────
function watertower() {
  const glow = [];
  const paint = pbr('white_plaster_02', { scale: 2, tint: 0xf6f3ec, bright: 1.9, glow: 0xfff2dc, night: 0.5 });
  const stone = pbr('white_sandstone_bricks', { scale: 1.4, tint: 0xece6d8, glow: 0xfff2dc, night: 0.4 });
  const iron = pbr('metal_plate', { scale: 1, tint: 0x2f3436, metal: 0.6 });
  const glass = windowGlass(0.7);
  glow.push(paint, stone, glass);
  const B = new Batch();
  const H = 154 * FT;
  // the pedestal: a stepped base, the die with its arched doorway and windows, a moulded cap
  B.add(stone, bx(11, 0.8, 11, 0, 0, 0), bx(10, 7.4, 10, 0, 0.8, 0), bx(10.8, 0.7, 10.8, 0, 8.2, 0), bx(9.6, 1.2, 9.6, 0, 8.9, 0));
  for (let k = 0; k < 4; k++) {
    const ry = (k * Math.PI) / 2, c = Math.cos(ry), s = Math.sin(ry), o = 5.03;
    B.add(k === 0 ? iron : glass, archPane(k === 0 ? 2.2 : 1.4, k === 0 ? 4.2 : 3, s * o, k === 0 ? 0.8 : 3.4, c * o, ry));
    B.add(stone, archRing(k === 0 ? 2.2 : 1.4, k === 0 ? 4.2 : 3, 0.3, 0.2, s * o, k === 0 ? 0.8 : 3.4, c * o, ry));
  }
  // the column: an Attic base, the shaft with its entasis, astragal and necking
  const lathe = (pts, seg = 36) => new THREE.LatheGeometry(pts.map(([rr, yy]) => new THREE.Vector2(rr, yy)), seg);
  const y0 = 10.1, r0 = 2.7, top = H - 7.5;
  B.add(paint, place(lathe([[0.01, 0], [3.5, 0], [3.5, 0.5], [3.3, 0.7], [3.15, 0.75], [3.05, 1.1], [3.2, 1.25], [3.25, 1.45], [3.0, 1.7], [r0, 1.9], [0.01, 1.9]]), 0, y0, 0));
  const shaft = [];
  for (let i = 0; i <= 12; i++) { const u = i / 12; shaft.push([r0 * (1 - 0.16 * Math.max(0, u - 0.33) / 0.67) * (1 + 0.012 * Math.sin(u * Math.PI)), y0 + 1.9 + u * (top - y0 - 1.9)]); }
  B.add(paint, lathe([[0.01, shaft[0][1]], ...shaft, [0.01, top]], 40));
  // fluting: shallow vertical ribs round the shaft
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2, pts = shaft.map(([rr, yy]) => V(Math.cos(a) * (rr + 0.02), yy, Math.sin(a) * (rr + 0.02)));
    for (let i = 0; i < pts.length - 1; i++) B.add(paint, rod(pts[i], pts[i + 1], 0.09, 3));
  }
  const rt = shaft[12][0];
  B.add(paint, place(new THREE.TorusGeometry(rt + 0.05, 0.16, 8, 36).rotateX(Math.PI / 2), 0, top - 0.1, 0));
  // the Corinthian capital: a bell wrapped in two rows of acanthus, volutes at the corners, the abacus
  const bellH = 4.2;
  B.add(paint, place(lathe([[0.01, 0], [rt, 0], [rt * 1.05, bellH * 0.5], [rt * 1.25, bellH], [0.01, bellH]]), 0, top, 0));
  for (const [row, n, lh, lean] of [[0, 8, 0.48, 0.25], [1, 8, 0.78, 0.35]]) {
    for (let k = 0; k < n; k++) {
      const a = ((k + row * 0.5) / n) * Math.PI * 2;
      const leaf = new THREE.PlaneGeometry(1.5, bellH * lh, 2, 4);
      const lp = leaf.attributes.position;
      for (let i = 0; i < lp.count; i++) {
        const lx = lp.getX(i), ly = lp.getY(i) + (bellH * lh) / 2, u = ly / (bellH * lh);
        lp.setXYZ(i, lx * (1 - u * u * 0.5), ly, Math.pow(u, 2) * lean * bellH + Math.abs(lx) * -0.25);
      }
      leaf.computeVertexNormals();
      B.add(paint, place(leaf, Math.cos(a) * (rt + 0.1), top + 0.1, Math.sin(a) * (rt + 0.1), Math.PI / 2 - a));
    }
  }
  const ab = rt * 1.3 + 0.5, aby = top + bellH;
  for (const [ax, az] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    B.add(paint, place(new THREE.TorusGeometry(0.45, 0.18, 6, 12), ax * (ab - 0.35), aby - 0.5, az * (ab - 0.35), Math.atan2(ax, az) + Math.PI / 2));
  }
  B.add(paint, bx(ab * 2, 0.9, ab * 2, 0, aby, 0));
  // the lookout on the abacus: an iron railing round the lantern and its cap
  const ly = aby + 0.9;
  for (let k = 0; k < 4; k++) {
    const ry = (k * Math.PI) / 2, c = Math.cos(ry), s = Math.sin(ry);
    for (let i = 0; i <= 14; i++) {
      const t = -ab + 0.15 + (i / 14) * (ab * 2 - 0.3);
      B.add(iron, cy(0.03, 0.03, 1.1, c * t + s * (ab - 0.15), ly, -s * t + c * (ab - 0.15), 4));
    }
    B.add(iron, bx(ab * 2, 0.08, 0.08, s * (ab - 0.15), ly + 1.1, c * (ab - 0.15), ry));
  }
  B.add(paint, cy(1.9, 2.1, 3.2, 0, ly, 0, 24));
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; B.add(glass, archPane(0.7, 1.9, Math.sin(a) * 2.03, ly + 0.7, Math.cos(a) * 2.03, a)); }
  B.add(iron, place(new THREE.SphereGeometry(2.3, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1), 0, ly + 3.2, 0));
  B.add(iron, cy(0.08, 0.14, 2.2, 0, ly + 4.4, 0, 8));
  return { group: build(B), glow };
}

// ── the Confluence Tower ────────────────────────────────────────────────────
function confluence() {
  const glow = [];
  const m = confluenceMaterials();
  const g = build(confluenceTower(m, glow));
  return { group: g, glow };
}

// ── Melvin Price Locks and Dam ──────────────────────────────────────────────
function locks() {
  const g = new THREE.Group();
  const glow = [];
  const conc = pbr('concrete_wall_008', { scale: 4, tint: 0xccd6f0, bright: 1.3, glow: 0xfff0d0, night: 0.25 });
  const deck = pbr('brushed_concrete', { scale: 3, tint: 0xcfcac0 });
  const gate = pbr('metal_plate', { scale: 2, tint: 0x6f7b84, metal: 0.55, side: THREE.DoubleSide });
  const steel = pbr('metal_plate', { scale: 1.5, tint: 0x4d565e, metal: 0.55 });
  const crane = pbr('metal_plate', { scale: 1.5, tint: 0xc9a23a, metal: 0.4 });
  const roof = pbr('corrugated_iron', { scale: 1.5, tint: 0x8e969c, metal: 0.4 });
  const glass = windowGlass(0.8);
  glow.push(conc, glass);
  const B = new Batch();
  const piers = 10, pitch = 26, pw = 5, pl = 22, ph = 18;
  // the piers: rounded upstream noses (-Z), machinery houses on top
  for (let i = 0; i < piers; i++) {
    const x = i * pitch;
    B.add(conc, bx(pw, ph, pl, x, 0, 0));
    B.add(conc, place(new THREE.CylinderGeometry(pw / 2, pw / 2, ph, 16, 1, false, Math.PI / 2, Math.PI).translate(0, ph / 2, 0), x, 0, -pl / 2));
    B.add(conc, bx(pw + 0.6, 0.6, pl + 0.6, x, ph, 0));
    B.add(conc, bx(pw - 0.6, 3.4, 6, x, ph + 0.6, 4));
    B.add(roof, place(gableRoof(pw - 0.4, 6.2, 1.2, 0.2), x, ph + 4, 4, Math.PI / 2));
    B.add(glass, bx(pw - 0.5, 1, 0.05, x, ph + 2, 7.03), bx(pw - 0.5, 1, 0.05, x, ph + 2, 0.97));
  }
  // the tainter gates: curved skin plates on radial arms from trunnions on the piers
  const gr = 13, ga = 0.62, gw = pitch - pw - 0.2;
  for (let i = 0; i < piers - 1; i++) {
    const x = i * pitch + pitch / 2, tz = 3.5, ty = 10;
    B.add(gate, place(new THREE.CylinderGeometry(gr, gr, gw, 18, 1, true, Math.PI - ga / 2, ga).rotateZ(Math.PI / 2), x, ty, tz));
    for (let k = 0; k < 5; k++) { const a = -ga / 2 + (ga * (k + 0.5)) / 5; B.add(steel, place(new THREE.BoxGeometry(gw, 0.3, 0.5).translate(0, 0, 0), x, ty + Math.sin(a) * (gr - 0.3), tz - Math.cos(a) * (gr - 0.3), 0, 1, 1, 1, -a)); }
    for (const s of [-1, 1]) {
      const ax = x + s * (gw / 2 - 1.2);
      for (const a of [-ga / 2 + 0.05, ga / 2 - 0.05]) B.add(steel, rod(V(ax, ty, tz), V(ax, ty + Math.sin(a) * gr, tz - Math.cos(a) * gr), 0.32, 4));
      B.add(steel, cy(0.7, 0.7, 0.6, ax, ty - 0.3, tz, 10));
    }
    // the spillway apron below the gates, and the pool held behind them
  }
  B.add(conc, bx((piers - 1) * pitch + pw, 1.2, 30, (piers - 1) * pitch / 2, -0.6, 6));
  // the service bridge: deck on plate girders across the pier tops, rails, and the gantry cranes
  const len = (piers - 1) * pitch;
  B.add(deck, bx(len + pw, 0.5, 9, len / 2, ph + 0.6, -6));
  for (const z of [-10.3, -1.7]) {
    B.add(steel, bx(len + pw, 1.6, 0.4, len / 2, ph - 1, z));
    B.add(steel, bx(len + pw, 0.08, 0.08, len / 2, ph + 2.1, z));
    for (let x = -pw / 2; x <= len + pw / 2; x += 2.5) B.add(steel, cy(0.035, 0.035, 1.05, x, ph + 1.1, z, 4));
  }
  for (const z of [-8.6, -3.4]) B.add(steel, bx(len + pw, 0.18, 0.25, len / 2, ph + 1.1, z));
  for (const cx of [2.5 * pitch, 6.5 * pitch]) {
    for (const s of [-1, 1]) {
      B.add(crane, rod(V(cx + s * 4, ph + 1.3, -8.6), V(cx + s * 1.6, ph + 13, -6), 0.35, 6), rod(V(cx + s * 4, ph + 1.3, -3.4), V(cx + s * 1.6, ph + 13, -6), 0.35, 6));
      B.add(crane, bx(9, 0.7, 0.8, cx + s * 4, ph + 1.1, -6, Math.PI / 2));
    }
    B.add(crane, bx(5.2, 1.6, 6.5, cx, ph + 13, -6));
    B.add(steel, bx(4, 2.4, 2.5, cx, ph + 14.6, -4.5), cy(0.04, 0.04, 6, cx, ph + 7, -6, 4));
    B.add(glass, bx(3.8, 1.2, 0.05, cx, ph + 15.4, -3.22));
  }
  // the lock: two long walls with a control house, bollards, miter gates at both ends, water in the chamber
  const lz0 = -10, lz1 = 130, wl = lz1 - lz0, wh = 12;
  for (const x of [-18, -48]) {
    B.add(conc, bx(8, wh, wl, x, 0, (lz0 + lz1) / 2), bx(8.6, 0.4, wl, x, wh, (lz0 + lz1) / 2));
    for (let z = lz0 + 6; z < lz1; z += 12) B.add(steel, cy(0.32, 0.38, 0.8, x + (x > -30 ? -3.4 : 3.4), wh + 0.4, z, 10));
    for (let z = lz0 + 10; z < lz1; z += 30) B.add(steel, cy(0.12, 0.15, 9, x, wh + 0.4, z, 6), bx(1.4, 0.2, 0.4, x + (x > -30 ? -0.6 : 0.6), wh + 9.3, z));
  }
  for (const z of [lz0 + 4, lz1 - 4]) {
    for (const s of [-1, 1]) {
      const hx = -33 + s * 11, tip = -33 + s * 0.2;
      B.add(gate, place(new THREE.BoxGeometry(Math.hypot(11, 3.2), wh - 0.6, 1.1).translate(-s * Math.hypot(11, 3.2) / 2, (wh - 0.6) / 2, 0), hx, 0.4, z, s * Math.atan2(3.2, 11) * (z < 60 ? 1 : -1)));
      B.add(steel, bx(0.6, 0.6, 0.6, tip, wh - 0.2, z + (z < 60 ? -3.2 : 3.2)));
    }
  }
  B.add(conc, bx(8, 7, 10, -18, wh + 0.4, 40), bx(9, 0.5, 11, -18, wh + 7.4, 40));
  for (const [x, z, ry] of [[-22.03, 40, -Math.PI / 2], [-13.97, 40, Math.PI / 2], [-18, 45.03, 0]]) B.add(glass, place(new THREE.PlaneGeometry(ry ? 9 : 7, 2.4), x, wh + 4.4, z, ry));
  B.build(g);
  const chamber = new THREE.Mesh(new THREE.PlaneGeometry(22, wl - 10).rotateX(-Math.PI / 2), water());
  chamber.position.set(-33, wh - 4, (lz0 + lz1) / 2);
  chamber.castShadow = false; chamber.receiveShadow = true;
  g.add(chamber);
  return { group: g, glow };
}

// ── the World's Fair Pavilion ───────────────────────────────────────────────
function pavilion() {
  const g = new THREE.Group();
  const glow = [];
  const stucco = pbr('white_plaster_02', { scale: 2.2, tint: 0xf0e6d2, bright: 1.7, glow: 0xffe2b5, night: 0.45 });
  const stone = pbr('white_sandstone_bricks', { scale: 1.4, tint: 0xe4dac6, glow: 0xffe2b5, night: 0.3 });
  const steps = pbr('granite_wall', { scale: 1.6, tint: 0xcdc6ba });
  const tile = pbr('clay_roof_tiles_02', { scale: 1.4, tint: 0xb06a52 });
  const timber = pbr('brown_planks_08', { scale: 1.5, tint: 0x8a6448 });
  const glass = windowGlass(0.6);
  glow.push(stucco, stone);
  const B = new Batch();
  const W = 46, D = 18, P = 1.5, H = 9.5;
  // the terrace: a stone podium, steps up at each end, the balustrade round it
  B.add(stone, bx(W + 8, P, D + 8, 0, 0, 0));
  B.add(stone, bx(W + 8.6, 0.25, D + 8.6, 0, P - 0.25, 0));
  balustrade(B, stone, -W / 2 - 3.8, D / 2 + 3.8, -4, D / 2 + 3.8, P, 1);
  balustrade(B, stone, 4, D / 2 + 3.8, W / 2 + 3.8, D / 2 + 3.8, P, 1);
  balustrade(B, stone, -W / 2 - 3.8, -D / 2 - 3.8, W / 2 + 3.8, -D / 2 - 3.8, P, 1);
  for (const s of [-1, 1]) balustrade(B, stone, s * (W / 2 + 3.8), -D / 2 - 3.8, s * (W / 2 + 3.8), D / 2 + 3.8, P, 1);
  // the arcades: eight round arches a side, three at each end, on square piers
  const bay = W / 8, side = arcadeWall(W, H, 1.3, Array.from({ length: 8 }, (_, i) => [-W / 2 + bay * (i + 0.5), 0, bay - 1.6, 7.2]));
  const end = arcadeWall(D, H, 1.3, Array.from({ length: 3 }, (_, i) => [-D / 2 + (D / 3) * (i + 0.5), 0, D / 3 - 1.7, 7.0]));
  B.add(stucco, place(side.clone(), 0, P, D / 2), place(side, 0, P, -D / 2));
  B.add(stucco, place(end.clone(), W / 2, P, 0, Math.PI / 2), place(end, -W / 2, P, 0, Math.PI / 2));
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.add(stucco, bx(3, H + 0.8, 3, x * (W / 2), P, z * (D / 2)));
  for (let i = 0; i <= 8; i++) for (const z of [-1, 1]) B.add(stone, bx(1.5, 0.5, 1.6, -W / 2 + bay * i, P, z * (D / 2)));
  // the entablature, the eaves on carved rafter ends, the hipped tile roof
  B.add(stone, bx(W + 1.8, 0.7, D + 1.8, 0, P + H, 0));
  B.add(stucco, bx(W + 1.2, 0.8, D + 1.2, 0, P + H + 0.7, 0));
  for (let x = -W / 2 - 0.6; x <= W / 2 + 0.6; x += 1.2) for (const z of [-1, 1]) B.add(timber, bx(0.25, 0.3, 1.4, x, P + H + 1.2, z * (D / 2 + 1.1)));
  B.add(tile, place(hipRoof(W + 2.4, D + 2.4, 5.2, 0.6), 0, P + H + 1.5, 0));
  // the clerestory: a raised lantern with its own arched windows and tile roof
  const cw = 22, cd = 8, ch = 3.4, cyy = P + H + 1.5 + 2.2;
  B.add(stucco, bx(cw, ch, cd, 0, cyy, 0));
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) B.add(glass, archPane(1.6, 2.4, -cw / 2 + (cw / 7) * (i + 0.5), cyy + 0.4, s * (cd / 2 + 0.03), s > 0 ? 0 : Math.PI));
  B.add(stone, bx(cw + 0.8, 0.4, cd + 0.8, 0, cyy + ch, 0));
  B.add(tile, place(hipRoof(cw + 1, cd + 1, 2.8, 0.5), 0, cyy + ch + 0.4, 0));
  // the grand stair down the hill to the fountain, between balustrades
  const sw = 7, n = 5, rise = P / 5, run = 0.9, z0 = D / 2 + 4;
  for (let k = 0; k < n; k++) B.add(steps, bx(sw, P - 0.08 - k * rise + 6, run + 0.05, 0, -6, z0 + k * run + run / 2));
  const zBot = z0 + n * run;
  for (const s of [-1, 1]) {
    const pts = [];
    for (let k = 0; k < n; k++) pts.push([s * (sw / 2 + 0.4), z0 + (k + 0.5) * run, P - k * rise]);
    B.add(stone, ...pts.map(([x, z, y]) => bx(0.7, y + 6 + 0.8, run + 0.02, x, -6, z)));
    B.add(stone, bx(1.2, 1.6, 1.2, s * (sw / 2 + 0.4), P - n * rise, zBot), bx(1.2, 1.6, 1.2, s * (sw / 2 + 0.4), P, z0));
  }
  // the fountain at the foot: a stone basin with its central bowl
  const fy = P - n * rise, fz = zBot + 10;
  B.add(stone, place(new THREE.CylinderGeometry(8, 8, 0.8, 48, 1, true).translate(0, 0.4, 0), 0, fy - 0.2, fz));
  B.add(stone, place(new THREE.TorusGeometry(8, 0.35, 6, 48).rotateX(Math.PI / 2), 0, fy + 0.6, fz));
  B.add(steps, place(new THREE.CircleGeometry(8, 48).rotateX(-Math.PI / 2), 0, fy - 0.15, fz));
  B.add(stone, place(new THREE.LatheGeometry([[0.01, 0], [0.8, 0], [0.45, 0.4], [0.4, 1.4], [2.2, 1.9], [2.3, 2.2], [0.01, 2.0]].map(([r, y]) => new THREE.Vector2(r, y)), 24), 0, fy, fz));
  B.build(g);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(7.9, 48).rotateX(-Math.PI / 2), water());
  pool.position.set(0, fy + 0.45, fz);
  pool.castShadow = false;
  g.add(pool);
  return { group: g, glow };
}

export default { unionstation, climatron, watertower, confluence, locks, pavilion };
