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
import { mat, lit, box, cyl, sphere, seeded, canvasTex, facadeMaterial, FT } from './kit.js';
import { bus } from '../../core/events.js';

// one listener for the whole session: it fires whichever geyser is on screen
let fireActive = null;
bus.on('course:holeout', () => fireActive?.());

function geyser() {
  const g = new THREE.Group();
  const conc = lit(0xc9c3b6, 0xffe3b8, { night: 0.35 });
  const water = new THREE.MeshStandardMaterial({ color: 0x3f6f80, roughness: 0.08, metalness: 0.3 });
  g.add(cyl(26, 27, 1.2, conc, 0, 0, 0, 48));
  const pool = new THREE.Mesh(new THREE.CircleGeometry(24.5, 48).rotateX(-Math.PI / 2), water);
  pool.position.y = 1.0;
  g.add(pool);
  // the four river fountains on their own islands
  const small = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(cyl(2.2, 2.4, 1.4, conc, Math.cos(a) * 15, 0, Math.sin(a) * 15, 16));
    small.push([Math.cos(a) * 15, Math.sin(a) * 15]);
  }
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

function elevators() {
  const g = new THREE.Group();
  const conc = lit(0xb9b2a4, 0xffd9a0, { night: 0.25, roughness: 0.95 });
  const stain = new THREE.MeshStandardMaterial({
    roughness: 0.95,
    map: canvasTex(128, 256, (c, w, h) => {
      c.fillStyle = '#b8b0a2'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(90,80,70,${Math.random() * 0.25})`; c.fillRect(Math.random() * w, Math.random() * h * 0.3, 2 + Math.random() * 4, h * (0.3 + Math.random() * 0.7)); }
    }),
  });
  // three rows of six bins
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) g.add(cyl(4, 4, 35, stain, i * 8.2 - 20.5, 0, r * 8.2 - 8.2, 18));
  g.add(box(52, 4, 22, conc, 0, 35, 0)); // gallery
  g.add(box(14, 56, 16, conc, -32, 0, 0)); // headhouse
  g.add(box(6, 6, 50, mat(0x6f6458), -32, 44, 30)); // conveyor out to the river
  g.add(box(3, 3, 3, mat(0xc8463c), -32, 57, 0));
  return { group: g, glow: [conc], haze: [conc, stain] };
}

function railyard() {
  const g = new THREE.Group();
  const rnd = seeded(1871);
  const steel = mat(0x5b5b5b, { metalness: 0.6, roughness: 0.6 });
  const tie = mat(0x3d3128);
  const ballast = mat(0x6f675d, { roughness: 1 });
  const cars = [0x7a3a26, 0x3a4a5a, 0x2f3a2f, 0x8a6a3a, 0x6b2a20, 0x2a2a2a];
  for (let k = 0; k < 6; k++) {
    const z = k * 5.5;
    g.add(box(4, 0.3, 240, ballast, z, 0, 0));
    for (const s of [-0.72, 0.72]) g.add(box(0.08, 0.15, 240, steel, z + s, 0.3, 0));
    for (let i = -118; i < 120; i += 3) g.add(box(2.6, 0.12, 0.25, tie, z, 0.28, i));
    // a string of cars on most tracks
    if (rnd() < 0.8) {
      let at = -100 + rnd() * 40;
      const n = 4 + Math.floor(rnd() * 10);
      for (let c = 0; c < n; c++) {
        const kind = rnd();
        const col = mat(cars[Math.floor(rnd() * cars.length)], { roughness: 0.8 });
        if (kind < 0.45) g.add(box(3.1, 4.2, 15.5, col, z, 1.0, at)); // boxcar
        else if (kind < 0.75) { // tank car
          const tc = cyl(1.5, 1.5, 15, col, 0, 0, 0, 12);
          tc.rotation.x = Math.PI / 2;
          tc.position.set(z, 2.7, at);
          g.add(tc);
        }
        else g.add(box(3.1, 3.6, 14, col, z, 1.0, at)); // covered hopper
        at += 17;
        if (at > 110) break;
      }
    }
  }
  return { group: g, glow: [] };
}

/** Eads Bridge: three steel arches on stone piers, double deck. */
function eads() {
  const g = new THREE.Group();
  const stone = lit(0xa49a88, 0xffd9a0, { night: 0.35 });
  const steel = lit(0x4a4d52, 0xffb060, { night: 0.25, metalness: 0.5, roughness: 0.5 });
  const spans = [502 * FT, 520 * FT, 502 * FT];
  const total = spans.reduce((a, b) => a + b, 0);
  let x = -total / 2;
  const deckY = 26;
  g.add(box(4 + 14, deckY + 2, 26, stone, x - 7, -6, 0));
  for (const s of spans) {
    // each arch: a pair of ribs (four tubes in life) rising ~19 m
    for (const zz of [-6, 6]) {
      const pts = [];
      for (let i = 0; i <= 24; i++) { const u = i / 24; pts.push(new THREE.Vector3(x + s * u, 4 + 19 * 4 * u * (1 - u), zz)); }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 1.2, 6, false), steel));
      // spandrel posts up to the deck
      for (let i = 1; i < 12; i++) { const u = i / 12; const y = 4 + 19 * 4 * u * (1 - u); g.add(box(0.5, deckY - y, 0.5, steel, x + s * u, y, zz)); }
    }
    x += s;
    g.add(box(16, deckY + 8, 22, stone, x, -8, 0)); // pier / abutment
  }
  g.add(box(total + 20, 1.6, 18, steel, 0, deckY, 0)); // road deck
  g.add(box(total + 20, 1.2, 12, steel, 0, deckY - 6, 0)); // rail deck (MetroLink)
  g.rotation.y = 0.05;
  return { group: g, glow: [stone, steel], haze: [stone, steel] };
}

/** Downtown St. Louis across the river, west of the Arch. */
function stlouis() {
  const g = new THREE.Group();
  const rnd = seeded(1764);
  const facades = ['#8e8a82', '#5f6f7d', '#a59c8c', '#6b7a6e'].map((c, i) => facadeMaterial(c, { cols: 8, rows: 20, win: '#232a30', lamp: '#ffdca8', seed: 80 + i }));
  const granite = lit(0xb4aa98, 0xffd9a8, { night: 0.5 });
  // One Metropolitan Square (181 m) with its pyramidal granite crown
  // (positions relative to the Arch, from OpenStreetMap)
  g.add(box(46, 160, 46, facades[2], -374, 0, -299));
  const crown = new THREE.Mesh(new THREE.ConeGeometry(30, 21, 4), granite);
  crown.rotation.y = Math.PI / 4;
  crown.position.set(-374, 170.5, -299);
  g.add(crown);
  // the Old Courthouse (1864): Greek Revival wings and the cast-iron dome to 59 m
  const ch = new THREE.Group();
  ch.add(box(64, 18, 30, granite), box(22, 16, 46, granite));
  ch.add(cyl(11, 12, 16, granite, 0, 18, 0, 24));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lit(0x6f8f6f, 0xffe0a8, { night: 0.5, metalness: 0.4 }));
  dome.scale.y = 1.4;
  dome.position.y = 34;
  ch.add(dome);
  ch.add(cyl(2.4, 2.4, 6, granite, 0, 48, 0, 12));
  ch.position.set(-385, 0, -110);
  g.add(ch);
  for (let i = 0; i < 46; i++) {
    const x = -320 - rnd() * 900, z = -150 + (rnd() - 0.5) * 1000;
    if (Math.hypot(x + 385, z + 110) < 70 || Math.hypot(x + 374, z + 299) < 50) continue;
    const h = 40 + rnd() * 120 * Math.max(0.2, 1 - Math.abs(z) / 600);
    g.add(box(24 + rnd() * 26, h, 24 + rnd() * 26, facades[Math.floor(rnd() * 4)], x, 0, z));
  }
  return { group: g, glow: [...facades, granite], haze: [...facades, granite] };
}

/** A towboat pushing fifteen barges (3 × 5) up the Mississippi. */
function barges() {
  const g = new THREE.Group();
  const hull = mat(0x3a3330, { roughness: 0.8 });
  const rust = mat(0x6a3a26, { roughness: 0.9 });
  const tow = new THREE.Group();
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) tow.add(box(10.7, 3.6, 59.4, r % 2 ? rust : hull, (c - 1) * 10.8, -1.8, -r * 60));
  const boat = new THREE.Group();
  boat.add(box(16, 3, 40, mat(0xe8e2d4), 0, -1.5, 0));
  boat.add(box(12, 4, 18, mat(0xf0ece2), 0, 1.5, 4), box(9, 3.5, 9, mat(0xf0ece2), 0, 5.5, 6), box(9.4, 1.2, 9.4, mat(0x2a2a2a), 0, 9, 6));
  boat.add(cyl(0.5, 0.5, 5, mat(0x222222), -3, 8, 12, 8), cyl(0.5, 0.5, 5, mat(0x222222), 3, 8, 12, 8));
  boat.position.z = 50;
  tow.add(boat);
  g.add(tow);
  return { group: g, glow: [], update(t) { tow.position.z = -((t * 2.2) % 1600) + 800; } };
}

export default { geyser, elevators, railyard, eads, stlouis, barges };
