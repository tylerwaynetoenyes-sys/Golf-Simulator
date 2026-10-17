import sys, json
sys.path.insert(0, sys.argv[sys.argv.index('--') + 1])
from common import *
S = sys.argv[sys.argv.index('--') + 2]
fresh(); load(f'{S}/raw/doe_rig.glb')
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
acts = keep_actions({'Stand_Breathing_01': 'idle', 'Stand_Eating_01': 'graze', 'Stand_Idle_02': 'look', 'WalkSlow': 'walkSlow', 'Walk': 'walk',
                     'Trot': 'trot', 'Run': 'run', 'Trans_TurnL': 'turnL', 'Trans_TurnR': 'turnR'})
k = abs(arm.matrix_world.to_scale()[0])
speeds = {}
for name, a in acts.items():
    n = a.frame_range[1] - a.frame_range[0]
    for fc in list(a.fcurves):
        # the root joints' keys undo the rest pose's axis flip (an FBX conversion artefact): leave them at rest
        if '_rootJoint' in fc.data_path or ('RigRoot' in fc.data_path and 'rotation' in fc.data_path):
            a.fcurves.remove(fc); continue
        if 'location' in fc.data_path and 'RigRoot' in fc.data_path:
            ks = [kp.co[1] for kp in fc.keyframe_points]
            if fc.array_index == 1 and ks and 'RigRoot' in fc.data_path: speeds[name] = round((max(ks) - min(ks)) * k / (n / 30), 3)
            a.fcurves.remove(fc)
arm['clipSpeeds'] = json.dumps(speeds)
print('SPEEDS', speeds, 'scale', k)
shrink_images(1024)
for o in meshes: o.data.name = o.name
export(f'{OUT}/deer_doe.glb', [arm] + meshes)
# previews
for nm, fr in []:
    render(f'{S}/prev/doe_{nm}.png', views=((1, 0.25, 0.25), (0.7, -0.7, 0.3)), frame=fr, action=acts[nm], arm=arm)
# the buck: the whitetail's antlers grafted onto the doe's head bone
arm.animation_data.action = acts['idle']; bpy.context.scene.frame_set(0); arm.animation_data.action = None
for pb in arm.pose.bones: pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
pts = []
for o in meshes:
    e = o.evaluated_get(dg); me = e.to_mesh(); pts += [o.matrix_world @ v.co for v in me.vertices]; e.to_mesh_clear()
head = [p for p in pts if p.y < -0.6 and abs(p.x) < 0.035]
top = max(head, key=lambda p: p.z)
print('skull top', top)
import os.path
before = set(bpy.data.objects)
if not os.path.exists(f'{S}/raw/antlers.glb'):
    bpy.ops.import_scene.gltf(filepath=f'{OUT}/deer_buck.glb')
    imp = [o for o in bpy.data.objects if o not in before]
    src = next(o for o in imp if o.type == 'MESH' and o.name.startswith('antlers'))
    me = src.data.copy(); me.transform(src.matrix_world)
    for o in imp: bpy.data.objects.remove(o, do_unlink=True)
    tmp = bpy.data.objects.new('antlers_raw', me); bpy.context.scene.collection.objects.link(tmp)
    bpy.ops.object.select_all(action='DESELECT'); tmp.select_set(True)
    bpy.ops.export_scene.gltf(filepath=f'{S}/raw/antlers.glb', use_selection=True, export_format='GLB')
    bpy.data.objects.remove(tmp)
    before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=f'{S}/raw/antlers.glb')
src = next(o for o in bpy.data.objects if o not in before and o.type == 'MESH')
me = src.data.copy(); me.transform(src.matrix_world); me.name = 'antlers'
for o in [o for o in bpy.data.objects if o not in before]: bpy.data.objects.remove(o, do_unlink=True)
for vg_ in []: pass
ant = bpy.data.objects.new('antlers', me); bpy.context.scene.collection.objects.link(ant)
vg = ant.vertex_groups.new(name=next(b.name for b in arm.data.bones if b.name.startswith('RigHead')))
vg.add(list(range(len(me.vertices))), 1.0, 'REPLACE')
mw = ant.matrix_world.copy(); ant.parent = arm; ant.matrix_parent_inverse = arm.matrix_world.inverted()
mod = ant.modifiers.new('arm', 'ARMATURE'); mod.object = arm
print('antlers', len(me.polygons))
shrink_images(1024)
export(f'{OUT}/deer_buck.glb', [arm, ant] + meshes, anims=False)
for nm, fr in [('graze', 120), ('idle', 0)]:
    render(f'{S}/prev/buck_{nm}.png', views=((1, 0.25, 0.25), (0.6, -0.8, 0.35)), frame=fr, action=acts[nm], arm=arm)
