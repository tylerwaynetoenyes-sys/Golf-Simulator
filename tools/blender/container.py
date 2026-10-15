# Headless Blender: Poly Haven's container_side scan -> the two maps the East
# St. Louis shipping containers use (js/course/decay.js).
#   blender -b --factory-startup --python container.py -- <diff.jpg> <nor_gl.jpg> <out_dir> <size>
# container_side.jpg: R = paint luminance (mean ~0.85, the corrugation's
#   shading and grime; the paint colour comes from the material), G = a
#   tileable rust mask (blotches with streaks running down the ribs).
# container_side_nor.jpg: the OpenGL normal map, resized.
import bpy, sys
import numpy as np

diff, nor, out_dir, size = sys.argv[sys.argv.index('--') + 1:]
size = int(size)


def load(path):
    img = bpy.data.images.load(path)
    img.scale(size, size)
    return np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)


def save(px, path):
    o = bpy.data.images.new('o', size, size)
    o.pixels = px.reshape(-1).tolist()
    o.filepath_raw = path
    o.file_format = 'JPEG'
    bpy.context.scene.render.image_settings.quality = 90
    o.save()


d = load(diff)
lum = 0.2126 * d[..., 0] + 0.7152 * d[..., 1] + 0.0722 * d[..., 2]
lum = np.clip(0.85 + (lum - lum.mean()) / (lum.std() or 1) * 0.08, 0.5, 1.0)


def tile_noise(cu, cv, seed):
    """Tileable value noise, cu x cv lattice cells (u across, v down the image), wrapped round both edges."""
    rng = np.random.default_rng(seed)
    g = rng.random((cv, cu))

    def axis(cells):
        t = np.arange(size) * cells / size
        i0 = np.floor(t).astype(int) % cells
        f = t - np.floor(t)
        return i0, (i0 + 1) % cells, f * f * (3 - 2 * f)

    u0, u1, fu = axis(cu)
    v0, v1, fv = axis(cv)
    r0 = g[v0][:, u0] * (1 - fu) + g[v0][:, u1] * fu
    r1 = g[v1][:, u0] * (1 - fu) + g[v1][:, u1] * fu
    return r0 * (1 - fv)[:, None] + r1 * fv[:, None]


# blotches at a few scales, plus streaks: noise fine across the ribs, long down them
blot = 0.55 * tile_noise(4, 4, 1) + 0.3 * tile_noise(9, 9, 2) + 0.15 * tile_noise(23, 23, 3)
streak = 0.7 * tile_noise(56, 5, 4) + 0.3 * tile_noise(90, 12, 5)
mask = np.clip((blot - 0.52) * 3.2, 0, 1) * 0.75 + np.clip((streak - 0.6) * 2.5, 0, 1) * 0.45
mask = np.clip(mask, 0, 1)

out = np.ones((size, size, 4), dtype=np.float32)
out[..., 0] = lum
out[..., 1] = mask
out[..., 2] = lum
save(out, f'{out_dir}/container_side.jpg')
save(load(nor), f'{out_dir}/container_side_nor.jpg')
print('lum mean', round(float(lum.mean()), 3), 'rust mean', round(float(mask.mean()), 3))
