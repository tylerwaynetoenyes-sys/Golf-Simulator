// City Museum, St. Louis: the 10-storey brick former International Shoe Co.
// warehouse (opened as a museum by Bob Cassilly in 1997). On the roof: the
// school bus cantilevered over the parapet, the rooftop Ferris wheel (turns),
// the giant praying mantis, a rebar dome and slides. In front: MonstroCity —
// welded rebar towers, two Sabreliner jet fuselages held high, coiled
// "slinky" wire tunnels, a castle turret, a fire engine, spiral slides and a
// giant rebar cage ball, strung with lights at night.
// Front faces +Z. Footprint x∈[-55,55], z∈[-45,55], ~59 m to the top of the wheel.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, lit, box, cyl, seeded, canvasTex, tree, SLOT } from './kit.js';
import { pbr } from '../../scene/pbr.js';
import { bx } from './riverfront.js';

function batcher() {
  const lists = new Map();
  const tmp = new THREE.Matrix4();
  return {
    add(o, proj = null, parent = null) {
      o.updateMatrix();
      let g = o.geometry.clone();
      g.applyMatrix4(parent ? tmp.copy(parent).multiply(o.matrix) : o.matrix);
      if (g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (proj) boxUV(g, proj);
      if (!lists.has(o.material)) lists.set(o.material, []);
      lists.get(o.material).push(g);
      return o;
    },
    build(group) {
      const out = [];
      for (const [m, geos] of lists) {
        const mesh = new THREE.Mesh(mergeGeometries(geos), m);
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh); out.push(mesh);
      }
      return out;
    },
  };
}
function boxUV(g, { su = 4, sv = 4, top = true }) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i) / su; v = p.getZ(i) / su; if (!top) { u = 0.02; v = 0.02; } }
    else if (ax >= az) { u = p.getZ(i) / su; v = p.getY(i) / sv; }
    else { u = p.getX(i) / su; v = p.getY(i) / sv; }
    uv.setXY(i, u, v);
  }
}
function mesh(geo, m, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
  return o;
}

// ---------- textures ----------
const BAY = 6, FLOOR = 4.4;
function signTex() {
  return canvasTex(512, 64, (g, w, h) => {
    g.fillStyle = '#5a1d16'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4e3c0'; g.font = 'bold 44px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('CITY MUSEUM', w / 2, h / 2 + 2);
  });
}
export default function build() {
  const group = new THREE.Group();
  const B = batcher();
  const rnd = seeded(1997);

  // painted and bare steel, brick, stone: photographed surfaces (pbr.js)
  const paint = (tint, o = {}) => pbr('painted_steel', { scale: 1.5, tint, metal: 0.25, ...o });
  const brick = pbr('red_brick', { scale: 1.6, tint: 0xa8786a });
  const glass = mat(0x28313b, { roughness: 0.08, metalness: 0.6 });
  const lamp = lit(0x28313b, 0xffd29a, { night: 1.1, roughness: 0.08, metalness: 0.6 });
  const sash = paint(0xd8d4c8, { scale: 1, bright: 1.3 });
  const concrete = pbr('concrete_wall_008', { scale: 3, tint: 0xd2dcf6, bright: 1.3 });
  const stoneTrim = pbr('sandstone_blocks_08', { scale: 1.6, tint: 0xf0e6d4, bright: 1.15 });
  const roofM = pbr('gravel_stones', { scale: 1.5, tint: 0x8a8884 });
  const ground = pbr('brushed_concrete', { scale: 3, tint: 0xb8b0a4, offset: -1 });
  const yellow = paint(0xffbe2a, { bright: 1.6 });
  const black = paint(0x2a2a2c, { metal: 0.4 });
  const busGlass = glass;
  const jetM = pbr('painted_steel', { scale: 1.2, tint: 0xdfe3e6, metal: 0.7, rough: 0.6, bright: 1.4 });
  const jetDark = paint(0x34404c, { metal: 0.4 });
  const red = paint(0xc8301e, { bright: 1.3 });
  const chrome = pbr('painted_steel', { scale: 1, tint: 0xd0d4d8, metal: 0.9, rough: 0.4, bright: 1.4 });
  const mantisM = paint(0x6fae44, { bright: 1.3, metal: 0.4 });
  const wingM = mat(0x8fbf6a, { roughness: 0.5, metalness: 0.3, transparent: true, opacity: 0.85 });
  const castleM = pbr('granite_wall', { scale: 1.4, tint: 0xd2dcf6, bright: 1.25 });
  const castleRoof = pbr('roof_slates_02', { scale: 1.2, tint: 0xb08870 });
  const plank = pbr('corrugated_iron', { scale: 1, tint: 0x9a9ea2, metal: 0.5 }); // steel grating decks
  const tankM = pbr('wood_planks_grey', { scale: 1.2, tint: 0xc8a888 });
  const signM = lit(0xffffff, 0xffffff, { map: signTex(), roughness: 0.6, night: 0.6 });
  signM.emissiveMap = signM.map;
  const bulbM = lit(0xfff4d8, 0xffd590, { night: 2.6, roughness: 0.3 });
  const wheelBulb = lit(0xfff0f0, 0xff7a9a, { night: 2.4, roughness: 0.3 });
  const glow = [lamp, signM, bulbM, wheelBulb];

  // ---------- the warehouse ----------
  const X0 = -42, X1 = 42, Z0 = -45, ZF = -10, H = 45;
  // the glazed core; brick piers and spandrels stand proud of it, so every
  // window is a real opening with steel sash set back in the wall
  B.add(box(X1 - X0, H - 5, ZF - Z0, glass, 0, 5, (Z0 + ZF) / 2));
  const lit_ = seeded(42);
  const face = (cx, cz, ry, L, y0, y1) => {
    const sn = Math.sin(ry), cs = Math.cos(ry);
    const put = (m, w, h, d, u, y, t) => B.add(new THREE.Mesh(bx(w, h, d, cx + u * cs + t * sn, y, cz - u * sn + t * cs, ry), m));
    const n = Math.round(L / BAY), bw = L / n, floors = Math.round((y1 - y0) / FLOOR);
    for (let i = 0; i <= n; i++) put(brick, 1.0, y1 - y0, 0.7, -L / 2 + i * bw, y0, 0.35); // piers
    for (let f = 0; f < floors; f++) {
      const yf = y0 + f * FLOOR;
      put(brick, L, 0.9, 0.5, 0, yf, 0.25); // spandrel under the sill
      put(brick, L, 0.6, 0.5, 0, yf + 3.8, 0.25); // and over the head
      put(stoneTrim, L, 0.16, 0.8, 0, yf + 0.82, 0.4); // stone sill course
      put(sash, L, 0.09, 0.08, 0, yf + 2.5, 0.1); // transom bar
      for (let i = 0; i < n; i++) {
        const u = -L / 2 + (i + 0.5) * bw;
        put(sash, bw - 1.0, 0.1, 0.1, u, yf + 0.9, 0.1);
        if (lit_() < 0.5) put(lamp, bw - 1.0, 2.9, 0.04, u, yf + 0.9, 0.03);
      }
    }
    for (let i = 0; i < n; i++) for (let k = 1; k < 4; k++) put(sash, 0.08, y1 - y0, 0.08, -L / 2 + i * bw + 0.5 + (bw - 1) * k / 4, y0, 0.1); // mullions
  };
  face(0, ZF, 0, X1 - X0, 5, H - 1.4);
  face(0, Z0, Math.PI, X1 - X0, 5, H - 1.4);
  face(X1, (Z0 + ZF) / 2, Math.PI / 2, ZF - Z0, 5, H - 1.4);
  face(X0, (Z0 + ZF) / 2, -Math.PI / 2, ZF - Z0, 5, H - 1.4);
  B.add(box(X1 - X0 + 0.4, 5, ZF - Z0 + 0.4, concrete, 0, 0, (Z0 + ZF) / 2));
  B.add(box(X1 - X0, 0.3, ZF - Z0, roofM, 0, H, (Z0 + ZF) / 2));
  // storefront bays in the base
  for (let x = X0 + 4; x < X1 - 2; x += 6) {
    if (Math.abs(x) < 4) continue;
    B.add(box(4.2, 3.2, 0.1, lamp, x + 1, 0.6, ZF + 0.25));
  }
  // entrance canopy and sign
  B.add(box(14, 0.4, 3.2, concrete, 0, 4.2, ZF + 1.6));
  B.add(box(9, 3.8, 0.1, lamp, 0, 0.2, ZF + 0.25));
  B.add(box(16, 2, 0.25, signM, 0, 5.7, ZF + 0.3));
  // cornice, parapet, belt course
  B.add(box(X1 - X0 + 2.0, 1.2, ZF - Z0 + 2.0, stoneTrim, 0, H - 1.6, (Z0 + ZF) / 2));
  B.add(box(X1 - X0 + 1.4, 0.5, ZF - Z0 + 1.4, stoneTrim, 0, 5, (Z0 + ZF) / 2));
  for (const z of [Z0 + 0.3, ZF - 0.3]) B.add(box(X1 - X0, 1.6, 0.6, brick, 0, H - 0.4, z));
  for (const x of [X0 + 0.3, X1 - 0.3]) B.add(box(0.6, 1.6, ZF - Z0, brick, x, H - 0.4, (Z0 + ZF) / 2));
  for (const z of [Z0 + 0.3, ZF - 0.3]) B.add(box(X1 - X0 + 0.2, 0.2, 0.8, stoneTrim, 0, H + 1.2, z));
  for (const x of [X0 + 0.3, X1 - 0.3]) B.add(box(0.8, 0.2, ZF - Z0, stoneTrim, x, H + 1.2, (Z0 + ZF) / 2));
  // rooftop penthouse + timber water tank on its steel stand
  B.add(box(14, 5, 9, brick, 26, H, -38));
  B.add(box(14.6, 0.5, 9.6, stoneTrim, 26, H + 5, -38));
  for (const [x, z] of [[-34, -40], [-30, -40], [-34, -36], [-30, -36]]) B.add(cyl(0.18, 0.18, 6, black, x, H, z, 6));
  B.add(cyl(2.6, 2.6, 4, tankM, -32, H + 6, -38, 20));
  for (const y of [H + 6.6, H + 8, H + 9.4]) B.add(mesh(new THREE.TorusGeometry(2.63, 0.05, 4, 24).rotateX(Math.PI / 2), black, -32, y, -38));
  B.add(mesh(new THREE.ConeGeometry(2.8, 1.6, 20), black, -32, H + 10.8, -38));

  // ---------- rooftop: school bus cantilevered over the front edge ----------
  {
    const P = new THREE.Matrix4().compose(new THREE.Vector3(30, H + 0.9, ZF - 2.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.05, 0.12, 0)), new THREE.Vector3(1, 1, 1));
    const L = 11.5;
    B.add(box(2.5, 2.4, L, yellow, 0, 0.5, 0), null, P);
    // rounded roof: half cylinder along the bus, squashed
    B.add(mesh(new THREE.CylinderGeometry(1.25, 1.25, L, 16, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).scale(1, 0.25, 1), yellow, 0, 2.9, 0), null, P);
    B.add(box(2.2, 1.0, 1.6, yellow, 0, 0.3, L / 2 + 0.8), null, P); // hood
    for (const sx of [-1, 1]) {
      B.add(box(0.06, 0.9, L - 1.2, busGlass, sx * 1.26, 1.7, 0.2), null, P);
      B.add(box(0.06, 0.12, L, black, sx * 1.27, 1.3, 0), null, P);
      B.add(box(0.06, 0.12, L, black, sx * 1.27, 0.95, 0), null, P);
      for (const z of [-L / 2 + 2, L / 2 - 1]) B.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12).rotateZ(Math.PI / 2), black, sx * 1.15, 0.5, z), null, P);
      for (let k = 0; k < 9; k++) B.add(box(0.07, 0.95, 0.12, yellow, sx * 1.27, 1.68, -L / 2 + 1.0 + k * 1.15), null, P);
    }
    B.add(box(2.3, 1.0, 0.06, busGlass, 0, 1.7, L / 2 + 0.03), null, P);
    B.add(box(2.6, 0.25, 0.3, black, 0, 0.25, L / 2 + 1.65), null, P);
    // steel cradle bolted to the roof
    for (const z of [-4, -1.5]) B.add(box(3.2, 0.9, 0.4, black, 0, -0.9, z), null, P);
  }

  // ---------- rooftop: praying mantis ----------
  {
    const P = new THREE.Matrix4().compose(new THREE.Vector3(4, H, -24), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.5, 0)), new THREE.Vector3(1.15, 1.15, 1.15));
    const ell = (rx, ry, rz, x, y, z, ax = 0) => { const o = mesh(new THREE.SphereGeometry(1, 14, 10), mantisM, x, y, z, 0, ax); o.scale.set(rx, ry, rz); B.add(o, null, P); };
    ell(0.9, 0.8, 3.0, 0, 3.0, -2.6, -0.35); // abdomen
    ell(0.45, 0.45, 1.6, 0, 4.2, 0.3, -1.0); // prothorax, rising
    ell(0.6, 0.5, 0.5, 0, 5.4, 1.0); // head
    const leg = (pts, r) => { const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.1); B.add(new THREE.Mesh(new THREE.TubeGeometry(c, 10, r, 6), mantisM), null, P); };
    for (const sx of [-1, 1]) {
      ell(0.12, 0.12, 0.5, sx * 0.35, 5.95, 0.95, -0.6); // antenna base
      leg([[sx * 0.2, 6.1, 1.0], [sx * 0.6, 7.2, 1.8], [sx * 0.8, 7.6, 2.8]], 0.04);
      // raptorial forelegs folded in front
      leg([[sx * 0.3, 4.4, 0.9], [sx * 0.6, 3.6, 2.0], [sx * 0.5, 4.8, 2.6], [sx * 0.4, 4.2, 1.8]], 0.2);
      // walking legs
      leg([[sx * 0.4, 3.4, -0.3], [sx * 2.3, 3.9, 0.3], [sx * 3.1, 0.1, 1.2]], 0.12);
      leg([[sx * 0.5, 3.1, -1.0], [sx * 2.6, 3.8, -2.0], [sx * 3.2, 0.1, -3.6]], 0.12);
      // wings folded along the back
      const w = mesh(new THREE.SphereGeometry(1, 10, 6), wingM, sx * 0.35, 3.7, -2.6, sx * 0.08, -0.35);
      w.scale.set(0.5, 0.15, 2.8); B.add(w, null, P);
    }
    for (const sx of [-1, 1]) B.add(box(0.8, 0.3, 0.8, black, sx * 3.1, 0, 1.2), null, P);
  }

  // ---------- rooftop: rebar dome + slides ----------
  const rods = [];
  const rod = (a, b, r, c = 0) => rods.push([a, b, r, c]);
  {
    const cx = -6, cz = -38, R = 6;
    const ico = new THREE.IcosahedronGeometry(R, 2), p = ico.attributes.position, seen = new Set();
    for (let i = 0; i < p.count; i += 3) for (let k = 0; k < 3; k++) {
      const a = new THREE.Vector3().fromBufferAttribute(p, i + k), b = new THREE.Vector3().fromBufferAttribute(p, i + (k + 1) % 3);
      if (a.y < -0.3 && b.y < -0.3) continue;
      const key = [a, b].map((v) => v.toArray().map((n) => n.toFixed(2)).join()).sort().join('|');
      if (seen.has(key)) continue; seen.add(key);
      a.y = Math.max(a.y, 0); b.y = Math.max(b.y, 0);
      rod(a.add(new THREE.Vector3(cx, H, cz)), b.add(new THREE.Vector3(cx, H, cz)), 0.07, 2);
    }
  }
  const slide = (pts, r = 0.55, m = chrome) => { const c = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q))); B.add(new THREE.Mesh(new THREE.TubeGeometry(c, 40, r, 10), m)); };
  slide([[14, H + 6, -36], [16, H + 4.5, -30], [12, H + 3, -26], [9, H + 1.6, -30], [12, H + 0.6, -34]], 0.5, red);
  slide([[-36, H + 5, -20], [-30, H + 3, -16], [-26, H + 1.4, -20], [-28, H + 0.4, -25]], 0.5, chrome);
  // slide tower on roof
  latticeTower(14, -36, 1.8, H, 6, 1);

  // ---------- rooftop Ferris wheel (animated) ----------
  const wheel = new THREE.Group();
  const WB = batcher();
  const WR = 7.2, WCX = -18, WCY = H + 9.4, WCZ = -30;
  {
    const ringG = new THREE.TorusGeometry(WR, 0.13, 6, 64);
    for (const z of [-0.9, 0.9]) {
      WB.add(mesh(ringG, red, 0, 0, z));
      WB.add(mesh(new THREE.TorusGeometry(WR * 0.62, 0.08, 5, 48), red, 0, 0, z));
    }
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      for (const z of [-0.9, 0.9]) {
        const s = mesh(new THREE.CylinderGeometry(0.05, 0.05, WR, 4), chrome, Math.cos(a) * WR / 2, Math.sin(a) * WR / 2, z, 0, 0, a - Math.PI / 2);
        WB.add(s);
      }
      WB.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 4).rotateX(Math.PI / 2), red, Math.cos(a) * WR, Math.sin(a) * WR, 0));
    }
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * Math.PI * 2;
      for (const z of [-1.0, 1.0]) WB.add(mesh(new THREE.SphereGeometry(0.11, 6, 4), wheelBulb, Math.cos(a) * WR, Math.sin(a) * WR, z));
    }
    WB.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 2.4, 12).rotateX(Math.PI / 2), black, 0, 0, 0));
    WB.build(wheel);
  }
  wheel.position.set(WCX, WCY, WCZ);
  group.add(wheel);
  const gondolas = [];
  const gondG = (() => {
    const gb = [];
    const body = new THREE.BoxGeometry(1.2, 1.0, 1.1).translate(0, -1.3, 0);
    const roof = new THREE.CylinderGeometry(0.2, 0.75, 0.35, 8).translate(0, -0.65, 0);
    const hang = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 4).translate(0, -0.3, 0);
    for (const g of [body, roof, hang]) gb.push(g.index ? g.toNonIndexed() : g);
    return mergeGeometries(gb);
  })();
  const gondColors = [0xe0b030, 0x2f6fb0, 0xb3261e, 0x3d8a4a];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const gm = new THREE.Mesh(gondG, paint(gondColors[i % 4], { bright: 1.3 }));
    gm.position.set(WCX + Math.cos(a) * WR, WCY + Math.sin(a) * WR, WCZ);
    gm.userData.a = a;
    group.add(gm); gondolas.push(gm);
  }
  // A-frame supports
  for (const z of [-1.6, 1.6]) for (const sx of [-1, 1]) rod(new THREE.Vector3(WCX, WCY, WCZ + z * 0.7), new THREE.Vector3(WCX + sx * 4.2, H, WCZ + z * 1.6), 0.18, 1);
  B.add(box(10, 0.5, 5, plank, WCX, H, WCZ));

  // ---------- MonstroCity ----------
  B.add(box(100, 0.08, 64, ground, 0, 0, 22));
  const T = [ // x, z, height, half-size
    [-33, 4, 16, 1.4], [-14, 14, 20, 1.6], [6, 6, 17, 1.4], [27, 16, 13, 1.3],
    [-40, 30, 10, 1.2], [-20, 38, 12, 1.3], [3, 32, 15, 1.4], [22, 40, 9, 1.2],
    [42, 2, 21, 1.5], [-2, 48, 7, 1.1], [36, 34, 11, 1.2],
  ];
  T.forEach(([x, z, h, s], i) => latticeTower(x, z, s, 0, h, i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 0));
  // catwalk platforms on top
  for (const [x, z, h, s] of T) B.add(box(s * 2 + 1.6, 0.2, s * 2 + 1.6, plank, x, h, z));
  // slinky tunnels between tower tops and the building
  const links = [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [6, 7], [2, 6], [3, 10], [0, 4], [6, 9]];
  const top = (i) => new THREE.Vector3(T[i][0], T[i][2] - 1.0, T[i][1]);
  for (const [a, b] of links) slinky(top(a), top(b), 1.15);
  slinky(top(0).clone(), new THREE.Vector3(-33, 14, ZF), 1.15);
  slinky(top(8).clone(), new THREE.Vector3(36, 19, ZF), 1.15);
  slinky(top(1).clone().add(new THREE.Vector3(0, -6, 0)), new THREE.Vector3(-12, 9, ZF), 1.1);
  // tangled rebar squiggles across the frame
  for (let i = 0; i < 70; i++) {
    const ta = T[(rnd() * T.length) | 0];
    const y = 2 + rnd() * (ta[2] - 2);
    const a = new THREE.Vector3(ta[0] + (rnd() - 0.5) * 3, y, ta[1] + (rnd() - 0.5) * 3);
    const b = a.clone().add(new THREE.Vector3((rnd() - 0.5) * 9, (rnd() - 0.5) * 5, (rnd() - 0.5) * 9));
    b.y = Math.max(0.3, b.y);
    rod(a, b, 0.06, rnd() < 0.5 ? 0 : 2);
  }
  // two Sabreliner fuselages held high
  jet(new THREE.Vector3(-14, 20.6, 14), 0.35, 0.0);
  jet(new THREE.Vector3(3, 15.6, 32), -0.9, 0.05);
  // castle turret
  {
    const cx = 36, cz = 34, r = 3.6, h = 15;
    B.add(cyl(r, r + 0.3, h, castleM, cx, 0, cz, 20));
    B.add(cyl(r + 0.6, r + 0.6, 1.0, castleM, cx, h, cz, 20));
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; B.add(mesh(new THREE.BoxGeometry(1.1, 1.1, 0.8), castleM, cx + Math.sin(a) * (r + 0.3), h + 1.55, cz + Math.cos(a) * (r + 0.3), a)); }
    B.add(mesh(new THREE.ConeGeometry(r + 0.4, 6, 20), castleRoof, cx, h + 5, cz));
    for (const y of [4, 8.5, 12]) B.add(mesh(new THREE.BoxGeometry(0.7, 1.4, 0.3), black, cx, y, cz + r + 0.1));
  }
  // fire engine
  {
    const P = new THREE.Matrix4().compose(new THREE.Vector3(-30, 0, 47), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.35, 0)), new THREE.Vector3(1, 1, 1));
    B.add(box(2.5, 1.8, 8.5, red, 0, 0.8, -0.5), null, P);
    B.add(box(2.5, 1.3, 2.2, red, 0, 2.6, 2.4), null, P);
    B.add(box(2.4, 0.7, 0.05, busGlass, 0, 2.9, 3.52), null, P);
    B.add(box(2.6, 0.35, 0.3, chrome, 0, 0.55, 3.75), null, P);
    for (const sx of [-1, 1]) for (const z of [-3.5, -2.2, 2.4]) B.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 12).rotateZ(Math.PI / 2), black, sx * 1.15, 0.55, z), null, P);
    for (const sx of [-0.7, 0.7]) B.add(box(0.12, 0.12, 7.4, chrome, sx, 2.75, -1.6), null, P); // ladder rails
    for (let k = 0; k < 12; k++) B.add(box(1.4, 0.08, 0.08, chrome, 0, 2.78, -5 + k * 0.6), null, P);
    B.add(box(2.5, 0.25, 8.5, chrome, 0, 2.55, -0.5), null, P);
  }
  // spiral slides
  spiral(27, 16, 13, 3.0, 3.2, chrome);
  spiral(-20, 38, 12, 2.8, 2.6, red);
  spiral(42, 2, 20, 3.2, 4.2, chrome);
  // giant rebar cage ball
  {
    const c = new THREE.Vector3(16, 7.5, 47), R = 6.5;
    const ico = new THREE.IcosahedronGeometry(R, 2), p = ico.attributes.position, seen = new Set();
    for (let i = 0; i < p.count; i += 3) for (let k = 0; k < 3; k++) {
      const a = new THREE.Vector3().fromBufferAttribute(p, i + k), b = new THREE.Vector3().fromBufferAttribute(p, i + (k + 1) % 3);
      const key = [a, b].map((v) => v.toArray().map((n) => n.toFixed(2)).join()).sort().join('|');
      if (seen.has(key)) continue; seen.add(key);
      rod(a.add(c), b.add(c), 0.07, 0);
    }
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; rod(new THREE.Vector3(c.x + Math.cos(a) * 3, 0, c.z + Math.sin(a) * 3), new THREE.Vector3(c.x + Math.cos(a) * 3.6, 2.6, c.z + Math.sin(a) * 3.6), 0.14, 1); }
  }

  // ---------- string lights ----------
  const bulbs = [];
  const strand = (a, b, sag) => {
    const n = Math.max(6, Math.floor(a.distanceTo(b) / 0.9));
    for (let i = 0; i <= n; i++) { const u = i / n; bulbs.push(new THREE.Vector3().lerpVectors(a, b, u).add(new THREE.Vector3(0, -sag * 4 * u * (1 - u), 0))); }
  };
  const tTop = (i) => new THREE.Vector3(T[i][0], T[i][2] + 1.2, T[i][1]);
  for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 8], [4, 5], [5, 6], [6, 7], [7, 10], [1, 5], [6, 9], [2, 6], [3, 10]]) strand(tTop(a), tTop(b), 1.6);
  for (const i of [0, 1, 8]) strand(tTop(i), new THREE.Vector3(T[i][0] * 0.9, 24, ZF + 0.5), 2);

  // ---------- assemble ----------
  for (const m of B.build(group)) if (m.material === ground) { m.userData.noShadow = true; m.castShadow = false; }
  // rods: one instanced cylinder
  const rodG = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
  const rodM = pbr('rusty_metal_02', { scale: 0.8, metal: 0.5 });
  const rodMesh = new THREE.InstancedMesh(rodG, rodM, rods.length);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), mid = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const rodCols = [0xd8b8a8, 0x9aa4b0, 0xc89080]; // rust, galvanised grey, red-primed: tints over the rusty steel
  rods.forEach(([a, b, r, c], i) => {
    d.subVectors(b, a); const L = d.length(); d.normalize();
    q.setFromUnitVectors(up, d); mid.addVectors(a, b).multiplyScalar(0.5);
    M.compose(mid, q, sc.set(r, L, r)); rodMesh.setMatrixAt(i, M);
    rodMesh.setColorAt(i, col.setHex(rodCols[c]).offsetHSL(0, 0, (((i * 37) % 11) / 11 - 0.5) * 0.08));
  });
  group.add(rodMesh);
  const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 6, 4), bulbM, bulbs.length);
  bulbs.forEach((p, i) => { M.compose(p, q.identity(), sc.set(1, 1, 1)); bulbMesh.setMatrixAt(i, M); });
  bulbMesh.castShadow = false;
  group.add(bulbMesh);
  // trees along the street edge
  const treeList = [];
  for (let i = 0; i < 10; i++) {
    const x = -50 + (i % 2) * 100 + (rnd() - 0.5) * 3, z = -6 + Math.floor(i / 2) * 12;
    treeList.push(tree(x, 0, z, 7.5 + rnd() * 1.5, 2.6, { slot: SLOT.maple }));
  }

  return {
    group, glow, trees: treeList,
    update(t) {
      const r = t * 0.12;
      wheel.rotation.z = r;
      for (const g of gondolas) {
        const a = g.userData.a + r;
        g.position.set(WCX + Math.cos(a) * WR, WCY + Math.sin(a) * WR, WCZ);
      }
    },
  };

  // ---------- helpers ----------
  function latticeTower(x, z, s, y0, h, c) {
    const legs = [[-s, -s], [s, -s], [s, s], [-s, s]];
    for (const [lx, lz] of legs) rod(new THREE.Vector3(x + lx, y0, z + lz), new THREE.Vector3(x + lx * 0.8, y0 + h, z + lz * 0.8), 0.13, c);
    const step = 2.6, n = Math.max(1, Math.round(h / step));
    for (let k = 0; k <= n; k++) {
      const yA = y0 + h * k / n, f = 1 - 0.2 * k / n;
      for (let j = 0; j < 4; j++) {
        const [ax, az] = legs[j], [bx, bz] = legs[(j + 1) % 4];
        const A = new THREE.Vector3(x + ax * f, yA, z + az * f), Bv = new THREE.Vector3(x + bx * f, yA, z + bz * f);
        rod(A, Bv, 0.06, c);
        if (k < n) {
          const f2 = 1 - 0.2 * (k + 1) / n, yB = y0 + h * (k + 1) / n;
          rod(A, new THREE.Vector3(x + bx * f2, yB, z + bz * f2), 0.045, c);
          if ((k + j) % 2) rod(Bv, new THREE.Vector3(x + ax * f2, yB, z + az * f2), 0.045, c);
        }
      }
    }
  }
  function slinky(a, b, r) {
    const dir = new THREE.Vector3().subVectors(b, a), L = dir.length(); dir.normalize();
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize();
    const up2 = new THREE.Vector3().crossVectors(side, dir).normalize();
    const turns = Math.round(L / 0.85), seg = 7, sag = Math.min(2.5, L * 0.06);
    let prev = null;
    const P = (u, ang) => new THREE.Vector3().copy(a).addScaledVector(dir, L * u).addScaledVector(side, Math.cos(ang) * r).addScaledVector(up2, Math.sin(ang) * r).add(new THREE.Vector3(0, -sag * 4 * u * (1 - u), 0));
    for (let i = 0; i <= turns * seg; i++) {
      const u = i / (turns * seg), p = P(u, i / seg * Math.PI * 2);
      if (prev) rod(prev, p, 0.035, 1);
      prev = p;
    }
    for (let k = 0; k < 4; k++) {
      let pv = null;
      for (let i = 0; i <= 8; i++) { const p = P(i / 8, k / 4 * Math.PI * 2 + Math.PI / 4); if (pv) rod(pv, p, 0.05, 0); pv = p; }
    }
  }
  function jet(c, ry, pitch) {
    const P = new THREE.Matrix4().compose(c, new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, ry, 0)), new THREE.Vector3(1, 1, 1));
    // fuselage along +X (lathe around Y then rotate)
    const prof = [];
    const L = 13.5, R = 1.0;
    for (let i = 0; i <= 20; i++) {
      const u = i / 20, y = -L / 2 + u * L;
      let r = R;
      if (u < 0.18) r = R * Math.sqrt(Math.max(0.02, u / 0.18)) * (0.9 + 0.1 * u / 0.18);
      if (u > 0.7) r = R * (1 - (u - 0.7) / 0.3 * 0.7);
      prof.push(new THREE.Vector2(Math.max(0.05, r), y));
    }
    B.add(mesh(new THREE.LatheGeometry(prof, 16).rotateZ(-Math.PI / 2), jetM), null, P);
    B.add(mesh(new THREE.BoxGeometry(0.9, 0.35, 1.6), jetDark, -L / 2 + 1.7, 0.55, 0), null, P); // cockpit glazing
    for (let k = 0; k < 6; k++) for (const sz of [-1, 1]) B.add(mesh(new THREE.BoxGeometry(0.35, 0.3, 0.05), jetDark, -L / 2 + 3.6 + k * 0.9, 0.3, sz * 0.98), null, P);
    // stub wings, engines, tail
    B.add(mesh(new THREE.BoxGeometry(2.4, 0.2, 9.6), jetM, -0.6, -0.55, 0, 0, 0, 0), null, P);
    for (const sz of [-1, 1]) B.add(mesh(new THREE.CylinderGeometry(0.42, 0.38, 2.6, 10).rotateZ(Math.PI / 2), jetM, L / 2 - 3.2, 0.5, sz * 1.25), null, P);
    const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(2.2, 0); fin.lineTo(2.9, 2.6); fin.lineTo(2.0, 2.6); fin.closePath();
    B.add(mesh(new THREE.ExtrudeGeometry(fin, { depth: 0.18, bevelEnabled: false }), jetM, L / 2 - 2.9, 0.4, -0.09), null, P);
    B.add(mesh(new THREE.BoxGeometry(1.5, 0.12, 4.2), jetM, L / 2 - 0.3, 2.8, 0), null, P);
    // steel cradle down to the tower top
    for (const dx of [-3, 3]) for (const dz of [-0.6, 0.6]) {
      const a = new THREE.Vector3(dx, -0.9, dz).applyMatrix4(P), b = new THREE.Vector3(dx * 0.4, -3.2, dz * 2).applyMatrix4(P);
      rod(a, b, 0.12, 0);
    }
  }
  function spiral(x, z, h, r, turns, m) {
    const pts = [], n = Math.round(turns * 14);
    for (let i = 0; i <= n; i++) { const u = i / n, a = u * turns * Math.PI * 2; pts.push(new THREE.Vector3(x + Math.cos(a) * r, h - 0.6 - u * (h - 1.2), z + Math.sin(a) * r)); }
    B.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, 0.55, 8), m));
    rod(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, h, z), 0.2, 1);
    for (let i = 0; i <= n; i += 3) rod(new THREE.Vector3(x, pts[i].y - 0.3, z), pts[i].clone().add(new THREE.Vector3(0, -0.45, 0)), 0.05, 1);
  }
}
