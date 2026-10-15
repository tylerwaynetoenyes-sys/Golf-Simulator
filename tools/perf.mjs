// Frame time, draw calls and triangles per course, as an iPad Air would draw
// them: headless Chrome on this Mac's GPU (Metal), 1180x820 at 2x, the
// chosen quality. Serve the repo first (the bridge, or any static server).
//
//   node tools/perf.mjs [--base http://localhost:8765] [--quality medium] rollinghills:1 cassis:2 ...
//
// For each hole it measures the flyover, then the address view: median and
// 95th-percentile frame time (rAF, capped at the display's 60 Hz), GPU time
// per frame (timer query; absolute values swing with the GPU's power state,
// compare runs made back to back), draw calls and triangles per frame with
// the shadow pass, and how many trees are models versus impostor cards.
// Budget for the iPad: 60 fps, under ~300 draw calls, under ~1.5M triangles.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const base = opt('base', 'http://localhost:8765');
const quality = opt('quality', 'medium');
const chromePath = opt('chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const holes = args.length ? args : ['rollinghills:1', 'eaststl:1', 'cassis:2', 'pebble:7', 'sawgrass:17', 'paris:1', 'liberty:1', 'oregon:1', 'confluence:1'];
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'fairway-perf-'));
const chrome = spawn(chromePath, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MEASURE = `(async () => {
  const w = window.__game.world, R = w.r.renderer, gl = R.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const orig = w.r.render.bind(w.r), qs = [];
  if (ext) w.r.render = () => { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); orig(); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q); };
  let calls = 0, tris = 0; R.info.autoReset = false;
  const t = []; let last = performance.now();
  await new Promise((d) => { const end = last + 4000; const k = (n) => { t.push(n - last); last = n; calls = Math.max(calls, R.info.render.calls); tris = Math.max(tris, R.info.render.triangles); R.info.reset(); n < end ? requestAnimationFrame(k) : d(); }; requestAnimationFrame(k); });
  R.info.autoReset = true; w.r.render = orig;
  await new Promise((r) => setTimeout(r, 300));
  const g = qs.filter((q) => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)).map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6).sort((a, b) => a - b);
  t.shift(); t.sort((a, b) => a - b);
  const trees = (await import('/js/scene/treeModels.js')).forestStats();
  return { mode: w.rig.mode, ms: t[t.length >> 1], p95: t[Math.floor(t.length * 0.95)], gpu: g.length ? g[g.length >> 1] : null, calls, tris, near: trees.near, far: trees.far };
})()`;

try {
  let list = null;
  for (let i = 0; i < 40 && !list; i++) { await sleep(250); list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).catch(() => null); }
  if (!list) throw new Error('Chrome did not start');
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 2, mobile: false });
  await send('Page.navigate', { url: base });
  await sleep(1500);
  await ev(`(() => { const k = 'alton-range.v1'; const d = JSON.parse(localStorage.getItem(k) || '{}'); d.settings = { ...(d.settings || {}), quality: '${quality}' }; localStorage.setItem(k, JSON.stringify(d)); return 1; })()`);
  const gpuName = await ev(`(() => { const gl = document.createElement('canvas').getContext('webgl2'); const x = gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })()`);
  console.log(`${gpuName}, 2360x1640, quality ${quality}`);
  console.log('hole            view      frame  p95    gpu   calls  tris    trees (model/card)');
  const row = (h, m) => console.log(`${h.padEnd(15)} ${m.mode.padEnd(9)} ${m.ms.toFixed(1).padStart(5)} ${m.p95.toFixed(1).padStart(5)} ${(m.gpu ?? 0).toFixed(1).padStart(6)} ${String(m.calls).padStart(6)} ${(m.tris / 1e6).toFixed(2).padStart(5)}M  ${m.near}/${m.far}`);
  for (const h of holes) {
    const [c, n] = h.split(':');
    await send('Page.navigate', { url: `${base}/?play=${c}&hole=${n || 1}&day` });
    let ok = false;
    for (let i = 0; i < 160 && !ok; i++) { await sleep(500); ok = await ev(`!!(window.__game?.world?.sceneMode === 'course' && window.__game.world.course?.treeList)`); }
    if (!ok) { console.log(`${h.padEnd(15)} did not load`); continue; }
    await sleep(1500);
    row(h, await ev(MEASURE));
    await sleep(16000);
    row(h, await ev(MEASURE));
  }
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
