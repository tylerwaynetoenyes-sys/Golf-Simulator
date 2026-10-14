// Shared modelling kit for landmark builders (js/course/lm/*.js).
//
// Builder contract: `export default function build()` returns
//   { group, glow: Material[], update?(t, dt, day) }
// The group sits on y = 0 at its base. Local axes: -Z points the direction of
// play at the green (away from the tee), +X is the golfer's right, +Z back
// toward the tee. Units are metres. `glow` materials get their emissive
// uplighting faded in at night (userData.night = strength). `update` runs
// every frame for ambient motion (t seconds, day 0 = night .. 1 = day).
import * as THREE from 'three';

export const FT = 0.3048;

export function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...opts });
}
/** A material that glows warmly at night (uplit stone, lit windows). */
export function lit(color, glowColor, opts = {}) {
  const { night, ...rest } = opts;
  const m = mat(color, { emissive: glowColor, emissiveIntensity: 0.0, ...rest });
  m.userData.night = night ?? 0.55;
  return m;
}
export function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y + h / 2, z);
  o.castShadow = true; o.receiveShadow = true;
  return o;
}
export function cyl(rt, rb, h, m, x = 0, y = 0, z = 0, seg = 20) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  o.position.set(x, y + h / 2, z);
  o.castShadow = true; o.receiveShadow = true;
  return o;
}
export function sphere(r, m, x = 0, y = 0, z = 0, seg = 16) {
  const o = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)), m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}
export function dome(r, m, x = 0, y = 0, z = 0, squash = 1) {
  const o = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), m);
  o.position.set(x, y, z);
  o.scale.y = squash;
  o.castShadow = true;
  return o;
}
export function pyramid(w, h, d, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2 * Math.max(w, d), h, 4), m);
  o.rotation.y = Math.PI / 4;
  o.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
  o.position.set(x, y + h / 2, z);
  o.castShadow = true;
  return o;
}
/** Gable roof along X: width w (x), depth d (z), ridge height h. */
export function gable(w, h, d, m, x = 0, y = 0, z = 0) {
  const s = new THREE.Shape();
  s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }).translate(0, 0, -w / 2).rotateY(Math.PI / 2);
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true; o.receiveShadow = true;
  return o;
}
export function columns(n, spacing, r, h, m, x0, y, z) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) g.add(cyl(r, r * 1.08, h, m, x0 + i * spacing, y, z, 12));
  return g;
}
export function arcRib(span, rise, thick, m, steps = 40) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    pts.push(new THREE.Vector3(-span / 2 + span * u, 4 * rise * u * (1 - u), 0));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps, thick, 6, false), m);
}
export function tube(points, r, m, seg = 6) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))));
  const o = new THREE.Mesh(new THREE.TubeGeometry(c, Math.max(8, points.length * 6), r, seg, false), m);
  o.castShadow = true;
  return o;
}
/** Deterministic random in [0, 1). */
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Canvas texture helper: draw(ctx, w, h) paints it. */
export function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
/** Window grid facade: lit windows glow at night (pass the returned material in `glow`). */
export function facadeMaterial(base, { cols = 8, rows = 4, win = '#2b3440', lamp = '#ffd9a0', frame = null, seed = 1 } = {}) {
  const rnd = seeded(seed);
  const tex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const cw = w / cols, rh = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      g.fillStyle = win;
      g.fillRect(c * cw + cw * 0.22, r * rh + rh * 0.2, cw * 0.56, rh * 0.58);
      if (frame) { g.strokeStyle = frame; g.lineWidth = 2; g.strokeRect(c * cw + cw * 0.22, r * rh + rh * 0.2, cw * 0.56, rh * 0.58); }
    }
  });
  const em = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const cw = w / cols, rh = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (rnd() < 0.55) { g.fillStyle = lamp; g.fillRect(c * cw + cw * 0.22, r * rh + rh * 0.2, cw * 0.56, rh * 0.58); }
    }
  });
  const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.8 });
  m.userData.night = 1.1;
  return m;
}
/** A simple low-poly person (≈1.75 m) for crowds; color is the shirt. */
export function person(shirt, rnd = Math.random) {
  const g = new THREE.Group();
  const skin = PERSON_SKIN[Math.floor(rnd() * PERSON_SKIN.length)];
  const legs = mat(rnd() < 0.5 ? 0x2c3442 : 0x5a5348);
  g.add(box(0.32, 0.85, 0.2, legs, 0, 0, 0));
  g.add(box(0.42, 0.6, 0.24, mat(shirt), 0, 0.85, 0));
  g.add(sphere(0.12, mat(skin, { roughness: 0.6 }), 0, 1.6, 0, 10));
  return g;
}
const PERSON_SKIN = [0x8d5524, 0xc68642, 0xe0ac69, 0xf1c27d, 0x5c3a21];
