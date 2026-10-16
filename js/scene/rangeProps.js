// The range itself: hitting bays under a lit canopy, amber floodlight towers,
// target greens with flags, yardage boards, tree lines, the faded Alton sign,
// and the featured Closest-to-Pin green.
import * as THREE from 'three';
import { CUP } from '../core/physics.js';
import { buildCup, ferrule } from './cup.js';
import { loadEquipment } from './models.js';
import { YD } from '../core/physics.js';
import { LAYOUT, GREENS, CTP_GREEN, groundHeight } from './layout.js';
import { buildVenue } from './venue.js';
import { surroundHeight } from './terrain.js';
import { MOON_DIR } from './sky.js';
import { pbr, painted } from './pbr.js';
import { plantTrees, updateTrees, loadHeroTrees } from './trees.js';

const AMBER = 0xffb46b;

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

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Soft volumetric cone for floodlights (additive, fades with length and edge).
export function lightConeMaterial(color, strength) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    vertexShader: /* glsl */`
      varying float vAlong; varying vec3 vN; varying vec3 vW;
      void main() {
        vAlong = uv.y;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uStrength;
      varying float vAlong; varying vec3 vN; varying vec3 vW;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        float edge = pow(abs(dot(vN, V)), 1.6);
        float a = edge * pow(clamp(vAlong, 0.0, 1.0), 1.8) * uStrength;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

const BLANK_NUM = new THREE.DataTexture(new Uint8Array(4), 1, 1);
BLANK_NUM.needsUpdate = true;

export function makeFlag(color, poleHeight = 2.4, emissive = 1.2) {
  const g = new THREE.Group();
  // a real flagstick: 13 mm fibreglass (half an inch), painted, with a little sheen
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, poleHeight, 12), painted(0xe8e2d4, { roughness: 0.35, metalness: 0.3 }));
  // its real 13 mm up close; far off it widens to stay about a pixel wide (measured from the
  // camera actually drawing it)
  const wp = new THREE.Vector3();
  pole.onBeforeRender = (r, sc, cam) => {
    if (!cam.isPerspectiveCamera) return;
    pole.getWorldPosition(wp);
    const d = cam.position.distanceTo(wp), view = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const px = (d * view) / Math.max(1, r.domElement.height);
    const w = Math.max(1, (px * 1.1) / 0.013);
    if (Math.abs(pole.scale.x - w) > 1e-3) { pole.scale.set(w, 1, w); pole.updateMatrixWorld(); }
  };
  pole.position.y = poleHeight / 2;
  pole.castShadow = true;
  g.add(pole);
  const flagGeo = new THREE.PlaneGeometry(0.508, 0.356, 12, 4); // stands in until the modelled flag loads
  flagGeo.translate(0.254, 0, 0);
  const flagMat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: emissive, side: THREE.DoubleSide, roughness: 0.8,
  });
  // the hole number, printed through so it reads the right way round from either side
  const uNum = { value: BLANK_NUM };
  flagMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 };
    sh.uniforms.uWind = { value: 0.3 };
    sh.uniforms.uNum = uNum;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uNum;')
      .replace('#include <map_fragment>', `#include <map_fragment>
  #ifdef USE_MAP
    vec2 nuv = gl_FrontFacing ? vMapUv : vec2(1.12 - vMapUv.x, vMapUv.y);
    float ink = texture2D(uNum, nuv).a * step(0.0, nuv.x) * step(nuv.x, 1.0);
    diffuseColor.rgb *= 1.0 - 0.88 * ink;
  #endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  #ifdef USE_MAP
    totalEmissiveRadiance *= 1.0 - 0.9 * ink;
  #endif`);
    flagMat.userData.shader = sh;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float k = clamp(position.x / 0.508, 0.0, 1.0);
        float amp = 0.02 + 0.09 * uWind;
        float spd = 3.0 + 9.0 * uWind;
        transformed.z += sin(position.x * 9.0 - uTime * spd) * amp * k;
        transformed.y += sin(position.x * 7.0 - uTime * spd * 0.7) * amp * 0.35 * k - (1.0 - uWind) * 0.12 * k * k;`);
  };
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.y = poleHeight - 0.2;
  g.add(flag);
  g.userData.flagMat = flagMat;
  g.userData.pole = pole;
  // its foot: the chrome ferrule that seats in the cup's socket
  ferrule((f) => { f.castShadow = true; g.add(f); });
  // the modelled pin (tools/blender/green_details.py): a 20 x 14 in flag with its sleeve round the stick,
  // hemmed and double-stitched, the cloth's weave; the stick's moulded top cap; the swivel clip at the flag's head
  loadEquipment('pin.glb').then((scn) => {
    if (!scn) return;
    const f = scn.getObjectByName('flag');
    if (f) {
      flag.geometry = f.geometry;
      flag.position.set(0, poleHeight - 0.215, 0);
      flagMat.normalMap = f.material.normalMap;
      flagMat.normalScale = new THREE.Vector2(0.8, 0.8);
      if (!flagMat.map) { flagMat.map = f.material.map; flagMat.emissiveMap = f.material.map; }
      flagMat.needsUpdate = true;
    }
    const cap = scn.getObjectByName('topcap');
    if (cap) { const c = cap.clone(); c.position.y = poleHeight; c.castShadow = true; g.add(c); }
    const clip = scn.getObjectByName('clip');
    if (clip) { const c = clip.clone(); c.position.y = poleHeight - 0.035; g.add(c); }
  });
  // print a hole number on the flag: screen-printed ink, a little in from the fly
  g.userData.setNumber = (n) => {
    if (g.userData.dressed) return; // a dressed flag (the Stars and Stripes) keeps its own cloth
    const c = document.createElement('canvas');
    c.width = 512; c.height = 360;
    const x = c.getContext('2d');
    x.fillStyle = '#000';
    x.font = `600 ${Math.round(c.height * 0.62)}px Jost, Futura, "Avenir Next", sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(n), c.width * 0.56, c.height * 0.53);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 8;
    t.flipY = false; // the modelled flag's UVs are glTF's (v down the image)
    uNum.value = t;
  };
  g.userData.clearNumber = () => { uNum.value = BLANK_NUM; };
  g.userData.baseEmissive = emissive;
  return g;
}

export function greenRing(radius, color, opacity = 0.5, width = 0.12) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(radius - width, radius, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity, depthWrite: false }),
  );
  m.renderOrder = 2;
  return m;
}

export function createRange(scene, river, quality) {
  const group = new THREE.Group();
  const rand = seeded(2026);
  let windAmt = 0.3;
  let signLightBase = 30;
  const flags = [];
  const updaters = [];

  scene.fog = new THREE.FogExp2(0x0a111d, 0.00032);

  // ── Moonlight + ambient ──
  const hemi = new THREE.HemisphereLight(0x22324f, 0x0d0b08, 0.4);
  group.add(hemi);
  const moon = new THREE.DirectionalLight(0x9fb4e6, 0.42);
  moon.position.copy(MOON_DIR).multiplyScalar(120);
  moon.target.position.set(0, 0, -10);
  moon.castShadow = true;
  moon.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
  Object.assign(moon.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 300 });
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.02;
  group.add(moon, moon.target);

  // ── The hitting venue: three tiers of bays round the player (js/scene/venue.js) ──
  const wood = pbr('brown_planks_08', { scale: 1.5, tint: 0xa58a6c });
  const steel = pbr('painted_steel', { scale: 2, tint: 0x3c4046, metal: 0.6, rough: 0.8 });
  const dayHooks = [];
  const venue = buildVenue(group, { quality, updaters, dayHooks });
  // (the tee in the player's bay is the modelled one the ball bed sets under the ball: js/scene/ballBed.js)
  const canopy = new THREE.Group(); // (kept for the authored-asset slot)
  group.add(canopy);
  // Under-canopy amber lights, one per bay (glow strips) + three real lights
  const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(AMBER).multiplyScalar(3.2) });
  for (let i = -4; i <= 4; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.12), stripMat);
    strip.position.set(i * 4.2, 3.98, 2.2);
    group.add(strip);
  }
  const bayLight = new THREE.SpotLight(AMBER, 16, 14, 0.95, 0.65, 1.6);
  bayLight.position.set(0, 3.68, 2.2);
  bayLight.target.position.set(0, 0, -0.6);
  bayLight.castShadow = quality.shadows;
  bayLight.shadow.mapSize.set(1024, 1024);
  bayLight.shadow.bias = -0.0005;
  group.add(bayLight, bayLight.target);
  const bayLights = [bayLight];
  for (const sx of [-12.6, 12.6]) {
    const l = new THREE.SpotLight(AMBER, 12, 16, 1.1, 0.7, 1.6);
    bayLights.push(l);
    l.position.set(sx, 3.68, 2.2);
    l.target.position.set(sx, 0, 0);
    group.add(l, l.target);
  }

  // ── Floodlight towers ──
  const towerZs = [-30, -115, -205];
  const floods = [];
  const coneMat = lightConeMaterial(0xffc58a, 0.05);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd29a).multiplyScalar(6) });
  for (const z of towerZs) {
    for (const side of [-1, 1]) {
      const x = side * (LAYOUT.fairwayHalfWidth + 20);
      const baseY = groundHeight(x, z);
      const h = 22;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, h, 10), steel);
      mast.position.set(x, baseY + h / 2, z);
      mast.castShadow = true;
      group.add(mast);
      const head = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 0.3), steel);
      head.add(frame);
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 3; c++) {
          const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), lampHeadMat);
          lamp.position.set(-1.1 + c * 1.1, -0.38 + r * 0.76, -0.16);
          lamp.rotation.y = Math.PI;
          head.add(lamp);
        }
      }
      head.position.set(x, baseY + h + 0.6, z);
      const target = new THREE.Vector3(-side * 6, 0, z - 85);
      head.lookAt(target.x, baseY + h, target.z);
      head.rotateX(0.38);
      group.add(head);

      const spot = new THREE.SpotLight(0xffbf80, 3200, 260, 0.62, 0.75, 1.7);
      floods.push(spot);
      spot.position.set(x, baseY + h, z);
      spot.target.position.copy(target);
      group.add(spot, spot.target);

      // atmospheric cone
      const len = 120;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(Math.tan(0.5) * len, len, 32, 1, true), coneMat);
      cone.geometry.translate(0, -len / 2, 0);
      // flip uv so it brightens near the lamp
      const uv = cone.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i));
      const pivot = new THREE.Object3D();
      pivot.position.copy(spot.position);
      pivot.lookAt(target);
      pivot.rotateX(-Math.PI / 2);
      pivot.add(cone);
      group.add(pivot);
    }
  }

  // ── Target greens with flags + glowing rims ──
  const greenObjs = new Map();
  for (const g of GREENS) {
    const y = groundHeight(g.x, g.z);
    const flag = makeFlag(g.color, 2.4 + CUP.depth, 0.55);
    flag.position.set(g.x, y - CUP.depth, g.z);
    group.add(flag);
    flags.push(flag);
    const rim = greenRing(g.r, g.color, 0.38, 0.14);
    rim.position.set(g.x, y + 0.14, g.z);
    group.add(rim);
    const cup = buildCup();
    cup.position.set(g.x, y, g.z);
    group.add(cup);
    greenObjs.set(g.id, { rim, flag, baseOpacity: 0.38 });
  }

  // ── Yardage boards along the left edge ──
  const signMat = (text) => {
    const tex = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#0e1116'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,190,110,0.85)'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#ffe2b8';
      g.font = '700 74px "Helvetica Neue", Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 4);
    });
    return new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.3, 1.2, 1.1) });
  };
  for (const yd of [50, 100, 150, 200, 250, 300]) {
    const z = -yd * YD;
    for (const side of [-1, 1]) {
      const x = side * (LAYOUT.fairwayHalfWidth + 6);
      const y = groundHeight(x, z);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), signMat(String(yd)));
      board.position.set(x, y + 1.6, z);
      board.lookAt(0, y + 1.6, 30);
      group.add(board);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), steel);
      post.position.set(x, y + 0.5, z);
      group.add(post);
    }
  }

  // ── The faded Alton sign ──
  const altonTex = canvasTex(1024, 384, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#d9ccb0'); grd.addColorStop(1, '#b8a888');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // weathering
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${90 + Math.random() * 60},${80 + Math.random() * 50},${60 + Math.random() * 40},${Math.random() * 0.08})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 6, 1 + Math.random() * 3);
    }
    for (let i = 0; i < 26; i++) { // horizontal board seams
      g.fillStyle = 'rgba(60,45,30,0.18)';
      g.fillRect(0, (i * h) / 6, w, 2);
    }
    g.fillStyle = 'rgba(128,32,24,0.82)';
    g.font = '900 210px Georgia, "Times New Roman", serif';
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText('ALTON', w / 2, 238);
    g.fillStyle = 'rgba(40,52,70,0.75)';
    g.font = '700 46px Georgia, serif';
    g.fillText('ON THE BLUFFS  ·  DRIVING RANGE', w / 2, 318);
    // flaked paint
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(0,0,0,${0.25 + Math.random() * 0.5})`;
      const x = Math.random() * w, y = Math.random() * h;
      g.beginPath(); g.ellipse(x, y, 2 + Math.random() * 10, 1 + Math.random() * 4, Math.random() * 3, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = '#6d6150'; g.fillRect(0, 0, w, h);
  });
  const sign = new THREE.Group();
  const signFace = new THREE.Mesh(
    new THREE.PlaneGeometry(15, 5.6),
    new THREE.MeshStandardMaterial({ map: altonTex, emissiveMap: altonTex, emissive: 0xffc58a, emissiveIntensity: 0.32, roughness: 0.9 }),
  );
  signFace.position.y = 6.2;
  sign.add(signFace);
  const back = new THREE.Mesh(new THREE.BoxGeometry(15.4, 6, 0.3), wood);
  back.position.set(0, 6.2, -0.2);
  sign.add(back);
  for (const sx of [-5.5, 5.5]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6.4, 0.35), wood);
    leg.position.set(sx, 3.2, -0.3);
    leg.castShadow = true;
    sign.add(leg);
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(AMBER).multiplyScalar(4) });
  const signLamps = [];
  for (const sx of [-4, 4]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.4), steel);
    arm.position.set(sx, 9.3, 0.6);
    sign.add(arm);
    const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.3, 16, 1, true), lampMat);
    lamp.position.set(sx, 9.2, 1.3);
    lamp.rotation.x = Math.PI;
    sign.add(lamp);
    signLamps.push(lamp);
  }
  const signX = LAYOUT.fairwayHalfWidth + 30, signZ = -88;
  sign.position.set(signX, surroundHeight(signX, signZ) - 0.2, signZ);
  sign.lookAt(0, sign.position.y, 40);
  group.add(sign);
  const signLight = new THREE.PointLight(AMBER, 30, 22, 1.8);
  signLight.position.set(signX - 2, sign.position.y + 8.6, signZ + 3);
  group.add(signLight);
  // one gooseneck lamp is on its last legs
  let flick = 0;
  updaters.push((t, dt) => {
    flick -= dt;
    const on = flick > 0 ? (Math.sin(t * 60) > 0.2 ? 1 : 0.15) : 1;
    if (flick < -6 - Math.random() * 10) flick = 0.4 + Math.random() * 0.5;
    signLamps[1].material = on > 0.5 ? lampMat : steel;
    signLight.intensity = signLightBase * (0.66 + 0.34 * on);
  });

  // ── Trees: the real oak, beech, maple, sycamore, red cedar and spruce models (js/scene/trees.js) ──
  const treeCount = Math.round(900 * quality.trees);
  const spots = [];
  for (let i = 0; i < treeCount * 2 && spots.length < treeCount; i++) {
    let x, z;
    const r = rand();
    if (r < 0.8) {
      const side = rand() < 0.5 ? -1 : 1;
      x = side * (LAYOUT.boundsX - 25 + Math.pow(rand(), 0.7) * 420);
      z = 60 - rand() * (60 - LAYOUT.plateauEnd - 4);
    } else {
      x = -260 + rand() * 520;
      z = 22 + rand() * 120;
      if (Math.abs(x) < 26 && z < 50) continue;
    }
    if (z < LAYOUT.plateauEnd + 3) continue;
    const conifer = rand() < 0.3;
    spots.push({ x, z, y: surroundHeight(x, z) - 0.2, scale: 0.8 + rand() * 0.5, squash: 0.9 + rand() * 0.25, rot: rand() * 6.28,
      variant: conifer ? 4 + Math.floor(rand() * 2) : Math.floor(rand() * 4), hue: 0.22 + rand() * 0.07, sat: rand(), light: rand(), far: true });
  }
  loadHeroTrees(null, 'parkland').then(() => group.add(plantTrees(spots).group)).catch((e) => console.warn('range trees', e));
  const breeze = new THREE.Vector2(0.35, 0.15);

  // ── Closest-to-Pin green ──
  const ctp = new THREE.Group();
  const ctpFlag = makeFlag(0xffd54a, 2.6 + CUP.depth, 0.9);
  ctpFlag.position.y = -CUP.depth;
  ctp.add(ctpFlag);
  flags.push(ctpFlag);
  ctp.add(buildCup());
  const proxRings = [3 * 0.3048, 10 * 0.3048, 20 * 0.3048].map((r, i) => {
    const ring = greenRing(r, 0xffe9a8, [0.5, 0.32, 0.2][i], 0.05);
    ring.position.y = 0.02;
    ctp.add(ring);
    return ring;
  });
  const edge = greenRing(CTP_GREEN.r, 0xffd54a, 0.45, 0.16);
  edge.position.y = 0.12;
  ctp.add(edge);
  // subtle locating beam
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 60, 12, 1, true),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xffd27a) } },
      vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 uColor; varying float vY; void main(){ float a = pow(clamp(1.0 - vY, 0.0, 1.0), 2.5) * 0.4; gl_FragColor = vec4(uColor * a, a);} ',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  beam.position.y = 30;
  ctp.add(beam);
  const pinLight = new THREE.PointLight(0xffd9a0, 14, 30, 1.6);
  pinLight.position.y = 6;
  ctp.add(pinLight);
  ctp.visible = false;
  group.add(ctp);

  scene.add(group);

  return {
    group,
    moon,
    hemi,
    canopy,
    sign,
    bayLight,
    flags,
    ctp,
    /** A new ball out of the dispenser onto the tee (the venue's chute). */
    deliverBall(ball, to, done) { venue.deliver(ball, to, done); },
    setCtp(x, z, visible = true) {
      ctp.position.set(x, groundHeight(x, z), z);
      ctp.visible = visible;
    },
    /** Hide the range itself but keep the shared moon/sun + sky light. */
    setPropsVisible(v) {
      for (const c of group.children) if (c !== hemi && c !== moon && c !== moon.target) c.visible = v;
    },
    setDecorVisible(v) {
      for (const [, o] of greenObjs) { o.flag.visible = v; o.rim.visible = v; }
    },
    highlightGreen(id, on) {
      for (const [gid, o] of greenObjs) {
        const active = id ? gid === id || (Array.isArray(id) && id.includes(gid)) : false;
        o.rim.material.opacity = on && active ? 0.9 : o.baseOpacity;
      }
    },
    setWind(strength01, fromDeg) {
      windAmt = strength01;
      // flags stream downwind (yaw the flag group)
      const yaw = ((fromDeg + 90) * Math.PI) / 180;
      for (const f of flags) f.children[1].rotation.y = yaw;
    },
    /** 0 = night, 1 = day: floodlights fade out, the moon becomes the sun. */
    setDay(d) {
      const n = 1 - d;
      for (const l of floods) l.intensity = 3200 * n;
      for (const l of bayLights) l.intensity = (l === bayLight ? 16 : 12) * (0.15 + 0.85 * n);
      coneMat.uniforms.uStrength.value = 0.05 * n;
      lampHeadMat.color.setRGB(0.4 + 5.6 * n, 0.38 + 4.6 * n, 0.35 + 3.5 * n);
      stripMat.color.setRGB(0.5 + 2.7 * n, 0.45 + 1.95 * n, 0.4 + 1.1 * n);
      signLightBase = 30 * n;
      pinLight.intensity = 14 * n;
      for (const f of flags) f.userData.flagMat.emissiveIntensity = f.userData.baseEmissive * (0.25 + 0.75 * n);
      for (const h of dayHooks) h(d);
    },
    update(t, dt, camera) {
      updateTrees(t, breeze, camera || null);
      for (const f of flags) {
        const sh = f.userData.flagMat.userData.shader;
        if (sh) { sh.uniforms.uTime.value = t; sh.uniforms.uWind.value = windAmt; }
      }
      for (const u of updaters) u(t, dt);
      beam.material.opacity = 1;
      proxRings.forEach((r, i) => { r.material.opacity = (0.25 + 0.12 * Math.sin(t * 2 + i)) * (i === 0 ? 1.6 : 1); });
    },
  };
}
