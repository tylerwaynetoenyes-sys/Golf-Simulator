// WebSocket client for the local R10 bridge (bridge/r10bridge, ws://localhost:8765).
//
// Emits on the shared bus:
//   r10:status   {state, message, code?, device?}   pairing / link lifecycle
//   r10:shot     normalized launch (see normalizeShot)
//   r10:misread  raw shot with no usable ball data
//   r10:device   {state}   raw device state (WAITING / RECORDING / PROCESSING ...)
//   r10:error    {code, severity}   device-reported problem (tilt, saturation...)
//   bridge:hello {mode, version}
//   bridge:heartbeat {link, deviceState, phase, shots, lastShotAgo, lastRxAgo, ...}  every 5 s
//   bridge:stale  no heartbeat for a while (socket half-open, laptop asleep)
//   bridge:diag   reply to diag()
import { bus } from '../core/events.js';

const MPS_PER_MPH = 0.44704;

export function normalizeShot(msg) {
  const s = msg.shot || {};
  const b = s.ball;
  if (!b || !(b.speedMps > 2)) return null;
  const c = s.club || {};
  return {
    source: msg.source || 'r10',
    id: s.id,
    ballSpeed: b.speedMps ?? (b.speedMph || 0) * MPS_PER_MPH,
    launchAngle: b.launchAngle ?? 0,
    launchDirection: b.launchDirection ?? 0,
    totalSpin: b.totalSpin ?? 0,
    spinAxis: b.spinAxis ?? 0,
    clubSpeed: c.speedMps || null,
    faceAngle: c.faceAngle ?? null,
    clubPath: c.path ?? null,
    attackAngle: c.attackAngle ?? null,
    spinCalc: b.spinCalc,
    tempo: s.swing?.tempo ?? null,
    receivedAt: msg.receivedAt || Date.now(),
  };
}

export class BridgeClient {
  /**
   * @param {string} url  preferred bridge URL
   * @param {string[]} [fallbacks]  also tried, in order, if the first is silent
   */
  constructor(url, fallbacks = []) {
    this.url = url;
    this.candidates = [...new Set([url, ...fallbacks])];
    this.ws = null;
    this.mode = null; // 'ble' | 'mock'
    this.state = 'offline';
    this.device = null;
    this.wantPaired = false;
    this._retry = null;
    this._retryDelay = 1500;
    this._openPromise = null;
    this.lastHeartbeat = null; // last heartbeat payload
    this.lastHeartbeatAt = 0;
    this.lastShotAt = 0;
    this.stale = false;
    this._watchdog = setInterval(() => this._checkStale(), 2000);
  }

  /** Heartbeats arrive every 5 s; 16 s of silence on an open socket means it is dead. */
  _checkStale() {
    if (!this.connected || !this.lastHeartbeatAt) return;
    const quiet = Date.now() - this.lastHeartbeatAt;
    if (quiet > 16000 && !this.stale) {
      this.stale = true;
      bus.emit('bridge:stale', { quiet });
      // Force a clean reconnect: close, and the normal retry path takes over.
      try { this.ws.close(); } catch { /* ignore */ }
    }
  }

  get connected() { return this.ws && this.ws.readyState === WebSocket.OPEN; }

  _setState(state, extra = {}) {
    this.state = state;
    if (extra.device) this.device = extra.device;
    bus.emit('r10:status', { state, ...extra, device: extra.device || this.device });
  }

  /** Open the socket, trying each candidate URL. Resolves true on the bridge's hello. */
  open(timeoutMs = 2500) {
    if (this.connected) return Promise.resolve(true);
    if (this._openPromise) return this._openPromise;
    this._openPromise = (async () => {
      for (const url of this.candidates) {
        if (await this._openOne(url, timeoutMs)) {
          this.url = url;
          return true;
        }
      }
      return false;
    })().finally(() => { this._openPromise = null; });
    return this._openPromise;
  }

  _openOne(url, timeoutMs) {
    return new Promise((resolve) => {
      let settled = false;
      let timer = null;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      };
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        done(false);
        return;
      }
      this.ws = ws;
      timer = setTimeout(() => { try { ws.close(); } catch { /* ignore */ } done(false); }, timeoutMs);
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === 'hello') { ws.helloed = true; done(true); }
        this._onMessage(msg);
      };
      ws.onerror = () => done(false);
      ws.onclose = () => {
        done(false);
        if (this.ws !== ws) return;
        if (ws.helloed) this._onClose(); // a live bridge went away
        else this.ws = null; // never connected: just a failed attempt
      };
    });
  }

  _onMessage(msg) {
    switch (msg.type) {
      case 'hello':
        this.mode = msg.mode;
        this.version = msg.version;
        this.lastHeartbeatAt = Date.now();
        this.stale = false;
        bus.emit('bridge:hello', msg);
        if (msg.status && msg.status.state === 'ready') {
          this._setState('ready', { message: msg.status.message, device: msg.status.device });
        }
        break;
      case 'status':
        if (msg.state === 'idle' && !this.wantPaired) {
          this._setState('idle', msg);
        } else if (msg.state !== 'idle') {
          this._setState(msg.state, msg);
        }
        break;
      case 'shot': {
        const launch = normalizeShot(msg);
        this.lastShotAt = Date.now();
        // (the bridge dedups by the R10's shot id before broadcasting)
        if (launch) bus.emit('r10:shot', launch);
        else bus.emit('r10:misread', msg);
        break;
      }
      case 'misread':
        bus.emit('r10:misread', msg);
        break;
      case 'heartbeat':
        this.lastHeartbeat = msg;
        this.lastHeartbeatAt = Date.now();
        this.stale = false;
        if (msg.deviceState) bus.emit('r10:device', { state: msg.deviceState });
        bus.emit('bridge:heartbeat', msg);
        break;
      case 'diag':
        this.lastHeartbeat = { ...this.lastHeartbeat, ...msg };
        this.lastHeartbeatAt = Date.now();
        bus.emit('bridge:diag', msg);
        break;
      case 'device_state':
        bus.emit('r10:device', { state: msg.state });
        break;
      case 'device_error':
        bus.emit('r10:error', msg);
        break;
      default:
        break;
    }
  }

  _onClose() {
    const wasLinked = ['ready', 'reconnecting', 'handshake', 'connecting', 'scanning', 'found'].includes(this.state);
    this.ws = null;
    if (this.wantPaired) {
      this._setState('bridge_lost', { message: 'Lost the bridge. Retrying…', code: 'bridge_lost' });
      clearTimeout(this._retry);
      this._retry = setTimeout(async () => {
        const ok = await this.open();
        if (ok && this.wantPaired) this.send({ type: 'pair' });
        else if (this.wantPaired) this._onClose();
      }, this._retryDelay);
      this._retryDelay = Math.min(this._retryDelay * 1.5, 8000);
    } else if (wasLinked) {
      this._setState('offline');
    }
  }

  send(obj) {
    if (!this.connected) return false;
    this.ws.send(JSON.stringify(obj));
    return true;
  }

  /** Full pairing request: bridge first, then the R10. */
  async pair() {
    this.wantPaired = true;
    this._retryDelay = 1500;
    this._setState('bridge', { message: 'Connecting to the R10 bridge' });
    const ok = await this.open();
    if (!ok) {
      this.wantPaired = false;
      this._setState('error', {
        code: 'bridge_unavailable',
        message: `No bridge at ${this.url}`,
      });
      return false;
    }
    if (this.state === 'ready') return true; // bridge already holds a live R10
    this.send({ type: 'pair' });
    return true;
  }

  cancel() {
    this.wantPaired = false;
    clearTimeout(this._retry);
    this.send({ type: 'disconnect' });
    this._setState('idle', { message: 'Cancelled' });
  }

  disconnect() {
    this.wantPaired = false;
    clearTimeout(this._retry);
    this.send({ type: 'disconnect' });
    this.device = null;
    this._setState('idle', { message: 'Disconnected' });
  }

  /** Re-arm the radar (it drops to standby after a while). */
  wake() { return this.send({ type: 'wake' }); }

  /** Drop and re-establish the Bluetooth link without re-pairing. */
  reconnect() { this.wantPaired = true; return this.send({ type: 'reconnect' }); }

  /** Ask for a diagnostics snapshot (reply arrives as bridge:diag). */
  diag() { return this.send({ type: 'diag' }); }

  mockShot(club) { this.send({ type: 'mock_shot', club }); }

  /** Tell the R10 the tee distance etc. (improves its internal model; optional). */
  shotConfig(cfg) { this.send({ type: 'shot_config', ...cfg }); }

  setUrl(url) {
    if (url === this.url) return;
    this.url = url;
    this.candidates = [url];
    if (this.ws) { try { this.ws.close(); } catch { /* ignore */ } }
  }
}
