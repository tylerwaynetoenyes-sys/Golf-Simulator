// Full round on the Confluence Course (9 or 18 holes), 1–6 players, stroke
// play with optional best-ball teams.
//
// Turn order follows golf: everyone tees off in honour order (lowest score on
// the previous hole first), then the player farthest from the hole plays.
// Rules handled: lies (rough/sand slow the ball), water (one-stroke penalty,
// drop where it crossed in), out of bounds (stroke and distance), gimmes,
// a pick-up at par + 4 to keep the round moving, and putting (auto or manual).
import { simulatePutt, puttSpeedFor, YD } from '../core/physics.js';
import { HOLES, coursePar } from '../course/holes.js';
import { HoleTerrain } from '../course/holeTerrain.js';
import { store } from '../data/store.js';
import { proximity, dist, distUnit } from '../core/units.js';
import { clubForYards } from './modes.js';

const FT = 0.3048;
const MAX_OVER = 4;
// PGA Tour make percentages by distance (feet), the usual reference curve.
const MAKE = [[1, 1], [2, 0.99], [3, 0.96], [4, 0.88], [5, 0.77], [6, 0.66], [8, 0.5], [10, 0.4], [15, 0.23], [20, 0.15], [25, 0.1], [30, 0.07], [40, 0.04], [60, 0.02], [90, 0.01]];

export function makeProbability(feet) {
  if (feet <= MAKE[0][0]) return 1;
  for (let i = 0; i < MAKE.length - 1; i++) {
    const [a, pa] = MAKE[i], [b, pb] = MAKE[i + 1];
    if (feet <= b) return pa + (pb - pa) * ((feet - a) / (b - a));
  }
  return 0.005;
}

export function scoreName(strokes, par) {
  if (strokes === 1) return 'Hole in one';
  const d = strokes - par;
  return { '-3': 'Albatross', '-2': 'Eagle', '-1': 'Birdie', 0: 'Par', 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' }[d] || (d > 0 ? `+${d}` : `${d}`);
}

export const fmtToPar = (n) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);

const SAVE_KEY = 'alton-range.round.v1';

export class CourseMode {
  constructor(game) {
    this.game = game;
    this.id = 'course';
    this.name = 'The Confluence Course';
    this.blurb = '9 or 18 holes past the Arch, Chain of Rocks, Cahokia and more.';
    this.course = true;
    this.roundOver = false;
    this.length = 9;
    this.gimme = 2; // feet
  }

  get roster() { return this.game.roster; }
  get players() { return this.game.roster.players; }

  // ── lifecycle ──

  start(opts = {}) {
    if (opts.length) this.length = opts.length;
    if (opts.gimme != null) this.gimme = opts.gimme;
    const first = opts.startHole || 1;
    this.holes = HOLES.slice(first - 1, first - 1 + this.length);
    if (this.holes.length < this.length) this.holes = HOLES.slice(0, this.length);
    this.holeIdx = 0;
    this.roundOver = false;
    this.cards = new Map(this.players.map((p) => [p.id, []]));
    this.honor = this.players.map((p) => p.id);
    if (opts.resume) this._restore(opts.resume);
    this._startHole();
    this._save();
  }

  stop() {
    this.game.world.setScene('range');
  }

  get hole() { return this.holes[this.holeIdx]; }
  get T() { return this.game.world.course.T; }

  _startHole() {
    const T = this.game.world.loadHole(this.hole);
    this.ball = new Map(this.players.map((p) => [p.id, {
      x: T.tee.x, y: T.teeHeight, z: T.tee.z, surface: 'tee', teed: true, strokes: 0, holed: false, pickedUp: false, prev: null,
    }]));
    this.game.world.env.setWindDirection((this.hole.n * 67 + 30) % 360);
    this.holeStarted = Date.now();
  }

  // ── turn order ──

  _alive() { return this.players.filter((p) => { const b = this.ball.get(p.id); return !b.holed && !b.pickedUp; }); }

  currentPlayer() {
    const alive = this._alive();
    if (!alive.length) return this.players[0];
    const unTeed = this.honor.map((id) => this.roster.byId(id)).filter((p) => p && alive.includes(p) && this.ball.get(p.id).strokes === 0);
    if (unTeed.length) return unTeed[0];
    let far = alive[0], fd = -1;
    for (const p of alive) {
      const b = this.ball.get(p.id);
      const d = this.T.toPin(b.x, b.z);
      if (d > fd) { fd = d; far = p; }
    }
    return far;
  }

  /** Where the current player's ball is and which way they face. */
  shotSetup(player = this.currentPlayer()) {
    const T = this.T;
    const b = this.ball.get(player.id);
    const heading = (Math.atan2(T.pin.x - b.x, -(T.pin.z - b.z)) * 180) / Math.PI;
    const toPin = T.toPin(b.x, b.z);
    return {
      origin: { x: b.x, y: b.teed ? b.y + 0.04 : T.groundHeight(b.x, b.z) + 0.021, z: b.z },
      heading,
      teed: b.teed,
      putting: b.surface === 'green' || (b.surface === 'fringe' && toPin < 18),
      lie: b.teed ? 'tee' : b.surface,
      toPin,
      strokes: b.strokes,
    };
  }

  suggestedClub() {
    const s = this.shotSetup();
    if (s.putting) return null;
    // plays-like distance: elevation change counts roughly 1:1
    const T = this.T;
    const dh = T.groundHeight(T.pin.x, T.pin.z) - s.origin.y;
    const yards = (s.toPin + dh) / YD;
    if (s.teed && this.hole.par >= 4) return 'DR';
    return clubForYards(Math.min(255, yards));
  }

  /** Lie effects for full shots (applied to R10 and demo launches alike). */
  adjustLaunch(launch, setup) {
    const l = { ...launch };
    if (setup.lie === 'rough') {
      l.ballSpeed *= 0.92; l.totalSpin *= 0.72; l.launchAngle += 0.8;
    } else if (setup.lie === 'sand') {
      const greenside = setup.toPin < 45;
      l.ballSpeed *= greenside ? 0.78 : 0.88; l.totalSpin *= greenside ? 0.85 : 0.7; l.launchAngle += greenside ? 4 : 0.5;
    }
    return l;
  }

  wind() { return this.game.world.env.wind(0); }

  // ── shot outcome ──

  _land(T, x, z) { const s = T.terrain(x, z).surface; return s !== 'water' && s !== 'oob'; }

  _dropPoint(result) {
    const T = this.T;
    const s = result.samples;
    let i = s.length - 1;
    while (i > 0 && !this._land(T, s[i].x, s[i].z)) i--;
    let { x, z } = s[i];
    const o = result.origin;
    const back = Math.hypot(x - o.x, z - o.z) || 1;
    for (let k = 0; k < 12; k++) {
      x -= ((x - o.x) / back) * 2;
      z -= ((z - o.z) / back) * 2;
      if (this._land(T, x, z) && T.terrain(x, z).surface !== 'sand') break;
    }
    return { x, z };
  }

  evaluate(result, launch, club, player) {
    const T = this.T;
    const b = this.ball.get(player.id);
    const par = this.hole.par;
    const before = { x: b.x, y: b.y, z: b.z, surface: b.surface, teed: b.teed };
    b.strokes += 1;
    let penalty = null;
    let holed = !!result.holed;

    if (!holed && !result.lost && !result.putt) {
      // rolled over the cup slowly enough to drop?
      const s = result.samples;
      for (let i = 1; i < s.length; i++) {
        if (s[i].phase !== 'roll' && s[i].phase !== 'impact') continue;
        if (Math.hypot(s[i].x - T.pin.x, s[i].z - T.pin.z) < 0.075) {
          const v = Math.hypot(s[i].x - s[i - 1].x, s[i].z - s[i - 1].z) / Math.max(1e-3, s[i].t - s[i - 1].t);
          if (v < 1.7) { holed = true; result.holedAt = { t: s[i].t, x: T.pin.x, z: T.pin.z }; break; }
        }
      }
    }

    if (holed) {
      b.holed = true;
      b.x = T.pin.x; b.z = T.pin.z;
    } else if (result.lost) {
      const wet = result.events.some((e) => e.surface === 'water');
      b.strokes += 1;
      if (wet) {
        const d = this._dropPoint(result);
        b.x = d.x; b.z = d.z; b.teed = false;
        b.surface = T.terrain(d.x, d.z).surface;
        penalty = 'Water · one-stroke penalty, drop';
      } else {
        Object.assign(b, before);
        b.teed = before.teed;
        penalty = 'Out of bounds · stroke and distance';
      }
    } else {
      b.x = result.rest.x; b.z = result.rest.z; b.teed = false;
      b.surface = T.terrain(b.x, b.z).surface;
    }
    b.y = T.groundHeight(b.x, b.z);
    b.prev = before;

    // gimme
    let gimme = false;
    const toPin = T.toPin(b.x, b.z);
    if (!b.holed && b.surface === 'green' && this.gimme > 0 && toPin <= this.gimme * FT) {
      b.strokes += 1;
      b.holed = true;
      gimme = true;
    }
    // pick up to keep things moving
    let pickedUp = false;
    if (!b.holed && b.strokes >= par + MAX_OVER) {
      b.pickedUp = true;
      pickedUp = true;
    }

    // headline
    let headline, sub, category = null;
    if (b.holed) {
      const name = scoreName(b.strokes, par);
      headline = gimme ? `${name} · gimme` : name;
      sub = `${b.strokes} stroke${b.strokes === 1 ? '' : 's'} · ${player.name}`;
      const d = b.strokes - par;
      category = b.strokes === 1 ? 'ctpAce' : d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'double';
      if (result.putt && !gimme && result.total > 6) category = 'longPutt';
    } else if (pickedUp) {
      headline = 'Picked up';
      sub = `Scores ${par + MAX_OVER} · on to the next`;
      category = 'pickup';
    } else if (penalty) {
      headline = penalty.startsWith('Water') ? 'In the water' : 'Out of bounds';
      sub = penalty;
      category = penalty.startsWith('Water') ? 'water' : 'oob';
    } else {
      const lie = { green: 'On the green', fringe: 'On the fringe', fairway: 'Fairway', rough: 'Rough', sand: 'Bunker', tee: 'Tee box' }[b.surface] || b.surface;
      headline = b.surface === 'green' ? proximity(toPin) : `${dist(toPin)} ${distUnit()} to go`;
      sub = `${lie} · stroke ${b.strokes + 1} next`;
      if (b.surface === 'sand') category = 'sand';
      else if (b.surface === 'green' && toPin < 1.2 && !result.putt) category = 'ctpKick';
      else if (b.surface === 'green' && !result.putt) category = before.teed && par === 3 ? 'ctpGreen' : 'gir';
      else if (result.putt) category = toPin < 0.6 ? null : 'lagMiss';
    }

    const out = { headline, sub, category, bests: [], holed: b.holed, penalty, ace: b.holed && b.strokes === 1 };
    if (b.holed && b.strokes === 1) out.bests.push({ label: 'Hole in one', value: this.hole.name });

    // hole finished for everyone?
    if (!this._alive().length) {
      for (const p of this.players) {
        const bb = this.ball.get(p.id);
        this.cards.get(p.id)[this.holeIdx] = bb.holed ? bb.strokes : par + MAX_OVER;
      }
      // honour: lowest score this hole first, stable on ties
      const prev = this.honor.slice();
      this.honor.sort((a, c) => this.cards.get(a)[this.holeIdx] - this.cards.get(c)[this.holeIdx] || prev.indexOf(a) - prev.indexOf(c));
      out.holeComplete = this.holeSummary();
      if (this.holeIdx >= this.holes.length - 1) {
        this.roundOver = true;
        out.summary = this.roundSummary();
        this._clearSave();
      } else {
        out.advance = () => { this.holeIdx++; this._startHole(); this._save(); };
      }
    }
    return out;
  }

  // ── putting ──

  puttRead(player) {
    const T = this.T;
    const b = this.ball.get(player.id);
    const d = T.toPin(b.x, b.z);
    const heading = (Math.atan2(T.pin.x - b.x, -(T.pin.z - b.z)) * 180) / Math.PI;
    const r = simulatePutt({ x: b.x, y: b.y, z: b.z }, heading, puttSpeedFor(d), T.terrain, null);
    // lateral miss where the straight putt passes the hole
    let best = Infinity, side = 0;
    for (const s of r.samples) {
      const along = Math.hypot(s.x - b.x, s.z - b.z);
      if (Math.abs(along - d) < 0.25) {
        const dd = Math.hypot(s.x - T.pin.x, s.z - T.pin.z);
        if (dd < best) {
          best = dd;
          const fx = Math.sin((heading * Math.PI) / 180), fz = -Math.cos((heading * Math.PI) / 180);
          side = (s.x - T.pin.x) * -fz + (s.z - T.pin.z) * fx; // + = right of the hole
        }
      }
    }
    const uphill = T.groundHeight(T.pin.x, T.pin.z) - b.y;
    return { distance: d, heading, breakInches: Number.isFinite(best) ? (side / 0.0254) : 0, uphill };
  }

  /** Statistically fair auto-putt: Tour make% by distance, rolled for real on the green. */
  autoPutt(player) {
    const T = this.T;
    const b = this.ball.get(player.id);
    const d = T.toPin(b.x, b.z);
    const feet = d / FT;
    const make = Math.random() < makeProbability(feet) * 0.95;
    const o = { x: b.x, y: b.y, z: b.z };
    const base = (Math.atan2(T.pin.x - b.x, -(T.pin.z - b.z)) * 180) / Math.PI;
    const v0 = puttSpeedFor(d);
    if (make) {
      let found = null;
      outer: for (const sf of [1.06, 1.1, 1.02, 1.15, 0.99, 1.22]) {
        for (let k = 0; k <= 40; k++) {
          const aim = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.35;
          const r = simulatePutt(o, base + aim, v0 * sf, T.terrain, T.pin);
          if (r.holed) { found = r; break outer; }
        }
      }
      if (found) return found;
    }
    for (let tries = 0; tries < 14; tries++) {
      const aimErr = (Math.random() * 2 - 1) * (1.2 + Math.min(4, feet * 0.08));
      const sf = 1.03 + (Math.random() * 2 - 1) * (0.07 + Math.min(0.18, feet * 0.004));
      const r = simulatePutt(o, base + aimErr, v0 * sf, T.terrain, T.pin);
      if (!r.holed || tries === 13) return r;
    }
    return simulatePutt(o, base + 3, v0 * 0.85, T.terrain, T.pin);
  }

  /** Manual putt from the swing meter: 80% power = hole pace on a flat green. */
  manualPutt(player, power, aimDeg) {
    const T = this.T;
    const b = this.ball.get(player.id);
    const d = T.toPin(b.x, b.z);
    const base = (Math.atan2(T.pin.x - b.x, -(T.pin.z - b.z)) * 180) / Math.PI;
    const speed = puttSpeedFor(Math.max(0.2, d * (power / 0.8)) + 0.15);
    return simulatePutt({ x: b.x, y: b.y, z: b.z }, base + aimDeg, speed, T.terrain, T.pin);
  }

  // ── scoring views ──

  status() {
    const h = this.hole;
    if (this.roundOver) return { title: this.name, detail: 'Round complete', chips: [] };
    const p = this.currentPlayer();
    const s = this.shotSetup(p);
    const env = this.game.world.env;
    const done = !this._alive().length;
    return {
      title: `Hole ${h.n} · ${h.name} · Par ${h.par}`,
      detail: done ? 'Hole complete' : s.putting ? `${proximity(s.toPin)} putt` : `${dist(s.toPin)} ${distUnit()} to the pin`,
      chips: [{ kind: 'wind', mph: env.weather.windMph, fromDeg: env.windFromDeg - s.heading }, { kind: 'score', label: 'Thru', value: `${this.holeIdx}/${this.holes.length}` }],
    };
  }

  toPar(pid) {
    const card = this.cards.get(pid) || [];
    let s = 0, thru = 0;
    card.forEach((v, i) => { if (v != null) { s += v - this.holes[i].par; thru++; } });
    return { toPar: s, thru, strokes: card.reduce((a, v) => a + (v || 0), 0) };
  }

  teamCard(team) {
    return this.holes.map((h, i) => {
      const vals = team.members.map((m) => this.cards.get(m.id)?.[i]).filter((v) => v != null);
      return vals.length ? Math.min(...vals) : null;
    });
  }

  leaderboard() {
    const rows = this.players.map((p) => {
      const t = this.toPar(p.id);
      const b = this.ball?.get(p.id);
      const live = b && !b.holed && !b.pickedUp && b.strokes > 0 ? ` · ${b.strokes} on ${this.hole.n}` : '';
      return { id: p.id, name: p.name, color: p.color, value: t.toPar, display: fmtToPar(t.toPar), sub: `thru ${t.thru}${live}` };
    }).sort((a, b) => a.value - b.value);
    const teams = this.roster.teams().map((t) => {
      const card = this.teamCard(t);
      let s = 0, n = 0;
      card.forEach((v, i) => { if (v != null) { s += v - this.holes[i].par; n++; } });
      return { name: `Team ${t.name}`, color: t.color, value: s, display: fmtToPar(s), sub: `best ball · thru ${n}`, members: t.members.map((m) => m.name) };
    }).sort((a, b) => a.value - b.value);
    return { title: 'Leaderboard', rows, teams, lowerBetter: true };
  }

  scorecard() {
    return {
      holes: this.holes.map((h) => ({ n: h.n, par: h.par, name: h.name, yards: Math.round(new HoleTerrain(h).length / YD) })),
      par: coursePar(this.holes),
      players: this.players.map((p) => ({ id: p.id, name: p.name, color: p.color, card: this.cards.get(p.id) || [], ...this.toPar(p.id) })),
      teams: this.roster.teams().map((t) => ({ name: `Team ${t.name}`, color: t.color, card: this.teamCard(t) })),
      current: this.holeIdx,
    };
  }

  holeSummary() {
    const h = this.hole;
    return {
      hole: h,
      rows: this.players.map((p) => {
        const v = this.cards.get(p.id)[this.holeIdx];
        return { name: p.name, color: p.color, strokes: v, label: scoreName(v, h.par), total: fmtToPar(this.toPar(p.id).toPar) };
      }).sort((a, b) => a.strokes - b.strokes),
    };
  }

  roundSummary() {
    const lb = this.leaderboard();
    const solo = !this.roster.multi;
    const me = this.toPar(this.players[0].id);
    let isBest = false;
    if (solo) {
      const r = store.submitBest(`course.${this.holes.length}`, me.strokes, 'min');
      isBest = r.isBest && !r.first;
    }
    const par = coursePar(this.holes);
    const winner = lb.teams?.length ? lb.teams[0] : lb.rows[0];
    return {
      title: `${this.holes.length} holes complete`,
      score: solo ? me.strokes : winner.display,
      scoreLabel: solo ? `strokes · ${fmtToPar(me.toPar)} · par ${par}` : `${winner.name}`,
      isBest,
      rows: lb.rows.map((r, i) => ({ label: `${i + 1}. ${r.name}`, value: r.display, extra: `${this.toPar(r.id).strokes} strokes`, color: r.color })),
      teams: lb.teams,
      verdict: solo
        ? me.toPar <= 0 ? 'Under par on the Confluence. The rivers approve.' : me.toPar <= 9 ? 'A proper round. The landmarks held up their end.' : 'Every landmark got a good look. Some of them twice.'
        : lb.teams?.length > 1 ? `${lb.teams[0].name} takes it.` : `${lb.rows[0].name} wins.`,
      scorecard: true,
    };
  }

  markers() {
    const T = this.T;
    if (!T || !this.ball) return [];
    const cur = this.currentPlayer();
    return this.players.filter((p) => p.id !== cur.id).map((p) => {
      const b = this.ball.get(p.id);
      if (b.holed || b.pickedUp || b.strokes === 0) return null;
      return { x: b.x, y: T.groundHeight(b.x, b.z), z: b.z, color: p.color, name: p.name };
    }).filter(Boolean);
  }

  // ── persistence (resume after a reload) ──

  _save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        at: Date.now(), length: this.length, first: this.holes[0].n, holeIdx: this.holeIdx, gimme: this.gimme,
        names: this.players.map((p) => p.name),
        cards: this.players.map((p) => this.cards.get(p.id)),
        honor: this.honor.map((id) => this.players.findIndex((p) => p.id === id)),
      }));
    } catch { /* storage unavailable */ }
  }

  _clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

  static savedRound(roster) {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!s || Date.now() - s.at > 1000 * 60 * 60 * 18) return null;
      if (s.names.length !== roster.players.length || s.names.some((n, i) => n !== roster.players[i].name)) return null;
      return s;
    } catch { return null; }
  }

  _restore(s) {
    this.holeIdx = Math.min(s.holeIdx, this.holes.length - 1);
    this.players.forEach((p, i) => this.cards.set(p.id, s.cards[i] || []));
    if (Array.isArray(s.honor)) this.honor = s.honor.map((i) => this.players[i]?.id).filter(Boolean);
  }
}
