// Club presets for demo/manual play and shot labelling.
// Reference launch numbers are a solid single-digit amateur, a little under
// Trackman tour averages (tour: DR 171 mph / 10.4° / 2545 rpm, 7i 123 / 16.3 / 7124).
import { MPH } from '../core/physics.js';

import { CATALOGUE, STOCK_BAG, HEADS, ballById, headById, ballSpeedFactor, ballSpinFactor } from './equipment.js';

/**
 * The clubs in play: the player's bag (or the whole catalogue on the range),
 * each with its head design and the chosen ball folded into its numbers.
 * One array, rebuilt in place, so every importer sees the current bag.
 */
export const CLUBS = [];
let _ball = ballById('tour');
export const currentBall = () => _ball;

export function rebuildClubs({ bag = STOCK_BAG, all = false, driverHead = 'std', ironHead = 'players', ball = 'tour' } = {}) {
  _ball = ballById(ball);
  const ids = all ? CATALOGUE.map((c) => c.id) : CATALOGUE.map((c) => c.id).filter((id) => bag.includes(id));
  CLUBS.length = 0;
  for (const id of ids) {
    const c = CATALOGUE.find((k) => k.id === id);
    const head = c.kind === 'driver' ? headById('driver', driverHead) : c.kind === 'iron' ? headById('iron', ironHead) : null;
    const h = head || { smash: 0, launch: 0, spin: 1, forgive: 1, work: 1 };
    const speed = ((c.smash + h.smash) / c.smash) * ballSpeedFactor(_ball, c.clubMph);
    const ballMph = c.ballMph * speed;
    CLUBS.push({
      ...c,
      ballMph,
      smash: c.smash + h.smash,
      launch: c.launch + h.launch,
      spin: c.spin * h.spin * ballSpinFactor(_ball, c.loft),
      forgive: h.forgive,
      work: h.work,
      // carry grows a little faster than ball speed; less spin flies a touch farther
      carry: Math.round(c.carry * Math.pow(speed, 1.15) * (1 + 0.04 * (1 - h.spin))),
      head: head?.id || null,
    });
  }
  if (!CLUBS.length) rebuildClubs({ all: true, ball });
  return CLUBS;
}
rebuildClubs();

export const clubById = (id) => CLUBS.find((c) => c.id === id) || CLUBS.find((c) => c.id === '7I') || CLUBS[Math.floor(CLUBS.length / 2)];

function gauss(rng = Math.random) {
  if (rng === null) return 0; // deterministic (nominal) launch
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Build a launch from a demo swing.
 * @param {object} club  entry from CLUBS
 * @param {number} power  0..1.1 (1 = full swing)
 * @param {number} contact  0..1 (1 = pure strike, from swing-meter timing)
 * @param {number} aimDeg  intended start line, + right
 */
export function demoLaunch(club, power = 1, contact = 0.9, aimDeg = 0, rng = Math.random) {
  // rng === null gives the nominal (noise-free) launch for a pure strike
  const p = Math.max(0.15, Math.min(1.1, power));
  const over = Math.max(0, p - 1); // overswing adds speed and chaos
  const miss = 1 - Math.max(0, Math.min(1, contact));
  // speed scales a little less than linearly with power (a 50% swing isn't half distance)
  // a mis-hit costs speed; a forgiving (high-MOI) head keeps more of it
  const fg = club.forgive ?? 1;
  const speedFactor = Math.pow(p, 0.78) * (1 - (0.22 * miss * miss + 0.05 * miss) / fg) * (1 + 0.6 * over);
  const ballMph = club.ballMph * speedFactor * (1 + gauss(rng) * 0.012);
  const thin = rng !== null && miss > 0.55 && rng() < 0.5; // occasional thin/topped strike
  const launch = club.launch * (thin ? 0.45 + 0.2 * rng() : 1 + gauss(rng) * 0.06) * (0.9 + 0.1 * p);
  const spin = club.spin * (thin ? 0.6 : 1) * (0.85 + 0.15 * p) * (1 + gauss(rng) * 0.07);

  const disp = club.dispersion * (0.6 + 2.6 * miss / Math.sqrt(fg) + 3 * over) * (club.work ?? 1);
  const face = gauss(rng) * 1.6 * disp;
  const path = gauss(rng) * 2.2 * disp;
  const launchDirection = aimDeg + 0.78 * face + 0.22 * path;
  // woods turn harder off the face (gear effect from a CG far behind it); irons barely
  const gear = club.kind === 'driver' || club.kind === 'wood' ? 1.25 : club.kind === 'hybrid' ? 1.1 : 1;
  const spinAxis = Math.max(-35, Math.min(35, 3.4 * (face - path) * gear));

  return {
    ballSpeed: Math.max(1, ballMph) * MPH,
    launchAngle: launch,
    launchDirection,
    totalSpin: spin,
    spinAxis,
    clubSpeed: (club.clubMph * Math.pow(p, 0.8) * (1 + 0.4 * over)) * MPH,
    faceAngle: face + aimDeg,
    clubPath: path + aimDeg,
    attackAngle: club.kind === 'driver' ? 1.5 + gauss(rng) : club.kind === 'wood' ? -1 + gauss(rng) : -3.5 + gauss(rng),
  };
}
