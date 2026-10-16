"""Wildlife models for js/scene/fauna.js: one game mesh per animal.

Run inside Blender with a Sketchfab import already in the scene (the Blender
MCP add-on's import_asset, or File > Import > glTF of the downloaded model):

    exec(open('tools/blender/wildlife.py').read())
    ob = isolate(['Object_100', 'Object_101', 'Object_102'], 'gator')  # the animal's meshes, posed
    finish(ob, 3.0, 7000, head=-1, fname='gator')                        # length m, triangles

Headless (CPU; Metal Cycles crashes from the shell):
    blender -b --factory-startup --python tools/blender/wildlife.py -- model.glb gator 3.0 7000 -1

What it does:
  isolate()  bakes each listed mesh with its armature at the current frame,
             keeps one UV map, joins them, deletes everything else, and strips
             the material to its base colour (no metal/roughness/normal maps)
  finish()   turns the head to +Y (glTF -Z, the game's forward), puts the feet
             on z=0 and the body on the origin, scales to the animal's real
             length (or wingspan with size_axis='X', height with 'Z'), welds,
             decimates to the triangle budget, cuts textures to `tex` px and
             exports a Draco GLB with WebP textures to assets/models/wildlife/

Per animal (as shipped; frame = the import's animation frame used):
  gator      Object_100..102, 3.0 m, 7000 tris, head -1, levelled 5 deg about Y
  deer_buck  Object_5, 1.85 m, 6000, rot_z +90 deg, head +1; deer_doe = the buck
             with vertices above the brow cut (z > 1.31 m in the head) and the
             holes filled
  goose      Object_7/9/11, 0.9 m, 3000, head -1
  goose_fly  Object_35/5/7 at frame 3 (wings level), wingspan 1.6 m (X), head -1
  heron      Object_2, 1.15 m tall (Z), 4000, head -1; egret = heron with the
             texture's greys pushed to white, oranges kept, and a vertex colour
             of 0.12 below 0.5 m (black legs), scaled 0.9
  eagle      the three tripo meshes, wingspan 2.0 m (X), 3000, rot_z +90, head +1
  gull       Object_7 at frame 150 (glide), wingspan 1.4 m (X), 3000, rot_z -90
  squirrel   Object_8 + eyes (Object_11, UVs moved onto the darkest texel), 0.48 m
  sheep      Object_5..15, 1.25 m, 5000, head -1; vertex colour darkens the face
             (y > 0.38 m forward, z > 0.5 m) and the legs (z < 0.4 m)
  mallard    Object_5, 0.58 m, 2500, head -1
  sealion / harborseal  from assets/models/zoo_marine.glb, 1.75 / 1.6 m,
             rot_z -90 / +90, head +1
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(bpy.data.filepath or __file__)))), 'assets', 'models', 'wildlife')


def wire_base(ob):
    """A base-colour image the importer routed through other nodes, wired straight in."""
    for m in ob.data.materials:
        nt = m.node_tree
        bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        if bs.inputs['Base Color'].is_linked:
            continue
        im = next((i for i in bpy.data.images if any(k in i.name.lower() for k in ('basecolor', 'diffuse', 'albedo'))), None)
        if im:
            t = nt.nodes.new('ShaderNodeTexImage')
            t.image = im
            nt.links.new(t.outputs['Color'], bs.inputs['Base Color'])


def isolate(keep, name):
    keep = [bpy.data.objects[k] for k in keep]
    dg = bpy.context.evaluated_depsgraph_get()
    meshes = []
    for o in keep:
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), depsgraph=dg)
        me.transform(o.matrix_world)
        while len(me.uv_layers) > 1:
            me.uv_layers.remove(me.uv_layers[-1])
        if len(me.uv_layers):
            me.uv_layers[0].name = 'UVMap'
        meshes.append(me)
    for o in list(bpy.data.objects):
        if o.name not in ('Camera', 'Light'):
            bpy.data.objects.remove(o, do_unlink=True)
    objs = []
    for i, me in enumerate(meshes):
        ob = bpy.data.objects.new(f'{name}_{i}', me)
        bpy.context.scene.collection.objects.link(ob)
        objs.append(ob)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    for m in ob.data.materials:
        if not m or not m.use_nodes:
            continue
        nt = m.node_tree
        bs = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bs:
            continue
        keepn = {bs, next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')}
        if bs.inputs['Base Color'].is_linked and bs.inputs['Base Color'].links[0].from_node.type == 'TEX_IMAGE':
            keepn.add(bs.inputs['Base Color'].links[0].from_node)
        for n in list(nt.nodes):
            if n not in keepn:
                nt.nodes.remove(n)
        bs.inputs['Metallic'].default_value = 0
        bs.inputs['Roughness'].default_value = 0.85
    wire_base(ob)
    return ob


def finish(ob, length, tris, head=-1, rot_z=0.0, size_axis='Y', tex=1024, fname=None):
    if rot_z:
        ob.data.transform(Matrix.Rotation(rot_z, 4, 'Z'))
    if head < 0:
        ob.data.transform(Matrix.Rotation(math.pi, 4, 'Z'))
    vs = [v.co for v in ob.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    L = {'X': hi.x - lo.x, 'Y': hi.y - lo.y, 'Z': hi.z - lo.z}[size_axis]
    ob.data.transform(Matrix.Translation(Vector((-(hi.x + lo.x) / 2, -(hi.y + lo.y) / 2, -lo.z))))
    ob.data.transform(Matrix.Scale(length / L, 4))
    ob.matrix_world = Matrix.Identity(4)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0005 * length)
    bpy.ops.object.mode_set(mode='OBJECT')
    n = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if n > tris:
        d = ob.modifiers.new('dec', 'DECIMATE')
        d.ratio = tris / n
        d.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='dec')
    for m in ob.data.materials:
        for nd in m.node_tree.nodes:
            if nd.type == 'TEX_IMAGE' and nd.image and max(nd.image.size) > tex:
                im = nd.image
                im.scale(tex, max(1, int(im.size[1] * tex / im.size[0])))
    if fname:
        os.makedirs(OUT, exist_ok=True)
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f'{fname}.glb'), use_selection=True, export_format='GLB',
                                  export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                                  export_image_format='WEBP', export_image_quality=82, export_animations=False,
                                  export_apply=True, export_vertex_color='MATERIAL')
    return ob


if __name__ == '__main__' and '--' in sys.argv:
    src, name, length, tris, head = sys.argv[sys.argv.index('--') + 1:][:5]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    meshes = [o.name for o in bpy.data.objects if o.type == 'MESH']
    finish(isolate(meshes, name), float(length), int(tris), head=int(head), fname=name)
