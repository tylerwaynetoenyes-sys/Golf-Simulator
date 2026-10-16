// Headless smoke test for the modelled equipment: every club of every set
// and every ball, in the real game (headless Chrome, ?manual stepping).
// Serve the repo first, then:
//
//   node tools/equipment-check.mjs [--base http://localhost:8765] [set ...]
//
// For each club it checks that the model (not the procedural stand-in) is in
// hand, that at address the face centre sits square behind the ball on the
// ground, and that the swing brings the face centre back to the ball on the
// impact frame. For each ball, that its model replaced the procedural one.
// Any console error fails the run.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const base = opt('base', 'http://localhost:8765');
const chromePath = opt('chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'fairway-eq-'));
const chrome = spawn(chromePath, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// runs in the page: one set, every club in the catalogue
const CHECK_SET = (set) => `(async () => {
  const g = window.__game, w = g.world, c = w.club;
  const SPEC_IDS = ${JSON.stringify(['DR9', 'DR', 'DR12', '3W', '5W', '7W', '3H', '4H', '3I', '4I', '5I', '6I', '7I', '8I', '9I', 'PW', 'GW', 'SW', 'LW'])};
  const THREE = await import('three');
  g.applySetting('clubSet', '${set}', false);
  g.applySetting('showClub', true, false);
  const out = [];
  const ids = '${set}' === 'hockey' ? ['DR', '7I'] : SPEC_IDS;
  for (const id of ids) {
    g.selectClub(id, true);
    window.__advance(0.05);
    // wait for the head and shafts to arrive
    let head = null;
    for (let i = 0; i < 200 && !head; i++) {
      await new Promise((r) => setTimeout(r, 50));
      window.__advance(0.02);
      head = c.pivot.getObjectByName('head');
    }
    if (!head) { out.push({ id, error: 'model not loaded (procedural head in hand)' }); continue; }
    const fc = new THREE.Vector3().fromArray(head.userData.faceCenter);
    const ballL = c.root.worldToLocal(w.ball.mesh.position.clone());
    const at = () => c.root.worldToLocal(head.localToWorld(fc.clone()));
    // address: lowest point of the head on the ground, face centre behind the ball
    c.phase = 'address'; c.theta = 0; c._pose(); c.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(head, true);
    const a = at();
    const sole = c.root.worldToLocal(box.min.clone()).y;
    // swing: from the top to impact
    let hit = false, imp = null;
    c.strike(() => { hit = true; }, { fromTop: true });
    for (let i = 0; i < 240 && !hit; i++) window.__advance(1 / 240, 1 / 240);
    if (hit) { c.root.updateMatrixWorld(true); imp = at(); }
    c.phase = 'address'; c.theta = 0; c._pose();
    out.push({ id, ax: +(a.x - ballL.x).toFixed(4), az: +(a.z - ballL.z).toFixed(4), sole: +sole.toFixed(4),
      ix: imp ? +(imp.x - ballL.x).toFixed(4) : null, iz: imp ? +(imp.z - ballL.z).toFixed(4) : null, loft: head.userData.loft, lie: head.userData.lie });
  }
  return out;
})()`;

const CHECK_BALLS = `(async () => {
  const { BALLS } = await import('/js/data/equipment.js');
  const b = window.__game.world.ball, out = [];
  for (const x of BALLS) {
    b.setModel(x.id);
    let ok = false;
    for (let i = 0; i < 200 && !ok; i++) { await new Promise((r) => setTimeout(r, 50)); ok = b.model === x.id; }
    out.push({ id: x.id, ok: !!ok, tris: b.mesh.levels[0].object.geometry.index.count / 3 });
  }
  return out;
})()`;

let failed = 0;
try {
  let list = null;
  for (let i = 0; i < 40 && !list; i++) { await sleep(250); list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).catch(() => null); }
  if (!list) throw new Error('Chrome did not start');
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map(); const errors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'evaluate failed');
    return r.result?.result?.value;
  };
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${base}/?manual&maxdt=0.25` });
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) { await sleep(250); ready = await ev('!!(window.__game && window.__advance)').catch(() => false); }
  if (!ready) throw new Error('game did not start');
  await ev(`(() => { document.getElementById('demoButton').click(); window.__advance(1); window.__game.applySetting('timeOfDay', 'day', false); return 1; })()`);
  const { SETS } = await import('../js/data/equipment.js');
  const sets = args.length ? args : SETS.map((s) => s.id);
  // tolerances: the face centre within 6 mm of the ball's line at address
  // (it sits one ball radius + 3 mm behind it), and within 2 cm at impact
  const R = 0.021335 + 0.003;
  for (const s of sets) {
    const rows = await ev(CHECK_SET(s));
    for (const r of rows) {
      const bad = r.error || Math.abs(r.ax) > 0.006 || Math.abs(r.az - R) > 0.006 || Math.abs(r.sole) > 0.004
        || r.ix == null || Math.hypot(r.ix, r.iz - R) > 0.02;
      if (bad) failed++;
      console.log(`${bad ? 'FAIL' : 'ok  '} ${s.padEnd(10)} ${r.id.padEnd(5)} ${r.error || `loft ${r.loft}° lie ${r.lie}°  address x ${(r.ax * 1000).toFixed(1)} z ${(r.az * 1000).toFixed(1)} sole ${(r.sole * 1000).toFixed(1)} mm  impact x ${(r.ix * 1000).toFixed(1)} z ${(r.iz * 1000).toFixed(1)} mm`}`);
    }
  }
  for (const b of await ev(CHECK_BALLS)) {
    if (!b.ok) failed++;
    console.log(`${b.ok ? 'ok  ' : 'FAIL'} ball ${b.id.padEnd(9)} ${b.tris} tris`);
  }
  if (errors.length) { failed += errors.length; console.log('console errors:\n  ' + errors.join('\n  ')); }
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
