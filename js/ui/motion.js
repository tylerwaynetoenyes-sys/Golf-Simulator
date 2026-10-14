// Interface motion (docs/design-direction.md): fast in, soft out, nothing
// bounces. GSAP is loaded as a classic script (vendor/gsap); without it, or
// with reduced motion asked for, everything simply appears.
const G = typeof window !== 'undefined' ? window.gsap : null;
const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const on = () => !!G && !reduced.matches;

/** Wrap each word of an element's text in a mask so it can rise into view. */
export function splitWords(el) {
  if (!el) return [];
  const words = (el.textContent || '').split(/(\s+)/);
  el.textContent = '';
  const inner = [];
  for (const w of words) {
    if (!w) continue;
    if (/^\s+$/.test(w)) { el.append(document.createTextNode(w)); continue; }
    const m = document.createElement('span');
    m.className = 'mask';
    const s = document.createElement('span');
    s.textContent = w;
    m.append(s);
    el.append(m);
    inner.push(s);
  }
  return inner;
}

/** A panel opens: its rows rise 12px and fade in, 30 ms apart. */
export function panelIn(root) {
  if (!on() || !root) return;
  const rows = [...root.children].filter((c) => !c.classList.contains('sheet-close'));
  const flat = rows.length === 1 ? [...rows[0].children] : rows;
  G.killTweensOf(flat);
  G.from(flat, { y: 12, opacity: 0, duration: 0.5, ease: 'power3.out', stagger: 0.03, clearProps: 'transform,opacity' });
}

/** The hole intro card: number, then the name word by word, the rule, the facts. */
export function holeCardIn(el) {
  if (!on() || !el) return;
  const words = splitWords(el.querySelector('.hc-name'));
  const tl = G.timeline({ defaults: { ease: 'expo.out' } });
  tl.from(el.querySelector('.hc-num'), { yPercent: 40, opacity: 0, duration: 0.7 }, 0.05)
    .from(el.querySelector('.hc-kicker'), { opacity: 0, x: -8, duration: 0.5 }, 0.12)
    .from(words, { yPercent: 110, duration: 0.6, stagger: 0.05 }, 0.16)
    .from(el.querySelector('.rule'), { scaleX: 0, duration: 0.8, ease: 'power3.inOut' }, 0.3)
    .from(el.querySelectorAll('.hc-stats > *, .hc-note, .hc-rings, .hc-rules, .hc-skip'), { opacity: 0, y: 6, duration: 0.45, stagger: 0.05, ease: 'power3.out' }, 0.42);
}

/** The hole curtain: the number rises behind its mask, the name follows, a rule draws. */
export function wipeIn(el) {
  if (!on() || !el) return;
  const num = el.querySelector('#hwNum');
  const words = splitWords(el.querySelector('#hwName'));
  G.timeline({ defaults: { ease: 'expo.out' } })
    .from(el.querySelector('#hwCourse'), { opacity: 0, letterSpacing: '0.5em', duration: 0.6 }, 0)
    .from(num, { yPercent: 30, opacity: 0, duration: 0.6 }, 0.04)
    .from(words, { yPercent: 110, duration: 0.5, stagger: 0.04 }, 0.12)
    .from(el.querySelector('.rule'), { scaleX: 0, duration: 0.55, ease: 'power3.inOut' }, 0.16);
}

/** Launch screen: logo settles, rule draws, line and actions follow. */
export function launchIn(root) {
  if (!on() || !root) return;
  G.timeline({ defaults: { ease: 'expo.out' } })
    .from(root.querySelector('.launch-title img'), { opacity: 0, y: 14, scale: 0.985, filter: 'blur(6px)', duration: 1.4, clearProps: 'filter' }, 0.1)
    .from(root.querySelector('.rule'), { scaleX: 0, duration: 1, ease: 'power3.inOut' }, 0.5)
    .from(root.querySelector('.launch-tag'), { opacity: 0, letterSpacing: '0.4em', duration: 1.1 }, 0.6)
    .from(root.querySelectorAll('.launch-actions > *, .launch-inner > .link-btn, .launch-foot'), { opacity: 0, y: 10, duration: 0.7, stagger: 0.07, ease: 'power3.out', clearProps: 'transform,opacity' }, 0.8);
}

/** A number rolls to its value (used for totals; the shot card has its own). */
export function countTo(el, to, { digits = 0, duration = 0.9, from = 0 } = {}) {
  if (!el) return;
  const target = Number(to);
  if (!on() || !Number.isFinite(target)) { el.textContent = Number.isFinite(target) ? target.toFixed(digits) : to; return; }
  const o = { v: from };
  G.to(o, { v: target, duration, ease: 'power3.out', onUpdate: () => { el.textContent = o.v.toFixed(digits); } });
}

export const motionOn = on;
