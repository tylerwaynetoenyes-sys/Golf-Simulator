// A course in use, on every hole: the things that make a hole read as a golf
// course rather than a model of one.
//   club  a concrete cart path down one side of the hole and round the green,
//         carts parked by the tee and by the green, the next group waiting on
//         the tee, a few spectators by the green, and the tee furniture (a hole
//         sign with the hole drawn on it, a ball washer, a bench)
//   park  the people only (a hole laid in a city park keeps the park's paths)
//   none  nothing modern (Cahokia, the Oregon Trail keep their own life)
// The cart path runs on the side with fewer hazards, a little outside the
// rough's first cut, and stays off sand, water and the green.
import * as THREE from 'three';
import { pbr } from '../scene/pbr.js';
import { model } from '../scene/models.js';
import { crowdAt } from '../scene/crowd.js';

function signTexture(hole, yards) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = '#1d2a22'; g.fillRect(0, 0, 256, 320);
  g.strokeStyle = 'rgba(233,201,122,0.9)'; g.lineWidth = 4; g.strokeRect(8, 8, 240, 304);
  g.fillStyle = '#f2efe6'; g.textAlign = 'center';
  g.font = '600 74px Jost, "Helvetica Neue", sans-serif'; g.fillText(String(hole.n), 128, 86);
  g.font = '500 22px Jost, "Helvetica Neue", sans-serif'; g.fillText(`PAR ${hole.par} · ${yards} YD`, 128, 120);
  // the hole drawn on the sign: the line from tee to green
  const pts = hole.line || [];
  if (pts.length > 1) {
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (const [x, z] of pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
    const k = Math.min(150 / Math.max(1, maxx - minx), 160 / Math.max(1, maxz - minz));
    // the green (smallest z, the far end) at the top, the tee at the bottom
    const P = ([x, z]) => [128 + (x - (minx + maxx) / 2) * k, 140 + (z - minz) * k];
    g.strokeStyle = '#7fbf6a'; g.lineWidth = 16; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); pts.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    const [gx, gy] = P(pts[pts.length - 1]);
    g.fillStyle = '#a8e08c'; g.beginPath(); g.arc(gx, gy, 12, 0, 6.29); g.fill();
    g.fillStyle = '#e9c97a'; g.fillRect(gx - 1, gy - 22, 2, 22);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function courseLife(T, hole, { style = 'club', rnd = Math.random } = {}) {
  const group = new THREE.Group();
  if (style === 'none') return group;
  const spots = [];
  const at = (s, d) => { const p = T.pointAt(Math.max(0, Math.min(T.length, s))); return [p.x + p.rx * d, p.z + p.rz * d, p]; };
  const yGround = (x, z) => T.meshHeight(x, z);
  const surf = (x, z) => T.terrain(x, z).surface;
  // the side with fewer hazards (bunkers and ponds) gets the path
  let score = 0;
  for (const b of [...(T.bunkers || []), ...(T.ponds || [])]) score += Math.sign(T.project(b.x, b.z).d || 0);
  const side = score > 0 ? -1 : 1;

  if (style === 'club') {
    // ── the cart path: a ribbon from behind the tee, along the hole, round the green ──
    const half = 1.2, pts = [];
    for (let s = -12; s <= T.length + T.greenR + 14; s += 3) {
      const near = Math.max(0, s - (T.length - T.greenR - 20)) / (T.greenR + 34); // ease out round the green
      const base = s > T.fwStart && s < T.length && T.fwHalf > 0 ? T.fairwayHalf(s) : Math.max(T.fwHalf || 0, 12);
      const d = side * (Math.max(base, 12) + 14 + near * (T.greenR + 8));
      pts.push(at(s, d));
    }
    const pos = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const ok = (x, z) => { const sf = surf(x, z); return sf !== 'water' && sf !== 'sand' && sf !== 'green' && sf !== 'tee'; };
      if (!ok(ax, az) || !ok(bx, bz)) continue;
      const L = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / L * half, nz = (bx - ax) / L * half;
      const Y = (x, z) => yGround(x, z) + 0.05;
      const q = [[ax - nx, az - nz], [bx - nx, bz - nz], [bx + nx, bz + nz], [ax + nx, az + nz]];
      for (const k of [0, 1, 2, 0, 2, 3]) pos.push(q[k][0], Y(q[k][0], q[k][1]), q[k][1]);
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      const m = new THREE.Mesh(g, pbr('brushed_concrete', { scale: 3, tint: 0xd9d4c8, offset: -2, side: THREE.DoubleSide }));
      m.receiveShadow = true;
      group.add(m);
    }
    // ── carts: two by the tee, one by the green, parked along the path ──
    const cart = (s, dOff = 0) => {
      const M = model('golfCart');
      if (!M) return;
      const [x, z, p] = at(s, side * (Math.max(T.fwHalf || 0, 12) + 14) + dOff);
      if (surf(x, z) === 'water') return;
      M.position.set(x, yGround(x, z), z);
      // the model's length runs along +x; line it up with the hole, facing on toward the green
      M.rotation.y = Math.atan2(-p.dz, p.dx) + (rnd() - 0.5) * 0.15;
      M.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      group.add(M);
    };
    cart(-6); cart(-6, side * 2.0);
    if (T.length > 120) cart(T.length - T.greenR - 6);
    // ── tee furniture: the hole sign, a ball washer, a bench ──
    {
      const [x, z, p] = at(-3, -side * 6.5);
      const yd = Math.round(T.length / 0.9144);
      const signM = new THREE.MeshStandardMaterial({ map: signTexture(hole, yd), roughness: 0.6 });
      const wood = pbr('brown_planks_08', { scale: 0.8, tint: 0x8a6a4a });
      const sg = new THREE.Group();
      sg.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.14).translate(0, 0.55, 0), wood));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.78), signM); face.position.set(0, 1.25, 0.08); sg.add(face);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.86, 0.06).translate(0, 1.25, 0.03), wood); sg.add(back);
      // the ball washer: a green cast housing on a post, a towel over it
      const green = new THREE.MeshStandardMaterial({ color: 0x2d5a3a, roughness: 0.5, metalness: 0.3 });
      sg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8).translate(1.1, 0.45, 0), green));
      sg.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.2).translate(1.1, 1.0, 0), green));
      sg.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.16).translate(1.19, 0.95, 0), new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.9 })));
      // a slatted bench
      for (let k = 0; k < 4; k++) sg.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.09).translate(-1.4, 0.45, -0.15 + k * 0.1), wood));
      for (const bx of [-2.0, -0.8]) sg.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4).translate(bx, 0.22, 0), green));
      sg.position.set(x, yGround(x, z), z);
      sg.rotation.y = Math.atan2(p.dx, p.dz) + Math.PI; // the sign faces back up the tee
      sg.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      group.add(sg);
    }
  }

  // ── the next group, waiting behind the tee box, watching down the hole ──
  {
    const n = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const [x, z, p] = at(-9 - rnd() * 3, -side * (2.5 + i * 1.3));
      if (surf(x, z) === 'water') continue;
      spots.push([x, yGround(x, z), z, Math.atan2(p.dx, p.dz) + (rnd() - 0.5) * 0.5]);
    }
  }
  // ── a few spectators off the green's edge, on the path side ──
  if (T.green) {
    const n = 3 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) {
      const a = (rnd() - 0.5) * 1.6 + (side > 0 ? 0 : Math.PI);
      const p = T.pointAt(T.length);
      const dirx = p.rx * Math.cos(a) + p.dx * Math.sin(a) * 0.6, dirz = p.rz * Math.cos(a) + p.dz * Math.sin(a) * 0.6;
      const r = T.greenR + 7 + rnd() * 5;
      const x = T.green.x + dirx * r, z = T.green.z + dirz * r;
      const sf = surf(x, z);
      if (sf === 'water' || sf === 'sand' || sf === 'green') continue;
      spots.push([x, yGround(x, z), z, Math.atan2(T.green.x - x, T.green.z - z) + (rnd() - 0.5) * 0.4]);
    }
  }
  const crowd = crowdAt(spots, rnd);
  if (crowd) group.add(crowd);
  return group;
}
