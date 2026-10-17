// Moments: the payoffs, scaled to what happened, in the game's own restrained
// language (Jost display type, a thin gold rule as the one flourish, motion
// that is fast in and soft out, transform and opacity only). Settings → Effects
// → Moments turns all of them off; reduced motion drops the movement and keeps
// the information. Every moment is short and never blocks play.
//
//   holeOut(game, {level, ace, eagle, cup})   birdie < eagle < ace
//   notable(game, kind, {...})                long drive, stiff approach, lip-out
//   roundEnd(game, summary, open)             crane up, the winner, then the card
//
// Timing (from docs/RESEARCH_UPGRADES.md §5): banners 0.6–0.9 s in, held, 0.5 s
// out; slow motion eases from 0.35× back to 1× over about 1.2 s; camera moves
// 2.5–4 s on the rig's own spline.
import * as THREE from 'three';
import { store } from '../data/store.js';
import { splitWords } from './motion.js';

const G = typeof window !== 'undefined' ? window.gsap : null;
const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const enabled = () => store.settings.moments !== false;
const animate = () => !!G && !reduced.matches;

/** Time slows (the frame loop multiplies dt by game.timeScale), then recovers. */
function slowMo(game, to = 0.35, hold = 0.25, back = 1.1) {
  if (!animate()) return;
  G.killTweensOf(game, 'timeScale');
  game.timeScale = to;
  G.to(game, { timeScale: 1, duration: back, delay: hold, ease: 'power2.inOut' });
}

/** The renderer's bloom lifts and settles: a little light in the moment. */
function bloomLift(game, k = 1.6, dur = 2.2) {
  const b = game.world?.r?.bloom;
  if (!b || !animate()) return;
  const base = b._baseStrength ?? (b._baseStrength = b.strength);
  G.killTweensOf(b);
  b.strength = base * k;
  G.to(b, { strength: base, duration: dur, ease: 'power2.out' });
}

/** A centred banner: kicker, the title word by word, a gold rule drawing, a sub-line. */
function banner({ kicker = '', title, sub = '', size = 'm', ms = 2600 }) {
  let el = document.getElementById('momentBanner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'momentBanner';
    el.className = 'moment-banner';
    el.innerHTML = '<div class="mb-kicker"></div><div class="mb-title"></div><div class="mb-rule"></div><div class="mb-sub"></div>';
    document.getElementById('hud')?.appendChild(el) || document.body.appendChild(el);
  }
  el.dataset.size = size;
  el.querySelector('.mb-kicker').textContent = kicker;
  el.querySelector('.mb-title').textContent = title;
  el.querySelector('.mb-sub').textContent = sub;
  if (G) G.killTweensOf(el);
  el.style.opacity = '1';
  if (animate()) {
    const words = splitWords(el.querySelector('.mb-title'));
    G.timeline({ defaults: { ease: 'expo.out' } })
      .fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.25 }, 0)
      .from(el.querySelector('.mb-kicker'), { opacity: 0, letterSpacing: '0.5em', duration: 0.7 }, 0)
      .from(words, { yPercent: 110, duration: 0.7, stagger: 0.06 }, 0.06)
      .fromTo(el.querySelector('.mb-rule'), { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: 'power3.inOut' }, 0.2)
      .from(el.querySelector('.mb-sub'), { opacity: 0, y: 6, duration: 0.5 }, 0.45)
      .to(el, { opacity: 0, duration: 0.5, ease: 'power2.in' }, ms / 1000);
  } else {
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, ms);
  }
}

/**
 * The ball drops. Birdie: the hole-out banner and a gold ring (game.js already
 * does those). Eagle: the camera pushes in on the cup, a second ring. Ace: slow
 * motion as it drops, the light lifts, the course's name in display type.
 */
export function holeOut(game, { level, ace = false, eagle = false, cup = null, holeName = '' }) {
  if (!enabled()) return;
  const w = game.world;
  if (ace || eagle) {
    if (cup) {
      // a slow push in on the cup from wherever the camera is
      const V = THREE.Vector3, cam = w.camera.position.clone();
      const to = new V(cup.x, cup.y, cup.z);
      const dir = cam.clone().sub(to); dir.y = 0; dir.normalize();
      const end = to.clone().add(dir.multiplyScalar(ace ? 2.2 : 3.2)); end.y = cup.y + (ace ? 0.55 : 0.8);
      w.rig.flyover([{ pos: cam, look: to.clone().setY(cup.y + 0.1) }, { pos: end, look: to.clone().setY(cup.y + 0.02) }], ace ? 3.6 : 2.6, null, { toAddress: false, fov: 40, easeIn: 0.4, easeOut: 1.4 });
      w.effects.ring(cup.x, cup.y + 0.01, cup.z, 0xe9c97a, ace ? 9 : 6, ace ? 2.4 : 1.8);
    }
    bloomLift(game, ace ? 1.9 : 1.35, ace ? 3 : 2);
  }
  if (ace) {
    slowMo(game, 0.3, 0.35, 1.4);
    setTimeout(() => banner({ kicker: holeName, title: 'Hole in one', size: 'xl', ms: 3600 }), 700);
  }
}

/**
 * Notable shots, while the ball is still settling: a long drive's distance
 * counted up, a stiff approach, a lip-out caught in slow motion.
 */
export function notable(game, kind, info = {}) {
  if (!enabled()) return;
  if (kind === 'longDrive') {
    banner({ kicker: info.best ? 'Personal best' : 'Long drive', title: info.text, sub: info.sub || '', size: 'l', ms: 2600 });
  } else if (kind === 'stiff') {
    banner({ kicker: 'Stiff', title: info.text, sub: info.sub || '', size: 's', ms: 2000 });
    if (info.at) game.world.effects.ring(info.at.x, info.at.y + 0.01, info.at.z, 0xe9c97a, 3, 1.4);
  } else if (kind === 'lip') {
    slowMo(game, 0.4, 0.2, 0.8);
    banner({ kicker: '', title: 'Lip out', size: 's', ms: 1800 });
  }
}

/**
 * [wildlife] The ball has stopped beside an alligator (js/course/wildlife.js,
 * rare, once a hole at most): the camera drops to a low look along the bank at
 * the animal and the ball while it lifts its head and slides off, then play
 * goes on. Returns true when it ran.
 */
export function wildlife(game, { kind, at, ball }) {
  if (!enabled() || kind !== 'gator') return false;
  const w = game.world;
  const V = THREE.Vector3;
  const A = new V(at.x, at.y, at.z), B = new V(ball.x, ball.y, ball.z);
  const mid = A.clone().lerp(B, 0.4);
  // across the line from the gator to the ball, on the camera's side, low to the ground
  const ab = B.clone().sub(A); ab.y = 0;
  const span = Math.max(4, ab.length());
  ab.normalize();
  const side = new V(-ab.z, 0, ab.x);
  const cam = w.camera.position.clone();
  if (side.dot(cam.clone().sub(mid)) < 0) side.negate();
  const end = mid.clone().add(side.multiplyScalar(span + 4.5)).add(ab.clone().multiplyScalar(-1.5));
  end.y = (w.course.groundAt?.(end.x, end.z) ?? mid.y) + 1.1;
  const look = mid.clone(); look.y += 0.35;
  if (animate()) {
    const from = new V(); w.camera.getWorldDirection(from);
    w.rig.flyover([{ pos: cam, look: cam.clone().add(from.multiplyScalar(20)) }, { pos: end, look }], 1.6, null, { toAddress: false, fov: 38, easeIn: 0.3, easeOut: 1.0 });
  }
  setTimeout(() => banner({ kicker: 'Wildlife', title: 'American alligator', sub: 'Keep your distance', size: 's', ms: 2200 }), animate() ? 900 : 0);
  return true;
}

/**
 * The round ends: the camera cranes up and back from the last green over the
 * course, the winner's name and score rise over it with the gold rule, then the
 * summary card opens with its rows staggering in (motion.panelIn).
 */
export function roundEnd(game, summary, open) {
  if (!enabled()) { open(); return; }
  const w = game.world;
  const cam = w.camera.position.clone();
  const look = new THREE.Vector3();
  w.camera.getWorldDirection(look);
  const fwd = new THREE.Vector3(look.x, 0, look.z).normalize();
  const target = cam.clone().add(fwd.clone().multiplyScalar(30));
  const up = cam.clone().add(fwd.clone().multiplyScalar(-55)).add(new THREE.Vector3(0, 42, 0));
  if (animate()) w.rig.flyover([{ pos: cam, look: target }, { pos: up, look: target.clone().add(fwd.clone().multiplyScalar(60)) }], 4.2, null, { toAddress: false, fov: 46, easeIn: 0.8, easeOut: 2.2 });
  const winner = summary.teams?.[0] || summary.rows?.[0];
  const name = winner ? String(winner.name || winner.label || '').replace(/^\d+\.\s*/, '') : '';
  banner({ kicker: summary.title || 'Round complete', title: name && (summary.rows?.length > 1 || summary.teams?.length > 1) ? name : summary.score, sub: name ? `${summary.score}${summary.scoreLabel ? ` · ${summary.scoreLabel}` : ''}` : summary.scoreLabel || '', size: 'xl', ms: 2600 });
  setTimeout(open, animate() ? 2900 : 0);
}
