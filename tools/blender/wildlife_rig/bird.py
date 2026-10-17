# Standing birds: a biped rig on a static mesh facing +Y (feet on z=0), clips per species; exported facing -Y.
import sys
sys.path.insert(0, sys.argv[sys.argv.index('--') + 1]); from common import *; from rigkit import *
S = sys.argv[sys.argv.index('--') + 2]; KIND = sys.argv[sys.argv.index('--') + 3]
V = lambda y, z, x=0: Vector((x, y, z))
HERON = dict(legx=0.068, leglim=0.03, foot=V(-0.07, 0.0), toe=V(0.028, 0.0), ankle=V(-0.105, 0.083), knee=V(-0.134, 0.336), top=V(-0.091, 0.498),
    tail=V(-0.457, 0.477), hips=V(-0.169, 0.547), chest=V(0.113, 0.645), neck=[V(0.155, 0.786), V(0.183, 0.927), V(0.07, 0.997)], headbase=V(0.07, 1.095), bill=V(0.464, 1.053),
    shoulder=V(0.042, 0.786), wingtip=V(-0.45, 0.49), wingx=0.12)
CFG = {
  'goose': dict(src=f'{OUT}/src/goose.glb', out='goose_rig.glb', legx=0.077, leglim=0.035, foot=V(-0.005, 0.01), toe=V(0.143, 0.01), ankle=V(0.0, 0.038), knee=None, top=V(-0.005, 0.148),
    tail=V(-0.445, 0.225), hips=V(-0.165, 0.28), chest=V(0.275, 0.313), neck=[V(0.275, 0.39), V(0.253, 0.511)], headbase=V(0.297, 0.577), bill=V(0.446, 0.484),
    shoulder=V(0.165, 0.38), wingtip=V(-0.374, 0.247), wingx=0.12),
  'heron': dict(src=f'{OUT}/src/heron.glb', out='heron_rig.glb', **HERON),
  'egret': dict(src=f'{OUT}/src/egret.glb', out='egret_rig.glb', scale=0.9, **HERON),
  'mallard': dict(src=f'{OUT}/src/mallard.glb', out='mallard_rig.glb', legx=0.04, leglim=0.02, foot=V(0.0, 0.008), toe=V(0.092, 0.008), ankle=V(-0.007, 0.068), knee=None, top=V(-0.007, 0.09),
    tail=V(-0.283, 0.168), hips=V(-0.142, 0.153), chest=V(0.163, 0.196), neck=[V(0.142, 0.274)], headbase=V(0.142, 0.352), bill=V(0.287, 0.302),
    shoulder=V(0.106, 0.26), wingtip=V(-0.255, 0.21), wingx=0.09),
}[KIND]
k = CFG.get('scale', 1.0)
def sc(v): return None if v is None else Vector((v.x, v.y * k, v.z * k))
for key in ('foot', 'toe', 'ankle', 'knee', 'top', 'tail', 'hips', 'chest', 'headbase', 'bill', 'shoulder', 'wingtip'): CFG[key] = sc(CFG[key])
CFG['neck'] = [sc(n) for n in CFG['neck']]
fresh()
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=CFG['src'])
mesh = next(o for o in bpy.data.objects if o not in before and o.type == 'MESH')
mesh.data.transform(mesh.matrix_world); mesh.matrix_world = Matrix.Identity(4); mesh.parent = None
for o in [o for o in bpy.data.objects if o != mesh]: bpy.data.objects.remove(o)
C = CFG
B = [('root', V(-0.1, 0), V(0.1, 0), None, False), ('body', C['hips'], C['chest'], 'root', True), ('tail', C['hips'], C['tail'], 'body', True)]
chain = [C['chest']] + C['neck'] + [C['headbase']]
prev = 'body'
for i in range(len(chain) - 1):
    B.append((f'neck{i}', chain[i], chain[i + 1], prev, True)); prev = f'neck{i}'
NN = len(chain) - 1
B.append(('head', C['headbase'], C['bill'], prev, True))
for sd, sx in (('L', -1), ('R', 1)):
    o = Vector((sx * C['legx'], 0, 0)); w = Vector((sx * C['wingx'], 0, 0))
    mid = C['shoulder'].lerp(C['wingtip'], 0.45)
    B += [(f'wing{sd}0', C['shoulder'] + w, mid + w * 1.05, 'body', True), (f'wing{sd}1', mid + w * 1.05, C['wingtip'] + w * 0.8, f'wing{sd}0', True)]
    if C['knee'] is not None:
        B += [(f'thigh{sd}', C['top'] + o, C['knee'] + o, 'body', True), (f'shin{sd}', C['knee'] + o, C['ankle'] + o, f'thigh{sd}', True)]
    else:
        B += [(f'thigh{sd}', C['top'] + o + Vector((0, 0, 0.04)), C['top'] + o, 'body', True), (f'shin{sd}', C['top'] + o, C['ankle'] + o, f'thigh{sd}', True)]
    B += [(f'tarsus{sd}', C['ankle'] + o, C['foot'] + o, f'shin{sd}', True)]
arm = build(KIND, B)
lim = {b[0]: C['leglim'] for b in B if any(b[0].startswith(p) for p in ('shin', 'tarsus'))}
lim.update({f'thigh{s}': C['leglim'] * 1.6 for s in 'LR'})
smooth_bind(mesh, arm, k=3, power=4, limit=lim)
# each foot (toes and web) rides rigidly on its tarsus
for sd, sx in (('L', -1), ('R', 1)):
    gt = mesh.vertex_groups[f'tarsus{sd}']
    for v in mesh.data.vertices:
        if v.co.z < C['ankle'].z * 0.6 + 0.004 and v.co.x * sx > 0:
            for g in list(v.groups): mesh.vertex_groups[g.group].remove([v.index])
            gt.add([v.index], 1.0, 'REPLACE')
gh = mesh.vertex_groups['head']
for v in mesh.data.vertices:  # the head is rigid
    if (v.co - C['headbase']).length < 0.6 * (C['bill'] - C['headbase']).length or v.co.y > C['headbase'].y + 0.02 and v.co.z > C['headbase'].z - 0.04:
        for g in list(v.groups): mesh.vertex_groups[g.group].remove([v.index])
        gh.add([v.index], 1.0, 'REPLACE')
def neck(P, angles):  # pitch per neck bone (negative = down), head last
    for i, a in enumerate(angles[:-1]): P[f'neck{min(i, NN - 1)}'] = P.get(f'neck{min(i, NN - 1)}', []) + [(X, a)]
    P['head'] = P.get('head', []) + [(X, angles[-1])]
def legs(P, t, amp, lift, ph=0.5):
    for sd, p in (('L', 0), ('R', ph)):
        a = s(t, 1, p); up = max(0.0, c(t, 1, p))
        P[f'thigh{sd}'] = [(X, 0.4 * amp * a)]
        P[f'shin{sd}'] = [(X, 0.6 * amp * a + 0.5 * lift * up)]
        P[f'tarsus{sd}'] = [(X, -0.6 * lift * up)]
spd = {}
if KIND == 'goose':
    def idle(t):
        P = {}; neck(P, [0.04 * s(t, 1), 0.03 * s(t, 1, 0.3), 0.0]); P['neck1'] = P.get('neck1', []) + [(Z, 0.4 * s(t, 1) * max(0, s(t, 1, 0.2)))]
        P['body'] = [(X, 0.01 * s(t, 3))]; P['tail'] = [(Z, 0.12 * max(0, s(t, 2)) ** 4)]
        return P
    clip(arm, 'idle', 150, idle)
    def graze(t):
        P = {}; peck = max(0, s(t, 4)) ** 2
        neck(P, [-1.15 - 0.08 * peck, -0.55 - 0.1 * peck, 0.45]); P['body'] = [(X, -0.12)]
        for sd in 'LR': P[f'thigh{sd}'] = [(X, 0.12)]  # the legs stay planted under the tipped body
        P['tail'] = [(X, 0.12)]
        return P
    clip(arm, 'graze', 90, graze)
    def walk(t):
        P = {}; legs(P, t, 0.55, 0.45)
        P['body'] = [(Y, 0.09 * s(t)), (Z, 0.05 * s(t))]; P['root'] = [('loc', (0, 0, 0.008 * abs(s(t))))]
        neck(P, [-0.12 + 0.07 * s(t, 2), 0.05 * s(t, 2, 0.2), 0.0]); P['tail'] = [(Z, -0.1 * s(t))]
        return P
    clip(arm, 'walk', 24, walk)
    def alert(t):
        P = {}; e = min(1, t * 2.5); neck(P, [0.25 * e, 0.2 * e, -0.15 * e]); P['neck1'] = P.get('neck1', []) + [(Z, 0.3 * s(t, 1) * e)]
        return P
    clip(arm, 'alert', 90, alert)
    def hiss(t):  # head low and thrust forward, wings held out a little: holding its ground
        P = {}; e = min(1, t * 4); pul = 0.04 * s(t, 3)
        neck(P, [-0.85 * e, 0.55 * e + pul, 0.25 * e]); P['body'] = [(X, -0.15 * e)]
        for sd, sg in (('L', -1), ('R', 1)): P[f'wing{sd}0'] = [(Y, sg * 0.35 * e), (Z, sg * 0.15 * e)]
        P['tail'] = [(X, 0.2 * e), (Z, 0.15 * s(t, 6))]
        return P
    clip(arm, 'hiss', 60, hiss)
    def run(t):  # the take-off run: long strides, wings half open
        P = {}; legs(P, t, 1.3, 1.0)
        P['body'] = [(X, 0.18), (Y, 0.06 * s(t))]; neck(P, [-0.5, -0.1, 0.1])
        for sd, sg in (('L', -1), ('R', 1)): P[f'wing{sd}0'] = [(Y, sg * (0.6 + 0.4 * s(t, 2)))]
        return P
    clip(arm, 'run', 14, run)
    L = (C['top'] - C['foot']).length
    spd = {'walk': round(2 * L * math.sin(0.22) * 1.25, 3), 'run': round(2 * L * math.sin(0.52) * 2.1 * 1.6, 3)}
elif KIND in ('heron', 'egret'):
    def idle(t):
        P = {}; neck(P, [0.0, 0.03 * s(t, 1), -0.03 * s(t, 1, 0.2), 0.04 * s(t, 1, 0.5)])
        P['neck2'] = P.get('neck2', []) + [(Z, 0.25 * max(0, s(t, 1)) ** 3)]
        P['body'] = [(X, 0.008 * s(t, 3))]
        return P
    clip(arm, 'idle', 240, idle)
    def stalk(t):  # slow, high steps, the neck stretched forward watching the water
        P = {}; legs(P, t, 0.6, 0.8)
        neck(P, [-0.25, 0.35, -0.55, 0.25]); P['body'] = [(X, -0.08), (Y, 0.03 * s(t))]
        for sd in 'LR': P[f'thigh{sd}'][0] = (X, P[f'thigh{sd}'][0][1] + 0.08)
        return P
    clip(arm, 'stalk', 60, stalk)
    def strike(t):  # coil, then the spear: neck shoots down and forward, then slowly back
        P = {}
        if t < 0.25: e = t / 0.25; a = [-0.1 * e, 0.4 * e, -0.3 * e, 0.0]
        elif t < 0.38: e = (t - 0.25) / 0.13; a = [-0.1 - 0.9 * e, 0.4 - 0.9 * e, -0.3 - 0.4 * e, 0.6 * e]
        else: e = 1 - (t - 0.38) / 0.62; e = e * e * (3 - 2 * e); a = [-1.0 * e, -0.5 * e, -0.7 * e, 0.6 * e]
        neck(P, a); P['body'] = [(X, -0.25 * (e if t >= 0.25 else 0))]
        return P
    clip(arm, 'strike', 40, strike, loop=False)
    def alert(t):
        P = {}; e = min(1, t * 2.5); neck(P, [0.15 * e, -0.25 * e, 0.45 * e, -0.2 * e]); return P
    clip(arm, 'alert', 60, alert)
    def crouch(t):  # gathering to leap: body down and forward, wings starting to lift
        P = {}; e = min(1, t * 2.0); e = e * e * (3 - 2 * e)
        for sd, sg in (('L', -1), ('R', 1)):
            P[f'thigh{sd}'] = [(X, 0.5 * e)]; P[f'shin{sd}'] = [(X, -0.9 * e)]; P[f'tarsus{sd}'] = [(X, 0.5 * e)]
            P[f'wing{sd}0'] = [(Y, sg * 0.5 * e)]
        neck(P, [-0.3 * e, 0.6 * e, -0.5 * e, 0.0]); P['body'] = [(X, -0.15 * e)]; P['root'] = [('loc', (0, 0, -0.08 * e))]
        return P
    clip(arm, 'crouch', 18, crouch, loop=False)
    L = (C['top'] - C['foot']).length
    spd = {'stalk': round(2 * L * math.sin(0.24) * 0.5, 3)}
else:  # mallard, afloat
    def idle(t):
        P = {}; P['root'] = [('loc', (0, 0, 0.004 * s(t, 2)))]; P['body'] = [(X, 0.03 * s(t, 2, 0.2))]
        neck(P, [0.05 * s(t, 1), 0.0]); P['neck0'] = P.get('neck0', []) + [(Z, 0.35 * s(t, 1) * max(0, s(t, 1, 0.25)))]
        P['tail'] = [(Z, 0.25 * max(0, s(t, 3)) ** 6)]
        return P
    clip(arm, 'idle', 150, idle)
    def dabble(t):  # tipping up: head under, tail to the sky, feet paddling
        P = {}; e = math.sin(min(1, t) * math.pi) ** 0.5
        P['body'] = [(X, -1.25 * e)]; neck(P, [-0.4 * e, 0.0]); P['tail'] = [(X, 0.5 * e)]
        for sd, p in (('L', 0), ('R', 0.5)): P[f'tarsus{sd}'] = [(X, 0.6 * e * s(t, 6, p))]
        return P
    clip(arm, 'dabble', 90, dabble, loop=False)
    def preen(t):
        P = {}; e = math.sin(min(1, t) * math.pi)
        neck(P, [0.3 * e, 0.6 * e]); P['neck0'] = P.get('neck0', []) + [(Z, 2.0 * e)]; P['head'] = P.get('head', []) + [(Z, 0.4 * e * s(t, 5))]
        return P
    clip(arm, 'preen', 90, preen, loop=False)
    spd = {}
arm['clipSpeeds'] = json.dumps(spd); print('SPEEDS', spd)
arm.rotation_euler = (0, 0, math.pi)
mesh.parent = arm; mesh.matrix_parent_inverse = arm.matrix_world.inverted()
base_only(rough=0.85, spec=0.25)
shrink_images(1024)
export(f"{OUT}/{C['out']}", [arm, mesh])
