// Divots. When the club comes down into the turf (the R10's attack angle says
// it did) it cuts a strip out: the chunk flies on along the swing, tumbles and
// lands, and the scar stays where it was cut. Both are modelled in Blender
// (tools/blender/divots.py): seven turf chunks (strip, dollar, fat chunk,
// short scoop, curl, one torn in two) and four scars (a scrape, a clean cut, a
// deep gouge, a long strip), rendered with their soil, torn edges, crumbs and
// blades. Which one, how big and where comes from the strike (see divotFor).
import * as THREE from 'three';
import { loadEquipment } from './models.js';

const SCAR_L = 0.4, SCAR_W = 0.2;
// the undisturbed turf in the scar renders (sRGB), what the decals' exposure is matched against
const SCAR_REF = new THREE.Color().setRGB(25.9 / 255, 54.8 / 255, 14.4 / 255, THREE.SRGBColorSpace);
// each scar's half-length (m) as modelled
const SCAR_LH = { scrape: 0.05, clean: 0.06, deep: 0.07, long: 0.085 };
// the chunks each kind of cut can throw
const CHUNKS = { clean: ['divot_dollar', 'divot_short', 'divot_broken'], deep: ['divot_chunk', 'divot_dollar'], long: ['divot_strip', 'divot_curl'] };
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/**
 * What the club did to the turf, from the strike. Null when it never touched the ground.
 * @param s {aoa: attack angle °, clubMph, smash, smashRef (the club's typical), kind: 'iron'|'wedge'|..., lie, teed, rnd}
 * @returns {null | {cut, depth (0..1), fat (0..1), behind (m: how far behind the ball the club entered)}}
 */
export function divotFor(s) {
  const kind = s.kind;
  if (kind === 'driver' || s.lie === 'sand' || s.lie === 'green' || s.lie === 'water') return null;
  const aoa = s.aoa;
  if (aoa == null || !Number.isFinite(aoa)) return null;
  // the low point of the arc must reach the ground: off a tee only a steep blow goes through it
  const need = s.teed ? -4 : kind === 'wood' ? -2.5 : kind === 'hybrid' ? -1.8 : -1.0;
  if (aoa > need) return null;
  const speed = Math.min(1.3, Math.max(0.4, (s.clubMph || 80) / 85));
  // heavy (fat): the club met the ground first and lost speed into the ball: smash well under the club's
  const fat = s.smash && s.smashRef ? Math.min(1, Math.max(0, (s.smashRef - 0.06 - s.smash) / 0.18)) : 0;
  let depth = Math.min(1, Math.max(0, ((need - aoa) / 6) * speed + fat * 0.5 + (s.teed ? -0.25 : 0)));
  if (s.lie === 'rough') depth *= 0.7; // the grass takes some of it; more of it sprays as clippings
  const cut = depth < 0.18 ? 'scrape' : fat > 0.45 || depth > 0.78 ? 'deep' : kind === 'wedge' || (s.rnd() < 0.35 && depth < 0.5) ? 'clean' : s.rnd() < 0.5 ? 'long' : 'clean';
  // a good strike bottoms out past the ball; a fat one before it
  const behind = fat > 0.2 ? 0.03 + fat * 0.07 : -0.02 - 0.03 * depth;
  return { cut, depth, fat, behind };
}

export class Divots {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'divots';
    scene.add(this.group);
    this.flying = [];
    this.tex = null;
    this.mats = new Map();
    this.models = null;
    loadEquipment('divots.glb').then((scn) => { this.models = scn; });
  }

  _textures() {
    if (this.tex) return this.tex;
    const L = new THREE.TextureLoader();
    const load = (n, srgb) => {
      const t = L.load(new URL(`../../assets/textures/${n}.png`, import.meta.url).href);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      return t;
    };
    this.tex = {};
    for (const k of Object.keys(SCAR_LH)) this.tex[k] = { map: load(`scar_${k}`, true), nor: load(`scar_${k}_nor`, false) };
    return this.tex;
  }

  _scarMat(cut, turf) {
    // exposure: the render's turf brought to this ground's, by luminance, so the soil keeps its colour
    const k = THREE.MathUtils.clamp((0.85 * lum(turf)) / lum(SCAR_REF), 0.3, 20);
    const key = `${cut}:${k.toFixed(2)}`;
    if (this.mats.has(key)) return this.mats.get(key);
    const t = this._textures()[cut];
    const m = new THREE.MeshStandardMaterial({
      map: t.map, normalMap: t.nor, normalScale: new THREE.Vector2(1.6, 1.6), color: new THREE.Color(k, k, k), roughness: 0.95,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.mats.set(key, m);
    return m;
  }

  clear() {
    for (const c of [...this.group.children]) this.group.remove(c);
    this.flying = [];
  }

  /**
   * Cut a divot.
   * @param o {x, z: the ball; dx, dz: the swing's direction (unit); ground(x, z); turf: THREE.Color (linear) of the
   *           ground here; d: divotFor's result; clubMph; rnd; effects (for the crumbs)}
   */
  cut(o) {
    const { d, ground, rnd } = o;
    const len = Math.hypot(o.dx, o.dz) || 1, dx = o.dx / len, dz = o.dz / len;
    const yaw = Math.atan2(-dx, -dz);
    const up = new THREE.Vector3(0, 1, 0);
    // the scar: centred where the club bottomed out, a touch bigger or smaller with the depth
    const LH = SCAR_LH[d.cut];
    const ahead = LH - d.behind - 0.03;
    const sx = o.x + dx * ahead, sz = o.z + dz * ahead;
    const s = 0.9 + 0.25 * d.depth + (rnd() - 0.5) * 0.12;
    const geo = new THREE.PlaneGeometry(SCAR_W, SCAR_L).rotateX(-Math.PI / 2);
    const scar = new THREE.Mesh(geo, this._scarMat(d.cut, o.turf));
    const e = 0.15, n = new THREE.Vector3(ground(sx - e, sz) - ground(sx + e, sz), 2 * e, ground(sx, sz - e) - ground(sx, sz + e)).normalize();
    scar.quaternion.setFromUnitVectors(up, n).multiply(new THREE.Quaternion().setFromAxisAngle(up, yaw + (rnd() - 0.5) * 0.06));
    scar.scale.set(s * (0.92 + rnd() * 0.16), 1, s);
    scar.position.set(sx, ground(sx, sz) + 0.003, sz);
    scar.receiveShadow = true;
    scar.renderOrder = 3;
    this.group.add(scar);
    // the cut turf goes with the club: a chunk (or two), soil crumbs and clippings
    const fx = o.effects;
    const exitX = o.x + dx * (ahead + LH * 0.8), exitZ = o.z + dz * (ahead + LH * 0.8), ey = ground(exitX, exitZ);
    const v = Math.min(1.4, (o.clubMph || 85) / 85);
    if (fx) {
      fx.burst(exitX, ey + 0.02, exitZ, { n: Math.round(10 + 50 * d.depth), color: 0x4a3420, speed: 1.4 + 2.4 * v * d.depth, up: 1.2 + 2 * d.depth, life: 0.8, gravity: 9 });
      fx.burst(exitX, ey + 0.03, exitZ, { n: Math.round(14 + 30 * d.depth), color: 0x5d7a2e, speed: 1.6 + 2 * v, up: 1.6, life: 0.9, gravity: 6 });
    }
    if (d.cut === 'scrape' || !this.models) return;
    let names = CHUNKS[d.cut];
    let pick = names[Math.floor(rnd() * names.length)];
    const parts = pick === 'divot_broken' ? ['divot_broken_a', 'divot_broken_b'] : [pick];
    for (const [i, name] of parts.entries()) {
      const src = this.models.getObjectByName(name);
      if (!src) continue;
      const m = src.clone();
      m.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      const sc = 0.85 + 0.3 * d.depth + (rnd() - 0.5) * 0.15;
      m.scale.setScalar(sc);
      m.rotation.set(0, yaw, 0);
      m.position.set(exitX - dx * i * 0.05, ey + 0.01, exitZ - dz * i * 0.05);
      // thrown on along the swing and up off the leading edge, spinning end over end and a little sideways
      const speed = (2.5 + 5 * d.depth) * v * (0.75 + rnd() * 0.5);
      const side = (rnd() - 0.5) * 1.2;
      const vel = new THREE.Vector3(dx * speed - dz * side, (1.6 + 3.2 * d.depth) * (0.7 + rnd() * 0.6), dz * speed + dx * side);
      const spin = new THREE.Vector3(-dz, 0, dx).multiplyScalar(-(6 + rnd() * 14)).add(new THREE.Vector3(0, (rnd() - 0.5) * 6, 0));
      this.group.add(m);
      this.flying.push({ m, vel, spin, ground, bounces: 0, rest: false });
    }
    // keep the course from filling up with them
    while (this.group.children.length > 80) this.group.remove(this.group.children[0]);
  }

  update(dt) {
    if (!this.flying.length) return;
    const q = new THREE.Quaternion(), ax = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), u = new THREE.Vector3();
    for (const f of this.flying) {
      if (f.rest) continue;
      const m = f.m;
      f.vel.y -= 9.81 * dt;
      f.vel.multiplyScalar(1 - 0.6 * dt); // a turf chunk is draggy
      m.position.addScaledVector(f.vel, dt);
      const w = f.spin.length();
      if (w > 1e-3) { ax.copy(f.spin).divideScalar(w); q.setFromAxisAngle(ax, w * dt); m.quaternion.premultiply(q); }
      const g = f.ground(m.position.x, m.position.z);
      if (m.position.y <= g + 0.004 && f.vel.y < 0) {
        m.position.y = g + 0.004;
        if (f.bounces < 2 && -f.vel.y > 1.2) {
          // a dull thud: hardly bounces, skids, its spin mostly killed
          f.vel.y = -f.vel.y * 0.18; f.vel.x *= 0.45; f.vel.z *= 0.45; f.spin.multiplyScalar(0.35); f.bounces++;
        } else {
          // settle flat on whichever face came down: grass up, or soil up (about a third of them)
          u.set(0, 1, 0).applyQuaternion(m.quaternion);
          const target = u.y >= 0 ? up : up.clone().negate();
          q.setFromUnitVectors(u, target);
          m.quaternion.premultiply(q);
          // rest it on the ground whichever way up (its grass pressed in a little if it landed on it)
          m.updateMatrixWorld(true);
          const bb = new THREE.Box3().setFromObject(m);
          m.position.y += g - bb.min.y - (target.y < 0 ? 0.006 : 0.001);
          f.rest = true;
        }
      }
    }
    this.flying = this.flying.filter((f) => !f.rest);
  }
}
