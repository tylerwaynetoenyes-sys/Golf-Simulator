// Ball marks on the greens: the dent a landing ball leaves (pitch mark) and old
// ones a player has repaired with a pitch-mark tool. Decals rendered in Blender
// from a modelled mark (tools/blender/green_details.py): crater, raised lip,
// torn blades, soil; the repair's pucker and tine holes. Colour, alpha and a
// normal map, lit like the green (so they take its sun, shadows and the night),
// tinted from the render's turf to the green's own.
import * as THREE from 'three';

const SIZE = 0.07; // the decal's square, metres
// the undisturbed turf in the renders (sRGB), what each decal is measured against
const REF = new THREE.Color().setRGB(28.2 / 255, 58.5 / 255, 14.2 / 255, THREE.SRGBColorSpace);

let tex = null;
function textures() {
  if (tex) return tex;
  const L = new THREE.TextureLoader();
  const load = (n) => {
    const t = L.load(new URL(`../../assets/textures/pitchmark_${n}.png`, import.meta.url).href);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const nor = (n) => { const x = load(n); x.colorSpace = THREE.NoColorSpace; return x; };
  tex = { fresh: load('fresh'), repaired: load('repaired'), freshN: nor('fresh_nor'), repairedN: nor('repaired_nor') };
  return tex;
}

const geo = new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2);
const mats = {};
/** Lit like the turf round it (sun, shadow, night), its turf tinted to the green it lies on. */
function material(kind, turf) {
  const key = kind + turf.getHexString();
  if (mats[key]) return mats[key];
  const t = textures();
  const nor = t[kind + 'N'];
  // the render's exposure → this green's: one factor (by luminance), so soil and blades keep their own colour
  const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const k = THREE.MathUtils.clamp(0.85 * lum(turf) / lum(REF), 0.3, 20);
  const tint = new THREE.Color(k, k, k);
  mats[key] = new THREE.MeshStandardMaterial({
    map: t[kind], normalMap: nor, normalScale: new THREE.Vector2(1.4, 1.4), color: tint, roughness: 0.92,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  return mats[key];
}

/**
 * @param ground (x, z) => the drawn green's height
 * @param turf   the green's turf colour (linear), to tint the decals to
 * @returns {{group, add(x, z, dx, dz, kind)}}
 */
export function greenMarks(ground, turf = REF) {
  const group = new THREE.Group();
  const up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3(), q = new THREE.Quaternion(), qy = new THREE.Quaternion();
  const add = (x, z, dx = 0, dz = -1, kind = 'fresh') => {
    const m = new THREE.Mesh(geo, material(kind, turf));
    m.receiveShadow = true;
    // lie on the green's slope, the mark's long axis along the way the ball came in
    const e = 0.05;
    n.set(ground(x - e, z) - ground(x + e, z), 2 * e, ground(x, z - e) - ground(x, z + e)).normalize();
    q.setFromUnitVectors(up, n);
    qy.setFromAxisAngle(up, Math.atan2(-dx, -dz));
    m.quaternion.copy(q).multiply(qy);
    m.position.set(x, ground(x, z) + 0.002, z);
    m.renderOrder = 3;
    m.frustumCulled = true;
    group.add(m);
    // keep the green from filling up: the oldest fresh marks go first
    if (group.children.length > 40) group.remove(group.children[0]);
    return m;
  };
  return { group, add };
}
