// Shot commentary. Dry, brief, local. One line per shot at most, and only when
// the shot earned it; ordinary shots often get nothing, which keeps the good
// lines landing. Lines never repeat until a category is exhausted.

const LINES = {
  bomb: [
    "That's a solid Mississippi mile.",
    'Somewhere in Missouri, a man just looked up.',
    'Barge captains noticed that one.',
    "The Arch doesn't clap. It's thinking about it.",
    'Long enough to need a toll.',
    'That one cleared county lines.',
  ],
  pure: [
    'Clean. The bluffs approve.',
    'Quietly excellent.',
    'Textbook. Nobody wrote the textbook, but still.',
    'That plays anywhere on the Great River Road.',
    "Center face. You'll want to remember that feeling.",
    'Pure. No notes.',
  ],
  solid: [
    'Respectable.',
    "That'll do. That'll do fine.",
    'Honest work.',
    'A perfectly reasonable golf shot.',
  ],
  slice: [
    "Headed for the Missouri side. No passport needed.",
    "Right side's mostly air and regret.",
    'Fade, technically. The way the river is technically a creek.',
    'That one wanted to see the bridge.',
    'Barge traffic, heads up.',
  ],
  hook: [
    'Hard left, toward the grain elevators.',
    'Pulled it. The Piasa saw that.',
    'Left. Like the casino crowd at 2 a.m.',
    'That one turned over faster than the river.',
  ],
  topped: [
    "Arch is still standing. Your ball isn't.",
    'That one stayed in Illinois.',
    'Worm burner. The worms have filed a complaint.',
    'Low and purposeful. Mostly low.',
    'Grounded. In every sense.',
  ],
  short: [
    'Short. Sincere, but short.',
    "A lay-up nobody asked for.",
    'Some swings are just conversations.',
  ],
  water: [
    'Into the Mississippi. It has seen worse.',
    'The river takes its cut.',
    'Splash. A catfish is reconsidering its evening.',
    'On its way to New Orleans. Making good time.',
    "That's a solid Mississippi mile. Unfortunately, literally.",
  ],
  oob: [
    'Into the trees. They were here first.',
    "Lost in the woods. It's a nice night for it.",
    "Out of bounds. Even the bluffs couldn't hold it.",
  ],
  ctpAce: [
    'In. The river goes quiet.',
    'Ace. The Arch would like a word.',
    'Hole in one. Drinks are on you, at reasonable Alton prices.',
  ],
  ctpKick: [
    'Kick-in range. Literally.',
    'Dart. Somebody tell the Arch.',
    "That's a gimme in any county.",
    'Stiff. Like the breeze off the water.',
  ],
  ctpClose: [
    'Puttable. Respectably puttable.',
    'Inside the circle. Mostly sincere applause.',
    'Birdie look, if you can putt in the dark.',
  ],
  ctpGreen: [
    "On the dance floor. Somebody's got to be.",
    "Green's green. You're on it.",
    'Two-putt territory. Bring a flashlight.',
  ],
  ctpMiss: [
    'Wrong green. Right effort.',
    "The pin's over there. For future reference.",
    'Close, in a regional sense.',
  ],
  pb: [
    'New personal best. Write it on something.',
    'Personal best. The bluffs will remember.',
    "That's a new number. Don't get used to it.",
  ],
  target: [
    'Bullseye. The target had it coming.',
    'Center ring. Unreasonably accurate.',
  ],
  ldGrid: [
    'In the grid. Long and legal.',
    'Fairway finder with a little attitude.',
  ],
  ldOut: [
    "Outside the grid. Missouri doesn't count.",
    'Long, but the rules are the rules.',
  ],
  // ── course ──
  eagle: [
    'Eagle. The Piasa spread its wings for that one.',
    'Two under. Somebody check the scorecard twice.',
    "Eagle. That's going in the newsletter.",
  ],
  birdie: [
    'Birdie. Tidy.',
    'One under. The landmarks nod politely.',
    "Birdie. Act like you've been here before.",
    'Red number. Well played.',
  ],
  par: [
    'Par. Nobody gets hurt.',
    'Par. The backbone of civilization.',
    'Fours are fine. Fours are honest.',
  ],
  bogey: [
    'Bogey. It happens to rivers too.',
    'One over. Plenty of golf left.',
  ],
  double: [
    'That hole owes you one.',
    'A number. Next tee.',
    'Moving on. The next landmark is friendlier.',
  ],
  longPutt: [
    'From downtown. Way downtown.',
    'Rolled it in from the next zip code.',
    'Drained it. The green had no say.',
  ],
  pickup: [
    'Picked up. Mercy is a virtue.',
    'Pocketed. Some holes are just scenery.',
  ],
  sand: [
    'Beach. The Mississippi has those too.',
    'In the sand. Dig in.',
  ],
  gir: [
    'On in regulation. Very civilized.',
    'Green hit. Putter out.',
  ],
  lagMiss: [
    'Lagged it. Mostly.',
    'Speed was a suggestion.',
  ],
  courseWater: [
    'Wet. One-stroke tax.',
    'The water hazard did its job.',
    'Splash. Drop it and carry on.',
  ],
  welcome: [
    'Lights are on. River\'s running. Hit when ready.',
    'Range is open. The Arch is watching. Loosely.',
  ],
  r10: [
    'R10 is live. Every swing counts now.',
    'Radar armed. No more hiding behind demo mode.',
  ],
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
  arch: { birdie: 'Birdie under the Arch. Very on brand.', water: 'The Arch has seen a lot of balls go in that river.' },
  wadlow: { bomb: 'Long. Robert Wadlow would still have out-walked it.', birdie: 'Birdie. Standing tall, 8 feet 11 tall.' },
  cahokia: { birdie: 'A thousand years of history, and one tidy birdie.' },
  chainofrocks: { bomb: "Long enough to make the bridge's turn." },
  piasa: { birdie: 'The Piasa approves. Probably.' },
  riverboat: { water: 'Paddlewheel optional.' },
  locks: { water: 'Through the locks without a ticket.' },
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
