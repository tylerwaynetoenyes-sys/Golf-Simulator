// Party mode: drinking-game prompts on the round, off by default (Settings).
// Any drink counts (water, soda, a beer if you're of age); nobody has to
// drink, and a forfeit can always be a push-up or a lap of the room instead.
// Rules fire on what actually happened: the shot's outcome category from the
// course mode (water, out of bounds, bunker, birdie, eagle, ace, three-putt)
// plus each hole's own house rule (`hole.party`: {rule, on, call}), which the
// Saint Louis Zoo course writes for every hole.

/** House rules that hold on every course: [category, headline, sub]. */
const HOUSE = {
  water: ['Splash', 'Water ball: take a drink'],
  oob: ['Out of bounds', 'OB: take a drink, and hit again'],
  sand: ['Beach day', 'In the bunker: a sip while you dig in'],
  birdie: ['Birdie', 'Hand out a drink to anyone you like'],
  eagle: ['Eagle', 'Hand out two drinks'],
  ctpAce: ['HOLE IN ONE', 'Everyone else finishes their drink'],
  pickup: ['Picked up', 'Two sips for the pick-up'],
};

/** Prompts for one shot's outcome on this hole: [{headline, sub}]. */
export function partyCalls(outcome, hole, player) {
  if (!outcome) return [];
  const out = [];
  const who = player?.name ? `${player.name}: ` : '';
  const h = HOUSE[outcome.category];
  if (h) out.push({ headline: h[0], sub: who + h[1] });
  if (outcome.finish?.putts === 3) out.push({ headline: 'Three-putt', sub: `${who}three sips` });
  // the hole's own rule, when its trigger comes up
  const p = hole?.party;
  if (p && p.on && (p.on === outcome.category || (p.on === 'threePutt' && outcome.finish?.putts === 3) || (p.on === 'holed' && outcome.holed) || (p.on === 'green' && (outcome.category === 'gir' || outcome.category === 'ctpGreen')))) {
    out.push({ headline: p.title || hole.name, sub: who + p.call });
  }
  return out;
}

/** The line the hole card shows when party mode is on. */
export function partyRule(hole) {
  return hole?.party?.rule ? `Party rule · ${hole.party.rule}` : 'Party rule · water, OB or a three-putt: drink · birdie: hand one out';
}
