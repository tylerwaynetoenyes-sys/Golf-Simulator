# Rig kit: build an armature from named joints, bind a mesh, author clips.
import bpy, math, json
from mathutils import Vector, Matrix, Quaternion
import numpy as np

def build(name, bones):
    """bones: list of (name, head, tail, parent or None, deform)"""
    ad = bpy.data.armatures.new(name); arm = bpy.data.objects.new(name, ad)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm; arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for n, h, t, p, d in bones:
        b = ad.edit_bones.new(n); b.head = Vector(h); b.tail = Vector(t); b.use_deform = d
        if p: b.parent = eb[p]
        eb[n] = b
    # roll so local X stays horizontal (pitch about X bends in the vertical plane)
    for b in ad.edit_bones:
        b.align_roll(Vector((0, 0, 1)) if abs(b.vector.normalized().z) < 0.9 else Vector((0, 1, 0)))
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm

def bind(mesh, arm, auto=True):
    """Automatic (bone heat) weights; vertices it leaves unweighted go to their nearest bone."""
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
    ok = True
    if auto:
        try: bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        except Exception as e: print('heat failed', e); ok = False
    if not auto or not ok:
        bpy.ops.object.parent_set(type='ARMATURE_NAME')
    # fill any vertex with no weight from its nearest deform bone segment
    segs = [(b.name, arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones if b.use_deform]
    groups = {g.name: g for g in mesh.vertex_groups}
    for n, _, _ in segs:
        if n not in groups: groups[n] = mesh.vertex_groups.new(name=n)
    filled = 0
    for v in mesh.data.vertices:
        if any(g.weight > 1e-3 for g in v.groups): continue
        p = mesh.matrix_world @ v.co
        best = min(segs, key=lambda s: dist_seg(p, s[1], s[2]))
        groups[best[0]].add([v.index], 1.0, 'REPLACE'); filled += 1
    print('bind', mesh.name, 'heat' if ok and auto else 'nearest', 'filled', filled, 'of', len(mesh.data.vertices))
    return ok

def weights_by_regions(mesh, arm, rules):
    """Explicit weights: rules = list of (bone, fn(p)->w); normalised per vertex."""
    for g in list(mesh.vertex_groups): mesh.vertex_groups.remove(g)
    gs = {b.name: mesh.vertex_groups.new(name=b.name) for b in arm.data.bones if b.use_deform}
    for v in mesh.data.vertices:
        p = mesh.matrix_world @ v.co
        ws = [(b, max(0.0, f(p))) for b, f in rules]
        s = sum(w for _, w in ws)
        if s <= 0: continue
        for b, w in ws:
            if w > 1e-3: gs[b].add([v.index], w / s, 'REPLACE')
    mesh.parent = arm
    m = mesh.modifiers.new('arm', 'ARMATURE'); m.object = arm

def dist_seg(p, a, b):
    ab = b - a; t = max(0, min(1, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length

def seg_weight(a, b, r):
    a = Vector(a); b = Vector(b)
    return lambda p: math.exp(-(dist_seg(p, a, b) / r) ** 2)

def q_arm(arm, bone, axis, ang):
    """A rotation of `ang` about an armature-space axis, as the bone's local quaternion."""
    m = arm.data.bones[bone].matrix_local.to_3x3()
    ax = (m.inverted() @ Vector(axis)).normalized()
    return Quaternion(ax, ang)

def clip(arm, name, frames, pose, fps=30, step=2, speed=0.0, loop=True):
    """pose(t) -> {bone: [(axis, angle), ...] or ('loc', Vector)}; t in [0,1)."""
    act = bpy.data.actions.new(name); act.use_fake_user = True
    arm.animation_data_create(); arm.animation_data.action = act
    for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'
    keys = list(range(0, frames + 1, step))
    if keys[-1] != frames: keys.append(frames)
    for f in keys:
        t = (f / frames) % 1.0 if loop else f / frames
        P = pose(t)
        for pb in arm.pose.bones:
            q = Quaternion(); loc = Vector()
            for item in P.get(pb.name, []):
                if item[0] == 'loc': loc = Vector(item[1])
                else: q = q @ q_arm(arm, pb.name, item[0], item[1])
            pb.rotation_quaternion = q; pb.location = loc
            pb.keyframe_insert('rotation_quaternion', frame=f); pb.keyframe_insert('location', frame=f)
    # a track per clip so the exporter names the animation after it
    tr = arm.animation_data.nla_tracks.new(); tr.name = name
    st = tr.strips.new(name, 0, act); st.name = name
    arm.animation_data.action = None
    return act, speed

def s(t, k=1, ph=0): return math.sin((t * k + ph) * 2 * math.pi)
def c(t, k=1, ph=0): return math.cos((t * k + ph) * 2 * math.pi)
X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)

def smooth_bind(mesh, arm, k=3, power=4, limit=None):
    """Inverse-distance weights over the k nearest deform-bone segments (smooth blends along
    chains); `limit`: {bone: max distance} so thin limbs don't pull the body."""
    for g in list(mesh.vertex_groups): mesh.vertex_groups.remove(g)
    segs = [(b.name, arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones if b.use_deform]
    gs = {n: mesh.vertex_groups.new(name=n) for n, _, _ in segs}
    A = np.array([s[1][:] for s in segs]); Bb = np.array([s[2][:] for s in segs])
    AB = Bb - A; L2 = np.maximum((AB ** 2).sum(1), 1e-9)
    lim = np.array([(limit or {}).get(s[0], 1e9) for s in segs])
    for v in mesh.data.vertices:
        p = np.array((mesh.matrix_world @ v.co)[:])
        t = np.clip(((p - A) * AB).sum(1) / L2, 0, 1)
        d = np.sqrt((((A + AB * t[:, None]) - p) ** 2).sum(1)) + 1e-4
        d = np.where(d > lim, 1e9, d)
        idx = np.argsort(d)[:k]
        w = 1 / d[idx] ** power; w /= w.sum()
        for i, wi in zip(idx, w):
            if wi > 0.01: gs[segs[i][0]].add([v.index], float(wi), 'REPLACE')
    mesh.parent = arm
    for m in list(mesh.modifiers):
        if m.type == 'ARMATURE': mesh.modifiers.remove(m)
    m = mesh.modifiers.new('arm', 'ARMATURE'); m.object = arm
    print('smooth_bind', mesh.name, len(mesh.data.vertices))

def decimate(mesh, tris):
    n = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
    if n <= tris: return
    bpy.context.view_layer.objects.active = mesh
    d = mesh.modifiers.new('dec', 'DECIMATE'); d.ratio = tris / n; d.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')
