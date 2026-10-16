// Real surfaces for built things: photographed PBR texture sets (Poly Haven,
// CC0; assets/textures/pbr/<id>_{diff,rough,nor_gl}.jpg) laid on in world
// space from three sides (triplanar), so any modelled shape takes cut stone,
// concrete, tile or metal at true scale without UVs. One material per set
// and tint, shared and cached; the textures load once, when first used.
//
//   pbr('sandstone_blocks_08', { scale: 2.5, tint: 0xf2ece0 })
//     scale  metres one texture tile covers
//     tint   multiplies the photographed colour (keep it light)
//     metal  metalness (steel, copper) · rough  roughness multiplier
//     glow   night emissive colour (lit stone, windows) via userData.night
//     offset polygon offset (draped paving over the ground)
//     bright albedo multiplier over the normalised mid (1.8 for white paint)
//     vertex multiply by the geometry's vertex colours (per-building tints)
//     facade windows drawn over the stone in the shader, from the geometry's
//            uv in metres (u along the wall, v up from its foot):
//            { bay, floor, win: [x0, x1, y0, y1] of a bay and floor,
//              frame: colour, balcony: 0..1, shop: ground floor height m,
//              lit: share of windows lit at night }
import * as THREE from 'three';

const BASE = new URL('../../assets/textures/pbr/', import.meta.url).href;
const loader = new THREE.TextureLoader();
const sets = new Map();
function set(id) {
  if (!sets.has(id)) {
    const load = (m, srgb) => {
      const t = loader.load(`${BASE}${id}_${m}.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 4;
      return t;
    };
    // each photograph is normalised to one mid albedo once it loads, so the
    // tint, not the photo's own exposure, sets how light a surface is
    const gain = { value: 1 };
    const diff = load('diff', true);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, 32, 32);
      const d = g.getImageData(0, 0, 32, 32).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) {
        const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        sum += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
      }
      gain.value = Math.min(4, 0.42 / Math.max(0.02, sum / (d.length / 4)));
    };
    img.src = `${BASE}${id}_diff.jpg`;
    sets.set(id, { diff, rough: load('rough', false), nor: load('nor_gl', false), gain });
  }
  return sets.get(id);
}

// Sets that turned out wrong for what callers ask of them: `metal_plate` is a
// rusty diamond tread plate (callers mean painted steel: bridges, hulls,
// posts, domes) and `red_bricks_02` an old weathered mixed brick (callers mean
// red brick). Both now draw clean sets (ambientCG Metal032 and Bricks059, CC0).
const ALIAS = { metal_plate: 'painted_steel', red_bricks_02: 'red_brick' };

const cache = new Map();
export function pbr(id, { scale = 3, tint = 0xffffff, metal = 0, rough = 1, glow = null, night = 0.5, side = THREE.FrontSide, offset = 0, bright = 1, vertex = false, facade = null, extra = null, unique = false } = {}) {
  id = ALIAS[id] || id;
  const key = `${id}|${scale}|${tint}|${metal}|${rough}|${glow}|${side}|${offset}|${bright}|${vertex}|${facade ? JSON.stringify(facade) : ''}|${extra ? JSON.stringify(extra) : ''}`;
  if (!unique && cache.has(key)) return cache.get(key);
  const tx = set(id);
  const m = new THREE.MeshStandardMaterial({ color: tint, metalness: metal, roughness: 1, side, vertexColors: vertex });
  if (offset) Object.assign(m, { polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset });
  if (extra) for (const [k, v] of Object.entries(extra)) m[k] = k === 'emissive' ? new THREE.Color(v) : v;
  if (glow != null) { m.emissive = new THREE.Color(glow); m.emissiveIntensity = 0; m.userData.night = night; }
  const F = facade && { bay: 3, floor: 3.3, win: [0.28, 0.72, 0.18, 0.82], frame: 0xe8e2d6, balcony: 0, shop: 0, lit: 0.4, ...facade };
  if (F && glow == null) { m.emissive = new THREE.Color(0xffd39a); m.emissiveIntensity = 0; m.userData.night = 1.1; }
  const uni = { uTriG: tx.gain, uTriD: { value: tx.diff }, uTriR: { value: tx.rough }, uTriN: { value: tx.nor }, uTriS: { value: 1 / scale }, uTriRough: { value: rough }, uTriK: { value: bright } };
  if (F) Object.assign(uni, {
    uFacCell: { value: new THREE.Vector2(F.bay, F.floor) }, uFacWin: { value: new THREE.Vector4(...F.win) },
    uFacFrame: { value: new THREE.Color(F.frame) }, uFacBal: { value: F.balcony }, uFacShop: { value: F.shop }, uFacLit: { value: F.lit },
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriW; varying vec3 vTriN;' + (F ? '\nvarying vec2 vFac;' : ''))
      .replace('#include <uv_vertex>', '#include <uv_vertex>' + (F ? '\nvFac = uv;' : ''))
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        {
          vec4 tp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            tp = instanceMatrix * tp;
          #endif
          vTriW = (modelMatrix * tp).xyz;
          vTriN = normalize(mat3(modelMatrix) * objectNormal);
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vTriW; varying vec3 vTriN;
uniform sampler2D uTriD; uniform sampler2D uTriR; uniform sampler2D uTriN; uniform float uTriS; uniform float uTriRough; uniform float uTriG; uniform float uTriK;
vec3 triW() { vec3 w = pow(abs(normalize(vTriN)), vec3(4.0)); return w / (w.x + w.y + w.z); }` + (F ? `
varying vec2 vFac;
uniform vec2 uFacCell; uniform vec4 uFacWin; uniform vec3 uFacFrame; uniform float uFacBal; uniform float uFacShop; uniform float uFacLit;
float facHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float facWin = 0.0, facLit = 0.0, facGlass = 0.0;` : ''))
      .replace('#include <map_fragment>', `
        vec3 tw = triW();
        vec3 tp = vTriW * uTriS;
        vec3 tc = texture2D(uTriD, tp.zy).rgb * tw.x + texture2D(uTriD, tp.xz).rgb * tw.y + texture2D(uTriD, tp.xy).rgb * tw.z;
        diffuseColor.rgb *= min(tc * uTriG * uTriK, vec3(1.0));` + (F ? `
        {
          // the window grid: a cell per bay and floor; a taller shopfront on the ground floor
          vec2 fp = vFac;
          bool shop = uFacShop > 0.0 && fp.y < uFacShop;
          vec2 cell = shop ? vec2(fp.x / uFacCell.x, 0.0) : vec2(fp.x / uFacCell.x, (fp.y - uFacShop) / uFacCell.y);
          vec2 f = fract(cell), id = floor(cell);
          vec4 W = shop ? vec4(0.12, 0.88, 0.06, 0.78) : uFacWin;
          if (shop) f.y = fp.y / uFacShop;
          float aa = fwidth(f.x) * 1.5 + 0.002, ab = fwidth(f.y) * 1.5 + 0.002;
          float inX = smoothstep(W.x - aa, W.x + aa, f.x) * (1.0 - smoothstep(W.y - aa, W.y + aa, f.x));
          float inY = smoothstep(W.z - ab, W.z + ab, f.y) * (1.0 - smoothstep(W.w - ab, W.w + ab, f.y));
          // past a few pixels a window, the pattern averages out to a darker wall instead of shimmering
          float far = smoothstep(0.3, 0.75, max(fwidth(cell.x), fwidth(cell.y)));
          float win = inX * inY * (1.0 - far);
          // the frame round it and the stone sill below
          float fr = 0.035;
          float outX = smoothstep(W.x - fr - aa, W.x - fr + aa, f.x) * (1.0 - smoothstep(W.y + fr - aa, W.y + fr + aa, f.x));
          float outY = smoothstep(W.z - fr * 2.0 - ab, W.z - fr * 2.0 + ab, f.y) * (1.0 - smoothstep(W.w + fr - ab, W.w + fr + ab, f.y));
          float frame = outX * outY * (1.0 - inX * inY) * (1.0 - far);
          float sill = outX * smoothstep(W.z - fr * 3.0, W.z - fr * 2.0, f.y) * (1.0 - smoothstep(W.z - fr * 2.0, W.z - fr, f.y));
          float h = facHash(id + floor(fp.x / 997.0));
          // glass: dark, a little blue, curtains or blinds drawn in some; the reveal shades its top and one side
          vec3 glass = mix(vec3(0.035, 0.045, 0.055), vec3(0.16, 0.14, 0.12), step(0.72, h) * smoothstep(W.w, W.z, f.y) * 0.8);
          float reveal = smoothstep(W.w - 0.1, W.w, f.y) + smoothstep(W.x + 0.06, W.x, f.x);
          glass *= 1.0 - 0.6 * clamp(reveal, 0.0, 1.0);
          // mullions: a cross in the sash windows
          float mul = (1.0 - smoothstep(0.006, 0.012, abs(f.x - (W.x + W.y) * 0.5))) + (1.0 - smoothstep(0.006, 0.012, abs(f.y - mix(W.z, W.w, 0.62))));
          glass = mix(glass, uFacFrame * 0.8, clamp(mul, 0.0, 1.0) * (shop ? 0.0 : 1.0));
          // wrought-iron balconies across the lower third (on the 2nd and 5th floors, all along)
          float bal = uFacBal > 0.0 && !shop && (abs(id.y - 1.0) < 0.5 || abs(id.y - 4.0) < 0.5) ? 1.0 : uFacBal * step(0.5, h) * (shop ? 0.0 : 1.0);
          float rail = bal * outX * step(W.z - 0.02, f.y) * (1.0 - step(W.z + 0.24, f.y)) * (step(0.6, fract(f.x * 36.0)) + step(W.z + 0.21, f.y));
          diffuseColor.rgb *= mix(1.0, 0.55 + 0.45 * (1.0 - (W.y - W.x) * (W.w - W.z)), far);
          rail *= 1.0 - far;
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, win);
          diffuseColor.rgb = mix(diffuseColor.rgb, uFacFrame, frame * 0.85);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.18, sill);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03), clamp(rail, 0.0, 1.0));
          facWin = win * (1.0 - clamp(rail, 0.0, 1.0));
          facGlass = win;
          facLit = step(h, uFacLit) * (shop ? 1.6 : 1.0) * (0.7 + 0.6 * facHash(id * 1.7 + 3.1));
        }` : ''))
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness * uTriRough * (texture2D(uTriR, tp.zy).g * tw.x + texture2D(uTriR, tp.xz).g * tw.y + texture2D(uTriR, tp.xy).g * tw.z);` + (F ? `
        roughnessFactor = mix(roughnessFactor, 0.06, facGlass);` : ''))
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>' + (F ? '\n metalnessFactor = mix(metalnessFactor, 0.4, facGlass);' : ''))
      .replace('#include <normal_fragment_maps>', `
        {
          // whiteout-blended triplanar normal, in world space, back to view space
          vec3 nx = texture2D(uTriN, tp.zy).xyz * 2.0 - 1.0;
          vec3 ny = texture2D(uTriN, tp.xz).xyz * 2.0 - 1.0;
          vec3 nz = texture2D(uTriN, tp.xy).xyz * 2.0 - 1.0;
          vec3 wn = normalize(vTriN);
          nx = vec3(nx.xy + wn.zy, abs(nx.z) * wn.x);
          ny = vec3(ny.xy + wn.xz, abs(ny.z) * wn.y);
          nz = vec3(nz.xy + wn.xy, abs(nz.z) * wn.z);
          vec3 bn = normalize(nx.zyx * tw.x + ny.xzy * tw.y + nz.xyz * tw.z);
          vec3 vn = normalize((viewMatrix * vec4(bn, 0.0)).xyz);
          normal = normalize(mix(normal, vn, 0.85${F ? ' * (1.0 - facGlass)' : ''}));
        }`);
    // only the lit windows glow at night, warm and uneven
    if (F) sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= facWin * facLit;');
  };
  m.customProgramCacheKey = () => `pbrTri|${id}|${F ? 'facade' : ''}`;
  if (!unique) cache.set(key, m);
  return m;
}

/**
 * A coloured surface that is still a real one: the colour laid over a
 * photographed material chosen for what the surface is, so nothing in the
 * game is a flat plastic fill. Metal (metalness >= 0.3) gets painted steel,
 * lawn greens real grass, everything else the fine grain of painted plaster
 * (or concrete where it is rough). The colour stays what was asked for (the
 * photograph is normalised and brightened to it). Glass, see-through and
 * already-textured materials are left as they are: those are real already.
 * Each call gets its own material (callers animate colour and glow), the
 * photographs themselves are loaded once and shared.
 *   painted(0xb8202a, { roughness: 0.5, emissive: 0xffd39a, emissiveIntensity: 0 })
 */
export function painted(color, opts = {}) {
  const { roughness = 0.75, metalness = 0, map, alphaMap, normalMap, vertexColors, transparent, opacity = 1, side = THREE.FrontSide, ...rest } = opts;
  if (map || alphaMap || normalMap || vertexColors || transparent || opacity < 1 || roughness < 0.15) {
    return new THREE.MeshStandardMaterial({ color, ...opts });
  }
  const c = new THREE.Color(color);
  const hsl = {};
  c.getHSL(hsl);
  const lawn = hsl.h > 0.18 && hsl.h < 0.42 && hsl.s > 0.2 && hsl.l < 0.55 && metalness < 0.3;
  const id = metalness >= 0.3 ? 'painted_steel' : lawn ? 'grass_ground' : roughness >= 0.9 ? 'concrete_wall_008' : 'white_plaster_02';
  const scale = id === 'painted_steel' ? 2 : id === 'grass_ground' ? 3 : 2.5;
  // texture roughness is ~0.7 on average: scale it to the roughness asked for
  return pbr(id, { scale, tint: color, metal: metalness, rough: Math.min(1.6, roughness / 0.7), side, bright: 2.2, extra: Object.keys(rest).length ? rest : null, unique: true });
}
