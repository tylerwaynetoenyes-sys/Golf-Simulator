// Scenery that makes a course feel lived in, placed beyond the field of play
// (outside the OOB line) and never in water:
//   western  bison herds, wagon trains, a windmill, a sod house, tumbleweeds
//            rolling downwind
//   coastal  sailboats bobbing out on the sea, sea stacks and rocks along the
//            shoreline
//   crowds   spectators on the mounds round the greens (tournament courses)
import * as THREE from 'three';
import { person as figure } from './streetlife.js';

function sailboat(rand) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.2, 6.5, 4, 10).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: rand() < 0.7 ? 0xf3f1ea : 0x1f3550, roughness: 0.4 }));
  hull.scale.set(1, 0.6, 0.9);
  hull.position.y = 0.3;
  g.add(hull);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 11, 6), new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.6, roughness: 0.3 }));
  mast.position.set(0.6, 6, 0);
  g.add(mast);
  const sailM = new THREE.MeshStandardMaterial({ color: 0xfbfaf5, roughness: 0.7, side: THREE.DoubleSide });
  const main = new THREE.Shape(); main.moveTo(0, 0); main.lineTo(-3.6, 0); main.lineTo(0, 10.2); main.closePath();
  const ms = new THREE.Mesh(new THREE.ShapeGeometry(main), sailM);
  ms.position.set(0.55, 1.2, 0);
  ms.rotation.y = 0.25;
  g.add(ms);
  const jib = new THREE.Shape(); jib.moveTo(0, 0); jib.lineTo(3.2, 0); jib.lineTo(0, 9.4); jib.closePath();
  const js = new THREE.Mesh(new THREE.ShapeGeometry(jib), sailM);
  js.position.set(0.65, 1.2, 0);
  js.rotation.y = -0.2;
  g.add(js);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function tumbleweed(rand) {
  const geo = new THREE.IcosahedronGeometry(0.45 + rand() * 0.25, 1);
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x9a8457, wireframe: true }));
}

/**
 * @returns {{group, update(dt, t, wind)}}
 */
export function dressScenery(T, hole, rand, ground, buildLandmark) {
  const group = new THREE.Group();
  const movers = [];
  const L = T.length;
  // a spot beyond the OOB line (or anywhere when sea is ok), on land or sea as asked
  const spot = (minOff, maxOff, { sea = false, tries = 30 } = {}) => {
    for (let k = 0; k < tries; k++) {
      const s = -40 + rand() * (L + 80);
      const p = T.pointAt(Math.max(0, Math.min(L, s)));
      const side = rand() < 0.5 ? -1 : 1;
      const d = minOff + rand() * (maxOff - minOff);
      const x = p.x + p.rx * d * side, z = p.z + p.rz * d * side;
      const pr = T.project(x, z);
      if (Math.abs(pr.d) < T.oobLateral + 6 && pr.s > -40 && pr.s < L + 60) continue;
      if (T.greenEdge(x, z) < 50) continue;
      const h = T.meshHeight(x, z);
      const wet = T.seaLevel != null && h < T.seaLevel - 0.5;
      if (sea !== wet) continue;
      if (!sea && T.terrain(x, z).surface === 'water') continue;
      return { x, z, y: sea ? T.seaLevel : ground(x, z) };
    }
    return null;
  };
  const put = (obj, at, yaw = rand() * Math.PI * 2) => {
    obj.position.set(at.x, at.y, at.z);
    obj.rotation.y = yaw;
    group.add(obj);
    return obj;
  };
  const lm = (type, at, yaw) => {
    const o = buildLandmark(type);
    put(o.group, at, yaw);
    return o;
  };
  const glow = [];

  if (hole.theme === 'western') {
    for (let i = 0; i < 4; i++) { const at = spot(T.oobLateral + 20, T.oobLateral + 260); if (at) glow.push(...(lm('bison', at).glow || [])); }
    for (let i = 0; i < 2; i++) { const at = spot(T.oobLateral + 40, T.oobLateral + 300); if (at) glow.push(...(lm('wagons', at).glow || [])); }
    if (rand() < 0.7) { const at = spot(T.oobLateral + 60, T.oobLateral + 220); if (at) glow.push(...(lm('windmill', at).glow || [])); }
    if (rand() < 0.5) { const at = spot(T.oobLateral + 80, T.oobLateral + 260); if (at) glow.push(...(lm('sodhouse', at).glow || [])); }
    // tumbleweeds, rolling downwind and wrapping round
    for (let i = 0; i < 10; i++) {
      const at = spot(T.fwHalf + 25, T.oobLateral + 120, { tries: 12 });
      if (!at) continue;
      const tw = put(tumbleweed(rand), at);
      movers.push({ kind: 'weed', o: tw, home: { x: at.x, z: at.z }, phase: rand() * 100, r: tw.geometry.parameters.radius });
    }
  }

  if (T.seaLevel != null && (hole.theme === 'coastal' || hole.theme === 'harbor')) {
    // sailboats well offshore, bobbing
    for (let i = 0; i < 9; i++) {
      const at = spot(T.oobLateral + 120, T.oobLateral + 1400, { sea: true, tries: 40 });
      if (!at) continue;
      const b = put(sailboat(rand), at, rand() * Math.PI * 2);
      b.scale.setScalar(0.9 + rand() * 0.6);
      movers.push({ kind: 'boat', o: b, y: at.y, phase: rand() * 10 });
    }
    // sea stacks and boulders along the shore
    const rock = new THREE.MeshStandardMaterial({ color: hole.theme === 'coastal' ? 0x7d7468 : 0x6f6c66, roughness: 0.95, flatShading: true });
    let n = 0;
    for (let k = 0; k < 600 && n < 26; k++) {
      const s = rand() * L, p = T.pointAt(s), side = rand() < 0.5 ? -1 : 1;
      const d = T.oobLateral * 0.5 + rand() * (T.oobLateral + 250);
      const x = p.x + p.rx * d * side, z = p.z + p.rz * d * side;
      const pr = T.project(x, z);
      if (Math.abs(pr.d) < T.fwHalf + 30 && pr.s > -20 && pr.s < L + 30) continue;
      const h = T.meshHeight(x, z);
      if (h > T.seaLevel + 0.6 || h < T.seaLevel - 3) continue; // the surf line
      const r = 1.5 + rand() * (rand() < 0.2 ? 6 : 2.5);
      const stack = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rock);
      stack.scale.set(1, 0.6 + rand() * (r > 4 ? 1.6 : 0.6), 1);
      stack.position.set(x, T.seaLevel - 0.6 + r * 0.25, z);
      stack.rotation.set(rand(), rand() * 6, rand());
      stack.castShadow = stack.receiveShadow = true;
      group.add(stack);
      n++;
    }
  }

  if (hole.crowds) {
    // spectators round the back and sides of the green, on the mounds
    const G = T.green;
    const n = 60 + Math.floor(rand() * 40);
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(T.finalDir.z, T.finalDir.x) + (rand() - 0.5) * Math.PI * 1.5;
      const r = T.greenR + 18 + rand() * 14;
      const x = G.x + Math.cos(a) * r, z = G.z + Math.sin(a) * r;
      if (T.terrain(x, z).surface === 'water') continue;
      const p = figure(rand);
      p.position.set(x, ground(x, z), z);
      // figures look down their +X: turn each to face the green
      p.rotation.y = Math.atan2(-(G.z - z), G.x - x);
      group.add(p);
    }
  }

  return {
    group, glow,
    update(dt, t, wind = { x: 0.6, z: 0 }) {
      for (const m of movers) {
        if (m.kind === 'boat') {
          m.o.position.y = m.y + Math.sin(t * 0.9 + m.phase) * 0.18;
          m.o.rotation.z = Math.sin(t * 0.7 + m.phase) * 0.05;
          m.o.rotation.x = Math.sin(t * 0.55 + m.phase * 1.3) * 0.04;
        } else if (m.kind === 'weed') {
          // roll downwind for ~60 m, then start again from home
          const sp = 1.2 + Math.hypot(wind.x, wind.z) * 0.9;
          const run = ((t + m.phase) * sp) % 60;
          const wl = Math.hypot(wind.x, wind.z) || 1;
          const x = m.home.x + (wind.x / wl) * run, z = m.home.z + (wind.z / wl) * run;
          m.o.position.set(x, ground(x, z) + m.r + Math.abs(Math.sin(t * 3 + m.phase)) * 0.25, z);
          m.o.rotation.x += dt * sp / m.r;
          m.o.rotation.z += dt * sp * 0.3 / m.r;
        }
      }
    },
  };
}
