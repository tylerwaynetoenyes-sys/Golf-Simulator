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
import { radio, STATIONS } from '../audio/radio.js';
import { createModes } from './modes.js';
import { CourseMode, LIES, MULLIGANS } from './courseMode.js';
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
    this._bindRadio();
    this.applySetting('camera', store.settings.camera, false);
    this.world.club.setSet(store.settings.clubSet);
    units.system = store.settings.units;
    const day = store.settings.timeOfDay === 'day';
    world.env.setTime(day ? 'day' : 'night', true);
    world.env.setWeather(store.settings.weather || 'clear', { immediate: true });
    this._syncEnvUI();
    audio.setDaytime(day);
    audio.windMph = world.env.weather.windMph;
    audio.rain = world.env.weather.rain || 0;
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

  /** Radio button and panel (js/audio/radio.js). */
  _bindRadio() {
    const pop = document.getElementById('radioPopover');
    const btn = document.getElementById('radioButton');
    if (!pop || !btn) return;
    const list = document.getElementById('radioList');
    const vol = document.getElementById('radioVolume');
    const tog = document.getElementById('radioToggle');
    const now = document.getElementById('radioNow');
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const groups = [...new Set(STATIONS.map((s) => s.group))];
    list.innerHTML = groups.map((g) => `<div class="radio-group">${esc(g)}</div>${STATIONS.filter((s) => s.group === g).map((s) => `
      <button class="radio-st" data-st="${s.id}"><span class="rs-name">${esc(s.name)}</span><span class="rs-by">${esc(s.by)}</span><span class="rs-blurb">${esc(s.blurb)}</span></button>`).join('')}`).join('');
    const render = () => {
      btn.dataset.on = String(radio.on);
      btn.dataset.state = radio.state;
      tog.setAttribute('aria-checked', String(radio.on));
      vol.value = String(radio.volume);
      list.querySelectorAll('[data-st]').forEach((b) => b.setAttribute('aria-current', String(radio.on && b.dataset.st === radio.station.id)));
      const st = esc(radio.station.name);
      if (radio.state === 'off') now.textContent = 'Off';
      else if (radio.state === 'loading') now.innerHTML = `Tuning in to <b>${st}</b>…`;
      else if (radio.state === 'error') now.innerHTML = `<b>${st}</b> is not responding. Try another station.`;
      else now.innerHTML = radio.nowPlaying ? `<b>${esc(radio.nowPlaying.artist)}</b> · ${esc(radio.nowPlaying.title)}` : `<b>${st}</b>`;
    };
    radio.onChange(render);
    render();
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.click();
      document.getElementById('r10Popover').hidden = true;
      document.getElementById('envPopover').hidden = true;
      pop.hidden = !pop.hidden;
    });
    document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== btn) pop.hidden = true; });
    tog.addEventListener('click', () => { audio.tick(); radio.toggle(); });
    vol.addEventListener('input', () => radio.setVolume(Number(vol.value)));
    list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-st]');
      if (!b) return;
      audio.tick();
      if (radio.on && radio.station.id === b.dataset.st) radio.stop(); else radio.play(b.dataset.st);
    });
    // browsers only allow sound after a gesture: pick the radio back up then
    const resume = () => { radio.resumeIfWanted(); window.removeEventListener('pointerdown', resume); window.removeEventListener('keydown', resume); };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
  }

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
    // where you're playing: the course's place on a course, the bluffs on the range
    const where = this.mode?.course && this.mode.def?.place ? this.mode.def.place.split(' · ').pop() : 'Mississippi bluffs';
    if (sub) sub.textContent = `${where} · ${day ? 'afternoon' : 'night'}`;
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

  /** Switch game. Course needs options (holes, putting rings) from its setup panel. */
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
    this._syncEnvUI();
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
    const opts = this.mode.course ? { length: this.mode.length, rings: this.mode.rings, mulligans: this.mode.mulligans, startHole: this.mode.holes[0].n } : {};
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
    this._addressClub();
    if (m.course) { w.course.setPutting(false); w.course.setRings(true, m.ringRadii); }
    this._buildPuttLine();
    w.markers.set(m.markers());
    const sug = m.suggestedClub?.();
    if (sug) this.selectClub(sug, true); else this._updateHelper();
    this.refreshMode();
    this.hud.setTurn(this._turnInfo(), this.roster.multi || m.course);
    this.hud.setLie(m.course ? this._lieChip(s) : null);
    this._scheduleLieView();
    this._buildCallouts();
    this._syncMulligan();
    this.hud.hideCard();
    this.hud.setSkip(false);
    if (this.roster.multi && prevPlayer && prevPlayer.id !== this.player.id && !immediate) {
      audio.click();
    }
  }

  /**
   * The lie magnifier: once the ball is set up and the dense rough round it
   * has grown, render the close-up once and fill the panel.
   */
  _scheduleLieView() {
    clearTimeout(this._lieTimer);
    const m = this.mode, s = this.setup;
    if (!m.course || !s || s.putting) { this.hud.showLiePanel(null); return; }
    this._lieTimer = setTimeout(() => {
      if (this.setup !== s || this.state !== 'ready') return;
      const w = this.world, T = m.T;
      const img = w.renderLieView(s.origin, s.heading + this.aimDeg);
      const toPin = Math.hypot(T.pin.x - s.origin.x, T.pin.z - s.origin.z);
      const dz = w.groundFn(T.pin.x, T.pin.z) - (s.origin.y - 0.04);
      const name = s.teed ? 'Tee' : ({ fairway: 'Fairway', rough: 'Rough', sand: 'Bunker', fringe: 'Fringe', green: 'Green', tee: 'Tee' }[s.lie] || 'Lie');
      this.hud.showLiePanel({
        image: img, name, dist: U.dist(toPin), unit: U.distUnit(), up: dz >= 0,
        elev: `${dz >= 0 ? '▲' : '▼'} ${U.isMetric() ? Math.abs(dz).toFixed(1) + ' m' : (Math.abs(dz) * 3.2808).toFixed(1) + ' ft'}`,
      });
      this.hud.setLieClub(this.club?.short || '');
    }, 1100);
  }

  /**
   * Carry callouts in the scene (after Golfzon): the front of the green, any
   * water to carry, and bunkers near the landing area, each at its spot with
   * the distance from the ball. Built once per setup; projected each frame.
   */
  _buildCallouts() {
    const host = document.getElementById('callouts');
    if (!host) return;
    host.innerHTML = '';
    this._callouts = [];
    const m = this.mode, s = this.setup;
    if (!m.course || !s || s.putting) return;
    const T = m.T, o = s.origin, w = this.world;
    const toPin = Math.hypot(T.pin.x - o.x, T.pin.z - o.z);
    const dx = (T.pin.x - o.x) / toPin, dz = (T.pin.z - o.z) / toPin;
    const rx = -dz, rz = dx;
    const list = [];
    const at = (d, lat = 0) => ({ x: o.x + dx * d + rx * lat, z: o.z + dz * d + rz * lat });
    const gc = Math.hypot(T.green.x - o.x, T.green.z - o.z);
    if (gc - T.greenR > 25) list.push({ d: gc - T.greenR, label: 'Green edge', p: at(gc - T.greenR) });
    for (const p of T.ponds) {
      if (p.island) continue;
      const vx = p.x - o.x, vz = p.z - o.z;
      const along = vx * dx + vz * dz, lat = vx * rx + vz * rz;
      const r = Math.max(p.rx || 0, p.rz || 0, p.poly ? p.poly.R : 0);
      if (along - r < 15 || along - r > toPin + 10 || Math.abs(lat) > r + 25) continue;
      list.push({ d: along + r * 0.8, label: 'Water carry', p: at(along + r * 0.8, lat * 0.5) });
    }
    // the sea or a river across the line (Pebble's 8th, the Seine in Paris)
    if (T.seaLevel != null) {
      let first = null, last = null;
      for (let d = 15; d < toPin - 5; d += 4) {
        const q = at(d);
        if (T.meshHeight(q.x, q.z) < T.seaLevel) { if (first == null) first = d; last = d; }
      }
      if (last != null && last - first > 8) list.push({ d: last + 2, label: 'Water carry', p: at(last + 2) });
    }
    if (T.ponds.some((p) => p.island)) list.push({ d: gc - T.greenR, label: 'Island green', p: at(gc - T.greenR) });
    for (const b of T.bunkers) {
      const vx = b.x - o.x, vz = b.z - o.z;
      const along = vx * dx + vz * dz, lat = vx * rx + vz * rz;
      if (along < 60 || along > toPin - T.greenR - 15 || Math.abs(lat) > 35) continue;
      const r = Math.max(b.rx || 0, b.rz || 0);
      list.push({ d: along + r, label: 'Bunker carry', p: at(along + r, lat) });
    }
    list.sort((a, b) => a.d - b.d);
    // keep it readable: the green, and at most two hazards, a fair way apart
    const keep = [];
    for (const c of list) if (!keep.some((k) => Math.abs(k.d - c.d) < 18) && (c.label !== 'Bunker carry' || keep.filter((k) => k.label === 'Bunker carry').length < 1)) keep.push(c);
    for (const c of keep.slice(0, 3)) {
      const el = document.createElement('div');
      el.className = 'callout';
      el.innerHTML = `<span class="co-dot"></span><span class="co-line"></span><span class="co-text">${c.label}<b>${U.dist(c.d)}${U.isMetric() ? ' m' : ''}</b></span>`;
      host.appendChild(el);
      this._callouts.push({ el, x: c.p.x, z: c.p.z, y: w.groundFn(c.p.x, c.p.z) + 0.3 });
    }
  }

  /** The lie chip for the turn banner. */
  _lieChip(s) {
    if (!s || s.teed) return null;
    const e = LIES[s.lieDetail];
    if (e) return { kind: s.lieDetail === 'first' ? 'first' : s.lie, label: e.label, note: e.note };
    if (s.lie === 'fairway') return { kind: 'fairway', label: 'Fairway', note: '' };
    if (s.lie === 'fringe') return { kind: 'fairway', label: 'Fringe', note: '' };
    if (s.lie === 'green') return { kind: 'fairway', label: 'Green', note: '' };
    return null;
  }

  /** Who could take a mulligan right now (the player of the last shot). */
  _mulliganPlayer() {
    const m = this.mode;
    if (!m.course || !m.canMulligan) return null;
    if (this.state === 'rest' && this.shot && !this.shot.tapping) return m.canMulligan(this.shot.player.id) ? this.shot.player : null;
    if (this.state === 'ready' && this.player) return m.canMulligan(this.player.id) ? this.player : null;
    return null;
  }

  _syncMulligan() {
    const p = this._mulliganPlayer();
    this.hud.setMulligan(p ? { left: this.mode.mulligansLeft(p.id) } : null);
  }

  /** Replay the last shot from where it was played, no penalty. */
  mulligan() {
    const p = this._mulliganPlayer();
    if (!p) return;
    audio.click();
    this.hud.hideDecision();
    if (!this.mode.takeMulligan(p.id)) return;
    this.shot = null;
    this.world.tracer.reset();
    this.world.effects.clear?.();
    this.state = 'ready';
    this._prepareTurn(true);
    const left = this.mode.mulligansLeft(p.id);
    toast('Mulligan', { kind: 'info', sub: `${this.roster.multi ? `${p.name} · ` : ''}replay from the same spot, no penalty${left === Infinity ? '' : ` · ${left} left`}`, ms: 2600 });
  }

  _turnInfo() {
    const p = this.player;
    const s = this.setup;
    const team = this.roster.teamOf(p);
    let detail = '';
    if (this.mode.course) {
      detail = s.putting ? `${U.proximity(s.toPin)} putt` : `${s.teed ? 'Tee shot · ' : ''}${U.dist(s.toPin)} ${U.distUnit()}`;
      detail += ` · stroke ${s.strokes + 1}`;
    }
    return { name: p.name, color: p.color, team: team ? `Team ${team.name}` : '', detail };
  }

  selectClub(id, quiet = false) {
    this.club = clubById(id);
    this.hud.setClub(this.club.id);
    this.hud.setLieClub(this.club.short);
    if (this.state === 'ready') this._addressClub();
    if (!quiet) audio.tick();
    this._updateHelper();
  }

  /** Stand the selected club behind the ball, square to the aim line. */
  _addressClub() {
    const s = this.setup;
    const w = this.world;
    if (!s || s.putting || !this.club || store.settings.showClub === false) { w.club.hide(); return; }
    w.club.setAddress(s.origin, s.heading + this.aimDeg, this.club.id, w.groundFn(s.origin.x, s.origin.z));
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
      // on the course, aim for the plays-like distance (uphill needs more)
      const want = this.mode.course ? Math.max(5, this.mode.playsLike(s).plays) : Math.hypot(tp.x - o.x, tp.z - o.z);
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
    audio.setRain(this.world.env.weather.rain || 0);
    toast(`${{ clear: 'Clear', cloudy: 'Cloudy', breezy: 'Light wind', windy: 'Strong wind', rain: 'Rain' }[id]}`, { kind: 'info', sub: this.world.env.weather.windMph > 0.5 ? `${Math.round(this.world.env.weather.windMph)} mph with gusts` : 'Calm', ms: 1800 });
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
      case 'clubSet':
        this.world.club.setSet(value);
        if (this.state === 'ready') this._addressClub();
        break;
      case 'showClub':
        if (value && this.state === 'ready') this._addressClub(); else if (!value) this.world.club.hide();
        break;
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
    clearTimeout(this._lieTimer);
    this.hud.showLiePanel(null);
    if (this.state === 'idle' || this.state === 'swinging') return;
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
      trees: this.mode.course ? this.world.course.treeHit : null, wet: this.world.env.wet,
    });
    // the club comes down and the ball leaves on the contact frame (the
    // demo swing is already at the top; a launch-monitor swing replays fast)
    const club = this.world.club;
    if (club.root.visible && club.phase !== 'hidden') {
      this.state = 'swinging';
      this.hud.setPrompt('');
      club.strike(() => { this.state = 'ready'; this._play(result, lie, source); }, { fromTop: source !== 'demo' });
    } else {
      this._play(result, lie, source);
    }
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

    const treeEv = result.events?.find((e) => e.type === 'tree');
    this.shot = { launch, result, outcome, source, club, player, t: 0, ev: 0, landed: false, holed: false, revealed: false, treeAt: treeEv && treeEv.t > 0.5 ? treeEv.t : null };
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
      w.ball.squash(Math.min(1, launch.ballSpeed / 75));
      w.effects.burst(o.x, o.y + 0.05, o.z, { n: 16, color: 0xfff0d0, speed: 1.4, up: 1.2, life: 0.32, gravity: 2 });
      if (this.setup.lie === 'sand') {
        // explosion: a heavy spray of sand and a lingering haze of dust
        w.effects.burst(o.x, o.y, o.z, { n: 90, color: 0xe6d6ae, speed: 3.2, up: 4.2, life: 1.3, gravity: 9 });
        w.effects.burst(o.x, o.y + 0.2, o.z, { n: 40, color: 0xd9c9a0, speed: 1.2, up: 1.4, life: 2.2, gravity: 0.6 });
        audio.sandBlast(Math.min(1, 0.5 + launch.ballSpeed / 60));
      } else if (club.id !== 'DR' || !this.setup.teed) {
        const deep = this.setup.lieDetail === 'deep';
        w.effects.burst(o.x, o.y, o.z, { n: deep ? 44 : 22, color: 0x58702c, speed: deep ? 2.4 : 1.8, up: deep ? 3.2 : 2.6, life: 0.9 });
      }
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
    this.hud.setMulligan(null);
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
    s.restTimer = r.holed && (!s.tapping || s.ring) ? 3.0 : o.summary ? 2.6 : o.holeComplete ? 2.2 : r.putt ? 1.5 : 3.2 + (this.hud.commentEl.classList.contains('show') ? 0.8 : 0);
    // finished inside a putting ring: roll it in
    if (o.finish && !s.tapped) s.tapDelay = 0.9;
    // in the water: the player chooses drop, re-hit or mulligan
    if (o.waterChoice && !s.tapping) { s.awaitDecision = true; s.decisionDelay = 1.1; }
    this._syncMulligan();
  }

  /** Water hazard: drop (default, already placed), re-hit, or mulligan. */
  _waterDecision(s) {
    const m = this.mode;
    const p = s.player;
    const left = m.mulligansLeft(p.id);
    const done = () => { this.hud.hideDecision(); s.awaitDecision = false; s.restTimer = 0.35; };
    const opts = [
      { key: 'D', label: 'Drop', sub: 'Near where it crossed into the hazard · +1 stroke', primary: true, fn: () => { audio.click(); done(); } },
      { key: 'B', label: 'Re-hit', sub: 'From where you just played · +1 stroke', fn: () => { audio.click(); m.rehitFromPrevious(p.id); done(); } },
    ];
    if (m.canMulligan(p.id)) {
      opts.push({ key: 'U', label: 'Mulligan', sub: `Replay the shot, no penalty · ${left === Infinity ? 'unlimited' : `${left} left`}`, fn: () => this.mulligan() });
    } else {
      opts.push({ key: '–', label: 'Mulligan', sub: MULLIGANS[m.mulligans]?.per ? 'None left this round' : 'Mulligans are off for this round', fn: () => audio.error() });
    }
    this._decision = opts;
    this.hud.showDecision({ kicker: 'Penalty area', title: 'In the water', sub: `${this.roster.multi ? `${p.name} · ` : ''}Choose how to continue.`, options: opts });
  }

  /**
   * The green finish: the ball settled inside a ring, so the putts are
   * already counted. Roll it into the cup on a real line (slope included)
   * with the cup camera, then the hole-out moment.
   */
  _tapIn(s) {
    const m = this.mode;
    if (!m.course || !m.T) return;
    const T = m.T;
    const b = s.result.rest;
    const d = T.toPin(b.x, b.z);
    const base = (Math.atan2(T.pin.x - b.x, -(T.pin.z - b.z)) * 180) / Math.PI;
    const terrain = (x, z) => { const t = T.terrain(x, z); return t.surface === 'green' ? t : { height: t.height, surface: 'fringe' }; };
    let res = null;
    for (const sf of [1.1, 1.16, 1.04, 1.24, 1.32]) {
      for (let k = 0; k <= 40 && !res; k++) {
        const aim = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.45;
        const r = simulatePutt({ x: b.x, y: b.y, z: b.z }, base + aim, puttSpeedFor(d) * sf + 0.12, terrain, T.pin);
        if (r.holed) res = r;
      }
      if (res) break;
    }
    if (!res) { this.world.ball.setVisible(false); audio.cupBottom(1); this._holeOutMoment(s); return; }
    s.tapped = true;
    s.tapping = true;
    s.ring = true;
    s.result = res;
    s.t = 0;
    s.ev = 0;
    // long rolls play a little faster until the cup camera takes over
    s.rate = d > 6 ? 1.8 : d > 3 ? 1.4 : 1;
    this.state = 'flight';
    audio.putt();
    this.hud.comment(null);
    this.world.course.setRings(false);
    this.world.rig.startShot(res, { cupCam: true });
  }

  /** Ball at the bottom of the cup: banner, sparks, gallery, Piasa. */
  _holeOutMoment(s) {
    radio.duck(0.3, 4500); // let the moment (and the crowd) be heard
    bus.emit('course:holeout', { player: this.player?.id });
    const r = s.result;
    const o = s.outcome || {};
    const w = this.world;
    const cy = w.groundFn(r.holedAt?.x ?? this.mode.T?.pin.x ?? 0, r.holedAt?.z ?? this.mode.T?.pin.z ?? 0);
    const hx = r.holedAt?.x ?? this.mode.T?.pin.x, hz = r.holedAt?.z ?? this.mode.T?.pin.z;
    const d = r.putt && r.holedAt ? Math.hypot(r.holedAt.x - r.origin.x, r.holedAt.z - r.origin.z) : 0;
    const cat = o.category;
    const fin = o.finish;
    const level = o.ace ? 1 : cat === 'eagle' ? 0.95 : !fin ? 0.85 : cat === 'birdie' ? 0.7 : cat === 'par' ? (fin.putts === 1 ? 0.45 : 0.32) : 0.2;
    w.effects.holeOut(hx, cy, hz, level);
    audio.cheer(level);
    if (level >= 0.85) setTimeout(() => audio.personalBest(), 350);
    const big = level >= 0.6;
    let title = o.headline || 'In the hole';
    let kicker = fin ? `${fin.putts === 1 ? 'One' : fin.putts === 2 ? 'Two' : 'Three'}-putt` : !r.putt ? (r.holedAt?.dunk ? 'Straight in' : 'Holed out') : d > 6 ? `From ${U.proximity(d)}` : 'In the hole';
    if (o.ace) { title = 'Hole in one'; kicker = this.mode.course ? this.mode.hole.name : 'Closest to Pin'; }
    const sub = this.roster.multi || this.mode.course ? `${s.player.name}${o.sub ? ` · ${o.sub.replace(` · ${s.player.name}`, '')}` : ''}` : o.sub || '';
    this.hud.holeOut({ kicker, title, sub, big });
    this.piasa?.react(big ? 'big' : 'cheer');
  }

  _reveal() {
    const s = this.shot;
    if (!s || s.revealed) return;
    s.revealed = true;
    const { launch, result, outcome, club, source, player } = s;
    const shown = outcome.preview && !s.tapped ? { ...outcome, headline: outcome.preview.headline, sub: outcome.preview.sub } : outcome;
    if (result.putt) this.hud.showPutt({ result, outcome: shown, player, left: this.mode.T ? this.mode.T.toPin(result.rest.x, result.rest.z) : null });
    else this.hud.showShot({ launch, result, club, source, outcome: shown, player: this.roster.multi ? player : null });
    if (!result.putt) this.hud.addDot(result, player.color);
    this.refreshMode();
    if (store.settings.commentary && !(result.holed && !s.tapping) && !outcome.finish) {
      const c = commentFor({ result, launch, club, mode: this.mode.id, outcome, hole: this.mode.course ? this.mode.hole : null });
      if (c) this.hud.comment(c);
    }
    if (outcome.bests?.length) {
      audio.personalBest();
      for (const b of outcome.bests) toast(`Personal best · ${b.label}`, { kind: 'pb', sub: b.value, ms: 4200 });
      if (!outcome.ace) this.world.effects.celebrate(result.rest.x, result.rest.y, result.rest.z);
    }
    if (this.mode.course && !outcome.finish && !outcome.penalty && (outcome.lie === 'rough' || outcome.lie === 'sand')) {
      const T = this.mode.T;
      const k = outcome.lie === 'sand' ? (T.toPin(result.rest.x, result.rest.z) < 45 ? 'greensideSand' : 'fairwaySand') : T.roughDepth(result.rest.x, result.rest.z);
      const e = LIES[k];
      if (e && k !== 'first') toast(e.label, { kind: 'warn', sub: `Next shot: ${e.note.toLowerCase()}`, ms: 3200 });
    }
    this.piasa?.reactTo({ result, outcome, launch, club });
    bus.emit('shot:result', { launch, result, outcome, source });
  }

  /** After the ball settles: next player, next hole, or summary. */
  _afterShot(fast = false) {
    const s = this.shot;
    const o = s?.outcome || {};
    this.shot = null;
    this.hud.hideDecision();
    this._decision = null;
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
    const adv = o?.advance || this._pendingAdvance;
    this._pendingAdvance = null;
    this.world.tracer.clearGhosts();
    this.hud.clearDots();
    if (skipIntro || !this.mode.course) {
      this.state = 'ready';
      adv?.();
      this._prepareTurn(true);
      return;
    }
    // close the curtain over the old hole, build the new one behind it, then
    // open on the flyover
    const m = this.mode;
    const next = m.holes[m.holeIdx + 1] || m.hole;
    this.state = 'wipe';
    this.hud.holeWipe(true, { n: next.n, name: next.name, course: m.name });
    setTimeout(() => {
      this.state = 'ready';
      adv?.();
      this._introHole();
      setTimeout(() => this.hud.holeWipe(false), 450);
    }, 420);
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
    const rr = m.ringRadii;
    this.hud.showHoleCard({ n: h.n, name: h.name, par: h.par, yards: Math.round(T.length / YD), note: h.note, idx: m.holeIdx + 1, of: m.holes.length, rings: `Gold ring ${Math.round(rr.one / 0.3048)} ft = 1-putt · white ${Math.round(rr.two / 0.3048)} ft = 2-putt`, rules: `${MULLIGANS[m.mulligans]?.short || ''} · water: drop or re-hit, +1 stroke` });
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
      let scale = s.rate || 1;
      if (s.ring && r.holedAt) {
        // ring finish: brisk roll, then real time at the cup
        if (s.t > r.holedAt.t - 1.4) scale = 1;
      } else if (r.holedAt && !s.tapping) {
        const rel = s.t - r.holedAt.t;
        if (rel > -0.42 && rel < 0.45) scale = 0.34;
        else if (rel > -0.8 && rel <= -0.42) scale = 1 - 0.66 * ((rel + 0.8) / 0.38);
      } else if (s.treeAt != null) {
        // into the trees: slow through the strike so it reads
        const rel = s.t - s.treeAt;
        if (rel > -0.22 && rel < 0.55) scale = 0.35;
        else if (rel > -0.6 && rel <= -0.22) scale = 1 - 0.65 * ((rel + 0.6) / 0.38);
      }
      s.t += dt * scale;
      this.timeScale = scale;
      const p = samplePath(r, s.t);
      this.ballPos.set(p.x, p.y, p.z);
      // draw the ball on the ground as rendered (the physics surface can sit
      // a few cm off the visible mesh); in the air, never below it
      let by = p.y + BALL.radius;
      if (p.phase === 'roll') by = w.visualGround(p.x, p.z) + BALL.radius;
      else if (p.phase !== 'cup') by = Math.max(by, w.visualGround(p.x, p.z) + BALL.radius);
      w.ball.setPosition(p.x, by, p.z);
      if (!s.landed && !r.putt) w.tracer.push(p.x, p.y, p.z);
      const o = r.origin || { x: 0, z: 0 };
      const cam = w.camera.position;
      while (s.ev < r.events.length && r.events[s.ev].t <= s.t) {
        const e = r.events[s.ev++];
        // sounds are heard from the camera (the landing camera is close)
        const d = Math.hypot(e.x - cam.x, e.z - cam.z);
        if (e.type === 'land') {
          s.landed = true;
          if (e.surface !== 'water' && e.surface !== 'oob') {
            const surf = e.surface === 'cup' ? 'green' : e.surface;
            w.effects.land({ ...e, surface: surf });
            audio.land(surf, e.speed, d);
          }
          w.ball.spinRate *= 0.3;
        } else if (e.type === 'tree') {
          audio.leaves(e.speed, d);
          w.effects.burst(e.x, e.y, e.z, { n: 26, color: 0x4f7a2e, speed: 2.2, up: 0.6, life: 1.6, gravity: 1.2 });
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
          if (!s.tapping || s.ring) this._holeOutMoment(s);
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
      } else if (s.awaitDecision) {
        if (s.decisionDelay != null) {
          s.decisionDelay -= dt;
          if (s.decisionDelay <= 0) { s.decisionDelay = null; this._waterDecision(s); }
        }
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
      if (!this.setup.putting) w.club.setBackswing(sw.power);
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
    if (sw.power < 0.05) { this.hud.meter(false, 0); this.world.club.setBackswing(0); return; }
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
    // carry callouts: shown while setting up a shot
    if (this._callouts?.length) {
      const on = this.state === 'ready' && !panelOpen();
      const shown = [];
      for (const c of this._callouts) {
        const pt = on ? this._project(c.x, c.y, c.z) : null;
        if (!pt) { if (c.el.style.display !== 'none') c.el.style.display = 'none'; continue; }
        c.el.style.display = '';
        shown.push({ c, x: pt.x - 4.5, y: pt.y });
      }
      // nearer callouts sit lower on screen; stack any that would overlap
      shown.sort((a, b) => b.y - a.y);
      for (let i = 1; i < shown.length; i++) {
        const prev = shown[i - 1];
        if (prev.y - shown[i].y < 24 && Math.abs(prev.x - shown[i].x) < 240) shown[i].y = prev.y - 24;
      }
      for (const s2 of shown) s2.c.el.style.transform = `translate(${s2.x.toFixed(1)}px, ${s2.y.toFixed(1)}px) translate(0, -50%)`;
    }
    // the wind dial, turned to the view: up is a tailwind
    {
      const wv = this.world.env.wind(0, { gust: false });
      const cam = this.world.camera;
      const fwd = cam.getWorldDirection(this._fwd || (this._fwd = new THREE.Vector3()));
      const ang = Math.atan2(wv.x * -fwd.z + wv.z * fwd.x, wv.x * fwd.x + wv.z * fwd.z);
      const mph = wv.mph;
      const txt = U.isMetric() ? (mph * 0.44704).toFixed(0) : Math.round(mph).toString();
      if (this._windTxt !== txt) {
        this._windTxt = txt;
        document.getElementById('windMph').textContent = txt;
        document.getElementById('windUnit').textContent = U.isMetric() ? 'm/s' : 'mph';
      }
      const deg = Math.round((ang * 180) / Math.PI); // clockwise from straight ahead
      if (this._windDeg !== deg) { this._windDeg = deg; document.getElementById('windArrow').style.transform = `rotate(${deg}deg)`; }
    }
    const el = this._pinEl || (this._pinEl = document.getElementById('pinLabel'));
    const tp = this._targetPoint();
    const show = tp && (this.state === 'ready') && !panelOpen() && !this.setup.putting;
    let pt = null;
    if (show) pt = this._project(tp.x, this.world.groundFn(tp.x, tp.z) + 3.2, tp.z);
    if (!pt) { el.hidden = true; } else {
      el.hidden = false;
      el.style.transform = `translate(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px) translate(-50%, -100%)`;
      const o = this.setup.origin;
      // distance, and the rise or fall to it (the callout over the flag)
      const dz = this.world.groundFn(tp.x, tp.z) - (o.y - 0.04);
      const elev = U.isMetric() ? `${Math.abs(dz).toFixed(1)} m` : `${Math.round(Math.abs(dz) * 3.2808)} ft`;
      const label = `${U.dist(Math.hypot(tp.x - o.x, tp.z - o.z))}|${U.distUnit()}|${dz >= 0 ? 'up' : 'down'}|${elev}`;
      if (this._pinText !== label) {
        this._pinText = label;
        const [d, u, dir, e] = label.split('|');
        document.getElementById('pinDist').innerHTML = `<b>${d}</b><small>${u}</small><i class="${dir}">${dir === 'up' ? '▲' : '▼'} ${e}</i>`;
      }
    }
    // other players' balls
    const tags = this.world.markers.items.map((m) => ({ ...m, pt: this.state === 'ready' || this.state === 'rest' ? this._project(m.x, m.y + 0.9, m.z) : null }));
    // where this ball finished: distance left (course) or total (range)
    const s = this.shot;
    if (this.state === 'rest' && s && !s.result.lost && !s.result.holed && !s.tapping && !panelOpen()) {
      const r = s.result.rest;
      const bp = this.world.ball.mesh.position;
      let label;
      if (this.mode.course && this.mode.T) {
        const left = this.mode.T.toPin(r.x, r.z);
        label = s.outcome?.finish ? `${U.proximity(left)} · ${s.outcome.finish.putts}-putt` : `${U.dist(left)} ${U.distUnit()} to pin`;
      } else {
        label = `${U.dist(s.result.total)} ${U.distUnit()}`;
      }
      tags.push({ name: label, color: s.player.color, pt: this._project(bp.x, bp.y + 0.6, bp.z), self: true });
    }
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
    if (this.state === 'ready' && this.world.club.phase === 'address') this._addressClub();
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
        document.getElementById('radioPopover').hidden = true;
        return;
      }
      if (this.state === 'idle') return;
      if (panelOpen()) return;
      if (this.hud.decisionOpen && this._decision) {
        const o = this._decision.find((d) => d.key.toLowerCase() === e.key.toLowerCase());
        if (o) { e.preventDefault(); o.fn(); return; }
        if (e.key === 'Enter') { e.preventDefault(); this._decision[0].fn(); return; }
        if (e.key === ' ') { e.preventDefault(); return; }
      }
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
        case 'o': case 'O': radio.toggle(); break;
        case 'n': case 'N': this.setTimeOfDay(this.world.env.isDay ? 'night' : 'day'); break;
        case 'h': case 'H': case '?': openHelp(this, 'pairing'); break;
        case 'r': case 'R': if (this.state === 'ready') this.setAim(0); break;
        case 'u': case 'U': this.mulligan(); break;
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
    on('mulliganButton', () => this.mulligan());
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
