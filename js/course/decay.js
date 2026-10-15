// Urban decay for the East St. Louis course: what the riverfront rail and
// warehouse district looks like now. Everything stands beyond the playing
// corridor (out by the boundary and past it), so it frames the holes without
// changing how they play:
//   chain-link fencing with razor wire along the out-of-bounds lines, gaps
//   and sagging panels; leaning creosote utility poles with sagging wires;
//   rusted shipping containers; derelict brick warehouses with broken and
//   boarded windows and graffiti; cracked asphalt pads (Poly Haven's
//   "Road Damaged" scan) with heaps of broken concrete (a scanned model);
//   tall weeds pushing through (the course's own grass tufts, gone to seed).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTex, seeded } from './lm/kit.js';
import { model } from '../scene/models.js';
import { tuftGeometry, grassMaterial } from './grass.js';

let shared = null;
function materials() {
  if (shared) return shared;
  const chain = canvasTex(64, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = 'rgba(205,208,210,1)'; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(w, h); c.moveTo(w, 0); c.lineTo(0, h); c.stroke();
  }, [1, 1]);
  chain.wrapS = chain.wrapT = THREE.RepeatWrapping;
  chain.colorSpace = THREE.NoColorSpace;
  const brick = canvasTex(256, 256, (c, w, h) => {
    const r = seeded(9);
    c.fillStyle = '#5a3227'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? -8 : 0; x < w; x += 16) {
      const v = 0.75 + r() * 0.35;
      c.fillStyle = `rgb(${Math.round(128 * v)},${Math.round(62 * v)},${Math.round(46 * v)})`;
      c.fillRect(x + 1, y + 1, 14, 6);
    }
    // soot streaks and efflorescence
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(20,16,14,${r() * 0.25})`; c.fillRect(r() * w, r() * h * 0.4, 2 + r() * 6, h * (0.2 + r() * 0.6)); }
    for (let i = 0; i < 20; i++) { c.fillStyle = `rgba(230,225,210,${r() * 0.18})`; c.fillRect(r() * w, h * (0.5 + r() * 0.5), 4 + r() * 20, 2 + r() * 10); }
  }, [1, 1]);
  brick.wrapS = brick.wrapT = THREE.RepeatWrapping;
  // windows: broken glass, dark holes and plywood boards, a band of graffiti at street level
  const facade = canvasTex(256, 256, (c, w, h) => {
    const r = seeded(17);
    c.drawImage(brick.image, 0, 0);
    for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) {
      const x = 12 + i * 41, y = 18 + row * 62, ww = 26, hh = 38;
      const k = r();
      c.fillStyle = k < 0.35 ? '#0d0d0f' : k < 0.6 ? '#9a8a66' : '#2c3238';
      c.fillRect(x, y, ww, hh);
      if (k >= 0.6) { c.strokeStyle = '#10151a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + r() * ww, y); c.lineTo(x + r() * ww, y + hh); c.stroke(); }
      c.fillStyle = '#3a3330'; c.fillRect(x - 2, y + hh, ww + 4, 3);
    }
    const tags = ['#d23c8a', '#2fa3d8', '#f2c230', '#46c26a', '#f1f1ee'];
    c.lineWidth = 5; c.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      c.strokeStyle = tags[Math.floor(r() * tags.length)];
      c.beginPath();
      let x = r() * w, y = h - 10 - r() * 40;
      c.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += 6 + r() * 14; y += (r() - 0.5) * 22; c.quadraticCurveTo(x - 6, y - 14 * r(), x, y); }
      c.stroke();
    }
  }, [1, 1]);
  const rust = canvasTex(128, 128, (c, w, h) => {
    const r = seeded(23);
    c.fillStyle = '#7a3f22'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x, 0, 2, h); }
    for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(${150 + r() * 60},${70 + r() * 40},${30 + r() * 20},${0.2 + r() * 0.4})`; c.fillRect(r() * w, r() * h, 2 + r() * 10, 2 + r() * 16); }
  }, [1, 1]);
  // a 2.2 m scan of broken, patched asphalt (CC0) as luminance, the grey
  // coming from the material; one repeat per 4.4 m
  const asphalt = typeof document !== 'undefined'
    ? new THREE.TextureLoader().load(new URL('../../assets/textures/asphalt_damaged.jpg', import.meta.url).href)
    : new THREE.Texture();
  asphalt.colorSpace = THREE.SRGBColorSpace;
  asphalt.anisotropy = 4;
  asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
  shared = {
    chain: new THREE.MeshStandardMaterial({ color: 0xb8bcbf, alphaMap: chain, alphaTest: 0.35, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8f9396, metalness: 0.6, roughness: 0.55 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x3b2c22, roughness: 0.95 }),
    wire: new THREE.LineBasicMaterial({ color: 0x1a1a1a }),
    brick: new THREE.MeshStandardMaterial({ map: brick, roughness: 0.95 }),
    facade: new THREE.MeshStandardMaterial({ map: facade, roughness: 0.9 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x2b2a28, roughness: 1 }),
    rust: new THREE.MeshStandardMaterial({ map: rust, roughness: 0.85, metalness: 0.3 }),
    containerCols: [0x2f4f6f, 0x6f2a24, 0x3e5a3a, 0x8a6a2a, 0x555555].map((c) => new THREE.MeshStandardMaterial({ color: c, map: rust, roughness: 0.8, metalness: 0.35 })),
    asphalt: new THREE.MeshStandardMaterial({ map: asphalt, color: new THREE.Color(2.3, 2.25, 2.15), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }),
    rubble: new THREE.MeshStandardMaterial({ color: 0x7a706a, roughness: 1, flatShading: true }),
    weedGeo: Object.assign(tuftGeometry(9, 31), { userData: { shared: true } }),
    weed: grassMaterial(0x9c9a55), // dry, gone to seed
  };
  return shared;
}

/**
 * Build the decay around one hole. `ground(x, z)` gives the drawn ground
 * height, `clear(x, z)` is true where nothing may stand (play, landmarks).
 */
export function buildDecay(T, rand, ground, clear) {
  const M = materials();
  const g = new THREE.Group();
  const corridor = Math.max(T.fwHalf, 14);
  const off = T.oobLateral - 6; // just inside the white stakes

  // ── chain-link fence along both boundaries, with gaps and sagging panels ──
  const panels = [], posts = [], wires = [];
  for (const side of [-1, 1]) {
    for (let s = -20; s < T.length + 60; s += 3) {
      if (rand() < 0.07) { s += 6 + rand() * 12; continue; } // a gap where it's been cut or pushed over
      const a = T.pointAt(s), b = T.pointAt(s + 3);
      const ax = a.x + a.rx * off * side, az = a.z + a.rz * off * side;
      const bx = b.x + b.rx * off * side, bz = b.z + b.rz * off * side;
      if (clear(ax, az) || clear(bx, bz)) continue;
      const ya = ground(ax, az), yb = ground(bx, bz);
      const sag = rand() < 0.12 ? 0.5 + rand() * 0.6 : 0; // a panel slumping
      const pg = new THREE.PlaneGeometry(1, 1);
      const p = pg.attributes.position;
      const pts = [[ax, ya, az], [bx, yb, bz]];
      // plane corners: (-0.5,0.5),(0.5,0.5),(-0.5,-0.5),(0.5,-0.5)
      p.setXYZ(0, ax, ya + 2.3 - sag, az); p.setXYZ(1, bx, yb + 2.3 - sag * 0.6, bz);
      p.setXYZ(2, ax, ya, az); p.setXYZ(3, bx, yb, bz);
      const uv = pg.attributes.uv;
      uv.setXY(0, 0, 9); uv.setXY(1, 12, 9); uv.setXY(2, 0, 0); uv.setXY(3, 12, 0);
      pg.computeVertexNormals();
      panels.push(pg);
      posts.push(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6).translate(ax, ya + 1.3, az));
      // razor wire: a coil along the top
      for (let k = 0; k <= 6; k++) {
        const u = k / 6, ang = u * Math.PI * 4 + s;
        wires.push(new THREE.Vector3(ax + (bx - ax) * u + Math.cos(ang) * 0.18 * a.rx, (ya + (yb - ya) * u) + 2.55 - sag + Math.sin(ang) * 0.18, az + (bz - az) * u + Math.cos(ang) * 0.18 * a.rz));
      }
      void pts;
    }
  }
  if (panels.length) g.add(new THREE.Mesh(mergeGeometries(panels), M.chain));
  if (posts.length) g.add(new THREE.Mesh(mergeGeometries(posts), M.steel));
  if (wires.length > 1) {
    const lg = new THREE.BufferGeometry().setFromPoints(wires);
    g.add(new THREE.Line(lg, M.wire));
  }

  // ── utility poles with sagging lines, on one side, leaning a little ──
  {
    const side = rand() < 0.5 ? -1 : 1;
    const d = off + 14;
    const tops = [];
    const poleGeos = [];
    for (let s = -10; s < T.length + 40; s += 42 + rand() * 8) {
      const p = T.pointAt(s);
      const x = p.x + p.rx * d * side, z = p.z + p.rz * d * side;
      if (clear(x, z)) continue;
      const y = ground(x, z);
      const lean = (rand() - 0.5) * 0.08;
      const pole = new THREE.CylinderGeometry(0.14, 0.18, 11, 7).translate(0, 5.5, 0).rotateZ(lean).translate(x, y, z);
      const arm = new THREE.BoxGeometry(2.2, 0.14, 0.14).translate(0, 10.2, 0).rotateY(Math.atan2(p.dx, p.dz)).rotateZ(lean).translate(x, y, z);
      poleGeos.push(pole, arm);
      tops.push([x, y + 10.3, z]);
    }
    if (poleGeos.length) g.add(new THREE.Mesh(mergeGeometries(poleGeos.map((q) => q.index ? q.toNonIndexed() : q).map((q) => { q.deleteAttribute('uv'); return q; })), M.wood));
    for (let i = 0; i < tops.length - 1; i++) {
      for (const o of [-0.9, 0, 0.9]) {
        const [x0, y0, z0] = tops[i], [x1, y1, z1] = tops[i + 1];
        const pts = [];
        for (let k = 0; k <= 10; k++) { const u = k / 10; pts.push(new THREE.Vector3(x0 + (x1 - x0) * u + o * 0.3, y0 + (y1 - y0) * u - 1.4 * 4 * u * (1 - u), z0 + (z1 - z0) * u)); }
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), M.wire));
      }
    }
  }

  // ── beyond the fence: derelict warehouses, containers, cracked lots ──
  const placeOut = (minD, maxD) => {
    for (let k = 0; k < 12; k++) {
      const side = rand() < 0.5 ? -1 : 1;
      const s = -30 + rand() * (T.length + 60);
      const p = T.pointAt(s);
      const d = minD + rand() * (maxD - minD);
      const x = p.x + p.rx * d * side, z = p.z + p.rz * d * side;
      if (!clear(x, z)) return { x, z, y: ground(x, z), rot: Math.atan2(p.dx, p.dz) + (rand() - 0.5) * 0.3 };
    }
    return null;
  };
  // warehouses (1–2): brick boxes with a parapet and a roof
  for (let i = 0; i < 1 + (rand() < 0.6 ? 1 : 0); i++) {
    const at = placeOut(T.oobLateral + 30, T.oobLateral + 90);
    if (!at) continue;
    const w = 40 + rand() * 30, d = 22 + rand() * 14, h = 9 + rand() * 7;
    const hg = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [M.facade, M.facade, M.roof, M.roof, M.facade, M.facade]);
    body.position.y = h / 2;
    const uv = body.geometry.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w / 30), uv.getY(k) * (h / 12));
    hg.add(body);
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 1, d + 0.6), M.brick);
    parapet.position.y = h + 0.3;
    hg.add(parapet);
    // a collapsed corner of the roof
    const hole = new THREE.Mesh(new THREE.BoxGeometry(w * 0.25, 0.4, d * 0.3), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
    hole.position.set(w * 0.3, h + 0.05, -d * 0.2);
    hg.add(hole);
    hg.position.set(at.x, at.y - 0.3, at.z);
    hg.rotation.y = at.rot;
    hg.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.add(hg);
  }
  // shipping containers, some stacked, rusting
  for (let i = 0; i < 4 + Math.floor(rand() * 4); i++) {
    const at = placeOut(T.oobLateral + 12, T.oobLateral + 70);
    if (!at) continue;
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(2.44, 2.59, rand() < 0.5 ? 6.06 : 12.19), M.containerCols[Math.floor(rand() * M.containerCols.length)]);
      c.position.set(at.x + (k === 1 ? 2.6 : 0), at.y + 1.3 + (k === 2 ? 2.59 : 0), at.z);
      c.rotation.y = at.rot + (rand() - 0.5) * 0.15;
      c.castShadow = c.receiveShadow = true;
      g.add(c);
    }
  }
  // cracked asphalt lots with rubble heaps and weeds through the cracks
  const rubbleGeos = [];
  const lots = [];
  // the scan, re-centred on its footprint and set on the ground
  let heap = model('rubble');
  if (heap) {
    const box = new THREE.Box3().setFromObject(heap);
    const c = box.getCenter(new THREE.Vector3());
    heap.position.set(-c.x, -box.min.y, -c.z);
    // the scan's own light is baked in brighter and bluer than the scene's
    heap.traverse((o) => { if (o.isMesh) { o.material.color.setRGB(0.46, 0.44, 0.41); o.material.roughness = 1; o.castShadow = true; } });
    heap = new THREE.Group().add(heap);
  }
  for (let i = 0; i < 5; i++) {
    const at = placeOut(T.oobLateral + 4, T.oobLateral + 60);
    if (!at) continue;
    lots.push(at);
    const w = 24 + rand() * 30, d = 18 + rand() * 24;
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 8, 8).rotateX(-Math.PI / 2), M.asphalt);
    const p = lot.geometry.attributes.position;
    const uv = lot.geometry.attributes.uv;
    const cs = Math.cos(at.rot), sn = Math.sin(at.rot);
    for (let k = 0; k < p.count; k++) {
      const lx = p.getX(k), lz = p.getZ(k);
      const wx = at.x + lx * cs + lz * sn, wz = at.z - lx * sn + lz * cs;
      p.setY(k, ground(wx, wz) + 0.05 - at.y);
      uv.setXY(k, lx / 4.4, lz / 4.4);
    }
    lot.geometry.computeVertexNormals();
    lot.position.set(at.x, at.y, at.z);
    lot.rotation.y = at.rot;
    lot.receiveShadow = true;
    g.add(lot);
    const nHeaps = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < nHeaps; k++) {
      const rx = at.x + (rand() - 0.5) * w * 0.7, rz = at.z + (rand() - 0.5) * d * 0.7;
      if (heap) {
        const h = heap.clone();
        const s = 0.6 + rand() * 0.7;
        h.scale.set(s, s * (0.8 + rand() * 0.4), s);
        h.rotation.y = rand() * 6.28;
        h.position.set(rx, ground(rx, rz) - 0.05, rz);
        g.add(h);
      } else {
        for (let q = 0; q < 3; q++) rubbleGeos.push(new THREE.DodecahedronGeometry(0.4 + rand() * 1.2, 0).scale(1, 0.5, 1).translate(rx + (rand() - 0.5) * 3, ground(rx, rz) + 0.2, rz + (rand() - 0.5) * 3));
      }
    }
    // weeds: clumps along the edges and through the cracks
    const weeds = [];
    for (let k = 0; k < 46; k++) {
      let lx = (rand() - 0.5) * w, lz = (rand() - 0.5) * d;
      if (rand() < 0.55) { if (rand() < 0.5) lx = Math.sign(lx || 1) * (w / 2 - rand() * 1.2); else lz = Math.sign(lz || 1) * (d / 2 - rand() * 1.2); }
      const n = 4 + Math.floor(rand() * 9), R = 0.4 + rand() * 1.1, tall = 0.5 + rand() * 0.9;
      for (let q = 0; q < n; q++) {
        const a = rand() * 6.28, r = Math.sqrt(rand()) * R;
        const px = lx + Math.cos(a) * r, pz = lz + Math.sin(a) * r;
        const wx = at.x + px * cs + pz * sn, wz = at.z - px * sn + pz * cs;
        weeds.push([wx, ground(wx, wz) + 0.03, wz, tall * (0.6 + rand() * 0.6), 0.7 + rand() * 0.6, rand() * 6.28]);
      }
    }
    // one mesh per lot, so lots out of view aren't drawn
    const im = new THREE.InstancedMesh(M.weedGeo, M.weed, weeds.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    weeds.forEach(([x, y, z, h, sp, r], k) => im.setMatrixAt(k, m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, r), new THREE.Vector3(sp, h, sp))));
    im.computeBoundingSphere();
    im.receiveShadow = true;
    g.add(im);
  }
  const strip = (q) => { const n = q.index ? q.toNonIndexed() : q; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; };
  if (rubbleGeos.length) g.add(new THREE.Mesh(mergeGeometries(rubbleGeos.map(strip)), M.rubble));
  void corridor;
  g.userData.lots = lots;
  return g;
}
