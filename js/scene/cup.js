// The hole: a real opening in the turf (ground shaders discard fragments
// inside the cup's circle), a cup liner you can see into (white-painted top
// inch, dark below), and an optional glow ring that marks the cup on the
// green from couch distance.
import * as THREE from 'three';
import { CUP } from '../core/physics.js';
import { loadEquipment } from './models.js';

/**
 * Patch a ground material so it shows holes: `circles` is a uniform array of
 * vec4(x, z, radius, on). Chains any existing onBeforeCompile.
 */
export function cutHoles(material, count = 1, tag = '') {
  const circles = [];
  for (let i = 0; i < count; i++) circles.push(new THREE.Vector4(0, 0, 0, 0));
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    prev?.call(material, shader, r);
    shader.uniforms.uHoles = { value: circles };
    if (!/varying vec3 vWPos;/.test(shader.vertexShader)) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    }
    const decl = /varying vec3 vWPos;/.test(shader.fragmentShader) ? '' : 'varying vec3 vWPos;\n';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${decl}uniform vec4 uHoles[${count}];`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
for (int i = 0; i < ${count}; i++) {
  if (uHoles[i].w > 0.5 && length(vWPos.xz - uHoles[i].xy) < uHoles[i].z) discard;
}`);
  };
  const prevKey = material.customProgramCacheKey?.() || '';
  material.customProgramCacheKey = () => `${prevKey}|holes${count}${tag}`;
  material.userData.holes = circles;
  material.needsUpdate = true;
  return circles;
}

let linerTex = null;
function linerTexture() {
  if (linerTex) return linerTex;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const g = c.getContext('2d');
  // v = 1 at the rim (top) … 0 at the bottom; top ~25 mm painted white
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#cdc9bd');
  grd.addColorStop(0.22, '#bfbbae');
  grd.addColorStop(0.27, '#2a2a26');
  grd.addColorStop(1, '#0c0c0b');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 128);
  linerTex = new THREE.CanvasTexture(c);
  linerTex.colorSpace = THREE.SRGBColorSpace;
  return linerTex;
}

/** Cup liner + bottom; the group's origin sits on the rim. */
export function buildCup() {
  const g = new THREE.Group();
  const liner = new THREE.Mesh(
    new THREE.CylinderGeometry(CUP.radius, CUP.radius, CUP.depth, 48, 1, true).translate(0, -CUP.depth / 2, 0),
    new THREE.MeshStandardMaterial({ map: linerTexture(), side: THREE.BackSide, roughness: 0.75 }),
  );
  liner.receiveShadow = true;
  g.add(liner);
  const bottom = new THREE.Mesh(
    new THREE.CircleGeometry(CUP.radius, 48).rotateX(-Math.PI / 2).translate(0, -CUP.depth + 0.001, 0),
    new THREE.MeshStandardMaterial({ color: 0x141412, roughness: 0.9 }),
  );
  g.add(bottom);
  // a sliver of dark soil just under the turf edge
  const soil = new THREE.Mesh(
    new THREE.CylinderGeometry(CUP.radius + 0.0005, CUP.radius + 0.0005, 0.012, 48, 1, true).translate(0, -0.006, 0),
    new THREE.MeshStandardMaterial({ color: 0x3a2c1c, side: THREE.BackSide, roughness: 1 }),
  );
  g.add(soil);
  // the modelled hole (tools/blender/cup.py): the cut soil wall with its paint, the liner with its
  // socket, ribs and drain holes, the gravel under them, grass leaning over the edge. The simple
  // cup above stands in until it loads.
  loadEquipment('cup.glb').then((scn) => {
    if (!scn) return;
    g.clear();
    for (const name of ['soil', 'liner', 'gravel', 'fringe']) {
      const src = scn.getObjectByName(name);
      if (!src) continue;
      const m = src.clone();
      m.castShadow = name === 'fringe';
      m.receiveShadow = true;
      if (name === 'soil') m.material.side = THREE.DoubleSide;
      if (name === 'fringe') {
        // millimetre blades lit like the turf they grow from (normals up); their colours were authored as
        // sRGB bytes and arrive linearised (~7x darker), hence the lift
        // (each blade drawn both ways round with front faces, so its back isn't lit as facing down)
        const geo = src.geometry.clone();
        const n = geo.attributes.normal;
        for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
        const ix = Array.from(geo.index.array);
        for (let i = 0, L = ix.length; i < L; i += 3) ix.push(ix[i], ix[i + 2], ix[i + 1]);
        geo.setIndex(ix);
        m.geometry = geo;
        m.material = new THREE.MeshStandardMaterial({ vertexColors: true, color: new THREE.Color(6.5, 6.0, 5.2), roughness: 0.8 });
        m.castShadow = false;
        m.receiveShadow = false; // millimetre blades on the turf plane only catch shadow acne
      }
      g.add(m);
    }
  });
  return g;
}

/** The chrome ferrule at the foot of a flagstick (origin at its tip), or null until the model loads. */
export function ferrule(onReady) {
  loadEquipment('cup.glb').then((scn) => {
    const src = scn?.getObjectByName('ferrule');
    if (!src) return;
    const f = src.clone();
    f.material = new THREE.MeshStandardMaterial({ color: 0xd8d8d4, metalness: 0.7, roughness: 0.3 }); // brushed chrome
    onReady(f);
  });
}

/** Glowing ring around the cup, pulsed while putting. */
export function cupRing() {
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.0, 0.82, 0.42), transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(CUP.radius + 0.012, CUP.radius + 0.04, 64).rotateX(-Math.PI / 2), mat);
  ring.renderOrder = 4;
  ring.userData.target = 0;
  ring.userData.update = (dt, t) => {
    const want = ring.userData.target;
    const cur = ring.userData.level || 0;
    const lv = cur + (want - cur) * (1 - Math.exp(-4 * dt));
    ring.userData.level = lv;
    mat.opacity = lv * (0.45 + 0.15 * Math.sin(t * 3));
    ring.visible = lv > 0.01;
  };
  return ring;
}

/** Height of a mesh's surface at (x, z) by casting down onto it. */
const _ray = new THREE.Raycaster();
export function surfaceY(mesh, x, z, fallback) {
  _ray.set(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0));
  _ray.far = 2000;
  const hit = _ray.intersectObject(mesh, false)[0];
  return hit ? hit.point.y : fallback;
}
