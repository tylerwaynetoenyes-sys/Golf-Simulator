// Full round on the Confluence Course (9 or 18 holes), 1–6 players, stroke
// play with optional best-ball teams.
//
// Turn order follows golf: everyone tees off in honour order (lowest score on
// the previous hole first), then the player farthest from the hole plays.
// Rules handled: lies (rough/sand slow the ball), water (one-stroke penalty,
// drop where it crossed in), out of bounds (stroke and distance), a pick-up
// at par + 4 to keep the round moving, and the green finish: there is no
// putting mode. Two rings around every hole score the putts: finish inside
// the inner ring and it's a 1-putt, inside the outer ring a 2-putt, anywhere
// else on the green a 3-putt. A ball that rolls into the cup is simply holed.
import { simulatePutt, puttSpeedFor, YD } from '../core/physics.js';
import { coursePar } from '../course/holes.js';
import { loadedCourse } from '../course/courses.js';
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

/** Putting rings (feet): inner = 1-putt, outer = 2-putt. */
export const PUTT_RINGS = {
  tight: { label: 'Tight', one: 6, two: 20 },
  standard: { label: 'Standard', one: 10, two: 30 },
  generous: { label: 'Generous', one: 15, two: 45 },
};

/** Mulligan rules: how many replays each player gets. */
export const MULLIGANS = {
  off: { label: 'Off', short: 'No mulligans', per: 0 },
  nine: { label: '1 per nine', short: '1 mulligan per nine', per: 1, scope: 'nine' },
  hole: { label: '1 per hole', short: '1 mulligan per hole', per: 1, scope: 'hole' },
  free: { label: 'Unlimited', short: 'Unlimited mulligans', per: Infinity },
};

/** Lie effects (fraction of ball speed / spin kept, launch change in degrees). */
export const LIES = {
  first: { label: 'First cut', speed: 0.95, spin: 0.82, launch: 0.4, note: 'Slightly reduced spin' },
  deep: { label: 'Rough', speed: 0.85, spin: 0.55, launch: 1.4, note: 'About 15% less distance · less spin' },
  fairwaySand: { label: 'Fairway bunker', speed: 0.84, spin: 0.68, launch: 0.6, note: 'About 16% less distance' },
  greensideSand: { label: 'Greenside bunker', speed: 0.7, spin: 0.82, launch: 5, note: 'Splash shot · about 30% less distance' },
};

export class CourseMode {
  constructor(game) {
    this.game = game;
    this.id = 'course';
    this.def = loadedCourse('confluence');
    this.name = this.def.name;
    this.blurb = '9 or 18 holes past the Arch, Chain of Rocks, Cahokia and more.';
    this.course = true;
    this.roundOver = false;
    this.length = 9;
    this.rings = 'standard';
    this.mulligans = 'nine';
  }

  get roster() { return this.game.roster; }
  get players() { return this.game.roster.players; }

  // ── lifecycle ──

  start(opts = {}) {
    if (opts.length) this.length = opts.length;
    if (opts.rings && PUTT_RINGS[opts.rings]) this.rings = opts.rings;
    if (opts.mulligans && MULLIGANS[opts.mulligans]) this.mulligans = opts.mulligans;
    this.mullUsed = new Map();
    this._undo = null;
    // opts.course: a course from loadCourse() (DEM already fetched)
    if (opts.course) this.def = opts.course;
    this.name = this.def.name;
    this.blurb = this.def.blurb;
    const all = this.def.holes;
    this.length = Math.min(this.length, all.length);
    const first = opts.startHole || 1;
    this.holes = all.slice(first - 1, first - 1 + this.length);
    if (this.holes.length < this.length) this.holes = all.slice(0, this.length);
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

  /** Ring radii in metres. */
  get ringRadii() {
    const r = PUTT_RINGS[this.rings] || PUTT_RINGS.standard;
    return { one: r.one * FT, two: r.two * FT };
  }
  get T() { return this.game.world.course.T; }

  _startHole() {
    const T = this.game.world.loadHole(this.hole);
    this.ball = new Map(this.players.map((p) => [p.id, {
      x: T.tee.x, y: T.teeHeight, z: T.tee.z, surface: 'tee', teed: true, strokes: 0, holed: false, pickedUp: false, prev: null,
    }]));
    this.game.world.env.setWindDirection((this.hole.n * 67 + 30) % 360);
    this._undo = null;
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
      putting: false, // the rings settle the green; every shot is a full swing or chip
      lie: b.teed ? 'tee' : b.surface,
      lieDetail: this._lieDetail(b, toPin),
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

  /** Which LIES entry applies to a ball, or null for a clean lie. */
  _lieDetail(b, toPin) {
    if (b.teed) return null;
    if (b.surface === 'rough') return this.T.roughDepth(b.x, b.z);
    if (b.surface === 'sand') return toPin < 45 ? 'greensideSand' : 'fairwaySand';
    return null;
  }

  /** Lie effects for full shots (applied to R10 and demo launches alike). */
  adjustLaunch(launch, setup) {
    const l = { ...launch };
    const e = LIES[setup.lieDetail];
    if (!e) return l;
    let speed = e.speed;
    // long clubs can't get through deep grass: woods and long irons lose more
    if (setup.lieDetail === 'deep' && launch.ballSpeed > 60) speed -= 0.07;
    l.ballSpeed *= speed;
    l.totalSpin *= e.spin;
    l.launchAngle += e.launch;
    l.lie = setup.lieDetail;
    return l;
  }

  // ── mulligans ──

  _nineKey() { const r = MULLIGANS[this.mulligans]; return r.scope === 'hole' ? `h${this.holeIdx}` : `n${Math.floor(this.holeIdx / 9)}`; }

  mulligansLeft(pid) {
    const r = MULLIGANS[this.mulligans] || MULLIGANS.off;
    if (!r.per) return 0;
    if (r.per === Infinity) return Infinity;
    return Math.max(0, r.per - (this.mullUsed.get(`${pid}:${this._nineKey()}`) || 0));
  }

  /** The last shot can be replayed (no penalty) if the rule allows it. */
  canMulligan(pid) {
    const u = this._undo;
    return !!u && u.pid === pid && u.holeIdx === this.holeIdx && !this.roundOver && this.mulligansLeft(pid) > 0;
  }

  /** Put the ball back where it was before the last shot. */
  takeMulligan(pid) {
    if (!this.canMulligan(pid)) return false;
    const b = this.ball.get(pid);
    Object.assign(b, this._undo.snap);
    const k = `${pid}:${this._nineKey()}`;
    this.mullUsed.set(k, (this.mullUsed.get(k) || 0) + 1);
    this._undo = null;
    return true;
  }

  /** Water: replay from where the last shot was played (stroke and distance). */
  rehitFromPrevious(pid) {
    const u = this._undo;
    if (!u || u.pid !== pid) return false;
    const b = this.ball.get(pid);
    const s = u.snap;
    Object.assign(b, { x: s.x, y: s.y, z: s.z, surface: s.surface, teed: s.teed });
    return true;
  }

  wind() { return this.game.world.env.wind(0); }

  /** The cup for the current shot: flagstick in from off the green, out for putts. */
  cup(setup) {
    const T = this.T;
    return { x: T.pin.x, z: T.pin.z, flagstick: !(setup && setup.putting) };
  }

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
    this._undo = { pid: player.id, holeIdx: this.holeIdx, snap: { ...b } };
    b.strokes += 1;
    let penalty = null;
    let holed = !!result.holed;

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
        penalty = 'Water · one-stroke penalty';
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

    // the green finish: rings around the hole score the putts
    let finish = null;
    const toPin = T.toPin(b.x, b.z);
    if (!b.holed && !penalty) {
      const R = this.ringRadii;
      const putts = toPin <= R.one ? 1 : toPin <= R.two ? 2 : b.surface === 'green' ? 3 : 0;
      if (putts) {
        finish = { putts, from: toPin };
        b.strokes += putts;
        b.holed = true;
      }
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
      headline = name;
      sub = finish
        ? `${finish.putts}-putt from ${proximity(finish.from)} · ${b.strokes} strokes`
        : `Holed out · ${b.strokes} stroke${b.strokes === 1 ? '' : 's'}`;
      const d = b.strokes - par;
      category = b.strokes === 1 ? 'ctpAce' : d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'double';
    } else if (pickedUp) {
      headline = 'Picked up';
      sub = `Scores ${par + MAX_OVER} · on to the next`;
      category = 'pickup';
    } else if (penalty) {
      headline = penalty.startsWith('Water') ? 'Water hazard' : 'Out of bounds';
      sub = penalty;
      category = penalty.startsWith('Water') ? 'water' : 'oob';
    } else {
      const depth = b.surface === 'rough' ? T.roughDepth(b.x, b.z) : null;
      const lie = { green: 'On the green', fringe: 'On the fringe', fairway: 'Fairway', rough: depth === 'first' ? 'First cut' : 'Rough', sand: 'Bunker', tee: 'Tee box' }[b.surface] || b.surface;
      headline = b.surface === 'green' ? proximity(toPin) : `${dist(toPin)} ${distUnit()} to go`;
      sub = `${lie} · stroke ${b.strokes + 1} next`;
      if (b.surface === 'sand') category = 'sand';
      else if (b.surface === 'green' && toPin < 1.2 && !result.putt) category = 'ctpKick';
      else if (b.surface === 'green' && !result.putt) category = before.teed && par === 3 ? 'ctpGreen' : 'gir';
      else if (result.putt) category = toPin < 0.6 ? null : 'lagMiss';
    }

    const out = { headline, sub, category, bests: [], holed: b.holed, penalty, ace: b.holed && b.strokes === 1, finish, lie: !b.holed && !penalty ? b.surface : null };
    if (penalty && category === 'water' && !pickedUp) out.waterChoice = true;
    // the shot card shouldn't give away the drop: it shows the ring first
    if (finish) out.preview = { headline: `${proximity(finish.from)} · ${finish.putts}-putt`, sub: finish.putts === 3 ? 'On the green · three to get down' : `Inside the ${finish.putts === 1 ? 'inner' : 'outer'} ring` };
    if (b.holed && b.strokes === 1) out.bests.push({ label: 'Hole in one', value: this.hole.name });

    // a finished hole can't be replayed
    if (b.holed || pickedUp) this._undo = null;
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

  /**
   * Swing-meter power that rolls the ball to hole pace (≈ 1 ft past) along
   * the current aim, slope included. The gold mark on the putting meter.
   */
  puttPower(player, aimDeg) {
    const T = this.T;
    const b = this.ball.get(player.id);
    const d = T.toPin(b.x, b.z);
    const base = (Math.atan2(T.pin.x - b.x, -(T.pin.z - b.z)) * 180) / Math.PI;
    const a = ((base + aimDeg) * Math.PI) / 180;
    const fx = Math.sin(a), fz = -Math.cos(a);
    const want = d + 0.3;
    const along = (p) => {
      const speed = puttSpeedFor(Math.max(0.2, d * (p / 0.8)) + 0.15);
      const r = simulatePutt({ x: b.x, y: b.y, z: b.z }, base + aimDeg, speed, T.terrain, null);
      return (r.rest.x - b.x) * fx + (r.rest.z - b.z) * fz;
    };
    let lo = 0.03, hi = 1.6;
    for (let i = 0; i < 13; i++) {
      const mid = (lo + hi) / 2;
      if (along(mid) < want) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
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
      detail: done ? 'Hole complete' : s.putting ? `${proximity(s.toPin)} putt` : `${dist(s.toPin)} ${distUnit()} to the pin${this._playsText(s)}`,
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

  /** Elevation-adjusted distance (1 m of rise plays about 1 m longer). */
  playsLike(s) {
    const T = this.T;
    const dh = T.groundHeight(T.pin.x, T.pin.z) - (s.origin.y - (s.teed ? 0.04 : 0.021));
    return { plays: s.toPin + dh, dh };
  }

  _playsText(s) {
    const { plays, dh } = this.playsLike(s);
    if (Math.abs(dh) < 2.5) return '';
    return ` · plays ${dist(plays)} ${dh > 0 ? '↑' : '↓'}`;
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
        ? me.toPar < 0 ? 'Under par on the Confluence Course.' : me.toPar === 0 ? 'Level par. A complete round.' : me.toPar <= 9 ? 'A solid round.' : 'Round complete.'
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
      return { x: b.x, y: this.game.world.visualGround(b.x, b.z), z: b.z, color: p.color, name: p.name };
    }).filter(Boolean);
  }

  // ── persistence (resume after a reload) ──

  _save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        at: Date.now(), course: this.def.id, length: this.length, first: this.holes[0].n, holeIdx: this.holeIdx, rings: this.rings, mulligans: this.mulligans,
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
