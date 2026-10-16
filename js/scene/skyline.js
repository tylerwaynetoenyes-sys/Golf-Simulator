// Everything beyond the bluff edge: the Gateway Arch and downtown St. Louis on
// the horizon, the far (Missouri) shore, a cable-stayed bridge in the style of
// Alton's Clark Bridge, barge tows working the river, a docked riverboat and a
// distant refinery. Far objects skip scene fog and carry their own
// atmospheric falloff so they stay legible but recede.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYOUT } from './layout.js';
import { GlowPoints } from './glowPoints.js';
import { fbm2 } from './terrain.js';
import { SUN_DIR } from './sky.js';
import { pbr } from './pbr.js';

const FT = 0.3048;
const WATER = LAYOUT.riverY;

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Gateway Arch ────────────────────────────────────────────────────────────
// Centroid curve from the NPS formula: y = 693.8597 - 68.7672 cosh(0.0100333 x) (ft),
// |x| <= 299.2239 ft. Equilateral triangular section tapering 54 ft -> 17 ft.
export function archGeometry(scale) {
  const N = 140;
  const xMax = 299.2239;
  const pts = [], tangents = [], sides = [];
  for (let i = 0; i <= N; i++) {
    const x = -xMax + (2 * xMax * i) / N;
    const y = 693.8597 - 68.7672 * Math.cosh(0.0100333 * x) - (693.8597 - 68.7672 * Math.cosh(0.0100333 * xMax));
    pts.push(new THREE.Vector3(x * FT * scale, y * FT * scale, 0));
    const h = y / 625;
    sides.push((54 - 37 * Math.min(1, Math.max(0, h))) * FT * scale);
  }
  for (let i = 0; i <= N; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
    tangents.push(b.clone().sub(a).normalize());
  }
  const positions = [], normals = [], hgt = [];
  const z = new THREE.Vector3(0, 0, 1);
  const ring = (i) => {
    const t = tangents[i];
    const nrm = new THREE.Vector3().crossVectors(z, t).normalize(); // in-plane normal (outward)
    const s = sides[i];
    const R = s / Math.sqrt(3);
    // triangle: one vertex pointing outward, flat face inside
    return [0, 1, 2].map((k) => {
      const ang = (k * 2 * Math.PI) / 3;
      return pts[i].clone()
        .addScaledVector(nrm, Math.cos(ang) * R)
        .addScaledVector(z, Math.sin(ang) * R);
    });
  };
  const rings = pts.map((_, i) => ring(i));
  const top = Math.max(...pts.map((p) => p.y));
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 3; k++) {
      const a = rings[i][k], b = rings[i][(k + 1) % 3], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % 3];
      const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
      if (n.dot(a.clone().sub(pts[i])) < 0) n.negate();
      for (const v of [a, c, b, b, c, d]) {
        positions.push(v.x, v.y, v.z);
        normals.push(n.x, n.y, n.z);
        hgt.push(v.y / top);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(hgt, 1));
  return { geometry: g, top, span: 2 * xMax * FT * scale, pts };
}

export function archMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */`
      attribute float aH;
      varying float vH;
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        vH = aH;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uGlow;
      uniform float uDay;
      uniform vec3 uSunDir;
      varying float vH;
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        // Uplit stainless steel: floodlights at the base wash up the legs.
        float up = mix(1.0, 0.42, smoothstep(0.0, 1.0, vH));
        float facing = 0.55 + 0.45 * max(dot(vN, V), 0.0);
        float facet = 0.8 + 0.2 * step(0.0, vN.x);
        float rim = pow(1.0 - max(dot(vN, V), 0.0), 3.0);
        vec3 steel = vec3(1.0, 0.93, 0.82);
        vec3 col = steel * up * facing * facet * uGlow + vec3(0.9, 0.85, 0.8) * rim * 0.35 * uGlow;
        // Daylight: brushed stainless reflecting the sky, a bright edge where the sun catches it
        float sunl = max(dot(vN, normalize(uSunDir)), 0.0);
        // the face away from the sun reads a darker steel grey against the sky
        vec3 dayc = mix(vec3(0.4, 0.44, 0.5), vec3(0.86, 0.89, 0.93), smoothstep(0.0, 0.8, sunl)) * (0.82 + 0.18 * facing) + vec3(1.0) * pow(sunl, 12.0) * 0.6;
        dayc = mix(dayc, vec3(0.66, 0.75, 0.84), 0.18); // distance haze
        col = mix(col, dayc, uDay);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    uniforms: { uGlow: { value: 1.35 }, uDay: { value: 0 }, uSunDir: { value: SUN_DIR } },
    fog: false,
  });
}

// ── Skyline windows ─────────────────────────────────────────────────────────
function skylineMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */`
      attribute vec3 aInfo; // x seed, y width, z height
      varying vec2 vUv2;
      varying vec3 vInfo;
      varying float vTop;
      varying vec3 vN;
      void main() {
        vInfo = aInfo;
        vN = normal;
        vTop = step(0.9, normal.y);
        vUv2 = vec2(uv.x * aInfo.y, uv.y * aInfo.z);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uDay;
      varying vec2 vUv2;
      varying vec3 vInfo;
      varying float vTop;
      varying vec3 vN;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec3 body = vec3(0.012, 0.014, 0.02) * (0.8 + 0.4 * abs(vN.x));
        vec2 cell = floor(vUv2 / vec2(3.2, 3.6));
        vec2 f = fract(vUv2 / vec2(3.2, 3.6));
        float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.25, f.y) * step(f.y, 0.8);
        float r = h(cell + vInfo.x * 17.0);
        float lit = step(0.58, r);
        // a few windows switch over time
        lit = mix(lit, step(0.5, h(cell + floor(uTime * 0.02 + r * 10.0))), step(0.97, r));
        vec3 warm = mix(vec3(1.0, 0.72, 0.38), vec3(0.75, 0.85, 1.0), step(0.85, h(cell * 1.7)));
        vec3 col = body + warm * win * lit * (0.35 + 0.65 * h(cell * 3.1)) * 0.9 * (1.0 - vTop);
        // crown accents on taller towers
        float crown = smoothstep(vInfo.z - 4.0, vInfo.z - 1.0, vUv2.y) * step(110.0, vInfo.z);
        col += vec3(0.9, 0.95, 1.0) * crown * 0.6 * (1.0 - vTop);
        col *= 0.72;
        // By day: hazy blue-grey towers with glinting glass
        vec3 dayc = vec3(0.4, 0.47, 0.57) * (0.78 + 0.22 * vN.x) + vec3(0.18) * win * step(0.7, h(cell * 5.3));
        dayc = mix(dayc, vec3(0.66, 0.75, 0.84), 0.3);
        col = mix(col, dayc, uDay);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    uniforms: { uTime: { value: 0 }, uDay: { value: 0 } },
    fog: false,
  });
}

function box(w, h, d, x, y, z, seed) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  const n = g.attributes.position.count;
  const info = new Float32Array(n * 3);
  const nrm = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    const across = Math.abs(nrm.getX(i)) > 0.5 ? d : w;
    info.set([seed, across, h], i * 3);
  }
  g.setAttribute('aInfo', new THREE.BufferAttribute(info, 3));
  return g;
}

export function createSkyline(scene, river) {
  const group = new THREE.Group();
  const rand = seeded(1764);
  const steady = new GlowPoints({ minPx: 1.5 });
  const moving = new GlowPoints({ minPx: 2.2, dynamic: true });
  const anim = [];

  // ── Arch ──
  const ARCH_SCALE = 1.45;
  const ARCH_POS = new THREE.Vector3(960, WATER + 3, -5600);
  const arch = archGeometry(ARCH_SCALE);
  const archMesh = new THREE.Mesh(arch.geometry, archMaterial());
  archMesh.position.copy(ARCH_POS);
  archMesh.rotation.y = -0.08;
  group.add(archMesh);
  // base floodlight glow + reflection sources
  for (const sx of [-1, 1]) {
    const bx = ARCH_POS.x + sx * arch.span * 0.5;
    steady.add(bx, ARCH_POS.y + 3, ARCH_POS.z, 0xfff1d6, 26, 0, 0, 2.2);
    river.addLight(new THREE.Vector3(bx, ARCH_POS.y + 60, ARCH_POS.z), 0xffe2b8, 0.75, 4, 10);
  }
  river.addLight(new THREE.Vector3(ARCH_POS.x, ARCH_POS.y + arch.top * 0.85, ARCH_POS.z), 0xffe9c8, 0.55, 3.5, 10);
  // red aviation light at the crown
  steady.add(ARCH_POS.x, ARCH_POS.y + arch.top + 3, ARCH_POS.z, 0xff2a1a, 9, 0.45, 0.1, 1.6);

  // ── Downtown St. Louis ──
  const geos = [];
  const towers = [];
  for (let i = 0; i < 70; i++) {
    const x = ARCH_POS.x + 120 + rand() * 1500 + (rand() < 0.3 ? -500 * rand() : 0);
    const z = ARCH_POS.z - 260 - rand() * 900;
    const tallness = Math.pow(rand(), 2.2);
    const h = 22 + tallness * 165;
    const w = 22 + rand() * 30, d = 20 + rand() * 30;
    geos.push(box(w, h, d, x, WATER, z, rand() * 100));
    if (h > 120) towers.push({ x, z, h });
  }
  // the two signature towers near the Arch
  geos.push(box(34, 180, 34, ARCH_POS.x + 520, WATER, ARCH_POS.z - 420, 3.3));
  geos.push(box(40, 179, 30, ARCH_POS.x + 760, WATER, ARCH_POS.z - 520, 7.7));
  towers.push({ x: ARCH_POS.x + 520, z: ARCH_POS.z - 420, h: 180 }, { x: ARCH_POS.x + 760, z: ARCH_POS.z - 520, h: 179 });
  const skylineMat = skylineMaterial();
  const skyline = new THREE.Mesh(mergeGeometries(geos), skylineMat);
  group.add(skyline);
  for (const t of towers) {
    steady.add(t.x, WATER + t.h + 2, t.z, 0xff3322, 7, 0.5, rand(), 1.4);
    river.addLight(new THREE.Vector3(t.x, WATER + t.h * 0.6, t.z), 0xffc890, 0.25, 2.5, 6);
  }
  river.addLight(new THREE.Vector3(ARCH_POS.x + 600, WATER + 70, ARCH_POS.z - 500), 0xffb36b, 0.4, 9, 8);

  // Wide metro carpet: sodium orange and LED white specks on the horizon
  for (let i = 0; i < 2600; i++) {
    const ang = -0.75 + rand() * 1.55; // radians from straight down-range
    const dist = 3200 + Math.pow(rand(), 0.7) * 11000;
    const x = Math.sin(ang) * dist + 300;
    const z = -Math.cos(ang) * dist - 1400;
    const towardCity = Math.exp(-Math.pow((x - ARCH_POS.x) / 2600, 2));
    if (rand() > 0.25 + 0.75 * towardCity) continue;
    const c = rand() < 0.7 ? 0xffa04a : rand() < 0.5 ? 0xfff0d8 : 0xbfd8ff;
    steady.add(x, WATER + 2 + rand() * 8, z, c, 6 + rand() * 6, rand() < 0.04 ? -0.3 : 0, rand(), 0.55 + rand() * 0.6);
  }

  // ── Far shore: Missouri tree line + scattered lights ──
  const shoreZ = LAYOUT.riverFar - 8;
  const treeGeo = new THREE.PlaneGeometry(16000, 1, 640, 1);
  const tp = treeGeo.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i);
    const topRow = tp.getY(i) > 0;
    const hgt = 9 + 14 * fbm2(x * 0.01, 3.1) + 6 * fbm2(x * 0.08, 9.2);
    tp.setXYZ(i, x, topRow ? WATER + hgt : WATER - 1, shoreZ - (topRow ? 25 : 0));
  }
  treeGeo.computeVertexNormals();
  const treeLineMat = new THREE.MeshBasicMaterial({ color: 0x050806, side: THREE.DoubleSide });
  const treeLine = new THREE.Mesh(treeGeo, treeLineMat);
  group.add(treeLine);
  for (let i = 0; i < 160; i++) {
    const x = -7000 + rand() * 14000;
    const c = rand() < 0.75 ? 0xffb066 : 0xe8f0ff;
    const p = steady.add(x, WATER + 1.5 + rand() * 3, shoreZ - 30 - rand() * 400, c, 3 + rand() * 3, 0, rand(), 0.7 + rand());
    if (i % 5 === 0) river.addLight(new THREE.Vector3(p.x, p.y, p.z), c, 0.22, 1, 2);
  }

  // ── Bridge (cable-stayed, after Alton's Clark Bridge) ──
  const bridge = new THREE.Group();
  const deckY = WATER + 24;
  const length = 1300;
  const deckMat = pbr('brushed_concrete', { scale: 4, tint: 0xa8a6a2 }); // the concrete deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(22, 2.2, length), deckMat);
  deck.position.set(0, deckY, 0);
  bridge.add(deck);
  const pylonMat = pbr('concrete_wall_008', { scale: 5, tint: 0xe2ddd2, bright: 1.3, unique: true, extra: { emissive: 0x2a2620 } }); // cast concrete pylons
  const towerZ = [-length * 0.18, length * 0.18];
  const cableVerts = [];
  for (const tz of towerZ) {
    // single-plane pylon rising through the deck centre
    const pyl = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.6, 110, 8), pylonMat);
    pyl.position.set(0, WATER + 55, tz);
    bridge.add(pyl);
    const pier = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 26, 10), deckMat);
    pier.position.set(0, WATER + 11, tz);
    bridge.add(pier);
    const topY = WATER + 108;
    for (let c = 1; c <= 12; c++) {
      for (const dir of [-1, 1]) {
        const dz = dir * c * 24;
        const ty = topY - c * 2.4;
        cableVerts.push(0, ty, tz, 0, deckY + 1.2, tz + dz);
      }
    }
    steady.add(0, topY + 3, tz, 0xff2a1a, 3.5, 0.6, rand(), 1.4);
  }
  const cableMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0xd6e4ff).multiplyScalar(1.8), transparent: true, opacity: 0.55 });
  const cables = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(cableVerts, 3)),
    cableMat,
  );
  bridge.add(cables);
  const bridgeLamps = [];
  for (let i = 0; i <= 26; i++) {
    const z = -length / 2 + (i * length) / 26;
    for (const sx of [-10.5, 10.5]) bridgeLamps.push(new THREE.Vector3(sx, deckY + 9, z));
  }
  bridge.position.set(880, 0, (LAYOUT.riverNear + LAYOUT.riverFar) / 2 - 40);
  bridge.rotation.y = 0.42;
  bridge.updateMatrixWorld(true);
  bridgeLamps.forEach((p, i) => {
    const w = p.clone().applyMatrix4(bridge.matrixWorld);
    steady.add(w.x, w.y, w.z, 0xffb35c, 2.6, 0, 0, 1.5);
    if (i % 4 === 0) river.addLight(w, 0xffb35c, 0.32, 1.3, 7);
  });
  // traffic: a few headlights / taillights crawling across
  const cars = [];
  for (let i = 0; i < 7; i++) {
    const dir = i % 2 ? 1 : -1;
    const item = moving.add(0, 0, 0, dir > 0 ? 0xfff4e0 : 0xff2a10, 1.6, 0, 0, 1.6);
    cars.push({ item, dir, s: rand(), speed: 0.012 + rand() * 0.01, lane: dir * 3.5 });
  }
  anim.push((t, dt) => {
    for (const c of cars) {
      c.s = (c.s + c.speed * dt * c.dir + 1) % 1;
      const local = new THREE.Vector3(c.lane, deckY + 1.6, -length / 2 + c.s * length);
      local.applyMatrix4(bridge.matrixWorld);
      moving.setPosition(c.item, local.x, local.y, local.z);
    }
  });
  group.add(bridge);

  // ── Barge tows ──
  const hullMat = pbr('rusty_metal_02', { scale: 3, tint: 0x8a7a6e, metal: 0.4 }); // barge steel
  const boatMat = pbr('painted_steel', { scale: 2, tint: 0xece8de, bright: 2, metal: 0.3, unique: true, extra: { emissive: 0x1a1612 } }); // the towboat's white superstructure
  const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc074).multiplyScalar(2.2) });
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

  function makeTow(rows, cols) {
    const g = new THREE.Group();
    const bl = 60, bw = 10.7;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(bl - 1, 3.2, bw - 0.4), hullMat);
        b.position.set(-(r * bl) - bl / 2 - 20, WATER + 1.2, (c - (cols - 1) / 2) * bw);
        g.add(b);
      }
    }
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(40, 3.5, 13), hullMat);
    hull.position.y = WATER + 1.4;
    boat.add(hull);
    for (let d = 0; d < 3; d++) {
      const deckBox = new THREE.Mesh(new THREE.BoxGeometry(22 - d * 5, 3, 11 - d * 1.5), boatMat);
      deckBox.position.set(4 + d * 2, WATER + 4.6 + d * 3, 0);
      boat.add(deckBox);
      const win = new THREE.Mesh(new THREE.BoxGeometry(22.2 - d * 5, 0.9, 11.2 - d * 1.5), winMat);
      win.position.set(4 + d * 2, WATER + 4.9 + d * 3, 0);
      boat.add(win);
    }
    g.add(boat);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(28, 420, 24, 1, true), beamMat);
    beam.rotation.z = -Math.PI / 2; // tip at the lamp, wide end down the tow
    const beamPivot = new THREE.Group();
    beamPivot.position.set(10, WATER + 14, 0);
    beam.position.set(-210, -2, 0);
    beamPivot.add(beam);
    g.add(beamPivot);
    return { group: g, beamPivot, length: rows * bl + 40 };
  }

  const tows = [
    { ...makeTow(4, 3), z: -760, speed: 2.4, dir: 1, x: -1800 },
    { ...makeTow(5, 3), z: -1180, speed: 1.8, dir: -1, x: 1500 },
  ];
  for (const tow of tows) {
    tow.group.rotation.y = tow.dir > 0 ? Math.PI : 0;
    tow.group.position.set(tow.x, 0, tow.z);
    group.add(tow.group);
    // nav lights (moving)
    tow.lights = {
      red: moving.add(0, 0, 0, 0xff2010, 3, 0, 0, 2),
      green: moving.add(0, 0, 0, 0x20ff60, 3, 0, 0, 2),
      white: moving.add(0, 0, 0, 0xffffff, 3, 0, 0, 2),
      amber1: moving.add(0, 0, 0, 0xffaa22, 2.6, 0, 0, 2),
      amber2: moving.add(0, 0, 0, 0xffaa22, 2.6, 0, 0, 2),
      head: moving.add(0, 0, 0, 0xffe6a8, 4, -0.15, 0, 2.5),
    };
    tow.reflect = [
      river.addLight(new THREE.Vector3(), 0xffd090, 0.55, 2.2, 9),
      river.addLight(new THREE.Vector3(), 0xff3020, 0.3, 1, 5),
      river.addLight(new THREE.Vector3(), 0x30ff70, 0.3, 1, 5),
    ];
  }
  const tmp = new THREE.Vector3();
  anim.push((t, dt) => {
    for (const tow of tows) {
      tow.x += tow.speed * tow.dir * dt;
      if (tow.dir > 0 && tow.x > 3200) tow.x = -3200;
      if (tow.dir < 0 && tow.x < -3200) tow.x = 3200;
      tow.group.position.x = tow.x;
      tow.beamPivot.rotation.y = Math.sin(t * 0.13 + tow.z) * 0.35;
      tow.group.updateMatrixWorld(true);
      const L = (lx, ly, lz) => tmp.set(lx, ly, lz).applyMatrix4(tow.group.matrixWorld);
      const set = (item, v) => moving.setPosition(item, v.x, v.y, v.z);
      set(tow.lights.red, L(-tow.length + 20, WATER + 3.5, -16));
      set(tow.lights.green, L(-tow.length + 20, WATER + 3.5, 16));
      set(tow.lights.white, L(12, WATER + 16, 0));
      set(tow.lights.amber1, L(19, WATER + 12, 0));
      set(tow.lights.amber2, L(19, WATER + 10.5, 0));
      set(tow.lights.head, L(-2, WATER + 14.5, 0));
      tow.reflect[0].pos.copy(L(6, WATER + 9, 0));
      tow.reflect[1].pos.copy(L(-tow.length + 20, WATER + 3.5, -16));
      tow.reflect[2].pos.copy(L(-tow.length + 20, WATER + 3.5, 16));
    }
  });

  // ── Riverboat casino, docked on the Alton side (muted, not Vegas) ──
  const rb = new THREE.Group();
  const rbHull = new THREE.Mesh(new THREE.BoxGeometry(95, 5, 26), pbr('painted_steel', { scale: 3, tint: 0x3a3a40, metal: 0.4 }));
  rbHull.position.y = WATER + 2;
  rb.add(rbHull);
  for (let d = 0; d < 3; d++) {
    const deckBox = new THREE.Mesh(new THREE.BoxGeometry(88 - d * 12, 4, 23 - d * 2), pbr('painted_steel', { scale: 3, tint: 0x4a464c, metal: 0.3 }));
    deckBox.position.y = WATER + 6.5 + d * 4.2;
    rb.add(deckBox);
    for (let i = 0; i < 22 - d * 3; i++) {
      const x = -40 + d * 6 + i * ((80 - d * 12) / (21 - d * 3));
      steady.add(0, 0, 0, d === 2 ? 0xffd27a : 0xffb060, 1.6, 0, 0, 1.4).local = new THREE.Vector3(x, WATER + 7 + d * 4.2, 11.8 - d);
    }
  }
  const stacks = [-6, 6].map((z) => {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 14, 10), pbr('painted_steel', { scale: 2, tint: 0x2a2a2e, metal: 0.5 }));
    s.position.set(-30, WATER + 24, z * 0.6);
    rb.add(s);
    return s;
  });
  void stacks;
  rb.position.set(-560, 0, LAYOUT.riverNear - 70);
  rb.rotation.y = 0.18;
  rb.updateMatrixWorld(true);
  for (const it of steady.items) {
    if (it.local) {
      const w = it.local.clone().applyMatrix4(rb.matrixWorld);
      it.x = w.x; it.y = w.y; it.z = w.z;
    }
  }
  group.add(rb);
  river.addLight(new THREE.Vector3(-560, WATER + 12, LAYOUT.riverNear - 60), 0xffb565, 0.6, 7, 9);
  river.addLight(new THREE.Vector3(-600, WATER + 8, LAYOUT.riverNear - 60), 0xffcf80, 0.4, 4, 7);

  // ── Refinery silhouette on the Illinois side downriver ──
  const refinery = new THREE.Group();
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x07080a, fog: false });
  for (let i = 0; i < 9; i++) {
    const h = 25 + rand() * 60;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(1.5 + rand() * 2, 2 + rand() * 3, h, 8), darkMat);
    s.position.set(rand() * 260, WATER + h / 2, rand() * 120);
    refinery.add(s);
    steady.add(refinery.position.x + s.position.x, 0, 0, 0xff2a1a, 6, 0.33, rand(), 1.4).ref = { s, h };
  }
  for (let i = 0; i < 6; i++) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 12, 16), darkMat);
    tank.position.set(-60 + i * 34, WATER + 6, 150);
    refinery.add(tank);
  }
  refinery.position.set(-4600, 0, -3300);
  refinery.updateMatrixWorld(true);
  for (const it of steady.items) {
    if (it.ref) {
      const w = new THREE.Vector3(0, it.ref.h / 2 + 2, 0).applyMatrix4(it.ref.s.matrixWorld);
      it.x = w.x; it.y = w.y; it.z = w.z;
    }
  }
  steady.add(-4480, WATER + 98, -3260, 0xff8a30, 22, -0.8, 0.3, 1.5); // flare
  river.addLight(new THREE.Vector3(-4480, WATER + 98, -3260), 0xff8a30, 0.5, 5, 6);
  group.add(refinery);

  // assemble points
  steady.build(group, 6);
  moving.build(group, 7);
  scene.add(group);

  return {
    group,
    archPosition: ARCH_POS,
    archMesh,
    riverboat: rb,
    archTop: arch.top,
    bridgeGroup: bridge,
    /** 0 = night, 1 = day */
    setDay(d) {
      archMesh.material.uniforms.uDay.value = d;
      skylineMat.uniforms.uDay.value = d;
      steady.setFade(1 - 0.93 * d);
      moving.setFade(1 - 0.75 * d);
      treeLineMat.color.setRGB(0.02 + 0.2 * d, 0.03 + 0.26 * d, 0.025 + 0.25 * d);
      darkMat.color.setRGB(0.03 + 0.38 * d, 0.03 + 0.43 * d, 0.04 + 0.48 * d);
      cableMat.color.setRGB(1.6 - 1.0 * d, 1.7 - 1.05 * d, 1.8 - 1.05 * d);
      cableMat.opacity = 0.55 - 0.15 * d;
      beamMat.opacity = 0.08 * (1 - d);
      winMat.color.setRGB(2.2 - 1.6 * d, 1.65 - 1.1 * d, 1.0 - 0.5 * d);
    },
    update(t, dt, camera, viewportH) {
      skylineMat.uniforms.uTime.value = t;
      for (const f of anim) f(t, dt);
      moving.commit();
      steady.update(t, camera, viewportH);
      moving.update(t, camera, viewportH);
    },
  };
}
