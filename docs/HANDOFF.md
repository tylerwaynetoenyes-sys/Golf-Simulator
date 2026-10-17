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

## LiDAR pilot: Rolling Hills, Godfrey (October 15)

- `tools/fetch-lidar.py`: 1 m USGS 3DEP bare earth into the course DEM
  format (Python with rasterio; the eo-mcp sandbox Python has it).
- `tools/import-course.mjs --lidar --outlines --card <json>`: LiDAR terrain,
  real OSM outlines, hand-entered scorecard. The `--course` filter now also
  keeps to the search box (a Wyoming "Rolling Hills Golf Course" leaked in).
- Rolling Hills (`?play=rollinghills`): 18 holes, par 71, greens straight
  from the LiDAR. Details and checks in `docs/alton-courses.md`.

## Visual and gameplay pass (October 15)

- **Hole map** after Trackman (`js/ui/hud.js`): distance arcs, club carry
  and landing area on the aim line, pin distance, land/sea, trees, OOB, wind.
- **Camera**: keeps the ball in sight past canopies; tree strikes get a
  side camera and slow motion (`cameraRig._planTreeCam`).
- **Club sets** in Settings (`CLUB_SETS` in `js/scene/club.js`), Happy
  Gilmore's hockey stick included; "Show the club" toggle.
- **Grass** (`js/course/grass.js`): blade clumps that sway with the wind and
  part for the ball, a dense patch where the ball rests; denser woods.
- **Paris** moved to the Champ de Mars and Trocadéro; lattice Eiffel Tower;
  real city from OSM (`tools/fetch-buildings.mjs`, `js/course/buildings.js`).
  `carryWater` keeps a river in play.
- **Liberty**: 7,917 real NYC buildings with a long-lens `cityPull`;
  re-sculpted statue at 1 km on her bearing.
- **East St. Louis** street life (`js/course/streetlife.js`); **design pass**
  for made-up courses (`js/course/design.js`, `enrich: true`); **scenery**
  per theme (`js/course/scenery.js`: herds, wagons, tumbleweeds, sailboats,
  sea stacks, crowds).
- **Pebble Beach and Sawgrass** re-imported with real OSM outlines
  (`--outlines`); DEMs and imagery re-baked at the new origins.
- Waiting on Tyler: a Sketchfab API token in the Blender add-on, to import
  detailed models (Eiffel Tower, Statue of Liberty, cars, people).

## Real trees: Rolling Hills (October 15)

- `tools/fetch-trees.py <course>`: tree tops from the USGS 3DEP point cloud
  (canopy height model over the course's 1 m DEM) into
  `assets/courses/<id>/trees.json`. It runs with numpy, scipy,
  `laspy[lazrs]` and pyproj (`uv venv` + `uv pip install`; the system
  Pythons have none of them).
- `js/course/dem.js` loads `trees.json` with the DEM. When a course has
  one, `CourseWorld` plants the surveyed trees instead of the procedural
  stands (details in `docs/alton-courses.md`). `plantTrees` takes `height`
  and `crown` per spot. Collision files each crown in every 20 m cell it
  reaches, which also fixes crowns that hung into a neighbouring cell on the
  other courses.

## One realistic world (October 15, night)

- **Trees** are real models now (`js/scene/treeModels.js`): evolveduk's
  Sketchfab set (oak, beech, maple, elm, spruce, juniper, ponderosa, acacia
  for stone pine / Monterey cypress, palm, a dead snag) plus the Poly Haven
  olive, exported by `tools/blender/trees.py`. Near trees are the models
  (at most 110 / 520k triangles, the closest 45 cast shadows); the rest are
  impostor cards baked from eight views at load. Species slots in
  `js/scene/trees.js` (`SLOT_MODEL`) keep their old indices; the procedural
  tree stands in if a model is missing. Per-course sets for Pebble and
  Sawgrass in `THEME_TREES`. `tools/tree-preview.html` shows the set.
- **Ground**: view-dependent mowing stripes, coarser patchy rough
  (`courseWorld` ground shader); East St. Louis lots in scanned asphalt
  with a scanned rubble heap and grass-tuft weeds.
- **Grade**: one display-referred pass after tone mapping
  (`GradeShader` in `js/scene/renderer.js`).
- **Performance**: rough grass and shrubs in 40 m chunks with a far LOD
  (`_chunked` / `_cullChunks`); `js/scene/merge.js` merges static parts by
  material (imported models, landmarks without `update()`, scenery, decay);
  glTF transmission is stripped on load (it doubles the whole frame);
  spectators past 45 m use `people_lo.glb`. Tablets default to Medium.
- **Measure**: `node tools/perf.mjs --base <url> course:hole ...` drives
  headless Chrome on the Mac's GPU at iPad Air resolution and prints frame
  time, draw calls, triangles and tree split per hole. On Medium every
  course holds 60 fps on the M1 with 120–280 draw calls and 0.6–1.4M
  triangles (shadow pass included).

## Realistic world, finished (October 15, late)

- **Landmark trees**: builders return `trees` (`tree()` and `SLOT` in
  `js/course/lm/kit.js`) instead of modelling round crowns; `CourseWorld`
  plants them with the hole's own forest (real models, impostors,
  collision), far landmarks included. Riverfront, Arch grounds (London plane
  allées), Basilica, Delmar, Zoo, City Museum, Chain of Rocks (cottonwoods,
  sycamores) and the Piasa bluff (oak-hickory, red cedar on the ledges).
- **Links fescue** on the harbor theme (Liberty): `_buildFescue` plants
  knee-high straw tufts (`tuftGeometry` with `root`, `dry`, `segs` options)
  in drifts beyond the first cut, chunked to 220 m; the ground under the
  drifts goes to straw (`fescue` in the palette).
- **Shipping containers** (East St. Louis): corrugated steel from Poly
  Haven's `container_side` (normal map plus luminance and a rust mask,
  `tools/blender/container.py`), UVs in metres, rust heavier at the bottom
  rail.

## Wildlife (October 16)

- `js/course/wildlife.js` (who lives where, behaviour, synthesised calls) and
  `js/scene/fauna.js` (`Beast`: a skinned animal with an AnimationMixer; clips
  play in place and move the animal at their authored ground speed). Rosters
  per course: alligators, egrets and herons, ospreys and eagles at Sawgrass;
  black-tailed deer, seals and sea lions, pelican lines and gulls at Pebble;
  Blackface sheep at Whistling; fox squirrels at Pinehurst; whitetails, Canada
  geese, bald eagles and grey squirrels on the Midwest courses; gliders off
  Torrey Pines. New course ids fall back by name (`/torrey|pinehurst|.../`) or
  theme, so the courses still being merged get animals too.
- Placement: pond banks from the water polygons, the tree line from the
  hole's tree records, the coast from the sea level; never on greens, tees,
  bunkers or the fairway's middle, and clear of the tee and the green.
- Reactions: geese run and lift off, herons crouch and fly to another bank,
  deer bound away, a basking gator rouses and slides into the water, a
  floating one sinks, squirrels run up a tree. Rare and switchable with
  Settings → Effects → Moments: a ball stopping beside a gator cuts to a low
  shot of it (`moments.wildlife`), and now and then a goose stands its ground.
- Assets and the Blender pipeline: `docs/SOURCES.md` (Wildlife) and
  `tools/blender/README.md`. Animation runs within 260 m of the camera; past
  650 m ground animals are not drawn. iPad budget held on Medium
  (sawgrass:17, rollinghills:1, pebble:7, whistlingstraits:3: 60 fps,
  174–247 calls, ≤ 1.44M triangles at address).

## Pinehurst No. 2 (October 16)

- `?play=pinehurst2`: all 18 holes from OSM inside "Pinehurst No. 2" (refs
  "1 - #2" ... "18 - #2"), par 72 from OpenGolfAPI, on the 2024 NC Phase 3
  LiDAR DEM (0.95 m) from NOAA Digital Coast. USGS 3DEP has no 1 m DEM there,
  so `tools/fetch-lidar.py --noaa <dataset>/<county>` reads NOAA's COGs
  (STAC-indexed, feet converted, tile seams filled). The greens' turtleback
  fall-off (0.4-0.7 m within 6 m of the edge) is in the survey.
- Trees come from `tools/fetch-trees.py --chm-raster meta` (the Meta/WRI
  canopy-height map). NC's point cloud needs a login, so there are no LiDAR
  buildings: OSM footprints in the 'carolina' style.
- The 'sandhills' theme (`js/course/courseWorld.js`) draws a band of pale sand
  with scattered wiregrass along play, then pine straw under the pines. The
  lie stays 'rough' (no new surface type).
- `tools/import-course.mjs` now asks Overpass for `out geom`, because
  `out tags geom` dropped every multipolygon fairway.
- iPad budget: Pinehurst's 120+ bunkers made 300-770k insert cells per hole,
  so the Whistling Straits bunker cell budget is in (the same hunks as
  1b6ecdd). At address (Medium): 13 = 226 calls / 1.13M, 11 = 203 / 1.15M,
  16 = 264 / 1.18M, 12 = 288 / 1.06M.

## The Woodlands, Alton (October 16)

- `?play=woodlands`: 18 holes, par 72, 6,423 yd (GolfPass card, matches OpenGolfAPI). OSM maps only
  three holes, so the greens, fairways, bunkers, tees, paths and creek are measured: NAIP imagery
  (`USGSNAIPImagery`; `USGSNAIPPlus` was timing out), the 3DEP point cloud's return intensity (turf vs
  rough; bunker sand reads ~570-850, paths and bright turf above 900) and leaf-off canopy, and the 1 m
  DEM for tee pads and greens. The club's own course diagram gave only the numbering.
- The favourite hole is the 2nd: tee on a level pad at 155.4 m on the bluff, the creek 20 m below,
  green with a bunker front-left, path behind, a portable toilet by the 8th tee, the white house up the
  7th/3rd. `js/course/lm/woodlands.js` lays the ravine thicket (leaf cards wherever the point cloud has
  low vegetation), the creek-bed stones and the real path; and the clubhouse grounds for 1, 9, 10 and 18
  (putting green, umbrella patio, fieldstone wall, WOODLANDS in white stones, cars).
- Mapped water can say `shore: false` (no cattails): the creek reaches use it, and ponds more than 70 m
  off a hole's line, which play never sees. A hole can say `cartPath: false` when its landmark draws the
  real path (`js/course/courseLife.js`).
- iPad budget with the wildlife (Medium, address, measured with no other Chrome running): 2 = 178 calls /
  1.42M, 15 = 182 / 1.42M, 18 = 240 / 1.25M, Rolling Hills 1 = 173 / 1.16M, all 60 fps. The wooded holes fill
  the 110 near-model cap, so the tree mix is white oak and sycamore only (maple 6,600 and beech 4,280
  triangles are heavier). Wildlife: animals past 90 m draw without a shadow, geese, squirrels and mallards
  past 280 m are not drawn (`js/course/wildlife.js`, `Beast.shadows` in `js/scene/fauna.js`), and the
  Woodlands roster is a smaller flock (3-6 geese, 1-3 deer).

## Next steps

- Long and middle irons land 2–4° flatter than Trackman; closing that needs
  a Reynolds-dependent drag curve (see `docs/physics.md`).
- More tree species: add a model to `SPECIES` in `js/scene/treeModels.js`
  and point a slot at it in `SLOT_MODEL` (`js/scene/trees.js`).
- The Zoo's savanna acacias are still modelled umbrellas: the acacia model
  only loads for courses whose tree set uses it.
- Import more real courses with `tools/import-course.mjs` (US courses via
  OpenGolfAPI; anywhere OSM has `golf=hole` ways via `--lat/--lon`).
- Back nines for the real-terrain courses.
- A golfer model for the `golfer` slot would replace the floating hands on
  the club.
