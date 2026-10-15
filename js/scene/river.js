// The Mississippi below the bluffs. A cheap analytic water shader: rippled
// normals, Fresnel sky reflection, and the night-river signature — every light
// on the far shore, the bridge, the barges and the Arch smeared into a long
// vertical streak that wobbles with the current. Light sources register
// themselves through `addLight()`; moving lights (barges) update per frame.
import * as THREE from 'three';
import { LAYOUT } from './layout.js';
import { MOON_DIR, CITY_DIR, SUN_DIR } from './sky.js';

const MAX_LIGHTS = 64;

/** Every water surface (river + course ponds) so the environment can update them together. */
export const waterMaterials = new Set();

const vert = /* glsl */`
varying vec3 vWPos;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const frag = /* glsl */`
#define MAX_LIGHTS ${MAX_LIGHTS}
uniform float uTime;
uniform vec4 uLights[MAX_LIGHTS];   // xyz pos, w = intensity
uniform vec4 uLightCol[MAX_LIGHTS]; // rgb, w = width scale
uniform int uCount;
uniform vec3 uMoonDir;
uniform vec3 uCityDir;
uniform float uWaterY;
uniform float uDay;
uniform float uCloud;
uniform vec3 uSunDir;
uniform vec3 uTint;
uniform float uFlow;
varying vec3 vWPos;
#include <fog_pars_fragment>

float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }

void main() {
  vec3 V = vWPos - cameraPosition;
  float dist = length(V);
  vec3 dir = V / dist;

  // Ripple field flowing west-to-east across the view, stretched along the current.
  vec2 p = vWPos.xz;
  float t = uTime;
  vec2 q = vec2(p.x * 0.045 - t * 0.35 * uFlow, p.y * 0.11);
  float n1 = vn(q * 1.0) - 0.5;
  float n2 = vn(q * 2.7 + vec2(t * 0.2, 3.1)) - 0.5;
  float n3 = vn(vec2(p.x * 0.4 - t * 1.4, p.y * 0.9)) - 0.5;
  float ripple = n1 * 0.6 + n2 * 0.3 + n3 * 0.1;
  float fadeDetail = clamp(1.0 - dist / 5000.0, 0.15, 1.0);

  // Base: inky brown-green river water
  vec3 col = vec3(0.006, 0.009, 0.011);

  // Fresnel sky reflection: horizon glow (warm toward the city)
  float cosI = max(-dir.y, 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - cosI, 5.0);
  vec2 dxz = normalize(dir.xz + 1e-5);
  float toward = max(dot(dxz, normalize(uCityDir.xz)), 0.0);
  vec3 skyRefl = mix(vec3(0.03, 0.04, 0.06), vec3(0.2, 0.1, 0.05), pow(toward, 4.0));
  col += skyRefl * fres * (0.8 + ripple * 0.6);

  // Reflected light streaks
  vec3 streaks = vec3(0.0);
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uCount) break;
    vec3 L = uLights[i].xyz;
    vec3 Lm = vec3(L.x, 2.0 * uWaterY - L.y, L.z); // mirror image under the water
    vec3 M = Lm - cameraPosition;
    float md = length(M);
    vec3 mdir = M / md;
    // horizontal angular offset (narrow) and vertical offset (long streak)
    float az = atan(dir.x, -dir.z) - atan(mdir.x, -mdir.z);
    float el = asin(clamp(dir.y, -1.0, 1.0)) - asin(clamp(mdir.y, -1.0, 1.0));
    float w = 0.0026 * uLightCol[i].w + 0.0012;
    az += ripple * 0.004 * fadeDetail;
    float hz = exp(-az * az / (w * w));
    // streak runs from the mirror point toward the viewer
    float along = el < 0.0 ? exp(el * 7.0) : exp(-el * 140.0);
    float shimmer = 0.55 + 0.9 * smoothstep(-0.15, 0.35, ripple + n3 * 0.6);
    streaks += uLightCol[i].rgb * uLights[i].w * hz * along * shimmer;
  }
  col += streaks * (1.0 - uDay);

  // Moon glitter path
  vec3 R = reflect(dir, normalize(vec3(ripple * 0.18 * fadeDetail, 1.0, n2 * 0.12 * fadeDetail)));
  float m = max(dot(R, normalize(uMoonDir)), 0.0);
  col += (vec3(0.55, 0.6, 0.7) * pow(m, 260.0) * 0.9 + vec3(0.1, 0.12, 0.16) * pow(m, 24.0) * 0.25) * (1.0 - uDay) * (1.0 - uCloud * 0.7);

  // Daylight: muddy-blue river, bright sky reflection, sun glitter
  vec3 dayBase = uTint * (0.85 + ripple * 0.3);
  vec3 skyDay = mix(vec3(0.55, 0.68, 0.82), vec3(0.62, 0.65, 0.69), uCloud);
  vec3 dcol = dayBase + skyDay * fres * 0.62;
  float sg = max(dot(R, normalize(uSunDir)), 0.0);
  dcol += vec3(1.0, 0.95, 0.85) * (pow(sg, 400.0) * 6.0 + pow(sg, 40.0) * 0.25) * (1.0 - uCloud * 0.85);
  col = mix(col, dcol, uDay);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/**
 * Ponds, lakes, creeks and the sea: physically based water. It reflects the real
 * sky (the scene's HDRI environment) by Fresnel, takes the sun's glint and the
 * trees' shadows, and moves with wind-driven ripples (procedural normals, in
 * three octaves that ease off with distance so they never shimmer). With
 * `clarity` the water is see-through where you look down into it, so the bed the
 * terrain paints under it (shallow mud at the margin, darkening with depth)
 * shows at the edges and the sheet meets the bank softly.
 * The returned material keeps the old `uniforms` (uTime, uDay, uCloud) so the
 * environment can drive it like the river.
 */
export function createWaterMaterial({ y = 0, tint = 0x1c2a2c, flow = 0.3, clarity = 0 } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(tint).multiplyScalar(0.95), roughness: 0.035, metalness: 0, envMapIntensity: 1.1,
    transparent: clarity > 0, depthWrite: clarity <= 0,
  });
  const uni = {
    uTime: { value: 0 }, uDay: { value: 1 }, uCloud: { value: 0.2 }, uFlow: { value: flow },
    uClarity: { value: clarity }, uDeep: { value: new THREE.Color(tint) },
  };
  mat.uniforms = uni;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWWPos;
uniform float uTime; uniform float uFlow; uniform float uClarity; uniform float uCloud; uniform vec3 uDeep;
float wh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wh(i), wh(i + vec2(1, 0)), u.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), u.x), u.y); }
// the slope of a ripple field: a few octaves of drifting noise, the wind from the west
vec2 wslope(vec2 p, float t, float fade) {
  vec2 g = vec2(0.0);
  float e = 0.05;
  vec2 d1 = vec2(t * 0.35 + t * uFlow * 0.6, t * 0.08), d2 = vec2(-t * 0.21, t * 0.29), d3 = vec2(t * 0.9, -t * 0.4);
  for (int k = 0; k < 3; k++) {
    float sc = k == 0 ? 0.8 : k == 1 ? 2.3 : 6.5;
    float amp = (k == 0 ? 0.22 : k == 1 ? 0.16 : 0.1) * (k == 2 ? fade : 1.0);
    vec2 q = p * sc + (k == 0 ? d1 : k == 1 ? d2 : d3);
    float c = wn(q);
    g += amp * vec2(wn(q + vec2(e, 0.0)) - c, wn(q + vec2(0.0, e)) - c) / e * sc * 0.12;
  }
  return g;
}`)
      .replace('#include <normal_fragment_maps>', `
      {
        float dist = length(vWWPos - cameraPosition);
        float fade = clamp(1.0 - dist / 260.0, 0.0, 1.0);
        float calm = mix(0.45, 0.85, uCloud); // a breezy, overcast day ruffles it more
        vec2 g = wslope(vWWPos.xz, uTime, fade) * calm * mix(0.35, 1.0, clamp(1.0 - dist / 1400.0, 0.0, 1.0));
        vec3 wn3 = normalize(vec3(-g.x, 1.0, -g.y));
        normal = normalize((viewMatrix * vec4(wn3, 0.0)).xyz);
      }`)
      .replace('#include <opaque_fragment>', `
      {
        // looking down into it you see through the top of the water; at a low angle it is all reflection
        vec3 V = normalize(cameraPosition - vWWPos);
        float cosV = clamp(V.y, 0.0, 1.0);
        float fr = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);
        float a = uClarity > 0.0 ? mix(1.0 - uClarity, 1.0, clamp(fr * 1.6, 0.0, 1.0)) : 1.0;
        diffuseColor.a = a;
      }
      #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'fairwayWater2';
  waterMaterials.add(mat);
  return mat;
}

export function createRiver(scene, maxLights = MAX_LIGHTS) {
  const lights = [];
  const uLights = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4());
  const uLightCol = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4());
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uLights: { value: uLights },
        uLightCol: { value: uLightCol },
        uCount: { value: 0 },
        uMoonDir: { value: MOON_DIR },
        uCityDir: { value: CITY_DIR },
        uWaterY: { value: LAYOUT.riverY },
        uDay: { value: 0 },
        uCloud: { value: 0.2 },
        uSunDir: { value: SUN_DIR },
        uTint: { value: new THREE.Color(0.11, 0.13, 0.12) },
        uFlow: { value: 1 },
      },
    ]),
    fog: true,
  });
  waterMaterials.add(mat);
  // uniforms merge clones arrays; keep references live
  mat.uniforms.uLights.value = uLights;
  mat.uniforms.uLightCol.value = uLightCol;

  const width = 40000;
  const depth = LAYOUT.riverFar - LAYOUT.riverNear;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, Math.abs(depth) + 60, 1, 1).rotateX(-Math.PI / 2), mat);
  mesh.position.set(0, LAYOUT.riverY, (LAYOUT.riverNear + LAYOUT.riverFar) / 2);
  mesh.renderOrder = -10;
  scene.add(mesh);

  let budget = maxLights;
  return {
    mesh,
    setBudget(n) { budget = Math.min(MAX_LIGHTS, n); },
    /**
     * @param {THREE.Vector3|{x,y,z}} pos
     * @param {number} color hex
     * @param {number} intensity
     * @param {number} width relative streak width (1 = small lamp)
     * @param {number} priority higher survives a reduced light budget
     */
    addLight(pos, color, intensity = 1, width = 1, priority = 1) {
      const l = { pos, color: new THREE.Color(color), intensity, width, priority };
      lights.push(l);
      return l;
    },
    update(t) {
      mat.uniforms.uTime.value = t;
      const sorted = lights.length > budget ? [...lights].sort((a, b) => b.priority - a.priority) : lights;
      const n = Math.min(sorted.length, budget);
      for (let i = 0; i < n; i++) {
        const l = sorted[i];
        uLights[i].set(l.pos.x, l.pos.y, l.pos.z, l.intensity);
        uLightCol[i].set(l.color.r, l.color.g, l.color.b, l.width);
      }
      mat.uniforms.uCount.value = n;
    },
  };
}
