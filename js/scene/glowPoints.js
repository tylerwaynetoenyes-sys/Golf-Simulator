// Soft additive light points (far-shore windows, nav lights, beacons).
// World-space sizes with a minimum on-screen size so distant city lights read
// as crisp pinpoints and bloom nicely. Optional per-point blink.
import * as THREE from 'three';

const vert = /* glsl */`
attribute float aSize;
attribute vec3 aColor;
attribute vec2 aBlink; // x = rate (Hz, 0 = steady), y = phase
uniform float uTime;
uniform float uScale;
uniform float uMinPx;
uniform float uFade;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = aSize * uScale / max(-mv.z, 0.001);
  gl_PointSize = max(px, uMinPx);
  float b = 1.0;
  if (aBlink.x > 0.0) {
    float s = fract(uTime * aBlink.x + aBlink.y);
    b = smoothstep(0.0, 0.05, s) * smoothstep(0.35, 0.2, s);
  } else if (aBlink.x < 0.0) {
    b = 0.75 + 0.25 * sin(uTime * -aBlink.x * 6.283 + aBlink.y * 40.0);
  }
  // dim tiny points a little so a sea of them doesn't blow out
  vAlpha = b * clamp(px / uMinPx, 0.35, 1.0) * uFade;
  vColor = aColor;
}`;

const frag = /* glsl */`
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float core = smoothstep(1.0, 0.0, d);
  float a = core * core * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor * a, a);
}`;

export class GlowPoints {
  constructor({ minPx = 1.6, dynamic = false } = {}) {
    this.items = [];
    this.minPx = minPx;
    this.dynamic = dynamic;
    this.mesh = null;
  }

  add(x, y, z, color, size = 1, blinkRate = 0, phase = Math.random(), intensity = 1) {
    const c = new THREE.Color(color).multiplyScalar(intensity);
    const item = { x, y, z, c, size, blinkRate, phase, index: this.items.length };
    this.items.push(item);
    return item;
  }

  build(scene, renderOrder = 5) {
    const n = this.items.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), blink = new Float32Array(n * 2);
    this.items.forEach((it, i) => {
      pos.set([it.x, it.y, it.z], i * 3);
      col.set([it.c.r, it.c.g, it.c.b], i * 3);
      size[i] = it.size;
      blink.set([it.blinkRate, it.phase], i * 2);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aBlink', new THREE.BufferAttribute(blink, 2));
    if (this.dynamic) geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uTime: { value: 0 }, uScale: { value: 800 }, uMinPx: { value: this.minPx }, uFade: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Points(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    scene.add(this.mesh);
    return this.mesh;
  }

  setFade(f) { if (this.material) this.material.uniforms.uFade.value = f; }

  setPosition(item, x, y, z) {
    const p = this.mesh.geometry.attributes.position;
    p.setXYZ(item.index, x, y, z);
    item.x = x; item.y = y; item.z = z;
  }

  commit() { this.mesh.geometry.attributes.position.needsUpdate = true; }

  update(t, camera, viewportH) {
    if (!this.material) return;
    this.material.uniforms.uTime.value = t;
    // world size -> pixels: h / (2 tan(fov/2))
    this.material.uniforms.uScale.value = viewportH / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }
}
