// The Delmar Loop, University City: the hole plays down the Loop with the
// street's two sides close on either hand, the way you'd walk it.
//   right of the hole, the south side: Vintage Vinyl (6610), Blueberry Hill
//     (6504) with its neon, the cream terra cotta Tivoli Theatre (6350) with
//     its blade sign and marquee
//   left of the hole, Delmar Boulevard itself, the Loop Trolley on its rails
//     under the wire and cars at the kerbs; across it the north side: the
//     Peacock Diner's neon peacock, the Pinup Bowl, the Pageant (6161) with
//     its marquee and the Moonrise Hotel (6177) with the rotating moon on its
//     roof, and Harry Weber's 8-foot bronze of Chuck Berry (2011) on the
//     sidewalk opposite Blueberry Hill
//   brass Walk of Fame stars in both sidewalks, people along them, and a lit
//     DELMAR LOOP marquee sign at the tee
// The street runs along local Z (+Z back toward the tee); everything is laid
// on the hole's own ground (fit), and the paved area is kept clear of rough
// grass and trees (clear).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat as baseMat, lit, box, cyl, sphere, seeded, canvasTex, tree, SLOT } from './kit.js';
import { pbr } from '../../scene/pbr.js';
import { crowdAt } from '../../scene/crowd.js';
import { carsAt } from '../../scene/cars.js';
import { Batch, bx, place } from './riverfront.js';
import { mergeByMaterial } from '../../scene/merge.js';

// share one material per colour/options so the block stays cheap to draw
const matCache = new Map();
const mat = (color, opts = {}) => {
  const k = `${color}|${JSON.stringify(opts)}`;
  if (!matCache.has(k)) matCache.set(k, baseMat(color, opts));
  return matCache.get(k);
};

// across the Loop, in local x (+x to the golfer's right)
const SOUTH_FRONT = 24; // south-side fronts, right of the hole, facing it
const WALK_S = [18.5, 24]; // their sidewalk
const WALK_H = [-20, -16]; // the sidewalk on the hole's left, along the kerb
const STREET = [-34, -20]; // Delmar Boulevard
const RAIL_X = -27; // the trolley's track
const WALK_N = [-38, -34]; // the north sidewalk
const NORTH_FRONT = -38; // north-side fronts, facing the hole
const Z0 = -150, Z1 = 112; // the block, green end to beyond the tee

function signTexture(text, { bg = '#1a0f0c', fg = '#ff5a4a', glow = '#ff9b8a', w = 512, h = 128, font = 'bold 76px Georgia' } = {}) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = glow; g.shadowBlur = 18;
    g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 4);
    g.shadowBlur = 0;
  });
}
/** A sign face that glows at night (its own map as the emissive). */
function neon(tex, night = 1.6) {
  const m = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6 });
  m.emissiveMap = tex;
  m.userData.night = night;
  return m;
}

// the Loop's brick in its real colours, and the cream terra cotta of the Tivoli
const BRICK = {
  '#8a4a36': ['red_bricks_02', 0xffffff], '#9a5a3c': ['red_bricks_02', 0xffe2cc], '#7d4434': ['red_bricks_02', 0xd8c8c0],
  '#a8705a': ['red_bricks_02', 0xffd8c0], '#6f3d30': ['red_bricks_02', 0xb8a8a0], '#b88a64': ['white_sandstone_bricks', 0xe8c8a0],
  '#8c5640': ['red_bricks_02', 0xf0d8c8], '#7a5444': ['red_bricks_02', 0xc8b8b0], '#7b2f26': ['red_bricks_02', 0xd8b0a8], '#c9b48e': ['white_sandstone_bricks', 0xfff0d8],
  '#5d6a72': ['concrete_wall_008', 0x9aa4ac], '#3a3c44': ['concrete_wall_008', 0x6a6c74],
};
const brickMat = (c) => { const [id, tint] = BRICK[c] || ['red_bricks_02', 0xffffff]; return pbr(id, { scale: 1.6, tint }); };

/**
 * A storefront in its row's frame: the front on x = 0 facing +x, the body
 * behind it, from z0 along +z for `width` metres, standing at y.
 */
export function building(B, M, z0, width, storeys, brick, rnd, y, { awning = null, depth = 18 } = {}) {
  const h = 4.6 + storeys * 3.6;
  const zc = z0 + width / 2, wall = brickMat(brick);
  B.add(wall, bx(depth, h + 1.2, width, -depth / 2, y - 1.2, zc)); // sunk into the slope at its low end
  B.add(M.roof, bx(depth - 0.4, 0.12, width - 0.4, -depth / 2, y + h, zc));
  const cols = Math.max(3, Math.round(width / 3)), bay = width / cols;
  for (let r = 0; r < storeys; r++) for (let c = 0; c < cols; c++) {
    const wy = y + 4.6 + r * 3.6 + 0.9, zz = z0 + (c + 0.5) * bay;
    B.add(rnd() < 0.5 ? M.lamp : M.glass, bx(0.1, 2.0, bay * 0.5, 0.02, wy, zz));
    B.add(M.stone, bx(0.3, 0.14, bay * 0.6, 0.1, wy - 0.14, zz), bx(0.24, 0.3, bay * 0.6, 0.08, wy + 2.0, zz));
  }
  B.add(M.shop, bx(0.12, 2.9, width - 1.6, 0.02, y + 0.7, zc));
  B.add(M.frame, bx(0.2, 0.7, width - 1.4, 0.06, y, zc));
  for (let k = 0; k <= Math.floor(width / 3); k++) B.add(M.frame, bx(0.16, 2.9, 0.12, 0.1, y + 0.7, z0 + 0.8 + k * ((width - 1.6) / Math.floor(width / 3))));
  B.add(M.stone, bx(1.1, 0.7, width + 0.4, 0.3, y + h - 0.2, zc));
  B.add(M.stone, bx(0.8, 0.4, width, 0.2, y + 4.4, zc));
  if (awning) B.add(M.awning(awning), place(new THREE.BoxGeometry(2.4, 0.15, width - 1.6), 1.2, y + 3.9, zc, 0, 1, 1, 1, 0, -0.28));
  return h;
}

/** The storefront surfaces (building()'s M); the lit ones go into glow. */
export function shopMats(glow) {
  const M = {
    stone: pbr('white_sandstone_bricks', { scale: 1.2, tint: 0xf0e4d0 }),
    frame: pbr('metal_plate', { scale: 1, tint: 0x2c2826, metal: 0.4 }),
    roof: pbr('gravel_stones', { scale: 1.5, tint: 0x80807c }),
    glass: mat(0x28313b, { roughness: 0.08, metalness: 0.6 }),
    lamp: lit(0x28313b, 0xffd9a0, { night: 1.1, roughness: 0.08, metalness: 0.6 }),
    shop: lit(0x46525c, 0xffd29a, { night: 1.3, roughness: 0.1, metalness: 0.45 }),
    awning: (c) => mat(c, { roughness: 0.9 }),
  };
  glow.push(M.lamp, M.shop);
  return M;
}

/** The Loop Trolley car: a heritage-style streetcar on 4 ft 8½ in track. */
function trolley() {
  const t = new THREE.Group();
  const cream = pbr('metal_plate', { scale: 1.5, tint: 0xf6ecd0, bright: 1.5, metal: 0.15 });
  const red = pbr('metal_plate', { scale: 1.5, tint: 0xb83a30, metal: 0.15 });
  const roof = pbr('metal_plate', { scale: 1.5, tint: 0x4a4a4c, metal: 0.3 });
  const dark = pbr('metal_plate', { scale: 1, tint: 0x222426, metal: 0.5 });
  const glass = lit(0x253039, 0xffe2b0, { night: 1.0, roughness: 0.06, metalness: 0.5 });
  const B = new Batch();
  B.add(red, bx(2.6, 1.0, 14, 0, 0.5, 0));
  B.add(cream, bx(2.6, 0.3, 14, 0, 1.5, 0), bx(2.6, 0.35, 14, 0, 2.75, 0));
  B.add(glass, bx(2.5, 0.95, 13.8, 0, 1.8, 0));
  for (let k = 0; k <= 10; k++) B.add(cream, bx(2.64, 0.95, 0.16, 0, 1.8, -6.9 + k * 1.38));
  B.add(roof, bx(2.7, 0.2, 14.2, 0, 3.1, 0), bx(1.4, 0.35, 11, 0, 3.3, 0));
  B.add(roof, place(new THREE.CylinderGeometry(1.35, 1.35, 14.2, 16, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).scale(1, 0.25, 1), 0, 3.3, 0));
  for (const z of [-4.6, 4.6]) {
    B.add(dark, bx(2.0, 0.4, 2.4, 0, 0.3, z));
    for (const dz of [-0.75, 0.75]) B.add(dark, place(new THREE.CylinderGeometry(0.33, 0.33, 1.6, 12).rotateZ(Math.PI / 2), 0, 0.33, z + dz));
  }
  B.add(dark, place(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 6).translate(0, 1.4, 0), 0, 3.4, 3.5, 0, 1, 1, 1, -0.65));
  B.build(t);
  return { group: t, glow: [glass] };
}

/** Chuck Berry in bronze: mid-performance, guitar slung low, leaning into a step. */
function chuckBerry(bronze) {
  const f = new THREE.Group();
  const H = 2.44; // 8 ft
  const u = H / 1.8;
  const limb = (r0, r1, len, x, y, z, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1 * u, r0 * u, len * u, 10).translate(0, -len * u / 2, 0), bronze);
    m.position.set(x * u, y * u, z * u);
    m.rotation.set(rx, 0, rz);
    m.castShadow = true;
    f.add(m);
    return m;
  };
  limb(0.075, 0.06, 0.48, -0.1, 0.92, 0.0, 0.5, 0.05);
  limb(0.06, 0.05, 0.46, -0.1, 0.5, 0.22, -0.45, 0.02);
  limb(0.075, 0.06, 0.5, 0.1, 0.92, 0.0, -0.25, -0.05);
  limb(0.06, 0.05, 0.46, 0.1, 0.48, -0.12, 0.15, -0.03);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * u, 0.15 * u, 0.62 * u, 12), bronze);
  torso.position.set(0, 1.25 * u, -0.04 * u);
  torso.rotation.x = -0.18;
  torso.castShadow = true;
  f.add(torso);
  f.add(sphere(0.105 * u, bronze, 0, 1.68 * u, -0.1 * u, 16));
  const hair = sphere(0.09 * u, bronze, 0, 1.76 * u, -0.07 * u, 12);
  hair.scale.set(1, 0.6, 1.3);
  f.add(hair);
  limb(0.05, 0.04, 0.32, -0.22, 1.5, -0.04, -0.6, 0.9);
  limb(0.04, 0.035, 0.3, -0.48, 1.36, 0.14, -1.2, 0.3);
  limb(0.05, 0.04, 0.32, 0.22, 1.5, -0.04, 0.2, -0.3);
  limb(0.04, 0.035, 0.28, 0.3, 1.22, 0.04, -1.1, 0.2);
  const gtr = new THREE.Group();
  const bodyG = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * u, 0.2 * u, 0.06 * u, 20), bronze);
  bodyG.rotation.x = Math.PI / 2;
  bodyG.scale.set(1, 1, 1.25);
  gtr.add(bodyG);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.62 * u, 0.05 * u, 0.03 * u), bronze);
  neck.position.x = -0.42 * u;
  gtr.add(neck);
  gtr.position.set(0.02 * u, 1.12 * u, 0.2 * u);
  gtr.rotation.z = 0.5;
  f.add(gtr);
  return f;
}

/** A strip of paving from x0 to x1 along the block, draped on the ground a little above it. */
function strip(gy, x0, x1, material, lift = 0.1, step = 2) {
  const nz = Math.ceil((Z1 - Z0) / step) + 1, xs = [x0, (x0 + x1) / 2, x1];
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < nz; i++) {
    const z = Z0 + i * step;
    // the strip lies flat across, at the highest of the ground under it, so no turf shows through
    const y = Math.max(...xs.map((x) => gy(x, z)), gy(x0, z - step / 2), gy(x1, z + step / 2)) + lift;
    for (const x of [x0, x1]) { pos.push(x, y, z); uv.push(x / 4, z / 4); }
  }
  for (let i = 0; i < nz - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  return m;
}

export default function build() {
  const g = new THREE.Group();
  g.name = 'delmar';
  const glow = [];
  const treeList = [];
  const live = { trolley: null, moon: null, prof: null };
  const res = {
    group: g, glow, trees: treeList,
    clear: null,
    fit(holder, T) {
      holder.updateMatrix();
      const L = holder.matrix.clone(), Li = L.clone().invert(), w = new THREE.Vector3();
      const gy = (x, z) => { w.set(x, 0, z).applyMatrix4(L); return (T.meshHeight(w.x, w.z) - holder.position.y) / holder.scale.y; };
      // the paved Loop, in world terms, for the course to keep its rough grass and trees off
      res.clear = (wx, wz) => { w.set(wx, 0, wz).applyMatrix4(Li); return w.z > Z0 && w.z < Z1 && ((w.x > WALK_N[0] - 2 && w.x < WALK_H[1] + 0.5) || (w.x > WALK_S[0] - 0.5 && w.x < SOUTH_FRONT + 20)); };
      lay(gy);
    },
    update(t, dt) {
      const tr = live.trolley;
      if (tr) {
        if (tr.wait > 0) tr.wait -= dt;
        else {
          tr.z += tr.dir * dt * 6.5;
          if (tr.z > Z1 - 12 || tr.z < Z0 + 12) { tr.dir = -tr.dir; tr.wait = 6; tr.z = Math.max(Z0 + 12, Math.min(Z1 - 12, tr.z)); }
        }
        tr.group.position.set(RAIL_X, live.prof(tr.z) + 0.1, tr.z);
      }
      if (live.moon) live.moon.rotation.y = t * 0.12;
    },
  };

  function lay(gy) {
    const rnd = seeded(6504);
    // ── the paving: Delmar's asphalt, three sidewalks, the rails and the lane paint ──
    const asphalt = pbr('asphalt_02', { scale: 4, tint: 0x9a9ea4 });
    const walk = pbr('brushed_concrete', { scale: 2.5, tint: 0xe8e2d8, bright: 1.2 });
    const streetY = (z) => Math.max(gy(STREET[0], z), gy(RAIL_X, z), gy(STREET[1], z)) + 0.1;
    live.prof = streetY;
    g.add(strip(gy, STREET[0], STREET[1], asphalt, 0.1));
    for (const [a, b] of [WALK_H, WALK_N]) g.add(strip(gy, a, b, walk, 0.26));
    g.add(strip(gy, WALK_S[0], WALK_S[1], walk, 0.26));
    const rail = pbr('metal_plate', { scale: 1, tint: 0x9a9ca0, metal: 0.85, rough: 0.5 });
    const paint = mat(0xe8dc9a, { roughness: 0.8 });
    const bits = { rail: [], paint: [], kerb: [] };
    for (let z = Z0; z < Z1; z += 4) {
      const y = streetY(z + 2);
      for (const x of [RAIL_X - 0.72, RAIL_X + 0.72]) bits.rail.push(bx(0.08, 0.06, 4, x, y, z + 2));
      if (Math.floor((z - Z0) / 4) % 2 === 0) for (const x of [RAIL_X - 3.2, RAIL_X + 3.2]) bits.paint.push(bx(0.15, 0.02, 3, x, y, z + 2));
    }
    const kerbM = pbr('granite_wall', { scale: 1.5, tint: 0xb8b4ac });
    for (let z = Z0; z < Z1; z += 4) for (const x of [STREET[0], STREET[1]]) bits.kerb.push(bx(0.3, 0.3, 4, x, streetY(z + 2) - 0.12, z + 2));
    g.add(new THREE.Mesh(mergeGeometries(bits.rail), rail), new THREE.Mesh(mergeGeometries(bits.paint), paint), new THREE.Mesh(mergeGeometries(bits.kerb), kerbM));

    // ── the two sides of the street ──
    const M = shopMats(glow);
    const bricks = ['#8a4a36', '#9a5a3c', '#7d4434', '#a8705a', '#6f3d30', '#b88a64', '#8c5640', '#7a5444'];
    // a row in its own frame: fronts on x = 0 facing +x; `named` fixes a building at a z with its own size
    const row = (frontX, flip, named) => {
      const B = new Batch(), G = new THREE.Group(), marks = {};
      // a row frame point (fx, fz) in the landmark's local frame, for the ground under it
      const toL = (fx, fz) => flip ? [frontX - fx, -fz] : [frontX + fx, fz];
      const yAt = (z0, wdt) => Math.min(...[0, -9, -18].flatMap((fx) => [z0, z0 + wdt / 2, z0 + wdt].map((fz) => { const [x, z] = toL(fx, fz); return gy(x, z); }))) - 0.1;
      const rz0 = flip ? -Z1 : Z0, rz1 = flip ? -Z0 : Z1;
      let z = rz0, i = 0;
      while (z < rz1 - 8) {
        const n = named.find((b) => !marks[b.key] && z + 12 > b.at && z <= b.at + 2);
        if (n) {
          marks[n.key] = { z, w: n.w, y: yAt(z, n.w), h: 0 };
          marks[n.key].h = building(B, M, z, n.w, n.storeys, n.brick, rnd, marks[n.key].y, { awning: n.awning, depth: n.depth || 18 });
          z += n.w + 0.4; continue;
        }
        const wdt = 9 + Math.floor(rnd() * 3) * 3, st = rnd() < 0.55 ? 2 : 3;
        const awn = rnd() < 0.6 ? [0x2f4f3a, 0x5a2a28, 0x23364d, 0x6b5a2a][Math.floor(rnd() * 4)] : null;
        building(B, M, z, wdt, st, bricks[i++ % bricks.length], rnd, yAt(z, wdt), { awning: awn });
        z += wdt + 0.4;
      }
      B.build(G);
      G.position.x = frontX;
      if (flip) G.rotation.y = Math.PI;
      g.add(G);
      return { G, marks, toL };
    };
    // the south side, right of the hole (its row frame runs back toward the green: flipped)
    const S = row(SOUTH_FRONT, true, [
      { key: 'vinyl', at: -95, w: 12, storeys: 2, brick: '#8c5640', awning: 0x1b1b1b },
      { key: 'blueberry', at: -55, w: 16, storeys: 2, brick: '#7b2f26', awning: 0x1d2a3a },
      { key: 'tivoli', at: 10, w: 20, storeys: 3, brick: '#c9b48e' },
    ]);
    // the north side, across Delmar
    const N = row(NORTH_FRONT, false, [
      { key: 'peacock', at: 52, w: 14, storeys: 1, brick: '#a8705a', awning: 0x1f5a5a },
      { key: 'pinup', at: 14, w: 12, storeys: 2, brick: '#6f3d30' },
      { key: 'pageant', at: -40, w: 24, storeys: 3, brick: '#9a5a3c', depth: 30 },
      { key: 'moonrise', at: -92, w: 22, storeys: 5, brick: '#3a3c44' },
    ]);
    // a named building's front-centre, in the landmark frame, and its street-level y
    const at = (R, key, dz = 0) => { const m = R.marks[key]; if (!m) return null; const [x, z] = R.toL(0, m.z + m.w / 2 + dz); return { x, z, y: m.y, h: m.h, w: m.w }; };
    const faceS = -Math.PI / 2, faceN = Math.PI / 2; // a sign plane facing the street from each side

    // ── signs ──
    const signAt = (p, side, material, w, h, up, out = 0.25) => {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
      s.rotation.y = side === 'S' ? faceS : faceN;
      s.position.set(p.x + (side === 'S' ? -out : out), p.y + up, p.z);
      g.add(s);
      return s;
    };
    const blade = (p, side, material, w, h, up, along = 0) => {
      const d = mat(0x1a0f0c);
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, h, w), [d, d, d, d, material, material]);
      b.rotation.y = Math.PI / 2;
      b.position.set(p.x + (side === 'S' ? -1.5 : 1.5), p.y + up, p.z + along);
      g.add(b);
    };
    {
      const p = at(S, 'blueberry');
      if (p) { const m = neon(signTexture('BLUEBERRY HILL', { fg: '#ff5148', glow: '#ff2a1a', font: 'bold 54px Georgia' })); glow.push(m); signAt(p, 'S', m, 12, 2.6, 5.6); blade(p, 'S', m, 1.6, 4.2, 7.8, 5); }
    }
    {
      const p = at(S, 'vinyl');
      if (p) { const m = neon(signTexture('VINTAGE VINYL', { bg: '#101010', fg: '#f4f4f4', glow: '#9fd0ff', font: 'bold 56px Helvetica' }), 1.3); glow.push(m); signAt(p, 'S', m, 9, 2, 5.2); }
    }
    {
      const p = at(S, 'tivoli');
      if (p) {
        const tiv = neon(canvasTex(128, 512, (c, w, h) => {
          c.fillStyle = '#7a1414'; c.fillRect(0, 0, w, h);
          c.font = 'bold 74px Georgia'; c.textAlign = 'center'; c.fillStyle = '#ffe9b0'; c.shadowColor = '#ffcf70'; c.shadowBlur = 16;
          'TIVOLI'.split('').forEach((ch, i) => c.fillText(ch, w / 2, 80 + i * 76));
        }), 1.5);
        glow.push(tiv);
        const d = mat(0x5a1010);
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.8, 9, 0.5), [d, d, d, d, tiv, tiv]);
        b.position.set(p.x - 1.8, p.y + 12.5, p.z);
        g.add(b);
        const marquee = lit(0xf3e7c8, 0xffe7a8, { night: 1.6, roughness: 0.4 });
        glow.push(marquee);
        g.add(box(2.6, 1.4, 12, marquee, p.x - 1.3, p.y + 4.6, p.z));
      }
    }
    {
      const p = at(N, 'pageant');
      if (p) {
        const mq = neon(canvasTex(1024, 192, (c, w, h) => {
          c.fillStyle = '#121418'; c.fillRect(0, 0, w, h);
          c.strokeStyle = '#ffd36a'; c.lineWidth = 6; c.strokeRect(8, 8, w - 16, h - 16);
          c.font = 'bold 110px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff2c8'; c.shadowColor = '#ffcc55'; c.shadowBlur = 24;
          c.fillText('THE PAGEANT', w / 2, h / 2 + 6);
        }), 1.8);
        glow.push(mq);
        const d = mat(0x16181c);
        const b = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 20), [mq, d, d, d, d, d]);
        b.position.set(p.x + 1.6, p.y + 5.4, p.z);
        g.add(b);
      }
    }
    {
      const p = at(N, 'pinup');
      if (p) { const m = neon(signTexture('PIN-UP BOWL', { bg: '#14081a', fg: '#ff6ad5', glow: '#ff2ab0', font: 'italic bold 64px Georgia' }), 1.8); glow.push(m); signAt(p, 'N', m, 10, 2.4, 5.4); }
    }
    {
      const p = at(N, 'peacock');
      if (p) {
        const m = neon(canvasTex(512, 256, (c, w, h) => {
          c.fillStyle = '#081414'; c.fillRect(0, 0, w, h);
          c.shadowBlur = 18; c.lineWidth = 7;
          // the neon peacock: a fan of feathers, each tipped with an eye
          for (let i = 0; i < 9; i++) {
            const a = Math.PI * (0.15 + 0.7 * i / 8), x1 = 150 + Math.cos(a) * 120, y1 = 200 - Math.sin(a) * 160;
            c.strokeStyle = '#34e3c0'; c.shadowColor = '#00ffcc'; c.beginPath(); c.moveTo(150, 200); c.lineTo(x1, y1); c.stroke();
            c.fillStyle = '#2a7bff'; c.shadowColor = '#3a8bff'; c.beginPath(); c.arc(x1, y1, 12, 0, Math.PI * 2); c.fill();
          }
          c.font = 'bold 64px Georgia'; c.fillStyle = '#ffd25a'; c.shadowColor = '#ffb020'; c.textBaseline = 'middle'; c.fillText('PEACOCK', 270, 110); c.fillText('DINER', 300, 180);
        }), 1.8);
        glow.push(m); signAt(p, 'N', m, 10, 5, 6.2);
      }
    }
    {
      // the Moonrise: a lit glass corner of rooms and, on the roof, the moon itself
      const p = at(N, 'moonrise');
      if (p) {
        const moonM = lit(0xf4f0e2, 0xfff6dc, { night: 2.2, roughness: 0.7 });
        glow.push(moonM);
        const crater = new THREE.SphereGeometry(4.2, 48, 32);
        const pa = crater.attributes.position, v = new THREE.Vector3();
        for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); const k = 1 - 0.035 * Math.max(0, Math.sin(v.x * 1.7) * Math.cos(v.y * 2.1 + v.z)); pa.setXYZ(i, v.x * k, v.y * k, v.z * k); }
        crater.computeVertexNormals();
        const moon = new THREE.Mesh(crater, moonM);
        moon.position.set(p.x - 9, p.y + p.h + 6.2, p.z);
        moon.castShadow = true;
        g.add(moon);
        live.moon = moon;
        g.add(cyl(0.5, 0.7, 2.2, mat(0x2c2e34, { metalness: 0.6 }), p.x - 9, p.y + p.h, p.z, 12));
        const m = neon(signTexture('MOONRISE', { bg: '#0c0e1a', fg: '#e8ecff', glow: '#9ab0ff', font: 'bold 70px Helvetica' }), 1.6);
        glow.push(m); blade(p, 'N', m, 1.8, 8, 9);
      }
    }

    // ── Walk of Fame: brass stars in both sidewalks ──
    const starShape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 0.2 : 0.46;
      if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const starGeo = new THREE.ShapeGeometry(starShape).rotateX(-Math.PI / 2);
    const brass = mat(0xc9a24a, { metalness: 0.9, roughness: 0.3 });
    const m4 = new THREE.Matrix4();
    const starXs = [(WALK_S[0] + WALK_S[1]) / 2, (WALK_N[0] + WALK_N[1]) / 2];
    const nStars = Math.floor((Z1 - Z0) / 7) * 2;
    const stars = new THREE.InstancedMesh(starGeo, brass, nStars);
    for (let i = 0; i < nStars; i++) {
      const x = starXs[i % 2], z = Z0 + 4 + Math.floor(i / 2) * 7;
      stars.setMatrixAt(i, m4.makeTranslation(x, Math.max(gy(x - 2, z), gy(x, z), gy(x + 2, z)) + 0.27, z));
    }
    g.add(stars);

    // ── Chuck Berry on the north sidewalk, opposite Blueberry Hill ──
    const bb = at(S, 'blueberry');
    const cbz = bb ? bb.z : -55, cbx = (WALK_N[0] + WALK_N[1]) / 2 + 0.6, cby = Math.max(gy(cbx, cbz), gy(WALK_N[0], cbz)) + 0.26;
    const granite = pbr('granite_wall', { scale: 1.2, tint: 0x8890a0, rough: 0.55 });
    g.add(cyl(1.0, 1.1, 1.2, granite, cbx, cby, cbz, 24));
    const cb = chuckBerry(mat(0x6b4a2c, { metalness: 0.75, roughness: 0.38 }));
    cb.position.set(cbx, cby + 1.2, cbz);
    cb.rotation.y = Math.PI / 2 - 0.3; // facing across Delmar toward Blueberry Hill
    g.add(cb);

    // ── the DELMAR LOOP sign by the tee: a lit marquee on two posts, ringed with bulbs, turned to the tee box ──
    {
      const x = -9, z = 46, y = gy(x, z), ry = -1.32; // its face (local +x) turned toward the tee
      const face = neon(canvasTex(1024, 512, (c, w, h) => {
        c.fillStyle = '#1b0d1e'; c.fillRect(0, 0, w, h);
        c.strokeStyle = '#ffcf5a'; c.lineWidth = 14; c.shadowColor = '#ffb020'; c.shadowBlur = 26; c.strokeRect(22, 22, w - 44, h - 44);
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = 'bold 120px Georgia'; c.fillStyle = '#ff4f7a'; c.shadowColor = '#ff2060'; c.fillText('DELMAR', w / 2, 150);
        c.font = 'bold 210px Georgia'; c.fillStyle = '#7fe8ff'; c.shadowColor = '#20c8ff'; c.fillText('LOOP', w / 2, 330);
        c.font = 'italic 52px Georgia'; c.fillStyle = '#ffe9b8'; c.shadowColor = '#ffcf70'; c.fillText('University City · St. Louis', w / 2, 450);
      }), 2.2);
      glow.push(face);
      const back = mat(0x241426, { roughness: 0.6 });
      const sign = new THREE.Group();
      sign.position.set(x, y, z);
      sign.rotation.y = ry;
      sign.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.6, 7.2), [face, back, back, back, back, back]).translateY(4.6));
      const iron = pbr('metal_plate', { scale: 1, tint: 0x2a2e34, metal: 0.6 });
      for (const s2 of [-1, 1]) sign.add(cyl(0.12, 0.16, 4.6, iron, 0, 0, s2 * 3.2, 10));
      const bulbM = lit(0xfff3d0, 0xfff0c0, { night: 2.4 });
      glow.push(bulbM);
      const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), bulbM, 60);
      for (let i = 0; i < 60; i++) {
        const d = (i / 60) * 22.4; let lz, ly;
        if (d < 7.4) { lz = -3.7 + d; ly = 1.95; } else if (d < 11.2) { lz = 3.7; ly = 1.95 - (d - 7.4); } else if (d < 18.6) { lz = 3.7 - (d - 11.2); ly = -1.85; } else { lz = -3.7; ly = -1.85 + (d - 18.6); }
        bulbs.setMatrixAt(i, m4.makeTranslation(0.3, 4.6 + ly, lz));
      }
      sign.add(bulbs);
      g.add(sign);
    }

    // ── street lamps, the trolley wire, trees ──
    const iron = pbr('metal_plate', { scale: 1, tint: 0x2a2e34, metal: 0.6 });
    const lampHead = lit(0xfff1d6, 0xffd9a0, { night: 2.0 });
    glow.push(lampHead);
    const poles = [], heads = [];
    for (let z = Z0 + 6; z <= Z1 - 4; z += 18) {
      for (const x of [WALK_H[0] + 0.6, WALK_N[1] - 0.6, WALK_S[0] + 0.6]) {
        const y = gy(x, z) + 0.26;
        poles.push(new THREE.CylinderGeometry(0.08, 0.12, 5.2, 8).translate(x, y + 2.6, z));
        heads.push(new THREE.SphereGeometry(0.32, 10, 8).translate(x, y + 5.4, z));
      }
      const y = streetY(z + 9);
      poles.push(new THREE.CylinderGeometry(0.11, 0.14, 7.4, 8).translate(STREET[1] + 0.6, y + 3.7, z + 9));
      poles.push(new THREE.BoxGeometry(7.4, 0.05, 0.05).translate(RAIL_X + 3.4, y + 6.4, z + 9));
    }
    for (let z = Z0; z < Z1 - 4; z += 8) { const y = streetY(z + 4); poles.push(new THREE.BoxGeometry(0.03, 0.03, 8).translate(RAIL_X, y + 6.38, z + 4)); }
    const poleMesh = new THREE.Mesh(mergeGeometries(poles), iron);
    poleMesh.castShadow = true;
    g.add(poleMesh, new THREE.Mesh(mergeGeometries(heads), lampHead));
    for (let z = Z0 + 8; z <= Z1 - 8; z += 14) {
      treeList.push(tree(WALK_H[0] + 1.6, gy(WALK_H[0] + 1.6, z) + 0.2, z, 6 + rnd() * 1.2, 1.9 + rnd() * 0.4, { slot: SLOT.youngOak }));
      if (rnd() < 0.6) treeList.push(tree(WALK_N[1] - 1.4, gy(WALK_N[1] - 1.4, z + 7) + 0.2, z + 7, 5.6 + rnd(), 1.7, { slot: SLOT.youngOak }));
    }

    // ── a busy evening: people on all three sidewalks, a queue at the Pageant, a crowd at the statue ──
    const spots = [];
    const walkers = (x0, x1, n) => { for (let i = 0; i < n; i++) { const x = x0 + 0.6 + rnd() * (x1 - x0 - 1.2), z = Z0 + 4 + rnd() * (Z1 - Z0 - 8); spots.push([x, gy(x, z) + 0.26, z, rnd() < 0.5 ? 0 : Math.PI]); } };
    walkers(WALK_S[0], WALK_S[1], 34); walkers(WALK_N[0], WALK_N[1], 34); walkers(WALK_H[0], WALK_H[1], 14);
    const pg = at(N, 'pageant');
    if (pg) for (let i = 0; i < 16; i++) { const x = WALK_N[0] + 1.2 + (i % 2) * 0.7, z = pg.z + 8 - i * 0.9; spots.push([x, gy(x, z) + 0.26, z, Math.PI]); }
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 1.6 - 0.8, x = cbx + 1.6 + Math.cos(a) * 2.6, z = cbz + Math.sin(a) * 2.8; spots.push([x, gy(x, z) + 0.26, z, Math.atan2(cbx - x, cbz - z)]); }
    const people = crowdAt(spots, rnd);
    if (people) g.add(people);

    // ── cars at both kerbs ──
    const cars = [];
    for (let z = Z0 + 6; z < Z1 - 6; z += 6.5) {
      if (rnd() < 0.72) cars.push([STREET[0] + 1.3, streetY(z) - 0.02, z, Math.PI]);
      if (rnd() < 0.55) cars.push([STREET[1] - 1.3, streetY(z) - 0.02, z, 0]);
    }
    carsAt(cars, rnd, { max: 40 }).then((cg) => cg && g.add(cg));

    // everything but the trolley and the moon stands still: one draw per material
    const keep = new Set([live.moon]);
    const still = new THREE.Group();
    for (const c of [...g.children]) if (!keep.has(c) && !c.isInstancedMesh && c.type !== 'Group') still.add(c);
    mergeByMaterial(still);
    g.add(still);

    // ── the trolley ──
    const tr = trolley();
    glow.push(...tr.glow);
    g.add(tr.group);
    live.trolley = { group: tr.group, z: -60, dir: 1, wait: 0 };
    tr.group.position.set(RAIL_X, streetY(-60) + 0.1, -60);
  }
  return res;
}
