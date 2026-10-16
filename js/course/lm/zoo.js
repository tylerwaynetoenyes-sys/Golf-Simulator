// Saint Louis Zoo, for the Confluence's 3rd: the hole plays through the zoo,
// its exhibits close along both sides and its landmark buildings closing the
// view behind the green, laid along the hole's own centre line and on its
// ground (fit), with the walks paved and kept clear of rough grass (clear).
//   right of the hole: the savanna yard (giraffes and zebras among red rock),
//     the Asian elephants of River's Edge, polar bears on their grey rocks
//   left: Caribbean flamingos wading in the hole's pond, lions on red rock
//   behind the green: the 1904 Flight Cage, a 69 x 25 m steel-ribbed mesh
//     vault (js/course/lm/forestpark.js), and a Mission-revival Bird House in
//     cream stucco under red tile
//   walks down both sides with visitors along the rails
// Animals, rocks and people are the real models (assets/models/zoo_*.glb,
// people_lo.glb; credited in docs/SOURCES.md); surfaces are photographed PBR.
import * as THREE from 'three';
import { pbr, painted } from '../../scene/pbr.js';
import { model } from '../../scene/models.js';
import { crowdAt } from '../../scene/crowd.js';
import { canvasTex, tree, SLOT } from './kit.js';
import { Batch, bx, span, place } from './riverfront.js';
import { flightCage } from './forestpark.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const WALK = [[-31, 3.2], [26, 3.2]]; // the two walks: lateral offset from the centre line, width

export default function build() {
  const group = new THREE.Group();
  group.name = 'zoo';
  const glow = [];
  const trees = [];
  const res = {
    group, glow, trees, clear: null,
    fit(holder, T) {
      holder.updateMatrix();
      const L = holder.matrix.clone(), Li = L.clone().invert(), w = new THREE.Vector3();
      const sc = holder.scale.y, y0 = holder.position.y;
      // hole terms (arc length s, lateral d) → this group's local frame, and the ground there
      const at = (s, d) => { const p = T.pointAt(s); w.set(p.x + p.rx * d, 0, p.z + p.rz * d).applyMatrix4(Li); return [w.x, w.z]; };
      const gyL = (x, z) => { w.set(x, 0, z).applyMatrix4(L); return (T.meshHeight(w.x, w.z) - y0) / sc; };
      const heading = (s) => { const p = T.pointAt(s); const a = at(s, 0), b = at(s + 1, 0); return Math.atan2(b[0] - a[0], b[1] - a[1]); };
      res.clear = (wx, wz) => { const pr = T.project(wx, wz); return pr.s > -30 && pr.s < T.length + 30 && WALK.some(([d, wd]) => Math.abs(pr.d - d) < wd / 2 + 0.4); };
      lay(T, at, gyL, heading, (wy) => (wy - y0) / sc);
    },
  };

  function lay(T, at, gy, heading, ly) {
    let seed = 1910;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const Ln = T.length;
    const m = {
      walk: pbr('brushed_concrete', { scale: 2.5, tint: 0xe6dfd2, bright: 1.15 }),
      rail: pbr('wood_planks_grey', { scale: 1.5, tint: 0x9a8a74 }),
      stucco: pbr('white_stucco', { scale: 3, tint: 0xf3e6c8 }),
      trim: pbr('white_plaster_02', { scale: 2.5, tint: 0xf2ece0 }),
      tile: pbr('clay_roof_tiles_02', { scale: 2.4 }),
      steel: pbr('metal_plate', { scale: 2, metal: 0.3, tint: 0x8a9095, rough: 0.8 }),
      dark: pbr('painted_steel', { scale: 1, tint: 0x2c3431, metal: 0.5 }),
    };
    const B = new Batch();

    // ── the two walks, draped on the ground, with a post-and-rail fence on the exhibit side ──
    for (const [d, wd] of WALK) {
      const pos = [], uv = [], idx = [];
      const n = Math.ceil((Ln + 60) / 3);
      for (let i = 0; i <= n; i++) {
        const s = -30 + i * 3;
        for (const e of [-wd / 2, wd / 2]) {
          const [x, z] = at(s, d + e);
          const y = Math.max(gy(x, z), gy(...at(s, d)), gy(...at(s, d - e))) + 0.12;
          pos.push(x, y, z); uv.push((d + e) / 3, s / 3);
        }
      }
      for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      // face it up whichever way the walk runs
      if (g.attributes.normal.getY(0) < 0) { g.setIndex(idx.map((v, k) => idx[k - (k % 3) + [0, 2, 1][k % 3]])); g.computeVertexNormals(); }
      const mesh = new THREE.Mesh(g, m.walk);
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // ── exhibits: [animal, count, s, d, spread, fence radius, rock tone] ──
    const yards = [
      ['giraffe', 4, Ln * 0.28, 46, 10, 16, 'red'],
      ['zebra', 6, Ln * 0.28 + 6, 49, 8, 0, 'red'],
      ['elephant', 3, Ln * 0.52, 45, 9, 15, 'red'],
      ['polarbear', 3, Ln * 0.76, 41, 6, 11, 'grey'],
      ['lion', 3, Ln * 0.8, -42, 6, 11, 'red'],
    ];
    const animals = model('zooAnimals'), rocks = model('zooRocks');
    const proto = {};
    animals?.traverse((o) => {
      if (o.isMesh) for (const mm of Array.isArray(o.material) ? o.material : [o.material]) {
        const hair = /Hair/i.test(mm.name);
        mm.transparent = false; mm.depthWrite = true; mm.alphaTest = hair ? 0.5 : 0;
        mm.side = hair ? THREE.DoubleSide : THREE.FrontSide;
      }
    });
    for (const c of animals?.children || []) proto[c.name] = c;
    const scans = []; rocks?.traverse((o) => { if (o.isMesh) scans.push(o); });
    const rockMat = scans[0] && { red: scans[0].material, grey: (() => { const g = scans[0].material.clone(); g.color = new THREE.Color(0x9aa1a6); return g; })() };
    if (rockMat) for (const k of ['red', 'grey']) { rockMat[k].roughness = 0.95; rockMat[k].metalness = 0; }
    const spots = [];
    const putAnimal = (kind, x, z, yaw, k = 1) => {
      const p = proto[kind]; if (!p) return;
      const a = p.clone(true);
      a.position.set(x, gy(x, z), z); a.rotation.y = yaw; a.scale.setScalar(k);
      a.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      group.add(a);
    };
    for (const [kind, n, s, d, spread, R, tone] of yards) {
      const [cx, cz] = at(s, d);
      for (let i = 0; i < n; i++) { const a = rnd() * 6.28, r = rnd() * spread; putAnimal(kind, cx + Math.cos(a) * r, cz + Math.sin(a) * r, rnd() * 6.28, 0.88 + rnd() * 0.22); }
      // boulders among them, the scans
      if (scans.length) for (let i = 0; i < 5; i++) {
        const a = rnd() * 6.28, r = spread * 0.7 + rnd() * ((R || spread + 6) - spread * 0.7 - 2), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, k = 2.6 + rnd() * 2.4;
        const rk = new THREE.Mesh(scans[i % scans.length].geometry, rockMat[tone]);
        rk.position.set(x, gy(x, z) - k * 0.1, z); rk.rotation.y = rnd() * 6.3; rk.scale.set(k, k * (0.6 + rnd() * 0.4), k);
        rk.receiveShadow = true; rk.castShadow = true; group.add(rk);
      }
      if (!R) continue;
      // the yard's post-and-rail fence, and visitors at the rail on the walk side
      const seg = Math.round((R * Math.PI * 2) / 3);
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2, b2 = ((i + 1) / seg) * Math.PI * 2;
        const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R, x2 = cx + Math.cos(b2) * R, z2 = cz + Math.sin(b2) * R;
        const y = gy(x, z), y2 = gy(x2, z2);
        B.add(m.rail, bx(0.14, 1.3, 0.14, x, y - 0.1, z));
        for (const hh of [0.55, 1.1]) B.add(m.rail, span(V(x, y + hh, z), V(x2, y2 + hh, z2), 0.08, 0.12));
      }
      const [wx, wz] = at(s, Math.sign(d) * (Math.abs(d) - R - 1.4));
      for (let i = 0; i < 9; i++) { const x = wx + (rnd() - 0.5) * 14, z = wz + (rnd() - 0.5) * 14; spots.push([x, gy(x, z), z, Math.atan2(cx - x, cz - z)]); }
    }

    // ── Caribbean flamingos wading round the edge of the hole's pond ──
    {
      const flam = proto.flamingo;
      if (flam) {
        let placed = 0;
        for (let i = 0; i < 80 && placed < 14; i++) {
          const s = Ln * (0.38 + rnd() * 0.24), d = -40 + (rnd() - 0.5) * 44;
          const p = T.pointAt(s), wxw = p.x + p.rx * d, wzw = p.z + p.rz * d, t = T.terrain(wxw, wzw);
          if (t.surface !== 'water') continue;
          // only the shallows: the water's edge within a few metres
          const edge = [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]].some(([a, b]) => T.terrain(wxw + a * 1.6, wzw + b * 1.6).surface !== 'water');
          if (!edge) continue;
          const [x, z] = at(s, d);
          const a = flam.clone(true);
          a.position.set(x, ly(t.height) - 0.32, z);
          a.rotation.y = rnd() * 6.28; a.scale.setScalar(0.9 + rnd() * 0.2);
          a.traverse((o) => { if (o.isMesh) o.castShadow = true; });
          group.add(a);
          placed++;
        }
      }
    }

    // ── behind the green: the Flight Cage across the view, the Bird House to its right ──
    const hEnd = heading(Ln - 1);
    {
      const [x, z] = at(Ln + 62, -12);
      const g = new THREE.Group();
      flightCage({ steel: m.steel }).build(g);
      g.position.set(x, gy(x, z) - 0.2, z);
      g.rotation.y = hEnd + Math.PI / 2; // its long axis across the line of play
      g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      group.add(g);
      // visitors along the cage
      for (let i = 0; i < 12; i++) { const [px, pz] = at(Ln + 46 + rnd() * 6, -40 + rnd() * 56); spots.push([px, gy(px, pz), pz, hEnd + Math.PI + (rnd() - 0.5)]); }
    }
    {
      // the Bird House: a Mission-revival hall, cream stucco under red tile, arched windows, a curved gable over the door
      const [x, z] = at(Ln + 26, 44), y = Math.min(gy(x, z), gy(...at(Ln + 18, 44)), gy(...at(Ln + 34, 44))) - 0.3;
      const W = 30, D = 14, H = 7;
      const G = new THREE.Group();
      const H2 = new Batch();
      H2.add(m.stucco, bx(W, H + 0.6, D, 0, -0.6, 0));
      // the hip roof of tile
      const roof = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(W + 1.4, 4.2, D + 1.4);
      H2.add(m.tile, roof.translate(0, H, 0));
      // the curved Mission parapet over the entrance, facing the hole (-x of the hall)
      const ps = new THREE.Shape();
      ps.moveTo(-5, 0); ps.lineTo(-5, 3); ps.quadraticCurveTo(-3.5, 3.4, -2.6, 4.6); ps.quadraticCurveTo(0, 6.2, 2.6, 4.6); ps.quadraticCurveTo(3.5, 3.4, 5, 3); ps.lineTo(5, 0); ps.closePath();
      H2.add(m.stucco, place(new THREE.ExtrudeGeometry(ps, { depth: 0.8, bevelEnabled: false }).rotateY(Math.PI / 2), -D / 2 - 0.5, H - 0.4, 0));
      H2.add(m.trim, bx(0.4, 0.5, W + 0.6, -D / 2 - 0.1, H - 0.2, 0));
      const win = painted(0x1e2629, { roughness: 0.1, metalness: 0.5 });
      for (let k = -3; k <= 3; k++) {
        const zz = k * 3.8;
        H2.add(win, bx(0.2, 2.8, 1.6, -D / 2 - 0.02, 1.6, zz));
        H2.add(m.trim, place(new THREE.CylinderGeometry(0.95, 0.95, 0.24, 16, 1, false, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).rotateY(0), -D / 2 - 0.05, 4.4, zz));
      }
      H2.add(win, bx(0.2, 3.6, 3, -D / 2 - 0.02, 0, 0)); // the doors
      const sign = new THREE.MeshStandardMaterial({ map: canvasTex(512, 96, (c, w, h) => { c.fillStyle = '#efe2c2'; c.fillRect(0, 0, w, h); c.font = 'bold 64px Georgia'; c.fillStyle = '#5a3a24'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('BIRD HOUSE', w / 2, h / 2 + 4); }), roughness: 0.8 });
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.3), sign);
      sm.rotation.y = -Math.PI / 2; sm.position.set(-D / 2 - 0.55, H + 1.3, 0);
      G.add(sm);
      H2.build(G);
      // turn it so the hall's front (its -x) faces back down the hole
      G.rotation.y = hEnd + Math.PI / 2;
      G.position.set(x, y, z);
      G.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      group.add(G);
      for (let i = 0; i < 10; i++) { const [px, pz] = at(Ln + 14 + rnd() * 6, 36 + rnd() * 18); spots.push([px, gy(px, pz), pz, rnd() * 6.28]); }
    }

    // ── shade trees along the walks, and visitors walking them ──
    for (let s = 10; s < Ln + 10; s += 22) {
      for (const [d] of WALK) {
        const [x, z] = at(s + rnd() * 8, d + Math.sign(d) * (3.2 + rnd() * 1.5));
        if (rnd() < 0.7) trees.push(tree(x, gy(x, z), z, 7 + rnd() * 3, 2.6 + rnd(), { slot: SLOT.youngOak }));
      }
    }
    for (const [d, wd] of WALK) for (let i = 0; i < 46; i++) {
      const s = -20 + rnd() * (Ln + 40), [x, z] = at(s, d + (rnd() - 0.5) * (wd - 0.8));
      spots.push([x, gy(x, z) + 0.12, z, heading(s) + (rnd() < 0.5 ? 0 : Math.PI)]);
    }
    const people = crowdAt(spots, rnd);
    if (people) group.add(people);

    const g = new THREE.Group();
    B.build(g);
    g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    group.add(g);
  }
  return res;
}
