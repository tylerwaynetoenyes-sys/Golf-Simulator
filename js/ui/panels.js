// Modal panels: mode picker, session & personal bests, settings, custom shot
// entry, help, and end-of-round summaries.
import { $, esc, copyButtons, toast } from './dom.js';
import { store } from '../data/store.js';
import { CLUBS, clubById } from '../data/clubs.js';
import * as U from '../core/units.js';
import { MPH } from '../core/physics.js';
import { audio } from '../audio/audio.js';

const panel = $('#panel');
const body = $('#panelBody');
let onClose = null;

export function openPanel(html, { onClosed, wide = false } = {}) {
  body.innerHTML = html;
  body.style.width = wide ? 'min(900px, 100%)' : '';
  panel.dataset.visible = 'true';
  onClose = onClosed || null;
  copyButtons(body);
  for (const b of body.querySelectorAll('[data-close]')) b.addEventListener('click', () => closePanel());
  return body;
}

export function closePanel() {
  if (panel.dataset.visible !== 'true') return false;
  panel.dataset.visible = 'false';
  const cb = onClose;
  onClose = null;
  cb?.();
  return true;
}

export const panelOpen = () => panel.dataset.visible === 'true';

panel.addEventListener('click', (e) => { if (e.target === panel) closePanel(); });

const closeX = '<button class="sheet-close" data-close aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>';

const MODE_ICONS = {
  range: '<svg viewBox="0 0 32 32"><path d="M4 26 Q16 2 28 26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="16" cy="26" r="2" fill="currentColor"/></svg>',
  ctp: '<svg viewBox="0 0 32 32"><path d="M11 28V5l12 5-12 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><ellipse cx="13" cy="28" rx="9" ry="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  targets: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="16" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="16" r="2.5" fill="currentColor"/></svg>',
  ld: '<svg viewBox="0 0 32 32"><path d="M4 24h24M8 24V14M14 24V9M20 24V12M26 24V5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};

function bestText(key, fmt) {
  const v = store.best(key);
  return v == null ? '' : fmt(v);
}

export function openModePicker(game) {
  const modes = Object.values(game.modes);
  const best = {
    range: bestText('range.longestDrive', (v) => `Longest drive ${U.dist(v)} ${U.distUnit()}`),
    ctp: bestText('ctp.closest', (v) => `Closest ever ${v === 0 ? 'holed' : U.proximity(v)}`),
    targets: bestText('targets.score', (v) => `Best ${v} pts`),
    ld: bestText('ld.best', (v) => `Best ${U.dist(v)} ${U.distUnit()}`),
  };
  const el = openPanel(`
    ${closeX}
    <h2>Choose a game</h2>
    <p class="panel-sub">Swap any time. Your session keeps every shot.</p>
    <div class="mode-grid">
      ${modes.map((m) => `
        <button class="mode-card" data-mode="${m.id}" aria-current="${game.mode.id === m.id}">
          <div class="mc-icon">${MODE_ICONS[m.id] || ''}</div>
          <div class="mc-name">${esc(m.name)}</div>
          <div class="mc-blurb">${esc(m.blurb)}</div>
          ${best[m.id] ? `<div class="mc-best">★ ${esc(best[m.id])}</div>` : ''}
        </button>`).join('')}
    </div>
    <h3>Closest to Pin distances</h3>
    <div class="seg" id="ctpDiff">
      ${['short', 'mixed', 'long'].map((d) => `<button data-d="${d}" aria-pressed="${game.modes.ctp.difficulty === d}">${{ short: 'Wedges 70–120', mixed: 'Mixed 85–200', long: 'Long 160–215' }[d]}</button>`).join('')}
    </div>`);
  el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
    game.modes.ctp.difficulty = b.dataset.d;
    el.querySelectorAll('[data-d]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    audio.tick();
  }));
  el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    audio.click();
    closePanel();
    game.setMode(b.dataset.mode);
  }));
}

export function openSession(game) {
  const shots = store.session.shots;
  const clubStats = store.clubStats();
  const tiles = [
    ['Shots today', shots.length, ''],
    ['Longest drive', bestText('range.longestDrive', (v) => U.dist(v)), U.distUnit(), true],
    ['Top ball speed', bestText('range.ballSpeed', (v) => U.speed(v)), U.speedUnit(), true],
    ['Closest to pin', bestText('ctp.closest', (v) => (v === 0 ? 'Ace' : U.proximity(v))), '', true],
    ['Best CTP round', bestText('ctp.round', (v) => v), 'pts', true],
    ['Target best', bestText('targets.score', (v) => v), 'pts', true],
    ['Long drive best', bestText('ld.best', (v) => U.dist(v)), U.distUnit(), true],
    ['Lifetime shots', store.lifetime.shots || 0, ''],
  ];
  const recent = shots.slice(-12).reverse();
  const el = openPanel(`
    ${closeX}
    <div class="panel-head"><div><h2>Session</h2><p class="panel-sub">Started ${new Date(store.session.started).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Personal bests are kept on this device.</p></div></div>
    <h3>Personal bests</h3>
    <div class="tiles">${tiles.map(([l, v, u, gold]) => `<div class="tile ${gold && v !== '' ? 'gold' : ''}"><div class="tile-v">${v === '' ? '—' : esc(v)}${v !== '' && u ? `<small>${esc(u)}</small>` : ''}</div><div class="tile-l">${l}</div></div>`).join('')}</div>
    <h3>By club (this session)</h3>
    ${clubStats.length ? `<table class="data"><thead><tr><th>Club</th><th>Shots</th><th>Carry</th><th>Total</th><th>Ball spd</th><th>Launch</th><th>Spin</th><th>Spread</th></tr></thead><tbody>
      ${clubStats.map((s) => `<tr><td>${esc(clubById(s.club).name)}</td><td>${s.count}</td><td>${U.dist(s.carry)}</td><td>${U.dist(s.total)}</td><td>${U.speed(s.ballSpeed)}</td><td>${s.launch.toFixed(1)}°</td><td>${Math.round(s.spin)}</td><td>±${U.dist(s.offlineSd)}</td></tr>`).join('')}
    </tbody></table>` : '<div class="empty">No shots yet. The range is patient.</div>'}
    <h3>Recent shots</h3>
    ${recent.length ? `<table class="data"><thead><tr><th>Club</th><th>Source</th><th>Ball spd</th><th>Launch</th><th>Spin</th><th>Carry</th><th>Total</th><th>Offline</th></tr></thead><tbody>
      ${recent.map((s) => `<tr><td>${esc(clubById(s.club).short)}</td><td>${s.source === 'r10' ? 'R10' : s.source === 'mock' ? 'R10 sim' : s.source === 'manual' ? 'Custom' : 'Demo'}</td><td>${U.speed(s.ballSpeed)}</td><td>${s.launchAngle.toFixed(1)}°</td><td>${Math.round(s.totalSpin)}</td><td>${U.dist(s.carry)}</td><td>${s.lost ? '—' : U.dist(s.total)}</td><td>${s.lost ? 'lost' : U.signedDir(s.offline)}</td></tr>`).join('')}
    </tbody></table>` : ''}
    <div class="panel-actions">
      <button class="btn btn-quiet" id="resetBests">Reset personal bests</button>
      <button class="btn btn-quiet" id="resetSession">New session</button>
      <button class="btn btn-ghost" id="exportCsv" ${shots.length ? '' : 'disabled'}>Export CSV</button>
    </div>`, { wide: true });
  el.querySelector('#exportCsv').addEventListener('click', () => {
    const blob = new Blob([store.toCSV('SI units: m, m/s, deg, rpm')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `alton-range-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  el.querySelector('#resetSession').addEventListener('click', () => {
    store.resetSession();
    game.hud.clearDots();
    game.world.tracer.clearGhosts();
    toast('New session started', { kind: 'ok' });
    openSession(game);
  });
  const rb = el.querySelector('#resetBests');
  rb.addEventListener('click', () => {
    if (rb.dataset.confirm) {
      store.resetBests();
      toast('Personal bests cleared', { kind: 'warn' });
      openSession(game);
    } else {
      rb.dataset.confirm = '1';
      rb.textContent = 'Tap again to confirm';
    }
  });
}

export function openSettings(game) {
  const s = store.settings;
  const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button data-v="${v}" aria-pressed="${s[key] === v}">${l}</button>`).join('')}</div>`;
  const tog = (key) => `<button class="toggle" role="switch" data-toggle="${key}" aria-checked="${!!s[key]}"></button>`;
  const el = openPanel(`
    ${closeX}
    <h2>Settings</h2>
    <h3>Display</h3>
    <div class="setting"><div><label>Units</label></div>${seg('units', [['imperial', 'Yards · mph'], ['metric', 'Metres · km/h']])}</div>
    <div class="setting"><div><label>Camera</label><div class="hint">Cinematic cuts to a landing camera on longer shots.</div></div>${seg('camera', [['cinematic', 'Cinematic'], ['follow', 'Follow'], ['tee', 'Tee']])}</div>
    <div class="setting"><div><label>Graphics quality</label><div class="hint">Lower it if the frame rate dips.</div></div>${seg('quality', [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']])}</div>
    <div class="setting"><div><label>Ghost tracers</label><div class="hint">Keep faint traces of your last six shots.</div></div>${tog('ghostTracers')}</div>
    <div class="setting"><div><label>Commentary</label><div class="hint">Occasional dry remarks. Never more than one a shot.</div></div>${tog('commentary')}</div>
    <h3>Sound</h3>
    <div class="setting"><label>Master volume</label><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-range="volume" /></div>
    <div class="setting"><label>Night ambience</label><input type="range" min="0" max="1" step="0.05" value="${s.ambience}" data-range="ambience" /></div>
    <h3>R10 bridge</h3>
    <div class="setting"><div><label>R10 to ball</label><div class="hint">How far behind the ball the R10 sits (Garmin: 6–8 ft). Sent to the R10 on connect.</div></div><input type="range" min="6" max="8" step="0.5" value="${s.r10Distance}" data-range="r10Distance" /><span class="hint" id="r10DistVal">${s.r10Distance} ft</span></div>
    <div class="setting"><div><label>Bridge address</label><div class="hint">Where <code>python -m r10bridge</code> is listening.</div></div><input type="text" value="${esc(s.bridgeUrl)}" data-text="bridgeUrl" spellcheck="false" /></div>
    <div class="panel-actions"><button class="btn btn-primary" data-close>Done</button></div>`);
  el.querySelectorAll('.seg[data-key]').forEach((g) => g.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    audio.tick();
    game.applySetting(g.dataset.key, b.dataset.v);
  })));
  el.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
    const v = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(v));
    audio.tick();
    game.applySetting(b.dataset.toggle, v);
  }));
  el.querySelectorAll('[data-range]').forEach((r) => r.addEventListener('input', () => game.applySetting(r.dataset.range, Number(r.value))));
  el.querySelectorAll('[data-text]').forEach((i) => i.addEventListener('change', () => game.applySetting(i.dataset.text, i.value.trim())));
}

export function openManual(game) {
  const club = game.club;
  const el = openPanel(`
    ${closeX}
    <h2>Custom shot</h2>
    <p class="panel-sub">Type in launch numbers (from any launch monitor) and watch them fly.</p>
    <div class="presets">${CLUBS.map((c) => `<button class="btn btn-quiet" data-preset="${c.id}">${c.short}</button>`).join('')}</div>
    <div class="form-grid">
      <div class="field"><label>Ball speed (mph)</label><input id="mBall" type="number" step="0.1" value="${club.ballMph}" /></div>
      <div class="field"><label>Launch angle (°)</label><input id="mLaunch" type="number" step="0.1" value="${club.launch}" /></div>
      <div class="field"><label>Direction (° + right)</label><input id="mDir" type="number" step="0.1" value="0" /></div>
      <div class="field"><label>Total spin (rpm)</label><input id="mSpin" type="number" step="10" value="${club.spin}" /></div>
      <div class="field"><label>Spin axis (° + fade)</label><input id="mAxis" type="number" step="0.1" value="0" /></div>
      <div class="field"><label>Club speed (mph)</label><input id="mClub" type="number" step="0.1" value="${club.clubMph}" /></div>
    </div>
    <div class="panel-actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="mHit">Hit it</button></div>`);
  el.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const c = clubById(b.dataset.preset);
    el.querySelector('#mBall').value = c.ballMph;
    el.querySelector('#mLaunch').value = c.launch;
    el.querySelector('#mSpin').value = c.spin;
    el.querySelector('#mClub').value = c.clubMph;
    game.selectClub(c.id);
    audio.tick();
  }));
  el.querySelector('#mHit').addEventListener('click', () => {
    const num = (id, d = 0) => { const v = parseFloat(el.querySelector(id).value); return Number.isFinite(v) ? v : d; };
    const launch = {
      ballSpeed: Math.max(1, num('#mBall')) * MPH,
      launchAngle: Math.max(-10, Math.min(70, num('#mLaunch'))),
      launchDirection: Math.max(-45, Math.min(45, num('#mDir'))),
      totalSpin: Math.max(0, Math.min(15000, num('#mSpin'))),
      spinAxis: Math.max(-60, Math.min(60, num('#mAxis'))),
      clubSpeed: num('#mClub') > 0 ? num('#mClub') * MPH : null,
    };
    closePanel();
    game.handleLaunch(launch, 'manual');
  });
}

export function openHelp(url = 'ws://localhost:8765') {
  openPanel(`
    ${closeX}
    <h2>Playing with a Garmin R10</h2>
    <p class="panel-sub">Browsers can't talk to the R10 directly, so a small bridge app on this computer connects over Bluetooth and streams each shot to the game.</p>
    <h3>1 · Start the bridge</h3>
    <div class="cmd"><span>cd bridge &amp;&amp; pip install -r requirements.txt</span><button data-copy="cd bridge && pip install -r requirements.txt">Copy</button></div>
    <div class="cmd"><span>python -m r10bridge</span><button data-copy="python -m r10bridge">Copy</button></div>
    <p>The bridge also serves this game at <code>http://localhost:8765</code>, so one command runs everything. It listens for the game on <code>${esc(url)}</code>.</p>
    <h3>2 · Put the R10 in pairing mode</h3>
    <p>Turn it on, then hold the button until the LED is <b>solid blue</b>. Close the Garmin Golf app (the R10 only talks to one device at a time).</p>
    <h3>3 · Pair</h3>
    <p>Press <b>Pair Garmin R10</b>. Garmin's guidance: put the R10 on the ground <b>1.8–2.4 m (6–8 ft) behind the ball</b>, level, with its red alignment line pointing at your target. Indoors, leave at least 2.4 m (8 ft) between the ball and the net.</p>
    <h3>No R10?</h3>
    <p><code>python -m r10bridge --mock</code> simulates one through the full protocol, and demo mode needs no bridge at all.</p>
    <h3>Controls</h3>
    <table class="data"><tbody>
      <tr><td>Hold / release Space</td><td>Demo swing (power meter)</td></tr>
      <tr><td>← →</td><td>Aim</td></tr>
      <tr><td>1–7 or ↑ ↓</td><td>Select club</td></tr>
      <tr><td>Enter</td><td>Skip to result</td></tr>
      <tr><td>C</td><td>Cycle camera</td></tr>
      <tr><td>M</td><td>Choose game</td></tr>
      <tr><td>Tab</td><td>Session & bests</td></tr>
    </tbody></table>
    <div class="panel-actions"><button class="btn btn-primary" data-close>Got it</button></div>`);
}

export function openSummary(summary, { onAgain, onRange }) {
  const el = openPanel(`
    <div class="summary">
      <div class="sum-label">${esc(summary.title)}</div>
      <div class="sum-score">${esc(summary.score)}</div>
      <div class="sum-label">${esc(summary.scoreLabel || '')}</div>
      ${summary.isBest ? '<div class="sum-best">Personal best</div>' : ''}
      <div class="sum-verdict">${esc(summary.verdict || '')}</div>
      ${summary.rows?.length ? `<table class="data"><tbody>${summary.rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.value)}</td><td>${esc(r.extra || '')}</td></tr>`).join('')}</tbody></table>` : ''}
      ${summary.footer ? `<p>${esc(summary.footer)}</p>` : ''}
      <div class="panel-actions" style="justify-content:center"><button class="btn btn-ghost" id="sumRange">Back to the range</button><button class="btn btn-primary" id="sumAgain">Play again</button></div>
    </div>`, { onClosed: () => onAgain?.('closed') });
  el.querySelector('#sumAgain').addEventListener('click', () => { onClose = null; closePanel(); onAgain?.('again'); });
  el.querySelector('#sumRange').addEventListener('click', () => { onClose = null; closePanel(); onRange?.(); });
}
