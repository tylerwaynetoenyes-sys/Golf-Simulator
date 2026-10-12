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
export function commentFor({ result, launch, club, outcome }) {
  if (outcome?.ace) return line('ctpAce');
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
