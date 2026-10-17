# Flying birds: wings found on the mesh, a body/neck/head/tail chain, flap and glide clips.
import sys
sys.path.insert(0, sys.argv[sys.argv.index('--') + 1]); from common import *; from rigkit import *
import numpy as np
S = sys.argv[sys.argv.index('--') + 2]; KIND = sys.argv[sys.argv.index('--') + 3]
W = OUT
CFG = {
  'goose_fly': dict(src=f'{W}/src/goose_fly.glb', F=(0, 1), head=(0, 0.47), neck=(0, 0.12), body=(0, -0.05), tail=(0, -0.47), hw=0.08, freq=3.0, amp=0.55, out='goose_fly_rig.glb', tex=1024),
  'heron_fly': dict(src=f'{S}/raw/crane.glb', F=(-0.93, -0.37), head=(-0.93, -0.258), neck=(-0.19, -0.083), body=(0.19, 0.13), tail=(0.78, 0.27), hw=0.17, freq=2.2, amp=0.6, out='heron_fly.glb', recolor='heron', neckband=1.12, tex=1024),
  'egret_fly': dict(src=f'{S}/raw/crane.glb', F=(-0.93, -0.37), head=(-0.93, -0.258), neck=(-0.19, -0.083), body=(0.19, 0.13), tail=(0.78, 0.27), hw=0.17, freq=2.6, amp=0.6, out='egret_fly.glb', recolor='egret', neckband=1.12, tex=1024),
  'pelican': dict(src=f'{S}/raw/pelican.glb', F=(-1, 0), head=(-1.18, 0.0), neck=(-0.25, 0.0), body=(0.15, 0.0), tail=(0.85, 0.0), hw=0.2, freq=1.7, amp=0.45, out='pelican.glb', recolor='brownpelican', tex=1024),
  'osprey': dict(src=f'{S}/raw/osprey.glb', F=(1, 0), head=(0.80, 0.0), neck=(0.35, 0.0), body=(0.05, 0.0), tail=(-0.8, 0.0), hw=0.17, freq=2.4, amp=0.5, out='osprey.glb', tex=1024),
  'eagle': dict(src=f'{W}/src/eagle.glb', F=(0, 1), head=(0, 0.35), neck=(0, 0.2), body=(0, 0.0), tail=(0, -0.35), hw=0.12, freq=1.9, amp=0.45, out='eagle_rig.glb', tex=1024),
  'gull': dict(src=f'{W}/src/gull.glb', F=(0, 1), head=(0, 0.33), neck=(0, 0.16), body=(0, 0.0), tail=(0, -0.33), hw=0.07, freq=2.8, amp=0.55, out='gull_rig.glb', tex=512),
}[KIND]
fresh()
bpy.ops.import_scene.gltf(filepath=CFG['src'])
ms = [o for o in bpy.data.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in ms: o.select_set(True)
bpy.context.view_layer.objects.active = ms[0]
if len(ms) > 1: bpy.ops.object.join()
mesh = bpy.context.view_layer.objects.active
for o in [o for o in bpy.data.objects if o != mesh]: bpy.data.objects.remove(o)
mesh.data.transform(mesh.matrix_world); mesh.matrix_world = Matrix.Identity(4); mesh.parent = None
decimate(mesh, 9000)
co = np.array([v.co[:] for v in mesh.data.vertices])
F = np.array(CFG['F'], float); F /= np.linalg.norm(F); Lat = np.array([-F[1], F[0]])  # Lat points to the bird's left
def zat(xy, r=0.06):
    d = np.hypot(co[:, 0] - xy[0], co[:, 1] - xy[1]); sel = co[d < r]
    if len(sel) < 3: sel = co[np.argsort(d)[:20]]
    return float(np.median(sel[:, 2]))
P3 = lambda xy: Vector((xy[0], xy[1], zat(xy)))
head, neck, body, tail = P3(CFG['head']), P3(CFG['neck']), P3(CFG['body']), P3(CFG['tail'])
fwd = co[:, :2] @ F; lat = co[:, :2] @ Lat
c0 = np.array(CFG['body']) @ Lat
wings = {}
for side, sg in (('L', 1), ('R', -1)):
    d = (lat - c0) * sg
    sel = d > CFG['hw']; dm = d[sel].max()
    joints = []
    for f in (0.0, 0.36, 0.68, 1.0):
        band = sel & (np.abs(d - (CFG['hw'] + f * (dm - CFG['hw']))) < 0.06 * dm)
        pts = co[band]; fw = fwd[band]
        if len(pts) < 4: band = sel & (np.abs(d - (CFG['hw'] + f * (dm - CFG['hw']))) < 0.12 * dm); pts = co[band]; fw = fwd[band]
        front = pts[fw >= np.percentile(fw, 55)] if f < 1 else pts[fw >= np.percentile(fw, 30)]
        joints.append(Vector(front.mean(0)))
    wings[side] = joints
print('WINGS', {k: [tuple(round(x, 2) for x in j) for j in v] for k, v in wings.items()})
V = Vector
B = [('root', body + V((0, 0, -0.2)), body + V((0, 0, -0.05)), None, False), ('body', tail.lerp(body, 0.4), body.lerp(neck, 0.6), 'root', True),
     ('tail', tail.lerp(body, 0.4), tail, 'body', True)]
nk = [body.lerp(neck, 0.6), neck, neck.lerp(head, 0.45), neck.lerp(head, 0.8), head]
B += [('neck0', nk[0], nk[1], 'body', True), ('neck1', nk[1], nk[2], 'neck0', True), ('neck2', nk[2], nk[3], 'neck1', True), ('head', nk[3], nk[4], 'neck2', True)]
for side, J in wings.items():
    B += [(f'wing{side}0', J[0], J[1], 'body', True), (f'wing{side}1', J[1], J[2], f'wing{side}0', True), (f'wing{side}2', J[2], J[3], f'wing{side}1', True)]
if CFG.get('legs'):
    lg = P3(CFG['legs']); B.append(('legs', tail.lerp(body, 0.5) + V((0, 0, -0.05)), lg, 'body', True))
arm = build(KIND, B)
lim = {'legs': 0.06} if CFG.get('legs') else {}
smooth_bind(mesh, arm, k=3, power=4, limit=lim)
cnt = {g.name: 0 for g in mesh.vertex_groups}
for v in mesh.data.vertices:
    for g in v.groups:
        if g.weight > 0.3: cnt[mesh.vertex_groups[g.group].name] += 1
print('GROUPS', cnt)
print('CHAIN', [tuple(round(x, 2) for x in p) for p in nk], 'legs', CFG.get('legs') and tuple(round(x, 2) for x in P3(CFG['legs'])))
# axes: forward, left, up
Fv = V((F[0], F[1], 0)); Lv = V((Lat[0], Lat[1], 0)); U = V((0, 0, 1))
# each wing's resting elevation (how far above level the model holds it) -> the glide pose levels it
elev = {}
def el(a, b): v = b - a; return math.atan2(v.z, math.hypot(v.x, v.y))
for side, J in wings.items():
    e = [el(J[i], J[i + 1]) for i in range(3)]
    elev[side] = [e[0], e[1] - e[0], e[2] - e[1]]  # each bone's own bend, so levelling flattens the whole wing
print('ELEV', {k: [round(math.degrees(x)) for x in v] for k, v in elev.items()})
def wing_pose(P, t, amp, lev=0.9, sweep=0.0, fold=0.0, ph=0.0):
    for side, sg in (('L', 1), ('R', -1)):
        a = amp * math.sin((t + ph) * 2 * math.pi)                 # up (+) and down
        a1 = amp * 0.45 * math.sin((t + ph - 0.08) * 2 * math.pi)  # the forearm lags
        a2 = amp * 0.35 * math.sin((t + ph - 0.16) * 2 * math.pi)  # the hand lags more, a whip at the tip
        # positive about the forward axis raises the left wing; mirrored for the right
        e = elev[side]
        P[f'wing{side}0'] = [(Fv, sg * a - sg * e[0] * lev), (U, sg * sweep)]
        P[f'wing{side}1'] = [(Fv, sg * a1 - sg * e[1] * lev), (U, sg * fold)]
        P[f'wing{side}2'] = [(Fv, sg * a2 - sg * e[2] * lev), (U, -sg * fold * 1.2)]
def neck_pose(P, t):
    if CFG.get('heronneck'):
        # the heron's flight: the neck drawn back into an S, the head resting between the shoulders
        P['neck0'] = [(Lv, -0.9)]; P['neck1'] = [(Lv, 1.9)]; P['neck2'] = [(Lv, -0.6)]; P['head'] = [(Lv, -0.35)]
        P['legs'] = [(Lv, 1.25)]  # the legs trail straight out behind
    else:
        P['neck0'] = [(Lv, 0.02 * math.sin(t * 2 * math.pi))]
def flap(t):
    P = {}; wing_pose(P, t, CFG['amp']); neck_pose(P, t)
    P['body'] = [(Lv, 0.03 * math.sin((t + 0.25) * 2 * math.pi))]
    P['root'] = [('loc', (0, 0, -0.03 * math.sin(t * 2 * math.pi)))]
    P['tail'] = [(Lv, 0.05 * math.sin((t + 0.1) * 2 * math.pi))]
    return P
def glide(t):
    P = {}; wing_pose(P, 0, 0.0, lev=1.0); neck_pose(P, t)
    for side, sg in (('L', 1), ('R', -1)):
        P[f'wing{side}0'].append((Fv, sg * (0.06 + 0.02 * math.sin(t * 2 * math.pi))))  # a little dihedral, breathing in the air
        P[f'wing{side}2'].append((Fv, sg * 0.05 * math.sin((t + 0.3) * 2 * math.pi)))
    P['tail'] = [(Fv, 0.04 * math.sin(t * 2 * math.pi))]
    return P
def takeoff(t):  # deep, fast beats, the tail fanned down
    P = {}; wing_pose(P, t, CFG['amp'] * 1.35, sweep=0.15 * math.sin(t * 2 * math.pi)); neck_pose(P, t)
    P['tail'] = [(Lv, 0.25)]
    return P
n = max(8, int(round(30 / CFG['freq'])))
clip(arm, 'flap', n, flap, step=1)
clip(arm, 'glide', 120, glide)
clip(arm, 'takeoff', max(6, int(round(30 / (CFG['freq'] * 1.3)))), takeoff, step=1)
# recolour: the texture remapped by colour class
def recolor(mode):
    for m in mesh.data.materials:
        bs = next((nd for nd in m.node_tree.nodes if nd.type == 'BSDF_PRINCIPLED'), None)
        src = bs and bs.inputs['Base Color'].is_linked and bs.inputs['Base Color'].links[0].from_node
        tex = src.image if src and src.type == 'TEX_IMAGE' else None
        if not tex: continue
        w, h = tex.size; px = np.array(tex.pixels[:]).reshape(-1, 4)
        r, g, b = px[:, 0], px[:, 1], px[:, 2]; lum = 0.3 * r + 0.59 * g + 0.11 * b
        mx = px[:, :3].max(1); mn = px[:, :3].min(1); sat = (mx - mn) / np.maximum(mx, 1e-4)
        red = (r > g * 1.6) & (r > 0.25); orange = (r > g) & (g > b) & (sat > 0.45) & (lum > 0.25)
        dark = (lum < 0.18) & ~red
        out = px.copy()
        def put(mask, rgb, shade=True):
            k = (0.75 + 0.5 * np.clip(lum / max(lum.mean(), 1e-3), 0, 1.6)) if shade else 1
            for i in range(3): out[mask, i] = np.clip(rgb[i] * (k[mask] if shade else 1), 0, 1)
        if mode == 'egret':  # great egret: white all over, yellow bill
            put(dark | red | ~(orange), (0.86, 0.86, 0.84)); put(orange, (0.85, 0.68, 0.15), shade=False)
        elif mode == 'heron':  # great blue heron: slate blue-grey body, dark flight feathers, pale head
            put(~dark & ~red & ~orange, (0.46, 0.52, 0.60)); put(dark, (0.16, 0.18, 0.22)); put(red, (0.80, 0.80, 0.78)); put(orange, (0.80, 0.62, 0.20), shade=False)
        elif mode == 'brownpelican':  # brown pelican: grey-brown body and wings, dark primaries, pale head, dull bill
            pale = (lum > 0.5) & ~orange
            put(pale, (0.45, 0.42, 0.38)); put(orange, (0.45, 0.38, 0.30), shade=False)
        tex.pixels[:] = out.ravel(); tex.update()
        print('recolor', mode, tex.name)
if CFG.get('neckband'):
    me = mesh.data; uv = me.uv_layers.active.data
    bs = next(nd for nd in me.materials[0].node_tree.nodes if nd.type == 'BSDF_PRINCIPLED'); tex = bs.inputs['Base Color'].links[0].from_node.image
    w, h = tex.size; px = np.array(tex.pixels[:]).reshape(h, w, 4)
    def lum(u, v):
        p = px[int((v % 1) * (h - 1)), int((u % 1) * (w - 1))]; return 0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2]
    segs = [(nk[i], nk[i + 1]) for i in range(len(nk) - 1)]
    near = [p for p in me.polygons if p.center.z > CFG['neckband'] and abs((p.center.x - body.x) * Lat[0] + (p.center.y - body.y) * Lat[1]) < 0.14]
    info = [(p, sum((uv[li].uv for li in p.loop_indices), Vector((0, 0))) / len(p.loop_indices)) for p in near]
    pale = max(info, key=lambda t: lum(t[1].x, t[1].y))[1]
    n = 0
    for p, cu in info:
        if lum(cu.x, cu.y) < 0.35:
            for li in p.loop_indices: uv[li].uv = pale
            n += 1
    print('neck band lightened', n, 'of', len(info))
if CFG.get('recolor'): recolor(CFG['recolor'])
# face -Y like the other rigs: turn the rig so its forward points down -Y
ang = math.atan2(-F[0], F[1]) + math.pi
arm.rotation_euler = (0, 0, ang)
mesh.parent = arm; mesh.matrix_parent_inverse = arm.matrix_world.inverted()
base_only(rough=0.85, spec=0.25)
shrink_images(CFG['tex'])
export(f"{OUT}/{CFG['out']}", [arm, mesh])
