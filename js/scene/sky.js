// Night sky dome: deep navy zenith, sodium-orange light pollution pooled over
// St. Louis, stars that thin out toward the glow, a low moon and slow
// high-altitude cloud lit from below by the city.
import * as THREE from 'three';

export const MOON_DIR = new THREE.Vector3(-0.62, 0.36, -0.7).normalize();
export const CITY_DIR = new THREE.Vector3(0.17, 0, -0.985).normalize();
// Afternoon sun behind the golfer's right shoulder: the range is front-lit.
export const SUN_DIR = new THREE.Vector3(0.42, 0.6, 0.68).normalize();

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
uniform vec3 uSunDir;
uniform float uDay;     // 0 night .. 1 day
uniform float uCloud;   // 0 clear .. 1 overcast
uniform vec2 uDrift;    // wind-driven cloud offset
uniform float uStorm;   // 0 .. 1: the photographed storm sky takes over (rain)
uniform sampler2D uStormTex;
uniform float uStormTurn; // the storm's clouds wheel slowly overhead
uniform sampler2D uDayTex; uniform float uDayAmt;     // a photographed day sky for this place (or none)
uniform sampler2D uNightTex; uniform float uNightAmt; // a photographed night sky: the Milky Way over a dark site
uniform float uSkyTurn;
vec3 photo(sampler2D t, vec3 d, float turn) {
  float u = atan(d.z, d.x) / 6.2831853 + 0.5 + turn;
  float v = 0.5 + asin(clamp(d.y, -1.0, 1.0)) / 3.1415927;
  return pow(texture2D(t, vec2(u, v)).rgb, vec3(2.2));
}
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
  vec2 dxz = normalize(d.xz + 1e-5);
  float toward = max(dot(dxz, normalize(uCityDir.xz)), 0.0);
  vec2 cp = d.xz / max(el + 0.12, 0.02) * 1.6 + uDrift;
  float cn = fbm(cp);
  float lo = mix(0.5, 0.2, uCloud), hi = mix(0.85, 0.62, uCloud);

  // ── night ──
  vec3 zenith = vec3(0.006, 0.011, 0.028);
  vec3 horizon = vec3(0.045, 0.06, 0.09);
  vec3 night = mix(horizon, zenith, pow(h, 0.45));
  // Light pollution: warm dome concentrated toward St. Louis, faint all round.
  float dome = exp(-h * 9.0) * (0.22 + 1.1 * pow(toward, 5.0)) + exp(-h * 22.0) * 0.5 * pow(toward, 14.0);
  night += vec3(0.42, 0.21, 0.09) * dome * 0.55 * (1.0 + uCloud * 0.6);
  float east = max(dot(dxz, normalize(vec2(-0.85, -0.5))), 0.0);
  night += vec3(0.25, 0.16, 0.1) * exp(-h * 14.0) * pow(east, 6.0) * 0.35;
  vec2 sp = vec2(atan(d.z, d.x) * 180.0, asin(clamp(el, -1.0, 1.0)) * 360.0);
  vec2 cell = floor(sp);
  float r = hash(cell);
  vec2 off = vec2(hash(cell + 7.1), hash(cell + 3.3)) - 0.5;
  float star = 0.0;
  if (r > 0.986) {
    float dist = length(fract(sp) - 0.5 - off * 0.6);
    float tw = 0.7 + 0.3 * sin(uTime * (1.0 + r * 4.0) + r * 60.0);
    star = (1.0 - smoothstep(0.0, 0.16, dist)) * tw * (r - 0.986) * 70.0;
  }
  float starFade = smoothstep(0.02, 0.35, el) * (1.0 - clamp(dome * 1.4, 0.0, 0.85)) * (1.0 - uCloud * 0.8);
  night += vec3(0.8, 0.86, 1.0) * star * starFade;
  float md = dot(d, normalize(uMoonDir));
  float disc = smoothstep(0.99955, 0.99975, md);
  float mottle = 0.85 + 0.15 * fbm(d.xy * 900.0);
  night += (vec3(1.0, 0.96, 0.86) * disc * 2.4 * mottle + vec3(0.35, 0.4, 0.5) * pow(max(md, 0.0), 900.0) * 0.6) * (1.0 - uCloud * 0.7);
  night += vec3(0.12, 0.14, 0.2) * pow(max(md, 0.0), 40.0) * 0.35;
  if (el > 0.0) {
    float c = smoothstep(lo, hi, cn);
    vec3 cloudCol = vec3(0.13, 0.085, 0.06) * (0.4 + 1.6 * pow(toward, 3.0)) + vec3(0.05, 0.06, 0.08) * pow(max(md, 0.0), 6.0);
    night = mix(night, cloudCol, c * (0.55 + 0.35 * uCloud) * smoothstep(0.0, 0.12, el));
  }
  if (el < 0.0) night = mix(horizon * 0.6, vec3(0.01, 0.012, 0.02), clamp(-el * 6.0, 0.0, 1.0));

  // ── day ──
  vec3 dz = vec3(0.10, 0.27, 0.62);
  vec3 dh = vec3(0.58, 0.72, 0.86);
  vec3 day = mix(dh, dz, pow(h, 0.5));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  day += vec3(1.0, 0.9, 0.7) * pow(sd, 8.0) * 0.35 + vec3(1.0, 0.95, 0.85) * pow(sd, 300.0) * 1.2;
  day += vec3(1.0, 0.98, 0.9) * smoothstep(0.9993, 0.9996, sd) * 8.0; // sun disc
  day += vec3(0.85, 0.75, 0.65) * exp(-h * 18.0) * 0.12 * pow(toward, 3.0); // summer haze over the city
  // overcast greys the whole sky
  vec3 grey = vec3(0.62, 0.66, 0.71) * (0.75 + 0.25 * h);
  day = mix(day, grey, uCloud * 0.75);
  if (el > 0.0) {
    float c = smoothstep(lo, hi, cn);
    float shade = smoothstep(0.3, 0.9, fbm(cp * 1.7 + 4.0));
    vec3 lit = mix(vec3(1.0, 0.99, 0.97), vec3(0.66, 0.7, 0.76), shade * 0.7 + uCloud * 0.35);
    lit += vec3(1.0, 0.85, 0.6) * pow(sd, 12.0) * 0.4;
    day = mix(day, lit, c * smoothstep(0.0, 0.1, el) * 0.92);
  }
  if (el < 0.0) day = mix(dh * 0.8, vec3(0.3, 0.36, 0.4), clamp(-el * 4.0, 0.0, 1.0));

  // this place's own skies, photographed. By day the sky above the haze; by night the
  // sky above the hills in the photograph (its lower band is somewhere else's horizon)
  if (uDayAmt > 0.001) day = mix(day, photo(uDayTex, d, uSkyTurn) * 1.05, uDayAmt * smoothstep(0.0, 0.06, el) * (1.0 - uCloud * 0.6));
  if (uNightAmt > 0.001) {
    vec3 mw = photo(uNightTex, d, uSkyTurn) * 0.9;
    night = mix(night, mw + night * 0.25, uNightAmt * smoothstep(0.14, 0.4, el) * (1.0 - uCloud * 0.85));
  }
  vec3 col = mix(night, day, uDay);
  // the storm: a photographed sky of heavy rolling cloud (Poly Haven, CC0), darker
  // by night, where only the city's glow lights its underside
  if (uStorm > 0.001) {
    float u = atan(d.z, d.x) / 6.2831853 + 0.5 + uStormTurn;
    float v = 0.5 + asin(clamp(el, -1.0, 1.0)) / 3.1415927;
    vec3 st = texture2D(uStormTex, vec2(u, v)).rgb;
    st = pow(st, vec3(2.2)); // the photograph is sRGB
    vec3 stormDay = st * 0.72; // a storm is darker than the photograph's exposure
    vec3 stormNight = st * 0.035 + vec3(0.42, 0.21, 0.09) * dome * 0.3;
    vec3 storm = mix(stormNight, stormDay, uDay);
    col = mix(col, storm, uStorm * smoothstep(-0.08, 0.02, el));
  }
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
      uSunDir: { value: SUN_DIR },
      uDay: { value: 0 },
      uCloud: { value: 0.2 },
      uDrift: { value: new THREE.Vector2() },
      uStorm: { value: 0 },
      uStormTex: { value: null },
      uStormTurn: { value: 0 },
      uDayTex: { value: null }, uDayAmt: { value: 0 },
      uNightTex: { value: null }, uNightAmt: { value: 0 },
      uSkyTurn: { value: 0 },
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
  // the storm photograph, loaded once (2048 x 1024 tonemapped from overcast_soil_puresky)
  if (typeof window !== 'undefined') {
    new THREE.TextureLoader().load(new URL('../../assets/hdri/storm_sky_4k.jpg', import.meta.url).href, (t) => {
      t.colorSpace = THREE.NoColorSpace; // linearised in the shader
      t.wrapS = THREE.RepeatWrapping;
      mat.uniforms.uStormTex.value = t;
    });
  }
  // this place's skies (a course's `sky`: { day: 'prairie' | 'mediterranean', night: 'milkyway' })
  const PHOTOS = { prairie: 'sky_prairie_4k.jpg', mediterranean: 'sky_mediterranean_4k.jpg', milkyway: 'milkyway_4k.jpg' };
  const cache = {};
  const photoTex = (id, cb) => {
    if (!id || typeof window === 'undefined') { cb(null); return; }
    if (cache[id]) { cb(cache[id]); return; }
    new THREE.TextureLoader().load(new URL(`../../assets/hdri/${PHOTOS[id]}`, import.meta.url).href, (t) => {
      t.colorSpace = THREE.NoColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
      cb((cache[id] = t));
    });
  };
  const setPlace = ({ day = null, night = null, turn = 0 } = {}) => {
    mat.uniforms.uSkyTurn.value = turn;
    mat.uniforms.uDayAmt.value = 0; mat.uniforms.uNightAmt.value = 0;
    photoTex(day, (t) => { mat.uniforms.uDayTex.value = t; mat.uniforms.uDayAmt.value = t ? 1 : 0; });
    photoTex(night, (t) => { mat.uniforms.uNightTex.value = t; mat.uniforms.uNightAmt.value = t ? 1 : 0; });
  };
  return {
    mesh,
    setPlace,
    uniforms: mat.uniforms,
    update(t) { mat.uniforms.uTime.value = t; },
  };
}
