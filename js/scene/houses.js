// Real houses for the towns round the courses: five Sketchfab models (CC BY,
// credited in docs/SOURCES.md) of the kinds that fill Alton and the older
// river towns, reduced in Blender to ~1.6k triangles each with one baked
// texture atlas (assets/models/houses/). Drawn instanced: one draw call per
// house type, each house scaled to its mapped footprint and turned to face
// its street. The frame houses' siding takes each house's own paint colour.
//
// In three.js axes each model stands on y = 0 with its front facing +Z.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/** w × d footprint (x × z, metres), front yaw offset, how far to sink it (a tall stone foundation), and whether its siding is painted. */
export const HOUSE_TYPES = {
  frame_gable: { w: 6.8, d: 12, yaw: 0, sink: 2.0, paint: true }, // gable-front frame house, full porch
  foursquare: { w: 13, d: 9.5, yaw: 0, sink: 0.4, paint: true }, // American Foursquare
  brick_cottage: { w: 8.1, d: 13, yaw: Math.PI, sink: 0.1, paint: false }, // brick cottage, porch, shutters
  brick_narrow: { w: 8, d: 14, yaw: 0, sink: 0.1, paint: false }, // narrow two-storey brick, stepped gable
  brick_shop: { w: 16, d: 4.8, yaw: 0, sink: 0.1, paint: false }, // two-storey brick block with a shopfront
};

// house paint: whites, creams, greys, soft blues, sage, butter yellow, the odd barn red
const PAINT = [0xffffff, 0xf6f1e4, 0xece6d4, 0xd8dcdc, 0xc8d4dc, 0xbcc8b4, 0xf0e2b0, 0xe4d8c8, 0xb4bcc4, 0xc89a88];

let types = null;
let pending = null;
/** Load the five house types (browser only); resolves when ready (or with null if they can't load). */
export function loadHouses() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (pending) return pending;
  const draco = new DRACOLoader().setDecoderPath(new URL('../../vendor/three/addons/libs/draco/gltf/', import.meta.url).href);
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const base = new URL('../../assets/models/houses/', import.meta.url).href;
  pending = Promise.all(Object.keys(HOUSE_TYPES).map((k) => loader.loadAsync(`${base}${k}.glb`).then((g) => {
    let mesh = null;
    g.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh) return null;
    mesh.updateWorldMatrix(true, false);
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const mat = mesh.material;
    mat.roughness = 0.85; mat.metalness = 0;
    if (HOUSE_TYPES[k].paint) paintable(mat);
    return [k, { geo, mat }];
  }).catch((e) => { console.warn(`house ${k} unavailable`, e); return null; })))
    .then((list) => { types = Object.fromEntries(list.filter(Boolean)); return Object.keys(types).length ? types : null; });
  return pending;
}
export const housesLoaded = () => !!types && Object.keys(types).length > 0;

/** The instance colour repaints only the siding: the atlas's pale, unsaturated texels. */
function paintable(m) {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `
      #if defined( USE_INSTANCING_COLOR ) || defined( USE_COLOR )
        float lo = min(min(diffuseColor.r, diffuseColor.g), diffuseColor.b), hi = max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b);
        float siding = smoothstep(0.42, 0.7, lo) * (1.0 - smoothstep(0.08, 0.2, hi - lo));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vColor.rgb, siding);
      #endif`);
  };
  m.customProgramCacheKey = () => 'housePaint';
}

/**
 * Instanced houses at `spots`: {type, x, y, z, yaw, w, d, h?} with w × d the
 * footprint to fill (x × z before the turn) and y the ground at its lowest.
 * Returns a group (one InstancedMesh per type), or null if none are loaded.
 */
export function housesAt(spots, rnd = Math.random) {
  if (!types) return null;
  const by = new Map();
  for (const s of spots) if (types[s.type]) { if (!by.has(s.type)) by.set(s.type, []); by.get(s.type).push(s); }
  const g = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
  for (const [k, list] of by) {
    const T = HOUSE_TYPES[k], { geo, mat } = types[k];
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((s, i) => {
      const sx = THREE.MathUtils.clamp(s.w / T.w, 0.8, 1.25), sz = THREE.MathUtils.clamp(s.d / T.d, 0.8, 1.25), sy = (sx + sz) / 2;
      im.setMatrixAt(i, m4.compose(v.set(s.x, s.y - T.sink * sy, s.z), q.setFromEuler(e.set(0, s.yaw + T.yaw, 0)), sc.set(sx, sy, sz)));
      im.setColorAt(i, c.set(T.paint ? PAINT[Math.floor(rnd() * PAINT.length)] : 0xffffff));
    });
    im.castShadow = false; im.receiveShadow = true;
    im.computeBoundingSphere();
    g.add(im);
  }
  return g;
}
