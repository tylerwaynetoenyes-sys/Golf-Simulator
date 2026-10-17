# Orthographic top and side views with a 0.1 m grid (bold every 0.5 m), to read joint positions off.
import sys
sys.path.insert(0, sys.argv[sys.argv.index('--') + 1]); from common import *
f = sys.argv[sys.argv.index('--') + 2]; out = sys.argv[sys.argv.index('--') + 3]
fresh(); load(f)
ms = [o for o in bpy.data.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in ms for v in o.data.vertices]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
c = (lo + hi) / 2; ext = max(hi - lo) * 1.1
print('BOX', tuple(round(v, 3) for v in lo), tuple(round(v, 3) for v in hi), 'center', tuple(round(v, 3) for v in c), 'ext', round(ext, 3))
mat = bpy.data.materials.new('grid'); mat.diffuse_color = (0.9, 0.2, 0.2, 1)
mat2 = bpy.data.materials.new('grid2'); mat2.diffuse_color = (0.2, 0.3, 0.9, 1)
def line(a, b, w, m):
    import bmesh
    me = bpy.data.meshes.new('l'); bm = bmesh.new()
    d = (b - a); n = d.length
    bmesh.ops.create_cube(bm, size=1)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('l', me); bpy.context.scene.collection.objects.link(o)
    o.location = (a + b) / 2
    o.scale = (max(abs(d.x), w), max(abs(d.y), w), max(abs(d.z), w))
    me.materials.append(m)
import math
step = 0.1
def grid(plane):
    i0 = math.floor((min(lo.x, lo.y, lo.z) - 0.5) / step); i1 = math.ceil((max(hi.x, hi.y, hi.z) + 0.5) / step)
    for i in range(i0, i1 + 1):
        v = i * step; bold = abs(v / 0.5 - round(v / 0.5)) < 1e-6
        w = ext * (0.004 if bold else 0.0015); m = mat2 if abs(v) < 1e-6 else mat
        if plane == 'xy':
            z = lo.z - 0.05
            if lo.x - .5 < v < hi.x + .5: line(Vector((v, lo.y - .5, z)), Vector((v, hi.y + .5, z)), w, m)
            if lo.y - .5 < v < hi.y + .5: line(Vector((lo.x - .5, v, z)), Vector((hi.x + .5, v, z)), w, m)
        else:  # yz plane behind (at x = lo.x - 0.05), seen from +x
            x = lo.x - 0.05
            if lo.y - .5 < v < hi.y + .5: line(Vector((x, v, lo.z - .5)), Vector((x, v, hi.z + .5)), w, m)
            if lo.z - .5 < v < hi.z + .5: line(Vector((x, lo.y - .5, v)), Vector((x, hi.y + .5, v)), w, m)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'TEXTURE'
sc.render.resolution_x = sc.render.resolution_y = 900
cd = bpy.data.cameras.new('c'); cd.type = 'ORTHO'; cd.ortho_scale = ext
cam = bpy.data.objects.new('c', cd); sc.collection.objects.link(cam); sc.camera = cam
grid('xy')
cam.location = (c.x, c.y, hi.z + 5); cam.rotation_euler = (0, 0, 0)
sc.render.filepath = out + '_top.png'; bpy.ops.render.render(write_still=True)
for o in [o for o in bpy.data.objects if o.name.startswith('l')]: bpy.data.objects.remove(o)
grid('yz')
cam.location = (hi.x + 5, c.y, c.z); cam.rotation_euler = (math.pi / 2, 0, math.pi / 2)
sc.render.filepath = out + '_side.png'; bpy.ops.render.render(write_still=True)
print('top: image x→+X, image up→+Y; side (from +X): image x→+Y? see grid; centre', tuple(round(v, 3) for v in c))
