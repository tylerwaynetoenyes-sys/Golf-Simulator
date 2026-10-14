// Builds and swaps the 3-D scenery for one hole of the Confluence Course:
// ground mesh (mown stripes, rough, bunkers, green), ponds and creeks, tee
// markers, flag, tree lines, night floodlights and the hole's landmark.
import * as THREE from 'three';
import { HoleTerrain } from './holeTerrain.js';
import { buildLandmark, setLandmarkDay } from './landmarks.js';
import { createWaterMaterial, waterMaterials } from '../scene/river.js';
import { makeFlag, lightConeMaterial } from '../scene/rangeProps.js';
import { CUP } from '../core/physics.js';
import { buildCup, cupRing, cutHoles } from '../scene/cup.js';
import { plantTrees, updateTrees } from '../scene/trees.js';

const C = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const COL = {
  fwA: C(0.36, 0.58, 0.24), fwB: C(0.3, 0.52, 0.2),
  rough: C(0.25, 0.42, 0.16), deep: C(0.19, 0.33, 0.13),
  green: C(0.42, 0.7, 0.28), greenB: C(0.39, 0.66, 0.26), fringe: C(0.34, 0.58, 0.22),
  sand: C(0.88, 0.8, 0.62), tee: C(0.38, 0.6, 0.25), bed: C(0.3, 0.32, 0.22),
};

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
      new THREE.MeshLambertMaterial({ color: 0x3f5a2c }),
    );
    this.base.position.y = -5;
    this.root.add(this.base);
    this.hole = null;
    this.T = null;
    this.day = 0;
    this.wind = 0.3;
    this.windFrom = 200;
    this.detail = this._detailTexture();
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
    this.rings = null;
    this._ringKey = null;
    this.ringTarget = 0;
    const T = (this.T = new HoleTerrain(hole));
    const g = (this.holeGroup = new THREE.Group());
    this.root.add(g);
    const rand = seeded(hole.n * 977);
    const b = T.bounds(200);
    const baseY = this.base.position.y;

    // ── ground mesh ──
    const step = 2.2;
    const nx = Math.ceil((b.maxx - b.minx) / step) + 1;
    const nz = Math.ceil((b.maxz - b.minz) / step) + 1;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const sd = new Float32Array(nx * nz * 2); // arc length + lateral offset, for mowing patterns
    const fw = new Float32Array(nx * nz); // 1 on fairway / tee, for the stripes
    const c = new THREE.Color();
    let k = 0;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = b.minx + i * step, z = b.maxz - j * step;
        let h = T.meshHeight(x, z);
        const edge = Math.min(x - b.minx, b.maxx - x, z - b.minz, b.maxz - z);
        const ek = Math.min(1, Math.max(0, 1 - edge / 50));
        // dive well below the base plane so the two cross steeply instead of
        // running almost coplanar (a wide z-fighting band at distance)
        h += (baseY - 6 - h) * ek * ek;
        pos.set([x, h, z], k * 3);
        uv.set([x * 0.15, z * 0.15], k * 2);
        const surf = this._colorAt(T, x, z, c);
        col.set([c.r, c.g, c.b], k * 3);
        const prj = T.project(x, z);
        sd.set([prj.s, prj.d], k * 2);
        fw[k] = surf === 'fairway' ? 1 : surf === 'tee' ? 0.7 : 0;
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
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aSD', new THREE.BufferAttribute(sd, 2));
    geo.setAttribute('aFw', new THREE.BufferAttribute(fw, 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, map: this.detail });
    // Mowing pattern drawn per pixel (crisp at any distance): 12 m bands down
    // the hole with a faint cross-cut, plus a second, larger grass-detail
    // scale so the turf doesn't tile.
    groundMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aSD;\nattribute float aFw;\nvarying vec2 vSD;\nvarying float vFw;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSD = aSD;\nvFw = aFw;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vSD;\nvarying float vFw;')
        .replace('#include <map_fragment>', `
vec4 texelColor = texture2D(map, vMapUv);
float big = texture2D(map, vMapUv * 0.19 + 0.37).r;
float detail = mix(texelColor.r, big, 0.4);
float band = step(0.5, fract(vSD.x / 12.0));
float cross = step(0.5, fract(vSD.y / 9.0));
float stripes = 1.0 + vFw * ((band - 0.5) * 0.16 + (cross - 0.5) * 0.05);
diffuseColor.rgb *= stripes * (0.78 + 0.44 * detail);`);
    };
    groundMat.customProgramCacheKey = () => 'courseGround';
    const ground = new THREE.Mesh(geo, groundMat);
    ground.receiveShadow = true;
    g.add(ground);
    // the coarse mesh exactly as drawn (two triangles per cell, split b–c)
    const coarseH = (x, z) => {
      const fi = (x - b.minx) / step, fj = (b.maxz - z) / step;
      const i0 = Math.max(0, Math.min(nx - 2, Math.floor(fi))), j0 = Math.max(0, Math.min(nz - 2, Math.floor(fj)));
      const fx = fi - i0, fy = fj - j0;
      const H = (i, j) => pos[(j * nx + i) * 3 + 1];
      const ha = H(i0, j0), hb = H(i0 + 1, j0), hc = H(i0, j0 + 1), hd = H(i0 + 1, j0 + 1);
      return fx + fy <= 1 ? ha + fx * (hb - ha) + fy * (hc - ha) : hd + (1 - fx) * (hc - hd) + (1 - fy) * (hb - hd);
    };
    this._coarseH = coarseH;
    this._buildGreen(T, g, coarseH, groundMat);
    this._buildSlopeGrid(T, g);

    // ── water ──
    for (const p of T.ponds) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), this._water({ y: p.level, tint: 0x1d3036 }));
      m.scale.set(p.rx * 1.02, 1, p.rz * 1.02);
      m.rotation.y = Math.atan2(p.dirx, p.dirz);
      m.position.set(p.x, p.level, p.z);
      g.add(m);
    }
    for (const cr of T.creeks) {
      const pt = T.pointAt(cr.s);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(T.oobLateral * 2 + 200, cr.half * 2 + 1).rotateX(-Math.PI / 2), this._water({ y: cr.level, tint: 0x24332c, flow: 0.8 }));
      m.rotation.y = Math.atan2(pt.dx, pt.dz);
      m.position.set(pt.x, cr.level, pt.z);
      g.add(m);
    }

    // ── tee markers + pin ──
    const teeY = T.teeHeight;
    const markerMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 });
    // tee markers a few yards ahead of the ball, out of the address camera's face
    for (const sx of [-3.2, 3.2]) {
      const mk = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), markerMat);
      mk.position.set(sx, teeY + 0.08, -3.4);
      mk.castShadow = true;
      g.add(mk);
    }
    const pinY = T.groundHeight(T.pin.x, T.pin.z);
    this.cupY = pinY;
    // flagstick stands in the cup (its foot sits on the cup bottom)
    this.flag = makeFlag(0xffd54a, 2.4 + CUP.depth, 0.9);
    this.flag.position.set(T.pin.x, pinY - CUP.depth, T.pin.z);
    this.flag.userData.baseY = pinY - CUP.depth;
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
    const cup = buildCup();
    cup.position.set(T.pin.x, pinY, T.pin.z);
    g.add(cup);
    this.ring = cupRing();
    this.ring.position.set(T.pin.x, pinY + 0.004, T.pin.z);
    g.add(this.ring);
    this.pinLight = new THREE.PointLight(0xffd9a0, 0, 26, 1.6);
    this.pinLight.position.set(T.pin.x, pinY + 6, T.pin.z);
    g.add(this.pinLight);

    // ── landmark ──
    const lmSpec = hole.lm;
    this.landmark = buildLandmark(lmSpec.type);
    const holder = new THREE.Group();
    holder.add(this.landmark.group);
    let lx, lz;
    if (lmSpec.onCreek && T.creeks.length) {
      const pt = T.pointAt(T.creeks[0].s);
      lx = pt.x + pt.rx * (lmSpec.at[0] || -75);
      lz = pt.z + pt.rz * (lmSpec.at[0] || -75);
      holder.position.set(lx, T.creeks[0].level - 1, lz);
    } else {
      lx = T.green.x + T.finalRight.x * lmSpec.at[0] - T.finalDir.x * lmSpec.at[1];
      lz = T.green.z + T.finalRight.z * lmSpec.at[0] - T.finalDir.z * lmSpec.at[1];
      holder.position.set(lx, T.meshHeight(lx, lz) - 0.3, lz);
    }
    holder.rotation.y = Math.atan2(-T.finalDir.x, -T.finalDir.z) + (lmSpec.rot || 0);
    holder.scale.setScalar(lmSpec.scale || 1);
    g.add(holder);

    // keep trees and masts out of the landmark's footprint
    const lmBox = new THREE.Box3().setFromObject(holder).expandByScalar(5);
    const inLandmark = (x, z) => x > lmBox.min.x && x < lmBox.max.x && z > lmBox.min.z && z < lmBox.max.z;

    // ── trees: natural stands of oak, maple, sycamore and cedar ──
    this.treeGrid = new Map();
    this.treeList = [];
    const treeSpots = [];
    const ok = (x, z, clear) => {
      const pr = T.project(x, z);
      if (Math.abs(pr.d) < clear) return false;
      if (Math.hypot(x - T.green.x, z - T.green.z) < T.greenR + 24) return false;
      if (Math.hypot(x, z) < 22) return false;
      if (inLandmark(x, z)) return false;
      const sf = T.terrain(x, z).surface;
      return sf !== 'water' && sf !== 'sand' && sf !== 'green' && sf !== 'fairway' && sf !== 'tee';
    };
    const plant = (x, z, variant, big = 1) => {
      treeSpots.push({
        x, z, y: T.meshHeight(x, z) - 0.25, variant, rot: rand() * 6.28,
        scale: (0.78 + rand() * 0.5) * big, squash: 0.85 + rand() * 0.3,
        hue: 0.23 + rand() * 0.07, sat: rand(), light: rand(),
      });
    };
    const quality = this.treeDensity ?? 1;
    const corridor = Math.max(T.fwHalf, 14);
    // stands along both sides: species-grouped clusters at varying depth
    for (const side of [-1, 1]) {
      for (let s = -30; s < T.length + 70; s += 26 + rand() * 26) {
        if (rand() < 0.18) continue; // glades
        const pt = T.pointAt(s);
        const depth = corridor + 18 + rand() * 70;
        const cx = pt.x + pt.rx * depth * side, cz = pt.z + pt.rz * depth * side;
        const n = Math.round((3 + rand() * 8) * quality);
        const rad = 8 + rand() * 16;
        const species = rand() < 0.22 ? 4 + Math.floor(rand() * 2) : Math.floor(rand() * 4);
        for (let i = 0; i < n; i++) {
          const a = rand() * 6.28, r = Math.sqrt(rand()) * rad;
          const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
          if (!ok(x, z, corridor + 14)) continue;
          plant(x, z, rand() < 0.8 ? species : Math.floor(rand() * 6));
        }
      }
      // a dark backdrop belt toward the boundary
      for (let s = -40; s < T.length + 90; s += 9 + rand() * 7) {
        const pt = T.pointAt(s);
        const depth = T.oobLateral - 8 + rand() * 40;
        const x = pt.x + pt.rx * depth * side, z = pt.z + pt.rz * depth * side;
        if (ok(x, z, corridor + 30)) plant(x, z, rand() < 0.3 ? 4 + Math.floor(rand() * 2) : Math.floor(rand() * 4), 1.15);
      }
    }
    // specimen trees that come into play: big oaks a little off the fairway
    for (let s = 150; s < T.length - 60; s += 70 + rand() * 60) {
      const side = rand() < 0.5 ? -1 : 1;
      const pt = T.pointAt(s);
      const d = corridor + 6 + rand() * 8;
      const x = pt.x + pt.rx * d * side, z = pt.z + pt.rz * d * side;
      if (ok(x, z, corridor + 4)) plant(x, z, rand() < 0.5 ? 0 : 3, 1.25);
    }
    // the hole's own stands (dogleg corners, framing)
    for (const st of hole.trees || []) {
      const pt = T.pointAt(st.t * T.length);
      const cx = pt.x + pt.rx * st.off, cz = pt.z + pt.rz * st.off;
      for (let i = 0; i < (st.n || 8); i++) {
        const a = rand() * 6.28, r = Math.sqrt(rand()) * (st.r || 12);
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (ok(x, z, Math.max(T.fwHalf + 3, 8))) plant(x, z, st.species ?? Math.floor(rand() * 4), 1.1);
      }
    }
    const forest = plantTrees(treeSpots);
    g.add(forest.group);
    for (const t of forest.records) {
      const key = `${Math.floor(t.x / 20)},${Math.floor(t.z / 20)}`;
      if (!this.treeGrid.has(key)) this.treeGrid.set(key, []);
      t.id = this.treeList.length;
      this.treeList.push(t);
      this.treeGrid.get(key).push(t);
    }

    // ── long grass in the rough: tufts thicken away from the fairway ──
    this._buildRoughGrass(T, g, rand, b);

    // ── yardage stakes: 100 red, 150 white, 200 blue, 250 yellow (to the green) ──
    this._buildStakes(T, g);

    // ── night floodlights along the hole ──
    this.floods = [];
    this.poles = [];
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
      const y0 = T.meshHeight(x, z);
      this.poles.push({ x, z });
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 20, 8), poleMat);
      mast.position.set(x, y0 + 10, z);
      g.add(mast);
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 0.4), this.lampMat);
      head.position.set(x, y0 + 20.4, z);
      head.lookAt(pt.x, y0 + 20, pt.z);
      g.add(head);
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

  _colorAt(T, x, z, c) {
    const t = T.terrain(x, z);
    const pr = T.project(x, z);
    switch (t.surface) {
      case 'fairway': c.copy(COL.fwA).lerp(COL.fwB, 0.5); break;
      case 'green': c.copy(COL.green); break;
      case 'fringe': c.copy(COL.fringe); break;
      case 'sand': {
        // bunker floor bright, darker raked edge toward the lip
        let q = 1;
        for (const b of T.bunkers) q = Math.min(q, T._ellipse(b, x, z));
        c.copy(COL.sand).multiplyScalar(1.04 - 0.2 * q * q);
        break;
      }
      case 'tee': c.copy(COL.tee); break;
      case 'water': c.copy(COL.bed); break;
      default: {
        const deep = Math.min(1, Math.max(0, (Math.abs(pr.d) - Math.max(T.fwHalf, 12) - 8) / 30));
        c.copy(COL.rough).lerp(COL.deep, deep);
      }
    }
    const n = 0.92 + 0.12 * Math.sin(x * 0.21 + z * 0.13) * Math.cos(z * 0.17);
    c.multiplyScalar(n);
    return t.surface;
  }

  /**
   * The green complex at full detail: a radial mesh centred on the cup (rings
   * from 5 cm to ~40 cm apart) with the real hole through it, true putting
   * surface heights, mowing stripes and slope shading. The coarse hole mesh
   * is cut away underneath and this patch blends into it at the edge.
   */
  _buildGreen(T, g, coarseH, groundMat) {
    const pin = T.pin;
    const Rc = Math.hypot(pin.x - T.green.x, pin.z - T.green.z) + T.greenR + 7;
    this._Rc = Rc;
    const Rp = Rc + 3;
    const radii = [];
    for (let r = CUP.radius; r < Rp; ) {
      radii.push(r);
      r += Math.min(0.42, Math.max(0.012, r * 0.13));
    }
    radii.push(Rp);
    const NA = 200;
    const nv = radii.length * NA;
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), grn = new Float32Array(nv);
    const c = new THREE.Color();
    const L = { x: -0.62, z: -0.78 }; // light from the north-west
    let k = 0;
    for (const r of radii) {
      const wBlend = Math.min(1, Math.max(0, (r - (Rc - 7)) / 5));
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
        k++;
      }
    }
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
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.9, map: this.detail, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    // crisp mowing stripes on the putting surface, across the line of play
    const dir = new THREE.Vector2(T.finalDir.x, T.finalDir.z);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uStripe = { value: dir };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aGreen;\nvarying float vGreen;\nvarying vec3 vGP;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGreen = aGreen;\nvGP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec2 uStripe;\nvarying float vGreen;\nvarying vec3 vGP;')
        .replace('#include <map_fragment>', `#include <map_fragment>
float st = step(0.5, fract(dot(vGP.xz, uStripe) / 3.0));
float cr = step(0.5, fract(dot(vGP.xz, vec2(-uStripe.y, uStripe.x)) / 3.0));
diffuseColor.rgb *= 1.0 + vGreen * ((st - 0.5) * 0.09 + (cr - 0.5) * 0.035);`);
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
    const Rmax = 4.6; // ~15 ft
    const sp = 0.58;
    for (let x = -Rmax; x <= Rmax; x += sp) {
      for (let z = -Rmax; z <= Rmax; z += sp) {
        const r = Math.hypot(x, z);
        if (r > Rmax || r < 0.22) continue;
        const wx = T.pin.x + x, wz = T.pin.z + z;
        if (T.terrain(wx, wz).surface !== 'green') continue;
        const e = 0.2;
        const gx = (T.meshHeight(wx + e, wz) - T.meshHeight(wx - e, wz)) / (2 * e);
        const gz = (T.meshHeight(wx, wz + e) - T.meshHeight(wx, wz - e)) / (2 * e);
        const m = Math.hypot(gx, gz);
        pts.push(wx, T.meshHeight(wx, wz) + 0.012, wz);
        dirs.push(m > 1e-5 ? -gx / m : 0, m > 1e-5 ? -gz / m : 0);
        mags.push(m);
        // stagger along the fall line so the chevrons read as a flow
        phases.push(((x * (m > 1e-5 ? -gx / m : 0) + z * (m > 1e-5 ? -gz / m : 0)) / 0.9) % 1);
        const f = 1 - Math.min(1, Math.max(0, (r - 2.6) / (Rmax - 2.6)));
        fades.push(f * f * (3 - 2 * f));
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
      // a tuft: five blades fanned around the centre, darker at the root
      const pos = [], col = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        const lean = 0.35;
        const ca = Math.cos(a), sa = Math.sin(a);
        const w = 0.045;
        pos.push(-sa * w, 0, ca * w, sa * w, 0, -ca * w, ca * lean * 0.5, 1, sa * lean * 0.5);
        col.push(0.45, 0.5, 0.42, 0.45, 0.5, 0.42, 1.05, 1.1, 0.85);
      }
      this.tuftGeo = new THREE.BufferGeometry();
      this.tuftGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      this.tuftGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      this.tuftGeo.computeVertexNormals();
      this.tuftGeo.userData.shared = true;
      this.tuftMat = new THREE.MeshStandardMaterial({ color: 0x5f7f34, vertexColors: true, side: THREE.DoubleSide, roughness: 0.95 });
    }
    const N = Math.round(9000 * (this.treeDensity ?? 1));
    const tufts = new THREE.InstancedMesh(this.tuftGeo, this.tuftMat, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (let i = 0; i < N * 3 && n < N; i++) {
      const s = -10 + rand() * (T.length + 40);
      const pt = T.pointAt(s);
      const edge = T.fwHalf > 0 && s > T.fwStart && s < T.length ? T.fairwayHalf(s) : Math.max(6, T.greenR * 0.6);
      const d = (edge + 2 + Math.pow(rand(), 1.6) * 42) * (rand() < 0.5 ? -1 : 1);
      const x = pt.x + pt.rx * d, z = pt.z + pt.rz * d;
      if (T.terrain(x, z).surface !== 'rough') continue;
      if (Math.hypot(x - T.green.x, z - T.green.z) < T.greenR + 3) continue;
      const deep = T.roughDepth(x, z) === 'deep';
      const h = (deep ? 0.22 : 0.12) + rand() * (deep ? 0.18 : 0.06);
      q.setFromAxisAngle(up, rand() * 6.28);
      sc.set(1 + rand() * 0.6, h, 1 + rand() * 0.6);
      tufts.setMatrixAt(n++, m4.compose(p.set(x, this._coarseH(x, z) - 0.02, z), q, sc));
    }
    tufts.count = n;
    tufts.receiveShadow = true;
    g.add(tufts);
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
        m.position.set(x, T.meshHeight(x, z), z);
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
        sp.position.set(x, T.meshHeight(x, z) + 1.65, z);
        g.add(sp);
      }
    }
  }

  _water(opts) { const m = createWaterMaterial(opts); this.waterMats.push(m); return m; }

  setDay(d) {
    this.day = d;
    if (!this.hole) return;
    for (const s of this.floods) s.intensity = 2600 * (1 - d);
    this.lampMat.color.setRGB(0.5 + 4.5 * (1 - d), 0.48 + 3.6 * (1 - d), 0.42 + 2.6 * (1 - d));
    if (this.pinLight) this.pinLight.intensity = 6 * (1 - d);
    if (this.landmark) setLandmarkDay(this.landmark, d);
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

  update(t, dt = 1 / 60, camera = null) {
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
      }
    }
    if (this.ring) this.ring.userData.update(dt, t);
    if (this.landmark?.update) this.landmark.update(t, dt, this.day);
    updateTrees(t, this.wind);
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
