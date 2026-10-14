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
import { mat, lit, box, cyl, sphere, gable, seeded, canvasTex, FT } from './kit.js';

// ── shared pieces ──

function wheel(r, m, spokes = 12) {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 28), m);
  g.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 10).rotateX(Math.PI / 2), m);
  g.add(hub);
  for (let i = 0; i < spokes; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, r, 5), m);
    s.position.y = r / 2;
    const h = new THREE.Group();
    h.add(s);
    h.rotation.z = (i / spokes) * Math.PI * 2;
    g.add(h);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** A quadruped on capsules: body length L, shoulder height H. */
function beast({ L, H, coat, dark, hump = 0, rnd, headDown = 0, horns = null }) {
  const g = new THREE.Group();
  const cm = mat(coat, { roughness: 0.95 });
  const dm = mat(dark, { roughness: 0.95 });
  const bodyR = H * 0.27;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(bodyR, L * 0.55, 6, 12).rotateX(Math.PI / 2), cm);
  body.position.set(0, H * 0.62, 0);
  g.add(body);
  if (hump) {
    // the bison's shaggy forequarters and hump
    const fore = new THREE.Mesh(new THREE.SphereGeometry(bodyR * 1.45, 14, 10), dm);
    fore.scale.set(1, 1.15 + hump * 0.2, 1.05);
    fore.position.set(0, H * 0.7, -L * 0.24);
    g.add(fore);
  }
  const legH = H * 0.5;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = cyl(0.06 * H, 0.05 * H, legH, z < 0 && hump ? dm : cm, x * bodyR * 0.55, 0, z * L * 0.3, 6);
    g.add(leg);
  }
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.BoxGeometry(H * 0.24, H * 0.26, H * 0.42), hump ? dm : cm);
  skull.position.z = -H * 0.18;
  head.add(skull);
  if (hump) {
    const beard = new THREE.Mesh(new THREE.ConeGeometry(H * 0.1, H * 0.28, 6).rotateX(Math.PI), dm);
    beard.position.set(0, -H * 0.2, -H * 0.12);
    head.add(beard);
  }
  if (horns) {
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(H * 0.035, H * horns, 5), mat(0x2a241e));
      h.rotation.z = s * -1.1;
      h.position.set(s * H * 0.16, H * 0.12, -H * 0.06);
      head.add(h);
    }
  }
  head.position.set(0, H * (0.72 - headDown * 0.45), -L * 0.5 - H * 0.05);
  head.rotation.x = headDown * 0.9;
  g.add(head);
  const tail = cyl(0.02 * H, 0.03 * H, H * 0.45, cm, 0, H * 0.32, L * 0.48, 5);
  g.add(tail);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.rotation.y = (rnd() - 0.5) * 0.3;
  return g;
}

// ── builders ──

/** A short wagon train: three prairie schooners with ox teams, in line. */
function wagons() {
  const g = new THREE.Group();
  const rnd = seeded(1843);
  const canvas = mat(0xe9e1cc, { roughness: 0.9, side: THREE.DoubleSide });
  const bedPaint = [0x3e5b78, 0x4f6a3e, 0x6e5338];
  const gear = mat(0x8e2f22, { roughness: 0.7 });
  const iron = mat(0x2b2724, { roughness: 0.5, metalness: 0.4 });
  for (let w = 0; w < 3; w++) {
    const wagon = new THREE.Group();
    const bed = mat(bedPaint[w], { roughness: 0.8 });
    wagon.add(box(1.15, 0.62, 3.4, bed, 0, 0.95, 0));
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
    // running gear and wheels (rear larger)
    wagon.add(box(0.12, 0.12, 3.6, gear, 0, 0.62, 0));
    for (const [z, r] of [[-1.15, 0.55], [1.2, 0.66]]) {
      for (const s of [-1, 1]) {
        const wh = wheel(r, gear);
        wh.rotation.y = Math.PI / 2;
        wh.position.set(s * 0.72, r, z);
        wagon.add(wh);
      }
      wagon.add(cyl(0.05, 0.05, 1.5, iron, 0, r, z).rotateZ(Math.PI / 2));
    }
    // tongue and two yoke of oxen
    wagon.add(box(0.1, 0.1, 3.2, gear, 0, 0.55, -3.3));
    for (let k = 0; k < 2; k++) {
      for (const s of [-1, 1]) {
        const coat = [0x7a4a2a, 0x5a3a22, 0xc7b8a0, 0x3a2a20][Math.floor(rnd() * 4)];
        const ox = beast({ L: 2.1, H: 1.45, coat, dark: coat, rnd, horns: 0.32 });
        ox.position.set(s * 0.55, 0, -3.6 - k * 2.6);
        wagon.add(ox);
      }
      wagon.add(box(1.6, 0.12, 0.14, mat(0x6b4a2c), 0, 1.25, -3.1 - k * 2.6));
    }
    wagon.position.set(Math.sin(w * 0.8) * 3, 0, w * 13);
    wagon.rotation.y = Math.sin(w * 0.8) * 0.12;
    g.add(wagon);
  }
  return { group: g, glow: [] };
}

/** Aermotor-style steel windmill with an 8 ft wheel and a stock tank. */
function windmill() {
  const g = new THREE.Group();
  const steel = mat(0x9da3a6, { metalness: 0.6, roughness: 0.45 });
  const H = 33 * FT;
  const spread = 1.8;
  // four legs leaning in to the head
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const a = new THREE.Vector3(x * spread, 0, z * spread), b = new THREE.Vector3(x * 0.22, H, z * 0.22);
    const len = a.distanceTo(b);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, len, 6), steel);
    leg.position.copy(a).lerp(b, 0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    leg.castShadow = true;
    g.add(leg);
  }
  // girts at five levels
  for (let i = 1; i <= 5; i++) {
    const y = (i / 6) * H;
    const w = spread - (spread - 0.22) * (y / H);
    for (const r of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const girt = new THREE.Mesh(new THREE.BoxGeometry(w * 2, 0.04, 0.04), steel);
      girt.position.set(Math.sin(r) * w, y, Math.cos(r) * w);
      girt.rotation.y = r;
      g.add(girt);
    }
  }
  // head: wheel of 18 sails, tail vane
  const head = new THREE.Group();
  head.position.y = H + 0.3;
  head.add(box(0.3, 0.3, 0.7, mat(0x5d6164, { metalness: 0.5, roughness: 0.5 }), 0, -0.15, 0));
  const rotor = new THREE.Group();
  rotor.position.z = -0.45;
  const sailMat = mat(0xb9bec0, { metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide });
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
  const vane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), mat(0xd9dcdc, { metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide }));
  vane.rotation.y = Math.PI / 2;
  vane.position.set(0, 0.15, 1.5);
  head.add(vane, box(0.05, 0.05, 1.3, steel, 0, -0.05, 0.8));
  head.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.add(head);
  // pump rod and a round galvanised stock tank
  g.add(cyl(0.025, 0.025, H, steel, 0, 0, 0, 5));
  const tank = cyl(1.8, 1.8, 0.6, mat(0xa7acad, { metalness: 0.55, roughness: 0.5 }), 3.2, 0, 0.5, 28);
  g.add(tank);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.75, 28).rotateX(-Math.PI / 2), mat(0x3d5560, { roughness: 0.1, metalness: 0.2 }));
  water.position.set(3.2, 0.52, 0.5);
  g.add(water);
  return {
    group: g,
    glow: [],
    update(t, dt) { rotor.rotation.z -= dt * 2.4; },
  };
}

/** A small herd of grazing bison. */
function bison() {
  const g = new THREE.Group();
  const rnd = seeded(1871);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const bull = rnd() < 0.35;
    const calf = !bull && rnd() < 0.25;
    const H = bull ? 1.8 : calf ? 1.05 : 1.5;
    const b = beast({ L: H * 1.75, H, coat: calf ? 0x8a5a33 : 0x5a4130, dark: calf ? 0x7a4e2c : 0x2f2219, hump: calf ? 0.2 : 1, rnd, headDown: rnd() < 0.6 ? 1 : 0.2, horns: calf ? null : 0.16 });
    const a = rnd() * Math.PI * 2, r = 4 + Math.sqrt(rnd()) * 22;
    b.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    b.rotation.y = rnd() * Math.PI * 2;
    g.add(b);
  }
  return { group: g, glow: [] };
}

function sodTexture() {
  return canvasTex(256, 256, (c, w, h) => {
    const rnd = seeded(7);
    c.fillStyle = '#4a3b2a';
    c.fillRect(0, 0, w, h);
    const rows = 10, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? 0.5 : 0;
      for (let k = -1; k < 4; k++) {
        const x = (k + off) * (w / 3);
        const v = 70 + rnd() * 40;
        c.fillStyle = `rgb(${v + 20},${v},${v * 0.6})`;
        c.fillRect(x + 2, r * rh + 2, w / 3 - 4, rh - 4);
        // grass roots curling out of each sod block
        c.fillStyle = `rgba(110,120,60,${0.4 + rnd() * 0.3})`;
        c.fillRect(x + 2, r * rh + 2, w / 3 - 4, 3);
      }
    }
  }, [2, 1]);
}

/** A plains sod house with a sod roof, plank door and two small windows. */
function sodhouse() {
  const g = new THREE.Group();
  const sod = new THREE.MeshStandardMaterial({ map: sodTexture(), roughness: 1 });
  const roofSod = mat(0x6d6b3d, { roughness: 1 });
  const wood = mat(0x6b5038, { roughness: 0.9 });
  const glass = lit(0x2a2f33, 0xffc070, { night: 1.2, roughness: 0.3 });
  const W = 6.2, D = 5, Hh = 2.3;
  g.add(box(W, Hh, D, sod));
  g.add(gable(W + 0.6, 1.3, D + 0.6, roofSod, 0, Hh, 0));
  // grass tussocks along the ridge and eaves
  const rnd = seeded(11);
  for (let i = 0; i < 26; i++) {
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4).scale(1.4, 0.45, 1.1), mat(0x7f7d44, { roughness: 1 }));
    const side = rnd() < 0.5 ? -1 : 1;
    const u = rnd();
    tuft.position.set((rnd() - 0.5) * W, Hh + 0.1 + u * 1.2, side * (D / 2 + 0.3) * (1 - u));
    g.add(tuft);
  }
  g.add(box(0.9, 1.9, 0.08, wood, 0.8, 0, D / 2 + 0.01));
  for (const x of [-1.6, 2.2]) g.add(box(0.7, 0.6, 0.06, glass, x, 1.1, D / 2 + 0.01));
  g.add(cyl(0.09, 0.09, 1.2, mat(0x2a2522, { metalness: 0.5 }), -1.8, Hh + 0.8, -0.6, 8));
  // a woodpile of buffalo chips and a water barrel
  g.add(cyl(0.3, 0.3, 0.9, wood, 3.6, 0, 1.6, 10));
  return { group: g, glow: [glass] };
}

/** A log trading post with a porch, hitching rail, barrels and a painted sign. */
function tradingpost() {
  const g = new THREE.Group();
  const log = mat(0x7a5f45, { roughness: 0.95 });
  const dark = mat(0x4b3a2b, { roughness: 0.9 });
  const glass = lit(0x2a2f33, 0xffc070, { night: 1.2, roughness: 0.3 });
  const W = 10, D = 6.5, H = 3;
  // stacked logs on all four walls
  for (let i = 0; i < 11; i++) {
    const y = 0.14 + i * 0.27;
    for (const s of [-1, 1]) {
      g.add(cyl(0.15, 0.15, W + 0.5, log, 0, 0, 0, 8).rotateZ(Math.PI / 2).translateX(-y).translateZ(s * D / 2));
      g.add(cyl(0.15, 0.15, D + 0.5, log, 0, 0, 0, 8).rotateX(Math.PI / 2).translateZ(y).translateX(s * W / 2));
    }
  }
  g.add(box(W - 0.3, H, D - 0.3, dark));
  // low gable, shake roof
  g.add(gable(W + 1, 1.5, D + 1.2, mat(0x5c4b3c, { roughness: 1 }), 0, H, 0));
  // front porch
  g.add(box(W, 0.2, 2.2, mat(0x8a6d50), 0, 0, D / 2 + 1.1));
  for (const x of [-4.6, -1.5, 1.5, 4.6]) g.add(cyl(0.1, 0.1, 2.6, log, x, 0.2, D / 2 + 2.05, 8));
  g.add(box(W + 0.4, 0.12, 2.6, mat(0x5c4b3c), 0, 2.8, D / 2 + 1.1));
  g.add(box(1, 2, 0.08, dark, 0, 0.2, D / 2 + 0.02));
  for (const x of [-3, 3]) g.add(box(1, 0.8, 0.06, glass, x, 1.1, D / 2 + 0.02));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.8), new THREE.MeshStandardMaterial({
    roughness: 0.9,
    map: canvasTex(512, 96, (c, w, h) => {
      c.fillStyle = '#e8dcc0'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#5a2a1a'; c.font = '700 54px Georgia, serif'; c.textAlign = 'center';
      c.fillText('TRADING POST', w / 2, 70);
    }),
  }));
  sign.position.set(0, 3.25, D / 2 + 2.42);
  g.add(sign);
  // hitching rail and barrels
  g.add(box(4, 0.1, 0.1, log, -2, 1, D / 2 + 4.2));
  for (const x of [-4, 0]) g.add(cyl(0.08, 0.08, 1.05, log, x, 0, D / 2 + 4.2, 6));
  for (const [x, z] of [[4.2, 4.3], [4.9, 4.6], [4.4, 5.3]]) g.add(cyl(0.32, 0.28, 0.85, mat(0x6e5236), x, 0, D / 2 + z - 2.5, 10));
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
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.y = -4;
  mesh.castShadow = true;
  g.add(mesh);
  return { group: g, glow: [], haze: [m] };
}

export default { wagons, windmill, bison, sodhouse, tradingpost, chimneyrock };
