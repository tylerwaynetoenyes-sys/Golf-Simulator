// Modal panels: mode picker, session & personal bests, settings, custom shot
// entry, R10 help, players & teams, course setup, scorecards and summaries.
import { $, esc, copyButtons, toast } from './dom.js';
import { bus } from '../core/events.js';
import { COURSES, courseById, loadCourse } from '../course/courses.js';
import { CourseMode, fmtToPar, PUTT_RINGS, MULLIGANS } from '../game/courseMode.js';
import { PLAYER_COLORS, TEAMS, MAX_PLAYERS } from '../game/roster.js';
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
  course: '<svg viewBox="0 0 32 32"><path d="M3 27 Q16 -3 29 27" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M14 24V12l7 3-7 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
};

function bestText(key, fmt) {
  const v = store.best(key);
  return v == null ? '' : fmt(v);
}

export function openModePicker(game) {
  const modes = Object.values(game.modes);
  const course = modes.find((m) => m.id === 'course');
  const others = modes.filter((m) => m.id !== 'course');
  const best = {
    range: bestText('range.longestDrive', (v) => `Longest drive ${U.dist(v)} ${U.distUnit()}`),
    ctp: bestText('ctp.closest', (v) => `Closest ever ${v === 0 ? 'holed' : U.proximity(v)}`),
    targets: bestText('targets.score', (v) => `Best ${v} pts`),
    ld: bestText('ld.best', (v) => `Best ${U.dist(v)} ${U.distUnit()}`),
    course: [bestText('course.9', (v) => `Best 9: ${v}`), bestText('course.18', (v) => `Best 18: ${v}`)].filter(Boolean).join(' · '),
  };
  const card = (m, wide = false) => `
    <button class="mode-card ${wide ? 'wide' : ''}" data-mode="${m.id}" aria-current="${game.mode.id === m.id}">
      <div class="mc-icon">${MODE_ICONS[m.id] || ''}</div>
      <div class="mc-name">${esc(m.name)}</div>
      <div class="mc-blurb">${esc(m.blurb)}</div>
      ${best[m.id] ? `<div class="mc-best">★ ${esc(best[m.id])}</div>` : ''}
    </button>`;
  const ps = game.roster.players;
  const el = openPanel(`
    ${closeX}
    <h2>Choose a game</h2>
    <p class="panel-sub">Swap any time. Your session keeps every shot.</p>
    <div class="setting" style="border:0;padding:10px 0 0"><div>${ps.map((p) => `<span class="tb-team" style="--pc:${p.color};margin-right:6px;display:inline-block">${esc(p.name)}</span>`).join('')}${game.roster.teamMode ? '<span class="hint" style="margin-left:6px">· teams</span>' : ''}</div><button class="btn btn-quiet" id="mpPlayers">Players &amp; teams</button></div>
    <div class="mode-grid">
      ${course ? card(course, true) : ''}
      ${others.map((m) => card(m)).join('')}
    </div>
    <h3>Closest to Pin distances</h3>
    <div class="seg" id="ctpDiff">
      ${['short', 'mixed', 'long'].map((d) => `<button data-d="${d}" aria-pressed="${game.modes.ctp.difficulty === d}">${{ short: 'Wedges 70–120', mixed: 'Mixed 85–200', long: 'Long 160–215' }[d]}</button>`).join('')}
    </div>`, { wide: true });
  el.querySelector('#mpPlayers').addEventListener('click', () => openPlayers(game, { then: () => openModePicker(game) }));
  el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
    game.modes.ctp.difficulty = b.dataset.d;
    el.querySelectorAll('[data-d]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    audio.tick();
  }));
  el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    audio.click();
    if (b.dataset.mode === 'course') { openCourseSetup(game); return; }
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
    </tbody></table>` : '<div class="empty">No shots yet.</div>'}
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
    <div class="setting"><div><label>Screen</label><div class="hint">TV makes everything readable from the couch. Same as adding <code>?tv</code> to the address.</div></div>${seg('display', [['standard', 'Standard'], ['tv', 'TV / projector']])}</div>
    <div class="setting"><div><label>Time of day</label></div>${seg('timeOfDay', [['night', 'Night'], ['day', 'Afternoon']])}</div>
    <div class="setting"><div><label>Weather</label><div class="hint">Wind moves the ball in every mode.</div></div>${seg('weather', [['clear', 'Clear'], ['cloudy', 'Cloudy'], ['breezy', 'Light wind'], ['windy', 'Strong wind']])}</div>
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

// ── Help: pairing, troubleshooting, TV, controls (with live bridge diagnostics) ──

const HELP_TABS = [
  ['pairing', 'Pair your R10'],
  ['fix', 'Troubleshooting'],
  ['tv', 'TV & projector'],
  ['controls', 'Controls'],
];

const cmd = (text) => `<div class="cmd"><span>${esc(text)}</span><button data-copy="${esc(text)}">Copy</button></div>`;

function gameUrl(path = '/?tv') {
  const served = location.protocol.startsWith('http') && location.port === '8765';
  return served ? `${location.protocol}//${location.host}${path}` : `http://localhost:8765${path}`;
}

function helpPairing() {
  return `
    <p>Browsers can't talk Bluetooth to the R10 directly, so a small <b>bridge</b> runs on a Mac or PC near the hitting area. It connects to the R10 and passes every shot to the game. An iPad can be the screen, but the bridge has to run on a computer.</p>
    <ol class="help-steps">
      <li><b>Start the bridge</b> on the computer (first time only: install).
        ${cmd('cd bridge && pip install -r requirements.txt')}
        ${cmd('python -m r10bridge')}
        It also serves the game: open <code>http://localhost:8765</code>. Leave the terminal open.</li>
      <li><b>Bluetooth on.</b> On a Mac: Control Center → Bluetooth. The first run asks to let Terminal use Bluetooth: click <b>Allow</b>. If you said no, turn it on in System Settings → Privacy &amp; Security → Bluetooth, then quit and reopen Terminal.</li>
      <li><b>Free the R10 from your phone.</b> Close the Garmin Golf app, or switch the phone's Bluetooth off. The R10 talks to one device at a time. A <b>flashing blue</b> light means it's trying to reach your phone.</li>
      <li><b>Pairing mode.</b> Hold the R10's button until the status light is <b>solid blue</b>. If that doesn't work from off, turn it on first, then hold the button again.</li>
      <li><b>Press “Pair Garmin R10”</b> in the game. When it says <b>R10 Connected</b>, the R10's light <b>flashes green</b>, meaning it's ready for a shot. Solid red means it's busy reading a shot.</li>
      <li><b>Place it.</b> On the ground <b>6–8 ft (1.8–2.4 m) behind the ball</b>, level, pointed down your target line through the ball. Indoors, leave <b>at least 8 ft (2.4 m)</b> from the ball to the net or screen. 10 ft or more reads better. Set the exact distance in Settings → R10 to ball.</li>
    </ol>
    <div class="callout">No R10 handy? <code>python -m r10bridge --mock</code> runs a pretend R10 through the full protocol, and demo mode needs no bridge at all.</div>`;
}

function helpFix() {
  return `
    <div class="fixes">
      <details open><summary>Shots don't register</summary><div><ol>
        <li>Check the pill at the top right. It should say <b>R10 Connected · Ready</b>. If it says <i>Waking…</i>, press <b>Re-arm radar</b> below. The bridge also re-arms it after standby by itself.</li>
        <li>The R10's light should be <b>flashing green</b> before you swing. Solid red means busy: wait a second between shots.</li>
        <li><b>Distance and line:</b> 6–8 ft directly behind the ball, aimed through the ball at the target. Being off to one side is the usual cause of missed reads.</li>
        <li><b>Level ground.</b> A “tilted” warning means level it, then try again.</li>
        <li>Indoors: at least 8 ft of ball flight before the net, and nothing moving or shiny in front of the radar (fans, mirrors, a swinging net). A “radar saturated” warning means clear those away.</li>
        <li>“Saw the swing but not the ball” means the radar saw the club only. Check the line and the distance.</li>
        <li>Still nothing: <b>Reconnect</b> below, or power-cycle the R10 (hold the button until it turns off), then pair again.</li>
      </ol></div></details>
      <details><summary>“Bridge not running”</summary><div><ul>
        <li>Start it: ${cmd('python -m r10bridge')} The terminal should say it's listening on port 8765.</li>
        <li>Open the game from <code>http://localhost:8765</code>, not by double-clicking the file.</li>
        <li>Port taken? Use <code>python -m r10bridge --port 8766</code> and set Settings → Bridge address to <code>ws://localhost:8766</code>.</li>
        <li>Using an iPad? Start the bridge with <code>--lan</code> and open the address it prints on the iPad (see TV &amp; projector).</li>
      </ul></div></details>
      <details><summary>“No R10 found”</summary><div><ul>
        <li>The status light must be <b>solid blue</b> (pairing mode) while the bridge searches.</li>
        <li>Phone app closed, or the phone's Bluetooth off.</li>
        <li>Keep it within a few metres of the computer, with no metal in between.</li>
        <li>Run the step-by-step check: ${cmd('python -m r10bridge --diagnose')} It lists every Bluetooth device it can see and where it stops.</li>
      </ul></div></details>
      <details><summary>Pairing fails, or connects and then drops</summary><div><ul>
        <li><b>macOS:</b> System Settings → Bluetooth → find “Approach R10” → ⓘ → <b>Forget This Device</b>, then pair again from the game.</li>
        <li><b>Windows:</b> Settings → Bluetooth &amp; devices → remove “Approach R10”, then pair again.</li>
        <li>Power-cycle the R10. If its light flashes red (error), reset it as Garmin's manual describes, then pair again.</li>
        <li>A laptop that sleeps drops the link. On a Mac, keep it awake while you play: ${cmd('caffeinate -dims python -m r10bridge')}</li>
      </ul></div></details>
      <details><summary>iPad / iPhone notes</summary><div><ul>
        <li>iPadOS can't run the bridge. Use the iPad as the screen and run the bridge on a Mac or PC with <code>--lan</code>.</li>
        <li>Both devices on the same Wi-Fi. If the iPad can't reach <code>http://your-mac.local:8765</code>, use the IP address the bridge prints.</li>
        <li>On a Mac, the first <code>--lan</code> run may ask to allow incoming connections for Python: click <b>Allow</b>.</li>
        <li>Turn the iPad's Auto-Lock off (Settings → Display &amp; Brightness) or keep it plugged in. The game also asks the screen to stay on.</li>
      </ul></div></details>
      <details><summary>Distances look wrong</summary><div><ul>
        <li>Check Settings → R10 to ball matches the real distance.</li>
        <li>Indoors, short flights into a net limit spin reads; a longer ball flight helps.</li>
        <li>Keep the R10's firmware current through the Garmin Golf app.</li>
      </ul></div></details>
    </div>`;
}

function helpTv() {
  return `
    <p>Turn on <b>TV mode</b> for a couch-distance screen: bigger type, thicker tracer, bigger ball. Add <code>?tv</code> to the address, or use Settings → Display.</p>
    <h3>MacBook → TV or projector (recommended)</h3>
    <ol class="help-steps">
      <li>Connect with an HDMI / USB-C cable, or use AirPlay: Control Center → <b>Screen Mirroring</b> → choose the Apple TV or AirPlay TV.</li>
      <li>Start the bridge on the Mac with the R10 next to you: ${cmd('python -m r10bridge')}</li>
      <li>Open the game on the TV-side display, then go full screen (Chrome / Safari: <b>⌃⌘F</b>): ${cmd(gameUrl('/?tv'))}</li>
      <li>Tip: use the TV as a <b>separate display</b> (System Settings → Displays) so the terminal stays on the laptop.</li>
    </ol>
    <h3>iPad → TV</h3>
    <ol class="help-steps">
      <li>On the Mac or PC: ${cmd('python -m r10bridge --lan')} It prints an address like <code>http://your-mac.local:8765/?tv</code>.</li>
      <li>Open that address in Safari on the iPad. Share → <b>Add to Home Screen</b> gives you a full-screen app with no browser bars.</li>
      <li>Mirror the iPad: Control Center → Screen Mirroring → Apple TV, or a USB-C / Lightning HDMI adapter.</li>
    </ol>
    <div class="callout warn">For a projector in a bright room, Afternoon conditions read better than the night range. Turn the room lights down for night.</div>`;
}

function helpControls() {
  const rows = [
    ['Hold / release Space', 'Demo swing'],
    ['Enter', 'Skip the replay'],
    ['← →', 'Aim · R resets aim'],
    ['1–7 or ↑ ↓', 'Select club'],
    ['U', 'Mulligan: replay the last shot (course, if the rule allows)'],
    ['D · B', 'In the water: drop, or re-hit from the previous spot'],
    ['M', 'Choose game'],
    ['P', 'Players & teams'],
    ['S / Tab', 'Scorecard (course) · session & bests'],
    ['N', 'Switch day / night'],
    ['C', 'Cycle camera'],
    ['H or ?', 'This help'],
    ['Esc', 'Close panels'],
  ];
  return `<table class="data"><tbody>${rows.map(([k, v]) => `<tr><td style="text-align:left"><span class="prompt-key">${esc(k)}</span></td><td style="text-align:left">${esc(v)}</td></tr>`).join('')}</tbody></table>
    <p class="hint" style="margin-top:12px">With an R10 connected you just swing: aim with ← →, and the game does the rest. On an iPad, use the on-screen buttons.</p>`;
}

function diagHtml(game) {
  const c = game.client;
  const hb = c.lastHeartbeat;
  const ago = (sec) => (sec == null ? '—' : sec < 60 ? `${Math.round(sec)} s ago` : `${Math.round(sec / 60)} min ago`);
  const bridgeOk = c.connected && !c.stale;
  const linked = c.state === 'ready';
  const ds = hb?.deviceState || (linked ? 'WAITING' : null);
  const dsText = { WAITING: 'Ready', RECORDING: 'Recording', PROCESSING: 'Processing', STANDBY: 'Standby', INTERFERENCE_TEST: 'Calibrating', ERROR: 'Error' }[ds] || '—';
  const cell = (label, value, cls = '') => `<div><div class="dv ${cls}">${esc(value)}</div><div class="dl">${label}</div></div>`;
  return `
    ${cell('Bridge', bridgeOk ? `Running${hb?.version ? ` · v${hb.version}` : ''}` : c.connected ? 'Quiet…' : 'Not reached', bridgeOk ? 'ok' : 'bad')}
    ${cell('R10 link', linked ? (c.mode === 'mock' ? 'Connected · sim' : 'Connected') : { scanning: 'Searching', connecting: 'Connecting', handshake: 'Arming', reconnecting: 'Reconnecting', bridge_lost: 'Bridge lost' }[c.state] || 'Not paired', linked ? 'ok' : 'meh')}
    ${cell('Radar', dsText, ds === 'WAITING' ? 'ok' : ds === 'STANDBY' || ds === 'ERROR' ? 'bad' : '')}
    ${cell('Shots', hb ? `${hb.shots ?? 0} · last ${ago(hb.lastShotAgo)}` : '—')}
    ${cell('Heartbeat', c.lastHeartbeatAt ? ago((Date.now() - c.lastHeartbeatAt) / 1000) : '—', c.stale ? 'bad' : '')}`;
}

export function openHelp(game, tab = 'pairing') {
  if (tab === 'bridge') tab = 'fix';
  const render = { pairing: helpPairing, fix: helpFix, tv: helpTv, controls: helpControls };
  const el = openPanel(`
    ${closeX}
    <h2>R10 help</h2>
    <p class="panel-sub">Follow it top to bottom on a laptop or an iPad. Every command has a Copy button.</p>
    <h3>Live status</h3>
    <div class="diag" id="diagGrid">${diagHtml(game)}</div>
    <div class="panel-actions" style="justify-content:flex-start;margin-top:4px">
      <button class="btn btn-primary" id="hPair">${game.client.state === 'ready' ? 'Re-pair' : 'Pair Garmin R10'}</button>
      <button class="btn btn-quiet" id="hWake">Re-arm radar</button>
      <button class="btn btn-quiet" id="hReconnect">Reconnect</button>
      <button class="btn btn-quiet" id="hTest">Test bridge</button>
    </div>
    <div class="tabs" role="tablist">${HELP_TABS.map(([id, label]) => `<button role="tab" data-tab="${id}" aria-selected="${id === tab}">${label}</button>`).join('')}</div>
    <div class="help-body" id="helpBody">${render[tab]()}</div>
    <div class="panel-actions"><button class="btn btn-ghost" data-close>Done</button></div>`, {
    wide: true,
    onClosed: () => { bus.off?.('bridge:heartbeat', refresh); bus.off?.('bridge:diag', refresh); bus.off?.('r10:status', refresh); },
  });
  const refresh = () => { const g = el.querySelector('#diagGrid'); if (g) g.innerHTML = diagHtml(game); };
  bus.on('bridge:heartbeat', refresh);
  bus.on('bridge:diag', refresh);
  bus.on('r10:status', refresh);
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    el.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    const hb = el.querySelector('#helpBody');
    hb.innerHTML = render[b.dataset.tab]();
    copyButtons(hb);
    audio.tick();
  }));
  el.querySelector('#hPair').addEventListener('click', () => { closePanel(); game.pairing.startPairing(); });
  el.querySelector('#hWake').addEventListener('click', () => {
    if (game.client.wake()) toast('Re-arming the radar', { kind: 'info', sub: 'Light should flash green' });
    else toast('Bridge not connected', { kind: 'warn' });
  });
  el.querySelector('#hReconnect').addEventListener('click', async () => {
    if (!game.client.connected) await game.client.open();
    if (game.client.reconnect()) toast('Reconnecting to the R10…', { kind: 'info' });
    else toast('Bridge not running', { kind: 'err', sub: 'Start: python -m r10bridge' });
  });
  el.querySelector('#hTest').addEventListener('click', async () => {
    const ok = game.client.connected || await game.client.open(2500);
    if (ok) { game.client.diag(); toast('Bridge is running', { kind: 'ok', sub: game.client.url.replace('ws://', '') }); } else toast('No bridge found', { kind: 'err', sub: `Tried ${game.client.candidates.map((u) => u.replace('ws://', '')).join(', ')}` });
    refresh();
  });
}

export function openSummary(summary, { onAgain, onRange, onScorecard } = {}) {
  const teams = summary.teams?.length > 1 ? summary.teams : null;
  const el = openPanel(`
    <div class="summary">
      <div class="sum-label">${esc(summary.title)}</div>
      <div class="sum-score">${esc(summary.score)}</div>
      <div class="sum-label">${esc(summary.scoreLabel || '')}</div>
      ${summary.isBest ? '<div class="sum-best">Personal best</div>' : ''}
      <div class="sum-verdict">${esc(summary.verdict || '')}</div>
      ${teams ? `<div class="sum-teams">${teams.map((t, i) => `<div style="--pc:${t.color}"><b>${i + 1}. ${esc(t.name)}</b> · ${esc(t.display)}</div>`).join('')}</div>` : ''}
      ${summary.rows?.length ? `<table class="data"><tbody>${summary.rows.map((r) => `<tr><td style="text-align:left">${r.color ? `<span class="lb-dot" style="display:inline-block;margin-right:8px;--pc:${r.color}"></span>` : ''}${esc(r.label)}</td><td>${esc(r.value)}</td><td>${esc(r.extra || '')}</td></tr>`).join('')}</tbody></table>` : ''}
      ${summary.footer ? `<p>${esc(summary.footer)}</p>` : ''}
      <div class="panel-actions" style="justify-content:center">
        <button class="btn btn-ghost" id="sumRange">Back to the range</button>
        ${onScorecard ? '<button class="btn btn-ghost" id="sumCard">Scorecard</button>' : ''}
        <button class="btn btn-primary" id="sumAgain">Play again</button>
      </div>
    </div>`, { onClosed: () => onAgain?.('closed') });
  el.querySelector('#sumAgain').addEventListener('click', () => { onClose = null; closePanel(); onAgain?.('again'); });
  el.querySelector('#sumRange').addEventListener('click', () => { onClose = null; closePanel(); onRange?.(); });
  el.querySelector('#sumCard')?.addEventListener('click', () => { onClose = null; onScorecard(); });
}

// ── course: hole result, scorecard, setup ──

function scoreClass(v, par) {
  if (v == null) return '';
  const d = v - par;
  return d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? '' : d === 1 ? 'bogey' : 'double';
}

export function openHoleSummary(game, data, onNext) {
  const h = data.hole;
  const m = game.mode;
  const last = m.holeIdx >= m.holes.length - 1;
  let next = () => { onClose = null; closePanel(); onNext?.(); };
  const el = openPanel(`
    <div class="summary">
      <div class="sum-label">Hole ${h.n} · Par ${h.par}</div>
      <div class="sum-score" style="font-size:40px">${esc(h.name)}</div>
      <ol class="hole-result">${data.rows.map((r) => `<li style="--pc:${r.color}"><span class="dot"></span><span><b>${esc(r.name)}</b> <span class="hr-label">${esc(r.label)}</span></span><span class="hr-score">${r.strokes}</span><span class="hr-total">${esc(r.total)}</span></li>`).join('')}</ol>
      <div class="panel-actions" style="justify-content:center">
        <button class="btn btn-ghost" id="hsCard">Scorecard</button>
        <button class="btn btn-primary" id="hsNext">${last ? 'Finish' : `Hole ${m.holes[m.holeIdx + 1]?.n ?? ''} ›`}</button>
      </div>
      <p class="hint" style="margin-top:12px;color:var(--text-3);font-size:12px">Or just take your next swing: the R10 moves things along.</p>
    </div>`, { onClosed: () => next() });
  // keep a couch game moving: advance on its own after a few seconds
  const btn = el.querySelector('#hsNext');
  const label = btn.textContent;
  let left = 8;
  const timer = setInterval(() => {
    left -= 1;
    if (left <= 0) { clearInterval(timer); next(); return; }
    if (left <= 5) btn.textContent = `${label} (${left})`;
  }, 1000);
  const done = next;
  next = () => { clearInterval(timer); done(); };
  btn.addEventListener('click', () => { audio.click(); next(); });
  el.querySelector('#hsCard').addEventListener('click', () => { clearInterval(timer); onClose = null; openScorecard(game, { onContinue: () => onNext?.() }); });
  return () => { next = () => {}; };
}

export function openScorecard(game, { onContinue } = {}) {
  const m = game.mode;
  if (!m.course || !m.scorecard) { openSession(game); return; }
  const sc = m.scorecard();
  const n = sc.holes.length;
  const split = n === 18;
  const cols = split ? [...sc.holes.slice(0, 9).map((_, i) => i), 'out', ...sc.holes.slice(9).map((_, i) => i + 9), 'in', 'tot'] : [...sc.holes.map((_, i) => i), 'tot'];
  const sum = (card, a, b) => { let t = 0, any = false; for (let i = a; i < b; i++) if (card[i] != null) { t += card[i]; any = true; } return any ? t : ''; };
  const pars = sc.holes.map((h) => h.par);
  const cell = (card, c, isPar = false) => {
    if (c === 'out') return `<td class="tot">${sum(card, 0, 9)}</td>`;
    if (c === 'in') return `<td class="tot">${sum(card, 9, 18)}</td>`;
    if (c === 'tot') return `<td class="tot">${sum(card, 0, n)}</td>`;
    const v = card[c];
    const cur = c === sc.current ? ' cur' : '';
    if (isPar) return `<td class="${cur}">${v}</td>`;
    return `<td class="${cur}">${v == null ? '' : `<span class="sc ${scoreClass(v, pars[c])}">${v}</span>`}</td>`;
  };
  const head = cols.map((c) => `<th class="${c === sc.current ? 'cur' : ''}">${typeof c === 'number' ? sc.holes[c].n : c === 'tot' ? 'Tot' : c === 'out' ? 'Out' : 'In'}</th>`).join('');
  const row = (name, color, card, extra = '', isPar = false) => `<tr><td class="name" style="--pc:${color || 'transparent'}">${color ? '<span class="dot"></span>' : ''}${esc(name)}</td>${cols.map((c) => cell(card, c, isPar)).join('')}<td class="tot">${extra}</td></tr>`;
  const el = openPanel(`
    ${closeX}
    <div class="panel-head"><div><h2>Scorecard</h2><p class="panel-sub">${esc(m.name)} · ${n} holes · par ${sc.par}${sc.teams.length ? ' · teams play best ball' : ''}</p></div></div>
    <div class="scorecard-wrap"><table class="scorecard">
      <thead><tr><th class="name">Hole</th>${head}<th>±</th></tr></thead>
      <tbody>
        ${row('Par', null, pars, '', true)}
        ${sc.players.map((p) => row(p.name, p.color, p.card, fmtToPar(p.toPar))).join('')}
        ${sc.teams.map((t) => {
          let tp = 0; t.card.forEach((v, i) => { if (v != null) tp += v - pars[i]; });
          return row(t.name, t.color, t.card, fmtToPar(tp));
        }).join('')}
      </tbody></table></div>
    <div class="hint" style="margin-top:10px;font-size:12px;color:var(--text-3)">○ birdie · ◎ eagle · □ bogey · ▣ double or worse</div>
    <div class="panel-actions">
      ${m.roundOver ? '' : '<button class="btn btn-quiet" id="scQuit">End round</button>'}
      <button class="btn btn-primary" id="scDone">${onContinue ? 'Continue' : 'Done'}</button>
    </div>`, { wide: true, onClosed: () => onContinue?.() });
  el.querySelector('#scDone').addEventListener('click', () => closePanel());
  const q = el.querySelector('#scQuit');
  q?.addEventListener('click', () => {
    if (!q.dataset.confirm) { q.dataset.confirm = '1'; q.textContent = 'Tap again to end the round'; return; }
    onClose = null;
    closePanel();
    game.setMode('range');
  });
}

/** Horizontal length of a hole in yards (works before a DEM course is loaded). */
function holeYards(h) {
  const P = h.pts ? h.pts.map(([x, z]) => [x / 0.9144, z / 0.9144]) : h.line;
  let s = 0;
  for (let i = 0; i < P.length - 1; i++) s += Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
  return Math.round(s);
}

export function openCourseSetup(game) {
  const s = store.settings;
  const saved = CourseMode.savedRound(game.roster);
  let course = courseById(s.course || 'confluence');
  let length = s.courseLength || 9;
  let start = s.courseStart || 1;
  let rings = PUTT_RINGS[s.rings] ? s.rings : 'standard';
  let mull = MULLIGANS[s.mulligans] ? s.mulligans : 'nine';
  const fix = () => {
    if (course.holes.length < 18) { length = 9; start = 1; }
  };
  fix();
  const pick = () => (length === 18 ? course.holes : course.holes.slice(start - 1, start + 8));
  const holeList = () => {
    const hs = pick();
    return `<div class="tiles" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${hs.map((h) => `<div class="tile" style="padding:10px 12px"><div style="font-size:12px;color:var(--text-3)">${h.n} · Par ${h.par} · ${holeYards(h)} yd</div><div style="font-weight:600;font-size:14px">${esc(h.name)}</div></div>`).join('')}</div>`;
  };
  const courseCards = () => COURSES.map((c) => {
    const par = c.holes.reduce((a, h) => a + h.par, 0);
    const yd = c.holes.reduce((a, h) => a + holeYards(h), 0);
    return `<button class="course-card" data-course="${c.id}" aria-pressed="${c.id === course.id}">
      <span class="cc-place">${esc(c.place)}</span>
      <span class="cc-name">${esc(c.name)}</span>
      <span class="cc-meta">${c.holes.length} holes · Par ${par} · ${yd.toLocaleString()} yd${c.dem ? ' · Real terrain' : ''}</span>
    </button>`;
  }).join('');
  const lengthSeg = () => course.holes.length >= 18 ? `
      <button data-v="f9" aria-pressed="${length === 9 && start === 1}">Front 9</button>
      <button data-v="b9" aria-pressed="${length === 9 && start === 10}">Back 9</button>
      <button data-v="18" aria-pressed="${length === 18}">Full 18</button>` : '<button data-v="f9" aria-pressed="true">9 holes</button>';
  const players = game.roster.players;
  const savedCourse = saved ? courseById(saved.course || 'confluence') : null;
  const el = openPanel(`
    ${closeX}
    <h2>Play a course</h2>
    <p class="panel-sub" id="csBlurb">${esc(course.blurb)}</p>
    ${saved ? `<div class="callout" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><span>Round in progress: ${esc(savedCourse.name)}, hole ${savedCourse.holes[saved.first - 1 + saved.holeIdx]?.n ?? saved.holeIdx + 1}, ${saved.length} holes</span><button class="btn btn-primary" id="csResume">Resume round</button></div>` : ''}
    <h3>Course</h3>
    <div class="course-cards" id="csCourse">${courseCards()}</div>
    <h3>Holes</h3>
    <div class="seg" id="csLen">${lengthSeg()}</div>
    <div id="csHoles" style="margin-top:12px">${holeList()}</div>
    <h3>On the green</h3>
    <div class="setting" style="border:0;padding-top:0"><div><div class="hint">No putting: two rings around every hole settle it. Finish inside the gold ring for a 1-putt, inside the white ring for a 2-putt, anywhere else on the green for a 3-putt. Roll it in the cup and it's holed.</div></div>
      <div class="seg" id="csRings">${Object.entries(PUTT_RINGS).map(([k, r]) => `<button data-v="${k}" aria-pressed="${rings === k}">${r.label} <small style="opacity:.7">${r.one}/${r.two} ft</small></button>`).join('')}</div></div>
    <h3>Mulligans</h3>
    <div class="setting" style="border:0;padding-top:0"><div><div class="hint">A mulligan replays your last shot from the same spot with no penalty. After a ball in the water you can also choose a drop or a re-hit, each with a one-stroke penalty.</div></div>
      <div class="seg" id="csMull">${Object.entries(MULLIGANS).map(([k, r]) => `<button data-v="${k}" aria-pressed="${mull === k}">${r.label}</button>`).join('')}</div></div>
    <h3>Players</h3>
    <div class="setting" style="border:0;padding-top:0"><div>${players.map((p) => `<span class="tb-team" style="--pc:${p.color};margin-right:6px;display:inline-block;margin-bottom:4px">${esc(p.name)}</span>`).join('')}
      ${game.roster.teamMode ? `<div class="hint">Teams: ${game.roster.teams().map((t) => `${esc(t.name)} (${t.members.length})`).join(' vs ')}</div>` : ''}</div>
      <button class="btn btn-quiet" id="csPlayers">Edit players</button></div>
    <div class="panel-actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="csStart">Tee off</button></div>`, { wide: true });
  const bindLen = () => el.querySelectorAll('#csLen button').forEach((b) => b.addEventListener('click', () => {
    el.querySelectorAll('#csLen button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    length = b.dataset.v === '18' ? 18 : 9;
    start = b.dataset.v === 'b9' ? 10 : 1;
    el.querySelector('#csHoles').innerHTML = holeList();
    audio.tick();
  }));
  bindLen();
  el.querySelectorAll('#csCourse [data-course]').forEach((b) => b.addEventListener('click', () => {
    course = courseById(b.dataset.course);
    fix();
    el.querySelectorAll('#csCourse [data-course]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    el.querySelector('#csBlurb').textContent = course.blurb;
    el.querySelector('#csLen').innerHTML = lengthSeg();
    bindLen();
    el.querySelector('#csHoles').innerHTML = holeList();
    audio.tick();
  }));
  el.querySelectorAll('#csRings button').forEach((b) => b.addEventListener('click', () => {
    el.querySelectorAll('#csRings button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    rings = b.dataset.v;
    audio.tick();
  }));
  el.querySelectorAll('#csMull button').forEach((b) => b.addEventListener('click', () => {
    el.querySelectorAll('#csMull button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    mull = b.dataset.v;
    audio.tick();
  }));
  el.querySelector('#csPlayers').addEventListener('click', () => openPlayers(game, { then: () => openCourseSetup(game) }));
  // real-terrain courses fetch their elevation before the first tee
  const go = async (btn, id, opts) => {
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Loading terrain…';
    let c;
    try { c = await loadCourse(id); } catch (e) {
      console.error(e);
      btn.disabled = false; btn.textContent = label;
      toast('Course terrain could not load', { kind: 'warn', sub: 'Check the connection to the game server and try again.' });
      return;
    }
    onClose = null;
    closePanel();
    game.setMode('course', { ...opts, course: c });
  };
  el.querySelector('#csStart').addEventListener('click', (e) => {
    store.setSetting('course', course.id);
    store.setSetting('courseLength', length);
    store.setSetting('courseStart', start);
    store.setSetting('rings', rings);
    store.setSetting('mulligans', mull);
    audio.click();
    go(e.currentTarget, course.id, { length, rings, mulligans: mull, startHole: start });
  });
  el.querySelector('#csResume')?.addEventListener('click', (e) => {
    go(e.currentTarget, savedCourse.id, { length: saved.length, rings: saved.rings, mulligans: saved.mulligans, startHole: saved.first, resume: saved });
  });
}

// ── players & teams ──

export function openPlayers(game, { then } = {}) {
  const r = game.roster;
  const before = r.players.map((p) => p.id).join(',');
  const render = () => {
    const teams = r.teamMode;
    return `
      ${closeX}
      <h2>Players</h2>
      <p class="panel-sub">Up to ${MAX_PLAYERS}. Everyone shares one R10: the game says whose turn it is before each swing.</p>
      <ol class="players">${r.players.map((p) => `
        <li data-id="${p.id}" style="--pc:${p.color}">
          <button class="swatch" data-color title="Change colour"></button>
          <input value="${esc(p.name)}" maxlength="18" data-name aria-label="Player name" />
          ${teams ? `<div class="team-pick">${TEAMS.map((t, i) => `<button data-team="${i}" style="--tc:${t.color}" aria-pressed="${p.team === i}">${t.name}</button>`).join('')}</div>` : '<span></span>'}
          <button class="remove" data-remove title="Remove" ${r.players.length <= 1 ? 'disabled' : ''}>×</button>
        </li>`).join('')}
      </ol>
      <div class="panel-actions" style="justify-content:flex-start;margin-top:0">
        <button class="btn btn-ghost" id="plAdd" ${r.players.length >= MAX_PLAYERS ? 'disabled' : ''}>+ Add player</button>
      </div>
      <h3>Teams</h3>
      <div class="setting"><div><label>Play as teams</label><div class="hint">Course: best ball. Range games: team totals.</div></div><button class="toggle" role="switch" id="plTeams" aria-checked="${teams}"></button></div>
      ${teams ? `<div class="setting"><label>Quick split</label><div class="seg" id="plPreset">
        <button data-p="auto">Even 2 teams</button>
        ${r.players.length === 4 ? '<button data-p="2v2">2 v 2</button>' : ''}
        ${r.players.length === 6 ? '<button data-p="3v3">3 v 3</button><button data-p="2v2v2">2 v 2 v 2</button>' : ''}
      </div></div>` : ''}
      <div class="setting"><div><label>Take turns on the range</label><div class="hint">Off: the first player hits every range ball.</div></div><button class="toggle" role="switch" id="plRotate" aria-checked="${r.rotateRange}"></button></div>
      <div class="panel-actions"><button class="btn btn-primary" id="plDone">Done</button></div>`;
  };
  const finish = () => {
    const changed = r.players.map((p) => p.id).join(',') !== before;
    game.onRosterChanged(changed);
    then?.();
  };
  const el = openPanel(render(), { onClosed: finish });
  const bind = () => {
    el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closePanel()));
    el.querySelectorAll('.players li').forEach((li) => {
      const id = li.dataset.id;
      li.querySelector('[data-name]').addEventListener('change', (e) => r.rename(id, e.target.value));
      li.querySelector('[data-name]').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
      li.querySelector('[data-color]').addEventListener('click', () => {
        const p = r.byId(id);
        const used = new Set(r.players.filter((x) => x !== p).map((x) => x.color));
        const i = PLAYER_COLORS.indexOf(p.color);
        for (let k = 1; k <= PLAYER_COLORS.length; k++) {
          const c = PLAYER_COLORS[(i + k) % PLAYER_COLORS.length];
          if (!used.has(c)) { p.color = c; break; }
        }
        r.save(); audio.tick(); redraw();
      });
      li.querySelector('[data-remove]').addEventListener('click', () => { r.remove(id); audio.tick(); redraw(); });
      li.querySelectorAll('[data-team]').forEach((b) => b.addEventListener('click', () => { r.setTeam(id, Number(b.dataset.team)); audio.tick(); redraw(); }));
    });
    el.querySelector('#plAdd').addEventListener('click', () => {
      const p = r.add();
      audio.tick();
      redraw();
      if (p) { const inp = el.querySelector(`li[data-id="${p.id}"] input`); inp?.focus(); inp?.select(); }
    });
    el.querySelector('#plTeams').addEventListener('click', () => { r.setTeamMode(!r.teamMode); audio.tick(); redraw(); });
    el.querySelector('#plRotate').addEventListener('click', () => { r.rotateRange = !r.rotateRange; r.save(); audio.tick(); redraw(); });
    el.querySelectorAll('#plPreset [data-p]').forEach((b) => b.addEventListener('click', () => { r.preset(b.dataset.p); audio.tick(); redraw(); }));
    el.querySelector('#plDone').addEventListener('click', () => closePanel());
  };
  const redraw = () => {
    // keep any name being typed
    el.querySelectorAll('.players li').forEach((li) => { const v = li.querySelector('[data-name]').value; if (v) r.rename(li.dataset.id, v); });
    el.innerHTML = render();
    bind();
  };
  bind();
}

