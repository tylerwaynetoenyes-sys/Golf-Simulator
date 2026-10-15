// Course design pass for the made-up courses (never the real imports): adds
// the features golfers look for where a hole is thin on them, following the
// usual rules of the trade, and leaves anything the hole already has alone.
//   - fairway bunkers where the drive lands (about 235–275 yd), alternating
//     sides from hole to hole, and a second set at the lay-up on par 5s
//   - greenside bunkers so no green sits naked: front-left, back-right
//   - mounding and hollows in the rough, so no hole plays dead flat
//   - a pond short and to one side on some par 3s
//   - optional elevation exaggeration (elevScale) for flat ground
// Positions use the hole's own frame: t along the centre line (0 tee, 1 green),
// off in metres right (+) or left (−) of it.
const YD = 0.9144;

function seeded(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function enrichHole(hole) {
  const rand = seeded(hole.n * 7919 + 17);
  let L = 0;
  for (let i = 0; i < hole.line.length - 1; i++) {
    const [ax, az] = hole.line[i], [bx, bz] = hole.line[i + 1];
    L += Math.hypot(bx - ax, bz - az);
  }
  L *= YD; // metres
  const fwHalf = (hole.fw || 0) / 2;
  const gr = hole.green.r;
  const bunkers = [...(hole.bunkers || [])];
  const water = [...(hole.water || [])];
  const mounds = [...(hole.mounds || [])];
  const feats = () => [...bunkers, ...water].filter((f) => f.t != null);
  // is a new feature at (t, off) clear of what's there? (metres)
  const clear = (t, off, r) => feats().every((f) => Math.hypot((f.t - t) * L, (f.off || 0) - off) > r + Math.max(f.rx || 6, f.rz || 6));
  const add = (list, f, r) => { if (clear(f.t, f.off, r)) { list.push(f); return true; } return false; };
  const side = hole.n % 2 ? 1 : -1;

  if (hole.par >= 4 && fwHalf > 0) {
    // the drive: one bunker in the landing zone, its partner a little further on the other side
    const tA = Math.min(0.78, (245 * YD) / L), tB = Math.min(0.82, (272 * YD) / L);
    add(bunkers, { t: +tA.toFixed(3), off: side * (fwHalf + 4), rx: 11, rz: 6 }, 8);
    add(bunkers, { t: +tB.toFixed(3), off: -side * (fwHalf + 5), rx: 9, rz: 5 }, 8);
    if (hole.par === 5) {
      // the lay-up, ~100 yd out: a cross bunker or a pair to pinch it
      const tC = Math.max(0.5, 1 - (105 * YD) / L);
      add(bunkers, { t: +tC.toFixed(3), off: -side * (fwHalf * 0.4), rx: 10, rz: 4 }, 10);
      add(bunkers, { t: +(tC + 0.03).toFixed(3), off: side * (fwHalf + 3), rx: 8, rz: 5 }, 8);
    }
  }
  // greenside: front-left and back-right, unless there are already two near the green
  const nearGreen = bunkers.filter((b) => b.t != null && b.t > 0.88).length + water.filter((w) => w.t != null && w.t > 0.85).length;
  if (nearGreen < 2) {
    add(bunkers, { t: +(1 - (gr + 4) / L).toFixed(3), off: -(gr * 0.55), rx: 7, rz: 4.5 }, 3);
    add(bunkers, { t: +(1 + (gr * 0.5) / L).toFixed(3), off: gr + 4, rx: 6.5, rz: 4.5 }, 3);
  }
  // a pond on some par 3s, short and to the side of the line
  if (hole.par === 3 && !water.length && hole.n % 3 === 0) {
    add(water, { t: 0.62, off: -side * (gr * 0.6 + 6), rx: 13, rz: 18, level: -1 }, 6);
  }
  // shaping: mounds along the rough and a hollow or two short of the green
  if (mounds.length < 3) {
    for (let k = 0; k < 4; k++) {
      const t = 0.2 + rand() * 0.65, sd = rand() < 0.5 ? -1 : 1;
      const off = sd * (Math.max(fwHalf, 12) + 14 + rand() * 18);
      if (clear(t, off, 12)) mounds.push({ t: +t.toFixed(3), off: Math.round(off), r: 12 + Math.round(rand() * 8), h: +(1.4 + rand() * 1.8).toFixed(1) });
    }
    const th = 1 - (gr + 16) / L;
    if (clear(th, side * 10, 6)) mounds.push({ t: +th.toFixed(3), off: side * 10, r: 9, h: -1.1 });
  }
  const out = { ...hole, bunkers, water, mounds };
  if (hole.elevScale && hole.elev) out.elev = hole.elev.map(([t, h]) => [t, h * hole.elevScale]);
  return out;
}
