// Players and teams (1–6 players; optional teams). Persisted with settings so
// a family's names and colours come back next time.
import { store } from '../data/store.js';

export const PLAYER_COLORS = ['#ffb46b', '#6fb7ff', '#5fe39a', '#ff8a9a', '#c9a2ff', '#ffe36a'];
export const TEAMS = [
  { name: 'Bluff', color: '#ffb46b' },
  { name: 'River', color: '#6fb7ff' },
  { name: 'Arch', color: '#c9ced8' },
];
export const MAX_PLAYERS = 6;

let nextId = 1;

export class Roster {
  constructor() {
    const saved = store.settings.roster;
    this.players = [];
    this.teamMode = false;
    this.rotateRange = true;
    if (saved && Array.isArray(saved.players) && saved.players.length) {
      for (const p of saved.players.slice(0, MAX_PLAYERS)) { const q = this._push(p.name, p.color, p.team ?? null); if (p.gear) q.gear = { ...p.gear }; }
      this.teamMode = !!saved.teamMode;
      this.rotateRange = saved.rotateRange !== false;
    } else {
      this._push('Player 1');
    }
  }

  _push(name, color, team = null) {
    const used = new Set(this.players.map((p) => p.color));
    const c = color || PLAYER_COLORS.find((x) => !used.has(x)) || PLAYER_COLORS[this.players.length % PLAYER_COLORS.length];
    const p = { id: `p${nextId++}`, name: String(name || `Player ${this.players.length + 1}`).slice(0, 18), color: c, team };
    this.players.push(p);
    return p;
  }

  get size() { return this.players.length; }
  get multi() { return this.players.length > 1; }

  add(name) {
    if (this.players.length >= MAX_PLAYERS) return null;
    const p = this._push(name || `Player ${this.players.length + 1}`);
    if (this.teamMode) p.team = this._smallestTeam();
    this.save();
    return p;
  }

  remove(id) {
    if (this.players.length <= 1) return;
    this.players = this.players.filter((p) => p.id !== id);
    this.save();
  }

  rename(id, name) {
    const p = this.byId(id);
    if (p) { p.name = String(name).trim().slice(0, 18) || p.name; this.save(); }
  }

  setTeam(id, team) {
    const p = this.byId(id);
    if (p) { p.team = team; this.save(); }
  }

  setTeamMode(on) {
    this.teamMode = on;
    if (on) this.preset(this.players.length >= 6 ? '3v3' : 'auto');
    this.save();
  }

  /** '2v2', '3v3', '2v2v2', 'auto' (split as evenly as possible into 2 teams). */
  preset(kind) {
    const n = this.players.length;
    const teams = kind === '2v2v2' ? 3 : 2;
    this.players.forEach((p, i) => { p.team = n < 2 ? 0 : i % teams; });
    this.save();
  }

  _smallestTeam() {
    const counts = [0, 0, 0];
    for (const p of this.players) if (p.team != null) counts[p.team]++;
    const live = Math.max(2, Math.max(...this.players.map((p) => (p.team ?? 0) + 1)));
    let best = 0;
    for (let t = 0; t < live; t++) if (counts[t] < counts[best]) best = t;
    return best;
  }

  byId(id) { return this.players.find((p) => p.id === id); }

  /**
   * A player's own bag and ball ({clubSet, bag, ball}); anything they haven't chosen falls back to the
   * game's settings, so a lone player is just the settings.
   */
  gearOf(p) {
    const st = store.settings, g = p?.gear || {};
    return { clubSet: g.clubSet || st.clubSet || 'cavity', bag: g.bag || st.bag || null, ball: g.ball || st.ball || 'tour', golfer: g.golfer || st.golfer || 'james' };
  }

  setGear(id, gear) {
    const p = this.byId(id);
    if (!p) return;
    p.gear = { ...(p.gear || {}), ...gear };
    this.save();
  }

  /** Teams that currently have members: [{index, name, color, members[]}]. */
  teams() {
    if (!this.teamMode) return [];
    const out = [];
    TEAMS.forEach((t, i) => {
      const members = this.players.filter((p) => p.team === i);
      if (members.length) out.push({ index: i, ...t, members });
    });
    return out;
  }

  teamOf(p) { return this.teamMode && p.team != null ? { index: p.team, ...TEAMS[p.team] } : null; }

  save() {
    store.setSetting('roster', {
      players: this.players.map((p) => ({ name: p.name, color: p.color, team: p.team, gear: p.gear || null })),
      teamMode: this.teamMode,
      rotateRange: this.rotateRange,
    });
  }
}
