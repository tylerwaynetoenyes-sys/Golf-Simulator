// Landmark models for the courses. Each builder (js/course/lm/*.js, see
// kit.js for the contract) returns { group, glow[] }: `group` sits on y = 0 at
// its base, and `glow` lists materials whose emissive uplighting fades in at
// night. The builders model the real structures in photographed PBR surfaces
// (js/scene/pbr.js).
import * as THREE from 'three';
import { EXTRA } from './lm/index.js';

export function buildLandmark(type) {
  const b = EXTRA[type];
  if (!b) return { group: new THREE.Group(), glow: [] };
  const out = b();
  out.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return out;
}

/** 0 = night .. 1 = day: uplights fade in after dark. */
export function setLandmarkDay(lm, d) {
  for (const m of lm.glow) m.emissiveIntensity = (m.userData.night ?? 0.5) * (1 - d);
  if (lm.arch) {
    lm.arch.uniforms.uDay.value = d;
  }
}
