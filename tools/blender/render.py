import bpy, sys, math
glb, out = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
cam.location = (0, -11, 2.2); cam.rotation_euler = (math.radians(88), 0, 0)
sc.camera = cam
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 3.5; sun.rotation_euler = (math.radians(50), 0, math.radians(30))
sc.collection.objects.link(sun)
w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.6, 0.72, 0.85, 1); sc.world = w
sc.render.engine = 'BLENDER_EEVEE_NEXT'
sc.render.resolution_x = 640; sc.render.resolution_y = 480
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
