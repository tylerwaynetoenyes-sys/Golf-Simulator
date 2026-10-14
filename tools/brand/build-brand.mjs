// Builds the Fairway identity as plain SVG (no font dependency for the
// wordmark: every letter is drawn geometry). `node tools/brand/build-brand.mjs`
//
// The wordmark: wide, thin, geometric capitals; the A's are open (no
// crossbar); the I is a gold flagstick with the ball resting on top and a
// pennant flying. Tagline "A GOLF GAME" letterspaced in gold.
import { writeFile } from 'node:fs/promises';

const OUT = new URL('../../assets/brand/', import.meta.url).pathname;
let SW = 9.5; // stroke weight on a 100-unit cap height (heavier for the small wordmark)

/** Letter shapes on a 0..100 cap height, as SVG path data drawn with a stroke (clipped to the cap band). */
const letters = () => ({
  F: { w: 56, d: `M${SW / 2} -20 V120 M0 ${SW / 2} H56 M0 51 H48` },
  A: { w: 92, fill: 'M0 100 L41.2 0 H50.8 L92 100 H81.6 L46 14.2 L10.4 100 Z' },
  R: { w: 68, d: `M${SW / 2} -20 V120 M0 ${SW / 2} H36 A23.75 23.75 0 0 1 36 52 H0 M34 52 L70 113` },
  W: { w: 132, d: 'M-1.5 -12 L33 100 L66 -12 L99 100 L133.5 -12' },
  Y: { w: 88, d: 'M-2 -12 L44 52 L90 -12 M44 52 V120' },
});
const GAP = 31;

/** The flag in place of the I: pole, ball on top, pennant. x is the pole's centre. */
function flagI(x, gold, { pole = 4.8, ball = 8.6, top = -30 } = {}) {
  pole *= SW / 9.5; ball *= Math.sqrt(SW / 9.5);
  return `<rect x="${x - pole / 2}" y="${top + ball}" width="${pole}" height="${100 - top - ball}" fill="${gold}"/>
  <circle cx="${x}" cy="${top}" r="${ball}" fill="${gold}"/>
  <path d="M${x + pole / 2} ${top - 3} L${x + 40} ${top + 6} L${x + pole / 2} ${top + 16} Z" fill="${gold}"/>`;
}

function wordmark({ ink, gold, goldHi, tagline = true, tag = 'A GOLF GAME', id, weight = 9.5 }) {
  SW = weight;
  const LETTERS = letters();
  // a heavier A for the heavier cut
  if (weight > 9.5) LETTERS.A.fill = `M0 100 L${41.2 - (weight - 9.5) / 2} 0 H${50.8 + (weight - 9.5) / 2} L92 100 H${81.6 - (weight - 9.5)} L46 ${14.2 + (weight - 9.5) * 1.4} L${10.4 + (weight - 9.5)} 100 Z`;
  let x = 0;
  const parts = [];
  const place = (ch) => {
    const L = LETTERS[ch];
    parts.push(L.fill ? `<path transform="translate(${x} 0)" d="${L.fill}" fill="${ink}"/>`
      : `<path transform="translate(${x} 0)" d="${L.d}" fill="none" stroke="${ink}" stroke-width="${SW}" stroke-linejoin="miter" stroke-miterlimit="10" clip-path="url(#${id}-band)"/>`);
    x += L.w + GAP;
  };
  place('F'); place('A');
  // the flag is the I: its own letter slot, with clear air on both sides so
  // it never reads as a stroke through the A (the A's leg slants toward it)
  const flagX = x + 10;
  x += 20 + GAP;
  for (const ch of 'RWAY') place(ch);
  const width = x - GAP;
  const top = -48, bottom = tagline ? 168 : 104;
  const grad = `<linearGradient id="${id}-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${goldHi}"/><stop offset="1" stop-color="${gold}"/></linearGradient>`;
  const tagSvg = tagline
    ? `<text x="${width / 2}" y="158" text-anchor="middle" fill="url(#${id}-gold)" font-family="'Avenir Next', 'Futura', 'Montserrat', 'Helvetica Neue', Arial, sans-serif" font-size="23" font-weight="500" letter-spacing="16">${tag}</text>`
    : '';
  // the band clip: cap height only, so every stroke ends flat on the baseline and cap line
  return {
    width,
    svg: (pad = 20) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${top - pad} ${width + pad * 2} ${bottom - top + pad * 2}" role="img" aria-label="Fairway${tagline ? ` · ${tag}` : ''}">
  <defs><clipPath id="${id}-band" clipPathUnits="userSpaceOnUse"><rect x="-40" y="0" width="${width + 80}" height="100"/></clipPath>${grad}</defs>
  ${parts.join('\n  ')}
  ${flagI(flagX, `url(#${id}-gold)`)}
  ${tagSvg}
</svg>
`,
  };
}

const DARK = { ink: '#f2efe8', gold: '#b88d45', goldHi: '#e6c983' };
const LIGHT = { ink: '#121619', gold: '#9a7231', goldHi: '#c49a52' };

const files = {
  'fairway-logo-dark.svg': wordmark({ ...DARK, id: 'fld' }).svg(),
  'fairway-logo-light.svg': wordmark({ ...LIGHT, id: 'fll' }).svg(),
  // the small wordmark (HUD, under ~40 px) is cut heavier so it holds up
  'fairway-wordmark-dark.svg': wordmark({ ...DARK, tagline: false, id: 'fwd', weight: 15 }).svg(8),
  'fairway-wordmark-light.svg': wordmark({ ...LIGHT, tagline: false, id: 'fwl', weight: 15 }).svg(8),
};

// the mark on its own: the flag, ball and pennant (any background)
files['fairway-mark.svg'] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Fairway">
  <defs><linearGradient id="fm-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${DARK.goldHi}"/><stop offset="1" stop-color="${DARK.gold}"/></linearGradient></defs>
  <rect x="24.6" y="14" width="4.8" height="44" fill="url(#fm-gold)"/>
  <circle cx="27" cy="10" r="6.5" fill="url(#fm-gold)"/>
  <path d="M29.4 8 L52 15 L29.4 23 Z" fill="url(#fm-gold)"/>
</svg>
`;
// app icon and favicon: the flag on near-black, bolder for small sizes
const icon = (bleed) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="fi-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${DARK.goldHi}"/><stop offset="1" stop-color="${DARK.gold}"/></linearGradient>
  <radialGradient id="fi-bg" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="#1d2124"/><stop offset="1" stop-color="#0b0d0f"/></radialGradient></defs>
  <rect width="64" height="64" ${bleed ? '' : 'rx="14"'} fill="url(#fi-bg)"/>
  <g transform="${bleed ? 'translate(6.4 6.4) scale(0.8)' : ''}">
    <rect x="25" y="19.5" width="4" height="31.5" fill="url(#fi-gold)"/>
    <circle cx="27" cy="14" r="5.4" fill="url(#fi-gold)"/>
    <path d="M29 17 L46.5 22.6 L29 28.4 Z" fill="url(#fi-gold)"/>
    <rect x="17" y="51" width="20" height="1.8" rx="0.9" fill="#f2efe8" opacity="0.85"/>
  </g>
</svg>
`;
files['../../icon.svg'] = icon(false);
files['icon-bleed.svg'] = icon(true);

for (const [name, svg] of Object.entries(files)) await writeFile(OUT + name, svg);
console.log('wrote', Object.keys(files).join(', '));
