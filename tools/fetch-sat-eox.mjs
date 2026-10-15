// EOxCloudless satellite colour for a DEM course, without Python: the same
// output as `tools/fetch-sat.py --source eox` (assets/courses/<id>/sat.jpg +
// sat.json, the far.json frame, north up), decoding the tiles with macOS sips.
//
//   node tools/fetch-sat-eox.mjs <id> [zoom=14] [px=1536]
//
// EOxCloudless 2024 by EOX IT Services GmbH (contains modified Copernicus
// Sentinel data 2024), CC BY-NC-SA 4.0: fine for Fairway as a private,
// non-commercial game.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const [id, zS = '14', pxS = '1536'] = process.argv.slice(2);
if (!id) { console.error('usage: node tools/fetch-sat-eox.mjs <id> [zoom] [px]'); process.exit(1); }
const Z = Number(zS), PX = Number(pxS);
const dir = new URL(`../assets/courses/${id}/`, import.meta.url).pathname;
const { lat, lon, size } = JSON.parse(await readFile(join(dir, 'far.json'), 'utf8'));
const mLat = (Math.PI / 180) * 6378137, mLon = mLat * Math.cos((lat * Math.PI) / 180);
const merc = (la, lo) => [((lo + 180) / 360) * 2 ** Z * 256, ((1 - Math.asinh(Math.tan((la * Math.PI) / 180)) / Math.PI) / 2) * 2 ** Z * 256];
const tmp = join(tmpdir(), `sat-${id}`);
await mkdir(tmp, { recursive: true });

function bmp(buf) {
  const off = buf.readUInt32LE(10), w = buf.readInt32LE(18), h = buf.readInt32LE(22), bpp = buf.readUInt16LE(28) / 8;
  const row = Math.ceil((w * bpp) / 4) * 4, H = Math.abs(h);
  return (x, y) => { const o = off + (h > 0 ? H - 1 - y : y) * row + x * bpp; return [buf[o + 2], buf[o + 1], buf[o]]; };
}
const tiles = new Map();
async function tile(x, y) {
  const k = `${x}_${y}`;
  if (!tiles.has(k)) tiles.set(k, (async () => {
    const jpg = join(tmp, `${k}.jpg`), bm = join(tmp, `${k}.bmp`);
    for (let i = 0; ; i++) {
      try {
        const r = await fetch(`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/${Z}/${y}/${x}.jpg`, { headers: { 'User-Agent': 'Fairway-golf/1.0 (private, non-commercial)' } });
        if (!r.ok) throw new Error(r.status);
        await writeFile(jpg, Buffer.from(await r.arrayBuffer()));
        break;
      } catch (e) { if (i > 3) throw e; await new Promise((s) => setTimeout(s, 600 * 2 ** i)); }
    }
    execFileSync('sips', ['-s', 'format', 'bmp', jpg, '--out', bm], { stdio: 'ignore' });
    return bmp(await readFile(bm));
  })());
  return tiles.get(k);
}

// average 2x2 samples per output pixel
const img = Buffer.alloc(PX * PX * 3);
for (let j = 0; j < PX; j++) {
  await Promise.all(Array.from({ length: PX }, async (_, i) => {
    const acc = [0, 0, 0];
    for (const [a, b] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const x = -size / 2 + ((i + a) / PX) * size, z = -size / 2 + ((j + b) / PX) * size; // +z south
      const [fx, fy] = merc(lat - z / mLat, lon + x / mLon);
      const px = (await tile(Math.floor(fx / 256), Math.floor(fy / 256)))(Math.floor(fx) % 256, Math.floor(fy) % 256);
      for (let k = 0; k < 3; k++) acc[k] += px[k] / 4;
    }
    img.set(acc.map(Math.round), (j * PX + i) * 3);
  }));
  if (j % 128 === 0) process.stdout.write(`\r  rows ${j}/${PX}`);
}
const row = PX * 3, out = Buffer.alloc(54 + row * PX);
out.write('BM'); out.writeUInt32LE(out.length, 2); out.writeUInt32LE(54, 10); out.writeUInt32LE(40, 14);
out.writeInt32LE(PX, 18); out.writeInt32LE(PX, 22); out.writeUInt16LE(1, 26); out.writeUInt16LE(24, 28); out.writeUInt32LE(row * PX, 34);
for (let j = 0; j < PX; j++) for (let i = 0; i < PX; i++) {
  const s = (j * PX + i) * 3, d = 54 + (PX - 1 - j) * row + i * 3;
  out[d] = img[s + 2]; out[d + 1] = img[s + 1]; out[d + 2] = img[s];
}
await writeFile(join(tmp, 'sat.bmp'), out);
execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', join(tmp, 'sat.bmp'), '--out', join(dir, 'sat.jpg')], { stdio: 'ignore' });
await writeFile(join(dir, 'sat.json'), JSON.stringify({ size, px: PX, source: `EOxCloudless 2024 (s2cloudless-2024_3857, zoom ${Z})`, licence: 'CC BY-NC-SA 4.0', credit: 'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024), CC BY-NC-SA 4.0' }, null, 1));
await rm(tmp, { recursive: true, force: true });
console.log(`\n  ${id}: ${tiles.size} EOX tiles -> sat.jpg ${PX}px over ${size} m`);
