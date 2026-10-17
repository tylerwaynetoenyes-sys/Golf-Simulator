import sys
sys.path.insert(0, sys.argv[sys.argv.index('--') + 1]); from common import *; from rigkit import *
S = sys.argv[sys.argv.index('--') + 2]
fresh(); load(f'{S}/raw/gator2.glb')
mesh = next(o for o in bpy.data.objects if o.type == 'MESH')
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.select_all(action='DESELECT'); mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
decimate(mesh, 12000)
darken_patch(mesh, Vector((-0.065, -0.05, -0.08)), 0.16, 0.5)
V = Vector
# joints, read off the orthographic views (raw file coordinates)
snout = V((0.509, -0.673, 0.14)); skull = V((0.29, -0.06, 0.12)); chest = V((0.19, 0.18, 0.07))
mid = V((0.07, 0.48, 0.08)); pelvis = V((-0.05, 0.72, 0.08))
tail = [V((-0.2, 0.92, 0.08)), V((-0.42, 1.11, 0.08)), V((-0.71, 1.23, 0.07)), V((-1.03, 1.21, 0.06)), V((-1.25, 1.01, 0.05)), V((-1.37, 0.72, 0.04)), V((-1.30, 0.36, 0.03))]
legs = {  # root, knee/elbow, foot
    'fl_R': (V((0.045, 0.085, 0.03)), V((-0.01, 0.02, -0.06)), V((-0.065, -0.05, -0.11))),
    'fl_L': (V((0.387, 0.305, 0.03)), V((0.46, 0.27, -0.06)), V((0.533, 0.207, -0.11))),
    'hl_R': (V((-0.249, 0.598, 0.03)), V((-0.30, 0.53, -0.06)), V((-0.347, 0.439, -0.11))),
    'hl_L': (V((0.093, 0.88, 0.03)), V((0.16, 0.87, -0.06)), V((0.228, 0.843, -0.11))),
}
B = [('root', pelvis + V((0, 0, -0.2)), pelvis + V((0, 0, -0.05)), None, False),
     ('hips', pelvis, mid, 'root', True), ('spine', mid, chest, 'hips', True), ('neck', chest, skull, 'spine', True), ('head', skull, snout, 'neck', True)]
prev, a = 'hips', pelvis
for i, p in enumerate(tail):
    B.append((f'tail{i}', a, p, prev, True)); prev, a = f'tail{i}', p
for n, (r, k, f) in legs.items():
    par = 'spine' if n.startswith('f') else 'hips'
    B += [(n + '_up', r, k, par, True), (n + '_lo', k, f, n + '_up', True)]
arm = build('gator', B)
legs_lim = {f'{n}_{x}': 0.12 for n in legs for x in ('up', 'lo')}
smooth_bind(mesh, arm, k=3, power=3, limit=legs_lim)
# body axes: forward (chest → snout), left, up
F = (snout - chest); F.z = 0; F.normalize(); Lf = V((-F.y, F.x, 0)); U = V((0, 0, 1))
# per tail bone: the turn that straightens it onto the line of the one before (the curl undone)
straight = {}
dirs = [(pelvis - mid).normalized()] + [(tail[i] - (pelvis if i == 0 else tail[i - 1])).normalized() for i in range(len(tail))]
for i in range(len(tail)):
    d0, d1 = dirs[i], dirs[i + 1]
    straight[f'tail{i}'] = math.atan2(d0.x * d1.y - d0.y * d1.x, d0.dot(d1))
print('curl', {k: round(math.degrees(v)) for k, v in straight.items()})
def tail_pose(P, curl, wave, ph, amp, lift=0):
    for i in range(len(tail)):
        n = f'tail{i}'
        ang = -straight[n] * (1 - curl) + amp * (0.35 + 0.65 * i / 6) * math.sin((ph - i * 0.13) * 2 * math.pi) * wave
        P.setdefault(n, []).append((U, ang))
        if lift: P[n].append((Lf, lift))
def leg(P, n, swing, lift, knee=0.0):
    side = 1 if n.endswith('L') else -1
    P.setdefault(n + '_up', []).extend([(U, swing * side * (1 if n.startswith('f') else 1)), (F, lift * side)])
    if knee: P.setdefault(n + '_lo', []).append((F, knee * side))
clips = {}
# bask: still as a log; slow breathing, the odd lift of the head, the tail tip stirring
def bask(t):
    P = {}
    br = 0.5 + 0.5 * s(t, 3)
    P['spine'] = [(Lf, -0.012 * br)]; P['hips'] = [(Lf, 0.006 * br)]
    lift = max(0, s(t, 1, 0.1)) ** 6
    P['head'] = [(Lf, -0.09 * lift)]; P['neck'] = [(Lf, -0.03 * lift)]
    tail_pose(P, 1.0, 1, t * 2, 0.02)
    return P
clips['bask'] = clip(arm, 'bask', 240, bask)
def alert(t):  # head and neck raised, watching
    P = {}; e = min(1, t * 2.5); e = e * e * (3 - 2 * e)
    P['neck'] = [(Lf, -0.10 * e)]; P['head'] = [(Lf, -0.16 * e)]
    P['spine'] = [(Lf, -0.04 * e)]
    tail_pose(P, 1.0, 1, t, 0.015)
    return P
clips['alert'] = clip(arm, 'alert', 45, alert, loop=False)
# high walk: belly off the ground, diagonal pairs, the body and tail swinging
def walk(t):
    P = {}
    P['root'] = [('loc', (0, 0, 0))]
    P['hips'] = [(U, 0.06 * s(t)), (Lf, 0.0)]
    P['spine'] = [(U, -0.08 * s(t))]; P['neck'] = [(U, 0.05 * s(t))]; P['head'] = [(U, 0.02 * s(t))]
    for n, ph in (('fl_L', 0), ('hl_R', 0), ('fl_R', 0.5), ('hl_L', 0.5)):
        sw = s(t, 1, ph); up = max(0, c(t, 1, ph))
        leg(P, n, 0.45 * sw, 0.35 - 0.25 * up, knee=0.25 + 0.2 * up)
    tail_pose(P, 0.35, 1, t, 0.10)
    return P
clips['walk'] = clip(arm, 'walk', 48, walk, speed=0.0)
# belly slide toward the water: legs pushing back, low and quick, tail driving
def slide(t):
    P = {}
    P['hips'] = [(U, 0.09 * s(t))]; P['spine'] = [(U, -0.10 * s(t))]; P['neck'] = [(U, 0.06 * s(t))]
    for n, ph in (('fl_L', 0), ('hl_R', 0), ('fl_R', 0.5), ('hl_L', 0.5)):
        leg(P, n, 0.55 * s(t, 1, ph), 0.12 * max(0, c(t, 1, ph)), knee=0.1)
    tail_pose(P, 0.3, 1, t, 0.16)
    return P
clips['slide'] = clip(arm, 'slide', 30, slide)
# swimming: legs folded back flat against the body, the tail sculling in a travelling wave
def swim(t):
    P = {}
    P['hips'] = [(U, 0.05 * s(t))]; P['spine'] = [(U, -0.04 * s(t))]; P['head'] = [(U, 0.02 * s(t, 1, 0.3))]
    for n in legs: leg(P, n, -1.1 if n.startswith('f') else -0.9, -0.15, knee=0.2)
    tail_pose(P, 0.1, 1, t, 0.30)
    return P
clips['swim'] = clip(arm, 'swim', 60, swim)
# floating: limbs hanging loose, tail straight with the slightest drift, nostrils and eyes up
def float_(t):
    P = {}
    P['head'] = [(Lf, -0.05)]; P['neck'] = [(Lf, -0.03)]
    for n in legs: leg(P, n, -0.5 if n.startswith('f') else -0.4, 0.25 + 0.03 * s(t, 1, 0.2), knee=0.1)
    tail_pose(P, 0.15, 1, t, 0.04)
    return P
clips['float'] = clip(arm, 'float', 180, float_)
# face -Y (glTF +Z) like the other rigs, and real size: 3.1 m along the body
ang = math.atan2(F.x, -F.y)
arm.rotation_euler = (0, 0, ang)
print('turn', round(math.degrees(ang), 1))
for m in mesh.data.materials: pass
base_only(rough=0.7, spec=0.35)
shrink_images(1024)
arm['clipSpeeds'] = json.dumps({'walk': 0.55, 'slide': 0.9, 'swim': 0.8})
export(f'{OUT}/gator.glb', [arm, mesh])
