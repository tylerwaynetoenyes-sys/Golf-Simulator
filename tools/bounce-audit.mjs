// Bounce-and-roll audit: Trackman PGA Tour reference launches landing on
// each surface (flat ground), compared with published landing angles and
// target rollout ranges. `node tools/bounce-audit.mjs`
//
// Landing angles: Trackman PGA Tour averages (DR 38°, 3W 43°, 5i 47°,
// 7i 50°, 9i 51°, PW 52°). Rollout ranges are the working targets in
// docs/physics.md (firm-normal fairways, greens around 10.5 Stimp): tour
// rollout figures vary a lot with turf, so these are bands, not points.
import { simulateShot, MPH, YD } from '../js/core/physics.js';

const REF = [
  // name, ball mph, VLA, spin, Trackman land angle
  ['Driver', 171, 10.4, 2545, 38],
  ['3-Wood', 162, 9.3, 3663, 43],
  ['5-Iron', 135, 11.9, 5361, 47],
  ['7-Iron', 123, 16.3, 7124, 50],
  ['9-Iron', 109, 20.4, 8647, 51],
  ['PW', 102, 24.2, 9304, 52],
  ['SW 80y', 68, 30, 9000, null], // a partial wedge: no Trackman landing reference
];

// rollout bands in yards [min, max] per club per surface
const BAND = {
  fairway: { Driver: [12, 28], '3-Wood': [10, 24], '5-Iron': [5, 14], '7-Iron': [3, 10], '9-Iron': [1.5, 6], PW: [0.5, 4.5], 'SW 80y': [-1.5, 2.5] },
  green: { Driver: [8, 25], '3-Wood': [6, 18], '5-Iron': [3, 9.5], '7-Iron': [1, 6], '9-Iron': [0, 4], PW: [-1.5, 3], 'SW 80y': [-3, 1.5] },
  rough: { Driver: [3, 14], '3-Wood': [2, 11], '5-Iron': [1, 6], '7-Iron': [0.5, 4], '9-Iron': [0, 2.5], PW: [0, 2], 'SW 80y': [0, 1.5] },
  sand: { Driver: [0, 3], '3-Wood': [0, 3], '5-Iron': [0, 2], '7-Iron': [0, 1.5], '9-Iron': [0, 1], PW: [0, 1], 'SW 80y': [0, 1] },
};

let bad = 0;
const rows = [];
for (const surface of Object.keys(BAND)) {
  console.log(`\n${surface.toUpperCase()}`);
  console.log('club      carry  land°(TM)   roll yd  [band]       bounces  1st hop');
  for (const [name, mph, vla, spin, land] of REF) {
    const r = simulateShot(
      { ballSpeed: mph * MPH, launchAngle: vla, launchDirection: 0, totalSpin: spin, spinAxis: 0 },
      { terrain: () => ({ height: 0, surface }) },
    );
    const roll = (r.total - r.carry) / YD;
    const lands = r.events.filter((e) => e.type === 'land' || e.type === 'bounce');
    // height of the first hop: highest sample between the first two impacts
    let hop = 0;
    if (lands.length > 1) for (const s of r.samples) if (s.t > lands[0].t && s.t < lands[1].t) hop = Math.max(hop, s.y);
    const [lo, hi] = BAND[surface][name];
    const ok = roll >= lo && roll <= hi;
    const landOk = surface !== 'fairway' || land == null || Math.abs(r.descentAngle - land) <= 4;
    if (!ok || !landOk) bad++;
    rows.push({ surface, name, roll, ok });
    console.log(`${name.padEnd(8)} ${(r.carry / YD).toFixed(0).padStart(5)}  ${r.descentAngle.toFixed(0).padStart(4)} (${land ?? '–'})  ${roll.toFixed(1).padStart(7)}  [${lo}, ${hi}]`.padEnd(54)
      + `${String(lands.length).padStart(4)}   ${(hop * 100).toFixed(0).padStart(4)} cm${ok && landOk ? '' : '   <-- check'}`);
  }
}
console.log(bad ? `\n${bad} results outside their bands` : '\nall surfaces within bands');
process.exitCode = bad ? 1 : 0;
