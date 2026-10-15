// Real rock on steep ground. Wherever the terrain is steeper than about 35°
// (bluffs, cliffs, badlands, ravines), the ground material blends into a
// photographed rock surface (Poly Haven, CC0), projected from three sides
// (triplanar) so cliffs don't smear, tinted per course to its geology:
//   limestone   the Mississippi bluffs at Alton and Godfrey, St. Louis, Paris
//   badlands    Scotts Bluff's tan siltstone and sandstone (Oregon Trail)
//   ochre       Cap Canaille's red conglomerate (Cassis)
//   granite     the dark sea cliffs at Pebble Beach
// Patched into the course's ground materials from outside (by shader key).
import * as THREE from 'three';

const ROCKS = {
  limestone: { id: 'rock_08', tint: [1.0, 0.97, 0.9], scale: 7 },
  badlands: { id: 'rock_face_03', tint: [1.08, 1.0, 0.86], scale: 9 },
  ochre: { id: 'rock_boulder_cracked', tint: [1.12, 0.78, 0.6], scale: 8 },
  granite: { id: 'rock_wall_02', tint: [0.9, 0.9, 0.9], scale: 7 },
};
const BY_COURSE = { oregon: 'badlands', cassis: 'ochre', pebble: 'granite' };

const loader = new THREE.TextureLoader();
const cache = new Map();
function maps(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const base = new URL('../../assets/textures/rock/', import.meta.url).href;
  const id = ROCKS[kind].id;
  const load = (suffix, srgb) => {
    const t = loader.load(`${base}${id}_${suffix}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const m = { diff: load('diff', true), rough: load('rough', false) };
  cache.set(kind, m);
  return m;
}

const PATCHED = new WeakSet();
const KEYS = new Set(['courseGround', 'backdropGround', 'backdropGroundSat']);

function patch(m, kind, coarse = false) {
  if (PATCHED.has(m)) { m.userData.rockUniforms && swap(m.userData.rockUniforms, kind); return; }
  PATCHED.add(m);
  const R = ROCKS[kind], tx = maps(kind);
  const uni = {
    uRockDiff: { value: tx.diff }, uRockRough: { value: tx.rough },
    uRockTint: { value: new THREE.Vector3(...R.tint) }, uRockScale: { value: 1 / R.scale },
    // the backdrop's coarse mesh averages cliffs into gentler slopes
    uRockLo: { value: coarse ? 0.16 : 0.42 }, uRockHi: { value: coarse ? 0.34 : 0.62 },
  };
  m.userData.rockUniforms = uni;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockW; varying vec3 vRockN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRockW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vRockN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockW; varying vec3 vRockN; uniform sampler2D uRockDiff; uniform sampler2D uRockRough; uniform vec3 uRockTint; uniform float uRockScale; uniform float uRockLo; uniform float uRockHi;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        {
          vec3 n = normalize(vRockN);
          float slope = 1.0 - abs(n.y);
          // rock takes over from ~35° and is all rock by ~50°
          float k = smoothstep(uRockLo, uRockHi, slope);
          if (k > 0.001) {
            vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
            vec3 p = vRockW * uRockScale;
            vec3 c = texture2D(uRockDiff, p.zy).rgb * w.x + texture2D(uRockDiff, p.xz).rgb * w.y + texture2D(uRockDiff, p.xy).rgb * w.z;
            float rr = texture2D(uRockRough, p.zy).g * w.x + texture2D(uRockRough, p.xz).g * w.y + texture2D(uRockRough, p.xy).g * w.z;
            // a second, larger projection breaks up the repeat
            vec3 p2 = vRockW * uRockScale * 0.23;
            vec3 c2 = texture2D(uRockDiff, p2.zy + 0.37).rgb * w.x + texture2D(uRockDiff, p2.xz + 0.37).rgb * w.y + texture2D(uRockDiff, p2.xy + 0.37).rgb * w.z;
            c = mix(c, c2, 0.35) * uRockTint;
            diffuseColor.rgb = mix(diffuseColor.rgb, c, k);
            roughnessFactor = mix(roughnessFactor, clamp(rr + 0.15, 0.4, 1.0), k);
          }
        }`);
  };
  m.customProgramCacheKey = () => `${prevKey ? prevKey.call(m) : ''}|rock`;
  m.needsUpdate = true;
}

function swap(uni, kind) {
  const R = ROCKS[kind], tx = maps(kind);
  uni.uRockDiff.value = tx.diff; uni.uRockRough.value = tx.rough;
  uni.uRockTint.value.set(...R.tint); uni.uRockScale.value = 1 / R.scale;
}

/** Give a hole's ground (and the land beyond it) real rock on its steep faces. */
export function patchRock(root, courseId) {
  // Cahokia's mounds are grassed earth, built by hand: no cliff rock on their faces
  if (courseId === 'cahokia') return;
  const kind = BY_COURSE[courseId] || 'limestone';
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const m = o.material;
    if (!m || Array.isArray(m) || !m.customProgramCacheKey) return;
    const key = m.customProgramCacheKey();
    if ([...KEYS].some((k) => key.startsWith(k))) patch(m, kind, key.startsWith('backdrop'));
  });
}
