// Builds and swaps the 3-D scenery for one hole of the Confluence Course:
// ground mesh (mown stripes, rough, bunkers, green), ponds and creeks, tee
// markers, flag, tree lines, night floodlights and the hole's landmark.
import * as THREE from 'three';
import { HoleTerrain } from './holeTerrain.js';
import { buildLandmark, setLandmarkDay } from './landmarks.js';
import { createWaterMaterial, waterMaterials } from '../scene/river.js';
import { makeFlag, lightConeMaterial } from '../scene/rangeProps.js';

const C = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const COL = {
  fwA: C(0.36, 0.58, 0.24), fwB: C(0.3, 0.52, 0.2),
  rough: C(0.25, 0.42, 0.16), deep: C(0.19, 0.33, 0.13),
  green: C(0.4, 0.66, 0.27), greenB: C(0.37, 0.62, 0.25), fringe: C(0.33, 0.56, 0.22),
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
        h += (baseY - 0.5 - h) * ek * ek;
        pos.set([x, h, z], k * 3);
        uv.set([x * 0.15, z * 0.15], k * 2);
        const t = T.terrain(x, z);
        const pr = T.project(x, z);
        switch (t.surface) {
          case 'fairway': c.copy(Math.floor(pr.s / 12) % 2 ? COL.fwA : COL.fwB); break;
          case 'green': c.copy(Math.floor((x * 0.6 + z) / 3) % 2 ? COL.green : COL.greenB); break;
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
        col.set([c.r * n, c.g * n, c.b * n], k * 3);
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
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: this.detail }));
    ground.receiveShadow = true;
    g.add(ground);

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
    this.flag = makeFlag(0xffd54a, 2.4, 0.9);
    const pinY = T.groundHeight(T.pin.x, T.pin.z);
    this.flag.position.set(T.pin.x, pinY, T.pin.z);
    g.add(this.flag);
    const cup = new THREE.Mesh(new THREE.CircleGeometry(0.054, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    cup.position.set(T.pin.x, pinY + 0.01, T.pin.z);
    g.add(cup);
    this.pinLight = new THREE.PointLight(0xffd9a0, 0, 26, 1.6);
    this.pinLight.position.set(T.pin.x, pinY + 6, T.pin.z);
    g.add(this.pinLight);

    // ── trees ──
    const N = 520;
    const con = new THREE.InstancedMesh(this.conGeo, this.treeMatA, N);
    const dec = new THREE.InstancedMesh(this.decGeo, this.treeMatB, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let nc = 0, nd = 0;
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
      } else {
        if (nd >= N) continue;
        const r = 4 + rand() * 4;
        sc.set(r, r * (0.9 + rand() * 0.4), r);
        dec.setMatrixAt(nd++, m4.compose(p3.set(x, y + r * 0.4, z), q, sc));
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

  _water(opts) { const m = createWaterMaterial(opts); this.waterMats.push(m); return m; }

  setDay(d) {
    this.day = d;
    if (!this.hole) return;
    for (const s of this.floods) s.intensity = 2600 * (1 - d);
    this.lampMat.color.setRGB(0.5 + 4.5 * (1 - d), 0.48 + 3.6 * (1 - d), 0.42 + 2.6 * (1 - d));
    if (this.pinLight) this.pinLight.intensity = 12 * (1 - d);
    if (this.landmark) setLandmarkDay(this.landmark, d);
    const fm = this.flag?.userData.flagMat;
    if (fm) fm.emissiveIntensity = 0.9 * (0.25 + 0.75 * (1 - d));
  }

  setWind(amount, fromDeg) {
    this.wind = amount; this.windFrom = fromDeg;
    if (!this.flag) return;
    this.flag.children[1].rotation.y = ((fromDeg + 90) * Math.PI) / 180;
  }

  update(t) {
    const sh = this.flag?.userData.flagMat.userData.shader;
    if (sh) { sh.uniforms.uTime.value = t; sh.uniforms.uWind.value = this.wind; }
  }
}
