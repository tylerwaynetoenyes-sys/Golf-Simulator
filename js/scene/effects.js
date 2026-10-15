// Short-lived impact effects: landing rings, turf spray, river splashes and a
// celebratory burst for aces and personal bests.
import * as THREE from 'three';

function ringMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uT; varying vec2 vUv;
      void main(){
        float r = length(vUv - 0.5) * 2.0;
        float ring = smoothstep(uT - 0.12, uT, r) * (1.0 - smoothstep(uT, uT + 0.04, r));
        float a = ring * (1.0 - uT);
        gl_FragColor = vec4(uColor * a * 1.6, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// a leaf: an ovate blade with a midrib, on a transparent ground
function leafTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(32, 3); g.bezierCurveTo(56, 18, 52, 46, 32, 61); g.bezierCurveTo(12, 46, 8, 18, 32, 3); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(32, 6); g.lineTo(32, 60); g.stroke();
  g.lineWidth = 1; for (let k = 0; k < 5; k++) { const y = 16 + k * 9; g.beginPath(); g.moveTo(32, y); g.lineTo(18, y - 6); g.moveTo(32, y); g.lineTo(46, y - 6); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ripples spreading on water: a soft bright crest with a darker trough inside it, normal blending
function rippleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: /* glsl */`
      uniform float uT; varying vec2 vUv;
      void main(){
        float r = length(vUv - 0.5) * 2.0;
        float f = 0.0, d = 0.0;
        for (int k = 0; k < 3; k++) {
          float c = uT * (1.0 - float(k) * 0.22);
          float w = 0.035 + 0.02 * float(k);
          f += exp(-pow((r - c) / w, 2.0)) * (1.0 - float(k) * 0.3);
          d += exp(-pow((r - c + w * 1.6) / w, 2.0)) * (1.0 - float(k) * 0.3);
        }
        float fade = (1.0 - uT) * (1.0 - uT) * smoothstep(1.0, 0.85, r);
        float a = (f * 0.22 + d * 0.14) * fade;
        vec3 col = mix(vec3(0.04, 0.06, 0.07), vec3(0.75, 0.82, 0.86), f / (f + d + 1e-3));
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false,
  });
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    // shared particle pool
    this.MAXP = 600;
    this.p = [];
    const geo = new THREE.BufferGeometry();
    this.ppos = new Float32Array(this.MAXP * 3);
    this.pcol = new Float32Array(this.MAXP * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.ppos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pcol, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.12, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 22;
    scene.add(this.points);
    this.coarse = new THREE.Points(geo.clone(), new THREE.PointsMaterial({
      size: 0.9, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    this.coarse.frustumCulled = false;
    this.coarse.renderOrder = 22;
    scene.add(this.coarse);
    this.pc = [];
    // fine sparks for close-up moments (the cup)
    this.fine = new THREE.Points(geo.clone(), new THREE.PointsMaterial({
      size: 0.016, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    this.fine.frustumCulled = false;
    this.fine.renderOrder = 22;
    scene.add(this.fine);
    this.pf = [];

    // falling leaves: lit, tumbling, settling on the ground
    this.MAXL = 220;
    this.leafM = new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 });
    // a leaf's underside is pale and silvery: as it tumbles it flashes, which is what catches the eye
    this.leafM.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n if (!gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.84, 0.62), 0.55);');
    };
    this.leafMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.12), this.leafM, this.MAXL);
    this.leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.leafMesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.leafMesh.count = 0;
    this.leafMesh.frustumCulled = false;
    this.leafMesh.castShadow = true;
    scene.add(this.leafMesh);
    this.lv = [];
    this.ground = null; // (x, z) → height, set by the world

    // water droplets: small glassy spheres (lit, so they glint in the sun instead of glowing)
    this.MAXD = 360;
    this.dropMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xeaf2f6, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.7, envMapIntensity: 1.8 }), this.MAXD);
    this.dropMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dropMesh.count = 0;
    this.dropMesh.frustumCulled = false;
    scene.add(this.dropMesh);
    this.dv = [];
    // spray and mist: soft white puffs (normal blending)
    this.puffTex = dotTexture();
    this.puffs = [];
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
  }

  /** A ball through a tree: leaves (and a twig or two) shaken loose, tumbling down; more follow from higher up. */
  leaves(x, y, z, speed = 30, dir = null) {
    const n = Math.min(90, Math.round(24 + speed * 1.0));
    const greens = [[0.25, 0.5, 0.28], [0.23, 0.45, 0.32], [0.28, 0.42, 0.24], [0.21, 0.5, 0.36], [0.13, 0.55, 0.42], [0.08, 0.45, 0.3]];
    const col = new THREE.Color();
    const add = (delay, hy, k) => {
      for (let i = 0; i < k; i++) {
        if (this.lv.length >= this.MAXL) this.lv.shift();
        const g = greens[Math.random() < 0.82 ? Math.floor(Math.random() * 4) : 4 + Math.floor(Math.random() * 2)];
        const twig = Math.random() < 0.06;
        col.setHSL(g[0] + (Math.random() - 0.5) * 0.03, g[1], g[2] * (0.85 + Math.random() * 0.3));
        if (twig) col.setRGB(0.25, 0.18, 0.12);
        const a = Math.random() * 6.28, r = Math.random() * 1.6;
        const kick = delay ? 0.2 : 1.2 + speed * 0.02;
        this.lv.push({
          x: x + Math.cos(a) * r, y: y + hy + (Math.random() - 0.3) * 1.2, z: z + Math.sin(a) * r,
          vx: (dir ? dir.x * kick : 0) + (Math.random() - 0.5) * kick, vy: delay ? 0 : Math.random() * 1.5, vz: (dir ? dir.z * kick : 0) + (Math.random() - 0.5) * kick,
          rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
          sx: (Math.random() - 0.5) * 9, sy: (Math.random() - 0.5) * 6, sz: (Math.random() - 0.5) * 9,
          ph: Math.random() * 6.28, fr: 1.8 + Math.random() * 1.6, term: 1.0 + Math.random() * 0.9,
          size: twig ? 1.6 : 0.8 + Math.random() * 0.6, twig, delay, t: 0, down: -1, color: col.clone(),
        });
      }
    };
    add(0, 0, n);
    add(0.2 + Math.random() * 0.6, 1.5 + Math.random() * 2, Math.round(n * 0.5)); // shaken loose higher up a moment later
  }

  /** Ball in the hole: golden sparks lift out of the cup, a ring runs across the green. */
  holeOut(x, y, z, level = 0.5) {
    this.burst(x, y, z, { n: Math.round(40 + level * 80), color: 0xffd36a, speed: 0.55, up: 2.6 + level * 1.6, gravity: 3.2, life: 1.6, fine: true });
    this.burst(x, y, z, { n: Math.round(20 + level * 40), color: 0xfff4dc, speed: 0.3, up: 3.2 + level * 1.4, gravity: 2.6, life: 1.9, fine: true });
    this.ring(x, y - 0.045, z, 0xffd36a, 0.55, 0.7);
    setTimeout(() => this.ring(x, y - 0.045, z, 0xffe7b0, 3 + level * 6, 1.6), 220);
    if (level >= 0.6) setTimeout(() => this.celebrate(x, y, z), 900);
  }

  ring(x, y, z, color = 0xffd9a0, size = 6, life = 1.1) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), ringMaterial(color));
    m.position.set(x, y + 0.05, z);
    m.renderOrder = 21;
    this.scene.add(m);
    this.items.push({ m, t: 0, life });
  }

  burst(x, y, z, { n = 30, color = 0x9bd27a, speed = 3, up = 2.5, gravity = 9.8, life = 1.2, spread = 1, coarse = false, fine = false } = {}) {
    const c = new THREE.Color(color);
    const pool = fine ? this.pf : coarse ? this.pc : this.p;
    for (let i = 0; i < n; i++) {
      if (pool.length >= this.MAXP) pool.shift();
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7) * spread;
      pool.push({
        x, y: y + 0.05, z,
        vx: Math.cos(a) * s, vy: up * (0.4 + Math.random()), vz: Math.sin(a) * s,
        g: gravity, t: 0, life: life * (0.6 + Math.random() * 0.6), c,
      });
    }
  }

  /** What the turf does when the ball comes down, by surface. */
  land(ev) {
    const sp = Math.min(1.5, (ev.speed || 15) / 25);
    switch (ev.surface) {
      case 'green':
        // a soft pitch mark: small ring, a puff of fine grass
        this.ring(ev.x, ev.y, ev.z, 0xfff0c8, 2.5 + sp * 2, 0.9);
        this.burst(ev.x, ev.y, ev.z, { n: 8, color: 0x7fb257, speed: 0.8, up: 0.9, life: 0.5, fine: true });
        break;
      case 'sand':
        // bunker: a spray of sand, low and heavy
        this.burst(ev.x, ev.y, ev.z, { n: Math.round(40 + sp * 50), color: 0xe9dcb6, speed: 2.2 * sp + 0.6, up: 2.4 * sp + 0.8, life: 0.9, gravity: 12 });
        this.burst(ev.x, ev.y, ev.z, { n: 18, color: 0xf4ead0, speed: 1.2, up: 1.4, life: 1.4, gravity: 3, fine: true });
        break;
      case 'rough':
        // rough: grass flies up, the ball nestles down
        this.burst(ev.x, ev.y, ev.z, { n: 26, color: 0x4e6b2a, speed: 1.6 * sp + 0.5, up: 2.2 * sp + 0.6, life: 0.8 });
        this.ring(ev.x, ev.y, ev.z, 0xcfe0a8, 2.5 + sp * 3, 0.8);
        break;
      case 'water':
        this.splash(ev.x, ev.y, ev.z, ev.speed || 30);
        break;
      default:
        // fairway / fringe / tee: a crisp ring and a little turf
        this.ring(ev.x, ev.y, ev.z, 0xffd9a0, Math.min(10, 3 + (ev.speed || 15) * 0.15), 1.0);
        this.burst(ev.x, ev.y, ev.z, { n: 20, color: 0x6f8a3a, speed: 1.8 * sp + 0.4, up: 2 * sp + 0.4, life: 0.75 });
    }
  }

  /**
   * A ball into water, as a high-speed camera shows it: a crown of droplets thrown up
   * and out from the rim of the cavity, then the Worthington jet rising from the middle
   * and breaking into drops at its tip, a puff of spray, white foam where it went in,
   * and rings of ripples running out across the surface.
   */
  splash(x, y, z, speed = 30) {
    const k = Math.min(1.4, 0.5 + speed / 50);
    const drop = (vx, vy, vz, r, life, px = x, py = y, pz = z) => {
      if (this.dv.length >= this.MAXD) this.dv.shift();
      this.dv.push({ x: px, y: py + 0.02, z: pz, vx, vy, vz, r, t: 0, life, wy: y });
    };
    // the crown
    for (let i = 0; i < 190 * k; i++) {
      const a = Math.random() * 6.28, out = 1.0 + Math.random() * 2.2 * k, up = 1.8 + Math.random() * 3.2 * k;
      drop(Math.cos(a) * out, up, Math.sin(a) * out, 0.005 + Math.random() * Math.random() * 0.022, 2, x + Math.cos(a) * 0.12, y, z + Math.sin(a) * 0.12);
    }
    // the jet, a moment later: a column of fat drops shooting straight up
    setTimeout(() => {
      for (let i = 0; i < 60 * k; i++) drop((Math.random() - 0.5) * 0.45, 2.5 + Math.random() * 4.5 * k, (Math.random() - 0.5) * 0.45, 0.008 + Math.random() * 0.026, 2.2);
    }, 140);
    // spray and foam
    this.puff(x, y + 0.3, z, 1.6 * k, 1.3, 0.5);
    setTimeout(() => this.puff(x, y + 1.2 * k, z, 2.2 * k, 1.6, 0.32), 160);
    this.puff(x, y + 0.03, z, 1.2, 2.6, 0.4, true);
    // ripples: two trains of rings running out
    this.ripple(x, y, z, 9 + 5 * k, 3.2);
    setTimeout(() => this.ripple(x, y, z, 6 + 3 * k, 2.6), 450);
  }

  /** A soft white puff (spray, mist) or, flat, a patch of foam on the water. */
  puff(x, y, z, size, life, alpha, flat = false) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.puffTex, color: 0xf4f8fa, transparent: true, opacity: alpha, depthWrite: false }));
    if (flat) m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.renderOrder = 23;
    this.scene.add(m);
    this.puffs.push({ m, t: 0, life, size, alpha, flat });
  }

  ripple(x, y, z, size, life) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), rippleMaterial());
    m.position.set(x, y + 0.03, z);
    m.renderOrder = 21;
    this.scene.add(m);
    this.items.push({ m, t: 0, life });
  }

  celebrate(x, y, z) {
    this.burst(x, y, z, { n: 160, color: 0xffd36a, speed: 3.5, up: 9, life: 2.4, gravity: 6 });
    this.burst(x, y, z, { n: 80, color: 0xfff4dc, speed: 2, up: 11, life: 2.8, gravity: 5 });
    this.ring(x, y, z, 0xffd36a, 16, 1.8);
  }

  _leaves(dt) {
    const L = this.lv, M = this.leafMesh, m4 = this._m4, q = this._q, e = this._e, v = this._v, s = this._s;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.t += dt;
      if (p.down >= 0) {
        p.down += dt;
        if (p.down > 5) { L.splice(i, 1); continue; }
        continue;
      }
      // a leaf falls at its own slow terminal speed, fluttering side to side and tumbling;
      // a twig drops faster and straighter
      p.vy = Math.max(p.vy - 9.8 * dt, -(p.twig ? 3.5 : p.term));
      const drag = Math.exp(-dt * (p.twig ? 0.4 : 2.2));
      p.vx *= drag; p.vz *= drag;
      const fl = p.twig ? 0 : 0.9;
      p.x += (p.vx + Math.cos(p.t * p.fr + p.ph) * fl) * dt;
      p.z += (p.vz + Math.sin(p.t * p.fr * 0.8 + p.ph) * fl * 0.7) * dt;
      p.y += p.vy * dt;
      p.rx += p.sx * dt; p.ry += p.sy * dt; p.rz += p.sz * dt;
      const gy = this.ground ? this.ground(p.x, p.z) : -1e9;
      if (p.y <= gy + 0.01) { p.y = gy + 0.012; p.rx = -Math.PI / 2 + (Math.random() - 0.5) * 0.3; p.rz = 0; p.down = 0; }
    }
    let n = 0;
    for (const p of L) {
      if (p.delay > 0) continue;
      const fade = p.down > 4 ? 1 - (p.down - 4) : 1;
      e.set(p.rx, p.ry, p.rz);
      M.setMatrixAt(n, m4.compose(v.set(p.x, p.y, p.z), q.setFromEuler(e), s.set(p.size * fade * (p.twig ? 0.3 : 1), p.size * fade, p.size * fade)));
      M.setColorAt(n, p.color);
      n++;
    }
    M.count = n;
    M.instanceMatrix.needsUpdate = true;
    if (M.instanceColor) M.instanceColor.needsUpdate = true;
  }

  _drops(dt) {
    const D = this.dv, M = this.dropMesh, m4 = this._m4, q = this._q, v = this._v, s = this._s;
    for (let i = D.length - 1; i >= 0; i--) {
      const p = D[i];
      p.t += dt;
      p.vy -= 9.8 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      // back into the water: gone (with a tiny ring if it was a big one)
      if (p.y < p.wy && p.vy < 0) { if (p.r > 0.035 && Math.random() < 0.25) this.ripple(p.x, p.wy, p.z, 0.9, 0.9); D.splice(i, 1); continue; }
      if (p.t > p.life) D.splice(i, 1);
    }
    let n = 0;
    const up = this._up || (this._up = new THREE.Vector3(0, 1, 0)), vd = this._vd || (this._vd = new THREE.Vector3());
    for (const p of D) {
      // stretched along its flight, as a drop is in a photograph at a normal shutter speed
      const sp = Math.hypot(p.vx, p.vy, p.vz);
      q.setFromUnitVectors(up, vd.set(p.vx, p.vy, p.vz).normalize());
      M.setMatrixAt(n++, m4.compose(v.set(p.x, p.y, p.z), q, s.set(p.r, p.r * (1 + Math.min(4, sp * 0.35)), p.r)));
    }
    M.count = n;
    M.instanceMatrix.needsUpdate = true;
  }

  _step(pool, points, dt) {
    for (let i = pool.length - 1; i >= 0; i--) {
      const p = pool[i];
      p.t += dt;
      if (p.t > p.life) { pool.splice(i, 1); continue; }
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    const g = points.geometry;
    const pos = g.attributes.position.array, col = g.attributes.color.array;
    let n = 0;
    for (const p of pool) {
      const f = 1 - p.t / p.life;
      pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
      col[n * 3] = p.c.r * f; col[n * 3 + 1] = p.c.g * f; col[n * 3 + 2] = p.c.b * f;
      n++;
    }
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.m.material.uniforms.uT.value = Math.min(1, it.t / it.life);
      if (it.t >= it.life) {
        this.scene.remove(it.m);
        it.m.geometry.dispose();
        it.m.material.dispose();
        this.items.splice(i, 1);
      }
    }
    this._leaves(dt);
    this._drops(dt);
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.t += dt;
      const f = p.t / p.life;
      if (f >= 1) { this.scene.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); this.puffs.splice(i, 1); continue; }
      const sc = p.size * (0.5 + (p.flat ? 0.7 : 1.4) * Math.sqrt(f));
      p.m.scale.set(sc, sc, sc);
      p.m.material.opacity = p.alpha * (1 - f) * (1 - f);
      if (!p.flat && this.camera) p.m.quaternion.copy(this.camera.quaternion);
      if (!p.flat) p.m.position.y += dt * 0.25;
    }
    this._step(this.p, this.points, dt);
    this._step(this.pc, this.coarse, dt);
    this._step(this.pf, this.fine, dt);
  }
}
