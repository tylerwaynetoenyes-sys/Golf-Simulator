// Course registry. Each course is {id, name, place, blurb, theme, holes} once
// loaded. The Confluence Course is authored analytically (js/course/holes.js);
// the others are routed over real elevation (js/course/courses/*.js, baked by
// tools/fetch-dem.mjs) and need their DEM loaded before the first hole.
import { HOLES } from './holes.js';
import { loadDem, prepareDemHoles } from './dem.js';
import oregon from './courses/oregon.js';
import rollinghills from './courses/rollinghills.js';
import sawgrass from './courses/sawgrass.js';
import pebble from './courses/pebble.js';
import liberty from './courses/liberty.js';
import eaststl from './courses/eaststl.js';
import paris from './courses/paris.js';
import cassis from './courses/cassis.js';

const CONFLUENCE = {
  id: 'confluence',
  name: 'The Confluence Course',
  place: 'St. Louis & Alton',
  theme: 'parkland',
  blurb: 'Eighteen holes past the Arch, Chain of Rocks, Cahokia, the Basilica and the old Alton riverfront.',
  // the design pass adds bunkering and shaping; the valleys are deepened by half
  holes: HOLES.map((h) => ({ ...h, enrich: true, elevScale: 1.5 })),
};

/** Every course, in picker order (holes may still need loading: see loadCourse). */
export const COURSES = [CONFLUENCE, eaststl, oregon, paris, cassis, liberty, pebble, sawgrass, rollinghills];

export const courseById = (id) => COURSES.find((c) => c.id === id) || CONFLUENCE;

const loaded = new Map([[CONFLUENCE.id, CONFLUENCE]]);

/** Resolve a course with playable holes (fetches and prepares DEM courses once). */
export async function loadCourse(id) {
  if (loaded.has(id)) return loaded.get(id);
  const c = courseById(id);
  // imported models (Eiffel Tower, statue, cars, people), browser only
  const models = typeof window !== 'undefined' ? import('../scene/models.js').then((m) => m.preloadCourseModels(c.id)) : null;
  // the course's tree models load alongside the terrain (browser only; the Node tools skip them)
  const trees = typeof window !== 'undefined' ? import('../scene/trees.js').then((m) => m.loadHeroTrees(c.id, c.theme)) : null;
  if (!c.dem) { await Promise.all([models, trees]); loaded.set(id, c); return c; }
  const [d] = await Promise.all([loadDem(c.id), trees, models]);
  const out = { ...c, holes: prepareDemHoles(c, d) };
  loaded.set(id, out);
  return out;
}

/** Already-loaded course, or null. */
export const loadedCourse = (id) => loaded.get(id) || null;
