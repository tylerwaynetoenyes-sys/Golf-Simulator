// Procedural audio: every sound is synthesized with WebAudio, so the game has
// no audio files to ship and each impact can be shaped by the actual strike.
//
//  impact()   club-dependent crack/click with body thump; pure strikes ring brighter
//  flight()   airy whoosh that tracks the ball away from the tee
//  land()     turf thud / green "pat" / river splash
//  ambience   crickets, river wind, the odd distant barge horn
//  ui         ticks, pairing pings, success chime, error tones, PB flourish

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.8;
    this.ambienceLevel = 0.6;
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    // Outdoor reverb: short, diffuse, slightly dark
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(2.4, 3.2);
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 0.28;
    const verbTone = ctx.createBiquadFilter();
    verbTone.type = 'lowpass';
    verbTone.frequency.value = 4200;
    this.verbSend.connect(this.verb).connect(verbTone).connect(this.master);

    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.sfx.connect(this.verbSend);
    this.ui = ctx.createGain();
    this.ui.gain.value = 0.55;
    this.ui.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.gain.value = 0;
    this.amb.connect(this.master);

    this.noise = this._noiseBuffer(2);
    this._startAmbience();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setAmbience(v) {
    this.ambienceLevel = v;
    if (this.amb) this.amb.gain.setTargetAtTime(v * 0.9, this.ctx.currentTime, 0.4);
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 400 ? i / 400 : 1);
    }
    return buf;
  }

  _noiseBuffer(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _noise(t, dur, { type = 'bandpass', freq = 1000, q = 1, gain = 1, attack = 0.001, out = this.sfx, freqEnd = null, pan = 0 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = src.connect(f).connect(g);
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node = node.connect(p);
    }
    node.connect(out);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
    return { src, f, g };
  }

  _tone(t, freq, dur, { type = 'sine', gain = 0.3, attack = 0.002, out = this.sfx, freqEnd = null, detune = 0 }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  get ok() { return this.enabled && this.ctx && this.ctx.state === 'running'; }

  // ── Shot sounds ──

  /**
   * @param {string} clubId
   * @param {number} quality 0..1 (smash / contact)
   * @param {number} speed ball speed m/s
   */
  impact(clubId = '7I', quality = 0.9, speed = 55) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + 0.005;
    const q = Math.max(0, Math.min(1, quality));
    const loud = Math.min(1, speed / 70) * 0.9 + 0.1;
    const wood = clubId === 'DR' || clubId === '3W';
    if (wood) {
      // titanium "tink-crack": bright broadband snap + metallic ring
      this._noise(t, 0.07, { type: 'highpass', freq: 2400, q: 0.7, gain: 0.95 * loud });
      this._noise(t, 0.16, { type: 'bandpass', freq: 3800 + q * 1400, q: 3.5, gain: 0.55 * loud * (0.5 + q) });
      this._tone(t, 1760 + q * 380, 0.22, { type: 'sine', gain: 0.12 * q * loud });
      this._tone(t, 2950 + q * 300, 0.12, { type: 'triangle', gain: 0.06 * q * loud });
      this._tone(t, 140, 0.09, { type: 'sine', gain: 0.35 * loud, freqEnd: 70 });
    } else {
      // forged iron: compressed click + turf brush
      this._noise(t, 0.045, { type: 'bandpass', freq: 2600 + q * 900, q: 1.6, gain: 1.0 * loud });
      this._tone(t, 1150 + q * 250, 0.07, { type: 'sine', gain: 0.18 * loud * (0.4 + q) });
      this._tone(t, 180, 0.07, { type: 'sine', gain: 0.4 * loud, freqEnd: 90 });
      // divot
      this._noise(t + 0.012, 0.22, { type: 'lowpass', freq: 900, q: 0.5, gain: 0.35 * loud, attack: 0.01 });
    }
    if (q < 0.55) {
      // mishit: dull, buzzy
      this._noise(t, 0.12, { type: 'lowpass', freq: 700, q: 2, gain: 0.5 * loud });
    }
  }

  flight(duration = 4, speed = 60) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + 0.02;
    const d = Math.min(3.2, duration * 0.6);
    const s = Math.min(1, speed / 75);
    this._noise(t, d, { type: 'bandpass', freq: 1400 + s * 1600, freqEnd: 300, q: 1.4, gain: 0.16 * s, attack: 0.06 });
    this._noise(t, d * 0.7, { type: 'highpass', freq: 5000, q: 0.5, gain: 0.04 * s, attack: 0.03 });
  }

  land(surface, speed = 15, distance = 150) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const dist = Math.max(0.12, 1 - distance / 450);
    const v = Math.min(1, speed / 35) * dist;
    if (surface === 'water') return this.splash(dist);
    if (surface === 'green') {
      this._noise(t, 0.09, { type: 'bandpass', freq: 520, q: 1.2, gain: 0.5 * v });
      this._tone(t, 110, 0.08, { gain: 0.25 * v, freqEnd: 70 });
    } else {
      this._noise(t, 0.16, { type: 'lowpass', freq: 380, q: 0.8, gain: 0.7 * v });
      this._tone(t, 85, 0.12, { gain: 0.3 * v, freqEnd: 50 });
    }
  }

  bounce(speed = 5, distance = 150) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, speed / 25) * Math.max(0.12, 1 - distance / 450);
    this._noise(t, 0.07, { type: 'lowpass', freq: 500, q: 0.7, gain: 0.35 * v });
  }

  splash(level = 0.5) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.6, { type: 'bandpass', freq: 1800, freqEnd: 400, q: 0.8, gain: 0.5 * level, attack: 0.005 });
    this._noise(t + 0.03, 1.2, { type: 'lowpass', freq: 600, q: 0.5, gain: 0.3 * level, attack: 0.02 });
    for (let i = 0; i < 6; i++) {
      this._tone(t + 0.15 + Math.random() * 0.6, 500 + Math.random() * 700, 0.05, { gain: 0.04 * level, freqEnd: 1400 });
    }
  }

  cup() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone(t, 900, 0.05, { type: 'triangle', gain: 0.35 });
    this._tone(t + 0.07, 620, 0.12, { type: 'triangle', gain: 0.3 });
    this._noise(t + 0.06, 0.18, { type: 'bandpass', freq: 1500, q: 4, gain: 0.25 });
  }

  // ── UI ──

  /** Day: birds instead of crickets. */
  setDaytime(day) { this.daytime = !!day; }

  /** Wind roar follows the weather. */
  setWind(mph) {
    this.windMph = mph;
    if (!this.ctx || !this._windGain) return;
    const t = this.ctx.currentTime;
    this._windGain.gain.setTargetAtTime(0.11 + Math.min(0.2, mph * 0.009), t, 1.2);
    this._windLp.frequency.setTargetAtTime(340 + mph * 18, t, 1.2);
  }

  /** Putter on ball: a soft, short knock. */
  putt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.05, { type: 'bandpass', freq: 1900, q: 2.5, gain: 0.28 });
    this._tone(t, 820, 0.06, { type: 'triangle', gain: 0.08 });
  }

  /** Ball catching the edge of the cup. */
  lip() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 1250, 0.09, { type: 'triangle', gain: 0.09, freqEnd: 900 });
    this._noise(t + 0.03, 0.06, { type: 'highpass', freq: 3000, gain: 0.08 });
  }

  tick() {
    if (!this.ok) return;
    this._tone(this.ctx.currentTime, 1900, 0.03, { type: 'sine', gain: 0.08, out: this.ui });
  }

  click() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone(t, 1300, 0.05, { type: 'triangle', gain: 0.12, out: this.ui });
    this._tone(t, 650, 0.04, { type: 'sine', gain: 0.08, out: this.ui });
  }

  scanPing() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone(t, 880, 0.9, { type: 'sine', gain: 0.07, attack: 0.02, out: this.ui });
    this._tone(t, 1320, 0.6, { type: 'sine', gain: 0.025, attack: 0.02, out: this.ui });
  }

  found() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone(t, 988, 0.18, { gain: 0.1, out: this.ui });
    this._tone(t + 0.09, 1319, 0.25, { gain: 0.1, out: this.ui });
  }

  success() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const notes = [1046.5, 1318.5, 1568, 2093];
    notes.forEach((f, i) => {
      this._tone(t + i * 0.075, f, 0.9 - i * 0.1, { type: 'sine', gain: 0.12, attack: 0.008, out: this.ui });
      this._tone(t + i * 0.075, f * 2, 0.3, { type: 'sine', gain: 0.02, attack: 0.008, out: this.ui });
    });
  }

  error() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone(t, 440, 0.16, { type: 'triangle', gain: 0.12, out: this.ui });
    this._tone(t + 0.14, 330, 0.3, { type: 'triangle', gain: 0.12, out: this.ui });
  }

  personalBest() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    [784, 988, 1175, 1568, 1976].forEach((f, i) => {
      this._tone(t + i * 0.06, f, 1.0, { type: 'sine', gain: 0.09, attack: 0.01, out: this.ui });
    });
    this._noise(t + 0.25, 1.2, { type: 'highpass', freq: 7000, q: 0.5, gain: 0.03, attack: 0.2, out: this.ui });
  }

  swingMeterTick(level) {
    if (!this.ok) return;
    this._tone(this.ctx.currentTime, 400 + level * 600, 0.03, { type: 'sine', gain: 0.03, out: this.ui });
  }

  // ── Ambience ──

  _startAmbience() {
    const ctx = this.ctx;
    // River wind: brown-ish noise, slowly breathing
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 340;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.11 + Math.min(0.2, (this.windMph || 0) * 0.009);
    this._windGain = windGain;
    this._windLp = lp;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain).connect(windGain.gain);
    src.connect(lp).connect(windGain).connect(this.amb);
    src.start();
    lfo.start();

    // Crickets: chirp trains at ~4.6 kHz from a few "individuals", panned
    const cricket = (pan, base, rate) => {
      const loop = () => {
        if (!this.ctx) return;
        if (this.daytime) { setTimeout(loop, 2000); return; }
        const t = ctx.currentTime;
        const n = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = base + Math.random() * 60;
          const g = ctx.createGain();
          const st = t + i * 0.055;
          g.gain.setValueAtTime(0.0001, st);
          g.gain.exponentialRampToValueAtTime(0.012, st + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, st + 0.04);
          const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
          if (p) { p.pan.value = pan; o.connect(g).connect(p).connect(this.amb); } else o.connect(g).connect(this.amb);
          o.start(st);
          o.stop(st + 0.06);
        }
        setTimeout(loop, (rate + Math.random() * rate) * 1000);
      };
      setTimeout(loop, Math.random() * 1500);
    };
    cricket(-0.7, 4550, 0.9);
    cricket(0.6, 4720, 1.2);
    cricket(0.1, 4380, 1.6);
    cricket(-0.2, 4900, 2.4);

    // Daytime: the odd songbird up on the bluff instead of crickets
    const bird = () => {
      if (!this.ctx) return;
      if (this.daytime) {
        const t = ctx.currentTime;
        const base = 2400 + Math.random() * 1400;
        const notes = 2 + Math.floor(Math.random() * 4);
        const pan = Math.random() * 1.6 - 0.8;
        for (let i = 0; i < notes; i++) {
          const st = t + i * (0.11 + Math.random() * 0.05);
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(base * (1 + Math.random() * 0.25), st);
          o.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.5), st + 0.08);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, st);
          g.gain.exponentialRampToValueAtTime(0.018, st + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0001, st + 0.09);
          const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
          if (p) { p.pan.value = pan; o.connect(g).connect(p).connect(this.amb); } else o.connect(g).connect(this.amb);
          o.start(st);
          o.stop(st + 0.1);
        }
      }
      setTimeout(bird, (3 + Math.random() * 7) * 1000);
    };
    setTimeout(bird, 2000);

    // Distant barge horn every couple of minutes
    const horn = () => {
      if (!this.ctx) return;
      const t = ctx.currentTime;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.6);
      g.gain.setValueAtTime(0.05, t + 2.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 420;
      [98, 98.6, 147].forEach((fr) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr;
        o.connect(f);
        o.start(t);
        o.stop(t + 3.8);
      });
      f.connect(g).connect(this.amb);
      g.connect(this.verbSend);
      setTimeout(horn, (80 + Math.random() * 90) * 1000);
    };
    setTimeout(horn, 25000);

    this.amb.gain.setTargetAtTime(this.ambienceLevel * 0.9, ctx.currentTime, 1.5);
  }
}

export const audio = new AudioEngine();
