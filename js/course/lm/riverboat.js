// A Mississippi sternwheeler tied up at the St. Louis levee: three white
// decks with railings and turned posts, an ornate pilot house, twin feathered
// stacks, a red stern paddle wheel that turns slowly, string lights along the
// decks, and a cobblestone levee with bollards and a gangway. Long axis is
// local X; the levee is on the +Z side, toward the golfer.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, lit, box, cyl, seeded, canvasTex, person } from './kit.js';

export default function build() {
  const g = new THREE.Group();
  const glow = [];
  const rnd = seeded(1817);
  const boat = new THREE.Group();

  const white = lit(0xf3efe6, 0xffd9a0, { night: 0.35, roughness: 0.55 });
  const trim = mat(0x9a2b22, { roughness: 0.5 });
  const dark = mat(0x1c1d20, { roughness: 0.6 });
  const deck = mat(0x8b7356, { roughness: 0.85 });
  const windowMat = lit(0x2a3440, 0xffd59a, { night: 1.4, roughness: 0.15, metalness: 0.3 });
  glow.push(white, windowMat);

  // hull: long, shallow, slightly raked bow
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-36, -7); hullShape.lineTo(30, -7); hullShape.quadraticCurveTo(40, -5, 42, 0);
  hullShape.quadraticCurveTo(40, 5, 30, 7); hullShape.lineTo(-36, 7); hullShape.closePath();
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(hullShape, { depth: 2.6, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -1.2, 0), mat(0xe9e4da, { roughness: 0.6 }));
  hull.castShadow = true;
  boat.add(hull);
  boat.add(box(78, 0.35, 14.4, trim, 2, 1.25, 0)); // red sheer stripe
  boat.add(box(74, 0.2, 14, deck, 0, 1.4, 0));

  // three decks, each a bit shorter, with windows and overhangs
  const decks = [
    { x0: -32, x1: 30, y: 1.6, h: 3.2, w: 12.6 },
    { x0: -30, x1: 22, y: 5.0, h: 3.0, w: 11.4 },
    { x0: -18, x1: 10, y: 8.2, h: 2.6, w: 9.0 },
  ];
  const posts = [];
  const rails = [];
  for (const d of decks) {
    const L = d.x1 - d.x0;
    const cx = (d.x0 + d.x1) / 2;
    boat.add(box(L, d.h, d.w - 2.2, white, cx, d.y, 0));
    boat.add(box(L - 2, d.h * 0.42, d.w - 2.1, windowMat, cx, d.y + d.h * 0.38, 0));
    boat.add(box(L + 2.4, 0.22, d.w + 0.6, white, cx, d.y + d.h, 0)); // deck above / roof
    boat.add(box(L + 2.4, 0.3, 0.12, trim, cx, d.y + d.h - 0.3, d.w / 2 + 0.3));
    boat.add(box(L + 2.4, 0.3, 0.12, trim, cx, d.y + d.h - 0.3, -d.w / 2 - 0.3));
    // turned posts and railings on the open promenade
    for (let x = d.x0 - 1; x <= d.x1 + 1; x += 2.2) {
      for (const z of [d.w / 2, -d.w / 2]) posts.push(new THREE.CylinderGeometry(0.08, 0.1, d.h, 6).translate(x, d.y + d.h / 2, z));
    }
    for (const z of [d.w / 2, -d.w / 2]) {
      rails.push(new THREE.BoxGeometry(L + 2.4, 0.08, 0.08).translate(cx, d.y + 1.05, z));
      rails.push(new THREE.BoxGeometry(L + 2.4, 0.05, 0.05).translate(cx, d.y + 0.55, z));
    }
  }
  const postMesh = new THREE.Mesh(mergeGeometries(posts), white);
  const railMesh = new THREE.Mesh(mergeGeometries(rails), white);
  postMesh.castShadow = railMesh.castShadow = true;
  boat.add(postMesh, railMesh);

  // pilot house with cresting
  boat.add(box(6, 3.2, 6, white, 2, 11.0, 0));
  boat.add(box(6.3, 1.4, 6.3, windowMat, 2, 12.1, 0));
  const roofG = new THREE.Mesh(new THREE.ConeGeometry(4.6, 1.6, 4), dark);
  roofG.rotation.y = Math.PI / 4;
  roofG.position.set(2, 15.0, 0);
  boat.add(roofG);
  for (let i = 0; i < 12; i++) boat.add(box(0.12, 0.6, 0.12, mat(0xc9a24a, { metalness: 0.7, roughness: 0.4 }), -1 + (i % 4) * 2, 14.4, i < 4 ? 3.1 : i < 8 ? -3.1 : 0));

  // twin stacks with feathered crowns, forward of the pilot house
  for (const z of [-2.8, 2.8]) {
    boat.add(cyl(0.75, 0.85, 14, dark, 16, 8.2, z, 14));
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 0.8, 1.6, 12, 1, true), dark);
    crown.position.set(16, 22.9, z);
    boat.add(crown);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 4), dark);
      f.position.set(16 + Math.cos(a) * 1.3, 24.0, z + Math.sin(a) * 1.3);
      boat.add(f);
    }
  }
  boat.add(box(0.2, 0.4, 5.6, trim, 16, 18, 0)); // spreader between stacks

  // name boards
  const nameMat = new THREE.MeshStandardMaterial({
    map: canvasTex(512, 96, (c, w, h) => {
      c.fillStyle = '#f3efe6'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#9a2b22'; c.lineWidth = 6; c.strokeRect(4, 4, w - 8, h - 8);
      c.font = 'bold 52px Georgia'; c.fillStyle = '#9a2b22'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('CONFLUENCE', w / 2, h / 2 + 2);
    }),
    roughness: 0.6,
  });
  for (const z of [6.0, -6.0]) {
    const nb = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), nameMat);
    nb.position.set(-6, 9.4, z * 1.0);
    nb.rotation.y = z > 0 ? 0 : Math.PI;
    boat.add(nb);
  }

  // stern paddle wheel
  const wheel = new THREE.Group();
  const red = mat(0xa52a20, { roughness: 0.55 });
  const R = 6;
  for (const z of [-5.2, 5.2]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.18, 6, 32), red);
    rim.position.z = z;
    wheel.add(rim);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.16, R * 2, 0.16), red);
      spoke.rotation.z = a;
      spoke.position.z = z;
      wheel.add(spoke);
    }
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const bucket = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 10.6), red);
    bucket.position.set(Math.cos(a) * (R - 0.6), Math.sin(a) * (R - 0.6), 0);
    bucket.rotation.z = a;
    wheel.add(bucket);
  }
  wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 11.6, 10).rotateX(Math.PI / 2), dark));
  wheel.position.set(-42.5, 4.2, 0);
  wheel.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  boat.add(wheel);
  boat.add(box(1.2, 0.4, 12, white, -42.5, 10.4, 0)); // wheel housing beam
  for (const z of [-6.2, 6.2]) boat.add(box(9, 0.3, 0.25, white, -39, 8.6, z));

  // string lights along each deck edge
  const bulbMat = lit(0xfff3d0, 0xffe2a8, { night: 2.4 });
  glow.push(bulbMat);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 6, 4), bulbMat, 240);
  const m4 = new THREE.Matrix4();
  let bn = 0;
  for (const d of decks) {
    for (const z of [d.w / 2 + 0.35, -d.w / 2 - 0.35]) {
      for (let x = d.x0 - 1; x <= d.x1 + 1 && bn < 240; x += 1.3) {
        m4.makeTranslation(x, d.y + d.h - 0.5 - Math.abs(Math.sin(x * 0.5)) * 0.15, z);
        bulbs.setMatrixAt(bn++, m4);
      }
    }
  }
  bulbs.count = bn;
  boat.add(bulbs);

  // passengers on the upper decks
  const shirts = [0x2d5d8a, 0x9a3b30, 0xdedad0, 0x2f6e4c, 0xd9a43a];
  for (let i = 0; i < 14; i++) {
    const p = person(shirts[i % 5], rnd);
    const d = decks[1 + (i % 2)];
    p.position.set(d.x0 + rnd() * (d.x1 - d.x0), d.y + d.h + 0.1, (rnd() < 0.5 ? 1 : -1) * (d.w / 2 - 0.6));
    p.scale.setScalar(0.95);
    boat.add(p);
  }

  boat.position.set(0, 0, -6);
  g.add(boat);

  // ── the levee: cobblestone slope, bollards, gangway, river ──
  const water = new THREE.Mesh(new THREE.PlaneGeometry(130, 46), new THREE.MeshStandardMaterial({ color: 0x3d4b44, roughness: 0.18, metalness: 0.25 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.06, -14);
  water.receiveShadow = true;
  g.add(water);
  const cobble = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#6f675c'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < w; x += 16) {
      const v = 90 + Math.floor(rnd() * 50);
      c.fillStyle = `rgb(${v + 12},${v + 6},${v - 4})`;
      c.fillRect(x + 1, y + 1, 14, 14);
    }
  }, [12, 3]);
  const levee = new THREE.Mesh(new THREE.PlaneGeometry(130, 16), new THREE.MeshStandardMaterial({ map: cobble, roughness: 0.95 }));
  levee.rotation.x = -Math.PI / 2 + 0.2;
  levee.position.set(0, 1.2, 9.5);
  levee.receiveShadow = true;
  g.add(levee);
  const iron = mat(0x23262a, { metalness: 0.5, roughness: 0.5 });
  for (let x = -50; x <= 50; x += 12.5) g.add(cyl(0.35, 0.45, 0.9, iron, x, 0.2, 3, 10));
  const gw = box(2.2, 0.2, 9, mat(0x6b5a44), 8, 1.9, 3.2);
  gw.rotation.x = 0.16;
  g.add(gw);
  // mooring lines
  const lines = [];
  for (const x of [-25, 25]) {
    const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, 2.4, -0.2), new THREE.Vector3(x, 0.8, 1.8), new THREE.Vector3(x + (x > 0 ? 0 : 0), 0.9, 3));
    lines.push(new THREE.TubeGeometry(c, 8, 0.05, 4, false));
  }
  g.add(new THREE.Mesh(mergeGeometries(lines), mat(0xd9cdb0)));

  // soft stack smoke
  const smokeTex = canvasTex(64, 64, (c, w, h) => {
    const grd = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(235,235,235,0.55)'); grd.addColorStop(1, 'rgba(235,235,235,0)');
    c.fillStyle = grd; c.fillRect(0, 0, w, h);
  });
  const puffs = [];
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.userData = { z: i % 2 ? 2.8 : -2.8, phase: i / 14 };
    boat.add(s);
    puffs.push(s);
  }

  return {
    group: g,
    glow,
    update(t, dt) {
      wheel.rotation.z = -t * 0.35;
      boat.position.y = Math.sin(t * 0.6) * 0.06;
      boat.rotation.x = Math.sin(t * 0.45) * 0.004;
      for (const s of puffs) {
        const u = (t * 0.08 + s.userData.phase) % 1;
        s.position.set(16 - u * 9, 25 + u * 12, s.userData.z + u * 3);
        const k = 2 + u * 7;
        s.scale.set(k, k, 1);
        s.material.opacity = 0.45 * Math.sin(Math.PI * u);
      }
    },
  };
}
