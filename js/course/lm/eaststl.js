// East St. Louis riverfront landmarks, from published figures:
//   Gateway Geyser (1995), Malcolm W. Martin Memorial Park: a central jet
//     designed to reach 630 ft (192 m), matching the Arch across the river,
//     ringed by four smaller fountains for the four rivers that meet near St.
//     Louis. Shut off since 2023; here it fires for a hole-out.
//   Eads Bridge (1874): three steel arches, 502–520–502 ft (153–158–153 m),
//     on four masonry piers; road deck above, rail below
//   Concrete grain elevators: bins ~8 m across and ~35 m tall with a taller
//     headhouse and a conveyor gallery along the top
//   Downtown St. Louis: the Old Courthouse dome (59 m), One Metropolitan
//     Square (181 m, the tallest), towers of 100–180 m
// Far landmarks are modelled in map axes (+x east, +z south).
import * as THREE from 'three';
import { lit, box, seeded, canvasTex, facadeMaterial, FT, landmarkWater } from './kit.js';
import { pbr, painted } from '../../scene/pbr.js';
import { place, bx, cy, rod, span, Batch, tow } from './riverfront.js';
import { courthouse } from './gatewayarch.js';
import { crowdAt } from '../../scene/crowd.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const built = (B) => { const g = new THREE.Group(); B.build(g); return g; };
import { bus } from '../../core/events.js';

// one listener for the whole session: it fires whichever geyser is on screen
let fireActive = null;
bus.on('course:holeout', () => fireActive?.());

function geyser() {
  const conc = pbr('concrete_wall_008', { scale: 3, tint: 0xd8e0f4, bright: 1.3, glow: 0xffe3b8, night: 0.35 });
  const granite = pbr('granite_wall', { scale: 1.5, tint: 0xbab3a8 });
  const B = new Batch();
  // the basin: a granite coping on a concrete wall, its floor, the plaza ring round it
  B.add(conc, place(new THREE.CylinderGeometry(26, 26.4, 1.2, 64, 1, true).translate(0, 0.6, 0)));
  B.add(granite, place(new THREE.TorusGeometry(25.6, 0.5, 6, 64).rotateX(Math.PI / 2).scale(1, 0.6, 1), 0, 1.2, 0));
  B.add(conc, place(new THREE.CircleGeometry(26, 48).rotateX(-Math.PI / 2), 0, 0.1, 0));
  B.add(pbr('brushed_concrete', { scale: 3, tint: 0xd8d2c6 }), place(new THREE.RingGeometry(26.4, 34, 64).rotateX(-Math.PI / 2), 0, 0.04, 0));
  // the four river fountains on their own granite drums, the central nozzle
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    B.add(granite, cy(2.2, 2.4, 1.4, Math.cos(a) * 15, 0, Math.sin(a) * 15, 24));
  }
  B.add(granite, cy(1.6, 2.4, 1.3, 0, 0, 0, 24));
  const g = built(B);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(25.6, 64).rotateX(-Math.PI / 2), landmarkWater());
  pool.position.y = 1.0;
  pool.castShadow = false;
  g.add(pool);
  // the central jet: a column of white water and a mist cap, off until a hole-out
  const jetTex = canvasTex(64, 256, (c, w, h) => {
    for (let y = 0; y < h; y++) { c.fillStyle = `rgba(255,255,255,${0.4 + 0.5 * Math.random()})`; c.fillRect(Math.random() * w, y, 2 + Math.random() * 8, 1); }
  });
  jetTex.wrapT = THREE.RepeatWrapping;
  jetTex.repeat.set(1, 6);
  const jetMat = new THREE.MeshBasicMaterial({ map: jetTex, transparent: true, opacity: 0.9, depthWrite: false, color: 0xf2f8ff });
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 3.2, 1, 16, 1, true).translate(0, 0.5, 0), jetMat);
  jet.visible = false;
  g.add(jet);
  const mist = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  g.add(mist);
  let fire = -1;
  fireActive = () => { fire = 0; };
  const MAX = 630 * FT;
  return {
    group: g,
    glow: [conc],
    update(t, dt) {
      jetTex.offset.y = (t * 2.4) % 1;
      if (fire < 0) { jet.visible = false; mist.material.opacity = 0; return; }
      fire += dt;
      // rise in ~6 s, hold, fall away over ~5 s (a full run is ~10 minutes in life)
      const up = Math.min(1, fire / 6), down = fire > 16 ? Math.max(0, 1 - (fire - 16) / 5) : 1;
      const hgt = MAX * up * (2 - up) * down;
      jet.visible = hgt > 1;
      jet.scale.set(1, hgt, 1);
      mist.position.y = hgt;
      mist.scale.setScalar(6 + hgt * 0.08);
      mist.material.opacity = 0.35 * down * up;
      if (fire > 21) fire = -1;
    },
  };
}

/** Concrete grain elevator: rows of slip-formed bins, the gallery along their tops, the headhouse and its conveyor. */
function elevators() {
  const silo = pbr('concrete_wall_008', { scale: 5, tint: 0xd2dcf6, bright: 1.45, glow: 0xffd9a0, night: 0.2 });
  const roofM = pbr('brushed_concrete', { scale: 4, tint: 0xa8a49c });
  const steel = pbr('metal_plate', { scale: 2, tint: 0x8c9196, metal: 0.4 });
  const clad = pbr('corrugated_iron', { scale: 1.6, tint: 0xc9c4ba, metal: 0.3 });
  const rust = pbr('rusty_metal_02', { scale: 2, metal: 0.4 });
  const hw = lit(0x39424a, 0xffcf8a, { night: 0.7 });
  const B = new Batch();
  // three rows of six bins, 8 m across and 35 m tall, the interstice walls between them
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) {
    const x = i * 8.2 - 20.5, z = r * 8.2 - 8.2;
    B.add(silo, place(new THREE.CylinderGeometry(4, 4, 35, 20, 1, true).translate(0, 17.5, 0), x, 0, z));
    B.add(roofM, cy(4, 4, 0.4, x, 35, z, 20));
    if (r < 2 && i < 5) B.add(silo, bx(2.4, 35, 2.4, x + 4.1, 0, z + 4.1, Math.PI / 4));
  }
  // the bin floor's spouts at the foot, a loading shed with rails along it
  B.add(silo, bx(52, 3, 26, 0, 0, 0));
  B.add(clad, bx(52, 5, 8, 0, 0, 16), bx(53, 0.4, 9, 0, 5, 16));
  // the gallery: a clad conveyor house along the bin tops, its windows
  B.add(clad, bx(52, 4, 6, 0, 35.4, 0));
  B.add(roofM, bx(52.4, 0.4, 6.4, 0, 39.4, 0));
  for (let x = -24; x <= 24; x += 4) for (const z of [-3.03, 3.03]) B.add(hw, place(new THREE.PlaneGeometry(1.6, 1), x, 37.6, z, z > 0 ? 0 : Math.PI));
  // the headhouse: the tall concrete leg house with its windows and the clad top
  B.add(silo, bx(14, 52, 16, -32, 0, 0));
  B.add(clad, bx(12, 6, 13, -32, 52, 0), bx(12.6, 0.4, 13.6, -32, 58, 0));
  for (let y = 6; y < 50; y += 6) for (const z of [-4, 4]) B.add(hw, bx(0.2, 1.8, 2.4, -24.95, y, z));
  B.add(rust, bx(3, 3, 3, -32, 58.4, 0));
  // the conveyor gallery out to the river on a steel trestle
  B.add(clad, span(V(-32, 44, 8), V(-32, 30, 56), 4, 4));
  for (const z of [24, 40, 54]) {
    const y = 44 - ((z - 8) / 48) * 14 - 4;
    for (const s of [-1.6, 1.6]) B.add(steel, rod(V(-32 + s, 0, z), V(-32 + s, y, z), 0.3, 6));
    B.add(steel, rod(V(-33.6, 0, z), V(-30.4, y, z), 0.12, 4), rod(V(-30.4, 0, z), V(-33.6, y, z), 0.12, 4));
  }
  return { group: built(B), glow: [silo, hw], haze: [silo, roofM, clad] };
}

/** Freight cars on a track (their long axis on Z), into the batch. */
function railcar(B, m, kind, colour, x, z) {
  const L = kind === 'tank' ? 18 : kind === 'hopper' ? 16 : 17;
  // the underframe, the two trucks with their wheelsets, couplers at the ends
  B.add(m.dark, bx(2.6, 0.5, L - 0.8, x, 0.95, z));
  for (const s of [-1, 1]) {
    const tz = z + s * (L / 2 - 2.6);
    B.add(m.dark, bx(2.4, 0.5, 2.6, x, 0.55, tz));
    for (const w of [-0.85, 0.85]) B.add(m.wheel, place(new THREE.CylinderGeometry(0.46, 0.46, 1.7, 8).rotateZ(Math.PI / 2), x, 0.62, tz + w));
    B.add(m.dark, bx(0.3, 0.3, 0.7, x, 0.95, z + s * (L / 2 - 0.1)));
  }
  if (kind === 'box') {
    // a boxcar: ribbed steel sides, the sliding door and its rails, the roof walk
    B.add(colour, bx(3.1, 3.9, L, x, 1.2, z));
    B.add(colour, place(new THREE.CylinderGeometry(6, 6, L, 16, 1, false, -0.26, 0.52).rotateX(Math.PI / 2).translate(0, -5.8, 0), x, 5.1, z));
    for (const sx of [-1, 1]) {
      B.add(m.dark, bx(0.08, 3.4, 3.2, x + sx * 1.58, 1.4, z));
      B.add(m.dark, bx(0.1, 0.12, 7, x + sx * 1.6, 4.9, z));
      for (let k = -6; k <= 6; k += 2) if (Math.abs(k) > 2) B.add(colour, bx(0.08, 3.9, 0.14, x + sx * 1.57, 1.2, z + k));
    }
  } else if (kind === 'tank') {
    // a tank car: the barrel with its heads, the dome and walkway
    B.add(colour, place(new THREE.CylinderGeometry(1.5, 1.5, L - 3, 20).rotateX(Math.PI / 2), x, 2.75, z));
    for (const s of [-1, 1]) B.add(colour, place(new THREE.SphereGeometry(1.5, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(s * Math.PI / 2).scale(1, 1, 0.45), x, 2.75, z + s * ((L - 3) / 2)));
    B.add(colour, cy(0.7, 0.7, 0.6, x, 4.1, z, 14));
    B.add(m.dark, bx(3.0, 0.08, 1.4, x, 4.2, z));
  } else {
    // a covered hopper: the body over its sloped bays, the roof hatches
    B.add(colour, bx(3.1, 2.6, L - 1, x, 2.0, z));
    B.add(colour, place(new THREE.CylinderGeometry(3, 3, L - 1, 16, 1, false, -0.55, 1.1).rotateX(Math.PI / 2).translate(0, -2.55, 0), x, 4.6, z));
    for (let k = 0; k < 3; k++) B.add(colour, place(new THREE.CylinderGeometry(0.2, 1.6, 1.0, 4).rotateY(Math.PI / 4).scale(1.4, 1, 1.4), x, 1.5, z - L / 3 + k * (L / 3)));
    for (let k = -2; k <= 2; k++) B.add(m.dark, bx(0.6, 0.12, 1.8, x, 4.6, z + k * 2.8));
  }
  return L;
}

function railyard() {
  const rnd = seeded(1871);
  const m = {
    ballast: pbr('gravel_stones', { scale: 1.5, tint: 0xb0a898 }),
    rail: pbr('metal_plate', { scale: 1, tint: 0x6a6460, metal: 0.8, rough: 0.6 }),
    tie: pbr('wood_planks_grey', { scale: 1.2, tint: 0x8a7a68 }),
    dark: pbr('metal_plate', { scale: 1.5, tint: 0x2c2c2e, metal: 0.5 }),
    wheel: pbr('rusty_metal_02', { scale: 0.8, metal: 0.6 }),
  };
  const paint = [
    pbr('box_profile_metal_sheet', { scale: 1.2, metal: 0.3 }), // boxcar red
    pbr('corrugated_iron', { scale: 1, tint: 0x5a6e88, metal: 0.3 }),
    pbr('rusty_metal_02', { scale: 2, tint: 0xc09a80, metal: 0.4 }),
    pbr('metal_plate', { scale: 2, tint: 0x2a2c2e, metal: 0.4 }), // black tank
    pbr('metal_plate', { scale: 2, tint: 0xd8d6d0, metal: 0.3 }), // white tank / hopper
    pbr('metal_plate', { scale: 2, tint: 0x9aa0a4, metal: 0.4 }), // grey hopper
  ];
  const B = new Batch(), T = new Batch();
  for (let k = 0; k < 6; k++) {
    const x = k * 5.5;
    // the ballast shoulder, sleepers every 0.6 m, rails on them
    T.add(m.ballast, place(new THREE.CylinderGeometry(2.4, 3, 0.4, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 240 / 3.8).translate(0, 0.2, 0), x, 0, 0));
    for (let z = -119; z < 120; z += 0.9) T.add(m.tie, bx(2.6, 0.16, 0.24, x, 0.36, z));
    for (const s of [-0.72, 0.72]) T.add(m.rail, bx(0.07, 0.16, 240, x + s, 0.52, 0), bx(0.16, 0.04, 240, x + s, 0.52, 0));
    if (rnd() < 0.8) {
      let at = -100 + rnd() * 40;
      const n = 4 + Math.floor(rnd() * 10);
      for (let c = 0; c < n; c++) {
        const r = rnd(), kind = r < 0.45 ? 'box' : r < 0.75 ? 'tank' : 'hopper';
        const colour = kind === 'box' ? paint[Math.floor(rnd() * 3)] : kind === 'tank' ? paint[3 + Math.floor(rnd() * 2)] : paint[4 + Math.floor(rnd() * 2)];
        const L = railcar(B, m, kind, colour, x, at + 8);
        at += L + 0.8;
        if (at > 105) break;
      }
    }
  }
  // a seventh track where a switcher shunts a cut of cars back and forth (slowly: yard speed)
  const xs = 6 * 5.5;
  T.add(m.ballast, place(new THREE.CylinderGeometry(2.4, 3, 0.4, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 240 / 3.8).translate(0, 0.2, 0), xs, 0, 0));
  for (let z = -119; z < 120; z += 0.9) T.add(m.tie, bx(2.6, 0.16, 0.24, xs, 0.36, z));
  for (const s2 of [-0.72, 0.72]) T.add(m.rail, bx(0.07, 0.16, 240, xs + s2, 0.52, 0), bx(0.16, 0.04, 240, xs + s2, 0.52, 0));
  const S = new Batch();
  // the locomotive: a road-switcher in Terminal Railroad blue, long hood, cab, short hood
  const loco = pbr('painted_steel', { scale: 1.5, tint: 0x2f4f8f, metal: 0.4 }), stripe = pbr('painted_steel', { scale: 1.5, tint: 0xe6c84a, metal: 0.3 });
  S.add(m.dark, bx(3, 0.6, 17, 0, 0.9, 0));
  for (const tz of [-5.5, 5.5]) { S.add(m.dark, bx(2.6, 0.6, 3.2, 0, 0.45, tz)); for (const w of [-0.9, 0.9]) S.add(m.wheel, place(new THREE.CylinderGeometry(0.5, 0.5, 1.7, 8).rotateZ(Math.PI / 2), 0, 0.6, tz + w)); }
  S.add(loco, bx(2.2, 2.6, 9, 0, 1.5, 2.6), bx(3, 3.4, 2.8, 0, 1.5, -3.4), bx(2.2, 1.8, 2.6, 0, 1.5, -6.5));
  S.add(stripe, bx(3.05, 0.25, 17, 0, 1.55, 0));
  S.add(lit(0x30383f, 0xffe7b8, { night: 0.8, roughness: 0.2 }), bx(3.05, 1, 2.4, 0, 3.4, -3.4));
  let at = 9.5;
  const prnd = seeded(91);
  for (let c = 0; c < 5; c++) { const L = railcar(S, m, c % 2 ? 'hopper' : 'box', paint[Math.floor(prnd() * 3)], 0, at + 8); at += L + 0.8; }
  const cut = built(S);
  const shunt = new THREE.Group(); shunt.add(cut); shunt.position.x = xs;
  const g = new THREE.Group();
  B.build(g);
  g.add(shunt);
  // the track lies flat: no shadow pass for it
  for (const mesh of T.build(g, false)) mesh.userData.noShadow = true;
  return { group: g, glow: [], update(t) { shunt.position.z = -45 + 55 * (0.5 - 0.5 * Math.cos(t * 0.035)); } };
}

/** Eads Bridge: three steel arches on granite piers, the road deck above and the rail deck below. */
function eads() {
  const stone = pbr('granite_wall', { scale: 2, tint: 0xb8c6de, bright: 1.25, glow: 0xffd9a0, night: 0.35 });
  const steel = pbr('metal_plate', { scale: 2, tint: 0x5a5e62, metal: 0.55, glow: 0xffb060, night: 0.2 });
  const deckM = pbr('concrete_wall_008', { scale: 3, tint: 0xb8b2a8 });
  const B = new Batch();
  const spans = [502 * FT, 520 * FT, 502 * FT];
  const total = spans.reduce((a, b) => a + b, 0);
  const deckY = 26, rise = 19;
  // a granite pier: the battered shaft with its pointed cutwaters up- and downstream
  const pier = (x, w, h) => {
    B.add(stone, bx(w, h, 22, x, -8, 0));
    for (const s of [-1, 1]) B.add(stone, place(new THREE.CylinderGeometry(w / 2, w / 2, h, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 1.2).translate(0, h / 2, 0), x, -8, s * 11));
    B.add(stone, bx(w + 1.2, 1.2, 23, x, h - 9.2, 0));
  };
  let x = -total / 2;
  pier(x - 7, 18, deckY + 6);
  for (const s of spans) {
    // each arch: four ribs across the bridge, each a pair of tubular chords
    // braced by a web, rising 19 m; spandrel columns up to the deck
    for (const zz of [-7.5, -2.5, 2.5, 7.5]) {
      const lo = [], hi = [];
      for (let i = 0; i <= 24; i++) { const u = i / 24, y = 4 + rise * 4 * u * (1 - u); lo.push(V(x + s * u, y, zz)); hi.push(V(x + s * u, y + 3.6 - 1.2 * 4 * u * (1 - u), zz)); }
      B.add(steel, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lo), 24, 0.5, 6, false), new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hi), 24, 0.5, 6, false));
      for (let i = 0; i < 24; i++) B.add(steel, rod(lo[i], hi[i + 1], 0.12, 4), rod(hi[i], lo[i], 0.14, 4));
    }
    for (let i = 1; i < 12; i++) {
      const u = i / 12, y = 4 + rise * 4 * u * (1 - u) + 3;
      for (const zz of [-7.5, -2.5, 2.5, 7.5]) B.add(steel, bx(0.45, deckY - y, 0.45, x + s * u, y, zz));
      B.add(steel, bx(0.3, 0.3, 15, x + s * u, deckY - 6.8, 0), bx(0.3, 0.3, 15, x + s * u, deckY - 0.6, 0));
    }
    x += s;
    pier(x, 16, deckY + 4);
  }
  // the decks: the road on top with its rails, the MetroLink deck within, the deck girders
  B.add(deckM, bx(total + 20, 0.6, 18, 0, deckY, 0));
  for (const z of [-8.8, 8.8]) {
    B.add(steel, bx(total + 20, 1.6, 0.4, 0, deckY - 1.6, z * 0.95));
    B.add(steel, bx(total + 20, 0.1, 0.1, 0, deckY + 1.6, z));
    for (let px = -total / 2 - 10; px < total / 2 + 10; px += 3) B.add(steel, bx(0.08, 1, 0.08, px, deckY + 0.6, z));
  }
  B.add(deckM, bx(total + 20, 0.5, 12, 0, deckY - 6.5, 0));
  const g = built(B);
  g.rotation.y = 0.05;
  // a MetroLink Red Line train crossing on the lower deck: two cars, white with the red band
  const train = new THREE.Group();
  const body = painted(0xeeeeea, { roughness: 0.45, metalness: 0.2 }), red = painted(0xb8202a, { roughness: 0.5 });
  const win = lit(0x2a3036, 0xffe9c0, { night: 1, roughness: 0.15 });
  for (let k = 0; k < 2; k++) {
    const car = new THREE.Group();
    car.add(new THREE.Mesh(new THREE.BoxGeometry(27, 3.3, 2.7).translate(0, 1.65, 0), body));
    car.add(new THREE.Mesh(new THREE.BoxGeometry(27.05, 0.4, 2.75).translate(0, 0.7, 0), red));
    car.add(new THREE.Mesh(new THREE.BoxGeometry(24, 1.1, 2.76).translate(0, 2.1, 0), win));
    car.position.x = k * 27.6;
    train.add(car);
  }
  train.position.set(0, deckY - 6.25, 2.5);
  g.add(train);
  const half = total / 2 + 60;
  return {
    group: g, glow: [stone, steel, win], haze: [stone, steel, deckM],
    update(t) {
      // across and back, a train every few minutes each way, out of sight beyond the ends
      const cyc = (t * 14) % (half * 4 + 600);
      const x = cyc < half * 2 ? -half + cyc : cyc < half * 2 + 300 ? 1e5 : cyc < half * 4 + 300 ? half - (cyc - half * 2 - 300) : 1e5;
      train.visible = Math.abs(x) < total / 2 + 12;
      train.position.x = x - 27;
    },
  };
}

/** Downtown St. Louis across the river, west of the Arch. */
function stlouis() {
  const g = new THREE.Group();
  const rnd = seeded(1764);
  const facades = ['#8e8a82', '#5f6f7d', '#a59c8c', '#6b7a6e'].map((c, i) => facadeMaterial(c, { cols: 8, rows: 20, win: '#232a30', lamp: '#ffdca8', seed: 80 + i }));
  const granite = pbr('granite_wall', { scale: 3, tint: 0xd0c6b4, glow: 0xffd9a8, night: 0.5 });
  // One Metropolitan Square (181 m) with its pyramidal granite crown
  // (positions relative to the Arch, from OpenStreetMap)
  g.add(box(46, 160, 46, facades[2], -374, 0, -299));
  const crown = new THREE.Mesh(new THREE.ConeGeometry(30, 21, 4), granite);
  crown.rotation.y = Math.PI / 4;
  crown.position.set(-374, 170.5, -299);
  g.add(crown);
  // the Old Courthouse (1864), the Gateway Arch grounds' model, facing the river
  const cm = {
    lime: pbr('white_sandstone_bricks', { scale: 2.4, glow: 0xffe2b8, night: 0.4 }),
    trim: pbr('white_plaster_02', { scale: 2.5, tint: 0xf2ece0, bright: 1.4 }),
    metal: pbr('metal_plate', { scale: 2, tint: 0x6f7a74, metal: 0.3 }),
    dome: pbr('metal_plate', { scale: 2, tint: 0x5a6a62, metal: 0.35 }),
  };
  const ch = built(courthouse(cm));
  ch.position.set(-385, 0, -110);
  g.add(ch);
  for (let i = 0; i < 46; i++) {
    const x = -320 - rnd() * 900, z = -150 + (rnd() - 0.5) * 1000;
    if (Math.hypot(x + 385, z + 110) < 70 || Math.hypot(x + 374, z + 299) < 50) continue;
    const h = 40 + rnd() * 120 * Math.max(0.2, 1 - Math.abs(z) / 600);
    g.add(box(24 + rnd() * 26, h, 24 + rnd() * 26, facades[Math.floor(rnd() * 4)], x, 0, z));
  }
  return { group: g, glow: [...facades, granite, cm.lime], haze: [...facades, granite, cm.lime, cm.trim, cm.dome] };
}

/** A towboat pushing hopper barges up the Mississippi (the riverfront's tow). */
function barges() {
  const glow = [];
  const t = tow(glow);
  const g = new THREE.Group();
  g.add(t);
  return { group: g, glow, update(time) { t.position.z = -((time * 2.2) % 1600) + 800; } };
}


// ── life on the Illinois side: fishermen on the bank, people in the parks, a heritage
// plaque on every tee, and the jazz mural on the Miles hole ──
function plaqueTexture(title, line) {
  return canvasTex(512, 320, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#6b4a26'); g.addColorStop(0.5, '#8a6434'); g.addColorStop(1, '#5a3d1e');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#c8a060'; c.lineWidth = 10; c.strokeRect(12, 12, w - 24, h - 24);
    c.fillStyle = '#f0d9a8'; c.textAlign = 'center';
    c.font = '600 22px Georgia, serif'; c.fillText('EAST ST. LOUIS HERITAGE TRAIL', w / 2, 58);
    c.font = '700 44px Georgia, serif'; c.fillText(title.toUpperCase(), w / 2, 118);
    c.font = '20px Georgia, serif';
    const words = line.split(' '); let row = '', y = 166;
    for (const wd of words) { if (c.measureText(row + wd).width > w - 70) { c.fillText(row, w / 2, y); row = ''; y += 28; if (y > h - 30) break; } row += wd + ' '; }
    if (y <= h - 30) c.fillText(row, w / 2, y);
  });
}
function muralTexture() {
  return canvasTex(1024, 320, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#1d1840'); g.addColorStop(0.5, '#3b1f5c'); g.addColorStop(1, '#0f2a4a');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // the music: a stave curling across the wall, notes riding it
    c.strokeStyle = 'rgba(255,214,120,0.75)'; c.lineWidth = 3;
    for (let k = 0; k < 5; k++) { c.beginPath(); for (let x = 0; x <= w; x += 8) { const y = 150 + k * 12 + Math.sin(x * 0.012) * 50; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
    c.fillStyle = '#ffd678';
    for (let i = 0; i < 16; i++) { const x = 380 + i * 40, y = 150 + Math.sin(x * 0.012) * 50 + ((i * 37) % 48); c.beginPath(); c.ellipse(x, y, 9, 7, -0.4, 0, 6.29); c.fill(); c.fillRect(x + 7, y - 40, 3, 40); }
    // a trumpeter in silhouette, horn raised, at the left
    c.fillStyle = '#0a0a14';
    c.beginPath(); c.arc(150, 92, 30, 0, 6.29); c.fill();
    c.beginPath(); c.moveTo(118, 120); c.quadraticCurveTo(90, 220, 110, 320); c.lineTo(210, 320); c.quadraticCurveTo(220, 200, 180, 120); c.closePath(); c.fill();
    c.save(); c.translate(178, 98); c.rotate(-0.35);
    c.fillRect(0, -5, 130, 10);
    c.beginPath(); c.moveTo(130, -6); c.lineTo(175, -30); c.lineTo(175, 30); c.lineTo(130, 6); c.closePath(); c.fill();
    c.restore();
    c.fillStyle = '#ffd678'; c.font = '700 56px Georgia, serif'; c.textAlign = 'right';
    c.fillText('EAST ST. LOUIS', w - 40, 80);
    c.font = 'italic 30px Georgia, serif'; c.fillText('where the trumpet learned to sing', w - 40, 290);
  });
}

function eslife() {
  const group = new THREE.Group();
  const res = {
    group, glow: [], trees: [],
    fit(holder, T, opts = {}) {
      if (!opts.course) return;
      holder.updateMatrix();
      const L = holder.matrix.clone(), Li = L.clone().invert(), w = new THREE.Vector3();
      const toW = (x, z) => w.set(x, 0, z).applyMatrix4(L);
      const gy = (x, z) => { toW(x, z); return (T.drawnHeight(w.x, w.z) - holder.position.y) / holder.scale.y; };
      const atHole = (sv, d) => { const p = T.pointAt(sv); w.set(p.x + p.rx * d, 0, p.z + p.rz * d).applyMatrix4(Li); return [w.x, w.z]; };
      const onField = (x, z, pad = 0) => { toW(x, z); const pr = T.project(w.x, w.z); return Math.abs(pr.d) < Math.max(T.fwHalf || 0, 14) + 10 + pad && pr.s > -20 && pr.s < T.length + 30; };
      const wl = T.seaLevel != null ? (T.seaLevel - holder.position.y) / holder.scale.y : -1e9;
      const rnd = seeded(1861 + (T.hole?.n || 0));
      const spots = [];
      const bronze = painted(0x6b4a26, { metalness: 0.7, roughness: 0.45 });
      const stone = pbr('granite_wall', { scale: 1.2, tint: 0xb8b0a4 });

      // the heritage plaque beside the tee
      {
        const [tx, tz] = atHole(-4, -7), [ax, az] = atHole(6, 0);
        const ry = Math.atan2(ax - tx, az - tz) + Math.PI * 0.5;
        const pg = new THREE.Group();
        pg.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.4).translate(0, 0.5, 0), stone));
        const note = (T.hole?.note || '').split('. ')[0].replace(/\.$/, '') + '.';
        const face = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshStandardMaterial({ map: plaqueTexture(T.hole?.name || '', note), metalness: 0.55, roughness: 0.4 }));
        face.position.set(0, 1.25, 0.06); face.rotation.x = -0.35;
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.76, 0.05), bronze); back.position.set(0, 1.25, 0.02); back.rotation.x = -0.35;
        pg.add(back, face);
        pg.position.set(tx, gy(tx, tz), tz); pg.rotation.y = ry;
        group.add(pg);
      }
      // on the Miles hole, the mural on a brick wall beside the tee
      if (/Miles/.test(T.hole?.name || '')) {
        const [mx, mz] = atHole(30, 34), [fx, fz] = atHole(30, 0);
        const wall = new THREE.Group();
        wall.add(new THREE.Mesh(new THREE.BoxGeometry(17, 5.6, 0.5).translate(0, 2.8, 0), pbr('red_brick', { scale: 1.6, tint: 0xc0a090 })));
        const art = new THREE.Mesh(new THREE.PlaneGeometry(16, 5), new THREE.MeshStandardMaterial({ map: muralTexture(), roughness: 0.85 }));
        art.position.set(0, 2.8, 0.26);
        wall.add(art);
        wall.position.set(mx, gy(mx, mz) - 0.2, mz);
        wall.rotation.y = Math.atan2(fx - mx, fz - mz);
        group.add(wall);
        for (let i = 0; i < 6; i++) { const x = mx + (fx - mx) * 0.25 + (rnd() - 0.5) * 12, z = mz + (fz - mz) * 0.25 + (rnd() - 0.5) * 6; spots.push([x, gy(x, z), z, Math.atan2(mx - x, mz - z)]); }
      }
      // fishermen along the riverbank, rods out over the water
      if (wl > -1e8) {
        const rodM = painted(0x2a2a2a, { roughness: 0.5 }), line = new THREE.LineBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.5 });
        const bucket = painted(0xd8d0b0, { roughness: 0.6 });
        let n = 0;
        for (let k = 0; k < 400 && n < 12; k++) {
          const [x, z] = atHole(rnd() * T.length, (rnd() - 0.5) * 900);
          const y = gy(x, z);
          if (y < wl + 0.5 || y > wl + 3 || onField(x, z, 10)) continue;
          // which way is the water?
          let best = null;
          for (let a = 0; a < 6.28; a += 0.5) { const qx = x + Math.cos(a) * 9, qz = z + Math.sin(a) * 9; if (gy(qx, qz) < wl - 0.3) { best = a; break; } }
          if (best == null) continue;
          const ry = Math.atan2(Math.cos(best), Math.sin(best));
          spots.push([x, y, z, ry]);
          const fg = new THREE.Group();
          const r = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.02, 3.6, 5).translate(0, 1.8, 0), rodM);
          r.rotation.x = 1.0; r.position.set(0.25, 1.0, 0.2); fg.add(r);
          const tipZ = 0.2 + Math.sin(1.0) * 3.6, tipY = 1.0 + Math.cos(1.0) * 3.6;
          fg.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.25, tipY, tipZ), new THREE.Vector3(0.25, wl - y, tipZ + 1.5)]), line));
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.36, 10).translate(0, 0.18, 0), bucket); b.position.set(-0.5, 0, -0.3); fg.add(b);
          fg.position.set(x, y, z); fg.rotation.y = ry;
          group.add(fg);
          n++;
        }
      }
      // people in the park beside the hole: walkers, a family, someone watching the river
      const edge = Math.max(T.fwHalf || 0, 14);
      for (let i = 0; i < 50; i++) {
        const sv = T.length * rnd(), d = (rnd() < 0.5 ? -1 : 1) * (edge + 16 + rnd() * 35);
        const [x, z] = atHole(sv, d), [tx, tz] = atHole(sv, 0);
        const y = gy(x, z);
        if (y < wl + 0.5) continue;
        spots.push([x, y, z, Math.atan2(tx - x, tz - z) + (rnd() - 0.5) * 2]);
      }
      const crowd = crowdAt(spots, rnd);
      if (crowd) group.add(crowd);
    },
  };
  return res;
}

export default { geyser, elevators, railyard, eads, stlouis, barges, eslife };
