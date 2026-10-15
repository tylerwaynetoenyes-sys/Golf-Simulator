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
  - `road_damaged` texture (diffuse, 1k, MD5 checked against the API),
    converted to greyscale for `assets/textures/asphalt_damaged.jpg` (the
    East St. Louis lots)
  - `container_side` texture by Dimitrios Savva (diffuse and OpenGL normal,
    1k, MD5 checked against the API), processed in Blender
    (`tools/blender/container.py`) to `assets/textures/container_side.jpg`
    (luminance plus a rust mask) and `container_side_nor.jpg` (the East
    St. Louis shipping containers)
- **Sketchfab models**, Creative Commons Attribution 4.0 (CC BY 4.0,
  https://creativecommons.org/licenses/by/4.0/). Each was decimated, its
  textures resized to 2K or less and exported Draco-compressed in Blender;
  credit per model:

  | File | Model | Author |
  |---|---|---|
  | `assets/models/trees/oak.glb` | [Oak tree](https://sketchfab.com/3d-models/6468dd4d3eb240ef902b9057d9913606) | evolveduk |
  | `assets/models/trees/beech.glb` | [Beech tree](https://sketchfab.com/3d-models/0983d8933531491f9be71c669e8a907b) | evolveduk |
  | `assets/models/trees/maple.glb` | [Maple Tree](https://sketchfab.com/3d-models/b5e945e7abcc471da6547c04e314774c) | evolveduk |
  | `assets/models/trees/elm.glb` | [Elm tree](https://sketchfab.com/3d-models/f36443d3e59946bfa38b3f5cb90ea5fa) | evolveduk |
  | `assets/models/trees/oldtree.glb` | [Old tree](https://sketchfab.com/3d-models/3cb4d59eb4844dc4802480e9ee53785e) | evolveduk |
  | `assets/models/trees/acacia.glb` | [Acacia tree](https://sketchfab.com/3d-models/bb14c2bb679b4d0bb1c578a27e2ddabf) | evolveduk |
  | `assets/models/trees/pine.glb` | [Pine Tree](https://sketchfab.com/3d-models/d45218a3fab349e5b1de040f29e7b6f9) | evolveduk |
  | `assets/models/trees/spruce.glb` | [Spruce](https://sketchfab.com/3d-models/a50a5df3164246a5af97992cec33a143) | evolveduk |
  | `assets/models/trees/juniper.glb` | [Juniper](https://sketchfab.com/3d-models/e74c7156984542c2a4cdf6ce8a0c8e96) | evolveduk |
  | `assets/models/trees/palm.glb` | [Coconut Palm](https://sketchfab.com/3d-models/26e787f2ff2e4c0fb004c3b0210805a3) | evolveduk |
  | `assets/models/eiffel_tower.glb` | [Eiffel Tower](https://sketchfab.com/3d-models/6830e60d2c1048f2a33e92679664f652) | Johnson-Martin |
  | `assets/models/statue_of_liberty.glb` | [Statue of Liberty, New York, NY, USA](https://sketchfab.com/3d-models/8401e1c10480476e8d7e3085d1aec923) | CMBC |
  | `assets/models/lowrider_impala.glb` | [Impala 1964 Lowrider](https://sketchfab.com/3d-models/c68508c056a34a34997992deb4355166) | mrkuza |
  | `assets/models/abandoned_sedan.glb` | [Crashed Abandoned Car - Game Ready](https://sketchfab.com/3d-models/66ef51a84c9843dda53bf0b4b9020011) | rashad-brahimli |
  | `assets/models/people_real.glb` | [Dennis Posed 004](https://sketchfab.com/3d-models/e211ffd52a96416e89c0cc415a388d61), [Mei Posed 001](https://sketchfab.com/3d-models/07f308b81bc045c8917104a72ce2ffe4), [Fabienne & Percy 001](https://sketchfab.com/3d-models/8c9bfd4fb8a444b3a42a4fc31935a2fb) | Renderpeople |
  | `assets/models/people_real.glb` | an athletic man walking (scan) | deep3dstudio |
  | `assets/models/people_lo.glb` | the same four figures, decimated to ~1.5k triangles for distant crowds | as above |
  | `assets/models/rubble_concrete.glb` | [A Pile Of Concrete Debris - 3D Scan](https://sketchfab.com/3d-models/194bec2429da4b74b3926ac981616da8) | albentan2012 |

  The tree set is drawn by `js/scene/treeModels.js`: models near the camera,
  impostor cards baked from eight views of each model beyond 150 m.
- **Fairway logo, icons and every other model** (landmarks, the club, the
  course scenery, the procedural stand-in trees): made for Fairway, in code,
  in this repository.

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


## Rock

| Asset | Source | Licence |
|---|---|---|
| `assets/textures/rock/` (rock_08, rock_face_03, rock_boulder_cracked, rock_wall_02: colour and roughness, 1K) | Poly Haven | CC0 |

Used by `js/course/rock.js` on steep ground, per course: limestone
(Alton, Godfrey, St. Louis, Paris), badlands (Scotts Bluff), ochre (Cap
Canaille, Cassis), granite (Pebble Beach).

## The Alton riverfront (Confluence hole 4)

`assets/landmarks/alton/` is baked by `tools/bake-alton.mjs` in the
riverfront's own frame (origin the Riverfront Park amphitheater, +x inland
square to the shore, +z downstream):

- `ground.bin`: elevation from the AWS Terrarium tiles (USGS 3DEP / NED),
  12 m over 3.4 x 3.4 km, with land cover rasterised from OpenStreetMap
- `ground.json`: OpenStreetMap buildings, streets, lots, piers and
  breakwaters (© OpenStreetMap contributors, ODbL 1.0)
- `sat.jpg`: EOxCloudless 2024 by EOX IT Services GmbH (contains modified
  Copernicus Sentinel data 2024), CC BY-NC-SA 4.0

The Clark Bridge's spans (92 - 230 - 92 m, two pylons) are from Structurae;
its pylons were placed from Esri World Imagery (viewed, not redistributed)
on the OSM centre line. The Argosy, the elevators and Lincoln Shields'
tower and memorial are modelled from photographs.

## The Alton Riverfront course

`assets/courses/alton/`: `dem.*` and `far.*` by `tools/fetch-dem.mjs`
(AWS Terrarium tiles: USGS 3DEP / NED), centred 38.8844°N 90.1777°W;
`sat.*` by `tools/fetch-sat-eox.mjs` (EOxCloudless 2024, the same output as
`tools/fetch-sat.py --source eox`, decoded with macOS `sips`). The holes were
routed on open ground from the OpenStreetMap land cover baked for the
riverfront (above); the riverfront itself stands at its mapped position.

## Forest Park

`assets/courses/forestpark/`: `dem.*`/`far.*` (Terrarium, USGS 3DEP) and
`sat.*` (EOxCloudless) as above; `buildings.json` by
`tools/fetch-buildings.mjs` (OSM, the Central West End and Clayton), with the
modelled landmarks' footprints skipped. The back nine is The Highlands as
mapped on OpenStreetMap, imported by `tools/import-course.mjs` (scorecard via
OpenGolfAPI, ODbL); the front nine is routed over Probstein and Art Hill on
the OSM land cover. `assets/landmarks/forestpark/` (`tools/bake-alton.mjs`
in map axes): the park's lakes, drives, lots and footprints.

## Built surfaces

`assets/textures/pbr/` (Poly Haven, CC0; colour, roughness and normal,
recompressed): white_sandstone_bricks, sandstone_blocks_08,
concrete_wall_008, brushed_concrete, clay_roof_tiles_02, metal_plate,
corrugated_iron, asphalt_02, granite_wall, red_bricks_02, white_plaster_02,
roof_slates_02, and for the landmark pass cobblestone_floor_08,
gravel_stones, rock_face_03, rusty_metal_02, box_profile_metal_sheet,
thatch_roof_angled, white_stucco, wood_planks_grey (1K colour, 512 px
roughness and normal), gray_rocks and rock_boulder_dry (the riprap),
grass_ground (mown earthworks at Cahokia), rough_linen (wagon canvas) and
brown_mud_dry (sod). Laid on
in world space by `js/scene/pbr.js`. From ambientCG (https://ambientcg.com,
CC0): painted_steel (Metal032) and red_brick (Bricks059), which pbr.js draws
for the `metal_plate` and `red_bricks_02` ids (a tread plate and a weathered
mixed brick, wrong for the painted steel and red brick their callers mean);
`assets/textures/fence/chainlink_*` (Fence003), the riverfront's chain-link.

## Houses

From Sketchfab, CC BY 4.0; joined, reduced in Blender to ~1.6-2.4k
triangles and baked to one 2K texture atlas each (`assets/models/houses/`,
`js/scene/houses.js`), placed on Alton's mapped house footprints:

- "Americ an Football House" (the gable-front frame house) by davylyn4 (sketchfab.com/davylyn4)
- "Foursquare House" by srlandry00 (sketchfab.com/srlandry00)
- "Small Brick House" by jimbogies (sketchfab.com/jimbogies)
- "Old brick house" by Kiiba (sketchfab.com/Kiiba)
- "Low-poly Old American brick building with shop." by Orzechu (sketchfab.com/Orzechu)

## Alton parks

`assets/landmarks/alton/park.json` (`tools/bake-park.py`, the riverfront's
frame): Riverfront Park and the other parks' outlines, shelters, restrooms,
playground, picnic tables, benches, drinking water, fitness station,
interpretive signs and the "Sail" artwork, from OpenStreetMap (main API map
call, October 2026), © OpenStreetMap contributors, ODbL.

## Cars and boats

From Sketchfab, CC BY 4.0; reduced in Blender to one mesh each (parts'
colours in the vertices, bodywork flagged for paint), about 1-1.5k triangles,
Draco-compressed (`assets/models/cars/`, `assets/models/boats/`):

- "2018 Ford Everest/Endeavour", "2019 Skoda Karoq", "2016 Volkswagen Polo",
  "2001 Honda Odyssey EX" by BHP3D (sketchfab.com/BHP3D)
- "BAYCRUISER" by d2u (sketchfab.com/d2u)
- "«Progress» motorboat" by isiosiusin (sketchfab.com/isiosiusin)
- "Sailboat" by sergeif (sketchfab.com/sergeif): the sloops offshore on the
  coastal courses (`sailboat_lo.glb`, 2.5k triangles, its own texture)

The crowds use the scanned people already credited above (people_lo.glb).

## Prairie animals

From Sketchfab, CC BY 4.0; posed, reduced in Blender to one ~3k-triangle
mesh with its coat texture, Draco-compressed (`assets/models/animals/`):

- "Animated Free Bison" by AneesAnimates (sketchfab.com/AneesAnimates)
- "Brown Cow 3d model" by rt699448 (sketchfab.com/rt699448), drawn as the
  wagon trains' oxen

## Confluence Point

`assets/courses/confluencepoint/`: `dem.*`/`far.*` (Terrarium, USGS 3DEP) and
`sat.*` (EOxCloudless). `assets/landmarks/confluence/` (`tools/bake-alton.mjs`,
map axes): OpenStreetMap from the main API's map call (Overpass was down),
converted to the same JSON. The Confluence Tower's form (two shafts, lookouts
at 50, 100 and 150 ft, 180 ft) from KAI Design / Building Design+Construction
and the National Park Service; bark and plank textures (bark_brown_02,
brown_planks_08) from Poly Haven, CC0.

## Gateway Arch

`assets/courses/gatewayarch/`: `dem.*`/`far.*` (Terrarium), `sat.*`
(EOxCloudless), `buildings.json` (OSM, downtown St. Louis, the Old
Courthouse's footprint skipped for the model). `assets/landmarks/gatewayarch/`
(`tools/bake-alton.mjs`, map axes, OSM from the main API): the grounds' ponds,
walks and streets. The Arch's form is scene/skyline.js (the published
catenary); its axis from the OSM leg nodes.

## Cahokia Mounds

`assets/courses/cahokia/dem.*`: USGS 3DEP 1 m LiDAR (IL MadisonCo 2014,
public domain) by `tools/fetch-lidar.py`, 2 m over 2.4 km; `far.*` its
overviews and Terrarium; `sat.*` EOxCloudless. `assets/landmarks/cahokia/`
(`tools/bake-alton.mjs`, map axes, OSM from the main API): the mounds as
mapped (holes are routed at least 60 m off every one, the Grand Plaza left
unplayed), the paths and the Interpretive Center's footprint. Hole notes from
the Cahokia Mounds State Historic Site and UNESCO World Heritage listing.
The neighbourhood of houses outside the palisade (`js/course/lm/cahokiasite.js`)
follows the excavated Mississippian house: rectangular wall-trench pole walls,
clay daub, grass thatch, a hearth in the yard.

## Saint Louis Zoo

`assets/courses/stlzoo/dem.*`: USGS 3DEP 1 m LiDAR (MO SaintLouis 2017,
public domain) by `tools/fetch-lidar.py`, 2 m over 2 km; `far.*` its
overviews and Terrarium; `sat.*` EOxCloudless; `buildings.json` OSM (the zoo
and the park's landmarks skipped for the models). The zoo's buildings, walks,
Wood Duck Pond and Sea Lion Sound are the Forest Park map
(`assets/landmarks/forestpark/`, OSM). Hole notes from the Saint Louis Zoo.

`assets/models/zoo_animals.glb` and `zoo_rocks.glb`, from Sketchfab under
CC BY 4.0, decimated and re-textured at 1024 px (WebP) in Blender:

| Node | Model | Author |
|---|---|---|
| giraffe | [Giraffe](https://sketchfab.com/3d-models/522c042aad9f4348a74c2985ec3f99f9) | BlueMesh |
| elephant | [Silent Giant Elephant](https://sketchfab.com/3d-models/7cec3bda1a8549b7b7537e35c78c64ba) | rt699448 |
| zebra | [Zebra](https://sketchfab.com/3d-models/bd7258ee007b4e0fb521abb74bfa99d0) | dirdim |
| penguin | [African penguin (Spheniscus demersus) Low poly](https://sketchfab.com/3d-models/9e59070815fe451d93398e2ebdb9bb92) | majorgalah |
| flamingo | [Flamingo](https://sketchfab.com/3d-models/b363f8f4f7394ddb9d5b3a337f2f7fc7) | muppe5 |
| polarbear | [Polar Bear](https://sketchfab.com/3d-models/deeb7f4add9f4c36abaacdb73ce3e553) | kenchoo |
| lion | [low poly realistic lion 3d model free](https://sketchfab.com/3d-models/8d08b8ab84434e8fb1c857c2dc6dccd0) | rt699448 |
| rockA | [Rock Stone 14 .::RAWscan::.](https://sketchfab.com/3d-models/3b8de09bc6344f46a493d86e4e4d9678) | spogna |
| rockB | [Red Big Stone](https://sketchfab.com/3d-models/82ed6e8d09b140b9816c39dc17946932) | 3dhdscan |

### Cahokia's people

`assets/models/cahokia_people.glb`: four figures of the city about 1100 CE,
built in Blender with MPFB 2 (MakeHuman for Blender, GPL; the generated
bodies and the MakeHuman system, skins and hair assets are CC0) and dressed
from the archaeological record: the Keller figurine's wrap-around skirt, the
deerskin mantle, breechcloth and moccasins of Southeastern dress, marine-shell
beads (Mound 72 held some 20,000) and the copper ear spools of Mississippian
burials, a cane
basket of maize, a red-slipped long-necked bottle, a bundle of prairie grass
for thatch, and a chunkey pole and stone. Clothing and props were modelled for
the game; surfaces are Poly Haven CC0 (`brown_leather`, `rough_linen`,
`brown_mud_dry`, `thatch_roof_angled`, `bark_brown_02`, `granite_wall`).
No feather headdresses, war paint or weapons: those are later, Plains-derived
stereotypes, not Cahokia.
