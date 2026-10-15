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
import { mat, lit, box, cyl, sphere, seeded, canvasTex, facadeMaterial, boulderGeometry, landmarkWater } from './kit.js';
import { pbr } from '../../scene/pbr.js';
import { Batch, bx, place } from './riverfront.js';
import { model } from '../../scene/models.js';

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

/**
 * Straight members between point pairs, as one instanced mesh of unit
 * square bars (a member is a bar scaled to its length and section).
 */
function members(list, m) {
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const im = new THREE.InstancedMesh(geo, m, list.length);
  const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), m4 = new THREE.Matrix4();
  list.forEach(([a, b, t], i) => {
    d.subVectors(b, a);
    const L = d.length();
    q.setFromUnitVectors(up, d.normalize());
    sc.set(t, L, t);
    im.setMatrixAt(i, m4.compose(a, q, sc));
  });
  im.castShadow = true;
  return im;
}

/**
 * The Eiffel Tower as a lattice, from its published dimensions: four curved
 * legs, each a cross-braced square column, rising from a 125 m base and
 * merging above the second floor into one tapering shaft; the decorative
 * arches under the first floor; platforms at 57.6, 115.7 and 276.1 m; the
 * crown and antennas to 330 m.
 */
function eiffel() {
  const g = new THREE.Group();
  const iron = lit(BROWN, 0xffa53a, { night: 0.9, roughness: 0.72, metalness: 0.25 });
  const deck = lit(0x5f4d39, 0xffb04a, { night: 0.8, roughness: 0.8 });
  const half = (y) => 5 + 57.5 * Math.exp(-y / 85); // outer half-width
  const legW = (y) => 26 - 5.5 * (y / 116); // a leg column's side, until they merge
  const MERGE = 128;
  // section heights: closer at the bottom where the members are heavy
  const ys = [];
  for (let y = 0; y < MERGE; y += y < 60 ? 6 : 7.5) ys.push(y);
  ys.push(MERGE);
  for (let y = MERGE + 9; y < 276; y += 9 + (y - MERGE) * 0.03) ys.push(y);
  ys.push(276);
  const list = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const face = (A, B, C, D, tChord, tBrace) => {
    // A,B lower pair; C,D upper pair: X brace between them
    list.push([A, C, tChord], [B, D, tChord], [A, D, tBrace], [B, C, tBrace], [A, B, tBrace * 0.8]);
  };
  // the legs, below the merge
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const ring = (y) => {
      const h = half(y), w = Math.min(legW(y), h);
      const o = h, i = h - w;
      // four corners of this leg's square section
      return [V(sx * o, y, sz * o), V(sx * i, y, sz * o), V(sx * i, y, sz * i), V(sx * o, y, sz * i)];
    };
    for (let k = 0; k + 1 < ys.length && ys[k] < MERGE; k++) {
      const lo = ring(ys[k]), hi = ring(ys[k + 1]);
      const tc = 1.5 - ys[k] * 0.006, tb = 0.55;
      for (let e = 0; e < 4; e++) face(lo[e], lo[(e + 1) % 4], hi[e], hi[(e + 1) % 4], tc, tb);
    }
  }
  // the shaft above the merge
  const sq = (y) => { const h = half(y); return [V(-h, y, -h), V(h, y, -h), V(h, y, h), V(-h, y, h)]; };
  for (let k = ys.indexOf(MERGE); k + 1 < ys.length; k++) {
    const lo = sq(ys[k]), hi = sq(ys[k + 1]);
    for (let e = 0; e < 4; e++) face(lo[e], lo[(e + 1) % 4], hi[e], hi[(e + 1) % 4], 1.1, 0.42);
  }
  // the four decorative arches between the legs, springing from the ground
  for (let f = 0; f < 4; f++) {
    const ang = (f * Math.PI) / 2;
    const pts = [];
    for (let i = 0; i <= 18; i++) {
      const u = i / 18;
      const x = -38 + 76 * u, y = 39 * Math.sin(Math.PI * u) ** 0.8 + (1 - Math.sin(Math.PI * u)) * 8;
      pts.push(V(x, y, 0));
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i].clone(), b = pts[i + 1].clone();
      for (const p of [a, b]) { const z = half(p.y) - 1; p.applyAxisAngle(V(0, 1, 0), ang); p.add(V(0, 0, 0)); const r = V(0, 0, z).applyAxisAngle(V(0, 1, 0), ang); p.add(r); }
      list.push([a, b, 1.3]);
    }
  }
  g.add(members(list, iron));
  // platforms: decks with a lit gallery round each
  const plat = (y, w, h) => { g.add(box(w, h, w, deck, 0, y, 0)); g.add(box(w + 2, 1.2, w + 2, deck, 0, y + h, 0)); };
  plat(57.6 - 6, 2 * half(57.6) + 4, 6);
  plat(115.7 - 5, 2 * half(115.7) + 3, 5);
  plat(276.1 - 5, 2 * half(276) + 3, 5);
  g.add(box(10, 14, 10, deck, 0, 276, 0)); // the top-floor cabins and Eiffel's office
  g.add(cyl(3.2, 4.6, 6, deck, 0, 290, 0, 12)); // the lantern
  g.add(cyl(1.0, 1.6, 34, mat(0xd8d8d8, { metalness: 0.6 }), 0, 296, 0, 8)); // antennas to 330 m
  // the detailed model (Johnson-Martin, Sketchfab, CC BY) replaces the
  // procedural lattice when it's loaded, painted the tower's brown
  const M = model('eiffel');
  if (M) {
    g.clear();
    M.traverse((o) => { if (o.isMesh) { o.material = iron; o.castShadow = true; } });
    g.add(M);
  }
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
    glow: [iron, deck],
    haze: [iron, deck],
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
  // cut limestone: 50 m tall, 45 m wide, 22 m deep; the great arch through the
  // long faces (29.19 × 14.62 m), the smaller arches through the short faces
  // (18.68 × 8.44 m), the frieze, the cornice and the attic with its shields
  const stone = pbr('sandstone_blocks_08', { scale: 5, tint: 0xf4ecdc, bright: 1.35, glow: 0xffe0b0, night: 0.7 });
  const carved = pbr('white_plaster_02', { scale: 1.5, tint: 0xf0e6d4, bright: 1.6 });
  const B = new Batch();
  const W = 45, D = 22, H = 50, ga = 7.31, gh = 29.19, sa = 4.22, sh = 18.68, base = H - 9;
  const archHole = (path, half, h) => { path.moveTo(-half, 0); path.lineTo(-half, h - half); path.absarc(0, h - half, half, Math.PI, 0, true); path.lineTo(half, 0); path.closePath(); return path; };
  // the two piers, each pierced by the side arch (shape across Z, extruded along X)
  const pw = W / 2 - ga;
  for (const s of [-1, 1]) {
    const sp = new THREE.Shape(); sp.moveTo(-D / 2, 0); sp.lineTo(D / 2, 0); sp.lineTo(D / 2, base); sp.lineTo(-D / 2, base); sp.closePath();
    sp.holes.push(archHole(new THREE.Path(), sa, sh));
    B.add(stone, place(new THREE.ExtrudeGeometry(sp, { depth: pw, bevelEnabled: false, curveSegments: 12 }).rotateY(Math.PI / 2), s > 0 ? ga : -W / 2, 0, 0));
    // the sculpture groups on the pillars' faces (Rude's Marseillaise and the rest), as carved panels
    for (const z of [D / 2, -D / 2]) B.add(carved, bx(pw * 0.62, 11, 1.2, s * (ga + pw / 2), 4.5, z + Math.sign(z) * 0.6));
    for (const z of [D / 2, -D / 2]) B.add(carved, bx(pw * 0.7, 5, 0.6, s * (ga + pw / 2), 22, z + Math.sign(z) * 0.3));
  }
  // the vault over the great arch (shape across X, extruded along Z)
  const vs = new THREE.Shape(); vs.moveTo(-ga, 0); vs.lineTo(ga, 0); vs.lineTo(ga, base); vs.lineTo(-ga, base); vs.closePath();
  vs.holes.push(archHole(new THREE.Path(), ga - 0.001, gh));
  B.add(stone, new THREE.ExtrudeGeometry(vs, { depth: D, bevelEnabled: false, curveSegments: 16 }).translate(0, 0, -D / 2));
  // the impost band at the springing of the great arch, the frieze, the cornice, the attic and its shields
  B.add(carved, bx(W + 0.6, 1.0, D + 0.6, 0, gh - ga - 0.5, 0));
  B.add(carved, bx(W + 0.8, 3.0, D + 0.8, 0, base - 5, 0));
  B.add(stone, bx(W + 1.5, 2.2, D + 1.5, 0, base - 2, 0));
  B.add(stone, bx(W, 9, D, 0, base, 0), bx(W + 1, 1, D + 1, 0, H, 0));
  for (let i = 0; i < 6; i++) for (const z of [D / 2 + 0.2, -D / 2 - 0.2]) B.add(carved, place(new THREE.CylinderGeometry(1.4, 1.4, 0.4, 16).rotateX(Math.PI / 2), -W / 2 + 3.75 + i * 7.5, base + 4.5, z));
  const g = new THREE.Group();
  B.build(g);
  return { group: g, glow: [stone], haze: [stone, carved] };
}

function ladefense() {
  const g = new THREE.Group();
  const white = pbr('white_stucco', { scale: 4, tint: 0xf4f6f8, bright: 1.8, glow: 0xdfe8ff, night: 0.5 });
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
  const zinc = pbr('metal_plate', { scale: 3, tint: 0x8a96a2, metal: 0.4, glow: 0x223344, night: 0.1 });
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
  // the artificial cliff: rough limestone boulders piled round the fall
  const rock = pbr('rock_face_03', { scale: 3, tint: 0xb8c4d8, bright: 1.2 });
  const rnd = seeded(1856);
  const R = new Batch();
  for (let i = 0; i < 26; i++) {
    const r = 2 + rnd() * 3.2;
    R.add(rock, place(boulderGeometry(r, rnd, { flat: 0.8 }), (rnd() - 0.5) * 22, rnd() * 9, -4 - rnd() * 5, rnd() * 6.28));
  }
  R.build(g);
  const fallTex = canvasTex(64, 256, (c, w, h) => {
    for (let y = 0; y < h; y++) { c.fillStyle = `rgba(235,245,255,${0.35 + 0.4 * Math.random()})`; c.fillRect(Math.random() * w, y, 3 + Math.random() * 10, 1); }
  }, [1, 1]);
  fallTex.wrapT = THREE.RepeatWrapping;
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(5, 10), new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.85, depthWrite: false }));
  fall.position.set(0, 5, -1.2);
  g.add(fall);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(11, 32).rotateX(-Math.PI / 2), landmarkWater());
  pool.position.set(0, 0.15, 5);
  g.add(pool);
  return { group: g, glow: [], update(t) { fallTex.offset.y = (t * 1.6) % 1; } };
}

/** A Morris column, a Wallace fountain and a bench: Paris street furniture by the green. */
function colonne() {
  const g = new THREE.Group();
  const green = pbr('metal_plate', { scale: 0.8, tint: 0x2e5a4a, metal: 0.35 }); // Paris's painted cast iron
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
