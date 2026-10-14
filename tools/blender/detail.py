# Headless Blender: a Poly Haven diffuse map -> a tileable luminance detail map
# with mean ~0.85 and limited contrast, for multiplying over vertex colours.
#   blender -b --factory-startup --python detail.py -- <in.jpg> <out.jpg> <size> <contrast>
import bpy, sys
src, out, size, contrast = sys.argv[sys.argv.index('--') + 1:]
size, contrast = int(size), float(contrast)
img = bpy.data.images.load(src)
img.scale(size, size)
px = list(img.pixels)
lum = [0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2] for i in range(0, len(px), 4)]
mean = sum(lum) / len(lum)
var = sum((l - mean) ** 2 for l in lum) / len(lum)
sd = var ** 0.5 or 1
outpx = []
for l in lum:
    v = 0.85 + (l - mean) / sd * 0.09 * contrast
    v = max(0.55, min(1.0, v))
    outpx += [v, v, v, 1.0]
o = bpy.data.images.new('d', size, size)
o.pixels = outpx
o.filepath_raw = out
o.file_format = 'JPEG'
bpy.context.scene.render.image_settings.quality = 88
o.save()
print('mean', round(mean, 3), 'sd', round(sd, 3), 'wrote', out)
