// Camera director. Address view behind the ball; on a shot it rides the
// impact, chases the ball up its climb, cuts to a broadcast-style landing
// camera for the descent, holds on the ball at rest, then glides home.
import * as THREE from 'three';
import { groundHeight, LAYOUT } from './layout.js';

const ADDRESS_POS = new THREE.Vector3(0.0, 1.5, 3.4);
const ADDRESS_LOOK = new THREE.Vector3(0, 1.1, -60);

function damp(current, target, rate, dt) {
  return current.lerp(target, 1 - Math.exp(-rate * dt));
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.pos = ADDRESS_POS.clone();
    this.look = ADDRESS_LOOK.clone();
    this.desiredPos = ADDRESS_POS.clone();
    this.desiredLook = ADDRESS_LOOK.clone();
    this.rate = 4;
    this.lookRate = 6;
    this.mode = 'address'; // address | showcase | shot | rest | return
    this.style = 'cinematic';
    this.shake = 0;
    this.fov = 52;
    this.baseFov = 52;
    this.t = 0;
    this.aimDeg = 0;
    this._v = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    camera.position.copy(this.pos);
    camera.lookAt(this.look);
  }

  setStyle(s) { this.style = s; }

  setAim(deg) {
    this.aimDeg = deg;
    if (this.mode === 'address') this._addressTargets();
  }

  _addressTargets() {
    const a = (this.aimDeg * Math.PI) / 180;
    this.desiredPos.set(ADDRESS_POS.x - Math.sin(a) * 3.4, ADDRESS_POS.y, Math.cos(a) * 3.4);
    this.desiredLook.set(Math.sin(a) * 60, ADDRESS_LOOK.y, -Math.cos(a) * 60);
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

  /** Begin following a precomputed shot. */
  startShot(result) {
    this.mode = 'shot';
    this.result = result;
    this.shake = 0.06 + Math.min(0.08, result.carry / 3000);
    this.cut = false;
    this.landCam = null;
    this.rate = 3;
    this.lookRate = 9;
    // landing camera placement (decided up front so it can be framed nicely)
    const lp = result.landing || result.carryPoint || result.rest;
    this.overlook = null;
    const wet = result.lost && result.events.some((e) => e.surface === 'water');
    if (wet && this.style !== 'tee') {
      // Bluff-top camera looking down at the river.
      const side = result.offline >= 0 ? -1 : 1;
      const sp = result.events.find((e) => e.type === 'splash') || lp;
      this.landCam = new THREE.Vector3(sp.x + 30 * side, 14, LAYOUT.plateauEnd - 6); // hovering just past the edge
      this.landPoint = new THREE.Vector3(sp.x, LAYOUT.riverY, sp.z);
      this.overlook = this.landCam;
      this.cutAt = Math.max(1.2, (result.landing ? result.landing.t : result.duration) - 2.6);
    } else if (lp && result.flightTime > 2.6 && this.style === 'cinematic') {
      const dirx = lp.x, dirz = lp.z;
      const len = Math.hypot(dirx, dirz) || 1;
      const fx = dirx / len, fz = dirz / len; // forward (tee -> landing)
      const rx = -fz, rz = fx; // right
      const side = result.offline > 4 ? -1 : result.offline < -4 ? 1 : (Math.random() < 0.5 ? -1 : 1);
      // Broadcast "green-side" camera: off to one side, short of the landing
      // spot, framed so the ball drops in from the top of the shot.
      const back = 30 + Math.min(18, result.carry * 0.05);
      const x = lp.x - fx * back + rx * 17 * side;
      const z = lp.z - fz * back + rz * 17 * side;
      const y = Math.max(groundHeight(x, z), -40) + 4.2;
      this.landCam = new THREE.Vector3(x, y, z);
      this.landPoint = new THREE.Vector3(lp.x, groundHeight(lp.x, lp.z), lp.z);
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
    if (this.mode === 'showcase') {
      const s = this.t * 0.035;
      this.desiredPos.set(-18 + Math.sin(s) * 14, 9 + Math.sin(s * 0.7) * 2, -14 - Math.sin(s * 0.5) * 10);
      this.desiredLook.set(260 + Math.sin(s * 0.8) * 160, -20, -1400);
      this.rate = 0.8;
      this.lookRate = 0.8;
    } else if (this.mode === 'shot' && this.result) {
      if (this.style === 'tee') {
        this.desiredPos.copy(this.pos);
        this.desiredLook.copy(b);
        this.lookRate = 8;
        const d = b.length();
        this.baseFov = THREE.MathUtils.clamp(52 - d * 0.06, 30, 52);
      } else if (this.landCam && playT >= this.cutAt) {
        // Keep the landing area in frame while the ball is still high, then
        // settle onto the ball as it comes down.
        const air = Math.max(0, b.y - groundHeight(b.x, b.z));
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
        const hx = b.x, hz = b.z;
        const len = Math.hypot(hx, hz);
        let fx = 0, fz = -1;
        if (len > 2) { fx = hx / len; fz = hz / len; }
        const height = Math.max(0, b.y - groundHeight(b.x, b.z));
        const back = 9 + Math.min(14, playT * 3.2);
        const ramp = Math.min(1, playT / 0.9);
        const tgt = this._v.set(b.x - fx * back, b.y + 2.6 + height * 0.08, b.z - fz * back);
        tgt.lerpVectors(ADDRESS_POS, tgt, ramp * ramp);
        const gy = groundHeight(tgt.x, tgt.z) + 1.2;
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
      } else if (this.style !== 'tee') {
        const off = this._dir.subVectors(this.pos, p).setY(0);
        const dist = THREE.MathUtils.clamp(off.length(), 8, 30);
        const a0 = Math.atan2(off.z, off.x) + 0.16 * dt;
        this.desiredPos.set(p.x + Math.cos(a0) * dist, Math.max(groundHeight(p.x, p.z), -50) + 3.5, p.z + Math.sin(a0) * dist);
      }
      this.desiredLook.copy(p);
    }

    damp(this.pos, this.desiredPos, this.rate, dt);
    damp(this.look, this.desiredLook, this.lookRate, dt);
    this.fov += (this.baseFov - this.fov) * (1 - Math.exp(-3 * dt));

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
