// Pairing experience: launch screen, the pairing sheet (radar pulse →
// connecting arc → checkmark), the persistent R10 status pill, and the device
// popover. Driven entirely by `r10:status` events from the bridge client.
import { bus } from '../core/events.js';
import { audio } from '../audio/audio.js';
import { $, toast, copyButtons } from './dom.js';

const STEP_FOR = {
  bridge: 'bridge', scanning: 'scanning', found: 'scanning', connecting: 'connecting', handshake: 'connecting', ready: 'ready',
};
const ORDER = ['bridge', 'scanning', 'connecting', 'ready'];
const PROGRESS = { bridge: 0.08, scanning: 0.18, found: 0.35, connecting: 0.6, handshake: 0.85, ready: 1 };

const COPY = {
  bridge: ['Connecting to bridge', 'Looking for the R10 bridge on this computer.'],
  scanning: ['Searching for your R10', 'Hold the button on the back of the R10 until the LED glows <b>solid blue</b>.'],
  found: ['Found it', 'Approach R10 is in range.'],
  connecting: ['Pairing', 'Securing a Bluetooth link with the R10.'],
  handshake: ['Arming the radar', 'Exchanging capabilities and waking the launch monitor.'],
  ready: ['R10 Connected', 'Take your stance. Every swing counts now.'],
};

function bridgeCommands(url) {
  const port = (url.match(/:(\d+)/) || [])[1] || '8765';
  const portArg = port === '8765' ? '' : ` --port ${port}`;
  return `
    <div>The game talks to your R10 through a small bridge on this computer. In a terminal:</div>
    <div class="cmd"><span>cd bridge &amp;&amp; pip install -r requirements.txt</span><button data-copy="cd bridge && pip install -r requirements.txt">Copy</button></div>
    <div class="cmd"><span>python -m r10bridge${portArg}</span><button data-copy="python -m r10bridge${portArg}">Copy</button></div>
    <div style="margin-top:8px">No R10 nearby? <code>python -m r10bridge --mock</code> simulates one.</div>`;
}

const ERRORS = {
  bridge_unavailable: {
    title: 'Bridge not running',
    msg: "Couldn't reach the R10 bridge.",
    help: (url) => bridgeCommands(url),
  },
  not_found: {
    title: 'No R10 found',
    msg: "We scanned, but the R10 didn't answer.",
    help: () => `<ol>
      <li>Power on the R10 and hold its button until the LED is <b>solid blue</b> (pairing mode).</li>
      <li>Close the Garmin Golf app, or switch off Bluetooth on your phone. The R10 talks to one device at a time.</li>
      <li>Keep it within a few metres of this computer.</li></ol>`,
  },
  pairing_failed: {
    title: 'Pairing failed',
    msg: 'The R10 declined the pairing request.',
    help: () => `<ul>
      <li><b>Windows:</b> Settings → Bluetooth &amp; devices → Add device → pick “Approach R10”.</li>
      <li><b>macOS:</b> allow Bluetooth access for Terminal/Python when prompted (System Settings → Privacy &amp; Security → Bluetooth).</li>
      <li><b>Linux:</b> <code>bluetoothctl pair &lt;address&gt;</code> then <code>bluetoothctl trust &lt;address&gt;</code>.</li></ul>
      <div style="margin-top:6px">Then put the R10 back in pairing mode and retry.</div>`,
  },
  bluetooth_off: {
    title: 'Bluetooth is off',
    msg: "The bridge can't reach a Bluetooth adapter.",
    help: () => 'Turn Bluetooth on (and on macOS, allow Terminal/Python to use it), then retry.',
  },
  connect_timeout: { title: 'Connection timed out', msg: "The R10 didn't respond in time.", help: () => 'Move closer, power-cycle the R10, and try again.' },
  connect_failed: { title: "Couldn't connect", msg: 'The Bluetooth connection dropped during setup.', help: () => 'Power-cycle the R10 and try again. If it keeps happening, re-pair it in your OS Bluetooth settings.' },
  handshake_timeout: { title: 'R10 never armed', msg: 'Connected, but the radar did not arm.', help: () => 'Power-cycle the R10 (hold the button to turn it off, then on) and retry.' },
  unsupported: { title: 'Unexpected device', msg: "Connected, but this doesn't look like an R10 we can talk to.", help: () => 'Update the R10 firmware with the Garmin Golf app, then retry.' },
};

export class PairingUI {
  constructor(client, { onEnterGame }) {
    this.client = client;
    this.onEnterGame = onEnterGame;
    this.sheet = $('#pairSheet');
    this.visual = $('#pairVisual');
    this.pill = $('#r10Pill');
    this.pop = $('#r10Popover');
    this.state = 'idle';
    this.inGame = false;
    this.device = null;
    this.mode = null;
    this.deviceState = null;
    this._pingTimer = null;

    $('#pairButton').addEventListener('click', () => { audio.init(); audio.click(); this.startPairing(); });
    $('#demoButton').addEventListener('click', () => { audio.init(); audio.click(); this.enterGame('demo'); });
    $('#pairClose').addEventListener('click', () => this.closeSheet(true));
    this.sheet.addEventListener('click', (e) => { if (e.target === this.sheet) this.closeSheet(true); });
    this.pill.addEventListener('click', (e) => { e.stopPropagation(); audio.click(); this.togglePopover(); });
    document.addEventListener('click', (e) => { if (!this.pop.hidden && !this.pop.contains(e.target)) this.pop.hidden = true; });
    $('#popPair').addEventListener('click', () => { this.pop.hidden = true; this.startPairing(); });
    $('#popDisconnect').addEventListener('click', () => { this.pop.hidden = true; this.client.disconnect(); toast('R10 disconnected', { kind: 'warn', sub: 'Demo mode is on' }); });
    $('#popSimulate').addEventListener('click', () => { this.client.mockShot(window.__game?.club?.id || '7I'); });

    bus.on('r10:status', (s) => this.onStatus(s));
    bus.on('bridge:hello', (h) => { this.mode = h.mode; this.renderPill(); });
    bus.on('r10:device', ({ state }) => { this.deviceState = state; this.renderPill(); });
    bus.on('r10:error', (e) => {
      const map = { PLATFORM_TILTED: 'R10 is tilted. Level it and recalibrate.', RADAR_SATURATION: 'Radar saturated. Clear reflective objects nearby.', OVERHEATING: 'R10 is overheating. Give it a minute.' };
      toast(map[e.code] || `R10 reported ${e.code}`, { kind: e.severity === 'WARNING' ? 'warn' : 'err' });
    });
    this.renderPill();
  }

  get connected() { return this.state === 'ready'; }

  enterGame(how) {
    if (this.inGame) return;
    this.inGame = true;
    $('#launch').dataset.visible = 'false';
    this.onEnterGame?.(how);
  }

  startPairing() {
    this.openSheet();
    this.setVisual('bridge');
    this.client.pair();
  }

  openSheet() {
    this.sheet.dataset.visible = 'true';
    this.pop.hidden = true;
  }

  closeSheet(userInitiated = false) {
    this.sheet.dataset.visible = 'false';
    clearInterval(this._pingTimer);
    if (userInitiated && ['bridge', 'scanning', 'found', 'connecting', 'handshake'].includes(this.state)) {
      this.client.cancel();
    }
  }

  setVisual(state, { title, msg, help, actions } = {}) {
    this.visual.dataset.state = state;
    const copy = COPY[state] || [];
    $('#pairTitle').textContent = title || copy[0] || '';
    $('#pairMsg').innerHTML = msg || copy[1] || '';
    const helpEl = $('#pairHelp');
    if (help) { helpEl.innerHTML = help; helpEl.hidden = false; copyButtons(helpEl); } else helpEl.hidden = true;
    // ring progress
    const p = PROGRESS[state] ?? 0;
    $('#ringProgress').style.strokeDashoffset = String(327 * (1 - p));
    // steps
    const cur = STEP_FOR[state];
    const idx = ORDER.indexOf(cur);
    for (const li of $('#pairSteps').children) {
      const i = ORDER.indexOf(li.dataset.step);
      li.classList.toggle('active', state !== 'error' && i === idx);
      li.classList.toggle('done', state === 'ready' ? true : i < idx);
    }
    $('#pairSteps').style.visibility = state === 'error' ? 'hidden' : 'visible';
    // actions
    const act = $('#pairActions');
    act.innerHTML = '';
    for (const a of actions || this.defaultActions(state)) {
      const b = document.createElement('button');
      b.className = `btn ${a.primary ? 'btn-primary' : 'btn-ghost'}`;
      b.textContent = a.label;
      b.addEventListener('click', () => { audio.click(); a.run(); });
      act.appendChild(b);
    }
    // scanning ping
    clearInterval(this._pingTimer);
    if (state === 'scanning' || state === 'bridge') {
      audio.scanPing();
      this._pingTimer = setInterval(() => audio.scanPing(), state === 'scanning' ? 2100 : 2800);
    }
  }

  defaultActions(state) {
    if (state === 'ready') return [];
    if (['bridge', 'scanning', 'found', 'connecting', 'handshake'].includes(state)) {
      return [{ label: 'Cancel', run: () => this.closeSheet(true) }];
    }
    return [];
  }

  onStatus(s) {
    const prev = this.state;
    this.state = s.state;
    if (s.device) this.device = s.device;
    const sheetOpen = this.sheet.dataset.visible === 'true';

    switch (s.state) {
      case 'bridge':
      case 'scanning':
      case 'connecting':
      case 'handshake':
        if (sheetOpen) this.setVisual(s.state);
        break;
      case 'found':
        if (sheetOpen) {
          this.setVisual('found', { msg: `${s.device?.name || 'Approach R10'} is in range.` });
          audio.found();
        }
        break;
      case 'ready': {
        const name = this.device?.name || 'Approach R10';
        const fw = this.device?.firmware ? ` · firmware ${this.device.firmware}` : '';
        if (sheetOpen) {
          this.setVisual('ready', { msg: `${name}${fw}<br/>Take your stance. Every swing counts now.` });
          audio.success();
          setTimeout(() => {
            this.closeSheet();
            this.enterGame('r10');
            this.pill.classList.remove('flash');
            void this.pill.offsetWidth;
            this.pill.classList.add('flash');
          }, 1500);
        } else if (prev === 'reconnecting' || prev === 'bridge_lost') {
          toast('R10 reconnected', { kind: 'ok' });
          audio.success();
        }
        bus.emit('r10:connected', { device: this.device, mode: this.mode });
        break;
      }
      case 'error': {
        const e = ERRORS[s.code] || { title: 'Something went wrong', msg: s.message || 'Pairing failed.', help: () => 'Power-cycle the R10 and try again.' };
        if (!sheetOpen) this.openSheet();
        audio.error();
        this.setVisual('error', {
          title: e.title,
          msg: e.msg,
          help: e.help(this.client.url),
          actions: [
            { label: 'Try again', primary: true, run: () => this.startPairing() },
            { label: this.inGame ? 'Keep playing in demo mode' : 'Play in Demo Mode', run: () => { this.closeSheet(); this.enterGame('demo'); } },
          ],
        });
        bus.emit('r10:disconnected', { reason: s.code });
        break;
      }
      case 'disconnected':
        toast('Lost the R10', { kind: 'err', sub: 'It may have gone to sleep' });
        bus.emit('r10:disconnected', { reason: 'link_lost' });
        break;
      case 'reconnecting':
        break;
      case 'bridge_lost':
        if (prev !== 'bridge_lost') toast('Lost the bridge', { kind: 'err', sub: 'Retrying in the background' });
        bus.emit('r10:disconnected', { reason: 'bridge_lost' });
        break;
      case 'idle':
      case 'offline':
        bus.emit('r10:disconnected', { reason: 'idle' });
        break;
      default:
        break;
    }
    this.renderPill();
  }

  renderPill() {
    const label = $('#r10Label'), sub = $('#r10Sub');
    let st = 'demo';
    const s = this.state;
    if (s === 'ready') {
      st = this.deviceState === 'RECORDING' || this.deviceState === 'PROCESSING' ? 'recording' : 'connected';
      label.textContent = 'R10 Connected';
      sub.textContent = { RECORDING: 'Recording…', PROCESSING: 'Processing…', WAITING: 'Ready', STANDBY: 'Waking…', INTERFERENCE_TEST: 'Calibrating…' }[this.deviceState] || 'Ready';
      if (this.mode === 'mock') sub.textContent += ' · sim';
    } else if (['bridge', 'scanning', 'found', 'connecting', 'handshake'].includes(s)) {
      st = 'busy';
      label.textContent = 'Pairing…';
      sub.textContent = { bridge: 'Bridge', scanning: 'Searching', found: 'Found', connecting: 'Connecting', handshake: 'Arming' }[s];
    } else if (s === 'reconnecting' || s === 'bridge_lost' || s === 'disconnected') {
      st = 'lost';
      label.textContent = s === 'disconnected' ? 'R10 Disconnected' : 'Reconnecting…';
      sub.textContent = 'Demo active';
    } else {
      label.textContent = 'Demo Mode';
      sub.textContent = 'Pair R10';
    }
    this.pill.dataset.state = st;

    // popover
    const d = this.device || {};
    $('#popTitle').textContent = s === 'ready' ? (d.name || 'Approach R10') : 'Garmin Approach R10';
    $('#popSub').textContent = s === 'ready' ? 'Connected via local bridge' : st === 'busy' ? 'Pairing in progress' : 'Not connected — demo shots are on';
    const meta = [];
    if (s === 'ready') {
      if (d.address) meta.push(['Address', d.address]);
      if (d.firmware) meta.push(['Firmware', d.firmware]);
      meta.push(['Radar', this.deviceState ? this.deviceState.toLowerCase().replace('_', ' ') : 'waiting']);
      meta.push(['Bridge', this.client.url.replace('ws://', '')]);
    } else {
      meta.push(['Bridge', this.client.url.replace('ws://', '')]);
    }
    $('#popMeta').innerHTML = meta.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    $('#popSimulate').hidden = !(s === 'ready' && this.mode === 'mock');
    $('#popPair').hidden = s === 'ready' || st === 'busy';
    $('#popDisconnect').hidden = s !== 'ready' && st !== 'lost';
  }

  togglePopover() {
    this.renderPill();
    this.pop.hidden = !this.pop.hidden;
  }
}
