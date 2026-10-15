// In-game HUD: club rail, mode pill, shot card, commentary caption, mini map,
// demo swing meter, and the multiplayer layer (turn banner, leaderboard, hole
// card, name tags over other players' balls).
import { CLUBS } from '../data/clubs.js';
import { $, esc, countUp } from './dom.js';
import { holeCardIn, wipeIn } from './motion.js';
import * as U from '../core/units.js';
import { MPH, YD } from '../core/physics.js';
import { GREENS, CTP_GREEN, LAYOUT } from '../scene/layout.js';
import { esc as escape } from './dom.js';

const STOCK_CARRY = { DR: 255, '3W': 235, '5I': 195, '7I': 168, '9I': 145, PW: 128, SW: 95 };

function windArrow(fromDeg) {
  // arrow shows where the wind is blowing TO, from the player's view (up = down-range)
  const rot = fromDeg + 180;
  return `<svg viewBox="0 0 12 12" style="transform:rotate(${rot}deg)"><path d="M6 1.5v9M6 1.5 3 4.5M6 1.5l3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export class HUD {
  constructor({ onClub }) {
    this.onClub = onClub;
    this.rail = $('#clubRail');
    this.card = $('#shotCard');
    this.commentEl = $('#commentary');
    this.map = $('#minimap');
    this.mapCtx = this.map.getContext('2d');
    // the course map draws in CSS pixels on a 2× canvas
    this.mapDpr = 2;
    this.mapW = this.map.width / this.mapDpr;
    this.mapH = this.map.height / this.mapDpr;
    this.dots = [];
    this.live = null;
    this._commentTimer = null;
    this.renderClubs('7I');
    window.addEventListener('resize', () => this._layoutLeft());
  }

  show() { $('#hud').dataset.visible = 'true'; }

  renderClubs(activeId) {
    this.rail.innerHTML = CLUBS.map((c, i) => `
      <button class="club" data-club="${c.id}" aria-pressed="${c.id === activeId}" title="${esc(c.name)} (${i + 1})">
        <span class="c-id">${c.short}</span>
        <span class="c-dist">${U.isMetric() ? Math.round(STOCK_CARRY[c.id] * YD) : STOCK_CARRY[c.id]}${U.distUnit()}</span>
      </button>`).join('');
    for (const b of this.rail.querySelectorAll('.club')) {
      b.addEventListener('click', () => this.onClub(b.dataset.club));
    }
  }

  setClub(id) {
    for (const b of this.rail.querySelectorAll('.club')) b.setAttribute('aria-pressed', String(b.dataset.club === id));
  }

  setMode(status) {
    $('#modeTitle').textContent = status.title;
    const det = $('#modeDetail');
    det.textContent = status.detail || '';
    det.style.display = status.detail ? '' : 'none';
    $('#modeChips').innerHTML = (status.chips || []).map((c) => {
      if (c.kind === 'wind') {
        if (c.mph < 0.5) return '<span class="chip">Calm</span>';
        const v = U.isMetric() ? `${(c.mph * MPH).toFixed(1)} m/s` : `${c.mph.toFixed(0)} mph`;
        return `<span class="chip">${windArrow(c.fromDeg)}<strong>${v}</strong></span>`;
      }
      if (c.kind === 'score') return `<span class="chip score">${esc(c.label)} <strong>${c.value}</strong></span>`;
      return '';
    }).join('');
  }

  setPrompt(html, r10 = false) {
    const p = $('#prompt');
    p.innerHTML = html;
    p.classList.toggle('r10', r10);
  }

  hideCard() { this.card.dataset.visible = 'false'; }

  /** Fill and reveal the shot card. */
  showShot({ launch, result, club, source, outcome, player }) {
    this.card.classList.remove('putt');
    this.card.querySelector('.hero-item .hero-label').textContent = 'Carry';
    this.card.querySelector('.hero-item.secondary .hero-label').textContent = 'Total';
    $('#shotClub').textContent = club.name;
    this._playerChip(player);
    const src = $('#shotSource');
    src.textContent = source === 'r10' ? 'R10' : source === 'mock' ? 'R10 · sim' : source === 'manual' ? 'Custom' : 'Demo';
    src.classList.toggle('r10', source === 'r10' || source === 'mock');

    const oc = $('#shotOutcome');
    if (outcome && outcome.headline) {
      oc.hidden = false;
      oc.classList.toggle('ace', !!outcome.ace);
      $('#outcomeMain').textContent = outcome.headline;
      $('#outcomeSub').innerHTML = `${esc(outcome.sub || '')}${outcome.points != null ? ` · <span class="pts">+${outcome.points} pts</span>` : ''}`;
    } else {
      oc.hidden = true;
    }

    const lost = result.lost;
    const carry = Number(U.dist(result.carry));
    const total = Number(U.dist(result.total));
    countUp($('#carryValue'), carry, { ms: 900 });
    if (lost) $('#totalValue').textContent = '—';
    else countUp($('#totalValue'), total, { ms: 1100 });
    $('#carryUnit').textContent = U.distUnit();
    $('#totalUnit').textContent = lost ? '' : U.distUnit();

    const smash = launch.clubSpeed ? launch.ballSpeed / launch.clubSpeed : null;
    const stats = [
      ['Ball speed', U.speed(launch.ballSpeed), U.speedUnit()],
      ['Club speed', launch.clubSpeed ? U.speed(launch.clubSpeed) : '—', launch.clubSpeed ? U.speedUnit() : ''],
      ['Smash', smash ? smash.toFixed(2) : '—', ''],
      ['Launch', launch.launchAngle.toFixed(1), '°'],
      ['Direction', U.signedDeg(launch.launchDirection), ''],
      ['Spin', Math.round(launch.totalSpin).toLocaleString(), 'rpm'],
      ['Spin axis', U.signedDeg(launch.spinAxis), ''],
      ['Apex', U.height(result.apex.y), U.distUnit() === 'yd' ? 'yd' : 'm'],
      ['Offline', lost ? '—' : U.signedDir(result.offline), ''],
      ['Descent', result.descentAngle.toFixed(0), '°'],
      ['Hang time', result.flightTime.toFixed(1), 's'],
      ['Face / path', launch.faceAngle != null && launch.clubPath != null ? `${launch.faceAngle.toFixed(1)} / ${launch.clubPath.toFixed(1)}` : '—', launch.faceAngle != null ? '°' : ''],
    ];
    $('#shotGrid').innerHTML = stats.map(([l, v, u], i) =>
      `<div class="stat" style="animation-delay:${120 + i * 35}ms"><div class="stat-v">${esc(v)}${u ? `<small>${esc(u)}</small>` : ''}</div><div class="stat-l">${l}</div></div>`).join('');

    this.card.dataset.visible = 'false';
    void this.card.offsetWidth;
    this.card.dataset.visible = 'true';
  }

  _playerChip(player) {
    const pc = $('#shotPlayer');
    if (!pc) return;
    pc.hidden = !player;
    if (player) { pc.textContent = player.name; pc.style.setProperty('--pc', player.color); }
  }

  /** Compact result card for a putt. */
  showPutt({ result, outcome, player, left }) {
    this.card.classList.add('putt');
    $('#shotClub').textContent = 'Putter';
    this._playerChip(player);
    const src = $('#shotSource');
    src.textContent = 'Putt';
    src.classList.remove('r10');
    const oc = $('#shotOutcome');
    oc.hidden = !outcome?.headline;
    oc.classList.toggle('ace', !!outcome?.holed);
    $('#outcomeMain').textContent = outcome?.headline || '';
    $('#outcomeSub').textContent = outcome?.sub || '';
    const ft = (m) => (U.isMetric() ? m.toFixed(1) : (m / 0.3048).toFixed(0));
    const fu = U.isMetric() ? 'm' : 'ft';
    $('#carryValue').textContent = ft(result.total);
    $('#carryUnit').textContent = fu;
    $('#totalValue').textContent = left == null || result.holed ? '—' : ft(left);
    $('#totalUnit').textContent = left == null || result.holed ? '' : fu;
    this.card.querySelector('.hero-item .hero-label').textContent = 'Rolled';
    this.card.querySelector('.hero-item.secondary .hero-label').textContent = result.holed ? 'In the cup' : 'Left';
    $('#shotGrid').innerHTML = '';
    this.card.dataset.visible = 'false';
    void this.card.offsetWidth;
    this.card.dataset.visible = 'true';
  }

  /** Big centre-screen moment when the ball drops. */
  holeOut({ kicker = '', title, sub = '', big = false }) {
    const el = $('#holeOut');
    if (!el) return;
    $('#hoKicker').textContent = kicker;
    $('#hoTitle').textContent = title;
    $('#hoSub').textContent = sub;
    el.classList.remove('show');
    el.classList.toggle('big', big);
    void el.offsetWidth;
    el.classList.add('show');
  }

  /** Lie chip in the turn banner: {kind, label, note} or null. */
  setLie(lie) {
    const el = $('#tbLie');
    if (!el) return;
    if (!lie) { el.hidden = true; return; }
    el.hidden = false;
    el.dataset.lie = lie.kind;
    el.innerHTML = `<b>${escape(lie.label)}</b>${lie.note ? `<span>${escape(lie.note)}</span>` : ''}`;
  }

  /** Mulligan button: null hides it, otherwise {left} (Infinity = unlimited). */
  setMulligan(state) {
    const b = $('#mulliganButton');
    if (!b) return;
    b.hidden = !state;
    if (state) $('#mullLeft').textContent = state.left === Infinity ? '' : `${state.left} left`;
  }

  /**
   * Choice sheet (penalty decisions). options: [{key, label, sub, primary, fn}].
   * Returns a close function.
   */
  showDecision({ kicker, title, sub, options }) {
    const el = $('#decision');
    if (!el) return () => {};
    $('#decKicker').textContent = kicker || '';
    $('#decTitle').textContent = title;
    $('#decSub').textContent = sub || '';
    const box = $('#decOptions');
    box.innerHTML = options.map((o, i) => `<button class="dec-opt ${o.primary ? 'primary' : ''}" data-i="${i}">
      <span class="dec-key">${escape(o.key)}</span><span class="dec-text"><b>${escape(o.label)}</b><small>${escape(o.sub || '')}</small></span></button>`).join('');
    box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => options[Number(b.dataset.i)].fn()));
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    box.querySelector('.primary')?.focus({ preventScroll: true });
    return () => this.hideDecision();
  }

  hideDecision() {
    const el = $('#decision');
    if (el) { el.hidden = true; el.classList.remove('show'); }
  }

  get decisionOpen() { const el = $('#decision'); return !!el && !el.hidden; }

  // ── multiplayer layer ──

  /** Whose turn it is. info = {name, color, team, detail} */
  setTurn(info, show) {
    const el = $('#turnBanner');
    if (!el) return;
    if (!show || !info) { el.dataset.visible = 'false'; return; }
    const changed = this._turnName !== info.name;
    this._turnName = info.name;
    el.style.setProperty('--pc', info.color);
    $('#tbName').textContent = info.name;
    $('#tbTeam').textContent = info.team || '';
    $('#tbTeam').hidden = !info.team;
    $('#tbDetail').textContent = info.detail || '';
    $('#tbDetail').hidden = !info.detail;
    el.dataset.visible = 'true';
    if (changed) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  }

  /** Leaderboard panel (multiplayer or course). lb = {title, rows[], teams[]} */
  setLeaderboard(lb, currentId, force = false) {
    const el = $('#leaderboard');
    if (!el) return;
    const show = !!lb && (lb.rows.length > 1 || force);
    el.dataset.visible = String(show);
    document.body.classList.toggle('has-lb', show);
    if (!show) return;
    const teams = lb.teams || [];
    const row = (r, i, cls = '') => `<li class="lb-row ${cls} ${r.id && r.id === currentId ? 'current' : ''}" style="--pc:${r.color}">
      <span class="lb-pos">${i + 1}</span><span class="lb-dot"></span>
      <span class="lb-name">${escape(r.name)}${r.sub ? `<small>${escape(r.sub)}</small>` : ''}</span>
      <span class="lb-val">${escape(r.display)}</span></li>`;
    el.classList.toggle('compact', lb.rows.length + (teams.length > 1 ? teams.length : 0) > 6 || window.innerHeight < 760);
    el.innerHTML = `<div class="lb-head"><span class="lb-mascot" id="lbMascot"></span><span>${escape(lb.title || 'Leaderboard')}</span></div>
      ${teams.length > 1 ? `<ol class="lb-list teams">${teams.map((t, i) => row({ ...t, sub: t.members?.join(' · ') || t.sub }, i, 'team')).join('')}</ol>` : ''}
      <ol class="lb-list">${lb.rows.map((r, i) => row(r, i)).join('')}</ol>`;
    this.onLeaderboard?.(el);
    this._layoutLeft();
  }

  /** Keep the left column (leaderboard, club rail, Piasa) from overlapping. */
  _layoutLeft() {
    const lb = $('#leaderboard');
    const rail = this.rail;
    const pz = $('#piasaMascot');
    if (!lb || window.innerWidth <= 760) { rail.style.top = ''; rail.style.transform = ''; if (pz) pz.style.visibility = ''; return; }
    const show = lb.dataset.visible === 'true';
    const z = parseFloat(getComputedStyle(rail).zoom) || 1;
    if (!show) { rail.style.top = ''; rail.style.transform = ''; } else {
      const lbBottom = lb.getBoundingClientRect().bottom;
      const railH = rail.getBoundingClientRect().height;
      const centred = (window.innerHeight - railH) / 2;
      const top = Math.max(centred, lbBottom + 12);
      rail.style.top = `${top / z}px`;
      rail.style.transform = 'none';
    }
    if (pz) {
      const rb = rail.getBoundingClientRect().bottom;
      pz.style.visibility = rb > pz.getBoundingClientRect().top - 6 ? 'hidden' : '';
    }
  }

  /** Big hole intro card shown during the flyover. */
  showHoleCard(h) {
    const el = $('#holeCard');
    if (!el) return;
    el.innerHTML = `
      <div class="hc-top"><span class="hc-num">${h.n}</span><div><div class="hc-kicker">Hole ${h.idx} of ${h.of}</div><div class="hc-name">${escape(h.name)}</div></div></div>
      <span class="rule"></span>
      <div class="hc-stats"><div><b>Par ${h.par}</b></div><div><b>${U.isMetric() ? Math.round(h.yards * YD) : h.yards}</b> ${U.distUnit()}</div>${h.wind ? `<div>${h.wind}</div>` : ''}</div>
      ${h.note ? `<p class="hc-note">${escape(h.note)}</p>` : ''}
      ${h.rings ? `<div class="hc-rings"><span class="ring-gold"></span><span class="ring-white"></span>${escape(h.rings)}</div>` : ''}
      ${h.rules ? `<div class="hc-rules">${escape(h.rules)}</div>` : ''}
      <div class="hc-skip">Tap or press Enter to skip</div>`;
    el.dataset.visible = 'true';
    holeCardIn(el);
  }

  hideHoleCard() { const el = $('#holeCard'); if (el) el.dataset.visible = 'false'; }

  /** Hole-to-hole curtain: on with the next hole's number and name, then off. */
  holeWipe(on, h = null) {
    const el = $('#holeWipe');
    if (!el) return;
    if (on && h) {
      $('#hwCourse').textContent = h.course || '';
      $('#hwNum').textContent = String(h.n);
      $('#hwName').textContent = h.name || '';
    }
    el.dataset.visible = on ? 'true' : 'false';
    if (on && h) wipeIn(el);
  }

  /** Putting UI: hide clubs, offer auto putt, relabel the swing button. */
  setPuttMode(on) {
    if (this._putt === on) return;
    this._putt = on;
    document.body.classList.toggle('putting', on);
    const ap = $('#autoPuttButton');
    if (ap) ap.hidden = !on;
    $('#swingButton').textContent = on ? 'Hold to putt' : 'Hold to swing';
    const lbl = $('#swingMeter .meter-labels');
    if (lbl) lbl.innerHTML = on ? '<span>Short</span><span>Hole pace</span><span>Firm</span>' : '<span>Soft</span><span>Full</span><span>Over</span>';
  }

  /** Name tags over the other players' balls. tags = [{name, color, pt:{x,y}|null}] */
  setBallTags(tags) {
    const host = $('#ballTags');
    if (!host) return;
    while (host.children.length < tags.length) {
      const d = document.createElement('div');
      d.className = 'ball-tag';
      host.appendChild(d);
    }
    [...host.children].forEach((el, i) => {
      const t = tags[i];
      if (!t || !t.pt) { el.hidden = true; return; }
      el.hidden = false;
      if (el.dataset.name !== t.name) { el.dataset.name = t.name; el.textContent = t.name; el.style.setProperty('--pc', t.color); }
      el.classList.toggle('self', !!t.self);
      el.style.transform = `translate(${t.pt.x.toFixed(1)}px, ${t.pt.y.toFixed(1)}px) translate(-50%, -100%)`;
    });
  }

  comment(text, ms = 4200) {
    clearTimeout(this._commentTimer);
    const el = this.commentEl;
    el.classList.remove('show');
    if (!text) return;
    setTimeout(() => {
      el.textContent = text;
      el.classList.add('show');
      this._commentTimer = setTimeout(() => el.classList.remove('show'), ms);
    }, 180);
  }

  // ── swing meter ──
  meter(active, power = 0) {
    $('#swingMeter').classList.toggle('active', active);
    $('#meterFill').style.width = `${(Math.min(1.1, power) / 1.1) * 100}%`;
  }

  setMeterTarget(power) {
    const m = $('#meterTarget');
    if (power == null) { m.hidden = true; return; }
    m.hidden = false;
    m.style.left = `${(power / 1.1) * 100}%`;
  }

  setSkip(visible) { $('#skipButton').hidden = !visible; }

  // ── mini map ──
  addDot(result, color) {
    const o = result.origin || { x: 0, z: 0 };
    this.dots.push({ x: result.rest.x, z: result.rest.z, cx: result.carryPoint?.x, cz: result.carryPoint?.z, ox: o.x, oz: o.z, lost: result.lost, color });
    if (this.dots.length > 24) this.dots.shift();
  }

  clearDots() { this.dots = []; }

  drawMap(ball, aimDeg, mode, course = null, setup = null) {
    if (course && course.T) { this._drawCourseMap(ball, aimDeg, course, setup); return; }
    this._courseKey = null;
    const c = this.mapCtx, W = this.mapW, H = this.mapH;
    c.setTransform(this.mapDpr, 0, 0, this.mapDpr, 0, 0);
    const zMax = 360 * YD;
    const xr = 75;
    const px = (x) => W / 2 + (x / xr) * (W / 2 - 8);
    const py = (z) => H - 16 - (-z / zMax) * (H - 30);
    c.clearRect(0, 0, W, H);
    // rough + fairway
    c.fillStyle = 'rgba(70,100,50,0.18)';
    c.fillRect(0, py(LAYOUT.plateauEnd), W, H);
    c.fillStyle = 'rgba(120,170,90,0.22)';
    c.fillRect(px(-LAYOUT.fairwayHalfWidth), py(LAYOUT.plateauEnd), px(LAYOUT.fairwayHalfWidth) - px(-LAYOUT.fairwayHalfWidth), H);
    // river
    c.fillStyle = 'rgba(90,130,200,0.18)';
    c.fillRect(0, 0, W, py(LAYOUT.plateauEnd));
    // yardage lines
    c.strokeStyle = 'rgba(255,255,255,0.07)';
    c.fillStyle = 'rgba(255,255,255,0.32)';
    c.font = '600 10px Jost, -apple-system, system-ui, sans-serif';
    for (const yd of [100, 200, 300]) {
      const y = py(-yd * YD);
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
      c.fillText(String(yd), 4, y - 3);
    }
    // long drive grid
    if (mode === 'ld') {
      c.strokeStyle = 'rgba(255,210,154,0.35)';
      c.setLineDash([4, 4]);
      c.strokeRect(px(-25 * YD), py(LAYOUT.plateauEnd), px(25 * YD) - px(-25 * YD), py(-150 * YD) - py(LAYOUT.plateauEnd));
      c.setLineDash([]);
    }
    // greens
    const sx = (W / 2 - 8) / xr, sz = (H - 30) / zMax;
    for (const g of GREENS) {
      c.fillStyle = `#${g.color.toString(16).padStart(6, '0')}55`;
      c.beginPath(); c.ellipse(px(g.x), py(g.z), Math.max(2.5, g.r * sx), Math.max(2.5, g.r * sz), 0, 0, Math.PI * 2); c.fill();
    }
    if (CTP_GREEN.active) {
      c.fillStyle = 'rgba(255,213,74,0.35)';
      c.beginPath(); c.ellipse(px(CTP_GREEN.x), py(CTP_GREEN.z), CTP_GREEN.r * sx, CTP_GREEN.r * sz, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffd54a';
      c.beginPath(); c.arc(px(CTP_GREEN.x), py(CTP_GREEN.z), 3.5, 0, Math.PI * 2); c.fill();
    }
    // aim line
    const a = (aimDeg * Math.PI) / 180;
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    c.setLineDash([3, 5]);
    c.beginPath(); c.moveTo(px(0), py(0)); c.lineTo(px(Math.sin(a) * 300), py(-Math.cos(a) * 300)); c.stroke();
    c.setLineDash([]);
    // shots
    this.dots.forEach((d, i) => {
      const alpha = 0.3 + 0.7 * ((i + 1) / this.dots.length);
      if (d.cx != null) {
        c.strokeStyle = `rgba(255,190,120,${alpha * 0.35})`;
        c.beginPath(); c.moveTo(px(0), py(0)); c.lineTo(px(d.cx), py(d.cz)); c.lineTo(px(d.x), py(d.z)); c.stroke();
      }
      c.globalAlpha = alpha;
      c.fillStyle = d.lost ? '#ff6f61' : d.color && this.dotsColored ? d.color : '#ffecd2';
      c.beginPath(); c.arc(px(d.x), py(Math.max(d.z, -zMax)), i === this.dots.length - 1 ? 4.5 : 3, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
    });
    // live ball
    if (ball) {
      c.fillStyle = '#fff';
      c.shadowColor = '#ffb46b'; c.shadowBlur = 10;
      c.beginPath(); c.arc(px(ball.x), py(Math.max(ball.z, -zMax)), 4, 0, Math.PI * 2); c.fill();
      c.shadowBlur = 0;
    }
    // tee
    c.fillStyle = '#ffb46b';
    c.beginPath(); c.arc(px(0), py(0), 3, 0, Math.PI * 2); c.fill();
  }

  // ── course map, after Trackman's hole view: the hole rotated so the tee
  // is at the bottom; distance arcs from the ball, the club's carry and
  // landing area on the aim line, the pin distance, trees, OOB and wind ──

  _courseFrame(T) {
    const W = this.mapW, H = this.mapH;
    const gx = T.pin.x - T.tee.x, gz = T.pin.z - T.tee.z;
    const L = Math.hypot(gx, gz) || 1;
    const fx = gx / L, fz = gz / L; // forward
    const rx = -fz, rz = fx; // right
    // extent of the hole in this frame
    let minF = 0, maxF = L, minR = -20, maxR = 20;
    for (let s = 0; s <= T.length; s += 8) {
      const p = T.pointAt(s);
      const f = (p.x - T.tee.x) * fx + (p.z - T.tee.z) * fz;
      const r = (p.x - T.tee.x) * rx + (p.z - T.tee.z) * rz;
      const hw = T.fairwayHalf(s) + 22;
      minF = Math.min(minF, f); maxF = Math.max(maxF, f);
      minR = Math.min(minR, r - hw); maxR = Math.max(maxR, r + hw);
    }
    maxF += T.greenR + 16; minF -= 10;
    const top = 26, bottom = 10;
    const scale = Math.min((H - top - bottom) / (maxF - minF), (W - 14) / (maxR - minR));
    const cR = (minR + maxR) / 2;
    const toMap = (x, z) => {
      const f = (x - T.tee.x) * fx + (z - T.tee.z) * fz;
      const r = (x - T.tee.x) * rx + (z - T.tee.z) * rz;
      return [W / 2 + (r - cR) * scale, H - bottom - (f - minF) * scale];
    };
    const fromMap = (mx, my) => {
      const r = (mx - W / 2) / scale + cR, f = (H - bottom - my) / scale + minF;
      return [T.tee.x + f * fx + r * rx, T.tee.z + f * fz + r * rz];
    };
    return { toMap, fromMap, scale, fx, fz, rx, rz };
  }

  _renderHoleBase(T, frame, trees) {
    const W = this.mapW, H = this.mapH, k = this.mapDpr;
    const cv = this._holeCanvas || (this._holeCanvas = document.createElement('canvas'));
    cv.width = W * k; cv.height = H * k;
    const c = cv.getContext('2d');
    c.setTransform(k, 0, 0, k, 0, 0);
    const { toMap, fromMap, scale } = frame;
    // the land, and the sea or lake beyond it, from the terrain itself
    const cell = 3;
    for (let y = 0; y < H; y += cell) {
      for (let x = 0; x < W; x += cell) {
        const [wx, wz] = fromMap(x + cell / 2, y + cell / 2);
        const sea = T.seaLevel != null && T.meshHeight(wx, wz) < T.seaLevel;
        c.fillStyle = sea ? 'rgba(38,92,150,0.9)' : 'rgba(34,52,32,0.55)';
        c.fillRect(x, y, cell, cell);
      }
    }
    const ribbon = (half, style, from = T.fwStart) => {
      const L = [], R = [];
      for (let s = from; s <= T.length + 0.1; s += 5) {
        const p = T.pointAt(Math.min(s, T.length));
        const h = half(s);
        L.push(toMap(p.x - p.rx * h, p.z - p.rz * h));
        R.push(toMap(p.x + p.rx * h, p.z + p.rz * h));
      }
      c.fillStyle = style;
      c.beginPath();
      L.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      R.reverse().forEach(([x, y]) => c.lineTo(x, y));
      c.closePath(); c.fill();
    };
    // rough corridor, then the fairway: mown stripes like the course
    ribbon((s) => T.fairwayHalf(s) + 30, 'rgba(62,92,46,0.42)', -10);
    ribbon((s) => T.fairwayHalf(s), 'rgba(118,176,86,0.62)');
    // out of bounds: white dashes where the stakes are
    c.strokeStyle = 'rgba(255,255,255,0.32)'; c.setLineDash([2, 3]); c.lineWidth = 1;
    for (const side of [-1, 1]) {
      c.beginPath();
      for (let s = -10, i = 0; s <= T.length + 30; s += 8, i++) {
        const p = T.pointAt(Math.max(0, Math.min(s, T.length)));
        const [x, y] = toMap(p.x + p.rx * T.oobLateral * side, p.z + p.rz * T.oobLateral * side);
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    }
    c.setLineDash([]);
    // creeks
    c.strokeStyle = 'rgba(80,150,230,0.75)';
    for (const kk of T.creeks) {
      const p = T.pointAt(kk.s);
      const w = T.fairwayHalf(kk.s) + 40;
      const [x0, y0] = toMap(p.x - p.rx * w, p.z - p.rz * w);
      const [x1, y1] = toMap(p.x + p.rx * w, p.z + p.rz * w);
      c.lineWidth = Math.max(2, kk.half * 2 * scale);
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
    c.lineWidth = 1;
    const blob = (o, rx, rz, style) => { const [x, y] = toMap(o.x, o.z); c.fillStyle = style; c.beginPath(); c.ellipse(x, y, Math.max(1.6, rx * scale), Math.max(1.6, rz * scale), 0, 0, Math.PI * 2); c.fill(); };
    const shape = (pts, style) => { c.fillStyle = style; c.beginPath(); pts.forEach(([x, z], i) => { const [mx, my] = toMap(x, z); i ? c.lineTo(mx, my) : c.moveTo(mx, my); }); c.closePath(); c.fill(); };
    const WATER = 'rgba(70,140,225,0.85)', SAND = 'rgba(236,222,184,0.9)';
    for (const w of T.ponds) w.poly ? shape(w.poly.pts, WATER) : blob(w, w.rx, w.rz, WATER);
    if (T.ponds.some((w) => w.island)) blob(T.green, T.greenR + 3, T.greenR + 3, 'rgba(62,92,46,1)');
    // trees: a dot per canopy, so the map shows what blocks a line
    c.fillStyle = 'rgba(28,52,30,0.85)';
    for (const t of trees || []) {
      const [x, y] = toMap(t.x, t.z);
      if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
      c.beginPath(); c.arc(x, y, Math.max(1.3, (t.r || 3) * scale * 0.8), 0, Math.PI * 2); c.fill();
    }
    for (const b of T.bunkers) b.poly ? shape(b.poly.pts, SAND) : blob(b, b.rx, b.rz, SAND);
    // green, fringe ring
    if (T.greenPoly) shape(T.greenPoly.pts, 'rgba(150,222,120,0.95)');
    else { blob(T.green, T.greenR + 1.8, T.greenR + 1.8, 'rgba(120,190,95,0.9)'); blob(T.green, T.greenR, T.greenR, 'rgba(160,228,128,0.95)'); }
    // tee box
    const [tx, ty] = toMap(T.tee.x, T.tee.z);
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fillRect(tx - 3.5, ty - 2.5, 7, 5);
  }

  _drawCourseMap(ball, aimDeg, course, setup) {
    const T = course.T;
    const c = this.mapCtx, W = this.mapW, H = this.mapH, k = this.mapDpr;
    const world = course.game.world;
    const key = `${course.hole.n}:${T.length.toFixed(1)}`;
    if (this._courseKey !== key) {
      this._courseKey = key;
      this._frame = this._courseFrame(T);
      this._renderHoleBase(T, this._frame, world.course?.treeList);
    }
    const { toMap, scale, fx, fz, rx, rz } = this._frame;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W * k, H * k);
    c.drawImage(this._holeCanvas, 0, 0);
    c.setTransform(k, 0, 0, k, 0, 0);
    const font = (w, px) => `${w} ${px}px Jost, -apple-system, system-ui, sans-serif`;
    const label = (txt, x, y, { align = 'left', color = '#fff', size = 10, weight = 600 } = {}) => {
      c.font = font(weight, size); c.textAlign = align; c.textBaseline = 'middle';
      c.lineWidth = 3; c.strokeStyle = 'rgba(8,10,12,0.75)'; c.strokeText(txt, x, y);
      c.fillStyle = color; c.fillText(txt, x, y);
    };
    const yd = (m) => Math.round(U.isMetric() ? m : m / YD);
    const unit = U.distUnit();
    const [px, py] = toMap(T.pin.x, T.pin.z);
    const o = setup?.origin;
    const aiming = setup && !ball;

    // distance arcs from the ball, every 50 yd (or m), toward the hole
    if (aiming && !setup.putting) {
      const [bx, by] = toMap(o.x, o.z);
      const toPin = Math.hypot(T.pin.x - o.x, T.pin.z - o.z);
      // 50s on a short shot, 100s on a long one, as on a yardage book
      const step = (toPin > 330 ? 100 : 50) * (U.isMetric() ? 1 : YD);
      const headPin = Math.atan2(px - bx, -(py - by));
      c.lineWidth = 1;
      for (let d = step; d < toPin + step * 0.6; d += step) {
        const r = d * scale;
        c.strokeStyle = 'rgba(255,255,255,0.16)';
        c.beginPath(); c.arc(bx, by, r, headPin - Math.PI / 2 - 0.55, headPin - Math.PI / 2 + 0.55); c.stroke();
        const la = headPin - Math.PI / 2 + 0.58;
        label(String(Math.round(d / (U.isMetric() ? 1 : YD))), bx + Math.cos(la) * r, by + Math.sin(la) * r, { size: 8, color: 'rgba(255,255,255,0.6)', weight: 500 });
      }
      // ball to pin
      c.strokeStyle = 'rgba(255,213,74,0.35)'; c.setLineDash([1, 3]);
      c.beginPath(); c.moveTo(bx, by); c.lineTo(px, py); c.stroke(); c.setLineDash([]);
      // the club's carry on the aim line, with its landing area
      const id = course.game.club?.id;
      const carry = (STOCK_CARRY[id] || 0) * YD;
      if (carry) {
        const a = ((setup.heading + aimDeg) * Math.PI) / 180;
        const lx = o.x + Math.sin(a) * carry, lz = o.z - Math.cos(a) * carry;
        const [ax, ay] = toMap(lx, lz);
        c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(bx, by); c.lineTo(ax, ay); c.stroke();
        // dispersion: about ±6% of carry long and short, ±4.5° wide
        const ang = Math.atan2(ax - bx, -(ay - by));
        c.save(); c.translate(ax, ay); c.rotate(ang);
        c.fillStyle = 'rgba(236,208,143,0.22)'; c.strokeStyle = 'rgba(236,208,143,0.9)'; c.lineWidth = 1;
        c.beginPath(); c.ellipse(0, 0, Math.max(3, carry * Math.tan(0.078) * scale), Math.max(4, carry * 0.06 * scale), 0, 0, Math.PI * 2); c.fill(); c.stroke();
        c.restore();
        label(`${yd(carry)}`, ax + 9, ay, { size: 10, color: '#ecd08f', weight: 600 });
      }
    }
    // flag + distance to the pin
    c.strokeStyle = '#fff'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - 11); c.stroke();
    c.fillStyle = '#ffd54a';
    c.beginPath(); c.moveTo(px, py - 11); c.lineTo(px + 7, py - 8.5); c.lineTo(px, py - 6); c.fill();
    if (o) {
      const toPin = Math.hypot(T.pin.x - o.x, T.pin.z - o.z);
      const right = px < W - 50;
      label(`${yd(toPin)} ${unit}`, px + (right ? 10 : -10), py - 9, { align: right ? 'left' : 'right', size: 11, weight: 650 });
    }
    // this hole's shots
    c.lineWidth = 1;
    for (const d of this.dots) {
      const [ox, oy] = toMap(d.ox, d.oz);
      const [x, y] = toMap(d.x, d.z);
      c.strokeStyle = 'rgba(255,255,255,0.3)';
      c.beginPath(); c.moveTo(ox, oy);
      if (d.cx != null) { const [cx, cy] = toMap(d.cx, d.cz); c.lineTo(cx, cy); }
      c.lineTo(x, y); c.stroke();
    }
    // every player's ball
    for (const p of course.players) {
      const b = course.ball?.get(p.id);
      if (!b || b.holed || b.pickedUp) continue;
      const [x, y] = toMap(b.x, b.z);
      const me = course.game.player?.id === p.id;
      c.fillStyle = p.color;
      c.beginPath(); c.arc(x, y, me ? 3.6 : 2.6, 0, Math.PI * 2); c.fill();
      if (me) { c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.beginPath(); c.arc(x, y, 5.5, 0, Math.PI * 2); c.stroke(); }
    }
    if (ball) {
      const [x, y] = toMap(ball.x, ball.z);
      c.fillStyle = '#fff'; c.shadowColor = '#ecd08f'; c.shadowBlur = 8;
      c.beginPath(); c.arc(x, y, 3.4, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
    }
    // header: hole, par, length
    c.fillStyle = 'rgba(11,13,15,0.55)';
    c.fillRect(0, 0, W, 20);
    label(`HOLE ${course.hole.n}`, 7, 10.5, { size: 9.5, weight: 600, color: '#ecd08f' });
    label(`PAR ${course.hole.par} · ${yd(T.length)} ${unit.toUpperCase()}`, 52, 10.5, { size: 9.5, weight: 500, color: 'rgba(255,255,255,0.8)' });
    // wind, turned into the map's frame
    const wv = world.env.wind(0, { gust: false });
    if (wv.mph >= 0.5) {
      const vf = wv.x * fx + wv.z * fz, vr = wv.x * rx + wv.z * rz;
      const ang = Math.atan2(vr, vf);
      const cx = W - 34, cy = 10.5;
      c.save(); c.translate(cx, cy); c.rotate(ang);
      c.strokeStyle = '#fff'; c.fillStyle = '#fff'; c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(0, 5); c.lineTo(0, -4); c.stroke();
      c.beginPath(); c.moveTo(0, -6); c.lineTo(-3, -2); c.lineTo(3, -2); c.closePath(); c.fill();
      c.restore();
      const v = U.isMetric() ? `${(wv.mph * MPH).toFixed(0)}` : `${Math.round(wv.mph)}`;
      label(v, W - 25, 10.5, { size: 9.5, weight: 600 });
    }
  }
}
