// Torrey Pines: the Gliderport on the bluff south of the 12th and 13th. Since
// 1928 pilots have launched from the cliff top here into the ridge lift off the
// Pacific; today it is paragliders and hang gliders over Black's Beach, some
// 100 m below. The flight park's low wooden hut and café, a windsock and
// canopies laid out on the launch, and paragliders working the lift along the
// cliffs. Far landmark: modelled in map axes (+x east, +z south), the cliff
// edge some 50 m west (-x) of the hut.
import * as THREE from 'three';
import { seeded } from './kit.js';
import { pbr, painted } from '../../scene/pbr.js';
import { Batch, bx, cy, place } from './riverfront.js';

// canopy colours seen over the gliderport: bright solids and two-tones
const WINGS = [0xe8402a, 0xf2b705, 0x1f7fd0, 0xf2f0ea, 0xe85d9a, 0xf07b1a, 0x6a4bc4, 0x12a5b8];

/** A paraglider wing: an arched strip, `span` metres tip to tip, chord along -z (its heading). */
function wingGeometry(span = 11, chord = 2.6) {
  const R = span / 1.7; // arc radius: the wing curves down at the tips
  const g = new THREE.CylinderGeometry(R, R, chord, 18, 1, true, -0.85, 1.7);
  // the cylinder's axis is y: lay it along z so the arc spans x and bulges up
  g.rotateX(Math.PI / 2);
  g.translate(0, -R, 0); // the crown of the arc at y = 0
  return g;
}

/** Suspension lines from the wing to the pilot (one LineSegments per glider). */
function linesGeometry(span = 11, drop = 7) {
  const R = span / 1.7, p = [];
  for (let i = -4; i <= 4; i++) {
    const a = (i / 4) * 0.82;
    const x = Math.sin(a) * R, y = Math.cos(a) * R - R;
    for (const z of [-0.9, 0.7]) p.push(x, y, z, 0, -drop, 0.15);
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
}

function gliderport() {
  const g = new THREE.Group();
  const B = new Batch();
  const rnd = seeded(1928);
  // the flight park: low board-and-batten huts under corrugated roofs, a deck
  const wood = pbr('wood_planks_grey', { scale: 1.4, tint: 0xd9c3a0, bright: 1.3 });
  const roof = pbr('corrugated_iron', { scale: 1.2, tint: 0xb9b2a6, metal: 0.4 });
  const deck = pbr('brown_planks_08', { scale: 0.9, tint: 0xc8a882 });
  const post = pbr('bark_brown_02', { scale: 0.4, tint: 0x9a8a78 });
  B.add(wood, bx(14, 3.2, 7, 0, 0, 0), bx(8, 2.8, 5, 4, 0, -11), bx(4, 2.6, 4, -4, 0, 14));
  B.add(roof, place(new THREE.BoxGeometry(15, 0.2, 8).translate(0, 3.3, 0), 0, 0, 0, 0, 1, 1, 1, 0.06),
    bx(9, 0.2, 6, 4, 2.9, -11), bx(4.6, 0.2, 4.6, -4, 2.7, 14));
  B.add(deck, bx(10, 0.5, 8, -10, 0, 0));
  for (const [x, z] of [[-14.6, -3.6], [-14.6, 3.6], [-5.4, -3.6], [-5.4, 3.6]]) B.add(post, cy(0.08, 0.08, 1.1, x, 0.5, z, 5));
  // picnic tables on the deck and the cliff-top grass
  for (let i = 0; i < 6; i++) {
    const x = -12 + (i % 2) * 4 - (i > 3 ? 14 : 0), z = -2.5 + Math.floor(i / 2) * 2.5 - (i > 3 ? 8 : 0);
    const y = i > 3 ? 0 : 0.5;
    B.add(deck, bx(1.8, 0.06, 0.8, x, y + 0.72, z), bx(1.8, 0.05, 0.28, x, y + 0.42, z - 0.65), bx(1.8, 0.05, 0.28, x, y + 0.42, z + 0.65));
    B.add(post, bx(0.08, 0.72, 0.08, x - 0.75, y, z), bx(0.08, 0.72, 0.08, x + 0.75, y, z));
  }
  // the windsock mast at the edge of the launch
  B.add(painted(0xe8e6e0, { roughness: 0.5, metalness: 0.4 }), cy(0.07, 0.1, 8, -22, 0, -16, 8));
  B.build(g);

  const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.18, 2.8, 12, 4, true).rotateZ(Math.PI / 2).translate(1.4, 0, 0),
    painted(0xff6a1a, { roughness: 0.8, side: THREE.DoubleSide }));
  sock.position.set(-22, 7.6, -16);
  g.add(sock);

  // canopies laid out on the grass by the huts, ready to launch
  const flat = new THREE.PlaneGeometry(10, 2.4).rotateX(-Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(flat, painted(WINGS[(i * 3 + 1) % WINGS.length], { roughness: 0.7, side: THREE.DoubleSide }));
    m.position.set(-16 - i * 2, 0.08, 8 + i * 6);
    m.rotation.y = (rnd() - 0.5) * 0.4;
    m.receiveShadow = true;
    g.add(m);
  }

  // paragliders soaring the ridge lift along the cliffs, north toward the
  // golf course and back: long beats on the windward face, turns out over the sea
  const wingG = wingGeometry(), lineG = linesGeometry(), pilotG = new THREE.CapsuleGeometry(0.28, 0.7, 4, 8);
  const lineM = new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.55 });
  const pilotM = painted(0x2a2d33, { roughness: 0.8 });
  const fliers = [];
  for (let i = 0; i < 7; i++) {
    const f = new THREE.Group();
    // sunlight comes through the ripstop: seen from below a canopy glows its colour, not a shadow
    const c = WINGS[i % WINGS.length];
    const wing = new THREE.Mesh(wingG, painted(c, { roughness: 0.65, side: THREE.DoubleSide, emissive: c, emissiveIntensity: 0.45 }));
    wing.castShadow = true;
    const pilot = new THREE.Mesh(pilotG, pilotM);
    pilot.position.y = -7.4;
    pilot.rotation.x = 1.2; // seated in the harness
    f.add(wing, new THREE.LineSegments(lineG, lineM), pilot);
    g.add(f);
    fliers.push({
      f,
      // each flies its own beat: how far north it ranges, how high, how fast
      north: 380 + rnd() * 520, south: 40 + rnd() * 160, x: -70 - rnd() * 60,
      alt: 25 + rnd() * 80, speed: 9 + rnd() * 3, phase: rnd(),
    });
  }
  const _p = new THREE.Vector3(), _q = new THREE.Vector3();
  const at = (b, u, out) => {
    // a stadium-shaped beat: up the face, a turn out to sea, back down the line further out
    const L = b.north + b.south, per = 2 * L + Math.PI * 30;
    let s = (((u % 1) + 1) % 1) * per;
    if (s < L) return out.set(b.x, b.alt, b.south - s);
    s -= L;
    if (s < Math.PI * 15) { const a = s / 15; return out.set(b.x - 15 + Math.cos(a) * 15, b.alt + 4, -b.north - Math.sin(a) * 15); }
    s -= Math.PI * 15;
    if (s < L) return out.set(b.x - 30, b.alt + 4, -b.north + s);
    s -= L;
    const a = s / 15;
    return out.set(b.x - 15 - Math.cos(a) * 15, b.alt, b.south + Math.sin(a) * 15);
  };
  const update = (t, dt, day) => {
    // the sock fills and swings in the onshore breeze
    sock.rotation.y = Math.PI + Math.sin(t * 0.7) * 0.25;
    sock.rotation.z = -0.08 + Math.sin(t * 2.3) * 0.04;
    for (const b of fliers) {
      const L = b.north + b.south, per = 2 * L + Math.PI * 30, u = b.phase + (t * b.speed) / per;
      at(b, u, _p); at(b, u + 2 / per, _q);
      b.f.visible = day > 0.15; // nobody flies after dark
      b.f.position.copy(_p);
      b.f.position.y += Math.sin(t * 0.5 + b.phase * 9) * 3;
      // heading: -z of the wing leads; bank into the turns at the ends of the beat
      const dx = _q.x - _p.x, dz = _q.z - _p.z;
      b.f.rotation.set(0, Math.atan2(-dx, -dz), Math.abs(dx) > 0.05 ? -0.35 * Math.sign(dz || 1) : 0, 'YXZ');
    }
  };
  return { group: g, glow: [], update };
}

export default { gliderport };
