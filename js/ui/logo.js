// The Fairway wordmark: ivory FAIRWAY, the I a full letter with an orange
// flagstick set through it, the player's orange ball on top of the pole and a
// pennant that flies. Built by tools/brand/build-wordmark.py. Motions, all GSAP:
//   dropIn(h)   the pennant unfurls, the ball drops onto the pole and bounces (launch)
//   roll(h)     the ball spins on the pole while something loads, the flag ripples; returns stop()
//   gold(h)     hole-out: the ball hops and rattles, turns achievement gold, a ring pulses, the flag snaps
// Reduced motion (or no GSAP) shows the end state without movement.
const G = typeof window !== 'undefined' ? window.gsap : null;
const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const animate = () => !!G && !reduced.matches;

const BX = 1801, BY = 566, BR = 80, STEP = BR * 0.25; // the ball, in the wordmark's own units
const ORANGE = '#ff7a2f', DIM = '#a9461a', GOLD = '#e9c97a', GOLD_DIM = '#9a7a2c';
const cache = {};
let uid = 0;
/** Live handles by place: hud, launch, loading (set in main.js). */
export const logos = {};

/** Inline the wordmark into `el`. variant: 'full' (with GOLF SIM) or 'word'. */
export async function mountLogo(el, variant = 'full', label) {
  if (!el) return null;
  const url = `assets/brand/fairway-wordmark${variant === 'word' ? '-word' : ''}.svg`;
  cache[url] ??= fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status))));
  const n = ++uid;
  try {
    // each inline copy needs its own clip and gradient ids
    el.innerHTML = (await cache[url]).replace(/__/g, `_${n}`);
  } catch (e) {
    console.warn('wordmark did not load', e);
    return null;
  }
  const svg = el.querySelector('svg');
  if (label) svg.setAttribute('aria-label', label);
  const q = (c) => svg.querySelector(c);
  const h = { svg, ball: q('.fw-ball'), fill: q('.fw-ball-fill'), dim: q('.fw-dimples'), ring: q('.fw-ring'), pen: q('.fw-pennant'), wrap: q('.fw-wordwrap'), tl: null, flag: null };
  if (G) {
    G.set(h.ball, { svgOrigin: `${BX} ${BY + BR}` });
    G.set(h.pen, { transformOrigin: '0% 50%' }); // the pennant flies from its hoist
  }
  return h;
}

function reset(h) {
  if (h.tl) h.tl.kill();
  if (h.flag) h.flag.kill();
  G.killTweensOf([h.ball, h.dim, h.fill, h.ring, h.pen]);
  G.set(h.ball, { x: 0, y: 0, scaleX: 1, scaleY: 1 });
  G.set(h.dim, { x: 0 });
  G.set(h.ring, { opacity: 0, attr: { r: BR } });
  G.set(h.pen, { skewY: 0, scaleX: 1, scaleY: 1 });
}

function land(tl, h, at, k) {
  tl.to(h.ball, { scaleY: 1 - 0.14 * k, scaleX: 1 + 0.1 * k, duration: 0.06, ease: 'power2.out' }, at)
    .to(h.ball, { scaleY: 1, scaleX: 1, duration: 0.14, ease: 'power2.out' }, at + 0.06);
}

/** The pennant in the wind: amp 1 is a breeze, higher snaps; period is one swing. */
function fly(h, amp = 1, period = 1) {
  if (h.flag) h.flag.kill();
  h.flag = G.to(h.pen, { skewY: 4 * amp, scaleX: 0.96, scaleY: 1.03, duration: period, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  return h.flag;
}

/** Launch: the pennant unfurls, the ball drops onto the pole, lands, bounces twice (restitution about 0.5). */
export function dropIn(h, delay = 0) {
  if (!h || !animate()) return null;
  reset(h);
  const tl = G.timeline({ delay });
  h.tl = tl;
  tl.from(h.pen, { scaleX: 0, duration: 0.7, ease: 'back.out(1.6)' }, 0)
    .set(h.ball, { y: -1400 }, 0)
    .to(h.ball, { y: 0, duration: 0.55, ease: 'power2.in' }, 0.35)
    .to(h.dim, { x: STEP * 2, duration: 0.55, ease: 'power1.in' }, 0.35);
  land(tl, h, 0.9, 1);
  tl.to(h.ball, { y: -110, duration: 0.25, ease: 'power2.out' }, 0.96).to(h.ball, { y: 0, duration: 0.25, ease: 'power2.in' }, 1.21);
  land(tl, h, 1.46, 0.5);
  tl.to(h.ball, { y: -26, duration: 0.12, ease: 'power2.out' }, 1.52).to(h.ball, { y: 0, duration: 0.12, ease: 'power2.in' }, 1.64)
    .add(() => fly(h, 0.6, 1.1), 0.75);
  return tl;
}

/** Loading: the ball spins on the pole (the dimples scroll), the flag ripples. Returns stop(). */
export function roll(h) {
  if (!h || !animate()) return () => {};
  reset(h);
  const a = G.to(h.dim, { x: STEP, duration: 0.3, ease: 'none', repeat: -1 });
  fly(h, 0.8, 0.7);
  return () => { a.kill(); if (h.flag) h.flag.kill(); G.to(h.pen, { skewY: 0, scaleX: 1, scaleY: 1, duration: 0.3 }); };
}

/** Hole-out (birdie or better): hop, rattle, gold, a ring, the flag snaps; back to orange after `hold` seconds. */
export function gold(h, { hold = 2.6, big = false } = {}) {
  if (!h) return;
  if (!animate()) {
    h.fill.setAttribute('fill', GOLD); h.dim.setAttribute('fill', GOLD_DIM);
    setTimeout(() => { h.fill.setAttribute('fill', ORANGE); h.dim.setAttribute('fill', DIM); }, hold * 1000);
    return;
  }
  reset(h);
  const tl = G.timeline();
  h.tl = tl;
  tl.to(h.ball, { y: -260, duration: 0.26, ease: 'power2.out' }, 0).to(h.ball, { y: 0, duration: 0.26, ease: 'power2.in' }, 0.26);
  land(tl, h, 0.52, 1);
  tl.to(h.ball, { keyframes: [{ x: 16 }, { x: -12 }, { x: 7 }, { x: -3 }, { x: 0 }], duration: 0.42, ease: 'sine.inOut' }, 0.58) // the rattle
    .to(h.fill, { attr: { fill: GOLD }, duration: 0.35, ease: 'power1.out' }, 0.95)
    .to(h.dim, { attr: { fill: GOLD_DIM }, duration: 0.35 }, 0.95)
    .fromTo(h.ring, { opacity: 1, attr: { r: BR, 'stroke-width': 12 } }, { opacity: 0, attr: { r: BR * (big ? 3.2 : 2.6), 'stroke-width': 2 }, duration: big ? 1.4 : 1.1, ease: 'expo.out' }, 0.95)
    .to(h.pen, { skewY: 6, scaleX: 0.94, duration: 0.22, ease: 'sine.inOut', yoyo: true, repeat: 7 }, 0.9);  // the flag snaps
  if (big) tl.fromTo(h.ring, { opacity: 1, attr: { r: BR, 'stroke-width': 10 } }, { opacity: 0, attr: { r: BR * 2.4, 'stroke-width': 2 }, duration: 1.1, ease: 'expo.out', immediateRender: false }, 1.35);
  tl.to(h.fill, { attr: { fill: ORANGE }, duration: 0.6 }, 0.95 + hold)
    .to(h.dim, { attr: { fill: DIM }, duration: 0.6 }, 0.95 + hold)
    .to(h.pen, { skewY: 0, scaleX: 1, duration: 0.4 }, 0.95 + hold);
}
