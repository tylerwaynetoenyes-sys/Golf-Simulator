// Practice-ground game modes, all multiplayer-aware (1–6 players, optional
// teams). Each mode configures the range, decides whose turn it is, turns a
// simulated shot into an outcome, and reports a leaderboard.
//
// Interface:
//   start(opts) / stop()
//   currentPlayer()               -> roster player whose shot is next
//   status()                      -> {title, detail, chips[]} for the HUD
//   wind()                        -> {x, z, mph, fromDeg} for the next shot
//   evaluate(result, launch, club, player) -> outcome
//   leaderboard()                 -> {title, unit, rows[], teams[]} | null
//   markers()                     -> balls to leave on the ground [{x,y,z,color,name}]
//   roundOver                     true when the mode wants a summary + restart
import { YD } from '../core/physics.js';
import { CTP_GREEN, GREENS, terrain } from '../scene/layout.js';
import { store } from '../data/store.js';
import { proximity, dist, distUnit } from '../core/units.js';
import { CLUBS } from '../data/clubs.js';

const STOCK_CARRY = { DR: 255, '3W': 235, '5I': 195, '7I': 168, '9I': 145, PW: 128, SW: 95 };

export function clubForYards(yards) {
  let best = CLUBS[0], bd = Infinity;
  for (const c of CLUBS) {
    const d = Math.abs(STOCK_CARRY[c.id] - yards);
    if (d < bd) { bd = d; best = c; }
  }
  return best.id;
}

class BaseMode {
  constructor(game) {
    this.game = game;
    this.roundOver = false;
    this.k = 0; // shots taken this round (all players)
  }
  get roster() { return this.game.roster; }
  get players() { return this.game.roster.players; }
  start() {}
  stop() {}
  wind(headingDeg = 0) { return this.game.world.env.wind(headingDeg); }
  currentPlayer() { return this.players[this.k % this.players.length]; }
  suggestedClub() { return null; }
  leaderboard() { return null; }
  markers() { return []; }
  windChip() {
    const w = this.game.world.env;
    return { kind: 'wind', mph: w.weather.windMph, fromDeg: w.windFromDeg };
  }
  /** Team rows from per-player values (sum or best). */
  teamRows(valueOf, { combine = 'sum', higherBetter = true, fmt = (v) => String(v) } = {}) {
    return this.roster.teams().map((t) => {
      const vals = t.members.map(valueOf).filter((v) => v != null && Number.isFinite(v));
      let v = null;
      if (vals.length) v = combine === 'sum' ? vals.reduce((a, b) => a + b, 0) : (higherBetter ? Math.max(...vals) : Math.min(...vals));
      return { name: `Team ${t.name}`, color: t.color, value: v, display: v == null ? '—' : fmt(v), members: t.members.map((m) => m.name) };
    }).sort((a, b) => (a.value == null) - (b.value == null) || (higherBetter ? b.value - a.value : a.value - b.value));
  }
  winnerLine(rows, teams) {
    if (teams && teams.length > 1 && teams[0].value != null) {
      const tie = teams[1] && teams[1].value === teams[0].value;
      return tie ? 'All square between the top teams.' : `${teams[0].name} takes it.`;
    }
    if (rows.length > 1 && rows[0].value != null) {
      const tie = rows[1] && rows[1].value === rows[0].value;
      return tie ? `${rows[0].name} and ${rows[1].name} share the top.` : `${rows[0].name} wins.`;
    }
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export class RangeMode extends BaseMode {
  constructor(game) {
    super(game);
    this.id = 'range';
    this.name = 'Driving Range';
    this.blurb = 'Free practice. Every number, every shot, no pressure.';
    this.stats = new Map();
  }

  start() {
    CTP_GREEN.active = false;
    this.game.world.setCtp(false);
    this.game.world.range.highlightGreen(null, false);
    this.k = 0;
    this.stats = new Map();
  }

  currentPlayer() {
    if (!this.roster.rotateRange) return this.players[this._fixed ?? 0] || this.players[0];
    return this.players[this.k % this.players.length];
  }

  status() {
    const n = this.k;
    return {
      title: 'Driving Range',
      detail: n ? `${n} shot${n === 1 ? '' : 's'} this session` : 'Free practice',
      chips: [this.windChip()],
    };
  }

  evaluate(result, launch, club, player) {
    this.k++;
    const s = this.stats.get(player.id) || { shots: 0, longest: null, bestCarry: null };
    s.shots++;
    if (!result.lost && club.id === 'DR') s.longest = Math.max(s.longest ?? 0, result.total);
    if (!result.lost) s.bestCarry = Math.max(s.bestCarry ?? 0, result.carry);
    this.stats.set(player.id, s);
    return { bests: [] };
  }

  leaderboard() {
    if (!this.roster.multi) return null;
    // longest carry with any club, so every swing can get on the board
    const rows = this.players.map((p) => {
      const s = this.stats.get(p.id);
      const v = s?.bestCarry ?? null;
      const sub = s ? `${s.shots} shot${s.shots === 1 ? '' : 's'}${s.longest ? ` · drive ${dist(s.longest)}` : ''}` : 'no shots yet';
      return { id: p.id, name: p.name, color: p.color, value: v, display: v ? `${dist(v)} ${distUnit()}` : '—', sub };
    }).sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
    return { title: 'Longest carry', rows, teams: this.teamRows((p) => this.stats.get(p.id)?.bestCarry ?? null, { combine: 'best', fmt: (v) => `${dist(v)} ${distUnit()}` }) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const CTP_RANGES = { short: [70, 120], mixed: [85, 200], long: [160, 215] };

export class ClosestToPinMode extends BaseMode {
  constructor(game) {
    super(game);
    this.id = 'ctp';
    this.name = 'Closest to Pin';
    this.blurb = 'Five holes, one swing each. Proximity is everything.';
    this.holes = 5;
    this.difficulty = 'mixed';
  }

  start(opts = {}) {
    if (opts.difficulty) this.difficulty = opts.difficulty;
    this.hole = 0;
    this.k = 0;
    this.scores = new Map(this.players.map((p) => [p.id, []]));
    this.holeBalls = [];
    this.roundOver = false;
    this.game.world.range.setDecorVisible(false);
    this._nextHole();
  }

  stop() {
    CTP_GREEN.active = false;
    this.game.world.setCtp(false);
    this.game.world.range.setDecorVisible(true);
  }

  get shotIdx() { return this.k % this.players.length; }
  currentPlayer() { return this.players[this.shotIdx]; }

  _nextHole() {
    this.hole++;
    this.holeBalls = [];
    const [lo, hi] = CTP_RANGES[this.difficulty] || CTP_RANGES.mixed;
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
    this.game.world.env.setWindDirection(Math.random() * 360);
    this.playsYards = Math.hypot(x, z) / YD;
  }

  suggestedClub() { return clubForYards(this.playsYards); }

  total(pid) { return (this.scores.get(pid) || []).reduce((a, s) => a + s.points, 0); }

  status() {
    if (this.roundOver) return { title: 'Closest to Pin', detail: 'Round complete', chips: [] };
    const chips = [this.windChip()];
    if (!this.roster.multi) chips.push({ kind: 'score', label: 'Score', value: this.total(this.players[0].id) });
    return {
      title: `Closest to Pin · Hole ${this.hole} of ${this.holes}`,
      detail: `${dist(Math.hypot(this.pin.x, this.pin.z))} ${distUnit()} to the pin`,
      chips,
    };
  }

  markers() { return this.holeBalls; }

  evaluate(result, launch, club, player) {
    const pin = this.pin;
    let prox = Infinity;
    let holed = false;
    if (!result.lost) {
      prox = Math.hypot(result.rest.x - pin.x, result.rest.z - pin.z);
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
    this.scores.get(player.id)?.push({ hole: this.hole, yards: this.yards, prox, points, holed });
    if (!result.lost && !holed) this.holeBalls.push({ x: result.rest.x, y: result.rest.y, z: result.rest.z, color: player.color, name: player.name });

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

    // leading the hole?
    const holeBest = this.players.map((p) => (this.scores.get(p.id) || []).find((s) => s.hole === this.hole)).filter(Boolean);
    const leads = this.roster.multi && Number.isFinite(prox) && holeBest.every((s) => s.prox >= prox);

    const out = {
      headline: holed ? 'HOLE IN ONE' : Number.isFinite(prox) ? proximity(prox) : result.lost ? 'Lost ball' : '—',
      sub: holed ? 'Into the cup' : Number.isFinite(prox) ? (leads && holeBest.length > 1 ? 'from the pin · leads the hole' : 'from the pin') : 'No score',
      points, ace: holed, category, bests, isBest, pin,
    };

    this.k++;
    const holeDone = this.shotIdx === 0;
    if (holeDone && this.hole >= this.holes) {
      this.roundOver = true;
      out.summary = this._summary();
    } else if (holeDone) {
      out.advance = () => this._nextHole();
    }
    return out;
  }

  leaderboard() {
    const rows = this.players.map((p) => {
      const sc = this.scores.get(p.id) || [];
      const best = sc.filter((s) => Number.isFinite(s.prox)).reduce((a, s) => Math.min(a, s.prox), Infinity);
      return { id: p.id, name: p.name, color: p.color, value: this.total(p.id), display: `${this.total(p.id)} pts`, sub: Number.isFinite(best) ? `best ${best === 0 ? 'ace' : proximity(best)}` : '' };
    }).sort((a, b) => b.value - a.value);
    return { title: 'Closest to Pin', rows, teams: this.teamRows((p) => this.total(p.id), { fmt: (v) => `${v} pts` }) };
  }

  _summary() {
    const lb = this.leaderboard();
    const solo = !this.roster.multi;
    const me = this.players[0];
    const total = this.total(me.id);
    const sc = this.scores.get(me.id) || [];
    const finite = sc.filter((s) => Number.isFinite(s.prox));
    const avg = finite.length ? finite.reduce((a, s) => a + s.prox, 0) / finite.length : Infinity;
    const rr = solo ? store.submitBest('ctp.round', total, 'max') : { isBest: false };
    if (solo && Number.isFinite(avg)) store.submitBest('ctp.avg', avg, 'min');
    return {
      title: 'Round complete',
      score: solo ? total : lb.rows[0].display.replace(' pts', ''),
      scoreLabel: solo ? 'points' : `points · ${lb.rows[0].name}`,
      isBest: rr.isBest && !rr.first,
      rows: solo
        ? sc.map((s) => ({ label: `Hole ${s.hole} · ${s.yards} yd`, value: s.holed ? 'Ace' : Number.isFinite(s.prox) ? proximity(s.prox) : 'Lost', extra: `${s.points} pts` }))
        : lb.rows.map((r, i) => ({ label: `${i + 1}. ${r.name}`, value: r.display, extra: r.sub, color: r.color })),
      teams: lb.teams,
      footer: solo && Number.isFinite(avg) ? `Average proximity ${proximity(avg)}` : '',
      verdict: solo
        ? total >= 380 ? 'Tour-level dart throwing.' : total >= 250 ? 'Very tidy. The pin felt it.' : total >= 140 ? 'Solid round. The greens were kind.' : 'The pins survived. They usually do.'
        : this.winnerLine(lb.rows, lb.teams),
    };
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
    this.k = 0;
    this.totals = new Map(this.players.map((p) => [p.id, 0]));
    this.roundOver = false;
    this.game.world.env.setWindDirection(Math.random() * 360);
    this._highlight();
  }

  stop() { this.game.world.range.highlightGreen(null, false); }

  get ball() { return Math.floor(this.k / this.players.length); }
  get target() { return GREENS.find((g) => g.id === this.sequence[Math.min(this.ball, this.sequence.length - 1)]); }

  _highlight() { this.game.world.range.highlightGreen(this.target.id, true); }

  suggestedClub() {
    const yd = Math.hypot(this.target.x, this.target.z) / YD;
    return clubForYards(yd + 5);
  }

  status() {
    if (this.roundOver) return { title: 'Target Practice', detail: 'Complete', chips: [] };
    const g = this.target;
    const chips = [this.windChip()];
    if (!this.roster.multi) chips.push({ kind: 'score', label: 'Score', value: this.totals.get(this.players[0].id) });
    return {
      title: `Target Practice · Ball ${this.ball + 1} of ${this.sequence.length}`,
      detail: `${dist(Math.hypot(g.x, g.z))} ${distUnit()} target`,
      chips,
    };
  }

  evaluate(result, launch, club, player) {
    const g = this.target;
    const lp = result.carryPoint || result.rest;
    const d = lp ? Math.hypot(lp.x - g.x, lp.z - g.z) : Infinity;
    let points = 0, ring = 'Miss';
    if (d < g.r * 0.25) { points = 50; ring = 'Bullseye'; }
    else if (d < g.r * 0.55) { points = 30; ring = 'Inner ring'; }
    else if (d < g.r) { points = 15; ring = 'On target'; }
    else if (d < g.r * 1.7) { points = 5; ring = 'Near miss'; }
    this.totals.set(player.id, (this.totals.get(player.id) || 0) + points);
    const out = {
      headline: ring,
      sub: Number.isFinite(d) ? `landed ${proximity(d)} from center` : '',
      points,
      category: points === 50 ? 'target' : null,
      bests: [],
    };
    const before = this.ball;
    this.k++;
    if (this.ball >= this.sequence.length) {
      this.roundOver = true;
      out.summary = this._summary();
    } else if (this.ball !== before) {
      out.advance = () => this._highlight();
    }
    return out;
  }

  leaderboard() {
    const rows = this.players.map((p) => ({ id: p.id, name: p.name, color: p.color, value: this.totals.get(p.id) || 0, display: `${this.totals.get(p.id) || 0} pts` }))
      .sort((a, b) => b.value - a.value);
    return { title: 'Targets', rows, teams: this.teamRows((p) => this.totals.get(p.id) || 0, { fmt: (v) => `${v} pts` }) };
  }

  _summary() {
    const lb = this.leaderboard();
    const solo = !this.roster.multi;
    const total = this.totals.get(this.players[0].id) || 0;
    const r = solo ? store.submitBest('targets.score', total, 'max') : {};
    return {
      title: 'Targets complete',
      score: solo ? total : lb.rows[0].value,
      scoreLabel: solo ? `of ${this.sequence.length * 50}` : `points · ${lb.rows[0].name}`,
      isBest: !!(r.isBest && !r.first),
      rows: solo ? [] : lb.rows.map((x, i) => ({ label: `${i + 1}. ${x.name}`, value: x.display, color: x.color })),
      teams: lb.teams,
      verdict: solo
        ? total >= 300 ? 'Surgical.' : total >= 180 ? 'Dialed in.' : total >= 90 ? 'Getting there.' : 'The targets are fine. Physically and emotionally.'
        : this.winnerLine(lb.rows, lb.teams),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export class LongestDriveMode extends BaseMode {
  constructor(game) {
    super(game);
    this.id = 'ld';
    this.name = 'Longest Drive';
    this.blurb = 'Stay in the 50-yard grid. Longest ball counts.';
    this.gridHalf = 25 * YD;
  }

  get balls() { const n = this.players.length; return n <= 2 ? 6 : n <= 4 ? 4 : 3; }

  start() {
    CTP_GREEN.active = false;
    this.game.world.setCtp(false);
    this.k = 0;
    this.best = new Map();
    this.bestBall = new Map();
    this.roundOver = false;
    this.game.world.env.setWindDirection(160 + Math.random() * 40); // usually helping
  }

  suggestedClub() { return 'DR'; }

  status() {
    if (this.roundOver) return { title: 'Longest Drive', detail: 'Complete', chips: [] };
    const ballNo = Math.floor(this.k / this.players.length) + 1;
    const lead = Math.max(0, ...[...this.best.values()]);
    return {
      title: `Longest Drive · Ball ${ballNo} of ${this.balls}`,
      detail: lead ? `Leader ${dist(lead)} ${distUnit()}` : 'Grid is 50 yd wide',
      chips: [this.windChip()],
    };
  }

  markers() { return [...this.bestBall.values()]; }

  evaluate(result, launch, club, player) {
    const inGrid = !result.lost && Math.abs(result.rest.x) <= this.gridHalf;
    let isBest = false;
    const bests = [];
    const prevLead = Math.max(0, ...[...this.best.values()]);
    if (inGrid && result.total > (this.best.get(player.id) ?? 0)) {
      this.best.set(player.id, result.total);
      this.bestBall.set(player.id, { x: result.rest.x, y: result.rest.y, z: result.rest.z, color: player.color, name: player.name });
    }
    if (inGrid) {
      const r = store.submitBest('ld.best', result.total, 'max');
      if (r.isBest && !r.first) { isBest = true; bests.push({ label: 'Longest drive', value: `${dist(result.total)} ${distUnit()}` }); }
    }
    const newLeader = inGrid && result.total > prevLead;
    const out = {
      headline: inGrid ? `${dist(result.total)} ${distUnit()}` : 'Out of grid',
      sub: inGrid ? (newLeader ? 'New leader' : `Leader ${dist(prevLead)} ${distUnit()}`) : 'Does not count',
      category: inGrid ? (result.total / YD > 300 ? 'bomb' : 'ldGrid') : 'ldOut',
      bests, isBest,
    };
    this.k++;
    if (this.k >= this.balls * this.players.length) {
      this.roundOver = true;
      out.summary = this._summary();
    }
    return out;
  }

  leaderboard() {
    const rows = this.players.map((p) => {
      const v = this.best.get(p.id) ?? null;
      return { id: p.id, name: p.name, color: p.color, value: v, display: v ? `${dist(v)} ${distUnit()}` : '—' };
    }).sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
    return { title: 'Longest Drive', rows, teams: this.teamRows((p) => this.best.get(p.id) ?? null, { combine: 'best', fmt: (v) => `${dist(v)} ${distUnit()}` }) };
  }

  _summary() {
    const lb = this.leaderboard();
    const solo = !this.roster.multi;
    const b = lb.rows[0].value;
    return {
      title: 'Long drive final',
      score: b ? dist(b) : '—',
      scoreLabel: solo ? distUnit() : `${distUnit()} · ${lb.rows[0].name}`,
      isBest: false,
      rows: solo ? [] : lb.rows.map((x, i) => ({ label: `${i + 1}. ${x.name}`, value: x.display, color: x.color })),
      teams: lb.teams,
      verdict: solo
        ? b && b / YD > 320 ? 'Genuinely large.' : b && b / YD > 270 ? 'Plenty. The grid agrees.' : 'Distance is a journey.'
        : this.winnerLine(lb.rows, lb.teams),
    };
  }
}

export function createModes(game, CourseMode) {
  const m = {
    range: new RangeMode(game),
    ctp: new ClosestToPinMode(game),
    targets: new TargetMode(game),
    ld: new LongestDriveMode(game),
  };
  if (CourseMode) m.course = new CourseMode(game);
  return m;
}

