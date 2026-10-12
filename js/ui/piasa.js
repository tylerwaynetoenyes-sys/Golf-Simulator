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

/** Draw the mural version into a canvas (for the 3D bluff texture). */
export function piasaCanvas(width = 1024, height = 725) {
  return new Promise((resolve) => {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const g = c.getContext('2d');
    const done = (img) => {
      g.drawImage(img, 0, 0, width, height);
      // weathering: flaked paint and limestone grain
      g.globalCompositeOperation = 'multiply';
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
      fallback.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(piasaSVG({ mural: true, id: 'mural' }))}`;
    };
    const own = ASSET_MANIFEST.piasa?.url;
    if (own) img.src = own;
    else img.onerror();
  });
}
