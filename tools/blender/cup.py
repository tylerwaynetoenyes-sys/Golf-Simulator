# The hole on the green, modelled to the real thing and exported for the game.
#
#   blender -b --factory-startup --python tools/blender/cup.py -- assets/models/cup.glb [soil_diff.jpg]
#
# Rules of Golf (Definitions, "Hole"): 4.25 in (108 mm) across, the liner, if used,
# sunk at least 1 in (25.4 mm) below the putting surface. A standard cup is 4 in
# deep, so the floor sits about 5 in (127 mm) down.
#
# Nodes (glTF, metres, +y up, origin at the hole's centre on the putting surface):
#   soil     the cut wall of the hole above the liner: verdure, thatch, the sandy
#            root zone with its roots, and the white paint a tournament crew
#            sprays round the top inch (texture: u round the hole, v down)
#   liner    the white plastic cup: rolled lip, the flagstick socket in a low boss on
#            the floor, six ribs and six drain holes, sand and soil settled in it
#   fringe   cut grass blades round the edge, the odd one leaning out over the hole
#   ferrule  the chrome taper at the foot of the flagstick that seats in the socket
import bpy
import bmesh
import math
import os
import sys
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'cup.glb'
SOIL_SRC = argv[1] if len(argv) > 1 else None

IN = 0.0254
RH = 4.25 * IN / 2          # the hole
R_OUT = RH - 0.0003         # liner outside, a press fit
WALL = 0.0018
R_IN = R_OUT - WALL
TOP = -1.0 * IN             # liner top
FLOOR = -5.0 * IN           # inside of the floor
SOIL_D = 0.034              # the soil wall runs a little way down behind the liner
rng = np.random.default_rng(7)


# ── noise ────────────────────────────────────────────────────────────────────
def value_noise(shape, cells, seed, wrap_x=True):
    """Smooth tileable-in-x value noise, 0..1, at cells=(cx, cy) lattice cells."""
    r = np.random.default_rng(seed)
    cx, cy = cells
    lat = r.random((cy + 2, cx + 1))
    lat[:, cx] = lat[:, 0] if wrap_x else lat[:, cx]
    h, w = shape
    ys = np.linspace(0, cy, h, endpoint=False)
    xs = np.linspace(0, cx, w, endpoint=False)
    y0 = np.floor(ys).astype(int); x0 = np.floor(xs).astype(int)
    fy = ys - y0; fx = xs - x0
    fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
    a = lat[y0][:, x0]; b = lat[y0][:, x0 + 1]; c = lat[y0 + 1][:, x0]; d = lat[y0 + 1][:, x0 + 1]
    top = a + (b - a) * fx[None, :]
    bot = c + (d - c) * fx[None, :]
    return top + (bot - top) * fy[:, None]


def fbm(shape, cells, seed, octaves=4):
    out = np.zeros(shape); amp = 1; tot = 0
    for o in range(octaves):
        out += value_noise(shape, (cells[0] * 2 ** o, cells[1] * 2 ** o), seed + o) * amp
        tot += amp; amp *= 0.5
    return out / tot


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ── the soil wall texture ────────────────────────────────────────────────────
def soil_maps(W=2048, H=224):
    """u round the hole (W), v from the surface (row 0) down SOIL_D (row H)."""
    depth = (np.arange(H) + 0.5) / H * SOIL_D                    # metres below the surface
    D = np.repeat(depth[:, None], W, 1)
    col = np.zeros((H, W, 3)); hgt = np.zeros((H, W)); rough = np.full((H, W), 0.92)
    # the root zone: a USGA green is ~90% sand with organic matter, darker and finer near the top
    base = np.array([0.43, 0.35, 0.25])
    if SOIL_SRC and os.path.exists(SOIL_SRC):
        img = bpy.data.images.load(SOIL_SRC)
        iw, ih = img.size
        px = np.array(img.pixels[:]).reshape(ih, iw, 4)[::-1, :, :3]
        # a strip of the photographed soil, scaled to ~4 cm across the texture height
        ys = (np.arange(H) * 3) % ih; xs = (np.arange(W) * 3) % iw
        photo = px[ys][:, xs]
        lum = photo.mean(2, keepdims=True)
        photo = lum / max(1e-3, lum.mean()) * base
    else:
        photo = np.broadcast_to(base, (H, W, 3)).copy()
    n1 = fbm((H, W), (64, 4), 11)
    grains = rng.random((H, W))
    sand = photo * (0.85 + 0.3 * n1[..., None])
    sand += (grains > 0.93)[..., None] * np.array([0.2, 0.18, 0.13])          # bright quartz grains
    sand *= (1 - 0.28 * (grains < 0.05))[..., None]                            # dark organic flecks
    organic = smooth(0.026, 0.008, D)[..., None]                               # darker, richer near the top
    sand = sand * (1 - 0.35 * organic) + np.array([0.17, 0.12, 0.07]) * 0.35 * organic
    col[:] = sand
    hgt += 0.35 * grains + 0.4 * n1
    # roots: fine pale threads wandering down through the root zone
    for _ in range(260):
        x = rng.random() * W; y = rng.random() * H * 0.35
        thick = rng.choice([0, 0, 1])
        for _s in range(int(rng.integers(20, 140))):
            x += rng.normal(0, 0.9); y += 0.6 + rng.random() * 0.8
            if y >= H: break
            xi = int(x) % W; yi = int(y)
            for t in range(-thick, thick + 1):
                c = (xi + t) % W
                col[yi, c] = col[yi, c] * 0.35 + np.array([0.72, 0.64, 0.5]) * 0.65
                hgt[yi, c] += 0.5
    # thatch: the matted stems and runners between the turf and the soil, 3–10 mm down
    fib = fbm((H, W), (900, 6), 21, 3)
    thatch = np.array([0.24, 0.2, 0.12]) * (0.7 + 0.6 * fib[..., None])
    kt = (smooth(0.0025, 0.004, D) * smooth(0.011, 0.008, D))[..., None]
    col = col * (1 - kt) + thatch * kt
    hgt += kt[..., 0] * fib * 0.8
    # verdure: the cut green leaves and their pale stem bases, the top 3 mm
    stem = fbm((H, W), (1400, 2), 31, 2)
    green = np.array([0.2, 0.33, 0.12]) * (0.7 + 0.6 * stem[..., None])
    green = green + np.array([0.18, 0.16, 0.06]) * smooth(0.0012, 0.003, D)[..., None]    # paler toward the crowns
    kv = smooth(0.0042, 0.0025, D)[..., None]
    col = col * (1 - kv) + green * kv
    hgt += kv[..., 0] * stem
    # tournament paint: white sprayed round the top inch of the wall, ragged at its top
    # edge where the cutter's lip stopped the spray, misted below
    edge = 0.0032 + 0.0022 * fbm((1, W), (40, 1), 41, 3)[0]
    bottom = 0.0215 + 0.006 * fbm((1, W), (18, 1), 43, 3)[0]
    cover = smooth(edge - 0.0006, edge + 0.0008, D) * smooth(bottom + 0.004, bottom - 0.002, D)
    cover *= 0.82 + 0.18 * fbm((H, W), (300, 12), 45, 2)
    mist = (rng.random((H, W)) < 0.12 * smooth(bottom + 0.008, bottom, D)) * 0.7
    paint = np.clip(np.maximum(cover, mist) * (1 - 0.3 * (grains < 0.04)), 0, 1)[..., None]
    col = col * (1 - paint) + np.array([0.86, 0.86, 0.83]) * (0.92 + 0.08 * n1[..., None]) * paint
    rough = rough * (1 - paint[..., 0]) + 0.62 * paint[..., 0]
    hgt = hgt * (1 - 0.6 * paint[..., 0])
    # normals from the relief (tangent space, OpenGL green)
    gx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 0.5
    gy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * 0.5
    s = 2.2
    n = np.dstack([-gx * s, gy * s, np.ones_like(hgt)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    nrm = n * 0.5 + 0.5
    return np.clip(col, 0, 1), nrm, np.clip(rough, 0, 1)


def to_image(name, arr, srgb=True):
    H, W = arr.shape[:2]
    if arr.ndim == 2: arr = np.dstack([arr] * 3)
    img = bpy.data.images.new(name, W, H, alpha=False)
    img.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    rgba = np.dstack([arr, np.ones((H, W))])[::-1]   # Blender rows run bottom-up
    if srgb:
        # authored in display values; Blender stores sRGB images as display values too
        pass
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.pack()
    img.file_format = 'JPEG' if srgb else 'PNG'
    return img


def material(name, base=None, img=None, nimg=None, rimg=None, rough=0.6, metal=0.0, vcol=False, clearcoat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if base is not None: bsdf.inputs['Base Color'].default_value = (*base, 1)
    if img:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
        nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    elif vcol:
        a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'Col'
        nt.links.new(a.outputs['Color'], bsdf.inputs['Base Color'])
    if rimg:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = rimg
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(t.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    if nimg:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = nimg
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(t.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if clearcoat:
        bsdf.inputs['Coat Weight'].default_value = clearcoat
    return m


def obj_from_bm(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ── soil wall ────────────────────────────────────────────────────────────────
def build_soil(mat):
    S, R = 256, 28
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    wob = fbm((R + 1, S + 1), (24, 3), 51, 3)
    verts = []
    for j in range(R + 1):
        v = j / R
        z = -(v ** 1.15) * SOIL_D
        row = []
        for i in range(S + 1):
            a = i / S * 2 * math.pi
            # a clean cut at the top; crumbs and pebbles make the wall a touch uneven lower down
            r = RH + (wob[j, i % S] - 0.5) * 0.0016 * min(1, v * 6)
            row.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        verts.append(row)
    for j in range(R):
        for i in range(S):
            # faces wound to point in, toward the hole's axis
            f = bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
            for lp, (ii, jj) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                lp[uv].uv = (ii / S, 1 - (jj / R) ** 1.15)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    bm.normal_update()
    return obj_from_bm('soil', bm, mat)


# ── the liner ────────────────────────────────────────────────────────────────
def build_liner(mat):
    bm = bmesh.new()
    S = 160
    # the wall and floor as one lathed profile (r, z), outside down then inside up; a rolled lip on top
    lip = [(R_OUT, TOP - 0.004), (R_OUT + 0.0003, TOP - 0.0012), (R_OUT - 0.0002, TOP), (R_IN + 0.0006, TOP + 0.0002),
           (R_IN - 0.0004, TOP - 0.0009), (R_IN, TOP - 0.003)]
    prof = [(R_OUT, FLOOR - 0.003), (R_OUT, TOP - 0.004)] + lip[1:] + [(R_IN, FLOOR + 0.004), (R_IN - 0.0025, FLOOR + 0.0004), (R_IN - 0.006, FLOOR)]
    # the floor, out to the boss
    BOSS_R, BOSS_H, SOCK_R = 0.0165, 0.006, 0.0098   # a low boss; the socket's tube runs on down below the floor
    for r in np.linspace(R_IN - 0.009, BOSS_R + 0.004, 9):
        prof.append((float(r), FLOOR))
    prof += [(BOSS_R + 0.0015, FLOOR + 0.0006), (BOSS_R, FLOOR + 0.003), (BOSS_R, FLOOR + BOSS_H - 0.002),
             (BOSS_R - 0.0012, FLOOR + BOSS_H), (SOCK_R + 0.0016, FLOOR + BOSS_H), (SOCK_R, FLOOR + BOSS_H - 0.0016),
             (SOCK_R, FLOOR - 0.03), (0.0, FLOOR - 0.03)]
    rings = []
    for (r, z) in prof:
        rings.append([bm.verts.new((r * math.cos(i / S * 2 * math.pi), r * math.sin(i / S * 2 * math.pi), z)) for i in range(S)])
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(S):
            bm.faces.new((a[i], a[(i + 1) % S], b[(i + 1) % S], b[i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = obj_from_bm('liner', bm, mat)
    # six ribs from the boss to the wall, and six drain holes between them
    parts = []
    for k in range(6):
        a = k / 6 * 2 * math.pi
        L = R_IN - BOSS_R - 0.002
        mid = BOSS_R + L / 2
        bpy.ops.mesh.primitive_cube_add(size=1, location=(mid * math.cos(a), mid * math.sin(a), FLOOR + 0.0025), rotation=(0, 0, a))
        rib = bpy.context.object; rib.scale = (L, 0.0028, 0.005)
        bv = rib.modifiers.new('b', 'BEVEL'); bv.width = 0.0008; bv.segments = 2
        parts.append(rib)
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
        bpy.context.view_layer.objects.active = p
        bpy.ops.object.transform_apply(scale=True)
        bpy.ops.object.modifier_apply(modifier='b')
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.join()
    ob = bpy.context.object
    for k in range(6):
        a = (k + 0.5) / 6 * 2 * math.pi
        rr = (R_IN + BOSS_R) / 2
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.0064, depth=0.02, location=(rr * math.cos(a), rr * math.sin(a), FLOOR))
        cut = bpy.context.object
        bo = ob.modifiers.new('h', 'BOOLEAN'); bo.object = cut; bo.operation = 'DIFFERENCE'; bo.solver = 'EXACT'
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier='h')
        bpy.data.objects.remove(cut)
    ob.name = 'liner'
    for p in ob.data.polygons: p.use_smooth = True
    ob.data.shade_smooth()
    try:
        ob.data.set_sharp_from_angle(angle=math.radians(40))
    except Exception:
        pass
    # weathering, as vertex colour: white plastic, sand and soil settled on the floor and in the
    # rib corners, a grey tide line where water stands, streaks of soil washed down the wall
    me = ob.data
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices:
        x, y, z = v.co
        r = math.hypot(x, y); a = math.atan2(y, x)
        c = np.array([0.9, 0.9, 0.87])
        h = z - FLOOR
        streak = 0.5 + 0.5 * math.sin(a * 23 + math.sin(a * 7) * 2) * math.sin(a * 11.3)
        if r > R_IN - 0.001 and z > FLOOR + 0.004:
            # the wall: soil streaks from the top
            k = max(0.0, streak - 0.7) * 0.6 * max(0.0, (z - FLOOR) / (TOP - FLOOR)) ** 3
            c = c * (1 - k) + np.array([0.5, 0.42, 0.31]) * k
        if h < 0.008:
            sand = 0.55 + 0.45 * math.sin(x * 900) * math.sin(y * 870) * 0.5 + 0.2 * math.sin(a * 5)
            k = np.clip(sand, 0, 1) * (1 if h < 0.004 else 0.4)
            c = c * (1 - k * 0.7) + np.array([0.62, 0.53, 0.4]) * k * 0.7
        if FLOOR + 0.004 < z < FLOOR + 0.012 and r > R_IN - 0.001:
            c = c * 0.86
        if r < 0.0102 and z < FLOOR + 0.004:
            c = c * 0.35   # down the socket
        # what the sky can see: dimmer with depth in a narrow tube
        ao = 0.42 + 0.58 * min(1.0, max(0.0, (z - FLOOR) / (TOP - FLOOR))) ** 0.7
        ca.data[v.index].color = (*(c * ao), 1)
    return ob


# ── grass round the edge ─────────────────────────────────────────────────────
def build_fringe(mat):
    bm = bmesh.new()
    cl = bm.loops.layers.color.new('Col')
    N = 4200
    for k in range(N):
        a = rng.random() * 2 * math.pi
        r0 = RH + rng.random() ** 1.4 * 0.005
        # mown to ~3 mm: short leaves, with the odd one the mower missed
        L = 0.0018 + rng.random() * 0.0022 + (0.004 * rng.random() if rng.random() < 0.06 else 0)
        w = 0.00035 + rng.random() * 0.0003
        # leaning every way the mower left them; the ones at the very edge flop out over the hole
        lean_in = (0.9 if r0 < RH + 0.001 else 0.35) * rng.random()
        ux, uy = math.cos(a), math.sin(a)
        tx, ty = -uy, ux
        sway = rng.normal(0, 0.35)
        seg = 3
        pts = []
        for s in range(seg + 1):
            t = s / seg
            up = L * t * (1 - 0.35 * t * lean_in * 2)
            inward = L * t * t * lean_in
            side = L * t * sway * 0.4
            pts.append((r0 - inward, side, up - L * 0.25 * t * t * lean_in))
        vs = []
        for s, (rr, sd, z) in enumerate(pts):
            ww = w * (1 - s / (seg + 0.4))
            cx = rr * ux + sd * tx; cy = rr * uy + sd * ty
            vs.append((bm.verts.new((cx - tx * ww / 2, cy - ty * ww / 2, z)), bm.verts.new((cx + tx * ww / 2, cy + ty * ww / 2, z))))
        tone = 0.75 + rng.random() * 0.5
        for s in range(seg):
            f = bm.faces.new((vs[s][0], vs[s][1], vs[s + 1][1], vs[s + 1][0]))
            for lp in f.loops:
                h = lp.vert.co.z / max(L, 1e-4)
                g = np.array([0.16, 0.3, 0.09]) * (0.55 + 0.6 * h) * tone
                lp[cl] = (*g, 1)
    bm.normal_update()
    ob = obj_from_bm('fringe', bm, mat)
    ob.data.color_attributes.active_color_name = 'Col'
    return ob


# ── the drainage gravel under the floor, seen through the drain holes ────────
def build_gravel(mat):
    bm = bmesh.new()
    cl = bm.loops.layers.color.new('Col')
    res = bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=R_OUT)
    bmesh.ops.translate(bm, verts=res['verts'], vec=(0, 0, FLOOR - 0.012))
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=6, use_grid_fill=True)
    for v in bm.verts:
        v.co.z += (rng.random() - 0.5) * 0.004
    for f in bm.faces:
        if f.normal.z < 0: f.normal_flip()
        t = 0.04 + rng.random() * 0.07
        for lp in f.loops: lp[cl] = (t * 1.1, t, t * 0.85, 1)
    bm.normal_update()
    return obj_from_bm('gravel', bm, mat)


# ── the flagstick's ferrule ──────────────────────────────────────────────────
def build_ferrule(mat):
    # (r, z) from its tip in the socket up to where it meets the 13 mm pole
    prof = [(0.0, 0.0), (0.0045, 0.0), (0.0072, 0.002), (0.0088, 0.012), (0.0091, 0.03), (0.0089, 0.075),
            (0.0078, 0.082), (0.0068, 0.088), (0.0066, 0.1)]
    S = 48
    bm = bmesh.new()
    rings = [[bm.verts.new((r * math.cos(i / S * 2 * math.pi), r * math.sin(i / S * 2 * math.pi), z)) for i in range(S)] for r, z in prof]
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(S):
            bm.faces.new((a[i], a[(i + 1) % S], b[(i + 1) % S], b[i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return obj_from_bm('ferrule', bm, mat)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    col, nrm, rough = soil_maps()
    soil_mat = material('soil', img=to_image('cup_soil_diff', col), nimg=to_image('cup_soil_nor', nrm, False),
                        rimg=to_image('cup_soil_rough', np.dstack([rough, rough, rough]), False))
    build_soil(soil_mat)
    build_liner(material('liner', vcol=True, rough=0.38, clearcoat=0.25))
    build_fringe(material('fringe', vcol=True, rough=0.7))
    build_gravel(material('gravel', vcol=True, rough=0.95))
    build_ferrule(material('ferrule', base=(0.82, 0.82, 0.8), rough=0.18, metal=1.0))
    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=True,
                              export_image_format='AUTO', export_jpeg_quality=92, export_normals=True,
                              export_vertex_color='MATERIAL', use_selection=False)
    for o in bpy.context.scene.objects:
        print('node', o.name, len(o.data.vertices), 'verts', len(o.data.polygons), 'faces')


main()
