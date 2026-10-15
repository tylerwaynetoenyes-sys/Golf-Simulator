# Sources and attribution

Everything Fairway ships that came from somewhere else, with its licence and
the credit it needs. Keep this file current when adding data or assets.

## Elevation: 1-metre LiDAR (Rolling Hills)

Baked by `tools/fetch-lidar.py` from the **USGS 3D Elevation Program (3DEP)
1-metre bare-earth DEM**, found through the TNM Access API
(https://tnmaccess.nationalmap.gov/api/v1/products) and read as
Cloud-Optimized GeoTIFFs from `prd-tnm.s3.amazonaws.com`. Public domain (U.S.
Government work); credit given anyway: "Elevation: U.S. Geological Survey,
3D Elevation Program".

| Course | Files | Projects |
|---|---|---|
| Rolling Hills (Godfrey, IL) | `assets/courses/rollinghills/dem.*` (1 m over 1.8 km), `far.*` (32 m over 16 km) | Playing area: tile `x74y432` of **IL_10CountyNRCS_D23** (published April 2026). Surround: the same project, then IL_SouthCentral_2021_D21, IL_19County_D24, MO_WestCentral_2018_D19 and others, with Terrarium tiles only where no LiDAR covers. Each file's JSON lists the tiles used. |

The script ignores any LiDAR sample more than 15 m from the coarse Terrarium
surface. Tile `x74y431` of IL_10CountyNRCS_D23 has a strip that reads a
constant 92.3 m along its north edge, on ground near 170 m.

## Elevation: Terrarium tiles (the other real-terrain courses)

Baked by `tools/fetch-dem.mjs` from the AWS Terrain Tiles (Terrarium format),
the open elevation dataset built by Mapzen / Tilezen and hosted on the
Registry of Open Data on AWS (https://registry.opendata.aws/terrain-tiles/).
Required credit:

> Elevation: Mapzen terrain tiles. United States 3DEP (formerly NED) and
> global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological
> Survey. Europe terrain data produced using Copernicus data and information
> funded by the European Union - EU-DEM layers. Global ETOPO1 terrain data
> U.S. National Oceanic and Atmospheric Administration.

| Course | Files | Principal source |
|---|---|---|
| Oregon Trail (Scotts Bluff, NE) | `assets/courses/oregon/` | USGS 3DEP |
| East St. Louis (IL) | `assets/courses/eaststl/` | USGS 3DEP |
| Statue of Liberty (Jersey City, NJ) | `assets/courses/liberty/` | USGS 3DEP |
| Paris (Bois de Boulogne) | `assets/courses/paris/` | EU-DEM / SRTM |
| Cassis (Provence) | `assets/courses/cassis/` | EU-DEM / SRTM |
| Pebble Beach (CA) | `assets/courses/pebble/` | USGS 3DEP |
| TPC Sawgrass (FL) | `assets/courses/sawgrass/` | USGS 3DEP |

## Map data

- **OpenStreetMap** (© OpenStreetMap contributors, ODbL 1.0,
  https://www.openstreetmap.org/copyright): the Statue of Liberty course's
  hole lines, greens, fairways, bunkers and water (Liberty National's front
  nine; Pebble Beach Golf Links' front nine, inside the OSM boundary of
  "Pebble Beach Golf Course"; the TPC Sawgrass Stadium Course back nine,
  inside "TPC Sawgrass", with the 17th's lake redrawn as one island pond;
  imported with `tools/import-course.mjs` through the Overpass API); all
  18 holes of Rolling Hills Golf Course, Godfrey, with the real outlines of
  its greens, fairways, bunkers and ponds (`--outlines`), and
  the positions of landmarks on the East St. Louis, Paris and Cassis courses
  (Eads Bridge, grain elevators, Gateway Arch, harbour and château).
- **OpenGolfAPI** (https://opengolfapi.org, ODbL 1.0; course data
  © OpenStreetMap contributors): course search and the Liberty National, Pebble Beach and TPC Sawgrass
  Stadium scorecards (pars, yardages, stroke indexes). Credit: "© OpenStreetMap
  contributors (ODbL 1.0) via OpenGolfAPI".
- **The Rolling Hills scorecard** (pars, handicaps and four tee sets): typed
  in from the club's own card, https://www.rollinghillsgc.com/scorecard/
  and the printed PDF
  (https://www.rollinghillsgc.com/wp-content/uploads/sites/8763/2023/03/rhscorecard.pdf),
  retrieved 14 October 2026, in `assets/courses/rollinghills/scorecard.json`.
  OpenGolfAPI has no card for this course. These are facts from the card,
  used to set par and yardage, with credit to the club.

Data under the ODbL can be used and adapted, including commercially, as long
as it is credited and any adapted *database* shared under the same licence.
The course files in `js/course/courses/` carry the credit in their headers
and in the in-game course card.

## Artwork and models

- **The Piasa engraving**: John Wright, 1898 ("from a drawing in Mr. Eagles'
  U.S.A."), public domain; vector tracing published on OpenClipart and
  redistributed CC0 1.0 by freepngimg.com and freesvg.org. Supplied by Tyler.
  `assets/art/piasa-wright-1898.svg`, coloured in `js/ui/piasa.js`.
- **Poly Haven** (https://polyhaven.com), CC0 1.0, no credit required
  (credited anyway):
  - `island_tree_02` scanned tree, processed in Blender
    (`tools/blender/tree.py`) to `assets/models/island_tree_02.glb`
  - `aerial_grass_rock` and `dense_sand` textures, processed in Blender
    (`tools/blender/detail.py`) to `assets/textures/ground_detail.jpg` and
    `sand_detail.jpg`
- **Fairway logo, icons and every other model** (landmarks, trees, the club,
  the course scenery): made for Fairway, in code, in this repository.

## Sound and music

- **Recorded sound effects** in `assets/audio/` were generated with the
  ElevenLabs Sound Effects API (`tools/elevenlabs.mjs`); use is governed by
  the ElevenLabs terms of the account that generated them.
- **Radio** (`js/data/stations.js`): live streams from listener-supported
  stations, played as-is and credited in the radio panel. None are
  redistributed; please support them:
  - SomaFM, San Francisco: https://somafm.com/support/
  - Radio Paradise, Paradise, California: https://radioparadise.com
  - KEXP 90.3 FM, Seattle: https://www.kexp.org/donate/

## Code

- **three.js** r186 (`vendor/three/`), MIT, © three.js authors.
- **Howler.js** 2.2.4 (`vendor/howler/`), MIT, © 2013–2020 James Simpson of
  GoldFire Studios.
- **R10 bridge protocol**: a port of 10over (see `bridge/README.md`).

## References used for facts and dimensions

Not redistributed; listed so figures can be checked.

- Ball flight: Trackman PGA Tour averages (carry, apex, landing angle).
- Bounce and roll: A. R. Penner, "The run of a golf ball", *Canadian Journal
  of Physics* 80(8):931–940 (2002).
- Chimney Rock: History Nebraska (marker text; 120 ft spire, ~470–480 ft
  above the North Platte valley).
- Aermotor windmills: Gas Engine Magazine and manufacturer histories (8 ft
  A702 wheel on 30–40 ft towers).
- Eads Bridge: National Register of Historic Places nomination (502–520–502 ft
  spans, opened July 4, 1874).
- Gateway Geyser: St. Louis Public Radio; The Clio; Historical Marker
  Database (630 ft design height; shut off in 2023).
- Statue of Liberty, Ellis Island: National Park Service.
- Eiffel Tower, Arc de Triomphe, Grande Arche, Bois de Boulogne: the
  operators' published figures (330 m; 50 m; 110 m).
- Cap Canaille, Calanques National Park (2012), Cassis AOC (1936): Parc
  national des Calanques and INAO.
- Confluence Course landmarks: Tyler's photographs of the Piasa bluff, the
  Great River Road, the Alton amphitheater and riverfront, the Cathedral
  Basilica, and the Miles Davis and Robert Wadlow statues (references only;
  not included in the repository).

## Interface

| Asset | Source | Licence |
|---|---|---|
| GSAP 3.12.5 (`vendor/gsap/`) | gsap.com, via npm | GSAP Standard "no charge" licence |
| Jost variable font (`assets/fonts/`) | Owen Earl (indestructible type*), via @fontsource-variable/jost | SIL Open Font License 1.1 (`assets/fonts/Jost-OFL.txt`) |

## Lighting and ground colour

| Asset | Source | Licence |
|---|---|---|
| HDRIs `assets/hdri/` (Kloofendal 48d Partly Cloudy Pure Sky, Kloofendal Overcast Pure Sky, Moonless Golf) | Poly Haven, by Greg Zaal (sky edits Jarod Guest) | CC0 |
| `assets/courses/<id>/sat.jpg`: true colour at ~10 m/pixel over each 16 km backdrop | **EOxCloudless 2024** (`s2cloudless-2024_3857` WMTS), warped into each DEM frame by `tools/fetch-sat.py` | **CC BY-NC-SA 4.0**. Credit: "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)". Shown in each course's credits. |

The EOX imagery is licensed for non-commercial use only. That fits Fairway
as a private game for friends; the derived `sat.jpg` files carry the same
CC BY-NC-SA 4.0 licence. If Fairway ever became commercial, either buy EOX's
commercial licence or rebuild with `python tools/fetch-sat.py --source
sentinel`, which mosaics open Copernicus Sentinel-2 L2A scenes from AWS Open
Data (any use; credit "Contains modified Copernicus Sentinel data").

