// Hole intro camera paths (broadcast drone style, as in GSPro / Trackman).
// While the hole card is up the camera holds a slow establishing drift behind
// the tee; once the card is gone it circles the whole hole and the land
// around it (landmark side first), then spirals in and down onto the address
// view. Every key is lifted clear of the ground and of trees, with a clear
// line of sight to what it looks at, and the lift is spread smoothly along
// the path so the camera never bobs over a bump.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * @param T hole terrain (pts, pointAt, length, green)
 * @param ground (x, z) => y
 * @param rig the CameraRig (for _blocked and the canopy test)
 * @param address {pos, look} the address view the intro ends on
 * @param landmark optional {x, z}: the orbit sweeps that side first
 * @returns {{ establish: {pos, look}[], orbit: {pos, look}[] }}
 */
export function holeIntroPath(T, ground, rig, address, landmark = null) {
  // the hole as a cloud of points along its line
  const pts = [];
  for (let s = 0; s <= T.length; s += 8) pts.push(T.pointAt(s));
  pts.push({ x: T.green.x, z: T.green.z });
  let cx = 0, cz = 0;
  for (const p of pts) { cx += p.x; cz += p.z; }
  cx /= pts.length; cz /= pts.length;
  let ext = 0;
  for (const p of pts) ext = Math.max(ext, Math.hypot(p.x - cx, p.z - cz));
  ext = Math.max(ext, 45);
  const tee = T.pts[0];
  const cy = ground(cx, cz);
  // far enough out to frame tee to green at once, high enough to see over the
  // trees into the fairway, low enough to keep the skyline in frame (~18° down)
  const R = THREE.MathUtils.clamp(ext * 1.2 + 30, 110, 400);
  const H = Math.max(40, R * 0.32);
  const C = V(cx, cy + 2, cz);

  // circle the landmark side first
  const back = Math.atan2(tee.z - cz, tee.x - cx);
  // (+1 swings the camera toward (-sin, cos) of where it starts)
  const side = landmark && -Math.sin(back) * (landmark.x - cx) + Math.cos(back) * (landmark.z - cz) < 0 ? -1 : 1;
  // end straight behind the ball, a little high, so the drop to address is short
  const aPos = address.pos, aLook = address.look;
  const endAng = Math.atan2(aPos.z - tee.z, aPos.x - tee.x);
  const total = side * Math.PI * 2 + wrap(endAng - back);

  // a pose on the orbit: centre slides from the hole's middle to the tee as it spirals in
  const pose = (ang, k, r = R, h = H) => {
    const ox = THREE.MathUtils.lerp(cx, tee.x, k), oz = THREE.MathUtils.lerp(cz, tee.z, k);
    const rr = THREE.MathUtils.lerp(r, 38, k), hh = THREE.MathUtils.lerp(h, 16, k);
    const x = ox + Math.cos(ang) * rr, z = oz + Math.sin(ang) * rr;
    const base = THREE.MathUtils.lerp(cy, ground(tee.x, tee.z), k);
    const look = C.clone().lerp(aLook, smooth(0.15, 1, k));
    return { pos: V(x, base + hh, z), look };
  };

  // establishing: under the card, low and close behind the tee, craning up
  // to the orbit's start
  const establish = [
    pose(back - side * 0.22, 0, R * 0.82, H * 0.72),
    pose(back - side * 0.11, 0, R * 0.91, H * 0.86),
    pose(back, 0, R, H),
  ];

  // the orbit itself: a key every ~12°, the last ~40% spiralling in
  const n = Math.max(12, Math.ceil(Math.abs(total) / 0.21));
  const orbit = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    orbit.push(pose(back + total * u, smooth(0.58, 1, u)));
  }
  orbit.push({ pos: aPos.clone(), look: aLook.clone() });

  clearPath(establish, ground, rig, null, 0);
  clearPath(orbit, ground, rig, orbit.length - 1, 4);
  // the orbit starts exactly where the establishing shot stops
  orbit[0].pos.copy(establish[establish.length - 1].pos);
  return { establish, orbit };
}

/**
 * Lift each key until it clears the ground (with margin over the highest
 * point around it), the trees, and the line of sight to its look point; then
 * spread every lift along the path with a slope limit so it's smooth.
 */
function clearPath(keys, ground, rig, fixed, lowTail) {
  const need = keys.map((k, i) => {
    if (i === fixed) return k.pos.y;
    const p = k.pos;
    let hi = ground(p.x, p.z);
    for (let a = 0; a < 6; a++) {
      const r = 14;
      hi = Math.max(hi, ground(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r));
    }
    // close to the ground (the spiral's end) clear the land around by 4 m,
    // high up keep at least 20 m over it
    const near = keys.length - 1 - i < lowTail ? 4 : 20;
    let y = Math.max(p.y, hi + near);
    const q = V(p.x, y, p.z);
    for (let t = 0; t < 30; t++) {
      q.y = y;
      const blocked = rig._blocked(q, k.look.x, k.look.y, k.look.z, 4, false)
        || (rig.canopy && rig.canopy(q.x, q.y, q.z));
      if (!blocked) break;
      y += 3;
    }
    return y;
  });
  // slope-limited envelope of the lifts: each one is spread over the keys
  // around it (1 m of lift for every ~3 m of path either side)
  const lift = need.map((y, i) => y - keys[i].pos.y);
  const out = keys.map((k) => k.pos.y);
  for (let i = 0; i < keys.length; i++) {
    if (i === fixed) continue;
    let l = lift[i];
    for (let j = 0; j < keys.length; j++) {
      if (j !== i && lift[j] > 0) l = Math.max(l, lift[j] - keys[i].pos.distanceTo(keys[j].pos) * 0.3);
    }
    out[i] += l;
  }
  keys.forEach((k, i) => { k.pos.y = out[i]; });
}
