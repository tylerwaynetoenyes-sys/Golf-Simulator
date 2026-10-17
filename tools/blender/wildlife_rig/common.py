import bpy, os, math, sys
from mathutils import Vector, Matrix
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), 'assets', 'models', 'wildlife')
def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30
def load(path):
    bpy.ops.import_scene.gltf(filepath=path)
    for o in list(bpy.data.objects):
        if o.name.startswith('Icosphere'): bpy.data.objects.remove(o, do_unlink=True)
def shrink_images(px=1024):
    for im in bpy.data.images:
        if im.size[0] > px: im.scale(px, max(1, int(im.size[1] * px / im.size[0])))
def keep_actions(rename):
    """rename: {source action name prefix: new name}; others deleted"""
    out = {}
    for a in list(bpy.data.actions):
        base = a.name.replace('_Object_5', '')
        if base in rename:
            a.name = rename[base]; a.use_fake_user = True; out[a.name] = a
        else:
            bpy.data.actions.remove(a)
    return out
def export(path, objs, extras=True, anims=True):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_animations=anims,
        export_animation_mode='ACTIONS', export_force_sampling=True, export_frame_step=1, export_optimize_animation_size=True,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_image_format='WEBP', export_image_quality=80, export_extras=extras, export_skins=True,
        export_def_bones=False, export_apply=False)
    print('EXPORTED', path, os.path.getsize(path))
def render(path, target=None, views=((3, -3, 1.6),), res=512, frame=None, action=None, arm=None):
    """Workbench preview (textured) from one or more camera positions, side by side"""
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
    sc.render.resolution_x = res; sc.render.resolution_y = res
    if arm and action:
        arm.animation_data_create(); arm.animation_data.action = action
    if frame is not None: sc.frame_set(frame)
    ms = [o for o in sc.objects if o.type == 'MESH' and o.visible_get()]
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in ms:
        e = o.evaluated_get(dg); me = e.to_mesh()
        pts += [o.matrix_world @ me.vertices[i].co for i in range(0, len(me.vertices), 7)]; e.to_mesh_clear()
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (lo + hi) / 2; r = (hi - lo).length / 2
    cam_d = bpy.data.cameras.new('c'); cam = bpy.data.objects.new('c', cam_d); sc.collection.objects.link(cam); sc.camera = cam
    cam_d.lens = 50
    import os as _o
    files = []
    for i, v in enumerate(views):
        d = Vector(v).normalized()
        cam.location = c + d * r * 3.2
        tgt = bpy.data.objects.get('_tgt') or bpy.data.objects.new('_tgt', None)
        if tgt.name not in sc.collection.objects: sc.collection.objects.link(tgt)
        tgt.location = c
        if not cam.constraints: 
            cn = cam.constraints.new('TRACK_TO'); cn.target = tgt; cn.track_axis = 'TRACK_NEGATIVE_Z'; cn.up_axis = 'UP_Y'
        f = path.replace('.png', f'_{i}.png'); sc.render.filepath = f
        bpy.ops.render.render(write_still=True); files.append(f)
    bpy.data.objects.remove(cam)
    return files

def base_only(rough=0.85, spec=0.3):
    """Every material down to its base-colour texture (no specular/metal/rough/normal maps)."""
    for m in bpy.data.materials:
        if not m.use_nodes: continue
        nt = m.node_tree
        bs = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bs: continue
        keep = {bs} | {n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'}
        bc = bs.inputs['Base Color']
        if bc.is_linked:
            src = bc.links[0].from_node; keep.add(src)
            for l in src.inputs:
                if l.is_linked: keep.add(l.links[0].from_node)  # a UV map / vertex colour feeding it
        for n in list(nt.nodes):
            if n not in keep: nt.nodes.remove(n)
        bs.inputs['Metallic'].default_value = 0; bs.inputs['Roughness'].default_value = rough
        if 'IOR' in bs.inputs: bs.inputs['IOR'].default_value = 1.45
        if 'Specular IOR Level' in bs.inputs: bs.inputs['Specular IOR Level'].default_value = spec
        if 'Emission Strength' in bs.inputs: bs.inputs['Emission Strength'].default_value = 0.0
        if 'Emission Color' in bs.inputs: bs.inputs['Emission Color'].default_value = (0, 0, 0, 1)
    for me in bpy.data.meshes:
        while len(me.uv_layers) > 1: me.uv_layers.remove(me.uv_layers[-1])
    for im in list(bpy.data.images):
        if im.users == 0: bpy.data.images.remove(im)

def darken_patch(mesh, centre, radius, thresh=0.6):
    """Faces near `centre` whose texel is pale get the UVs of the darkest nearby face (scan artefacts)."""
    import numpy as np
    me = mesh.data; uv = me.uv_layers.active.data
    for mi, mat in enumerate(me.materials):
        tex = next((n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
        if not tex: continue
        w, h = tex.size; px = np.array(tex.pixels[:]).reshape(h, w, 4)
        def lum(u, v):
            x = int((u % 1) * (w - 1)); y = int((v % 1) * (h - 1)); p = px[y, x]; return 0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2]
        near = [p for p in me.polygons if p.material_index == mi and (mesh.matrix_world @ p.center - centre).length < radius]
        if not near: continue
        info = []
        for p in near:
            us = [uv[li].uv for li in p.loop_indices]; cu = sum((u for u in us), Vector((0, 0))) / len(us)
            info.append((p, cu, lum(cu.x, cu.y)))
        dark = sorted(info, key=lambda t: t[2])[len(info) // 4]
        n = 0
        for p, cu, l in info:
            if l > thresh:
                for li in p.loop_indices: uv[li].uv = dark[1]
                n += 1
        print('darken_patch', mesh.name, n, 'of', len(near))
