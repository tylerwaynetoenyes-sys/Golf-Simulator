// Cahokia Mounds State Historic Site (UNESCO World Heritage). Monks Mound,
// about 100 ft (30 m) tall in four terraces, is drawn here at reduced plan
// size (the real base is ~290 × 240 m) with its modern public staircase up
// the south face and a reconstructed summit building. Around it: smaller
// platform and conical mounds, a stretch of the reconstructed log palisade
// with bastions, a Woodhenge post circle with its centre post, an interpretive
// plaza, and low mist drifting over the prairie. Drawn as heritage landscape.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, lit, box, cyl, seeded, canvasTex } from './kit.js';

/** A stepped, rounded-rectangle earthwork terrace. */
function terrace(w, d, h, inset, r = 6) {
  const shape = (ww, dd, rr) => {
    const s = new THREE.Shape();
    const x = ww / 2, z = dd / 2;
    s.moveTo(-x + rr, -z); s.lineTo(x - rr, -z); s.quadraticCurveTo(x, -z, x, -z + rr);
    s.lineTo(x, z - rr); s.quadraticCurveTo(x, z, x - rr, z); s.lineTo(-x + rr, z);
    s.quadraticCurveTo(-x, z, -x, z - rr); s.lineTo(-x, -z + rr); s.quadraticCurveTo(-x, -z, -x + rr, -z);
    return s;
  };
  // a frustum by lofting two outlines
  const lo = shape(w, d, r).getSpacedPoints(64);
  const hi = shape(w - inset * 2, d - inset * 2, Math.max(1, r - inset * 0.5)).getSpacedPoints(64);
  const pos = [];
  const idx = [];
  for (let i = 0; i < lo.length; i++) { pos.push(lo[i].x, 0, lo[i].y); pos.push(hi[i].x, h, hi[i].y); }
  for (let i = 0; i < lo.length - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, dd = a + 3;
    idx.push(a, b, c, b, dd, c);
  }
  // top cap
  const top = pos.length / 3;
  pos.push(0, h, 0);
  for (let i = 0; i < hi.length - 1; i++) idx.push(top, i * 2 + 3, i * 2 + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export default function build() {
  const g = new THREE.Group();
  const glow = [];
  const rnd = seeded(1050);

  const grassTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#6d8a48'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = rnd();
      c.fillStyle = v < 0.4 ? 'rgba(130,150,80,0.5)' : v < 0.7 ? 'rgba(80,105,50,0.5)' : 'rgba(165,160,100,0.4)';
      c.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 3 + rnd() * 5);
    }
  }, [10, 10]);
  const grass = new THREE.MeshStandardMaterial({ map: grassTex, color: 0xffffff, roughness: 1 });
  const prairie = new THREE.MeshStandardMaterial({ map: grassTex, color: 0xd8cc9a, roughness: 1 });

  // ── Monks Mound: four terraces, the first broad and low ──
  const mound = new THREE.Group();
  const T1 = new THREE.Mesh(terrace(170, 140, 9, 9, 18), grass);
  const T2 = new THREE.Mesh(terrace(120, 100, 8, 8, 12), grass);
  T2.position.set(-10, 9, -8);
  const T3 = new THREE.Mesh(terrace(80, 66, 7, 7, 8), grass);
  T3.position.set(-12, 17, -12);
  const T4 = new THREE.Mesh(terrace(48, 40, 4, 4, 6), grass);
  T4.position.set(-12, 24, -14);
  // the first terrace's lower step to the south-west
  const T1b = new THREE.Mesh(terrace(60, 50, 5, 5, 8), grass);
  T1b.position.set(48, 9, 30);
  mound.add(T1, T2, T3, T4, T1b);
  // the modern staircase up the south (+Z) face
  const stairMat = mat(0x8a7f70, { roughness: 0.9 });
  const rail = mat(0x3a3d40, { metalness: 0.5, roughness: 0.5 });
  // faces: [zBottom, zTop, yBottom, yTop]; walkways between them on each terrace
  const faces = [[70, 61, 0, 9], [42, 34, 9, 17], [21, 14, 17, 24], [6, 2, 24, 28]];
  const steps = [];
  faces.forEach(([z0, z1, y0, y1], i) => {
    const n = Math.round((y1 - y0) / 0.42);
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      steps.push(new THREE.BoxGeometry(5, (y1 - y0) / n + 0.25, (z0 - z1) / n + 0.05).translate(-12, y0 + (y1 - y0) * u - 0.1, z0 + (z1 - z0) * u));
    }
    const next = faces[i + 1];
    const zEnd = next ? next[0] : -10;
    steps.push(new THREE.BoxGeometry(5, 0.3, z1 - zEnd).translate(-12, y1 + 0.05, (z1 + zEnd) / 2));
  });
  const stair = new THREE.Mesh(mergeGeometries(steps), stairMat);
  stair.castShadow = stair.receiveShadow = true;
  mound.add(stair);
  for (const x of [-14.7, -9.3]) {
    for (const [z0, z1, y0, y1] of faces) {
      const r = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(x, y0 + 1.1, z0), new THREE.Vector3(x, y1 + 1.1, z1)), 2, 0.06, 5), rail);
      mound.add(r);
    }
  }
  // reconstructed summit building: wattle-and-daub walls, steep thatched roof
  const daub = lit(0xa58a62, 0xffb870, { night: 0.35, roughness: 1 });
  glow.push(daub);
  const thatch = mat(0x8c7348, { roughness: 1 });
  const temple = new THREE.Group();
  temple.add(box(16, 4.2, 10, daub, 0, 0, 0));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(10.5, 9, 4, 1), thatch);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.15, 1, 0.75);
  roof.position.y = 8.6;
  roof.castShadow = true;
  temple.add(roof);
  temple.add(box(2.2, 2.6, 0.4, mat(0x2a221a), 0, 0, 5.05));
  temple.position.set(-12, 28, -18);
  mound.add(temple);
  mound.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.add(mound);

  // ── smaller mounds: platform and conical ──
  const mounds = [
    { x: 125, z: 60, type: 'cone', r: 16, h: 7 },
    { x: -135, z: 70, type: 'cone', r: 12, h: 5 },
    { x: 120, z: -95, type: 'platform', w: 40, d: 30, h: 5 },
    { x: -140, z: -90, type: 'platform', w: 34, d: 28, h: 4 },
    { x: 40, z: 105, type: 'ridge', w: 46, d: 14, h: 4 },
  ];
  for (const m of mounds) {
    let mesh;
    if (m.type === 'cone') {
      const geo = new THREE.SphereGeometry(m.r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      mesh = new THREE.Mesh(geo, grass);
      mesh.scale.y = m.h / m.r;
    } else {
      mesh = new THREE.Mesh(terrace(m.w, m.d, m.h, m.h * 1.2, m.type === 'ridge' ? 6 : 5), grass);
    }
    mesh.position.set(m.x, 0, m.z);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  }

  // ── Woodhenge: red-cedar post circle with a centre post ──
  const cedar = mat(0x7a4a2c, { roughness: 0.95 });
  const posts = [];
  const WH = { x: -120, z: 40, r: 30 };
  const n = 36;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const h = 6 + rnd() * 1.2;
    posts.push(new THREE.CylinderGeometry(0.32, 0.4, h, 7).translate(WH.x + Math.cos(a) * WH.r, h / 2, WH.z + Math.sin(a) * WH.r));
  }
  posts.push(new THREE.CylinderGeometry(0.45, 0.55, 9, 8).translate(WH.x, 4.5, WH.z));
  const wh = new THREE.Mesh(mergeGeometries(posts), cedar);
  wh.castShadow = true;
  g.add(wh);

  // ── a stretch of the reconstructed palisade with bastions ──
  const logs = [];
  const PAL = { x0: 40, z0: -130, x1: 160, z1: -20 };
  const len = Math.hypot(PAL.x1 - PAL.x0, PAL.z1 - PAL.z0);
  const dx = (PAL.x1 - PAL.x0) / len, dz = (PAL.z1 - PAL.z0) / len;
  for (let s = 0; s < len; s += 0.55) {
    const h = 4.2 + rnd() * 0.5;
    const x = PAL.x0 + dx * s, z = PAL.z0 + dz * s;
    logs.push(new THREE.CylinderGeometry(0.26, 0.28, h, 6).translate(x, h / 2, z));
    logs.push(new THREE.ConeGeometry(0.26, 0.5, 6).translate(x, h + 0.25, z));
    // bastions every 25 m
    if (Math.abs((s % 25) - 12.5) < 0.3) {
      const bx = x - dz * 3, bz = z + dx * 3;
      for (let a = 0; a < Math.PI * 2; a += 0.28) {
        const hh = 5.6;
        logs.push(new THREE.CylinderGeometry(0.26, 0.28, hh, 6).translate(bx + Math.cos(a) * 3, hh / 2, bz + Math.sin(a) * 3));
      }
    }
  }
  const pal = new THREE.Mesh(mergeGeometries(logs), mat(0x6b5139, { roughness: 1 }));
  pal.castShadow = true;
  g.add(pal);

  // ── interpretive plaza: paths, signboards and a covered artifact case ──
  const path = mat(0xb8ab92, { roughness: 1 });
  g.add(box(6, 0.1, 70, path, -12, 0, 105));
  g.add(box(80, 0.1, 5, path, -50, 0, 120));
  const boardMat = new THREE.MeshStandardMaterial({
    map: canvasTex(256, 160, (c, w, h) => {
      c.fillStyle = '#4a3a2a'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#d9c9a4'; c.fillRect(10, 10, w - 20, h - 20);
      c.fillStyle = '#7a5a3a'; c.fillRect(20, 20, 100, 70);
      c.fillStyle = '#5a4a3a';
      for (let i = 0; i < 6; i++) c.fillRect(135, 26 + i * 14, 90, 4);
      for (let i = 0; i < 3; i++) c.fillRect(20, 104 + i * 12, 205, 4);
    }),
    roughness: 0.8,
  });
  for (const [x, z, ry] of [[-22, 112, 0.3], [-46, 124, -0.2], [-70, 124, 0.1]]) {
    const b = new THREE.Group();
    b.add(box(0.18, 1.0, 0.18, mat(0x3a2e22), -0.9, 0, 0), box(0.18, 1.0, 0.18, mat(0x3a2e22), 0.9, 0, 0));
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), boardMat);
    p.position.y = 1.5; p.rotation.x = -0.35;
    b.add(p);
    b.position.set(x, 0, z); b.rotation.y = ry;
    g.add(b);
  }
  // artifact case: a glass-topped cabinet with a chunkey stone and pottery
  const caseG = new THREE.Group();
  caseG.add(box(3, 0.9, 1.4, mat(0x4a3a2a), 0, 0, 0));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(3, 0.7, 1.4), new THREE.MeshStandardMaterial({ color: 0xcfe0e6, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.2 }));
  glass.position.y = 1.25;
  caseG.add(glass);
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 20), mat(0x9a8e7a, { roughness: 0.6 }));
  stone.position.set(-0.8, 0.95, 0);
  caseG.add(stone);
  for (const [x, s] of [[0.1, 0.22], [0.75, 0.16]]) {
    const pot = new THREE.Mesh(new THREE.LatheGeometry([0, 0.6, 0.9, 1, 0.8, 0.5, 0.55].map((r, i) => new THREE.Vector2(r * s, i * s * 0.32)), 16), mat(0x8a5a3a, { roughness: 0.85 }));
    pot.position.set(x, 0.9, 0);
    caseG.add(pot);
  }
  // a shade roof over it
  caseG.add(box(0.15, 2.6, 0.15, mat(0x3a2e22), -1.8, 0, -1), box(0.15, 2.6, 0.15, mat(0x3a2e22), 1.8, 0, -1));
  caseG.add(box(0.15, 2.6, 0.15, mat(0x3a2e22), -1.8, 0, 1), box(0.15, 2.6, 0.15, mat(0x3a2e22), 1.8, 0, 1));
  caseG.add(box(4.4, 0.15, 2.8, thatch, 0, 2.6, 0));
  caseG.position.set(-34, 0, 118);
  g.add(caseG);
  // path lights (night)
  const lampM = lit(0x2a2a2a, 0xffd9a0, { night: 1.8 });
  glow.push(lampM);
  for (let z = 78; z <= 130; z += 9) g.add(cyl(0.1, 0.12, 0.7, lampM, -15.6, 0, z, 6), cyl(0.1, 0.12, 0.7, lampM, -8.4, 0, z, 6));

  // ── prairie grass beds around the base ──
  const tuft = new THREE.ConeGeometry(0.35, 1.2, 4).translate(0, 0.6, 0);
  const tufts = new THREE.InstancedMesh(tuft, prairie, 900);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3();
  let k = 0;
  for (let i = 0; i < 3000 && k < 900; i++) {
    const x = -165 + rnd() * 330, z = -145 + rnd() * 260;
    if (Math.abs(x + 12) < 98 && Math.abs(z + 8) < 84) continue; // the mound
    if (Math.hypot(x - WH.x, z - WH.z) < WH.r + 3) continue;
    if (z > 70 && x < 0 && x > -90) continue; // the plaza
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6);
    sc.set(1 + rnd(), 0.6 + rnd() * 0.8, 1 + rnd());
    tufts.setMatrixAt(k++, m4.compose(p3.set(x, 0, z), q, sc));
  }
  tufts.count = k;
  tufts.castShadow = false;
  g.add(tufts);

  // ── low mist: soft sheets drifting across the prairie ──
  const mistTex = canvasTex(128, 128, (c, w, h) => {
    const grd = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(240,242,240,0.55)'); grd.addColorStop(1, 'rgba(240,242,240,0)');
    c.fillStyle = grd; c.fillRect(0, 0, w, h);
  });
  const mistMat = new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: 0.5, fog: true });
  const mists = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(70, 70).rotateX(-Math.PI / 2), mistMat);
    m.position.set(-160 + rnd() * 320, 0.8 + rnd() * 2.5, -140 + rnd() * 250);
    m.userData = { x0: m.position.x, s: 0.6 + rnd() * 0.8, ph: rnd() * 6 };
    m.renderOrder = 2;
    g.add(m);
    mists.push(m);
  }

  return {
    group: g,
    glow,
    update(t, dt, day) {
      // mist lies heaviest in the morning/evening light and at night
      mistMat.opacity = 0.22 + 0.28 * (1 - day);
      for (const m of mists) {
        m.position.x = m.userData.x0 + ((t * m.userData.s + m.userData.ph * 40) % 80) - 40;
      }
    },
  };
}
