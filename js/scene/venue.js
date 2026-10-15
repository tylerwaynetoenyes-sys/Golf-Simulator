// The driving range as an entertainment venue, after Topgolf and the like: a
// three-tier hitting building curving round behind the player, its bays busy
// with people, screens and warm light; tall netting poles down both sides;
// target greens with concentric rings that glow after dark; thousands of
// range balls on the turf; other golfers' shots flying out from the bays;
// and the caged ball picker crawling up and down the range.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GREENS, LAYOUT, groundHeight } from './layout.js';
import { pbr } from './pbr.js';
import { crowdAt } from './crowd.js';
import { preloadCourseModels } from './models.js';

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** A merged mesh per material from a list of [material, geometry]. */
function batch(group, pairs, { shadow = true } = {}) {
  const by = new Map();
  for (const [m, g] of pairs) { if (!by.has(m)) by.set(m, []); by.get(m).push(g.index ? g.toNonIndexed() : g); }
  for (const [m, gs] of by) {
    for (const g of gs) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const mesh = new THREE.Mesh(mergeGeometries(gs), m);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    group.add(mesh);
  }
}

export function buildVenue(group, { quality, updaters, dayHooks }) {
  let s = 77;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const conc = pbr('concrete_wall_008', { scale: 3, tint: 0xd9d6d0, bright: 1.1, glow: 0xffc890 }); // lit from inside after dark
  const steel = pbr('painted_steel', { scale: 2, tint: 0x2a2e33, metal: 0.5 });
  const wood = pbr('brown_planks_08', { scale: 1.5, tint: 0xc09070 });
  const turf = new THREE.MeshStandardMaterial({ color: 0x2f6a3a, roughness: 0.95 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fb2bd, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.22, depthWrite: false });
  const led = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8fd3ff).multiplyScalar(2.2) });
  const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd8a8).multiplyScalar(1.6) });
  const sofa = new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.8 });
  const frost = new THREE.MeshStandardMaterial({ color: 0xdfe8ee, roughness: 0.4, transparent: true, opacity: 0.35, depthWrite: false });
  const roofM = pbr('concrete_wall_008', { scale: 4, tint: 0x9a9894 });
  const parts = [];

  // ── the hitting building: three levels of bays, x along the line of bays, behind the tee ──
  const BAYS = 15, BW = 4.2, LEVELS = [0, 4.4, 8.8], DEPTH = 9;
  const curveZ = (x) => 0.004 * x * x; // the line of bays curves round the range
  for (const [li, y] of LEVELS.entries()) {
    for (let b = -BAYS; b <= BAYS; b++) {
      const x = b * BW, z = curveZ(x);
      const ground = li === 0;
      if (!ground || Math.abs(b) > 0) {
        // the bay's floor (the ground level has the tee mat), its turf hitting strip
        if (!ground) parts.push([conc, box(BW, 0.35, DEPTH, x, y - 0.35, z + DEPTH / 2 - 0.6)]);
        parts.push([turf, box(1.6, 0.04, 1.6, x, y, z + 0.6)]);
        // the lounge at the back of the bay: a sofa and a table
        parts.push([sofa, box(2.6, 0.45, 0.9, x, y, z + DEPTH - 1.6), box(2.6, 0.5, 0.25, x, y + 0.45, z + DEPTH - 1.2)]);
        parts.push([wood, box(1.2, 0.05, 0.7, x, y + 0.45, z + DEPTH - 3), box(0.1, 0.45, 0.1, x, y, z + DEPTH - 3)]);
      }
      // dividers between bays, a glass rail along the open edge of the upper decks
      // a frosted-glass partition from the back of the mat to the wall (not alongside the golfer)
      parts.push([frost, box(0.06, 2.2, DEPTH - 2.2, x + BW / 2, y, z + DEPTH / 2 + 0.5)], [steel, box(0.1, 0.08, DEPTH - 2.2, x + BW / 2, y + 2.2, z + DEPTH / 2 + 0.5)]);
      if (!ground) parts.push([glass, box(BW, 1.05, 0.04, x, y, z - 0.6)], [steel, box(BW, 0.06, 0.08, x, y + 1.05, z - 0.6)]);
      // the ceiling over each bay with its LED line, and the bay number lit on the fascia
      parts.push([conc, box(BW, 0.35, DEPTH + 0.6, x, y + 4.05, z + DEPTH / 2 - 0.9)]);
      parts.push([led, box(BW * 0.9, 0.05, 0.08, x, y + 4.0, z - 0.7)]);
      parts.push([warm, box(1.5, 0.04, 0.6, x, y + 4.0, z + 2.6)]);
      // the back wall of the bay, and over the top deck the roof with its parapet
      parts.push([conc, box(BW + 0.05, 4.4, 0.4, x, y, z + DEPTH - 0.2)]);
      if (li === LEVELS.length - 1) parts.push([roofM, box(BW + 0.05, 0.6, DEPTH + 2, x, y + 4.4, z + DEPTH / 2 - 0.6), box(BW + 0.05, 0.9, 0.2, x, y + 5.0, z - 1.5)]);
    }
  }
  // the stair and lift towers at the ends
  for (const sx of [-1, 1]) parts.push([conc, box(6, 16, DEPTH + 2, sx * ((BAYS + 0.5) * BW + 3), 0, curveZ(BAYS * BW) + DEPTH / 2 - 0.6)]);
  const bld = new THREE.Group();
  batch(bld, parts);
  // screens in the bays: the scoring game on them
  const screenTex = canvasTex(256, 144, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0d1b2a'); g.addColorStop(1, '#16324a');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const cols = ['#ff5a5f', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff'];
    cols.forEach((col, i) => { c.strokeStyle = col; c.lineWidth = 6; c.beginPath(); c.ellipse(40 + i * 44, 92 - (i % 2) * 18, 14, 7, 0, 0, 6.29); c.stroke(); });
    c.fillStyle = '#e8f1f8'; c.font = '700 26px sans-serif'; c.fillText('BAY SCORE  240', 14, 34);
  });
  const screenM = new THREE.MeshBasicMaterial({ map: screenTex, color: new THREE.Color(1.4, 1.4, 1.4) });
  const sg = [];
  for (const y of LEVELS) for (let b = -BAYS; b <= BAYS; b++) { const x = b * BW; sg.push(new THREE.PlaneGeometry(1.4, 0.8).rotateY(Math.PI).translate(x - 1.2, y + 3.2, curveZ(x) + 2.2)); }
  bld.add(new THREE.Mesh(mergeGeometries(sg), screenM));
  // the name on the roof, facing the range
  const nameTex = canvasTex(1024, 192, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#f4f1ea'; c.font = '600 120px Jost, "Helvetica Neue", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('F A I R W A Y', w / 2, h / 2 + 6);
  });
  const nameM = new THREE.MeshBasicMaterial({ map: nameTex, transparent: true, color: new THREE.Color(1.3, 1.3, 1.3) });
  const name = new THREE.Mesh(new THREE.PlaneGeometry(26, 4.9), nameM);
  name.position.set(0, 16.2, curveZ(0) - 0.4);
  name.rotation.y = Math.PI;
  bld.add(name);
  group.add(bld);

  // ── the ball dispenser at the front right of the player's mat: a cabinet, a hopper of
  // balls behind glass, and a chute that rolls each ball out onto the tee ──
  const disp = new THREE.Group();
  {
    const body = pbr('painted_steel', { scale: 1, tint: 0x30353b, metal: 0.4 });
    const D = [];
    D.push([body, box(0.42, 0.95, 0.42, 0, 0, 0)], [body, box(0.48, 0.06, 0.48, 0, 0.95, 0)]);
    D.push([glass, box(0.34, 0.3, 0.34, 0, 1.01, 0)]);
    D.push([led, box(0.3, 0.03, 0.02, 0, 0.82, -0.215)]);
    // the chute: a shallow trough from the cabinet's mouth down to the mat
    const ch = new THREE.CylinderGeometry(0.05, 0.05, 0.62, 10, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateY(0.5);
    ch.rotateX(-0.75);
    D.push([steel, ch.translate(-0.24, 0.42, -0.3)]);
    batch(disp, D);
    // the hopper's balls
    const hb = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.0214, 1), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.35 }), 40);
    for (let i = 0; i < 40; i++) hb.setMatrixAt(i, new THREE.Matrix4().makeTranslation((rnd() - 0.5) * 0.28, 1.04 + rnd() * 0.18, (rnd() - 0.5) * 0.28));
    disp.add(hb);
    disp.position.set(1.15, 0, 0.55);
    group.add(disp);
  }
  // a ball out of the dispenser: down the chute, a little roll across the mat, onto the tee
  const deliver = (ball, to, done) => {
    const P = [new THREE.Vector3(1.15, 0.92, 0.55), new THREE.Vector3(0.95, 0.62, 0.32), new THREE.Vector3(0.72, 0.1, 0.08), new THREE.Vector3(0.3, 0.035, 0.02), new THREE.Vector3(to.x, to.y, to.z)];
    const curve = new THREE.CatmullRomCurve3(P);
    let t = 0;
    const f = (tt, dt) => {
      t += dt / 1.25;
      const k = Math.min(1, t), e = 1 - Math.pow(1 - k, 2.2);
      const p = curve.getPointAt(e);
      ball.mesh.position.copy(p);
      ball.mesh.rotation.z -= dt * 14 * (1 - k);
      if (k >= 1) { updaters.splice(updaters.indexOf(f), 1); ball.mesh.position.set(to.x, to.y, to.z); done?.(); }
    };
    updaters.push(f);
  };

  // ── netting down both sides of the range ──
  const netTex = canvasTex(64, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.strokeStyle = 'rgba(30,34,36,0.9)'; c.lineWidth = 1.2; for (let i = 0; i <= w; i += 8) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, h); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(w, i); c.stroke(); } });
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping; netTex.repeat.set(70, 12);
  const netM = new THREE.MeshStandardMaterial({ map: netTex, transparent: true, opacity: 0.55, alphaTest: 0.05, side: THREE.DoubleSide, depthWrite: false, roughness: 0.9 });
  const poles = [];
  const NX = LAYOUT.fairwayHalfWidth + 52, NH = 38;
  for (const side of [-1, 1]) {
    const pts = [];
    for (let z = 4; z > LAYOUT.plateauEnd + 10; z -= 42) pts.push(z);
    for (const z of pts) poles.push(box(0.5, NH, 0.5, side * NX, groundHeight(side * NX, z) - 0.5, z));
    const z0 = pts[0], z1 = pts[pts.length - 1];
    const net = new THREE.Mesh(new THREE.PlaneGeometry(z0 - z1, NH - 2).rotateY(Math.PI / 2).translate(side * NX, NH / 2 + 0.5, (z0 + z1) / 2), netM);
    group.add(net);
  }
  const pm = new THREE.Mesh(mergeGeometries(poles), steel); pm.castShadow = true; group.add(pm);

  // ── target rings round each green: alternating colour and white, glowing at night ──
  const ringMats = [];
  for (const g of GREENS) {
    const y = groundHeight(g.x, g.z) + 0.03;
    const col = new THREE.Color(g.color);
    const rings = [[0.22, 0.32, col], [0.48, 0.56, 0xffffff], [0.7, 0.8, col], [0.93, 1.0, 0xffffff]];
    for (const [a, b2, c] of rings) {
      const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.1, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      ringMats.push(m);
      const r = new THREE.Mesh(new THREE.RingGeometry(g.r * a, g.r * b2, 64).rotateX(-Math.PI / 2), m);
      r.position.set(g.x, y, g.z);
      r.receiveShadow = true;
      group.add(r);
    }
  }

  // ── range balls scattered over the outfield, thickest in the landing zone ──
  const NB = Math.round(4500 * (quality.trees ?? 1));
  const balls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.0214, 1), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.35 }), NB);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  for (let i = 0; i < NB; i++) {
    const z = -18 - Math.pow(rnd(), 0.8) * 250, x = (rnd() - 0.5) * 2 * (LAYOUT.fairwayHalfWidth + 30) * Math.pow(rnd(), 0.35);
    balls.setMatrixAt(i, m4.compose(v.set(x, groundHeight(x, z) + 0.02, z), q, one));
  }
  balls.receiveShadow = true;
  group.add(balls);

  // ── other golfers' shots out of the bays ──
  const flying = [];
  const flyM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.15 });
  const flyGeo = new THREE.SphereGeometry(0.07, 10, 8); // drawn a touch large so a far ball reads
  const trailM = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 });
  let nextShot = 1;
  updaters.push((t, dt) => {
    nextShot -= dt;
    if (nextShot <= 0 && flying.length < 14) {
      nextShot = 0.6 + rnd() * 2.2;
      let b; do { b = Math.round((rnd() - 0.5) * 2 * BAYS); } while (b === 0);
      const x = b * BW, y = LEVELS[Math.floor(rnd() * 3)] + 0.05, z = curveZ(x) + 0.6;
      const sp = 28 + rnd() * 40, la = (8 + rnd() * 14) * Math.PI / 180, aim = (rnd() - 0.5) * 0.25 - x * 0.002;
      const m = new THREE.Mesh(flyGeo, flyM);
      m.position.set(x, y, z);
      group.add(m);
      // a short tracer behind it so a ball from another bay reads from the mat
      const tg = new THREE.BufferGeometry(); const tp = new Float32Array(30 * 3); for (let k = 0; k < 30; k++) tp.set([x, y, z], k * 3);
      tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
      const tl = new THREE.Line(tg, trailM); tl.frustumCulled = false; group.add(tl);
      flying.push({ tl, tp, m, vx: Math.sin(aim) * Math.cos(la) * sp, vy: Math.sin(la) * sp, vz: -Math.cos(aim) * Math.cos(la) * sp, curve: (rnd() - 0.5) * 6, t: 0 });
    }
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      f.t += dt;
      // drag and lift, crudely: enough for a believable arc from the deck
      const sp = Math.hypot(f.vx, f.vy, f.vz);
      f.vx += (-0.012 * sp * f.vx + f.curve * 0.08) * dt; f.vz += -0.012 * sp * f.vz * dt; f.vy += (-9.8 + 0.006 * sp * sp * 0.35 - 0.012 * sp * f.vy) * dt;
      f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; f.m.position.z += f.vz * dt;
      f.tp.copyWithin(3, 0, f.tp.length - 3); f.tp.set([f.m.position.x, f.m.position.y, f.m.position.z], 0);
      f.tl.geometry.attributes.position.needsUpdate = true;
      const gy = groundHeight(f.m.position.x, f.m.position.z);
      if (f.m.position.y < gy + 0.03 || f.t > 12) { group.remove(f.m); group.remove(f.tl); f.tl.geometry.dispose(); flying.splice(i, 1); }
    }
  });

  // ── the ball picker: a little tractor in a wire cage, the picker gang behind ──
  const picker = new THREE.Group();
  const red = pbr('painted_steel', { scale: 1, tint: 0xb83a2e, metal: 0.3 }), cage = new THREE.MeshStandardMaterial({ map: netTex.clone(), transparent: true, alphaTest: 0.05, side: THREE.DoubleSide });
  cage.map.repeat.set(4, 3);
  picker.add(new THREE.Mesh(box(1.3, 0.7, 2.2, 0, 0.35, 0), red));
  for (const [x, z, r] of [[-0.7, -0.7, 0.35], [0.7, -0.7, 0.35], [-0.7, 0.75, 0.45], [0.7, 0.75, 0.45]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.25, 14).rotateZ(Math.PI / 2), steel); w.position.set(x, r, z); picker.add(w); }
  picker.add(new THREE.Mesh(box(1.5, 1.5, 1.6, 0, 1.05, 0.3), cage));
  const gang = new THREE.Mesh(box(3.6, 0.35, 0.8, 0, 0, 2.2), steel); picker.add(gang);
  picker.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  group.add(picker);
  const lane = { x: -40, dir: 1 };
  let pz = -70;
  updaters.push((t, dt) => {
    // up and down the range in passes, turning at the ends
    pz += lane.dir * dt * 2.4;
    if (pz < -230 || pz > -60) { lane.dir *= -1; lane.x += 7; if (lane.x > 40) lane.x = -40; pz = Math.max(-230, Math.min(-60, pz)); }
    picker.position.set(lane.x, groundHeight(lane.x, pz), pz);
    picker.rotation.y = lane.dir > 0 ? Math.PI : 0;
  });

  // ── people in the bays: groups at each, someone at the mat, friends on the sofa ──
  const addPeople = () => {
    const spots = [];
    for (const y of LEVELS) for (let b = -BAYS; b <= BAYS; b++) {
      if (y === 0 && Math.abs(b) < 1) continue;
      if (rnd() < 0.18) continue;
      const x = b * BW, z = curveZ(x);
      spots.push([x - 0.5, y, z + 1.2, Math.PI + (rnd() - 0.5) * 0.4]); // at the mat, facing the range
      const n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) spots.push([x + (rnd() - 0.5) * 2.6, y, z + 3.5 + rnd() * 3, rnd() * 6.28]);
    }
    const crowd = crowdAt(spots, rnd);
    if (crowd) group.add(crowd);
    return !!crowd;
  };
  preloadCourseModels('range').then(() => addPeople());

  // day and night: the LEDs, screens and target rings come up after dark
  dayHooks.push((d) => {
    const n = 1 - d;
    led.color.setRGB(0.56, 0.83, 1).multiplyScalar(0.8 + 2.2 * n);
    warm.color.setRGB(1, 0.85, 0.66).multiplyScalar(0.6 + 1.6 * n);
    nameM.color.setScalar(1 + 0.8 * n);
    for (const m of ringMats) m.emissiveIntensity = 0.06 + 0.42 * n;
    conc.emissiveIntensity = 0.32 * n;
  });
  return { building: bld, deliver };
}
