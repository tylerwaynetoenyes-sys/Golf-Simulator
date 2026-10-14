# Handoff: where the work stands and what comes next

Read this first. It carries the context from the earlier (cloud) sessions.

## The project

A premium browser golf simulator, being renamed **Fairway** (formerly "Alton
Range"). Three.js r186 (vendored in `vendor/three`, import map, no build
step), vanilla ES modules. A Python Garmin R10 bridge (`bridge/`, a port of
10over) serves the game at http://localhost:8765; `?tv` for TV mode, `--lan`
for iPad play.

```
cd bridge
python -m r10bridge --open      # then open http://localhost:8765 and hard refresh
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
  window.__game) with `python -m r10bridge --mock --port 8765`.

## In progress: real-terrain courses (started at commit 062a4a8)

Done:
- `tools/fetch-dem.mjs <id> <lat> <lon> [sizeM] [stepM] [farM] [farStepM]`
  bakes AWS Terrarium elevation (USGS 3DEP/NED, SRTM) into
  `assets/courses/<id>/dem.bin|json` (play area) and `far.bin|json`
  (backdrop). Uint16 cm above min; +x east, +z south. Needs `npm i pngjs`.
- `js/course/dem.js`: `loadDem(id)`, `demFor(id)`, `demHeight(d, x, z)`.
- `assets/courses/oregon/`: Scotts Bluff, NE (41.832, -103.700), 4 km at 8 m
  plus 16 km at 64 m; heights 1180–1434 m.
- `js/course/courses/oregon.js`: nine holes (par 36, 3,329 yd) with points in
  DEM-frame metres, notes, hazards, landmark types (`wagons`, `windmill`,
  `bison`, `sodhouse`, `tradingpost`) and a far landmark (`chimneyrock` at its
  true position ~32 km east-southeast).

Next steps, in order:
1. **Hook DEM into HoleTerrain.** For a DEM hole, rotate the points so the
   first segment points local -z with the tee at the origin
   (local→DEM: `world = tee + x·r + (−z)·f`, f = first-segment unit vector,
   r = (−f.z, f.x)); line in yards; heights = DEM − DEM(tee). In `_land`,
   use the DEM base instead of `elevAt(t)`; greenBase/teeHeight from the DEM.
   Keep the green/tee flattening and bunkers.
2. **Backdrop mesh** from `far` in the hole's local frame; near-mesh edges
   blend to the far surface; far material gets a polygonOffset and drops
   ~1.5 m inside the near bounds; hide the flat base plane for DEM courses.
3. **Course registry + picker**: `js/course/courses.js` listing Confluence
   (existing HOLES) and DEM courses; CourseMode takes `course`; preload the
   DEM before the first hole; save the course id with the round.
4. **Western theme**: palette (irrigated green fairways against dry golden
   rough, sage, buff sandstone bluffs with slope-based rock colour on the
   far mesh), sagebrush, cottonwood/juniper/ponderosa, the landmark builders
   above (`js/course/lm/`), golden-hour light, big sky.
5. **Physics / feel (Tyler's top priority)**: visible club at address that
   swings and makes contact (ball squash, turf spray, sound in sync); audit
   bounce and roll per surface (fairway, rough, bunker, green, water) against
   published numbers (Trackman tour averages, Penner's ball–turf impact
   model); check perspective at all distances. Cannon.js/Rapier were judged
   a poor fit for ball aero (no drag/Magnus) — write that evaluation into the
   docs.
6. **Rebrand to Fairway**: logo (dark, light and small/favicon versions),
   title, manifest, launch screen, premium indie UI and motion (GSAP/anime.js
   optional), hole transitions.
7. **Radio**: toggleable panel, Howler.js (or Web Audio) with fades; presets
   in an editable file (e.g. `js/data/stations.js`): garage rock, post-punk,
   indie (e.g. SomaFM Indie Pop Rocks / Underground 80s, KEXP), classic
   soul/funk (SomaFM Seven Inch Soul), jazz/world (SomaFM Sonic Universe,
   Radio Paradise). Verify each stream URL before shipping.
8. **More courses**, each on real elevation: East St. Louis (gritty
   industrial riverfront), Paris (Eiffel Tower, Seine, Haussmann blocks),
   Cassis (calanques, Cap Canaille, beach), Statue of Liberty (Liberty State
   Park / harbour, Manhattan skyline, bald eagles), plus real famous courses
   via OpenGolfAPI (https://api.opengolfapi.org) and OpenStreetMap golf tags
   (`golf=hole` ways give the centre lines with `par`/`ref`; fairway, green,
   bunker, tee and water polygons give the surfaces).
9. **Poly Haven** (CC0) trees, materials and HDRIs via the Blender MCP;
   export glTF into `assets/` (slots in `js/scene/assets.js`).
10. **Confluence refinements from Tyler's photos** (ask him to re-attach):
    - Piasa bluff: cream limestone in thin horizontal beds, two cave arches
      flanking the mural, trees and scrub on top, a railing walkway at the
      foot; the mural has red/white wings, a gold scaled body, antlers, a
      bearded face, talons and a tail looping round the body ending in a fin.
    - Great River Road: four lanes between the bluff and the river.
    - Alton amphitheater: white tensile canopy on stone pylons over a
      brick-red stage, terraced grass rings, fountain plaza, splash pad,
      marina and Clark Bridge behind.
    - Riverfront: "Welcome to Alton" grain elevators with a flag mural, the
      yellow ornate Argosy casino boat, a large white sternwheeler.
    - Basilica: grey granite, green-tile pointed spires with corner turrets,
      a large rose window, three arched portals, a green-tile dome.
    - Miles Davis: leaning far back, trumpet forward, sleeveless vest, flared
      trousers, on a round concrete plinth amid brick paving and a limestone
      planter wall.
    - Wadlow: suit, smiling, cane in his left hand, on a granite plinth
      inscribed "Robert Pershing Wadlow / February 22, 1918 – July 15, 1940",
      with the bronze armchair and granite benches nearby.
11. **Sources and attribution** doc (`docs/SOURCES.md`): elevation (AWS
    Terrain Tiles / USGS 3DEP), OpenStreetMap (ODbL), OpenGolfAPI, Poly
    Haven (CC0), ElevenLabs, radio stations.
