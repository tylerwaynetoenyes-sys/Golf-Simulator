// Real surfaces for built things: photographed PBR texture sets (Poly Haven,
// CC0; assets/textures/pbr/<id>_{diff,rough,nor_gl}.jpg) laid on in world
// space from three sides (triplanar), so any modelled shape takes cut stone,
// concrete, tile or metal at true scale without UVs. One material per set
// and tint, shared and cached; the textures load once, when first used.
//
//   pbr('sandstone_blocks_08', { scale: 2.5, tint: 0xf2ece0 })
//     scale  metres one texture tile covers
//     tint   multiplies the photographed colour (keep it light)
//     metal  metalness (steel, copper) · rough  roughness multiplier
//     glow   night emissive colour (lit stone, windows) via userData.night
//     offset polygon offset (draped paving over the ground)
import * as THREE from 'three';

const BASE = new URL('../../assets/textures/pbr/', import.meta.url).href;
const loader = new THREE.TextureLoader();
const sets = new Map();
function set(id) {
  if (!sets.has(id)) {
    const load = (m, srgb) => {
      const t = loader.load(`${BASE}${id}_${m}.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 4;
      return t;
    };
    sets.set(id, { diff: load('diff', true), rough: load('rough', false), nor: load('nor_gl', false) });
  }
  return sets.get(id);
}

const cache = new Map();
export function pbr(id, { scale = 3, tint = 0xffffff, metal = 0, rough = 1, glow = null, night = 0.5, side = THREE.FrontSide, offset = 0 } = {}) {
  const key = `${id}|${scale}|${tint}|${metal}|${rough}|${glow}|${side}|${offset}`;
  if (cache.has(key)) return cache.get(key);
  const tx = set(id);
  const m = new THREE.MeshStandardMaterial({ color: tint, metalness: metal, roughness: 1, side });
  if (offset) Object.assign(m, { polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset });
  if (glow != null) { m.emissive = new THREE.Color(glow); m.emissiveIntensity = 0; m.userData.night = night; }
  const uni = { uTriD: { value: tx.diff }, uTriR: { value: tx.rough }, uTriN: { value: tx.nor }, uTriS: { value: 1 / scale }, uTriRough: { value: rough } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriW; varying vec3 vTriN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        {
          vec4 tp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            tp = instanceMatrix * tp;
          #endif
          vTriW = (modelMatrix * tp).xyz;
          vTriN = normalize(mat3(modelMatrix) * objectNormal);
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vTriW; varying vec3 vTriN;
uniform sampler2D uTriD; uniform sampler2D uTriR; uniform sampler2D uTriN; uniform float uTriS; uniform float uTriRough;
vec3 triW() { vec3 w = pow(abs(normalize(vTriN)), vec3(4.0)); return w / (w.x + w.y + w.z); }`)
      .replace('#include <map_fragment>', `
        vec3 tw = triW();
        vec3 tp = vTriW * uTriS;
        vec3 tc = texture2D(uTriD, tp.zy).rgb * tw.x + texture2D(uTriD, tp.xz).rgb * tw.y + texture2D(uTriD, tp.xy).rgb * tw.z;
        diffuseColor.rgb *= tc;`)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness * uTriRough * (texture2D(uTriR, tp.zy).g * tw.x + texture2D(uTriR, tp.xz).g * tw.y + texture2D(uTriR, tp.xy).g * tw.z);`)
      .replace('#include <normal_fragment_maps>', `
        {
          // whiteout-blended triplanar normal, in world space, back to view space
          vec3 nx = texture2D(uTriN, tp.zy).xyz * 2.0 - 1.0;
          vec3 ny = texture2D(uTriN, tp.xz).xyz * 2.0 - 1.0;
          vec3 nz = texture2D(uTriN, tp.xy).xyz * 2.0 - 1.0;
          vec3 wn = normalize(vTriN);
          nx = vec3(nx.xy + wn.zy, abs(nx.z) * wn.x);
          ny = vec3(ny.xy + wn.xz, abs(ny.z) * wn.y);
          nz = vec3(nz.xy + wn.xy, abs(nz.z) * wn.z);
          vec3 bn = normalize(nx.zyx * tw.x + ny.xzy * tw.y + nz.xyz * tw.z);
          vec3 vn = normalize((viewMatrix * vec4(bn, 0.0)).xyz);
          normal = normalize(mix(normal, vn, 0.85));
        }`);
  };
  m.customProgramCacheKey = () => `pbrTri|${id}`;
  cache.set(key, m);
  return m;
}
