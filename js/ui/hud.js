// In-game HUD: club rail, mode pill, shot card, commentary caption, mini map
// and the demo swing meter.
import { CLUBS } from '../data/clubs.js';
import { $, esc, countUp } from './dom.js';
import * as U from '../core/units.js';
import { MPH, YD } from '../core/physics.js';
import { GREENS, CTP_GREEN, LAYOUT } from '../scene/layout.js';

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
  showShot({ launch, result, club, source, outcome }) {
    $('#shotClub').textContent = club.name;
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

  setSkip(visible) { $('#skipButton').hidden = !visible; }

  // ── mini map ──
  addDot(result, color) {
    this.dots.push({ x: result.rest.x, z: result.rest.z, cx: result.carryPoint?.x, cz: result.carryPoint?.z, lost: result.lost, color });
    if (this.dots.length > 24) this.dots.shift();
  }

  clearDots() { this.dots = []; }

  drawMap(ball, aimDeg, mode) {
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
      c.fillStyle = d.lost ? `rgba(255,111,97,${alpha})` : `rgba(255,236,210,${alpha})`;
      c.beginPath(); c.arc(px(d.x), py(Math.max(d.z, -zMax)), i === this.dots.length - 1 ? 4.5 : 3, 0, Math.PI * 2); c.fill();
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
}
