// Entry point: build the world, wire the bridge client, pairing UI, HUD and
// game, then run the frame loop. The 3D range renders behind the launch
// screen as a slow establishing shot.
import { World } from './scene/world.js';
import { BridgeClient } from './net/bridgeClient.js';
import { PairingUI } from './ui/pairing.js';
import { HUD } from './ui/hud.js';
import { Game } from './game/game.js';
import { store } from './data/store.js';
import { audio } from './audio/audio.js';
import { $ } from './ui/dom.js';

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

async function boot() {
  if (!webglAvailable()) {
    fail('This browser or device does not support WebGL 2. Try a current Chrome, Edge, Safari or Firefox with hardware acceleration on.');
    return;
  }

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

  const client = new BridgeClient(store.settings.bridgeUrl);
  let game;
  const pairing = new PairingUI(client, { onEnterGame: (how) => game.start(how) });
  const hud = new HUD({ onClub: (id) => game.selectClub(id) });
  game = new Game(world, hud, client, pairing);
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

  // Frame loop
  let last = performance.now();
  let firstFrame = true;
  const frame = (now) => {
    const dt = Math.min(MAX_DT, (now - last) / 1000);
    last = now;
    const ballPos = game.update(dt);
    const playT = game.shot ? game.shot.t : 0;
    world.update(dt, ballPos, playT);
    if (firstFrame) {
      firstFrame = false;
      setTimeout(() => $('#loading').classList.add('done'), 250);
    }
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

  // Resume audio after tab switches
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  });
}

boot();
