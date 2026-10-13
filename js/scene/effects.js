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

  land(ev) {
    if (ev.surface === 'green') {
      this.ring(ev.x, ev.y, ev.z, 0xfff0c8, 5, 1.0);
      this.burst(ev.x, ev.y, ev.z, { n: 10, color: 0x6a9a4a, speed: 1.2, up: 1.2, life: 0.6 });
    } else if (ev.surface === 'water') {
      this.splash(ev.x, ev.y, ev.z);
    } else {
      this.ring(ev.x, ev.y, ev.z, 0xffd9a0, Math.min(10, 3 + ev.speed * 0.15), 1.0);
      this.burst(ev.x, ev.y, ev.z, { n: 24, color: 0x6f8a3a, speed: 2.2, up: 2.4, life: 0.8 });
    }
  }

  splash(x, y, z) {
    this.burst(x, y, z, { n: 120, color: 0xcfe2ff, speed: 3.5, up: 9, life: 1.8, coarse: true });
    this.burst(x, y, z, { n: 60, color: 0xe8f0ff, speed: 1.5, up: 13, life: 2.0, coarse: true });
    this.ring(x, y, z, 0xbcd4ff, 14, 2.2);
    setTimeout(() => this.ring(x, y, z, 0x9ab8e8, 22, 2.8), 350);
  }

  celebrate(x, y, z) {
    this.burst(x, y, z, { n: 160, color: 0xffd36a, speed: 3.5, up: 9, life: 2.4, gravity: 6 });
    this.burst(x, y, z, { n: 80, color: 0xfff4dc, speed: 2, up: 11, life: 2.8, gravity: 5 });
    this.ring(x, y, z, 0xffd36a, 16, 1.8);
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
    this._step(this.p, this.points, dt);
    this._step(this.pc, this.coarse, dt);
    this._step(this.pf, this.fine, dt);
  }
}
