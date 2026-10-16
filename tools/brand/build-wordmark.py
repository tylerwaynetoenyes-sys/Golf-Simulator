# The Fairway identity: heavy condensed FAIRWAY in ivory, the I a full-weight
# letter with an orange flagstick set into a channel through it. The pole rises
# out of the I to an orange ball (the player's ball) and carries the pennant.
# Writes the wordmarks used by js/ui/logo.js, icon.svg and the app icon PNGs.
#
#   python3 tools/brand/build-wordmark.py     (PNGs need rsvg-convert: brew install librsvg)
#
# Source: src/fairway-traced.json, the letter outlines traced from the reference
# art (left = F A, right = R W A Y, sub = GOLF SIM and its rules, pennant), in
# the trace's own units (4x the reference, cap line y=966, baseline y=2094).
import json, math, os, subprocess, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..', '..'))
SRC = json.load(open(os.path.join(HERE, 'src', 'fairway-traced.json')))
TF = SRC['transform']

IVORY, ORANGE, DIM, BG = '#f2efe8', '#ff7a2f', '#a9461a', '#111316'
DX = 64                      # R W A Y move right to give the full I room
CAP, BASE = 966, 2094
IC = 1801                    # the I's centre line
HALF = 88                    # the I is 176 wide, as heavy as the other letters
PW, GAP = 46, 12             # the pole, and the channel either side of it
BX, BY, BR = IC, 566, 80     # the ball on top of the pole (js/ui/logo.js uses these)
POLE_TOP = BY + BR - 6
PEN_DX = (IC + PW // 2 - 2) - SRC['pennant_bbox'][0]   # pennant flush against the pole


def dimples(cx, cy, r, span):
    s, dr, out = r * 0.25, r * 0.085, []
    for j in range(-6, 7):
        for i in range(-6 * span, 6 * span + 1):
            px, py = cx + (i + 0.5 * (j % 2)) * s, cy + j * s * 0.866
            if abs(py - cy) < r * 0.97:
                out.append(f'<circle cx="{px:.0f}" cy="{py:.0f}" r="{dr * (1 - 0.35 * ((py - cy) / r) ** 2):.1f}"/>')
    return ''.join(out)


def ball(span=3):
    # ids end in __ so each inline copy can be made unique (js/ui/logo.js)
    return (f'<defs><clipPath id="fwBall__"><circle cx="{BX}" cy="{BY}" r="{BR}"/></clipPath>'
            f'<radialGradient id="fwShade__" cx="0.36" cy="0.32" r="0.75"><stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.3"/></radialGradient></defs>'
            f'<g class="fw-ball"><circle class="fw-ball-fill" cx="{BX}" cy="{BY}" r="{BR}" fill="{ORANGE}"/>'
            f'<g clip-path="url(#fwBall__)"><g class="fw-dimples" fill="{DIM}" opacity=".85">{dimples(BX, BY, BR, span)}</g>'
            f'<circle cx="{BX}" cy="{BY}" r="{BR}" fill="url(#fwShade__)"/></g></g>'
            f'<circle class="fw-ring" cx="{BX}" cy="{BY}" r="{BR}" fill="none" stroke="#e9c97a" stroke-width="12" opacity="0"/>')


def flagstick_i():
    side = HALF - PW // 2 - GAP
    return (f'<rect x="{IC - HALF}" y="{CAP}" width="{side}" height="{BASE - CAP}" fill="{IVORY}"/>'
            f'<rect x="{IC + HALF - side}" y="{CAP}" width="{side}" height="{BASE - CAP}" fill="{IVORY}"/>'
            f'<rect class="fw-pole" x="{IC - PW // 2}" y="{POLE_TOP}" width="{PW}" height="{BASE - POLE_TOP}" fill="{ORANGE}"/>'
            f'<g class="fw-pennant"><g transform="translate({PEN_DX},0)"><g transform="{TF}"><path fill="{ORANGE}" d="{SRC["pennant"]}"/></g></g></g>')


def wordmark(sub, label):
    vb = f'700 420 {3520 + DX} {(2480 if sub else 2140) - 420}'
    letters = (f'<g transform="{TF}"><path class="fw-word" fill="{IVORY}" d="{SRC["left"]}"/></g>'
               f'<g transform="translate({DX},0)"><g transform="{TF}"><path class="fw-word" fill="{IVORY}" d="{SRC["right"]}"/></g></g>')
    s = f'<g transform="translate({DX // 2},0)"><g transform="{TF}"><path class="fw-word" fill="{IVORY}" d="{SRC["sub"]}"/></g></g>' if sub else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-label="{label}">'
            f'<g class="fw-wordwrap">{letters}{s}{flagstick_i()}</g>{ball()}</svg>')


def icon(rounded=True, inset=1.0):
    # the flagstick I alone, cropped to the flag, the ball and the top of the letter
    r = 'rx="224"' if rounded else ''
    k = 1.2 * inset
    cx, cy = 1960, 830            # centre of the crop, in trace units
    ox, oy = 500 - cx * k, 500 - cy * k
    side = HALF - PW // 2 - GAP
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><defs><clipPath id="sq"><rect width="1000" height="1000" {r}/></clipPath>'
            f'<clipPath id="bc"><circle cx="{BX}" cy="{BY}" r="{BR}"/></clipPath></defs>'
            f'<g clip-path="url(#sq)"><rect width="1000" height="1000" fill="{BG}"/><g transform="translate({ox:.0f},{oy:.0f}) scale({k})">'
            f'<rect x="{IC - HALF}" y="{CAP}" width="{side}" height="{BASE - CAP}" fill="{IVORY}"/>'
            f'<rect x="{IC + HALF - side}" y="{CAP}" width="{side}" height="{BASE - CAP}" fill="{IVORY}"/>'
            f'<rect x="{IC - PW // 2}" y="{POLE_TOP}" width="{PW}" height="{BASE - POLE_TOP}" fill="{ORANGE}"/>'
            f'<g transform="translate({PEN_DX},0)"><g transform="{TF}"><path fill="{ORANGE}" d="{SRC["pennant"]}"/></g></g>'
            f'<circle cx="{BX}" cy="{BY}" r="{BR}" fill="{ORANGE}"/><g clip-path="url(#bc)" fill="{DIM}" opacity=".85">{dimples(BX, BY, BR, 1)}</g>'
            f'</g></g></svg>')


def png(svg, w, out):
    with tempfile.NamedTemporaryFile('w', suffix='.svg', delete=False) as t:
        t.write(svg)
    subprocess.run(['rsvg-convert', '-w', str(w), t.name, '-o', out], check=True)
    os.unlink(t.name)


B = os.path.join(REPO, 'assets', 'brand')
open(os.path.join(B, 'fairway-wordmark.svg'), 'w').write(wordmark(True, 'Fairway Golf Sim'))
open(os.path.join(B, 'fairway-wordmark-word.svg'), 'w').write(wordmark(False, 'Fairway'))
open(os.path.join(REPO, 'icon.svg'), 'w').write(icon())
png(icon(rounded=False), 180, os.path.join(B, 'apple-touch-icon.png'))         # iOS rounds the corners itself
png(icon(), 192, os.path.join(B, 'icon-192.png'))
png(icon(), 512, os.path.join(B, 'icon-512.png'))
png(icon(rounded=False, inset=0.8), 512, os.path.join(B, 'icon-maskable-512.png'))  # inside the maskable safe zone
print('wrote', B)
