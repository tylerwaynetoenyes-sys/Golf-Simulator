// Calibration check: run Trackman PGA Tour reference launches through the
// physics model and compare carry/apex/total. `node tools/calibrate.mjs`
import { simulateShot, MPH, YD } from '../js/core/physics.js';

const REF = [
  // name, ball mph, VLA, spin, target carry yd, target apex yd (Trackman tour averages)
  ['Driver', 171, 10.4, 2545, 282, 35],
  ['3-Wood', 162, 9.3, 3663, 249, 32],
  ['5-Iron', 135, 11.9, 5361, 199, 33],
  ['7-Iron', 123, 16.3, 7124, 176, 32],
  ['9-Iron', 109, 20.4, 8647, 152, 30],
  ['PW', 102, 24.2, 9304, 136, 29],
];
let worst = 0;
console.log('club      carry(target)   apex(target)  total  descent  flight');
for (const [name, mph, vla, spin, tc, ta] of REF) {
  const r = simulateShot({ ballSpeed: mph * MPH, launchAngle: vla, launchDirection: 0, totalSpin: spin, spinAxis: 0 });
  const c = r.carry / YD, a = r.apex.y / YD, tot = r.total / YD;
  worst = Math.max(worst, Math.abs(c - tc) / tc);
  console.log(`${name.padEnd(8)} ${c.toFixed(1).padStart(6)} (${tc})  ${a.toFixed(1).padStart(6)} (${ta})  ${tot.toFixed(1).padStart(6)}  ${r.descentAngle.toFixed(1).padStart(5)}°  ${r.flightTime.toFixed(2)}s`);
}
const fade = simulateShot({ ballSpeed: 160 * MPH, launchAngle: 12, launchDirection: 0, totalSpin: 2800, spinAxis: 10 });
console.log(`DR spin axis +10: offline ${(fade.offline / YD).toFixed(1)} yd (should curve right)`);
console.log(`worst carry error ${(worst * 100).toFixed(1)}%`);
process.exitCode = worst > 0.04 ? 1 : 0;
