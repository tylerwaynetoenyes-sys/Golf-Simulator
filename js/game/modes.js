// Game modes. Each mode configures the range, decides wind, and turns a
// simulated shot into an outcome (headline, score, PBs, commentary category).
//
// Interface:
//   start()                     set up scene + state
//   stop()
//   status()                    -> {title, detail, chips[]} for the HUD
//   wind()                      -> {x, z} m/s for the next shot
//   evaluate(result, launch, club) -> outcome (see Game.applyOutcome)
//   roundOver                   true when the mode wants a summary + restart
import { YD } from '../core/physics.js';
import { CTP_GREEN, GREENS, terrain } from '../scene/layout.js';
import { store } from '../data/store.js';
import { proximity, dist, distUnit } from '../core/units.js';
import { CLUBS } from '../data/clubs.js';

const MPH = 0.44704;

function windFromMph(mph, fromDeg) {
  // fromDeg: 0 = into the player's face (from down-range), 90 = from the right
  const a = (fromDeg * Math.PI) / 180;
  const s = mph * MPH;
  return { x: -Math.sin(a) * s, z: Math.cos(a) * s, mph, fromDeg };
}

class BaseMode {
  constructor(game) { this.game = game; this.roundOver = false; this._wind = { x: 0, z: 0, mph: 0, fromDeg: 0 }; }
  start() {}
  stop() {}
  wind() { return this._wind; }
  status() { return { title: this.name, detail: '', chips: [] }; }
  suggestedClub() { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────

export class RangeMode extends BaseMode {
  constructor(game) {
    super(game);
    this.id = 'range';
    this.name = 'Driving Range';
    this.blurb = 'Free practice. Every number, every shot, no pressure.';
    this.count = 0;
  }

  start() {
    CTP_GREEN.active = false;
    this.game.world.setCtp(false);
    this.game.world.range.highlightGreen(null, false);
    this.count = 0;
    this._wind = windFromMph(0, 0);
  }

  status() {
    return { title: 'Driving Range', detail: this.count ? `${this.count} shot${this.count === 1 ? '' : 's'} this session` : 'Free practice', chips: [] };
  }

  evaluate(result, launch, club) {
    this.count++;
    const bests = [];
    if (!result.lost) {
      const k = `range.carry.${club.id}`;
      const r = store.submitBest(k, result.carry, 'max', { club: club.id });
      if (r.isBest && !r.first) bests.push({ label: `${club.short} carry`, value: `${dist(result.carry)} ${distUnit()}` });
      if (club.id === 'DR') {
        const r2 = store.submitBest('range.longestDrive', result.total, 'max');
        if (r2.isBest && !r2.first) bests.push({ label: 'Longest drive', value: `${dist(result.total)} ${distUnit()}` });
      }
    }
    const rs = store.submitBest('range.ballSpeed', launch.ballSpeed, 'max');
    if (rs.isBest && !rs.first && launch.ballSpeed > 40) bests.push({ label: 'Ball speed', value: `${(launch.ballSpeed / MPH).toFixed(1)} mph` });
    return { bests, isBest: bests.length > 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const CTP_RANGES = {
  short: [70, 120],
  mixed: [85, 200],
  long: [160, 215],
};

export class ClosestToPinMode extends BaseMode {
  constructor(game) {
    super(game);
    this.id = 'ctp';
    this.name = 'Closest to Pin';
    this.blurb = 'Five holes, five swings. Proximity is everything.';
    this.holes = 5;
    this.difficulty = 'mixed';
  }

  start(opts = {}) {
    if (opts.difficulty) this.difficulty = opts.difficulty;
    this.hole = 0;
    this.scores = [];
    this.roundOver = false;
    this.game.world.range.setDecorVisible(false);
    this._nextHole();
  }

  stop() {
    CTP_GREEN.active = false;
    this.game.world.setCtp(false);
    this.game.world.range.setDecorVisible(true);
  }

  _nextHole() {
    this.hole++;
    const [lo, hi] = CTP_RANGES[this.difficulty] || CTP_RANGES.mixed;
    // spread holes across the range of distances so a round uses several clubs
    const order = [0.15, 0.85, 0.45, 1.0, 0.0];
    const f = order[(this.hole - 1) % order.length] * 0.85 + Math.random() * 0.15;
    this.yards = Math.round(lo + (hi - lo) * f);
    const z = -this.yards * YD;
    // Pin somewhere across the fairway, clear of the decorative target greens.
    const clearOf = (x) => GREENS.every((g) => Math.hypot(g.x - x, g.z - z) > g.r + CTP_GREEN.r + 3);
    let x = null;
    for (let tries = 0; tries < 60 && x === null; tries++) {
      const cand = (Math.random() - 0.5) * 48;
      if (clearOf(cand)) x = cand;
    }
    if (x === null) {
      const near = GREENS.reduce((a, g) => (Math.abs(g.z - z) < Math.abs(a.z - z) ? g : a));
      x = near.x > 0 ? -22 : 22;
    }
    CTP_GREEN.x = x;
    CTP_GREEN.z = z;
    CTP_GREEN.active = true;
    this.pin = { x, z };
    this.game.world.setCtp(true);
    const calm = Math.random() < 0.25;
    this._wind = windFromMph(calm ? 0 : 2 + Math.random() * 9, Math.random() * 360);
    // distance plays: tell the player the real yardage to the pin
    this.playsYards = Math.hypot(x, z) / YD;
  }

  suggestedClub() {
    // pick the club whose stock carry is closest to the hole
    const want = this.playsYards;
    const carries = { DR: 255, '3W': 235, '5I': 195, '7I': 168, '9I': 145, PW: 128, SW: 95 };
    let best = CLUBS[0], bd = Infinity;
    for (const c of CLUBS) {
      const d = Math.abs(carries[c.id] - want);
      if (d < bd) { bd = d; best = c; }
    }
    return best.id;
  }

  status() {
    if (this.roundOver) return { title: 'Closest to Pin', detail: 'Round complete', chips: [] };
    const w = this._wind;
    return {
      title: `Closest to Pin · Hole ${this.hole} of ${this.holes}`,
      detail: `${dist(Math.hypot(this.pin.x, this.pin.z))} ${distUnit()} to the pin`,
      chips: [
        { kind: 'wind', mph: w.mph, fromDeg: w.fromDeg },
        { kind: 'score', label: 'Score', value: this.scores.reduce((a, s) => a + s.points, 0) },
      ],
    };
  }

  evaluate(result) {
    const pin = this.pin;
    let prox = Infinity;
    let holed = false;
    if (!result.lost) {
      prox = Math.hypot(result.rest.x - pin.x, result.rest.z - pin.z);
      // did it roll over the cup slowly enough to drop?
      const s = result.samples;
      for (let i = 1; i < s.length; i++) {
        if (s[i].phase !== 'roll' && s[i].phase !== 'impact') continue;
        const d = Math.hypot(s[i].x - pin.x, s[i].z - pin.z);
        if (d < 0.075) {
          const v = Math.hypot(s[i].x - s[i - 1].x, s[i].z - s[i - 1].z) / Math.max(1e-3, s[i].t - s[i - 1].t);
          if (v < 1.7) { holed = true; result.holedAt = { t: s[i].t, x: pin.x, z: pin.z }; break; }
        }
      }
      if (holed) prox = 0;
    }
    const onGreen = !result.lost && terrain(result.rest.x, result.rest.z).surface === 'green';
    const points = holed ? 250 : Number.isFinite(prox) ? Math.round(100 * Math.exp(-prox / 6)) : 0;
    this.scores.push({ hole: this.hole, yards: this.yards, prox, points, holed });

    const bests = [];
    let isBest = false;
    if (Number.isFinite(prox)) {
      const r = store.submitBest('ctp.closest', prox, 'min');
      if (r.isBest && !r.first) { isBest = true; bests.push({ label: 'Closest ever', value: holed ? 'Holed' : proximity(prox) }); }
    }
    let category = 'ctpMiss';
    if (holed) category = 'ctpAce';
    else if (prox < 1) category = 'ctpKick';
    else if (prox < 3.5) category = 'ctpClose';
    else if (onGreen) category = 'ctpGreen';

    const out = {
      headline: holed ? 'HOLE IN ONE' : Number.isFinite(prox) ? proximity(prox) : result.lost ? 'Lost ball' : '—',
      sub: holed ? 'Into the cup' : Number.isFinite(prox) ? 'from the pin' : 'No score',
      points,
      ace: holed,
      category,
      bests,
      isBest,
      pin,
    };

    if (this.hole >= this.holes) {
      this.roundOver = true;
      const total = this.scores.reduce((a, s) => a + s.points, 0);
      const finite = this.scores.filter((s) => Number.isFinite(s.prox));
      const avg = finite.length ? finite.reduce((a, s) => a + s.prox, 0) / finite.length : Infinity;
      const rr = store.submitBest('ctp.round', total, 'max');
      if (Number.isFinite(avg)) store.submitBest('ctp.avg', avg, 'min');
      out.summary = {
        title: 'Round complete',
        score: total,
        scoreLabel: 'points',
        isBest: rr.isBest && !rr.first,
        rows: this.scores.map((s) => ({
          label: `Hole ${s.hole} · ${s.yards} yd`,
          value: s.holed ? 'Ace' : Number.isFinite(s.prox) ? proximity(s.prox) : 'Lost',
          extra: `${s.points} pts`,
        })),
        footer: Number.isFinite(avg) ? `Average proximity ${proximity(avg)}` : '',
        verdict: total >= 380 ? 'Tour-level dart throwing.' : total >= 250 ? 'Very tidy. The pin felt it.' : total >= 140 ? 'Solid round. The greens were kind.' : 'The pins survived. They usually do.',
      };
    } else {
      out.advance = () => this._nextHole();
    }
    return out;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export class TargetMode extends BaseMode {
  constructor(game) {
    super(game);
    this.id = 'targets';
    this.name = 'Target Practice';
    this.blurb = 'Three targets, three balls each. Land it in the rings.';
  }

  start() {
    CTP_GREEN.active = false;
    this.game.world.setCtp(false);
    this.sequence = ['g120', 'g165', 'g210'].flatMap((id) => [id, id, id]);
    this.i = 0;
    this.total = 0;
    this.roundOver = false;
    this._wind = windFromMph(Math.random() * 5, Math.random() * 360);
    this._highlight();
  }

  stop() { this.game.world.range.highlightGreen(null, false); }

  get target() { return GREENS.find((g) => g.id === this.sequence[this.i]); }

  _highlight() { this.game.world.range.highlightGreen(this.sequence[this.i], true); }

  suggestedClub() {
    const yd = Math.hypot(this.target.x, this.target.z) / YD;
    return yd > 190 ? '5I' : yd > 150 ? '7I' : yd > 125 ? '9I' : 'PW';
  }

  status() {
    if (this.roundOver) return { title: 'Target Practice', detail: 'Complete', chips: [] };
    const g = this.target;
    return {
      title: `Target Practice · Ball ${this.i + 1} of ${this.sequence.length}`,
      detail: `${dist(Math.hypot(g.x, g.z))} ${distUnit()} target`,
      chips: [{ kind: 'wind', mph: this._wind.mph, fromDeg: this._wind.fromDeg }, { kind: 'score', label: 'Score', value: this.total }],
    };
  }

  evaluate(result) {
    const g = this.target;
    const lp = result.carryPoint || result.rest;
    const d = lp ? Math.hypot(lp.x - g.x, lp.z - g.z) : Infinity;
    let points = 0, ring = 'Miss';
    if (d < g.r * 0.25) { points = 50; ring = 'Bullseye'; }
    else if (d < g.r * 0.55) { points = 30; ring = 'Inner ring'; }
    else if (d < g.r) { points = 15; ring = 'On target'; }
    else if (d < g.r * 1.7) { points = 5; ring = 'Near miss'; }
    this.total += points;
    const out = {
      headline: ring,
      sub: Number.isFinite(d) ? `landed ${proximity(d)} from center` : '',
      points,
      category: points === 50 ? 'target' : null,
      bests: [],
      landTarget: g,
    };
    this.i++;
    if (this.i >= this.sequence.length) {
      this.roundOver = true;
      const r = store.submitBest('targets.score', this.total, 'max');
      out.summary = {
        title: 'Targets complete',
        score: this.total,
        scoreLabel: `of ${this.sequence.length * 50}`,
        isBest: r.isBest && !r.first,
        rows: [],
        verdict: this.total >= 300 ? 'Surgical.' : this.total >= 180 ? 'Dialed in.' : this.total >= 90 ? 'Getting there.' : 'The targets are fine. Physically and emotionally.',
      };
    } else {
      out.advance = () => this._highlight();
    }
    return out;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export class LongestDriveMode extends BaseMode {
  constructor(game) {
    super(game);
    this.id = 'ld';
    this.name = 'Longest Drive';
    this.blurb = 'Six balls. Stay in the grid. Longest one counts.';
    this.balls = 6;
    this.gridHalf = 25 * YD;
  }

  start() {
    CTP_GREEN.active = false;
    this.game.world.setCtp(false);
    this.n = 0;
    this.best = null;
    this.roundOver = false;
    this._wind = windFromMph(3 + Math.random() * 7, 160 + Math.random() * 40); // usually helping
  }

  suggestedClub() { return 'DR'; }

  status() {
    if (this.roundOver) return { title: 'Longest Drive', detail: 'Complete', chips: [] };
    return {
      title: `Longest Drive · Ball ${this.n + 1} of ${this.balls}`,
      detail: this.best ? `Leader ${dist(this.best)} ${distUnit()}` : 'Grid is 50 yd wide',
      chips: [{ kind: 'wind', mph: this._wind.mph, fromDeg: this._wind.fromDeg }],
    };
  }

  evaluate(result) {
    this.n++;
    const inGrid = !result.lost && Math.abs(result.rest.x) <= this.gridHalf;
    let isBest = false;
    const bests = [];
    if (inGrid && (this.best == null || result.total > this.best)) this.best = result.total;
    if (inGrid) {
      const r = store.submitBest('ld.best', result.total, 'max');
      if (r.isBest && !r.first) { isBest = true; bests.push({ label: 'Longest drive', value: `${dist(result.total)} ${distUnit()}` }); }
    }
    const out = {
      headline: inGrid ? `${dist(result.total)} ${distUnit()}` : 'Out of grid',
      sub: inGrid ? (this.best === result.total ? 'New leader' : `Leader ${dist(this.best)} ${distUnit()}`) : 'Does not count',
      category: inGrid ? (result.total / YD > 300 ? 'bomb' : 'ldGrid') : 'ldOut',
      bests,
      isBest,
    };
    if (this.n >= this.balls) {
      this.roundOver = true;
      out.summary = {
        title: 'Long drive final',
        score: this.best ? dist(this.best) : '—',
        scoreLabel: distUnit(),
        isBest,
        rows: [],
        verdict: this.best && this.best / YD > 320 ? 'Genuinely large.' : this.best && this.best / YD > 270 ? 'Plenty. The grid agrees.' : 'Distance is a journey.',
      };
    }
    return out;
  }
}

export function createModes(game) {
  return {
    range: new RangeMode(game),
    ctp: new ClosestToPinMode(game),
    targets: new TargetMode(game),
    ld: new LongestDriveMode(game),
  };
}
