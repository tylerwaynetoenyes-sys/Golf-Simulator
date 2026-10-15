# Handoff: where the work stands and what comes next

Read this first. It carries the context from the earlier (cloud) sessions.

## The project

A premium browser golf simulator, being renamed **Fairway** (formerly "Alton
Range"). Three.js r186 (vendored in `vendor/three`, import map, no build
step), vanilla ES modules. A Python Garmin R10 bridge (`bridge/`, a port of
10over) serves the game at http://localhost:8765; `?tv` for TV mode, `--lan`
for iPad play.

```
launcher/fairway.sh             # or double-click Fairway on the Desktop (see PLAY.md)
```

**Must keep working:** the R10 bridge, multiplayer (1–6 players, teams), the
putting rings (gold = 1-putt, white = 2-putt, no putting mode), mulligans and
the water decision, day/night and weather, TV mode.

## House rules (from Tyler)

- Commit and push to branch `claude/cool-franklin-d8mslp`. No PR unless asked.
- Never put model identifiers in commits. End every commit message with the
  Claude Code co-author/session lines the session gives you.
- Complete all the work; don't stop early. When something needs Tyler's
  input, give a multiple-choice question.
- Research for real (concrete data, real references), use Tyler's photos, and
  do your own homework too.
- Professional golf language only (no jokes in UI copy or commentary).
- End each round by confirming the exact start command above.

## What exists (all on the branch)

- **Physics** `js/core/physics.js`: RK4 flight calibrated to Trackman tour
  averages (worst carry error 3.8%, `node tools/calibrate.mjs`), bounce off
  the real surface normal, 2-D roll on slopes, cup capture, and trees that
  stop the ball (`opts.trees`).
- **Courses** `js/course/`: `holes.js` (the 18-hole Confluence Course, St.
  Louis / Alton landmarks), `holeTerrain.js` (analytic terrain from a centre
  line: elev profile, tilt, mounds, bunkers, ponds, rough depth),
  `courseWorld.js` (ground mesh, green, trees, grass tufts, landmark, lights),
  `lm/*.js` (one detailed builder per landmark; contract in `lm/kit.js`).
- **Game** `js/game/courseMode.js` (rules, lies, mulligans, rings, scoring),
  `game.js` (shot flow, camera, HUD, keys).
- **Scenery** `js/scene/trees.js` (procedural oak / maple / sycamore / cedar,
  instanced, wind sway), `ambient.js` (birds, airliners).
- **Audio** `js/audio/audio.js`: WebAudio synth plus recorded ElevenLabs
  samples in `assets/audio/` (`tools/elevenlabs.mjs` regenerates them).
- **Tools** `tools/holes-check.mjs`, `tools/calibrate.mjs`,
  `tools/landmark-preview.html?type=<lm>&night=1`, `tools/fetch-dem.mjs`.
- **Tests**: `cd bridge && python -m pytest -q` (30 pass); Playwright smoke
  runs used headless Chromium against `?manual` (window.__advance,
  window.__game) with `launcher/fairway.sh --mock`.

## Done in the local session (October 14, 2026)

All eleven steps of the previous plan are on the branch:

1. **Real elevation in HoleTerrain**: DEM holes are rotated so the first
   segment runs down local -z from a tee at the origin; heights are the DEM
   relative to the tee (bicubic), graded through each corridor (embankments
   and ditches smoothed, nothing below the water line).
2. **Backdrop**: a ring mesh whose inner loop is the hole mesh's own border
   carries the real land to ~7 km; slope-based rock colour, regional rock
   zones, sea / river level as real water (`waterLevel`).
3. **Course registry + picker**: `js/course/courses.js`, `loadCourse()`
   preloads the DEM (and scanned trees), the course id is saved with the round.
4. **Western theme**: cottonwood, juniper, ponderosa, sagebrush, golden rough,
   golden-hour light; wagons, windmill, bison, sod house, trading post,
   Chimney Rock on its true bearing (`js/course/lm/western.js`).
5. **Physics / feel**: visible club (`js/scene/club.js`), bounce and roll
   audit (`tools/bounce-audit.mjs`), perspective check
   (`tools/perspective-check.mjs`), reversed-Z depth; `docs/physics.md`
   records the model and the Cannon.js / Rapier evaluation.
6. **Fairway rebrand**: `assets/brand/` (dark, light, mark, icons),
   `tools/brand-sheet.html`, hole-to-hole curtain.
7. **Radio**: `js/audio/radio.js` + `js/data/stations.js` (Howler.js, every
   stream checked live), key **O**.
8. **Courses**: East St. Louis, Paris, Cassis, Statue of Liberty (Liberty
   National imported from OSM); `tools/import-course.mjs` for any mapped course.
9. **Poly Haven via Blender** (run headless; the Blender MCP add-on was not
   connected): scanned olive tree and ground / sand detail maps
   (`tools/blender/`).
10. **Confluence refinements from Tyler's photos**: Piasa mural from John
    Wright's 1898 engraving, caves, walkway, four-lane River Road; Alton
    riverfront mural, yellow Argosy, white sternwheeler, amphitheater;
    Basilica spires and turrets; Wadlow and Miles Davis statues.
11. **Sources**: `docs/SOURCES.md`; course credits shown in the picker.

Checks: `node tools/holes-check.mjs` (all six courses OK),
`node tools/calibrate.mjs` (worst carry 3.7%), `node tools/bounce-audit.mjs`
(all surfaces in band), `node tools/perspective-check.mjs`,
`cd bridge && python -m pytest -q` (30 pass).

Dev shortcut: `?play=<course>&hole=<n>&day` opens a hole in demo mode;
add `&manual` to drive frames with `window.__advance(seconds)`.

## Second pass, same day (from the full original brief)

- **Course atmosphere**: East St. Louis decay (fences, razor wire, poles,
  graffiti warehouses), Liberty flags and night fireworks (a volley on
  every hole-out), Cassis 9 rerouted down to the beach.
- **Design direction** (`docs/design-direction.md`) and an interface pass
  to match: Jost (bundled, OFL), brass as the one accent, film grain on the
  glass, GSAP motion (`js/ui/motion.js`, vendored in `vendor/gsap/`) for
  panels, hole card, hole curtain and launch screen; reduced motion falls
  back to plain fades.
- **Light and weather**: Poly Haven HDRIs for image-based light (the sun
  aligned to the scene's), overcast and night variants; **Rain** weather
  (`js/scene/rain.js`, audio hiss, wet turf in `simulateShot` via `wet`).
- **Ground colour** on every real-ground backdrop (`tools/fetch-sat.py`, runs
  with rasterio + Pillow); steep faces keep their rock colour. Now from
  EOxCloudless 2024 (CC BY-NC-SA: fine because Fairway is private and
  non-commercial); `--source sentinel` rebuilds from open Copernicus scenes.

## Launch and sharing (October 14, evening)

- The old start command failed: this Mac has no `python`, and Apple's
  `python3` is 3.9. `launcher/fairway.sh` finds Homebrew's 3.12, builds or
  repairs `bridge/venv` itself, and starts the bridge. It's wrapped by
  `Fairway.command`, `Fairway on Wi-Fi.command`, `Update Fairway.command`, and
  the Desktop `Fairway.app` (`launcher/install-mac.sh`). See `PLAY.md`.
- `docs/alton-courses.md`: 1 m USGS LiDAR covers Alton; which local courses
  OSM and OpenGolfAPI cover; the engine work for LiDAR-accurate courses.
- **Pebble Beach** front nine and the **TPC Sawgrass** Stadium back nine
  (island green at 17); `--course` keeps OSM holes inside one course and
  imports keep real hole numbers.
- **Tools review**: `docs/tools-review.md` (3D generation and R3F decisions).
- Multiplayer checked in the browser: 4 players, two teams, honour then
  farthest-away order, best-ball team scores, tie verdicts fixed.

## Next steps

- Long and middle irons land 2–4° flatter than Trackman; closing that needs
  a Reynolds-dependent drag curve (see `docs/physics.md`).
- More scanned trees (Poly Haven has few suitable for parkland); the
  `HERO_SOURCES` list in `js/scene/trees.js` takes more.
- Import more real courses with `tools/import-course.mjs` (US courses via
  OpenGolfAPI; anywhere OSM has `golf=hole` ways via `--lat/--lon`).
- Back nines for the real-terrain courses.
- A golfer model for the `golfer` slot would replace the floating hands on
  the club.
