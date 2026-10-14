# Poly Haven assets through Blender

Scanned assets from [Poly Haven](https://polyhaven.com) (CC0) are prepared in
Blender (4.3, run headless) before they ship in `assets/`.

| Asset | Poly Haven source | Script | Output |
|---|---|---|---|
| Old olive (scanned tree) | `island_tree_02` (glTF 1k + leaf alpha) | `tree.py` | `assets/models/island_tree_02.glb` |
| Turf and ground detail | `aerial_grass_rock` (diffuse 1k) | `detail.py` | `assets/textures/ground_detail.jpg` |
| Bunker sand detail | `dense_sand` (diffuse 1k) | `detail.py` | `assets/textures/sand_detail.jpg` |

```
blender -b --factory-startup --python tools/blender/tree.py -- island_tree_02_1k.gltf island_tree_02_leaves_alpha_1k.jpg assets/models/island_tree_02.glb
blender -b --factory-startup --python tools/blender/detail.py -- aerial_grass_rock_diff_1k.jpg assets/textures/ground_detail.jpg 512 1.0
blender -b --factory-startup --python tools/blender/render.py -- assets/models/island_tree_02.glb preview.png
```

`tree.py` splits the scan by material, keeps 10% of the 29,781 leaf cards
(enlarged to keep the crown full) and decimates them, decimates trunk and
branches, puts the leaf alpha into the base colour so the leaves clip
cleanly, downsizes textures to 512 px and exports a GLB: 1.07 M faces to
about 35 k, 2.3 MB. In game it is instanced (at most 30 per hole) as the
olive on the Cassis course.

`detail.py` turns a colour scan into a tileable luminance map (mean 0.85,
limited contrast) that multiplies over each course's own ground colours, so
the scan adds texture without changing the palette.

Downloads come from `https://api.polyhaven.com/files/<asset>`; check their
MD5 against the API when refreshing them.
