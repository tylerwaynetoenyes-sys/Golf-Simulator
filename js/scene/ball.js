// Golf ball: real-size mesh with a dimpled normal map, a screen-space glow so
// it stays readable 250 m out at night, and a soft contact shadow.
import * as THREE from 'three';
import { BALL } from '../core/physics.js';
import { groundHeight } from './layout.js';

function dimpleNormalMap() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,255)';
  g.fillRect(0, 0, s, s);
  const step = 16;
  for (let y = 0; y < s + step; y += step * 0.866) {
    const row = Math.round(y / (step * 0.866));
    for (let x = (row % 2) * step * 0.5; x < s + step; x += step) {
      const grd = g.createRadialGradient(x - 2, y - 2, 0, x, y, step * 0.48);
      grd.addColorStop(0, 'rgb(100,100,240)');
      grd.addColorStop(0.7, 'rgb(150,150,255)');
      grd.addColorStop(1, 'rgba(128,128,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, step * 0.48, 0, Math.PI * 2); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  return t;
}

function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.35)'));
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class Ball {
  constructor(scene) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL.radius, 32, 24),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.32, metalness: 0, normalMap: dimpleNormalMap(),
        normalScale: new THREE.Vector2(0.6, 0.6), emissive: 0x332a20, emissiveIntensity: 0.6,
      }),
    );
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture('rgba(255,244,220,1)', 'rgba(255,200,120,0)'),
      color: new THREE.Color(1.8, 1.6, 1.3),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false,
    }));
    this.glow.scale.set(0.022, 0.022, 1);
    this.glow.renderOrder = 20;
    scene.add(this.glow);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.85)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }),
    );
    this.shadow.renderOrder = 3;
    scene.add(this.shadow);

    this.ground = groundHeight;
    this.spinAxis = new THREE.Vector3(1, 0, 0);
    this.spinRate = 0;
    this.visible = true;
    this.placeOnTee();
  }

  setGround(fn) { this.ground = fn || groundHeight; }

  placeOnTee() { this.placeAt(0, 0, 0, true); }

  /** Rest the ball at (x, z): on a tee peg, or sitting on the ground. */
  placeAt(x, y, z, teed = false) {
    const gy = this.ground(x, z);
    this.setPosition(x, (teed ? Math.max(gy, y) + 0.07 : gy) + BALL.radius, z);
    this.spinRate = 0;
    this.mesh.rotation.set(0, 0, 0);
    this.setVisible(true);
  }

  setVisible(v) {
    this.visible = v;
    this.mesh.visible = v;
    this.glow.visible = v;
    this.shadow.visible = v;
  }

  setPosition(x, y, z) {
    this.mesh.position.set(x, y, z);
    this.glow.position.set(x, y, z);
    const gh = this.ground(x, z);
    const hgt = Math.max(0, y - gh);
    this.shadow.position.set(x, gh + 0.015, z);
    const sz = 0.09 + hgt * 0.02;
    this.shadow.scale.set(sz, 1, sz);
    this.shadow.material.opacity = Math.max(0, 0.75 - hgt * 0.025);
  }

  /** Bigger on-screen glow for TV / projector viewing. */
  setScale(s) { this.glowScale = s; }

  update(dt, camera) {
    if (this.spinRate) this.mesh.rotateOnWorldAxis(this.spinAxis, this.spinRate * dt);
    const d = camera.position.distanceTo(this.mesh.position);
    // fade the screen-space glow in once the ball is small on screen
    const a = THREE.MathUtils.smoothstep(d, 4, 18);
    this.glow.material.opacity = a;
    const px = THREE.MathUtils.clamp(0.012 + d * 0.00004, 0.012, 0.022) * (this.glowScale || 1);
    this.glow.scale.set(px, px, 1);
  }
}
