// Camera director. Address view behind the ball (anywhere on the range or a
// course hole); on a shot it rides the impact, chases the ball up its climb,
// cuts to a broadcast-style landing camera for the descent, holds on the ball
// at rest, then glides home. Also: putting camera and hole fly-overs.
import * as THREE from 'three';
import { groundHeight as rangeGround, LAYOUT } from './layout.js';

function damp(current, target, rate, dt) {
  return current.lerp(target, 1 - Math.exp(-rate * dt));
}

/**
 * A critically damped spring (Unity's SmoothDamp): unlike exponential damping
 * it eases in as well as out, so a camera starting a move never jerks. `vel`
 * is the spring's state; `rate` keeps the old meaning (higher = tighter).
 */
function spring(current, target, vel, rate, dt) {
  const st = Math.max(0.05, 1.35 / Math.max(0.1, rate));
  const omega = 2 / st, x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  for (const k of ['x', 'y', 'z']) {
    const change = current[k] - target[k];
    const temp = (vel[k] + omega * change) * dt;
    vel[k] = (vel[k] - omega * temp) * exp;
    current[k] = target[k] + (change + temp) * exp;
  }
  return current;
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this._pv = new THREE.Vector3(); this._lv = new THREE.Vector3(); // spring velocities (position, look)
    this.snapshot = null; // set by the world: snapshot(cb) cross-dissolves the next cut (js/scene/renderer.js)
    this._pendingCut = null;
    this.origin = new THREE.Vector3(0, 0.1, 0);
    this.heading = 0; // target-line direction, degrees (0 = -Z)
    this.aimDeg = 0;
    this.ground = rangeGround;
    this.putting = false;
    this.pos = new THREE.Vector3(0, 1.5, 3.4);
    this.look = new THREE.Vector3(0, 1.1, -60);
    this.desiredPos = this.pos.clone();
    this.desiredLook = this.look.clone();
    this.rate = 4;
    this.lookRate = 6;
    this.mode = 'address'; // address | showcase | shot | rest | flyover
    this.style = 'cinematic';
    this.shake = 0;
    this.fov = 44;
    this.baseFov = 44;
    this.fovScale = 1;
    this.t = 0;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    camera.position.copy(this.pos);
    camera.lookAt(this.look);
  }

  setStyle(s) { this.style = s; }
  setGround(fn) { this.ground = fn || rangeGround; }

  /** Where the ball sits and which way the hole plays. */
  setAddress(origin, headingDeg = 0, { putting = false, lookAt = null } = {}) {
    this.origin.copy(origin);
    this.heading = headingDeg;
    this.putting = putting;
    this.lookTarget = lookAt ? lookAt.clone() : null;
    if (this.mode === 'address') this._addressTargets();
  }

  setAim(deg) {
    this.aimDeg = deg;
    if (this.mode === 'address') this._addressTargets();
  }

  _addressTargets() {
    const a = ((this.heading + this.aimDeg) * Math.PI) / 180;
    const fx = Math.sin(a), fz = -Math.cos(a);
    const o = this.origin;
    if (this.putting) {
      // standing behind the ball, at a golfer's eye height, reading the line
      const x = o.x - fx * 2.4, z = o.z - fz * 2.4;
      this.desiredPos.set(x, Math.max(o.y + 1.05, this.ground(x, z) + 1.2), z);
      if (this.lookTarget) this.desiredLook.set(this.lookTarget.x, this.lookTarget.y, this.lookTarget.z);
      else this.desiredLook.set(o.x + fx * 20, o.y, o.z + fz * 20);
      return;
    }
    // a little behind and to the side of the ball (off the clubhead, which sits behind it), low enough to
    // see it on its tee or in its lie, and pitched so the ball sits in the lower third: clear of the
    // prompts below it, the hole opening up above
    // with the golfer standing to it, from further back on a longer lens (the broadcast "down the line" view):
    // him on the left, the ball clear in front of the clubface, the hole opening up beyond
    const g = this.withGolfer;
    const back = g ? 6.2 : 2.5, side = g ? 1.05 : 0.62, up = g ? 1.55 : 1.3;
    this.addressFov = g ? 30 : 44;
    const rx = -fz, rz = fx; // to the right of the line
    const x = o.x - fx * back + rx * side, z = o.z - fz * back + rz * side;
    const cy = Math.max(o.y + up, this.ground(x, z) + 0.9);
    this.desiredPos.set(x, cy, z);
    const dist = Math.hypot(o.x - x, o.z - z);
    const below = Math.atan2(cy - o.y, dist);                         // the ball's angle below level
    const half = THREE.MathUtils.degToRad((this.addressFov || 44) / 2);
    const pitch = below - Math.atan(0.42 * Math.tan(half));            // ball 0.42 of the half-frame below centre
    // turn halfway between the ball and the line ahead: the ball just left of centre, the hole opening up right
    const L = 60;
    const ya = Math.atan2(o.x - x, o.z - z), yb = Math.atan2(o.x + fx * L - x, o.z + fz * L - z);
    let dy = yb - ya; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const yaw = ya + dy * 0.55;
    const lx = x + Math.sin(yaw) * L, lz = z + Math.cos(yaw) * L;
    this.desiredLook.set(lx, cy - Math.tan(pitch) * L, lz);
  }

  toAddress(immediate = false) {
    this.mode = 'address';
    this._addressTargets();
    this.rate = 2.4;
    this.lookRate = 3;
    this.baseFov = this.addressFov || 44;
    if (immediate) {
      this.pos.copy(this.desiredPos);
      this.look.copy(this.desiredLook);
      this._pv.set(0, 0, 0); this._lv.set(0, 0, 0);
    } else if (this.pos.distanceTo(this.desiredPos) > 30) {
      // a long way back to the ball: dissolve there rather than swoop
      const p = this.desiredPos.clone(), l = this.desiredLook.clone();
      this._cutTo(() => { this.pos.copy(p); this.look.copy(l); });
    }
  }

  showcase() {
    this.mode = 'showcase';
    this.t = 0;
    this.pos.set(-18, 9, -14);
    this.look.set(260, -20, -1400);
  }

  /** The address view for the current ball and aim, without moving there. */
  addressPose() {
    const p = this.desiredPos.clone(), l = this.desiredLook.clone();
    this._addressTargets();
    const out = { pos: this.desiredPos.clone(), look: this.desiredLook.clone() };
    this.desiredPos.copy(p);
    this.desiredLook.copy(l);
    return out;
  }

  /**
   * Fly a smooth spline through {pos, look} keys over `seconds`, then call
   * `done`. Keys are evenly spaced in time (an orbit keyed by angle turns at
   * an even rate); the pace eases up over `easeIn` s, holds, and eases off
   * over `easeOut` s. With `toAddress` the flight hands over to the address
   * view when it ends.
   * `occludeAfter` (0..1): from that point on, trees between the camera and
   * what it looks at fade out (js/scene/occlusion.js).
   */
  flyover(keys, seconds, done, { easeIn = seconds * 0.3, easeOut = seconds * 0.3, fov = 44, toAddress = true, occludeAfter = 2 } = {}) {
    this.mode = 'flyover';
    const pc = new THREE.CatmullRomCurve3(keys.map((k) => k.pos), false, 'centripetal');
    const lc = new THREE.CatmullRomCurve3(keys.map((k) => k.look), false, 'centripetal');
    const a = Math.min(easeIn, seconds * 0.5), b = Math.min(easeOut, seconds * 0.5);
    this.fly = { pc, lc, seconds, t: 0, done, a, b, vmax: 1 / (seconds - a / 2 - b / 2), toAddress, occludeAfter, fov };
    this.flyOcclude = false;
    this.baseFov = fov;
    this.pos.copy(keys[0].pos);
    this.look.copy(keys[0].look);
  }

  skipFlyover() {
    if (this.mode === 'flyover' && this.fly) { this.fly.t = this.fly.seconds; this.fly.skipped = true; }
  }

  /** Share of the path covered after t s on a trapezoid speed profile. */
  _flyS(f) {
    const { a, b, seconds: T, vmax: v } = f;
    const t = Math.min(f.t, T);
    let s;
    if (t < a) s = v * t * t / (2 * a);
    else if (t <= T - b) s = v * (a / 2 + (t - a));
    else { const r = T - t; s = 1 - v * r * r / (2 * b); }
    return Math.min(1, Math.max(0, s));
  }

  /** Begin following a precomputed shot. */
  startShot(result, { cupCam = true } = {}) {
    this.mode = 'shot';
    this.result = result;
    this.cupShot = null;
    this.holeRest = null;
    this.shortShot = false;
    this.restPoint = null;
    if (result.holedAt && cupCam) this._planCupCam(result);
    this.shake = result.putt ? 0 : 0.06 + Math.min(0.08, result.carry / 3000);
    this.cut = false;
    this.landCam = null;
    this.overlook = null;
    this.rate = 3;
    this.lookRate = 9;
    const g = this.ground;
    const o = result.origin || { x: 0, z: 0 };
    if (result.putt) return;
    const lp = result.landing || result.carryPoint || result.rest;
    this.treeCam = null;
    const tree = result.events?.find((e) => e.type === 'tree');
    if (tree && tree.t > 0.5 && this.style !== 'tee') { this._planTreeCam(result, tree); return; }
    const wet = result.lost && result.events.some((e) => e.surface === 'water');
    if (wet && this.style !== 'tee') {
      const sp = result.events.find((e) => e.type === 'splash') || lp;
      const side = result.offline >= 0 ? -1 : 1;
      if (sp.y < LAYOUT.riverY + 5) {
        // off the bluff: hover just past the edge, looking down at the river
        this.landCam = new THREE.Vector3(sp.x + 30 * side, 14, LAYOUT.plateauEnd - 6);
      } else {
        // a course pond: stand on the bank, short and to one side
        const dx = sp.x - o.x, dz = sp.z - o.z;
        const len = Math.hypot(dx, dz) || 1;
        const x = sp.x - (dx / len) * 34 + (-dz / len) * 20 * side;
        const z = sp.z - (dz / len) * 34 + (dx / len) * 20 * side;
        this.landCam = new THREE.Vector3(x, Math.max(g(x, z), sp.y) + 7, z);
      }
      this.landPoint = new THREE.Vector3(sp.x, sp.y, sp.z);
      this.overlook = this.landCam;
      this.cutAt = Math.max(1.2, (result.landing ? result.landing.t : result.duration) - 2.6);
    } else if (lp && result.total < 45 && this.style !== 'tee') {
      // chips and pitches: stay put behind the ball and pan with it, the way
      // you'd watch a short shot yourself; the lens tightens as it runs out
      this.shortShot = true;
    } else if (lp && result.flightTime > 2.2 && this.style === 'cinematic') {
      this._planLandingCam(result, lp);
    }
  }

  /**
   * Into the trees: cut to a camera off to the side of the strike, at canopy
   * height and clear of other trees, a beat before contact, so the hit reads;
   * then follow the ball down out of the branches.
   */
  _planTreeCam(result, e) {
    const g = this.ground;
    const o = result.origin || { x: 0, z: 0 };
    let fx = e.x - o.x, fz = e.z - o.z;
    const len = Math.hypot(fx, fz) || 1;
    fx /= len; fz /= len;
    const rx = -fz, rz = fx;
    let best = null;
    for (const side of [-1, 1]) for (const d of [16, 22, 12]) {
      const back = d * 0.45;
      const cam = new THREE.Vector3(e.x - fx * back + rx * d * side, 0, e.z - fz * back + rz * d * side);
      // standing on the ground at eye level, looking up at the strike
      cam.y = g(cam.x, cam.z) + 1.7;
      const underTree = this.obstacle && this.obstacle(cam.x, cam.z) > cam.y - 2;
      const cost = (this._blocked(cam, e.x, e.y, e.z, 2.5, false) ? 100 : 0) + (underTree ? 10 : 0) + (d !== 16 ? 1 : 0);
      if (!best || cost < best.cost) best = { cam, cost };
    }
    this.treeCam = { pos: best.cam, point: new THREE.Vector3(e.x, e.y, e.z), at: Math.max(0.35, e.t - 0.9), t: e.t, cut: false };
  }

  /** Does a tree canopy (or the ground) sit between `from` and the point? Ignores the last `skip` metres. */
  _blocked(from, tx, ty, tz, skip = 1.5, trees = true) {
    const g = this.ground;
    const dx = tx - from.x, dy = ty - from.y, dz = tz - from.z;
    const L = Math.hypot(dx, dy, dz);
    if (L < skip + 1) return false;
    const n = Math.min(24, Math.ceil(L / 2.5));
    for (let i = 1; i < n; i++) {
      const u = i / n;
      if (L * (1 - u) < skip) break;
      const x = from.x + dx * u, y = from.y + dy * u, z = from.z + dz * u;
      if (y < g(x, z) + 0.2) return true;
      if (trees && this.canopy && this.canopy(x, y, z)) return true;
    }
    return false;
  }

  /**
   * Broadcast landing camera: off to one side of the landing area, far enough
   * back to frame both where the ball comes down and where it stops, and
   * raised until nothing (ground or trees) blocks either.
   */
  _planLandingCam(result, lp) {
    const g = this.ground;
    const o = result.origin || { x: 0, z: 0 };
    const rest = result.rest;
    let fx = lp.x - o.x, fz = lp.z - o.z;
    const len = Math.hypot(fx, fz) || 1;
    fx /= len; fz /= len;
    const rx = -fz, rz = fx;
    const mx = (lp.x + rest.x) / 2, mz = (lp.z + rest.z) / 2;
    const span = Math.hypot(rest.x - lp.x, rest.z - lp.z);
    const back = Math.max(26, 18 + span * 0.9 + result.carry * 0.04);
    const lateral = 14 + span * 0.25;
    const lpY = g(lp.x, lp.z), rY = g(rest.x, rest.z);
    // Try both sides (and a closer, straighter option); keep the one that
    // needs the least lifting to see both spots and isn't next to a mast.
    const candidates = [];
    // canopy in the view: sample the sight lines to the landing and rest
    // points at a few heights; a spotter stands where the view is open
    const leafy = (cam) => {
      if (!this.canopy) return 0;
      let n = 0;
      for (const [tx, ty, tz] of [[lp.x, lpY + 1, lp.z], [rest.x, rY + 1, rest.z], [mx, (lpY + rY) / 2 + 6, mz]]) {
        for (let i = 1; i <= 10; i++) {
          const u = i / 12;
          for (const dy of [0, 2.5]) if (this.canopy(cam.x + (tx - cam.x) * u, cam.y + dy + (ty - cam.y) * u, cam.z + (tz - cam.z) * u)) n++;
        }
      }
      return n;
    };
    for (const side of [-1, 1]) for (const [bk, lt] of [[back, lateral], [back * 0.8, lateral * 0.5], [back * 1.1, 2]]) {
      const cam = new THREE.Vector3(mx - fx * bk + rx * lt * side, 0, mz - fz * bk + rz * lt * side);
      // a spotter standing beside the landing area, at eye level
      cam.y = g(cam.x, cam.z) + 1.7;
      const base = cam.y;
      const blocked = (tx, ty, tz) => {
        for (let i = 1; i < 14; i++) {
          const u = i / 14;
          const px = cam.x + (tx - cam.x) * u, pz = cam.z + (tz - cam.z) * u;
          const py = cam.y + (ty - cam.y) * u;
          const top = g(px, pz) + 0.6; // trees fade out of the way (occlusion.js); only ground blocks
          if (top > py) return true;
        }
        return false;
      };
      let k = 0;
      // over a crest, step up onto it a little (never more than ~6 m)
      for (; k < 3 && (blocked(lp.x, lpY + 0.3, lp.z) || blocked(rest.x, rY + 0.3, rest.z)); k++) cam.y += 2;
      const underTree = this.obstacle && this.obstacle(cam.x, cam.z) > cam.y - 2;
      const mast = this.nearPole ? this.nearPole(cam.x, cam.z, 5) : false;
      // prefer the side the ball didn't curve toward (usually the open fairway)
      const preferred = (result.offline > 6 && side < 0) || (result.offline < -6 && side > 0) ? 0 : 0.5;
      const leaf = leafy(cam);
      candidates.push({ cam, leaf, cost: (cam.y - base) * 2 + (mast ? 40 : 0) + (underTree ? 12 : 0) + leaf * 3 + preferred + (bk < back ? 1 : 0) });
    }
    candidates.sort((a, b) => a.cost - b.cost);
    // into the woods: nowhere down there has a clear view, so stay with the
    // golfer's eye from the tee and watch it go
    if (candidates[0].leaf > 4) return;
    const cam = candidates[0].cam;
    this.landCam = cam;
    this.landPoint = new THREE.Vector3(lp.x, lpY, lp.z);
    this.restPoint = new THREE.Vector3(rest.x, rY, rest.z);
    const dist = cam.distanceTo(this.landPoint);
    this.landFov = THREE.MathUtils.clamp(40 - dist * 0.08, 26, 38);
    // cut ~1.8 s before it lands: enough time to see it drop in
    this.cutAt = Math.max(1.0, (result.landing ? result.landing.t : result.flightTime) - 1.8);
  }

  /**
   * The payoff: a few frames before the ball reaches the hole, cut to a camera
   * at cup level on the far side, looking back down the line, and push in as
   * it drops.
   */
  _planCupCam(r) {
    const h = r.holedAt;
    const cy = this.ground(h.x, h.z);
    // incoming direction from the path just before the drop
    let px = r.origin?.x ?? 0, pz = r.origin?.z ?? 0;
    for (const sm of r.samples) { if (sm.t > h.t - 0.12) break; px = sm.x; pz = sm.z; }
    let dx = h.x - px, dz = h.z - pz;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) { const a = (this.heading * Math.PI) / 180; dx = Math.sin(a); dz = -Math.cos(a); } else { dx /= len; dz /= len; }
    const lead = r.putt ? Math.min(1.25, Math.max(0.35, h.t * 0.55)) : h.dunk ? 0.7 : 1.0;
    const side = Math.random() < 0.5 ? -1 : 1;
    const ang = side * 0.55; // ~32° off the line
    const ox = dx * Math.cos(ang) - dz * Math.sin(ang), oz = dx * Math.sin(ang) + dz * Math.cos(ang);
    this.cupShot = { cup: new THREE.Vector3(h.x, cy, h.z), dx, dz, ox, oz, at: h.t, lead, cut: false };
  }

  ballAtRest(pos) {
    this.mode = 'rest';
    this.restPos = pos.clone();
    this.t = 0;
    this.rate = 1.6;
    this.lookRate = 4;
  }

  /**
   * Change to a new camera without a hard cut: the last frame is held over the
   * new view and dissolves away (half a second). Until the snapshot is taken the
   * camera holds still, so nothing moves under the held frame.
   */
  _cutTo(apply) {
    const done = () => { this._pendingCut = null; apply(); this._pv.set(0, 0, 0); this._lv.set(0, 0, 0); };
    if (!this.snapshot) { done(); return; }
    this._pendingCut = apply;
    this.snapshot(done);
  }

  update(dt, ball, playT) {
    this.t += dt;
    const b = ball;
    const g = this.ground;
    const o = this.origin;
    if (this.mode === 'showcase') {
      const s = this.t * 0.035;
      this.desiredPos.set(-18 + Math.sin(s) * 14, 9 + Math.sin(s * 0.7) * 2, -14 - Math.sin(s * 0.5) * 10);
      this.desiredLook.set(260 + Math.sin(s * 0.8) * 160, -20, -1400);
      this.rate = 0.8;
      this.lookRate = 0.8;
    } else if (this.mode === 'flyover' && this.fly) {
      const f = this.fly;
      f.t += dt;
      const s = this._flyS(f);
      f.pc.getPoint(s, this.pos);
      f.lc.getPoint(s, this.look);
      // never under the ground, whatever the spline does between keys
      this.pos.y = Math.max(this.pos.y, g(this.pos.x, this.pos.z) + 1.2);
      this.desiredPos.copy(this.pos);
      this.desiredLook.copy(this.look);
      this.flyOcclude = s >= f.occludeAfter;
      // settle the lens back to the address view's as the flight lands there
      if (f.toAddress) this.baseFov = THREE.MathUtils.lerp(f.fov, this.addressFov || 44, THREE.MathUtils.smoothstep(s, 0.75, 1));
      if (f.t >= f.seconds) {
        const done = f.done;
        this.fly = null;
        this.flyOcclude = false;
        // a skip cuts straight to the ball
        if (f.toAddress || f.skipped) this.toAddress(!!f.skipped);
        done?.(f.skipped);
      }
    } else if (this.mode === 'shot' && this.result && this.cupShot && playT >= this.cupShot.at - this.cupShot.lead) {
      const c = this.cupShot;
      const u = THREE.MathUtils.clamp((playT - (c.at - c.lead)) / (c.lead + 0.55), 0, 1);
      const e = u * u * (3 - 2 * u);
      // low and level as the ball rolls up, then rise to look down into the cup as it drops
      const dist = THREE.MathUtils.lerp(0.95, 0.36, e);
      const hgt = THREE.MathUtils.lerp(0.16, 0.36, e * e);
      const x = c.cup.x + c.ox * dist, z = c.cup.z + c.oz * dist;
      this.desiredPos.set(x, Math.max(c.cup.y + hgt, g(x, z) + 0.06), z);
      const back = THREE.MathUtils.lerp(0.32, 0.02, e);
      this.desiredLook.set(c.cup.x - c.dx * back, c.cup.y + THREE.MathUtils.lerp(0.015, -0.07, e), c.cup.z - c.dz * back);
      if (!c.cut) {
        c.cut = true;
        const p = this.desiredPos.clone(), l = this.desiredLook.clone();
        this._cutTo(() => { this.pos.copy(p); this.look.copy(l); this.fov = 40; this.shake = 0; });
      }
      this.baseFov = THREE.MathUtils.lerp(40, 27, e);
      this.rate = 7;
      this.lookRate = 9;
    } else if (this.mode === 'shot' && this.result) {
      const r = this.result;
      if (r.putt) {
        // putting: stay low behind the ball, track it to the hole
        // putting: stay low behind the ball and track it, but stop short of
        // the cup so the finish (and the flagstick) stays framed
        const a = ((this.heading + this.aimDeg) * Math.PI) / 180;
        const fx = Math.sin(a), fz = -Math.cos(a);
        const back = 3.4;
        const tgt = this._v.set(b.x - fx * back, 0, b.z - fz * back);
        const cup = this.lookTarget;
        const nearCup = cup && Math.hypot(tgt.x - cup.x, tgt.z - cup.z) < 3.6;
        if (!nearCup) {
          tgt.y = Math.max(b.y + 1.15, g(tgt.x, tgt.z) + 0.8);
          this.desiredPos.copy(tgt);
        }
        this.desiredLook.set(b.x + fx * 1.2, b.y, b.z + fz * 1.2);
        this.rate = 1.8;
        this.lookRate = 5;
      } else if (this.style === 'tee') {
        this.desiredPos.copy(this.pos);
        this.desiredLook.copy(b);
        this.lookRate = 8;
        const d = Math.hypot(b.x - o.x, b.z - o.z);
        this.baseFov = THREE.MathUtils.clamp(44 - d * 0.06, 26, 44);
      } else if (this.shortShot) {
        // hold position, pan with the ball, tighten the lens as it runs out
        const d = Math.hypot(b.x - o.x, b.z - o.z);
        this.desiredPos.copy(this.pos);
        this.desiredPos.y += (Math.max(this.pos.y, o.y + 2.2) - this.pos.y) * 0.02;
        this.desiredLook.set(b.x, b.y + 0.1, b.z);
        this.baseFov = THREE.MathUtils.clamp(42 - d * 0.35, 26, 42);
        this.rate = 1.5;
        this.lookRate = 7;
      } else if (this.treeCam && playT >= this.treeCam.at) {
        const tc = this.treeCam;
        if (!tc.cut) {
          tc.cut = true;
          this._cutTo(() => { this.pos.copy(tc.pos); this.look.copy(tc.point); this.fov = this.baseFov = 36; this.shake = 0; });
        }
        // hold on the strike, then follow the ball out of the branches
        const after = playT - tc.t;
        this.desiredPos.copy(tc.pos);
        if (after < 0) this.desiredLook.lerpVectors(tc.point, b, 0.35);
        else this.desiredLook.copy(b);
        this.baseFov = after < 0 ? 36 : THREE.MathUtils.clamp(36 + after * 4, 36, 46);
        this.rate = 2;
        this.lookRate = after < 0 ? 5 : 8;
      } else if (this.landCam && playT >= this.cutAt) {
        // Landing camera: frame the drop zone while the ball is high, follow
        // it down, then lead toward where it will stop.
        // aim at the landing zone, pulled up toward the ball while it's high:
        // the ball drops into a frame that already shows where it will land
        const air = Math.max(0, b.y - g(b.x, b.z));
        const landed = this.result.landing && playT >= this.result.landing.t;
        const target = this._v.copy(this.landPoint);
        if (!landed) {
          // hold on the landing spot (lifted a little so the ball drops into frame)
          target.lerp(b, 0.08);
          target.y = this.landPoint.y + Math.min(6, air * 0.22);
        } else {
          // on the ground: follow the ball, leading toward where it will stop
          target.copy(b);
          if (this.restPoint) target.lerp(this.restPoint, THREE.MathUtils.clamp((playT - this.result.landing.t) / 1.5, 0, 0.35));
        }
        if (!this.cut) {
          this.cut = true;
          const l = target.clone();
          this._cutTo(() => { this.pos.copy(this.landCam); this.look.copy(l); this.fov = this.baseFov = this.landFov || 34; this.shake = 0; });
        }
        this.desiredPos.copy(this.landCam);
        this.desiredLook.copy(target);
        this.rate = 2;
        this.lookRate = 6;
      } else if (this.style === 'cinematic') {
        // the golfer's view: stay where you stood, at eye level, and turn to
        // follow the ball; the lens tightens as it flies away
        const d = Math.hypot(b.x - o.x, b.z - o.z);
        this.desiredPos.copy(this.pos);
        this.desiredLook.lerpVectors(this.look, b, playT < 0.35 ? 0.25 : 1);
        this.lookRate = playT < 0.35 ? 6 : 5;
        this.baseFov = THREE.MathUtils.clamp(44 - d * 0.07, 22, 44);
      } else {
        // chase: behind and above the ball, looking a little ahead of it
        const hx = b.x - o.x, hz = b.z - o.z;
        const len = Math.hypot(hx, hz);
        const a = ((this.heading + this.aimDeg) * Math.PI) / 180;
        let fx = Math.sin(a), fz = -Math.cos(a);
        if (len > 2) { fx = hx / len; fz = hz / len; }
        const height = Math.max(0, b.y - g(b.x, b.z));
        const back = 9 + Math.min(14, Math.max(0, playT - 0.4) * 3.2);
        const ramp = Math.min(1, Math.max(0, playT - 0.45) / 0.9);
        const tgt = this._v.set(b.x - fx * back, b.y + 2.6 + height * 0.08, b.z - fz * back);
        tgt.lerpVectors(this.desiredPos.clone(), tgt, ramp * ramp);
        const gy = g(tgt.x, tgt.z) + 1.2;
        if (tgt.y < gy) tgt.y = gy;
        this.desiredPos.copy(tgt);
        this.desiredLook.set(b.x + fx * 6, b.y + 0.4, b.z + fz * 6);
        this.rate = playT < 0.5 ? 2 : 5;
        this.lookRate = 7;
        this.baseFov = 44 - Math.min(8, playT * 2);
      }
    } else if (this.mode === 'rest') {
      const p = this.restPos;
      if (this.result?.holed && this.cupShot) {
        // holed: rise slowly away from the cup, keeping it in frame
        const c = this.cupShot;
        const k = Math.min(1, this.t / 2.6);
        const e = k * k * (3 - 2 * k);
        // swing up over the cup so the ball is visible sitting on the bottom
        // (a 4-inch-deep hole needs a steep angle to see into), then rise
        // The ball usually finishes against the wall nearest this camera, so
        // arc up over the top of the hole to the side it came in from.
        const ix = -c.dx * Math.cos(0.4) + c.dz * Math.sin(0.4), iz = -c.dz * Math.cos(0.4) - c.dx * Math.sin(0.4);
        const hx = c.ox * 0.36 * (1 - e) + ix * 1.05 * e, hz = c.oz * 0.36 * (1 - e) + iz * 1.05 * e;
        const x = c.cup.x + hx, z = c.cup.z + hz;
        this.desiredPos.set(x, Math.max(c.cup.y + 0.4 + Math.sin(e * Math.PI * 0.5) * 1.3, g(x, z) + 0.06), z);
        this.baseFov = THREE.MathUtils.lerp(30, 42, e);
        this.rate = 3.2;
        this.lookRate = 5;
        this.desiredLook.set(c.cup.x, c.cup.y - 0.06 * (1 - e), c.cup.z);
        p.copy(c.cup);
      } else if (this.overlook) {
        this.desiredPos.copy(this.overlook);
      } else if (this.result?.putt) {
        // hold
      } else if (this.style !== 'tee') {
        const off = this._dir.subVectors(this.pos, p).setY(0);
        const dist = THREE.MathUtils.clamp(off.length(), 8, 30);
        const a0 = Math.atan2(off.z, off.x) + 0.16 * dt;
        const x = p.x + Math.cos(a0) * dist, z = p.z + Math.sin(a0) * dist;
        this.desiredPos.set(x, Math.max(g(x, z), p.y - 2, -50) + 1.7, z);
      }
      this.desiredLook.copy(p);
    }

    // keep the ball in sight: if a canopy or a ridge sits between the camera
    // and the ball, rise (and if that's not enough, close in) until it's clear
    const cupClose = this.mode === 'shot' && this.cupShot && playT >= this.cupShot.at - this.cupShot.lead;
    if (b && (this.mode === 'shot' || this.mode === 'rest') && !cupClose && !(this.result?.putt) && !this.result?.holed) {
      const target = this.mode === 'rest' ? this.restPos : b;
      let tries = 0;
      // trees fade out of the way (occlusion.js); a ridge in between makes
      // the camera step up a little and then close in, staying near eye level
      while (target && tries < 6 && this._blocked(this.desiredPos, target.x, target.y + 0.15, target.z, 1.5, false)) {
        if (tries < 2) this.desiredPos.y += 1.5;
        else this.desiredPos.lerp(this._v2.set(target.x, this.desiredPos.y, target.z), 0.2);
        tries++;
      }
      if (tries) this.rate = Math.max(this.rate, 3);
    }

    if (this.mode !== 'flyover') {
      // the camera never climbs over trees any more: anything between it
      // and the ball fades out instead (js/scene/occlusion.js)
      if (!this._pendingCut) {
        spring(this.pos, this.desiredPos, this._pv, this.rate, dt);
        spring(this.look, this.desiredLook, this._lv, this.lookRate, dt);
      }
    }
    const want = this.baseFov * this.fovScale;
    this.fov += (want - this.fov) * (1 - Math.exp(-3 * dt));

    this.camera.position.copy(this.pos);
    if (this.shake > 0.0005) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-dt * 9);
    }
    // gentle handheld breathing at address
    if (this.mode === 'address') {
      this.camera.position.y += Math.sin(performance.now() * 0.0007) * 0.012;
      this.camera.position.x += Math.sin(performance.now() * 0.00045) * 0.01;
    }
    this.camera.lookAt(this.look);
    // Near plane: tiny only for the cup close-up (the camera sits centimetres
    // from the turf); everywhere else a 25 cm near plane gives the depth
    // buffer ~5x the precision, which keeps distant surfaces from z-fighting.
    const close = (this.mode === 'shot' && this.cupShot && playT >= this.cupShot.at - this.cupShot.lead)
      || (this.mode === 'rest' && this.result?.holed && this.cupShot);
    const near = close ? 0.03 : 0.25;
    if (Math.abs(this.camera.fov - this.fov) > 0.01 || this.camera.near !== near) {
      this.camera.fov = this.fov;
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
  }
}
