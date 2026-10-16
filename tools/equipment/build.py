# Build the high-poly heads for Blender to bake:
#   python build.py <outdir> [set ...] [--clubs DR,7I]
# writes <outdir>/<set>/<club>.npz/.json plus stamp images.
import os
import sys
from sets import SETS, SPEC, make_head, finish
from stamp_layout import stamps_for
from mesh_head import write_head

args = sys.argv[1:]
clubs = None
if '--clubs' in args:
    i = args.index('--clubs')
    clubs = args[i + 1].split(',')
    del args[i:i + 2]
out = args[0]
sets = args[1:] or list(SETS) + ['hockey']
if 'balls' in sets:
    import json
    import numpy as np
    from balls import BALLS, ball, ball_stamps
    d = os.path.join(out, 'balls')
    os.makedirs(d, exist_ok=True)
    for bid in (clubs or BALLS):
        v, f, n, col, rough, metal, count = ball(bid)
        base = os.path.join(d, bid)
        np.savez_compressed(base + '.npz', v=v, f=f, n=n, r=np.zeros(len(v), np.int16), col=col.astype(np.float32),
                            rough=rough.astype(np.float32), metal=metal.astype(np.float32))
        meta = dict(id=bid, family='ball', dimples=count, coat=BALLS[bid]['coat'], layout=BALLS[bid]['layout'],
                    stamps=ball_stamps(bid, base))
        json.dump(meta, open(base + '.json', 'w'), indent=1)
        print(bid, count, 'dimples', len(f), 'tris', flush=True)
    sets = [s for s in sets if s != 'balls']
for sid in sets:
    d = os.path.join(out, sid)
    os.makedirs(d, exist_ok=True)
    ids = ['HOCKEY'] if sid == 'hockey' else (clubs or list(SPEC))
    for cid in ids:
        head = make_head(sid, cid)
        base = os.path.join(d, cid)
        write_head(head, base, finish=lambda h, v, n, r: finish(sid, h, v, n, r),
                   stamps=lambda h: stamps_for(sid, cid, h, base))
