# The small things on and around the green, modelled in Blender for the game.
#
#   blender -b --factory-startup --python tools/blender/green_details.py -- <out root> [pin] [marker] [marks]
#
# Writes (under <out root>):
#   assets/models/pin.glb             flag   a 20 x 14 in pin flag: a sewn sleeve that runs down the pole,
#                                            double-stitched hems, the cloth's weave (normal map); u runs
#                                            from the pole to the fly, v from the foot of the flag to its head
#                                     topcap the flagstick's top: a moulded cap with a ferrule ring
#                                     clip   the chrome swivel clip that holds the flag's head at the pole
#   assets/models/teemarker.glb       marker a turned hardwood tee marker, a painted band (the tee's colour,
#                                            set in game) and a brass top, on a steel ground spike
#   assets/textures/pitchmark_fresh.png / _fresh_nor.png
#   assets/textures/pitchmark_repaired.png / _repaired_nor.png
#                                     decals rendered top-down (Cycles, CPU) from a modelled mark: the
#                                     crater a landing ball leaves, its raised lip and torn blades, and the
#                                     same mark after a pitch-mark tool has closed it. Colour + alpha, and
#                                     a tangent-space normal map (x right, y toward the top of the image)
#
# Frames: glTF metres, +y up. The flag's pole edge is on x = 0, its middle at y = 0, the fly toward +x.
import bpy
import bmesh
import math
import os
import sys
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['.']
ROOT = argv[0]
IN = 0.0254
rng = np.random.default_rng(11)


def value_noise(shape, cells, seed):
    r = np.random.default_rng(seed)
    cx, cy = cells
    lat = r.random((cy + 2, cx + 2))
    lat[:, cx] = lat[:, 0]
    h, w = shape
    ys = np.linspace(0, cy, h, endpoint=False); xs = np.linspace(0, cx, w, endpoint=False)
    y0 = np.floor(ys).astype(int); x0 = np.floor(xs).astype(int)
    fy = ys - y0; fx = xs - x0
    fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
    a = lat[y0][:, x0]; b = lat[y0][:, x0 + 1]; c = lat[y0 + 1][:, x0]; d = lat[y0 + 1][:, x0 + 1]
    top = a + (b - a) * fx[None, :]; bot = c + (d - c) * fx[None, :]
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


def to_image(name, arr, srgb=True, alpha=None):
    H, W = arr.shape[:2]
    if arr.ndim == 2: arr = np.dstack([arr] * 3)
    a = np.ones((H, W)) if alpha is None else alpha
    img = bpy.data.images.new(name, W, H, alpha=alpha is not None)
    img.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    img.pixels.foreach_set(np.dstack([arr, a])[::-1].astype(np.float32).ravel())
    img.pack()
    return img


def save_png(arr, path, alpha=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img = to_image(os.path.basename(path), arr, True, alpha)
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()


def material(name, base=None, img=None, nimg=None, rough=0.6, metal=0.0, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if coat: bsdf.inputs['Coat Weight'].default_value = coat
    if base is not None: bsdf.inputs['Base Color'].default_value = (*base, 1)
    if img:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
        nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    if nimg:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = nimg
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(t.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def link(name, bm, mat, smooth_shade=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    if mat: me.materials.append(mat)
    for p in me.polygons: p.use_smooth = smooth_shade
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def lathe(name, prof, mat, S=48, z_up=True):
    """Revolve (r, z) about the z axis (Blender up)."""
    bm = bmesh.new()
    rings = [[bm.verts.new((r * math.cos(i / S * 2 * math.pi), r * math.sin(i / S * 2 * math.pi), z)) for i in range(S)] for r, z in prof]
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(S):
            bm.faces.new((a[i], a[(i + 1) % S], b[(i + 1) % S], b[i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return link(name, bm, mat)


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def export(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=True,
                              export_image_format='AUTO', export_jpeg_quality=90, use_selection=False)
    for o in bpy.context.scene.objects:
        print('node', os.path.basename(path), o.name, len(o.data.vertices))


# ── the pin: flag, top cap, clip ─────────────────────────────────────────────
FW, FH = 20 * IN, 14 * IN        # fly length, hoist
SLEEVE = 0.022                   # the sleeve's flat width (it wraps the 13 mm pole)


def flag_cloth(W=1024, H=720):
    """Luminance (the colour comes from the material) and normals: weave, hems, stitching."""
    u = (np.arange(W) + 0.5) / W; v = (np.arange(H) + 0.5) / H
    U, V = np.meshgrid(u, v)
    x = U * FW; y = (1 - V) * FH                              # metres from the pole edge, from the flag's foot
    lum = np.full((H, W), 0.92)
    hgt = np.zeros((H, W))
    # the weave: a fine plain-weave nylon, warp and weft
    wx = np.sin(x / 0.0007 * math.pi) ** 2; wy = np.sin(y / 0.0007 * math.pi) ** 2
    hgt += 0.25 * (wx + wy)
    lum *= 0.97 + 0.03 * fbm((H, W), (30, 21), 3)
    # hems: the cloth folded twice along the top, bottom and fly (12 mm), the sleeve at the pole
    def band(d, w):
        return smooth(w, w - 0.0015, d)
    hem = np.maximum.reduce([band(y, 0.012), band(FH - y, 0.012), band(FW - x, 0.014)])
    sleeve = band(x, SLEEVE)
    hgt += 0.9 * np.maximum(hem, sleeve)
    lum *= 1 - 0.05 * np.maximum(hem, sleeve)
    # double-needle stitching, 2.5 mm stitches, two lines 4 mm apart on each hem and the sleeve seam
    def stitches(d, at):
        line = smooth(0.00045, 0.0, np.abs(d - at))
        return line
    along_x = (np.sin(x / 0.0025 * math.pi * 2) > -0.3)
    along_y = (np.sin(y / 0.0025 * math.pi * 2) > -0.3)
    st = np.zeros((H, W))
    for at in (0.0035, 0.0075):
        st = np.maximum(st, stitches(y, at) * along_x)
        st = np.maximum(st, stitches(FH - y, at) * along_x)
        st = np.maximum(st, stitches(FW - x, at + 0.002) * along_y)
    st = np.maximum(st, stitches(x, SLEEVE + 0.002) * along_y)
    st = np.maximum(st, stitches(x, SLEEVE + 0.006) * along_y)
    lum *= 1 - 0.28 * st
    hgt -= 0.6 * st
    # wear: the fly end frays and greys a little in the wind
    lum *= 1 - 0.06 * smooth(FW - 0.05, FW, x) * fbm((H, W), (40, 30), 9)
    gx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 0.5; gy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * 0.5
    n = np.dstack([-gx * 1.6, gy * 1.6, np.ones_like(hgt)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
    return np.clip(lum, 0, 1), n * 0.5 + 0.5


def build_pin():
    clear()
    lum, nrm = flag_cloth()
    fm = material('flag', img=to_image('flag_cloth', lum), nimg=to_image('flag_cloth_nor', nrm, False), rough=0.85)
    # the flag: a grid out from the pole edge, plus the sleeve wrapped round the pole (radius 6.5 mm + cloth)
    NX, NY = 40, 16
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    rows = []
    for j in range(NY + 1):
        v = j / NY
        z = (v - 0.5) * FH
        row = []
        # the sleeve: wrap from the far side of the pole round to the flag's plane
        for k in range(8):
            a = math.pi * 0.5 + (k / 8) * math.pi * 1.5     # 90° → 360°, round the back of the pole
            r = 0.0072
            row.append((bm.verts.new((r * math.cos(a), r * math.sin(a), z)), (k / 8) * (SLEEVE / FW)))
        for i in range(NX + 1):
            u = SLEEVE / FW + (i / NX) * (1 - SLEEVE / FW)
            row.append((bm.verts.new((0.0072 + u * FW - SLEEVE, 0.0, z)), u))
        rows.append(row)
    for j in range(NY):
        for i in range(len(rows[j]) - 1):
            a, b, c, d = rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]
            f = bm.faces.new((a[0], b[0], c[0], d[0]))
            for lp, (vv, uu, vj) in zip(f.loops, ((a[0], a[1], j), (b[0], b[1], j), (c[0], c[1], j + 1), (d[0], d[1], j + 1))):
                lp[uv].uv = (uu, vj / NY)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    link('flag', bm, fm)   # built upright (Blender z is the hoist), the sleeve round the z axis
    # top cap: a moulded dome over a chrome ring, on top of the 13 mm stick
    cap = material('topcap', base=(0.92, 0.9, 0.84), rough=0.3, coat=0.4)
    lathe('topcap', [(0.0, 0.03), (0.004, 0.0295), (0.0068, 0.028), (0.0082, 0.025), (0.0086, 0.02), (0.0085, 0.008),
                     (0.0079, 0.0065), (0.0072, 0.006), (0.0067, 0.0)], cap, S=40)
    ring = material('chrome', base=(0.85, 0.85, 0.83), rough=0.15, metal=1.0)
    lathe('capring', [(0.0066, 0.0), (0.0074, 0.0005), (0.0075, 0.0045), (0.0066, 0.005)], ring, S=40)
    # the swivel clip at the flag's head: a collar round the stick and a short arm to a hook through the hem
    lathe('clip', [(0.0067, -0.006), (0.0078, -0.0055), (0.0079, 0.0055), (0.0067, 0.006)], ring, S=32)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.0012, radius2=0.0012, depth=0.012)
    bmesh.ops.rotate(bm, verts=bm.verts[:], cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(math.pi / 2, 3, 'Y'))
    bmesh.ops.translate(bm, verts=bm.verts[:], vec=(0.012, 0, 0))
    arm = link('cliparm', bm, ring)
    # join the clip parts, and the cap and its ring
    for a, b in (('clip', 'cliparm'), ('topcap', 'capring')):
        A, B = bpy.data.objects[a], bpy.data.objects[b]
        bpy.ops.object.select_all(action='DESELECT')
        A.select_set(True); B.select_set(True); bpy.context.view_layer.objects.active = A
        bpy.ops.object.join()
    export(os.path.join(ROOT, 'assets/models/pin.glb'))


# ── tee marker ───────────────────────────────────────────────────────────────
def wood_maps(W=512, H=512):
    u = (np.arange(W) + 0.5) / W; v = (np.arange(H) + 0.5) / H
    U, V = np.meshgrid(u, v)
    warp = fbm((H, W), (3, 6), 21) * 2.5
    # turned from a blank with the grain along its length: the figure runs up the marker (u is round it)
    rings = np.sin((U * 9 + warp * 0.35 + V * 0.4) * math.pi * 2) * 0.5 + 0.5
    fine = fbm((H, W), (6, 220), 23, 2)
    base = np.array([0.36, 0.2, 0.1])            # oiled walnut
    col = base * (0.7 + 0.35 * rings[..., None]) * (0.9 + 0.2 * fine[..., None])
    hgt = rings * 0.3 + fine * 0.4
    gx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 0.5; gy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * 0.5
    n = np.dstack([-gx * 1.2, gy * 1.2, np.ones_like(hgt)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
    return np.clip(col, 0, 1), n * 0.5 + 0.5


def build_marker():
    clear()
    col, nrm = wood_maps()
    wood = material('wood', img=to_image('walnut', col), nimg=to_image('walnut_nor', nrm, False), rough=0.42, coat=0.5)
    paint = material('band', base=(0.95, 0.95, 0.93), rough=0.35, coat=0.6)    # recoloured per tee in game
    brass = material('brass', base=(0.86, 0.66, 0.36), rough=0.22, metal=1.0)
    steel = material('steel', base=(0.5, 0.5, 0.5), rough=0.5, metal=1.0)
    # a turned body: a flared foot, waisted, the painted band, a rounded shoulder up to the brass top
    body = [(0.0, 0.0), (0.040, 0.0), (0.044, 0.004), (0.045, 0.012), (0.041, 0.022), (0.036, 0.034), (0.034, 0.05), (0.035, 0.058)]
    band = [(0.035, 0.058), (0.0362, 0.06), (0.0365, 0.082), (0.035, 0.084)]
    shoulder = [(0.035, 0.084), (0.036, 0.088), (0.035, 0.096), (0.031, 0.104), (0.024, 0.109), (0.022, 0.11)]
    S = 64
    def uv_lathe(name, prof, mat):
        ob = lathe(name, prof, mat, S=S)
        me = ob.data
        uvl = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            for li in poly.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                uvl.data[li].uv = ((math.atan2(co.y, co.x) / (2 * math.pi)) % 1.0, co.z * 6)
        return ob
    uv_lathe('marker_wood', body + [(0.0, 0.058)], wood)
    uv_lathe('marker_band', band, paint)
    uv_lathe('marker_top', shoulder + [(0.0, 0.11)], wood)
    lathe('marker_brass', [(0.0, 0.1145), (0.012, 0.1142), (0.0205, 0.1125), (0.0225, 0.1105), (0.0222, 0.1085), (0.0, 0.1085)], brass, S=S)
    lathe('marker_spike', [(0.0, -0.075), (0.003, -0.07), (0.004, -0.055), (0.004, 0.0), (0.0, 0.0)], steel, S=16)
    bpy.ops.object.select_all(action='DESELECT')
    names = ['marker_wood', 'marker_band', 'marker_top', 'marker_brass', 'marker_spike']
    for n in names: bpy.data.objects[n].select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects['marker_wood']
    bpy.ops.object.join()
    bpy.context.object.name = 'marker'
    export(os.path.join(ROOT, 'assets/models/teemarker.glb'))


# ── pitch marks, rendered from a modelled mark ───────────────────────────────
MARK = 0.07          # the decal covers 7 cm square
RES = 1024


def mark_height(X, Y, repaired):
    """Surface height (m) of the turf round the mark; the ball came in travelling toward +y."""
    r = np.hypot(X, (Y - 0.002) / 1.3)   # a little longer than wide: the ball skids in along +y
    if not repaired:
        crater = -0.005 * smooth(0.011, 0.0, r) ** 0.7                     # a dent the size of the ball
        lip = 0.0016 * np.exp(-((Y - 0.0125) / 0.0035) ** 2) * smooth(0.016, 0.004, np.abs(X))   # turf shoved up ahead
        tear = 0.0006 * fbm(X.shape, (40, 40), 5) * smooth(0.016, 0.008, r)
        return crater + lip + tear
    # repaired: the edges levered in and tamped flat, a slight pucker where they meet, tine holes round it
    pucker = -0.0007 * smooth(0.009, 0.0, r) + 0.0004 * np.exp(-((r - 0.010) / 0.002) ** 2)
    holes = np.zeros_like(X)
    for k in range(6):
        a = k / 6 * 2 * math.pi + 0.3
        hx, hy = math.cos(a) * 0.0145, math.sin(a) * 0.0145 + 0.002
        holes += -0.002 * np.exp(-((X - hx) ** 2 + (Y - hy) ** 2) / (0.0011 ** 2))
    return pucker + holes


def build_marks():
    clear()
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 96
    sc.render.resolution_x = sc.render.resolution_y = RES
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_depth = '16'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = MARK
    cam.location = (0, 0, 0.2)
    sc.collection.objects.link(cam); sc.camera = cam
    w = bpy.data.worlds.new('w'); sc.world = w
    out = {}
    for repaired in (False, True):
        for o in list(sc.objects):
            if o.type == 'MESH': bpy.data.objects.remove(o)
        # the turf: a fine displaced grid
        N = 360
        xs = np.linspace(-MARK / 2, MARK / 2, N)
        X, Y = np.meshgrid(xs, xs)
        Hm = mark_height(X, Y, repaired)
        bm = bmesh.new()
        cl = bm.verts.layers.float_color.new('Col') if hasattr(bm.verts.layers, 'float_color') else None
        vs = [[bm.verts.new((X[j, i], Y[j, i], Hm[j, i])) for i in range(N)] for j in range(N)]
        for j in range(N - 1):
            for i in range(N - 1):
                bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
        # what each point is: 0 turf, 1 bare soil (the crater floor, the tine holes)
        soil = np.clip((-Hm - (0.0011 if not repaired else 0.0012)) / 0.0012, 0, 1) * (0.55 + 0.45 * fbm(Hm.shape, (30, 30), 77))
        if cl:
            for j in range(N):
                for i in range(N):
                    vs[j][i][cl] = (soil[j, i], 0, 0, 1)
        bm.normal_update()
        turf = link('turf', bm, None)
        # torn blades round a fresh mark, flattened ones on a repaired one: thin cards lying on the surface
        bm = bmesh.new()
        nb = 90 if not repaired else 26
        for k in range(nb):
            a = rng.random() * 2 * math.pi
            # torn leaves flung out round the rim, mostly ahead of the ball; a repair leaves only a few, combed in
            if not repaired and rng.random() < 0.6: a = math.pi / 2 + (rng.random() - 0.5) * 2.2
            rr = (0.009 + rng.random() * 0.006) if not repaired else (0.002 + rng.random() * 0.007)
            cx, cy = math.cos(a) * rr, math.sin(a) * rr * 1.3 + 0.002
            L = 0.0015 + rng.random() * 0.0025; wd = 0.0007
            ang = (a if not repaired else a + math.pi) + (rng.random() - 0.5) * 1.4
            dx, dy = math.cos(ang), math.sin(ang)
            zi = float(mark_height(np.array([[cx]]), np.array([[cy]]), repaired)[0, 0]) + 0.0004
            p = [(cx - dy * wd / 2, cy + dx * wd / 2, zi), (cx + dy * wd / 2, cy - dx * wd / 2, zi),
                 (cx + dx * L + dy * wd / 4, cy + dy * L - dx * wd / 4, zi + 0.0006), (cx + dx * L - dy * wd / 4, cy + dy * L + dx * wd / 4, zi + 0.0006)]
            v = [bm.verts.new(q) for q in p]
            bm.faces.new((v[0], v[1], v[2], v[3]))
        blades = link('blades', bm, None, smooth_shade=False)
        # lighting: soft sky only, so the bake carries form, not a sun direction
        w.use_nodes = True
        w.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 1, 1, 1)
        w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0

        def mat_albedo():
            # turf: mown green with its grain; soil: the sandy root zone; torn blades: a paler, bruised green
            m = bpy.data.materials.new('alb'); m.use_nodes = True; nt = m.node_tree
            for n in list(nt.nodes): nt.nodes.remove(n)
            outn = nt.nodes.new('ShaderNodeOutputMaterial')
            em = nt.nodes.new('ShaderNodeEmission')
            noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 2600; noise.inputs['Detail'].default_value = 6
            ramp = nt.nodes.new('ShaderNodeValToRGB')
            ramp.color_ramp.elements[0].color = (0.06, 0.15, 0.03, 1); ramp.color_ramp.elements[1].color = (0.15, 0.3, 0.07, 1)
            nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
            attr = nt.nodes.new('ShaderNodeAttribute'); attr.attribute_name = 'Col'
            sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(attr.outputs['Color'], sep.inputs['Color'])
            soiln = nt.nodes.new('ShaderNodeTexNoise'); soiln.inputs['Scale'].default_value = 4000
            sramp = nt.nodes.new('ShaderNodeValToRGB')
            sramp.color_ramp.elements[0].color = (0.16, 0.11, 0.06, 1); sramp.color_ramp.elements[1].color = (0.36, 0.28, 0.18, 1)
            nt.links.new(soiln.outputs['Fac'], sramp.inputs['Fac'])
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
            nt.links.new(sep.outputs['Red'], mix.inputs['Factor'])
            nt.links.new(ramp.outputs['Color'], mix.inputs[6]); nt.links.new(sramp.outputs['Color'], mix.inputs[7])
            # lit by the sky so the crater's walls darken (form), mixed with the emission colour
            dif = nt.nodes.new('ShaderNodeBsdfDiffuse'); nt.links.new(mix.outputs[2], dif.inputs['Color'])
            nt.links.new(dif.outputs['BSDF'], outn.inputs['Surface'])
            return m

        def mat_blades(repaired):
            m = bpy.data.materials.new('bl'); m.use_nodes = True; nt = m.node_tree
            bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
            bsdf.inputs['Base Color'].default_value = (0.12, 0.24, 0.05, 1) if not repaired else (0.16, 0.24, 0.07, 1)   # bruised, torn green
            bsdf.inputs['Roughness'].default_value = 0.8
            return m

        def mat_normal():
            m = bpy.data.materials.new('nrm'); m.use_nodes = True; nt = m.node_tree
            for n in list(nt.nodes): nt.nodes.remove(n)
            outn = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
            geo = nt.nodes.new('ShaderNodeNewGeometry')
            vm = nt.nodes.new('ShaderNodeVectorMath'); vm.operation = 'MULTIPLY_ADD'
            vm.inputs[1].default_value = (0.5, 0.5, 0.5); vm.inputs[2].default_value = (0.5, 0.5, 0.5)
            nt.links.new(geo.outputs['Normal'], vm.inputs[0]); nt.links.new(vm.outputs['Vector'], em.inputs['Color'])
            nt.links.new(em.outputs['Emission'], outn.inputs['Surface'])
            return m

        tag = 'repaired' if repaired else 'fresh'
        # colour
        turf.data.materials.clear(); turf.data.materials.append(mat_albedo())
        blades.data.materials.clear(); blades.data.materials.append(mat_blades(repaired))
        sc.render.filepath = f'/tmp/fw_mark_{tag}_col.png'
        bpy.ops.render.render(write_still=True)
        # normals
        nm = mat_normal()
        for o in (turf, blades):
            o.data.materials.clear(); o.data.materials.append(nm)
        w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
        sc.cycles.samples = 8
        sc.render.filepath = f'/tmp/fw_mark_{tag}_nor.png'
        bpy.ops.render.render(write_still=True)
        sc.cycles.samples = 96
        # alpha: the mark itself, fading out over the undisturbed turf (computed from the model)
        ys = np.linspace(MARK / 2, -MARK / 2, RES); xs2 = np.linspace(-MARK / 2, MARK / 2, RES)
        XX, YY = np.meshgrid(xs2, ys)
        Hr = mark_height(XX, YY, repaired)
        rr = np.hypot(XX, (YY - 0.002) / 1.3)
        alpha = np.clip(np.abs(Hr) / 0.0004, 0, 1)
        alpha = np.maximum(alpha, smooth(0.019 if not repaired else 0.018, 0.012, rr))
        alpha *= smooth(MARK * 0.5, MARK * 0.36, np.hypot(XX, YY))
        out[tag] = alpha
    # assemble the PNGs with alpha
    for tag, alpha in out.items():
        col = bpy.data.images.load(f'/tmp/fw_mark_{tag}_col.png')
        c = np.array(col.pixels[:]).reshape(RES, RES, 4)[::-1, :, :3]
        save_png(c, os.path.join(ROOT, f'assets/textures/pitchmark_{tag}.png'), alpha=alpha)
        nr = bpy.data.images.load(f'/tmp/fw_mark_{tag}_nor.png')
        nr.colorspace_settings.name = 'Non-Color'
        n = np.array(nr.pixels[:]).reshape(RES, RES, 4)[::-1, :, :3]
        # world normal (camera looks down -z, x right, y up the image) is already tangent space for a flat decal
        save_png(n, os.path.join(ROOT, f'assets/textures/pitchmark_{tag}_nor.png'))
        print('wrote pitchmark', tag)


if len(argv) == 1 or 'pin' in argv[1:]: build_pin()
if len(argv) == 1 or 'marker' in argv[1:]: build_marker()
if len(argv) == 1 or 'marks' in argv[1:]: build_marks()
