// Procedural landmark models for the Confluence Course. Each builder returns
// { group, glow[] }: `group` sits on y = 0 at its base, and `glow` lists
// materials whose emissive uplighting fades in at night. Silhouettes are
// simplified but proportioned after the real structures; swap any of them
// for an authored glTF via ASSET_MANIFEST in js/scene/assets.js.
import * as THREE from 'three';
import { archGeometry, archMaterial } from '../scene/skyline.js';
import { piasaCanvas } from '../ui/piasa.js';

const FT = 0.3048;

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...opts });
}
function lit(color, glowColor, opts = {}) {
  const m = mat(color, { emissive: glowColor, emissiveIntensity: 0.0, ...opts });
  m.userData.night = opts.night ?? 0.55;
  return m;
}
function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y + h / 2, z);
  o.castShadow = true; o.receiveShadow = true;
  return o;
}
function cyl(rt, rb, h, m, x = 0, y = 0, z = 0, seg = 20) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  o.position.set(x, y + h / 2, z);
  o.castShadow = true; o.receiveShadow = true;
  return o;
}
function dome(r, m, x = 0, y = 0, z = 0, squash = 1) {
  const o = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), m);
  o.position.set(x, y, z);
  o.scale.y = squash;
  o.castShadow = true;
  return o;
}
function pyramid(w, h, d, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2 * Math.max(w, d), h, 4), m);
  o.rotation.y = Math.PI / 4;
  o.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
  o.position.set(x, y + h / 2, z);
  o.castShadow = true;
  return o;
}
function columns(n, spacing, r, h, m, x0, y, z) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) g.add(cyl(r, r * 1.08, h, m, x0 + i * spacing, y, z, 12));
  return g;
}
function arcRib(span, rise, thick, m, steps = 40) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    pts.push(new THREE.Vector3(-span / 2 + span * u, 4 * rise * u * (1 - u), 0));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps, thick, 6, false), m);
}

const B = {
  arch() {
    const a = archGeometry(1.0);
    const m = archMaterial();
    const mesh = new THREE.Mesh(a.geometry, m);
    const g = new THREE.Group();
    g.add(mesh);
    // the grounds: a low terrace either side of the legs
    const lawn = mat(0x6e8a52);
    g.add(box(a.span + 60, 1, 50, lawn, 0, -0.5, 0));
    return { group: g, glow: [], arch: m };
  },

  courthouse() {
    const g = new THREE.Group();
    const stone = lit(0xd9cdb6, 0xffd9a8);
    const dark = lit(0x3e4a44, 0x2a3a35, { metalness: 0.5, roughness: 0.4 });
    g.add(box(64, 18, 30, stone));
    g.add(box(22, 16, 46, stone, 0, 0, 0)); // cross wing
    g.add(columns(6, 3.2, 0.7, 13, stone, -8, 1.5, 24));
    g.add(pyramid(22, 5, 8, stone, 0, 15, 24));
    g.add(cyl(11, 11, 14, stone, 0, 18, 0, 32));
    for (let k = 0; k < 16; k++) { // colonnaded drum
      const an = (k / 16) * Math.PI * 2;
      g.add(cyl(0.5, 0.55, 9, stone, Math.cos(an) * 11.6, 21, Math.sin(an) * 11.6, 10));
    }
    g.add(cyl(9.5, 10, 5, stone, 0, 32, 0, 32));
    g.add(dome(10, dark, 0, 37, 0, 1.25));
    g.add(cyl(1.8, 2.2, 6, stone, 0, 49, 0, 12));
    g.add(dome(2.2, dark, 0, 55, 0, 1.4));
    return { group: g, glow: [stone, dark] };
  },

  eads() {
    const g = new THREE.Group();
    const steel = lit(0x4a5866, 0x7a8ea8, { metalness: 0.6, roughness: 0.45 });
    const stone = lit(0xb9ad97, 0xffd9a8);
    const spans = [72, 78, 72];
    let x = -(spans.reduce((a, b) => a + b, 0)) / 2;
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      for (const z of [-5, 5]) {
        const r = arcRib(s, 13, 0.7, steel);
        r.position.set(x + s / 2, 4, z);
        g.add(r);
      }
      for (let k = 1; k < 8; k++) {
        const u = k / 8;
        const h = 4 + 52 * u * (1 - u) * 1;
        g.add(box(0.4, 21 - h + 4, 0.4, steel, x + s * u, h, -5));
        g.add(box(0.4, 21 - h + 4, 0.4, steel, x + s * u, h, 5));
      }
      x += s;
    }
    g.add(box(spans.reduce((a, b) => a + b, 0) + 30, 2, 14, steel, 0, 21, 0));
    x = -(spans.reduce((a, b) => a + b, 0)) / 2;
    for (let i = 0; i <= spans.length; i++) {
      g.add(box(9, 22, 16, stone, x, -2, 0));
      x += spans[i] || 0;
    }
    g.rotation.y = Math.PI / 2; // spans the creek across the hole
    return { group: g, glow: [steel, stone] };
  },

  riverfront() {
    const g = new THREE.Group();
    const concrete = lit(0xcfc8b8, 0xffe2b8);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) g.add(cyl(5, 5, 42, concrete, i * 10.5, 0, j * 10.5, 18));
    g.add(box(66, 8, 26, concrete, 26, 42, 5));
    g.add(box(12, 58, 12, concrete, -10, 0, 5));
    // Clark Bridge style pylons with fanned cables
    const pyl = lit(0xe2ded6, 0xdfe8ff);
    const cableMat = new THREE.LineBasicMaterial({ color: 0xdfe6ef });
    const cables = [];
    for (const z of [-140, -260]) {
      g.add(box(3, 70, 3, pyl, -60, 0, z));
      for (let k = 1; k <= 10; k++) {
        cables.push(-60, 68 - k * 2, z, -60, 18, z - k * 9, -60, 68 - k * 2, z, -60, 18, z + k * 9);
      }
    }
    g.add(box(18, 2, 300, pyl, -60, 16, -200));
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(cables, 3)), cableMat));
    return { group: g, glow: [concrete, pyl] };
  },

  piasa() {
    const g = new THREE.Group();
    // limestone bluff wall with the painted Piasa
    const rock = mat(0xb9ae98, { roughness: 1 });
    const geo = new THREE.PlaneGeometry(220, 46, 60, 12);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      p.setZ(i, Math.sin(x * 0.09) * 2.5 + Math.sin(y * 0.4 + x * 0.05) * 1.2 + (Math.abs(x) > 80 ? (Math.abs(x) - 80) * 0.4 : 0));
      p.setY(i, y + 23 + Math.sin(x * 0.05) * 3 * (y > 0 ? 1 : 0));
    }
    geo.computeVertexNormals();
    const wall = new THREE.Mesh(geo, rock);
    wall.receiveShadow = true;
    g.add(wall);
    // trees on top
    const tree = mat(0x24391f, { flatShading: true });
    for (let i = 0; i < 24; i++) {
      const t = new THREE.Mesh(new THREE.IcosahedronGeometry(4 + Math.random() * 3, 0), tree);
      t.position.set(-105 + i * 9 + Math.random() * 4, 48 + Math.random() * 3, -3 - Math.random() * 6);
      g.add(t);
    }
    const muralMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, transparent: true, emissive: 0xffd9a8, emissiveIntensity: 0 });
    muralMat.userData.night = 0.35;
    const mural = new THREE.Mesh(new THREE.PlaneGeometry(34, 24), muralMat);
    mural.position.set(0, 24, 3.2);
    g.add(mural);
    piasaCanvas(1024, 725).then((c) => {
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      muralMat.map = tex;
      muralMat.emissiveMap = tex;
      muralMat.needsUpdate = true;
    });
    return { group: g, glow: [muralMat] };
  },

  chainofrocks() {
    const g = new THREE.Group();
    const steel = lit(0x6a6e64, 0xc8d0dc, { metalness: 0.5, roughness: 0.5, night: 0.35 });
    // two straight truss runs meeting at a 22° bend
    const runs = [{ len: 260, ang: 0 }, { len: 220, ang: (22 * Math.PI) / 180 }];
    let cx = 0, cz = 0, a0 = Math.PI / 2;
    for (const r of runs) {
      const seg = new THREE.Group();
      seg.add(box(r.len, 1.6, 10, steel, r.len / 2, 12, 0));
      const verts = [];
      for (let i = 0; i <= r.len; i += 12) {
        for (const z of [-5, 5]) {
          verts.push(i, 13.6, z, i + 6, 21, z, i + 6, 21, z, i + 12, 13.6, z, i, 21, z, i + 12, 21, z);
        }
      }
      seg.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)),
        new THREE.LineBasicMaterial({ color: 0x3e423c })));
      for (let i = 0; i <= r.len; i += 60) seg.add(box(5, 12, 9, mat(0xa59c8c), i, 0, 0));
      seg.position.set(cx, 0, cz);
      seg.rotation.y = a0 + r.ang;
      g.add(seg);
      cx += Math.cos(-(a0 + r.ang)) * r.len;
      cz += Math.sin(-(a0 + r.ang)) * r.len;
    }
    // castle-like water intake towers
    const stone = lit(0xd0c6b0, 0xffe2b8);
    const roof = mat(0x5c4436);
    const t1 = new THREE.Group();
    t1.add(cyl(7, 8, 16, stone));
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      t1.add(box(1.6, 2, 1.6, stone, Math.cos(a) * 6.8, 16, Math.sin(a) * 6.8));
    }
    t1.add(new THREE.Mesh(new THREE.ConeGeometry(6, 9, 20), roof).translateY(22));
    t1.position.set(-70, 0, -60);
    const t2 = new THREE.Group();
    t2.add(box(13, 15, 13, stone));
    for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) t2.add(cyl(2, 2, 19, stone, x, 0, z, 10));
    t2.add(pyramid(13, 6, 13, roof, 0, 15, 0));
    t2.position.set(-40, 0, -150);
    g.add(t1, t2);
    return { group: g, glow: [steel, stone] };
  },

  cahokia() {
    // Monks Mound: two broad terraces of grassed earth, with smaller mounds and a
    // ring of Woodhenge posts. Drawn respectfully as landscape.
    const g = new THREE.Group();
    const grass = mat(0x6d8c4c, { roughness: 1 });
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(58, 74, 14, 4, 1), grass);
    t1.rotation.y = Math.PI / 4; t1.scale.set(1.25, 1, 1); t1.position.y = 7;
    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(30, 44, 10, 4, 1), grass);
    t2.rotation.y = Math.PI / 4; t2.scale.set(1.1, 1, 1); t2.position.set(-12, 19, -10);
    g.add(t1, t2);
    for (const [x, z, r, h] of [[120, 40, 22, 8], [-130, 70, 16, 6], [90, -110, 18, 7]]) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 20), grass);
      m.position.set(x, h / 2, z);
      g.add(m);
    }
    const post = mat(0x6b4e33);
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      g.add(cyl(0.35, 0.4, 7, post, -150 + Math.cos(a) * 36, 0, -60 + Math.sin(a) * 36, 6));
    }
    g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    return { group: g, glow: [] };
  },

  basilica() {
    const g = new THREE.Group();
    const stone = lit(0xc9c0ae, 0xffe0b5);
    const copper = lit(0x5d8f7c, 0x5d8f7c, { roughness: 0.55, night: 0.3 });
    g.add(box(30, 26, 90, stone));
    g.add(box(80, 26, 26, stone, 0, 0, -10));
    g.add(cyl(14, 14, 16, stone, 0, 26, -10, 24));
    g.add(dome(14.5, copper, 0, 42, -10, 1.1));
    g.add(cyl(2, 2.4, 7, stone, 0, 57, -10, 10));
    for (const x of [-12, 12]) {
      g.add(box(12, 50, 12, stone, x, 0, 44));
      g.add(dome(6.5, copper, x, 50, 44, 1));
    }
    g.add(box(18, 18, 4, stone, 0, 0, 47));
    return { group: g, glow: [stone, copper] };
  },

  riverboat() {
    const g = new THREE.Group();
    const white = lit(0xf1ede4, 0xffd59a, { night: 0.45 });
    const red = mat(0x9a2b22);
    const black = mat(0x1d1d1f);
    g.add(box(64, 3, 16, white, 0, 0, 0));
    g.add(box(52, 4, 14, white, -2, 3, 0));
    g.add(box(40, 4, 12, white, -4, 7, 0));
    g.add(box(12, 3.5, 8, white, 4, 11, 0));
    for (const z of [-3, 3]) g.add(cyl(0.8, 0.9, 12, black, 14, 11, z, 12));
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 12, 18, 1, true), red);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(-36, 5, 0);
    g.add(wheel);
    for (let i = 0; i < 9; i++) g.add(box(0.4, 9, 12.2, red, -36, 0.5, 0).rotateZ((i / 9) * Math.PI));
    return { group: g, glow: [white] };
  },

  unionstation() {
    const g = new THREE.Group();
    const stone = lit(0xb8a88e, 0xffd9a8);
    const roof = mat(0x5a3b2c);
    g.add(box(120, 18, 26, stone));
    const gable = new THREE.Mesh(new THREE.ConeGeometry(18, 12, 4), roof);
    gable.rotation.y = Math.PI / 4; gable.scale.set(4.6, 1, 1); gable.position.set(0, 24, 0);
    g.add(gable);
    // clock tower
    g.add(box(12, 52, 12, stone, -30, 0, 8));
    g.add(pyramid(13, 14, 13, roof, -30, 52, 8));
    const clock = lit(0xf5f0e0, 0xfff1d0, { night: 1.2 });
    for (const [x, z, ry] of [[-30, 14.1, 0], [-23.9, 8, Math.PI / 2]]) {
      const c = new THREE.Mesh(new THREE.CircleGeometry(3, 24), clock);
      c.position.set(x, 44, z); c.rotation.y = ry;
      g.add(c);
    }
    for (const x of [30, 52]) g.add(box(8, 26, 8, stone, x, 0, 9), pyramid(9, 8, 9, roof, x, 26, 9));
    return { group: g, glow: [stone, clock] };
  },

  climatron() {
    const g = new THREE.Group();
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfd6dd, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.55, emissive: 0x88c8a0, emissiveIntensity: 0 });
    glass.userData.night = 0.5;
    const geo = new THREE.IcosahedronGeometry(34, 3);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, 0);
    const shell = new THREE.Mesh(geo, glass);
    shell.scale.y = 0.62;
    g.add(shell);
    const frame = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x4a5560 }));
    frame.scale.y = 0.62;
    g.add(frame);
    const plants = mat(0x2f6b34);
    for (let i = 0; i < 18; i++) {
      const t = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + Math.random() * 3, 0), plants);
      t.position.set((Math.random() - 0.5) * 40, 3 + Math.random() * 6, (Math.random() - 0.5) * 40);
      g.add(t);
    }
    return { group: g, glow: [glass] };
  },

  watertower() {
    const g = new THREE.Group();
    const white = lit(0xf3f0e8, 0xfff2dc, { night: 0.6 });
    const h = 154 * FT;
    g.add(box(10, 6, 10, white));
    g.add(cyl(2.6, 3.0, h - 12, white, 0, 6, 0, 24));
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2;
      g.add(box(0.35, h - 12, 0.35, white, Math.cos(a) * 2.9, 6, Math.sin(a) * 2.9));
    }
    g.add(cyl(4.6, 3.0, 4, white, 0, h - 6, 0, 24));
    g.add(box(9, 1.6, 9, white, 0, h - 2, 0));
    g.add(cyl(1, 1.6, 4, white, 0, h - 0.4, 0, 12));
    return { group: g, glow: [white] };
  },

  confluence() {
    const g = new THREE.Group();
    const conc = lit(0xd8d8d0, 0xe8eeff, { night: 0.4 });
    const h = 180 * FT;
    for (const x of [-7, 7]) g.add(box(5, h, 5, conc, x, 0, 0));
    for (const y of [50 * FT, 100 * FT, 150 * FT]) g.add(box(24, 1.2, 9, conc, 0, y, 0));
    const rail = new THREE.MeshStandardMaterial({ color: 0x8c949c, metalness: 0.6, roughness: 0.4 });
    for (const y of [50 * FT, 100 * FT, 150 * FT]) g.add(box(24, 1.1, 0.2, rail, 0, y + 1.2, 4.4), box(24, 1.1, 0.2, rail, 0, y + 1.2, -4.4));
    return { group: g, glow: [conc] };
  },

  locks() {
    const g = new THREE.Group();
    const conc = lit(0xc8c3b6, 0xfff0d0, { night: 0.35 });
    const steel = mat(0x5b6670, { metalness: 0.5 });
    for (let i = 0; i < 10; i++) g.add(box(5, 16, 14, conc, i * 26, 0, 0));
    for (let i = 0; i < 9; i++) g.add(box(21, 8, 3, steel, i * 26 + 13, 2, 0));
    g.add(box(250, 2, 8, conc, 118, 16, 0));
    g.add(box(8, 12, 140, conc, -18, 0, 60), box(8, 12, 140, conc, -48, 0, 60));
    return { group: g, glow: [conc] };
  },

  pavilion() {
    const g = new THREE.Group();
    const stone = lit(0xe1d8c4, 0xffe2b5);
    const tile = mat(0xa4482f);
    g.add(box(46, 1.5, 18, stone));
    for (let i = 0; i < 8; i++) for (const z of [-8, 8]) g.add(box(1.4, 9, 1.4, stone, -21 + i * 6, 1.5, z));
    g.add(box(48, 2.5, 20, stone, 0, 10.5, 0));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(16, 7, 4), tile);
    roof.rotation.y = Math.PI / 4; roof.scale.set(2.2, 1, 0.95); roof.position.set(0, 16.5, 0);
    g.add(roof);
    // grand stair down the hill
    for (let k = 0; k < 8; k++) g.add(box(18 - k, 0.6, 3, stone, 0, -0.6 * (k + 1), 10 + k * 3));
    return { group: g, glow: [stone] };
  },

  jewelbox() {
    const g = new THREE.Group();
    const glass = new THREE.MeshStandardMaterial({ color: 0xcfe3ea, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.6, emissive: 0xffe6b0, emissiveIntensity: 0 });
    glass.userData.night = 0.6;
    const frame = mat(0x6f7a80, { metalness: 0.6 });
    const tiers = [[50, 10, 20], [42, 8, 17], [34, 7, 14], [24, 6, 10]];
    let y = 0;
    for (const [w, h, d] of tiers) {
      g.add(box(w, h, d, glass, 0, y, 0));
      g.add(box(w + 0.6, 0.6, d + 0.6, frame, 0, y + h - 0.3, 0));
      y += h;
    }
    const pool = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 40), mat(0x4a7b8c, { roughness: 0.1 }));
    pool.position.set(0, 0.1, 34);
    g.add(pool);
    return { group: g, glow: [glass] };
  },

  wadlow() {
    // Life-size bronze of Robert Wadlow (8 ft 11 in) beside his chair.
    const g = new THREE.Group();
    const bronze = mat(0x7a5a35, { metalness: 0.7, roughness: 0.35 });
    const stone = lit(0xbdb6a6, 0xffe0b0, { night: 0.5 });
    g.add(box(4.2, 0.5, 3, stone));
    const H = 2.72;
    const fig = new THREE.Group();
    fig.add(cyl(0.11, 0.13, H * 0.47, bronze, -0.14, 0, 0, 10), cyl(0.11, 0.13, H * 0.47, bronze, 0.14, 0, 0, 10));
    fig.add(cyl(0.26, 0.22, H * 0.34, bronze, 0, H * 0.47, 0, 14));
    fig.add(cyl(0.07, 0.08, H * 0.32, bronze, -0.36, H * 0.5, 0, 8), cyl(0.07, 0.08, H * 0.32, bronze, 0.36, H * 0.5, 0, 8));
    fig.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), bronze).translateY(H * 0.9));
    fig.position.set(-0.8, 0.5, 0);
    g.add(fig);
    const chair = new THREE.Group();
    chair.add(box(0.9, 0.12, 0.9, bronze, 0, 0.75, 0), box(0.9, 1.3, 0.12, bronze, 0, 0.8, -0.4));
    for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) chair.add(box(0.08, 0.75, 0.08, bronze, x, 0, z));
    chair.position.set(1.0, 0.5, 0);
    g.add(chair);
    return { group: g, glow: [stone] };
  },
};

export function buildLandmark(type) {
  const b = B[type];
  if (!b) return { group: new THREE.Group(), glow: [] };
  const out = b();
  out.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return out;
}

/** 0 = night .. 1 = day: uplights fade in after dark. */
export function setLandmarkDay(lm, d) {
  for (const m of lm.glow) m.emissiveIntensity = (m.userData.night ?? 0.5) * (1 - d);
  if (lm.arch) {
    lm.arch.uniforms.uDay.value = d;
  }
}
