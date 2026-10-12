// Game controller: turns launches (R10, demo swing, custom entry) into shots,
// plays them back, scores them through the active mode and drives the HUD,
// camera, audio and commentary.
import * as THREE from 'three';
import { simulateShot, samplePath, MPH } from '../core/physics.js';
import { terrain, groundHeight } from '../scene/layout.js';
import { bus } from '../core/events.js';
import { units } from '../core/units.js';
import * as U from '../core/units.js';
import { CLUBS, clubById, demoLaunch } from '../data/clubs.js';
import { store } from '../data/store.js';
import { audio } from '../audio/audio.js';
import { createModes } from './modes.js';
import { commentFor, line } from './commentary.js';
import { toast } from '../ui/dom.js';
import { openSummary, panelOpen, closePanel, openModePicker, openSession, openSettings, openManual, openHelp } from '../ui/panels.js';

const RPM = (2 * Math.PI) / 60;
const CAMERA_STYLES = ['cinematic', 'follow', 'tee'];

// Power rises to 100% in 0.95 s, then creeps into an over-swing (max 110%).
const swingPower = (t) => (t < 0.95 ? t / 0.95 : Math.min(1.1, 1 + (t - 0.95) * 0.35));

export class Game {
  constructor(world, hud, client, pairing) {
    this.world = world;
    this.hud = hud;
    this.client = client;
    this.pairing = pairing;
    this.modes = createModes(this);
    this.mode = this.modes.range;
    this.club = clubById('7I');
    this.aimDeg = 0;
    this.state = 'idle'; // idle | ready | flight | rest | summary
    this.shot = null;
    this.r10 = false;
    this.swing = { holding: false, power: 0, t: 0, lastTick: 0 };
    this.ballPos = new THREE.Vector3(0, 0.1, 0);
    this.helper = null; // {power, yards} swing needed to reach the current target
    this._buildAimLine();

    bus.on('r10:shot', (launch) => this.onR10Shot(launch));
    bus.on('r10:misread', () => toast("R10 couldn't read that one", { kind: 'warn', sub: 'Swing again' }));
    bus.on('r10:connected', () => {
      this.r10 = true;
      this.updatePrompt();
      this.sendR10Config();
      if (this.state !== 'idle') this.hud.comment(line('r10'));
    });
    bus.on('r10:disconnected', () => { this.r10 = false; this.updatePrompt(); });
    this._bindInput();
    this.applySetting('camera', store.settings.camera, false);
    units.system = store.settings.units;
  }

  // ── lifecycle ──

  start(how) {
    this.state = 'ready';
    this.world.rig.toAddress();
    this.hud.show();
    this.mode.start();
    this.refreshMode();
    this.updatePrompt();
    setTimeout(() => this.hud.comment(line(how === 'r10' ? 'r10' : 'welcome')), 900);
  }

  setMode(id) {
    if (!this.modes[id]) return;
    this.mode.stop();
    this.mode = this.modes[id];
    this.world.tracer.clearGhosts();
    this.hud.clearDots();
    if (this.state === 'flight' || this.state === 'rest') this._finishNow();
    this.mode.start();
    this.state = 'ready';
    this._toTee();
    toast(this.mode.name, { kind: 'info', sub: this.mode.blurb, ms: 3600 });
  }

  refreshMode() {
    this.hud.setMode(this.mode.status());
    const sug = this.mode.suggestedClub?.();
    if (sug) this.selectClub(sug, true);
    else this._updateHelper();
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
    if (this.mode.pin) return this.mode.pin;
    if (this.mode.target) return this.mode.target;
    return null;
  }

  /** Demo helper: swing power that sends the selected club to the target. */
  _updateHelper() {
    const tp = this._targetPoint();
    this.helper = null;
    if (tp) {
      const want = Math.hypot(tp.x, tp.z);
      const wind = this.mode.wind();
      const useTotal = this.mode.id === 'ctp';
      const reach = (p) => {
        const r = simulateShot(demoLaunch(this.club, p, 1, 0, null), { terrain: () => ({ height: 0, surface: 'fairway' }), wind });
        return useTotal ? r.total : r.carry;
      };
      if (reach(1.0) >= want * 0.97) {
        let lo = 0.15, hi = 1.0;
        for (let i = 0; i < 14; i++) {
          const mid = (lo + hi) / 2;
          if (reach(mid) < want) lo = mid; else hi = mid;
        }
        this.helper = { power: (lo + hi) / 2, yards: want };
      } else {
        this.helper = { power: null, yards: want };
      }
    }
    this.hud.setMeterTarget(this.helper?.power ?? null);
    this.updatePrompt();
  }

  updatePrompt() {
    const h = this.helper;
    const helperText = h
      ? h.power != null
        ? ` · <b>${this.club.short}</b> needs about <b>${Math.round(h.power * 100)}%</b>`
        : ` · <b>${this.club.short}</b> won't get there — club up`
      : '';
    if (this.r10) {
      this.hud.setPrompt(`<b>R10 armed</b> — take your swing${this._targetPoint() ? ` · ${U.dist(Math.hypot(this._targetPoint().x, this._targetPoint().z))} ${U.distUnit()} to the target` : ''} · <span class="prompt-key">← →</span> aim`, true);
    } else {
      this.hud.setPrompt(h
        ? `<span class="prompt-key">Space</span> hold &amp; release${helperText} · <span class="prompt-key">← →</span> aim`
        : '<span class="prompt-key">Space</span> hold, release in the green for a pure strike · <span class="prompt-key">← →</span> aim · <span class="prompt-key">1–7</span> club');
    }
  }

  /** Tell the R10 where the ball is and the conditions on the bluff. */
  sendR10Config() {
    this.client.shotConfig({
      teeRangeYards: store.settings.r10Distance / 3,
      temperatureC: 18,
      humidity: 0.65,
      altitudeM: 190,
    });
  }

  applySetting(key, value, save = true) {
    if (save) store.setSetting(key, value);
    switch (key) {
      case 'units':
        units.system = value;
        this.hud.renderClubs(this.club.id);
        this.refreshMode();
        break;
      case 'camera':
        this.world.rig.setStyle(value);
        break;
      case 'quality':
        this.world.setQuality(value);
        break;
      case 'volume':
        audio.setVolume(value);
        break;
      case 'ambience':
        audio.setAmbience(value);
        break;
      case 'ghostTracers':
        this.world.tracer.setGhostsVisible(!!value);
        break;
      case 'bridgeUrl':
        this.client.setUrl(value);
        break;
      case 'r10Distance': {
        const el = document.getElementById('r10DistVal');
        if (el) el.textContent = `${value} ft`;
        clearTimeout(this._cfgTimer);
        this._cfgTimer = setTimeout(() => this.sendR10Config(), 400);
        break;
      }
      default:
        break;
    }
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

  handleLaunch(launch, source = 'demo') {
    if (this.state === 'idle') return;
    audio.init();
    if (this.state === 'summary') {
      closePanel();
      this.state = 'ready';
    }
    if (this.state === 'flight' || this.state === 'rest') this._finishNow();
    if (this.mode.roundOver) {
      this.mode.start();
      this.hud.clearDots();
    }
    const wind = this.mode.wind();
    const result = simulateShot(launch, { terrain, wind, teeHeight: this.world.ball.mesh.position.y });
    const club = this.club;
    const outcome = this.mode.evaluate(result, launch, club) || {};
    this._globalBests(result, launch, club, outcome);

    store.addShot({
      at: Date.now(), mode: this.mode.id, club: club.id, source,
      ballSpeed: launch.ballSpeed, launchAngle: launch.launchAngle, launchDirection: launch.launchDirection,
      totalSpin: launch.totalSpin, spinAxis: launch.spinAxis, clubSpeed: launch.clubSpeed || null,
      carry: result.carry, total: result.total, offline: result.offline, apex: result.apex.y,
      descent: result.descentAngle, lost: result.lost, result: outcome.headline || '',
    });

    this.shot = { launch, result, outcome, source, club, t: 0, ev: 0, landed: false, holed: false, revealed: false };
    this.state = 'flight';
    this.aimLine.visible = false;
    const w = this.world;
    w.tracer.reset();
    w.tracer.setColor(this.mode.id === 'ctp' ? 0xffc04a : 0xff8c2a);
    const sa = (launch.spinAxis * Math.PI) / 180;
    w.ball.spinAxis.set(Math.cos(sa), -Math.sin(sa), 0).normalize();
    w.ball.spinRate = launch.totalSpin * RPM * 0.12;
    w.rig.startShot(result);
    w.characters.swing(0);

    const expected = club.ballMph * MPH;
    const smash = launch.clubSpeed ? launch.ballSpeed / launch.clubSpeed : null;
    const quality = smash ? Math.min(1, Math.max(0, (smash - (club.smash - 0.2)) / 0.2)) : Math.min(1, launch.ballSpeed / expected);
    audio.impact(club.id, launch.launchAngle < 4 ? 0.3 : quality, launch.ballSpeed);
    audio.flight(result.flightTime, launch.ballSpeed);

    this.hud.hideCard();
    this.hud.comment(null);
    this.hud.setSkip(true);
    this.hud.meter(false, 0);
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
    if (!result.lost && club.id === 'DR') {
      const r = store.submitBest('range.longestDrive', result.total, 'max');
      if (r.isBest && !r.first) add('Longest drive', `${U.dist(result.total)} ${U.distUnit()}`);
    }
    if (!result.lost) {
      const r = store.submitBest(`range.carry.${club.id}`, result.carry, 'max', { club: club.id });
      if (r.isBest && !r.first) add(`${club.short} carry`, `${U.dist(result.carry)} ${U.distUnit()}`);
    }
    if (bests.length) outcome.isBest = true;
  }

  skip() {
    if (this.state !== 'flight' || !this.shot) return;
    this.shot.t = this.shot.result.duration;
  }

  _finishNow() {
    if (!this.shot) return;
    if (!this.shot.revealed) this._reveal();
    this.shot.outcome.advance?.();
    this.shot.outcome.advance = null;
    this.shot = null;
  }

  _onRest() {
    const s = this.shot;
    this.state = 'rest';
    const r = s.result;
    const restPos = new THREE.Vector3(r.rest.x, r.rest.y, r.rest.z);
    this.world.rig.ballAtRest(restPos);
    this.world.tracer.finish(store.settings.ghostTracers);
    this.hud.setSkip(false);
    this._reveal();
    s.restTimer = s.outcome.summary ? 2.6 : 3.4 + (this.hud.commentEl.classList.contains('show') ? 0.8 : 0);
  }

  _reveal() {
    const s = this.shot;
    if (!s || s.revealed) return;
    s.revealed = true;
    const { launch, result, outcome, club, source } = s;
    this.hud.showShot({ launch, result, club, source, outcome });
    this.hud.addDot(result);
    this.hud.setMode(this.mode.status());
    if (store.settings.commentary) {
      const c = commentFor({ result, launch, club, mode: this.mode.id, outcome });
      if (c) this.hud.comment(c);
    }
    if (outcome.bests?.length) {
      audio.personalBest();
      for (const b of outcome.bests) toast(`Personal best · ${b.label}`, { kind: 'pb', sub: b.value, ms: 4200 });
      if (!outcome.ace) this.world.effects.celebrate(result.rest.x, result.rest.y, result.rest.z);
    }
    bus.emit('shot:result', { launch, result, outcome, source });
  }

  _toTee() {
    this.world.ball.placeOnTee();
    this.hud.hideCard();
    this.world.rig.toAddress();
    this.aimLine.visible = true;
    this.hud.setSkip(false);
    this.refreshMode();
  }

  _returnToTee() {
    const s = this.shot;
    s?.outcome.advance?.();
    if (s) s.outcome.advance = null;
    this.shot = null;
    this.state = 'ready';
    this._toTee();
  }

  _showSummary(summary) {
    this.state = 'summary';
    if (summary.isBest) audio.personalBest();
    openSummary(summary, {
      onAgain: () => {
        this.shot = null;
        this.mode.start();
        this.hud.clearDots();
        this.world.tracer.clearGhosts();
        this.state = 'ready';
        this._toTee();
      },
      onRange: () => this.setMode('range'),
    });
  }

  // ── per frame ──

  update(dt) {
    const w = this.world;
    const s = this.shot;
    if (this.state === 'flight' && s) {
      const prevT = s.t;
      s.t += dt;
      const r = s.result;
      const p = samplePath(r, s.t);
      this.ballPos.set(p.x, p.y, p.z);
      w.ball.setPosition(p.x, p.y, p.z);
      if (!s.landed) w.tracer.push(p.x, p.y, p.z);
      // events
      while (s.ev < r.events.length && r.events[s.ev].t <= s.t) {
        const e = r.events[s.ev++];
        const d = Math.hypot(e.x, e.z);
        if (e.type === 'land') {
          s.landed = true;
          if (e.surface !== 'water' && e.surface !== 'oob') {
            w.effects.land(e);
            audio.land(e.surface, e.speed, d);
          }
          w.ball.spinRate *= 0.3;
        } else if (e.type === 'edge') {
          s.landed = true;
        } else if (e.type === 'bounce' && e.surface !== 'water' && e.surface !== 'oob') {
          audio.bounce(e.speed, d);
          if (e.speed > 6) w.effects.burst(e.x, e.y, e.z, { n: 8, color: 0x6f8a3a, speed: 1, up: 1, life: 0.5 });
        } else if (e.type === 'splash') {
          if (e.surface === 'water') { w.effects.splash(e.x, e.y, e.z); audio.splash(Math.max(0.2, 1 - d / 600)); }
          w.ball.setVisible(false);
          s.t = Math.max(s.t, r.duration);
        }
      }
      if (r.holedAt && !s.holed && s.t >= r.holedAt.t) {
        s.holed = true;
        w.ball.setVisible(false);
        audio.cup();
        w.effects.celebrate(r.holedAt.x, w.ball.mesh.position.y, r.holedAt.z);
        audio.personalBest();
        s.t = r.duration;
      }
      if (prevT < r.duration && s.t >= r.duration) this._onRest();
    } else if (this.state === 'rest' && s) {
      this.ballPos.copy(w.ball.mesh.position);
      s.restTimer -= dt;
      if (s.restTimer <= 0) {
        if (s.outcome.summary && !s.summaryShown) {
          s.summaryShown = true;
          this._showSummary(s.outcome.summary);
        } else if (!s.outcome.summary) {
          this._returnToTee();
        }
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

    this.aimLine.rotation.y = (-this.aimDeg * Math.PI) / 180;
    this._updatePinLabel();
    this.hud.drawMap(this.state === 'flight' ? this.ballPos : null, this.aimDeg, this.mode.id);
    return this.ballPos;
  }

  // ── demo swing ──

  _swingStart() {
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
    if (sw.power < 0.08) { this.hud.meter(false, 0); return; }
    const p = sw.power;
    // pure strike window: 84%–98%; soft swings stay clean, over-swings get loose
    let contact;
    if (p >= 0.84 && p <= 0.98) contact = 0.97 + Math.random() * 0.03;
    else if (p < 0.84) contact = 0.86 + 0.1 * (p / 0.84) + Math.random() * 0.03;
    else contact = Math.max(0.35, 0.95 - (p - 0.98) * 4.5) + Math.random() * 0.05;
    const launch = demoLaunch(this.club, p, contact, this.aimDeg);
    setTimeout(() => this.hud.meter(false, 0), 400);
    this.handleLaunch(launch, 'demo');
  }

  _updatePinLabel() {
    const el = this._pinEl || (this._pinEl = document.getElementById('pinLabel'));
    const tp = this._targetPoint();
    if (!tp || this.state !== 'ready' || panelOpen()) { el.hidden = true; return; }
    const cam = this.world.camera;
    const v = this._pinV || (this._pinV = new THREE.Vector3());
    v.set(tp.x, groundHeight(tp.x, tp.z) + 3.2, tp.z).project(cam);
    if (v.z > 1 || Math.abs(v.x) > 1.1) { el.hidden = true; return; }
    el.hidden = false;
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    const label = `${U.dist(Math.hypot(tp.x, tp.z))} ${U.distUnit()}`;
    if (this._pinText !== label) { this._pinText = label; document.getElementById('pinDist').textContent = label; }
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
    this.aimDeg = Math.max(-25, Math.min(25, Math.round(deg * 2) / 2));
    this.world.rig.setAim(this.aimDeg);
  }

  // ── input ──

  _bindInput() {
    const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    window.addEventListener('keydown', (e) => {
      if (typing(e)) return;
      if (e.key === 'Escape') {
        if (closePanel()) return;
        document.getElementById('r10Popover').hidden = true;
        return;
      }
      if (this.state === 'idle') return;
      if (panelOpen()) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (!e.repeat) this._swingStart();
          break;
        case 'ArrowLeft': e.preventDefault(); this.setAim(this.aimDeg - 0.5); break;
        case 'ArrowRight': e.preventDefault(); this.setAim(this.aimDeg + 0.5); break;
        case 'ArrowUp': { e.preventDefault(); const i = CLUBS.indexOf(this.club); this.selectClub(CLUBS[Math.max(0, i - 1)].id); break; }
        case 'ArrowDown': { e.preventDefault(); const i = CLUBS.indexOf(this.club); this.selectClub(CLUBS[Math.min(CLUBS.length - 1, i + 1)].id); break; }
        case 'Enter': this.skip(); break;
        case 'Tab': e.preventDefault(); openSession(this); break;
        case 'c': case 'C': {
          const i = CAMERA_STYLES.indexOf(store.settings.camera);
          const next = CAMERA_STYLES[(i + 1) % CAMERA_STYLES.length];
          this.applySetting('camera', next);
          toast(`Camera · ${next[0].toUpperCase()}${next.slice(1)}`, { kind: 'info', ms: 1600 });
          break;
        }
        case 'm': case 'M': openModePicker(this); break;
        case 'r': case 'R': if (this.state === 'ready') this.setAim(0); break;
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
    document.getElementById('skipButton').addEventListener('click', () => this.skip());
    document.getElementById('manualButton').addEventListener('click', () => { audio.click(); openManual(this); });
    document.getElementById('modeButton').addEventListener('click', () => { audio.click(); openModePicker(this); });
    document.getElementById('sessionButton').addEventListener('click', () => { audio.click(); openSession(this); });
    document.getElementById('settingsButton').addEventListener('click', () => { audio.click(); openSettings(this); });
    document.getElementById('bridgeHelpButton').addEventListener('click', () => { audio.init(); openHelp(this.client.url); });
    window.addEventListener('blur', () => { if (this.swing.holding) { this.swing.holding = false; this.hud.meter(false, 0); } });
    // double-click the scene to skip
    document.getElementById('scene').addEventListener('dblclick', () => this.skip());
  }
}

