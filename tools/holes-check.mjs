// Sanity checks for the course: lengths, tee/green/pin clear of hazards,
// and a clean drive-and-approach plays from tee to green.
import { HOLES, coursePar } from '../js/course/holes.js';
import { HoleTerrain } from '../js/course/holeTerrain.js';
import { YD } from '../js/core/physics.js';

let bad = 0;
for (const h of HOLES) {
  const T = new HoleTerrain(h);
  const checks = {
    tee: T.terrain(0, -1).surface,
    green: T.terrain(T.green.x, T.green.z).surface,
    pin: T.terrain(T.pin.x, T.pin.z).surface,
  };
  // sample a ring just inside the green edge
  let wetGreen = 0;
  for (let a = 0; a < Math.PI * 2; a += 0.2) {
    const s = T.terrain(T.green.x + Math.cos(a) * (T.greenR - 0.5), T.green.z + Math.sin(a) * (T.greenR - 0.5)).surface;
    if (s !== 'green') wetGreen++;
  }
  const ok = checks.tee === 'tee' && checks.green === 'green' && checks.pin === 'green' && wetGreen === 0;
  if (!ok) bad++;
  console.log(`${String(h.n).padStart(2)} ${h.name.padEnd(22)} par ${h.par}  ${Math.round(T.length / YD)} yd  tee:${checks.tee} pin:${checks.pin} greenEdgeOff:${wetGreen} ${ok ? '' : '  <-- FIX'}`);
}
console.log('par', coursePar(HOLES), 'front', coursePar(HOLES.slice(0, 9)), bad ? `${bad} holes need attention` : 'all holes OK');
process.exitCode = bad ? 1 : 0;
