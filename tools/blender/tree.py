# Headless Blender: Poly Haven island_tree_02 -> a game-ready GLB.
#   blender -b --factory-startup --python tree.py -- <in.gltf> <alpha.jpg> <out.glb>
import bpy, bmesh, sys, random
args = sys.argv[sys.argv.index('--') + 1:]
src, alpha_path, out = args
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
print('meshes', [(o.name, len(o.data.polygons), [m.name for m in o.data.materials]) for o in objs])
ob = objs[0]
bpy.context.view_layer.objects.active = ob
for o in objs: o.select_set(o == ob)
# split by material so each part can be thinned its own way
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.separate(type='MATERIAL')
bpy.ops.object.mode_set(mode='OBJECT')
parts = [o for o in bpy.context.scene.objects if o.type == 'MESH']
random.seed(7)
for o in parts:
    name = o.data.materials[0].name
    n0 = len(o.data.polygons)
    bpy.context.view_layer.objects.active = o
    for x in parts: x.select_set(x == o)
    if 'leaves' in name:
        # leaves are cards: keep ~10% of the loose leaf islands, scaled up a touch
        bm = bmesh.new(); bm.from_mesh(o.data)
        bm.faces.ensure_lookup_table()
        seen, islands = set(), []
        for f in bm.faces:
            if f.index in seen: continue
            stack, isl = [f], []
            seen.add(f.index)
            while stack:
                g = stack.pop(); isl.append(g)
                for e in g.edges:
                    for h in e.link_faces:
                        if h.index not in seen: seen.add(h.index); stack.append(h)
            islands.append(isl)
        kill = []
        keep = 0
        for isl in islands:
            if random.random() < 0.1:
                keep += 1
                c = sum((v.co for f in isl for v in f.verts), start=isl[0].verts[0].co * 0) / sum(len(f.verts) for f in isl)
                for v in {v for f in isl for v in f.verts}: v.co = c + (v.co - c) * 2.1
            else: kill.extend(isl)
        bmesh.ops.delete(bm, geom=kill, context='FACES')
        bm.to_mesh(o.data); bm.free()
        print('leaf islands', len(islands), 'kept', keep)
        m = o.modifiers.new('dec', 'DECIMATE')
        m.ratio = 0.3
        bpy.ops.object.modifier_apply(modifier='dec')
    else:
        m = o.modifiers.new('dec', 'DECIMATE')
        m.ratio = 0.035 if 'branches' in name else 0.08
        bpy.ops.object.modifier_apply(modifier='dec')
    print(name, n0, '->', len(o.data.polygons))
# leaves: put the alpha map into the base colour's alpha and clip it
for mat in bpy.data.materials:
    if 'leaves' not in mat.name: continue
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    base = bsdf.inputs['Base Color'].links[0].from_node
    img = base.image
    a = bpy.data.images.load(alpha_path)
    w, h = img.size
    a.scale(w, h)
    px, pa = list(img.pixels), list(a.pixels)
    for i in range(0, len(px), 4): px[i + 3] = pa[i]
    comb = bpy.data.images.new('island_tree_02_leaves', w, h, alpha=True)
    comb.pixels = px
    comb.file_format = 'PNG'
    base.image = comb
    nt.links.new(base.outputs['Alpha'], bsdf.inputs['Alpha'])
    mat.blend_method = 'CLIP'
    mat.alpha_threshold = 0.5
# smaller textures for the game
for im in bpy.data.images:
    if im.size[0] > 512 and 'leaves' in im.name: im.scale(512, 512)
    elif im.size[0] > 512: im.scale(512, 512)
mn = [min(v.co[i] for o in parts for v in o.data.vertices) for i in range(3)]
mx = [max(v.co[i] for o in parts for v in o.data.vertices) for i in range(3)]
print('bbox', mn, mx)
for o in parts: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_image_format='AUTO', export_apply=True)
print('wrote', out)
