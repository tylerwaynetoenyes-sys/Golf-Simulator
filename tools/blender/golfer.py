# The golfer: a MakeHuman body (MPFB, CC0 assets) dressed for golf, rigged with
# the CMU skeleton and given real swings from the CMU motion-capture database
# (subject 64, a golfer: swings 64_01–64_10, putts 64_11–64_13; CMU places no
# restrictions on the data). Exported as one skinned GLB with an animation per
# clip and, per clip, the frames where the swing passes address, the top,
# impact and the finish (found from the hands), so the game can time-warp the
# real motion onto the club the R10 measured.
#
#   blender -b --factory-startup --python tools/blender/golfer.py -- <bvh dir> assets/models/golfer.glb [preview.png]
#
# The BVH files are the cgspeed conversions of CMU subject 64
# (github.com/Shriinivas/cmubvh, Sequence-060-075/64).
import bpy
import addon_utils
import math
import os
import sys
import json
from mathutils import Matrix, Quaternion, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PRESET = 'james'
if '--preset' in argv:
    i = argv.index('--preset'); PRESET = argv[i + 1]; del argv[i:i + 2]
BVH_DIR, OUT = argv[0], argv[1]
PREVIEW = argv[2] if len(argv) > 2 else None

# the golfers (colours as display sRGB 0-255)
PRESETS = {
    'james': dict(macro={'gender': 1.0, 'age': 0.56, 'muscle': 0.62, 'weight': 0.52, 'proportions': 0.7, 'height': 0.58,
                         'race': {'caucasian': 0.8, 'asian': 0.1, 'african': 0.1}},
                  skin='Young caucasian male', hair='Short02', suit='Male casualsuit06', brows='Eyebrow002',
                  shirt=(44, 66, 110), trousers=(150, 134, 104), cap=(0.74, 0.73, 0.7)),
    'marcus': dict(macro={'gender': 1.0, 'age': 0.5, 'muscle': 0.72, 'weight': 0.5, 'proportions': 0.75, 'height': 0.62,
                          'race': {'caucasian': 0.05, 'asian': 0.05, 'african': 0.9}},
                   skin='Young african male', hair='Short04', suit='Male casualsuit06', brows='Eyebrow006',
                   shirt=(232, 233, 230), trousers=(44, 52, 74), cap=(0.04, 0.045, 0.05)),
    'sofia': dict(macro={'gender': 0.0, 'age': 0.48, 'muscle': 0.58, 'weight': 0.45, 'proportions': 0.75, 'height': 0.55,
                         'race': {'caucasian': 0.85, 'asian': 0.05, 'african': 0.1}},
                  skin='Young caucasian female', hair='Ponytail01', suit='Female casualsuit01', brows='Eyebrow010',
                  shirt=(236, 238, 240), trousers=(40, 50, 78), cap=(0.78, 0.78, 0.76)),
    'mei': dict(macro={'gender': 0.0, 'age': 0.46, 'muscle': 0.55, 'weight': 0.42, 'proportions': 0.72, 'height': 0.48,
                       'race': {'caucasian': 0.05, 'asian': 0.9, 'african': 0.05}},
                skin='Young asian female', hair='Bob02', suit='Female casualsuit01', brows='Eyebrow011',
                shirt=(36, 118, 126), trousers=(228, 226, 220), cap=(0.78, 0.78, 0.76)),
}
P = PRESETS[PRESET]
CLIPS = [('swing', '64_01.bvh'), ('putt', '64_11.bvh')]

addon_utils.enable('bl_ext.user_default.mpfb', default_set=True, persistent=False)
from bl_ext.user_default.mpfb.services.humanservice import HumanService  # noqa: E402
from bl_ext.user_default.mpfb.services.assetservice import AssetService  # noqa: E402

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.preferences.addon_enable(module='io_anim_bvh')


def asset(sub, kind, label):
    return AssetService.get_asset_list(sub, kind)[label]['full_path']


# ── the body and his clothes ────────────────────────────────────────────────
macro = {'cupsize': 0.5, 'firmness': 0.5, **P['macro']}
human = HumanService.create_human(macro_detail_dict=macro, scale=0.1)
rig = HumanService.add_builtin_rig(human, 'cmu_mb')
print('POSEPOS', rig.data.pose_position)
rig.data.pose_position = 'POSE'  # (MPFB can leave the rig showing its rest position: then no motion plays)
HumanService.set_character_skin(asset('skins', 'mhmat', P['skin']), human, skin_type='GAMEENGINE')
for sub, kind, label, typ in [
    ('eyes', 'mhclo', 'Low-poly', 'Eyes'),
    ('eyebrows', 'mhclo', P['brows'], 'Eyebrows'),
    ('eyelashes', 'mhclo', 'Eyelashes02', 'Eyelashes'),
    ('teeth', 'mhclo', 'Teeth base', 'Teeth'),
    ('tongue', 'mhclo', 'Tongue01', 'Tongue'),
    ('hair', 'mhclo', P['hair'], 'Hair'),
    ('clothes', 'mhclo', P['suit'], 'Clothes'),
    ('clothes', 'mhclo', 'Shoes05', 'Clothes'),
]:
    HumanService.add_mhclo_asset(asset(sub, kind, label), human, asset_type=typ, subdiv_levels=0, material_type='GAMEENGINE')


import bmesh
import numpy as np


def image_of(mat):
    n = mat.node_tree.nodes.get('DiffuseTexture')
    return n.image if n else None


def recoloured(img, rgb, name, gain=1.45, flat=1.0, base=0.8):
    """The fabric's photo, desaturated, in a new colour; `flat` keeps that much of its light and dark (the
    folds and weave, less of any print: a shirt's logo goes, the normal map still carries the folds)."""
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    lum = (0.2126 * px[..., 0] + 0.7152 * px[..., 1] + 0.0722 * px[..., 2])[..., None]
    lum = np.clip(lum / max(1e-3, np.percentile(lum, 70)) * base, 0, gain)
    lum = base + (lum - base) * flat
    out = np.concatenate([np.clip(lum * np.array(rgb, dtype=np.float32), 0, 1), px[..., 3:4]], axis=2)
    im = bpy.data.images.new(name, w, h, alpha=True)
    im.pixels.foreach_set(out.ravel())
    im.pack()
    return im


def split_material(obj, pred, name, img):
    """Give the faces where pred(center) holds a copy of the material using img."""
    base = obj.material_slots[0].material
    m2 = base.copy(); m2.name = name
    m2.node_tree.nodes['DiffuseTexture'].image = img
    if 'AlphaMapTexture' in m2.node_tree.nodes: m2.node_tree.nodes['AlphaMapTexture'].image = img
    obj.data.materials.append(m2)
    k = len(obj.data.materials) - 1
    mw = obj.matrix_world
    for p in obj.data.polygons:
        if pred(mw @ p.center, p): p.material_index = k
    return m2


SRGB = lambda r, g, b: tuple(c / 255 for c in (r, g, b))  # (image pixels are display values)
suit = next(o for o in bpy.data.objects if 'casualsuit' in o.name)
src = image_of(suit.material_slots[0].material)
waist = rig.data.bones['Hips'].head_local.z  # the shirt's hem hangs over the belt, at the hips' joint
split_material(suit, lambda c, p: c.z > waist, 'shirt', recoloured(src, SRGB(*P['shirt']), 'shirt_' + PRESET, flat=0.25, base=0.95 if sum(P['shirt']) > 600 else 0.8))
split_material(suit, lambda c, p: c.z <= waist, 'trousers', recoloured(src, SRGB(*P['trousers']), 'trousers_' + PRESET, 1.1, flat=0.55, base=0.95 if sum(P['trousers']) > 600 else 0.8))
# keep only the two new materials
suit.data.materials.pop(index=0)

# a white leather glove on the lead (left) hand
body = bpy.data.objects['Human']
skin = body.material_slots[0].material
glove = skin.copy(); glove.name = 'glove'
g_img = bpy.data.images.new('glove_white', 4, 4); g_img.pixels.foreach_set([0.86, 0.86, 0.84, 1.0] * 16); g_img.pack()
glove.node_tree.nodes['DiffuseTexture'].image = g_img
body.data.materials.append(glove)
gi = len(body.data.materials) - 1
gids = {body.vertex_groups[n].index for n in ('LeftHand', 'LThumb', 'LeftFingerBase', 'LeftHandFinger1') if n in body.vertex_groups}
hand_v = set()
for v in body.data.vertices:
    if sum(g.weight for g in v.groups if g.group in gids) > 0.5: hand_v.add(v.index)
for p in body.data.polygons:
    if sum(1 for v in p.vertices if v in hand_v) >= 3: p.material_index = gi

CAP = '--cap' in sys.argv  # (off: the procedural cap isn't good enough yet; bare heads read better than a bad cap)
if CAP:
    # a cap, fitted: the crown shrink-wrapped over this golfer's own skull, six panels meeting at a button, the
    # sweatband line low on the forehead and round the back of the head, a curved bill; the hair under the crown
    # trimmed away so none pokes through (a ponytail still comes out the back)
    head_vs = [body.matrix_world @ v.co for v in body.data.vertices
               if any(g.group == body.vertex_groups['Head'].index and g.weight > 0.6 for g in v.groups)] if 'Head' in body.vertex_groups else []
    hx = [v.x for v in head_vs]; hy = [v.y for v in head_vs]; hzs = [v.z for v in head_vs]
    top_z = max(hzs)
    cx, cy = (min(hx) + max(hx)) / 2, (min(hy) + max(hy)) / 2
    # the band: just above the brows at the front, lower at the back (the face looks along -Y)
    brow_z = top_z - 0.085
    band = lambda y: brow_z + 0.004 + (y - min(hy)) / max(1e-3, (max(hy) - min(hy))) * -0.03
    bm = bmesh.new()
    seg, rings = 64, 14
    grid = []
    for j in range(rings + 1):
        row = []
        for i in range(seg):
            t = i / seg * 2 * math.pi
            a2 = (j / rings) * math.pi / 2
            x = cx + math.cos(t) * math.cos(a2) * 0.2
            y = cy + math.sin(t) * math.cos(a2) * 0.2
            z0 = band(y)
            z = z0 + (top_z + 0.02 - z0) * math.sin(a2) + 0.15 * math.sin(a2) ** 6
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for j in range(rings):
        for i in range(seg):
            bm.faces.new((grid[j][i], grid[j][(i + 1) % seg], grid[j + 1][(i + 1) % seg], grid[j + 1][i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    crown_me = bpy.data.meshes.new('cap'); bm.to_mesh(crown_me); bm.free()
    cap = bpy.data.objects.new('cap', crown_me)
    bpy.context.scene.collection.objects.link(cap)
    # shrink the crown onto the skull (and the hair's volume), a fabric's thickness off it
    sw = cap.modifiers.new('fit', 'SHRINKWRAP'); sw.target = body; sw.wrap_method = 'NEAREST_SURFACEPOINT'; sw.offset = 0.012
    bpy.context.view_layer.objects.active = cap; cap.select_set(True)
    bpy.ops.object.modifier_apply(modifier='fit')
    # a little fuller than the skull at the top (caps stand off the crown), and the panel seams pressed in
    cme = cap.data
    for v in cme.vertices:
        up = max(0.0, (v.co.z - brow_z) / max(1e-3, top_z - brow_z))
        d = Vector((v.co.x - cx, v.co.y - cy, 0))
        if d.length > 1e-4:
            v.co += d.normalized() * 0.006 * up
        v.co.z += 0.008 * up * up
        ang = math.atan2(v.co.y - cy, v.co.x - cx)
        seam = abs(math.sin(3 * ang))
        if seam < 0.06 and up > 0.15: v.co -= Vector((d.x, d.y, 0)).normalized() * 0.0015 if d.length > 1e-4 else Vector()
    bm = bmesh.new(); bm.from_mesh(cme)
    # the button on top and the bill at the front
    top = max(bm.verts, key=lambda v: v.co.z).co.copy()
    res = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=6, radius=0.007)
    for v in res['verts']: v.co = v.co * Vector((1, 1, 0.55)) + top
    front = [v for v in bm.verts if abs(v.co.z - band(v.co.y)) < 0.012 and v.co.y < cy - 0.02]
    fr = sorted(front, key=lambda v: math.atan2(v.co.y - cy, v.co.x - cx))
    if len(fr) > 6:
        inner = [v.co.copy() for v in fr]
        n = len(inner)
        outer = []
        for k, c in enumerate(inner):
            f = math.sin(math.pi * k / (n - 1))
            out = Vector((c.x - cx, c.y - cy, 0)).normalized()
            outer.append(c + out * (0.012 + 0.07 * f) + Vector((0, 0, -0.01 * f)))
        ivs = [bm.verts.new(c + Vector((0, 0, -0.002))) for c in inner]
        ovs = [bm.verts.new(c) for c in outer]
        for k in range(n - 1):
            bm.faces.new((ivs[k], ivs[k + 1], ovs[k + 1], ovs[k]))
    bm.to_mesh(cme); bm.free()
    for p in cme.polygons: p.use_smooth = True
    cm = bpy.data.materials.new('cap'); cm.use_nodes = True
    cb = next(n for n in cm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    cb.inputs['Base Color'].default_value = (*P['cap'], 1); cb.inputs['Roughness'].default_value = 0.92
    cm.use_backface_culling = False
    cme.materials.append(cm)
    cap.parent = rig
    gvg = cap.vertex_groups.new(name='Head'); gvg.add(list(range(len(cme.vertices))), 1.0, 'REPLACE')
    mod = cap.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
    # trim the hair the crown covers
    for o in bpy.data.objects:
        if o.type == 'MESH' and any(k in o.name.lower() for k in ('short0', 'ponytail', 'bob0', 'hair')):
            bm = bmesh.new(); bm.from_mesh(o.data)
            kill = [v for v in bm.verts if (o.matrix_world @ v.co).z > band((o.matrix_world @ v.co).y) + 0.004]
            bmesh.ops.delete(bm, geom=kill, context='VERTS')
            bm.to_mesh(o.data); bm.free()


# ── the motion: CMU subject 64, retargeted bone by bone onto this rig ────────
scene = bpy.context.scene
scene.render.fps = 120
mapped = [b.name for b in rig.data.bones]


def rest_world(arm, name):
    return (arm.matrix_world @ arm.data.bones[name].matrix_local).to_quaternion()


def import_clip(path):
    before = set(bpy.data.objects)
    bpy.ops.import_anim.bvh(filepath=path, global_scale=1.0, frame_start=1, use_fps_scale=False, update_scene_fps=False,
                            update_scene_duration=False, rotate_mode='NATIVE', axis_forward='-Z', axis_up='Y')
    src = next(o for o in bpy.data.objects if o not in before)
    # scale the capture to this body (leg length)
    def leg(a):
        b = a.data.bones
        return (b['LeftUpLeg'].head_local - b['LeftFoot'].head_local).length
    k = leg(rig) / (leg(src) * src.scale.x) * src.scale.x
    src.scale = (k, k, k)
    bpy.context.view_layer.update()
    return src


def retarget(src, action_name):
    act = src.animation_data.action
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    rig.animation_data_create()
    tgt_act = bpy.data.actions.new(action_name)
    rig.animation_data.action = tgt_act
    for pb in rig.pose.bones: pb.rotation_mode = 'QUATERNION'
    names = [n for n in mapped if n in src.pose.bones]
    srest = {n: rest_world(src, n) for n in names}
    trest = {n: rest_world(rig, n) for n in names}
    # the two skeletons rest differently (the capture in a T-pose, MakeHuman in an A-pose): first turn each of
    # this rig's bones to lie the way the capture's does at rest, then carry the capture's motion on from there
    def rest_dir(arm, n):
        b = arm.data.bones[n]
        return ((arm.matrix_world @ b.tail_local) - (arm.matrix_world @ b.head_local)).normalized()
    for n in names:
        sd, td = rest_dir(src, n), rest_dir(rig, n)
        if sd.length > 0.5 and td.length > 0.5:
            trest[n] = td.rotation_difference(sd) @ trest[n]
    order = [b.name for b in rig.data.bones if b.name in names]   # parents before children
    rigq = rig.matrix_world.to_quaternion()
    rest_rel = {}
    for n in order:
        bone = rig.data.bones[n]
        rest_rel[n] = (bone.parent.matrix_local.inverted() @ bone.matrix_local).to_quaternion() if bone.parent else bone.matrix_local.to_quaternion()
    hips_rest_w = trest['Hips']
    keys = {n: [] for n in order}
    locs = []
    hips0 = None
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        want = {}
        for n in order:
            sw = (src.matrix_world @ src.pose.bones[n].matrix).to_quaternion()
            want[n] = (sw @ srest[n].inverted()) @ trest[n]
            parent = rig.data.bones[n].parent
            pw = want[parent.name] if parent is not None and parent.name in want else rigq
            local = (pw @ rest_rel[n]).inverted() @ want[n]
            keys[n].append(local)
        sh = src.matrix_world @ src.pose.bones['Hips'].head
        if hips0 is None: hips0 = sh.copy()
        locs.append(hips_rest_w.inverted() @ (sh - hips0))
    # write the keys straight into the action's curves (fast, and no evaluation in between)
    n_frames = f1 - f0 + 1
    for n in order:
        qs = keys[n]
        # keep the quaternions on one side, so the curves interpolate the short way round
        for i in range(1, len(qs)):
            if qs[i].dot(qs[i - 1]) < 0: qs[i].negate()
        path = f'pose.bones["{n}"].rotation_quaternion'
        for c in range(4):
            fc = tgt_act.fcurves.new(path, index=c, action_group=n)
            fc.keyframe_points.add(n_frames)
            co = []
            for i, q in enumerate(qs): co += [i + 1, q[c]]
            fc.keyframe_points.foreach_set('co', co)
            fc.update()
    for c in range(3):
        fc = tgt_act.fcurves.new('pose.bones["Hips"].location', index=c, action_group='Hips')
        fc.keyframe_points.add(n_frames)
        co = []
        for i, l in enumerate(locs): co += [i + 1, l[c]]
        fc.keyframe_points.foreach_set('co', co)
        fc.update()
    if os.environ.get('GDEBUG'):
        scene.frame_set(100)
        print('DBG key', [round(v, 3) for v in keys['LeftArm'][99]], 'fc', round(tgt_act.fcurves[0].evaluate(100), 3),
              'pb', [round(v, 3) for v in rig.pose.bones['LeftArm'].rotation_quaternion], 'act', rig.animation_data.action and rig.animation_data.action.name,
              'hand', [round(v, 3) for v in rig.pose.bones['LeftHand'].head], 'srcLA', [round(v, 3) for v in (src.matrix_world @ src.pose.bones['LeftHand'].head)])
    # the hands' path, as the rig now plays it
    hands = []
    scene.frame_set(n_frames // 2)
    for i in range(n_frames):
        scene.frame_set(i + 1)
        lh = rig.matrix_world @ rig.pose.bones['LeftHand'].head
        rh = rig.matrix_world @ rig.pose.bones['RightHand'].head
        hands.append(((lh + rh) / 2).copy())
    return tgt_act, hands, n_frames


def markers(hands, putt=False):
    """Address, top, impact and finish frames (0-based) from the hands' path."""
    H = np.array([[h.x, h.y, h.z] for h in hands])
    v = np.r_[[0], np.linalg.norm(np.diff(H, axis=0), axis=1)] * 120
    vs = np.convolve(v, np.ones(7) / 7, mode='same')
    m = 24                                                       # (the first frames can jump as the clip starts)
    imp = m + int(np.argmax(vs[m:-m]))                           # fastest: through the ball
    lo = max(m, imp - 240)
    top = lo + int(np.argmax(H[lo:imp, 2])) if not putt else lo + int(np.argmax(np.linalg.norm(H[lo:imp, :2] - H[imp, :2], axis=1)))
    # address: going back from the top, the last moment the hands were still
    still = 0.12 if not putt else 0.05
    addr = top
    while addr > m and vs[addr] < 0.35: addr -= 1      # past the pause at the top, into the backswing
    while addr > m and vs[addr] > still: addr -= 1     # back to where the hands were still: address
    fin = imp
    while fin < len(vs) - 1 and (vs[fin] > still or fin < imp + 30): fin += 1
    # refine impact as the lowest point of the hands near the fastest frame
    w0, w1 = max(top, imp - 12), min(len(H) - 1, imp + 12)
    imp = w0 + int(np.argmin(H[w0:w1, 2]))
    return {'address': addr, 'top': top, 'impact': imp, 'finish': fin}


info = {}
for name, fn in CLIPS:
    src = import_clip(os.path.join(BVH_DIR, fn))
    act, hands, n = retarget(src, name)
    mk = markers(hands, putt=name.startswith('putt'))
    # where the hands and feet were at address and impact, in the rig's frame (for lining up with the club)
    def at(f):
        scene.frame_set(f + 3); scene.frame_set(f + 1); bpy.context.view_layer.update()
        lh = rig.matrix_world @ rig.pose.bones['LeftHand'].head
        rh = rig.matrix_world @ rig.pose.bones['RightHand'].head
        lf = rig.matrix_world @ rig.pose.bones['LeftFoot'].head
        rf = rig.matrix_world @ rig.pose.bones['RightFoot'].head
        conv = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]   # Blender → glTF (y up)
        return {'hands': conv((lh + rh) / 2), 'lhand': conv(lh), 'rhand': conv(rh), 'feet': conv((lf + rf) / 2)}
    info[name] = {'frames': n, 'fps': 120, **{k: v / 120 for k, v in mk.items()},
                  'atAddress': at(mk['address']), 'atImpact': at(mk['impact'])}
    print('CLIP', name, n, mk)
    track = rig.animation_data.nla_tracks.new(); track.name = name
    track.strips.new(name, 1, act)
    rig.animation_data.action = None
    bpy.data.objects.remove(src)

rig['fairway'] = json.dumps(info)
scene.frame_set(1)

# textures for the game: 1k is plenty at the sizes he is seen
for im in bpy.data.images:
    if im.size[0] > 1024: im.scale(1024, int(im.size[1] * 1024 / im.size[0]))

if PREVIEW:
    scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'CYCLES'
    scene.render.resolution_x, scene.render.resolution_y = 1200, 700
    w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.5; sun.rotation_euler = (0.8, 0.2, 0.6); scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.lens = 35
    rig.animation_data.action = bpy.data.actions['swing']
    for o in bpy.data.objects: o.select_set(False)
    imp = info['swing']
    shots = [('address', imp['address']), ('top', imp['top']), ('impact', imp['impact']), ('finish', imp['finish'])]
    base, ext = os.path.splitext(PREVIEW)
    for label, t in shots:
        scene.frame_set(int(t * 120) + 1)
        hips = rig.matrix_world @ rig.pose.bones['Hips'].head
        cam.location = (hips.x + 3.2, hips.y - 0.4, 1.2); cam.rotation_euler = (math.radians(86), 0, math.radians(97))
        scene.render.filepath = f'{base}_{label}{ext}'
        bpy.ops.render.render(write_still=True)
    rig.animation_data.action = None

# bake the body's shape and drop the hidden helper geometry (MPFB masks it; the exporter would not)
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o
    if o.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for m in [m for m in o.modifiers if m.type in ('MASK', 'SUBSURF')]:
        try: bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception as e: print('MODFAIL', o.name, m.name, e)
    print('MESH', o.name, len(o.data.vertices))

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=False, export_skins=True,
                          export_animation_mode='NLA_TRACKS', export_extras=True, export_image_format='JPEG',
                          export_jpeg_quality=86, export_def_bones=True, export_frame_step=2, use_selection=False)
print('WROTE', OUT, json.dumps(info)[:600])
