// Scenery that makes a course feel lived in, placed beyond the field of play
// (outside the OOB line) and never in water:
//   western  bison herds, wagon trains, a windmill, a sod house, tumbleweeds
//            rolling downwind
//   coastal  sailboats bobbing out on the sea, sea stacks and rocks along the
//            shoreline
//   crowds   spectators on the mounds round the greens (tournament courses)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { crowdAt } from '../scene/crowd.js';
import { mergeByMaterial } from '../scene/merge.js';
import { pbr } from '../scene/pbr.js';
import { boulderGeometry, seeded } from './lm/kit.js';

// a cruising sloop, ~11 m on deck (Sketchfab "Sailboat" by sergeif, CC BY;
// docs/SOURCES.md): one textured mesh, waterline at y = 0, length along Z
let sloop = null;
function loadSloop() {
  if (sloop) return sloop;
  const l = new GLTFLoader();
  l.setDRACOLoader(new DRACOLoader().setDecoderPath(new URL('../../vendor/three/addons/libs/draco/gltf/', import.meta.url).href));
  sloop = l.loadAsync(new URL('../../assets/models/boats/sailboat_lo.glb', import.meta.url).href).then((g) => {
    let mesh = null;
    g.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    mesh.updateWorldMatrix(true, false);
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geo.computeBoundingSphere();
    // the sails are single sheets: both faces
    const material = new THREE.MeshStandardMaterial({ map: mesh.material.map, roughness: 0.45, side: THREE.DoubleSide });
    return { geo, material };
  }).catch(() => null);
  return sloop;
}

// a tumbleweed: a dry Russian thistle, a ball of thin twigs curling round
// and through each other, ~0.5 m across; one shared tangle
let weedGeo = null;
function tumbleweedGeo() {
  if (weedGeo) return weedGeo;
  const r = seeded(77), parts = [];
  for (let i = 0; i < 36; i++) {
    const pts = [];
    let p = new THREE.Vector3().randomDirection().multiplyScalar(0.2 + r() * 0.3);
    const axis = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    for (let k = 0; k < 6; k++) {
      pts.push(p.clone().normalize().multiplyScalar(0.25 + 0.75 * Math.min(1, p.length() / 0.5 + r() * 0.2)));
      p = p.clone().applyAxisAngle(axis, 0.45 + r() * 0.3);
    }
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.008 + r() * 0.008, 3, false));
  }
  weedGeo = mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); return g; }));
  return weedGeo;
}

/**
 * @returns {{group, update(dt, t, wind)}}
 */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export function dressScenery(T, hole, rand, ground, buildLandmark) {
  const group = new THREE.Group();
  const movers = [];
  const L = T.length;
  // a spot beyond the OOB line (or anywhere when sea is ok), on land or sea as asked
  const spot = (minOff, maxOff, { sea = false, tries = 30 } = {}) => {
    for (let k = 0; k < tries; k++) {
      const s = -40 + rand() * (L + 80);
      const p = T.pointAt(Math.max(0, Math.min(L, s)));
      const side = rand() < 0.5 ? -1 : 1;
      const d = minOff + rand() * (maxOff - minOff);
      const x = p.x + p.rx * d * side, z = p.z + p.rz * d * side;
      const pr = T.project(x, z);
      if (Math.abs(pr.d) < T.oobLateral + 6 && pr.s > -40 && pr.s < L + 60) continue;
      if (T.greenEdge(x, z) < 50) continue;
      const h = T.drawnHeight(x, z);
      const wet = T.seaLevel != null && h < T.seaLevel - 0.5;
      if (sea !== wet) continue;
      if (!sea && T.terrain(x, z).surface === 'water') continue;
      return { x, z, y: sea ? T.seaLevel : ground(x, z) };
    }
    return null;
  };
  const put = (obj, at, yaw = rand() * Math.PI * 2) => {
    obj.position.set(at.x, at.y, at.z);
    obj.rotation.y = yaw;
    group.add(obj);
    return obj;
  };
  const lm = (type, at, yaw) => {
    const o = buildLandmark(type);
    // static set pieces (nothing here animates their parts): one draw per material
    mergeByMaterial(o.group);
    put(o.group, at, yaw);
    return o;
  };
  const glow = [];

  if (hole.theme === 'western') {
    for (let i = 0; i < 4; i++) { const at = spot(T.oobLateral + 20, T.oobLateral + 260); if (at) glow.push(...(lm('bison', at).glow || [])); }
    for (let i = 0; i < 2; i++) { const at = spot(T.oobLateral + 40, T.oobLateral + 300); if (at) glow.push(...(lm('wagons', at).glow || [])); }
    if (rand() < 0.7) { const at = spot(T.oobLateral + 60, T.oobLateral + 220); if (at) glow.push(...(lm('windmill', at).glow || [])); }
    if (rand() < 0.5) { const at = spot(T.oobLateral + 80, T.oobLateral + 260); if (at) glow.push(...(lm('sodhouse', at).glow || [])); }
    // tumbleweeds, rolling downwind and wrapping round
    const weedM = pbr('bark_brown_02', { scale: 0.3, tint: 0xf0d8b0, bright: 1.6 }); // sun-bleached dry stems
    for (let i = 0; i < 10; i++) {
      const at = spot(T.fwHalf + 25, T.oobLateral + 120, { tries: 12 });
      if (!at) continue;
      const r = 0.45 + rand() * 0.25;
      const tw = put(new THREE.Mesh(tumbleweedGeo(), weedM), at);
      tw.scale.setScalar(r);
      tw.castShadow = true;
      movers.push({ kind: 'weed', o: tw, home: { x: at.x, z: at.z }, phase: rand() * 100, r });
    }
  }

  if (T.seaLevel != null && (hole.theme === 'coastal' || hole.theme === 'harbor')) {
    // sailboats well offshore, bobbing
    const boats = [];
    for (let i = 0; i < 9; i++) {
      const at = spot(T.oobLateral + 120, T.oobLateral + 1400, { sea: true, tries: 40 });
      if (at) boats.push({ ...at, yaw: rand() * Math.PI * 2, k: 0.8 + rand() * 0.45, phase: rand() * 10 });
    }
    if (boats.length) {
      const holder = new THREE.Group();
      group.add(holder);
      loadSloop().then((m) => {
        if (!m) return;
        const inst = new THREE.InstancedMesh(m.geo, m.material, boats.length);
        inst.castShadow = false; inst.receiveShadow = true;
        inst.frustumCulled = false; // they bob every frame; nine boats
        holder.add(inst);
        movers.push({ kind: 'fleet', inst, boats });
      });
    }
    // sea stacks and boulders along the shore
    // weathered stone (a photographed rock face on noise-shaped boulders), a
    // few shapes instanced
    const rock = pbr('rock_face_03', { scale: 2.5, tint: hole.theme === 'coastal' ? 0xd8ccc0 : 0xc4c4c8 });
    const rr = seeded(hole.n * 13 + 5), shapes = [0, 1, 2].map(() => boulderGeometry(1, rr, { detail: 3, flat: 1 }));
    const stacks = shapes.map(() => []);
    let n = 0;
    for (let k = 0; k < 600 && n < 26; k++) {
      const s = rand() * L, p = T.pointAt(s), side = rand() < 0.5 ? -1 : 1;
      const d = T.oobLateral * 0.5 + rand() * (T.oobLateral + 250);
      const x = p.x + p.rx * d * side, z = p.z + p.rz * d * side;
      const pr = T.project(x, z);
      if (Math.abs(pr.d) < T.fwHalf + 30 && pr.s > -20 && pr.s < L + 30) continue;
      const h = T.drawnHeight(x, z);
      if (h > T.seaLevel + 0.6 || h < T.seaLevel - 3) continue; // the surf line
      const r = 1.5 + rand() * (rand() < 0.2 ? 6 : 2.5);
      const sy = r * (0.6 + rand() * (r > 4 ? 1.6 : 0.6));
      stacks[n % 3].push(new THREE.Matrix4().compose(new THREE.Vector3(x, T.seaLevel - 0.6 + sy * 0.25, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 0.4, rand() * 6, (rand() - 0.5) * 0.4)), new THREE.Vector3(r, sy, r * (0.8 + rand() * 0.4))));
      n++;
    }
    stacks.forEach((list, k) => {
      if (!list.length) return;
      const inst = new THREE.InstancedMesh(shapes[k], rock, list.length);
      list.forEach((m, i) => inst.setMatrixAt(i, m));
      inst.castShadow = inst.receiveShadow = true;
      inst.computeBoundingSphere();
      group.add(inst);
    });
  }

  if (hole.crowds) {
    // spectators round the back and sides of the green, on the mounds
    const G = T.green;
    const n = 60 + Math.floor(rand() * 40), spots = [];
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(T.finalDir.z, T.finalDir.x) + (rand() - 0.5) * Math.PI * 1.5;
      const r = T.greenR + 18 + rand() * 14;
      const x = G.x + Math.cos(a) * r, z = G.z + Math.sin(a) * r;
      if (T.terrain(x, z).surface === 'water') continue;
      // scanned people (instanced), each turned to face the green
      spots.push([x, ground(x, z), z, Math.atan2(G.x - x, G.z - z)]);
    }
    const crowd = crowdAt(spots, rand);
    if (crowd) group.add(crowd);
  }

  return {
    group, glow,
    update(dt, t, wind = { x: 0.6, z: 0 }) {
      for (const m of movers) {
        if (m.kind === 'fleet') {
          m.boats.forEach((b, i) => {
            _e.set(Math.sin(t * 0.55 + b.phase * 1.3) * 0.04, b.yaw, Math.sin(t * 0.7 + b.phase) * 0.05 + 0.08); // heeling a little under sail
            m.inst.setMatrixAt(i, _m.compose(_v.set(b.x, b.y + Math.sin(t * 0.9 + b.phase) * 0.18, b.z), _q.setFromEuler(_e), _s.setScalar(b.k)));
          });
          m.inst.instanceMatrix.needsUpdate = true;
        } else if (m.kind === 'weed') {
          // roll downwind for ~60 m, then start again from home
          const sp = 1.2 + Math.hypot(wind.x, wind.z) * 0.9;
          const run = ((t + m.phase) * sp) % 60;
          const wl = Math.hypot(wind.x, wind.z) || 1;
          const x = m.home.x + (wind.x / wl) * run, z = m.home.z + (wind.z / wl) * run;
          m.o.position.set(x, ground(x, z) + m.r + Math.abs(Math.sin(t * 3 + m.phase)) * 0.25, z);
          m.o.rotation.x += dt * sp / m.r;
          m.o.rotation.z += dt * sp * 0.3 / m.r;
        }
      }
    },
  };
}
