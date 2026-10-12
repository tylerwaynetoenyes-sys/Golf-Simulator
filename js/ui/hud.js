// In-game HUD: club rail, mode pill, shot card, commentary caption, mini map,
// demo swing meter, and the multiplayer layer (turn banner, leaderboard, hole
// card, name tags over other players' balls).
import { CLUBS } from '../data/clubs.js';
import { $, esc, countUp } from './dom.js';
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
      <div class="hc-stats"><div><b>Par ${h.par}</b></div><div><b>${U.isMetric() ? Math.round(h.yards * YD) : h.yards}</b> ${U.distUnit()}</div>${h.wind ? `<div>${h.wind}</div>` : ''}</div>
      ${h.note ? `<p class="hc-note">${escape(h.note)}</p>` : ''}
      <div class="hc-skip">Tap or press Enter to skip</div>`;
    el.dataset.visible = 'true';
  }

  hideHoleCard() { const el = $('#holeCard'); if (el) el.dataset.visible = 'false'; }

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
    const c = this.mapCtx, W = this.map.width, H = this.map.height;
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
    c.font = '600 15px -apple-system, system-ui, sans-serif';
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

  // ── course map: the hole rotated so the tee is at the bottom ──

  _courseFrame(T) {
    const W = this.map.width, H = this.map.height;
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
      const hw = T.fairwayHalf(s) + 14;
      minF = Math.min(minF, f); maxF = Math.max(maxF, f);
      minR = Math.min(minR, r - hw); maxR = Math.max(maxR, r + hw);
    }
    maxF += T.greenR + 12; minF -= 8;
    const scale = Math.min((H - 24) / (maxF - minF), (W - 16) / (maxR - minR));
    const cR = (minR + maxR) / 2;
    const toMap = (x, z) => {
      const f = (x - T.tee.x) * fx + (z - T.tee.z) * fz;
      const r = (x - T.tee.x) * rx + (z - T.tee.z) * rz;
      return [W / 2 + (r - cR) * scale, H - 12 - (f - minF) * scale];
    };
    return { toMap, scale, fx, fz, rx, rz };
  }

  _renderHoleBase(T, frame) {
    const W = this.map.width, H = this.map.height;
    const cv = this._holeCanvas || (this._holeCanvas = document.createElement('canvas'));
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const { toMap, scale } = frame;
    // rough corridor + fairway ribbons
    const ribbon = (half, style) => {
      const L = [], R = [];
      for (let s = T.fwStart; s <= T.length + 0.1; s += 6) {
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
    const fwStart = T.fwStart;
    T.fwStart = 0;
    ribbon((s) => T.fairwayHalf(s) + 26, 'rgba(70,100,50,0.22)');
    T.fwStart = fwStart;
    ribbon((s) => T.fairwayHalf(s), 'rgba(120,170,90,0.32)');
    // creeks
    c.strokeStyle = 'rgba(90,150,230,0.55)';
    for (const k of T.creeks) {
      const p = T.pointAt(k.s);
      const w = T.fairwayHalf(k.s) + 40;
      const [x0, y0] = toMap(p.x - p.rx * w, p.z - p.rz * w);
      const [x1, y1] = toMap(p.x + p.rx * w, p.z + p.rz * w);
      c.lineWidth = Math.max(2, k.half * 2 * scale);
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
    c.lineWidth = 1;
    // ponds, bunkers (drawn as circles of their mean radius: the map is small)
    const blob = (o, r, style) => { const [x, y] = toMap(o.x, o.z); c.fillStyle = style; c.beginPath(); c.arc(x, y, Math.max(2, r * scale), 0, Math.PI * 2); c.fill(); };
    for (const w of T.ponds) blob(w, (w.rx + w.rz) / 2, 'rgba(90,150,230,0.55)');
    for (const b of T.bunkers) blob(b, (b.rx + b.rz) / 2, 'rgba(240,226,190,0.6)');
    // green
    blob(T.green, T.greenR, 'rgba(140,210,110,0.55)');
    // tee
    const [tx, ty] = toMap(T.tee.x, T.tee.z);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(tx - 4, ty - 3, 8, 6);
  }

  _drawCourseMap(ball, aimDeg, course, setup) {
    const T = course.T;
    const c = this.mapCtx, W = this.map.width, H = this.map.height;
    const key = `${course.hole.n}:${T.length.toFixed(1)}`;
    if (this._courseKey !== key) {
      this._courseKey = key;
      this._frame = this._courseFrame(T);
      this._renderHoleBase(T, this._frame);
    }
    const { toMap } = this._frame;
    c.clearRect(0, 0, W, H);
    c.drawImage(this._holeCanvas, 0, 0);
    // flag
    const [px, py] = toMap(T.pin.x, T.pin.z);
    c.strokeStyle = '#fff'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - 12); c.stroke();
    c.fillStyle = '#ffd54a';
    c.beginPath(); c.moveTo(px, py - 12); c.lineTo(px + 8, py - 9); c.lineTo(px, py - 6); c.fill();
    c.lineWidth = 1;
    // aim line from the current ball
    if (setup && !setup.putting && !ball) {
      const a = ((setup.heading + aimDeg) * Math.PI) / 180;
      const o = setup.origin;
      const [ax, ay] = toMap(o.x, o.z);
      const [bx, by] = toMap(o.x + Math.sin(a) * 250, o.z - Math.cos(a) * 250);
      c.strokeStyle = 'rgba(255,255,255,0.25)';
      c.setLineDash([3, 5]); c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); c.setLineDash([]);
    }
    // this hole's shots
    for (const d of this.dots) {
      const [ox, oy] = toMap(d.ox, d.oz);
      const [x, y] = toMap(d.x, d.z);
      c.strokeStyle = 'rgba(255,255,255,0.18)';
      c.beginPath(); c.moveTo(ox, oy);
      if (d.cx != null) { const [cx, cy] = toMap(d.cx, d.cz); c.lineTo(cx, cy); }
      c.lineTo(x, y); c.stroke();
    }
    // every player's ball
    for (const p of course.players) {
      const b = course.ball?.get(p.id);
      if (!b || b.holed || b.pickedUp) continue;
      const [x, y] = toMap(b.x, b.z);
      c.fillStyle = p.color;
      c.beginPath(); c.arc(x, y, setup && course.game.player?.id === p.id ? 4.5 : 3.2, 0, Math.PI * 2); c.fill();
      if (course.game.player?.id === p.id) { c.strokeStyle = '#fff'; c.beginPath(); c.arc(x, y, 6.5, 0, Math.PI * 2); c.stroke(); }
    }
    if (ball) {
      const [x, y] = toMap(ball.x, ball.z);
      c.fillStyle = '#fff'; c.shadowColor = '#ffb46b'; c.shadowBlur = 10;
      c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
    }
    // hole number + par
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.font = '700 14px -apple-system, system-ui, sans-serif';
    c.fillText(`${course.hole.n} · Par ${course.hole.par}`, 8, 18);
  }
}
