// The Delmar Loop, University City: a block of two- and three-storey brick
// storefronts along Delmar Boulevard with Blueberry Hill and the Tivoli
// Theatre, the Loop Trolley running on its rails, brass Walk of Fame stars in
// the sidewalk, and Harry Weber's 8-foot bronze of Chuck Berry (2011) in a
// small plaza across the street. The street runs along local Z; the
// storefronts face +X, toward the golf hole.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat as baseMat, lit, box, cyl, sphere, seeded, canvasTex, tree, SLOT } from './kit.js';
import { pbr } from '../../scene/pbr.js';
import { crowdAt } from '../../scene/crowd.js';
import { Batch, bx, place } from './riverfront.js';
import { mergeByMaterial } from '../../scene/merge.js';

// share one material per colour/options so the block stays cheap to draw
const matCache = new Map();
const mat = (color, opts = {}) => {
  const k = `${color}|${JSON.stringify(opts)}`;
  if (!matCache.has(k)) matCache.set(k, baseMat(color, opts));
  return matCache.get(k);
};

const STREET_X = 4; // centre line of Delmar Blvd (local x)
const FRONT_X = -6; // building fronts

function signTexture(text, { bg = '#1a0f0c', fg = '#ff5a4a', glow = '#ff9b8a', w = 512, h = 128, font = 'bold 76px Georgia' } = {}) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = glow; g.shadowBlur = 18;
    g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 4);
    g.shadowBlur = 0;
  });
}

// the Loop's brick in its real colours: red brick in a few firings, and the
// cream terra cotta of the Tivoli
const BRICK = {
  '#8a4a36': ['red_bricks_02', 0xffffff], '#9a5a3c': ['red_bricks_02', 0xffe2cc], '#7d4434': ['red_bricks_02', 0xd8c8c0],
  '#a8705a': ['red_bricks_02', 0xffd8c0], '#6f3d30': ['red_bricks_02', 0xb8a8a0], '#b88a64': ['white_sandstone_bricks', 0xe8c8a0],
  '#8c5640': ['red_bricks_02', 0xf0d8c8], '#7a5444': ['red_bricks_02', 0xc8b8b0], '#7b2f26': ['red_bricks_02', 0xd8b0a8], '#c9b48e': ['white_sandstone_bricks', 0xfff0d8],
};
const brickMat = (c) => { const [id, tint] = BRICK[c] || ['red_bricks_02', 0xffffff]; return pbr(id, { scale: 1.6, tint }); };

/** A storefront building: brick body with real windows, cornice, glass shopfront, awning. */
function building(B, M, z0, width, storeys, brick, rnd, { awning = null } = {}) {
  const h = 4.6 + storeys * 3.6;
  const depth = 18, zc = z0 + width / 2, wall = brickMat(brick);
  B.add(wall, bx(depth, h - 4.6, width, FRONT_X - depth / 2, 4.6, zc));
  B.add(M.roof, bx(depth - 0.4, 0.12, width - 0.4, FRONT_X - depth / 2, h, zc)); // tar-and-gravel roof inside the parapet
  // the upper floors' windows: glass set in the brick, stone sills and lintels, some lit
  const cols = Math.max(3, Math.round(width / 3)), bay = width / cols;
  for (let r = 0; r < storeys; r++) for (let c = 0; c < cols; c++) {
    const y = 4.6 + r * 3.6 + 0.9, zz = z0 + (c + 0.5) * bay;
    B.add(rnd() < 0.5 ? M.lamp : M.glass, bx(0.1, 2.0, bay * 0.5, FRONT_X + 0.02, y, zz));
    B.add(M.stone, bx(0.3, 0.14, bay * 0.6, FRONT_X + 0.1, y - 0.14, zz), bx(0.24, 0.3, bay * 0.6, FRONT_X + 0.08, y + 2.0, zz));
  }
  // ground floor: dark-framed shopfront over a bulkhead, the door recessed
  B.add(M.frame, bx(depth, 4.6, width, FRONT_X - depth / 2 - 0.2, 0, zc));
  B.add(M.shop, bx(0.12, 2.9, width - 1.6, FRONT_X + 0.02, 0.7, zc));
  B.add(M.frame, bx(0.2, 0.7, width - 1.4, FRONT_X + 0.06, 0, zc));
  for (let k = 0; k <= Math.floor(width / 3); k++) B.add(M.frame, bx(0.16, 2.9, 0.12, FRONT_X + 0.1, 0.7, z0 + 0.8 + k * ((width - 1.6) / Math.floor(width / 3))));
  // the cornice and the band over the shopfront
  B.add(M.stone, bx(1.1, 0.7, width + 0.4, FRONT_X + 0.3, h - 0.2, zc));
  B.add(M.stone, bx(0.8, 0.4, width, FRONT_X + 0.2, 4.4, zc));
  if (awning) B.add(M.awning(awning), place(new THREE.BoxGeometry(2.4, 0.15, width - 1.6), FRONT_X + 1.2, 3.9, zc, 0, 1, 1, 1, 0, -0.28));
  return h;
}

/** The Loop Trolley car: a heritage-style streetcar on 4 ft 8½ in track. */
function trolley() {
  const t = new THREE.Group();
  const cream = pbr('metal_plate', { scale: 1.5, tint: 0xf6ecd0, bright: 1.5, metal: 0.15 });
  const red = pbr('metal_plate', { scale: 1.5, tint: 0xb83a30, metal: 0.15 });
  const roof = pbr('metal_plate', { scale: 1.5, tint: 0x4a4a4c, metal: 0.3 });
  const dark = pbr('metal_plate', { scale: 1, tint: 0x222426, metal: 0.5 });
  const glass = lit(0x253039, 0xffe2b0, { night: 1.0, roughness: 0.06, metalness: 0.5 });
  const B = new Batch();
  // the body: red dash and lower panels, cream window band with its posts, the clerestory roof
  B.add(red, bx(2.6, 1.0, 14, 0, 0.5, 0));
  B.add(cream, bx(2.6, 0.3, 14, 0, 1.5, 0), bx(2.6, 0.35, 14, 0, 2.75, 0));
  B.add(glass, bx(2.5, 0.95, 13.8, 0, 1.8, 0));
  for (let k = 0; k <= 10; k++) B.add(cream, bx(2.64, 0.95, 0.16, 0, 1.8, -6.9 + k * 1.38));
  B.add(roof, bx(2.7, 0.2, 14.2, 0, 3.1, 0), bx(1.4, 0.35, 11, 0, 3.3, 0));
  B.add(roof, place(new THREE.CylinderGeometry(1.35, 1.35, 14.2, 16, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).scale(1, 0.25, 1), 0, 3.3, 0));
  // the trucks: frames and four wheels each, the fenders, the pole up to the wire
  for (const z of [-4.6, 4.6]) {
    B.add(dark, bx(2.0, 0.4, 2.4, 0, 0.3, z));
    for (const dz of [-0.75, 0.75]) B.add(dark, place(new THREE.CylinderGeometry(0.33, 0.33, 1.6, 12).rotateZ(Math.PI / 2), 0, 0.33, z + dz));
  }
  B.add(dark, place(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 6).translate(0, 1.4, 0), 0, 3.4, 3.5, 0, 1, 1, 1, -0.65));
  B.build(t);
  return { group: t, glow: [glass] };
}

/** Chuck Berry in bronze: mid-performance, guitar slung low, leaning into a step. */
function chuckBerry(bronze) {
  const f = new THREE.Group();
  const H = 2.44; // 8 ft
  const u = H / 1.8; // scale from a 1.8 m figure
  const limb = (r0, r1, len, x, y, z, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1 * u, r0 * u, len * u, 10).translate(0, -len * u / 2, 0), bronze);
    m.position.set(x * u, y * u, z * u);
    m.rotation.set(rx, 0, rz);
    m.castShadow = true;
    f.add(m);
    return m;
  };
  // legs: one forward, knee bent (the famous step)
  limb(0.075, 0.06, 0.48, -0.1, 0.92, 0.0, 0.5, 0.05);
  limb(0.06, 0.05, 0.46, -0.1, 0.5, 0.22, -0.45, 0.02);
  limb(0.075, 0.06, 0.5, 0.1, 0.92, 0.0, -0.25, -0.05);
  limb(0.06, 0.05, 0.46, 0.1, 0.48, -0.12, 0.15, -0.03);
  // torso leaning back slightly, jacket
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * u, 0.15 * u, 0.62 * u, 12), bronze);
  torso.position.set(0, 1.25 * u, -0.04 * u);
  torso.rotation.x = -0.18;
  torso.castShadow = true;
  f.add(torso);
  f.add(sphere(0.105 * u, bronze, 0, 1.68 * u, -0.1 * u, 16));
  // pompadour
  const hair = sphere(0.09 * u, bronze, 0, 1.76 * u, -0.07 * u, 12);
  hair.scale.set(1, 0.6, 1.3);
  f.add(hair);
  // arms: one on the neck, one strumming
  limb(0.05, 0.04, 0.32, -0.22, 1.5, -0.04, -0.6, 0.9);
  limb(0.04, 0.035, 0.3, -0.48, 1.36, 0.14, -1.2, 0.3);
  limb(0.05, 0.04, 0.32, 0.22, 1.5, -0.04, 0.2, -0.3);
  limb(0.04, 0.035, 0.28, 0.3, 1.22, 0.04, -1.1, 0.2);
  // the guitar (semi-hollow body + neck) across the body
  const gtr = new THREE.Group();
  const bodyG = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * u, 0.2 * u, 0.06 * u, 20), bronze);
  bodyG.rotation.x = Math.PI / 2;
  bodyG.scale.set(1, 1, 1.25);
  gtr.add(bodyG);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.62 * u, 0.05 * u, 0.03 * u), bronze);
  neck.position.x = -0.42 * u;
  gtr.add(neck);
  gtr.position.set(0.02 * u, 1.12 * u, 0.2 * u);
  gtr.rotation.z = 0.5;
  f.add(gtr);
  return f;
}

export default function build() {
  const g = new THREE.Group();
  const glow = [];
  const rnd = seeded(6504);

  // ── street, sidewalks, rails ──
  const asphalt = pbr('asphalt_02', { scale: 4, tint: 0x9a9ea4 });
  const walk = pbr('brushed_concrete', { scale: 2.5, tint: 0xe8e2d8, bright: 1.2 });
  g.add(box(14, 0.06, 220, asphalt, STREET_X, 0, 0));
  g.add(box(4.2, 0.18, 220, walk, FRONT_X + 2.1, 0, 0));
  g.add(box(4.6, 0.18, 220, walk, STREET_X + 9.3, 0, 0));
  const rail = pbr('metal_plate', { scale: 1, tint: 0x9a9ca0, metal: 0.85, rough: 0.5 });
  for (const x of [STREET_X - 0.72, STREET_X + 0.72]) g.add(box(0.08, 0.1, 220, rail, x, 0.06, 0));
  // lane markings
  const paint = mat(0xe8dc9a, { roughness: 0.8 });
  for (let z = -105; z < 105; z += 8) g.add(box(0.15, 0.07, 3.5, paint, STREET_X + 3.4, 0.02, z), box(0.15, 0.07, 3.5, paint, STREET_X - 3.4, 0.02, z));

  // ── buildings, south to north ──
  const bricks = ['#8a4a36', '#9a5a3c', '#7d4434', '#a8705a', '#6f3d30', '#b88a64', '#8c5640', '#7a5444'];
  const M = {
    stone: pbr('white_sandstone_bricks', { scale: 1.2, tint: 0xf0e4d0 }),
    frame: pbr('metal_plate', { scale: 1, tint: 0x2c2826, metal: 0.4 }),
    roof: pbr('gravel_stones', { scale: 1.5, tint: 0x80807c }),
    glass: mat(0x28313b, { roughness: 0.08, metalness: 0.6 }),
    lamp: lit(0x28313b, 0xffd9a0, { night: 1.1, roughness: 0.08, metalness: 0.6 }),
    shop: lit(0x2a3036, 0xffd29a, { night: 1.3, roughness: 0.1, metalness: 0.5 }),
    awning: (c) => mat(c, { roughness: 0.9 }),
  };
  glow.push(M.lamp, M.shop);
  const BB = new Batch();
  let z = -104;
  let idx = 0;
  const marks = {};
  while (z < 100) {
    const width = 9 + Math.floor(rnd() * 3) * 3;
    const name = z > -8 && z < 6 ? 'blueberry' : z > 22 && z < 40 ? 'tivoli' : null;
    if (name === 'blueberry' && !marks.blueberry) {
      marks.blueberry = z;
      building(BB, M, z, 16, 2, '#7b2f26', rnd, { awning: 0x1d2a3a });
      z += 16;
      continue;
    }
    if (name === 'tivoli' && !marks.tivoli) {
      marks.tivoli = z;
      building(BB, M, z, 18, 3, '#c9b48e', rnd);
      z += 18;
      continue;
    }
    const storeys = rnd() < 0.55 ? 2 : 3;
    const awn = rnd() < 0.6 ? [0x2f4f3a, 0x5a2a28, 0x23364d, 0x6b5a2a][Math.floor(rnd() * 4)] : null;
    building(BB, M, z, width, storeys, bricks[idx++ % bricks.length], rnd, { awning: awn });
    z += width + 0.4;
  }

  BB.build(g);

  // Blueberry Hill: neon sign over the door + blade sign
  const bz = marks.blueberry + 8;
  const bbSign = new THREE.MeshStandardMaterial({ map: signTexture('BLUEBERRY HILL', { fg: '#ff5148', glow: '#ff2a1a', font: 'bold 54px Georgia' }), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6 });
  bbSign.emissiveMap = bbSign.map;
  bbSign.userData.night = 1.6;
  glow.push(bbSign);
  const bb = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.6), bbSign);
  bb.rotation.y = Math.PI / 2;
  bb.position.set(FRONT_X + 0.25, 5.6, bz);
  g.add(bb);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.2, 1.4), [bbSign, bbSign, mat(0x1a0f0c), mat(0x1a0f0c), bbSign, bbSign]);
  blade.position.set(FRONT_X + 1.4, 7.6, bz - 5.5);
  g.add(blade);

  // Tivoli Theatre: vertical blade sign and marquee
  const tz = marks.tivoli + 9;
  const tivSign = new THREE.MeshStandardMaterial({
    map: canvasTex(128, 512, (c, w, h) => {
      c.fillStyle = '#7a1414'; c.fillRect(0, 0, w, h);
      c.font = 'bold 74px Georgia'; c.textAlign = 'center'; c.fillStyle = '#ffe9b0';
      c.shadowColor = '#ffcf70'; c.shadowBlur = 16;
      'TIVOLI'.split('').forEach((ch, i) => c.fillText(ch, w / 2, 80 + i * 76));
    }),
    emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6,
  });
  tivSign.emissiveMap = tivSign.map;
  tivSign.userData.night = 1.5;
  glow.push(tivSign);
  const tv = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 1.8), [tivSign, tivSign, mat(0x5a1010), mat(0x5a1010), tivSign, tivSign]);
  tv.position.set(FRONT_X + 1.6, 12.5, tz);
  g.add(tv);
  const marquee = lit(0xf3e7c8, 0xffe7a8, { night: 1.6, roughness: 0.4 });
  glow.push(marquee);
  g.add(box(2.6, 1.4, 12, marquee, FRONT_X + 1.3, 4.6, tz));
  // marquee bulbs
  const bulbMat = lit(0xfff3d0, 0xfff0c0, { night: 2.2 });
  glow.push(bulbMat);
  const bulbGeo = new THREE.SphereGeometry(0.08, 6, 4);
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, 80);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 80; i++) {
    const zz = tz - 6 + (i % 40) * 0.3;
    m4.makeTranslation(FRONT_X + 2.65, 4.62 + (i < 40 ? 0 : 1.4), zz);
    bulbs.setMatrixAt(i, m4);
  }
  g.add(bulbs);

  // ── Walk of Fame: brass stars in both sidewalks ──
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 0.2 : 0.46;
    if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starGeo = new THREE.ShapeGeometry(starShape).rotateX(-Math.PI / 2);
  const brass = mat(0xc9a24a, { metalness: 0.9, roughness: 0.3 });
  const stars = new THREE.InstancedMesh(starGeo, brass, 60);
  for (let i = 0; i < 60; i++) {
    const side = i % 2;
    m4.makeTranslation(side ? STREET_X + 9.3 : FRONT_X + 2.1, 0.19, -100 + Math.floor(i / 2) * 6.8);
    stars.setMatrixAt(i, m4);
  }
  stars.receiveShadow = true;
  g.add(stars);

  // ── Chuck Berry plaza (across the street, toward the hole) ──
  const plaza = new THREE.Group();
  const granite = pbr('granite_wall', { scale: 1.2, tint: 0x8890a0, rough: 0.55 });
  plaza.add(box(10, 0.22, 12, pbr('granite_wall', { scale: 1.5, tint: 0xb8c0d0, bright: 1.2 }), 0, 0, 0));
  plaza.add(cyl(1.0, 1.1, 1.2, granite, 0, 0.2, 0, 24));
  const bronze = mat(0x6b4a2c, { metalness: 0.75, roughness: 0.38 });
  const cb = chuckBerry(bronze);
  cb.position.set(0, 1.4, 0);
  cb.rotation.y = -Math.PI / 2 + 0.3; // facing across Delmar toward Blueberry Hill
  plaza.add(cb);
  const uplight = lit(0x222222, 0xfff0d0, { night: 2 });
  glow.push(uplight);
  for (const a of [0.8, 2.4, 4.0, 5.6]) plaza.add(cyl(0.12, 0.12, 0.1, uplight, Math.cos(a) * 1.5, 0.22, Math.sin(a) * 1.5, 8));
  plaza.position.set(STREET_X + 15, 0, bz - 1);
  // street trees: honey locusts round the plaza and along the sidewalk
  const treeList = [];
  for (const [x, zz] of [[-3.6, -4.6], [3.6, -4.6], [-3.6, 4.6], [3.6, 4.6]]) treeList.push(tree(plaza.position.x + x, 0.2, plaza.position.z + zz, 6.2, 2.0, { slot: SLOT.youngOak }));
  g.add(plaza);

  // ── street lamps, trees, overhead wire poles ──
  const iron = pbr('metal_plate', { scale: 1, tint: 0x2a2e34, metal: 0.6 });
  const lampHead = lit(0xfff1d6, 0xffd9a0, { night: 2.0 });
  glow.push(lampHead);
  const poles = [];
  for (let zz = -100; zz <= 100; zz += 20) {
    for (const x of [FRONT_X + 3.8, STREET_X + 11.2]) {
      poles.push(cyl(0.08, 0.12, 5.2, iron, x, 0.18, zz + (x > 0 ? 10 : 0), 8).geometry.clone().translate(x, 2.78, zz + (x > 0 ? 10 : 0)));
      const lh = sphere(0.32, lampHead, x, 5.6, zz + (x > 0 ? 10 : 0), 10);
      g.add(lh);
    }
    // catenary pole and span wire
    poles.push(new THREE.CylinderGeometry(0.11, 0.14, 7.4, 8).translate(STREET_X + 7.6, 3.7, zz + 5));
    poles.push(new THREE.BoxGeometry(7.0, 0.05, 0.05).translate(STREET_X + 4.1, 6.4, zz + 5));
  }
  poles.push(new THREE.BoxGeometry(0.03, 0.03, 210).translate(STREET_X, 6.38, 0));
  const poleMesh = new THREE.Mesh(mergeGeometries(poles), iron);
  poleMesh.castShadow = true;
  g.add(poleMesh);
  for (let zz = -95; zz <= 95; zz += 16) treeList.push(tree(STREET_X + 10.4, 0.18, zz, 5.8 + rnd() * 1.2, 1.8 + rnd() * 0.5, { slot: SLOT.youngOak }));

  // ── people on the sidewalks and at the statue: the scanned people ──
  const spots = [];
  for (let i = 0; i < 26; i++) {
    const side = i % 2;
    spots.push([side ? STREET_X + 8.2 + rnd() * 1.6 : FRONT_X + 1.2 + rnd() * 1.6, 0.18, -100 + rnd() * 200, rnd() < 0.5 ? 0 : Math.PI]);
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 1.4 - 0.7, x = STREET_X + 15 + Math.cos(a) * 3.2 - 1, zz = bz - 1 + Math.sin(a) * 3.2;
    spots.push([x, 0.22, zz, Math.atan2(STREET_X + 15 - x, bz - 1 - zz)]);
  }
  const people = crowdAt(spots, rnd);
  if (people) g.add(people);

  // everything but the trolley stands still: one draw per material
  mergeByMaterial(g);

  // ── the trolley ──
  const tr = trolley();
  glow.push(...tr.glow);
  tr.group.position.set(STREET_X, 0.1, 0);
  g.add(tr.group);

  g.traverse((o) => { if (o.isMesh && o.geometry.parameters?.height === 0.06) o.castShadow = false; });

  let tz0 = -80, dir = 1, wait = 0;
  return {
    group: g,
    glow,
    trees: treeList,
    update(t, dt) {
      // trolley: runs the block, pauses at each end
      if (wait > 0) wait -= dt;
      else {
        tz0 += dir * dt * 6.5;
        if (tz0 > 85 || tz0 < -85) { dir = -dir; wait = 6; tz0 = Math.max(-85, Math.min(85, tz0)); }
      }
      tr.group.position.z = tz0;
    },
  };
}
