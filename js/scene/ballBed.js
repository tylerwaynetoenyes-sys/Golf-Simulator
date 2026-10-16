// The ground right round the ball, at the scale you see it at address and in
// the lie close-up: individual blades of grass cut to the lie (a green's 3 mm,
// the fairway's 12, the fringe, rough that the ball sits down in), fine sand
// with the ball settled into it in a bunker, and the tee the ball sits on.
// Beyond half a metre the course's own turf takes over; the blades thin out
// and shorten toward the edge so the two meet without a line.
import * as THREE from 'three';
import { loadEquipment } from './models.js';
import { BALL } from '../core/physics.js';

// blade length (m) range, width, patch radius, count, clumping, by lie
const LIES = {
  green: { len: [0.003, 0.005], w: 0.0009, R: 0.32, n: 9000, clump: 0, stand: 0.9 },
  tee: { len: [0.008, 0.013], w: 0.0013, R: 0.5, n: 10000, clump: 0, stand: 0.75 },
  fairway: { len: [0.009, 0.015], w: 0.0013, R: 0.5, n: 10000, clump: 0, stand: 0.7 },
  fringe: { len: [0.013, 0.02], w: 0.0014, R: 0.45, n: 9000, clump: 0.1, stand: 0.7 },
  rough: { len: [0.03, 0.07], w: 0.0024, R: 0.85, n: 9000, clump: 0.5, stand: 0.5 },
  deep: { len: [0.06, 0.12], w: 0.003, R: 0.9, n: 8500, clump: 0.7, stand: 0.4 },
};
// the tee's top above the ground, by club (half the ball above the driver's crown; irons barely off the turf)
export const TEE_HEIGHT = { driver: 0.03, wood: 0.014, hybrid: 0.011, iron: 0.008, wedge: 0.006 };

function bladeGeometry() {
  // a tapered blade, 1 tall and 1 wide (scaled per instance), curving forward (+z) as it rises
  const seg = 4, pos = [], col = [], nrm = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, w = 0.5 * (1 - t * 0.92), y = t, z = 0.32 * t * t;
    pos.push(-w, y, z, w, y, z);
    const c = 0.55 + 0.6 * t; // darker in the thatch, light at the tip
    col.push(c, c, c * 0.92, c, c, c * 0.92);
    nrm.push(0, 0.9, -0.45, 0, 0.9, -0.45);
  }
  // both windings, normals up the same way: a blade lit from either side like the turf it grows in
  // (two-sided lighting would light its back as if facing the ground: dark speckle at a distance)
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2, a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

export class BallBed {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'ballBed';
    scene.add(this.group);
    this.uTime = { value: 0 };
    this.uWind = { value: new THREE.Vector2() };
    this.bladeGeo = bladeGeometry();
    const mat = (this.bladeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 }));
    this.uFade = { value: new THREE.Vector2(1.0, 1.6) };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.uniforms.uWind = this.uWind;
      sh.uniforms.uFade = this.uFade;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec2 uWind; uniform vec2 uFade;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          // sub-pixel blades only alias: they settle into the turf with distance (mown turf by ~1.5 m, rough further)
          vec3 wpos = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          transformed *= smoothstep(uFade.y, uFade.x, distance(cameraPosition, wpos)); // gone entirely, not left as specks
          // the tips stir in the breeze, each blade on its own beat
          vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
          float k = position.y * position.y;
          float ph = dot(ip.xz, vec2(37.1, 51.7));
          transformed.x += (sin(uTime * 2.3 + ph) * 0.06 + uWind.x * 0.18) * k;
          transformed.z += (cos(uTime * 1.9 + ph * 1.3) * 0.06 + uWind.y * 0.18) * k;`);
    };
    mat.customProgramCacheKey = () => 'ballBedBlade';
    this.blades = null;
    this.sand = null;
    this.tee = null;
    this.teeFly = null;
    this.teeModel = null;
    loadEquipment('tee.glb').then((s) => { this.teeModel = s?.getObjectByName('tee') || null; if (this._pendingTee) this._placeTee(this._pendingTee); });
  }

  hide() { this.group.visible = false; }

  /**
   * Lay the ground round the ball.
   * @param o {x, z, ground(x, z), lie: 'tee'|'fairway'|'fringe'|'rough'|'sand'|'green', deep, turf: Color (linear),
   *           sand: Color (linear), teed, teeTop (y of the tee's top = the ball's bottom)}
   */
  set(o) {
    this.group.visible = true;
    if (this.blades) { this.group.remove(this.blades); this.blades.dispose(); this.blades = null; }
    if (this.sand) { this.group.remove(this.sand); this.sand.geometry.dispose(); this.sand = null; }
    this.teeFly = null;
    if (o.lie === 'sand') this._sand(o); else this._blades(o);
    if (o.teed) this._placeTee(o); else this._removeTee();
  }

  _blades(o) {
    const spec = LIES[o.deep && o.lie === 'rough' ? 'deep' : o.lie] || LIES.fairway;
    // how far the blades carry: the longer the grass, the further it reads
    const far = spec.len[1] > 0.05 ? 7 : spec.len[1] > 0.025 ? 4.5 : 1.7;
    this.uFade.value.set(far * 0.6, far);
    // mown turf is drawn brighter by the course shader than its vertex colour; rough much less so
    const lift = spec.len[1] > 0.025 ? 1.2 : 1.85;
    const { x, z, ground } = o;
    let seed = Math.floor((x * 131 + z * 71) * 1000) | 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) | 0) >>> 0) / 4294967296;
    const im = new THREE.InstancedMesh(this.bladeGeo, this.bladeMat, spec.n);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spec.n * 3), 3);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    const turf = o.turf || new THREE.Color(0.09, 0.2, 0.04);
    // clumps in rough: blades crowd round a few hundred centres
    const clumps = Array.from({ length: 220 }, () => { const a = rnd() * 6.283, r = spec.R * Math.sqrt(rnd()); return [x + Math.cos(a) * r, z + Math.sin(a) * r]; });
    let n = 0;
    for (let i = 0; i < spec.n * 3 && n < spec.n; i++) {
      let px, pz;
      if (spec.clump && rnd() < spec.clump) {
        const [cx, cz] = clumps[Math.floor(rnd() * clumps.length)];
        const a = rnd() * 6.283, r = 0.025 * Math.sqrt(rnd());
        px = cx + Math.cos(a) * r; pz = cz + Math.sin(a) * r;
      } else {
        const a = rnd() * 6.283, r = spec.R * Math.pow(rnd(), 0.62);
        px = x + Math.cos(a) * r; pz = z + Math.sin(a) * r;
      }
      const d = Math.hypot(px - x, pz - z);
      const edge = 1 - THREE.MathUtils.smoothstep(d, spec.R * 0.55, spec.R);
      if (rnd() > 0.15 + 0.85 * edge) continue;                    // thinning out toward the edge
      // the ball sits on top (or down in it): no blade grows through it, the ones round it lean away
      const under = d < BALL.radius * 0.75;
      if (under && spec.len[1] < 0.02) continue;
      const len = (spec.len[0] + rnd() * (spec.len[1] - spec.len[0])) * (0.45 + 0.55 * edge) * (under ? 0.6 : 1);
      const yaw = rnd() * 6.283;
      // how far over it lies: mown turf stands, rough flops, and blades near the ball lean out from it
      let tilt = (1 - spec.stand) * (0.3 + rnd() * 1.1) + rnd() * 0.25;
      let tx = Math.cos(yaw), tz = Math.sin(yaw);
      if (d < BALL.radius * 1.6 && d > 1e-4) { tx = (px - x) / d; tz = (pz - z) / d; tilt += 0.6 * (1 - d / (BALL.radius * 1.6)); }
      e.set(0, 0, 0);
      q.setFromAxisAngle(new THREE.Vector3(tz, 0, -tx).normalize(), tilt).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
      s.set(spec.w * (0.7 + rnd() * 0.6), len, spec.w);
      p.set(px, ground(px, pz) - 0.001, pz);
      im.setMatrixAt(n, m4.compose(p, q, s));
      // the turf's own colour, each blade a shade lighter or darker, some a touch yellower
      const v = 0.78 + rnd() * 0.5, yel = rnd() < 0.12 ? 1.25 : 1;
      c.setRGB(turf.r * v * lift * yel, turf.g * v * lift, turf.b * v * lift * 0.86); // (each blade's base is darker: vertex colour)
      im.setColorAt(n, c);
      n++;
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.needsUpdate = true;
    // (no shadow-map reception: millimetre blades on the turf plane only catch acne)
    im.receiveShadow = false;
    im.castShadow = false;
    im.frustumCulled = false;
    im.userData.noAO = true; // (the AO's own depth pass would draw them full size, ignoring the fade: specks)
    this.blades = im;
    this.group.add(im);
  }

  _sand(o) {
    // a disc of fine sand, the ball settled a few millimetres into a little crater of its own
    const { x, z, ground } = o;
    const base = o.teeTop ?? ground(x, z);
    const R = 0.4, N = 96;
    const g = new THREE.CircleGeometry(R, N, 0, Math.PI * 2);
    // subdivide radially: rebuild as rings for the crater
    const pos = [], uv = [], idx = [], alpha = [];
    const rings = 40;
    for (let j = 0; j <= rings; j++) {
      const r = (j / rings) ** 1.6 * R;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2, px = Math.cos(a) * r, pz = Math.sin(a) * r;
        // the crater: the ball pushed the sand down and out into a soft rim
        const rb = r / BALL.radius;
        const h = -0.004 * Math.exp(-rb * rb * 1.4) + 0.0025 * Math.exp(-(((rb - 1.25) / 0.35) ** 2)) + 0.002;
        // level with the ball (the course's coarse ground under a bunker is sunk below the fine sand mesh)
        pos.push(px, base + h, pz);
        uv.push((x + px) / 0.16, (z + pz) / 0.16);
        alpha.push(1 - THREE.MathUtils.smoothstep(r, R * 0.6, R));
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < N; i++) {
      const a = j * N + i, b = j * N + ((i + 1) % N), c2 = a + N, d = b + N;
      idx.push(a, c2, b, b, c2, d);
    }
    g.dispose();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alpha, 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    if (!this.sandMat) {
      const L = new THREE.TextureLoader();
      const t = (n, srgb) => { const x2 = L.load(new URL(`../../assets/textures/pbr/sand_01_${n}.jpg`, import.meta.url).href); x2.wrapS = x2.wrapT = THREE.RepeatWrapping; x2.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; x2.anisotropy = 8; return x2; };
      this.sandMat = new THREE.MeshStandardMaterial({ map: t('diff', true), normalMap: t('nor_gl', false), roughnessMap: t('rough', false), transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      this.sandMat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAlpha; varying float vA;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = aAlpha;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vA;').replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= vA;');
      };
    }
    if (o.sand) this.sandMat.color.copy(o.sand).multiplyScalar(1.6);
    const m = new THREE.Mesh(geo, this.sandMat);
    m.position.set(x, 0, z);
    m.receiveShadow = true;
    m.renderOrder = 2;
    this.sand = m;
    this.group.add(m);
  }

  _placeTee(o) {
    this._pendingTee = o;
    if (!this.teeModel) return;
    if (!this.tee) { this.tee = this.teeModel.clone(); this.tee.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); this.group.add(this.tee); }
    this.tee.visible = true;
    this.tee.quaternion.identity();
    this.tee.position.set(o.x, o.teeTop, o.z);
  }

  _removeTee() { this._pendingTee = null; if (this.tee) this.tee.visible = false; }

  /** Impact: the clubhead takes the tee out of the ground; it spins away along the swing and drops. */
  popTee(dx, dz, clubMph = 90, ground) {
    if (!this.tee?.visible) return;
    const l = Math.hypot(dx, dz) || 1;
    const sp = (0.8 + Math.random() * 1.4) * Math.min(1.4, clubMph / 90);
    this.teeFly = {
      v: new THREE.Vector3((dx / l) * sp + (Math.random() - 0.5) * 0.6, 1.2 + Math.random() * 1.6, (dz / l) * sp + (Math.random() - 0.5) * 0.6),
      w: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(18 + Math.random() * 20),
      ground, rest: false,
    };
  }

  update(dt, t, wind) {
    this.uTime.value = t;
    if (wind) this.uWind.value.set(wind.x, wind.z).multiplyScalar(0.02);
    const f = this.teeFly;
    if (f && !f.rest && this.tee) {
      const m = this.tee;
      f.v.y -= 9.81 * dt;
      m.position.addScaledVector(f.v, dt);
      const w = f.w.length();
      if (w > 0.01) m.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(f.w.clone().divideScalar(w), w * dt));
      const g = f.ground(m.position.x, m.position.z);
      if (m.position.y < g + 0.004 && f.v.y < 0) {
        if (-f.v.y > 1) { f.v.y *= -0.3; f.v.x *= 0.5; f.v.z *= 0.5; f.w.multiplyScalar(0.5); }
        else {
          // it lies on its side in the grass
          const ax = new THREE.Vector3(0, 1, 0).applyQuaternion(m.quaternion);
          ax.y = 0;
          if (ax.lengthSq() < 1e-4) ax.set(1, 0, 0);
          ax.normalize();
          m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax);
          m.position.y = g + 0.004;
          f.rest = true;
        }
      }
    }
  }
}
