// Builds and swaps the 3-D scenery for one hole of the Confluence Course:
// ground mesh (mown stripes, rough, bunkers, green), ponds and creeks, tee
// markers, flag, tree lines, night floodlights and the hole's landmark.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HoleTerrain } from './holeTerrain.js';
import { buildLandmark, setLandmarkDay } from './landmarks.js';
import { createWaterMaterial, waterMaterials } from '../scene/river.js';
import { pbr, painted } from '../scene/pbr.js';
import { shoreLife, ellipseRing } from '../scene/shore.js';
import { bulkheads } from './bulkhead.js';
import { buildSurf } from '../scene/surf.js';
import { courseLife } from './courseLife.js';
import { makeFlag, lightConeMaterial } from '../scene/rangeProps.js';
import { CUP } from '../core/physics.js';
import { buildCup, cupRing, cutHoles } from '../scene/cup.js';
import { greenMarks } from '../scene/greenMarks.js';
import { loadEquipment } from '../scene/models.js';
import { plantTrees, updateTrees, THEME_TREES, treesFor, slotHasModel } from '../scene/trees.js';
import { tuftGeometry, grassMaterial, GRASS } from './grass.js';

/** Rough-grass tufts and shrubs are drawn out to these distances from the camera (m). */
const GRASS_FAR = 110;
const SHRUB_FAR = 260;
const FESCUE_FAR = 220;
import { buildCity } from './buildings.js';
import { dressLots } from './streetlife.js';
import { dressScenery } from './scenery.js';
import { buildDecay } from './decay.js';
import { mergeByMaterial } from '../scene/merge.js';
import { dressPinFlag, flagpole, fireworks } from './usa.js';
import { Wildlife } from './wildlife.js'; // [wildlife]

const C = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const COL = {
  // well-kept turf as it photographs: lime fairways, a deeper, cooler rough, bright greens, cream sand
  fwA: C(0.41, 0.62, 0.25), fwB: C(0.35, 0.56, 0.21),
  rough: C(0.25, 0.43, 0.18), deep: C(0.2, 0.35, 0.15),
  green: C(0.44, 0.71, 0.29), greenB: C(0.4, 0.67, 0.27), fringe: C(0.36, 0.6, 0.23),
  sand: C(0.93, 0.87, 0.72), tee: C(0.38, 0.6, 0.25), bed: C(0.3, 0.32, 0.22),
  // under the water: silt at the margin, olive mud, then the dark of deep water; the wet bank above it
  bedShallow: C(0.42, 0.37, 0.25), bedMid: C(0.2, 0.23, 0.14), bedDeep: C(0.1, 0.15, 0.13), wetBank: C(0.2, 0.22, 0.13),
  cut: C(0.31, 0.51, 0.2), // the first cut: between fairway and rough
};

// Natural ground beyond the golf (the real-terrain backdrop), per course theme.
const PALETTES = {
  parkland: { grass: C(0.27, 0.42, 0.17), scrub: C(0.22, 0.34, 0.15), rock: C(0.5, 0.47, 0.4), rockSlope: 0.6 },
  // short-grass prairie in late summer: cured buffalo and grama grass, sage,
  // and the buff Brule siltstone and Gering sandstone of the bluffs
  western: { grass: C(0.66, 0.55, 0.32), scrub: C(0.46, 0.47, 0.34), rock: C(0.8, 0.71, 0.56), rockSlope: 0.42,
    rough: C(0.44, 0.47, 0.24), deep: C(0.6, 0.53, 0.31) }, // the rough is the prairie, cured and tawny
  // Provençal garrigue on white Urgonian limestone, red Cap Canaille cliffs
  coastal: { grass: C(0.4, 0.43, 0.26), scrub: C(0.3, 0.36, 0.22), rock: C(0.84, 0.8, 0.72), rockSlope: 0.45,
    rough: C(0.32, 0.45, 0.2), deep: C(0.42, 0.45, 0.26), shore: C(0.86, 0.8, 0.66) },
  urban: { grass: C(0.3, 0.42, 0.2), scrub: C(0.38, 0.38, 0.35), rock: C(0.55, 0.52, 0.48), rockSlope: 0.6, shore: C(0.42, 0.4, 0.34) },
  // East St. Louis: worn bottomland turf, weedy verges, gravel and river mud
  industrial: { grass: C(0.34, 0.44, 0.21), scrub: C(0.43, 0.42, 0.32), rock: C(0.52, 0.5, 0.46), rockSlope: 0.5,
    rough: C(0.29, 0.43, 0.18), deep: C(0.36, 0.42, 0.22), shore: C(0.45, 0.41, 0.33), bare: C(0.44, 0.38, 0.29) },
  // the Bois de Boulogne: deep parkland greens under oak and chestnut
  paris: { grass: C(0.27, 0.41, 0.17), scrub: C(0.24, 0.35, 0.16), rock: C(0.55, 0.52, 0.46), rockSlope: 0.6,
    shore: C(0.5, 0.47, 0.4) },
  // a links-style harbor course: wispy fescue beyond the short grass
  harbor: { grass: C(0.52, 0.53, 0.31), scrub: C(0.4, 0.45, 0.27), rock: C(0.56, 0.54, 0.5), rockSlope: 0.5,
    rough: C(0.3, 0.46, 0.2), deep: C(0.5, 0.52, 0.3), shore: C(0.58, 0.55, 0.47), fescue: C(0.6, 0.56, 0.36) },
  // a course's `links: true` (Whistling Straits): fine fescue on sand dunes and
  // clay bluffs over a freshwater beach; the rough runs straight into tawny fescue
  links: { grass: C(0.56, 0.54, 0.33), scrub: C(0.42, 0.45, 0.27), rock: C(0.66, 0.6, 0.5), rockSlope: 0.55,
    rough: C(0.36, 0.46, 0.22), deep: C(0.55, 0.53, 0.32), shore: C(0.82, 0.76, 0.62), fescue: C(0.62, 0.57, 0.37) },
};
/** The natural-ground palette for a hole: its course's links look, else its theme's. */
const paletteFor = (hole) => PALETTES[hole.links ? 'links' : hole.theme] || PALETTES.parkland;

/** Links fescue grows in drifts: 0..1, a low-frequency field over the ground. */
const fescueDrift = (x, z) => 0.5 + 0.5 * Math.sin(x * 0.045 + Math.sin(z * 0.03) * 2.2) * Math.cos(z * 0.05 - x * 0.017);
/** How far into the fescue (x, z) is: 0 at the edge of the deep rough, 1 out in the dunes. */
function fescueDepth(T, x, z) {
  const pr = T.project(x, z);
  const edge = T.fwHalf > 0 && pr.s > T.fwStart && pr.s < T.length ? T.fairwayHalf(pr.s) : 0;
  return THREE.MathUtils.smoothstep(Math.abs(pr.d) - edge, 6, 30) * THREE.MathUtils.smoothstep(T.greenEdge(x, z), 8, 22);
}

/** Scale the scene fog on one material (distant landmarks that should still read). */
function hazeLess(m, k) {
  // chained onto any shader edit the material already has (pbr.js surfaces)
  if (m.userData.hazeLess) return;
  m.userData.hazeLess = k;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.call(m);
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor * ${k.toFixed(2)} );
#endif`);
  };
  m.customProgramCacheKey = () => `${prevKey}|haze${k}`;
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class CourseWorld {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);
    // endless parkland under/around every hole
    this.base = new THREE.Mesh(
      new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2),
      pbr('grass_ground', { scale: 4, tint: 0x8fae74 }), // real turf, out past the edge of everything
    );
    this.base.position.y = -5;
    this.root.add(this.base);
    this.hole = null;
    this.T = null;
    this.day = 0;
    this.wind = 0.3;
    this.windFrom = 200;
    // turf and sand detail from Poly Haven scans (CC0; tools/blender/detail.py
    // turns them into luminance maps); procedural noise until they arrive
    const tl = new THREE.TextureLoader();
    const load = (url, tex) => { tl.load(url, (t) => { tex.image = t.image; tex.needsUpdate = true; }); return tex; };
    this.detail = load('assets/textures/ground_detail.jpg', this._detailTexture());
    this.sandDetail = load('assets/textures/sand_detail.jpg', this._detailTexture());
    // bunker sand and putting turf close up: photographed sets (Poly Haven sand_01 and grass_ground, CC0)
    const rep = (url, srgb) => { const t = tl.load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; return t; };
    this.sandPhoto = rep('assets/textures/pbr/sand_01_diff.jpg', true);
    this.sandNormal = rep('assets/textures/pbr/sand_01_nor_gl.jpg', false);
    this.turfPhoto = rep('assets/textures/pbr/grass_ground_diff.jpg', true);
  }

  _detailTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 200 + Math.random() * 55;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  setVisible(v) { this.root.visible = v; }

  /** Build hole `hole` (from HOLES). Returns its HoleTerrain. */
  load(hole) {
    for (const m of this.waterMats || []) { waterMaterials.delete(m); m.dispose(); }
    this.waterMats = [];
    if (this.holeGroup) {
      this.root.remove(this.holeGroup);
      this.holeGroup.traverse((o) => {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      });
    }
    this.hole = hole;
    this.chunkSets = null;
    this.rings = null;
    this._ringKey = null;
    this.ringTarget = 0;
    const T = (this.T = new HoleTerrain(hole));
    this.groundAt = (x, z) => T.drawnHeight(x, z); // the survey until the meshes exist, then the ground as drawn
    // the landmark is placed first so the ground under it can be levelled (pads)
    const lmPre = this._placeLandmark(hole, T);
    this._nearAt = null;
    this._nearPrev = null;
    this.streetLife = null;
    this.scenery = null;
    this.nearGrass = null;
    const g = (this.holeGroup = new THREE.Group());
    this.root.add(g);
    const rand = seeded(hole.n * 977);
    const b = T.bounds(200);
    const baseY = this.base.position.y;

    // ── ground mesh ── (sand and fairway edges from the surface mask, painted by the shader)
    this._buildSurfMask(T);
    this._underlay = true;
    const step = 2.2;
    const nx = Math.ceil((b.maxx - b.minx) / step) + 1;
    const nz = Math.ceil((b.maxz - b.minz) / step) + 1;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const sd = new Float32Array(nx * nz * 2); // arc length + lateral offset, for mowing patterns
    const fw = new Float32Array(nx * nz); // 1 on fairway / tee, for the stripes
    const sandA = new Float32Array(nx * nz); // 1 in bunkers, for the sand detail
    const rough = new Float32Array(nx * nz); // rough and native ground: coarser, patchier turf
    const dir = new Float32Array(nx * nz * 2); // the hole's direction, for the way the mowers lay the grass
    const c = new THREE.Color(), c2 = new THREE.Color();
    const sunk = [];
    const bx1 = b.minx + (nx - 1) * step, bz0 = b.maxz - (nz - 1) * step;
    this.base.visible = !T.F;
    let k = 0;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = b.minx + i * step, z = b.maxz - j * step;
        let h = T.meshHeight(x, z);
        const edge = Math.min(x - b.minx, bx1 - x, z - bz0, b.maxz - z);
        const ek = Math.min(1, Math.max(0, 1 - edge / 50));
        // real ground: settle onto the bare DEM at the edge, where the
        // backdrop picks up exactly the same vertices. Otherwise dive well
        // below the base plane so the two cross steeply instead of running
        // almost coplanar (a wide z-fighting band at distance)
        if (T.F) h += (T.baseGround(x, z) - h) * ek * ek * (3 - 2 * ek);
        else h += (baseY - 6 - h) * ek * ek;
        // under a bunker the coarse ground drops away (after its normals are taken, so the turf round
        // it shades as if nothing moved): the fine bunker mesh (_buildBunkers) is the surface there
        if (T.bunkers.length && this._sandSd(T, x, z, 1) < 0.4) sunk.push(k);
        pos.set([x, h, z], k * 3);
        uv.set([x * 0.15, z * 0.15], k * 2);
        const surf = this._colorAt(T, x, z, c);
        if (T.F && ek > 0 && surf !== 'water') c.lerp(this._backColor(T, x, z, h, 4, c2), ek * ek);
        col.set([c.r, c.g, c.b], k * 3);
        const prj = T.project(x, z);
        sd.set([prj.s, prj.d], k * 2);
        fw[k] = surf === 'tee' ? 0.7 : 0; // fairway mowing comes from the surface mask
        sandA[k] = 0; // sand comes from the surface mask
        rough[k] = surf === 'oob' ? 1 : surf === 'rough' ? (0.45 + 0.4 * T.roughGrade(x, z)) : surf === 'fairway' || surf === 'sand' ? 0.3 : 0;
        const pt = T.pointAt(Math.max(0, Math.min(T.length, prj.s)));
        dir.set([pt.dx, pt.dz], k * 2);
        k++;
      }
    }
    const idx = [];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, bb = a + 1, cc = a + nx, d = cc + 1;
        idx.push(a, bb, cc, bb, d, cc);
      }
    }
    this._underlay = false;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aSD', new THREE.BufferAttribute(sd, 2));
    geo.setAttribute('aFw', new THREE.BufferAttribute(fw, 1));
    geo.setAttribute('aSand', new THREE.BufferAttribute(sandA, 1));
    geo.setAttribute('aRough', new THREE.BufferAttribute(rough, 1));
    geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    for (const v of sunk) pos[v * 3 + 1] -= 0.7;
    const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, map: this.detail });
    // Drawn per pixel: the mowing pattern (lengthwise passes with a faint
    // cross-cut; each pass lays the grass one way, so it reads light looking
    // with the lay and dark against it, and fades side-on, as real turf does),
    // the turf detail at two scales plus a slow patchiness, coarser in the
    // rough, and the sand grain in bunkers.
    groundMat.onBeforeCompile = (sh) => this._turfShader(sh);
    groundMat.customProgramCacheKey = () => 'courseGround';
    const ground = new THREE.Mesh(geo, groundMat);
    ground.receiveShadow = true;
    g.add(ground);
    if (T.F) this._buildBackdrop(T, g, pos, nx, nz);
    // the coarse mesh exactly as drawn (two triangles per cell, split b–c)
    const coarseH = (x, z) => {
      const fi = (x - b.minx) / step, fj = (b.maxz - z) / step;
      const i0 = Math.max(0, Math.min(nx - 2, Math.floor(fi))), j0 = Math.max(0, Math.min(nz - 2, Math.floor(fj)));
      const fx = fi - i0, fy = fj - j0;
      const H = (i, j) => pos[(j * nx + i) * 3 + 1];
      const ha = H(i0, j0), hb = H(i0 + 1, j0), hc = H(i0, j0 + 1), hd = H(i0 + 1, j0 + 1);
      return fx + fy <= 1 ? ha + fx * (hb - ha) + fy * (hc - ha) : hd + (1 - fx) * (hc - hd) + (1 - fy) * (hb - hd);
    };
    // the coarse mesh's colour and (smoothed) normal at a point, so fine patches can meet it invisibly
    const nrm = geo.attributes.normal.array;
    const coarseAttr = (arr, x, z, out) => {
      const fi = (x - b.minx) / step, fj = (b.maxz - z) / step;
      const i0 = Math.max(0, Math.min(nx - 2, Math.floor(fi))), j0 = Math.max(0, Math.min(nz - 2, Math.floor(fj)));
      const fx = fi - i0, fy = fj - j0;
      const A = (i, j, c) => arr[(j * nx + i) * 3 + c];
      for (let c = 0; c < 3; c++) {
        const ha = A(i0, j0, c), hb = A(i0 + 1, j0, c), hc = A(i0, j0 + 1, c), hd = A(i0 + 1, j0 + 1, c);
        out[c] = fx + fy <= 1 ? ha + fx * (hb - ha) + fy * (hc - ha) : hd + (1 - fx) * (hc - hd) + (1 - fy) * (hb - hd);
      }
      return out;
    };
    const coarseCol = (x, z, out) => coarseAttr(col, x, z, out);
    const coarseNrm = (x, z, out) => coarseAttr(nrm, x, z, out);
    this._coarseH = coarseH;
    // the ground as drawn, everywhere: the hole mesh, then the backdrop rings out to the horizon. Anything
    // stood on the land (buildings, trees, people, carts, landmarks) is seated on this, not on the survey
    // beneath it, so nothing sinks into or floats over the triangles the player actually sees
    T.drawnHeight = (x, z) => {
      if (x >= b.minx && x <= bx1 && z >= bz0 && z <= b.maxz) return coarseH(x, z);
      return this._backH?.(x, z) ?? T.meshHeight(x, z);
    };
    this._buildGreen(T, g, coarseH, groundMat);
    this._buildBunkers(T, g, coarseH, coarseCol, coarseNrm);
    this._buildSlopeGrid(T, g);

    // ── water ──
    for (const p of T.ponds) {
      if (p.poly) {
        // the mapped outline, grown a few metres so the sheet runs under the banks
        const k = (p.poly.R + 3) / p.poly.R;
        const shape = new THREE.Shape(p.poly.pts.map(([x, z]) => new THREE.Vector2(p.x + (x - p.x) * k, -(p.z + (z - p.z) * k))));
        const m = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), this._water({ y: p.level, tint: 0x1d3036, clarity: Math.max(p.rx || 0, p.rz || 0, p.poly ? p.poly.R : 0) > 80 ? 0.15 : 0.55 }));
        m.position.y = p.level;
        g.add(m);
        continue;
      }
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), this._water({ y: p.level, tint: 0x1d3036, clarity: Math.max(p.rx || 0, p.rz || 0, p.poly ? p.poly.R : 0) > 80 ? 0.15 : 0.55 }));
      m.scale.set(p.rx * 1.02, 1, p.rz * 1.02);
      m.rotation.y = Math.atan2(p.dirx, p.dirz);
      m.position.set(p.x, p.level, p.z);
      g.add(m);
    }
    // the life at its edges: cattails, reeds, lily pads, duckweed
    if (T.ponds.length && !hole.noShore) {
      const rings = T.ponds.map((p) => ({ pts: p.poly ? p.poly.pts : ellipseRing(p), level: p.level }));
      const skip = (x, z) => T.greenEdge(x, z) < 6 || Math.hypot(x, z) < 12;
      g.add(shoreLife(rings, { skip, budget: this.r?.quality?.pixelRatio < 1.5 ? 500 : 900, chunked: this._chunked.bind(this) }));
    }
    // Pete Dye's railroad-tie bulkheads where the water meets a green
    if (hole.bulkheads) {
      let bs = 97 + (hole.n || 1) * 13;
      g.add(bulkheads(T, () => ((bs = (bs * 16807) % 2147483647) / 2147483647)));
    }
    // the course in use: cart path, carts, the next group, spectators, tee furniture
    {
      let ls = 31 + (hole.n || 1) * 7;
      const lr = () => ((ls = (ls * 16807) % 2147483647) / 2147483647);
      g.add(courseLife(T, hole, { style: hole.life || 'club', rnd: lr }));
    }
    for (const cr of T.creeks) {
      const pt = T.pointAt(cr.s);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(T.oobLateral * 2 + 200, cr.half * 2 + 1).rotateX(-Math.PI / 2), this._water({ y: cr.level, tint: 0x24332c, flow: 0.8, clarity: 0.6 }));
      m.rotation.y = Math.atan2(pt.dx, pt.dz);
      m.position.set(pt.x, cr.level, pt.z);
      g.add(m);
    }

    // the sea or a river at its real level: one wide sheet of water; the
    // real ground (and the hole mesh) runs down beneath it at the shore
    if (T.seaLevel != null) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(9000, 96).rotateX(-Math.PI / 2), this._water({ y: T.seaLevel, tint: hole.waterTint ?? 0x1f3a48, clarity: 0.35 }));
      m.position.set(0, T.seaLevel, 0);
      g.add(m);
    }

    // ── tee markers + pin ──
    const teeY = T.teeHeight;
    const markerMat = painted(0xf2f2f2, { roughness: 0.4 }); // stands in until the modelled marker loads
    // tee markers a few yards ahead of the ball, out of the address camera's face
    const markers = [];
    for (const sx of [-3.2, 3.2]) {
      const mk = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), markerMat);
      mk.position.set(sx, teeY + 0.08, -3.4);
      mk.castShadow = true;
      g.add(mk);
      markers.push(mk);
    }
    // the modelled marker (tools/blender/green_details.py): turned walnut, a band in the tees' colour (blue,
    // the regular men's tees), a brass top, pushed into the turf on its spike, each turned its own way
    loadEquipment('teemarker.glb').then((scn) => {
      const src = scn?.getObjectByName('marker');
      if (!src || this.hole !== hole) return;
      for (const [i, mk] of markers.entries()) {
        const m = src.clone();
        m.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = o.receiveShadow = true;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          o.material = mats.map((x) => { if (x.name !== 'band') return x; const b = x.clone(); b.color.set(0x1f4a9c); return b; });
          if (o.material.length === 1) o.material = o.material[0];
        });
        m.position.set(mk.position.x, this.groundAt(mk.position.x, mk.position.z) - 0.004, mk.position.z);
        m.rotation.y = i * 2.1 + 0.4;
        g.remove(mk);
        g.add(m);
      }
    });
    const pinY = T.groundHeight(T.pin.x, T.pin.z);
    this.cupY = pinY;
    // flagstick stands in the cup (its foot sits on the cup bottom)
    this.flag = makeFlag(0xffd54a, 2.4 + CUP.depth, 0.9);
    this.flag.position.set(T.pin.x, pinY - CUP.depth, T.pin.z);
    this.flag.userData.baseY = pinY - CUP.depth;
    this.flag.userData.setNumber?.(hole.n || 1);
    this.flag.userData.out = 0;
    this.flag.userData.outTarget = 0;
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._beaconTex || (this._beaconTex = this._beaconTexture()), color: new THREE.Color(1.6, 1.3, 0.5),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false,
    }));
    beacon.scale.set(0.016, 0.016, 1);
    beacon.position.y = 2.4 + CUP.depth;
    this.flag.add(beacon);
    this.flag.userData.beacon = beacon;
    g.add(this.flag);
    // the Statue of Liberty course flies the Stars and Stripes
    this.flagpoles = [];
    this.fireworks?.userData.dispose?.();
    this.fireworks = null;
    if (hole.theme === 'harbor') {
      dressPinFlag(this.flag);
      const spots = [[-11, -3], [11, -3]]; // either side of the tee, in view at address
      const gb = [T.green.x - T.finalDir.x * (T.greenR + 16) * -1 + T.finalRight.x * 10, T.green.z - T.finalDir.z * (T.greenR + 16) * -1 + T.finalRight.z * 10];
      spots.push(gb);
      for (const [x, z] of spots) {
        const fp = flagpole(x === gb[0] ? 14 : 11);
        fp.position.set(x, this.groundAt(x, z), z);
        fp.rotation.y = ((this.windFrom + 90) * Math.PI) / 180;
        g.add(fp);
        this.flagpoles.push(fp);
      }
      // fireworks out over the water toward the Statue
      const st = (hole.far || []).find((f) => f.type === 'statueofliberty');
      if (st && T.F) {
        const [lx, lz] = T.F.toLocal(st.dem[0], st.dem[1]);
        const k = 0.6; // between the course and the island
        this.fireworks = fireworks(new THREE.Vector3(lx * k, T.seaLevel ?? 0, lz * k));
        g.add(this.fireworks);
      }
    }
    const cup = buildCup();
    cup.position.set(T.pin.x, pinY, T.pin.z);
    g.add(cup);
    // ball marks: a fresh one wherever a ball lands on the green (game.js), and a few old ones the
    // players before you repaired, mostly where approaches land, short of and round the pin
    this.marks = greenMarks((x, z) => this.visualHeight(x, z), COL.green);
    g.add(this.marks.group);
    if (T.green) {
      const rm = seeded((hole.n || 1) * 977 + 13);
      const back = T.pointAt(Math.max(0, T.length - 1)), fx = T.pin.x - back.x, fz = T.pin.z - back.z, fl = Math.hypot(fx, fz) || 1;
      for (let k = 0, tries = 0; k < 5 + Math.floor(rm() * 4) && tries < 60; tries++) {
        const a = rm() * Math.PI * 2, r = (0.15 + rm() * 0.75) * T.greenR;
        const x = T.green.x + Math.cos(a) * r, z = T.green.z + Math.sin(a) * r;
        if (T.greenEdge(x, z) > -1.2 || Math.hypot(x - T.pin.x, z - T.pin.z) < 1.5) continue; // (greenEdge is negative inside)
        this.marks.add(x, z, fx / fl + (rm() - 0.5) * 0.6, fz / fl + (rm() - 0.5) * 0.6, 'repaired');
        k++;
      }
    }
    this.ring = cupRing();
    this.ring.position.set(T.pin.x, pinY + 0.004, T.pin.z);
    g.add(this.ring);
    this.pinLight = new THREE.PointLight(0xffd9a0, 0, 26, 1.6);
    this.pinLight.position.set(T.pin.x, pinY + 6, T.pin.z);
    g.add(this.pinLight);

    // ── landmark (placed before the ground: see _placeLandmark) ──
    this.landmark = lmPre.lm;
    const holder = lmPre.holder;
    g.add(holder);
    // a landmark laid on its own real ground meets the hole's here (and keeps
    // its far-flung parts out of the footprint that keeps trees off it)
    this.landmark.fit?.(holder, T);
    // the landmark's own trees, planted with the course's real models below
    const lmTrees = [];
    const takeTrees = (lm, h, far) => {
      if (!lm.trees?.length) return;
      h.updateMatrix(); lm.group.updateMatrix();
      const M = h.matrix.clone().multiply(lm.group.matrix), k = M.getMaxScaleOnAxis(), v = new THREE.Vector3();
      for (const t of lm.trees) {
        v.set(t.x, t.y, t.z).applyMatrix4(M);
        lmTrees.push({ ...t, x: v.x, y: v.y, z: v.z, h: t.h * k, crown: t.crown * k, far: far || !!t.far });
      }
    };
    takeTrees(this.landmark, holder, false);

    // far landmarks on their true bearing. One beyond ~2 km would be a
    // speck lost in the haze, so it is drawn at 2 km on the same bearing
    // at true size (and hazed less), the way the eye picks it out on the horizon.
    this.farLms = [];
    if (T.F) {
      for (const f of hole.far || []) {
        const lm = buildLandmark(f.type);
        if (!lm.update) mergeByMaterial(lm.group);
        let [x, z] = T.F.toLocal(f.dem[0], f.dem[1]);
        const d = Math.hypot(x, z);
        const D = Math.min(d, f.maxD ?? 2000);
        x *= D / d; z *= D / d;
        const h = new THREE.Group();
        h.add(lm.group);
        h.position.set(x, this.groundAt(x, z) + (f.dy || 0), z);
        // far landmarks are modelled in map axes (+x east, +z south): turn them
        // into the hole's frame, plus any extra turn the course asks for
        h.rotation.y = T.F.bearing + (f.rot || 0);
        if (f.scale) h.scale.setScalar(f.scale);
        g.add(h);
        // one laid out on the real map stands on the course's ground (see lm/riverfront.js)
        lm.fit?.(h, T, { course: true });
        for (const m of lm.haze || []) hazeLess(m, 0.55);
        takeTrees(lm, h, true);
        this.farLms.push(lm);
      }
    }
    // the real city round the course (OpenStreetMap footprints and heights)
    if (T.F && hole.buildings && T.F.d?.city) {
      const city = buildCity(T.F.d.city, T, hole.buildings, hole.cityPull || null);
      for (const m of city.haze) hazeLess(m, hole.buildings === 'nyc' ? 0.35 : 0.7);
      g.add(city.group);
      this.farLms.push(city);
    }

    // keep trees and masts out of the landmark's footprint
    const lmBox = new THREE.Box3().setFromObject(holder).expandByScalar(5);
    // (and out of what a map-wide landmark covers: a vineyard's parcels, say)
    const occupiers = (this.farLms || []).filter((l) => l.occupies);
    const inLandmark = (x, z) => (x > lmBox.min.x && x < lmBox.max.x && z > lmBox.min.z && z < lmBox.max.z) || occupiers.some((l) => l.occupies(x, z));

    // ── trees: natural stands of oak, maple, sycamore and cedar ──
    this.treeGrid = new Map();
    this.treeList = [];
    const treeSpots = [];
    const ok = (x, z, clear) => {
      const pr = T.project(x, z);
      if (Math.abs(pr.d) < clear) return false;
      if (T.greenEdge(x, z) < 24) return false;
      if (Math.hypot(x, z) < 22) return false;
      if (inLandmark(x, z)) return false;
      if (T.seaLevel != null && T.meshHeight(x, z) < T.seaLevel + 1.2) return false; // not in the sea
      const sf = T.terrain(x, z).surface;
      return sf !== 'water' && sf !== 'sand' && sf !== 'green' && sf !== 'fairway' && sf !== 'tee';
    };
    const plant = (x, z, variant, big = 1) => {
      treeSpots.push({
        x, z, y: this.groundAt(x, z) - 0.25, variant, rot: rand() * 6.28,
        scale: (0.78 + rand() * 0.5) * big, squash: 0.85 + rand() * 0.3,
        hue: 0.23 + rand() * 0.07, sat: rand(), light: rand(),
      });
    };
    const TT = treesFor(hole);
    const quality = (this.treeDensity ?? 1) * TT.density;
    const pickBroad = () => TT.broad[Math.floor(rand() * TT.broad.length)];
    const pickConifer = () => TT.conifer[Math.floor(rand() * TT.conifer.length)];
    const anySpecies = () => (rand() < 0.5 ? pickBroad() : pickConifer());
    const corridor = Math.max(T.fwHalf, 14);
    // on real ground, conifers take the slopes and broadleaves the low,
    // wetter ground (cottonwoods follow the draws in the West)
    const bySite = (x, z) => {
      if (!T.F) return rand() < 0.22 ? pickConifer() : pickBroad();
      const e = 6;
      const sl = Math.hypot(T.baseGround(x + e, z) - T.baseGround(x - e, z), T.baseGround(x, z + e) - T.baseGround(x, z - e)) / (2 * e);
      const low = T.baseGround(x, z) < T.elevAt(Math.min(1, Math.max(0, T.project(x, z).s / T.length))) - 1.5;
      if (low) return rand() < 0.75 ? pickBroad() : pickConifer();
      return rand() < (TT.conifersFirst ? 0.75 + sl : 0.22 + sl) ? pickConifer() : pickBroad();
    };
    // surveyed trees (tools/fetch-trees.py: LiDAR tree tops) replace the
    // made-up stands where a course has them: every tree near the hole at its
    // real spot, height and crown; beyond play the tallest of each clump
    const surveyed = T.F?.d?.trees?.trees || null;
    const surveyX = surveyed ? T.F.d.dem.halfX - 4 : 0, surveyZ = surveyed ? T.F.d.dem.halfZ - 4 : 0;
    const inSurvey = (x, z) => {
      const [X, Z] = T.F.toDem(x, z);
      return Math.abs(X) < surveyX && Math.abs(Z) < surveyZ;
    };
    if (surveyed) {
      // one tree per cell stands in for its clump: finer near the hole, coarse
      // out toward the boundary (keeps the forest near the procedural count)
      const cell = 14 / Math.sqrt(this.treeDensity ?? 1);
      const clumps = new Map();
      const spot = (x, z, y, h, crown, conifer, far) => ({
        x, z, y, variant: conifer ? pickConifer() : pickBroad(), rot: rand() * 6.28, height: h, crown,
        scale: 1, squash: 1, hue: 0.23 + rand() * 0.07, sat: rand(), light: rand(), far,
      });
      for (const [X, Z, h, crown, conifer] of surveyed) {
        const [x, z] = T.F.toLocal(X, Z);
        if (inLandmark(x, z)) continue;
        const pr = T.project(x, z);
        const out = Math.max(Math.abs(pr.d) - corridor - 80, -70 - pr.s, pr.s - T.length - 70);
        if (out < 0) {
          // in play: keep the trunk off the short grass and out of hazards
          // (a trunk there is an outline that doesn't quite match the survey)
          const sf = T.terrain(x, z).surface;
          if (sf === 'water' || sf === 'sand' || sf === 'green' || sf === 'fairway' || sf === 'tee') continue;
          if (Math.hypot(x, z) < 8 || T.greenEdge(x, z) < 3) continue;
          treeSpots.push(spot(x, z, this.groundAt(x, z) - 0.25, h, crown, conifer, false));
        } else {
          const k = out < 150 ? cell : cell * 2.6;
          const key = `${k},${Math.floor(x / k)},${Math.floor(z / k)}`;
          const c = clumps.get(key);
          if (!c || h > c.h) clumps.set(key, { x, z, h, crown: Math.max(crown, k * 0.45), conifer });
        }
      }
      for (const c of clumps.values()) {
        if (T.seaLevel != null && T.baseGround(c.x, c.z) < T.seaLevel + 1.5) continue;
        treeSpots.push(spot(c.x, c.z, this.groundAt(c.x, c.z) - 0.25, c.h, c.crown, c.conifer, true));
      }
    } else {
      // stands along both sides: species-grouped clusters at varying depth
      for (const side of [-1, 1]) {
        for (let s = -30; s < T.length + 70; s += 15 + rand() * 16) {
          if (rand() < 0.1 + (1 - TT.density) * 0.35) continue; // glades (open country in the West)
          const pt = T.pointAt(s);
          // a front row at the edge of the rough, deeper woods behind it
          const depth = corridor + (rand() < 0.55 ? 12 + rand() * 22 : 34 + rand() * 60);
          const cx = pt.x + pt.rx * depth * side, cz = pt.z + pt.rz * depth * side;
          const n = Math.round((5 + rand() * 10) * quality);
          const rad = 8 + rand() * 16;
          const species = bySite(cx, cz);
          for (let i = 0; i < n; i++) {
            const a = rand() * 6.28, r = Math.sqrt(rand()) * rad;
            const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
            if (!ok(x, z, corridor + 14)) continue;
            plant(x, z, rand() < 0.8 ? species : anySpecies());
          }
        }
        // a dark backdrop belt toward the boundary (parkland only: the West stays open)
        if (TT.density >= 0.8) {
          for (let s = -40; s < T.length + 90; s += 9 + rand() * 7) {
            const pt = T.pointAt(s);
            const depth = T.oobLateral - 8 + rand() * 40;
            const x = pt.x + pt.rx * depth * side, z = pt.z + pt.rz * depth * side;
            if (ok(x, z, corridor + 30)) plant(x, z, rand() < 0.3 ? pickConifer() : pickBroad(), 1.15);
          }
        }
      }
      // specimen trees that come into play a little off the fairway
      for (let s = 150; s < T.length - 60; s += 70 + rand() * 60) {
        const side = rand() < 0.5 ? -1 : 1;
        const pt = T.pointAt(s);
        const d = corridor + 6 + rand() * 8;
        const x = pt.x + pt.rx * d * side, z = pt.z + pt.rz * d * side;
        if (ok(x, z, corridor + 4)) plant(x, z, T.F ? bySite(x, z) : rand() < 0.5 ? 0 : 3, 1.25);
      }
      // the hole's own stands (dogleg corners, framing); `species` indexes the
      // theme's broadleaf list (0..) or conifers (4+, as on the Confluence)
      for (const st of hole.trees || []) {
        const pt = T.pointAt(st.t * T.length);
        const cx = pt.x + pt.rx * st.off, cz = pt.z + pt.rz * st.off;
        for (let i = 0; i < (st.n || 8); i++) {
          const a = rand() * 6.28, r = Math.sqrt(rand()) * (st.r || 12);
          const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
          const sp = st.species == null ? bySite(x, z) : TT === THEME_TREES.parkland ? st.species : st.species >= 4 ? pickConifer() : pickBroad();
          if (ok(x, z, Math.max(T.fwHalf + 3, 8))) plant(x, z, sp, 1.1);
        }
      }
    }
    // real ground: scattered trees on the land beyond the hole too, so the
    // course doesn't end in a clearing (no collision needed out there)
    if (T.F) {
      const b2 = T.bounds(200);
      const far = [];
      const R = 900;
      const cx = (b2.minx + b2.maxx) / 2, cz = (b2.minz + b2.maxz) / 2;
      const N = Math.round(2800 * (this.treeDensity ?? 1) * TT.density * (TT.scatter ?? 0.5));
      for (let i = 0; i < N * 3 && far.length < N; i++) {
        const x = cx + (rand() * 2 - 1) * R, z = cz + (rand() * 2 - 1) * R;
        if (x > b2.minx && x < b2.maxx && z > b2.minz && z < b2.maxz) continue;
        if (inLandmark(x, z)) continue;
        if (surveyed && inSurvey(x, z)) continue; // the survey has the real ones
        if (T.seaLevel != null && T.baseGround(x, z) < T.seaLevel + 1.5) continue; // the sea and the beach stay clear
        // clumps: keep a point only where a low-frequency field is high
        const f = 0.5 + 0.5 * Math.sin(x * 0.011 + Math.sin(z * 0.007) * 3) * Math.cos(z * 0.013 - x * 0.004);
        if (rand() > f * f) continue;
        far.push({ x, z });
      }
      for (const p of far) {
        treeSpots.push({ x: p.x, z: p.z, y: this.groundAt(p.x, p.z) - 0.25, variant: bySite(p.x, p.z), rot: rand() * 6.28,
          scale: 0.75 + rand() * 0.5, squash: 0.85 + rand() * 0.3, hue: 0.23 + rand() * 0.07, sat: rand(), light: rand(), far: true });
      }
    }
    // landmark trees: the species the builder asked for when its model is
    // loaded, else one of the course's own
    for (const t of lmTrees) {
      const variant = t.slot != null && slotHasModel(t.slot) ? t.slot : t.conifer ? pickConifer() : pickBroad();
      treeSpots.push({ x: t.x, z: t.z, y: t.y - 0.1, variant, rot: rand() * 6.28, height: t.h, crown: t.crown,
        scale: 1, squash: 1, hue: 0.23 + rand() * 0.07, sat: rand(), light: rand(), far: t.far });
    }
    const forest = plantTrees(treeSpots);
    g.add(forest.group);
    for (const t of forest.records) {
      if (t.far) continue;
      t.id = this.treeList.length;
      this.treeList.push(t);
      // a crown can reach into the neighbouring 20 m cells: file it in each
      for (let gx = Math.floor((t.x - t.r) / 20); gx <= Math.floor((t.x + t.r) / 20); gx++) {
        for (let gz = Math.floor((t.z - t.r) / 20); gz <= Math.floor((t.z + t.r) / 20); gz++) {
          const key = `${gx},${gz}`;
          if (!this.treeGrid.has(key)) this.treeGrid.set(key, []);
          this.treeGrid.get(key).push(t);
        }
      }
    }

    // ── East St. Louis: the decay beyond the boundary (never in play) ──
    if (hole.theme === 'industrial') {
      const cor = Math.max(T.fwHalf, 14);
      const clear = (x, z) => {
        if (inLandmark(x, z)) return true;
        const pr = T.project(x, z);
        if (Math.abs(pr.d) < cor + 30 && pr.s > -40 && pr.s < T.length + 50) return true;
        if (T.greenEdge(x, z) < 40 || Math.hypot(x, z) < 40) return true;
        return T.terrain(x, z).surface === 'water';
      };
      // static: fences, poles, containers and warehouses draw one call per material
      const decay = mergeByMaterial(buildDecay(T, rand, this.groundAt, clear));
      g.add(decay);
      // the wrecks, the lowriders and the people round them, in the lots
      this.streetLife = dressLots(decay.userData.lots || [], rand, this.groundAt);
      g.add(this.streetLife.group);
    }

    // ── scenery beyond play: herds and wagons, boats and sea stacks, crowds ──
    this.scenery = dressScenery(T, hole, rand, this.groundAt, buildLandmark);
    // [wildlife] the course's animals (js/course/wildlife.js): placed by the ground they need, kept out of play
    this.wildlife = null;
    if (typeof document !== 'undefined') {
      let ws = 53 + (hole.n || 1) * 11;
      const wr = () => ((ws = (ws * 16807) % 2147483647) / 2147483647);
      this.wildlife = new Wildlife(T, hole, { ground: this.groundAt, trees: this.treeList, rnd: wr, quality: this.r?.quality?.pixelRatio < 1.5 ? 0.7 : 1 });
      this.wildlife.setDay(this.day);
      g.add(this.wildlife.group);
    }
    // surf on a rocky coast: the wash at the rocks and the breakers rolling in
    this.surf = null;
    if (hole.theme === 'coastal' && T.seaLevel != null) {
      const mid = T.pointAt(T.length / 2);
      this.surf = buildSurf(T, { cx: mid.x, cz: mid.z, half: Math.max(420, T.length * 0.6 + 220) });
      if (this.surf) g.add(this.surf.group);
    }
    g.add(this.scenery.group);
    if (this.scenery.glow.length) this.farLms.push({ group: this.scenery.group, glow: this.scenery.glow });

    // ── long grass in the rough: tufts thicken away from the fairway ──
    this._buildRoughGrass(T, g, rand, b);
    if (hole.theme === 'harbor' || hole.links) this._buildFescue(T, g, rand);
    if ((hole.theme === 'western' || hole.theme === 'coastal') && !hole.links) this._buildShrubs(T, g, rand, hole.theme);

    // ── yardage stakes: 100 red, 150 white, 200 blue, 250 yellow (to the green) ──
    this._buildStakes(T, g);

    // ── night floodlights along the hole ──
    this.floods = [];
    this.poles = [];
    this.mastMeshes = []; // shown only after dark: by day a course has no light towers
    this.coneMat = lightConeMaterial(0xffc58a, 0.04);
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xffd29a });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x23262b, metalness: 0.6, roughness: 0.5 });
    const spots = [0.35, 0.62, 0.86, 1.0].filter((t) => t * T.length > 60);
    spots.forEach((t, i) => {
      const side = i % 2 ? 1 : -1;
      const pt = T.pointAt(t * T.length);
      const off = Math.max(T.fwHalf, 14) + 26;
      let x = pt.x + pt.rx * off * side, z = pt.z + pt.rz * off * side;
      if (inLandmark(x, z)) { x = pt.x - pt.rx * off * side; z = pt.z - pt.rz * off * side; }
      if (T.terrain(x, z).surface === 'water') return; // no masts standing in a river
      const y0 = this.groundAt(x, z);
      this.poles.push({ x, z });
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 20, 8), poleMat);
      mast.position.set(x, y0 + 10, z);
      g.add(mast);
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 0.4), this.lampMat);
      head.position.set(x, y0 + 20.4, z);
      head.lookAt(pt.x, y0 + 20, pt.z);
      g.add(head);
      this.mastMeshes.push(mast, head);
      const target = new THREE.Vector3(pt.x - pt.dx * 10, T.meshHeight(pt.x, pt.z), pt.z - pt.dz * 10);
      const spot = new THREE.SpotLight(0xffc890, 2600, 220, 0.7, 0.8, 1.7);
      spot.position.set(x, y0 + 20, z);
      spot.target.position.copy(target);
      g.add(spot, spot.target);
      this.floods.push(spot);
    });

    this.setDay(this.day);
    this.setWind(this.wind, this.windFrom);
    return T;
  }

  /**
   * Build the hole's landmark and place it beside the hole. The ground under
   * it is then levelled to its base: a
   * pad on the terrain over its footprint, eased out toward the field of play,
   * so walls, roads and plazas stand on the ground instead of in it. A
   * landmark can give its own footprint (`pads`: local [x0, x1, z0, z1]
   * rects) or opt out (`pad: false`); one that drapes itself on the ground
   * (fit) is left alone unless it asks.
   */
  _placeLandmark(hole, T) {
    const lmSpec = hole.lm;
    const lm = buildLandmark(lmSpec.type);
    // a set piece with no moving parts draws one call per material
    if (!lm.update) mergeByMaterial(lm.group);
    const holder = new THREE.Group();
    holder.add(lm.group);
    let lx, lz;
    if (lmSpec.onCreek && T.creeks.length) {
      const pt = T.pointAt(T.creeks[0].s);
      lx = pt.x + pt.rx * (lmSpec.at[0] || -75);
      lz = pt.z + pt.rz * (lmSpec.at[0] || -75);
      holder.position.set(lx, T.creeks[0].level - 1, lz);
    } else {
      lx = T.green.x + T.finalRight.x * lmSpec.at[0] - T.finalDir.x * lmSpec.at[1];
      lz = T.green.z + T.finalRight.z * lmSpec.at[0] - T.finalDir.z * lmSpec.at[1];
      holder.position.set(lx, T.drawnHeight(lx, lz) - 0.3, lz);
    }
    holder.rotation.y = Math.atan2(-T.finalDir.x, -T.finalDir.z) + (lmSpec.rot || 0);
    holder.scale.setScalar(lmSpec.scale || 1);
    holder.updateMatrix();
    const wantPad = !lmSpec.onCreek && lm.pad !== false && (lm.pads || lm.pad === true || !lm.fit);
    if (wantPad) {
      let rects = lm.pads;
      if (!rects) {
        // the footprint of what stands on the ground (not the sky: birds, mist, far haze)
        const box = new THREE.Box3(), bb = new THREE.Box3();
        lm.group.updateMatrixWorld(true);
        lm.group.traverse((o) => {
          if (!(o.isMesh || o.isInstancedMesh) || !o.geometry) return;
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
          bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
          if (bb.min.y > 6 || bb.max.y < -3) return;
          box.union(bb);
        });
        rects = box.isEmpty() ? [] : [[box.min.x - 2, box.max.x + 2, box.min.z - 2, box.max.z + 2]];
      }
      // levelled just under the set piece's base (its local y = 0); a landmark's own
      // pads may be plain rects or {rects | poly, dy} (dy below its base: a riverbed)
      const inv = holder.matrix.clone().invert().elements, k = holder.scale.y;
      T.pads = (rects.length && !Array.isArray(rects[0]) ? rects : [{ rects }])
        .filter((q) => q.rects?.length || q.poly)
        .map((q) => ({ inv, rects: q.rects, poly: q.poly, y: holder.position.y - 0.04 + (q.dy || 0) * k, feather: q.feather ?? 10 }));
    }
    return { lm, holder };
  }

  /**
   * Real-ground courses: the land beyond the hole out to the horizon, from
   * the course DEM. A ring mesh whose inner loop is the hole mesh's own
   * border (same vertices, same heights), so the two meet with no seam or
   * overlap; rings grow geometrically outward to ~7 km.
   */
  _buildBackdrop(T, g, pos, nx, nz) {
    const loop = [];
    for (let i = 0; i < nx; i++) loop.push(i);
    for (let j = 1; j < nz; j++) loop.push(j * nx + nx - 1);
    for (let i = nx - 2; i >= 0; i--) loop.push((nz - 1) * nx + i);
    for (let j = nz - 2; j >= 1; j--) loop.push(j * nx);
    const L = loop.length;
    const P = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    const x0 = pos[0], x1 = pos[(nx - 1) * 3], z1 = pos[2], z0 = pos[((nz - 1) * nx) * 3 + 2];
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hw = (x1 - x0) / 2, hd = (z1 - z0) / 2;
    const ds = [0];
    for (let d = 0, inc = 2.5; d < 7000; inc *= 1.17) { d += inc; ds.push(d); }
    const R = ds.length;
    const vp = new Float32Array(R * L * 3), vc = new Float32Array(R * L * 3), vu = new Float32Array(R * L * 2);
    const c = new THREE.Color();
    // Sentinel-2 colour takes over from the drawn palette with distance, so the
    // land beyond the course is the real land: fields, towns, forest, scrub
    const sat = T.F.d?.sat || null;
    const su = sat ? new Float32Array(R * L * 2) : null, sk = sat ? new Float32Array(R * L) : null;
    const satSize = sat ? sat.meta.size : 1;
    for (let r = 0; r < R; r++) {
      const d = ds[r];
      const ks = sat ? 0.9 * THREE.MathUtils.smoothstep(d, 40, 520) : 0;
      const sx = (hw + d) / hw, sz = (hd + d) / hd;
      const spacing = Math.max(4, (ds[r + 1] ?? d * 1.2) - d);
      for (let k = 0; k < L; k++) {
        const [px, py, pz] = P(loop[k]);
        const x = cx + (px - cx) * sx, z = cz + (pz - cz) * sz;
        const y = r === 0 ? py : T.baseGround(x, z);
        vp.set([x, y, z], (r * L + k) * 3);
        vu.set([x / 18, z / 18], (r * L + k) * 2);
        this._backColor(T, x, z, y, spacing, c);
        if (sat) {
          const [X, Z] = T.F.toDem(x, z);
          const v = r * L + k;
          su[v * 2] = X / satSize + 0.5; su[v * 2 + 1] = 0.5 - Z / satSize;
          // cliffs keep their rock colour: from above, satellites see the tops, not the faces
          const e = Math.max(4, spacing * 0.5);
          const sl = Math.hypot(T.baseGround(x + e, z) - T.baseGround(x - e, z), T.baseGround(x, z + e) - T.baseGround(x, z - e)) / (2 * e);
          sk[v] = sat.inside(X, Z) ? ks * (1 - THREE.MathUtils.smoothstep(sl, 0.45, 0.9)) : 0;
        }
        vc.set([c.r, c.g, c.b], (r * L + k) * 3);
      }
    }
    const idx = [];
    for (let r = 0; r < R - 1; r++) {
      for (let k = 0; k < L; k++) {
        const a = r * L + k, b = r * L + ((k + 1) % L), a2 = a + L, b2 = b + L;
        idx.push(a, a2, b, b, a2, b2);
      }
    }
    // keep the faces pointing up whichever way the loop runs
    {
      const v = (i) => new THREE.Vector3(vp[i * 3], vp[i * 3 + 1], vp[i * 3 + 2]);
      const [a, b2, c2] = [v(idx[0]), v(idx[1]), v(idx[2])];
      if (b2.sub(a).cross(c2.sub(a)).y < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vp, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(vc, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(vu, 2));
    if (sat) { geo.setAttribute('satUv', new THREE.BufferAttribute(su, 2)); geo.setAttribute('satK', new THREE.BufferAttribute(sk, 1)); }
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // the backdrop exactly as drawn: each ring is the hole's border rectangle grown by ds[r], so a point
    // maps straight back to its ring (by how far out it is) and its segment (by where it falls round the loop)
    {
      // where a point on the ring rectangle (half sizes ax, az) falls round the loop, 0..1. Rings scale the
      // border, so the normalised position (u, w) is the same on every ring: measure it in the border's sizes
      const tOf = (x, z, ax, az) => {
        const u = (x - cx) / ax, w = (z - cz) / az * Math.sign(z1 - cz);
        let t;
        if (Math.abs(w) >= Math.abs(u)) t = w > 0 ? (u + 1) * hw : 2 * hw + 2 * hd + (1 - u) * hw;
        else t = u > 0 ? 2 * hw + (1 - w) * hd : 4 * hw + 2 * hd + (w + 1) * hd;
        return t / (4 * hw + 4 * hd);
      };
      const tk = new Float64Array(L);
      for (let k = 0; k < L; k++) { const [px, , pz] = P(loop[k]); tk[k] = tOf(px, pz, hw, hd); }
      for (let k = 1; k < L; k++) if (tk[k] < tk[k - 1]) tk[k] += 1; // unwrap
      const V = (i) => [vp[i * 3], vp[i * 3 + 1], vp[i * 3 + 2]];
      const inTri = (x, z, a, b, c) => {
        const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
        if (Math.abs(d) < 1e-9) return null;
        const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
        const l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
        const l3 = 1 - l1 - l2;
        return l1 > -1e-4 && l2 > -1e-4 && l3 > -1e-4 ? l1 * a[1] + l2 * b[1] + l3 * c[1] : null;
      };
      this._backH = (x, z) => {
        const d = Math.max(Math.abs(x - cx) - hw, Math.abs(z - cz) - hd);
        if (d < 0 || d >= ds[R - 1]) return null;
        let r = 0; while (r < R - 2 && ds[r + 1] <= d) r++;
        let t = tOf(x, z, hw + d, hd + d);
        if (t < tk[0]) t += 1;
        let lo = 0, hi = L - 1;
        while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tk[m] <= t) lo = m; else hi = m - 1; }
        for (const rr of [r, r - 1, r + 1]) {
          if (rr < 0 || rr >= R - 1) continue;
          for (const kk of [lo, lo - 1, lo + 1, lo - 2, lo + 2]) {
            const k = ((kk % L) + L) % L;
            const a = rr * L + k, bq = rr * L + ((k + 1) % L), a2 = a + L, b2 = bq + L;
            const h = inTri(x, z, V(a), V(a2), V(bq)) ?? inTri(x, z, V(bq), V(a2), V(b2));
            if (h != null) return h;
          }
        }
        return null;
      };
    }
    // the natural ground carries the same aerial-scan detail as the rough
    const bmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, map: this.detail });
    let satTex = null;
    if (sat) {
      satTex = sat.tex || (sat.tex = new THREE.Texture(sat.image));
      satTex.colorSpace = THREE.SRGBColorSpace;
      satTex.anisotropy = 8;
      satTex.needsUpdate = true;
    }
    bmat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
float bd = texture2D(map, vMapUv).r;
float bd2 = texture2D(map, vMapUv * 0.13 + 0.31).r;
diffuseColor.rgb *= 0.5 + 0.62 * mix(bd, bd2, 0.45);
#ifdef SAT_GROUND
  // Sentinel-2 true colour, lifted a touch: top-down albedo reads dark at grazing angles
  vec3 satC = texture2D(satMap, vSatUv).rgb * (0.82 + 0.4 * bd);
  diffuseColor.rgb = mix(diffuseColor.rgb, satC * 1.18, vSatK);
#endif`);
      if (satTex) {
        sh.defines = { ...(sh.defines || {}), SAT_GROUND: '' };
        sh.uniforms.satMap = { value: satTex };
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec2 satUv; attribute float satK; varying vec2 vSatUv; varying float vSatK;')
          .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSatUv = satUv; vSatK = satK;');
        sh.fragmentShader = '#define SAT_GROUND\nuniform sampler2D satMap; varying vec2 vSatUv; varying float vSatK;\n' + sh.fragmentShader;
      }
    };
    bmat.customProgramCacheKey = () => (satTex ? 'backdropGroundSat' : 'backdropGround');
    const mesh = new THREE.Mesh(geo, bmat);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    g.add(mesh);
    this.backdrop = mesh;
  }

  /**
   * The hole's surfaces as signed distances (m) in a texture, about 0.4 m a
   * pixel: sand (R) and fairway (G). The ground shader draws their edges from
   * it, crisp and anti-aliased at any distance, curves and all, instead of
   * from the 2.2 m mesh's vertex colours.
   */
  /** Signed distance (m) to one bunker's edge, negative in the sand; `cap` beyond it. */
  _bunkerSd(T, bk, x, z, cap = 4) {
    if (bk.poly) {
      const bb = bk.poly.box;
      if (x < bb.minx - cap || x > bb.maxx + cap || z < bb.minz - cap || z > bb.maxz + cap) return cap;
      return Math.min(cap, bk.poly.sd(x, z));
    }
    const q = T._ellipse(bk, x, z);
    return q < 4 ? Math.min(cap, (Math.sqrt(q) - 1) * Math.min(bk.rx, bk.rz)) : cap;
  }

  /** Signed distance (m) to the nearest bunker edge, negative in the sand. */
  _sandSd(T, x, z, cap = 4) {
    let d = cap;
    for (const bk of T.bunkers) d = Math.min(d, this._bunkerSd(T, bk, x, z, cap));
    return d;
  }

  _buildSurfMask(T) {
    const b = T.bounds(40);
    // half-float distances (true metres, no 8-bit steps): the sand and fairway outlines interpolate
    // as smooth curves at any distance instead of stepping with the texels
    let res = 0.3;
    const span = Math.max(b.maxx - b.minx, b.maxz - b.minz);
    if (span / res > 3072) res = span / 3072;
    const W = Math.ceil((b.maxx - b.minx) / res), H = Math.ceil((b.maxz - b.minz) / res);
    const data = new Uint16Array(W * H * 4);
    const half = THREE.DataUtils.toHalfFloat;
    const sandSd = (x, z) => this._sandSd(T, x, z);
    const fwPolys = T.fairwayPolys || [];
    for (let j = 0; j < H; j++) {
      const z = b.minz + (j + 0.5) * res;
      for (let i = 0; i < W; i++) {
        const x = b.minx + (i + 0.5) * res;
        const sd = sandSd(x, z);
        let fd = 6;
        if (fwPolys.length) {
          for (const p of fwPolys) { const bb = p.box; if (x < bb.minx - 6 || x > bb.maxx + 6 || z < bb.minz - 6 || z > bb.maxz + 6) continue; fd = Math.min(fd, p.sd(x, z)); }
        } else if (T.fwHalf > 0) {
          const pr = T.project(x, z);
          fd = Math.abs(pr.d) - T.fairwayHalf(Math.max(0, pr.s));
          fd = Math.max(fd, T.fwStart - pr.s, pr.s - T.length);
        }
        // the fairway stops at the collar and never runs under the sand
        fd = Math.max(fd, 1.8 - T.greenEdge(x, z), -sd);
        const k = (j * W + i) * 4;
        data[k] = half(sd);
        data[k + 1] = half(fd);
        data[k + 3] = half(1);
      }
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    if (this._surf?.tex) this._surf.tex.dispose();
    this._surf = { tex, box: new THREE.Vector4(b.minx, b.minz, W * res, H * res) };
    // the shared uniforms (both turf materials read these)
    this._surfU ||= { uMask: { value: null }, uMaskBox: { value: new THREE.Vector4() }, uFwCol: { value: new THREE.Color() }, uSandCol: { value: new THREE.Color() } };
    this._surfU.uMask.value = tex;
    this._surfU.uMaskBox.value.copy(this._surf.box);
    this._surfU.uFwCol.value.copy(COL.fwA).lerp(COL.fwB, 0.5);
    this._surfU.uSandCol.value.copy(COL.sand);
  }

  /**
   * The ground's per-pixel turf (shared by the hole mesh and the green patch,
   * so the two match exactly where they meet): mowing passes, two scales of
   * turf detail and slow mottling, coarser in the rough, sand grain in bunkers.
   */
  _turfShader(sh) {
    sh.uniforms.uSand = { value: this.sandDetail };
    sh.uniforms.uSandP = { value: this.sandPhoto };
    sh.uniforms.uSandN = { value: this.sandNormal };
    sh.uniforms.uTurfP = { value: this.turfPhoto };
    Object.assign(sh.uniforms, this._surfU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aSD;\nattribute float aFw;\nattribute float aSand;\nattribute float aRough;\nattribute vec2 aDir;\nvarying vec2 vSD;\nvarying float vFw;\nvarying float vSand;\nvarying float vRough;\nvarying vec2 vDir;\nvarying vec3 vWPos;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSD = aSD;\nvFw = aFw;\nvSand = aSand;\nvRough = aRough;\nvDir = aDir;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  // the sand's surface: grain from the photographed normal map, rake furrows ~6 mm deep
  // (screen-space bump: the furrow height's slope tilts the normal)
  if (sandM > 0.01) {
    vec3 sn = texture2D(uSandN, vWPos.xz / 0.85).xyz * 2.0 - 1.0;
    vec3 gn = normalize(vec3(sn.x, sn.z, -sn.y));           // tangent space laid flat (x east, z south)
    vec3 gv = normalize((viewMatrix * vec4(gn, 0.0)).xyz);
    float fade = 1.0 - smoothstep(0.02, 0.08, length(fwidth(vWPos.xz)));
    normal = normalize(mix(normal, gv, 0.45 * sandM * fade));
    float hgt = sandRake * 0.006;
    vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
    vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (dFdx(hgt) * r1 + dFdy(hgt) * r2);
    normal = normalize(mix(normal, normalize(abs(det) * normal - grad), sandM));
  }
}`)
      .replace('#include <common>', '#include <common>\nuniform sampler2D uSand;\nuniform sampler2D uSandP;\nuniform sampler2D uSandN;\nuniform sampler2D uTurfP;\nuniform sampler2D uMask;\nuniform vec4 uMaskBox;\nuniform vec3 uFwCol;\nuniform vec3 uSandCol;\nvarying vec2 vSD;\nvarying float vFw;\nvarying float vSand;\nvarying float vRough;\nvarying vec2 vDir;\nvarying vec3 vWPos;')
      .replace('#include <map_fragment>', `
float sandRake = 0.0;
vec4 texelColor = texture2D(map, vMapUv);
float big = texture2D(map, vMapUv * 0.19 + 0.37).r;
float mottle = texture2D(map, vMapUv * 0.027 + 0.61).r; // ~250 m: wear, moisture, clover
float detail = mix(texelColor.r, big, 0.4);
detail = mix(detail, texture2D(uSand, vMapUv * 2.2).r, vSand);
// mowing: 6 m passes down and back the hole, 12 m cross-cut passes
vec2 look = vWPos.xz - cameraPosition.xz;
look /= max(length(look), 1e-3);
vec2 t = normalize(vDir + 1e-5);
float lay = dot(look, t), layX = dot(look, vec2(-t.y, t.x));
float u = vSD.y / 6.0, w = vSD.x / 12.0;
float au = fwidth(u) * 0.75 + 1e-4, aw = fwidth(w) * 0.75 + 1e-4;
float passA = smoothstep(0.5 - au, 0.5 + au, abs(fract(u) - 0.5) * 2.0) * 2.0 - 1.0;
float passB = smoothstep(0.5 - aw, 0.5 + aw, abs(fract(w) - 0.5) * 2.0) * 2.0 - 1.0;
// stripes fade out where they'd shimmer (far away, grazing)
float keep = 1.0 - smoothstep(0.25, 0.6, au);
// the surfaces from the signed-distance mask: crisp, anti-aliased edges
vec2 muv = (vWPos.xz - uMaskBox.xy) / uMaskBox.zw;
float inBox = step(0.0, muv.x) * step(muv.x, 1.0) * step(0.0, muv.y) * step(muv.y, 1.0);
vec4 msk = texture2D(uMask, clamp(muv, 0.0, 1.0));
float sdS = mix(4.0, msk.r, inBox);
float sdF = mix(6.0, msk.g, inBox);
float aS = max(fwidth(sdS) * 0.9, 0.025), aF = max(fwidth(sdF) * 0.9, 0.04);
float sandM = 1.0 - smoothstep(-aS, aS, sdS);
float fwyM = (1.0 - smoothstep(-aF, aF, sdF)) * (1.0 - sandM);
detail = mix(detail, texture2D(uSand, vMapUv * 2.2).r, sandM);
float mow = max(vFw, fwyM);
float stripeF = 1.0 + keep * (passA * lay * 0.12 + passB * layX * 0.045);
float stripes = mix(1.0, stripeF, mow);
float turf = mix(0.72 + 0.54 * detail, 0.64 + 0.66 * detail, vRough * (1.0 - fwyM));
turf *= mix(0.9 + 0.18 * mottle, 0.84 + 0.3 * mottle, vRough * (1.0 - fwyM));
turf = mix(turf, 0.9 + 0.2 * detail, sandM);
diffuseColor.rgb *= stripes * turf;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  // fairway: its own colour over the first-cut underlay
  diffuseColor.rgb = mix(diffuseColor.rgb, uFwCol * stripes * turf, fwyM);
  // the turf lip's shadow, a hand's width outside the sand
  diffuseColor.rgb *= 1.0 - 0.2 * (1.0 - smoothstep(0.0, 0.8, sdS)) * step(0.0, sdS) * inBox;
  // sand: the photographed grain (two octaves, normalised), the face under the edge in shade,
  // and rake furrows down the line of the hole, swaying as a rake does, spent at the edges
  vec3 sph = texture2D(uSandP, vWPos.xz / 0.85).rgb * 0.62 + texture2D(uSandP, vWPos.xz / 3.4 + 0.31).rgb * 0.38;
  float sgl = dot(sph, vec3(0.299, 0.587, 0.114));
  vec2 rt = normalize(vDir + 1e-5), rp = vec2(-rt.y, rt.x);
  float ral = dot(vWPos.xz, rt);
  float rac = dot(vWPos.xz, rp) + 0.22 * sin(ral * 0.85) + 0.09 * sin(ral * 2.4 + 1.3);
  float tine = rac / 0.045;
  float rakeK = (1.0 - smoothstep(0.25, 0.8, fwidth(tine))) * smoothstep(0.25, 1.3, -sdS) * (0.55 + 0.45 * smoothstep(0.2, 0.7, texture2D(uSand, vWPos.xz * 0.05).r));
  float furrow = 0.5 + 0.5 * cos(tine * 6.2831853);
  sandRake = furrow * rakeK;
  vec3 sc = uSandCol * clamp(sgl / 0.47, 0.75, 1.25) * mix(vec3(1.0), sph / max(sgl, 1e-3), 0.25)
          * mix(0.78, 1.04, smoothstep(0.0, 1.8, -sdS)) * (0.92 + 0.1 * sandRake);
  diffuseColor.rgb = mix(diffuseColor.rgb, sc, sandM);
}`);
    }

  /** Colour of the natural ground (no golf) at a point: grass, scrub, or rock on steep faces. */
  _backColor(T, x, z, y, spacing, c) {
    const P = paletteFor(T.hole);
    const e = Math.max(2, spacing * 0.5);
    const gx = (T.baseGround(x + e, z) - T.baseGround(x - e, z)) / (2 * e);
    const gz = (T.baseGround(x, z + e) - T.baseGround(x, z - e)) / (2 * e);
    const slope = Math.hypot(gx, gz);
    const n1 = 0.5 + 0.5 * Math.sin(x * 0.013 + Math.cos(z * 0.011) * 2) * Math.cos(z * 0.017 - x * 0.004);
    const n2 = 0.5 + 0.5 * Math.sin(x * 0.071 + z * 0.053) * Math.sin(z * 0.067 - x * 0.031);
    c.copy(P.grass).lerp(P.scrub, THREE.MathUtils.smoothstep(n1 * 0.7 + n2 * 0.3, 0.35, 0.75));
    // a strip of shore (sand, shingle or mud) just above the water line
    // (a walled river, e.g. the Seine between its quays, has none)
    if (T.seaLevel != null && !T.hole.quays && y < T.seaLevel + 2.5) c.lerp(P.shore || COL.sand, THREE.MathUtils.smoothstep(T.seaLevel + 2.5 - y, 0, 2) * 0.85);
    let rock = P.rock;
    const zones = T.hole.rockZones;
    if (zones?.length) {
      const [X, Z] = T.F.toDem(x, z);
      for (const zn of zones) {
        const k = THREE.MathUtils.smoothstep(zn.r - Math.hypot(X - zn.dem[0], Z - zn.dem[1]), 0, zn.r * 0.35);
        if (k > 0) rock = (this._rz || (this._rz = new THREE.Color())).copy(P.rock).lerp(zn._c || (zn._c = new THREE.Color(zn.color)), k);
      }
    }
    c.lerp(rock, THREE.MathUtils.smoothstep(slope, P.rockSlope, P.rockSlope + 0.25));
    return c.multiplyScalar(0.94 + 0.12 * n2);
  }

  _colorAt(T, x, z, c) {
    const surf = this._colorAt0(T, x, z, c);
    // the water's bed by depth, and the wet strip of bank just above the water line
    const w = T._water(x, z, T.project(x, z));
    if (w && !w.sea) {
      const y = T.meshHeight(x, z), dep = w.level - y;
      if (dep > 0) {
        const k = THREE.MathUtils.smoothstep(dep, 0, 0.5), k2 = THREE.MathUtils.smoothstep(dep, 0.5, 1.4);
        c.copy(COL.bedShallow).lerp(COL.bedMid, k).lerp(COL.bedDeep, k2);
      } else if (dep > -0.6) c.lerp(COL.wetBank, 0.55 * (1 + dep / 0.6));
    }
    return surf;
  }

  _colorAt0(T, x, z, c) {
    const t = T.terrain(x, z);
    const pr = T.project(x, z);
    // the meshes paint the turf under sand and fairway; the shader lays those on crisply (_buildSurfMask)
    const paint = this._underlay && (t.surface === 'sand' || t.surface === 'fairway') ? 'rough' : t.surface;
    switch (paint) {
      case 'fairway': {
        c.copy(COL.fwA).lerp(COL.fwB, 0.5);
        // the last metre and a half of fairway eases toward the first cut: no hard mown line
        const e = T.fwHalf > 0 ? T.fairwayHalf(Math.max(0, pr.s)) - Math.abs(pr.d) : 9;
        if (e < 1.5) c.lerp(COL.cut, 0.35 * (1 - e / 1.5));
        break;
      }
      case 'green': {
        c.copy(COL.green);
        // the outer metre of the putting surface blends into the collar
        const ge = -T.greenEdge(x, z);
        if (ge < 1) c.lerp(COL.fringe, 0.4 * (1 - ge));
        break;
      }
      case 'fringe': c.copy(COL.fringe).lerp(COL.green, 0.25); break;
      case 'sand': {
        // the floor bright and clean; the face under the green-side lip in shade
        let q = 1, face = 0;
        for (const b of T.bunkers) {
          const bq = T._ellipse(b, x, z);
          if (bq < q) {
            q = bq;
            const gx = T.green.x - b.x, gz = T.green.z - b.z, ox = x - b.x, oz = z - b.z;
            face = Math.max(0, (ox * gx + oz * gz) / ((Math.hypot(ox, oz) || 1) * (Math.hypot(gx, gz) || 1)));
          }
        }
        c.copy(COL.sand).multiplyScalar(1.05 - 0.1 * q * q - 0.2 * face * THREE.MathUtils.smoothstep(q, 0.45, 1));
        break;
      }
      case 'tee': c.copy(COL.tee); break;
      case 'water': c.copy(COL.bed); break;
      default: {
        const P = paletteFor(T.hole);
        const deep = Math.min(1, Math.max(0, (Math.abs(pr.d) - Math.max(T.fwHalf, 12) - 8) / 30));
        c.copy(P.rough || COL.rough).lerp(P.deep || COL.deep, deep);
        // a first cut (about 2.5 m) along the fairway and round the green: the mown
        // edge graded into the rough instead of a hard line
        const fe = T.fwHalf > 0 && pr.s > T.fwStart - 6 && pr.s < T.length ? Math.abs(pr.d) - T.fairwayHalf(pr.s) : 99;
        const gEdge = T.greenEdge(x, z) - 1.8;
        const cut = Math.min(fe, gEdge);
        if (cut < 4.5) c.lerp(COL.cut, 0.7 * (1 - THREE.MathUtils.smoothstep(cut, 1.5, 4.5)));
        // the turf lip round a bunker: lush and a shade darker
        let bq = 9;
        for (const b of T.bunkers) bq = Math.min(bq, T._ellipse(b, x, z));
        if (bq < 1.6) c.multiplyScalar(0.9 + 0.1 * THREE.MathUtils.smoothstep(bq, 1, 1.6));
        // worn, bare ground breaking through the neglected rough
        if (P.bare) {
          const n = 0.5 + 0.5 * Math.sin(x * 0.09 + Math.sin(z * 0.07) * 2.3) * Math.cos(z * 0.11 - x * 0.05);
          c.lerp(P.bare, THREE.MathUtils.smoothstep(n, 0.62, 0.86) * deep * 0.85);
        }
        if (T.F) {
          // real-ground courses: the maintained rough gives way to the land
          // itself (an irregular edge, not a ruler line)
          const gd = T.greenEdge(x, z);
          const wob = 14 * Math.sin(x * 0.021 + z * 0.013) + 8 * Math.sin(z * 0.047 - x * 0.031);
          const w = THREE.MathUtils.smoothstep(Math.min(Math.abs(pr.d) - Math.max(T.fwHalf, 12), gd) + wob, 10, 46);
          if (w > 0) c.lerp(this._backColor(T, x, z, T.baseGround(x, z), 4, this._c3 || (this._c3 = new THREE.Color())), w);
        }
        // links: straw ground showing through the fescue drifts
        if (P.fescue) c.lerp(P.fescue, fescueDepth(T, x, z) * (0.3 + 0.6 * fescueDrift(x, z)));
      }
    }
    const n = 0.92 + 0.12 * Math.sin(x * 0.21 + z * 0.13) * Math.cos(z * 0.17);
    c.multiplyScalar(n);
    return t.surface;
  }

  /**
   * Bunkers out on the hole (the greenside ones are part of the green patch):
   * each its own fine mesh, 20 cm apart, so the lip, the face and the floor
   * are true curves however close the camera comes. The coarse ground is
   * dropped away under the sand; at the insert's rim (3-3.6 m out) its heights
   * ease onto the coarse mesh's, so the two meet without a seam.
   */
  _buildBunkers(T, g, coarseH, coarseCol, coarseNrm) {
    const STEP = 0.2, OUT = 3.6, EASE = 2.7;
    const list = T.bunkers.filter((bk) => !this._bunkerReach || this._bunkerReach(bk)[0] > (this._Rp ?? 0) + OUT + 0.5);
    if (!list.length) return;
    const pos = [], col = [], uv = [], sdA = [], fwA = [], sandA = [], roughA = [], dirA = [], idx = [], ease = [];
    const c = new THREE.Color(), cc3 = [0, 0, 0];
    const boxOf = (bk) => {
      let minx, maxx, minz, maxz;
      if (bk.poly) ({ minx, maxx, minz, maxz } = bk.poly.box);
      else { const r = Math.max(bk.rx, bk.rz); minx = bk.x - r; maxx = bk.x + r; minz = bk.z - r; maxz = bk.z + r; }
      return { minx: minx - OUT, maxx: maxx + OUT, minz: minz - OUT, maxz: maxz + OUT };
    };
    // bunkers in play (along the fairway corridor, round the green) keep the
    // fine lip; on a hole with whole fields of them (Whistling Straits) the
    // inserts coarsen just enough to hold to a budget of cells: the ones out
    // of play first, the ones in play to 0.3 m at most
    const inPlay = (bk) => { const pr = T.project(bk.x, bk.z); return pr.s > -20 && pr.s < T.length + 40 && Math.abs(pr.d) < Math.max(T.fwHalf, 15) + 25; };
    const area = (bx) => (bx.maxx - bx.minx) * (bx.maxz - bx.minz);
    let nearA = 0, farA = 0;
    for (const bk of list) (inPlay(bk) ? (nearA += area(boxOf(bk))) : (farA += area(boxOf(bk))));
    const BUDGET = 100000;
    // in play, the lip never opens past 0.3 m (the coarse ground is 2.2 m)
    const nearStep = Math.min(0.3, Math.max(STEP, Math.sqrt(nearA / (BUDGET * 0.75))));
    const nearCells = nearA / (nearStep * nearStep);
    const farStep = farA ? Math.min(0.6, Math.max(STEP, Math.sqrt(farA / Math.max(35000, BUDGET - nearCells)))) : STEP;
    this._underlay = true; // vertex colours are the turf under the sand: the mask paints the sand, per pixel
    for (const bk of list) {
      const { minx, maxx, minz, maxz } = boxOf(bk);
      const st = inPlay(bk) ? nearStep : farStep;
      const nx = Math.ceil((maxx - minx) / st) + 1, nz = Math.ceil((maxz - minz) / st) + 1;
      const base = pos.length / 3;
      const own = new Uint8Array(nx * nz);
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const x = minx + i * st, z = minz + j * st;
          const sd = this._bunkerSd(T, bk, x, z, OUT + 1);
          // this bunker's ground only (another bunker's insert has its own)
          own[j * nx + i] = sd < OUT && this._sandSd(T, x, z, OUT + 1) >= sd - 1e-6 ? 1 : 0;
          const ht = T.meshHeight(x, z);
          const w = THREE.MathUtils.smoothstep(sd, EASE, OUT);
          pos.push(x, ht + (coarseH(x, z) + 0.006 - ht) * w, z);
          ease.push(w);
          uv.push(x * 0.15, z * 0.15);
          const surf = this._colorAt(T, x, z, c);
          // toward the rim the colour becomes the coarse mesh's own, so the seam doesn't show
          coarseCol(x, z, cc3);
          col.push(c.r + (cc3[0] - c.r) * w, c.g + (cc3[1] - c.g) * w, c.b + (cc3[2] - c.b) * w);
          const prj = T.project(x, z);
          sdA.push(prj.s, prj.d);
          fwA.push(surf === 'tee' ? 0.7 : 0);
          sandA.push(0);
          roughA.push(surf === 'oob' ? 1 : surf === 'rough' ? (0.45 + 0.4 * T.roughGrade(x, z)) : surf === 'fairway' || surf === 'sand' ? 0.3 : 0);
          const pt = T.pointAt(Math.max(0, Math.min(T.length, prj.s)));
          dirA.push(pt.dx, pt.dz);
        }
      }
      for (let j = 0; j < nz - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
          const a = j * nx + i, b2 = a + 1, cc = a + nx, d = cc + 1;
          if (!(own[a] && own[b2] && own[cc] && own[d])) continue;
          idx.push(base + a, base + cc, base + b2, base + b2, base + cc, base + d);
        }
      }
    }
    this._underlay = false;
    if (!idx.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aSD', new THREE.Float32BufferAttribute(sdA, 2));
    geo.setAttribute('aFw', new THREE.Float32BufferAttribute(fwA, 1));
    geo.setAttribute('aSand', new THREE.Float32BufferAttribute(sandA, 1));
    geo.setAttribute('aRough', new THREE.Float32BufferAttribute(roughA, 1));
    geo.setAttribute('aDir', new THREE.Float32BufferAttribute(dirA, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // and the shading: normals ease onto the coarse mesh's across the rim band
    const N = geo.attributes.normal.array, nn = [0, 0, 0];
    for (let v = 0; v < ease.length; v++) {
      const w = ease[v];
      if (w <= 0) continue;
      coarseNrm(pos[v * 3], pos[v * 3 + 2], nn);
      const x = N[v * 3] + (nn[0] - N[v * 3]) * w, y = N[v * 3 + 1] + (nn[1] - N[v * 3 + 1]) * w, z = N[v * 3 + 2] + (nn[2] - N[v * 3 + 2]) * w;
      const l = Math.hypot(x, y, z) || 1;
      N[v * 3] = x / l; N[v * 3 + 1] = y / l; N[v * 3 + 2] = z / l;
    }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, map: this.detail, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    mat.onBeforeCompile = (sh) => this._turfShader(sh);
    mat.customProgramCacheKey = () => 'bunkerInsert';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    g.add(mesh);
  }

  /**
   * The green complex at full detail: a radial mesh centred on the cup (rings
   * from 5 cm to ~40 cm apart) with the real hole through it, true putting
   * surface heights, mowing stripes and slope shading. The coarse hole mesh
   * is cut away underneath and this patch blends into it at the edge.
   */
  _buildGreen(T, g, coarseH, groundMat) {
    const pin = T.pin;
    // reach every part of the green from the cup (mapped outlines can be long)
    let Rc = (T.greenPoly
      ? Math.max(...T.greenPoly.pts.map(([x, z]) => Math.hypot(x - pin.x, z - pin.z)))
      : Math.hypot(pin.x - T.green.x, pin.z - T.green.z) + T.greenR) + 12;
    const Rg = Rc; // the green's own reach, before its bunkers widen the patch
    // greenside bunkers belong to the patch, whole: reach past every bunker that comes near it
    const reach = (bk) => {
      const pts = bk.poly ? bk.poly.pts : [[bk.x, bk.z]];
      const ds = pts.map(([x, z]) => Math.hypot(x - pin.x, z - pin.z));
      const pad = bk.poly ? 0 : Math.max(bk.rx, bk.rz);
      return [Math.min(...ds) - pad, Math.max(...ds) + pad];
    };
    for (let pass = 0; pass < 2; pass++) {
      for (const bk of T.bunkers) {
        const [near, far] = reach(bk);
        if (near < Rc + 7.5) Rc = Math.min(75, Math.max(Rc, far + 4.5));
      }
    }
    this._Rc = Rc;
    const Rp = Rc + 3;
    this._Rp = Rp;
    this._bunkerReach = reach;
    const radii = [];
    for (let r = CUP.radius; r < Rp; ) {
      radii.push(r);
      // a patch widened past 45 m by a chain of bunkers (Whistling Straits' fields):
      // beyond the green's own reach the rings open out to the spokes' spacing
      r += Rc > 45 && r > Rg ? Math.max(0.24, r * 0.014) : Math.min(0.24, Math.max(0.012, r * 0.13));
    }
    radii.push(Rp);
    const NA = 448; // ~0.3 m between spokes at 40 m: the collar and greenside lips are true curves
    const nv = radii.length * NA;
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), grn = new Float32Array(nv);
    // the same per-vertex turf data as the hole mesh, so the patch matches it at the edge
    const sdA = new Float32Array(nv * 2), fwA = new Float32Array(nv), sandA = new Float32Array(nv), roughA = new Float32Array(nv), dirA = new Float32Array(nv * 2);
    const c = new THREE.Color();
    const L = { x: -0.62, z: -0.78 }; // light from the north-west
    this._underlay = true;
    let k = 0;
    for (const r of radii) {
      const wBlend = Math.min(1, Math.max(0, (r - (Rc - 4)) / 3.5));
      const ww = wBlend * wBlend * (3 - 2 * wBlend);
      for (let a = 0; a < NA; a++) {
        const th = (a / NA) * Math.PI * 2;
        const x = pin.x + Math.cos(th) * r, z = pin.z + Math.sin(th) * r;
        const ht = T.meshHeight(x, z);
        const h = ht + (coarseH(x, z) + 0.012 - ht) * ww;
        pos.set([x, h, z], k * 3);
        uv.set([x * 0.15, z * 0.15], k * 2);
        const surf = this._colorAt(T, x, z, c);
        if (surf === 'green' || surf === 'fringe') {
          // slope shading: faces tilted toward the light read brighter
          const e = 0.3;
          const gx = (T.meshHeight(x + e, z) - T.meshHeight(x - e, z)) / (2 * e);
          const gz = (T.meshHeight(x, z + e) - T.meshHeight(x, z - e)) / (2 * e);
          const shade = 1 + Math.max(-0.2, Math.min(0.2, (gx * L.x + gz * L.z) * 7));
          c.multiplyScalar(shade);
          grn[k] = surf === 'green' ? 1 : 0.35;
        }
        col.set([c.r, c.g, c.b], k * 3);
        const prj = T.project(x, z);
        sdA.set([prj.s, prj.d], k * 2);
        fwA[k] = 0;
        sandA[k] = 0;
        roughA[k] = surf === 'rough' ? (0.45 + 0.4 * T.roughGrade(x, z)) : surf === 'oob' ? 1 : 0;
        const pt = T.pointAt(Math.max(0, Math.min(T.length, prj.s)));
        dirA.set([pt.dx, pt.dz], k * 2);
        k++;
      }
    }
    this._underlay = false;
    const idx = [];
    for (let i = 0; i < radii.length - 1; i++) {
      for (let a = 0; a < NA; a++) {
        const a1 = (a + 1) % NA;
        const p0 = i * NA + a, p1 = i * NA + a1, q0 = (i + 1) * NA + a, q1 = (i + 1) * NA + a1;
        idx.push(p0, p1, q0, p1, q1, q0); // counter-clockwise seen from above
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aGreen', new THREE.BufferAttribute(grn, 1));
    geo.setAttribute('aSD', new THREE.BufferAttribute(sdA, 2));
    geo.setAttribute('aFw', new THREE.BufferAttribute(fwA, 1));
    geo.setAttribute('aSand', new THREE.BufferAttribute(sandA, 1));
    geo.setAttribute('aRough', new THREE.BufferAttribute(roughA, 1));
    geo.setAttribute('aDir', new THREE.BufferAttribute(dirA, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.9, map: this.detail, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    // crisp mowing stripes on the putting surface, across the line of play
    const dir = new THREE.Vector2(T.finalDir.x, T.finalDir.z);
    mat.onBeforeCompile = (sh) => {
      // the ground's own turf shading, then crisp stripes on the putting surface
      this._turfShader(sh);
      sh.uniforms.uStripe = { value: dir };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aGreen;\nvarying float vGreen;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGreen = aGreen;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec2 uStripe;\nvarying float vGreen;')
        .replace('diffuseColor.rgb *= stripes * turf;', `// close up, the putting turf's own grain: short dense blades (photographed), fading out with distance
float tpl = dot(texture2D(uTurfP, vWPos.xz / 0.55).rgb * 0.6 + texture2D(uTurfP, vWPos.xz / 2.1 + 0.5).rgb * 0.4, vec3(0.299, 0.587, 0.114));
float near = 1.0 - smoothstep(0.015, 0.06, length(fwidth(vWPos.xz)));
float grain = mix(1.0, clamp(tpl / 0.36, 0.6, 1.4), 0.85 * near);
diffuseColor.rgb *= mix(stripes * turf, (0.94 + 0.12 * detail) * grain, vGreen);
// mowing passes across the line of play: alternate passes lay the grass opposite ways, so each pass
// reads light looking with its lay and dark against it (and turns over as you walk round); soft edges
float sa = dot(vWPos.xz, uStripe) / 3.0, sb = dot(vWPos.xz, vec2(-uStripe.y, uStripe.x)) / 3.0;
float ea = fwidth(sa) + 0.04, eb = fwidth(sb) + 0.04;
float pa = smoothstep(0.5 - ea, 0.5 + ea, abs(fract(sa) - 0.5) * 2.0) * 2.0 - 1.0;
float pb = smoothstep(0.5 - eb, 0.5 + eb, abs(fract(sb) - 0.5) * 2.0) * 2.0 - 1.0;
vec2 lk = normalize(vWPos.xz - cameraPosition.xz + 1e-4);
float withA = dot(lk, vec2(-uStripe.y, uStripe.x)), withB = dot(lk, uStripe);
float fadeS = 1.0 - smoothstep(0.35, 0.8, max(fwidth(sa), fwidth(sb)));
diffuseColor.rgb *= 1.0 + vGreen * fadeS * (pa * (0.03 + 0.045 * withA) + pb * (0.012 + 0.02 * withB));`);
    };
    mat.customProgramCacheKey = () => 'greenPatch';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    g.add(mesh);
    this.greenMesh = mesh;
    // cut the coarse mesh under the patch
    const holes = cutHoles(groundMat, 1, 'course');
    holes[0].set(pin.x, pin.z, Rc, 1);
    return mesh;
  }

  /**
   * Break around the cup: animated chevrons that flow downhill over the last
   * ~15 ft to the hole, coloured by slope (blue gentle, gold medium, red
   * steep), fading out toward the edge so the rest of the green stays clean.
   * Shown while putting; sized for couch distance in TV mode.
   */
  _buildSlopeGrid(T, g) {
    const pts = [], dirs = [], mags = [], phases = [], fades = [];
    // the whole green and its fringe: the read matters from anywhere on it
    const Rmax = Math.max(6, (T.greenR || 14) + 6);
    const sp = 0.72;
    for (let x = -Rmax; x <= Rmax; x += sp) {
      for (let z = -Rmax; z <= Rmax; z += sp) {
        const r = Math.hypot(x, z);
        if (r > Rmax || r < 0.22) continue;
        const wx = T.pin.x + x, wz = T.pin.z + z;
        const sf = T.terrain(wx, wz).surface;
        if (sf !== 'green' && sf !== 'fringe') continue;
        const e = 0.2;
        const gx = (T.meshHeight(wx + e, wz) - T.meshHeight(wx - e, wz)) / (2 * e);
        const gz = (T.meshHeight(wx, wz + e) - T.meshHeight(wx, wz - e)) / (2 * e);
        const m = Math.hypot(gx, gz);
        pts.push(wx, T.meshHeight(wx, wz) + 0.012, wz);
        dirs.push(m > 1e-5 ? -gx / m : 0, m > 1e-5 ? -gz / m : 0);
        mags.push(m);
        // stagger along the fall line so the chevrons read as a flow
        phases.push(((x * (m > 1e-5 ? -gx / m : 0) + z * (m > 1e-5 ? -gz / m : 0)) / 0.9) % 1);
        // full strength on the green, eased off over the fringe
        fades.push(sf === 'green' ? 1 : 0.55);
      }
    }
    // a flat chevron lying on the green, pointing downhill (local x = downhill)
    const base = new THREE.InstancedBufferGeometry();
    const P = [[0.35, 0], [-0.1, 0.38], [-0.3, 0.38], [0.1, 0], [-0.3, -0.38], [-0.1, -0.38]];
    const tri = [0, 1, 3, 1, 2, 3, 0, 3, 5, 3, 4, 5];
    base.setAttribute('position', new THREE.Float32BufferAttribute(P.flatMap(([x, y]) => [x, y, 0]), 3));
    base.setIndex(tri);
    base.instanceCount = mags.length;
    base.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(pts), 3));
    base.setAttribute('aDir', new THREE.InstancedBufferAttribute(new Float32Array(dirs), 2));
    base.setAttribute('aMag', new THREE.InstancedBufferAttribute(new Float32Array(mags), 1));
    base.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(phases), 1));
    base.setAttribute('aFade', new THREE.InstancedBufferAttribute(new Float32Array(fades), 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uSize: { value: 1 } },
      vertexShader: `
        attribute vec3 aOffset; attribute vec2 aDir; attribute float aMag; attribute float aPhase; attribute float aFade;
        uniform float uTime; uniform float uSize;
        varying float vA; varying float vMag;
        void main() {
          float spd = 0.22 + min(aMag, 0.05) * 12.0;  // steeper ground flows faster
          float k = fract(aPhase + uTime * spd);
          vec2 d = length(aDir) > 0.5 ? aDir : vec2(1.0, 0.0);
          vec2 n = vec2(-d.y, d.x);
          float s = 0.24 * uSize * (aMag < 0.004 ? 0.5 : 1.0);
          float along = (k - 0.5) * 0.4 + position.x * s;
          vec2 xz = aOffset.xz + d * along + n * position.y * s;
          float y = aOffset.y - aMag * along + 0.006;
          vA = sin(k * 3.14159) * aFade;
          vMag = aMag;
          gl_Position = projectionMatrix * viewMatrix * vec4(xz.x, y, xz.y, 1.0);
        }`,
      fragmentShader: `
        uniform float uOpacity;
        varying float vA; varying float vMag;
        void main() {
          vec3 cool = vec3(0.3, 0.68, 1.0), mid = vec3(1.0, 0.84, 0.25), hot = vec3(1.0, 0.32, 0.2);
          vec3 c = mix(cool, mid, smoothstep(0.008, 0.018, vMag));
          c = mix(c, hot, smoothstep(0.022, 0.034, vMag));
          float a = vA * uOpacity * 0.85;
          if (a < 0.01) discard;
          gl_FragColor = vec4(c, a);
        }`,
    });
    const points = new THREE.Mesh(base, mat);
    points.renderOrder = 6;
    points.frustumCulled = false;
    g.add(points);
    this.slopeGrid = points;
    this.slopeTarget = 0;
  }

  /**
   * Putting rings around the hole: inner (gold) = 1-putt, outer (white) =
   * 2-putt. Draped on the green surface; the line width grows with camera
   * distance so both rings stay readable from 200 yards. Plus a soft light
   * beam over the pin for the approach.
   */
  setRings(on, radii) {
    const T = this.T;
    if (!T) return;
    const key = radii ? `${radii.one.toFixed(2)}:${radii.two.toFixed(2)}` : this._ringKey;
    if (on && radii && key !== this._ringKey) this._buildRings(T, radii, key);
    this.ringTarget = on ? 1 : 0;
  }

  _buildRings(T, radii, key) {
    if (this.rings) { this.holeGroup.remove(this.rings); this.rings.geometry.dispose(); this.rings.material.dispose(); }
    this._ringKey = key;
    const R = radii.two + 1.2;
    const radii2 = [];
    for (let r = 0.06; r < R; r += r < 1 ? 0.1 : 0.22) radii2.push(r);
    radii2.push(R);
    const NA = 128;
    const pos = [];
    for (const r of radii2) {
      for (let a = 0; a < NA; a++) {
        const th = (a / NA) * Math.PI * 2;
        const x = T.pin.x + Math.cos(th) * r, z = T.pin.z + Math.sin(th) * r;
        pos.push(x, T.meshHeight(x, z) + 0.02, z);
      }
    }
    const idx = [];
    for (let i = 0; i < radii2.length - 1; i++) {
      for (let a = 0; a < NA; a++) {
        const a1 = (a + 1) % NA;
        const p0 = i * NA + a, p1 = i * NA + a1, q0 = (i + 1) * NA + a, q1 = (i + 1) * NA + a1;
        idx.push(p0, p1, q0, p1, q1, q0);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
      uniforms: {
        uCup: { value: new THREE.Vector2(T.pin.x, T.pin.z) }, uR1: { value: radii.one }, uR2: { value: radii.two },
        uOpacity: { value: 0 }, uTime: { value: 0 }, uDay: { value: 0 },
      },
      vertexShader: `
        varying vec3 vW;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform vec2 uCup; uniform float uR1; uniform float uR2; uniform float uOpacity; uniform float uTime; uniform float uDay;
        varying vec3 vW;
        void main() {
          float r = length(vW.xz - uCup);
          float camD = length(cameraPosition - vW);
          // line width ~2 px at any distance, never thinner than 6 cm
          float w = max(0.06, camD * 0.0028);
          float l1 = 1.0 - smoothstep(w * 0.45, w, abs(r - uR1));
          float l2 = 1.0 - smoothstep(w * 0.45, w, abs(r - uR2));
          float in1 = 1.0 - step(uR1, r);
          float in2 = step(uR1, r) * (1.0 - step(uR2, r));
          float pulse = 0.85 + 0.15 * sin(uTime * 2.2);
          vec3 gold = vec3(1.0, 0.8, 0.28), white = vec3(0.92, 0.96, 1.0);
          vec3 col = gold * l1 * 1.15 + white * l2 + gold * in1 * 0.55 + white * in2 * 0.35;
          float a = max(l1 * pulse, l2 * 0.9);
          a = max(a, in1 * 0.16 + in2 * 0.07);
          a *= uOpacity;
          if (a < 0.003) discard;
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.rings = new THREE.Mesh(geo, mat);
    this.rings.renderOrder = 5;
    this.rings.frustumCulled = false;
    this.holeGroup.add(this.rings);
    if (!this.beam) {
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.45, 60, 16, 1, true).translate(0, 30, 0),
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color(0xffd27a) }, uOpacity: { value: 0 } },
          vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
          fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying float vY; void main(){ float a = pow(clamp(1.0 - vY, 0.0, 1.0), 2.2) * 0.42 * uOpacity; gl_FragColor = vec4(uColor * a, a);} ',
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        }),
      );
      beam.frustumCulled = false;
      this.beam = beam;
    }
    this.beam.position.set(T.pin.x, T.groundHeight(T.pin.x, T.pin.z), T.pin.z);
    this.holeGroup.add(this.beam);
  }

  /** Putting view: slope flow + cup ring on, flagstick out. */
  setPutting(on) {
    this.setReadingAids(on);
    this.setFlagOut(on);
  }

  /** Slope flow and cup ring only (they fade out once the putt is struck). */
  setReadingAids(on) {
    this.slopeTarget = on && this.showGrid !== false ? 1 : 0;
    if (this.ring) this.ring.userData.target = on ? 1 : 0;
  }

  setFlagOut(out) {
    if (!this.flag) return;
    this.flag.userData.outTarget = out ? 1 : 0;
  }

  /**
   * Height of the ground exactly as drawn. The hole mesh is sampled every
   * 2.2 m, so it can sit a few centimetres off the true surface — more than
   * a ball's radius. The ball and its shadow are drawn on this surface.
   */
  visualHeight = (x, z) => {
    const T = this.T;
    if (!T || !this._coarseH) return 0;
    const r = Math.hypot(x - T.pin.x, z - T.pin.z);
    const Rc = this._Rc;
    if (r < Rc - 7) return T.meshHeight(x, z);
    const ht = T.meshHeight(x, z), hc = this._coarseH(x, z);
    if (r >= Rc) return hc;
    const u = Math.min(1, Math.max(0, (r - (Rc - 7)) / 5));
    return ht + (hc + 0.012 - ht) * u * u * (3 - 2 * u);
  };

  /** The ground's drawn colour at (x, z) (linear), for things laid on it to match. */
  turfAt = (x, z) => { const c = new THREE.Color(); if (this.T) this._colorAt(this.T, x, z, c); return c; };

  /** Is a floodlight mast within r metres of (x, z)? (keeps cameras from parking behind one) */
  nearPole = (x, z, r = 4) => (this.poles || []).some((p) => Math.hypot(p.x - x, p.z - z) < r);

  /** The tree canopy containing (x, y, z), if any (ball collision). */
  treeHit = (x, y, z) => {
    if (!this.treeGrid) return null;
    const list = this.treeGrid.get(`${Math.floor(x / 20)},${Math.floor(z / 20)}`);
    if (!list) return null;
    for (const t of list) {
      if (y > t.top || y < t.y0) continue;
      const u = (y - t.y0) / Math.max(1, t.top - t.y0);
      const r = t.kind === 'cedar' ? t.r * (1 - u * 0.85) : t.r * 0.82 * Math.sin(Math.PI * Math.min(1, 0.25 + u * 0.8));
      if (Math.hypot(x - t.x, z - t.z) < r) return t;
    }
    return null;
  };

  /** Lowest camera height that stays out of any tree canopy at (x, z). */
  cameraClear = (x, z) => {
    if (!this.treeGrid) return -Infinity;
    const gx = Math.floor(x / 20), gz = Math.floor(z / 20);
    let y = -Infinity;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const list = this.treeGrid.get(`${gx + i},${gz + j}`);
        if (!list) continue;
        for (const t of list) {
          if (Math.hypot(x - t.x, z - t.z) < t.r + 1.5) y = Math.max(y, t.top + 1.5);
        }
      }
    }
    return y;
  };

  _buildRoughGrass(T, g, rand, b) {
    if (!this.tuftGeo) {
      this.tuftGeo = tuftGeometry(14);
      this.tuftGeo.userData.shared = true;
      // half the blades for chunks past 45 m
      this.tuftGeoLo = tuftGeometry(7);
      this.tuftGeoLo.userData.shared = true;
      this.tuftMat = grassMaterial(0x6a8a3a);
    }
    // a links course's fescue drifts cover the deep rough: fewer tufts under them
    const N = Math.round(15000 * (this.treeDensity ?? 1) * (T.hole.links ? 0.7 : 1));
    const tint = { western: 0xb3a05a, coastal: 0x8f9a58, harbor: 0xb0a865 }[T.hole.links ? 'harbor' : T.hole.theme];
    if (tint && !this.tuftMats?.[tint]) {
      this.tuftMats ||= {};
      this.tuftMats[tint] = grassMaterial(tint);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    // drawn in chunks: the ones out of view or too far to read (tufts are a
    // few pixels at 100 m) aren't drawn at all
    const placed = [];
    let n = 0;
    for (let i = 0; i < N * 3 && n < N; i++) {
      const s = -10 + rand() * (T.length + 40);
      const pt = T.pointAt(s);
      const edge = T.fwHalf > 0 && s > T.fwStart && s < T.length ? T.fairwayHalf(s) : Math.max(6, T.greenR * 0.6);
      const d = (edge + 2 + Math.pow(rand(), 1.6) * 42) * (rand() < 0.5 ? -1 : 1);
      const x = pt.x + pt.rx * d, z = pt.z + pt.rz * d;
      if (T.terrain(x, z).surface !== 'rough') continue;
      if (T.greenEdge(x, z) < 3) continue;
      if (T.bunkers.length && this._sandSd(T, x, z, 1) < 0.7) continue; // the bunker surround is mown: a clean lip
      if (this._mownCarry(x, z)) continue;
      if (this.landmark?.clear?.(x, z)) continue; // the landmark's paving (a street, a plaza)
      if ((this.farLms || []).some((l) => l.occupies?.(x, z))) continue; // a vineyard's rows
      const deep = T.roughDepth(x, z) === 'deep';
      const h = (deep ? 0.2 : 0.1) + rand() * (deep ? 0.2 : 0.07);
      q.setFromAxisAngle(up, rand() * 6.28);
      const spread = 0.8 + rand() * 0.7;
      sc.set(spread, h, spread);
      placed.push(m4.compose(p.set(x, this._coarseH(x, z) - 0.02, z), q, sc).clone());
      n++;
    }
    this._chunked(g, placed, this.tuftGeo, this.tuftGeoLo, tint ? this.tuftMats[tint] : this.tuftMat, { lodAt: 45, far: GRASS_FAR });
  }

  /**
   * Links fescue: knee-high, fine and mostly straw-coloured, in drifts beyond
   * the first cut and out over the native ground, thickening away from play.
   * Chunked like the rough tufts, with a thinner clump past 50 m.
   */
  _buildFescue(T, g, rand) {
    if (!this.fescue) {
      const geo = tuftGeometry(56, 11, { width: 0.75, lean: 0.4, dry: 0.7, root: 0.5 });
      const lo = tuftGeometry(18, 11, { width: 1.3, lean: 0.4, dry: 0.7, segs: 2, root: 0.5 });
      geo.userData.shared = lo.userData.shared = true;
      this.fescue = { geo, lo, mat: grassMaterial(0xd9c58e) };
    }
    const { geo, lo, mat } = this.fescue;
    const b = T.bounds(70);
    // links (Whistling Straits): fescue over whole holes of dunes, so fewer and sooner to the low tufts
    const N = Math.round(14000 * (this.treeDensity ?? 1) * (T.hole.links ? 0.55 : 1));
    const placed = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (let i = 0; i < N * 5 && n < N; i++) {
      const x = b.minx + rand() * (b.maxx - b.minx), z = b.minz + rand() * (b.maxz - b.minz);
      const sf = T.terrain(x, z).surface;
      if (sf !== 'rough' && sf !== 'oob') continue;
      if (sf === 'rough' && T.roughDepth(x, z) !== 'deep') continue;
      // thin at the edge of the deep rough, full drifts out in the dunes
      const k = fescueDepth(T, x, z), f = fescueDrift(x, z);
      if (rand() > (0.12 + 0.88 * k) * (0.2 + 0.8 * f)) continue;
      if (T.greenEdge(x, z) < 8 || Math.hypot(x, z) < 14 || this._mownCarry(x, z)) continue;
      const y = this._coarseH(x, z);
      if (T.seaLevel != null && y < T.seaLevel + 0.8) continue;
      const h = 0.45 + rand() * 0.35 + f * 0.2;
      const spread = 1.5 + rand() * 1.1;
      q.setFromAxisAngle(up, rand() * 6.28);
      placed.push(m4.compose(p.set(x, y - 0.03, z), q, sc.set(spread, h, spread)).clone());
      n++;
    }
    this._chunked(g, placed, geo, lo, mat, { lodAt: T.hole.links ? 28 : 50, far: FESCUE_FAR });
  }

  /**
   * Instances binned into square cells, one InstancedMesh each, so the ones
   * out of view (or out of the shadow camera's) aren't drawn; past `lodAt`
   * a cell draws `lo`, past `far` (scaled down on lighter quality) nothing.
   */
  _chunked(g, matrices, hi, lo, mat, { cell = 40, lodAt = 50, far = 150, shadow = false } = {}) {
    const cells = new Map();
    const v = new THREE.Vector3();
    for (const m of matrices) {
      v.setFromMatrixPosition(m);
      const key = `${Math.floor(v.x / cell)},${Math.floor(v.z / cell)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(m);
    }
    const meshes = [];
    for (const list of cells.values()) {
      const im = new THREE.InstancedMesh(hi, mat, list.length);
      list.forEach((m, k) => im.setMatrixAt(k, m));
      im.computeBoundingSphere();
      im.receiveShadow = true;
      im.castShadow = shadow;
      g.add(im);
      meshes.push(im);
    }
    (this.chunkSets ||= []).push({ meshes, hi, lo, lodAt, far });
  }

  /** Per frame: which chunks draw, and at which detail. */
  _cullChunks(camera) {
    if (!camera || !this.chunkSets) return;
    const k = this.treeDensity >= 1 ? 1 : 0.8;
    for (const set of this.chunkSets) {
      for (const c of set.meshes) {
        const b = c.boundingSphere;
        const d = camera.position.distanceTo(b.center) - b.radius;
        c.visible = d < set.far * k;
        c.geometry = d < set.lodAt ? set.hi : set.lo;
      }
    }
  }

  /**
   * Low shrubs on open ground: big sagebrush on the plains (silver-grey,
   * 0.5–1.2 m) or garrigue (kermes oak, rosemary) on the Provençal coast.
   * Thin in the first cut, thicker out in the native ground.
   */
  _buildShrubs(T, g, rand, theme) {
    const key = `shrub_${theme}`;
    if (!this[key]) {
      const parts = [];
      const rnd = seeded(theme.length * 31 + 7);
      // many small, displaced lobes: a lacy, irregular crown, silver-green
      // on top, grey-brown woody base showing underneath
      const top = new THREE.Color(theme === 'western' ? 0x8e9a76 : 0x5d6e42);
      const base = new THREE.Color(theme === 'western' ? 0x5b5446 : 0x3f3a2e);
      for (let i = 0; i < 11; i++) {
        const r = 0.12 + rnd() * 0.12;
        const geo = new THREE.IcosahedronGeometry(r, 0);
        const a = rnd() * 6.28, d = Math.sqrt(rnd()) * 0.42;
        const y = 0.12 + rnd() * 0.38 + (0.42 - d) * 0.35;
        geo.scale(1, 0.7, 1).translate(Math.cos(a) * d, y, Math.sin(a) * d);
        const p = geo.attributes.position;
        const col = new Float32Array(p.count * 3);
        const c = new THREE.Color();
        for (let k = 0; k < p.count; k++) {
          p.setXYZ(k, p.getX(k) * (0.8 + rnd() * 0.4), p.getY(k), p.getZ(k) * (0.8 + rnd() * 0.4));
          c.copy(base).lerp(top, THREE.MathUtils.smoothstep(p.getY(k), 0.05, 0.45)).multiplyScalar(0.9 + rnd() * 0.2);
          col.set([c.r, c.g, c.b], k * 3);
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geo.deleteAttribute('uv');
        parts.push(geo.toNonIndexed());
      }
      // a few dark stems under the canopy
      const geo = mergeGeometries(parts);
      geo.computeVertexNormals();
      geo.userData.shared = true;
      // past 60 m: six lobes instead of eleven
      const lo = mergeGeometries(parts.slice(0, 6));
      lo.computeVertexNormals();
      lo.userData.shared = true;
      this[key] = { geo, lo, mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }) };
    }
    const { geo, lo, mat } = this[key];
    const b = T.bounds(200);
    const N = Math.round(11000 * (this.treeDensity ?? 1));
    const placed = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const corridor = Math.max(T.fwHalf, 12);
    let n = 0;
    for (let i = 0; i < N * 4 && n < N; i++) {
      const x = b.minx + rand() * (b.maxx - b.minx), z = b.minz + rand() * (b.maxz - b.minz);
      const pr = T.project(x, z);
      const ad = Math.abs(pr.d);
      // denser away from play; clumped by a low-frequency field
      const k = THREE.MathUtils.smoothstep(ad, corridor + 6, corridor + 60);
      const f = 0.55 + 0.45 * Math.sin(x * 0.05 + Math.sin(z * 0.04) * 2) * Math.cos(z * 0.06 - x * 0.02);
      if (rand() > k * f) continue;
      if (T.greenEdge(x, z) < 14 || Math.hypot(x, z) < 12) continue;
      if (T.seaLevel != null && T.meshHeight(x, z) < T.seaLevel + 1) continue;
      const sf = T.terrain(x, z).surface;
      if (sf !== 'rough' && sf !== 'oob') continue;
      const s = 0.6 + rand() * 0.7;
      q.setFromAxisAngle(up, rand() * 6.28);
      sc.set(s * (0.9 + rand() * 0.4), s * (0.8 + rand() * 0.4), s * (0.9 + rand() * 0.4));
      const y = this._coarseH ? this._coarseH(x, z) : T.meshHeight(x, z);
      placed.push(m4.compose(p.set(x, y - 0.05, z), q, sc).clone());
      n++;
    }
    this._chunked(g, placed, geo, lo, mat, { lodAt: 60, far: SHRUB_FAR, shadow: true });
  }

  _buildStakes(T, g) {
    const YDM = 0.9144;
    const marks = [[100, 0xd8342c, '#d8342c'], [150, 0xf2f2f2, '#f2f2f2'], [200, 0x2d63d8, '#2d63d8'], [250, 0xf2c230, '#f2c230']];
    const post = new THREE.CylinderGeometry(0.05, 0.06, 1.1, 8).translate(0, 0.55, 0);
    for (const [yd, col, css] of marks) {
      const s0 = T.length - yd * YDM;
      if (s0 < 60) continue;
      const p = T.pointAt(s0);
      if (T.terrain(p.x, p.z).surface === 'water') continue;
      const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, emissive: col, emissiveIntensity: 0.25 });
      for (const side of [-1, 1]) {
        const off = T.fairwayHalf(s0) + 2;
        const x = p.x + p.rx * off * side, z = p.z + p.rz * off * side;
        if (T.terrain(x, z).surface === 'water') continue;
        const m = new THREE.Mesh(post, mat);
        m.position.set(x, this.groundAt(x, z), z);
        m.castShadow = true;
        g.add(m);
        // number plate, always facing the camera, sized to read from the tee
        const c = document.createElement('canvas');
        c.width = 128; c.height = 64;
        const cx = c.getContext('2d');
        cx.fillStyle = 'rgba(12,16,24,0.82)';
        cx.fillRect(0, 0, 128, 64);
        cx.fillStyle = css;
        cx.fillRect(0, 56, 128, 8);
        cx.fillStyle = '#fff';
        cx.font = '700 42px -apple-system, system-ui, sans-serif';
        cx.textAlign = 'center';
        cx.fillText(String(yd), 64, 44);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
        sp.scale.set(1.6, 0.8, 1);
        sp.position.set(x, this.groundAt(x, z) + 1.65, z);
        g.add(sp);
      }
    }
  }

  _water(opts) { const m = createWaterMaterial(opts); this.waterMats.push(m); return m; }

  setDay(d) {
    this.day = d;
    if (!this.hole) return;
    this.wildlife?.setDay(d); // [wildlife]
    for (const s of this.floods) { s.intensity = 2600 * (1 - d); s.visible = d < 0.6; }
    for (const m of this.mastMeshes || []) m.visible = d < 0.6;
    this.lampMat.color.setRGB(0.5 + 4.5 * (1 - d), 0.48 + 3.6 * (1 - d), 0.42 + 2.6 * (1 - d));
    if (this.pinLight) this.pinLight.intensity = 6 * (1 - d);
    if (this.landmark) setLandmarkDay(this.landmark, d);
    for (const lm of this.farLms || []) setLandmarkDay(lm, d);
    const fm = this.flag?.userData.flagMat;
    if (fm) fm.emissiveIntensity = 0.9 * (0.25 + 0.75 * (1 - d));
  }

  setWind(amount, fromDeg) {
    this.wind = amount; this.windFrom = fromDeg;
    if (!this.flag) return;
    this.flag.children[1].rotation.y = ((fromDeg + 90) * Math.PI) / 180;
  }

  _beaconTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.3, 'rgba(255,240,200,0.5)');
    grd.addColorStop(1, 'rgba(255,220,150,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  /**
   * Dense rough round the ball's resting spot: the field-wide tufts are
   * spread thin, so where the camera actually looks (the ball) gets a thick
   * patch, rebuilt whenever the ball settles somewhere new.
   */
  /** The strip from the tee to the fairway is mown short, as on a real course. */
  _mownCarry(x, z) {
    const T = this.T;
    const pr = T.project(x, z);
    return pr.s > -12 && pr.s < (T.fwHalf > 0 ? T.fwStart : T.length - T.greenR) && Math.abs(pr.d) < Math.max(T.fwHalf, 14) + 6;
  }

  _nearGrassAt(x, z) {
    const T = this.T;
    if (!T || !this.tuftGeo) return;
    const N = Math.round(9000 * Math.max(0.5, this.treeDensity ?? 1));
    // in cells of 11 m, each culled on its own: the patch round the ball is
    // as thick as ever, but the cells behind and under the camera aren't drawn
    if (!this.nearGrass) {
      this.nearGrass = new THREE.Group();
      this.nearGrass.userData.mat = this.tuftMats?.[{ western: 0xb3a05a, coastal: 0x8f9a58, harbor: 0xb0a865 }[T.hole.links ? 'harbor' : T.hole.theme]] || this.tuftMat;
      this.holeGroup.add(this.nearGrass);
    }
    for (const im of [...this.nearGrass.children]) { this.nearGrass.remove(im); im.dispose(); }
    const rand = seeded(Math.round(x * 13 + z * 7));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const R = 22, CELL = 11, side = Math.ceil((2 * R) / CELL);
    const cells = Array.from({ length: side * side }, () => []);
    let n = 0;
    for (let i = 0; i < N * 2 && n < N; i++) {
      // denser toward the centre, where the ball sits
      const r = R * Math.pow(rand(), 0.75), a = rand() * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (T.terrain(px, pz).surface !== 'rough') continue;
      if (T.greenEdge(px, pz) < 2.5) continue;
      if (this._mownCarry(px, pz)) continue;
      const deep = T.roughDepth(px, pz) === 'deep';
      // the first-cut edge of the rough stays short
      const h = (deep ? 0.18 : 0.08) + rand() * (deep ? 0.18 : 0.06);
      q.setFromAxisAngle(up, rand() * 6.28);
      const spread = 0.7 + rand() * 0.6;
      sc.set(spread, h, spread);
      const ci = Math.min(side - 1, Math.floor((px - x + R) / CELL)), cj = Math.min(side - 1, Math.floor((pz - z + R) / CELL));
      cells[cj * side + ci].push(m4.compose(p.set(px, this._coarseH(px, pz) - 0.02, pz), q, sc).clone());
      n++;
    }
    for (const list of cells) {
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(this.tuftGeo, this.nearGrass.userData.mat, list.length);
      im.receiveShadow = true;
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.computeBoundingSphere();
      this.nearGrass.add(im);
    }
    this._nearAt = { x, z };
  }

  update(t, dt = 1 / 60, camera = null) {
    this.streetLife?.update(dt);
    this.scenery?.update(dt, t, { x: GRASS.uWind.value.x * 8, z: GRASS.uWind.value.y * 8 });
    this.surf?.update(t);
    this.wildlife?.update(dt, t, camera, this.ballPos); // [wildlife]
    // thick rough wherever the ball settles (checked twice a second)
    if (this.ballPos && this.T) {
      this._nearT = (this._nearT || 0) + dt;
      if (this._nearT > 0.5) {
        this._nearT = 0;
        const b = this.ballPos, pv = this._nearPrev;
        const still = pv && Math.hypot(b.x - pv.x, b.z - pv.z) < 0.3;
        this._nearPrev = { x: b.x, z: b.z };
        const at = this._nearAt;
        if (still && (!at || Math.hypot(b.x - at.x, b.z - at.z) > 9)) this._nearGrassAt(b.x, b.z);
      }
    }
    // the thick patch only reads up close: from the intro's orbit or a flyover it would
    // show as a dark square on the ground, so it is drawn only with the camera near it
    if (this.nearGrass && camera && this._nearAt) {
      const c = camera.position, at = this._nearAt;
      this.nearGrass.visible = Math.hypot(c.x - at.x, c.z - at.z) < 70 && c.y - (this.T?.meshHeight(at.x, at.z) ?? 0) < 30;
    }
    // rough grass: wind (the way the air moves) and the ball it parts around
    this._cullChunks(camera);
    GRASS.uTime.value = t;
    const wr = ((this.windFrom ?? 0) * Math.PI) / 180;
    GRASS.uWind.value.set(-Math.sin(wr), Math.cos(wr)).multiplyScalar(this.wind ?? 0);
    if (this.ballPos) GRASS.uBall.value.copy(this.ballPos);
    const sh = this.flag?.userData.flagMat.userData.shader;
    if (sh) { sh.uniforms.uTime.value = t; sh.uniforms.uWind.value = this.wind; }
    // flagstick lifting out / dropping back in
    const f = this.flag;
    if (f) {
      const u = f.userData;
      u.out += (u.outTarget - u.out) * (1 - Math.exp(-5 * dt));
      if (Math.abs(u.out - u.outTarget) < 0.002) u.out = u.outTarget;
      f.position.y = u.baseY + u.out * u.out * 3.2;
      f.visible = u.out < 0.98;
      // the beacon only matters when the flag is a speck
      if (camera && u.beacon) {
        const d = camera.position.distanceTo(f.position);
        u.beacon.material.opacity = THREE.MathUtils.smoothstep(d, 40, 120) * (1 - u.out);
        // a 0.9 m glow in world terms, so it shrinks with distance like the
        // flag itself (a fixed-size dot reads closer than the pin really is),
        // with a floor of ~6 px at 1080p so it never disappears
        const view = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        const k = Math.max(0.0056, 0.9 / Math.max(1e-3, d * view));
        u.beacon.scale.set(k, k, 1);
      }
    }
    if (this.ring) this.ring.userData.update(dt, t);
    if (this.landmark?.update) this.landmark.update(t, dt, this.day);
    for (const lm of this.farLms || []) lm.update?.(t, dt, this.day);
    for (const fp of this.flagpoles || []) fp.userData.update(t, this.wind);
    this.fireworks?.userData.update(dt, this.day);
    updateTrees(t, this.wind, camera);
    if (this.rings) {
      const u = this.rings.material.uniforms;
      u.uTime.value = t;
      u.uOpacity.value += ((this.ringTarget || 0) - u.uOpacity.value) * (1 - Math.exp(-4 * dt));
      this.rings.visible = u.uOpacity.value > 0.01;
      if (this.beam && camera) {
        const d = camera.position.distanceTo(this.beam.position);
        this.beam.material.uniforms.uOpacity.value = u.uOpacity.value * THREE.MathUtils.smoothstep(d, 35, 110) * (0.55 + 0.45 * (1 - this.day));
        this.beam.visible = this.beam.material.uniforms.uOpacity.value > 0.01;
      }
    }
    if (this.slopeGrid) {
      const m = this.slopeGrid.material.uniforms;
      m.uTime.value = t;
      m.uSize.value = document.body.classList.contains('tv') ? 1.25 : 1;
      m.uOpacity.value += (this.slopeTarget - m.uOpacity.value) * (1 - Math.exp(-4 * dt));
      this.slopeGrid.visible = m.uOpacity.value > 0.01;
    }
  }
}
