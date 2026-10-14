// Load a course's baked elevation from disk for the Node tools (the browser
// uses loadDem in js/course/dem.js).
import { readFileSync } from 'node:fs';
import { gridFrom } from '../js/course/dem.js';

export function loadDemSync(id, root = new URL('..', import.meta.url).pathname) {
  const g = (name) => {
    const meta = JSON.parse(readFileSync(`${root}assets/courses/${id}/${name}.json`, 'utf8'));
    const b = readFileSync(`${root}assets/courses/${id}/${name}.bin`);
    return gridFrom(meta, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  };
  return { dem: g('dem'), far: g('far') };
}
