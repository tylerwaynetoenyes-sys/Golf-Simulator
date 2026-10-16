# Design and motion handoff

Research only, 16 October 2026. Five X posts and about 80 repos and sites were
reviewed for anything that would make Fairway look, move or feel better. This
file keeps only what passes Fairway's constraints:

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

## Appendix B: How each source was read

- **X posts:** x.com blocks unauthenticated fetches, so all five were read through the public `api.fxtwitter.com` mirror (full text and links).
  - The take-one reply was taken from the brief; the mirror gives only reply counts.
  - The DevDsgn post lists four sites. `designeer.xyz` came from the brief, not the post.
- **GitHub repos:** README, description, licence and last push read through `gh api`, plus specific files where noted: `technique.md`, LottieFiles timing tables, the CCGS skill and hook files, and the Paper Shaders `dist/index.d.ts`.
- **Sites:** refero and designmd-store through WebFetch. typeui.sh and designmd.supply through the built-in browser (Vercel's bot check returned 429 to plain fetches). designeer.xyz was blocked, as described above.
