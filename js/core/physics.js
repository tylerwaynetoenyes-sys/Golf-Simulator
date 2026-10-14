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

// ── The cup ──
// Regulation hole: 4.25 in (108 mm) across, at least 4 in (102 mm) deep; a
// flagstick is at most 1 in across. A rolling ball drops if it stays over the
// hole long enough to fall one ball radius before reaching the far edge
// (t = sqrt(2r/g) ≈ 66 ms). Dead centre that gives a capture speed of
// ≈ 1.6 m/s, matching measured values (Holmes, 1991); off-centre the chord
// is shorter, so the ball needs to be slower, and a fast or glancing ball
// catches the far lip and spins out.
export const CUP = { radius: 0.054, depth: 0.102, pole: 0.0125 };
const FALL_T = Math.sqrt((2 * BALL.radius) / G);

/**
 * One rolling step near the cup. st = {over:false} persists between steps.
 * Returns null, {holed:true}, or {lip:true, vx, vz} (new velocity).
 */
function cupStep(st, cup, px, pz, vx, vz) {
  const R = CUP.radius;
  const d = Math.hypot(px - cup.x, pz - cup.z);
  if (st.over) {
    if (d > R + 0.004) st.over = false;
    return null;
  }
  if (d >= R) return null;
  st.over = true;
  const sp = Math.hypot(vx, vz);
  if (sp < 1e-4) return { holed: true };
  const ux = vx / sp, uz = vz / sp;
  const rx = cup.x - px, rz = cup.z - pz;
  const along = rx * ux + rz * uz;
  const perpX = rx - along * ux, perpZ = rz - along * uz;
  const b = Math.hypot(perpX, perpZ);
  const chord = 2 * Math.sqrt(Math.max(0, R * R - b * b));
  const vCap = chord / FALL_T;
  if (sp < vCap) return { holed: true, offset: b / R, speed: sp };
  // Lip out: the far rim grabs the ball, bleeds pace and spins it away from the centre.
  const frac = Math.min(1, b / R);
  const turn = 0.18 + frac * 0.5; // radians
  const nx = b > 1e-6 ? -perpX / b : 0, nz = b > 1e-6 ? -perpZ / b : 0;
  const ns = sp * (0.55 + 0.3 * frac);
  const dx = ux * Math.cos(turn) + nx * Math.sin(turn), dz = uz * Math.cos(turn) + nz * Math.sin(turn);
  const dl = Math.hypot(dx, dz) || 1;
  return { lip: true, vx: (dx / dl) * ns, vz: (dz / dl) * ns, speed: sp };
}

/**
 * Animate a ball dropping into the cup: it carries on over the hole, falls,
 * rattles off the liner (and the flagstick, if it's in), hits the bottom and
 * settles. Pushes 'cup' samples plus 'drop' / 'rattle' / 'cupBottom' events.
 * Sample y is the ball's contact height (bottom of the ball), like rolling samples.
 */
function cupDrop({ cup, t0, px, pz, vx, vz, vy = 0, rimY, samples, events, flagstick = false }) {
  const dt = 1 / 240;
  const R = CUP.radius, r = BALL.radius;
  let x = px - cup.x, z = pz - cup.z, yb = 0; // bottom of ball relative to the rim
  let t = t0, k = 0, hitBottom = false;
  const speed0 = Math.hypot(vx, vz, vy);
  events.push({ type: 'drop', t, x: px, y: rimY, z: pz, speed: speed0 });
  let lastRattle = -1;
  for (let i = 0; i < 360; i++) {
    vy -= G * dt;
    x += vx * dt; z += vz * dt; yb += vy * dt;
    t += dt;
    // liner wall (once the ball is below the rim it's fully inside)
    const wallR = yb > -r ? R : R - r;
    const d = Math.hypot(x, z);
    if (d > wallR) {
      const nx = x / d, nz = z / d;
      const vn = vx * nx + vz * nz;
      if (vn > 0) {
        vx -= (1 + 0.35) * vn * nx; vz -= (1 + 0.35) * vn * nz;
        vx *= 0.8; vz *= 0.8;
        if (vn > 0.25 && t - lastRattle > 0.05) { events.push({ type: 'rattle', t, x: cup.x + x, y: rimY + yb, z: cup.z + z, speed: vn }); lastRattle = t; }
      }
      x = nx * wallR; z = nz * wallR;
    }
    // flagstick
    if (flagstick) {
      const pr = CUP.pole + r;
      const dp = Math.hypot(x, z);
      if (dp < pr) {
        const nx = dp > 1e-6 ? x / dp : 1, nz = dp > 1e-6 ? z / dp : 0;
        const vn = vx * nx + vz * nz;
        if (vn < 0) {
          vx -= 1.4 * vn * nx; vz -= 1.4 * vn * nz;
          if (-vn > 0.25 && t - lastRattle > 0.05) { events.push({ type: 'rattle', t, x: cup.x + x, y: rimY + yb, z: cup.z + z, speed: -vn, pole: true }); lastRattle = t; }
        }
        x = nx * pr; z = nz * pr;
      }
    }
    // bottom
    if (yb <= -CUP.depth) {
      yb = -CUP.depth;
      if (!hitBottom) { hitBottom = true; events.push({ type: 'cupBottom', t, x: cup.x + x, y: rimY + yb, z: cup.z + z, speed: -vy }); }
      vy = -vy * 0.28;
      if (Math.abs(vy) < 0.12) vy = 0;
      vx *= 0.55; vz *= 0.55;
    }
    if (++k % 2 === 0) samples.push({ t, x: cup.x + x, y: rimY + yb, z: cup.z + z, phase: 'cup' });
    if (hitBottom && vy === 0 && Math.hypot(vx, vz) < 0.02) break;
  }
  samples.push({ t, x: cup.x + x, y: rimY + yb, z: cup.z + z, phase: 'cup' });
  return { t, x: cup.x + x, y: rimY + yb, z: cup.z + z };
}

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
 * @param {{x:number,z:number,flagstick?:boolean}} [opts.cup]  hole the ball can drop into
 */
export function simulateShot(launch, opts = {}) {
  const cup = opts.cup || null;
  const cupSt = { over: false };
  let holed = null;
  const terrain = opts.terrain || (() => ({ height: 0, surface: 'fairway' }));
  const wind = opts.wind || { x: 0, z: 0 };
  // optional tree canopies: trees(x, y, z) → {id, x, z} when the point is inside one
  const trees = opts.trees || null;
  let lastTree = null;
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
      // through a tree: leaves and branches take most of the pace and knock it
      // off line (deterministic, so replays and previews agree)
      if (trees && t > 0.08) {
        const hit = trees(px, py, pz);
        if (hit && hit.id !== lastTree) {
          lastTree = hit.id;
          const sp = Math.hypot(vx, vy, vz);
          const h = Math.sin(px * 12.9898 + pz * 78.233) * 43758.5453;
          const r1 = h - Math.floor(h);
          const r2 = (h * 7.13) - Math.floor(h * 7.13);
          const keep = 0.18 + 0.22 * r1;
          const yaw = (r2 - 0.5) * 2.2;
          const c = Math.cos(yaw), sn = Math.sin(yaw);
          const nvx2 = (vx * c - vz * sn) * keep, nvz2 = (vx * sn + vz * c) * keep;
          vx = nvx2; vz = nvz2; vy = Math.min(vy * keep, 1.5);
          omega *= 0.25;
          events.push({ type: 'tree', t, x: px, y: py, z: pz, speed: sp });
        } else if (!hit) lastTree = null;
      }
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
      // straight in the hole on the fly (or first bounce)
      if (cup && Math.hypot(px - cup.x, pz - cup.z) < CUP.radius - BALL.radius * 0.4) {
        if (!carry) {
          carry = { x: px, z: pz, t, descent: (Math.atan2(-vy, Math.hypot(vx, vz)) * 180) / Math.PI, speed: Math.hypot(vx, vy, vz) };
          landing = { x: px, y: py, z: pz, t, surface: 'green' };
          events.push({ type: 'land', t, x: px, y: py, z: pz, surface: 'cup', speed: Math.hypot(vx, vy, vz) });
        }
        // a dunk loses most of its pace on the liner / flagstick
        const end = cupDrop({ cup, t0: t, px, pz, vx: vx * 0.25, vz: vz * 0.25, vy: vy * 0.3, rimY: py, samples, events, flagstick: !!cup.flagstick });
        holed = { t, x: cup.x, z: cup.z, dunk: true };
        t = end.t; px = end.x; py = end.y; pz = end.z;
        phase = 'holed';
        break;
      }
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

      // ── bounce, against the real surface normal (a ball landing on a slope
      // kicks down it; on flat ground this is exactly the calibrated bounce) ──
      const [sgx, sgz] = slopeAt(terrain, px, pz);
      const nl = Math.hypot(sgx, 1, sgz);
      const nx = -sgx / nl, ny = 1 / nl, nz = -sgz / nl;
      const vdotn = vx * nx + vy * ny + vz * nz;
      const vn = Math.max(0, -vdotn);
      let tx = vx - vdotn * nx, ty = vy - vdotn * ny, tz = vz - vdotn * nz;
      const ts = Math.hypot(tx, ty, tz);
      const e = Math.max(0.05, surf.restitution - 0.011 * vn);
      if (ts > 1e-6) { tx /= ts; ty /= ts; tz /= ts; } else { tx = 0; ty = 0; tz = -1; }
      // Backspin component along travel direction (spin about the horizontal right axis).
      const thl = Math.hypot(tx, tz) || 1;
      const rightDot = -ax * (tz / thl) + az * (tx / thl);
      const backOmega = omega * Math.max(-1, Math.min(1, rightDot));
      const rw = BALL.radius * backOmega;
      // Steeper landings (relative to the surface) bite harder.
      const impact = (Math.atan2(vn, ts) * 180) / Math.PI;
      const bite = Math.min(1, Math.max(0.25, Math.sin((impact * Math.PI) / 180) * 1.25));
      let hNew = ts - surf.friction * bite * (ts + rw) * (2 / 7) * 2.2;
      hNew = Math.max(hNew, -0.12 * ts); // a little zip back at most
      if (ts > 1e-6 && hNew < ts * 0.04 && rw < ts) hNew = Math.max(hNew, ts * 0.04);
      if (ground.surface === 'sand') hNew = Math.min(hNew, ts * 0.08); // plugs / dies in the bunker
      const up = vn * e;
      vx = tx * hNew + nx * up;
      vy = ty * hNew + ny * up;
      vz = tz * hNew + nz * up;
      omega *= 0.45;
      bounces++;
      if (up < 1.1 || bounces > 6) { phase = 'roll'; vy = 0; }
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
      if (cup) {
        const c = cupStep(cupSt, cup, px, pz, vx, vz);
        if (c?.holed) {
          const end = cupDrop({ cup, t0: t, px, pz, vx, vz, rimY: terrain(cup.x, cup.z).height, samples, events, flagstick: !!cup.flagstick });
          holed = { t, x: cup.x, z: cup.z };
          t = end.t; px = end.x; py = end.y; pz = end.z;
          phase = 'holed';
          break;
        }
        if (c?.lip) {
          if (c.speed > 0.4) events.push({ type: 'lip', t, x: px, y: py, z: pz, speed: c.speed });
          vx = c.vx; vz = c.vz;
        }
      }
    }
  }
  if (phase !== 'gone') phase = 'rest';

  const res = finishResult({ samples, events, t, apex, landing, carry, px, py, pz, o, hd, phase, lastSurface, terrain });
  if (holed) { res.holed = true; res.holedAt = holed; res.restSurface = 'cup'; }
  return res;
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
  const cupSt = { over: false };
  let t = 0, holed = null, phase = 'roll', lastSurface = 'green';
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
    if (Math.round(t / dt) % 2 === 0) samples.push({ t, x: px, y: py, z: pz, phase: 'roll' });
    if (cup) {
      const c = cupStep(cupSt, cup, px, pz, vx, vz);
      if (c?.holed) {
        samples.push({ t, x: px, y: py, z: pz, phase: 'roll' });
        const end = cupDrop({ cup, t0: t, px, pz, vx, vz, rimY: terrain(cup.x, cup.z).height, samples, events, flagstick: !!cup.flagstick });
        holed = { t, x: cup.x, z: cup.z, offset: c.offset, speed: c.speed };
        t = end.t; px = end.x; py = end.y; pz = end.z;
        break;
      }
      if (c?.lip) {
        events.push({ type: 'lip', t, x: px, y: py, z: pz, speed: c.speed });
        vx = c.vx; vz = c.vz;
      }
    }
  }
  if (!holed) samples.push({ t, x: px, y: py, z: pz, phase: 'roll' });
  const res = finishResult({
    samples, events, t, apex: { x: origin.x, y: py, z: origin.z, t: 0 }, landing: null, carry: null,
    px, py, pz, o: { x: origin.x, y: py, z: origin.z }, hd: h, phase, lastSurface, terrain,
  });
  res.putt = true;
  res.holed = !!holed;
  if (holed) { res.holedAt = holed; res.restSurface = 'cup'; }
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
