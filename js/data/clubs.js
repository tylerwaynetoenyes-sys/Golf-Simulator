// Club presets for demo/manual play and shot labelling.
// Reference launch numbers are a solid single-digit amateur, a little under
// Trackman tour averages (tour: DR 171 mph / 10.4° / 2545 rpm, 7i 123 / 16.3 / 7124).
import { MPH } from '../core/physics.js';

export const CLUBS = [
  { id: 'DR', name: 'Driver', short: 'DR', ballMph: 162, launch: 11.8, spin: 2650, clubMph: 110, loft: 10.5, smash: 1.47, dispersion: 1.0 },
  { id: '3W', name: '3 Wood', short: '3W', ballMph: 152, launch: 11.2, spin: 3500, clubMph: 104, loft: 15, smash: 1.46, dispersion: 0.9 },
  { id: '5I', name: '5 Iron', short: '5i', ballMph: 132, launch: 12.6, spin: 5200, clubMph: 90, loft: 24, smash: 1.38, dispersion: 0.8 },
  { id: '7I', name: '7 Iron', short: '7i', ballMph: 120, launch: 16.4, spin: 6900, clubMph: 86, loft: 31, smash: 1.36, dispersion: 0.7 },
  { id: '9I', name: '9 Iron', short: '9i', ballMph: 107, launch: 20.6, spin: 8400, clubMph: 81, loft: 39, smash: 1.3, dispersion: 0.6 },
  { id: 'PW', name: 'Pitching Wedge', short: 'PW', ballMph: 99, launch: 24.5, spin: 9200, clubMph: 78, loft: 45, smash: 1.25, dispersion: 0.55 },
  { id: 'SW', name: 'Sand Wedge', short: 'SW', ballMph: 78, launch: 31, spin: 9800, clubMph: 70, loft: 56, smash: 1.12, dispersion: 0.5 },
];

export const clubById = (id) => CLUBS.find((c) => c.id === id) || CLUBS[3];

function gauss(rng = Math.random) {
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
  const p = Math.max(0.15, Math.min(1.1, power));
  const over = Math.max(0, p - 1); // overswing adds speed and chaos
  const miss = 1 - Math.max(0, Math.min(1, contact));
  // speed scales a little less than linearly with power (a 50% swing isn't half distance)
  const speedFactor = Math.pow(p, 0.78) * (1 - 0.22 * miss * miss - 0.05 * miss) * (1 + 0.6 * over);
  const ballMph = club.ballMph * speedFactor * (1 + gauss(rng) * 0.012);
  const thin = miss > 0.55 && rng() < 0.5; // occasional thin/topped strike
  const launch = club.launch * (thin ? 0.45 + 0.2 * rng() : 1 + gauss(rng) * 0.06) * (0.9 + 0.1 * p);
  const spin = club.spin * (thin ? 0.6 : 1) * (0.85 + 0.15 * p) * (1 + gauss(rng) * 0.07);

  const disp = club.dispersion * (0.6 + 2.6 * miss + 3 * over);
  const face = gauss(rng) * 1.6 * disp;
  const path = gauss(rng) * 2.2 * disp;
  const launchDirection = aimDeg + 0.78 * face + 0.22 * path;
  const spinAxis = Math.max(-35, Math.min(35, 3.4 * (face - path) * (club.id === 'DR' || club.id === '3W' ? 1.25 : 1)));

  return {
    ballSpeed: ballMph * MPH,
    launchAngle: launch,
    launchDirection,
    totalSpin: spin,
    spinAxis,
    clubSpeed: (club.clubMph * Math.pow(p, 0.8) * (1 + 0.4 * over)) * MPH,
    faceAngle: face + aimDeg,
    clubPath: path + aimDeg,
    attackAngle: club.id === 'DR' ? 1.5 + gauss(rng) : -3.5 + gauss(rng),
  };
}
