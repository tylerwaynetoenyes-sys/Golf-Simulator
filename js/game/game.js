// Game controller: turns launches (R10, demo swing, custom entry, putts) into
// shots, plays them back, scores them through the active mode, keeps turn
// order for 1–6 players, and drives HUD, camera, audio and commentary.
import * as THREE from 'three';
import { simulateShot, simulatePutt, puttSpeedFor, samplePath, MPH, YD, BALL } from '../core/physics.js';
import { bus } from '../core/events.js';
import { units } from '../core/units.js';
import * as U from '../core/units.js';
import { CLUBS, clubById, demoLaunch } from '../data/clubs.js';
import { store } from '../data/store.js';
import { audio } from '../audio/audio.js';
import { createModes } from './modes.js';
import { CourseMode } from './courseMode.js';
import { Roster } from './roster.js';
import { commentFor, line } from './commentary.js';
import { toast } from '../ui/dom.js';
import { piasaSVG } from '../ui/piasa.js';
import {
  openSummary, panelOpen, closePanel, openModePicker, openSession, openSettings, openManual, openHelp,
  openHoleSummary, openScorecard, openPlayers, openCourseSetup,
} from '../ui/panels.js';

const RPM = (2 * Math.PI) / 60;
const CAMERA_STYLES = ['cinematic', 'follow', 'tee'];
const RANGE_SETUP = { origin: { x: 0, y: 0.1, z: 0 }, heading: 0, teed: true, putting: false, lie: 'tee', toPin: null };

// Power rises to 100% in 0.95 s, then creeps into an over-swing (max 110%).
const swingPower = (t) => (t < 0.95 ? t / 0.95 : Math.min(1.1, 1 + (t - 0.95) * 0.35));

export class Game {
  constructor(world, hud, client, pairing, piasa) {
    this.world = world;
    this.hud = hud;
    this.client = client;
    this.pairing = pairing;
    this.piasa = piasa;
    this.roster = new Roster();
    this.modes = createModes(this, CourseMode);
    this.mode = this.modes.range;
    this.club = clubById('7I');
    this.aimDeg = 0;
    this.state = 'idle'; // idle | intro | ready | flight | rest | hole | summary
    this.shot = null;
    this.r10 = false;
    this.player = this.roster.players[0];
    this.setup = RANGE_SETUP;
    this.swing = { holding: false, power: 0, t: 0, lastTick: 0 };
    this.ballPos = new THREE.Vector3(0, 0.1, 0);
    this.helper = null;
    this._buildAimLine();

    bus.on('r10:shot', (launch) => this.onR10Shot(launch));
    bus.on('r10:misread', () => toast("R10 saw the swing but not the ball", { kind: 'warn', sub: 'Swing again — check alignment and distance' }));
    bus.on('r10:connected', () => {
      this.r10 = true;
      this.updatePrompt();
      this.sendR10Config();
      if (this.state !== 'idle') this.hud.comment(line('r10'));
    });
    bus.on('r10:disconnected', () => { this.r10 = false; this.updatePrompt(); });
    bus.on('ui:help', (tab) => openHelp(this, tab));
    this._bindInput();
    this._bindEnv();
    this.applySetting('camera', store.settings.camera, false);
    units.system = store.settings.units;
    const day = store.settings.timeOfDay === 'day';
    world.env.setTime(day ? 'day' : 'night', true);
    world.env.setWeather(store.settings.weather || 'clear', { immediate: true });
    this._syncEnvUI();
    audio.setDaytime(day);
    audio.windMph = world.env.weather.windMph;
    world.env.onChange(() => { this.hud.setMode(this.mode.status()); this._updateHelper(); });
    const tvParam = new URLSearchParams(location.search).get('tv');
    this.applyDisplay(tvParam != null ? (tvParam === '0' ? 'standard' : 'tv') : store.settings.display);
    this.hud.onLeaderboard = (el) => { const m = el.querySelector('#lbMascot'); if (m) m.innerHTML = this._lbArt || (this._lbArt = piasaSVG({ id: 'pzLb' })); };
    this._updatePlayersBadge();
  }

  /** Players were edited. A changed line-up restarts a game in progress. */
  onRosterChanged(structural) {
    this._updatePlayersBadge();
    if (structural && this.state !== 'idle') {
      const inProgress = this.mode.course || this.mode.k > 0;
      this.restartMode();
      if (inProgress) toast('New line-up · game restarted', { kind: 'info', sub: this.roster.players.map((p) => p.name).join(', ') });
    } else if (this.state !== 'idle') {
      this.refreshMode();
      this.hud.setTurn(this._turnInfo(), this.state === 'ready' && (this.roster.multi || this.mode.course));
    }
  }

  _updatePlayersBadge() {
    const b = document.getElementById('playersBadge');
    if (!b) return;
    b.hidden = !this.roster.multi;
    b.textContent = String(this.roster.size);
  }

  // ── conditions popover ──

  _bindEnv() {
    const pop = document.getElementById('envPopover');
    const btn = document.getElementById('envButton');
    if (!pop || !btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.click();
      document.getElementById('r10Popover').hidden = true;
      this._syncEnvUI();
      pop.hidden = !pop.hidden;
    });
    document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true; });
    pop.querySelectorAll('[data-time]').forEach((b) => b.addEventListener('click', () => { audio.tick(); this.setTimeOfDay(b.dataset.time); }));
    pop.querySelectorAll('[data-weather]').forEach((b) => b.addEventListener('click', () => { audio.tick(); this.setWeather(b.dataset.weather); }));
  }

  _syncEnvUI() {
    const env = this.world.env;
    const day = env.isDay;
    document.body.classList.toggle('day', day);
    document.querySelectorAll('#envTime [data-time]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.time === 'day') === day)));
    document.querySelectorAll('#envWeather [data-weather]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.weather === env.weatherId)));
    const sub = document.getElementById('brandSub');
    if (sub) sub.textContent = `Mississippi bluffs · ${day ? 'afternoon' : 'night'}`;
  }

  // ── lifecycle ──

  start(how) {
    this.state = 'ready';
    this.hud.show();
    this.mode.start();
    this._prepareTurn(true);
    setTimeout(() => this.hud.comment(line(how === 'r10' ? 'r10' : 'welcome')), 900);
    this._keepAwake();
  }

  /** Switch game. Course needs options (holes, gimme) from its setup panel. */
  setMode(id, opts = {}) {
    if (!this.modes[id]) return;
    if (id === 'course' && !opts.length) { openCourseSetup(this); return; }
    if (this.state === 'flight' || this.state === 'rest') this._finishNow();
    this.mode.stop();
    this.mode = this.modes[id];
    this.world.tracer.clearGhosts();
    this.hud.clearDots();
    if (id !== 'course') this.world.setScene('range');
    this.mode.start(opts);
    this.shot = null;
    if (this.mode.course) {
      this._introHole();
    } else {
      this.state = 'ready';
      this._prepareTurn(true);
      toast(this.mode.name, { kind: 'info', sub: this.mode.blurb, ms: 3600 });
    }
  }

  restartMode() {
    const opts = this.mode.course ? { length: this.mode.length, gimme: this.mode.gimme, startHole: this.mode.holes[0].n } : {};
    this.setMode(this.mode.id, opts);
  }

  refreshMode() {
    this.hud.dotsColored = this.roster.multi;
    this.hud.setMode(this.mode.status());
    this.hud.setLeaderboard(this.mode.leaderboard(), this.player?.id, this.mode.course);
  }

  /** Set up whoever is next: ball position, camera, club, prompts. */
  _prepareTurn(immediate = false) {
    const m = this.mode;
    const prevPlayer = this.player;
    this.player = m.currentPlayer();
    this.setup = m.shotSetup ? m.shotSetup(this.player) : RANGE_SETUP;
    const s = this.setup;
    const w = this.world;
    if (m.course) this.aimDeg = 0;
    w.ball.placeAt(s.origin.x, s.origin.y, s.origin.z, s.teed);
    const pin = m.course ? m.T.pin : null;
    w.rig.setAddress(new THREE.Vector3(s.origin.x, w.ball.mesh.position.y, s.origin.z), s.heading,
      { putting: s.putting, lookAt: pin ? new THREE.Vector3(pin.x, w.groundFn(pin.x, pin.z) + 0.1, pin.z) : null });
    w.rig.setAim(this.aimDeg);
    w.rig.toAddress(immediate);
    this.aimLine.position.set(s.origin.x, w.ball.mesh.position.y - 0.02, s.origin.z);
    this.aimLine.visible = !s.putting;
    if (m.course) w.course.setPutting(!!s.putting);
    this._buildPuttLine();
    w.markers.set(m.markers());
    const sug = m.suggestedClub?.();
    if (sug) this.selectClub(sug, true); else this._updateHelper();
    this.refreshMode();
    this.hud.setTurn(this._turnInfo(), this.roster.multi || m.course);
    this.hud.hideCard();
    this.hud.setSkip(false);
    if (this.roster.multi && prevPlayer && prevPlayer.id !== this.player.id && !immediate) {
      audio.click();
    }
  }

  _turnInfo() {
    const p = this.player;
    const s = this.setup;
    const team = this.roster.teamOf(p);
    let detail = '';
    if (this.mode.course) {
      const lie = { tee: 'Tee shot', fairway: 'Fairway', rough: 'Rough', sand: 'Bunker', green: 'On the green', fringe: 'Fringe' }[s.lie] || s.lie;
      detail = s.putting ? `${U.proximity(s.toPin)} putt` : `${lie} · ${U.dist(s.toPin)} ${U.distUnit()}`;
      detail += ` · stroke ${s.strokes + 1}`;
    }
    return { name: p.name, color: p.color, team: team ? `Team ${team.name}` : '', detail };
  }

  selectClub(id, quiet = false) {
    this.club = clubById(id);
    this.hud.setClub(this.club.id);
    if (!quiet) audio.tick();
    this._updateHelper();
  }

  /** Where the current mode wants the ball to finish (metres), if anywhere. */
  _targetPoint() {
    if (this.mode.roundOver) return null;
    if (this.mode.course) return this.mode.T?.pin || null;
    if (this.mode.pin) return this.mode.pin;
    if (this.mode.target) return this.mode.target;
    return null;
  }

  /** Demo helper: swing power that sends the selected club to the target. */
  _updateHelper() {
    const tp = this._targetPoint();
    this.helper = null;
    const s = this.setup;
    if (tp && !s.putting) {
      const o = s.origin;
      const want = Math.hypot(tp.x - o.x, tp.z - o.z);
      const wind = this.mode.wind();
      const useTotal = this.mode.id === 'ctp' || this.mode.course;
      const flat = () => ({ height: o.y - 0.03, surface: 'fairway' });
      const reach = (p) => {
        const r = simulateShot(demoLaunch(this.club, p, 1, 0, null), { terrain: flat, wind, origin: o, heading: s.heading });
        return useTotal ? r.total : r.carry;
      };
      if (reach(1.0) >= want * 0.97) {
        let lo = 0.12, hi = 1.0;
        for (let i = 0; i < 14; i++) {
          const mid = (lo + hi) / 2;
          if (reach(mid) < want) lo = mid; else hi = mid;
        }
        this.helper = { power: (lo + hi) / 2, yards: want };
      } else {
        this.helper = { power: null, yards: want };
      }
    } else if (s.putting) {
      const pw = this.mode.puttPower ? this.mode.puttPower(this.player, this.aimDeg) : 0.8;
      this.helper = { power: Math.min(1.1, pw), putt: true };
    }
    this.hud.setMeterTarget(this.helper?.power ?? null);
    this.updatePrompt();
  }

  updatePrompt() {
    const s = this.setup;
    const key = (k) => `<span class="prompt-key">${k}</span>`;
    if (s.putting && this.mode.course) {
      const read = this.mode.puttRead(this.player);
      const brk = Math.abs(read.breakInches) < 2 ? 'straight' : `breaks ${Math.round(Math.abs(read.breakInches))} in ${read.breakInches > 0 ? 'right' : 'left'}`;
      // plays-like length from the pace the slope actually needs
      const pw = this.helper?.putt ? this.helper.power : 0.8;
      const plays = read.distance * (pw / 0.8);
      const ft = (m) => m / 0.3048;
      const playsTxt = Math.abs(ft(plays) - ft(read.distance)) >= 1.5 ? ` · plays <b>${U.proximity(plays)}</b>` : '';
      const slope = Math.abs(read.uphill) < 0.03 ? '' : read.uphill > 0 ? ' uphill' : ' downhill';
      this.hud.setPrompt(`<b>${U.proximity(read.distance)}</b>${slope} · ${brk}${playsTxt} · ${key('Enter')} auto putt · hold ${key('Space')} to putt · ${key('← →')} aim`, this.r10);
      this.hud.setPuttMode(true);
      return;
    }
    this.hud.setPuttMode(false);
    const h = this.helper;
    const helperText = h && !h.putt
      ? h.power != null
        ? ` · <b>${this.club.short}</b> needs about <b>${Math.round(h.power * 100)}%</b>`
        : this.mode.course
          ? ` · <b>${this.club.short}</b> full swing`
          : ` · <b>${this.club.short}</b> won't get there — club up`
      : '';
    const tp = this._targetPoint();
    if (this.r10) {
      const o = s.origin;
      const toT = tp ? ` · ${U.dist(Math.hypot(tp.x - o.x, tp.z - o.z))} ${U.distUnit()} to the ${this.mode.course || this.mode.pin ? 'pin' : 'target'}` : '';
      this.hud.setPrompt(`<b>R10 armed</b> — ${this.roster.multi ? `${this.player.name}, ` : ''}take your swing${toT} · ${key('← →')} aim`, true);
    } else {
      this.hud.setPrompt(h && !h.putt
        ? `${key('Space')} hold &amp; release${helperText} · ${key('← →')} aim`
        : `${key('Space')} hold, release in the green for a pure strike · ${key('← →')} aim · ${key('1–7')} club`);
    }
  }

  /** Tell the R10 where the ball is and the conditions on the bluff. */
  sendR10Config() {
    this.client.shotConfig({ teeRangeYards: store.settings.r10Distance / 3, temperatureC: 18, humidity: 0.65, altitudeM: 190 });
  }

  setTimeOfDay(which) {
    store.setSetting('timeOfDay', which);
    this.world.env.setTime(which);
    this._syncEnvUI();
    audio.setDaytime(which === 'day');
  }

  setWeather(id) {
    store.setSetting('weather', id);
    // keep the course's per-hole wind direction; the range uses the preset's
    this.world.env.setWeather(id, this.mode.course ? { windFromDeg: this.world.env.windFromDeg } : {});
    this._syncEnvUI();
    audio.setWind(this.world.env.weather.windMph);
    toast(`${{ clear: 'Clear', cloudy: 'Cloudy', breezy: 'Light wind', windy: 'Strong wind' }[id]}`, { kind: 'info', sub: this.world.env.weather.windMph > 0.5 ? `${Math.round(this.world.env.weather.windMph)} mph with gusts` : 'Calm', ms: 1800 });
  }

  applySetting(key, value, save = true) {
    if (save) store.setSetting(key, value);
    switch (key) {
      case 'units':
        units.system = value;
        this.hud.renderClubs(this.club.id);
        this.refreshMode();
        this.updatePrompt();
        break;
      case 'camera': this.world.rig.setStyle(value); break;
      case 'quality': this.world.setQuality(value); break;
      case 'volume': audio.setVolume(value); break;
      case 'ambience': audio.setAmbience(value); break;
      case 'ghostTracers': this.world.tracer.setGhostsVisible(!!value); break;
      case 'bridgeUrl': this.client.setUrl(value); break;
      case 'display': this.applyDisplay(value); break;
      case 'timeOfDay': this.setTimeOfDay(value); break;
      case 'weather': this.setWeather(value); break;
      case 'r10Distance': {
        const el = document.getElementById('r10DistVal');
        if (el) el.textContent = `${value} ft`;
        clearTimeout(this._cfgTimer);
        this._cfgTimer = setTimeout(() => this.sendR10Config(), 400);
        break;
      }
      default: break;
    }
  }

  /** Big-screen mode: larger UI, wider tracer, bigger ball glow. */
  applyDisplay(mode) {
    const tv = mode === 'tv';
    document.body.classList.toggle('tv', tv);
    this.world.tracer.setScale(tv ? 1.9 : 1);
    this.world.ball.setScale(tv ? 1.7 : 1);
    this.world.rig.fovScale = tv ? 0.94 : 1;
  }

  // ── shots ──

  onR10Shot(launch) {
    if (this.state === 'idle') return;
    // R10 direction is relative to the unit's alignment; apply the virtual aim.
    const l = { ...launch, launchDirection: launch.launchDirection + this.aimDeg };
    if (l.faceAngle != null) l.faceAngle += this.aimDeg;
    if (l.clubPath != null) l.clubPath += this.aimDeg;
    this.handleLaunch(l, launch.source || 'r10');
  }

  /** Get from intro / hole summary / round summary to a playable state now. */
  _ensureReady() {
    if (this.state === 'intro') { this.world.rig.skipFlyover(); this._endIntro(); }
    if (this.state === 'hole') {
      this._fastNext = true;
      closePanel(); // its callback advances (fast) if the hole summary is up
      if (this.state === 'hole') this._nextHole(true);
      this._fastNext = false;
    }
    if (this.state === 'summary') { closePanel(); this.restartMode(); }
    if (this.state === 'flight' || this.state === 'rest') { this._finishNow(); this._afterShot(true); }
    if (this.mode.roundOver) this.restartMode();
  }

  handleLaunch(launch, source = 'demo') {
    if (this.state === 'idle') return;
    audio.init();
    this._ensureReady();
    if (this.state === 'intro') this._endIntro();
    const s = this.setup;
    // a putting stroke picked up by the radar (or a tap of the demo meter)
    if (s.putting && this.mode.course && launch.ballSpeed < 9) {
      const res = this.mode.manualPutt(this.player, Math.min(1.1, launch.ballSpeed / 4), this.aimDeg + (launch.launchDirection - this.aimDeg));
      this._play(res, { ...launch, putt: true }, source);
      return;
    }
    const lie = this.mode.adjustLaunch ? this.mode.adjustLaunch(launch, s) : launch;
    const result = simulateShot(lie, {
      terrain: this.world.terrainFn, wind: this.mode.wind(), origin: s.origin, heading: s.heading, cup: this.mode.cup?.(s) || null,
    });
    this._play(result, lie, source);
  }

  /** Auto or manual putt for the current player (course only). */
  putt(kind, power = 0.8) {
    if (this.state !== 'ready' || !this.setup.putting || !this.mode.course) return;
    audio.init();
    const res = kind === 'auto' ? this.mode.autoPutt(this.player) : this.mode.manualPutt(this.player, power, this.aimDeg);
    this._play(res, { putt: true, ballSpeed: 0, launchAngle: 0, launchDirection: 0, totalSpin: 0, spinAxis: 0 }, kind === 'auto' ? 'auto' : 'demo');
  }

  _play(result, launch, source) {
    const club = launch.putt ? { id: 'PT', name: 'Putter', short: 'PT', ballMph: 5, smash: 1.5 } : this.club;
    const player = this.player;
    const outcome = this.mode.evaluate(result, launch, club, player) || {};
    // personal bests are personal: only tracked when one player is on the tee
    if (!launch.putt && !this.roster.multi) this._globalBests(result, launch, club, outcome);

    if (!launch.putt) {
      store.addShot({
        at: Date.now(), mode: this.mode.id, club: club.id, source, player: player.name,
        ballSpeed: launch.ballSpeed, launchAngle: launch.launchAngle, launchDirection: launch.launchDirection,
        totalSpin: launch.totalSpin, spinAxis: launch.spinAxis, clubSpeed: launch.clubSpeed || null,
        carry: result.carry, total: result.total, offline: result.offline, apex: result.apex.y,
        descent: result.descentAngle, lost: result.lost, result: outcome.headline || '',
      });
    }

    this.shot = { launch, result, outcome, source, club, player, t: 0, ev: 0, landed: false, holed: false, revealed: false };
    this.state = 'flight';
    this.aimLine.visible = false;
    if (this.puttLine) this.puttLine.visible = false;
    if (this.mode.course) this.world.course.setReadingAids(false);
    this.hud.setPrompt('');
    const w = this.world;
    w.tracer.reset();
    w.tracer.setColor(this.mode.id === 'ctp' ? 0xffc04a : new THREE.Color(player.color).getHex());
    const o = result.origin || { x: 0, y: 0, z: 0 };
    if (!launch.putt) {
      const sa = (launch.spinAxis * Math.PI) / 180;
      w.ball.spinAxis.set(Math.cos(sa), -Math.sin(sa), 0).normalize();
      w.ball.spinRate = launch.totalSpin * RPM * 0.12;
      w.characters.swing(0);
      w.effects.burst(o.x, o.y + 0.05, o.z, { n: 16, color: 0xfff0d0, speed: 1.4, up: 1.2, life: 0.32, gravity: 2 });
      if (club.id !== 'DR' || !this.setup.teed) w.effects.burst(o.x, o.y, o.z, { n: 22, color: this.setup.lie === 'sand' ? 0xe8dcb8 : 0x58702c, speed: 1.8, up: 2.6, life: 0.9 });
      const expected = club.ballMph * MPH;
      const smash = launch.clubSpeed ? launch.ballSpeed / launch.clubSpeed : null;
      const quality = smash ? Math.min(1, Math.max(0, (smash - (club.smash - 0.2)) / 0.2)) : Math.min(1, launch.ballSpeed / expected);
      audio.impact(club.id, launch.launchAngle < 4 ? 0.3 : quality, launch.ballSpeed);
      audio.flight(result.flightTime, launch.ballSpeed);
    } else {
      audio.putt();
    }
    w.rig.startShot(result);
    this.hud.hideCard();
    this.hud.comment(null);
    this.hud.setSkip(true);
    this.hud.meter(false, 0);
    this.hud.setTurn(null, false);
    bus.emit('shot:start', { launch, result, source });
  }

  /** Personal bests that count in every mode. */
  _globalBests(result, launch, club, outcome) {
    const bests = outcome.bests || (outcome.bests = []);
    const add = (label, value) => { if (!bests.some((b) => b.label === label)) bests.push({ label, value }); };
    if (launch.ballSpeed > 40) {
      const r = store.submitBest('range.ballSpeed', launch.ballSpeed, 'max');
      if (r.isBest && !r.first) add('Ball speed', `${(launch.ballSpeed / MPH).toFixed(1)} mph`);
    }
    if (!result.lost && club.id === 'DR' && !this.mode.course) {
      const r = store.submitBest('range.longestDrive', result.total, 'max');
      if (r.isBest && !r.first) add('Longest drive', `${U.dist(result.total)} ${U.distUnit()}`);
    }
    if (!result.lost && !this.mode.course) {
      const r = store.submitBest(`range.carry.${club.id}`, result.carry, 'max', { club: club.id });
      if (r.isBest && !r.first) add(`${club.short} carry`, `${U.dist(result.carry)} ${U.distUnit()}`);
    }
    if (bests.length) outcome.isBest = true;
  }

  skip() {
    if (this.state === 'intro') { this.world.rig.skipFlyover(); return; }
    if (this.state !== 'flight' || !this.shot) return;
    this.shot.t = this.shot.result.duration;
  }

  _finishNow() {
    if (!this.shot) return;
    if (!this.shot.revealed) this._reveal();
  }

  _onRest() {
    const s = this.shot;
    this.state = 'rest';
    const r = s.result;
    this.world.rig.ballAtRest(new THREE.Vector3(r.rest.x, r.rest.y, r.rest.z));
    this.world.tracer.finish(store.settings.ghostTracers && !this.mode.course);
    this.hud.setSkip(false);
    this._reveal();
    const o = s.outcome;
    s.restTimer = r.holed && !s.tapping ? 3.2 : o.summary ? 2.6 : o.holeComplete ? 2.2 : r.putt ? 1.5 : 3.2 + (this.hud.commentEl.classList.contains('show') ? 0.8 : 0);
    if (o.gimme && !s.tapped) s.tapDelay = 0.75;
  }

  /** Conceded putt: knock it in so the ball still finishes in the cup. */
  _tapIn(s) {
    const m = this.mode;
    if (!m.course || !m.T) return;
    const T = m.T;
    const b = s.result.rest;
    const d = T.toPin(b.x, b.z);
    const base = (Math.atan2(T.pin.x - b.x, -(T.pin.z - b.z)) * 180) / Math.PI;
    let res = null;
    for (const sf of [1.12, 1.2, 1.05, 1.3]) {
      for (let k = 0; k <= 24 && !res; k++) {
        const aim = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.6;
        const r = simulatePutt({ x: b.x, y: b.y, z: b.z }, base + aim, puttSpeedFor(d) * sf + 0.15, T.terrain, T.pin);
        if (r.holed) res = r;
      }
      if (res) break;
    }
    if (!res) { this.world.ball.setVisible(false); return; }
    s.tapped = true;
    s.tapping = true;
    s.result = res;
    s.t = 0;
    s.ev = 0;
    s.restRevealed = true;
    this.state = 'flight';
    audio.putt();
    this.hud.comment(null);
    this.world.rig.startShot(res, { cupCam: false });
  }

  /** Ball at the bottom of the cup: banner, sparks, gallery, Piasa. */
  _holeOutMoment(s) {
    const r = s.result;
    const o = s.outcome || {};
    const w = this.world;
    const cy = w.groundFn(r.holedAt.x, r.holedAt.z);
    const d = r.putt ? Math.hypot(r.holedAt.x - r.origin.x, r.holedAt.z - r.origin.z) : 0;
    const cat = o.category;
    const level = o.ace ? 1 : cat === 'eagle' ? 0.95 : cat === 'birdie' || cat === 'longPutt' ? 0.7 : !r.putt ? 0.85 : cat === 'par' ? 0.35 : 0.22;
    w.effects.holeOut(r.holedAt.x, cy, r.holedAt.z, level);
    audio.cheer(level);
    if (level >= 0.85) setTimeout(() => audio.personalBest(), 350);
    const big = level >= 0.6;
    let title = o.headline || 'In the hole';
    let kicker = !r.putt ? (r.holedAt.dunk ? 'Straight in' : 'Holed out') : d > 6 ? `From ${U.proximity(d)}` : 'In the hole';
    if (o.ace) { title = 'Hole in one'; kicker = this.mode.course ? this.mode.hole.name : 'Closest to Pin'; }
    title = title.replace(/ · gimme$/, '');
    const sub = this.roster.multi || this.mode.course ? `${s.player.name}${o.sub ? ` · ${o.sub.replace(` · ${s.player.name}`, '')}` : ''}` : o.sub || '';
    this.hud.holeOut({ kicker, title, sub, big });
    this.piasa?.react(big ? 'big' : 'cheer');
  }

  _reveal() {
    const s = this.shot;
    if (!s || s.revealed) return;
    s.revealed = true;
    const { launch, result, outcome, club, source, player } = s;
    if (result.putt) this.hud.showPutt({ result, outcome, player, left: this.mode.T ? this.mode.T.toPin(result.rest.x, result.rest.z) : null });
    else this.hud.showShot({ launch, result, club, source, outcome, player: this.roster.multi ? player : null });
    if (!result.putt) this.hud.addDot(result, player.color);
    this.refreshMode();
    if (store.settings.commentary && !(result.holed && !s.tapping)) {
      const c = commentFor({ result, launch, club, mode: this.mode.id, outcome, hole: this.mode.course ? this.mode.hole : null });
      if (c) this.hud.comment(c);
    }
    if (outcome.bests?.length) {
      audio.personalBest();
      for (const b of outcome.bests) toast(`Personal best · ${b.label}`, { kind: 'pb', sub: b.value, ms: 4200 });
      if (!outcome.ace) this.world.effects.celebrate(result.rest.x, result.rest.y, result.rest.z);
    }
    this.piasa?.reactTo({ result, outcome, launch, club });
    bus.emit('shot:result', { launch, result, outcome, source });
  }

  /** After the ball settles: next player, next hole, or summary. */
  _afterShot(fast = false) {
    const s = this.shot;
    const o = s?.outcome || {};
    this.shot = null;
    if (o.summary) {
      this._showSummary(o.summary);
      return;
    }
    if (o.holeComplete) {
      this.state = 'hole';
      if (fast) { this._nextHole(true, o); return; }
      openHoleSummary(this, o.holeComplete, () => this._nextHole(!!this._fastNext, o));
      this._pendingAdvance = o.advance;
      return;
    }
    o.advance?.();
    this.state = 'ready';
    this._prepareTurn();
  }

  _nextHole(skipIntro = false, o = null) {
    if (this.state !== 'hole') return;
    this.state = 'ready';
    const adv = o?.advance || this._pendingAdvance;
    this._pendingAdvance = null;
    adv?.();
    this.world.tracer.clearGhosts();
    this.hud.clearDots();
    if (skipIntro) { this.state = 'ready'; this._prepareTurn(true); } else this._introHole();
  }

  /** Fly the hole from tee to green, then settle behind the first player's ball. */
  _introHole() {
    const m = this.mode;
    const T = m.T;
    const h = m.hole;
    this.state = 'intro';
    this._prepareTurn(true);
    this.hud.setTurn(null, false);
    const gy = (x, z) => this.world.groundFn(x, z);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const mid = T.pointAt(T.length * 0.5);
    const g = T.green, f = T.finalDir;
    const keys = [
      { pos: V(0 - mid.dx * 30, gy(0, 0) + 30, 0 - mid.dz * 30 + 20), look: V(mid.x, gy(mid.x, mid.z), mid.z) },
      { pos: V(mid.x - mid.dx * 40 + mid.rx * 25, gy(mid.x, mid.z) + 42, mid.z - mid.dz * 40 + mid.rz * 25), look: V(g.x, gy(g.x, g.z) + 2, g.z) },
      { pos: V(g.x - f.x * 55 - T.finalRight.x * 20, gy(g.x, g.z) + 16, g.z - f.z * 55 - T.finalRight.z * 20), look: V(g.x + f.x * 40, gy(g.x, g.z) + 14, g.z + f.z * 40) },
    ];
    this.hud.showHoleCard({ n: h.n, name: h.name, par: h.par, yards: Math.round(T.length / YD), note: h.note, idx: m.holeIdx + 1, of: m.holes.length });
    this.world.rig.flyover(keys, 6.5, () => this._endIntro());
  }

  _endIntro() {
    if (this.state !== 'intro') return;
    this.hud.hideHoleCard();
    this.state = 'ready';
    this._prepareTurn();
  }

  _showSummary(summary) {
    this.state = 'summary';
    if (summary.isBest) audio.personalBest();
    this.piasa?.react('cheer');
    openSummary(summary, {
      onAgain: () => this.restartMode(),
      onRange: () => this.setMode('range'),
      onScorecard: summary.scorecard ? () => openScorecard(this) : null,
    });
  }

  // ── per frame ──

  update(dt) {
    const w = this.world;
    const s = this.shot;
    if (this.state === 'flight' && s) {
      const prevT = s.t;
      const r = s.result;
      // slow motion through the drop (not for tap-ins)
      let scale = 1;
      if (r.holedAt && !s.tapping) {
        const rel = s.t - r.holedAt.t;
        if (rel > -0.42 && rel < 0.45) scale = 0.34;
        else if (rel > -0.8 && rel <= -0.42) scale = 1 - 0.66 * ((rel + 0.8) / 0.38);
      }
      s.t += dt * scale;
      this.timeScale = scale;
      const p = samplePath(r, s.t);
      this.ballPos.set(p.x, p.y, p.z);
      w.ball.setPosition(p.x, p.y + BALL.radius, p.z);
      if (!s.landed && !r.putt) w.tracer.push(p.x, p.y, p.z);
      const o = r.origin || { x: 0, z: 0 };
      while (s.ev < r.events.length && r.events[s.ev].t <= s.t) {
        const e = r.events[s.ev++];
        const d = Math.hypot(e.x - o.x, e.z - o.z);
        if (e.type === 'land') {
          s.landed = true;
          if (e.surface !== 'water' && e.surface !== 'oob') {
            const surf = e.surface === 'cup' ? 'green' : e.surface;
            w.effects.land({ ...e, surface: surf });
            audio.land(surf, e.speed, d);
          }
          w.ball.spinRate *= 0.3;
        } else if (e.type === 'edge') {
          s.landed = true;
        } else if (e.type === 'bounce' && e.surface !== 'water' && e.surface !== 'oob') {
          audio.bounce(e.speed, d);
          if (e.speed > 6) w.effects.burst(e.x, e.y, e.z, { n: 8, color: e.surface === 'sand' ? 0xe8dcb8 : 0x6f8a3a, speed: 1, up: 1, life: 0.5 });
        } else if (e.type === 'lip') {
          audio.lip();
          if (!s.tapping && e.speed > 0.6) s.lipped = true;
        } else if (e.type === 'drop') {
          audio.cupDrop(e.speed);
          w.ball.spinRate = 0;
        } else if (e.type === 'rattle') {
          audio.cupRattle(e.speed, e.pole);
        } else if (e.type === 'cupBottom') {
          s.holed = true;
          audio.cupBottom(e.speed);
          if (!s.tapping) this._holeOutMoment(s);
          else audio.cheer(0.12);
        } else if (e.type === 'splash') {
          if (e.surface === 'water') { w.effects.splash(e.x, e.y, e.z); audio.splash(Math.max(0.2, 1 - d / 600)); }
          w.ball.setVisible(false);
          s.t = Math.max(s.t, r.duration);
        }
      }
      if (prevT < r.duration && s.t >= r.duration) this._onRest();
    } else if (this.state === 'rest' && s) {
      this.ballPos.copy(w.ball.mesh.position);
      if (s.tapDelay != null) {
        s.tapDelay -= dt;
        if (s.tapDelay <= 0) { s.tapDelay = null; this._tapIn(s); }
      } else {
        s.restTimer -= dt;
        if (s.restTimer <= 0) this._afterShot();
      }
    } else {
      this.ballPos.copy(w.ball.mesh.position);
    }

    // demo swing meter
    if (this.swing.holding) {
      const sw = this.swing;
      sw.t = (performance.now() - sw.start) / 1000;
      sw.power = swingPower(sw.t);
      this.hud.meter(true, sw.power);
      if (sw.t - sw.lastTick > 0.12) { sw.lastTick = sw.t; audio.swingMeterTick(sw.power); }
    }

    this.aimLine.rotation.y = (-(this.setup.heading + this.aimDeg) * Math.PI) / 180;
    this._updateLabels();
    this.hud.drawMap(this.state === 'flight' ? this.ballPos : null, this.aimDeg, this.mode.id, this.mode.course ? this.mode : null, this.setup);
    return this.ballPos;
  }

  // ── demo swing / manual putt ──

  _swingStart() {
    if (this.state === 'intro') { this.skip(); return; }
    if (this.state !== 'ready' || panelOpen()) return;
    audio.init();
    this.swing = { holding: true, power: 0, t: 0, lastTick: 0, start: performance.now() };
    document.getElementById('swingButton').classList.add('holding');
  }

  _swingRelease() {
    const sw = this.swing;
    if (!sw.holding) return;
    sw.holding = false;
    sw.power = swingPower((performance.now() - sw.start) / 1000);
    document.getElementById('swingButton').classList.remove('holding');
    if (sw.power < 0.05) { this.hud.meter(false, 0); return; }
    const p = sw.power;
    setTimeout(() => this.hud.meter(false, 0), 400);
    if (this.setup.putting && this.mode.course) { this.putt('manual', p); return; }
    // pure strike window: 84%–98%; soft swings stay clean, over-swings get loose
    let contact;
    if (p >= 0.84 && p <= 0.98) contact = 0.97 + Math.random() * 0.03;
    else if (p < 0.84) contact = 0.86 + 0.1 * (p / 0.84) + Math.random() * 0.03;
    else contact = Math.max(0.35, 0.95 - (p - 0.98) * 4.5) + Math.random() * 0.05;
    this.handleLaunch(demoLaunch(this.club, p, contact, this.aimDeg), 'demo');
  }

  _project(x, y, z) {
    const v = this._pv || (this._pv = new THREE.Vector3());
    v.set(x, y, z).project(this.world.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return null;
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  _updateLabels() {
    const el = this._pinEl || (this._pinEl = document.getElementById('pinLabel'));
    const tp = this._targetPoint();
    const show = tp && (this.state === 'ready') && !panelOpen() && !this.setup.putting;
    let pt = null;
    if (show) pt = this._project(tp.x, this.world.groundFn(tp.x, tp.z) + 3.2, tp.z);
    if (!pt) { el.hidden = true; } else {
      el.hidden = false;
      el.style.transform = `translate(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px) translate(-50%, -100%)`;
      const o = this.setup.origin;
      const label = `${U.dist(Math.hypot(tp.x - o.x, tp.z - o.z))} ${U.distUnit()}`;
      if (this._pinText !== label) { this._pinText = label; document.getElementById('pinDist').textContent = label; }
    }
    // other players' balls
    const tags = this.world.markers.items.map((m) => ({ ...m, pt: this.state === 'ready' || this.state === 'rest' ? this._project(m.x, m.y + 0.9, m.z) : null }));
    this.hud.setBallTags(tags);
  }

  _buildAimLine() {
    const pts = [];
    for (let i = 0; i < 40; i++) pts.push(new THREE.Vector3(0, 0.03, -2 - i * 1.4));
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.PointsMaterial({ color: new THREE.Color(1.6, 1.3, 1.0), size: 0.06, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    this.aimLine = new THREE.Points(g, m);
    this.world.scene.add(this.aimLine);
  }

  setAim(deg) {
    const q = this.setup.putting ? 4 : 2; // quarter-degree steps on the green
    this.aimDeg = Math.max(-25, Math.min(25, Math.round(deg * q) / q));
    this.world.rig.setAim(this.aimDeg);
    if (this.setup.putting && this.mode.course && this.state === 'ready') {
      this._buildPuttLine();
      clearTimeout(this._aimT);
      this._aimT = setTimeout(() => this._updateHelper(), 60);
    }
  }

  /** Dotted aim line along the green surface, just past the hole's distance. */
  _buildPuttLine() {
    const w = this.world;
    if (!this.puttLine) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
      this.puttLine = new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(1.05, 0.98, 0.86), size: 0.026, transparent: true, opacity: 0.8, depthWrite: false }));
      this.puttLine.frustumCulled = false;
      this.puttLine.renderOrder = 7;
      w.scene.add(this.puttLine);
    }
    const s = this.setup;
    if (!s.putting || !this.mode.course) { this.puttLine.visible = false; return; }
    const T = this.mode.T;
    const o = s.origin;
    const d = T.toPin(o.x, o.z) + 0.6;
    const a = ((s.heading + this.aimDeg) * Math.PI) / 180;
    const fx = Math.sin(a), fz = -Math.cos(a);
    const pos = this.puttLine.geometry.attributes.position;
    const n = pos.count;
    for (let i = 0; i < n; i++) {
      const u = 0.12 + (i / (n - 1)) * (d - 0.12);
      const x = o.x + fx * u, z = o.z + fz * u;
      pos.setXYZ(i, x, w.groundFn(x, z) + 0.012, z);
    }
    pos.needsUpdate = true;
    this.puttLine.visible = true;
  }

  // ── keep the screen on while playing (iPad / laptop on a TV) ──

  async _keepAwake() {
    try {
      if ('wakeLock' in navigator && !this._wake) {
        this._wake = await navigator.wakeLock.request('screen');
        this._wake.addEventListener('release', () => { this._wake = null; });
      }
    } catch { /* not allowed (e.g. low battery); harmless */ }
  }

  // ── input ──

  _bindInput() {
    const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT');
    window.addEventListener('keydown', (e) => {
      if (typing(e)) return;
      if (e.key === 'Escape') {
        if (closePanel()) return;
        document.getElementById('r10Popover').hidden = true;
        document.getElementById('envPopover').hidden = true;
        return;
      }
      if (this.state === 'idle') return;
      if (panelOpen()) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (!e.repeat) this._swingStart();
          break;
        case 'ArrowLeft': e.preventDefault(); this.setAim(this.aimDeg - (this.setup.putting ? 0.25 : 0.5)); break;
        case 'ArrowRight': e.preventDefault(); this.setAim(this.aimDeg + (this.setup.putting ? 0.25 : 0.5)); break;
        case 'ArrowUp': { e.preventDefault(); const i = CLUBS.indexOf(this.club); this.selectClub(CLUBS[Math.max(0, i - 1)].id); break; }
        case 'ArrowDown': { e.preventDefault(); const i = CLUBS.indexOf(this.club); this.selectClub(CLUBS[Math.min(CLUBS.length - 1, i + 1)].id); break; }
        case 'Enter':
          if (this.state === 'ready' && this.setup.putting) this.putt('auto');
          else this.skip();
          break;
        case 'Tab': e.preventDefault(); openSession(this); break;
        case 'c': case 'C': {
          const i = CAMERA_STYLES.indexOf(store.settings.camera);
          const next = CAMERA_STYLES[(i + 1) % CAMERA_STYLES.length];
          this.applySetting('camera', next);
          toast(`Camera · ${next[0].toUpperCase()}${next.slice(1)}`, { kind: 'info', ms: 1600 });
          break;
        }
        case 'm': case 'M': openModePicker(this); break;
        case 's': case 'S': if (this.mode.course) openScorecard(this); break;
        case 'p': case 'P': openPlayers(this); break;
        case 'n': case 'N': this.setTimeOfDay(this.world.env.isDay ? 'night' : 'day'); break;
        case 'h': case 'H': case '?': openHelp(this, 'pairing'); break;
        case 'r': case 'R': if (this.state === 'ready') this.setAim(0); break;
        case 'g': case 'G':
          if (this.mode.course) {
            const c = this.world.course;
            c.showGrid = c.showGrid === false;
            c.setPutting(!!this.setup.putting);
            toast(c.showGrid === false ? 'Green slope grid off' : 'Green slope grid on', { kind: 'info', ms: 1400 });
          }
          break;
        default:
          if (/^[1-7]$/.test(e.key)) this.selectClub(CLUBS[Number(e.key) - 1].id);
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === ' ') { e.preventDefault(); this._swingRelease(); }
    });
    const sb = document.getElementById('swingButton');
    sb.addEventListener('pointerdown', (e) => { e.preventDefault(); sb.setPointerCapture(e.pointerId); this._swingStart(); });
    sb.addEventListener('pointerup', () => this._swingRelease());
    sb.addEventListener('pointercancel', () => this._swingRelease());
    const on = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
    on('skipButton', () => this.skip());
    on('autoPuttButton', () => this.putt('auto'));
    on('manualButton', () => { audio.click(); openManual(this); });
    on('modeButton', () => { audio.click(); openModePicker(this); });
    on('sessionButton', () => { audio.click(); if (this.mode.course) openScorecard(this); else openSession(this); });
    on('settingsButton', () => { audio.click(); openSettings(this); });
    on('playersButton', () => { audio.click(); openPlayers(this); });
    on('helpButton', () => { audio.click(); openHelp(this, 'pairing'); });
    on('bridgeHelpButton', () => { audio.init(); openHelp(this, 'pairing'); });
    on('launchTvButton', () => { audio.init(); openHelp(this, 'tv'); });
    on('holeCard', () => this.skip());
    window.addEventListener('blur', () => { if (this.swing.holding) { this.swing.holding = false; this.hud.meter(false, 0); } });
    document.getElementById('scene').addEventListener('dblclick', () => this.skip());
    document.getElementById('scene').addEventListener('click', () => { if (this.state === 'intro') this.skip(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this.state !== 'idle') this._keepAwake(); });
  }
}
