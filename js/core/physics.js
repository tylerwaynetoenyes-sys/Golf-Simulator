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
  fringe: { restitution: 0.3, friction: 0.7, roll: 2.4, rollDrag: 0.35 },
  tee: { restitution: 0.3, friction: 0.6, roll: 4.0, rollDrag: 0.5 },
  sand: { restitution: 0.06, friction: 1.6, roll: 11, rollDrag: 2.5 },
  path: { restitution: 0.55, friction: 0.3, roll: 1.2, rollDrag: 0.1 },
  water: null,
  oob: null,
};

// Rolling on an incline: a solid sphere accelerates at (5/7)·g·slope.
const ROLL_SLOPE = (5 / 7) * 9.80665;

/** Putting green pace: ~10.5 on the Stimpmeter (1.83 m/s release rolls ~3.2 m). */
export const PUTT = { decel: 0.42, drag: 0.06, cupRadius: 0.054, capture: 1.35 };

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

function slopeAt(terrain, x, z) {
  const e = 0.2;
  const hx = (terrain(x + e, z).height - terrain(x - e, z).height) / (2 * e);
  const hz = (terrain(x, z + e).height - terrain(x, z - e).height) / (2 * e);
  return [hx, hz];
}

/**
 * Simulate a full shot from any position on the course.
 * @param {Launch} launch  launchDirection is relative to `heading`
 * @param {object} opts
 * @param {(x:number,z:number)=>{height:number, surface:string}} [opts.terrain]
 * @param {{x:number,z:number}} [opts.wind]  air velocity, m/s
 * @param {{x:number,y:number,z:number}} [opts.origin]  ball position (default tee at origin)
 * @param {number} [opts.heading]  target-line direction in degrees, 0 = down -Z, + = right
 */
export function simulateShot(launch, opts = {}) {
  const terrain = opts.terrain || (() => ({ height: 0, surface: 'fairway' }));
  const wind = opts.wind || { x: 0, z: 0 };
  const dt = 1 / 240;
  const o = opts.origin || { x: 0, y: opts.teeHeight ?? 0.03, z: 0 };
  const hd = ((opts.heading || 0) * Math.PI) / 180;

  const v0 = Math.max(0.5, launch.ballSpeed);
  const la = (launch.launchAngle * Math.PI) / 180;
  const ld = hd + (launch.launchDirection * Math.PI) / 180;
  const sa = (launch.spinAxis * Math.PI) / 180;

  let px = o.x, py = o.y, pz = o.z;
  let vx = v0 * Math.cos(la) * Math.sin(ld);
  let vy = v0 * Math.sin(la);
  let vz = -v0 * Math.cos(la) * Math.cos(ld);

  // Spin axis: horizontal "right" of the launch direction, tilted by spin axis.
  const rx = Math.cos(ld), rz = Math.sin(ld);
  const ax = rx * Math.cos(sa), ay = -Math.sin(sa), az = rz * Math.cos(sa);
  let omega = Math.max(0, launch.totalSpin) * RPM; // rad/s

  const k = (0.5 * AERO.airDensity * BALL.area) / BALL.mass;
  const samples = [{ t: 0, x: px, y: py, z: pz, phase: 'flight' }];
  const events = [];
  let t = 0;
  let apex = { y: py, x: px, z: pz, t: 0 };
  let carry = null;
  let landing = null;
  let levelCross = null; // where a descending ball passes back through launch height

  const accel = (ux, uy, uz, w) => {
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

  // ── flight (RK4) ⇄ roll. A rolling ball can run off a ledge and fly again. ──
  let phase = 'flight';
  let bounces = 0;
  let lastSurface = 'fairway';
  const maxT = 45;
  while ((phase === 'flight' || phase === 'roll') && t < maxT) {
    if (phase === 'flight') {
      const w = omega;
      const a1 = accel(vx, vy, vz, w);
      const a2 = accel(vx + a1[0] * dt / 2, vy + a1[1] * dt / 2, vz + a1[2] * dt / 2, w);
      const a3 = accel(vx + a2[0] * dt / 2, vy + a2[1] * dt / 2, vz + a2[2] * dt / 2, w);
      const a4 = accel(vx + a3[0] * dt, vy + a3[1] * dt, vz + a3[2] * dt, w);
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
      if (!levelCross && vy < 0 && py <= o.y) {
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
        // Dropping well below the launch height (off a bluff): quote carry where
        // it came back through launch height.
        carry = py < o.y - 8 && levelCross ? { ...levelCross } : { x: px, z: pz, t, descent, speed };
        landing = { x: px, y: py, z: pz, t, surface: ground.surface };
      }
      samples.push({ t, x: px, y: py, z: pz, phase: 'impact' });
      events.push({ type: bounces === 0 ? 'land' : 'bounce', t, x: px, y: py, z: pz, surface: ground.surface, speed });
      lastSurface = ground.surface;

      const surf = GROUND[ground.surface];
      if (!surf) { // water / out of bounds: ball is gone
        phase = 'gone';
        events.push({ type: 'splash', t, x: px, y: py, z: pz, surface: ground.surface });
        break;
      }

      // ── bounce ──
      const vn = -vy;
      const e = Math.max(0.05, surf.restitution - 0.011 * vn);
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
      if (ground.surface === 'sand') hNew = Math.min(hNew, hs * 0.08); // plugs / dies in the bunker
      vx = hdx * hNew;
      vz = hdz * hNew;
      vy = vn * e;
      omega *= 0.45;
      bounces++;
      if (vy < 1.1 || bounces > 6) { phase = 'roll'; vy = 0; }
    } else {
      // ── roll: 2-D, with slope ──
      const rollDt = 1 / 120;
      const ground = terrain(px, pz);
      const surf = GROUND[ground.surface];
      if (!surf) {
        events.push({ type: 'splash', t, x: px, y: ground.height, z: pz, surface: ground.surface });
        phase = 'gone';
        break;
      }
      lastSurface = ground.surface;
      const [gx, gz] = slopeAt(terrain, px, pz);
      let speed = Math.hypot(vx, vz);
      const slopeAcc = ROLL_SLOPE * Math.hypot(gx, gz);
      if (speed < 0.05 && slopeAcc < surf.roll * 0.85) { phase = 'rest'; break; }
      const decel = surf.roll + surf.rollDrag * speed;
      // gravity down the slope
      vx -= ROLL_SLOPE * gx * rollDt;
      vz -= ROLL_SLOPE * gz * rollDt;
      speed = Math.hypot(vx, vz);
      if (speed > 1e-6) {
        const ns = Math.max(0, speed - decel * rollDt);
        vx *= ns / speed; vz *= ns / speed;
      }
      const nx = px + vx * rollDt;
      const nz = pz + vz * rollDt;
      const nh = terrain(nx, nz).height;
      px = nx; pz = nz; t += rollDt;
      if (nh < py - 0.25) {
        // ran off an edge: airborne again
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

  return finishResult({ samples, events, t, apex, landing, carry, px, py, pz, o, hd, phase, lastSurface, terrain });
}

function finishResult({ samples, events, t, apex, landing, carry, px, py, pz, o, hd, phase, lastSurface, terrain }) {
  // Thin the 240 Hz flight samples to 120 Hz for playback.
  const out = [];
  for (let i = 0; i < samples.length; i++) {
    if (i % 2 === 0 || samples[i].phase !== 'flight' || i === samples.length - 1) out.push(samples[i]);
  }
  const rest = { x: px, y: py, z: pz };
  const fx = Math.sin(hd), fz = -Math.cos(hd); // target line
  const rgx = Math.cos(hd), rgz = Math.sin(hd); // right of target line
  const rel = (p) => ({ dx: p.x - o.x, dz: p.z - o.z });
  const lateral = (p) => { const r = rel(p); return r.dx * rgx + r.dz * rgz; };
  const dist = (p) => { const r = rel(p); return Math.hypot(r.dx, r.dz); };
  void fx; void fz;
  return {
    samples: out,
    events,
    duration: t,
    flightTime: landing ? landing.t : t,
    apex: { ...apex, y: apex.y - o.y, worldY: apex.y },
    landing,
    carry: carry ? dist(carry) : dist(rest),
    carryPoint: carry,
    descentAngle: carry ? carry.descent : 0,
    total: dist(rest),
    offline: lateral(rest),
    carryOffline: carry ? lateral(carry) : lateral(rest),
    rest,
    origin: o,
    heading: (hd * 180) / Math.PI,
    restSurface: phase === 'gone' ? lastSurface : terrain(rest.x, rest.z).surface,
    lost: phase === 'gone',
  };
}

/**
 * Putt: a pure roll on the green with slope, Stimp-calibrated pace and cup capture.
 * @param {{x,y,z}} origin
 * @param {number} headingDeg  0 = down -Z
 * @param {number} speed  initial ball speed, m/s
 * @param {(x,z)=>{height,surface}} terrain
 * @param {{x:number,z:number}} cup
 */
export function simulatePutt(origin, headingDeg, speed, terrain, cup) {
  const h = (headingDeg * Math.PI) / 180;
  let vx = Math.sin(h) * speed, vz = -Math.cos(h) * speed;
  let px = origin.x, pz = origin.z, py = terrain(px, pz).height;
  const samples = [{ t: 0, x: px, y: py, z: pz, phase: 'roll' }];
  const events = [];
  const dt = 1 / 240;
  let t = 0, holed = false, lipped = false, phase = 'roll', lastSurface = 'green';
  while (t < 30) {
    const g = terrain(px, pz);
    lastSurface = g.surface;
    const surf = g.surface === 'green' ? null : GROUND[g.surface];
    if (g.surface === 'water' || g.surface === 'oob') {
      events.push({ type: 'splash', t, x: px, y: g.height, z: pz, surface: g.surface });
      phase = 'gone';
      break;
    }
    const roll = surf ? surf.roll : PUTT.decel;
    const drag = surf ? surf.rollDrag : PUTT.drag;
    const [gx, gz] = slopeAt(terrain, px, pz);
    let sp = Math.hypot(vx, vz);
    const slopeAcc = ROLL_SLOPE * Math.hypot(gx, gz);
    if (sp < 0.02 && slopeAcc < roll * 0.85) break;
    vx -= ROLL_SLOPE * gx * dt;
    vz -= ROLL_SLOPE * gz * dt;
    sp = Math.hypot(vx, vz);
    if (sp > 1e-6) {
      const ns = Math.max(0, sp - (roll + drag * sp) * dt);
      vx *= ns / sp; vz *= ns / sp;
    }
    px += vx * dt; pz += vz * dt; t += dt;
    py = terrain(px, pz).height;
    if (cup) {
      const d = Math.hypot(px - cup.x, pz - cup.z);
      if (d < PUTT.cupRadius) {
        const v = Math.hypot(vx, vz);
        if (v < PUTT.capture) { holed = true; px = cup.x; pz = cup.z; samples.push({ t, x: px, y: py - 0.05, z: pz, phase: 'roll' }); break; }
        if (!lipped) { lipped = true; events.push({ type: 'lip', t, x: px, y: py, z: pz, speed: v }); }
        // over the hole: lose some pace and get knocked off line a touch
        vx *= 0.985; vz *= 0.985;
      }
    }
    if (Math.round(t / dt) % 2 === 0) samples.push({ t, x: px, y: py, z: pz, phase: 'roll' });
  }
  samples.push({ t, x: px, y: py, z: pz, phase: 'roll' });
  const res = finishResult({
    samples, events, t, apex: { x: origin.x, y: py, z: origin.z, t: 0 }, landing: null, carry: null,
    px, py, pz, o: { x: origin.x, y: py, z: origin.z }, hd: h, phase, lastSurface, terrain,
  });
  res.putt = true;
  res.holed = holed;
  if (holed) res.holedAt = { t, x: cup.x, z: cup.z };
  return res;
}

/** Initial speed that rolls a putt `distance` metres on a flat green (plus a little extra to die in the hole). */
export function puttSpeedFor(distance) {
  // v² = 2·d·a with a ≈ decel + drag·v (solved iteratively)
  let v = Math.sqrt(2 * distance * PUTT.decel);
  for (let i = 0; i < 6; i++) v = Math.sqrt(2 * distance * (PUTT.decel + PUTT.drag * v * 0.5));
  return v;
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
