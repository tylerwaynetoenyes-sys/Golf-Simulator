// Minimal typed-ish event bus shared by the game, UI, audio and network layers.
export class Emitter {
  constructor() { this._h = new Map(); }
  on(type, fn) {
    if (!this._h.has(type)) this._h.set(type, new Set());
    this._h.get(type).add(fn);
    return () => this.off(type, fn);
  }
  once(type, fn) {
    const off = this.on(type, (...a) => { off(); fn(...a); });
    return off;
  }
  off(type, fn) { this._h.get(type)?.delete(fn); }
  emit(type, payload) {
    const set = this._h.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload); } catch (e) { console.error(`[bus] ${type} handler failed`, e); }
    }
  }
}

export const bus = new Emitter();
