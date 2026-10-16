# The wooden tee the ball sits on, modelled for the game.
#
#   blender -b --factory-startup --python tools/blender/tee.py -- assets/models/tee.glb
#
# A 2 3/4 in (70 mm) birch tee: a cupped head 11 mm across with a rolled rim, a
# short neck, the shank tapering to a point. Painted white, the gloss worn off
# the point where it has been pushed into the ground and the grain showing
# there. One node, "tee": metres, +y up, origin on the axis at the top of the
# cup's rim (where the ball sits), the point at y = -0.07.
import bpy
import bmesh
import math
import os
import sys
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['tee.glb']
OUT = argv[0]
IN = 0.0254
L = 2.75 * IN

bpy.ops.wm.read_factory_settings(use_empty=True)

# (r, z) from the cup's centre round the rim and down the shank to the point
prof = [
    (0.0, -0.0032), (0.0018, -0.0031), (0.0034, -0.0026), (0.0046, -0.0016), (0.0052, -0.0006),   # the cup
    (0.0056, 0.0), (0.0058, -0.0006), (0.0057, -0.0016),                                         # the rolled rim
    (0.0049, -0.0032), (0.0038, -0.006), (0.0031, -0.0095),                                      # under the head into the neck
    (0.00285, -0.014), (0.0027, -0.03), (0.0024, -0.048), (0.0019, -0.06), (0.0012, -0.066),
    (0.0005, -0.0692), (0.0, -L),
]
S = 40
bm = bmesh.new()
uv = bm.loops.layers.uv.new('UVMap')
col = bm.verts.layers.float_color.new('Col')
rings = []
for (r, z) in prof:
    rings.append([bm.verts.new((r * math.cos(i / S * 2 * math.pi), r * math.sin(i / S * 2 * math.pi), z)) for i in range(S)])
for j, (a, b) in enumerate(zip(rings[:-1], rings[1:])):
    for i in range(S):
        f = bm.faces.new((a[i], b[i], b[(i + 1) % S], a[(i + 1) % S]))
        for lp, (ii, jj) in zip(f.loops, ((i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j))):
            lp[uv].uv = (ii / S, 1 - jj / (len(prof) - 1))
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
# white paint, chipped and scuffed toward the point; the bare birch and a little soil at the very tip
rng = np.random.default_rng(3)
for v in bm.verts:
    z = v.co.z
    worn = min(1.0, max(0.0, (-z - 0.045) / 0.02))
    a = math.atan2(v.co.y, v.co.x)
    chip = 0.5 + 0.5 * math.sin(a * 5 + z * 900) * math.sin(z * 1700)
    k = min(1.0, worn * (0.6 + 0.6 * chip))
    paint = np.array([0.86, 0.86, 0.83])
    wood = np.array([0.55, 0.42, 0.27])
    soil = np.array([0.18, 0.13, 0.08])
    c = paint * (1 - k) + wood * k
    if z < -0.064: c = c * 0.4 + soil * 0.6
    # a faint grey ring where the clubface has struck it before
    if -0.006 < z < -0.0025: c = c * 0.93
    v[col] = (*c, 1)
me = bpy.data.meshes.new('tee')
bm.to_mesh(me); bm.free()
for p in me.polygons: p.use_smooth = True
ob = bpy.data.objects.new('tee', me)
bpy.context.scene.collection.objects.link(ob)
m = bpy.data.materials.new('tee')
m.use_nodes = True
nt = m.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'Col'
nt.links.new(a.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.32
bsdf.inputs['Coat Weight'].default_value = 0.35
me.materials.append(m)
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=True, export_vertex_color='MATERIAL')
print('node tee', len(me.vertices))
