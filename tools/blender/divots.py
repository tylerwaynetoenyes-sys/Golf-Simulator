# Divots, modelled in Blender: the chunks of turf an iron takes, and the scars they leave.
#
#   blender -b --factory-startup --python tools/blender/divots.py -- <out root> [chunks] [scars]
#
# assets/models/divots.glb — the turf a club cuts out, one node per kind (metres, +y up, the chunk's
#   length along +z, the way the club travelled; its grass up; origin under its middle):
#     divot_strip    a thin "bacon strip" from a shallow, swept strike
#     divot_dollar   the classic dollar-bill divot of a good iron, ball first
#     divot_chunk    a fat, thick lump from a heavy strike, crumbling soil
#     divot_short    a short scoop from a wedge
#     divot_curl     a long strip curled over on itself
#     divot_broken_a, divot_broken_b   one that tore in two
#   Each: grass blades on top (fairway height, ~12 mm), the thatch, the soil body with a ragged underside
#   and roots hanging out of it. Colours are vertex colours (linear).
#
# assets/textures/scar_<kind>.png (+ _nor.png) — the scar left in the turf, rendered top-down with Cycles
#   from a modelled trench: torn edges, the scraped soil floor, crumbs and torn blades thrown forward.
#   Image up (+v) is the way the club travelled. 0.4 m long by 0.2 m wide.
#     scar_scrape   the club only brushed the turf: bruised, flattened grass and a skin of soil
#     scar_clean    a crisp, shallow divot hole
#     scar_deep     a deep, wide trench from a heavy, steep strike
#     scar_long     a long shallow trench (a strip divot)
import bpy
import bmesh
import math
import os
import sys
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['.']
ROOT = argv[0]
WHAT = argv[1:] or ['chunks', 'scars']
rng = np.random.default_rng(23)


def value_noise(shape, cells, seed):
    r = np.random.default_rng(seed)
    cx, cy = cells
    lat = r.random((cy + 2, cx + 2))
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


def n1(seed, freq=1.0):
    """A 1-D smooth noise function of t in [0, 1], for outlines."""
    r = np.random.default_rng(seed)
    k = r.random(9) * 2 * math.pi; a = r.random(9)
    def f(t):
        return sum(a[i] * math.sin((i + 1) * freq * t * 2 * math.pi + k[i]) / (i + 1) for i in range(9)) / 2.0
    return f


# ── chunks ───────────────────────────────────────────────────────────────────
SOIL = np.array([0.11, 0.07, 0.035])     # moist fairway soil (linear)
SAND = np.array([0.32, 0.25, 0.15])
THATCH = np.array([0.045, 0.075, 0.018])   # the crowns and thatch under the leaves, still green at the top
GRASS = np.array([0.07, 0.17, 0.03])


def chunk(name, L, W, T, seed, curl=0.0, tear=None, ragged=1.0, blades=700, crumbly=0.0):
    r = np.random.default_rng(seed)
    edge = n1(seed + 1)
    # outline: a rounded rectangle (superellipse), torn irregular, narrower where the club entered (-z)
    def inside(x, z):
        u, v = x / (W / 2), z / (L / 2)
        taper = 1.0 - 0.18 * max(0.0, -v)
        a = math.atan2(v, u) / (2 * math.pi) + 0.5
        rr = 1.0 + 0.12 * ragged * edge(a)
        ok = (abs(u / taper) ** 4 + abs(v) ** 4) ** 0.25 < rr
        if tear is not None:
            ok = ok and ((z > tear + 0.004 * math.sin(x * 220)) if name.endswith('_b') else (z < tear - 0.004 + 0.004 * math.sin(x * 220)))
        return ok
    bm = bmesh.new()
    col = bm.verts.layers.float_color.new('Col')
    step = 0.003
    nx, nz = int(W * 1.3 / step) + 2, int(L * 1.3 / step) + 2
    grid = {}
    for i in range(nx):
        for j in range(nz):
            x = (i - (nx - 1) / 2) * step; z = (j - (nz - 1) / 2) * step
            if inside(x, z):
                grid[(i, j)] = bm.verts.new((x, z, T))
    top = []
    for (i, j), v in grid.items():
        q = [grid.get(k) for k in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))]
        if all(q):
            top.append(bm.faces.new(q))
    # drop orphans (verts with no face)
    for v in [v for v in bm.verts if not v.link_faces]:
        bm.verts.remove(v)
    # thickness: the club's sole cuts an arc, so the turf is thin where it entered and left and thickest in
    # the middle; the underside is that smooth curve, roughened by soil that tore rather than cut, and the
    # torn sides lean in toward it
    ext = bmesh.ops.extrude_face_region(bm, geom=top, use_keep_orig=True)
    newv = [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]
    rough = fbm((64, 64), (5, 5), seed + 9, 3)
    def rn(x, z):
        i = int(np.clip((x / W + 0.5) * 63, 0, 63)); j = int(np.clip((z / L + 0.5) * 63, 0, 63))
        return rough[j, i]
    for v in newv:
        x, z = v.co.x, v.co.y
        along = np.clip((z / L) + 0.5, 0, 1)
        arc = math.sin(math.pi * (0.08 + 0.84 * along)) ** 0.6
        th = T * (0.35 + 0.65 * arc) * (0.85 + 0.3 * rn(x, z)) + 0.004 * crumbly * rn(z, x)
        v.co.z = T - th
        v.co.x *= 0.9 - 0.06 * ragged * rn(x, z)
        v.co.y *= 0.95
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # top surface: mown turf undulates a little
    for f in top:
        for v in f.verts:
            if abs(v.co.z - T) < 1e-6:
                v.co.z = T + 0.0012 * math.sin(v.co.x * 160 + seed) * math.sin(v.co.y * 140)
    # colours: top thatch, then soil getting sandier down; flecks
    for v in bm.verts:
        d = (T - v.co.z) / max(T, 1e-4)
        c = THATCH * (1 - smooth(0.0, 0.25, d)) + SOIL * smooth(0.0, 0.25, d)
        c = c * (1 - 0.35 * d) + SAND * 0.35 * d
        c = c * (0.8 + 0.4 * r.random())
        v[col] = (*c, 1)
    # blades on top: short cut leaves, standing, leaning a little every way
    tops = [f for f in bm.faces if f.normal.z > 0.6]
    for k in range(int(blades * 2.4)):
        f = tops[int(r.random() * len(tops))]
        vs = [v.co for v in f.verts]
        a, b = r.random(), r.random()
        if a + b > 1: a, b = 1 - a, 1 - b
        p = vs[0] + (vs[1] - vs[0]) * a + (vs[3 if len(vs) > 3 else 2] - vs[0]) * b
        Lb = 0.008 + r.random() * 0.007
        ang = r.random() * 2 * math.pi; lean = 0.25 + r.random() * 0.5
        dx, dz = math.cos(ang), math.sin(ang)
        w = 0.0007
        tip = Vector((p.x + dx * Lb * lean, p.y + dz * Lb * lean, p.z + Lb))
        side = Vector((-dz, dx, 0)) * w / 2
        q = [bm.verts.new(p - side), bm.verts.new(p + side), bm.verts.new(tip + side * 0.2), bm.verts.new(tip - side * 0.2)]
        tone = 0.75 + r.random() * 0.6
        for i, v in enumerate(q):
            g = GRASS * tone * (0.6 if i < 2 else 1.25)
            v[col] = (*g, 1)
        bm.faces.new(q)
    # roots: fine, wavy, soil-stained threads out of the underside
    bots = [f for f in bm.faces if f.normal.z < -0.5]
    for k in range(int(30 + 30 * ragged)):
        f = bots[int(r.random() * len(bots))]
        p = f.calc_center_median()
        Lr = 0.003 + r.random() * 0.009
        dx, dz = r.normal(0, 0.6), r.normal(0, 0.6)
        mid = Vector((p.x + dx * Lr * 0.4 + r.normal(0, 0.001), p.y + dz * Lr * 0.4, p.z - Lr * 0.5))
        end = Vector((p.x + dx * Lr, p.y + dz * Lr, p.z - Lr * (0.6 + 0.4 * r.random())))
        w = 0.00025
        a0, a1 = bm.verts.new(p + Vector((w, 0, 0))), bm.verts.new(p - Vector((w, 0, 0)))
        b0, b1 = bm.verts.new(mid + Vector((w * 0.7, 0, 0))), bm.verts.new(mid - Vector((w * 0.7, 0, 0)))
        e = bm.verts.new(end)
        for v in (a0, a1, b0, b1, e): v[col] = (0.16, 0.12, 0.075, 1)
        bm.faces.new((a0, a1, b1, b0)); bm.faces.new((b0, b1, e))
    # curl: the strip rolls over toward its far end, the grass outside
    if curl:
        # the far end, cut thinnest, rolls up and back over the grass as it flies
        R = 1.0 / curl
        y0 = L * 0.1
        for v in bm.verts:
            if v.co.y <= y0: continue
            ang = (v.co.y - y0) / R
            h = v.co.z
            v.co.y = y0 + (R - h) * math.sin(ang)
            v.co.z = R - (R - h) * math.cos(ang)
    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    # origin under the middle, sitting on z = 0
    zs = [v.co.z for v in me.vertices]
    for v in me.vertices: v.co.z -= min(zs)
    ob.data.materials.append(MAT)
    return ob


def build_chunks():
    global MAT
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MAT = bpy.data.materials.new('turf')
    MAT.use_nodes = True
    nt = MAT.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'Col'
    nt.links.new(a.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.9
    MAT.use_backface_culling = False
    chunk('divot_strip', 0.15, 0.042, 0.007, 1, ragged=0.8, blades=600)
    chunk('divot_dollar', 0.12, 0.058, 0.013, 2, blades=700)
    chunk('divot_chunk', 0.13, 0.075, 0.026, 3, ragged=1.6, blades=800, crumbly=1.0)
    chunk('divot_short', 0.075, 0.05, 0.012, 4, ragged=1.2, blades=420)
    chunk('divot_curl', 0.17, 0.048, 0.009, 5, curl=40.0, blades=650)
    chunk('divot_broken_a', 0.12, 0.06, 0.012, 6, tear=0.005, ragged=1.4, blades=380)
    chunk('divot_broken_b', 0.12, 0.06, 0.012, 6, tear=0.005, ragged=1.4, blades=380)
    path = os.path.join(ROOT, 'assets/models/divots.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=True,
                              export_vertex_color='MATERIAL', use_selection=False)
    for o in bpy.context.scene.objects:
        print('node', o.name, len(o.data.vertices), 'verts', len(o.data.polygons), 'faces')


# ── scars ────────────────────────────────────────────────────────────────────
SL, SW = 0.4, 0.2           # the decal's footprint: long along the swing
RX, RY = 512, 1024


def scar_height(X, Y, kind, seed):
    """Turf height (m) round the scar; the club travelled toward +y."""
    spec = {'scrape': (0.10, 0.042, 0.0016), 'clean': (0.12, 0.05, 0.010), 'deep': (0.14, 0.07, 0.024), 'long': (0.17, 0.042, 0.007)}[kind]
    Lh, Wh, D = spec[0] / 2, spec[1] / 2, spec[2]
    y0 = 0.0
    t = (Y - y0) / Lh                                        # -1 entry .. 1 exit
    wob = (fbm(X.shape, (10, 30), seed, 4) - 0.5)
    tornx = (fbm(X.shape, (40, 90), seed + 1, 3) - 0.5)
    half = Wh * (1 - 0.18 * np.clip(-t, 0, 1)) * (1 + 0.4 * wob + 0.12 * tornx)
    lat = np.abs(X) / np.maximum(half, 1e-4)
    endk = np.clip(1 - np.abs(t) ** 3, 0, 1)
    prof = np.sin(np.clip((t + 1) / 2, 0, 1) * math.pi) ** 0.55
    inside = smooth(1.04, 0.94, lat) * smooth(1.04 + 0.1 * tornx, 0.94, np.abs(t))
    floor = -D * prof * inside * (0.85 + 0.3 * fbm(X.shape, (20, 40), seed + 3, 3))
    # the torn turf rim, a little raised on the sides and lifted at the exit where the chunk tore free
    rim = 0.0012 * np.exp(-((lat - 1.0) / 0.12) ** 2) * smooth(1.3, 0.8, np.abs(t))
    rim += 0.0018 * np.exp(-((t - 1.02) / 0.06) ** 2) * smooth(1.2, 0.6, lat)
    # scrape lines along the swing on the floor
    # the sole's scrape on the floor: streaks along the swing, broken up by the soil
    lines = 0.0012 * (fbm(X.shape, (90, 5), seed + 5, 2) - 0.5) * inside
    return floor + rim + lines, inside, D


def build_scars():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
    sc.render.resolution_x, sc.render.resolution_y = RX, RY
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_depth = '16'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = SL
    cam.location = (0, 0, 0.5)
    sc.collection.objects.link(cam); sc.camera = cam
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes['Background']

    def emis_mat(name, build):
        m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
        for n in list(nt.nodes): nt.nodes.remove(n)
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        build(nt, out)
        return m

    def mat_turf():
        def b(nt, out):
            noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 900; noise.inputs['Detail'].default_value = 8
            ramp = nt.nodes.new('ShaderNodeValToRGB')
            ramp.color_ramp.elements[0].color = (0.05, 0.13, 0.025, 1); ramp.color_ramp.elements[1].color = (0.12, 0.27, 0.06, 1)
            nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
            attr = nt.nodes.new('ShaderNodeAttribute'); attr.attribute_name = 'Col'
            sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(attr.outputs['Color'], sep.inputs['Color'])
            sn = nt.nodes.new('ShaderNodeTexNoise'); sn.inputs['Scale'].default_value = 1800; sn.inputs['Detail'].default_value = 10
            sr = nt.nodes.new('ShaderNodeValToRGB')
            sr.color_ramp.elements[0].color = (0.14, 0.1, 0.06, 1); sr.color_ramp.elements[1].color = (0.4, 0.31, 0.2, 1)
            nt.links.new(sn.outputs['Fac'], sr.inputs['Fac'])
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
            nt.links.new(sep.outputs['Red'], mix.inputs['Factor'])
            nt.links.new(ramp.outputs['Color'], mix.inputs[6]); nt.links.new(sr.outputs['Color'], mix.inputs[7])
            # bruised grass (green channel of Col): flattened, paler and yellower
            mix2 = nt.nodes.new('ShaderNodeMix'); mix2.data_type = 'RGBA'
            nt.links.new(sep.outputs['Green'], mix2.inputs['Factor'])
            nt.links.new(mix.outputs[2], mix2.inputs[6]); mix2.inputs[7].default_value = (0.2, 0.26, 0.08, 1)
            dif = nt.nodes.new('ShaderNodeBsdfDiffuse'); nt.links.new(mix2.outputs[2], dif.inputs['Color'])
            nt.links.new(dif.outputs['BSDF'], out.inputs['Surface'])
        return emis_mat('turf', b)

    def mat_flat(rgb):
        def b(nt, out):
            dif = nt.nodes.new('ShaderNodeBsdfDiffuse'); dif.inputs['Color'].default_value = (*rgb, 1)
            nt.links.new(dif.outputs['BSDF'], out.inputs['Surface'])
        return emis_mat('flat', b)

    def mat_normal():
        def b(nt, out):
            em = nt.nodes.new('ShaderNodeEmission'); geo = nt.nodes.new('ShaderNodeNewGeometry')
            vm = nt.nodes.new('ShaderNodeVectorMath'); vm.operation = 'MULTIPLY_ADD'
            vm.inputs[1].default_value = (0.5, 0.5, 0.5); vm.inputs[2].default_value = (0.5, 0.5, 0.5)
            nt.links.new(geo.outputs['Normal'], vm.inputs[0]); nt.links.new(vm.outputs['Vector'], em.inputs['Color'])
            nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
        return emis_mat('nrm', b)

    def mat_mask(attr_name=None):
        def b(nt, out):
            em = nt.nodes.new('ShaderNodeEmission')
            if attr_name:
                at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = attr_name
                sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(at.outputs['Color'], sep.inputs['Color'])
                nt.links.new(sep.outputs['Blue'], em.inputs['Color'])
            else:
                em.inputs['Color'].default_value = (1, 1, 1, 1)
            nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
        return emis_mat('mask', b)

    for si, kind in enumerate(['scrape', 'clean', 'deep', 'long']):
        for o in list(sc.objects):
            if o.type == 'MESH': bpy.data.objects.remove(o)
        NX, NY = 200, 400
        xs = np.linspace(-SW / 2, SW / 2, NX); ys = np.linspace(-SL / 2, SL / 2, NY)
        X, Y = np.meshgrid(xs, ys)
        Hh, inside, D = scar_height(X, Y, kind, 40 + si)
        soil = np.clip((-Hh - 0.0008) / 0.0012, 0, 1)
        if kind == 'scrape':
            soil = soil * (0.4 + 0.6 * fbm(X.shape, (10, 30), 90, 3))
        # bruise: grass flattened and torn round the scar and in a scrape
        LH = {'scrape': 0.05, 'clean': 0.06, 'deep': 0.07, 'long': 0.085}[kind]
        edge = np.abs(np.abs(X) - {'scrape': 0.021, 'clean': 0.025, 'deep': 0.035, 'long': 0.021}[kind])
        bruise = np.clip(inside * (1.0 if kind == 'scrape' else 0.0) + 0.7 * np.exp(-(edge / 0.006) ** 2) * smooth(LH + 0.012, LH - 0.012, np.abs(Y)), 0, 1) * (1 - soil)
        mask = np.clip(np.maximum.reduce([np.abs(Hh) / 0.0006, soil, bruise * 1.2]), 0, 1)
        bm = bmesh.new()
        cl = bm.verts.layers.float_color.new('Col')
        vs = [[bm.verts.new((X[j, i], Y[j, i], Hh[j, i])) for i in range(NX)] for j in range(NY)]
        for j in range(NY - 1):
            for i in range(NX - 1):
                bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
        for j in range(NY):
            for i in range(NX):
                vs[j][i][cl] = (soil[j, i], bruise[j, i], mask[j, i], 1)
        me = bpy.data.meshes.new('turf'); bm.to_mesh(me); bm.free()
        turf = bpy.data.objects.new('turf', me); sc.collection.objects.link(turf)
        # crumbs of soil and torn blades, thrown forward and out the sides from the exit
        bm = bmesh.new()
        r = np.random.default_rng(70 + si)
        ncr = {'scrape': 25, 'clean': 90, 'deep': 200, 'long': 110}[kind]
        Lh = {'scrape': 0.05, 'clean': 0.06, 'deep': 0.07, 'long': 0.085}[kind]
        crumbs = []
        for k in range(ncr):
            y = Lh * (0.6 + r.random() * 1.1); x = r.normal(0, 0.03 + 0.02 * (y - Lh) / Lh)
            if abs(x) > SW * 0.45 or y > SL * 0.47: continue
            s = 0.0008 + r.random() ** 3 * (0.006 if kind == 'deep' else 0.003)
            res = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=s)
            for v in res['verts']:
                v.co = v.co * (0.7 + 0.6 * r.random())
                v.co.x += x; v.co.y += y; v.co.z += s * 0.4
            crumbs += res['verts']
        cme = bpy.data.meshes.new('crumbs'); bm.to_mesh(cme); bm.free()
        cr = bpy.data.objects.new('crumbs', cme); sc.collection.objects.link(cr)
        bm = bmesh.new()
        for k in range(ncr):
            y = Lh * (0.3 + r.random() * 1.2); x = r.normal(0, 0.03)
            if abs(x) > SW * 0.45 or y > SL * 0.47: continue
            Lb = 0.006 + r.random() * 0.01; ang = r.random() * math.pi * 2
            p = Vector((x, y, 0.001)); d = Vector((math.cos(ang), math.sin(ang), 0)) * Lb; sd = Vector((-d.y, d.x, 0)).normalized() * 0.0004
            q = [bm.verts.new(p - sd), bm.verts.new(p + sd), bm.verts.new(p + d + sd), bm.verts.new(p + d - sd)]
            bm.faces.new(q)
        bme = bpy.data.meshes.new('bits'); bm.to_mesh(bme); bm.free()
        bits = bpy.data.objects.new('bits', bme); sc.collection.objects.link(bits)

        tag = f'scar_{kind}'
        # 1. colour, under an even sky
        bg.inputs['Color'].default_value = (1, 1, 1, 1); bg.inputs['Strength'].default_value = 1.0
        sc.cycles.samples = 96
        turf.data.materials.append(mat_turf()); cr.data.materials.append(mat_flat((0.2, 0.14, 0.08))); bits.data.materials.append(mat_flat((0.09, 0.18, 0.04)))
        sc.render.filepath = f'/tmp/fw_{tag}_col.png'; bpy.ops.render.render(write_still=True)
        # 2. normals
        nm = mat_normal()
        for o in (turf, cr, bits): o.data.materials.clear(); o.data.materials.append(nm)
        bg.inputs['Strength'].default_value = 0.0; sc.cycles.samples = 8
        sc.render.filepath = f'/tmp/fw_{tag}_nor.png'; bpy.ops.render.render(write_still=True)
        # 3. coverage: the disturbed turf, the crumbs and the bits
        turf.data.materials.clear(); turf.data.materials.append(mat_mask('Col'))
        for o in (cr, bits): o.data.materials.clear(); o.data.materials.append(mat_mask())
        sc.render.filepath = f'/tmp/fw_{tag}_mask.png'; bpy.ops.render.render(write_still=True)

        def px(p, srgb=True):
            im = bpy.data.images.load(p)
            if not srgb: im.colorspace_settings.name = 'Non-Color'
            return np.array(im.pixels[:]).reshape(RY, RX, 4)[::-1, :, :3]
        c = px(f'/tmp/fw_{tag}_col.png'); n = px(f'/tmp/fw_{tag}_nor.png', False); m = px(f'/tmp/fw_{tag}_mask.png', False)[..., 0]
        # soften the coverage's edge into the undisturbed turf, and keep clear of the image border
        yy, xx = np.meshgrid(np.linspace(-1, 1, RY), np.linspace(-1, 1, RX), indexing='ij')
        border = smooth(1.0, 0.85, np.abs(xx)) * smooth(1.0, 0.9, np.abs(yy))
        a = np.clip(m * 1.15, 0, 1) * border
        for arr, suffix, alpha in ((c, '', a), (n, '_nor', None)):
            img = bpy.data.images.new(tag + suffix, RX, RY, alpha=alpha is not None)
            img.colorspace_settings.name = 'sRGB'
            al = np.ones((RY, RX)) if alpha is None else alpha
            img.pixels.foreach_set(np.dstack([arr, al])[::-1].astype(np.float32).ravel())
            out = os.path.join(ROOT, f'assets/textures/{tag}{suffix}.png')
            img.filepath_raw = out; img.file_format = 'PNG'; img.save()
        # the undisturbed turf in this render (for the game's exposure match)
        print('wrote', tag, 'turf', c[:40, :40].reshape(-1, 3).mean(0).round(4).tolist())


if 'chunks' in WHAT: build_chunks()
if 'scars' in WHAT: build_scars()
