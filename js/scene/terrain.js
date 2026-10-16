// Bluff-top ground (range plateau + wooded surroundings), limestone bluff face,
// and the low Missouri floodplain across the river.
import * as THREE from 'three';
import { CUP } from '../core/physics.js';
import { cutHoles } from './cup.js';
import { LAYOUT, groundHeight, GREENS, CTP_GREEN } from './layout.js';
import { pbr } from './pbr.js';

function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm2(x, z, oct = 4) {
  let v = 0, a = 0.5;
  for (let i = 0; i < oct; i++) { v += a * vnoise(x, z); x *= 2.03; z *= 2.03; a *= 0.5; }
  return v;
}

/** Height of the wooded bluff-top beyond the range bounds. */
export function surroundHeight(x, z) {
  const base = groundHeight(Math.max(-LAYOUT.boundsX, Math.min(LAYOUT.boundsX, x)), Math.max(z, LAYOUT.plateauEnd));
  const out = Math.max(0, Math.abs(x) - (LAYOUT.boundsX - 10));
  const k = Math.min(1, out / 120);
  const hills = 6 + 16 * fbm2(x * 0.006, z * 0.006) + 5 * fbm2(x * 0.03, z * 0.03);
  return base + k * k * hills;
}

function grassDetailTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const n = fbm2(x * 0.08, y * 0.08, 3) * 0.6 + Math.random() * 0.4;
      const v = 150 + n * 105;
      const i = (y * 256 + x) * 4;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function groundMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0, map: grassDetailTexture() });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFairway = { value: LAYOUT.fairwayHalfWidth };
    shader.uniforms.uBounds = { value: LAYOUT.boundsX };
    shader.uniforms.uGreens = { value: GREENS.map((g) => new THREE.Vector4(g.x, g.z, g.r, 0)) };
    shader.uniforms.uCtp = { value: new THREE.Vector4(CTP_GREEN.x, CTP_GREEN.z, CTP_GREEN.r, CTP_GREEN.active ? 1 : 0) };
    mat.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = (modelMatrix * vec4(position,1.0)).xz * 0.25;\n#endif');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform float uFairway;
uniform float uBounds;
uniform vec4 uGreens[${GREENS.length}];
uniform vec4 uCtp;
float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
`)
      .replace('#include <map_fragment>', `
vec4 texelColor = texture2D(map, vMapUv);
float detail = texelColor.r;
float ax = abs(vWPos.x);
float z = vWPos.z;
vec3 fair1 = vec3(0.16, 0.30, 0.10);
vec3 fair2 = vec3(0.12, 0.25, 0.08);
// Mowing stripes across the range plus a diagonal cross-cut
float stripe = step(0.5, fract(z / 18.0));
float cross = step(0.5, fract((z + vWPos.x * 0.6) / 30.0));
vec3 fair = mix(fair1, fair2, stripe * 0.85 + cross * 0.15);
vec3 rough = vec3(0.11, 0.17, 0.065) * (0.85 + 0.3 * vn(vWPos.xz * 0.05));
vec3 woods = vec3(0.045, 0.06, 0.03);
float fw = (1.0 - smoothstep(uFairway - 1.5, uFairway + 2.5, ax));
float wd = smoothstep(uBounds - 8.0, uBounds + 30.0, ax);
vec3 g = mix(rough, fair, fw);
g = mix(g, woods, wd);
// Behind the tee line: manicured surround
g = mix(g, fair1 * 0.9, smoothstep(-4.0, 6.0, z) * (1.0 - wd));
// Greens + collars
for (int i = 0; i < ${GREENS.length}; i++) {
  float d = length(vWPos.xz - uGreens[i].xy);
  float r = uGreens[i].z;
  g = mix(g, vec3(0.14, 0.33, 0.12), (1.0 - smoothstep(r + 1.2, r + 2.2, d)));
  g = mix(g, vec3(0.19, 0.42, 0.14) * (0.95 + 0.1 * vn(vWPos.xz * 0.9)), (1.0 - smoothstep(r - 0.4, r + 0.3, d)));
}
if (uCtp.w > 0.5) {
  float d = length(vWPos.xz - uCtp.xy);
  float r = uCtp.z;
  g = mix(g, vec3(0.14, 0.33, 0.12), (1.0 - smoothstep(r + 1.4, r + 2.6, d)));
  g = mix(g, vec3(0.2, 0.44, 0.15) * (0.96 + 0.08 * vn(vWPos.xz * 1.1)), (1.0 - smoothstep(r - 0.4, r + 0.3, d)));
}
// patchy wear
g *= 0.9 + 0.2 * vn(vWPos.xz * 0.12);
diffuseColor.rgb *= g * (0.72 + 0.56 * detail);
`);
  };
  return mat;
}

export function createTerrain(scene) {
  const group = new THREE.Group();

  // ── Bluff top: range plateau + wooded surroundings ──
  const xMin = -1600, xMax = 1600, zMin = LAYOUT.plateauEnd, zMax = 420;
  // Non-uniform grid: dense over the range, sparse in the woods.
  const xs = [];
  for (let x = xMin; x <= xMax; ) {
    xs.push(x);
    const ax = Math.abs(x);
    x += ax < 200 ? 2.5 : ax < 450 ? 8 : 30;
  }
  const zs = [];
  for (let z = zMax; z >= zMin; ) {
    zs.push(z);
    z -= z > 40 ? 10 : 2.5;
  }
  if (zs[zs.length - 1] !== zMin) zs.push(zMin);
  const pos = new Float32Array(xs.length * zs.length * 3);
  let k = 0;
  for (const z of zs) {
    for (const x of xs) {
      pos[k++] = x;
      pos[k++] = surroundHeight(x, z);
      pos[k++] = z;
    }
  }
  const idx = [];
  const W = xs.length;
  for (let j = 0; j < zs.length - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const groundMat = groundMaterial();
  // real holes in the turf at every cup
  const holes = cutHoles(groundMat, GREENS.length + 1, 'range');
  GREENS.forEach((g, i) => holes[i].set(g.x, g.z, CUP.radius, 1));
  const ground = new THREE.Mesh(geo, groundMat);
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);

  // ── Limestone bluff face ──
  const faceGeo = new THREE.PlaneGeometry(3200, 70, 320, 16);
  const fp = faceGeo.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i);
    const v = (fp.getY(i) + 35) / 70; // 0 bottom .. 1 top
    const top = surroundHeight(x, LAYOUT.plateauEnd);
    const y = LAYOUT.riverY - 4 + (top - LAYOUT.riverY + 4) * v;
    const ledge = (fbm2(x * 0.05, v * 6) - 0.5) * 7 + Math.sin(v * 9 + x * 0.01) * 1.2;
    const z = LAYOUT.plateauEnd - (1 - Math.pow(v, 0.7)) * (LAYOUT.plateauEnd - LAYOUT.cliffBottom) - ledge * (1 - v * 0.6);
    fp.setXYZ(i, x, y, z);
  }
  faceGeo.computeVertexNormals();
  const faceColors = new Float32Array(fp.count * 3);
  for (let i = 0; i < fp.count; i++) {
    const n = fbm2(fp.getX(i) * 0.02, fp.getY(i) * 0.15);
    const c = 0.42 + 0.3 * n;
    faceColors[i * 3] = c * 0.95; faceColors[i * 3 + 1] = c * 0.9; faceColors[i * 3 + 2] = c * 0.8;
  }
  faceGeo.setAttribute('color', new THREE.BufferAttribute(faceColors, 3));
  const face = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, color: 0x9a9284 }));
  face.receiveShadow = true;
  group.add(face);

  // ── Missouri floodplain across the river ──
  const far = new THREE.Mesh(
    new THREE.PlaneGeometry(120000, 60000, 1, 1).rotateX(-Math.PI / 2),
    pbr('grass_ground', { scale: 6, tint: 0xa8c08a }),
  );
  far.position.set(0, LAYOUT.riverY + 1.2, LAYOUT.riverFar - 30000);
  group.add(far);

  scene.add(group);
  return {
    group,
    setCtpGreen() {
      const sh = groundMat.userData.shader;
      if (sh) sh.uniforms.uCtp.value.set(CTP_GREEN.x, CTP_GREEN.z, CTP_GREEN.r, CTP_GREEN.active ? 1 : 0);
      holes[GREENS.length].set(CTP_GREEN.x, CTP_GREEN.z, CUP.radius, CTP_GREEN.active ? 1 : 0);
    },
    rebuildHeights() {
      // CTP green placement flattens terrain; re-sample the range part.
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        if (Math.abs(x) < LAYOUT.boundsX + 40) p.setY(i, surroundHeight(x, z));
      }
      p.needsUpdate = true;
      geo.computeVertexNormals();
    },
  };
}
