import * as THREE from 'three';
// Entry point: build the world, wire the bridge client, pairing UI, HUD and
// game, then run the frame loop. The 3D range renders behind the launch
// screen as a slow establishing shot.
import { World } from './scene/world.js';
import { BridgeClient } from './net/bridgeClient.js';
import { PairingUI } from './ui/pairing.js';
import { HUD } from './ui/hud.js';
import { PiasaMascot } from './ui/mascot.js';
import { Game } from './game/game.js';
import { store } from './data/store.js';
import { audio } from './audio/audio.js';
import { $ } from './ui/dom.js';
import { launchIn } from './ui/motion.js';
import { mountLogo, dropIn, roll, logos } from './ui/logo.js';

// ?maxdt=0.25 lets slow (software-rendered) test runs keep real-time playback.
const PARAMS = new URLSearchParams(location.search);
const MAX_DT = Number(PARAMS.get('maxdt')) || 0.05;
const MANUAL = PARAMS.has('manual');

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch { return false; }
}

function fail(msg) {
  const l = $('#loading');
  l.innerHTML = `<div class="webgl-error"><h2>Can't light the range</h2><p>${msg}</p></div>`;
}

// models and textures in flight (three's default loading manager), so the intro can wait for quiet
let _loads = 0;
{
  const M = THREE.DefaultLoadingManager, start = M.itemStart.bind(M), end = M.itemEnd.bind(M), err = M.itemError.bind(M);
  M.itemStart = (u) => { _loads++; start(u); };
  M.itemEnd = (u) => { _loads = Math.max(0, _loads - 1); end(u); };
  M.itemError = (u) => { _loads = Math.max(0, _loads - 1); err(u); };
}
const pendingLoads = () => _loads;

async function boot() {
  if (!webglAvailable()) {
    fail('This browser or device does not support WebGL 2. Try a current Chrome, Edge, Safari or Firefox with hardware acceleration on.');
    return;
  }

  // the wordmark: rolling ball while the world builds, the HUD corner, the launch screen
  logos.loading = await mountLogo($('#loadingLogo'), 'full');
  const stopRoll = roll(logos.loading);
  mountLogo($('#brandLogo'), 'word', 'Fairway').then((h) => { logos.hud = h; });
  const launchLogo = mountLogo($('#launchLogo'), 'full', 'Fairway Golf Sim').then((h) => (logos.launch = h));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); // let the loader paint first

  let world;
  try {
    world = new World($('#scene'), store.settings.quality);
  } catch (e) {
    console.error(e);
    fail(`The 3D scene failed to start: ${e.message}`);
    return;
  }
  world.rig.showcase();
  audio.volume = store.settings.volume;
  audio.ambienceLevel = store.settings.ambience;

  // When the bridge itself served this page, its WebSocket is on the same port.
  const sameOrigin = location.protocol.startsWith('http') && location.host ? `ws://${location.host}` : null;
  const fallbacks = store.settings.bridgeUrl === 'ws://localhost:8765' && sameOrigin ? [sameOrigin] : [];
  const client = new BridgeClient(sameOrigin && fallbacks.length ? sameOrigin : store.settings.bridgeUrl,
    fallbacks.length ? [store.settings.bridgeUrl] : []);
  let game;
  const pairing = new PairingUI(client, { onEnterGame: (how) => game.start(how) });
  const hud = new HUD({ onClub: (id) => game.selectClub(id), onBag: () => import('./ui/proShop.js').then((m) => m.openProShop(game)) });
  const piasa = new PiasaMascot($('#piasaMascot'));
  game = new Game(world, hud, client, pairing, piasa);
  window.__game = game;

  // Quietly check whether a bridge is already running so the launch screen
  // can say so (no pairing is started until the player asks).
  client.open(3000).then((ok) => {
    const hint = $('#bridgeHelpButton');
    if (ok) {
      const ready = client.state === 'ready';
      hint.textContent = ready ? 'R10 bridge detected · device already connected' : `R10 bridge detected on ${client.url.replace('ws://', '')}`;
      hint.style.color = 'rgba(95,227,154,0.85)';
    }
  });

  // The reveal, staged the way a polished game stages it: every shader compiled and the frame time settled
  // behind the loader first, then the 3D view holds still under the launch screen while the wordmark plays,
  // so the drop and its bounces get the whole frame budget (a smooth 60 instead of hitching on first draws).
  const dts = [];
  let holdUntil = 0;
  // the launch screen's backdrop draws light; full quality returns as soon as play starts
  const launchEl = $('#launch');
  world.r.setBackdrop(launchEl.dataset.visible === 'true');
  new MutationObserver(() => world.r.setBackdrop(launchEl.dataset.visible === 'true')).observe(launchEl, { attributes: true, attributeFilter: ['data-visible'] });
  const reveal = async () => {
    const t0 = performance.now();
    // nothing still downloading or parsing (a model landing mid-drop costs a few hundred ms), up to 5 s
    await new Promise((res) => {
      const idle = () => (pendingLoads() === 0 || performance.now() - t0 > 5000 ? res() : setTimeout(idle, 100));
      idle();
    });
    try { await world.r.renderer.compileAsync(world.scene, world.camera); } catch { /* compile as it draws */ }
    await new Promise((res) => {
      const check = () => {
        const recent = dts.slice(-10);
        if ((recent.length === 10 && recent.every((d) => d < 24)) || performance.now() - t0 > 6500) res();
        else requestAnimationFrame(check);
      };
      check();
    });
    $('#loading').classList.add('done');
    stopRoll();
    if ($('#launch').dataset.visible === 'true') {
      holdUntil = Infinity;
      launchIn($('#launch'));
      launchLogo.then((h) => dropIn(h, 0.45));
      // once the drop has played, compile whatever arrived during the hold (models, trees) before the view
      // moves again, so resuming doesn't hitch either
      setTimeout(async () => {
        try { await world.r.renderer.compileAsync(world.scene, world.camera); } catch { /* fine */ }
        holdUntil = 0;
      }, 2500);
    }
  };

  // Frame loop
  let last = performance.now();
  let firstFrame = true;
  const frame = (now) => {
    // game.timeScale: slow motion for a moment (js/ui/moments.js)
    const raw = now - last;
    const dt = Math.min(MAX_DT, raw / 1000) * (game.timeScale ?? 1);
    last = now;
    if (dts.length < 400) dts.push(raw);
    const ballPos = game.update(dt);
    const playT = game.shot ? game.shot.t : 0;
    world.update(dt, ballPos, playT, now >= holdUntil);
    if (firstFrame) { firstFrame = false; reveal(); }
    requestAnimationFrame(frame);
  };
  if (MANUAL) {
    // Test harness: advance the simulation in fixed steps, render once.
    window.__advance = (seconds, step = 1 / 60) => {
      const n = Math.max(1, Math.round(seconds / step));
      for (let i = 0; i < n; i++) {
        const ballPos = game.update(step);
        world.update(step, ballPos, game.shot ? game.shot.t : 0, i === n - 1);
      }
      $('#loading').classList.add('done');
    };
    window.__advance(0.1);
  } else {
    requestAnimationFrame(frame);
  }

  // Dev / kiosk shortcut: ?play=<course>[&hole=n][&day] skips the launch
  // screen straight into demo mode on that hole.
  if (PARAMS.has('play')) {
    const { loadCourse } = await import('./course/courses.js');
    const c = await loadCourse(PARAMS.get('play'));
    pairing.enterGame('demo');
    if (PARAMS.has('day')) world.env.setTime('day', true);
    const h = Math.max(1, Math.min(c.holes.length, Number(PARAMS.get('hole')) || 1));
    game.setMode('course', { course: c, length: PARAMS.has('hole') ? 1 : Math.min(9, c.holes.length), startHole: h, rings: store.settings.rings || 'putt', gimme: store.settings.gimme, mulligans: 'nine' });
  }

  // ?range[&day]: straight onto the driving range in demo mode
  if (PARAMS.has('range')) {
    pairing.enterGame('demo');
    if (PARAMS.has('day')) world.env.setTime('day', true);
    game.setMode('range');
  }

  // Resume audio after tab switches
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  });
}

boot();
