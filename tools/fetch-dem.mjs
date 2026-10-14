// Bake real elevation for a course from the open Terrarium tiles on AWS
// (Mapzen / Tilezen "Joerd" elevation: USGS 3DEP & NED in the US, SRTM and
// national DEMs elsewhere; https://registry.opendata.aws/terrain-tiles/).
//
//   node tools/fetch-dem.mjs <courseId> <lat> <lon> [sizeM=3200] [stepM=8] [farM=16000] [farStepM=64]
//
// Writes assets/courses/<id>/dem.bin + dem.json (the playable area, metres,
// centred on lat/lon) and far.bin + far.json (a wide, coarse backdrop).
// Heights are Uint16 centimetres above the grid's minimum. Local axes match
// the game: +x east, -z north. Needs `npm i pngjs` once.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

let PNG;
try { ({ PNG } = await import('pngjs')); } catch {
  try { ({ PNG } = await import(process.env.PNGJS || 'pngjs')); } catch {
    console.error('Install the PNG decoder first: npm i pngjs (or set PNGJS=/path/to/pngjs/lib/png.js)');
    process.exit(1);
  }
}

const [id, latS, lonS, sizeS = '3200', stepS = '8', farS = '16000', farStepS = '64'] = process.argv.slice(2);
if (!id || !latS || !lonS) {
  console.error('usage: node tools/fetch-dem.mjs <courseId> <lat> <lon> [sizeM] [stepM] [farM] [farStepM]');
  process.exit(1);
}
const LAT = Number(latS), LON = Number(lonS);
const R = 6378137;
const tileCache = new Map();

const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const lat2y = (lat, z) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;

async function tile(z, x, y) {
  const k = `${z}/${x}/${y}`;
  if (tileCache.has(k)) return tileCache.get(k);
  const p = (async () => {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${k}.png`;
    for (let i = 0; i < 4; i++) {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`${r.status}`);
        return PNG.sync.read(Buffer.from(await r.arrayBuffer()));
      } catch (e) {
        if (i === 3) throw new Error(`tile ${k}: ${e.message}`);
        await new Promise((res) => setTimeout(res, 500 * 2 ** i));
      }
    }
    return null;
  })();
  tileCache.set(k, p);
  return p;
}

/** Bilinear height (m) at lat/lon from zoom z. */
async function heightAt(lat, lon, z) {
  const fx = lon2x(lon, z) * 256, fy = lat2y(lat, z) * 256;
  const px = Math.floor(fx - 0.5), py = Math.floor(fy - 0.5);
  const tx = fx - 0.5 - px, ty = fy - 0.5 - py;
  const sample = async (X, Y) => {
    const t = await tile(z, Math.floor(X / 256), Math.floor(Y / 256));
    const i = ((Y % 256) * 256 + (X % 256)) * 4;
    return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
  };
  const a = await sample(px, py), b = await sample(px + 1, py), c = await sample(px, py + 1), d = await sample(px + 1, py + 1);
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

async function grid(name, size, step, zoom) {
  const n = Math.round(size / step) + 1;
  const h = new Float32Array(n * n);
  const mPerDegLat = (Math.PI / 180) * R;
  const mPerDegLon = mPerDegLat * Math.cos((LAT * Math.PI) / 180);
  let k = 0;
  for (let j = 0; j < n; j++) {
    const zM = -size / 2 + j * step; // +z = south
    const lat = LAT - zM / mPerDegLat;
    const row = [];
    for (let i = 0; i < n; i++) {
      const xM = -size / 2 + i * step;
      row.push(heightAt(lat, LON + xM / mPerDegLon, zoom));
    }
    for (const v of await Promise.all(row)) h[k++] = v;
    if (j % 32 === 0) process.stdout.write(`\r${name}: ${Math.round((j / n) * 100)}%`);
  }
  let min = Infinity, max = -Infinity;
  for (const v of h) { if (v < min) min = v; if (v > max) max = v; }
  const q = new Uint16Array(n * n);
  for (let i = 0; i < h.length; i++) q[i] = Math.round((h[i] - min) * 100);
  const dir = join('assets/courses', id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${name}.bin`), Buffer.from(q.buffer));
  const meta = { lat: LAT, lon: LON, size, step, n, min: Math.round(min * 100) / 100, max: Math.round(max * 100) / 100, zoom, source: 'Terrarium elevation tiles (AWS Open Data: USGS 3DEP/NED, SRTM, national DEMs)' };
  await writeFile(join(dir, `${name}.json`), `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`\r${name}: ${n}×${n} @ ${step} m, ${meta.min}–${meta.max} m (zoom ${zoom})`);
}

// zoom from the step: tiles at z have ~156543·cos(lat)/2^z metres per pixel
const zoomFor = (step) => Math.max(1, Math.min(15, Math.round(Math.log2((156543 * Math.cos((LAT * Math.PI) / 180)) / step))));
await grid('dem', Number(sizeS), Number(stepS), zoomFor(Number(stepS)));
await grid('far', Number(farS), Number(farStepS), zoomFor(Number(farStepS)));
