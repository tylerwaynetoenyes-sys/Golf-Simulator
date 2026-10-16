# Mesh one head's field and write it for Blender: <out>.npz holds the
# high-poly vertices (mm, address frame), faces, normals, region ids and the
# finish (linear base colour, roughness, metalness); <out>.json the head's
# metadata and its stamps.
import json
import time
import numpy as np
from sdf import mesh_sdf, field_normals, volume_cc


def write_head(head, out, h=None, finish=None, stamps=None):
    t = time.time()
    v, f, n = mesh_sdf(head.field, head.lo, head.hi, h or head.h)
    n = field_normals(head.field, v)
    reg = head.classify(v, n).astype(np.int16)
    data = dict(v=v, f=f, n=n.astype(np.float32), r=reg)
    if finish:
        col, rough, metal = finish(head, v, n, reg)
        data.update(col=col.astype(np.float32), rough=rough.astype(np.float32), metal=metal.astype(np.float32))
    np.savez_compressed(out + '.npz', **data)
    meta = dict(head.meta)
    meta['volume_cc'] = round(float(volume_cc(v, f)), 1)
    meta['tris'] = int(len(f))
    meta['stamps'] = stamps(head) if stamps else []
    with open(out + '.json', 'w') as fh:
        json.dump(meta, fh, indent=1, default=float)
    print(f"{meta['id']}: {len(f)} tris, {meta['volume_cc']} cc, {time.time() - t:.1f}s", flush=True)
    return meta
