// Night sky dome: deep navy zenith, sodium-orange light pollution pooled over
// St. Louis, stars that thin out toward the glow, a low moon and slow
// high-altitude cloud lit from below by the city.
import * as THREE from 'three';

export const MOON_DIR = new THREE.Vector3(-0.62, 0.36, -0.7).normalize();
export const CITY_DIR = new THREE.Vector3(0.17, 0, -0.985).normalize();

const vert = /* glsl */`
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = normalize(wp.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w; // pin to far plane
}`;

const frag = /* glsl */`
uniform float uTime;
uniform vec3 uMoonDir;
uniform vec3 uCityDir;
varying vec3 vDir;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }

void main() {
  vec3 d = normalize(vDir);
  float el = d.y;
  float h = max(el, 0.0);

  vec3 zenith = vec3(0.006, 0.011, 0.028);
  vec3 horizon = vec3(0.045, 0.06, 0.09);
  vec3 col = mix(horizon, zenith, pow(h, 0.45));

  // Light pollution: warm dome concentrated toward St. Louis, faint all round.
  vec2 dxz = normalize(d.xz + 1e-5);
  float toward = max(dot(dxz, normalize(uCityDir.xz)), 0.0);
  float dome = exp(-h * 9.0) * (0.22 + 1.1 * pow(toward, 5.0)) + exp(-h * 22.0) * 0.5 * pow(toward, 14.0);
  col += vec3(0.42, 0.21, 0.09) * dome * 0.55;
  // Cooler glow up the Illinois side (refinery / Alton)
  float east = max(dot(dxz, normalize(vec2(-0.85, -0.5))), 0.0);
  col += vec3(0.25, 0.16, 0.1) * exp(-h * 14.0) * pow(east, 6.0) * 0.35;

  // Stars
  vec2 sp = vec2(atan(d.z, d.x) * 180.0, asin(clamp(el, -1.0, 1.0)) * 360.0);
  vec2 cell = floor(sp);
  float r = hash(cell);
  vec2 off = vec2(hash(cell + 7.1), hash(cell + 3.3)) - 0.5;
  float star = 0.0;
  if (r > 0.986) {
    float dist = length(fract(sp) - 0.5 - off * 0.6);
    float tw = 0.7 + 0.3 * sin(uTime * (1.0 + r * 4.0) + r * 60.0);
    star = smoothstep(0.16, 0.0, dist) * tw * (r - 0.986) * 70.0;
  }
  float starFade = smoothstep(0.02, 0.35, el) * (1.0 - clamp(dome * 1.4, 0.0, 0.85));
  col += vec3(0.8, 0.86, 1.0) * star * starFade;

  // Moon + halo
  float md = dot(d, normalize(uMoonDir));
  float disc = smoothstep(0.99955, 0.99975, md);
  float mottle = 0.85 + 0.15 * fbm(d.xy * 900.0);
  col += vec3(1.0, 0.96, 0.86) * disc * 2.4 * mottle;
  col += vec3(0.35, 0.4, 0.5) * pow(max(md, 0.0), 900.0) * 0.6;
  col += vec3(0.12, 0.14, 0.2) * pow(max(md, 0.0), 40.0) * 0.35;

  // High thin cloud, lit by the city from below and the moon from above
  if (el > 0.0) {
    vec2 cp = d.xz / (el + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
    float c = smoothstep(0.48, 0.82, fbm(cp));
    vec3 cloudCol = vec3(0.13, 0.085, 0.06) * (0.4 + 1.6 * pow(toward, 3.0)) + vec3(0.05, 0.06, 0.08) * pow(max(md, 0.0), 6.0);
    col = mix(col, cloudCol, c * 0.55 * smoothstep(0.0, 0.12, el));
  }

  if (el < 0.0) col = mix(horizon * 0.6, vec3(0.01, 0.012, 0.02), clamp(-el * 6.0, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function createSky() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uTime: { value: 0 },
      uMoonDir: { value: MOON_DIR },
      uCityDir: { value: CITY_DIR },
    },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (_r, _s, camera) => { mesh.position.copy(camera.position); mesh.updateMatrixWorld(); };
  return {
    mesh,
    update(t) { mat.uniforms.uTime.value = t; },
  };
}
