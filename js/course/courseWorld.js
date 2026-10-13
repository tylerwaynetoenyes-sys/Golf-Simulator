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
    this.conGeo = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
    this.decGeo = new THREE.IcosahedronGeometry(1, 1).translate(0, 0.9, 0);
    this.treeMatA = new THREE.MeshStandardMaterial({ color: 0x1f3a1f, roughness: 1, flatShading: true });
    this.treeMatB = new THREE.MeshStandardMaterial({ color: 0x2c4521, roughness: 1, flatShading: true });
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
        if (o.geometry && o.geometry !== this.conGeo && o.geometry !== this.decGeo) o.geometry.dispose();
      });
    }
    this.hole = hole;
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
        this._colorAt(T, x, z, c);
        col.set([c.r, c.g, c.b], k * 3);
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
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: this.detail });
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
    for (const sx of [-3, 3]) {
      const mk = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), markerMat);
      mk.position.set(sx, teeY + 0.1, -0.6);
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

    // ── trees ──
    const N = 520;
    const con = new THREE.InstancedMesh(this.conGeo, this.treeMatA, N);
    const dec = new THREE.InstancedMesh(this.decGeo, this.treeMatB, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let nc = 0, nd = 0;
    // canopy index for camera collision: 20 m buckets of {x, z, r, top}
    this.treeGrid = new Map();
    const addTree = (x, z, r, top) => {
      const k = `${Math.floor(x / 20)},${Math.floor(z / 20)}`;
      if (!this.treeGrid.has(k)) this.treeGrid.set(k, []);
      this.treeGrid.get(k).push({ x, z, r, top });
    };
    for (let i = 0; i < N * 4 && (nc < N || nd < N); i++) {
      const x = b.minx + rand() * (b.maxx - b.minx);
      const z = b.minz + rand() * (b.maxz - b.minz);
      const pr = T.project(x, z);
      const corridor = Math.max(T.fwHalf, 14) + 24 + rand() * 18;
      const nearGreen = Math.hypot(x - T.green.x, z - T.green.z) < T.greenR + 30;
      const nearTee = Math.hypot(x, z) < 25;
      if (Math.abs(pr.d) < corridor || nearGreen || nearTee) continue;
      if (T.terrain(x, z).surface === 'water') continue;
      const y = T.meshHeight(x, z);
      q.setFromAxisAngle(up, rand() * 6.28);
      if (rand() < 0.45) {
        if (nc >= N) continue;
        const h = 10 + rand() * 12;
        sc.set(2.6 + rand() * 2, h, 2.6 + rand() * 2);
        con.setMatrixAt(nc++, m4.compose(p3.set(x, y - 0.3, z), q, sc));
        addTree(x, z, sc.x, y - 0.3 + h);
      } else {
        if (nd >= N) continue;
        const r = 4 + rand() * 4;
        sc.set(r, r * (0.9 + rand() * 0.4), r);
        dec.setMatrixAt(nd++, m4.compose(p3.set(x, y + r * 0.4, z), q, sc));
        addTree(x, z, r, y + r * 0.4 + sc.y * 1.9);
      }
    }
    con.count = nc; dec.count = nd;
    con.receiveShadow = dec.receiveShadow = true;
    con.castShadow = dec.castShadow = true;
    g.add(con, dec);

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

    // ── night floodlights along the hole ──
    this.floods = [];
    this.coneMat = lightConeMaterial(0xffc58a, 0.04);
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xffd29a });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x23262b, metalness: 0.6, roughness: 0.5 });
    const spots = [0.35, 0.62, 0.86, 1.0].filter((t) => t * T.length > 60);
    spots.forEach((t, i) => {
      const side = i % 2 ? 1 : -1;
      const pt = T.pointAt(t * T.length);
      const off = Math.max(T.fwHalf, 14) + 26;
      const x = pt.x + pt.rx * off * side, z = pt.z + pt.rz * off * side;
      const y0 = T.meshHeight(x, z);
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
      case 'fairway': c.copy(Math.floor(pr.s / 12) % 2 ? COL.fwA : COL.fwB); break;
      case 'green': c.copy(COL.green); break;
      case 'fringe': c.copy(COL.fringe); break;
      case 'sand': c.copy(COL.sand); break;
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
    if (this.slopeGrid) {
      const m = this.slopeGrid.material.uniforms;
      m.uTime.value = t;
      m.uSize.value = document.body.classList.contains('tv') ? 1.25 : 1;
      m.uOpacity.value += (this.slopeTarget - m.uOpacity.value) * (1 - Math.exp(-4 * dt));
      this.slopeGrid.visible = m.uOpacity.value > 0.01;
    }
  }
}
