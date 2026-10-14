// Shot commentary: short, factual golf language in a broadcast register. One
// line per shot at most, and only when the shot warrants it; ordinary shots
// usually get nothing. Lines don't repeat until a category is exhausted.

const LINES = {
  bomb: ['Long drive.', 'Well struck off the tee. Plenty of distance.', 'Full carry, finds the short grass.'],
  pure: ['Well struck.', 'Centre of the face.', 'Solid contact, right on line.', 'Flush.'],
  solid: ['Good contact.', 'Solid strike.', 'Playable result.'],
  slice: ['Starts right and keeps moving right.', 'Fades well right of the target.', 'Too much left-to-right spin.'],
  hook: ['Turns over hard to the left.', 'Draws well left of the target.', 'Closed face, finishes left.'],
  topped: ['Thin contact, low trajectory.', 'Caught it thin.', 'Low strike, little carry.'],
  short: ['Comes up short.', 'Under-hit. Short of the target.', 'Needed more club.'],
  water: ['In the water.', 'Finds the water hazard.'],
  oob: ['Out of bounds.', 'Lost in the trees.'],
  ctpAce: ['Hole in one.', 'In the hole from the tee.'],
  ctpKick: ['Tap-in range.', 'Inside a few feet.', 'Stiff to the pin.'],
  ctpClose: ['Inside the circle. A good look at birdie.', 'Close. A makeable putt.'],
  ctpGreen: ['On the green.', 'Green in one.'],
  ctpMiss: ['Misses the green.', 'Off the putting surface.'],
  pb: ['New personal best.'],
  target: ['Centre ring.', 'Right at the target.'],
  ldGrid: ['In the grid.', 'Long and in play.'],
  ldOut: ['Outside the grid.', 'Long, but out of the grid.'],
  // ── course ──
  eagle: ['Eagle.', 'Two under par on the hole.'],
  birdie: ['Birdie.', 'One under on the hole.', 'Birdie. Well played.'],
  par: ['Par.', 'Par. Solid hole.'],
  bogey: ['Bogey.', 'One over on the hole.'],
  double: ['Double bogey.', 'A difficult hole. On to the next tee.'],
  longPutt: ['Long putt holed.', 'Holed from distance.'],
  pickup: ['Ball picked up.', 'Picked up at the maximum score.'],
  sand: ['In the bunker.', 'Finds the sand. Expect less distance on the next shot.'],
  gir: ['Green in regulation.', 'On the green in regulation.'],
  lagMiss: ['Lag finishes short of the hole.', 'Pace was off.'],
  courseWater: ['In the water. Penalty stroke.'],
  rough: ['In the rough. The lie will cost distance and spin.', 'Misses the fairway. Rough.'],
  welcome: ['Range is open. Hit when ready.', 'Conditions are set. Hit when ready.'],
  r10: ['R10 connected. Live shot data on every swing.', 'Launch monitor ready.'],
};

const used = new Map();

export function line(category) {
  const pool = LINES[category];
  if (!pool || !pool.length) return null;
  let seen = used.get(category);
  if (!seen || seen.size >= pool.length) {
    seen = new Set();
    used.set(category, seen);
  }
  let i;
  do { i = Math.floor(Math.random() * pool.length); } while (seen.has(i) && seen.size < pool.length);
  seen.add(i);
  return pool[i];
}

/**
 * Pick a line for a finished shot (or null to stay quiet).
 * @param {object} ctx {result, launch, club, mode, outcome}
 */
const HOLE_LINES = {
  arch: { birdie: 'Birdie beneath the Gateway Arch.' },
  altonlegends: { birdie: 'Birdie at Alton Legends.' },
  cahokia: { birdie: 'Birdie at Monks Mound.' },
  chainofrocks: { bomb: 'Long drive toward the Chain of Rocks bend.' },
  piasa: { birdie: 'Birdie below the Piasa bluff.' },
};

export function commentFor({ result, launch, club, outcome, hole }) {
  if (outcome?.ace) return line('ctpAce');
  const special = hole && HOLE_LINES[hole.lm?.type];
  if (hole) {
    // on the course, putts and lies speak through the outcome; quiet is fine
    const cat = outcome?.category;
    const wet = cat === 'water';
    if (special && Math.random() < 0.6) {
      if (wet && special.water) return special.water;
      if ((cat === 'birdie' || cat === 'eagle') && special.birdie) return special.birdie;
    }
    if (wet) return line('courseWater');
    if (cat === 'par' || cat === 'bogey' || cat === 'gir' || cat === 'lagMiss' || cat === 'sand') return Math.random() < 0.45 ? line(cat) : null;
    if (cat) return line(cat);
    if (result.putt) return null;
    if (outcome?.lie === 'rough' && Math.random() < 0.5) return line('rough');
    const yd = result.carry / 0.9144;
    if ((club?.id === 'DR') && yd > 280 && special?.bomb && Math.random() < 0.6) return special.bomb;
  }
  if (result.lost) return line(result.restSurface === 'water' || result.events.some((e) => e.surface === 'water') ? 'water' : 'oob');
  if (outcome?.isBest && outcome?.bestLine) return line('pb');
  if (outcome?.category) return line(outcome.category);

  const yd = result.carry / 0.9144;
  const offYd = result.carryOffline / 0.9144;
  const wood = club?.id === 'DR' || club?.id === '3W';
  const expected = club ? club.ballMph * 0.44704 : launch.ballSpeed;

  if (launch.launchAngle < 4.5 && yd < (wood ? 160 : 90)) return line('topped');
  if (wood && yd > 280 && Math.abs(offYd) < 25) return line('bomb');
  if (offYd > Math.max(22, yd * 0.12)) return line('slice');
  if (offYd < -Math.max(22, yd * 0.12)) return line('hook');
  if (launch.ballSpeed < expected * 0.78) return Math.random() < 0.7 ? line('short') : null;
  if (Math.abs(offYd) < yd * 0.035 && launch.ballSpeed > expected * 0.96) return line('pure');
  return Math.random() < 0.3 ? line('solid') : null;
}
