// Rough grass: clumps of thin, curved, tapering blades, dark at the root and
// lit at the tip. They sway with the real wind, and part and flatten around
// the ball as it rolls through, then spring back (all in the vertex shader).
import * as THREE from 'three';

/** Shared by every tuft material: updated once a frame by CourseWorld. */
export const GRASS = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(0, 0) }, // direction the air moves, scaled by strength (0..1)
  uBall: { value: new THREE.Vector3(0, -999, 0) },
};

/**
 * One clump: `blades` blades, each a 3-segment strip curving outward. Unit
 * height. `width` scales the blades, `lean` their arc and `dry` is the share
 * of straw-coloured ones (links fescue: fine, upright and mostly dry);
 * `segs` the segments per blade and `root` the radius the roots spread over
 * (a wide root makes a patch of sward rather than a clump).
 */
export function tuftGeometry(blades = 14, seed = 7, { width = 1, lean: leanK = 1, dry = 0.18, segs = 3, root = 0.05 } = {}) {
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const pos = [], col = [], idx = [];
  for (let i = 0; i < blades; i++) {
    const a = rnd() * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const base = rnd() * root; // root spread
    const bx = ca * base, bz = sa * base;
    const lean = (0.18 + rnd() * 0.4) * leanK; // how far it arcs out by the tip
    const hgt = 0.65 + rnd() * 0.35;
    const w = (0.009 + rnd() * 0.006) * width;
    const tone = 0.85 + rnd() * 0.3;
    const yellow = rnd() < dry ? 1 : 0; // a few dry blades
    const start = pos.length / 3;
    for (let k = 0; k <= segs; k++) {
      const u = k / segs;
      const out = lean * u * u; // curve: steeper near the root
      const cx = bx + ca * out, cz = bz + sa * out, cy = hgt * Math.sin((u * Math.PI) / 2.2) / Math.sin(Math.PI / 2.2);
      const ww = w * (1 - u * 0.92);
      // blade face is across the lean direction
      pos.push(cx - sa * ww, cy, cz + ca * ww, cx + sa * ww, cy, cz - ca * ww);
      const g = (0.35 + 0.75 * u) * tone;
      const c = yellow ? [g * 1.1, g * 1.0, g * 0.55] : [g * 0.78, g, g * 0.6];
      col.push(...c, ...c);
    }
    for (let k = 0; k < segs; k++) {
      const v = start + k * 2;
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // light the blades as if their normals pointed up: no dark backfaces in a clump
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.35, 0.94, n.getZ(i) * 0.35);
  return geo;
}

/** Tuft material in a given tint; bends with wind and parts around the ball. */
export function grassMaterial(color) {
  const m = new THREE.MeshStandardMaterial({ color, vertexColors: true, side: THREE.DoubleSide, roughness: 0.92 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, GRASS);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec2 uWind; uniform vec3 uBall;')
      // blades shade like the ground they grow from (a thin double-sided blade lit from behind goes black)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(mix(normal, vec3(0.0, 1.0, 0.0), 0.8));')
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec4 wp = modelMatrix * mvPosition;
        vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float tall = max(0.05, wp.y - root.y);
        float k = clamp(position.y, 0.0, 1.0); k *= k;
        // wind: a steady lean downwind plus gusts rolling across the field
        float w = length(uWind);
        float gust = sin(uTime * (1.4 + w * 2.0) + root.x * 0.35 + root.z * 0.27) * 0.5 + 0.5;
        vec2 bend = uWind * (0.25 + 0.75 * gust) * 0.45 + vec2(sin(uTime * 2.3 + root.z), cos(uTime * 1.9 + root.x)) * 0.03;
        // the ball: blades within 25 cm are pushed out of its way and pressed down
        vec2 d = root.xz - uBall.xz;
        float dist = length(d);
        float near = (1.0 - smoothstep(0.06, 0.28, dist)) * (1.0 - smoothstep(0.1, 0.45, abs(uBall.y - root.y)));
        bend += (dist > 1e-4 ? d / dist : vec2(0.0)) * near * 0.9;
        wp.xz += bend * k * tall;
        wp.y -= (length(bend) * 0.35 + near * 0.45) * k * tall;
        mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => 'fairwayGrass';
  return m;
}
