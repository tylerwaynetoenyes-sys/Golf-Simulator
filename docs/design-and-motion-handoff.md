# Design and motion handoff

Research only, 16 October 2026, in two batches.

- **Batch 1** (sections 1–6): five X posts and about 80 repos and sites.
- **Batch 2** (sections 7–10): 42 more links (asset libraries, pipeline tools, UI galleries), read against the work coming next: post-processing (AO, water reflections, tone mapping, AA), possibly WebGPU, Google Photorealistic 3D Tiles for backdrops, and real course assets.

Both batches look for anything that would make Fairway look, move or feel
better. This file keeps only what passes Fairway's constraints:

- vanilla three.js r186 ES modules, no build step;
- GSAP vendored as a classic script (`vendor/gsap/gsap.min.js`, **3.12.5, core only**);
- the design system (`css/app.css` "Design system v2", `docs/design-direction.md`, `docs/design-notes.md`);
- iPad (Safari, touch) and TV (distance reading) targets.

Everything skipped is listed, with the reason, in the appendix at the end.

## Before anything else: the design docs disagree on the accent

Each source names a different accent colour:

| Source | Accent |
|---|---|
| `css/app.css` (what ships) | `--accent: #ff7a2f`, signal orange |
| `docs/design-notes.md` | `#ffb46b` amber |
| `docs/design-direction.md` | brass `#e6c983` → `#b88d45` |

Every skill below reads the docs, not the CSS, so an agent following them will
produce brass or amber. Item **U1** fixes this. Do it first.

## Top picks, in order

1. **U1** Write one `DESIGN.md` from the CSS tokens, then lint it.
2. **M1** Upgrade GSAP to 3.15 and vendor SplitText, CustomEase and Flip. They are free now.
3. **M3** Run a motion audit with Emil Kowalski's and LottieFiles' motion skills. The first findings are already listed under M3.
4. **M4** Add an odometer digit roll for carry, ball speed and score totals.
5. **T1** Add a deterministic `seek(t)` capture mode. It gives a trailer, a TV attract loop, and contact sheets agents can review.
6. **V1** Paper Shaders for menu and pro shop backdrops and a liquid-metal trophy moment.

**Batch 2, for the post-processing work about to start:**

7. **P1** Anti-aliasing is lost whenever bloom is on. Fix this before adding any pass. It's a one-line render-target change.
8. **P2** Choose the tone mapping first, comparing ACES, AgX and Neutral. Every later pass is tuned against it.
9. **P3–P5** Ambient occlusion, water and AA: these are the r186 passes to use, with iPad costs.
10. **C1** Poly Haven's `grass_bermuda_01` model, plus ambientCG grass and ground sets, for turf and rough close-ups (CC0).

---

## 1. Motion and animation

### M1. Upgrade GSAP and vendor the plugins that are now free
- **Source:** [greensock/gsap-skills](https://github.com/greensock/gsap-skills) (MIT, 16k★). Its README says every former Club plugin (SplitText, MorphSVG and the rest) is now free for commercial use. npm `gsap` is at **3.15.0**.
- **Why Fairway:** `js/ui/motion.js` hand-rolls `splitWords()`, which only splits by word. `docs/design-direction.md` asks for the hole name to come in "letter by letter".
  - **SplitText** does chars, words and lines with masks (`mask: "chars"`), keeps `aria-label` on the parent, and re-splits after Jost loads (`autoSplit`).
  - **CustomEase** lets the CSS curve token `cubic-bezier(.16,1,.3,1)` become one named GSAP ease (`CustomEase.create('fw.out', '.16,1,.3,1')`), so CSS and JS use the same curve.
  - **Flip** handles layout-changing moments: pro shop tile → detail view, scorecard row → expanded hole, shot card ↔ toast.
- **How:**
  1. Copy `gsap.min.js`, `SplitText.min.js`, `CustomEase.min.js` and `Flip.min.js` from the `gsap@3.15.0` npm package's `dist/` into `vendor/gsap/`.
  2. Load them as classic scripts after core, as now.
  3. Call `gsap.registerPlugin(SplitText, CustomEase, Flip)` once in `js/ui/motion.js`.
  4. Swap `splitWords` for `SplitText.create(el, { type: 'words,chars', mask: 'words' })`, and call `revert()` when the card closes.
- **Fit:** UMD globals, no build step. Keep the existing `on()` gate so reduced motion still gets a plain appear.

### M2. Give agents the official GSAP skills
- **Source:** greensock/gsap-skills: `gsap-core`, `gsap-timeline`, `gsap-plugins`, `gsap-utils`, `gsap-performance`.
- **Why:** they encode the rules our code half follows: transforms and `autoAlpha` over layout properties, timelines over chained delays, `killTweensOf`/`revert` cleanup, `gsap.utils.mapRange`/`clamp`/`snap`.
- **How:** copy those five skill folders into `.claude/skills/`. Skip `gsap-react`, `gsap-frameworks` and `gsap-scrolltrigger`, because Fairway doesn't scroll.

### M3. Motion audit against written rules
- **Sources:**
  - [emilkowalski/skills](https://github.com/emilkowalski/skills) (MIT, 46k★; found through the agentic-awesome-skills catalog): `review-animations`, `improve-animations`, `animation-performance`, `apple-design`.
  - [LottieFiles/motion-design-skill](https://github.com/LottieFiles/motion-design-skill) (MIT): Disney's 12 principles for UI, plus timing and easing tables.
- **Why:** both turn "feels premium" into numbers. LottieFiles' tables give:
  - "Premium" durations of 350 / 500 / 800 ms;
  - exits at 65–75% of the entrance duration, eased *in*;
  - durations that scale with distance (50 px = 0.8×, full screen = 1.8–2×);
  - micro-stagger of 20–40 ms under a 200 ms total;
  - material scaling: glass 0.9× with 0% overshoot.

  That last one matches our glass panels exactly.
- **First findings to hand the audit** (checked in the code today):
  - `js/ui/logo.js:71` uses `back.out(1.6)`, an overshoot, against "nothing bounces" in the design direction.
  - The CSS spring token `cubic-bezier(.34,1.56,.64,1)` (in `design-notes.md`, used for presses and the decision sheet) also overshoots. Decide whether glass should overshoot at all. LottieFiles says glass = 0%.
  - Two number tweens do the same job: `countUp` in `js/ui/dom.js:47` (ms-based) and `countTo` in `js/ui/motion.js:72` (GSAP). Fold both into M4.
  - Exits: check that every panel close runs at about 0.7× its entrance with `power2.in`.
- **How:** install `review-animations` and `improve-animations` into `.claude/skills/`, run `improve-animations` over `js/ui/` and `css/app.css`, and treat `DESIGN.md` (U1) as the authority wherever they disagree.

### M4. Odometer digit roll for the numbers that matter
- **Source:** [AbubakrChan/product-launch-motion](https://github.com/AbubakrChan/product-launch-motion), `references/technique.md` (MIT).
- **Why:** "Numbers are the hero", and the design direction says numbers count to their value. A per-digit roll reads as instrument-grade, like TrackMan, where a text tween reads as a counter. Each digit only moves while the digit below it carries.
- **How:**
  - Each digit is a strip `0–9,0` inside a slot clipped vertically (`clip-path: inset(0 -80px)`).
  - Digit `p` shows `floor(v/10^p) % 10 + max(0, (v % 10^p) − (10^p − 1))`, with `v` eased by GSAP to the exact integer.
  - Leading slots fade in as `log10(v)` crosses `p`.
  - Set Jost with `font-variant-numeric: tabular-nums` so slots don't jitter.
  - Use it for carry, total, ball speed and the round total. Replace both existing counters with it.
- **Fit:** DOM and CSS plus one GSAP tween. Reduced motion writes the final value.

### M5. Interruptible springs for indicators, and the stretch trick
- **Source:** the same `technique.md`, which has a closed-form damped spring `stepR(tau, {w, z})` and a `Track` class that sums one spring per target change.
- **Why:**
  - GSAP tweens restart awkwardly when a target changes mid-flight, for example scrolling the club bag fast or flicking the pro shop carousel. A sum of springs is naturally interruptible.
  - **Edge-split stretch:** the leading edge rides a stiff spring and the trailing edge a soft one, with width = right − left. The selection pill in the club bar and the mode pills stretch toward the new item, then settle. It's tactile with no bounce.
- **How:** about 20 lines in `js/ui/motion.js`, driven from the existing frame loop. Use damping 1.0 for text and camera, 0.8–0.9 for indicators. Reduced motion snaps to the target.

### M6. Blur content swaps and pill morphs
- **Source:** product-launch-motion ("one shape, never cut"; the `vis()` helper).
- **Why:** design-direction says "Toasts slide and morph like a pill". The pattern for that:
  - The container springs its width, height and radius.
  - The old text leaves short and early (opacity plus `filter: blur()` up to about 10 px).
  - The new text springs in. Nothing overlaps.

  Use it for the shot card between shots, the lie chip changing state, and toast → toast.
- **How:** Flip (M1) for container geometry, plus a small timeline: out at 0.12 s `power2.in`, in at 0.35 s `fw.out`. Animate `filter: blur` only on small text elements. Blur on large glass panels is expensive on iPad, so use opacity alone there.

### M7. CSS-only text effects for achievement moments
- **Source:** [akaieuan/trickle-UI-kit](https://github.com/akaieuan/trickle-UI-kit) (MIT). The post links `akaieuan/trickle`, which returns 404. The real repo is `trickle-UI-kit`. It has 47 pure CSS-keyframe text effects; they ship as React wrappers, but the mechanisms are plain CSS.
- **Port these mechanisms:**

  | Effect | Mechanism | Fairway use |
  |---|---|---|
  | `ShinyShimmer` | `background-clip: text` with a panning gradient | gold "Birdie", "Eagle", "In the hole" |
  | `UnderlineDraw` | `background-size` sweep | the 1 px rule under titles, which works without GSAP too |
  | `TextReveal` blur mode | blur plus rise | |
  | `HighlighterSweep` | per-word highlight sweep | |

- **How:** copy the keyframes into `css/app.css`, indexing with `--i`, and add a `prefers-reduced-motion` override for each one. `@property` animation works on iPad Safari 16.4+.
- **Fit:** zero JS. Leave out the glitch, VHS, neon and rainbow effects; they're off-brand.

---

## 2. UI/UX

### U1. One `DESIGN.md`, in Google's spec, linted
- **Sources:**
  - [google-labs-code/design.md](https://github.com/google-labs-code/design.md) (28k★): YAML front-matter tokens plus prose rationale, with `npx @google/design.md lint` (structure plus WCAG contrast on token pairs) and `diff`.
  - The DevDsgn post's sites (refero, typeui, designmd.supply, designmd-store) and [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) are all built on this format.
- **Why:** it fixes the accent drift above, and every design and motion skill in this file looks for a `DESIGN.md`. One file replaces two partly stale docs as the thing agents read.
- **How:**
  1. Generate it from `css/app.css`'s `:root` tokens: accent and accent-hi/ink, graphite, ink opacities, semantic lie colours, spacing 4–48, type 12–34, radii 18–28, durations 140/260/480, the two curves, and glass blur and saturation.
  2. Put the "clubhouse after dark" prose and the motion rules from M3 in its body.
  3. Run `npx @google/design.md lint DESIGN.md` and fix any contrast warnings, for example `--accent-ink` on `--accent`, and ink at its lowest opacity on graphite.
  4. Point `design-direction.md` and `design-notes.md` at it, or retire them.
- **Fit:** docs only. Running the linter needs Node, which `tools/` already uses.

### U2. Reference designs worth borrowing from (ideas, not tokens)
- **Sources:**
  - awesome-design-md: PlayStation, Ferrari, BMW M, Raycast, Apple, Oura.
  - Refero Styles: "Raycast, midnight command center", "Apple iPhone 18 Pro, midnight hardware gallery".
  - designmd-store: has Sports, Automotive and Gaming categories, but only Nike is visible in Sports and nothing in the other two.
- **Why:** these are the nearest published systems to a dark, premium, instrument-led product.
  - Ferrari and BMW M configurators are the closest analogue to the pro shop: hero object on black, spec numbers as heroes, one accent.
  - Raycast is the analogue for the dense settings and session panels.
- **How:** read their DESIGN.md files for hierarchy and spacing decisions only. Keep our tokens.

### U3. iPad feel: mobile-native and break-ui
- **Source:** emilkowalski/skills `mobile-native` and `break-ui`.
- **Why:** `mobile-native` lists the exact iPad web failures:
  - sticky `:hover` after a tap;
  - the grey tap-highlight flash;
  - `100vh` vs `dvh`;
  - safe-area insets;
  - inputs zooming the page;
  - laggy taps.

  `break-ui` feeds worst-case data: long player names, three-digit scores, many players on the scorecard, long course and hole names at TV size.
- **How:** run both against the iPad and TV layouts. Wrap hover styles in `@media (hover: hover)`, set `-webkit-tap-highlight-color: transparent`, use `env(safe-area-inset-*)` on edge-docked panels, and keep 44 pt touch targets.

---

## 3. Visuals and shaders

### V1. Paper Shaders for backdrops and trophy moments
- **Source:** [paper-design/shaders](https://github.com/paper-design/shaders) (Apache-2.0, no attribution needed in a game). The vanilla `@paper-design/shaders@0.0.81` ships an ES-module `dist/` with relative imports and no dependencies. It also exports each **fragment shader as a GLSL string** (`grainGradientFragmentShader`, `liquidMetalFragmentShader` and so on).
- **Why Fairway:**

  | Shader | Use |
  |---|---|
  | `grain-gradient`, `static-mesh-gradient`, `paper-texture` | Living graphite backdrops for the launch screen and pro shop, instead of flat black, with the grain we already fake with SVG noise. |
  | `liquid-metal` | Takes a logo or shape. Use the flagstick wordmark or a trophy for hole-in-one, course-record and end-of-round moments. "Gold is earned." |
  | `god-rays` | Low intensity behind the hole number in the curtain (`wipeIn`). |
  | `pulsing-border` | Accent-coloured, slow. The R10 "connecting" state, replacing a spinner. |

- **How, in order of preference:**
  1. **Inside our renderer:** wrap the exported GLSL string in a `THREE.ShaderMaterial` with `glslVersion: THREE.GLSL3` on a full-screen quad, or on the pro shop backdrop plane. Map their uniforms (`u_time`, `u_resolution`, colours) yourself. This costs no extra WebGL context.
  2. **On DOM overlays:** vendor `dist/` to `vendor/paper-shaders/` (pin the version; 0.0.x ships breaking changes) and use `ShaderMount` only on screens where the course isn't rendering (launch, pro shop, results). Each mount is its own WebGL context, so pause it (`speed: 0`) when hidden. iPad caps live contexts.
- **Fit:** reduced motion means `speed: 0`, a static frame. Check the cost against the iPad budget notes before using any of these during play.

---

## 4. Technical

### T1. A deterministic `seek(t)` capture mode
- **Sources:**
  - [whaleyxbt/claude-motion](https://github.com/whaleyxbt/claude-motion) `sims/` (MIT): three.js pages where `render(t)` is a pure function of time, captured frame by frame at 60 fps.
  - [howseen-ai/claude-motion-design](https://github.com/howseen-ai/claude-motion-design) (MIT): Playwright waits for fonts, pauses Web Animations and waits two rAFs after each seek, then renders N subframes per frame on a 180° shutter, blended with ffmpeg `tmix`.
  - product-launch-motion: the same idea.
- **Why Fairway:** one mechanism gives three things.
  1. **A trailer** for the App Store, the site and socials: real hole flyovers and ball flights at 60 fps with true motion blur, independent of how fast this Mac renders.
  2. **A TV attract mode:** a seamless loop of flyovers when idle.
  3. **Motion QA:** see T2.
- **How:**
  - Add `?capture=1`. It replaces the frame clock with an injected `t`: the game loop's `dt`, `performance.now`, physics stepping at fixed 1/240 s substeps, and the camera rig.
  - GSAP UI follows with `gsap.ticker.lagSmoothing(0)`, `gsap.globalTimeline.pause()` and `totalTime(t)` per frame.
  - A `tools/capture.mjs` (Playwright, which `tools/perf.mjs` already uses) calls `window.__seek(t)`, screenshots, and pipes into ffmpeg.
  - Check first that `js/core/physics.js` gives the same flight for the same launch data at a fixed step. That wasn't verified in this review, and replays and capture both depend on it.

### T2. Contact sheets so agents can review motion
- **Source:** claude-motion's review loop, which renders one timestamped still per beat and tiles them into a contact sheet for the agent to check.
- **Why:** agents can't watch the hole curtain or the shot card, but they can read a contact sheet. It lets an agent verify:
  - clipping inside masks;
  - text collisions;
  - TV safe area;
  - legibility at 1080p from a sofa;
  - that reduced motion really collapses to fades.
- **How:**
  - With T1, capture the hole intro at t = 0, .05, .1, .2, .35, .6, 1.0 s and tile them with ffmpeg `tile=7x1`.
  - Store reference sheets under `docs/screenshots/motion/`, and diff them in review alongside `tools/holes-check.mjs` and `tools/perf.mjs`.

### T3. Synthesised, levelled UI sound
- **Sources:**
  - claude-motion `sfx/` (MIT): pure-Python stdlib generators for click, tick, pop, whoosh, chime, riser and pad, with mastering to −14 LUFS.
  - [Barty-Bart/motion-graphics](https://github.com/Barty-Bart/motion-graphics) `skills/sound-effects/sfx/`: a **CC0** SFX set.
  - product-launch-motion's audio notes: place each sound by its own measured peak.
- **Why:** design-direction says "UI ticks stay quiet and dry; the radio ducks under big moments". Generating ticks and whooshes ourselves gives licence-free sounds we can tune to Fairway, and measuring loudness puts UI, radio and ambience on one scale.
- **How:**
  - Generate a small set (panel open/close, club tick, toast, achievement chime in the key of the radio bed) as files in `assets/audio/`, played by the vendored Howler.
  - Level every file with `ffmpeg -af ebur128=peak=true`: UI around −24 LUFS short-term, under the radio.
  - Record the CC0 and generated sources in `docs/SOURCES.md`.

### T4. Soak test and an honest "no data" verdict
- **Source:** [Donchitos/Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) (MIT): `skills/soak-test` and the "NOT ASSESSED" rule in `skills/perf-profile`.
- **Why:**
  - The iPad budget is the live risk. A full 18-hole round, plus range sessions and hole transitions, is where heap growth, texture leaks and frame-time drift show up, and a single-hole `perf.mjs` run can't see them.
  - The NOT ASSESSED rule: a check that found nothing to measure must say "could not run", not pass green.
- **How:**
  - Add a `tools/soak.mjs` that plays 18 holes headless and logs, per hole:
    - `performance.memory` (or `measureUserAgentSpecificMemory`);
    - `renderer.info.memory.geometries` and `.textures`;
    - median and peak frame time.

    Flag monotonic growth.
  - Make `perf.mjs`, `holes-check.mjs` and `equipment-check.mjs` print `NOT ASSESSED` when their inputs are missing.

### T5. Asset-budget hook
- **Source:** Claude-Code-Game-Studios `hooks/validate-assets.sh`. It's a PostToolUse hook: exit code 2 feeds the problem back to Claude, while exit 1 only reaches the user.
- **Why:** sessions add GLBs often (cup, clubs, balls, buildings). `docs/tools-review.md` sets budgets of ≤40k triangles for landmarks and ≤3k for props, but nothing enforces them.
- **How:** a hook on writes under `assets/models/` that reads the GLB's accessor counts with a small Node script and exits 2 when a file is over budget. Hooks change `.claude/settings.json`, so you approve that file.

---

## 5. Assets and media

### A1. A launch film made from the game itself
- **Sources:** product-launch-motion v2, claude-motion-design, [talsiach/take-one](https://github.com/talsiach/take-one) (MIT; the reply in the first post), [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) (Apache-2.0).
- **Why:** none of these belong in the game, but a trailer is the cheapest way to show "better than GSPro". Their rules are what make such films look expensive:
  - music first, cut on a measured beat grid;
  - one hero element that never cuts;
  - real numbers on odometers;
  - every SFX placed on its peak.
- **How:**
  - Use T1 for the in-game shots.
  - Build the title and stat cards in Fairway's own tokens (Jost caps, orange rule, glass and grain) as plain HTML with `seek(t)`.
  - HyperFrames is the closest renderer to our stack, since it uses HTML and seekable GSAP timelines, if a ready-made pipeline is preferred.
  - take-one adds a pitch → storyboard → review-room loop, and asks before spending on image or video models.
  - All of these run locally with Node, Playwright and ffmpeg (claude-motion also needs Python 3). Nothing ships with the game.

---

## 6. Tooling and agents

| # | What | Use for Fairway | Note |
|---|---|---|---|
| G1 | [madebymustafa/design-taste](https://github.com/madebymustafa/design-taste) (MIT): `taste-motion`, `taste-gsap`, `taste-design-review`, `taste-accessibility`, and the `quiet-luxury` / `dark-tech` packs | `taste-gsap` covers `gsap.matchMedia()` gating for reduced motion and refreshing after fonts load. `taste-design-review` is a severity-ranked audit (Nielsen heuristics plus WCAG). The two packs are close to "clubhouse after dark". | Install only these four skills. The packs are landing-page oriented, so tell the agent `DESIGN.md` wins. |
| G2 | Claude-Code-Game-Studios (MIT, 27k★): cherry-pick `playtest-report`, `ux-review`, `perf-profile`, `soak-test`, and the `accessibility-specialist` and `technical-artist` agents | Structured playtest notes after R10 sessions. Accessibility checks for remapping, colour-blind lie colours and text scaling at TV distance. | Don't adopt the whole studio. It targets Godot, Unity and Unreal, and its 12 hooks and gate process would clash with the current `.claude/` setup and the parallel-session workflow. |
| G3 | [garrytan/gstack](https://github.com/garrytan/gstack) (MIT): `/design-shotgun`, `/plan-design-review`, `/freeze` | `/design-shotgun` makes 4–6 variants on a comparison board, for example for the pro shop, scorecard or results screen. `/freeze` locks edits to one directory, which helps when several sessions edit the repo at once. | Cherry-pick the skills. `/browse` wants the Aside browser, and the built-in browser and Playwright already cover that. |
| G4 | emilkowalski/skills `prototype` | Builds several versions of one UI piece with a switcher, for example the shot-card layout. | Same install as M3. |
| G5 | [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) (MIT) or [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) (Apache-2.0) | A local, auto-synced code graph of `js/`, so each new session finds `motion.js`, `renderer.js` or `courseWorld.js` without re-reading the tree. | Optional; it pays off with many parallel sessions. Local only, no code leaves the machine. |
| G6 | [microsoft/markitdown](https://github.com/microsoft/markitdown) (MIT) | Turns course scorecards and yardage-book PDFs into Markdown before `tools/import-course.mjs`. | Optional, a one-off tool. |
| G7 | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (MIT) | Lists Three.js among its 22 stacks, with 119 UX rules (cancellable interactions, resilient text layout). Use as a lookup during U3. | Optional; it overlaps M3, U3 and G1. |

---

# Batch 2

**Already covered in batch 1.** These links were in batch 2 too. They're marked here and not repeated:

| Link | Where it's covered |
|---|---|
| github.com/talsiach/take-one | A1 |
| superdesign, better-design, canvas-ui | Appendix A |
| design-taste | G1 |
| styles.refero.design, designmd-store.com | U2 |
| typeui.sh, designmd.supply, designeer.xyz | Appendix A |
| gsap.com | M1, M2: GSAP is free, including all plugins |
| motion-primitives.com | Appendix A, the React kit |
| remotion.dev | Appendix A, React and licence |
| ffmpeg.org | T1, T2, T3, A1 |

## 7. Post-processing, WebGPU and 3D Tiles

`js/scene/renderer.js` today:

- `WebGLRenderer({ antialias: true })` with ACES Filmic tone mapping at exposure 1.05;
- an `EffectComposer` chain: RenderPass → Sanitize → UnrealBloom → OutputPass → Grade;
- `vendor/three/addons/postprocessing/` holds only EffectComposer, MaskPass, OutputPass, Pass, RenderPass, ShaderPass and UnrealBloomPass.

Source for everything in this section: [threejs.org](https://threejs.org) r186 (MIT). The file names were checked against the `r186` tag on GitHub.

### P1. Get anti-aliasing back when bloom is on (do this first)
- **What's wrong:**
  - `new EffectComposer(this.renderer)` creates its own render target with no `samples`, and `renderer.js:129` renders through the composer whenever `quality.bloom` is set.
  - The canvas's `antialias: true` only applies to the default framebuffer, so **with bloom on, the scene renders without MSAA.**
  - Flagsticks, the club shaft, the cup rim, tree silhouettes and building edges all shimmer.
- **Fix:** pass `new THREE.WebGLRenderTarget(w*pr, h*pr, { type: THREE.HalfFloatType, samples: 4 })` as the composer's second argument, and resize it in the existing `setSize`. Then drop `antialias: true` from the context so MSAA isn't paid twice.
- **iPad:** use 4× samples on the Mac and TV and 2× on iPad, or SMAA (P5) if 2× costs too much. Measure with `tools/perf.mjs`.

### P2. Choose the tone mapping before tuning anything else
- **Options in r186:** `AgXToneMapping` and `NeutralToneMapping` (Khronos PBR Neutral) are in the vendored `three.core.js` next to the ACES Filmic in use now.
- **Why:**
  - ACES pushes saturated greens toward yellow and crushes highlights. That hurts fairway versus rough contrast and the orange accent on in-world objects (the flag, tee markers).
  - **Neutral** keeps base colours close to the authored values, which suits the photographed Poly Haven textures and the course greens.
  - **AgX** handles bright skies best (sunsets, HDRIs) at the cost of some saturation.
- **How:**
  - Give quality settings a toggle and capture the same five shots under each curve with T1 and T2: the tee, the fairway at noon, a green close-up, the sunset course and the water hole.
  - Pick one, then retune `toneMappingExposure` and the Grade pass once.
  - AO, bloom and water reflection strength all depend on this choice.

### P3. Ambient occlusion
- **WebGL path:** `examples/jsm/postprocessing/GTAOPass.js`, demoed in `webgl_postprocessing_gtao.html`. It grounds the ball, tee, cup, divots, bunker lips, trees and buildings, which is where the "floating prop" look comes from.
- **WebGPU path:** `tsl/display/GTAONode.js`, with `DenoiseNode` (`webgpu_postprocessing_ao.html`).
- **How:**
  - Copy `GTAOPass.js` and its shader imports (`shaders/GTAOShader.js`, `shaders/PoissonDenoiseShader.js`, `shaders/CopyShader.js`, `math/SimplexNoise.js`; SMAA needs `shaders/SMAAShader.js`) into `vendor/three/addons/`. Keep the paths, because the import map already resolves `three/addons/`.
  - Run it at half resolution, before bloom.
  - Grass tufts and instanced crowds should write depth but not drive AO strongly. Clamp the radius to about 0.5 m so distant terrain isn't darkened.
  - On iPad, consider baked AO in the Blender props (cup, tee, pin, divots), which is free at runtime, and screen-space AO on Mac and TV only.

### P4. Water reflections
- **Options:**
  - `objects/Water.js` (`webgl_shaders_ocean.html`): a planar mirror plus normal-map ripples and sun glint.
  - `objects/Reflector.js`: a plain planar mirror.
  - `postprocessing/SSRPass.js`: screen-space reflection, WebGL.
  - `tsl/display/SSRNode.js`: SSR on WebGPU (`webgpu_postprocessing_ssr*.html`).
- **What fits Fairway:** ponds and lakes (Sawgrass 17, the Confluence and the rivers) are flat, so a **planar reflector** is the right tool and cheaper than SSR. But each planar reflector **renders the scene a second time**, the same problem the iPad notes record for the lie magnifier.
- **How:**
  - One `Water.js` or `Reflector` per visible water body, at a reflection target of ¼–½ resolution.
  - The reflection camera on a layer mask: sky, trees, landmarks and buildings, with no grass, crowd or ball trail.
  - On iPad, an env-map-only fallback: reflect the HDRI with no scene re-render.
  - Reuse the frame's shadow map, as `renderLieView` already does.
  - Hole one-shot: SSR (WebGPU) only if P6 happens, and only on Mac and TV.

### P5. Anti-aliasing without MSAA
- **Options:** `postprocessing/SMAAPass.js` (`webgl_postprocessing_smaa.html`), `TAARenderPass.js` (`webgl_postprocessing_taa.html`), and on WebGPU `SMAANode` / `TRAANode`.
- **Use:** SMAA is the cheap fallback when P1's MSAA costs too much on iPad. TRAA gives the best still-camera quality on the address view, but ghosts on the fast ball flight. Use it only while the camera is static, or not at all.

### P6. WebGPU: wait for now
- **Why wait:**
  - r186's WebGPU path (`three.webgpu.js` plus TSL `display/` nodes: GTAO, SSR, SSGI, TRAA, SMAA, Bloom, Lut3D, Denoise) would replace the whole `EffectComposer` chain and the custom `SanitizeShader` and `GradeShader`, and every custom `ShaderMaterial` would have to be ported to TSL or node materials.
  - WebGPU is in Safari 26 and iPadOS 26, which canvas-ui's support table and three's docs both cite. Older iPads fall back to WebGL2 through `WebGPURenderer`'s backend switch, and then the TSL passes run on WebGL2 anyway.
- **Recommendation:** finish P1–P5 on WebGL first.
  - Try WebGPU later on a branch behind `?gpu=webgpu`, starting with the static-camera scenes (the pro shop, the hole intro).
  - The trigger to switch is SSGI or SSR being wanted on Mac and TV, not AO alone.
  - `three.webgpu.js` isn't vendored yet. It's a single ES-module file next to `three.module.js`, so the no-build constraint is fine.

### P7. Google Photorealistic 3D Tiles for backdrops: not in the links
- **Note:** none of the batch-2 links cover 3D Tiles; three.js has no tiles loader of its own. The standard route is NASA-AMMOS **3DTilesRenderer** (Apache-2.0, vanilla ES modules, `GoogleCloudAuthPlugin`).
- **Flag before building:** Google's Map Tiles API terms require:
  - an API key with billing;
  - the Google logo and data attributions shown on screen;
  - **no offline caching or pre-baking of tiles**.

  That clashes with "vendored for offline play" (the note in `vendor/three/VERSION`) and with baking backdrops.
- **What fits:** live-streamed backdrops beyond the course boundary only, with a fallback to the existing LiDAR buildings and DEM when offline. Do a separate licence review first.

## 8. Course assets, with licences

Fairway already uses both big CC0 libraries (`docs/SOURCES.md`): Poly Haven HDRIs, PBR textures, rocks and `island_tree_02`, plus ambientCG painted steel, red brick and chain-link fence. New, specific picks:

### C1. Poly Haven (polyhaven.com): CC0, no credit required
- **Turf close-up:** model `grass_bermuda_01`. Bermuda is the real turf of southern US courses (Sawgrass).
  - Use it as the source for the 9000-tuft near-ball patch (`courseWorld._nearGrassAt`) and for the lie magnifier.
  - Decimate in Blender to card clusters under 300 triangles per tuft. `grass_medium_01` and `_02` work for rough.
- **Trees:** `jacaranda_tree`, `island_tree_01/03`, `fir_tree_01`, `pine_tree_01`, `fir_sapling`, `pine_sapling_*`, plus `pine_roots`, `boulder_01`, `moss_01` and `dandelion_01` for tree bases and rough edges.
  - Use them as the hero LOD of the instanced trees in `assets/models/trees/`.
  - Distant trees should stay billboards or low LODs.
- **Terrain textures:** the API lists 131 "terrain", 60 "sand" and 30 "aerial" textures.
  - "Aerial" sets are made for distant ground seen from height, which fits the flyover, the hole intro orbit and backdrop terrain beyond the course.
  - Sand textures can replace `sand_detail.jpg` in bunkers at the address view.
- **Pipeline:** the existing Blender MCP and `tools/blender/` (the "Blender add-on" Poly Haven links on its site). Fetch over `api.polyhaven.com` (`/assets?t=models&c=nature`, `/files/<id>`).

### C2. ambientCG (ambientcg.com): CC0
- **Grass:** `Grass001`–`Grass008`, and `Ground037`, `Ground075`, `Ground003`. Tiling PBR sets (colour, normal, roughness, AO) for the fairway, rough and fringe ground material under the tufts.
- **Sand:** `Ground054`, `Ground078`–`Ground080`, `Ground093A/C`, `Ground097`, `Ground102`. Compare with Poly Haven `sand_01` for bunkers.
- **Fix the known mismatch:** `docs/SOURCES.md` says the `metal_plate` and `red_bricks_02` ids load ambientCG Metal032 and Bricks059, which are wrong for painted steel and red brick. Better candidates: `PaintedMetal001`, `004`, `006`, `011`–`013`, `016`, `017`, and the `Bricks*` series. Check them visually before swapping.
- **API:** `ambientcg.com/api/v2/full_json?type=Material&q=grass`.

### C3. Quaternius (quaternius.com): CC0, but the wrong style
- Low-poly stylised packs: nature, animated characters, city kits and the "Universal Animation Library". The look clashes with Fairway's photoreal Poly Haven, LiDAR and Blender direction, so don't use the meshes on the course.
- **One possible use:** the rigged, retargetable "Universal Animation Library" clips (idle, walk, cheer) on the **crowd and gallery people** at distance, where silhouette motion matters more than the mesh. Check them against the MakeHuman bodies already in use.

### C4. 3dicons (3dicons.co): CC0
- 1,440+ Blender-rendered 3D icons, with a CC0 GitHub repo `realvjy/3dicons`.
- **Use:** possibly achievement badges in the pro shop or results, re-rendered in Fairway's graphite and orange using their `.blend` sources.
- **Note:** the pro shop already shows real Blender models, which beat icons. Low priority.

### C5. Blender (blender.org): GPL, the tool not the output
- Fairway's pipeline already runs on it. 5.3 is in beta. The memory note says headless Cycles bakes must run on CPU from Claude's shell.
- **Nothing new to adopt.** Bake AO into the small props for P3 on iPad.

## 9. Pipeline tools

| # | Tool | Use for Fairway | Fit |
|---|---|---|---|
| T6 | [svgo](https://github.com/svg/svgo) (MIT, Node CLI) | Shrinks `assets/brand/*.svg` and `assets/art/piasa-wright-1898.svg`, and any inline SVG icons, before they ship. Run `npx svgo -r assets/brand assets/art --multipass`. | A dev tool. Keep `viewBox`, and keep the IDs GSAP targets in `logo.js`. |
| T7 | [Fontsource](https://fontsource.org) (OFL fonts, self-host) | Jost is already bundled as `jost-latin-wght.woff2`. The latin subset already covers é, è, à and ç. Add Fontsource's **latin-ext** Jost (`@fontsource-variable/jost`) only if a name needs œ or other Latin Extended characters. Grep the course and hole names first. | Low priority. Copy the woff2 into `assets/fonts/` and add a `unicode-range` `@font-face`. |
| T8 | [Lucide](https://lucide.dev) (ISC, 1,891 icons) | One consistent 1.5 px-stroke icon set for settings, R10 status, the camera and the pro shop, if the UI still draws icons ad hoc. | Copy individual SVGs inline with `stroke="currentColor"`. No package needed. |
| T9 | [Penpot](https://penpot.app) (MPL-2.0, open MCP server) | Optional. A design file for screens (pro shop, scorecard, results) that agents can read through MCP, so they work from layouts, not prose. It pairs with U1's DESIGN.md. | Off-repo. Only worth it if someone designs screens before code. |
| T10 | [Excalidraw](https://excalidraw.com) (MIT) | Storyboards for T1 trailers and motion sketches for the hole intro, which are clearer than text briefs. gstack's `/diagram` (G3) already outputs `.excalidraw`. | Off-repo. |
| T11 | [Audacity](https://www.audacityteam.org) (GPL) | Hand-edit and trim the generated or CC0 UI sounds from T3 (fades, noise removal), then level them with ffmpeg `ebur128`. | Off-repo. |

## 10. UI inspiration and component sites

Of the 25 sites, only these give Fairway something specific.

### I1. liquid-glass (glass.samasante.com, `samasante/liquid-glass`, MIT): the right technique for panels over the 3D canvas
- **What it found:** "liquid glass" that bends the live page needs `backdrop-filter: url()`, which **works only in Chrome and Edge**. Safari and iPad get frost, tint and edge light, but no refraction.
  - To refract anything in Safari it has to "refract a copy". Its `src`/`draw` + `lenses` mode does that on the GPU for a `<canvas>` or `<video>`.
- **Fairway's case:** our glass panels float over a WebGL canvas, so the copy already exists as the composer's render target.
- **How (later):**
  - A "lens" pass at the end of the post chain receives the screen rects and radii of open glass panels (shot card, club bar, toasts) as uniforms.
  - It refracts and blurs the scene inside those rects with a bright rim, and the DOM panel above becomes transparent text and hairlines only.
  - This is real refraction on iPad Safari. It also costs less than CSS `backdrop-filter: blur(24–32px)`, which recomposites the canvas every frame.
  - Port the optics (displacement profile, rim light) from its source. It's a React lens, but the maths isn't React-specific.
- **Fit:** prototype only after P1–P2. Measure against today's backdrop-filter cost on iPad.

### I2. mapcn (mapcn.com doesn't connect; the project is `AnmolSaini16/mapcn`, homepage mapcn.dev)
- shadcn-style React wrappers over **MapLibre GL JS** (BSD-3, vanilla, ships a UMD/ES build).
- **Use:** a dark, graphite-styled course-select map. St. Louis courses, Paris, Cassis, Pebble and Sawgrass become pins, and choosing one flies the map in before the hole intro orbit.
- **How:** use MapLibre directly, without mapcn, with an OSM-derived vector style recoloured to the design tokens, and copy mapcn's marker, popover and fly-to patterns. Courses already come from OSM, with attribution in `docs/SOURCES.md`.
- **Fit:** vendor `maplibre-gl.js` and the CSS. Tiles need a source (self-hosted PMTiles works offline).

### I3. appshot.gallery: App Store screenshots
- **Use:** for the eventual App Store listing (iPad), filter by Games and Sports.
- **Pairs with:** T1 capture for real in-game frames, framed in Fairway's type. Reference only.

### I4. 404s.design (filter: Game, Dark, 3D)
- **Use:** ideas for the "course failed to load" and "R10 not found" empty and error states. Keep the design-notes rule: plain language, one primary action.

### I5. Scrolltide (scrolltide.co): already the source of `design-direction.md`
- Its Components and Shaders pages were the original references for glass, grain, bento and morphing pills. It's now a paid library ($299 lifetime, early access), and nothing new is free.
- **Duplicate:** V1 (Paper Shaders) and M6 (morphing pills) cover what it offered.

### I6. Kage (kage.design)
- Real product UIs tagged by style. The **Dark (204)**, **Glass (7)**, **Bento (40)**, **Stats (63)** and **Gaming (3)** filters are worth a pass when designing the results and scorecard screens.
- **Use:** take a reference screenshot into the U1 or G3 `/design-shotgun` loop. It's reference only, since its "turn into a prompt" output targets Next.js and Tailwind.

### I7. Charlie Hills, "16 Stripe-style animations"
- **Read:** only the public part. The style file, the motion brief and the 16 scene prompts are behind a free email subscription, which I didn't sign up for.
- **Usable from what is public:**
  - **one style file plus one motion brief, reused for every scene, with only a one-line scene prompt changing per animation**;
  - loops of exactly 6 seconds, seamless;
  - the brand's colours, corners and motion kept, never its logo or paid font.
- **For Fairway:** that's the T1 and A1 trailer and attract-mode workflow. U1's DESIGN.md is the style file, M3's rules are the motion brief, and each attract-loop card ("Carry 287", "Sawgrass 17", "Hole in one") is one scene line.

---

## Appendix A: Not useful, and why

**RoundtableSpace, motion design (15 repos plus the reply)**
- **charlie947/motion-graphics-skills, nateherkai/hyperframes-student-kit** (now `herk-edit-kit`), **Barty-Bart/motion-graphics** (except its CC0 SFX, see T3), **cth9191/animate**: footage editing, talking-head reels, B-roll and explainer shorts. None of it touches gameplay or the game UI; A1 covers what a trailer needs.
- **haidrrrry/claude-remotion-skill, remotion-dev/remotion, remotion-dev/skills**: React. Remotion's licence also needs a paid company licence above three people. HyperFrames or plain `seek(t)` HTML (A1, T1) do the same without React.
- **motiondivision/motion, 199-biotechnologies/motion-dev-animations-skill**: a second animation engine next to GSAP. Its vanilla `animate()` would work without a build, but GSAP already covers it, and the spring we'd want is 20 lines (M5).
- **Remaining motion repos:** used above (product-launch-motion, claude-motion-design, claude-motion, hyperframes, gsap-skills, LottieFiles, take-one).

**RoundtableSpace, UI design (10 repos)**
- **superdesigndev/superdesign:** archived IDE extension (the product moved to a web app), AGPL plus commercial files, and it generates web mockups. Not needed.
- **marvkr/better-design:** a shadcn/Tailwind registry plus an MCP server with SaaS brand themes. React-first. Its WCAG review rules overlap U1's linter and G1.
- **DavidHDev/canvas-ui:**
  - MIT **plus Commons Clause**, so it can't be sold as part of a paid product.
  - Its main effects need Chrome's HTML-in-canvas flag; iPad Safari gets only a fallback.
  - The three.js "object" effects (glass, particle) are toy-grade next to our renderer.
- **ui-layouts/ui-layouts, ui-layouts/cursify:** React, Tailwind and framer-motion. Cursor effects are meaningless on iPad and TV.
- **Hyperiux:** the linked `Hyperiux-Immersive/Hyperiux` returns 404. The real repo is `Hyperiux-Immersion-Labs/hyperiux-components`: Next.js only, and most effects are Pro (paid).
- **ibelick/motion-primitives:** React, motion and Tailwind. Its ideas (animated and sliding numbers, text effects) are covered by M4 and M7.
- **Trickle UI Kit:** used (M7). The linked `akaieuan/trickle` returns 404; the real repo is `akaieuan/trickle-UI-kit`.

**TeddyinMedia: Claude-Code-Game-Studios.** Only cherry-picked (G2, T4, T5). The full 49-agent, 72-skill install is engine-specific (Godot, Unity, Unreal) and process-heavy for a one-person three.js project.

**DevDsgn: DESIGN.md sites**
- **typeui.sh:** paid TypeUI Creative and Insights (Flowbite's team) plus website analytics. Its design prompts are web-landing oriented; U1 and G1 cover the need for free.
- **designmd.supply:** auto-generates a Google-format DESIGN.md from any public domain (the Fortune-100 list). Useful only for reading competitors' sites. The format is what we take (U1).
- **styles.refero.design, designmd-store.com:** used only as reference reading (U2).
- **designeer.xyz:** **not opened.** The Vercel bot check blocked the fetch, and this network's security filter (Spectrum Security Shield) flagged the domain as "Suspicious Site Blocked". I didn't try to get around that. It also isn't in the DevDsgn post, which lists only the other four.

**Charlie Hills vault: harnesses**
- **affaan-m/ECC, ruvnet/ruflo, code-yeongyu/oh-my-openagent, NousResearch/hermes-agent:** whole agent harnesses or swarms. They replace how Claude Code runs and add nothing to the game.
- **farion1231/cc-switch, openai/codex, cline/cline, openinterpreter/openinterpreter:** other agents or agent switchers. Nothing for Fairway.
- **JuliusBrussee/caveman, rtk-ai/rtk:** token savings, not game quality.
- **thedotmack/claude-mem:** Claude Code's file memory already covers this.
- **nexu-io/open-design:** a collaborative web design workspace. Overlaps G3 and G4, and it's for websites, decks and apps, not a three.js game.
- **addyosmani/agent-skills, obra/superpowers:** general engineering discipline (TDD, planning). Good practice, but no design or motion content beyond what `docs/design-notes.md`'s working rules already say.
- **Egonex-AI/Understand-Anything:** an interactive graph for learning a codebase. G5 covers the useful part.
- **VoltAgent/awesome-design-md, Graphify-Labs/graphify, colbymchenry/codegraph:** used (U2, G5).

**Charlie Hills vault: skills, connectors, design and tools**
- **Shubhamsaboo/awesome-llm-apps, LibreChat, langgenius/dify, stanfordnlp/dspy, f/prompts.chat:** LLM app and prompt frameworks. The game doesn't use an LLM at runtime.
- **sickn33/agentic-awesome-skills:** a catalog, not a tool. Skimmed; it led to emilkowalski/skills (M3) and CloudAI-X/threejs-skills.
- **CloudAI-X/threejs-skills:** basic three.js recipes (EffectComposer, bloom, SMAA). Fairway is past that, and the repo has **no licence**.
- **punkpeye/awesome-mcp-servers:** skimmed. Its game-relevant entries are Blender MCPs, already connected in this setup, and Playwright MCPs, which the `tools/` scripts don't need because they drive Playwright directly.
- **bytedance/UI-TARS-desktop, lightpanda-io/browser** (AGPL): computer-use and headless-browser agents. Playwright and the built-in browser already cover testing.
- **heygen-com/hyperframes:** used (A1).
- **msitarzewski/agency-agents:** its Game Development division (game designer, technical artist, audio engineer) is generic persona prompts, weaker than G2's.
- **github/spec-kit, DietrichGebert/ponytail:** spec-driven development and "write less code" persona. Process only.
- **OpenCut-app/OpenCut:** a video editor app. A1 renders straight from code.
- **charlie947/** (social-media-skills, ai-second-brain, agent-harness-starter, show-me, life-automation-skills, exposure-audit): marketing, personal-knowledge and admin automation. Nothing for the game.
  - exposure-audit (scans for leaked API keys) is a sensible one-off: the repo has `tools/elevenlabs.mjs` and `tools/gen-tripo.mjs`, which use API keys. But that's security hygiene, not game quality.
- **The 278-repo vault** (`charliehills.substack.com/p/resource`): **not readable.** The list is behind a Substack paywall ("Subscribe and it unlocks below"), so I skimmed agentic-awesome-skills and awesome-mcp-servers in its place.

**Batch 2: dropped links**
- **React and Tailwind component libraries:** [ui.shadcn.com](https://ui.shadcn.com), [ui.aceternity.com](https://ui.aceternity.com), [magicui.design](https://magicui.design), [21st.dev](https://21st.dev), [uiable.com](https://uiable.com) (paid shadcn system), [microkit.co](https://microkit.co).
  - All need React, Tailwind and Motion and are aimed at landing pages: heroes, pricing, testimonials.
  - Effects worth having from them (number tickers, shimmer text, border beams, "liquid & metal" shaders) are already covered framework-free by M4, M7 and V1.
- **[uiverse.io](https://uiverse.io):** MIT HTML/CSS snippets, community-made and inconsistent in quality. Fine for a one-off loader idea, but nothing beats building to our own tokens.
- **[kinetics.colorion.co](https://kinetics.colorion.co):**
  - 162 CSS and React spring examples. Most use the same overshooting `cubic-bezier(0.34, 1.56, 0.64, 1)` that M3 already questions for glass.
  - Its magnetic-button and cursor effects are meaningless on iPad and TV.
  - Its sub-pages (`/spring-guide`, `/about`) return 404.
- **Web-design galleries:** [minimal.gallery](https://minimal.gallery), [component.gallery](https://component.gallery), [navbar.gallery](https://navbar.gallery), [footer.design](https://footer.design), [cta.gallery](https://cta.gallery). They cover marketing-site parts (navbars, footers, CTAs) that a full-screen game doesn't have. component.gallery's design-system references overlap U1 and U2.
- **[designmd.ai](https://designmd.ai):** a community DESIGN.md directory with an MCP and CLI. It duplicates U1 and U2. Its `/format` page returns 404; use Google's spec instead.
- **[vibeprompts.dev](https://vibeprompts.dev):** Tailwind layout prompts for SaaS sections (pricing, FAQ, testimonials). Nothing for a game HUD.
- **[kitbitz.art](https://kitbitz.art):** CC0, but hand-drawn illustrations are off-brand for "clubhouse after dark".
- **[remotion.dev](https://remotion.dev):** see batch 1 (React, company licence).
- **[gsap.com](https://gsap.com):** confirms "GSAP is now free for everyone", which is M1.
- **[threejs.org](https://threejs.org):** used in section 7.
- **[blender.org](https://blender.org):** C5.
- **[ffmpeg.org](https://ffmpeg.org):** already in T1–T3.

## Appendix B: How each source was read

- **X posts:** x.com blocks unauthenticated fetches, so all five were read through the public `api.fxtwitter.com` mirror (full text and links).
  - The take-one reply was taken from the brief; the mirror gives only reply counts.
  - The DevDsgn post lists four sites. `designeer.xyz` came from the brief, not the post.
- **GitHub repos:** README, description, licence and last push read through `gh api`, plus specific files where noted: `technique.md`, LottieFiles timing tables, the CCGS skill and hook files, and the Paper Shaders `dist/index.d.ts`.
- **Batch 2 sites:** 38 links fetched as text with a Safari user agent.
  - **kage.design:** the shell fetch failed, so it was read in the built-in browser.
  - **uiverse.io:** returned a Cloudflare "you have been blocked" page (403) to the fetch. In the built-in browser it loaded, but only a shell of text, so its content was judged from its known format (MIT community HTML/CSS snippets).
  - **mapcn.com:** didn't connect, from the shell or the built-in browser (DNS resolves, no response). The project was found on GitHub instead (`AnmolSaini16/mapcn`, homepage mapcn.dev).
  - **designeer.xyz:** still not opened, same block as batch 1.
  - **Charlie Hills' Stripe post:** only its public part was read; the rest needs a free email subscription.
  - **Poly Haven and ambientCG:** asset names come from their public APIs (`api.polyhaven.com/assets`, `/categories`; `ambientcg.com/api/v2/full_json`).
  - **3dicons:** licence from its About page and the `realvjy/3dicons` repo (CC0).
  - **liquid-glass:** details from its GitHub README.
  - **three.js:** file names checked against the r186 tag tree on GitHub. `EffectComposer`'s default render target (no `samples`) was read in `vendor/three/addons/postprocessing/EffectComposer.js`.
- **Sites:** refero and designmd-store through WebFetch. typeui.sh and designmd.supply through the built-in browser (Vercel's bot check returned 429 to plain fetches). designeer.xyz was blocked, as described above.
