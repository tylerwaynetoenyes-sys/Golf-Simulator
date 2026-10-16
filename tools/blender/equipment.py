# Bake Fairway's club heads (tools/equipment/build.py writes the high-poly
# meshes, finishes and stamps) down to game meshes and export WebP-Draco GLBs.
#
#   blender -b --factory-startup --python tools/blender/equipment.py -- <build>/<set> <out dir> [club ...] [--tex 1024]
#
# Per head: decimate a copy of the high-poly (collapse) to the game budget,
# Smart-UV it, then with Cycles bake from the high-poly (selected to active):
# tangent-space normals (geometry plus the stamps' engraving, grooves and
# scorelines as bump), base colour and roughness/metalness (emission passes
# of the vertex finish with the stamps' paint over it) and ambient occlusion,
# which is folded into the base colour. The node is named "head" and carries
# the head's metadata (face centre, shaft axis, where the shaft starts) as
# glTF extras, in metres, in the game's frame (+x toe, +y up, +z back).
import bpy
import bmesh
import json
import math
import os
import sys
import time
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['', '']
TEX = 1024
if '--tex' in argv:
    i = argv.index('--tex')
    TEX = int(argv[i + 1])
    del argv[i:i + 2]
SRC, OUT = argv[0], argv[1]
ONLY = argv[2:]
BUDGET = {'driver': 8000, 'fairway': 7000, 'hybrid': 6500, 'persimmon': 7000, 'iron': 5500, 'hockey': 4500}


def bl(p):
    """address frame (mm, y up) -> Blender (m, z up)"""
    return (p[0] * 0.001, -p[2] * 0.001, p[1] * 0.001)


def bldir(p):
    return (p[0], -p[2], p[1])


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    if os.environ.get('FW_GPU'):
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = 'GPU'
    sc.cycles.samples = 1
    sc.render.bake.margin = 6
    sc.render.bake.use_selected_to_active = True
    sc.render.bake.cage_extrusion = 0.0007
    sc.render.bake.max_ray_distance = 0.0025
    w = bpy.data.worlds.new('w')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    sc.world = w


def high_object(npz):
    d = np.load(npz)
    v, f, n = d['v'], d['f'], d['n']
    me = bpy.data.meshes.new('high')
    bv = np.stack([v[:, 0], -v[:, 2], v[:, 1]], 1) * 0.001
    me.vertices.add(len(bv))
    me.vertices.foreach_set('co', bv.ravel())
    me.loops.add(len(f) * 3)
    me.loops.foreach_set('vertex_index', f.ravel())
    me.polygons.add(len(f))
    me.polygons.foreach_set('loop_start', np.arange(0, len(f) * 3, 3))
    me.polygons.foreach_set('loop_total', np.full(len(f), 3))
    me.update(calc_edges=True)
    me.validate()
    me.shade_smooth()
    bn = np.stack([n[:, 0], -n[:, 2], n[:, 1]], 1)
    me.normals_split_custom_set_from_vertices(bn.tolist())
    ca = me.color_attributes.new('col', 'FLOAT_COLOR', 'POINT')
    ca.data.foreach_set('color', np.c_[d['col'], np.ones(len(v))].ravel())
    for k, src in (('rough', d['rough']), ('metal', d['metal']), ('region', d['r'].astype(np.float32))):
        at = me.attributes.new(k, 'FLOAT', 'POINT')
        at.data.foreach_set('value', src.ravel())
    ob = bpy.data.objects.new('high', me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def select_only(*obs, active=None):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or obs[0]


def low_object(high, target):
    me = high.data.copy()
    me.materials.clear()
    ob = bpy.data.objects.new('head', me)
    bpy.context.scene.collection.objects.link(ob)
    for k in ('rough', 'metal', 'region'):
        if k in me.attributes:
            me.attributes.remove(me.attributes[k])
    if 'col' in me.color_attributes:
        me.color_attributes.remove(me.color_attributes['col'])
    select_only(ob)
    bpy.ops.mesh.customdata_custom_splitnormals_clear()  # plain smooth normals on the low mesh
    mod = ob.modifiers.new('dec', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = target / len(me.polygons)
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')
    ob.data.shade_smooth()
    # Smart UV with room for bleed
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.006, area_weight=0.0, scale_to_bounds=True)
    bpy.ops.uv.pack_islands(rotate=True, margin=0.006)
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


def ball_low(radius_m, n=12):
    """A cube sphere (6 x n x n quads, ~1.7k triangles), each cube face its own UV tile in a 3x2 grid."""
    me = bpy.data.meshes.new('ball')
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    axes = [((1, 0, 0), (0, 1, 0), (0, 0, 1)), ((-1, 0, 0), (0, -1, 0), (0, 0, 1)), ((0, 1, 0), (-1, 0, 0), (0, 0, 1)),
            ((0, -1, 0), (1, 0, 0), (0, 0, 1)), ((0, 0, 1), (1, 0, 0), (0, 1, 0)), ((0, 0, -1), (-1, 0, 0), (0, 1, 0))]
    cache = {}

    def vert(p):
        k = tuple(np.round(p, 6))
        if k not in cache:
            q = np.array(p) / np.linalg.norm(p) * radius_m
            cache[k] = bm.verts.new(q)
        return cache[k]
    pad = 0.012
    for fi, (nrm, ua, va) in enumerate(axes):
        nrm, ua, va = map(np.array, (nrm, ua, va))
        tu, tv = fi % 3, fi // 3
        for i in range(n):
            for j in range(n):
                cs = []
                for (a, b) in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)):
                    s_, t_ = -1 + 2 * a / n, -1 + 2 * b / n
                    # equal-angle cube map: even texel size across each face
                    s2, t2 = math.tan(s_ * math.pi / 4), math.tan(t_ * math.pi / 4)
                    cs.append((nrm + ua * s2 + va * t2, (a / n, b / n)))
                f = bm.faces.new([vert(p) for p, _ in cs])
                for loop, (_, (a, b)) in zip(f.loops, cs):
                    loop[uvl].uv = ((tu + pad + a * (1 - 2 * pad)) / 3, (tv + pad + b * (1 - 2 * pad)) / 2)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    ob = bpy.data.objects.new('ball', me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def node(nt, typ, **kw):
    n = nt.nodes.new(typ)
    for k, v in kw.items():
        setattr(n, k, v)
    return n


def vmath(nt, op, a, b=None, val=None):
    n = node(nt, 'ShaderNodeVectorMath', operation=op)
    nt.links.new(a, n.inputs[0])
    if b is not None:
        if isinstance(b, (tuple, list)):
            n.inputs[1].default_value = b
        else:
            nt.links.new(b, n.inputs[1])
    if val is not None:
        n.inputs[3].default_value = val  # scale
    return n


def math_(nt, op, a, b=None, clamp=False):
    n = node(nt, 'ShaderNodeMath', operation=op, use_clamp=clamp)
    for i, x in enumerate((a, b)):
        if x is None:
            continue
        if isinstance(x, (int, float)):
            n.inputs[i].default_value = x
        else:
            nt.links.new(x, n.inputs[i])
    return n.outputs[0]


def mix_rgb(nt, fac, a, b):
    n = node(nt, 'ShaderNodeMix', data_type='RGBA', blend_type='MIX')
    nt.links.new(fac, n.inputs['Factor'])
    for sock, x in ((n.inputs[6], a), (n.inputs[7], b)):
        if isinstance(x, tuple):
            sock.default_value = x
        else:
            nt.links.new(x, sock)
    return n.outputs[2]


def mix_f(nt, fac, a, b):
    n = node(nt, 'ShaderNodeMix', data_type='FLOAT')
    nt.links.new(fac, n.inputs['Factor'])
    for sock, x in ((n.inputs[2], a), (n.inputs[3], b)):
        if isinstance(x, (int, float)):
            sock.default_value = x
        else:
            nt.links.new(x, sock)
    return n.outputs[0]


def load_img(path, noncolor=False):
    im = bpy.data.images.load(path, check_existing=True)
    im.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'
    im.alpha_mode = 'STRAIGHT'
    return im


def high_material(high, stamps):
    """One node tree with every output the bakes need; returns the tree's switch points."""
    mat = bpy.data.materials.new('high')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = node(nt, 'ShaderNodeOutputMaterial')
    tc = node(nt, 'ShaderNodeTexCoord')
    geo = node(nt, 'ShaderNodeNewGeometry')
    col = node(nt, 'ShaderNodeAttribute', attribute_name='col').outputs['Color']
    rough = node(nt, 'ShaderNodeAttribute', attribute_name='rough').outputs['Fac']
    metal = node(nt, 'ShaderNodeAttribute', attribute_name='metal').outputs['Fac']
    region = node(nt, 'ShaderNodeAttribute', attribute_name='region').outputs['Fac']
    height = None
    P = tc.outputs['Object']
    for st in stamps:
        o = bl(st['o'])
        d = vmath(nt, 'SUBTRACT', P, o).outputs[0]
        if st['mode'] == 'plane':
            u = bldir(st['u'])
            v = bldir(st['v'])
            uu = math_(nt, 'ADD', math_(nt, 'DIVIDE', vmath(nt, 'DOT_PRODUCT', d, u).outputs['Value'], st['w'] * 0.001), 0.5)
            vv = math_(nt, 'ADD', math_(nt, 'DIVIDE', vmath(nt, 'DOT_PRODUCT', d, v).outputs['Value'], st['h'] * 0.001), 0.5)
        else:
            ax = np.array(bldir(st['v']))
            ref = np.array(bldir(st['u']))
            e1 = ref - ax * (ref @ ax)
            e1 /= np.linalg.norm(e1)
            e2 = np.cross(ax, e1)
            ang = math_(nt, 'ARCTAN2', vmath(nt, 'DOT_PRODUCT', d, tuple(e2)).outputs['Value'],
                        vmath(nt, 'DOT_PRODUCT', d, tuple(e1)).outputs['Value'])
            uu = math_(nt, 'ADD', math_(nt, 'DIVIDE', ang, 2 * math.pi), 0.5)
            vv = math_(nt, 'ADD', math_(nt, 'DIVIDE', vmath(nt, 'DOT_PRODUCT', d, tuple(ax)).outputs['Value'], st['h'] * 0.001), 0.5)
        cmb = node(nt, 'ShaderNodeCombineXYZ')
        nt.links.new(uu, cmb.inputs[0])
        nt.links.new(vv, cmb.inputs[1])
        uvv = cmb.outputs[0]
        # where it may land: its regions, and surfaces facing its projection
        mask = None
        if st.get('region'):
            for rid in st['region']:
                c = math_(nt, 'COMPARE', region, float(rid))
                c.node.inputs[2].default_value = 0.5
                mask = c if mask is None else math_(nt, 'ADD', mask, c, clamp=True)
        if st.get('facing', -2) > -1:
            f = math_(nt, 'GREATER_THAN', vmath(nt, 'DOT_PRODUCT', geo.outputs['Normal'], bldir(st['n'])).outputs['Value'], st['facing'])
            mask = f if mask is None else math_(nt, 'MULTIPLY', mask, f)
        if mask is None:
            mask = math_(nt, 'ADD', 1.0, 0.0)
        if st.get('img'):
            it = node(nt, 'ShaderNodeTexImage', image=load_img(st['img']), extension='CLIP', interpolation='Cubic')
            nt.links.new(uvv, it.inputs[0])
            a = math_(nt, 'MULTIPLY', it.outputs['Alpha'], mask)
            if not st.get('keep'):
                col = mix_rgb(nt, a, col, it.outputs['Color'])
                metal = mix_f(nt, a, metal, st['metal'] if st.get('metal') is not None else 0.0)
                rough = mix_f(nt, a, rough, st['rough'] if st.get('rough') is not None else st.get('paintRough', 0.42))
            else:
                if st.get('rough') is not None:
                    rough = mix_f(nt, a, rough, st['rough'])
        if st.get('hgt'):
            ih = node(nt, 'ShaderNodeTexImage', image=load_img(st['hgt'], True), extension='CLIP', interpolation='Cubic')
            nt.links.new(uvv, ih.inputs[0])
            dh = math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', ih.outputs['Color'], mask), -st['depth'] * 0.001)
            height = dh if height is None else math_(nt, 'ADD', height, dh)
    bsdf = node(nt, 'ShaderNodeBsdfPrincipled')
    nt.links.new(col, bsdf.inputs['Base Color'])
    if height is not None:
        bump = node(nt, 'ShaderNodeBump')
        bump.inputs['Distance'].default_value = 1.0
        bump.inputs['Strength'].default_value = 1.0
        nt.links.new(height, bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    em_col = node(nt, 'ShaderNodeEmission')
    nt.links.new(col, em_col.inputs['Color'])
    cmb = node(nt, 'ShaderNodeCombineColor')
    cmb.inputs[0].default_value = 1.0
    nt.links.new(rough, cmb.inputs[1])
    nt.links.new(metal, cmb.inputs[2])
    em_orm = node(nt, 'ShaderNodeEmission')
    nt.links.new(cmb.outputs[0], em_orm.inputs['Color'])
    high.data.materials.append(mat)
    return dict(nt=nt, out=out, bsdf=bsdf, col=em_col, orm=em_orm)


def bake(low, high, sw, kind, img):
    nt = low.active_material.node_tree
    tn = nt.nodes['target']
    tn.image = img
    nt.nodes.active = tn
    src = {'NORMAL': sw['bsdf'], 'AO': sw['bsdf'], 'EMIT_COL': sw['col'], 'EMIT_ORM': sw['orm']}[kind]
    sw['nt'].links.new(src.outputs[0], sw['out'].inputs['Surface'])
    sc = bpy.context.scene
    sc.cycles.samples = 64 if kind == 'AO' else 1
    select_only(high, low, active=low)
    t = time.time()
    typ = 'EMIT' if kind.startswith('EMIT') else kind
    bpy.ops.object.bake(type=typ, normal_space='TANGENT', use_selected_to_active=True, margin=6,
                        cage_extrusion=0.0007, max_ray_distance=0.0025)
    print(f'  bake {kind} {time.time() - t:.1f}s', flush=True)


def pixels(img):
    a = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def save_img(name, arr, path, noncolor):
    im = bpy.data.images.new(name, arr.shape[1], arr.shape[0], alpha=False)
    im.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'
    im.pixels.foreach_set(arr.astype(np.float32).ravel())
    im.filepath_raw = path
    im.file_format = 'PNG'
    im.save()
    return im


def process(cid, tmp):
    js = json.load(open(os.path.join(SRC, cid + '.json')))
    t0 = time.time()
    setup()
    high = high_object(os.path.join(SRC, cid + '.npz'))
    sw = high_material(high, js['stamps'])
    fam = js['family']
    low = ball_low(0.021335) if fam == 'ball' else low_object(high, BUDGET.get(fam, 6000))
    # bake target material on the low mesh
    lm = bpy.data.materials.new('bake')
    lm.use_nodes = True
    tn = lm.node_tree.nodes.new('ShaderNodeTexImage')
    tn.name = 'target'
    low.data.materials.append(lm)
    imgs = {}
    for k, fl, nc in (('NORMAL', False, True), ('EMIT_COL', True, False), ('EMIT_ORM', True, True), ('AO', True, True)):
        im = bpy.data.images.new(k, TEX, TEX, alpha=False, float_buffer=fl)
        im.colorspace_settings.name = 'Non-Color' if nc else 'Linear Rec.709'
        if k == 'NORMAL':
            im.generated_color = (0.5, 0.5, 1, 1)
        imgs[k] = im
        bake(low, high, sw, k, im)
    col = pixels(imgs['EMIT_COL'])[..., :3]
    ao = pixels(imgs['AO'])[..., :1]
    orm = pixels(imgs['EMIT_ORM'])[..., :3]
    nrm = pixels(imgs['NORMAL'])[..., :3]
    # occlusion: crevices and grooves darken the base colour a little
    aok = 0.55 + 0.45 * np.clip(ao, 0, 1) ** 0.8
    base = to_srgb(col * aok)
    orm[..., 0] = 1.0
    p_base = save_img('base', np.dstack([base, np.ones(base.shape[:2])]), os.path.join(tmp, cid + '_base.png'), False)
    p_orm = save_img('orm', np.dstack([orm, np.ones(orm.shape[:2])]), os.path.join(tmp, cid + '_orm.png'), True)
    p_nrm = save_img('nrm', np.dstack([nrm, np.ones(nrm.shape[:2])]), os.path.join(tmp, cid + '_nrm.png'), True)
    # the game material
    bpy.data.objects.remove(high)
    low.data.materials.clear()
    gm = bpy.data.materials.new(f'{cid}')
    gm.use_nodes = True
    nt = gm.node_tree
    pb = nt.nodes['Principled BSDF']
    tb = node(nt, 'ShaderNodeTexImage', image=p_base)
    nt.links.new(tb.outputs[0], pb.inputs['Base Color'])
    to = node(nt, 'ShaderNodeTexImage', image=p_orm)
    sep = node(nt, 'ShaderNodeSeparateColor')
    nt.links.new(to.outputs[0], sep.inputs[0])
    nt.links.new(sep.outputs[1], pb.inputs['Roughness'])
    nt.links.new(sep.outputs[2], pb.inputs['Metallic'])
    tnm = node(nt, 'ShaderNodeTexImage', image=p_nrm)
    nm = node(nt, 'ShaderNodeNormalMap')
    nt.links.new(tnm.outputs[0], nm.inputs['Color'])
    nt.links.new(nm.outputs[0], pb.inputs['Normal'])
    if fam == 'ball' and js.get('coat'):
        pb.inputs['Coat Weight'].default_value = 1.0
        pb.inputs['Coat Roughness'].default_value = js['coat']
    low.data.materials.append(gm)
    if fam == 'ball':
        low.name = 'ball'
        low['dimples'] = int(js['dimples'])
        low['layout'] = js['layout']
        return export(low, cid, t0)
    # metadata for the game, metres in the game's frame
    for k in ('faceCenter', 'faceNormal', 'faceUp', 'axis'):
        sc = 0.001 if k == 'faceCenter' else 1.0
        low[k] = [float(x) * sc for x in js[k]]
    for k in ('shaftStart', 'hoselTop', 'tipRadius'):
        low[k] = float(js[k]) * 0.001
    low['loft'] = float(js['loft'])
    low['lie'] = float(js['lie'])
    low['family'] = fam
    low.name = 'head'
    return export(low, cid, t0)


def export(low, cid, t0):
    select_only(low)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, cid + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_extras=True,
                              export_image_format='WEBP', export_image_quality=88, export_draco_mesh_compression_enable=True,
                              export_draco_mesh_compression_level=7, export_draco_position_quantization=14,
                              export_draco_normal_quantization=10, export_draco_texcoord_quantization=12,
                              export_tangents=False, export_materials='EXPORT', export_yup=True)
    print(f'{cid}: {len(low.data.polygons)} tris, {os.path.getsize(path) / 1024:.0f} KB, {time.time() - t0:.0f}s', flush=True)


if __name__ == '__main__':
    ids = ONLY or sorted(f[:-5] for f in os.listdir(SRC) if f.endswith('.json'))
    tmp = os.path.join(SRC, '_tex')
    os.makedirs(tmp, exist_ok=True)
    for cid in ids:
        process(cid, tmp)
