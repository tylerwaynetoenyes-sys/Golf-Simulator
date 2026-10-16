# Shafts and grips (tools/equipment/shafts.py writes their profiles and
# textures) as lathed meshes, one WebP-Draco GLB per set:
#   blender -b --factory-startup --python tools/blender/shafts.py -- <build>/shafts/<set> <out>/<set>/shafts.glb
# Nodes: shaft_wood, shaft_iron (tip at the origin, 1 m up +y), grip (its
# bottom at the origin, 0.27 m up +y); the hockey set has hshaft and hgrip.
import bpy
import json
import math
import os
import sys
import numpy as np

src, out = sys.argv[sys.argv.index('--') + 1:][:2]
SIDES = 20


def v_of(s, label=(0.40, 0.62)):
    a, b = label
    return float(np.interp(s, [0, a, b, 1.0], [0, 0.1, 0.9, 1.0]))


def mesh_from(name, rings, closed_top=False):
    """rings: list of (z, [(x, y) around], v); u runs around, seam duplicated."""
    verts, uvs, faces = [], [], []
    n = len(rings[0][1])
    for z, pts, v in rings:
        for i, (x, y) in enumerate(pts + [pts[0]]):
            verts.append((x, y, z))
    for r in range(len(rings) - 1):
        for i in range(n):
            a = r * (n + 1) + i
            b = a + 1
            c = a + (n + 1) + 1
            d = a + (n + 1)
            faces.append((a, b, c, d))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    uv = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            ring, i = divmod(vi, n + 1)
            uv.data[li].uv = (i / n, rings[ring][2])
    me.update()
    me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def circle(r_m):
    return [(r_m * math.cos(2 * math.pi * i / SIDES), r_m * math.sin(2 * math.pi * i / SIDES)) for i in range(SIDES)]


def rrect(w, h, r, n=24):
    """Rounded rectangle outline (metres), n points."""
    pts = []
    per = n // 4
    for q, (cx, cy) in enumerate([(w / 2 - r, h / 2 - r), (-w / 2 + r, h / 2 - r), (-w / 2 + r, -h / 2 + r), (w / 2 - r, -h / 2 + r)]):
        for k in range(per):
            t = math.pi / 2 * (q + k / (per - 1))
            pts.append((cx + r * math.cos(t), cy + r * math.sin(t)))
    return pts


def material(name, tex, coat=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    pb = nt.nodes['Principled BSDF']

    def img(p, nc):
        im = bpy.data.images.load(p, check_existing=True)
        im.colorspace_settings.name = 'Non-Color' if nc else 'sRGB'
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = im
        return n
    b = img(tex['base'], False)
    nt.links.new(b.outputs[0], pb.inputs['Base Color'])
    o = img(tex['orm'], True)
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(o.outputs[0], sep.inputs[0])
    nt.links.new(sep.outputs[1], pb.inputs['Roughness'])
    nt.links.new(sep.outputs[2], pb.inputs['Metallic'])
    if tex.get('nrm'):
        nn = img(tex['nrm'], True)
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(nn.outputs[0], nm.inputs['Color'])
        nt.links.new(nm.outputs[0], pb.inputs['Normal'])
    return m


bpy.ops.wm.read_factory_settings(use_empty=True)
spec = json.load(open(os.path.join(src, 'shafts.json')))
obs = []
for name, d in spec.items():
    if 'profile' in d:
        prof = d['profile']
        if name == 'grip':
            L = 0.2702
            rings = [(s, circle(r * 0.001), s / L) for s, r in prof]
        else:
            rings = [(s, circle(r * 0.001), v_of(s)) for s, r in prof]
    else:
        w, h, r = [x * 0.001 for x in d['rect']]
        if d.get('knob'):
            # tape over the top 27 cm, built up into a knob at the end
            ss = np.linspace(0, 0.27, 14)
            rings = []
            for s in ss:
                k = 1.0 + 0.18 * max(0.0, (s - 0.23) / 0.04) ** 1.5
                rings.append((float(s), rrect(w * k, h * k, r * k), float(s / 0.27)))
            rings.append((0.2712, rrect(w * 0.6, h * 0.6, r * 0.6), 1.0))
            rings.append((0.2716, rrect(0.002, 0.002, 0.0009), 1.0))
        else:
            rings = [(float(s), rrect(w, h, r), float(s)) for s in np.linspace(0, 1, 6)]
    # three's +y is Blender's +z: rings are already built along z
    ob = mesh_from(name, rings)
    ob.data.materials.append(material(name, d['tex']))
    obs.append(ob)

for o in bpy.context.scene.objects:
    o.select_set(o in obs)
os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_image_format='WEBP',
                          export_image_quality=86, export_draco_mesh_compression_enable=True,
                          export_draco_mesh_compression_level=7, export_yup=True)
print(out, os.path.getsize(out) // 1024, 'KB', [(o.name, len(o.data.polygons)) for o in obs])
