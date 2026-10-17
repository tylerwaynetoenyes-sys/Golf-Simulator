import sys
sys.path.insert(0, sys.argv[sys.argv.index('--') + 1]); from common import *; from rigkit import *
S = sys.argv[sys.argv.index('--') + 2]; KIND = sys.argv[sys.argv.index('--') + 3]
V = Vector
CFG = {
  'sealion': dict(src=f'{OUT}/src/sealion.glb', out='sealion_rig.glb', fwd=(1, 0),
    chain=[V((0.32, -0.7, 0.08)), V((-0.26, -0.43, 0.25)), V((-0.32, 0.0, 0.45)), V((0.11, 0.15, 0.95)), V((0.17, 0.25, 1.30)), V((0.29, 0.27, 1.42))]),
  'harborseal': dict(src=f'{OUT}/src/harborseal.glb', out='harborseal_rig.glb', fwd=(0, 1),
    chain=[V((0, -0.78, 0.05)), V((0, -0.45, 0.22)), V((0, 0.0, 0.40)), V((0, 0.4, 0.48)), V((0, 0.6, 0.60)), V((0, 0.8, 0.62))]),
}[KIND]
fresh()
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=CFG['src'])
mesh = next(o for o in bpy.data.objects if o not in before and o.type == 'MESH')
mesh.data.transform(mesh.matrix_world); mesh.matrix_world = Matrix.Identity(4); mesh.parent = None
for o in [o for o in bpy.data.objects if o != mesh]: bpy.data.objects.remove(o)
ch = CFG['chain']; names = ['tail', 'hips', 'body', 'chest', 'head']
B = [('root', V((0, -0.1, 0)), V((0, 0.1, 0)), None, False)]
# from the middle outward: body is the parent of chest→head and of hips→tail
B += [('body', ch[2], ch[3], 'root', True), ('chest', ch[3], ch[4], 'body', True), ('head', ch[4], ch[5], 'chest', True),
      ('hips', ch[2], ch[1], 'body', True), ('tail', ch[1], ch[0], 'hips', True)]
arm = build(KIND, B)
smooth_bind(mesh, arm, k=3, power=4)
F = V((CFG['fwd'][0], CFG['fwd'][1], 0)); L = V((-F.y, F.x, 0)); U = V((0, 0, 1))
def idle(t):
    P = {}; br = s(t, 4)
    P['body'] = [(L, -0.012 * br)]; P['chest'] = [(L, -0.02 * br), (U, 0.1 * s(t, 1) * max(0, s(t, 1, 0.3)))]
    P['head'] = [(L, 0.05 * s(t, 1, 0.2))]; P['tail'] = [(L, 0.05 * max(0, s(t, 2)) ** 4)]
    return P
clip(arm, 'idle', 300, idle)
def look(t):  # the head lifts and turns to something
    P = {}; e = math.sin(min(1, t) * math.pi)
    P['chest'] = [(L, -0.15 * e)]; P['head'] = [(L, -0.2 * e), (U, 0.6 * e * s(t, 1, 0.1))]
    return P
clip(arm, 'look', 120, look, loop=False)
if KIND == 'sealion':
    def bark(t):  # the head thrust up and forward with each bark
        P = {}; b = max(0, s(t, 3)) ** 2
        P['chest'] = [(L, -0.12 * b)]; P['head'] = [(L, -0.25 * b)]; P['body'] = [(L, -0.03 * b)]
        return P
    clip(arm, 'bark', 60, bark, loop=False)
else:
    def banana(t):  # head and hind flippers lifted together, the harbour seal's resting curve
        P = {}; e = math.sin(min(1, t) * math.pi) ** 0.6
        P['chest'] = [(L, -0.18 * e)]; P['head'] = [(L, -0.15 * e)]; P['hips'] = [(L, 0.15 * e)]; P['tail'] = [(L, 0.3 * e)]
        return P
    clip(arm, 'banana', 150, banana, loop=False)
arm['clipSpeeds'] = '{}'
arm.rotation_euler = (0, 0, math.atan2(F.x, F.y) + math.pi)  # forward → -Y
mesh.parent = arm; mesh.matrix_parent_inverse = arm.matrix_world.inverted()
base_only(rough=0.6, spec=0.4)
shrink_images(1024)
export(f"{OUT}/{CFG['out']}", [arm, mesh])
