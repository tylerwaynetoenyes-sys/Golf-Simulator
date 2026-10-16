// Street life for the East St. Louis course, kept grounded: abandoned cars
// up on cinder blocks, lowriders (long, low sedans in candy paint with
// chrome and gold wire wheels, one now and then lifting its nose on its
// hydraulics), and people hanging out by them in everyday streetwear, a few
// with gold chains. All of it stands outside the field of play.
import * as THREE from 'three';
import { mergeByMaterial } from '../scene/merge.js';
import { model } from '../scene/models.js';
import { pbr, painted } from '../scene/pbr.js';

const M = {};
function mats() {
  if (M.ready) return M;
  M.ready = true;
  M.gold = painted(0xe0b44c, { roughness: 0.22, metalness: 1 });
  M.block = pbr('concrete_wall_008', { scale: 0.6, tint: 0xc8d0e0, bright: 1.2 }); // cast concrete blocks
  return M;
}

/**
 * A car: kind 'lowrider' (the Impala on its hydraulics) or 'blocks' (the
 * abandoned sedan up on cinder blocks). A group sitting on y = 0, nose toward
 * +X, or null when the models aren't loaded (then the lot stays empty).
 */
export function car(kind, rand) {
  return importedCar(kind, rand);
}

/**
 * The imported cars (Sketchfab, CC BY): the 1964 Impala lowrider (mrkuza)
 * and the abandoned sedan (rashad-brahimli), which goes up on cinder blocks.
 * Normalised to sit on y = 0, centred, nose along +X. Null if not loaded.
 */
function importedCar(kind, rand) {
  const low = kind === 'lowrider';
  const M = model(low ? 'lowrider' : 'wreck');
  if (!M) return null;
  const m = mats();
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  let bb = new THREE.Box3().setFromObject(M);
  const size = bb.getSize(new THREE.Vector3());
  if (size.z > size.x) M.rotation.y = Math.PI / 2; // length along X
  bb = new THREE.Box3().setFromObject(M);
  const c = bb.getCenter(new THREE.Vector3());
  M.position.set(-c.x, -bb.min.y, -c.z);
  body.add(M);
  const L = Math.max(size.x, size.z);
  if (!low) {
    // up on cinder blocks where the wheels were
    body.position.y = 0.36;
    body.rotation.z = (rand() - 0.5) * 0.06;
    for (const ax of [L * 0.3, -L * 0.3]) for (const sz of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const blk = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.2), m.block);
        blk.position.set(ax + (k ? 0.03 : -0.02), 0.1 + k * 0.2, sz * 0.72);
        blk.rotation.y = (rand() - 0.5) * 0.3;
        blk.castShadow = true;
        g.add(blk);
      }
    }
    g.userData.update = null;
    return g;
  }
  mergeByMaterial(body); // it moves as one, on the pivot below
  // hydraulics: the nose lifts about the rear axle now and then
  const pivot = new THREE.Group();
  pivot.position.x = -L * 0.3;
  g.remove(body);
  pivot.add(body);
  body.position.x = L * 0.3;
  g.add(pivot);
  const state = { t: rand() * 20, period: 9 + rand() * 9 };
  g.userData.update = (dt) => {
    state.t += dt;
    const u = state.t % state.period;
    const lift = u < 2.4 ? Math.sin((u / 2.4) * Math.PI) ** 2 : 0;
    pivot.rotation.z = lift * 0.14;
  };
  return g;
}

/** A scanned person (~1.75 m); `chain` adds a gold chain. Faces +X; null if the scans aren't loaded. */
export function person(rand, { chain = false } = {}) {
  const P = model('people');
  if (P && P.children.length) {
    // real scanned people (textured), standing on the origin, facing +Z: turn to +X
    const fig = P.children[Math.floor(rand() * P.children.length)];
    const g = new THREE.Group();
    // each scan keeps its own transform (glTF's Z-up turn and scale); a
    // wrapper turns it from facing +Z to facing +X
    const turn = new THREE.Group();
    turn.rotation.y = Math.PI / 2;
    g.add(turn);
    fig.position.set(0, 0, 0);
    fig.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    // the scan is ~15k triangles: past 45 m the same figure at ~1.5k
    const lo = model('peopleLo')?.getObjectByName(fig.name);
    if (lo) {
      lo.position.set(0, 0, 0);
      lo.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      const lod = new THREE.LOD();
      lod.addLevel(fig, 0);
      lod.addLevel(lo, 45);
      turn.add(lod);
    } else turn.add(fig);
    if (chain) {
      const m = mats();
      const c = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.011, 6, 24), m.gold);
      c.rotation.x = Math.PI / 2 - 0.55;
      c.rotation.z = Math.PI / 2;
      c.position.set(0.08, 1.42, 0);
      g.add(c);
    }
    return g;
  }
  return null; // no scans loaded: nobody stands there
}

/**
 * Dress lots: each spot {x, z, y, rot} gets an abandoned car or two; a few get
 * a lowrider with people round it. Returns {group, update(dt)}.
 */
export function dressLots(spots, rand, ground) {
  const group = new THREE.Group();
  const animated = [];
  spots.forEach((at, i) => {
    const cs = Math.cos(at.rot), sn = Math.sin(at.rot);
    const place = (obj, lx, lz, yaw) => {
      if (!obj) return null;
      const x = at.x + lx * cs + lz * sn, z = at.z - lx * sn + lz * cs;
      obj.position.set(x, ground(x, z), z);
      obj.rotation.y = at.rot + yaw;
      group.add(obj);
      return obj;
    };
    const wrecks = 1 + (rand() < 0.5 ? 1 : 0);
    // a wreck never moves: car and cinder blocks draw one call per material
    for (let k = 0; k < wrecks; k++) { const w = car('blocks', rand); if (w) place(mergeByMaterial(w), (rand() - 0.5) * 14, (rand() - 0.5) * 10, rand() * 6.28); }
    if (i % 2 === 0) {
      const cx = (rand() - 0.5) * 6, cz = 4 + rand() * 3;
      const lr = place(car('lowrider', rand), cx, cz, 0);
      if (!lr) return;
      animated.push(lr);
      // people hanging out beside it (clear of the car), facing in toward each other
      const n = 2 + Math.floor(rand() * 3);
      const gx = cx + 0.5, gz = cz + 3.4;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rand() * 0.6;
        const px = gx + Math.cos(a) * 1.3, pz = gz + Math.sin(a) * 1.1;
        // face the middle of the group: the figure looks down its local +X
        place(person(rand, { chain: rand() < 0.6 }), px, pz, Math.PI - a);
      }
    }
  });
  return { group, update: (dt) => { for (const a of animated) a.userData.update?.(dt); } };
}
