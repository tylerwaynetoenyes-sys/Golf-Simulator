// Session tracking, personal bests and settings, persisted to localStorage.
// Every storage access is guarded: private windows and blocked storage just
// mean nothing persists, never a broken game.

const KEY = 'alton-range.v1';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

const DEFAULT_SETTINGS = {
  units: 'imperial',
  camera: 'cinematic', // cinematic | follow | tee
  quality: 'high', // high | medium | low
  volume: 0.8,
  ambience: 0.6,
  ghostTracers: true,
  commentary: true,
  bridgeUrl: 'ws://localhost:8765',
  r10Distance: 7, // feet from the R10 to the ball
  handedness: 'right',
  display: 'standard', // standard | tv
  timeOfDay: 'night', // night | day
  weather: 'clear', // clear | cloudy | breezy | windy
  rings: 'standard', // putting rings: tight | standard | generous
  mulligans: 'nine', // off | nine | hole | free
  courseLength: 9,
  courseStart: 1,
};

class Store {
  constructor() {
    const saved = load() || {};
    this.settings = { ...DEFAULT_SETTINGS, ...(saved.settings || {}) };
    this.bests = saved.bests || {};
    this.lifetime = saved.lifetime || { shots: 0, sessions: 0 };
    this.history = saved.history || []; // last sessions summaries
    this.session = { started: Date.now(), shots: [] };
    this.lifetime.sessions = (this.lifetime.sessions || 0) + 1;
    this.save();
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        settings: this.settings, bests: this.bests, lifetime: this.lifetime, history: this.history.slice(-30),
      }));
    } catch { /* storage unavailable: play on */ }
  }

  setSetting(k, v) {
    this.settings[k] = v;
    this.save();
  }

  addShot(shot) {
    this.session.shots.push(shot);
    this.lifetime.shots = (this.lifetime.shots || 0) + 1;
    this.save();
  }

  /**
   * Compare against a personal best; returns {isBest, previous} and stores it.
   * @param {string} key
   * @param {number} value
   * @param {'max'|'min'} dir
   */
  submitBest(key, value, dir = 'max', meta = {}) {
    const prev = this.bests[key];
    const better = prev == null || (dir === 'max' ? value > prev.value : value < prev.value);
    if (better) {
      this.bests[key] = { value, at: Date.now(), ...meta };
      this.save();
    }
    return { isBest: better, previous: prev ? prev.value : null, first: prev == null };
  }

  best(key) { return this.bests[key]?.value ?? null; }

  resetSession() {
    if (this.session.shots.length) {
      this.history.push(this.summary());
    }
    this.session = { started: Date.now(), shots: [] };
    this.save();
  }

  resetBests() {
    this.bests = {};
    this.save();
  }

  /** Per-club averages for the current session. */
  clubStats() {
    const by = new Map();
    for (const s of this.session.shots) {
      if (!by.has(s.club)) by.set(s.club, []);
      by.get(s.club).push(s);
    }
    const out = [];
    for (const [club, shots] of by) {
      const avg = (f) => shots.reduce((a, s) => a + f(s), 0) / shots.length;
      const sd = (f) => {
        const m = avg(f);
        return Math.sqrt(shots.reduce((a, s) => a + (f(s) - m) ** 2, 0) / shots.length);
      };
      out.push({
        club,
        count: shots.length,
        carry: avg((s) => s.carry),
        total: avg((s) => s.total),
        ballSpeed: avg((s) => s.ballSpeed),
        launch: avg((s) => s.launchAngle),
        spin: avg((s) => s.totalSpin),
        offlineSd: sd((s) => s.offline),
        longest: Math.max(...shots.map((s) => s.total)),
      });
    }
    return out;
  }

  summary() {
    const shots = this.session.shots;
    return {
      started: this.session.started,
      ended: Date.now(),
      shots: shots.length,
      longest: shots.length ? Math.max(...shots.map((s) => s.total)) : 0,
    };
  }

  toCSV(unitsLabel) {
    const head = ['#', 'time', 'mode', 'player', 'club', 'source', 'ball_speed_mps', 'launch_deg', 'direction_deg',
      'spin_rpm', 'spin_axis_deg', 'club_speed_mps', 'carry_m', 'total_m', 'offline_m', 'apex_m', 'descent_deg', 'result'];
    const rows = this.session.shots.map((s, i) => [
      i + 1, new Date(s.at).toISOString(), s.mode, JSON.stringify(s.player || ''), s.club, s.source, s.ballSpeed.toFixed(2), s.launchAngle.toFixed(1),
      s.launchDirection.toFixed(1), s.totalSpin.toFixed(0), s.spinAxis.toFixed(1), (s.clubSpeed || 0).toFixed(2),
      s.carry.toFixed(1), s.total.toFixed(1), s.offline.toFixed(1), s.apex.toFixed(1), s.descent.toFixed(1),
      JSON.stringify(s.result || ''),
    ]);
    return `# Alton Range session export (${unitsLabel})\n` + [head, ...rows].map((r) => r.join(',')).join('\n');
  }
}

export const store = new Store();
