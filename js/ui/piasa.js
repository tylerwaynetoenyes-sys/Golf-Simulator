// The Piasa: the winged creature of Illinois Native legend, repainted on the
// bluff above the river north of Alton. Original artwork in the spirit of the
// bluff painting: antlered, bearded head, red wings, scaled body, talons and a
// long tail that loops around the body and ends in a fish fin.
//
// Two renderings share the drawing:
//   piasaSVG({mural:true})  full colour on weathered limestone (3D bluff mural)
//   piasaSVG()              warm line-art emblem for the HUD mascot
// To use your own image, set ASSET_MANIFEST.piasa.url (js/scene/assets.js).
import { ASSET_MANIFEST } from '../scene/assets.js';

export function piasaSVG({ mural = false, id = 'piasa' } = {}) {
  const ink = mural ? '#1b1410' : 'currentColor';
  const red = mural ? '#a3271c' : 'currentColor';
  const green = mural ? '#3d6b3a' : 'none';
  const skin = mural ? '#d8c3a0' : 'none';
  const sw = mural ? 2.4 : 2.2;
  const fillOp = mural ? 1 : 0;
  const wingFill = mural ? red : 'none';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 170" id="${id}" fill="none" stroke-linecap="round" stroke-linejoin="round">
  ${mural ? `<defs><radialGradient id="${id}-bg" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#e7dcc4"/><stop offset="1" stop-color="#bfae8c"/></radialGradient></defs>
  <rect width="240" height="170" fill="url(#${id}-bg)"/>` : ''}
  <!-- tail: sweeps from the haunch, loops around the body, ends in a fish fin -->
  <path d="M154 108 C186 116 206 100 200 78 C194 58 168 54 150 66 C128 82 140 112 170 116 C196 120 214 104 226 74 C230 62 232 52 234 40"
        stroke="${ink}" stroke-width="${mural ? sw * 2.4 : sw * 1.3}" />
  ${mural ? `<path d="M154 108 C186 116 206 100 200 78 C194 58 168 54 150 66 C128 82 140 112 170 116 C196 120 214 104 226 74 C230 62 232 52 234 40"
        stroke="#3d6b3a" stroke-width="${sw * 1.2}" />` : ''}
  <path d="M234 40 L226 26 L236 34 L240 22 L238 40 Z" fill="${mural ? ink : 'none'}" stroke="${ink}" stroke-width="${sw * 0.8}"/>
  <!-- wing (animated in the HUD) -->
  <g class="pz-wing">
    <path d="M112 80 C100 50 104 22 126 4 C128 22 140 26 150 16 C150 34 164 38 176 30 C174 46 188 52 202 48 C186 66 160 76 134 86 Z"
          fill="${wingFill}" fill-opacity="${mural ? 0.94 : 0}" stroke="${ink}" stroke-width="${sw}"/>
    <path d="M118 80 L126 6 M124 82 L150 18 M130 84 L176 32 M134 86 L200 50" stroke="${ink}" stroke-width="${sw * 0.55}" opacity="0.85"/>
  </g>
  <!-- body: long, low, scaled -->
  <path d="M66 86 C76 70 106 68 132 76 C156 84 166 100 156 112 C146 124 112 126 92 120 C74 114 60 100 66 86 Z"
        fill="${green}" fill-opacity="${fillOp}" stroke="${ink}" stroke-width="${sw}"/>
  <g stroke="${ink}" stroke-width="${sw * 0.45}" opacity="${mural ? 0.7 : 0.55}">
    <path d="M80 92 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0"/>
    <path d="M78 102 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0"/>
    <path d="M88 112 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0"/>
  </g>
  <!-- legs + eagle talons -->
  <path d="M94 118 C92 128 90 134 88 142 M88 142 l-9 5 M88 142 l-3 9 M88 142 l6 7" stroke="${ink}" stroke-width="${sw * 1.1}"/>
  <path d="M134 120 C136 130 136 136 136 144 M136 144 l-9 5 M136 144 l-1 9 M136 144 l7 6" stroke="${ink}" stroke-width="${sw * 1.1}"/>
  <!-- neck + head -->
  <path d="M70 84 C58 78 52 68 50 58 M80 76 C68 70 62 60 60 52" stroke="${ink}" stroke-width="${sw}"/>
  <path d="M34 44 C34 32 48 26 60 32 C68 38 68 50 62 58 C56 66 42 66 36 60 C32 56 32 50 34 44 Z"
        fill="${skin}" fill-opacity="${fillOp}" stroke="${ink}" stroke-width="${sw}"/>
  <!-- brow, beard, fangs -->
  <path d="M40 40 L52 42" stroke="${ink}" stroke-width="${sw * 0.8}"/>
  <path d="M36 58 C32 70 36 80 44 86 C44 78 48 72 52 66" fill="${mural ? ink : 'none'}" stroke="${ink}" stroke-width="${sw * 0.8}"/>
  <path d="M33 50 l-5 3 l5 0 M34 53 l1 6" stroke="${ink}" stroke-width="${sw * 0.7}"/>
  <circle class="pz-eye" cx="45" cy="45" r="${mural ? 2.8 : 2.4}" fill="${mural ? '#c0201a' : 'currentColor'}" stroke="none"/>
  <!-- antlers -->
  <path class="pz-antler" d="M46 32 C44 20 38 12 28 8 M40 18 L31 20 M36 12 L30 4 M54 30 C56 18 64 10 76 8 M60 18 L67 22 M67 11 L74 4"
        stroke="${ink}" stroke-width="${sw}"/>
  ${mural ? '<path d="M18 160 C60 150 120 162 222 152" stroke="#8a7a5e" stroke-width="1" opacity="0.5"/>' : ''}
</svg>`;
}

/**
 * The bluff mural as painted (from Tyler's photographs of the Alton Piasa):
 * facing right; a great wing sweeping back and up, its four red bars each
 * outlined in white over gold scale-feathers; a gold scaled body; a gold
 * face with red eyes, red lips and fangs, a long gold-brown beard and dark
 * branching antlers; gold legs with black talons; and a beaded tail that
 * runs over the back, round the head, along the ground and ends in a fish
 * fin. No background: it is painted straight onto the limestone.
 */
export function piasaMuralSVG() {
  const ink = '#1d140c', gold = '#d6a32e', goldD = '#a87a1c', goldL = '#f0c75a';
  const red = '#b02a22', redD = '#7d1a15', white = '#f3efe4', brown = '#4a3220';
  const scales = (x0, y0, x1, y1, r) => {
    let out = '';
    let row = 0;
    for (let y = y0; y <= y1; y += r * 1.2, row++) {
      for (let x = x0 + (row % 2) * r; x <= x1; x += r * 2) out += `M${x - r} ${y} q${r} ${-r * 1.5} ${r * 2} 0 `;
    }
    return out;
  };
  const wing = 'M196 112 C170 104 120 92 70 74 C46 64 26 52 14 40 C22 34 36 32 50 36 C40 26 42 18 54 18 C76 22 110 34 150 50 C176 60 196 74 206 92 Z';
  const body = 'M64 140 C66 120 98 110 140 112 C186 114 230 112 252 122 C266 132 262 158 232 166 C190 176 110 174 84 166 C70 160 62 152 64 140 Z';
  const tail = 'M176 84 C188 60 206 50 236 46 C262 42 288 60 292 86 C296 112 290 140 284 160 C276 178 250 188 210 190 C170 192 110 190 66 176';
  const antlers = 'M248 60 C244 46 236 36 230 26 M238 42 L228 40 M234 34 L232 22 M266 58 C270 44 278 34 288 26 M274 42 L284 44 M280 34 L284 22';
  const bars = [0, 1, 2, 3].map((i) => {
    const y = 40 + i * 15, x0 = 30 + i * 7, x1 = 182 - i * 6;
    // a broad red bar outlined in white, its tip ragged like a feather end
    return `<path d="M${x0} ${y} L${x1} ${y + 20} C${x1 + 9} ${y + 22} ${x1 + 10} ${y + 31} ${x1 + 2} ${y + 34} L${x0 + 4} ${y + 13} Z" fill="${white}" stroke="${ink}" stroke-width="1.2"/>
    <path d="M${x0 + 6} ${y + 2.5} L${x1 - 3} ${y + 21.5} C${x1 + 3} ${y + 23} ${x1 + 4} ${y + 29} ${x1 - 1} ${y + 31} L${x0 + 8} ${y + 10.5} Z" fill="${red}"/>
    <path d="M${x1 - 34} ${y + 19} l9 6 m5 -3 l7 6 m-30 -14 l8 5" stroke="${redD}" stroke-width="2.2"/>`;
  }).join('');
  const legs = [[118, 166], [214, 164]].map(([x, y]) => `
  <path d="M${x} ${y} C${x - 2} ${y + 8} ${x - 4} ${y + 12} ${x - 6} ${y + 16}" stroke="${ink}" stroke-width="8"/>
  <path d="M${x} ${y} C${x - 2} ${y + 8} ${x - 4} ${y + 12} ${x - 6} ${y + 16}" stroke="${goldL}" stroke-width="5.5"/>
  <ellipse cx="${x - 6}" cy="${y + 19}" rx="9" ry="5" fill="${gold}" stroke="${ink}" stroke-width="1.4"/>
  ${[-13, -5, 3, 10].map((dx, k) => `<path d="M${x - 6 + dx * 0.7} ${y + 21} q${dx * 0.3} ${6 + (k % 2) * 2} ${dx * 0.5 + (dx > 0 ? 3 : -3)} 11" stroke="${ink}" stroke-width="2.6"/>`).join('')}`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 212" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <defs>
    <clipPath id="wingClip"><path d="${wing}"/></clipPath>
    <clipPath id="bodyClip"><path d="${body}"/></clipPath>
  </defs>
  <path d="${tail}" stroke="${ink}" stroke-width="9.5"/>
  <path d="${tail}" stroke="${gold}" stroke-width="7" stroke-dasharray="6 2.2"/>
  <path d="M68 176 L50 166 L58 178 L42 186 L60 184 L54 196 L70 182 Z" fill="${gold}" stroke="${ink}" stroke-width="1.6"/>
  <g clip-path="url(#bodyClip)"><rect x="50" y="100" width="210" height="80" fill="${gold}"/><path d="${scales(56, 112, 250, 176, 4.6)}" stroke="${goldD}" stroke-width="1.2"/></g>
  <path d="${body}" stroke="${ink}" stroke-width="2"/>
  <g transform="translate(0 12)">
  <g clip-path="url(#wingClip)"><rect x="0" y="0" width="220" height="130" fill="${gold}"/><path d="${scales(10, 14, 220, 130, 4.2)}" stroke="${goldD}" stroke-width="1.1"/></g>
  <path d="${wing}" stroke="${ink}" stroke-width="2"/>
  ${bars}
  <path d="M186 96 L200 70" stroke="${ink}" stroke-width="2.4"/>
  </g>
  ${legs}
  <g transform="translate(-4 20)">
  <path d="${antlers}" stroke="${ink}" stroke-width="5"/>
  <path d="${antlers}" stroke="${brown}" stroke-width="3"/>
  <path d="M244 96 C242 112 244 128 250 140 C254 130 258 128 262 140 C266 128 270 116 270 96 Z" fill="${goldD}" stroke="${ink}" stroke-width="1.4"/>
  <path d="M250 100 v32 M256 100 v34 M262 100 v30" stroke="${brown}" stroke-width="1"/>
  <path d="M238 70 C240 58 254 54 264 58 C276 62 278 78 274 92 C270 104 252 106 244 98 C238 92 236 80 238 70 Z" fill="${gold}" stroke="${ink}" stroke-width="2"/>
  <path d="M242 72 l8 -3 M260 69 l8 3" stroke="${ink}" stroke-width="2"/>
  <ellipse cx="248" cy="76" rx="3.2" ry="2.4" fill="${red}" stroke="${ink}" stroke-width="1"/>
  <ellipse cx="264" cy="76" rx="3.2" ry="2.4" fill="${red}" stroke="${ink}" stroke-width="1"/>
  <path d="M254 80 l2 7 l3 0" stroke="${ink}" stroke-width="1.2"/>
  <path d="M245 92 C251 88 261 88 268 92 C262 96 251 96 245 92 Z" fill="${red}" stroke="${ink}" stroke-width="1.2"/>
  <path d="M248 92 l1.5 4 l1.5 -4 M264 92 l-1.5 4 l-1.5 -4" fill="${white}" stroke="${ink}" stroke-width="0.8"/>
  </g>
</svg>`;
}

/**
 * The bluff mural from John Wright's 1898 engraving of the Piasa (public
 * domain, via OpenClipart; assets/art/piasa-wright-1898.svg), the drawing
 * the modern mural follows. Mirrored to face right as on the bluff; the
 * mural's colours are laid in by region (gold body, white wing panel with
 * red bars, dark upper wing, dark antlers) and the engraving's ink is
 * multiplied over them. Resolves to a canvas with a transparent background,
 * or null if the engraving can't be loaded.
 */
export const PIASA_ENGRAVING = new URL('../../assets/art/piasa-wright-1898.svg', import.meta.url).href;
export function piasaEngravedCanvas(width = 1200) {
  const W0 = 1199.06, H0 = 647.81; // the engraving's own units
  const height = Math.round((width * H0) / W0);
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(null);
    img.onload = () => {
      const mk = (w = width, h = height) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
      const c = mk(), g = c.getContext('2d');
      const k = width / W0;
      const mirror = (ctx) => ctx.setTransform(-k, 0, 0, k, width, 0); // face right
      // regions in engraving units (traced from the drawing at 0.625 scale)
      const S = (pts) => pts.map(([x, y]) => [x * 1.6, y * 1.6]);
      const poly = (ctx, pts, fill) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
      const wingPanel = S([[296, 108], [420, 98], [560, 94], [746, 92], [704, 142], [642, 200], [562, 242], [470, 248], [380, 244], [300, 254], [268, 232]]);
      // the paint mask: the engraving's ink widened by a few pixels (so the
      // hatched masses fill in), plus the open wing panel
      const mask = mk(), m = mask.getContext('2d');
      mirror(m);
      const r = 7 / k;
      for (let i = 0; i < 16; i++) m.drawImage(img, Math.cos((i / 16) * Math.PI * 2) * r, Math.sin((i / 16) * Math.PI * 2) * r, W0, H0);
      poly(m, wingPanel, '#000');
      // the colour layer, clipped to the mask
      const col = mk(), cg = col.getContext('2d');
      mirror(cg);
      poly(cg, S([[150, 165], [240, 185], [300, 245], [420, 248], [470, 238], [522, 250], [545, 300], [540, 362], [500, 368], [450, 392], [380, 398], [300, 386], [220, 376], [150, 366], [96, 352], [74, 330], [104, 298], [136, 250]]), '#d4a12f'); // body, legs, tail
      poly(cg, S([[84, 98], [100, 86], [160, 90], [188, 108], [182, 150], [168, 200], [156, 252], [104, 250], [98, 200], [86, 150]]), '#d9aa3a'); // head and beard
      poly(cg, S([[4, 34], [58, 2], [106, 8], [140, 6], [186, 12], [272, 12], [232, 46], [200, 76], [178, 102], [100, 106], [70, 80], [14, 56]]), '#5a4029'); // antlers
      poly(cg, S([[222, 92], [268, 58], [330, 42], [450, 28], [600, 16], [726, 8], [704, 42], [560, 92], [420, 104], [318, 112], [282, 142], [240, 204]]), '#b88a2a'); // upper wing
      poly(cg, wingPanel, '#f3efe4'); // lower wing panel
      for (let i = 0; i < 5; i++) { // the red bars
        const y0 = 118 + 24 * i, x0 = 305 + 6 * i, x1 = 694 - 34 * i;
        poly(cg, S([[x0, y0], [x1, y0 - 4], [x1 + 4, y0 + 13], [x0, y0 + 17]]), '#b02a22');
      }
      cg.setTransform(1, 0, 0, 1, 0, 0);
      cg.globalCompositeOperation = 'destination-in';
      cg.drawImage(mask, 0, 0);
      g.drawImage(col, 0, 0);
      // the engraving's ink over the colour
      mirror(g);
      g.globalCompositeOperation = 'multiply';
      g.drawImage(img, 0, 0, W0, H0);
      // (ink that runs past the colour stays, as the painted outline)
      g.setTransform(1, 0, 0, 1, 0, 0);
      // weathering on the paint
      g.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < 2600; i++) {
        const v = 160 + Math.random() * 95;
        g.fillStyle = `rgba(${v},${v - 8},${v - 20},${Math.random() * 0.22})`;
        g.fillRect(Math.random() * width, Math.random() * height, 1 + Math.random() * 7, 1 + Math.random() * 3);
      }
      g.globalCompositeOperation = 'source-over';
      resolve(c);
    };
    img.src = PIASA_ENGRAVING;
  });
}

/** Draw the mural version into a canvas (for the 3D bluff texture). */
export function piasaCanvas(width = 1024, height = 725) {
  return new Promise((resolve) => {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const g = c.getContext('2d');
    const done = (img) => {
      g.drawImage(img, 0, 0, width, height);
      // weathering: flaked paint and limestone grain, on the paint only
      g.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < 2600; i++) {
        const v = 160 + Math.random() * 95;
        g.fillStyle = `rgba(${v},${v - 8},${v - 20},${Math.random() * 0.25})`;
        g.fillRect(Math.random() * width, Math.random() * height, 1 + Math.random() * 7, 1 + Math.random() * 3);
      }
      g.globalCompositeOperation = 'source-over';
      resolve(c);
    };
    const img = new Image();
    img.onload = () => done(img);
    img.onerror = () => {
      const fallback = new Image();
      fallback.onload = () => done(fallback);
      fallback.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(piasaMuralSVG())}`;
    };
    const own = ASSET_MANIFEST.piasa?.url;
    if (own) img.src = own;
    else img.onerror();
  });
}
