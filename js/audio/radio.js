// In-game radio: internet stations (js/data/stations.js) through Howler.js
// (vendor/howler), streamed with HTML5 audio so playback starts at once.
// Stations cross-fade, a failing stream falls through to its mirrors, and
// the station's now-playing feed is polled where it allows cross-origin reads.
// The choice, volume and on/off state are remembered between sessions; the
// stream only starts after the player's first tap (browser autoplay rules).
import { STATIONS, stationById } from '../data/stations.js';
import { store } from '../data/store.js';

let howlerReady = null;
function loadHowler() {
  if (window.Howl) return Promise.resolve();
  if (!howlerReady) {
    howlerReady = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/howler/howler.min.js';
      s.onload = () => res();
      s.onerror = () => { howlerReady = null; rej(new Error('Howler failed to load')); };
      document.head.appendChild(s);
    });
  }
  return howlerReady;
}

const FADE_IN = 1400;
const FADE_OUT = 700;

class Radio {
  constructor() {
    const s = store.settings;
    this.station = stationById(s.radioStation) || STATIONS[0];
    this.volume = typeof s.radioVolume === 'number' ? s.radioVolume : 0.55;
    this.wantOn = !!s.radioOn;
    this.howl = null;
    this.state = 'off'; // off | loading | playing | error
    this.nowPlaying = null;
    this.listeners = new Set();
    this._duck = 1;
    this._npTimer = null;
    this._gen = 0;
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of this.listeners) fn(this); }

  get on() { return this.state === 'loading' || this.state === 'playing'; }

  /** Resume the remembered station after the first user gesture. */
  resumeIfWanted() { if (this.wantOn && !this.on) this.play(this.station.id); }

  async play(id = this.station.id) {
    const st = stationById(id) || this.station;
    const gen = ++this._gen;
    this.station = st;
    this.wantOn = true;
    store.setSetting('radioStation', st.id);
    store.setSetting('radioOn', true);
    this.state = 'loading';
    this.nowPlaying = null;
    this._emit();
    try { await loadHowler(); } catch { this._fail(gen); return; }
    if (gen !== this._gen) return;
    this._fadeOutOld();
    this._tryUrl(st, 0, gen);
    this._pollNowPlaying(gen);
  }

  _tryUrl(st, i, gen) {
    if (gen !== this._gen) return;
    if (i >= st.urls.length) { this._fail(gen); return; }
    const h = new window.Howl({ src: [st.urls[i]], html5: true, format: ['mp3', 'aac'], volume: 0, autoplay: false });
    this.howl = h;
    let started = false;
    const next = () => { if (started || gen !== this._gen) return; started = true; h.unload(); this._tryUrl(st, i + 1, gen); };
    h.once('loaderror', next);
    h.once('playerror', next);
    h.once('play', () => {
      if (gen !== this._gen) { h.unload(); return; }
      started = true;
      this.state = 'playing';
      h.fade(0, this.volume * this._duck, FADE_IN);
      this._emit();
    });
    // a stream that never starts (stalled server) counts as a failure too
    setTimeout(() => { if (!started && gen === this._gen && this.state === 'loading') next(); }, 12000);
    h.play();
  }

  _fadeOutOld() {
    const old = this.howl;
    this.howl = null;
    if (!old) return;
    try {
      old.fade(old.volume(), 0, FADE_OUT);
      setTimeout(() => old.unload(), FADE_OUT + 50);
    } catch { old.unload(); }
  }

  _fail(gen) {
    if (gen !== this._gen) return;
    this.state = 'error';
    this._emit();
  }

  stop() {
    ++this._gen;
    this.wantOn = false;
    store.setSetting('radioOn', false);
    this._fadeOutOld();
    clearTimeout(this._npTimer);
    this.state = 'off';
    this.nowPlaying = null;
    this._emit();
  }

  toggle() { if (this.on) this.stop(); else this.play(); }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    store.setSetting('radioVolume', this.volume);
    if (this.howl && this.state === 'playing') this.howl.volume(this.volume * this._duck);
    this._emit();
  }

  /** Dip the music under a big moment (a hole-out, a commentary line) and bring it back. */
  duck(level = 0.35, ms = 2500) {
    if (!this.howl || this.state !== 'playing') return;
    this._duck = level;
    this.howl.fade(this.howl.volume(), this.volume * level, 300);
    clearTimeout(this._duckT);
    this._duckT = setTimeout(() => {
      this._duck = 1;
      if (this.howl && this.state === 'playing') this.howl.fade(this.howl.volume(), this.volume, 1200);
    }, ms);
  }

  async _pollNowPlaying(gen) {
    clearTimeout(this._npTimer);
    const st = this.station;
    if (!st.np || gen !== this._gen) return;
    try {
      let np = null;
      if (st.np.kind === 'soma') {
        const r = await fetch(`https://somafm.com/songs/${st.np.ch}.json`, { cache: 'no-store' });
        const j = await r.json();
        const s = j.songs?.[0];
        if (s) np = { artist: s.artist, title: s.title };
      } else if (st.np.kind === 'kexp') {
        const r = await fetch('https://api.kexp.org/v2/plays/?limit=1', { cache: 'no-store' });
        const j = await r.json();
        const p = j.results?.[0];
        if (p && p.play_type === 'trackplay') np = { artist: p.artist, title: p.song };
        else if (p) np = { artist: 'KEXP', title: 'Air break' };
      }
      if (gen === this._gen) { this.nowPlaying = np; this._emit(); }
    } catch { /* feed unavailable: show the station only */ }
    if (gen === this._gen) this._npTimer = setTimeout(() => this._pollNowPlaying(gen), 30000);
  }
}

export const radio = new Radio();
export { STATIONS };
