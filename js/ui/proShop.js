// The pro shop: choose a bag and a ball the way you would in a shop, looking at the
// real things. A small studio stage renders the set's own modelled heads (the same
// Blender models that swing in the game: tools/equipment, assets/models/clubs) and
// the balls (assets/models/balls) under softbox light, turning slowly on a dark
// plinth; brand cards, the bag's clubs and what the heads do sit round it.
// Design: docs/design-direction.md (graphite glass, one orange accent, Jost caps
// labels, expo.out entrances, reduced motion collapses to a fade).
import * as THREE from 'three';
import { SETS, BALLS, CATALOGUE, headById } from '../data/equipment.js';
import { loadEquipment } from '../scene/models.js';
import { openPanel } from './panels.js';
import { motionOn, countTo } from './motion.js';
import { audio } from '../audio/audio.js';
import { store } from '../data/store.js';

const G = typeof window !== 'undefined' ? window.gsap : null;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const headPath = (set, id) => (set.hockey ? 'clubs/hockey/HOCKEY.glb' : `clubs/${set.id}/${id}.glb`);

// the three heads that say what a bag is: its driver, a mid iron, its highest-lofted wedge
function heroClubs(set) {
  const bag = set.bag;
  const wood = bag.find((c) => /^DR/.test(c)) || bag[0];
  const iron = ['7I', '6I', '8I', '5I'].find((c) => bag.includes(c)) || bag[Math.floor(bag.length / 2)];
  const wedge = [...bag].reverse().find((c) => /W$/.test(c) && !/^\dW$/.test(c)) || bag[bag.length - 1];
  return set.hockey ? [wood] : [wood, iron, wedge];
}

// 0..1 ratings from the head data, for the bars
function ratings(set) {
  const d = headById('driver', set.driverHead) || {}, i = headById('iron', set.ironHead) || {};
  const f = ((d.forgive ?? 1) + (i.forgive ?? 1)) / 2, w = ((d.work ?? 1) + (i.work ?? 1)) / 2;
  const l = ((d.launch ?? 0) + (i.launch ?? 0)) / 2 + (set.ironLofts || 0) * 0.3;
  return [
    ['Forgiveness', (f - 0.55) / 0.85],
    ['Workability', (w - 0.75) / 0.5],
    ['Launch', (l + 0.8) / 2.6],
  ].map(([k, v]) => [k, Math.max(0.06, Math.min(1, v))]);
}
function ballRatings(b) {
  const spin = (b.spinK[2] - 0.7) / 0.35, feel = 1 - (b.comp - 40) / 60, dist = 1 - b.speedLoss * 8 - (b.cd - 1) * 2;
  return [['Greenside spin', spin], ['Feel', feel], ['Distance', dist]].map(([k, v]) => [k, Math.max(0.06, Math.min(1, v))]);
}

// ── the studio ───────────────────────────────────────────────────────────────
function studioEnv(renderer) {
  // a dark room with three softboxes (key, rim, a long strip overhead), for the reflections
  const room = new THREE.Scene();
  room.background = new THREE.Color(0x0d0f12);
  const box = (w, h, x, y, z, k, tint = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); room.add(m);
  };
  box(3, 2, -3, 2.5, -3, 6);            // key, front left
  box(1, 4, 4, 1.5, 2, 4, 0xffe2c4);    // warm rim, behind right
  box(6, 0.6, 0, 5, 0, 3);              // strip overhead
  box(2, 1, 0, -2, -3, 0.6, 0xff7a2f);  // a whisper of the brand orange from below
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(room, 0.02).texture;
  pm.dispose();
  return env;
}

class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.35;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.environment = studioEnv(r);
    this.camera = new THREE.PerspectiveCamera(24, 2, 0.01, 10);
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(-0.5, 1.2, -0.8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -0.4, right: 0.4, top: 0.4, bottom: -0.4, near: 0.1, far: 3 });
    key.shadow.radius = 6;
    const rim = new THREE.DirectionalLight(0xffe2c4, 1.6);
    rim.position.set(0.8, 0.6, 0.9);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x202428, 0.6));
    // the plinth: catches the heads' shadows
    // (shadow only, so the stage's own gradient and the brand's ghosted name show through)
    const plinth = new THREE.Mesh(new THREE.CircleGeometry(0.6, 96).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.55 }));
    plinth.receiveShadow = true;
    this.scene.add(plinth);
    this.turn = new THREE.Group();
    this.scene.add(this.turn);
    this.items = [];
    this.focus = -1;
    this.t0 = performance.now();
    this.spin = motionOn() ? 1 : 0;
    this._frame = this._frame.bind(this);
    this._ro = new ResizeObserver(() => this._size());
    this._ro.observe(canvas);
    this._size();
    this.raf = requestAnimationFrame(this._frame);
    // drag to turn it yourself
    let dx = null;
    canvas.addEventListener('pointerdown', (e) => { dx = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (dx == null) return; this.turn.rotation.y += (e.clientX - dx) * 0.01; dx = e.clientX; this.t0 = performance.now(); });
    canvas.addEventListener('pointerup', () => { dx = null; });
  }

  _size() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Show these models (each {obj, label}) side by side, sat on the plinth. */
  show(objs, { span = 0.17, dist = 0.62, height = 0.05 } = {}) {
    for (const it of this.items) this.turn.remove(it.holder);
    this.items = [];
    const n = objs.length;
    objs.forEach((o, i) => {
      const holder = new THREE.Group();
      const obj = o.obj;
      obj.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      const bb = new THREE.Box3().setFromObject(obj), c = bb.getCenter(new THREE.Vector3());
      obj.position.set(-c.x, -bb.min.y, -c.z);
      holder.add(obj);
      holder.position.x = -(i - (n - 1) / 2) * span; // the camera looks down +z, so +x is screen left
      holder.userData.phase = i * 0.7;
      holder.userData.lift = o.lift || 0;
      this.turn.add(holder);
      this.items.push({ holder });
      if (G && motionOn()) G.from(holder.position, { y: -0.06, duration: 0.9, ease: 'expo.out', delay: 0.06 * i });
      if (G && motionOn()) G.from(holder.scale, { x: 0.85, y: 0.85, z: 0.85, duration: 0.9, ease: 'expo.out', delay: 0.06 * i });
    });
    this.camera.position.set(0, height + dist * 0.32, -dist);
    this.camera.lookAt(0, height * 0.55, 0);
  }

  _frame(now) {
    this.raf = requestAnimationFrame(this._frame);
    const t = (now - this.t0) / 1000;
    // each piece turns on its own spot, slowly, showing face, toe and back
    for (const it of this.items) {
      const h = it.holder;
      h.rotation.y = this.spin * (Math.PI + Math.sin(t * 0.45 + h.userData.phase) * 0.9) + (this.spin ? 0 : Math.PI * 0.8);
      h.position.y = h.userData.lift + (this.spin ? Math.sin(t * 0.8 + h.userData.phase) * 0.002 : 0);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this._ro.disconnect();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}

// ── the panel ────────────────────────────────────────────────────────────────
/**
 * @param game   the Game (applySetting, store settings)
 * @param opts   {tab: 'clubs'|'ball', player, then: () => void}  `player`: whose bag (default: whoever is up);
 *               `then` runs when it closes
 */
export function openProShop(game, { tab = 'clubs', player = null, then } = {}) {
  const who = player || game.player || game.roster?.players[0] || null;
  const multi = !!game.roster?.multi;
  const g = game.roster && who ? game.roster.gearOf(who) : { clubSet: store.settings.clubSet, ball: store.settings.ball };
  let setId = g.clubSet || 'cavity', ballId = g.ball || 'tour', view = tab;
  let stage = null;
  const el = openPanel(`
    <button class="sheet-close" data-close aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    <div class="ps">
      <header class="ps-head">
        <div><div class="ps-kicker">Pro shop${multi && who ? ` · <span class="ps-who" style="--pc:${who.color}">${esc(who.name)}</span>` : ''}</div><h2 class="ps-title">Choose your bag</h2></div>
        <div class="ps-tabs" role="tablist"><button role="tab" data-tab="clubs">Clubs</button><button role="tab" data-tab="ball">Ball</button><i class="ps-tab-ink"></i></div>
      </header>
      <div class="ps-stage">
        <div class="ps-ghost" aria-hidden="true"></div>
        <canvas class="ps-canvas" aria-label="The selected equipment, in 3D"></canvas>
        <div class="ps-caption"><span class="ps-cap-l"></span><span class="ps-cap-r">Drag to turn</span></div>
      </div>
      <div class="ps-body">
        <div class="ps-info">
          <div class="ps-brand"></div>
          <div class="ps-model"></div>
          <p class="ps-blurb"></p>
          <div class="ps-bars"></div>
          <div class="ps-chips"></div>
        </div>
        <div class="ps-rail" role="listbox"></div>
      </div>
      <div class="panel-actions"><button class="btn btn-ghost" data-close>Close</button><button class="btn btn-primary ps-use">Play this bag</button></div>
    </div>`, { wide: true, onClosed: () => { stage?.dispose(); stage = null; then?.(); } });

  const $ = (q) => el.querySelector(q);
  try { stage = new Stage($('.ps-canvas')); } catch (e) { console.warn('pro shop stage unavailable', e); }

  const rail = $('.ps-rail');
  const renderRail = () => {
    const list = view === 'clubs' ? SETS : BALLS;
    rail.innerHTML = list.map((x) => view === 'clubs'
      ? `<button class="ps-card" role="option" data-id="${x.id}" aria-selected="${x.id === setId}"><span class="ps-card-brand">${esc(x.brand)}</span><span class="ps-card-model">${esc(x.model)}</span><span class="ps-card-n">${x.bag.length} clubs</span></button>`
      : `<button class="ps-card" role="option" data-id="${x.id}" aria-selected="${x.id === ballId}"><span class="ps-card-brand">${esc(x.name)}</span><span class="ps-card-model">${esc(x.sub.split('·')[0])}</span><span class="ps-card-n">${x.comp} comp</span></button>`).join('');
    rail.querySelectorAll('.ps-card').forEach((b) => b.addEventListener('click', () => {
      audio.tick?.();
      if (view === 'clubs') setId = b.dataset.id; else ballId = b.dataset.id;
      rail.querySelectorAll('.ps-card').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      renderInfo(true);
    }));
    if (G && motionOn()) G.from(rail.children, { x: 18, opacity: 0, duration: 0.55, ease: 'expo.out', stagger: 0.035, clearProps: 'transform,opacity' });
  };

  let token = 0;
  const renderInfo = (animate) => {
    const isClubs = view === 'clubs';
    const set = SETS.find((x) => x.id === setId) || SETS[0];
    const ball = BALLS.find((x) => x.id === ballId) || BALLS[0];
    const yours = multi && who ? `${who.name}'s` : 'your';
    $('.ps-title').textContent = isClubs ? `Choose ${yours} bag` : `Choose ${yours} ball`;
    $('.ps-use').textContent = isClubs ? 'Play this bag' : 'Play this ball';
    const ghost = $('.ps-ghost');
    ghost.textContent = isClubs ? set.brand : ball.name;
    // the name as big as the stage allows, edge to edge
    ghost.style.setProperty('--ghost-size', `${Math.min(132, (ghost.parentElement.clientWidth * 0.92) / (ghost.textContent.length * 0.72))}px`);
    $('.ps-brand').textContent = isClubs ? set.brand : 'Ball';
    $('.ps-model').textContent = isClubs ? set.model : ball.name;
    $('.ps-blurb').textContent = isClubs ? set.blurb : ball.sub;
    $('.ps-bars').innerHTML = (isClubs ? ratings(set) : ballRatings(ball)).map(([k, v]) =>
      `<div class="ps-bar"><span>${k}</span><b><i style="--v:${v.toFixed(3)}"></i></b><em>${Math.round(v * 10)}</em></div>`).join('');
    $('.ps-chips').innerHTML = isClubs
      ? set.bag.map((id) => { const c = CATALOGUE.find((x) => x.id === id); return `<button class="ps-chip" data-club="${id}"><b>${esc(c?.short || id)}</b><small>${c ? c.loft + '°' : ''}</small></button>`; }).join('') + `<div class="ps-spec">${esc(set.spec)}</div>`
      : `<div class="ps-comp"><span class="ps-comp-n">0</span><small>compression</small></div>`;
    if (!isClubs) countTo($('.ps-comp-n'), ball.comp, { duration: 0.8 });
    $('.ps-cap-l').textContent = isClubs ? heroClubs(set).map((id) => CATALOGUE.find((c) => c.id === id)?.name || id).join('  ·  ') : `${ball.name} · 1.68 in`;
    if (animate && G && motionOn()) {
      G.from([$('.ps-brand'), $('.ps-model'), $('.ps-blurb')], { y: 10, opacity: 0, duration: 0.5, ease: 'expo.out', stagger: 0.04, clearProps: 'transform,opacity' });
      G.from($('.ps-ghost'), { opacity: 0, letterSpacing: '0.4em', duration: 0.9, ease: 'expo.out', clearProps: 'letterSpacing,opacity' });
      G.from(el.querySelectorAll('.ps-chip'), { opacity: 0, y: 6, duration: 0.4, stagger: 0.02, ease: 'power3.out', clearProps: 'transform,opacity' });
    }
    // the bars fill to their value
    requestAnimationFrame(() => el.querySelectorAll('.ps-bar i').forEach((i) => i.classList.add('on')));
    el.querySelectorAll('.ps-chip').forEach((b) => b.addEventListener('pointerenter', () => showClubs([b.dataset.club])));
    el.querySelectorAll('.ps-chip').forEach((b) => b.addEventListener('click', () => showClubs([b.dataset.club])));
    $('.ps-chips').addEventListener('pointerleave', () => isClubs && showClubs(heroClubs(set)));
    if (isClubs) showClubs(heroClubs(set)); else showBall(ball);

    function showClubs(ids) {
      if (!stage) return;
      const req = ++token;
      Promise.all(ids.map((id) => loadEquipment(headPath(set, id)))).then((scns) => {
        if (req !== token) return;
        const objs = scns.map((sc) => sc && { obj: (sc.getObjectByName('head') || sc).clone() }).filter(Boolean);
        if (!objs.length) return;
        $('.ps-cap-l').textContent = ids.map((id) => CATALOGUE.find((c) => c.id === id)?.name || id).join('  ·  ');
        // one head fills the stage; three stand in a row
        stage.show(objs, objs.length === 1 ? { dist: 0.32, height: 0.035 } : { span: set.hockey ? 0 : 0.15, dist: set.hockey ? 1.3 : 0.5, height: set.hockey ? 0.2 : 0.045 });
      });
    }
    function showBall(b) {
      if (!stage) return;
      const req = ++token;
      loadEquipment(`balls/${b.id}.glb`).then((sc) => {
        if (req !== token) return;
        const src = sc?.getObjectByName('ball');
        if (!src) return;
        const o = src.clone();
        stage.show([{ obj: o, lift: 0.004 }], { dist: 0.2, height: 0.02 });
      });
    }
  };

  const setTab = (t) => {
    view = t;
    el.querySelectorAll('.ps-tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    el.querySelector('.ps-tabs').dataset.on = t;
    renderRail();
    renderInfo(true);
  };
  el.querySelectorAll('.ps-tabs [data-tab]').forEach((b) => b.addEventListener('click', () => { audio.tick?.(); setTab(b.dataset.tab); }));
  $('.ps-use').addEventListener('click', () => {
    audio.tick?.();
    if (game.setPlayerGear && who) game.setPlayerGear(who.id, view === 'clubs' ? { clubSet: setId } : { ball: ballId });
    else if (view === 'clubs') {
      const set = SETS.find((x) => x.id === setId);
      if (set) game.applySetting('bag', set.bag.slice(), true);
      game.applySetting('clubSet', setId);
    } else game.applySetting('ball', ballId);
    const b = $('.ps-use');
    b.textContent = view === 'clubs' ? 'In your bag' : 'In your bag';
    if (G && motionOn()) G.fromTo(b, { scale: 0.96 }, { scale: 1, duration: 0.4, ease: 'expo.out' });
  });
  setTab(tab);
  return el;
}
