// Oregon Trail landmarks (Scotts Bluff, Nebraska). Proportions from
// published figures:
//   prairie schooner: bed ~3.4 m × 1.15 m, canvas bonnet on hickory bows to
//     ~3 m, rear wheels ~1.3 m, front ~1.1 m; drawn by two or three yoke of oxen
//   Aermotor A702: 8 ft (2.44 m) wheel of 18 sails on a ~33 ft (10 m)
//     four-leg steel tower, stock tank at the foot
//   sod house: walls of cut sod laid like bricks ("Nebraska marble"), ~2 ft
//     thick, about 16 × 20 ft, a sod roof on a low gable
//   plains bison: bulls ~1.8 m at the hump, ~3.3 m long
//   Chimney Rock: ~37 m Arikaree/Brule spire on a clay cone, 99 m above
//     the cone's base and ~146 m above the North Platte valley
// See kit.js for the builder contract (-Z = direction of play).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lit, box, cyl, gable, seeded, canvasTex, FT, landmarkWater } from './kit.js';
import { pbr } from '../../scene/pbr.js';
import { animalsAt } from '../../scene/animals.js';

// ── shared pieces ──

/** A spoked wagon wheel: felloe, iron tyre, hub and spokes, one geometry. */
function wheelGeo(r, spokes = 12) {
  const parts = [new THREE.TorusGeometry(r - 0.03, 0.035, 6, 32), new THREE.CylinderGeometry(0.09, 0.11, 0.24, 12).rotateX(Math.PI / 2)];
  for (let i = 0; i < spokes; i++) parts.push(new THREE.CylinderGeometry(0.018, 0.024, r, 6).translate(0, r / 2, 0).rotateZ((i / spokes) * Math.PI * 2));
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; }));
}

/** A clump of prairie grass: a dozen tapering blades arching out from the root. */
function tuftGeo(seed = 7, size = 1) {
  const blades = [], r = seeded(seed);
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2, lean = 0.25 + r() * 0.45, h = (0.35 + r() * 0.3) * size;
    const b = new THREE.PlaneGeometry(0.05 * size, h, 1, 3).translate(0, h / 2, 0);
    const p = b.attributes.position;
    for (let k = 0; k < p.count; k++) { const u = p.getY(k) / h; p.setX(k, p.getX(k) * (1 - u * 0.9)); p.setZ(k, lean * u * u * h); }
    blades.push(b.rotateY(a));
  }
  const g = mergeGeometries(blades); g.computeVertexNormals();
  return g;
}

// photographed surfaces (pbr.js), shared across the builders
const M = {
  canvas: () => pbr('rough_linen', { scale: 0.8, tint: 0xfff0d4, bright: 1.5, side: THREE.DoubleSide }),
  plank: (tint) => pbr('brown_planks_08', { scale: 1.2, tint }),
  weathered: (tint = 0xd8d0c8) => pbr('wood_planks_grey', { scale: 1.2, tint }),
  iron: () => pbr('painted_steel', { scale: 0.8, tint: 0x2e2a28, metal: 0.5 }),
  galv: (side = THREE.FrontSide) => pbr('painted_steel', { scale: 1, tint: 0xc4c8cc, metal: 0.65, rough: 0.6, bright: 1.3, side }),
  log: () => pbr('bark_brown_02', { scale: 1.2, tint: 0xc0a080 }),
  grass: () => pbr('thatch_roof_angled', { scale: 0.6, tint: 0xd0d890, bright: 1.5, side: THREE.DoubleSide }),
};

// ── builders ──

/** A short wagon train: three prairie schooners with ox teams, in line. */
function wagons() {
  const g = new THREE.Group();
  const canvas = M.canvas();
  const bedPaint = [0xa8c0e0, 0xb8d0a0, 0xe0b890]; // milk paint: blue, green, buff, over the planks
  const gear = M.plank(0xe08070); // red running gear
  const iron = M.iron();
  const yoke = M.plank(0xc8a888);
  const wheels = { 0.55: wheelGeo(0.55), 0.66: wheelGeo(0.66) };
  for (let w = 0; w < 3; w++) {
    const wagon = new THREE.Group();
    const bed = M.plank(bedPaint[w]);
    // the box: floor, sides and ends of planks, the sides flaring at the top
    wagon.add(box(1.15, 0.08, 3.4, bed, 0, 0.95, 0));
    for (const s of [-1, 1]) wagon.add(box(0.05, 0.62, 3.4, bed, s * 0.56, 0.95, 0), box(1.15, 0.62, 0.05, bed, 0, 0.95, s * 1.68));
    wagon.add(box(1.2, 0.06, 0.08, iron, 0, 1.55, -1.68), box(1.2, 0.06, 0.08, iron, 0, 1.55, 1.68));
    // canvas bonnet over the bows: a half-round arch along the bed, flaring
    // up and out at the front and back as the end bows lean outward
    const bonnet = new THREE.PlaneGeometry(Math.PI, 3.6, 18, 8);
    const p = bonnet.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + Math.PI / 2; // 0..π around the arch
      const z = p.getY(i);
      const flare = 1 + 0.18 * (Math.abs(z) / 1.8) ** 3;
      p.setXYZ(i, Math.cos(u) * 0.66 * flare, 1.24 + Math.sin(u) * 0.95 * flare, z * (1 + 0.04 * flare));
    }
    bonnet.computeVertexNormals();
    const bm = new THREE.Mesh(bonnet, canvas);
    bm.castShadow = true;
    wagon.add(bm);
    // the hickory bows showing through as ribs
    for (let k = 0; k < 5; k++) {
      const z = -1.6 + k * 0.8;
      const bow = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 4, 16, Math.PI).scale(0.67, 0.96, 1), yoke);
      bow.position.set(0, 1.24, z);
      wagon.add(bow);
    }
    // running gear and wheels (rear larger)
    wagon.add(box(0.12, 0.12, 3.6, gear, 0, 0.62, 0));
    for (const [z, r] of [[-1.15, 0.55], [1.2, 0.66]]) {
      for (const s of [-1, 1]) {
        const wh = new THREE.Mesh(wheels[r], gear);
        wh.rotation.y = Math.PI / 2;
        wh.position.set(s * 0.72, r, z);
        wh.castShadow = true;
        wagon.add(wh);
      }
      wagon.add(cyl(0.05, 0.05, 1.5, iron, 0, r, z).rotateZ(Math.PI / 2));
    }
    // tongue, yokes and two yoke of oxen
    wagon.add(box(0.1, 0.1, 3.2, gear, 0, 0.55, -3.3));
    const oxen = [];
    for (let k = 0; k < 2; k++) {
      for (const s of [-1, 1]) oxen.push([s * 0.6, 0, -3.9 - k * 2.7, 0, 1.0 + ((w * 4 + k * 2 + s) % 3) * 0.04]);
      wagon.add(box(1.6, 0.12, 0.14, yoke, 0, 1.3, -2.95 - k * 2.7));
    }
    wagon.add(animalsAt('ox', oxen));
    wagon.position.set(Math.sin(w * 0.8) * 3, 0, w * 13);
    wagon.rotation.y = Math.sin(w * 0.8) * 0.12;
    g.add(wagon);
  }
  return { group: g, glow: [] };
}

/** Aermotor-style steel windmill with an 8 ft wheel and a stock tank. */
function windmill() {
  const g = new THREE.Group();
  const steel = M.galv();
  const H = 33 * FT;
  const spread = 1.8;
  // four angle-iron legs leaning in to the head
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const a = new THREE.Vector3(x * spread, 0, z * spread), b = new THREE.Vector3(x * 0.22, H, z * 0.22);
    const len = a.distanceTo(b);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, len, 0.07), steel);
    leg.position.copy(a).lerp(b, 0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    leg.castShadow = true;
    g.add(leg);
  }
  // girts at five levels and the cross-braces between them
  for (let i = 1; i <= 5; i++) {
    const y = (i / 6) * H;
    const w = spread - (spread - 0.22) * (y / H);
    for (const r of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const girt = new THREE.Mesh(new THREE.BoxGeometry(w * 2, 0.05, 0.04), steel);
      girt.position.set(Math.sin(r) * w, y, Math.cos(r) * w);
      girt.rotation.y = r;
      g.add(girt);
    }
  }
  // head: wheel of 18 sails, tail vane
  const head = new THREE.Group();
  head.position.y = H + 0.3;
  head.add(box(0.3, 0.3, 0.7, steel, 0, -0.15, 0));
  const rotor = new THREE.Group();
  rotor.position.z = -0.45;
  const sailMat = M.galv(THREE.DoubleSide);
  const R = 1.22;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.2, R * 0.62), sailMat);
    sail.position.set(Math.sin(a) * R * 0.66, Math.cos(a) * R * 0.66, 0);
    sail.rotation.z = -a;
    sail.rotateY(0.5);
    rotor.add(sail);
  }
  rotor.add(new THREE.Mesh(new THREE.TorusGeometry(R * 0.97, 0.02, 4, 36), steel));
  rotor.add(new THREE.Mesh(new THREE.TorusGeometry(R * 0.36, 0.02, 4, 24), steel));
  head.add(rotor);
  const vane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), sailMat);
  vane.rotation.y = Math.PI / 2;
  vane.position.set(0, 0.15, 1.5);
  head.add(vane, box(0.05, 0.05, 1.3, steel, 0, -0.05, 0.8));
  head.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.add(head);
  // pump rod and a round galvanised stock tank of corrugated steel
  g.add(cyl(0.025, 0.025, H, steel, 0, 0, 0, 5));
  const tank = cyl(1.8, 1.8, 0.6, pbr('corrugated_iron', { scale: 0.6, tint: 0xc8ccd0, metal: 0.55, bright: 1.2 }), 3.2, 0, 0.5, 32);
  g.add(tank);
  g.add(new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.04, 6, 32).rotateX(Math.PI / 2).translate(3.2, 0.6, 0.5), steel));
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.75, 28).rotateX(-Math.PI / 2), landmarkWater());
  water.position.set(3.2, 0.52, 0.5);
  g.add(water);
  return {
    group: g,
    glow: [],
    update(t, dt) { rotor.rotation.z -= dt * 2.4; },
  };
}

/** A small herd of grazing bison: bulls, cows and a calf or two. */
function bison() {
  const rnd = seeded(1871);
  const spots = [];
  for (let i = 0; i < 9; i++) {
    const bull = rnd() < 0.35, calf = !bull && rnd() < 0.25;
    const a = rnd() * Math.PI * 2, r = 4 + Math.sqrt(rnd()) * 22;
    spots.push([Math.cos(a) * r, 0, Math.sin(a) * r, rnd() * Math.PI * 2, bull ? 1 : calf ? 0.55 : 0.84]);
  }
  const g = new THREE.Group();
  g.add(animalsAt('bison', spots));
  return { group: g, glow: [] };
}

/** A plains sod house: walls of cut sod laid like bricks, sod roof, plank door, two small windows. */
function sodhouse() {
  const g = new THREE.Group();
  const sod = pbr('brown_mud_dry', { scale: 1.2, tint: 0xb8a890 });
  const roofSod = pbr('grass_ground', { scale: 2, tint: 0xa8b080 });
  const wood = M.weathered();
  const glass = lit(0x2a2f33, 0xffc070, { night: 1.2, roughness: 0.3 });
  const W = 6.2, D = 5, Hh = 2.3;
  const rnd = seeded(11);
  // "Nebraska marble": blocks of prairie sod about 0.9 × 0.3 m and 0.6 m
  // thick, laid in courses with the joints broken, each a little askew
  const blocks = [], LEN = 0.9, CH = 0.29;
  const n = Math.round(Hh / CH);
  for (let c = 0; c < n; c++) {
    const y = c * CH, off = (c % 2) * LEN / 2;
    for (const [len, along, fixed, sz] of [[W, 'x', D / 2 - 0.3, 1], [W, 'x', -D / 2 + 0.3, 1], [D - 1.2, 'z', W / 2 - 0.3, 1], [D - 1.2, 'z', -W / 2 + 0.3, 1]]) {
      for (let t = -len / 2 - off; t < len / 2; t += LEN) {
        const a = Math.max(-len / 2, t), b = Math.min(len / 2, t + LEN - 0.03);
        if (b - a < 0.15) continue;
        const mid = (a + b) / 2;
        // the door and window openings
        if (along === 'x' && fixed > 0 && ((Math.abs(mid - 0.8) < 0.55 && y < 1.9) || (Math.abs(mid + 1.6) < 0.45 && y > 0.9 && y < 1.6) || (Math.abs(mid - 2.2) < 0.45 && y > 0.9 && y < 1.6))) continue;
        const geo = new THREE.BoxGeometry(along === 'x' ? b - a : 0.6, CH - 0.02, along === 'x' ? 0.6 : b - a);
        geo.rotateY((rnd() - 0.5) * 0.04).translate(along === 'x' ? mid : fixed, y + CH / 2, along === 'x' ? fixed : mid);
        blocks.push(geo);
      }
    }
  }
  const walls = new THREE.Mesh(mergeGeometries(blocks), sod);
  walls.castShadow = walls.receiveShadow = true;
  g.add(walls);
  g.add(gable(W + 0.6, 1.3, D + 0.6, roofSod, 0, Hh, 0));
  // grass growing out of the roof sod along the ridge and eaves
  const tufts = new THREE.InstancedMesh(tuftGeo(11), M.grass(), 40);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < 40; i++) {
    const side = rnd() < 0.5 ? -1 : 1, u = rnd();
    v.set((rnd() - 0.5) * W, Hh + u * 1.3, side * (D / 2 + 0.3) * (1 - u));
    tufts.setMatrixAt(i, m4.compose(v, q.setFromAxisAngle(sc.set(side, 0, 0).normalize(), 0.5).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6)), sc.setScalar(0.6 + rnd() * 0.4)));
  }
  g.add(tufts);
  // plank door and frames in the openings, the windows
  g.add(box(0.9, 1.9, 0.08, wood, 0.8, 0, D / 2 - 0.3));
  for (const x of [-1.6, 2.2]) g.add(box(0.7, 0.6, 0.06, glass, x, 1.0, D / 2 - 0.3), box(0.86, 0.08, 0.6, wood, x, 0.9, D / 2 - 0.3));
  g.add(cyl(0.09, 0.09, 1.2, M.iron(), -1.8, Hh + 0.8, -0.6, 10));
  // a water barrel
  g.add(cyl(0.3, 0.27, 0.9, M.plank(0xc8a888), 3.6, 0, 1.6, 14));
  for (const y of [0.15, 0.75]) g.add(new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.015, 4, 16).rotateX(Math.PI / 2).translate(3.6, y, 1.6), M.iron()));
  return { group: g, glow: [glass] };
}

/** A log trading post with a porch, hitching rail, barrels and a painted sign. */
function tradingpost() {
  const g = new THREE.Group();
  const log = M.log();
  const chink = pbr('white_plaster_02', { scale: 1.2, tint: 0xc0a888 }); // clay chinking between the logs
  const shake = M.weathered(0xc8c0b8);
  const deck = M.plank(0xd0b090);
  const glass = lit(0x2a2f33, 0xffc070, { night: 1.2, roughness: 0.3 });
  const W = 10, D = 6.5, H = 3;
  // stacked logs on all four walls, crossing at the corners
  const logs = [];
  for (let i = 0; i < 11; i++) {
    const y = 0.14 + i * 0.27;
    for (const s of [-1, 1]) {
      logs.push(new THREE.CylinderGeometry(0.15, 0.15, W + 0.5, 10).rotateZ(Math.PI / 2).translate(0, y, s * D / 2));
      logs.push(new THREE.CylinderGeometry(0.15, 0.15, D + 0.5, 10).rotateX(Math.PI / 2).translate(s * W / 2, y + 0.13, 0));
    }
  }
  const lm = new THREE.Mesh(mergeGeometries(logs), log);
  lm.castShadow = lm.receiveShadow = true;
  g.add(lm);
  g.add(box(W - 0.2, H, D - 0.2, chink));
  // low gable, shake roof
  g.add(gable(W + 1, 1.5, D + 1.2, shake, 0, H, 0));
  // front porch
  g.add(box(W, 0.2, 2.2, deck, 0, 0, D / 2 + 1.1));
  for (const x of [-4.6, -1.5, 1.5, 4.6]) g.add(cyl(0.1, 0.1, 2.6, log, x, 0.2, D / 2 + 2.05, 10));
  g.add(box(W + 0.4, 0.12, 2.6, shake, 0, 2.8, D / 2 + 1.1));
  g.add(box(1, 2, 0.08, M.weathered(0x9a8a80), 0, 0.2, D / 2 + 0.16));
  for (const x of [-3, 3]) g.add(box(1, 0.8, 0.06, glass, x, 1.1, D / 2 + 0.16));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.8), new THREE.MeshStandardMaterial({
    roughness: 0.9,
    map: canvasTex(512, 96, (c, w, h) => {
      c.fillStyle = '#e8dcc0'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#5a2a1a'; c.font = '700 54px Georgia, serif'; c.textAlign = 'center';
      c.fillText('TRADING POST', w / 2, 70);
    }),
  }));
  sign.position.set(0, 3.25, D / 2 + 2.42);
  g.add(sign, box(4.8, 0.95, 0.06, shake, 0, 2.78, D / 2 + 2.38));
  // hitching rail and barrels
  g.add(cyl(0.06, 0.06, 4, log, -2, 1, D / 2 + 4.2, 8).rotateZ(Math.PI / 2));
  for (const x of [-4, 0]) g.add(cyl(0.08, 0.08, 1.05, log, x, 0, D / 2 + 4.2, 8));
  const barrel = M.plank(0xc8a888);
  for (const [x, z] of [[4.2, 4.3], [4.9, 4.6], [4.4, 5.3]]) {
    g.add(cyl(0.32, 0.28, 0.85, barrel, x, 0, D / 2 + z - 2.5, 14));
    for (const y of [0.12, 0.72]) g.add(new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.015, 4, 16).rotateX(Math.PI / 2).translate(x, y, D / 2 + z - 2.5), M.iron()));
  }
  return { group: g, glow: [glass] };
}

/**
 * Chimney Rock: the clay cone and the sandstone spire, banded. Built to true
 * size; CourseWorld places it on its real bearing (see `far` landmarks).
 */
function chimneyrock() {
  const g = new THREE.Group();
  const rnd = seeded(1830);
  const prof = [];
  // cone of Brule clay (~62 m, 35° flanks easing out at the toe), then the spire (~37 m)
  // a steep, concave cone (flanks ~45° near the top), a small shoulder,
  // then the column of the spire
  const pts = [[118, 0], [96, 6], [76, 15], [58, 26], [44, 37], [33, 47], [24, 56], [17, 62], [14.5, 64.5],
    [11.5, 66], [10.5, 72], [10, 82], [9.4, 90], [8.6, 96], [6.5, 99.5], [3.5, 101], [0, 101.5]];
  for (const [r, y] of pts) prof.push(new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(prof, 48);
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  const clay = new THREE.Color(0xb39a74), sand = new THREE.Color(0xc4ad88), ash = new THREE.Color(0xd9ccb2), shade = new THREE.Color(0x8a7356), cap = new THREE.Color(0x8f7a5c);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    // erosion: gullies on the cone, a rough spire
    const r = Math.hypot(x, z);
    if (r > 0.1) {
      const gully = y < 64 ? 1 - 0.07 * Math.max(0, Math.sin(a * 23 + Math.sin(a * 7) * 2)) * Math.min(1, y / 20) : 1 + (rnd() - 0.5) * 0.12;
      p.setX(i, x * gully);
      p.setZ(i, z * gully);
    }
    // horizontal beds: pale volcanic ash layers in the clay, sandstone above
    const band = 0.5 + 0.5 * Math.sin(y * 1.3 + Math.sin(y * 0.37) * 2);
    c.copy(y < 64 ? clay : sand).lerp(ash, band * 0.35);
    if (y < 64) c.lerp(shade, 0.3 * Math.max(0, Math.sin(a * 23)));
    else c.lerp(cap, THREE.MathUtils.smoothstep(y, 92, 100) * 0.8);
    // grass and yucca hold the lower cone
    if (y < 14) c.lerp(new THREE.Color(0x8c8456), THREE.MathUtils.smoothstep(14 - y, 0, 10) * 0.7);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  // the photographed rock face under the bedding colours, at cliff scale
  const m = pbr('rock_face_03', { scale: 22, tint: 0xe4e8f4, bright: 1.45, vertex: true }); // pale buff, not the photo's warm brown
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.y = -4;
  mesh.castShadow = true;
  g.add(mesh);
  return { group: g, glow: [], haze: [m] };
}


// ── the Oregon Trail itself: ruts across the prairie to Mitchell Pass, and a wagon train on them ──
// The route (DEM metres, from the course's origin 41.832°N 103.700°W): up the North Platte
// valley from the east, south of the bluff, and west through Mitchell Pass (41.829°N 103.709°W).
const TRAIL = [[3200, 980], [2300, 820], [1600, 700], [900, 540], [250, 440], [-300, 380], [-747, 333], [-1300, 300], [-2200, 260]];

function trail() {
  const group = new THREE.Group();
  const live = { train: [], path: null };
  const update = (t) => {
    const P = live.path;
    if (!P) return;
    for (const wg of live.train) {
      const u = wg.userData;
      let sv = P.s0 + ((u.lead + t * 0.95) % P.span); // the train rolls west at a walk, then starts again
      sv = Math.min(P.len - 1, Math.max(0, sv));
      let i = 0; while (i < P.pts.length - 2 && P.cum[i + 1] < sv) i++;
      const k = (sv - P.cum[i]) / (P.cum[i + 1] - P.cum[i] || 1);
      const x = P.pts[i][0] + (P.pts[i + 1][0] - P.pts[i][0]) * k, z = P.pts[i][1] + (P.pts[i + 1][1] - P.pts[i][1]) * k;
      wg.position.set(x, P.gy(x, z), z);
      wg.rotation.y = Math.atan2(-(P.pts[i + 1][0] - P.pts[i][0]), -(P.pts[i + 1][1] - P.pts[i][1])); // the team (−z) leads
      wg.visible = !P.onField(x, z);
      wg.children[0].rotation.z = Math.sin(t * 2.1 + u.lead) * 0.012; // the bed rocks over the ruts
    }
  };
  const res = {
    group, glow: [], update, trees: [],
    fit(holder, T, opts = {}) {
      if (!opts.course) return;
      holder.updateMatrix();
      const L = holder.matrix.clone(), w = new THREE.Vector3();
      const toW = (x, z) => w.set(x, 0, z).applyMatrix4(L);
      const gy = (x, z) => { toW(x, z); return (T.drawnHeight(w.x, w.z) - holder.position.y) / holder.scale.y; };
      const prj = (x, z) => { toW(x, z); return T.project(w.x, w.z); };
      const onField = (x, z) => { const pr = prj(x, z); return Math.abs(pr.d) < Math.max(T.fwHalf || 0, 14) + 16 && pr.s > -30 && pr.s < T.length + 40; };
      // the ruts: two bare tracks a wagon's width apart, in a band of trampled grass, resampled to follow the ground
      const pts = [];
      for (let i = 0; i < TRAIL.length - 1; i++) {
        const [ax, az] = TRAIL[i], [bx2, bz] = TRAIL[i + 1], n = Math.ceil(Math.hypot(bx2 - ax, bz - az) / 6);
        for (let k = 0; k < n; k++) {
          const t = k / n;
          // the trail wanders a little, as wagons picked their way
          const wob = Math.sin((ax + (bx2 - ax) * t) * 0.011) * 6;
          pts.push([ax + (bx2 - ax) * t, az + (bz - az) * t + wob]);
        }
      }
      pts.push(TRAIL[TRAIL.length - 1]);
      const band = [], ruts = [];
      const strip = (out, a, b, o0, o1, dy) => {
        const L2 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L2, nz = (b[0] - a[0]) / L2;
        const A0 = [a[0] + nx * o0, a[1] + nz * o0], A1 = [a[0] + nx * o1, a[1] + nz * o1], B0 = [b[0] + nx * o0, b[1] + nz * o0], B1 = [b[0] + nx * o1, b[1] + nz * o1];
        const Y = (q) => gy(q[0], q[1]) + dy;
        out.push(A0[0], Y(A0), A0[1], B0[0], Y(B0), B0[1], B1[0], Y(B1), B1[1], A0[0], Y(A0), A0[1], B1[0], Y(B1), B1[1], A1[0], Y(A1), A1[1]);
      };
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if (onField((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue;
        const pr = prj(a[0], a[1]);
        if (Math.abs(pr.d) > 1600 || pr.s < -1600 || pr.s > T.length + 1600) continue;
        strip(band, a, b, -3.2, 3.2, 0.25);
        strip(ruts, a, b, -1.15, -0.55, 0.3);
        strip(ruts, a, b, 0.55, 1.15, 0.3);
      }
      const mk = (list, material) => {
        if (!list.length) return;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(list.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3)); // draped flat: lit as the ground is
        const m = new THREE.Mesh(g, material);
        m.receiveShadow = true;
        group.add(m);
      };
      mk(band, pbr('grass_ground', { scale: 3, tint: 0xb4a47e, bright: 1, offset: -1, side: THREE.DoubleSide }));
      mk(ruts, pbr('brown_mud_dry', { scale: 1.5, tint: 0x9c8468, offset: -3, side: THREE.DoubleSide }));
      // the train: nine wagons, each with its ox team, near this hole on the trail
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      toW(0, 0);
      let best = 0, bd = Infinity;
      const Li = L.clone().invert();
      const mid = T.pointAt(T.length * 0.5), hc = new THREE.Vector3(mid.x, 0, mid.z).applyMatrix4(Li);
      pts.forEach((p, i) => { const d = Math.hypot(p[0] - hc.x, p[1] - hc.z); if (d < bd) { bd = d; best = i; } });
      const span = 1400;
      live.path = { pts, cum, len: cum[cum.length - 1], s0: Math.max(0, cum[best] - span / 2), span, gy, onField };
      for (let k = 0; k < 3; k++) {
        const set = wagons().group;
        for (const wagon of [...set.children]) {
          const wg = new THREE.Group();
          wagon.position.set(0, 0, 0); wagon.rotation.set(0, 0, 0);
          wg.add(wagon);
          wg.userData.lead = (live.train.length * 19) % span;
          group.add(wg);
          live.train.push(wg);
        }
      }
    },
  };
  return res;
}

export default { wagons, windmill, bison, sodhouse, tradingpost, chimneyrock, trail };
