// The Statue of Liberty course's American atmosphere: the Stars and Stripes
// on every pin and on tall flagpoles at the tee and behind the green, and,
// after dark, fireworks over the harbour (an occasional burst, and a full
// volley for a hole-out).
import * as THREE from 'three';
import { bus } from '../core/events.js';

let flagTex = null;
/** The US flag (13 stripes, 50 stars), 10:19 proportions. */
export function usFlagTexture() {
  if (flagTex) return flagTex;
  const c = document.createElement('canvas');
  c.width = 380; c.height = 200;
  const g = c.getContext('2d');
  const sh = 200 / 13;
  for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#f4f2ee' : '#b31942'; g.fillRect(0, i * sh, 380, sh + 0.5); }
  g.fillStyle = '#0a3161'; g.fillRect(0, 0, 152, sh * 7);
  g.fillStyle = '#ffffff';
  const star = (x, y, r) => {
    g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.4 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  };
  for (let row = 0; row < 9; row++) for (let col = 0; col < (row % 2 ? 5 : 6); col++) star(12.7 + col * 25.3 + (row % 2 ? 12.65 : 0), 10.8 + row * 10.77, 4.6);
  flagTex = new THREE.CanvasTexture(c);
  flagTex.colorSpace = THREE.SRGBColorSpace;
  flagTex.anisotropy = 4;
  return flagTex;
}

/** Dress a pin flag (from makeFlag) as the US flag. */
export function dressPinFlag(flagGroup) {
  const m = flagGroup.userData.flagMat;
  m.map = usFlagTexture();
  m.color.set(0xffffff);
  m.emissive.set(0x222222);
  m.emissiveMap = usFlagTexture();
  m.needsUpdate = true;
}

/** A tall white flagpole flying a large flag that waves in the wind. */
export function flagpole(height = 12) {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, metalness: 0.4, roughness: 0.35 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.11, height, 10), white);
  pole.position.y = height / 2;
  pole.castShadow = true;
  g.add(pole);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 0.9, roughness: 0.3 }));
  ball.position.y = height + 0.1;
  g.add(ball);
  const geo = new THREE.PlaneGeometry(3.6, 1.9, 18, 6).translate(1.8, 0, 0);
  const mat = new THREE.MeshStandardMaterial({ map: usFlagTexture(), side: THREE.DoubleSide, roughness: 0.85 });
  const uni = { uTime: { value: 0 }, uWind: { value: 0.3 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float k = position.x / 3.6;
        float amp = 0.08 + 0.32 * uWind;
        float spd = 2.2 + 6.0 * uWind;
        transformed.z += sin(position.x * 2.4 - uTime * spd) * amp * k;
        transformed.y += sin(position.x * 1.9 - uTime * spd * 0.7) * amp * 0.3 * k - (1.0 - uWind) * 0.5 * k * k;`);
  };
  mat.customProgramCacheKey = () => 'usFlagpole';
  const flag = new THREE.Mesh(geo, mat);
  flag.position.y = height - 1.1;
  flag.castShadow = true;
  g.add(flag);
  g.userData.update = (t, wind) => { uni.uTime.value = t; uni.uWind.value = wind; };
  return g;
}

/**
 * Fireworks over the harbour at night: shells rise, burst into red, white
 * and blue stars that fall and fade. `at` is the launch point (local metres).
 */
export function fireworks(at) {
  const MAXB = 14, N = 140;
  const pos = new Float32Array(MAXB * N * 3), col = new Float32Array(MAXB * N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 7.5, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  const bursts = [];
  const palette = [[1, 0.18, 0.22], [1, 1, 1], [0.25, 0.45, 1], [1, 0.85, 0.5]];
  let next = 2, volley = 0;
  const launch = () => {
    if (bursts.length >= MAXB) bursts.shift();
    const c = palette[Math.floor(Math.random() * palette.length)];
    const center = new THREE.Vector3(at.x + (Math.random() - 0.5) * 260, at.y + 150 + Math.random() * 120, at.z + (Math.random() - 0.5) * 260);
    const v = [];
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const sp = 38 + Math.random() * 10;
      v.push(new THREE.Vector3(s * Math.cos(a) * sp, u * sp, s * Math.sin(a) * sp));
    }
    bursts.push({ center, v, t: 0, c });
  };
  const off = bus.on('course:holeout', () => { volley = 7; });
  pts.userData.dispose = off;
  pts.userData.update = (dt, day) => {
    const night = 1 - day;
    if (night > 0.5) {
      next -= dt;
      if (volley > 0 && next > 0.45) next = 0.45;
      if (next <= 0) { launch(); if (volley > 0) { volley--; next = 0.45; } else next = 3.5 + Math.random() * 6; }
    } else volley = 0;
    for (const b of bursts) b.t += dt;
    let k = 0;
    for (const b of bursts) {
      const fade = Math.max(0, 1 - b.t / 2.6);
      for (let i = 0; i < N; i++) {
        const v = b.v[i];
        const drag = (1 - Math.exp(-1.6 * b.t)) / 1.6;
        pos[k * 3] = b.center.x + v.x * drag;
        pos[k * 3 + 1] = b.center.y + v.y * drag - 4.9 * b.t * b.t * 0.6;
        pos[k * 3 + 2] = b.center.z + v.z * drag;
        const tw = fade * (0.75 + 0.25 * Math.sin(b.t * 30 + i));
        col[k * 3] = b.c[0] * tw * 2; col[k * 3 + 1] = b.c[1] * tw * 2; col[k * 3 + 2] = b.c[2] * tw * 2;
        k++;
      }
    }
    for (; k < MAXB * N; k++) { col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = 0; }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    pts.visible = night > 0.3 && bursts.length > 0;
  };
  return pts;
}
