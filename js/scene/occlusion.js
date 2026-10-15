// Nothing stands between the camera and the ball: trees, shrubs and long
// grass inside a corridor from the camera to the ball (or the target) fade
// out with an ordered dither (screen-door transparency, as in GSPro and
// Trackman), so the camera can stay at eye level instead of climbing over
// them. One shared set of uniforms drives every patched material.
import * as THREE from 'three';

export const OCCLUDE = {
  uOccA: { value: new THREE.Vector3() }, // the camera
  uOccB: { value: new THREE.Vector3(0, -9999, 0) }, // what it looks at (the ball)
  uOccR: { value: 6 }, // corridor radius at the camera, m (narrows toward the ball)
  uOccOn: { value: 0 },
};

/** The fragment side, for shaders that place their own vertices (tree impostors set vOccW themselves). */
export const OCC_DECL = 'varying vec3 vOccW; uniform vec3 uOccA; uniform vec3 uOccB; uniform float uOccR; uniform float uOccOn;';
export const OCC_TEST = `
        if (uOccOn > 0.5) {
          vec3 ab = uOccB - uOccA;
          float L = length(ab);
          float t = clamp(dot(vOccW - uOccA, ab) / max(L * L, 1e-4), 0.0, 1.0);
          float d = length(vOccW - (uOccA + ab * t));
          // the corridor narrows toward the ball and stops 3 m short of it
          float along = t * L;
          float r = mix(uOccR, 2.2, sqrt(t));
          float inside = (1.0 - smoothstep(r * 0.6, r, d)) * step(0.0, L - 3.0 - along);
          // and anything right in front of the lens, whichever way it looks
          inside = max(inside, 1.0 - smoothstep(8.0, 14.0, length(vOccW - uOccA)));
          if (inside > 0.0) {
            // 4x4 ordered dither: drop a share of fragments that grows to all
            vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
            float b = mod(q.x * 4.0 + q.y * 3.0 + q.x * q.y, 16.0) / 16.0;
            if (b < inside * 1.02) discard;
          }
        }`;

const PATCHED = new WeakSet();

function patch(m) {
  if (!m || PATCHED.has(m)) return;
  PATCHED.add(m);
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    Object.assign(sh.uniforms, OCCLUDE);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOccW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 occP = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            occP = instanceMatrix * occP;
          #endif
          vOccW = (modelMatrix * occP).xyz;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${OCC_DECL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
${OCC_TEST}`);
  };
  m.customProgramCacheKey = () => `${prevKey ? prevKey.call(m) : ''}|occ`;
  m.needsUpdate = true;
}

/** Patch every instanced mesh (trees, shrubs, grass) under `root`. */
export function patchOccluders(root) {
  root.traverse((o) => {
    if (!o.isInstancedMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) patch(m);
  });
}

/** Each frame: the camera and what it is looking at. */
export function setOcclusion(camPos, focus, on = true) {
  OCCLUDE.uOccA.value.copy(camPos);
  if (focus) OCCLUDE.uOccB.value.copy(focus);
  OCCLUDE.uOccOn.value = on && focus ? 1 : 0;
}
