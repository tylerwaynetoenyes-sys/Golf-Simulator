// Paris landmarks for the Bois de Boulogne course, from published figures:
//   Eiffel Tower (1889): 330 m with antennas (300 m as built); square base
//     125 m a side; platforms at 57 m, 115 m and 276 m; puddled iron painted
//     "Eiffel Tower brown"; gold lighting at night and a sparkle on the hour
//   Arc de Triomphe (1806–1836): 50 m tall, 45 m wide, 22 m deep; central
//     arch 29.19 m high, 14.62 m wide
//   Grande Arche de La Défense (1989): a hollow cube about 110 m
//   Haussmann blocks (1853–1870): six or seven storeys of cut limestone to a
//     ~20 m cornice, grey zinc mansard roofs, wrought-iron balconies
//   The Grande Cascade of the Bois de Boulogne (1856): an artificial cliff
//     ~10 m high with a waterfall into a pool
// Far landmarks are modelled in map axes (+x east, +z south).
import * as THREE from 'three';
import { mat, lit, box, cyl, sphere, seeded, canvasTex, facadeMaterial } from './kit.js';

const BROWN = 0x6e5a42;

/** Puddled-iron lattice: an alpha-tested cross-braced texture. */
function latticeMaterial(repeat = [6, 12]) {
  const tex = canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#fff';
    g.lineWidth = 9;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
  }, repeat);
  const m = new THREE.MeshStandardMaterial({ color: BROWN, alphaMap: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.2, emissive: 0xffa53a, emissiveIntensity: 0 });
  tex.colorSpace = THREE.NoColorSpace;
  m.userData.night = 0.9;
  return m;
}

/** A tapered four-sided frustum between two square cross-sections (centres a→b, half-widths ra→rb). */
function frustum(ra, rb, ya, yb, m) {
  const g = new THREE.CylinderGeometry(rb * Math.SQRT2, ra * Math.SQRT2, yb - ya, 4, 6, true);
  g.rotateY(Math.PI / 4).translate(0, (ya + yb) / 2, 0);
  return new THREE.Mesh(g, m);
}

function eiffel() {
  const g = new THREE.Group();
  const iron = latticeMaterial([4, 6]);
  const ironFine = latticeMaterial([3, 10]);
  const deck = lit(BROWN, 0xffb04a, { night: 0.8, roughness: 0.8 });
  // the four legs: curving inward from the 125 m base to the first platform
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      const y = u * 57;
      const r = 62.5 - (62.5 - 33) * (1 - (1 - u) ** 1.6); // the leg's outer edge curves in
      pts.push(new THREE.Vector3(sx * (r - 12), y, sz * (r - 12)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const leg = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 9, 4, false), iron);
    g.add(leg);
  }
  // the decorative arches under the first platform, one per face
  for (let k = 0; k < 4; k++) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(39, 1.6, 6, 32, Math.PI), deck);
    arc.rotation.y = (k * Math.PI) / 2;
    arc.position.y = 12;
    arc.translateZ(42);
    g.add(arc);
  }
  g.add(box(70, 7, 70, deck, 0, 52, 0)); // first platform (57 m)
  g.add(frustum(30, 19, 57, 115, iron)); // up to the second
  g.add(box(42, 5, 42, deck, 0, 112, 0)); // second platform (115 m)
  g.add(frustum(17, 5.2, 117, 274, ironFine)); // the long taper to the top
  g.add(box(16, 6, 16, deck, 0, 274, 0)); // top platform (276 m)
  g.add(box(9, 16, 9, deck, 0, 280, 0));
  g.add(cyl(1.2, 1.8, 34, mat(0xd8d8d8, { metalness: 0.6 }), 0, 296, 0, 8)); // antennas to 330 m
  // night: a rotating beacon and the hourly sparkle
  const beam = new THREE.Mesh(new THREE.ConeGeometry(14, 600, 16, 1, true).translate(0, -300, 0).rotateZ(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const beamPivot = new THREE.Group();
  beamPivot.position.y = 290;
  beamPivot.add(beam);
  g.add(beamPivot);
  const sparkle = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xffffff, size: 3, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false }));
  {
    const rnd = seeded(1889);
    const p = [];
    for (let i = 0; i < 700; i++) {
      const y = rnd() * 290, r = y < 57 ? 50 - y * 0.4 : y < 115 ? 30 - (y - 57) * 0.19 : 17 - (y - 115) * 0.075;
      const a = Math.floor(rnd() * 4) * (Math.PI / 2) + (rnd() - 0.5) * 1.4;
      p.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
    sparkle.geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  }
  g.add(sparkle);
  return {
    group: g,
    glow: [iron, ironFine, deck],
    haze: [iron, ironFine, deck],
    update(t, dt, day) {
      const night = 1 - day;
      beamPivot.rotation.y = t * 0.6;
      beam.material.opacity = 0.12 * night;
      // the sparkle runs for a few seconds each minute here (hourly in Paris)
      const s = (t % 60) < 6 ? 1 : 0;
      sparkle.material.opacity = night * s * (0.5 + 0.5 * Math.sin(t * 40));
    },
  };
}

function arcdetriomphe() {
  const g = new THREE.Group();
  const stone = lit(0xd9cfb9, 0xffe0b0, { night: 0.7 });
  const W = 45, D = 22, H = 50;
  // the body with the great arch (29.19 × 14.62) cut through the long faces
  const s = new THREE.Shape();
  s.moveTo(-W / 2, 0); s.lineTo(W / 2, 0); s.lineTo(W / 2, H - 9); s.lineTo(-W / 2, H - 9); s.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-7.31, 0); hole.lineTo(-7.31, 29.19 - 7.31); hole.absarc(0, 29.19 - 7.31, 7.31, Math.PI, 0, true); hole.lineTo(7.31, 0); hole.closePath();
  s.holes.push(hole);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: false }).translate(0, 0, -D / 2), stone);
  g.add(body);
  g.add(box(W + 1.5, 2.2, D + 1.5, stone, 0, H - 11, 0)); // the frieze cornice
  g.add(box(W, 9, D, stone, 0, H - 9, 0)); // the attic
  g.add(box(W + 1, 1, D + 1, stone, 0, H, 0));
  return { group: g, glow: [stone], haze: [stone] };
}

function ladefense() {
  const g = new THREE.Group();
  const white = lit(0xf0eee8, 0xdfe8ff, { night: 0.5 });
  const glass = facadeMaterial('#6b8297', { cols: 10, rows: 30, win: '#24313d', lamp: '#fff0d0', seed: 41 });
  // the Grande Arche: a 110 m hollow cube, turned 6.33° off the historical axis
  const arche = new THREE.Group();
  arche.add(box(110, 12, 112, white, 0, 0, 0)); // plinth
  arche.add(box(19, 86, 112, white, -45.5, 12, 0));
  arche.add(box(19, 86, 112, white, 45.5, 12, 0));
  arche.add(box(110, 12, 112, white, 0, 98, 0));
  arche.rotation.y = THREE.MathUtils.degToRad(6.33);
  g.add(arche);
  // the business district behind it: towers to ~230 m
  const rnd = seeded(1958);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, r = 250 + rnd() * 700;
    const h = 90 + rnd() * 140;
    const t = box(30 + rnd() * 25, h, 30 + rnd() * 25, glass, Math.cos(a) * r + 500, 0, Math.sin(a) * r * 0.6 + 200);
    t.rotation.y = rnd() * 0.5;
    g.add(t);
  }
  g.add(box(46, 231, 36, glass, 700, 0, 120)); // Tour First, the tallest in France
  return { group: g, glow: [white, glass], haze: [white, glass] };
}

/** A band of Haussmann blocks (the 16th arrondissement at the edge of the Bois). */
function haussmann() {
  const g = new THREE.Group();
  const rnd = seeded(1853);
  const stones = ['#e3d6bd', '#d9cbb0', '#e8dcc6', '#d4c6aa'].map((c, i) => facadeMaterial(c, { cols: 9, rows: 6, win: '#3a3a40', lamp: '#ffd9a0', frame: '#bfb196', seed: 60 + i }));
  const zinc = lit(0x7d8790, 0x223344, { night: 0.1, roughness: 0.5, metalness: 0.4 });
  // blocks along a few boulevards, in map axes
  for (let bx = -6; bx <= 6; bx++) {
    for (let bz = -10; bz <= 10; bz++) {
      if (rnd() < 0.12) continue; // a square or a garden
      const x = bx * 95 + (rnd() - 0.5) * 8, z = bz * 80 + (rnd() - 0.5) * 8;
      const w = 70 + rnd() * 14, d = 58 + rnd() * 12, h = 18 + Math.floor(rnd() * 3) * 3;
      const f = stones[Math.floor(rnd() * stones.length)];
      g.add(box(w, h, d, f, x, 0, z));
      // the mansard: a steep zinc roof set back from the cornice
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(Math.SQRT1_2 * Math.min(w, d) * 0.72, Math.SQRT1_2 * Math.min(w, d), 5.5, 4, 1), zinc);
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(w / Math.min(w, d), 1, d / Math.min(w, d));
      roof.position.set(x, h + 2.75, z);
      g.add(roof);
    }
  }
  return { group: g, glow: stones, haze: [...stones, zinc] };
}

/** The Grande Cascade: a rock cliff with a waterfall into a pool. */
function cascade() {
  const g = new THREE.Group();
  const rock = mat(0x8c8273, { roughness: 1 });
  const rnd = seeded(1856);
  for (let i = 0; i < 26; i++) {
    const r = 2 + rnd() * 3.2;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rock);
    s.position.set((rnd() - 0.5) * 22, rnd() * 9, -4 - rnd() * 5);
    s.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    s.castShadow = true;
    g.add(s);
  }
  const fallTex = canvasTex(64, 256, (c, w, h) => {
    for (let y = 0; y < h; y++) { c.fillStyle = `rgba(235,245,255,${0.35 + 0.4 * Math.random()})`; c.fillRect(Math.random() * w, y, 3 + Math.random() * 10, 1); }
  }, [1, 1]);
  fallTex.wrapT = THREE.RepeatWrapping;
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(5, 10), new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.85, depthWrite: false }));
  fall.position.set(0, 5, -1.2);
  g.add(fall);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(11, 32).rotateX(-Math.PI / 2), mat(0x2d4b55, { roughness: 0.1, metalness: 0.3 }));
  pool.position.set(0, 0.15, 5);
  g.add(pool);
  return { group: g, glow: [], update(t) { fallTex.offset.y = (t * 1.6) % 1; } };
}

/** A Morris column, a Wallace fountain and a bench: Paris street furniture by the green. */
function colonne() {
  const g = new THREE.Group();
  const green = mat(0x24443a, { roughness: 0.6, metalness: 0.3 });
  const posters = new THREE.MeshStandardMaterial({
    roughness: 0.8,
    map: canvasTex(256, 128, (c, w, h) => {
      const cols = ['#c8463c', '#f2e2b8', '#2f4b7a', '#e3b13c', '#7a2f4b', '#f4f1ea'];
      for (let i = 0; i < 6; i++) { c.fillStyle = cols[i]; c.fillRect((i * w) / 6, 0, w / 6, h); c.fillStyle = 'rgba(0,0,0,0.6)'; c.font = '700 14px Georgia'; c.fillText('PARIS', (i * w) / 6 + 6, 30 + (i % 3) * 30); }
    }),
  });
  g.add(cyl(0.65, 0.65, 3.2, posters, 0, 0.4, 0, 20));
  g.add(cyl(0.72, 0.72, 0.4, green, 0, 0, 0, 20));
  g.add(cyl(0.8, 0.6, 0.6, green, 0, 3.6, 0, 20));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), green);
  cap.position.y = 4.2;
  g.add(cap);
  // the Wallace fountain: four caryatids under a dome (2.7 m)
  const wf = new THREE.Group();
  wf.add(cyl(0.45, 0.55, 0.9, green, 0, 0, 0, 8));
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; wf.add(cyl(0.07, 0.09, 1.2, green, Math.cos(a) * 0.3, 0.9, Math.sin(a) * 0.3, 6)); }
  wf.add(cyl(0.5, 0.35, 0.25, green, 0, 2.1, 0, 10));
  wf.add(sphere(0.12, green, 0, 2.5, 0, 8));
  wf.position.set(3, 0, 0.5);
  g.add(wf);
  g.add(box(1.8, 0.45, 0.5, green, -3, 0, 0.6), box(1.8, 0.5, 0.06, green, -3, 0.45, 0.85));
  return { group: g, glow: [] };
}

export default { eiffel, arcdetriomphe, ladefense, haussmann, cascade, colonne };
