// Golf ball flight + ground physics.
//
// World frame: metres, +Y up, the target line runs down -Z from the tee at the
// origin, +X is right of target. A shot is simulated in full the moment it
// arrives (a few ms), then played back in real time; this lets the camera and
// commentary know the outcome before the ball lands.
//
// Aerodynamics: drag + Magnus lift with coefficients driven by the spin factor
// S = r*omega/|v| (the form used by Bearman & Harvey-style fits), plus a
// Reynolds-number drag rise at low speed. Coefficients are calibrated so
// Trackman PGA Tour averages reproduce (see tools/calibrate.mjs):
//   Driver 171 mph / 10.4 deg / 2545 rpm -> ~282 yd carry, ~35 yd apex
//   7-iron 123 mph / 16.3 deg / 7124 rpm -> ~176 yd carry
//   PW     102 mph / 24.2 deg / 9304 rpm -> ~136 yd carry

export const BALL = {
  mass: 0.04593, // kg
  radius: 0.021335, // m
};
BALL.area = Math.PI * BALL.radius * BALL.radius;

export const G = 9.80665;
export const MPH = 0.44704; // m/s per mph
export const YD = 0.9144; // m per yard
const RPM = (2 * Math.PI) / 60;

export const AERO = {
  airDensity: 1.19, // kg/m^3 — Alton bluff top (~190 m) on a mild night
  cd0: 0.2492, // base drag (supercritical regime)
  cdSpin: 0.1708, // added drag per unit spin factor
  cdFast: 0.08, // drag relief at high Reynolds number
  clA: 0.5129, // lift = clA * S^clP (capped at clMax)
  clP: 0.4534,
  clMax: 0.3045,
  spinDecay: 0.035, // fraction of spin lost per second in flight
  kinViscosity: 1.5e-5,
};

export const GROUND = {
  // Fairway fitted so rollout ≈ Tour norms: DR ~20 yd, 7i ~7, PW ~3, SW ~1.5
  fairway: { restitution: 0.354, friction: 0.546, roll: 4.0, rollDrag: 0.50 },
  rough: { restitution: 0.25, friction: 0.9, roll: 6.5, rollDrag: 1.1 },
  green: { restitution: 0.3, friction: 0.62, roll: 1.1, rollDrag: 0.16 },
  tee: { restitution: 0.3, friction: 0.6, roll: 4.0, rollDrag: 0.5 },
  water: null,
  oob: null,
};

function dragCoeff(speed, S) {
  const re = (speed * 2 * BALL.radius) / AERO.kinViscosity;
  // Dimpled balls lose their low-drag regime below Re ~ 6e4 (~21 m/s).
  const crisis = re < 9e4 ? Math.min(1, (9e4 - re) / 5e4) : 0;
  // ...and drag keeps easing slightly at driver speeds (Re > 1.5e5).
  const fast = Math.min(1, Math.max(0, (re - 1.5e5) / 1e5));
  return AERO.cd0 + AERO.cdSpin * S + 0.18 * crisis * crisis - AERO.cdFast * fast;
}

function liftCoeff(S) {
  return S <= 0 ? 0 : Math.min(AERO.clMax, AERO.clA * Math.pow(S, AERO.clP));
}

/**
 * @typedef {Object} Launch
 * @property {number} ballSpeed  m/s
 * @property {number} launchAngle  deg (vertical)
 * @property {number} launchDirection  deg (+ right)
 * @property {number} totalSpin  rpm
 * @property {number} spinAxis  deg (+ = curves right / fade for RH)
 */

/**
 * @param {Launch} launch
 * @param {object} opts
 * @param {(x:number,z:number)=>{height:number, surface:string}} [opts.terrain]
 * @param {{x:number,z:number}} [opts.wind]  m/s
 */
export function simulateShot(launch, opts = {}) {
  const terrain = opts.terrain || (() => ({ height: 0, surface: 'fairway' }));
  const wind = opts.wind || { x: 0, z: 0 };
  const dt = 1 / 240;

  const v0 = Math.max(0.5, launch.ballSpeed);
  const la = (launch.launchAngle * Math.PI) / 180;
  const ld = (launch.launchDirection * Math.PI) / 180;
  const sa = (launch.spinAxis * Math.PI) / 180;

  let px = 0, py = opts.teeHeight ?? 0.03, pz = 0;
  let vx = v0 * Math.cos(la) * Math.sin(ld);
  let vy = v0 * Math.sin(la);
  let vz = -v0 * Math.cos(la) * Math.cos(ld);

  // Spin axis: horizontal "right" of the launch direction, tilted by spin axis.
  const rx = Math.cos(ld), rz = Math.sin(ld); // right vector of (sin ld, 0, -cos ld)
  let ax = rx * Math.cos(sa), ay = -Math.sin(sa), az = rz * Math.cos(sa);
  let omega = Math.max(0, launch.totalSpin) * RPM; // rad/s

  const k = (0.5 * AERO.airDensity * BALL.area) / BALL.mass;
  const samples = [{ t: 0, x: px, y: py, z: pz, phase: 'flight' }];
  const events = [];
  let t = 0;
  let apex = { y: py, x: px, z: pz, t: 0 };
  let carry = null;
  let landing = null;
  let levelCross = null; // where a descending ball passes back through tee height

  const accel = (x, y, z, ux, uy, uz, w) => {
    const rvx = ux - wind.x, rvy = uy, rvz = uz - wind.z;
    const sp = Math.hypot(rvx, rvy, rvz) || 1e-6;
    const S = (BALL.radius * w) / sp;
    const cd = dragCoeff(sp, S);
    const cl = liftCoeff(S);
    // Magnus direction = spinAxis x velocityDir
    let mx = ay * rvz - az * rvy;
    let my = az * rvx - ax * rvz;
    let mz = ax * rvy - ay * rvx;
    const mn = Math.hypot(mx, my, mz) || 1;
    mx /= mn; my /= mn; mz /= mn;
    return [
      -k * cd * sp * rvx + k * cl * sp * sp * mx,
      -G - k * cd * sp * rvy + k * cl * sp * sp * my,
      -k * cd * sp * rvz + k * cl * sp * sp * mz,
    ];
  };

  // ── flight (RK4) ⇄ roll. A rolling ball can run off the bluff and fly again. ──
  let phase = 'flight';
  let bounces = 0;
  let lastSurface = 'fairway';
  const maxT = 40;
  while ((phase === 'flight' || phase === 'roll') && t < maxT) {
    if (phase === 'flight') {
      const w = omega;
      const a1 = accel(px, py, pz, vx, vy, vz, w);
      const a2 = accel(px + vx * dt / 2, py + vy * dt / 2, pz + vz * dt / 2, vx + a1[0] * dt / 2, vy + a1[1] * dt / 2, vz + a1[2] * dt / 2, w);
      const a3 = accel(px + (vx + a1[0] * dt / 2) * dt / 2, py + (vy + a1[1] * dt / 2) * dt / 2, pz + (vz + a1[2] * dt / 2) * dt / 2, vx + a2[0] * dt / 2, vy + a2[1] * dt / 2, vz + a2[2] * dt / 2, w);
      const a4 = accel(px + (vx + a2[0] * dt / 2) * dt, py + (vy + a2[1] * dt / 2) * dt, pz + (vz + a2[2] * dt / 2) * dt, vx + a3[0] * dt, vy + a3[1] * dt, vz + a3[2] * dt, w);
      const nvx = vx + (dt / 6) * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]);
      const nvy = vy + (dt / 6) * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1]);
      const nvz = vz + (dt / 6) * (a1[2] + 2 * a2[2] + 2 * a3[2] + a4[2]);
      px += (dt / 2) * (vx + nvx);
      py += (dt / 2) * (vy + nvy);
      pz += (dt / 2) * (vz + nvz);
      vx = nvx; vy = nvy; vz = nvz;
      omega *= 1 - AERO.spinDecay * dt;
      t += dt;

      if (py > apex.y) apex = { y: py, x: px, z: pz, t };
      if (!levelCross && vy < 0 && py <= 0) {
        const hsl = Math.hypot(vx, vz);
        levelCross = { x: px, z: pz, t, descent: (Math.atan2(-vy, hsl) * 180) / Math.PI, speed: Math.hypot(vx, vy, vz) };
      }

      const ground = terrain(px, pz);
      if (!(py <= ground.height && vy < 0)) {
        samples.push({ t, x: px, y: py, z: pz, phase: 'flight' });
        continue;
      }
      py = ground.height;
      const speed = Math.hypot(vx, vy, vz);
      const hs = Math.hypot(vx, vz);
      const descent = (Math.atan2(-vy, hs) * 180) / Math.PI;
      if (!carry) {
        // Off the bluff: quote carry where it came back through tee height.
        carry = py < -2 && levelCross ? { ...levelCross } : { x: px, z: pz, t, descent, speed };
        landing = { x: px, y: py, z: pz, t, surface: ground.surface };
      }
      samples.push({ t, x: px, y: py, z: pz, phase: 'impact' });
      events.push({ type: bounces === 0 ? 'land' : 'bounce', t, x: px, y: py, z: pz, surface: ground.surface, speed });
      lastSurface = ground.surface;

      const surf = GROUND[ground.surface];
      if (!surf) { // river / out of bounds: ball is gone
        phase = 'gone';
        events.push({ type: 'splash', t, x: px, y: py, z: pz, surface: ground.surface });
        break;
      }

      // ── bounce ──
      const vn = -vy;
      const e = Math.max(0.08, surf.restitution - 0.011 * vn);
      const hdx = hs > 1e-6 ? vx / hs : 0;
      const hdz = hs > 1e-6 ? vz / hs : -1;
      // Backspin component along travel direction (spin about the horizontal right axis).
      const rightDot = -ax * hdz + az * hdx;
      const backOmega = omega * Math.max(-1, Math.min(1, rightDot));
      const rw = BALL.radius * backOmega;
      // Steeper landings bite harder.
      const bite = Math.min(1, Math.max(0.25, Math.sin((descent * Math.PI) / 180) * 1.25));
      let hNew = hs - surf.friction * bite * (hs + rw) * (2 / 7) * 2.2;
      hNew = Math.max(hNew, -0.12 * hs); // a little zip back at most
      if (hs > 1e-6 && hNew < hs * 0.04 && rw < hs) hNew = Math.max(hNew, hs * 0.04);
      vx = hdx * hNew;
      vz = hdz * hNew;
      vy = vn * e;
      omega *= 0.45;
      bounces++;
      if (vy < 1.1 || bounces > 6) phase = 'roll';
    } else {
      // ── roll ──
      const rollDt = 1 / 120;
      let speed = Math.hypot(vx, vz);
      if (speed <= 0.04) { phase = 'rest'; break; }
      const dirx = vx / speed, dirz = vz / speed;
      const ground = terrain(px, pz);
      const surf = GROUND[ground.surface];
      if (!surf) {
        events.push({ type: 'splash', t, x: px, y: ground.height, z: pz, surface: ground.surface });
        phase = 'gone';
        break;
      }
      lastSurface = ground.surface;
      const decel = surf.roll + surf.rollDrag * speed;
      speed = Math.max(0, speed - decel * rollDt);
      const nx = px + dirx * speed * rollDt;
      const nz = pz + dirz * speed * rollDt;
      const nh = terrain(nx, nz).height;
      px = nx; pz = nz; t += rollDt;
      vx = dirx * speed; vz = dirz * speed;
      if (nh < py - 0.25) {
        // ran off an edge (the bluff): airborne again
        vy = 0;
        omega *= 0.2;
        phase = 'flight';
        events.push({ type: 'edge', t, x: px, y: py, z: pz, surface: ground.surface });
        samples.push({ t, x: px, y: py, z: pz, phase: 'flight' });
        continue;
      }
      py = nh;
      samples.push({ t, x: px, y: py, z: pz, phase: 'roll' });
    }
  }
  if (phase !== 'gone') phase = 'rest';

  // Thin the flight samples for playback (keep every 2nd at 240 Hz → 120 Hz)
  const out = [];
  for (let i = 0; i < samples.length; i++) {
    if (i % 2 === 0 || samples[i].phase !== 'flight' || i === samples.length - 1) out.push(samples[i]);
  }

  const rest = { x: px, y: py, z: pz };
  const carryDist = carry ? Math.hypot(carry.x, carry.z) : Math.hypot(px, pz);
  return {
    samples: out,
    events,
    duration: t,
    flightTime: landing ? landing.t : t,
    apex,
    landing,
    carry: carryDist,
    carryPoint: carry,
    descentAngle: carry ? carry.descent : 0,
    total: Math.hypot(rest.x, rest.z),
    offline: rest.x,
    carryOffline: carry ? carry.x : rest.x,
    rest,
    restSurface: phase === 'gone' ? lastSurface : (terrain(rest.x, rest.z).surface),
    lost: phase === 'gone',
  };
}

/** Sample the precomputed path at time t (linear interpolation). */
export function samplePath(result, t, out = { x: 0, y: 0, z: 0, phase: 'flight' }) {
  const s = result.samples;
  if (t <= 0) { Object.assign(out, s[0]); return out; }
  if (t >= s[s.length - 1].t) { Object.assign(out, s[s.length - 1]); return out; }
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = s[lo], b = s[hi];
  const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
  out.x = a.x + (b.x - a.x) * f;
  out.y = a.y + (b.y - a.y) * f;
  out.z = a.z + (b.z - a.z) * f;
  out.phase = b.phase === 'impact' ? a.phase : b.phase;
  return out;
}
