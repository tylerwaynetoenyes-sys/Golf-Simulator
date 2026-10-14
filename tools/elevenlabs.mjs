// Generate the game's recorded sounds with the ElevenLabs Sound Effects API.
//
//   ELEVENLABS_API_KEY=... node tools/elevenlabs.mjs            # missing files only
//   ELEVENLABS_API_KEY=... node tools/elevenlabs.mjs --force    # regenerate all
//   ELEVENLABS_API_KEY=... node tools/elevenlabs.mjs ambience_day plane
//
// Files land in assets/audio/ and are listed in assets/audio/manifest.json,
// which the game reads at start-up (js/audio/audio.js). Any sound without a
// file keeps its synthesized version, so this is entirely optional.
import { writeFile, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = new URL('../assets/audio/', import.meta.url).pathname;
const SOUNDS = {
  impact_driver: { text: 'Close-up golf driver striking a golf ball off a tee, crisp bright titanium crack, single clean strike, short decay, outdoors', duration: 1.2 },
  impact_iron: { text: 'Golf iron striking the ball cleanly off fairway turf, compressed forged click and a soft divot brush, single shot, outdoors', duration: 1.5 },
  sand_blast: { text: 'Golf wedge splashing a ball out of a sand bunker, heavy thud into sand and a spray of falling sand, single shot, outdoors', duration: 1.6 },
  splash: { text: 'A golf ball dropping into a calm pond from high, small sharp plop and splash with a few droplets, outdoors', duration: 1.2 },
  cheer: { text: 'Golf gallery around a green reacting to a holed putt: rising roar and warm applause from a few hundred spectators outdoors, fading out', duration: 4 },
  ambience_day: { text: 'Peaceful summer afternoon on a parkland golf course near a river: gentle breeze through oak leaves, distant songbirds, soft', duration: 22, loop: true },
  ambience_night: { text: 'Warm summer night beside the Mississippi river: crickets and katydids, faint breeze, distant water, calm', duration: 22, loop: true },
  plane: { text: 'Commercial jet airliner passing high overhead at cruising altitude, distant low rumble that slowly swells and fades away', duration: 14 },
};

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error('Set ELEVENLABS_API_KEY (from elevenlabs.io → Profile → API keys).');
  process.exit(1);
}
const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

const exists = async (p) => access(p).then(() => true, () => false);
const manifestPath = join(DIR, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{}'));

for (const [name, s] of Object.entries(SOUNDS)) {
  if (only.length && !only.includes(name)) continue;
  const file = `${name}.mp3`;
  if (!force && !only.length && await exists(join(DIR, file))) { console.log(`skip ${name} (exists)`); continue; }
  process.stdout.write(`${name} … `);
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text: s.text, duration_seconds: s.duration, prompt_influence: 0.4, loop: !!s.loop }),
  });
  if (!res.ok) { console.log(`failed (${res.status}) ${await res.text()}`); continue; }
  await writeFile(join(DIR, file), Buffer.from(await res.arrayBuffer()));
  manifest[name] = file;
  console.log('ok');
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log('manifest updated:', Object.keys(manifest).join(', '));
