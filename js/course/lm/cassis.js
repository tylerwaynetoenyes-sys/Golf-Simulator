// Cassis landmarks, from published descriptions:
//   the vineyards of the Cassis AOC (1936, among the first appellations in
//     France): vines in rows on stone terraces (restanques), a bastide with
//     ochre walls, a terracotta roof and painted shutters, Italian cypresses
//   the port: pastel houses round the harbour, traditional pointus (small
//     wooden fishing boats, brightly painted), and a white harbour light
//   the Château de Cassis: medieval walls and towers on the rock above the
//     port (now a hotel)
// Cap Canaille itself comes from the elevation data; CourseWorld tints its
// cliffs ochre-red. Far landmarks are modelled in map axes (+x east, +z south).
import * as THREE from 'three';
import { mat, lit, box, cyl, sphere, gable, seeded, facadeMaterial } from './kit.js';

function cypress(h, m) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.9, h, 8, 3), m);
  // an Italian cypress: a narrow flame, widest a third of the way up
  const p = c.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = (p.getY(i) + h / 2) / h;
    const k = Math.sin(Math.min(1, u * 1.4) * Math.PI) * (1 - u * 0.5) + 0.15;
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
  }
  c.geometry.computeVertexNormals();
  c.position.y = h / 2;
  c.castShadow = true;
  return c;
}

function bastide(rnd) {
  const g = new THREE.Group();
  const walls = lit(['#e2c38f', '#e8cfa0', '#d9b27c'][Math.floor(rnd() * 3)], 0xffd28a, { night: 0.25 });
  const tile = mat(0xb8653f, { roughness: 0.9 });
  const shutter = mat(['#6f8fa0', '#7a9a6a', '#8aa6b3'][Math.floor(rnd() * 3)]);
  g.add(box(14, 7, 9, walls));
  g.add(gable(15, 2.4, 10, tile, 0, 7, 0));
  for (const x of [-4.5, -1.5, 1.5, 4.5]) for (const y of [1.5, 4.6]) {
    g.add(box(0.7, 1.4, 0.1, shutter, x - 0.45, y, 4.52), box(0.7, 1.4, 0.1, shutter, x + 0.45, y, 4.52));
  }
  return { g, walls };
}

function vineyard() {
  const g = new THREE.Group();
  const rnd = seeded(1936);
  const vine = new THREE.MeshStandardMaterial({ color: 0x5f7a32, roughness: 0.9 });
  const stake = mat(0x6b5a44);
  const wall = mat(0xd8cdb6, { roughness: 1 });
  // three terraces of rows, each held by a dry-stone wall (restanque)
  const bush = new THREE.SphereGeometry(0.55, 7, 5);
  const n = 3 * 14 * 22;
  const im = new THREE.InstancedMesh(bush, vine, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  let k = 0;
  for (let t = 0; t < 3; t++) {
    g.add(box(70, 1.1, 0.9, wall, 0, t * 1.2 - 0.6, -t * 30 - 1));
    for (let r = 0; r < 14; r++) for (let i = 0; i < 22; i++) {
      sc.set(1 + rnd() * 0.4, 0.9 + rnd() * 0.3, 0.8);
      im.setMatrixAt(k++, m4.compose(p.set(-31 + i * 3, t * 1.2 + 0.7, -t * 30 - 4 - r * 2), q, sc));
    }
    for (let r = 0; r < 14; r += 2) g.add(box(0.06, 1.3, 0.06, stake, -33, t * 1.2, -t * 30 - 4 - r * 2));
  }
  im.castShadow = true;
  g.add(im);
  const b = bastide(rnd);
  b.g.position.set(48, 0, -40);
  b.g.rotation.y = -0.4;
  g.add(b.g);
  const cy = mat(0x24391f, { roughness: 0.9 });
  for (let i = 0; i < 7; i++) { const c = cypress(11 + rnd() * 5, cy); c.position.x = 40 + i * 3.4; c.position.z = -18; g.add(c); }
  return { group: g, glow: [b.walls] };
}

function phare() {
  const g = new THREE.Group();
  const white = lit(0xf2efe8, 0xffffff, { night: 0.3 });
  const jetty = mat(0xcdc5b4, { roughness: 1 });
  g.add(box(10, 2, 70, jetty, 0, -1.5, 30));
  g.add(cyl(1.6, 2.1, 11, white, 0, 0, 0, 14));
  g.add(cyl(2.2, 2.2, 0.5, white, 0, 11, 0, 14));
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.6, 10), new THREE.MeshStandardMaterial({ color: 0x2f8a4a, emissive: 0x40ff70, emissiveIntensity: 0 }));
  lantern.position.y = 12.3;
  g.add(lantern);
  g.add(cyl(0.2, 1.2, 1, mat(0x2f8a4a), 0, 13.1, 0, 10));
  return { group: g, glow: [white], update(t, dt, day) { lantern.material.emissiveIntensity = (1 - day) * (Math.sin(t * 2.1) > 0.3 ? 2.2 : 0.1); } };
}

/** The port: quays, pastel houses climbing from the water, moored pointus. */
function cassisport() {
  const g = new THREE.Group();
  const rnd = seeded(1214);
  const tile = mat(0xb5603c, { roughness: 0.9 });
  const pastel = ['#efd7a8', '#e9c497', '#f1e2c4', '#e6b98e', '#efcfb7', '#d9c3a0', '#f3e6cc'].map((c, i) => facadeMaterial(c, { cols: 4, rows: 3, win: '#3b3a38', lamp: '#ffd18a', frame: '#7e9aa8', seed: 120 + i }));
  // houses in terraces around the harbour, in map axes (the harbour opens south)
  for (let i = 0; i < 90; i++) {
    const a = Math.PI * (0.05 + rnd() * 0.9), r = 70 + rnd() * 260;
    const x = Math.cos(a) * r * 1.4, z = -Math.sin(a) * r * 0.9;
    const w = 8 + rnd() * 8, d = 8 + rnd() * 6, h = 7 + Math.floor(rnd() * 3) * 3;
    const f = pastel[Math.floor(rnd() * pastel.length)];
    const house = new THREE.Group();
    house.add(box(w, h, d, f));
    const roof = gable(w + 0.6, 1.6, d + 0.6, tile, 0, h, 0);
    house.add(roof);
    house.position.set(x, 0, z);
    house.rotation.y = -a + Math.PI / 2;
    g.add(house);
  }
  g.add(box(220, 1.4, 12, mat(0xcdc5b4), 0, -1, 30));
  // pointus and small yachts along the quay
  const hulls = [0x2f6fa8, 0xd8463c, 0xf2f0e8, 0x3a8a5a, 0xf2c23c];
  for (let i = 0; i < 26; i++) {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 4.4, 4, 8).rotateX(Math.PI / 2), mat(hulls[Math.floor(rnd() * hulls.length)], { roughness: 0.6 }));
    hull.scale.y = 0.55;
    b.add(hull);
    b.add(box(1.8, 0.5, 2.4, mat(0x8a6a44), 0, 0.4, 0.6));
    if (rnd() < 0.4) b.add(cyl(0.05, 0.05, 7, mat(0xd8d8d8), 0, 0.4, -0.5, 6));
    b.position.set(-100 + i * 8, -0.2, 44 + (i % 2) * 2);
    b.rotation.y = Math.PI / 2 + (rnd() - 0.5) * 0.2;
    g.add(b);
  }
  return { group: g, glow: pastel, haze: [...pastel, tile] };
}

function chateau() {
  const g = new THREE.Group();
  const stone = lit(0xcab899, 0xffd9a0, { night: 0.55 });
  g.add(box(60, 9, 34, stone));
  for (const [x, z] of [[-30, -17], [30, -17], [-30, 17], [30, 17]]) {
    g.add(cyl(4.5, 5, 14, stone, x, 0, z, 16));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(box(1.2, 1.4, 1.2, stone, x + Math.cos(a) * 4.2, 14, z + Math.sin(a) * 4.2)); }
  }
  for (let i = -28; i <= 28; i += 4) { g.add(box(1.4, 1.4, 1, stone, i, 9, -17)); g.add(box(1.4, 1.4, 1, stone, i, 9, 17)); }
  g.add(box(12, 18, 12, stone, -8, 0, 0)); // keep
  return { group: g, glow: [stone], haze: [stone] };
}

export default { vineyard, phare, cassisport, chateau };
