// Ambient life over the course and range: flocks of birds wheeling across the
// sky by day (a few swifts at dusk), and the occasional airliner crossing high
// overhead toward St. Louis Lambert, with a contrail by day and blinking
// navigation lights after dark. Everything is cheap: one instanced mesh for
// all birds (wings flap in the vertex shader), a handful of meshes per plane.
import * as THREE from 'three';
import { audio } from '../audio/audio.js';
import { painted } from './pbr.js';

const BIRDS_PER_FLOCK = 11;
const FLOCKS = 3;

function birdGeometry() {
  // body + two wings; wing vertices carry aWing = ±1 at the tips for flapping
  const pos = [
    // body (thin diamond)
    0, 0, -0.32, 0.05, 0, 0, 0, 0, 0.26,
    0, 0, -0.32, 0, 0, 0.26, -0.05, 0, 0,
    // left wing
    -0.04, 0, -0.08, -0.62, 0, 0.06, -0.04, 0, 0.1,
    // right wing
    0.04, 0, -0.08, 0.04, 0, 0.1, 0.62, 0, 0.06,
  ];
  const wing = [0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 1];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  g.computeVertexNormals();
  return g;
}

function birdMaterial(uniforms) {
  const m = new THREE.MeshBasicMaterial({ color: 0x1d2024, side: THREE.DoubleSide, fog: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWing;\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
#else
  float ph = 0.0;
#endif
  // flap in bursts, then glide
  float burst = smoothstep(-0.2, 0.6, sin(uTime * 0.7 + ph));
  transformed.y += aWing * aWing * sin(uTime * 13.0 + ph * 5.0) * 0.32 * burst;`);
  };
  m.customProgramCacheKey = () => 'birds';
  return m;
}

function navLightTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

function makePlane(tex) {
  const g = new THREE.Group();
  const body = painted(0xe9ecf0, { roughness: 0.45, metalness: 0.3 }); // painted aluminium
  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(1.9, 30, 4, 10).rotateX(Math.PI / 2), body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(34, 0.5, 5.5), body);
  wing.position.set(0, -0.6, 1);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(12, 0.4, 3), body);
  tail.position.set(0, 0.4, 15);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 4), body);
  fin.position.set(0, 3.4, 15);
  g.add(fus, wing, tail, fin);
  const light = (color, x, y, z) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false, fog: false }));
    s.scale.set(0.012, 0.012, 1);
    s.position.set(x, y, z);
    g.add(s);
    return s;
  };
  const lights = {
    red: light(0xff3030, -17, -0.5, 1),
    green: light(0x30ff70, 17, -0.5, 1),
    strobe: light(0xffffff, 0, -2, 0),
    beacon: light(0xff2a2a, 0, 2.2, 0),
  };
  // contrail: a long, fading ribbon behind the engines
  const trailMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const trailGeo = new THREE.PlaneGeometry(4, 900, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, 470);
  // fade along the length
  const tc = new Float32Array(trailGeo.attributes.position.count * 3);
  for (let i = 0; i < trailGeo.attributes.position.count; i++) {
    const z = trailGeo.attributes.position.getZ(i);
    const a = 1 - Math.min(1, (z - 20) / 900);
    tc.set([a, a, a], i * 3);
  }
  trailGeo.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  trailMat.vertexColors = true;
  const trail = new THREE.Mesh(trailGeo, trailMat);
  g.add(trail);
  g.traverse((o) => { o.frustumCulled = false; });
  return { group: g, lights, trail: trailMat, body };
}

export class Ambient {
  constructor(scene) {
    this.scene = scene;
    this.day = 0;
    this.u = { uTime: { value: 0 } };
    this.center = new THREE.Vector3();
    // birds
    const count = BIRDS_PER_FLOCK * FLOCKS;
    this.birds = new THREE.InstancedMesh(birdGeometry(), birdMaterial(this.u), count);
    this.birds.frustumCulled = false;
    this.birds.castShadow = false;
    scene.add(this.birds);
    this.flocks = [];
    for (let f = 0; f < FLOCKS; f++) {
      const members = [];
      for (let i = 0; i < BIRDS_PER_FLOCK; i++) members.push({ ox: (Math.random() - 0.5) * 14, oy: (Math.random() - 0.5) * 4, oz: (Math.random() - 0.5) * 14, ph: Math.random() * 6.28 });
      this.flocks.push({ members, r: 140 + Math.random() * 160, h: 34 + Math.random() * 40, speed: 0.05 + Math.random() * 0.04, phase: Math.random() * 6.28, cx: (Math.random() - 0.5) * 300, cz: -150 - Math.random() * 300, scale: 1.1 + Math.random() * 0.5 });
    }
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    // planes
    this.tex = navLightTexture();
    this.plane = makePlane(this.tex);
    this.plane.group.visible = false;
    scene.add(this.plane.group);
    this.flight = null;
    this.nextPlane = 18 + Math.random() * 25;
  }

  setDay(d) { this.day = d; }

  /** Keep ambient life around wherever the action is. */
  setCenter(x, z) { this.center.set(x, 0, z); }

  _startFlight() {
    const a = Math.random() * Math.PI * 2;
    const R = 4200;
    const from = new THREE.Vector3(this.center.x + Math.cos(a) * R, 0, this.center.z + Math.sin(a) * R);
    const to = new THREE.Vector3(this.center.x - Math.cos(a + 0.4) * R, 0, this.center.z - Math.sin(a + 0.4) * R);
    const alt = 1100 + Math.random() * 900;
    from.y = alt; to.y = alt + (Math.random() - 0.5) * 200;
    const dur = from.distanceTo(to) / (110 + Math.random() * 40);
    this.flight = { from, to, t: 0, dur };
    this.plane.group.visible = true;
    this.plane.group.position.copy(from);
    this.plane.group.lookAt(to);
    this.plane.group.rotateY(Math.PI); // model faces +Z backward; nose toward travel
    audio.plane?.(0.5, Math.min(26, dur * 0.5));
  }

  update(dt, t) {
    this.u.uTime.value = t;
    const day = this.day;
    // ── birds: daytime flocks, a couple of swifts at dusk, none at night ──
    const active = day > 0.15;
    this.birds.visible = active;
    if (active) {
      let k = 0;
      for (const f of this.flocks) {
        const a = f.phase + t * f.speed;
        const cx = this.center.x + f.cx + Math.cos(a) * f.r;
        const cz = this.center.z + f.cz + Math.sin(a * 1.3) * f.r * 0.6;
        const cy = f.h + Math.sin(a * 2.1) * 8;
        const dx = -Math.sin(a) * f.r, dz = Math.cos(a * 1.3) * 1.3 * f.r * 0.6;
        const yaw = Math.atan2(dx, dz);
        const bank = Math.cos(a) * 0.35;
        for (const m of f.members) {
          const wob = Math.sin(t * 0.8 + m.ph);
          this._p.set(cx + m.ox + wob * 1.5, cy + m.oy + Math.cos(t * 0.9 + m.ph) * 0.8, cz + m.oz + wob);
          this._q.setFromEuler(this._e.set(0, yaw, bank));
          this._s.setScalar(f.scale);
          this.birds.setMatrixAt(k++, this._m4.compose(this._p, this._q, this._s));
        }
      }
      this.birds.instanceMatrix.needsUpdate = true;
    }

    // ── planes ──
    if (!this.flight) {
      this.nextPlane -= dt;
      if (this.nextPlane <= 0) this._startFlight();
    } else {
      const f = this.flight;
      f.t += dt;
      const u = f.t / f.dur;
      this.plane.group.position.lerpVectors(f.from, f.to, u);
      const L = this.plane.lights;
      const night = 1 - day;
      const strobe = (t % 1.2) < 0.06 ? 1 : 0;
      const beacon = (t % 1.0) < 0.12 ? 1 : 0;
      L.red.material.opacity = 0.35 + 0.65 * night;
      L.green.material.opacity = 0.35 + 0.65 * night;
      L.strobe.material.opacity = strobe;
      L.beacon.material.opacity = beacon * (0.4 + 0.6 * night);
      this.plane.trail.opacity = 0.28 * day;
      this.plane.body.color.setScalar(0.25 + 0.7 * day);
      if (u >= 1) {
        this.flight = null;
        this.plane.group.visible = false;
        this.nextPlane = 70 + Math.random() * 80;
      }
    }
  }
}
