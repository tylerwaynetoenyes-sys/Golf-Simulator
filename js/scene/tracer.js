// Glowing shot tracer: a camera-facing ribbon with a white-hot core and an
// amber halo, sized in screen space so it reads at 300 yards, plus faint
// "ghost" tracers of recent shots for dispersion at a glance.
import * as THREE from 'three';

const MAX = 1400;

const vert = /* glsl */`
attribute vec3 aPrev;
attribute vec3 aNext;
attribute float aSide;
attribute float aIdx;
uniform float uPixelAngle;
uniform float uMinWidth;
varying float vSide;
varying float vIdx;
void main() {
  vec4 vp = modelViewMatrix * vec4(position, 1.0);
  vec4 pp = modelViewMatrix * vec4(aPrev, 1.0);
  vec4 np = modelViewMatrix * vec4(aNext, 1.0);
  vec3 tang = np.xyz - pp.xyz;
  if (length(tang) < 1e-5) tang = vec3(1.0, 0.0, 0.0);
  tang = normalize(tang);
  vec3 toCam = normalize(-vp.xyz);
  vec3 nrm = normalize(cross(tang, toCam));
  float dist = length(vp.xyz);
  float w = max(uMinWidth, dist * uPixelAngle);
  vp.xyz += nrm * aSide * w;
  vSide = aSide;
  vIdx = aIdx;
  gl_Position = projectionMatrix * vp;
}`;

const frag = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
uniform float uHead;
uniform float uTail;
varying float vSide;
varying float vIdx;
void main() {
  float x = abs(vSide);
  float core = exp(-x * x * 18.0);
  float halo = exp(-x * x * 3.0);
  float age = clamp((uHead - vIdx) / max(uTail, 1.0), 0.0, 1.0);
  float fade = mix(1.0, 0.45, age);
  float headBoost = 1.0 + 1.5 * exp(-(uHead - vIdx) * 0.08);
  vec3 col = (vec3(1.0, 0.97, 0.9) * core * 2.4 + uColor * halo * 1.5) * headBoost;
  float a = (core + halo * 0.6) * fade * uOpacity * smoothstep(0.0, 14.0, vIdx);
  gl_FragColor = vec4(col * a, a);
}`;

export class Tracer {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 2 * 3);
    this.prev = new Float32Array(MAX * 2 * 3);
    this.next = new Float32Array(MAX * 2 * 3);
    const side = new Float32Array(MAX * 2);
    const idx = new Float32Array(MAX * 2);
    for (let i = 0; i < MAX; i++) {
      side[i * 2] = -1; side[i * 2 + 1] = 1;
      idx[i * 2] = i; idx[i * 2 + 1] = i;
    }
    const index = [];
    for (let i = 0; i < MAX - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      index.push(a, b, c, b, d, c);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aPrev', new THREE.BufferAttribute(this.prev, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aNext', new THREE.BufferAttribute(this.next, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    geo.setAttribute('aIdx', new THREE.BufferAttribute(idx, 1));
    geo.setIndex(index);
    geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uColor: { value: new THREE.Color(1.0, 0.55, 0.16) },
        uOpacity: { value: 1 },
        uHead: { value: 0 },
        uTail: { value: 400 },
        uPixelAngle: { value: 0.0016 },
        uMinWidth: { value: 0.012 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 30;
    scene.add(this.mesh);
    this.count = 0;
    this.fading = false;
    this.ghosts = [];
    this.points = [];
  }

  setColor(c) { this.material.uniforms.uColor.value.set(c); }

  reset() {
    this.count = 0;
    this.points = [];
    this.material.uniforms.uOpacity.value = 1;
    this.fading = false;
    this.mesh.geometry.setDrawRange(0, 0);
  }

  push(x, y, z) {
    if (this.count >= MAX) return;
    const last = this.points[this.points.length - 1];
    if (last && Math.hypot(last[0] - x, last[1] - y, last[2] - z) < 0.05) return;
    const i = this.count++;
    this.points.push([x, y, z]);
    for (let s = 0; s < 2; s++) {
      const o = (i * 2 + s) * 3;
      this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
      this.next[o] = x; this.next[o + 1] = y; this.next[o + 2] = z;
      const p = i > 0 ? this.points[i - 1] : [x, y, z];
      this.prev[o] = p[0]; this.prev[o + 1] = p[1]; this.prev[o + 2] = p[2];
      if (i > 0) {
        const po = ((i - 1) * 2 + s) * 3;
        this.next[po] = x; this.next[po + 1] = y; this.next[po + 2] = z;
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aPrev.needsUpdate = true;
    g.attributes.aNext.needsUpdate = true;
    g.setDrawRange(0, Math.max(0, (this.count - 1) * 6));
    this.material.uniforms.uHead.value = this.count;
    this.material.uniforms.uTail.value = Math.max(200, this.count);
  }

  /** Freeze the current trace into a faint ghost and fade the live one. */
  finish(keepGhost = true) {
    if (keepGhost && this.points.length > 4) {
      const pts = this.points.filter((_, i) => i % 2 === 0).map((p) => new THREE.Vector3(...p));
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const m = new THREE.Line(g, new THREE.LineBasicMaterial({
        color: this.material.uniforms.uColor.value.clone().multiplyScalar(0.9),
        transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.renderOrder = 25;
      m.frustumCulled = false;
      this.scene.add(m);
      this.ghosts.push(m);
      while (this.ghosts.length > 6) {
        const old = this.ghosts.shift();
        this.scene.remove(old);
        old.geometry.dispose();
        old.material.dispose();
      }
      this.ghosts.forEach((gh, i) => { gh.material.opacity = 0.08 + 0.26 * ((i + 1) / this.ghosts.length); });
    }
    this.fading = true;
  }

  setGhostsVisible(v) { this.ghosts.forEach((g) => { g.visible = v; }); }

  clearGhosts() {
    for (const g of this.ghosts) { this.scene.remove(g); g.geometry.dispose(); g.material.dispose(); }
    this.ghosts = [];
  }

  update(dt) {
    if (this.fading) {
      const u = this.material.uniforms.uOpacity;
      u.value = Math.max(0, u.value - dt * 0.35);
      if (u.value === 0) this.fading = false;
    }
  }
}
