// The Piasa bluff: the Mississippian limestone face on the Great River Road
// just north of Alton, with the painted Piasa set into a smoothed panel about
// 15-40 m up. Layered bedding, joints, ledges, talus, clinging cedars and an
// oak-hickory crown; the road and guard rail run along the foot of the bluff.
// Front faces +Z (toward the golfer). Footprint x -140..140, z -50..12.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, seeded, canvasTex, tree, SLOT, boulderGeometry } from './kit.js';
import { pbr, painted } from '../../scene/pbr.js';
import { piasaCanvas, piasaEngravedCanvas } from '../../ui/piasa.js';
import { crowdAt } from '../../scene/crowd.js';
import { carsAt } from '../../scene/cars.js';
import { tow } from './riverfront.js';

// ---- small deterministic noise --------------------------------------------
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function noise1(x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}
function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Give a geometry a flat vertex colour (optionally varied per vertex) and make it non-indexed. */
function paint(geo, col, vary = 0, rnd = null, shadeBelow = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, n = p.count;
  const c = new Float32Array(n * 3);
  const base = new THREE.Color(col);
  g.computeBoundingBox();
  const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y;
  for (let i = 0; i < n; i++) {
    const v = vary ? 1 + (hash2(p.getX(i) * 3.1, p.getY(i) * 2.7 + p.getZ(i)) - 0.5) * vary : 1;
    const ao = shadeBelow ? 1 - shadeBelow * (1 - (p.getY(i) - y0) / Math.max(0.001, y1 - y0)) : 1;
    c[i * 3] = base.r * v * ao; c[i * 3 + 1] = base.g * v * ao; c[i * 3 + 2] = base.b * v * ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
/** Lumpy sphere: radial jitter keyed on direction so seams stay closed. */
function lumpy(r, wseg, hseg, amt, seed) {
  const g = new THREE.SphereGeometry(r, wseg, hseg);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (hash2(Math.round(x / r * 40) + seed * 7.3, Math.round(y / r * 40) * 1.7 + Math.round(z / r * 40) * 3.1) - 0.5) * amt;
    p.setXYZ(i, x * k, y * k * 0.92, z * k);
  }
  g.computeVertexNormals();
  return g;
}

// ---- the limestone face -----------------------------------------------------
const X0 = -140, X1 = 140;
const ZB = -15; // base line of the face
/** Crest height of the bluff along x: 44-54 m in the middle, dropping into hollows at the ends. */
function crest(x) {
  const mid = 47 + 4 * Math.sin(x * 0.021 + 0.6) + 2.5 * Math.sin(x * 0.061 + 2) + 1.5 * noise1(x * 0.08);
  return 8 + (mid - 8) * (1 - smooth(92, 140, Math.abs(x)));
}
/** Plan line of the face: gentle buttresses and re-entrants, wrapping back at the ends. */
function planZ(x) {
  return ZB + 2.6 * Math.sin(x * 0.034 + 1.1) + 1.4 * Math.sin(x * 0.093) - 16 * smooth(96, 140, Math.abs(x)) ** 1.4;
}

export default function build() {
  const g = new THREE.Group();
  const glow = [];
  const rnd = seeded(1673); // Marquette & Jolliet passed the painting in 1673

  // Bedding: alternating hard (protruding) and soft (recessed) beds.
  const layers = [];
  {
    const r = seeded(91);
    let y = 0;
    // cream and buff beds, as in the photographs
    const tints = [0xdfd2b3, 0xcdbf9e, 0xe6dabe, 0xc4b593, 0xd8c8a3, 0xbfb08f, 0xe2d5b5, 0xcfba95, 0xd5c9ad];
    let k = 0;
    while (y < 60) {
      const hard = k % 2 === 0 ? r() < 0.75 : r() < 0.3;
      const h = hard ? 1.6 + r() * 2.8 : 0.6 + r() * 1.3;
      layers.push({ y0: y, y1: y + h, out: hard ? 0.4 + r() * 1.3 : -0.6 - r() * 0.9, tint: tints[Math.floor(r() * tints.length)], tv: (r() - 0.5) * 0.08, ph: r() * 100 });
      y += h; k++;
    }
  }
  // vertical joints (fractures) - positions + depth
  const joints = [];
  for (let x = X0 + 4; x < X1; x += 5 + rnd() * 10) joints.push({ x, d: 1.2 + rnd() * 2.8, w: 0.45 + rnd() * 0.8, top: 0.55 + rnd() * 0.5, bot: rnd() * 0.3 });
  const PANEL = { x0: -19, x1: 19, y0: 14, y1: 41, z: ZB + 1.8 };

  function layerAt(y) { for (const L of layers) if (y < L.y1) return L; return layers[layers.length - 1]; }
  function jointDepth(x, y, H) {
    let d = 0;
    for (const j of joints) {
      const dx = (x - j.x) / j.w;
      if (dx * dx > 9) continue;
      const yn = y / H;
      if (yn > j.top || yn < j.bot) continue;
      d = Math.max(d, j.d * Math.exp(-dx * dx));
    }
    return d;
  }
  function panelW(x, y) {
    return smooth(PANEL.x0 - 3, PANEL.x0 + 0.5, x) * (1 - smooth(PANEL.x1 - 0.5, PANEL.x1 + 3, x)) *
      smooth(PANEL.y0 - 3, PANEL.y0 + 0.5, y) * (1 - smooth(PANEL.y1 - 0.5, PANEL.y1 + 3, y));
  }
  /** Outward offset of the face at (x, y), and a recess measure for shading. */
  function faceZ(x, y, H) {
    const L = layerAt(y);
    const along = 0.55 + 0.9 * noise1(x * 0.045 + L.ph); // beds come and go along x
    let z = planZ(x) + L.out * along;
    z += (noise2(x * 0.35, y * 0.5) - 0.5) * 0.7 + (noise2(x * 1.3, y * 1.6) - 0.5) * 0.25;
    z -= jointDepth(x, y, H);
    // slight batter: the bluff leans back near the crest
    z -= smooth(H - 8, H, y) * 2.2;
    const w = panelW(x, y);
    return { z: z * (1 - w) + PANEL.z * w, recess: Math.min(1, Math.max(0, -L.out * along * 0.8 + jointDepth(x, y, H) * 0.4)), L, w };
  }

  // rows: two rows hugging every bed boundary (crisp ledges / overhangs)
  const rowsY = [0.02];
  for (const L of layers) {
    if (L.y0 > 58) break;
    const h = L.y1 - L.y0;
    rowsY.push(L.y0 + 0.06);
    const inner = Math.max(1, Math.round(h / 1.1));
    for (let i = 1; i < inner; i++) rowsY.push(L.y0 + (h * i) / inner);
    rowsY.push(L.y1 - 0.06);
  }
  const nFace = rowsY.length;
  const brow = [[0.6, -1.2], [1.4, -3.5], [2.2, -8], [2.6, -16], [2.0, -26]]; // dy, dz behind the crest
  const nRows = nFace + brow.length + 1;
  const DX = 1.3;
  const nCols = Math.round((X1 - X0) / DX) + 1;

  const pos = new Float32Array(nCols * nRows * 3);
  const col = new Float32Array(nCols * nRows * 3);
  const uv = new Float32Array(nCols * nRows * 2);
  const tmp = new THREE.Color(), soil = new THREE.Color(0x5b5233), moss = new THREE.Color(0x4c5a2e);
  const ledges = []; // where shrubs can cling
  for (let ci = 0; ci < nCols; ci++) {
    const x = X0 + ci * DX;
    const H = crest(x);
    const streak = Math.max(0, noise1(x * 0.55 + 3) - 0.52) * 2.2 + Math.max(0, noise1(x * 0.17 + 9) - 0.6) * 1.4;
    const iron = Math.max(0, noise1(x * 0.21 + 40) - 0.62) * 2;
    let topZ = planZ(x), prevOut = null;
    for (let ri = 0; ri < nRows; ri++) {
      let y, z, c;
      const vi = ci * nRows + ri;
      if (ri < nFace && rowsY[ri] < H) {
        y = rowsY[ri];
        const f = faceZ(x, y, H);
        z = f.z;
        topZ = z;
        tmp.set(f.L.tint);
        const v = 1 + f.L.tv + (noise2(x * 0.8, y * 0.9) - 0.5) * 0.14;
        tmp.multiplyScalar(v * (1 - 0.4 * f.recess) * (1 - 0.35 * Math.min(1, jointDepth(x, y, H) / 2)));
        // water / lichen streaks run down from the ledges, darkest low on the face
        const wet = Math.min(0.7, 1.4 * streak * (0.35 + 0.65 * (1 - y / H)) * (0.7 + 0.6 * noise2(x * 2, y * 0.15)));
        tmp.lerp(new THREE.Color(0x4a4840), wet * (1 - f.w));
        tmp.lerp(new THREE.Color(0xa77a4a), iron * 0.35 * smooth(0.2, 0.6, y / H) * (1 - f.w));
        // base of the face: damp, mossy
        tmp.lerp(moss, 0.35 * (1 - smooth(0, 4, y)));
        // panel: cleaned, slightly paler limestone
        tmp.lerp(new THREE.Color(0xdcd2bc), f.w * 0.8);
        c = tmp;
        if (prevOut !== null && f.z < prevOut - 0.45 && f.w < 0.05 && rnd() < 0.22) ledges.push([x, y, prevOut]);
        prevOut = f.z;
      } else if (ri < nFace) {
        // rows above the crest roll back over the brow
        const over = rowsY[ri] - H;
        y = H + Math.min(0.5, over * 0.08);
        z = topZ - 0.4 - over * 0.06;
        c = tmp.copy(soil).lerp(moss, 0.5);
      } else if (ri < nFace + brow.length) {
        const [dy, dz] = brow[ri - nFace];
        y = H + dy; z = Math.max(-50, topZ + dz);
        if (ri === nFace + brow.length - 1) z = -40;
        c = tmp.copy(soil).lerp(moss, 0.4 + 0.3 * noise1(x * 0.3));
      } else {
        y = 0; z = -50; c = tmp.copy(soil);
      }
      pos[vi * 3] = x + (ri < nFace ? (noise2(x * 0.7, y * 0.4) - 0.5) * 0.5 : 0);
      pos[vi * 3 + 1] = y; pos[vi * 3 + 2] = z;
      col[vi * 3] = c.r; col[vi * 3 + 1] = c.g; col[vi * 3 + 2] = c.b;
      uv[vi * 2] = x / 14; uv[vi * 2 + 1] = y / 14;
    }
  }
  const idx = [];
  for (let ci = 0; ci < nCols - 1; ci++) for (let ri = 0; ri < nRows - 1; ri++) {
    const a = ci * nRows + ri, b = (ci + 1) * nRows + ri;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const faceGeo = new THREE.BufferGeometry();
  faceGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  faceGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  faceGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  faceGeo.setIndex(idx);
  faceGeo.computeVertexNormals();

  // limestone grain: fine lamination, pits, speckle, drip lines
  const grain = canvasTex(512, 512, (c, w, h) => {
    const r = seeded(7);
    c.fillStyle = '#e9e4da'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = 200 + r() * 55;
      c.fillStyle = `rgba(${v},${v - 4},${v - 12},${0.25 + r() * 0.4})`;
      c.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 2);
    }
    for (let y = 0; y < h; y += 3 + r() * 9) {
      c.strokeStyle = `rgba(90,82,70,${0.08 + r() * 0.16})`; c.lineWidth = 0.6 + r() * 1.4;
      c.beginPath(); c.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) c.lineTo(x, y + (r() - 0.5) * 2.5);
      c.stroke();
    }
    for (let i = 0; i < 700; i++) {
      c.fillStyle = `rgba(70,64,56,${0.15 + r() * 0.35})`;
      c.beginPath(); c.arc(r() * w, r() * h, 0.6 + r() * 2.2, 0, 7); c.fill();
    }
    for (let i = 0; i < 60; i++) {
      const x = r() * w, y = r() * h, len = 30 + r() * 140;
      const gr = c.createLinearGradient(0, y, 0, y + len);
      gr.addColorStop(0, 'rgba(60,58,50,0.22)'); gr.addColorStop(1, 'rgba(60,58,50,0)');
      c.fillStyle = gr; c.fillRect(x, y, 1.5 + r() * 4, len);
    }
  }, [1, 1]);
  // the bluff's face: photographed rock, laid on from three sides, shaded by its beds in the vertices
  void grain;
  const rockMat = pbr('rock_face_03', { scale: 4, tint: 0xc4d2ee, bright: 1.45 });
  rockMat.vertexColors = true;
  const face = new THREE.Mesh(faceGeo, rockMat);
  face.receiveShadow = true;
  g.add(face);

  // end caps (the profile at x = ±140, where the bluff has dropped into a hollow)
  {
    const caps = [];
    for (const ci of [0, nCols - 1]) {
      const v = [];
      const cx = pos[ci * nRows * 3], cy = crest(cx) * 0.3, cz = -36;
      for (let ri = 0; ri < nRows - 1; ri++) {
        const a = (ci * nRows + ri) * 3, b = (ci * nRows + ri + 1) * 3;
        const tri = [cx, cy, cz, pos[a], pos[a + 1], pos[a + 2], pos[b], pos[b + 1], pos[b + 2]];
        if (ci === 0) v.push(...tri); else v.push(tri[0], tri[1], tri[2], tri[6], tri[7], tri[8], tri[3], tri[4], tri[5]);
      }
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      cg.computeVertexNormals();
      caps.push(paint(cg, 0x6f6448));
    }
    const cm = new THREE.Mesh(mergeGeometries(caps), mat(0xffffff, { vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
    g.add(cm);
  }

  // ---- talus apron and rubble at the foot ----------------------------------
  {
    const parts = [];
    // apron: a low scree slope from the face to the road shoulder
    const ap = new THREE.PlaneGeometry(X1 - X0 - 30, 8, 120, 4).rotateX(-Math.PI / 2);
    const p = ap.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), zz = p.getZ(i); // zz in -4..4, -4 = at face
      const t = (zz + 4) / 8;
      const z0 = planZ(x) + 0.3;
      p.setZ(i, z0 + t * (-6.5 - z0 + 0.5 * Math.sin(x * 0.2)));
      p.setY(i, (1 - t) ** 1.6 * (2.2 + 1.6 * noise1(x * 0.15)) + (noise2(x * 0.5, zz) - 0.5) * 0.3 + 0.03);
    }
    ap.computeVertexNormals();
    const apc = paint(ap, 0x8f8571, 0.25);
    parts.push(apc);
    // blocks: limestone slabs fallen from the beds, piled at the joints
    const r = seeded(33);
    const rockCols = [0xb8ad95, 0xa39a86, 0xc6bba2, 0x8e8676, 0x9c917a];
    for (let i = 0; i < 260; i++) {
      let x = X0 + 18 + r() * (X1 - X0 - 36);
      if (r() < 0.5) { const j = joints[Math.floor(r() * joints.length)]; x = Math.min(X1 - 16, Math.max(X0 + 16, j.x + (r() - 0.5) * 6)); }
      const t = r() ** 1.7;
      const s = (0.35 + r() * r() * 2.6) * (1 - t * 0.5);
      const geo = boulderGeometry(s, r, { detail: 1, flat: 1 });
      geo.scale(1 + r() * 0.8, 0.45 + r() * 0.4, 0.8 + r() * 0.6);
      geo.rotateY(r() * 6.28); geo.rotateZ((r() - 0.5) * 0.5);
      const z = planZ(x) + 0.8 + t * 7.5;
      const yb = (1 - t) ** 1.6 * 2.6;
      geo.translate(x, yb + s * 0.25, Math.min(-6.4, z));
      parts.push(paint(geo, rockCols[Math.floor(r() * rockCols.length)], 0.15));
    }
    const talusM = pbr('rock_face_03', { scale: 2, tint: 0xc4d2ec, bright: 1.3 }); // the fallen limestone, its blocks' own shades in the vertices
    talusM.vertexColors = true;
    const talus = new THREE.Mesh(mergeGeometries(parts), talusM);
    talus.receiveShadow = true;
    g.add(talus);
  }

  const treeList = [];
  // ---- vegetation: oak-hickory crown, cedars and shrubs on the ledges -------
  {
    const leaf = [];
    const r = seeded(5150);
    const greens = [0x3e5a2b, 0x47622f, 0x35502a, 0x566a33, 0x2f4724, 0x4f6a3a, 0x5f6f34];
    // white and black oak, shagbark hickory on the crown; eastern red cedar on the ledges
    const broadleaf = (x, y, z, s) => treeList.push(tree(x, y, z, (8.5 + r() * 3) * s, 4.3 * s, { slot: r() < 0.65 ? SLOT.oak : SLOT.youngOak }));
    const cedar = (x, y, z, s) => { const h = (4 + r() * 4) * s; treeList.push(tree(x, y, z, h, h * 0.26, { slot: SLOT.cedar })); };
    let i = 0;
    // crown forest: dense along the brow, thinning behind
    for (let n = 0; n < 108; n++) {
      const x = X0 + 10 + r() * (X1 - X0 - 20);
      const H = crest(x);
      const back = r() ** 1.4;
      const z = Math.max(-43, planZ(x) - 3 - back * 28);
      const y = H + (back < 0.1 ? 0.6 : 2.0 + 0.4 * r());
      if (H < 12 && r() < 0.5) cedar(x, y, z, 1.2); else broadleaf(x, y - 0.4, z, 0.8 + r() * 0.45 * (1 - back * 0.3));
    }
    // understory along the brow (sumac, dogwood, young cedar) hides the trunk line
    for (let n = 0; n < 125; n++) {
      const x = X0 + 9 + r() * (X1 - X0 - 18);
      const H = crest(x);
      if (r() < 0.3) { cedar(x, H, planZ(x) - 3.5 - r() * 3, 0.6 + r() * 0.5); continue; }
      const sg = lumpy(1.6 + r() * 1.6, 7, 5, 0.35, i++);
      sg.scale(1.5, 0.9, 1.1);
      sg.translate(x, H + 1.3 + r(), planZ(x) - 3.2 - r() * 4);
      leaf.push(paint(sg, new THREE.Color(greens[Math.floor(r() * greens.length)]).offsetHSL(0, 0, 0.02), 0.2, null, 0.5));
    }
    // ravine woods at the ends where the bluff drops
    for (let n = 0; n < 18; n++) {
      const side = n % 2 ? 1 : -1;
      const x = side * (118 + r() * 14);
      broadleaf(x, 0, planZ(x) + 2 + r() * 6, 0.9 + r() * 0.3);
    }
    // ledge vegetation: cedars and shrubs clinging to the bedding shelves
    for (const [x, y, z] of ledges) {
      if (y < 4 || r() < 0.45) continue;
      if (r() < 0.35) cedar(x, y, z + 0.3, 0.45 + r() * 0.35);
      else {
        const base = new THREE.Color(greens[Math.floor(r() * greens.length)]).lerp(new THREE.Color(0x6b6a48), 0.35);
        const n = 2 + Math.floor(r() * 3);
        for (let k = 0; k < n; k++) {
          const sg = lumpy(0.45 + r() * 0.6, 6, 4, 0.4, i++);
          sg.scale(1.2, 0.85, 1);
          sg.translate(x + (r() - 0.5) * 2.6, y + 0.25 + r() * 0.4, z + 0.1 + r() * 0.6);
          leaf.push(paint(sg, base.clone().offsetHSL(0, 0, (r() - 0.5) * 0.06), 0.25, null, 0.4));
        }
        // trailing vine / moss down the riser below
        if (r() < 0.5) {
          const vg = new THREE.PlaneGeometry(1 + r() * 2, 1.5 + r() * 2.5, 2, 3);
          vg.translate(x, y - 1, z + 0.15);
          leaf.push(paint(vg, 0x445a2c, 0.3));
        }
      }
    }
    // shrubs and grass tufts at the very foot
    for (let n = 0; n < 50; n++) {
      const x = X0 + 15 + r() * (X1 - X0 - 30);
      const sg = lumpy(0.8 + r() * 1.1, 7, 5, 0.3, i++);
      sg.scale(1.5, 0.75, 1.1);
      sg.translate(x, 0.6, -7 - r() * 1.5);
      leaf.push(paint(sg, greens[Math.floor(r() * greens.length)], 0.2, null, 0.45));
    }
    const lm = new THREE.Mesh(mergeGeometries(leaf), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    lm.receiveShadow = true;
    g.add(lm);
  }

  // ---- the Piasa mural -------------------------------------------------------
  // painted straight onto the rock: the canvas is transparent between the strokes
  const muralMat = painted(0xffffff, { roughness: 0.95, emissive: 0xffd9a8, emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -2, transparent: true, alphaTest: 0.08, depthWrite: false });
  muralMat.userData.night = 0.35;
  glow.push(muralMat);
  // John Wright's 1898 engraving in the mural's colours (js/ui/piasa.js);
  // your own artwork via ASSET_MANIFEST.piasa, or the drawn version, if not
  const MW = 38, MH = 20.5;
  const mural = new THREE.Mesh(new THREE.PlaneGeometry(MW, MH), muralMat);
  mural.position.set(0, (PANEL.y0 + PANEL.y1) / 2, PANEL.z + 0.12);
  mural.receiveShadow = true;
  g.add(mural);
  piasaEngravedCanvas(1600).then((c) => c || piasaCanvas(1024, 725)).then((c) => {
    if (c.width / c.height < 1.6) mural.scale.set(33 / MW, 23.3 / MH, 1); // the drawn version's proportions
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    muralMat.map = tex;
    muralMat.emissiveMap = tex;
    muralMat.needsUpdate = true;
  });

  // night: a soft floodlight wash over the panel (additive, faded by update)
  const washTex = canvasTex(256, 256, (c, w, h) => {
    const gr = c.createRadialGradient(w / 2, h * 0.62, 4, w / 2, h * 0.62, w * 0.5);
    gr.addColorStop(0, 'rgba(255,214,160,0.85)');
    gr.addColorStop(0.55, 'rgba(255,200,140,0.35)');
    gr.addColorStop(1, 'rgba(255,190,130,0)');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  });
  const washMat = new THREE.MeshBasicMaterial({ map: washTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(62, 46), washMat);
  wash.position.set(0, 27, -9.4);
  wash.renderOrder = 2;
  g.add(wash);
  // the flood fixtures at the foot of the bluff
  const fixMat = pbr('metal_plate', { scale: 0.6, tint: 0x2a2b2d, metal: 0.6 });
  const lensMat = painted(0x333333, { emissive: 0xffe2b0, emissiveIntensity: 0 });
  lensMat.userData.night = 2.5;
  glow.push(lensMat);
  for (const x of [-13, 13]) {
    const f = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.8, 10), fixMat);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.33, 12), lensMat);
    lens.position.y = 0.41; lens.rotation.x = -Math.PI / 2;
    f.add(body, lens);
    f.rotation.x = -0.55; f.rotation.z = x > 0 ? 0.25 : -0.25;
    f.position.set(x, 2.0, -7.2);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), fixMat);
    post.position.set(x, 1.35, -7.2);
    g.add(f, post);
  }

  // ---- caves, walkway and the Great River Road (from Tyler's photos) --------
  // Two dark cave arches open at the foot of the face either side of the
  // mural; a block retaining wall with a black railing and lamp posts runs
  // along the viewing walk; then the bike trail and four lanes of the Great
  // River Road between the bluff and the river.
  {
    const dark = new THREE.MeshBasicMaterial({ color: 0x0d0b09 });
    const lip = pbr('sandstone_blocks_08', { scale: 1.2, tint: 0xf0e6d4, bright: 1.15 });
    for (const cx of [-31, 31]) {
      const W = 9.5, H = 13.5;
      const sh = new THREE.Shape();
      sh.moveTo(-W / 2, 0); sh.lineTo(-W / 2, H - W / 2); sh.absarc(0, H - W / 2, W / 2, Math.PI, 0, true); sh.lineTo(W / 2, 0); sh.closePath();
      const z = planZ(cx) + 0.6;
      const mouth = new THREE.Mesh(new THREE.ShapeGeometry(sh, 16), dark);
      mouth.position.set(cx, 0.2, z);
      g.add(mouth);
      // the weathered rim of the opening
      const rim = new THREE.Mesh(new THREE.TorusGeometry(W / 2 + 0.5, 0.7, 6, 20, Math.PI), lip);
      rim.position.set(cx, 0.2 + H - W / 2, z + 0.1);
      g.add(rim);
      for (const sx of [-1, 1]) g.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, H - W / 2, 1.2), lip).translateX(cx + sx * (W / 2 + 0.5)).translateY(0.2 + (H - W / 2) / 2).translateZ(z));
    }
    // retaining wall (split-face block), railing and lamps along the walk
    const block = new THREE.MeshStandardMaterial({
      roughness: 1,
      map: canvasTex(256, 64, (c, w, h) => {
        const r = seeded(31);
        c.fillStyle = '#a49f94'; c.fillRect(0, 0, w, h);
        for (let row = 0; row < 3; row++) for (let i = -1; i < 9; i++) {
          const v = 150 + r() * 40;
          c.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
          c.fillRect(i * 32 + (row % 2) * 16 + 1, row * 21 + 1, 30, 19);
        }
      }, [16, 1]),
    });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(150, 1.1, 0.6), block);
    wall.position.set(0, 0.55, -5.2);
    wall.receiveShadow = true; wall.castShadow = true;
    g.add(wall);
    const black = pbr('metal_plate', { scale: 0.8, tint: 0x24262a, metal: 0.55 });
    for (const y of [1.55, 2.05]) g.add(new THREE.Mesh(new THREE.BoxGeometry(150, 0.05, 0.05), black).translateY(y).translateZ(-5.2));
    const nPost = 76;
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 1.0, 0.05), black, nPost);
    const pm = new THREE.Matrix4();
    for (let i = 0; i < nPost; i++) { pm.makeTranslation(-75 + i * 2, 1.6, -5.2); posts.setMatrixAt(i, pm); }
    g.add(posts);
    const lampGlass = painted(0xf4efe2, { emissive: 0xffd9a0, emissiveIntensity: 0 });
    lampGlass.userData.night = 2.2;
    glow.push(lampGlass);
    for (const x of [-58, -30, 30, 58]) {
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 5.2, 8), black).translateX(x).translateY(2.6 + 1.1).translateZ(-5.6));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.35), lampGlass).translateX(x).translateY(6.55).translateZ(-5.6));
    }
    // the paved walk between the wall and the rock
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(150, 4).rotateX(-Math.PI / 2), pbr('brushed_concrete', { scale: 3, tint: 0xd8d2c8, offset: -1 }));
    walk.position.set(0, 1.1, -7.4);
    g.add(walk);

    // bike trail (the Sam Vadalabene trail) and four lanes of the Great River Road
    const trail = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, 3).rotateX(-Math.PI / 2), pbr('asphalt_02', { scale: 4, tint: 0xa0a4a8, offset: -1 }));
    trail.position.set(0, 0.05, -2.9);
    trail.receiveShadow = true;
    g.add(trail);
    const roadTex = canvasTex(128, 512, (c, w, h) => {
      const r = seeded(4);
      c.fillStyle = '#38393b'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 5000; i++) { const v = 42 + r() * 40; c.fillStyle = `rgba(${v},${v},${v + 2},0.6)`; c.fillRect(r() * w, r() * h, 1, 1); }
      c.fillStyle = '#e9e6dc'; c.fillRect(2, 0, 2.4, h); c.fillRect(w - 4.4, 0, 2.4, h); // edge lines
      c.fillStyle = '#d9b43a'; c.fillRect(w / 2 - 3, 0, 2, h); c.fillRect(w / 2 + 1, 0, 2, h); // double yellow
      c.fillStyle = '#e9e6dc';
      for (let y = 0; y < h; y += 128) { c.fillRect(w * 0.25 - 1, y, 2, 40); c.fillRect(w * 0.75 - 1, y, 2, 40); } // lane dashes (10 ft of 40)
    }, [1, 1]);
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9 });
    const LEN = X1 - X0, RW = 14.6;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(LEN, RW).rotateX(-Math.PI / 2), roadMat);
    // map the texture's long axis along the road (x)
    const ruv = road.geometry.attributes.uv;
    for (let i = 0; i < ruv.count; i++) { const u = ruv.getX(i), v = ruv.getY(i); ruv.setXY(i, v, u * (LEN / 12)); }
    roadTex.wrapT = THREE.RepeatWrapping;
    road.position.set(0, 0.06, -1.4 + RW / 2);
    road.receiveShadow = true;
    g.add(road);
    // W-beam guard rail on the river side
    const steel = pbr('metal_plate', { scale: 1, tint: 0xb8bcc0, metal: 0.75 });
    const railZ = -1.4 + RW + 0.9;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(LEN - 20, 0.32, 0.06), steel).translateY(0.62).translateZ(railZ));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(LEN - 20, 0.05, 0.14), steel).translateY(0.62).translateZ(railZ));
    const postMat = pbr('metal_plate', { scale: 0.8, tint: 0x8a8e92, metal: 0.55 });
    const nP = Math.floor((LEN - 20) / 1.9);
    const rposts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.78, 0.15), postMat, nP);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < nP; i++) { m4.makeTranslation(X0 + 10 + i * 1.9 + 0.95, 0.39, railZ + 0.12); rposts.setMatrixAt(i, m4); }
    rposts.castShadow = false;
    g.add(rposts);
    // a grassy verge toward the river/golf side
    const verge = new THREE.Mesh(new THREE.PlaneGeometry(LEN, 8).rotateX(-Math.PI / 2), mat(0x587a38, { roughness: 1 }));
    verge.position.set(0, 0.03, railZ + 4.4);
    verge.receiveShadow = true;
    g.add(verge);
  }

  // ---- Piasa Park across the road: its lot, the stone restroom, and visitors ----
  // The little park on the river side of the Great River Road, where people
  // pull in to look at the painting; on the golfer's side of the guard rail.
  {
    const lotM = pbr('asphalt_02', { scale: 4, tint: 0x8a8e94 });
    const stripe = mat(0xeeeeea, { roughness: 0.8 });
    const LX0 = 64, LX1 = 124, LZ0 = 19, LZ1 = 37;
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(LX1 - LX0, LZ1 - LZ0).rotateX(-Math.PI / 2), lotM);
    lot.position.set((LX0 + LX1) / 2, 0.09, (LZ0 + LZ1) / 2);
    lot.receiveShadow = true;
    g.add(lot);
    // its drive from the road, and a row of stalls along the back
    const drive = new THREE.Mesh(new THREE.PlaneGeometry(8, 7).rotateX(-Math.PI / 2), lotM);
    drive.position.set(LX0 + 6, 0.085, 15.5);
    g.add(drive);
    const lines = [];
    for (let x = LX0 + 14; x <= LX1 - 2; x += 2.7) lines.push(new THREE.BoxGeometry(0.12, 0.02, 5.2).translate(x, 0.11, LZ1 - 2.8), new THREE.BoxGeometry(0.12, 0.02, 5.2).translate(x, 0.11, LZ0 + 8.2));
    g.add(new THREE.Mesh(mergeGeometries(lines), stripe));
    const spots = [];
    let rc = seeded(1100);
    for (let x = LX0 + 15.35; x < LX1 - 2; x += 2.7) {
      if (rc() < 0.65) spots.push([x, 0.1, LZ1 - 2.8, rc() < 0.5 ? 0 : Math.PI]);
      if (rc() < 0.5) spots.push([x, 0.1, LZ0 + 8.2, rc() < 0.5 ? 0 : Math.PI]);
    }
    carsAt(spots, rc, { max: 30 }).then((cg) => cg && g.add(cg));
    // the restroom: limestone walls to match the bluff, a hipped standing-seam roof
    const stone = pbr('sandstone_blocks_08', { scale: 1.4, tint: 0xe2d6c0 });
    const roofM = pbr('metal_plate', { scale: 1.5, tint: 0x3d4a40, metal: 0.4 });
    const rr = new THREE.Group();
    rr.add(new THREE.Mesh(new THREE.BoxGeometry(9, 3.2, 5.4), stone).translateY(1.6));
    rr.add(new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(10.6, 2.0, 7), roofM).translateY(3.2));
    const door = mat(0x4a3a2a, { roughness: 0.7 });
    for (const dx of [-2.2, 2.2]) rr.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.1), door).translateX(dx).translateY(1.1).translateZ(2.72));
    const sign = new THREE.MeshStandardMaterial({ map: canvasTex(256, 64, (c, w, h) => { c.fillStyle = '#2f4a36'; c.fillRect(0, 0, w, h); c.font = 'bold 30px Helvetica'; c.fillStyle = '#f2ead2'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('RESTROOMS', w / 2, h / 2 + 2); }), roughness: 0.8 });
    rr.add(new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), sign).translateY(2.75).translateZ(2.75));
    rr.position.set(LX0 - 4, 0, LZ0 + 9);
    rr.rotation.y = Math.PI / 2;
    rr.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.add(rr);
    // a picnic shelter beside it
    const wood = pbr('brown_planks_08', { scale: 2 });
    const sh = new THREE.Group();
    for (const [px, pz] of [[-3.5, -2.5], [3.5, -2.5], [-3.5, 2.5], [3.5, 2.5]]) sh.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.8, 0.3), wood).translateX(px).translateY(1.4).translateZ(pz));
    sh.add(new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(9, 1.8, 7), roofM).translateY(2.8));
    for (const pz of [-1, 1]) sh.add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.9), wood).translateY(0.75).translateZ(pz * 1.1));
    sh.position.set(LX0 - 18, 0, LZ0 + 9);
    sh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.add(sh);
    // visitors: along the viewing walk and at its rail, looking up at the painting; round the lot and shelter
    const people = [];
    for (let i = 0; i < 26; i++) { const x = -60 + rc() * 120; people.push([x, 1.1, -6.6 - rc() * 1.4, Math.PI + (rc() - 0.5) * 0.6]); }
    for (let i = 0; i < 10; i++) { const x = -40 + rc() * 80; people.push([x, 0.05, -2.9 + (rc() - 0.5) * 1.6, rc() < 0.5 ? Math.PI / 2 : -Math.PI / 2]); } // on the bike trail
    for (let i = 0; i < 12; i++) { const x = LX0 - 24 + rc() * 40, z = LZ0 + 2 + rc() * 14; people.push([x, 0.08, z, Math.PI + (rc() - 0.5) * 1.6]); }
    const crowd = crowdAt(people, rc);
    if (crowd) g.add(crowd);
  }

  // ---- bald eagles soaring along the bluff --------------------------------
  const birds = [];
  {
    const dark = mat(0x3a2a1d, { roughness: 0.85, side: THREE.DoubleSide });
    const white = mat(0xf1eee6, { roughness: 0.7 });
    const beak = mat(0xe0a826, { roughness: 0.6 });
    const wingShape = new THREE.Shape();
    // right wing in the XZ plane (x outward, -z forward): broad, with fingered primaries
    wingShape.moveTo(0, 0.18); wingShape.lineTo(0.35, 0.3); wingShape.lineTo(0.85, 0.28);
    wingShape.lineTo(1.05, 0.22); wingShape.lineTo(1.18, 0.05); wingShape.lineTo(1.12, -0.03);
    wingShape.lineTo(1.2, -0.12); wingShape.lineTo(1.08, -0.15); wingShape.lineTo(1.12, -0.25);
    wingShape.lineTo(0.95, -0.27); wingShape.lineTo(0.6, -0.3); wingShape.lineTo(0.25, -0.22); wingShape.lineTo(0, -0.2);
    const wingGeo = new THREE.ShapeGeometry(wingShape).rotateX(Math.PI / 2);
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6).scale(1, 0.9, 3), dark);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), white);
      head.position.set(0, 0.04, -0.5);
      const bk = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 6).rotateX(-Math.PI / 2), beak);
      bk.position.set(0, 0.02, -0.64);
      const tail = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.08, 0), new THREE.Vector2(0.08, 0), new THREE.Vector2(0.16, 0.38), new THREE.Vector2(-0.16, 0.38)])).rotateX(Math.PI / 2), white);
      tail.position.set(0, 0, 0.38);
      const wl = new THREE.Group(), wr = new THREE.Group();
      wr.add(new THREE.Mesh(wingGeo, dark));
      const lm = new THREE.Mesh(wingGeo, dark); lm.scale.x = -1; wl.add(lm);
      b.add(body, head, bk, tail, wl, wr);
      b.scale.setScalar(1.25); // ~2.3 m wingspan
      b.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      g.add(b);
      birds.push({ b, wl, wr, cx: -40 + k * 45, cz: -22 + k * 2, rad: 34 + k * 14, h: 60 + k * 7, sp: (0.11 + k * 0.03) * (k % 2 ? -1 : 1), ph: k * 2.1 });
    }
  }

  // ---- a towboat working the river across the hole (placed on the hole's water by fit) ----
  const towG = tow(glow);
  towG.rotation.y = Math.PI / 2; // running along the river, across the line of play
  towG.visible = false;
  g.add(towG);
  const river = { x0: -420, x1: 420, z: 0, y: 0, ok: false };

  return {
    pad: true, // stands on a flat base: the course levels the ground under it
    group: g,
    glow,
    trees: treeList,
    fit(holder, T) {
      // the river channel is the hole's water: find its middle and level in this frame
      holder.updateMatrix();
      const Li = holder.matrix.clone().invert(), w = new THREE.Vector3();
      for (const f of [0.5, 0.45, 0.55, 0.4, 0.6]) {
        const p = T.pointAt(T.length * f), tr = T.terrain(p.x, p.z);
        if (tr.surface !== 'water') continue;
        w.set(p.x, tr.height, p.z).applyMatrix4(Li);
        river.z = w.z; river.y = w.y; river.ok = true;
        break;
      }
      towG.visible = river.ok;
      towG.position.set(-200, river.y + 0.2, river.z - 12);
    },
    update(t, dt, day) {
      if (river.ok) { towG.position.x = -300 + ((t * 2.2) % 600); }
      washMat.opacity = 0.6 * (1 - day);
      wash.visible = day < 0.98;
      for (const e of birds) {
        const a = e.ph + t * e.sp;
        const s = Math.sign(e.sp);
        e.b.position.set(e.cx + Math.cos(a) * e.rad, e.h + Math.sin(t * 0.23 + e.ph) * 4, e.cz + Math.sin(a) * Math.min(26, e.rad * 0.5));
        e.b.rotation.set(0, -a + (s > 0 ? Math.PI : 0), 0);
        e.b.rotateZ(-0.32 * s);
        const flex = 0.08 + Math.sin(t * 1.3 + e.ph) * 0.04 + Math.max(0, Math.sin(t * 0.4 + e.ph * 3) - 0.85) * 2.2 * Math.sin(t * 9);
        e.wr.rotation.z = flex; e.wl.rotation.z = -flex;
      }
    },
  };
}
