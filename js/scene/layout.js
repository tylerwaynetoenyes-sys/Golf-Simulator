// World layout shared by rendering and physics (metres; tee at origin, target
// line down -Z, +X right). The range sits on the Illinois bluffs above Alton;
// the plateau ends at a limestone edge, the Mississippi runs below it, and
// St. Louis + the Gateway Arch glow on the far horizon.
import { YD } from '../core/physics.js';

export const LAYOUT = {
  fairwayHalfWidth: 36, // ~80 yd wide landing area
  roughHalfWidth: 105,
  plateauEnd: -302, // ~330 yd: bluff edge (a big drive can find the river)
  cliffBottom: -316,
  riverY: -58,
  riverNear: -316,
  riverFar: -1520,
  boundsX: 175, // past this: trees / out of bounds
};

// Greens on the range (target practice + scenery). r = radius in metres.
export const GREENS = [
  { id: 'g75', x: -10, z: -75 * YD, r: 9, color: 0x6fd3ff, label: '75' },
  { id: 'g120', x: 14, z: -120 * YD, r: 11, color: 0xffc46b, label: '120' },
  { id: 'g165', x: -16, z: -165 * YD, r: 12, color: 0x9dff8a, label: '165' },
  { id: 'g210', x: 12, z: -210 * YD, r: 14, color: 0xff8f7a, label: '210' },
  { id: 'g255', x: -6, z: -255 * YD, r: 16, color: 0xd6a8ff, label: '255' },
];

// Featured Closest-to-Pin green: repositioned every hole by the mode.
export const CTP_GREEN = { id: 'ctp', x: 0, z: -150 * YD, r: 15, active: false };

export function greenAt(x, z) {
  if (CTP_GREEN.active) {
    const d = Math.hypot(x - CTP_GREEN.x, z - CTP_GREEN.z);
    if (d < CTP_GREEN.r) return CTP_GREEN;
  }
  for (const g of GREENS) {
    if (Math.hypot(x - g.x, z - g.z) < g.r) return g;
  }
  return null;
}

/** Gentle swales across the plateau, flattened on greens and the tee. */
function undulation(x, z) {
  if (z > -12) return 0;
  const fade = Math.min(1, (-z - 12) / 40);
  let h =
    0.55 * Math.sin(x * 0.045 + z * 0.012) * Math.cos(z * 0.021) +
    0.35 * Math.sin(z * 0.034 + 1.3) * Math.cos(x * 0.03 - 0.4) +
    0.9 * Math.max(0, Math.abs(x) - LAYOUT.fairwayHalfWidth) / 70; // rough rises toward the tree lines
  // flatten under greens
  for (const g of GREENS) {
    const d = Math.hypot(x - g.x, z - g.z);
    if (d < g.r + 8) h *= Math.min(1, Math.max(0, (d - g.r) / 8));
  }
  if (CTP_GREEN.active) {
    const d = Math.hypot(x - CTP_GREEN.x, z - CTP_GREEN.z);
    if (d < CTP_GREEN.r + 10) h *= Math.min(1, Math.max(0, (d - CTP_GREEN.r) / 10));
  }
  return h * fade;
}

/** Height of the bluff top / cliff / river at (x, z). */
export function groundHeight(x, z) {
  if (z >= LAYOUT.plateauEnd) return undulation(x, z);
  if (z <= LAYOUT.cliffBottom) return LAYOUT.riverY;
  // limestone face: steep with a slight lip
  const f = (LAYOUT.plateauEnd - z) / (LAYOUT.plateauEnd - LAYOUT.cliffBottom);
  const top = undulation(x, LAYOUT.plateauEnd);
  return top + (LAYOUT.riverY - top) * Math.pow(f, 0.6);
}

/** Terrain query used by the physics engine. */
export function terrain(x, z) {
  const height = groundHeight(x, z);
  let surface;
  if (z < LAYOUT.plateauEnd) surface = 'water';
  else if (Math.abs(x) > LAYOUT.boundsX) surface = 'oob';
  else if (z > -3.5 && Math.abs(x) < 6) surface = 'tee';
  else if (greenAt(x, z)) surface = 'green';
  else if (Math.abs(x) <= LAYOUT.fairwayHalfWidth) surface = 'fairway';
  else surface = 'rough';
  return { height, surface };
}
