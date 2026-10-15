# Real Alton-area courses: what the data supports

Checked 2026-10-14 against the live USGS, OpenStreetMap and OpenGolfAPI
services.

**Verdict: yes.** Alton has better elevation data than any course Fairway
plays today: 1-metre bare-earth LiDAR from two recent Illinois flights. The
gaps are the course shapes (OpenStreetMap is complete for some courses and
thin for others) and two engine limits listed below. Closing those gives
greens and fairways that follow the real ground to about 10 cm.

## Compared with Home Tee Hero

Home Tee Hero (Garmin's simulator) offers about 43,000 courses. Its listing
says only a select set (about 15) carry high-resolution LiDAR for every green
and accurate tree cover; the rest come from its standard course mapping. The
Alton courses are almost certainly in the standard set. Fairway built from 1 m
LiDAR would be more accurate on these courses in elevation and green contour.
That last point is an inference: Garmin publishes no accuracy figures, and I
can't open their Alton courses to compare.

## The data

### Elevation: USGS 3DEP LiDAR (public domain)

| Product | Coverage around Alton | Notes |
|---|---|---|
| 1 m bare-earth DEM | 79 tiles in the Alton/Godfrey/Wood River box | Projects **IL_SouthCentral_2021** and **IL_10CountyNRCS_2023** (published 2026); MO_WestCentral_2018 across the river |
| LiDAR point clouds (LAZ) | 421 tiles | IL_10CountyNRCS_D23; first returns give tree positions and heights |

3DEP Quality Level 2 is specified at ≤10 cm vertical RMSE with ≥2 points
per m². Today Fairway's courses use about 8 m terrain tiles (zoom 14),
smoothed. A 1 m grid has 64 times the samples, enough to show tiers, false
fronts and swales on a green.

### Course shapes: OpenStreetMap (ODbL)

| Course | Where | Hole lines | Greens | Bunkers | Ready? |
|---|---|---|---|---|---|
| Rolling Hills Golf Course | Godfrey | 18 | 18 | 2* | **Yes**: best-mapped Alton course; **built** (see below) |
| Rock Spring Golf Course | Alton | 27* | 28 | 58 | Yes, check (*boundary overlap suspected) |
| Belk Park Golf Course | Wood River | 9 | 9 | 5 | Half mapped (9 of 18) |
| Cloverleaf Golf Course | Alton | 9 | 9 | 0 | Partial |
| The Woodlands Golf Club | Alton | 0 | 18 | 0 | Needs hole lines (quick to add) |
| Lockhaven Golf Club | Godfrey | 18 | 2 | 10 | Needs greens |
| Spencer T. Olin Community Golf Course | Alton | 3 | 4 | 2 | Needs mapping |
| Florissant Golf Club / Eagle Springs | Missouri side | 18 | 19 | 23 / 16 | Yes |

(Counts are OSM features inside each course boundary. *Rolling Hills: an
earlier count of 33 bunkers was wrong; OSM has 2 inside the boundary, plus
29 greens (practice greens included), 60 tees, 20 fairways and 4 water
hazards.)

### Scorecards: OpenGolfAPI (ODbL)

Found: **Spencer T. Olin** (18 holes, par 72, six tee sets), **The
Woodlands** (18, par 72, five tee sets), **Cloverleaf** (18, par 70) and
**Belk Park** (par 72). Not found: Rock Spring, Rolling Hills, Lockhaven.
Those scorecards can be typed in from the course's own card.

### Imagery

EOxCloudless (10 m) colours the land beyond each course. For tracing missing
greens, bunkers and hole lines into OpenStreetMap, use the aerial imagery
built into OSM's iD editor. That is allowed, and the work helps everyone who
uses OSM.

## Engine work needed to beat a generic course

1. **1 m LiDAR terrain.** Add `tools/fetch-lidar.mjs`: query the National
   Map API, download the 1 m GeoTIFF tiles, crop to the course, and bake
   1 m inside the playing area (a 1.5 km square is 4.5 MB) and 2 m for the
   surroundings. `HoleTerrain` then samples it instead of the 8 m grid, and
   the corridor smoothing turns off where real data exists.
2. **Real outlines, not ellipses.** The importer reduces every OSM green,
   bunker and pond to an ellipse. Point-in-polygon surfaces with
   edge-distance blending would draw the true shapes.
3. **Greens from the LiDAR.** Let the real 1 m green surface set the putting
   slopes (the existing slope grid and Stimp physics already read whatever
   surface they're given), instead of the analytic tilt used now.
4. **Trees from the point cloud.** Build a canopy height model from first
   returns, find tree tops, and plant instances at their real positions and
   heights, with ball collision.
5. **Check it.** Yardages against the scorecard; a top-down render overlaid
   on aerial imagery; LiDAR green profiles against the rendered green.

## Suggested order

1. **Pilot on Rolling Hills (Godfrey):** fully mapped in OSM, so it tests
   the LiDAR pipeline (steps 1–3) without any mapping work. Its scorecard is
   entered by hand.
2. **Spencer T. Olin:** Alton's best-known course, and its OpenGolfAPI
   scorecard is already complete. Map its 18 holes in OSM from aerial
   imagery first, then import.
3. **The Woodlands, then Rock Spring, Lockhaven and Belk Park,** as their
   OSM mapping fills in.

Sources: USGS TNM Access API (`tnmaccess.nationalmap.gov`), Overpass API
(OpenStreetMap), OpenGolfAPI course search and hole endpoints, Home Tee Hero
App Store listing.

## Pilot built: Rolling Hills (October 2026)

`?play=rollinghills`. Steps 1–3 and 5 above are done for this course:

- **Terrain**: `tools/fetch-lidar.py` (rasterio) asks TNM Access for the 1 m
  tiles, ranks them (IL_10CountyNRCS_D23, then IL_SouthCentral_2021_D21, then
  newest), reads only the needed window of each COG over HTTP, and warps it
  straight into the game's frame. The playing area is 1 m over 1.8 km (all of
  it from tile x74y432 of the 2023 flight); the 16 km surround is 32 m from
  the tiles' overviews, with Terrarium only where no LiDAR covers. Samples
  more than 15 m from Terrarium are rejected (one 2023 tile has a corrupt
  edge strip).
- **No smoothing**: on LiDAR ground `HoleTerrain` skips the corridor grade,
  the added lumps, the analytic green plane and contours and the bunker
  bowls. Rendered green heights sit within 1.3 cm of the raw grid; in the
  browser the fall line matches the LiDAR to 1.5° on average (hole 7).
  Interior green slopes: median 1.2–4.6%.
- **Real outlines**: `--outlines` keeps the OSM polygons of greens,
  fairways, bunkers and ponds (`Outline` in `holeTerrain.js`), with ponds at
  their hydro-flattened LiDAR level and every bunker or pond near a hole
  included, whichever hole it was mapped nearest.
- **Scorecard** from the club's own card (`assets/courses/rollinghills/scorecard.json`, `--card`).
  The OSM hole lines measure within 1–15 yards of the blue tees on most
  holes; 17 (156 vs 173) and 18 (272 vs 301) start from forward tees.

Still to do: trees from the point cloud (step 4), more bunkers in OSM, and
the same import for Spencer T. Olin and The Woodlands.
