// The real city round a course: OpenStreetMap footprints extruded to their
// mapped heights on the real ground (tools/fetch-buildings.mjs). Styles:
//   paris  Haussmann blocks: cut-limestone fronts with tall French windows
//          and iron balcony rails, grey zinc mansard roofs
//   nyc    glass curtain walls on the towers, brick and stone below
// Geometry is merged per 400 m cell so off-screen blocks are culled; lit
// windows glow at night (the materials go in CourseWorld's glow list).
import * as THREE from 'three';

const CELL = 400;

function inside(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

function tex(w, h, draw, linear = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

let rs = 7;
const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);

/** One texture tile is 4 bays by 2 floors. */
const STYLE = {
  paris: {
    bay: 3.4, floor: 3.25, roof: 'mansard',
    facade: (g, w, h) => {
      g.fillStyle = '#d8ccb2'; g.fillRect(0, 0, w, h);
      // limestone courses
      g.fillStyle = 'rgba(120,100,70,0.12)';
      for (let y = 0; y < h; y += h / 12) g.fillRect(0, y, w, 1.5);
      const bw = w / 4, fh = h / 2;
      for (let f = 0; f < 2; f++) for (let b = 0; b < 4; b++) {
        const x = b * bw + bw * 0.27, y = f * fh + fh * 0.16, ww = bw * 0.46, wh = fh * 0.66;
        g.fillStyle = '#c7b897'; g.fillRect(x - 3, y - 4, ww + 6, wh + 8); // moulded surround
        g.fillStyle = '#39424b'; g.fillRect(x, y, ww, wh);
        g.fillStyle = 'rgba(210,225,235,0.25)'; g.fillRect(x + 2, y + 2, ww * 0.4, wh - 4);
        g.strokeStyle = '#d9cfb8'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + ww / 2, y); g.lineTo(x + ww / 2, y + wh); g.stroke();
        // wrought-iron balcony rail across the bottom of the window
        g.fillStyle = '#1d1f22'; g.fillRect(x - 4, y + wh - 10, ww + 8, 3);
        for (let k = 0; k <= 6; k++) g.fillRect(x - 3 + (k * (ww + 6)) / 6, y + wh - 10, 1.5, 12);
      }
    },
    lamp: '#ffcf8a', wall: 0xffffff, zinc: 0x6f7b85, cap: 0x5d666e,
  },
  nyc: {
    bay: 3.0, floor: 3.4, roof: 'flat',
    // pre-war Manhattan: limestone, buff brick and brown brick, punched windows with sills
    // and a cornice band every few floors; glass only on the supertall and the odd modern tower
    walls: [['#c9bea9', '#b3a78f'], ['#b39a7a', '#9d8467'], ['#8c6250', '#76503f'], ['#a9a59d', '#928e86']].map(([base, band]) => (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      // brick or stone grain
      for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rnd() * 0.05})`; g.fillRect(rnd() * w, rnd() * h, 3 + rnd() * 6, 1.5); }
      g.fillStyle = band; g.fillRect(0, 0, w, 5); // the band course at each second floor
      const bw = w / 4, fh = h / 2;
      for (let f = 0; f < 2; f++) for (let b = 0; b < 4; b++) {
        const x = b * bw + bw * 0.25, y = f * fh + fh * 0.2, ww = bw * 0.5, wh = fh * 0.58;
        g.fillStyle = '#262c31'; g.fillRect(x, y, ww, wh);
        g.fillStyle = 'rgba(190,205,215,0.22)'; g.fillRect(x + 2, y + 2, ww * 0.45, wh * 0.5); // a sky reflection in the upper sash
        g.fillStyle = '#d9d0bf'; g.fillRect(x - 2, y + wh, ww + 4, 3); // the sill
        g.fillStyle = 'rgba(30,30,30,0.35)'; g.fillRect(x, y + wh * 0.5, ww, 2); // the meeting rail
      }
    }),
    glass: (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, '#8a9ba3'); gr.addColorStop(0.5, '#5d6f78'); gr.addColorStop(1, '#748890');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(25,30,34,0.7)';
      for (let y = 0; y < h; y += h / 2) g.fillRect(0, y, w, 4); // spandrels
      for (let x = 0; x < w; x += w / 4) g.fillRect(x, 0, 2, h); // mullions
    },
    glassOver: 150, // metres: Billionaires' Row and the Midtown towers
    lamp: '#fff1d0', wall: 0xffffff, zinc: 0x555a60, cap: 0x5e5a55,
  },
};

function windowsGlow(lampColor) {
  return tex(256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const bw = w / 4, fh = h / 2;
    for (let f = 0; f < 2; f++) for (let b = 0; b < 4; b++) {
      if (rnd() < 0.5) { g.fillStyle = lampColor; g.fillRect(b * bw + bw * 0.27, f * fh + fh * 0.16, bw * 0.46, fh * 0.66); }
    }
  });
}

/**
 * @param data   buildings.json ({buildings:[{p:[x,z,...], h, mh}]}), DEM frame
 * @param T      HoleTerrain (with its DEM frame T.F)
 * @param style  'paris' | 'nyc'
 * @param pull   {from, k}: beyond `from` metres, distances shrink by k
 *               (a long-lens view: the far skyline at true size, nearer)
 * @returns {{group, glow:THREE.Material[], haze:THREE.Material[]}}
 */
export function buildCity(data, T, style = 'paris', pull = null) {
  const S = STYLE[style] || STYLE.paris;
  rs = 7;
  const glowTex = windowsGlow(S.lamp);
  const walls = (S.walls || [S.facade]).map((fn) => new THREE.MeshStandardMaterial({ map: tex(256, 256, fn), emissiveMap: glowTex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.85 }));
  const mats = {
    wall: walls[0],
    glass: S.glass ? new THREE.MeshStandardMaterial({ map: tex(256, 256, S.glass), emissiveMap: windowsGlow(S.lamp), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.22, metalness: 0.55 }) : null,
    zinc: new THREE.MeshStandardMaterial({ color: S.zinc, roughness: 0.5, metalness: 0.5 }),
    cap: new THREE.MeshStandardMaterial({ color: S.cap, roughness: 0.9 }),
  };
  for (const m of Object.values(mats)) if (m) m.side = THREE.DoubleSide;
  for (const m of walls) { m.side = THREE.DoubleSide; m.userData.night = 1.0; }
  if (mats.glass) mats.glass.userData.night = 1.2;
  const cells = new Map();
  const cell = (x, z) => {
    const k = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    if (!cells.has(k)) cells.set(k, { wall: walls.map(() => []), glass: [], zinc: [], cap: [] });
    return cells.get(k);
  };
  const F = T.F;
  for (const b of data.buildings) {
    const n = b.p.length / 2;
    if (n < 3) continue;
    let pts = [];
    for (let i = 0; i < n; i++) pts.push(F.toLocal(b.p[i * 2], b.p[i * 2 + 1]));
    if (pull) {
      // move the whole footprint in toward the course, keeping its shape
      let mx = 0, mz = 0;
      for (const [x, z] of pts) { mx += x; mz += z; }
      mx /= n; mz /= n;
      const d = Math.hypot(mx, mz);
      if (d > pull.from) {
        const s2 = (pull.from + (d - pull.from) * pull.k) / d;
        const dx = mx * (s2 - 1), dz = mz * (s2 - 1);
        pts = pts.map(([x, z]) => [x + dx, z + dz]);
      }
    }
    let cx = 0, cz = 0, area = 0;
    for (let i = 0; i < n; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % n];
      area += x1 * z2 - x2 * z1; cx += x1; cz += z1;
    }
    cx /= n; cz /= n;
    area /= 2;
    if (Math.abs(area) < 12) continue;
    // keep the field of play clear
    // (every corner and edge midpoint, not just the middle: a big footprint behind the tee can reach over it)
    const inPlay = (x, z) => { const pr = T.project(x, z); return Math.abs(pr.d) < T.oobLateral + 4 && pr.s > -40 && pr.s < T.length + 60; };
    if (inPlay(cx, cz) || pts.some(([x, z], i) => { const [x2, z2] = pts[(i + 1) % n]; return inPlay(x, z) || inPlay((x + x2) / 2, (z + z2) / 2); })) continue;
    const h0 = Math.min(...pts.map(([x, z]) => T.baseGround(x, z))) - 0.4;
    let h = b.h || (style === 'paris' ? 18.5 + rnd() * 3.5 : 14 + rnd() * 8);
    const tall = S.glassOver ? h > S.glassOver || (h > 70 && rnd() < 0.18) : h > 45;
    const mansard = S.roof === 'mansard' && h > 11 && h < 45 && Math.abs(area) > 60;
    const wallTop = h0 + (mansard ? h - 3.6 : h);
    const C = cell(cx, cz);
    const W = tall && mats.glass ? C.glass : C.wall[Math.floor(rnd() * walls.length)];
    // walls: u in bays round the perimeter, v in floors
    let run = 0;
    for (let i = 0; i < n; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % n];
      const L = Math.hypot(x2 - x1, z2 - z1);
      const u0 = run / (S.bay * 4), u1 = (run + L) / (S.bay * 4);
      const v0 = 0, v1 = (wallTop - h0) / (S.floor * 2);
      W.push([x1, h0, z1, u0, v0], [x2, h0, z2, u1, v0], [x2, wallTop, z2, u1, v1], [x1, h0, z1, u0, v0], [x2, wallTop, z2, u1, v1], [x1, wallTop, z1, u0, v1]);
      run += L;
    }
    // roof: a zinc mansard stepping in 2.2 m, then a flat cap
    let top = pts, topY = wallTop;
    if (mansard) {
      const inset = 2.2;
      const inner = pts.map(([x, z], i) => {
        const [xa, za] = pts[(i - 1 + n) % n], [xb, zb] = pts[(i + 1) % n];
        let n1x = z - za, n1z = -(x - xa), n2x = zb - z, n2z = -(xb - x);
        const l1 = Math.hypot(n1x, n1z) || 1, l2 = Math.hypot(n2x, n2z) || 1;
        n1x /= l1; n1z /= l1; n2x /= l2; n2z /= l2;
        let mx = n1x + n2x, mz = n1z + n2z;
        const ml = Math.hypot(mx, mz) || 1;
        mx /= ml; mz /= ml;
        const k = Math.min(3, 1 / Math.max(0.35, Math.abs(mx * n1x + mz * n1z)));
        // step along the bisector, whichever way is inside the footprint
        const a = [x - mx * inset * k, z - mz * inset * k];
        return inside(pts, a[0], a[1]) ? a : [x + mx * inset * k, z + mz * inset * k];
      });
      for (let i = 0; i < n; i++) {
        const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % n];
        const [a1, b1] = inner[i], [a2, b2] = inner[(i + 1) % n];
        const yt = wallTop + 3.6;
        C.zinc.push([x1, wallTop, z1, 0, 0], [x2, wallTop, z2, 1, 0], [a2, yt, b2, 1, 1], [x1, wallTop, z1, 0, 0], [a2, yt, b2, 1, 1], [a1, yt, b1, 0, 1]);
      }
      top = inner; topY = wallTop + 3.6;
    }
    const contour = top.map(([x, z]) => new THREE.Vector2(x, z));
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { tris = []; }
    for (const [a, bb, c] of tris) {
      // wind so the cap faces up
      for (const k of [a, c, bb]) C.cap.push([top[k][0], topY, top[k][1], 0, 0]);
    }
  }
  const group = new THREE.Group();
  for (const [, C] of cells) {
    const sets = [...walls.map((m, i) => [m, C.wall[i]]), ...['glass', 'zinc', 'cap'].map((k) => [mats[k], C[k]])];
    for (const [material, list] of sets) {
      if (!list.length || !material) continue;
      const pos = new Float32Array(list.length * 3), uv = new Float32Array(list.length * 2);
      list.forEach((v, i) => { pos.set([v[0], v[1], v[2]], i * 3); uv.set([v[3], v[4]], i * 2); });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  const all = [...walls, ...Object.values(mats).filter((m) => m && !walls.includes(m))];
  return { group, glow: [...walls, mats.glass].filter(Boolean), haze: all };
}
