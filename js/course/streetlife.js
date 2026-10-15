// Street life for the East St. Louis course, kept grounded: abandoned cars
// up on cinder blocks, lowriders (long, low sedans in candy paint with
// chrome and gold wire wheels, one now and then lifting its nose on its
// hydraulics), and people hanging out by them in everyday streetwear, a few
// with gold chains. All of it stands outside the field of play.
import * as THREE from 'three';
import { model } from '../scene/models.js';

const M = {};
function mats() {
  if (M.ready) return M;
  M.ready = true;
  M.glass = new THREE.MeshStandardMaterial({ color: 0x15191d, roughness: 0.15, metalness: 0.6 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.12, metalness: 1 });
  M.gold = new THREE.MeshStandardMaterial({ color: 0xe0b44c, roughness: 0.22, metalness: 1 });
  M.tire = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  M.white = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.6 });
  M.block = new THREE.MeshStandardMaterial({ color: 0x8a8a84, roughness: 1 });
  M.under = new THREE.MeshStandardMaterial({ color: 0x1d1a17, roughness: 1 });
  M.light = new THREE.MeshStandardMaterial({ color: 0xffe9c0, emissive: 0xffd9a0, emissiveIntensity: 0.2 });
  M.tail = new THREE.MeshStandardMaterial({ color: 0x8a0f12, emissive: 0x500000, emissiveIntensity: 0.3 });
  return M;
}

/** Side profile of a 1960s-style full-size sedan, x along the car, y up (metres). */
function sedanShape(L, low) {
  const s = new THREE.Shape();
  const b = low ? 0.16 : 0.32; // underside
  const belt = b + 0.62;
  s.moveTo(-L / 2, b + 0.1);
  s.lineTo(-L / 2 + 0.05, belt);
  s.lineTo(-L * 0.17, belt + 0.03); // trunk deck
  s.lineTo(-L * 0.08, belt + 0.5); // rear window
  s.lineTo(L * 0.12, belt + 0.52); // roof
  s.lineTo(L * 0.2, belt + 0.04); // windscreen
  s.lineTo(L / 2 - 0.08, belt - 0.02); // long hood
  s.lineTo(L / 2, b + 0.12);
  s.lineTo(L / 2 - 0.1, b);
  s.lineTo(-L / 2 + 0.1, b);
  s.closePath();
  return { s, b, belt };
}

function paint(color, candy) {
  return candy
    ? new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06 })
    : new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.75 });
}

function wheel(r, wire, white) {
  const m = mats();
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.2, 18).rotateX(Math.PI / 2), m.tire);
  g.add(tire);
  if (white) {
    const ww = new THREE.Mesh(new THREE.RingGeometry(r * 0.62, r * 0.86, 24), m.white);
    ww.position.z = 0.101;
    g.add(ww);
  }
  const rimM = wire ? m.gold : m.chrome;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.04, 20).rotateX(Math.PI / 2), wire ? m.chrome : rimM);
  hub.position.z = 0.09;
  g.add(hub);
  if (wire) {
    // a hundred-spoke wire wheel and a knock-off spinner
    for (let k = 0; k < 24; k++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.006, r * 1.12, 0.006), rimM);
      sp.rotation.z = (k / 24) * Math.PI;
      sp.position.z = 0.11 + (k % 2) * 0.008;
      g.add(sp);
    }
    const ko = new THREE.Mesh(new THREE.BoxGeometry(r * 0.5, 0.05, 0.03), rimM);
    ko.position.z = 0.13;
    g.add(ko);
  }
  return g;
}

/**
 * A car. kind 'lowrider' | 'blocks' (abandoned, up on cinder blocks).
 * Returns a group sitting on y = 0, nose toward +X, ~5.3 m long.
 */
export function car(kind, rand, color) {
  const imported = importedCar(kind, rand);
  if (imported) return imported;
  const m = mats();
  const low = kind === 'lowrider';
  const L = low ? 5.4 : 5.0, W = low ? 1.98 : 1.9;
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const { s, b, belt } = sedanShape(L, low);
  const geo = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 }).translate(0, 0, -W / 2);
  const col = color ?? (low ? [0x7a0f2a, 0x1b3f8f, 0x0f6b5b, 0x5a1a7a, 0xb0761a][Math.floor(rand() * 5)] : [0x6d6a5c, 0x50463a, 0x7b4a2e, 0x3f4a52][Math.floor(rand() * 4)]);
  const p = paint(col, low);
  body.add(new THREE.Mesh(geo, p));
  // glass band (cabin windows)
  const glass = new THREE.Mesh(new THREE.BoxGeometry(L * 0.27, 0.36, W + 0.06), m.glass);
  glass.position.set(L * 0.02, belt + 0.27, 0);
  body.add(glass);
  // bumpers, lights
  for (const sx of [-1, 1]) {
    const bump = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, W + 0.1), low ? m.chrome : m.under);
    bump.position.set(sx * (L / 2 + 0.04), b + 0.2, 0);
    body.add(bump);
    for (const sz of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.3), sx > 0 ? m.light : m.tail);
      lamp.position.set(sx * (L / 2 + 0.01), b + 0.42, sz * (W / 2 - 0.3));
      body.add(lamp);
    }
  }
  if (low) {
    // chrome side spear
    for (const sz of [-1, 1]) {
      const spear = new THREE.Mesh(new THREE.BoxGeometry(L * 0.8, 0.035, 0.02), m.chrome);
      spear.position.set(0, b + 0.45, sz * (W / 2 + 0.055));
      body.add(spear);
    }
  }
  // wheels: lowriders on gold wire wheels and whitewalls; the wreck up on blocks
  const r = low ? 0.33 : 0.36;
  const axles = [L * 0.31, -L * 0.3];
  const missing = new Set();
  if (!low) for (let i = 0; i < 4; i++) if (rand() < 0.55) missing.add(i);
  let i = 0;
  for (const ax of axles) for (const sz of [-1, 1]) {
    const idx = i++;
    if (low || !missing.has(idx)) {
      const w = wheel(r, low, low);
      w.position.set(ax, r, sz * (W / 2 - 0.06));
      if (sz < 0) w.rotation.y = Math.PI;
      if (!low) w.scale.y = 0.8; // flat
      g.add(w);
    } else {
      // stacked cinder blocks where the wheel was
      for (let k = 0; k < 2; k++) {
        const blk = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.2), m.block);
        blk.position.set(ax + (k ? 0.02 : -0.01), 0.1 + k * 0.2, sz * (W / 2 - 0.25));
        blk.rotation.y = (rand() - 0.5) * 0.3;
        g.add(blk);
      }
    }
  }
  if (!low) {
    body.position.y = missing.size ? 0.12 : -0.05;
    body.rotation.z = (rand() - 0.5) * 0.05;
    body.rotation.x = (rand() - 0.5) * 0.05;
    if (rand() < 0.45) {
      // hood up
      const hood = new THREE.Mesh(new THREE.BoxGeometry(L * 0.3, 0.04, W * 0.95), p);
      hood.position.set(L * 0.36, belt + 0.45, 0);
      hood.rotation.z = 0.9;
      body.add(hood);
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const state = { t: rand() * 20, period: 9 + rand() * 9 };
  g.userData.update = low
    ? (dt) => {
      // hydraulics: now and then the nose lifts and drops, then settles
      state.t += dt;
      const u = state.t % state.period;
      const lift = u < 2.4 ? Math.sin((u / 2.4) * Math.PI) ** 2 : 0;
      body.rotation.z = lift * 0.16;
      body.position.y = lift * 0.32;
    }
    : null;
  return g;
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

/** A person (~1.75 m) in streetwear; `chain` adds a gold chain. Faces +X. */
export function person(rand, { chain = false } = {}) {
  const P = model('people');
  if (P && P.children.length) {
    // real scanned people (textured), standing on the origin, facing +Z: turn to +X
    const fig = P.children[Math.floor(rand() * P.children.length)];
    const g = new THREE.Group();
    fig.position.set(0, 0, 0);
    fig.rotation.set(0, Math.PI / 2, 0);
    fig.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    g.add(fig);
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
  const g = new THREE.Group();
  const skin = [0x5c3a21, 0x6b4226, 0x8d5524, 0xc68642, 0xe0ac69][Math.floor(rand() * 5)];
  const top = [0xf2f2ee, 0x1c1c1e, 0x9a1b1f, 0x1f3b78, 0x2d6a3e, 0xd4a017, 0x777777][Math.floor(rand() * 7)];
  const legs = [0x22324a, 0x1d1d1f, 0x5b5146, 0x3c4e63][Math.floor(rand() * 4)];
  const mk = (c, r = 0.75) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const leg = mk(legs), shirt = mk(top), sk = mk(skin, 0.6), shoe = mk(rand() < 0.6 ? 0xf4f4f0 : 0x111111, 0.5);
  for (const sz of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.68, 3, 8), leg);
    l.position.set(0, 0.45, sz * 0.1);
    g.add(l);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.12), shoe);
    s.position.set(0.05, 0.05, sz * 0.1);
    g.add(s);
  }
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.42, 4, 10), shirt);
  torso.scale.set(0.8, 1, 1.05);
  torso.position.y = 1.12;
  g.add(torso);
  for (const sz of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.52, 3, 8), shirt);
    a.position.set(0, 1.12, sz * 0.27);
    a.rotation.x = sz * 0.08;
    g.add(a);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10), sk);
  head.scale.set(1, 1.15, 0.95);
  head.position.y = 1.62;
  g.add(head);
  if (rand() < 0.5) {
    // a cap, brim forward or back
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mk([0x111111, 0x9a1b1f, 0x1f3b78][Math.floor(rand() * 3)]));
    cap.position.y = 1.66;
    g.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.015, 0.18), cap.material);
    brim.position.set(rand() < 0.5 ? 0.13 : -0.13, 1.66, 0);
    g.add(brim);
  }
  if (chain) {
    const m = mats();
    const c = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.014, 6, 24), m.gold);
    c.rotation.x = Math.PI / 2 - 0.5;
    c.rotation.z = Math.PI / 2;
    c.position.set(0.06, 1.38, 0);
    g.add(c);
    if (rand() < 0.6) {
      const pend = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.06), m.gold);
      pend.position.set(0.16, 1.26, 0);
      g.add(pend);
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
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
      const x = at.x + lx * cs + lz * sn, z = at.z - lx * sn + lz * cs;
      obj.position.set(x, ground(x, z), z);
      obj.rotation.y = at.rot + yaw;
      group.add(obj);
      return obj;
    };
    const wrecks = 1 + (rand() < 0.5 ? 1 : 0);
    for (let k = 0; k < wrecks; k++) place(car('blocks', rand), (rand() - 0.5) * 14, (rand() - 0.5) * 10, rand() * 6.28);
    if (i % 2 === 0) {
      const cx = (rand() - 0.5) * 6, cz = 4 + rand() * 3;
      const lr = place(car('lowrider', rand), cx, cz, 0);
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
