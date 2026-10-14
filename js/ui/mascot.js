// The Piasa as a small spectator perched in the corner of the HUD. It idles,
// blinks, beats its wings at a good shot, winces at a wet one, and otherwise
// leaves the golf alone. Tap it for a line of local history.
import { piasaSVG } from './piasa.js';
import { toast } from './dom.js';
import { YD } from '../core/physics.js';

const FACTS = [
  ['The Piasa', 'In 1673 Marquette and Jolliet recorded two painted monsters on the bluffs near here, in green, red and black.'],
  ['The Piasa', 'The original painting was lost to quarrying in the 1800s. The one on the bluff today is a recreation.'],
  ['The Piasa', 'Horns, red eyes, a beard and a tail ending in a fish fin. The wings came later, with the legend.'],
  ['The Piasa', 'The present mural, 48 feet long and 22 feet high, was painted on the bluff in 1999 and is touched up regularly.'],
];

export class PiasaMascot {
  constructor(host) {
    this.host = host;
    this.enabled = !!host;
    this._timer = null;
    this._fact = 0;
    if (!host) return;
    host.innerHTML = `<div class="pz-perch">${piasaSVG({ id: 'pzHud' })}</div><div class="pz-ledge"></div>`;
    host.title = 'The Piasa';
    host.addEventListener('click', () => {
      this.react('nod');
      const [t, sub] = FACTS[this._fact++ % FACTS.length];
      toast(t, { kind: 'info', sub, ms: 6500 });
    });
    this._blink();
  }

  _blink() {
    const next = 2500 + Math.random() * 5000;
    setTimeout(() => {
      this.host.classList.add('blink');
      setTimeout(() => this.host.classList.remove('blink'), 160);
      this._blink();
    }, next);
  }

  /** kind: 'cheer' | 'big' | 'nod' | 'wince' */
  react(kind) {
    if (!this.enabled) return;
    const h = this.host;
    clearTimeout(this._timer);
    h.classList.remove('cheer', 'big', 'nod', 'wince');
    void h.offsetWidth;
    h.classList.add(kind);
    this._timer = setTimeout(() => h.classList.remove(kind), kind === 'big' ? 2600 : 1600);
  }

  /** Only reacts to shots worth reacting to. */
  reactTo({ result, outcome = {} }) {
    const cat = outcome.category;
    if (outcome.ace || cat === 'ctpAce' || cat === 'eagle') return this.react('big');
    if (outcome.isBest || cat === 'birdie' || cat === 'longPutt' || cat === 'ctpKick' || (outcome.holed && !result.putt)) return this.react('cheer');
    if (cat === 'water' || cat === 'oob' || (result.lost && !result.putt)) return this.react('wince');
    if (!result.putt && !result.lost && result.total > 280 * YD) return this.react('cheer');
    if (cat === 'gir' || cat === 'ctpGreen' || cat === 'par') return this.react('nod');
    return undefined;
  }
}
