// Text-to-3D through the Tripo API (https://platform.tripo3d.ai): one GLB and
// its preview render per prompt, for figures no model library has.
//
//   node tools/gen-tripo.mjs <out-dir> <prompts.json>
//
// prompts.json: [{ "name": "woman_basket", "prompt": "..." }, ...]
// The API key is read from $TRIPO_API_KEY or ~/.config/tripo/key and is never
// printed or written anywhere else.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [out, list] = process.argv.slice(2);
if (!out || !list) { console.error('usage: node tools/gen-tripo.mjs <out-dir> <prompts.json>'); process.exit(1); }
const keyFile = join(homedir(), '.config/tripo/key');
const KEY = (process.env.TRIPO_API_KEY || (existsSync(keyFile) ? readFileSync(keyFile, 'utf8') : '')).trim();
if (!KEY) { console.error(`no key: set TRIPO_API_KEY or put it in ${keyFile}`); process.exit(1); }
const BASE = 'https://openapi.tripo3d.ai/v3';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(out, { recursive: true });

async function one({ name, prompt }) {
  const r = await fetch(`${BASE}/generation/text-to-model`, { method: 'POST', headers: H, body: JSON.stringify({ prompt, model: process.env.TRIPO_MODEL || 'v3.1-20260211' }) });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`${name}: create failed (${r.status}, code ${j.code}${j.message ? `: ${j.message}` : ''})`);
  const id = j.data.task_id;
  console.log(`${name}: task ${id}`);
  for (let i = 0; i < 450; i++) {
    await sleep(2000);
    const t = (await (await fetch(`${BASE}/tasks/${id}`, { headers: { Authorization: H.Authorization } })).json()).data;
    if (t.status === 'success') {
      for (const [k, ext] of [['model_url', 'glb'], ['rendered_image_url', 'webp']]) {
        const u = t.output?.[k];
        if (u) writeFileSync(join(out, `${name}.${ext}`), Buffer.from(await (await fetch(u)).arrayBuffer()));
      }
      console.log(`${name}: done`);
      return;
    }
    if (['failed', 'cancelled', 'banned'].includes(t.status)) throw new Error(`${name}: ${t.status}`);
  }
  throw new Error(`${name}: timed out`);
}

const jobs = JSON.parse(readFileSync(list, 'utf8'));
const res = await Promise.allSettled(jobs.map(one));
for (const r of res) if (r.status === 'rejected') console.error(String(r.reason.message || r.reason));
