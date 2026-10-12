// Camera director. Address view behind the ball (anywhere on the range or a
// course hole); on a shot it rides the impact, chases the ball up its climb,
// cuts to a broadcast-style landing camera for the descent, holds on the ball
// at rest, then glides home. Also: putting camera and hole fly-overs.
import * as THREE from 'three';
import { groundHeight as rangeGround, LAYOUT } from './layout.js';

function damp(current, target, rate, dt) {
  return current.lerp(target, 1 - Math.exp(-rate * dt));
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
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
    this.fov = 52;
    this.baseFov = 52;
    this.fovScale = 1;
    this.t = 0;
    this._v = new THREE.Vector3();
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
    const back = this.putting ? 2.4 : 3.4;
    const up = this.putting ? 1.05 : 1.5;
    const x = o.x - fx * back, z = o.z - fz * back;
    const gy = this.ground(x, z);
    this.desiredPos.set(x, Math.max(o.y + up, gy + 1.2), z);
    if (this.putting && this.lookTarget) {
      this.desiredLook.set(this.lookTarget.x, this.lookTarget.y, this.lookTarget.z);
    } else {
      const lx = o.x + fx * 60, lz = o.z + fz * 60;
      const ly = Math.max(o.y + 1.1 - 1.5, Math.min(o.y + 1.1 + 8, this.ground(lx, lz) + 1.6));
      this.desiredLook.set(lx, ly, lz);
    }
  }

  toAddress(immediate = false) {
    this.mode = 'address';
    this._addressTargets();
    this.rate = 2.4;
    this.lookRate = 3;
    this.baseFov = 52;
    if (immediate) {
      this.pos.copy(this.desiredPos);
      this.look.copy(this.desiredLook);
    }
  }

  showcase() {
    this.mode = 'showcase';
    this.t = 0;
    this.pos.set(-18, 9, -14);
    this.look.set(260, -20, -1400);
  }

  /**
   * Fly along a path of {pos, look} keys over `seconds`, then call `done`.
   * Used to introduce each course hole (green → tee).
   */
  flyover(keys, seconds, done) {
    this.mode = 'flyover';
    this.fly = { keys, seconds, t: 0, done };
    this.pos.copy(keys[0].pos);
    this.look.copy(keys[0].look);
  }

  skipFlyover() {
    if (this.mode === 'flyover' && this.fly) this.fly.t = this.fly.seconds;
  }

  /** Begin following a precomputed shot. */
  startShot(result) {
    this.mode = 'shot';
    this.result = result;
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
    } else if (lp && result.flightTime > 2.6 && this.style === 'cinematic') {
      const dirx = lp.x - o.x, dirz = lp.z - o.z;
      const len = Math.hypot(dirx, dirz) || 1;
      const fx = dirx / len, fz = dirz / len; // forward (ball -> landing)
      const rx = -fz, rz = fx; // right
      const side = result.offline > 4 ? -1 : result.offline < -4 ? 1 : (Math.random() < 0.5 ? -1 : 1);
      // Broadcast "green-side" camera: off to one side, short of the landing
      // spot, framed so the ball drops in from the top of the shot.
      const back = 30 + Math.min(18, result.carry * 0.05);
      const x = lp.x - fx * back + rx * 17 * side;
      const z = lp.z - fz * back + rz * 17 * side;
      const y = Math.max(g(x, z), lp.y - 3, -40) + 4.2;
      this.landCam = new THREE.Vector3(x, y, z);
      this.landPoint = new THREE.Vector3(lp.x, g(lp.x, lp.z), lp.z);
      this.cutAt = Math.max(1.2, result.flightTime - 1.7);
    }
  }

  ballAtRest(pos) {
    this.mode = 'rest';
    this.restPos = pos.clone();
    this.t = 0;
    this.rate = 1.6;
    this.lookRate = 4;
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
      const u = Math.min(1, f.t / f.seconds);
      const e = u * u * (3 - 2 * u);
      const n = f.keys.length - 1;
      const seg = Math.min(n - 1, Math.floor(e * n));
      const lu = e * n - seg;
      const A = f.keys[seg], Bk = f.keys[seg + 1];
      this.pos.lerpVectors(A.pos, Bk.pos, lu);
      this.look.lerpVectors(A.look, Bk.look, lu);
      this.desiredPos.copy(this.pos);
      this.desiredLook.copy(this.look);
      if (u >= 1) {
        const done = f.done;
        this.fly = null;
        this.toAddress();
        done?.();
      }
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
        this.baseFov = THREE.MathUtils.clamp(52 - d * 0.06, 30, 52);
      } else if (this.landCam && playT >= this.cutAt) {
        // Keep the landing area in frame while the ball is still high, then
        // settle onto the ball as it comes down.
        const air = Math.max(0, b.y - g(b.x, b.z));
        const k = THREE.MathUtils.clamp(air / 40, 0, 0.5);
        const target = this._v.copy(b).lerp(this.landPoint, k);
        if (!this.cut) {
          this.cut = true;
          this.pos.copy(this.landCam);
          this.look.copy(target);
          this.fov = this.baseFov = 42;
        }
        this.desiredPos.copy(this.landCam);
        this.desiredLook.copy(target);
        this.lookRate = 6;
      } else {
        // chase: behind and above the ball, looking a little ahead of it
        const hx = b.x - o.x, hz = b.z - o.z;
        const len = Math.hypot(hx, hz);
        const a = ((this.heading + this.aimDeg) * Math.PI) / 180;
        let fx = Math.sin(a), fz = -Math.cos(a);
        if (len > 2) { fx = hx / len; fz = hz / len; }
        const height = Math.max(0, b.y - g(b.x, b.z));
        const back = 9 + Math.min(14, playT * 3.2);
        const ramp = Math.min(1, playT / 0.9);
        const tgt = this._v.set(b.x - fx * back, b.y + 2.6 + height * 0.08, b.z - fz * back);
        tgt.lerpVectors(this.desiredPos.clone(), tgt, ramp * ramp);
        const gy = g(tgt.x, tgt.z) + 1.2;
        if (tgt.y < gy) tgt.y = gy;
        this.desiredPos.copy(tgt);
        this.desiredLook.set(b.x + fx * 6, b.y + 0.4, b.z + fz * 6);
        this.rate = playT < 0.5 ? 2 : 5;
        this.lookRate = 12;
        this.baseFov = 52 - Math.min(8, playT * 2);
      }
    } else if (this.mode === 'rest') {
      const p = this.restPos;
      if (this.overlook) {
        this.desiredPos.copy(this.overlook);
      } else if (this.result?.putt) {
        // hold
      } else if (this.style !== 'tee') {
        const off = this._dir.subVectors(this.pos, p).setY(0);
        const dist = THREE.MathUtils.clamp(off.length(), 8, 30);
        const a0 = Math.atan2(off.z, off.x) + 0.16 * dt;
        const x = p.x + Math.cos(a0) * dist, z = p.z + Math.sin(a0) * dist;
        this.desiredPos.set(x, Math.max(g(x, z), p.y - 2, -50) + 3.5, z);
      }
      this.desiredLook.copy(p);
    }

    if (this.mode !== 'flyover') {
      damp(this.pos, this.desiredPos, this.rate, dt);
      damp(this.look, this.desiredLook, this.lookRate, dt);
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
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
