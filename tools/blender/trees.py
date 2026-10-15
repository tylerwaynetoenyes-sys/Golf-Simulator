# Sketchfab tree -> game-ready GLB for js/scene/treeModels.js.
#
# Run inside Blender (the MCP add-on, or the Python console) after importing a
# model, with its root object's name:
#   fairway_export('Sketchfab_model', 'assets/models/trees/oak.glb')
#   fairway_remove('Sketchfab_model')   # take the import back out of the scene
# or headless on a downloaded .glb:
#   blender -b --factory-startup --python tools/blender/trees.py -- in.glb out.glb
#
# Leaves are the materials whose alpha input is wired (alpha-tested cards);
# everything else is bark. Bark is decimated to ~2,600 triangles and its
# textures cut to 512 px (colour and normal kept); leaf cards keep their
# geometry, colour and alpha at 1024 px and lose the normal and
# metallic-roughness maps. Export: GLB, Draco level 7, WebP textures.
import bpy, os, sys


def is_leafy(me):
    for m in me.materials:
        if not m or not m.node_tree:
            continue
        b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if b and b.inputs['Alpha'].is_linked:
            return True
    return False


def _tree(o):
    out = [o]
    for c in o.children:
        out += _tree(c)
    return out


def fairway_export(root_name, out_path, bark_tris=2600, bark_px=512, leaf_px=1024, leaf_tris=None):
    root = bpy.data.objects[root_name]
    objs = _tree(root)
    report = []
    for o in [o for o in objs if o.type == 'MESH']:
        me = o.data
        leafy = is_leafy(me)
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        if not leafy and tris > bark_tris:
            o.modifiers.new('fw_dec', 'DECIMATE').ratio = bark_tris / tris
        if leafy and leaf_tris and tris > leaf_tris:
            o.modifiers.new('fw_dec', 'DECIMATE').ratio = leaf_tris / tris
        for m in me.materials:
            if not m:
                continue
            nt = m.node_tree
            bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            for n in list(nt.nodes):
                if n.type != 'TEX_IMAGE' or not n.image:
                    continue
                to = [l.to_socket.name for l in n.outputs[0].links] + [l.to_socket.name for l in n.outputs[1].links]
                normal = any(l.to_node.type == 'NORMAL_MAP' for l in n.outputs[0].links)
                if 'Base Color' not in to and 'Alpha' not in to and not (normal and not leafy):
                    nt.nodes.remove(n)
                    continue
                px = leaf_px if leafy else bark_px
                if max(n.image.size) > px:
                    n.image.scale(px, px)
            if bsdf:
                bsdf.inputs['Metallic'].default_value = 0
                if not bsdf.inputs['Roughness'].is_linked:
                    bsdf.inputs['Roughness'].default_value = 0.9
        report.append((o.name, 'leaf' if leafy else 'bark', tris))
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=out_path, use_selection=True, export_format='GLB',
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
        export_image_format='WEBP', export_apply=True,
        export_animations=False, export_cameras=False, export_lights=False)
    return report, os.path.getsize(out_path)


def fairway_remove(root_name):
    """Delete an import and the data only it used (never anything else)."""
    objs = _tree(bpy.data.objects[root_name])
    datas, mats, imgs = set(), set(), set()
    for o in objs:
        if o.type == 'MESH':
            datas.add(o.data)
            for m in o.data.materials:
                if m:
                    mats.add(m)
                    imgs |= {n.image for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image}
    for o in objs:
        bpy.data.objects.remove(o)
    for d in datas:
        if d.users == 0:
            bpy.data.meshes.remove(d)
    for m in mats:
        if m.users == 0:
            bpy.data.materials.remove(m)
    for i in imgs:
        if i.users == 0:
            bpy.data.images.remove(i)
    return len(objs)


if __name__ == '__main__' and '--' in sys.argv:
    src, out = sys.argv[sys.argv.index('--') + 1:][:2]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    root = bpy.data.objects.new('fw_root', None)
    bpy.context.scene.collection.objects.link(root)
    for o in list(bpy.context.scene.objects):
        if o is not root and o.parent is None:
            o.parent = root
    print(fairway_export('fw_root', out))
