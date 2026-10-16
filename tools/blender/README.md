# Poly Haven and Sketchfab assets through Blender

Scanned assets from [Poly Haven](https://polyhaven.com) (CC0) are prepared in
Blender (4.3, run headless) before they ship in `assets/`.

| Asset | Poly Haven source | Script | Output |
|---|---|---|---|
| Old olive (scanned tree) | `island_tree_02` (glTF 1k + leaf alpha) | `tree.py` | `assets/models/island_tree_02.glb` |
| Turf and ground detail | `aerial_grass_rock` (diffuse 1k) | `detail.py` | `assets/textures/ground_detail.jpg` |
| Bunker sand detail | `dense_sand` (diffuse 1k) | `detail.py` | `assets/textures/sand_detail.jpg` |
| Shipping container steel | `container_side` (diffuse + normal GL 1k) | `container.py` | `assets/textures/container_side.jpg`, `container_side_nor.jpg` |

```
blender -b --factory-startup --python tools/blender/tree.py -- island_tree_02_1k.gltf island_tree_02_leaves_alpha_1k.jpg assets/models/island_tree_02.glb
blender -b --factory-startup --python tools/blender/detail.py -- aerial_grass_rock_diff_1k.jpg assets/textures/ground_detail.jpg 512 1.0
blender -b --factory-startup --python tools/blender/container.py -- container_side_diff_1k.jpg container_side_nor_gl_1k.jpg assets/textures 512
blender -b --factory-startup --python tools/blender/render.py -- assets/models/island_tree_02.glb preview.png
```

`tree.py` splits the scan by material, keeps 10% of the 29,781 leaf cards
(enlarged to keep the crown full) and decimates them, decimates trunk and
branches, puts the leaf alpha into the base colour so the leaves clip
cleanly, downsizes textures to 512 px and exports a GLB: 1.07 M faces to
about 35 k, 2.3 MB. In game it is instanced (at most 30 per hole) as the
olive on the Cassis course.

`container.py` keeps the container scan's paint luminance (the material
supplies each box's colour) in red and writes a tileable rust mask (blotches,
streaks running down the ribs) into green; the corrugation comes from the
normal map.

`detail.py` turns a colour scan into a tileable luminance map (mean 0.85,
limited contrast) that multiplies over each course's own ground colours, so
the scan adds texture without changing the palette.

Downloads come from `https://api.polyhaven.com/files/<asset>`; check their
MD5 against the API when refreshing them.

## Course trees (Sketchfab, CC BY)

`trees.py` turns a Sketchfab tree into a game-ready GLB for
`js/scene/treeModels.js`: bark decimated to ~2,600 triangles with 512 px
textures, leaf cards kept whole with 1024 px colour and alpha, Draco and WebP.
The ten trees in `assets/models/trees/` (evolveduk's set; credits in
`docs/SOURCES.md`) were imported through the Blender MCP add-on and exported
with `fairway_export`, then removed again with `fairway_remove`, which only
touches the import's own objects and data. Each is 150–320 KB and 2.6–6.6 k
triangles.

The rubble heap on the East St. Louis lots (`assets/models/rubble_concrete.glb`,
albentan2012's "A Pile Of Concrete Debris" scan, CC BY) went through the same
export after its parts were joined and their split vertices welded (Merge by
Distance, 0.5 mm), then decimated from 48.7 k to 4.5 k triangles with the
4K colour map cut to 1K. Without the weld the decimation shatters the scan.

## Golf clubs and balls (built here, not imported)

`equipment.py` bakes the club heads and balls that `tools/equipment/build.py`
models as signed-distance fields (high-poly mesh, finish and stamps per head)
down to game meshes, and `shafts.py` lathes each set's shafts and grip. The
whole run, every set and ball, is `tools/equipment/build-all.sh`; one head:

```
python tools/equipment/build.py /tmp/fw tour --clubs 7I
blender -b --factory-startup --python tools/blender/equipment.py -- /tmp/fw/tour assets/models/clubs/tour 7I
node tools/equipment-check.mjs --base http://localhost:8765 tour
```

Per head: collapse-decimate to 4.5–8k triangles, Smart UV, then Cycles bakes
(selected to active, 1024 px) of tangent normals (geometry plus the stamps'
engravings, grooves and scorelines as bump), base colour and
roughness/metalness (emission passes of the vertex finish with the stamps'
paint) and ambient occlusion (folded into the base colour). The GLB node
`head` carries `faceCenter`, `axis`, `shaftStart`, `loft` and `lie` as
extras for `js/scene/club.js`.

## Modelled from scratch (no source assets)

| Script | Output |
|---|---|
| `cup.py` | `assets/models/cup.glb`: the hole to the Rules (4.25 in, liner sunk 1 in, 4 in deep): painted soil wall, liner with socket boss, ribs and drain holes, gravel, edge grass, the flagstick's ferrule |
| `green_details.py` | `assets/models/pin.glb` (20 x 14 in flag with sleeve, hems and stitching; top cap; swivel clip), `assets/models/teemarker.glb` (turned walnut, painted band, brass top, spike), `assets/textures/pitchmark_{fresh,repaired}[_nor].png` (Cycles renders of modelled marks) |
| `divots.py` | `assets/models/divots.glb` (seven turf chunks: strip, dollar, fat chunk, short, curl, torn pair), `assets/textures/scar_{scrape,clean,deep,long}[_nor].png` (Cycles renders of modelled scars) |

```
blender -b --factory-startup --python tools/blender/cup.py -- assets/models/cup.glb assets/textures/pbr/brown_mud_dry_diff.jpg
blender -b --factory-startup --python tools/blender/green_details.py -- . [pin] [marker] [marks]
blender -b --factory-startup --python tools/blender/divots.py -- . [chunks] [scars]
```
