// The Delmar Loop, University City: a block of two- and three-storey brick
// storefronts along Delmar Boulevard with Blueberry Hill and the Tivoli
// Theatre, the Loop Trolley running on its rails, brass Walk of Fame stars in
// the sidewalk, and Harry Weber's 8-foot bronze of Chuck Berry (2011) in a
// small plaza across the street. The street runs along local Z; the
// storefronts face +X, toward the golf hole.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat as baseMat, lit, box, cyl, sphere, seeded, canvasTex, facadeMaterial, person } from './kit.js';

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

/** A storefront building: brick body, cornice, glass shopfront, awning. */
function building(g, z0, width, storeys, brick, rnd, glow, { awning = null, lamp = '#ffd9a0' } = {}) {
  const h = 4.6 + storeys * 3.6;
  const depth = 18;
  const facade = facadeMaterial(brick, { cols: Math.max(3, Math.round(width / 3)), rows: storeys, win: '#28313b', lamp, frame: '#d8cbb4', seed: Math.floor(rnd() * 1e6) });
  glow.push(facade);
  // brick mass, with the window facade as a plane on the street (+X) side
  const body = new THREE.Mesh(new THREE.BoxGeometry(depth, h - 4.6, width), mat(brick));
  body.position.set(FRONT_X - depth / 2, 4.6 + (h - 4.6) / 2, z0 + width / 2);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(width, h - 4.6), facade);
  front.rotation.y = Math.PI / 2;
  front.position.set(FRONT_X + 0.02, 4.6 + (h - 4.6) / 2, z0 + width / 2);
  g.add(front);
  // ground floor: dark base with a lit shopfront
  const shop = lit(0x2a3036, 0xffd29a, { night: 1.3, roughness: 0.2, metalness: 0.3 });
  glow.push(shop);
  g.add(box(depth, 4.6, width, mat(0x3a2f2a), FRONT_X - depth / 2 - 0.2, 0, z0 + width / 2));
  g.add(box(0.3, 3.2, width - 1.4, shop, FRONT_X + 0.05, 0.4, z0 + width / 2));
  // cornice and parapet
  const stone = mat(0xd9ccb4, { roughness: 0.8 });
  g.add(box(1.1, 0.7, width + 0.4, stone, FRONT_X + 0.3, h - 0.2, z0 + width / 2));
  g.add(box(0.8, 0.4, width, stone, FRONT_X + 0.2, 4.4, z0 + width / 2));
  if (awning) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, width - 1.6), mat(awning, { roughness: 0.9 }));
    a.position.set(FRONT_X + 1.2, 3.9, z0 + width / 2);
    a.rotation.z = -0.28;
    a.castShadow = true;
    g.add(a);
  }
  return h;
}

/** The Loop Trolley car: a heritage streetcar on 4 ft 8½ in track. */
function trolley() {
  const t = new THREE.Group();
  const cream = mat(0xece2c6, { roughness: 0.5 });
  const red = mat(0x8e2a24, { roughness: 0.45 });
  const roof = mat(0x3c3c3c, { roughness: 0.7 });
  const glass = lit(0x253039, 0xffe2b0, { night: 1.0, roughness: 0.1, metalness: 0.4 });
  t.add(box(2.6, 1.0, 14, red, 0, 0.5, 0));
  t.add(box(2.6, 1.6, 14, cream, 0, 1.5, 0));
  t.add(box(2.66, 1.0, 12.6, glass, 0, 1.75, 0));
  t.add(box(2.7, 0.3, 14.2, roof, 0, 3.1, 0));
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 13.6, 16, 1, false, 0, Math.PI), roof);
  top.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  top.scale.set(1, 1, 0.3);
  top.position.y = 3.35;
  t.add(top);
  for (const z of [-4.6, 4.6]) t.add(box(2.0, 0.5, 2.4, mat(0x222222), 0, 0.15, z));
  // trolley pole up to the wire
  const pole = cyl(0.04, 0.04, 2.8, mat(0x222222), 0, 3.4, 3.5, 6);
  pole.rotation.x = -0.65;
  t.add(pole);
  t.traverse((o) => { if (o.isMesh) o.castShadow = true; });
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
  const asphalt = mat(0x2b2d30, { roughness: 0.95 });
  const walk = mat(0xb9b1a3, { roughness: 0.9 });
  g.add(box(14, 0.06, 220, asphalt, STREET_X, 0, 0));
  g.add(box(4.2, 0.18, 220, walk, FRONT_X + 2.1, 0, 0));
  g.add(box(4.6, 0.18, 220, walk, STREET_X + 9.3, 0, 0));
  const rail = mat(0x8a8d92, { metalness: 0.8, roughness: 0.35 });
  for (const x of [STREET_X - 0.72, STREET_X + 0.72]) g.add(box(0.08, 0.1, 220, rail, x, 0.06, 0));
  // lane markings
  const paint = mat(0xe8dc9a, { roughness: 0.8 });
  for (let z = -105; z < 105; z += 8) g.add(box(0.15, 0.07, 3.5, paint, STREET_X + 3.4, 0.02, z), box(0.15, 0.07, 3.5, paint, STREET_X - 3.4, 0.02, z));

  // ── buildings, south to north ──
  const bricks = ['#8a4a36', '#9a5a3c', '#7d4434', '#a8705a', '#6f3d30', '#b88a64', '#8c5640', '#7a5444'];
  let z = -104;
  let idx = 0;
  const marks = {};
  while (z < 100) {
    const width = 9 + Math.floor(rnd() * 3) * 3;
    const name = z > -8 && z < 6 ? 'blueberry' : z > 22 && z < 40 ? 'tivoli' : null;
    if (name === 'blueberry' && !marks.blueberry) {
      marks.blueberry = z;
      building(g, z, 16, 2, '#7b2f26', rnd, glow, { awning: 0x1d2a3a });
      z += 16;
      continue;
    }
    if (name === 'tivoli' && !marks.tivoli) {
      marks.tivoli = z;
      building(g, z, 18, 3, '#c9b48e', rnd, glow, { lamp: '#ffe6b0' });
      z += 18;
      continue;
    }
    const storeys = rnd() < 0.55 ? 2 : 3;
    const awn = rnd() < 0.6 ? [0x2f4f3a, 0x5a2a28, 0x23364d, 0x6b5a2a][Math.floor(rnd() * 4)] : null;
    building(g, z, width, storeys, bricks[idx++ % bricks.length], rnd, glow, { awning: awn });
    z += width + 0.4;
  }

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
  const granite = mat(0x6f6a66, { roughness: 0.55 });
  plaza.add(box(10, 0.22, 12, mat(0x8d877f, { roughness: 0.7 }), 0, 0, 0));
  plaza.add(cyl(1.0, 1.1, 1.2, granite, 0, 0.2, 0, 24));
  const bronze = mat(0x6b4a2c, { metalness: 0.75, roughness: 0.38 });
  const cb = chuckBerry(bronze);
  cb.position.set(0, 1.4, 0);
  cb.rotation.y = -Math.PI / 2 + 0.3; // facing across Delmar toward Blueberry Hill
  plaza.add(cb);
  const uplight = lit(0x222222, 0xfff0d0, { night: 2 });
  glow.push(uplight);
  for (const a of [0.8, 2.4, 4.0, 5.6]) plaza.add(cyl(0.12, 0.12, 0.1, uplight, Math.cos(a) * 1.5, 0.22, Math.sin(a) * 1.5, 8));
  for (const [x, zz] of [[-3.6, -4.6], [3.6, -4.6], [-3.6, 4.6], [3.6, 4.6]]) {
    plaza.add(cyl(0.18, 0.24, 3.2, mat(0x4d3a28), x, 0.2, zz, 8));
    const crown = sphere(1.8, mat(0x4f7a2e, { roughness: 0.9 }), x, 4.4, zz, 10);
    crown.scale.y = 0.85;
    plaza.add(crown);
  }
  plaza.position.set(STREET_X + 15, 0, bz - 1);
  g.add(plaza);

  // ── street lamps, trees, overhead wire poles ──
  const iron = mat(0x1e2226, { metalness: 0.5, roughness: 0.5 });
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
  const leaf = mat(0x4b7230, { roughness: 0.9 });
  const trunk = mat(0x4d3a28);
  for (let zz = -95; zz <= 95; zz += 16) {
    const x = STREET_X + 10.4;
    g.add(cyl(0.14, 0.2, 2.6, trunk, x, 0.18, zz, 6));
    const c = sphere(1.6 + rnd() * 0.5, leaf, x, 3.8, zz, 9);
    c.scale.y = 0.9;
    g.add(c);
  }

  // ── people on the sidewalks ──
  const shirts = [0x2d5d8a, 0x9a3b30, 0xdedad0, 0x2f6e4c, 0xd9a43a, 0x3a3a46, 0x7a4a8c];
  const walkers = [];
  for (let i = 0; i < 26; i++) {
    const p = person(shirts[i % shirts.length], rnd);
    const side = i % 2;
    const x = side ? STREET_X + 8.2 + rnd() * 1.6 : FRONT_X + 1.2 + rnd() * 1.6;
    const zz = -100 + rnd() * 200;
    p.position.set(x, 0.18, zz);
    const dir = rnd() < 0.5 ? 1 : -1;
    p.rotation.y = dir > 0 ? 0 : Math.PI;
    g.add(p);
    walkers.push({ p, dir, speed: 1.0 + rnd() * 0.5, z0: zz });
  }
  // a few people gathered at the statue
  for (let i = 0; i < 5; i++) {
    const p = person(shirts[(i + 3) % shirts.length], rnd);
    const a = (i / 5) * Math.PI * 1.4 - 0.7;
    p.position.set(STREET_X + 15 + Math.cos(a) * 3.2 - 1, 0.22, bz - 1 + Math.sin(a) * 3.2);
    p.lookAt(STREET_X + 15, 0.22, bz - 1);
    g.add(p);
  }

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
    update(t, dt) {
      // trolley: runs the block, pauses at each end
      if (wait > 0) wait -= dt;
      else {
        tz0 += dir * dt * 6.5;
        if (tz0 > 85 || tz0 < -85) { dir = -dir; wait = 6; tz0 = Math.max(-85, Math.min(85, tz0)); }
      }
      tr.group.position.z = tz0;
      for (const w of walkers) {
        w.p.position.z += w.dir * w.speed * dt;
        if (w.p.position.z > 104) w.p.position.z = -104;
        if (w.p.position.z < -104) w.p.position.z = 104;
        w.p.position.y = 0.18 + Math.abs(Math.sin(t * 6 * w.speed + w.z0)) * 0.03;
      }
    },
  };
}
