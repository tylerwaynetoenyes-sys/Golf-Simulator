// Surf on a rocky coast (Pebble Beach, Carmel Bay): white water where the
// sea meets the land, washing up and back, and a breaker line a little way
// out that rolls in and spends itself on the rocks. The shoreline is traced
// from the ground itself (marching squares on height = sea level), so the
// foam follows the real coast round every point and cove.
import * as THREE from 'three';

/**
 * @param T       HoleTerrain with a seaLevel
 * @param o       {cx, cz, half, step}: the square to trace (hole-local metres)
 * @returns {{group, update(t)}|null}
 */
export function buildSurf(T, { cx = 0, cz = 0, half = 420, step = 3 } = {}) {
  const L = T.seaLevel;
  if (L == null) return null;
  const n = Math.ceil((half * 2) / step) + 1;
  const x0 = cx - half, z0 = cz - half;
  const h = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = T.meshHeight(x0 + i * step, z0 + j * step) - L;
  // marching squares: one segment per crossing cell, with the seaward normal
  const segs = [];
  const P = (i, j) => [x0 + i * step, z0 + j * step];
  const cross = (a, b, ha, hb) => { const t = ha / (ha - hb); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
    const hv = c.map(([a, b]) => h[b * n + a]);
    const pts = [];
    for (let k = 0; k < 4; k++) {
      const ha = hv[k], hb = hv[(k + 1) % 4];
      if ((ha > 0) !== (hb > 0)) pts.push(cross(P(...c[k]), P(...c[(k + 1) % 4]), ha, hb));
    }
    if (pts.length < 2) continue;
    // seaward: down the slope of the ground
    const gx = (hv[1] + hv[2] - hv[0] - hv[3]) / 2, gz = (hv[2] + hv[3] - hv[0] - hv[1]) / 2;
    const gl = Math.hypot(gx, gz) || 1;
    segs.push([pts[0], pts[1], -gx / gl, -gz / gl]);
    if (pts.length === 4) segs.push([pts[2], pts[3], -gx / gl, -gz / gl]);
  }
  if (!segs.length) return null;
  // two ribbons per segment: the wash at the rocks, and the breaker line out to sea
  const pos = [], uv = [], kind = [];
  const quad = (a, b, nx, nz, d0, d1, k) => {
    const y = L + 0.05;
    const v = [
      [a[0] + nx * d0, a[1] + nz * d0, 0], [b[0] + nx * d0, b[1] + nz * d0, 0],
      [b[0] + nx * d1, b[1] + nz * d1, 1], [a[0] + nx * d1, a[1] + nz * d1, 1],
    ];
    for (const q of [0, 1, 2, 0, 2, 3]) { pos.push(v[q][0], y, v[q][1]); uv.push(v[q][2]); kind.push(k); }
  };
  for (const [a, b, nx, nz] of segs) {
    quad(a, b, nx, nz, -1.2, 5, 0);   // the wash, from just up the rocks out to 5 m
    quad(a, b, nx, nz, 5, 26, 1);     // the breakers roll in across this band
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('across', new THREE.Float32BufferAttribute(uv, 1));
  geo.setAttribute('band', new THREE.Float32BufferAttribute(kind, 1));
  const uTime = { value: 0 };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime, uColor: { value: new THREE.Color(0xf4f7f6) } },
    vertexShader: `
      attribute float across; attribute float band;
      varying float vA; varying float vB; varying vec3 vW;
      void main() { vA = across; vB = band; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor;
      varying float vA; varying float vB; varying vec3 vW;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.3) * 0.3 + noise(p * 5.1) * 0.15; }
      void main() {
        // each stretch of coast on its own swell, from where it is
        float ph = fbm(vW.xz * 0.004) * 6.28;
        float a = 0.0;
        if (vB < 0.5) {
          // the wash: the white water reaches up the rocks and draws back every ~8 s
          float reach = 0.55 + 0.45 * sin(uTime * 0.78 + ph);
          float edge = smoothstep(reach, reach - 0.35, vA);
          float lace = smoothstep(0.35, 0.75, fbm(vW.xz * 0.45 + vec2(uTime * 0.12, -uTime * 0.09)));
          a = edge * mix(0.35, 1.0, lace) * smoothstep(0.0, 0.08, vA + 0.2);
        } else {
          // a breaker: a crest that rolls in across the band and breaks as it nears the rocks
          float cyc = fract(uTime / 8.0 + ph / 6.28);
          float crest = 1.0 - cyc;
          float d = abs(vA - crest);
          float body = smoothstep(0.09, 0.0, d) + smoothstep(0.35, 0.0, vA - crest) * step(crest, vA) * 0.45;
          float lace = smoothstep(0.3, 0.8, fbm(vW.xz * 0.3 + vec2(0.0, uTime * 0.2)));
          a = body * lace * smoothstep(1.0, 0.75, crest) * 0.85;
        }
        if (a < 0.02) discard;
        gl_FragColor = vec4(uColor, a * 0.9);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, update: (t) => { uTime.value = t; } };
}
