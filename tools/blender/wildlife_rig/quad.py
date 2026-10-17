# A quadruped rig and its clips for a static mesh facing +Y (feet on z=0); exported facing -Y.
import sys
sys.path.insert(0, sys.argv[sys.argv.index('--') + 1]); from common import *; from rigkit import *
S = sys.argv[sys.argv.index('--') + 2]; KIND = sys.argv[sys.argv.index('--') + 3]
V = Vector
CFG = {
  'sheep': dict(src=f'{OUT}/src/sheep.glb', out='sheep_rig.glb', legx=0.10, leglim=0.045, necklim=0.2,
    hind=(V((0, -0.44, 0.30)), V((0, -0.47, 0.15)), V((0, -0.474, 0.02))), fore=(V((0, 0.17, 0.30)), V((0, 0.17, 0.15)), V((0, 0.168, 0.02))), legcol=True, darklegs=0.34,
    spine=[V((0, -0.40, 0.62)), V((0, -0.10, 0.64)), V((0, 0.18, 0.64))], neck=V((0, 0.40, 0.80)), nose=V((0, 0.62, 0.76)),
    tail=[V((0, -0.57, 0.56)), V((0, -0.63, 0.40))], stride=0.42, freq=1.8, rough=0.95),
  'squirrel': dict(src=f'{OUT}/src/squirrel.glb', out='squirrel_rig.glb', legx=0.022, leglim=0.022, legcol=True,
    hind=(V((0, 0.012, 0.07)), V((0, -0.006, 0.029)), V((0, 0.023, 0.006))), fore=(V((0, 0.141, 0.07)), V((0, 0.141, 0.029)), V((0, 0.17, 0.006))),
    spine=[V((0, 0.006, 0.088)), V((0, 0.059, 0.094)), V((0, 0.117, 0.095))], neck=V((0, 0.158, 0.111)), nose=V((0, 0.237, 0.105)),
    tail=[V((0, -0.012, 0.123)), V((0, -0.088, 0.141)), V((0, -0.176, 0.129)), V((0, -0.235, 0.105))], stride=0.5, freq=2.6, rough=0.9),
}[KIND]
fresh()
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=CFG['src'])
mesh = next(o for o in bpy.data.objects if o not in before and o.type == 'MESH')
mesh.data.transform(mesh.matrix_world); mesh.matrix_world = Matrix.Identity(4); mesh.parent = None
for o in [o for o in bpy.data.objects if o != mesh]: bpy.data.objects.remove(o)
decimate(mesh, CFG.get('tris', 3000))
sp, nk, ns, tl = CFG['spine'], CFG['neck'], CFG['nose'], CFG['tail']
import numpy as np
co = np.array([v.co[:] for v in mesh.data.vertices])
LEGX = {}
for nm, leg in (('h', CFG['hind']), ('f', CFG['fore'])):
    for side, sx in (('L', -1), ('R', 1)):
        sel = co[(co[:, 2] < 0.6 * leg[1].z + 0.01) & (np.abs(co[:, 1] - leg[2].y) < 0.12 * (leg[0].z / 0.4 if CFG.get('legcol') else 1)) & (co[:, 0] * sx > 0)]
        LEGX[nm + side] = (float(np.median(sel[:, 0])), float(np.median(sel[:, 1]))) if CFG.get('legcol') and len(sel) > 10 else (sx * CFG['legx'], leg[2].y)
print('LEGS', {k: tuple(round(x, 3) for x in v) for k, v in LEGX.items()})
if CFG.get('darklegs'):
    # the Blackface's black legs: only the legs themselves, not the fleece above them
    ca = mesh.data.color_attributes.get('Col') or mesh.data.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    for p in mesh.data.polygons:
        for li in p.loop_indices:
            v = mesh.data.vertices[mesh.data.loops[li].vertex_index].co
            near = min(math.hypot(v.x - x, v.y - y) for x, y in LEGX.values())
            leg = v.z < CFG['darklegs'] and near < 0.07
            face = v.y > 0.38 and v.z > 0.5
            cur = ca.data[li].color
            k = 0.14 if (leg or face) else 1.0
            ca.data[li].color = (k, k, k, 1)
B = [('root', V((0, -0.1, 0)), V((0, 0.1, 0)), None, False),
     ('hips', sp[0], sp[1], 'root', True), ('chest', sp[1], sp[2], 'hips', True), ('neck', sp[2], nk, 'chest', True), ('head', nk, ns, 'neck', True)]
prev = 'hips'; a = tl[0]
B.append(('tail0', sp[0], tl[0], 'hips', True)); prev = 'tail0'
for i in range(1, len(tl)): B.append((f'tail{i}', tl[i - 1], tl[i], prev, True)); prev = f'tail{i}'
for side, sx in (('L', -1), ('R', 1)):
    for nm, (top, knee, foot), par in (('h', CFG['hind'], 'hips'), ('f', CFG['fore'], 'chest')):
        lx, ly = LEGX[nm + side]; dy = ly - foot.y
        o = V((lx, dy, 0))
        B += [(f'{nm}{side}_up', top + o, knee + o, par, True), (f'{nm}{side}_lo', knee + o, foot + o, f'{nm}{side}_up', True)]
arm = build(KIND, B)
lim = {b[0]: CFG['leglim'] for b in B if b[0][1] in 'LR' and b[0][0] in 'hf'}
lim.update({'neck': CFG.get('necklim', 1e9), 'head': CFG.get('necklim', 1e9)})
smooth_bind(mesh, arm, k=3, power=4, limit=lim)
# the head is rigid: everything forward of the poll moves with the head bone alone
gh = mesh.vertex_groups['head']
for v in mesh.data.vertices:
    if v.co.y > nk.y - 0.03 and v.co.z > nk.z - 0.12:
        for g in list(v.groups): mesh.vertex_groups[g.group].remove([v.index])
        gh.add([v.index], 1.0, 'REPLACE')
st, fq = CFG['stride'], CFG['freq']
def legs(P, phases, amp, lift):
    for n, ph in phases.items():
        sw = s(0, 1, ph) if False else None
    return P
def gait(P, t, phases, amp, lift):
    for n, ph in phases.items():
        a = s(t, 1, ph)            # forward/back swing
        up = max(0.0, c(t, 1, ph))  # foot off the ground in the forward half
        P[n + '_up'] = [(X, amp * a + 0.15 * lift * up)]
        P[n + '_lo'] = [(X, -lift * up)]
clips = {}
def idle(t):
    P = {}; br = s(t, 3)
    P['chest'] = [(X, 0.01 * br)]
    P['neck'] = [(X, 0.05 * s(t, 1, 0.1)), (Z, 0.18 * s(t, 1) * max(0, s(t, 1, 0.25)))]
    P['head'] = [(X, -0.04 * s(t, 2))]
    P['tail0'] = [(Z, 0.15 * s(t, 4))]
    return P
clips['idle'] = clip(arm, 'idle', 180, idle)
def graze(t):
    P = {}
    nib = 0.06 * s(t, 6)  # the nibbling bob
    P['neck'] = [(X, -1.05 + nib * 0.4)]; P['head'] = [(X, -0.35 + nib)]
    P['chest'] = [(X, -0.05)]
    P['tail0'] = [(Z, 0.1 * s(t, 3))]
    return P
clips['graze'] = clip(arm, 'graze', 120, graze)
def look(t):
    P = {}; e = min(1, t * 3)
    P['neck'] = [(X, 0.12 * e), (Z, 0.35 * s(t, 1) * e)]; P['head'] = [(X, -0.05)]
    return P
clips['look'] = clip(arm, 'look', 120, look)
def walk(t):  # four-beat walk: LH, LF, RH, RF
    P = {}
    gait(P, t, {'hL': 0, 'fL': 0.25, 'hR': 0.5, 'fR': 0.75}, st * 0.8, 0.5)
    P['hips'] = [(Z, 0.04 * s(t)), ('loc', (0, 0, 0))]
    P['neck'] = [(X, -0.15 + 0.04 * s(t, 2))]
    return P
clips['walk'] = clip(arm, 'walk', int(30 / (fq * 0.6)), walk)
def trot(t):  # diagonal pairs
    P = {}
    gait(P, t, {'hL': 0, 'fR': 0, 'hR': 0.5, 'fL': 0.5}, st, 0.7)
    P['neck'] = [(X, 0.05 * s(t, 2))]
    P['root'] = [('loc', (0, 0, 0.02 * abs(s(t, 1))))]
    return P
clips['trot'] = clip(arm, 'trot', int(30 / fq), trot)
def run(t):  # bounding: hind pair, then fore pair
    P = {}
    gait(P, t, {'hL': 0, 'hR': 0.05, 'fL': 0.5, 'fR': 0.55}, st * 1.3, 0.9)
    P['hips'] = [(X, 0.12 * s(t, 1, 0.25))]; P['chest'] = [(X, -0.12 * s(t, 1, 0.25))]
    P['tail0'] = [(X, 0.3 * s(t, 1, 0.1))]
    return P
clips['run'] = clip(arm, 'run', max(8, int(30 / (fq * 1.3))), run)
if KIND == 'squirrel':
    def sit(t):  # up on the haunches, forepaws tucked, tail curled up the back
        P = {}; e = min(1, t * 3); e = e * e * (3 - 2 * e)
        P['hips'] = [(X, 1.0 * e)]; P['chest'] = [(X, 0.25 * e)]; P['neck'] = [(X, -0.6 * e)]; P['head'] = [(X, -0.3 * e)]
        for sd in 'LR': P[f'h{sd}_up'] = [(X, -1.1 * e)]; P[f'h{sd}_lo'] = [(X, 1.3 * e)]; P[f'f{sd}_up'] = [(X, -0.8 * e)]; P[f'f{sd}_lo'] = [(X, 1.2 * e)]
        for i in range(len(tl)): P[f'tail{i}'] = [(X, (0.9 if i == 0 else 0.35) * e)]
        return P
    clips['sit'] = clip(arm, 'sit', 30, sit, loop=False)
# real ground speeds: stride length × strides per second
L = (CFG['hind'][0] - CFG['hind'][2]).length
spd = {'walk': round(2 * L * math.sin(st * 0.8) * fq * 0.6, 3), 'trot': round(2 * L * math.sin(st) * fq * 1.0, 3), 'run': round(2.6 * L * math.sin(st * 1.3) * fq * 1.3, 3)}
arm['clipSpeeds'] = json.dumps(spd); print('SPEEDS', spd)
arm.rotation_euler = (0, 0, math.pi)  # face -Y
mesh.parent = arm; mesh.matrix_parent_inverse = arm.matrix_world.inverted()
base_only(rough=CFG['rough'], spec=0.2)
shrink_images(1024)
export(f"{OUT}/{CFG['out']}", [arm, mesh])
