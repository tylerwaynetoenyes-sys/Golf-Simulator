// Analytic terrain for one hole: elevation, fairway, green, bunkers, water and
// out-of-bounds, all derived from the hole's centre line. The same functions
// feed the physics (`terrain`) and the mesh builder (`meshHeight`), so what
// you see is what the ball plays on.
import { YD } from '../core/physics.js';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function h21(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = h21(ix, iz), b = h21(ix + 1, iz), c = h21(ix, iz + 1), d = h21(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export class HoleTerrain {
  constructor(hole) {
    this.hole = hole;
    this.pts = hole.line.map(([x, z]) => ({ x: x * YD, z: z * YD }));
    this.segs = [];
    let s = 0;
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = this.pts[i], b = this.pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      this.segs.push({ a, b, len, s0: s, dx: (b.x - a.x) / len, dz: (b.z - a.z) / len });
      s += len;
    }
    this.length = s;
    this.green = { ...this.pts[this.pts.length - 1] };
    const last = this.segs[this.segs.length - 1];
    this.finalDir = { x: last.dx, z: last.dz };
    this.finalRight = { x: -last.dz, z: last.dx };
    this.greenR = hole.green.r;
    this.slope = hole.green.slope;
    this.fwHalf = hole.fw / 2;
    this.fwStart = (hole.fwStart || 0) * YD;
    // real ground: heights from the course DEM, relative to the tee
    this.F = hole.demFrame || null;
    this.greenBase = this.elevAt(1) + (this.F ? 0.25 : 0.4);
    // Green contours: two soft swells/swales per green (deterministic per hole)
    // on top of the overall tilt, flattened around the pin like a real hole
    // location. Peak slopes stay around 2–3%.
    {
      const n = hole.n;
      const R = this.greenR;
      this.contours = [
        { x: Math.cos(n * 1.7) * R * 0.5, z: Math.sin(n * 2.3) * R * 0.5, a: (n % 2 ? 1 : -1) * 0.16, s: R * 0.42 },
        { x: Math.cos(n * 2.9 + 2) * R * 0.55, z: Math.sin(n * 1.3 + 1) * R * 0.55, a: (n % 3 ? -1 : 1) * 0.11, s: R * 0.32 },
      ];
    }
    this.pin = {
      x: this.green.x + this.finalRight.x * hole.pin[0] - this.finalDir.x * hole.pin[1],
      z: this.green.z + this.finalRight.z * hole.pin[0] - this.finalDir.z * hole.pin[1],
    };
    this.tee = { x: 0, z: 0 };
    this.teeHeight = this.elevAt(0) + 0.3;
    this.oobLateral = Math.max(this.fwHalf, 14) + 78;

    // Hazards in world coordinates
    const place = (t, off) => {
      const p = this.pointAt(t * this.length);
      return { x: p.x + p.rx * off, z: p.z + p.rz * off, dirx: p.dx, dirz: p.dz };
    };
    this.bunkers = (hole.bunkers || []).map((b) => ({ ...place(b.t, b.off), rx: b.rx, rz: b.rz }));
    // shaping: mounds (+) and hollows (−) as soft Gaussian landforms
    this.mounds = (hole.mounds || []).map((m) => ({ ...place(m.t, m.off), r: m.r, h: m.h }));
    this.ponds = [];
    this.creeks = [];
    for (const w of hole.water || []) {
      if (w.creek != null) {
        this.creeks.push({ s: w.creek * this.length, half: w.width / 2, level: this.elevAt(w.creek) - 1.2 });
      } else {
        const p = place(w.t, w.off);
        this.ponds.push({ ...p, rx: w.rx, rz: w.rz, level: this.elevAt(w.t) + (w.level ?? -1), off: w.level ?? -1, island: !!w.island });
      }
    }
    // shaped ground (side slopes, mounds) can dip below a pond's nominal
    // level: sit the water a little under the lowest point of its banks
    for (const p of this.ponds) {
      let lo = Infinity;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const ex = Math.cos(a) * p.rx * 1.05, ez = Math.sin(a) * p.rz * 1.05;
        const x = p.x + ex * -p.dirz + ez * p.dirx, z = p.z + ex * p.dirx + ez * p.dirz;
        if (p.island && Math.hypot(x - this.green.x, z - this.green.z) < this.greenR + 4) continue;
        lo = Math.min(lo, this._land(x, z, this.project(x, z)));
      }
      if (Number.isFinite(lo)) p.level = Math.min(p.level, lo + Math.min(-0.5, p.off));
    }
  }

  /** Point at arc length s along the centre line (extrapolates past the ends). */
  pointAt(s) {
    let seg = this.segs[0];
    for (const g of this.segs) { seg = g; if (s <= g.s0 + g.len) break; }
    const u = s - seg.s0;
    return { x: seg.a.x + seg.dx * u, z: seg.a.z + seg.dz * u, dx: seg.dx, dz: seg.dz, rx: -seg.dz, rz: seg.dx };
  }

  /** Project (x, z) onto the centre line: arc length s and signed lateral d (+ right). */
  project(x, z) {
    let best = null;
    for (let i = 0; i < this.segs.length; i++) {
      const g = this.segs[i];
      const px = x - g.a.x, pz = z - g.a.z;
      let u = px * g.dx + pz * g.dz;
      const first = i === 0, lastSeg = i === this.segs.length - 1;
      if (!first) u = Math.max(0, u);
      if (!lastSeg) u = Math.min(g.len, u);
      const cx = g.a.x + g.dx * u, cz = g.a.z + g.dz * u;
      const dist = Math.hypot(x - cx, z - cz);
      if (!best || dist < best.dist) {
        const d = (x - cx) * -g.dz + (z - cz) * g.dx;
        best = { s: g.s0 + u, d, dist };
      }
    }
    return best;
  }

  elevAt(t) {
    if (this.F) {
      const p = this.pointAt(Math.min(1, Math.max(0, t)) * this.length);
      return this.F.height(p.x, p.z);
    }
    const e = this.hole.elev;
    if (t <= e[0][0]) return e[0][1];
    for (let i = 0; i < e.length - 1; i++) {
      if (t <= e[i + 1][0]) {
        const k = (t - e[i][0]) / (e[i + 1][0] - e[i][0]);
        const kk = k * k * (3 - 2 * k);
        return e[i][1] + (e[i + 1][1] - e[i][1]) * kk;
      }
    }
    return e[e.length - 1][1];
  }

  /** Cross slope (camber) at t: rise per metre to the golfer's right. */
  tiltAt(t) {
    const e = this.hole.tilt;
    if (!e || !e.length) return 0;
    if (t <= e[0][0]) return e[0][1];
    for (let i = 0; i < e.length - 1; i++) {
      if (t <= e[i + 1][0]) {
        const k = (t - e[i][0]) / (e[i + 1][0] - e[i][0]);
        return e[i][1] + (e[i + 1][1] - e[i][1]) * k * k * (3 - 2 * k);
      }
    }
    return e[e.length - 1][1];
  }

  _ellipse(o, x, z) {
    const dx = x - o.x, dz = z - o.z;
    const along = dx * o.dirx + dz * o.dirz;
    const across = dx * -o.dirz + dz * o.dirx;
    return (across / o.rx) ** 2 + (along / o.rz) ** 2;
  }

  /** Ground shape without water (shared by physics and mesh). */
  /** The bare ground with no shaping (DEM courses only): what the backdrop meets. */
  baseGround(x, z) { return this.F ? this.F.height(x, z) : null; }

  _land(x, z, pr) {
    const t = Math.min(1.15, Math.max(-0.1, pr.s / this.length));
    const ad = Math.abs(pr.d);
    const corridor = Math.max(this.fwHalf, 12);
    let h;
    if (this.F) {
      // the real ground, plus a little mown-in roll on the corridor and
      // natural lumps in the rough (the DEM is ~8 m resolution)
      h = this.F.height(x, z);
      h += (vnoise(x * 0.03, z * 0.03) - 0.5) * 0.9 * smooth(corridor - 4, corridor + 20, ad);
      h += (vnoise(x * 0.09, z * 0.09) - 0.5) * 0.3;
    } else {
      h = this.elevAt(Math.min(1, Math.max(0, t)));
      // mounding and tree-line rise outside the corridor
      h += 1.8 * smooth(corridor + 4, corridor + 40, ad) + 2.5 * smooth(corridor + 40, corridor + 110, ad);
      h += (vnoise(x * 0.025, z * 0.025) - 0.5) * 1.6 * smooth(4, corridor + 10, ad);
      h += (vnoise(x * 0.09, z * 0.09) - 0.5) * 0.35;
    }
    // side slope across the hole (fairways that cant toward a hazard), eased
    // out well beyond the corridor
    const tilt = this.tiltAt(Math.min(1, Math.max(0, t)));
    if (tilt) {
      const lim = corridor + 70;
      const dd = Math.max(-lim, Math.min(lim, pr.d));
      h += tilt * dd;
    }
    // mounds and hollows
    for (const m of this.mounds) {
      const q = ((x - m.x) ** 2 + (z - m.z) ** 2) / (2 * m.r * m.r);
      if (q < 9) h += m.h * Math.exp(-q);
    }
    // tee box: flat pad
    const dt = Math.hypot(x - this.tee.x, z - this.tee.z);
    const teeW = smooth(7, 3, dt);
    h += (this.teeHeight - h) * teeW;
    // green: tilted plane, blended into surroundings
    const gdx = x - this.green.x, gdz = z - this.green.z;
    const gd = Math.hypot(gdx, gdz);
    const gw = smooth(this.greenR + 9, this.greenR, gd);
    if (gw > 0) {
      let gh = this.greenBase + this.slope[0] * gdx + this.slope[1] * gdz;
      if (this.contours && gd < this.greenR + 9) {
        const cf = (dx, dz) => { let c = 0; for (const k of this.contours) c += k.a * Math.exp(-((dx - k.x) ** 2 + (dz - k.z) ** 2) / (2 * k.s * k.s)); return c; };
        let c = cf(gdx, gdz);
        if (this.pin) {
          // ease the contour toward its value at the hole: the cup sits on a calmer spot
          const pdx = this.pin.x - this.green.x, pdz = this.pin.z - this.green.z;
          const c0 = this._cPin ?? (this._cPin = cf(pdx, pdz));
          const pd = Math.hypot(gdx - pdx, gdz - pdz);
          c = c0 + (c - c0) * (0.45 + 0.55 * smooth(0.5, 4, pd));
        }
        gh += c;
      }
      h += (gh - h) * gw;
    }
    // bunkers: shallow bowls with a lip
    // (greenside bunkers never deform the putting surface itself)
    const keepGreen = smooth(this.greenR + 0.2, this.greenR + 2.2, gd);
    for (const b of this.bunkers) {
      const q = this._ellipse(b, x, z);
      if (q < 1.6) h += (-0.75 * smooth(1.15, 0, q) + 0.25 * smooth(1.6, 1.05, q) * smooth(0.9, 1.05, q)) * keepGreen;
    }
    return h;
  }

  _water(x, z, pr) {
    for (const c of this.creeks) {
      const u = Math.abs(pr.s - c.s);
      if (u < c.half + 6) return { level: c.level, q: u / c.half, bank: c.half };
    }
    for (const p of this.ponds) {
      const q = this._ellipse(p, x, z);
      if (q < 1.5) {
        if (p.island && Math.hypot(x - this.green.x, z - this.green.z) < this.greenR + 4) continue;
        return { level: p.level, q: Math.sqrt(q) };
      }
    }
    return null;
  }

  /** Visual height (water areas dip into a bowl under the water plane). */
  meshHeight(x, z) {
    const pr = this.project(x, z);
    let h = this._land(x, z, pr);
    const w = this._water(x, z, pr);
    if (w) {
      const bowl = w.level - 1.4 * smooth(1.05, 0.4, w.q);
      const bank = smooth(1.45, 0.95, w.q);
      h = h + (Math.min(h, bowl) - h) * bank;
    }
    // far skirt drops gently to meet the course's base plane (real-ground
    // holes meet the backdrop terrain instead; see CourseWorld)
    if (!this.F) h -= 4 * smooth(this.oobLateral + 40, this.oobLateral + 160, Math.abs(pr.d));
    return h;
  }

  /** Physics terrain: {height, surface}. */
  terrain = (x, z) => {
    const pr = this.project(x, z);
    const w = this._water(x, z, pr);
    const land = this._land(x, z, pr);
    if (w && w.q < 1) return { height: w.level, surface: "water" };
    let surface;
    const ad = Math.abs(pr.d);
    if (ad > this.oobLateral || pr.s < -25 || pr.s > this.length + 75) surface = 'oob';
    else if (Math.hypot(x - this.green.x, z - this.green.z) < this.greenR) surface = 'green';
    else if (Math.hypot(x - this.green.x, z - this.green.z) < this.greenR + 1.8) surface = 'fringe';
    else if (Math.hypot(x - this.tee.x, z - this.tee.z) < 4.5) surface = 'tee';
    else if (this.bunkers.some((b) => this._ellipse(b, x, z) < 1)) surface = 'sand';
    else if (this.fwHalf > 0 && pr.s > this.fwStart && pr.s < this.length && ad < this.fairwayHalf(pr.s)) surface = 'fairway';
    else surface = 'rough';
    return { height: w && w.q < 1.3 ? Math.max(land, w.level) : land, surface };
  };

  /**
   * Rough depth at (x, z): 'first' (the first cut, a few metres off the
   * fairway or green) or 'deep'. Only meaningful where the surface is rough.
   */
  roughDepth(x, z) {
    const pr = this.project(x, z);
    const ad = Math.abs(pr.d);
    const edge = this.fwHalf > 0 && pr.s > this.fwStart && pr.s < this.length ? this.fairwayHalf(pr.s) : 0;
    const gd = Math.hypot(x - this.green.x, z - this.green.z) - this.greenR;
    return (edge > 0 && ad - edge < 4.5) || gd < 5 ? 'first' : 'deep';
  }

  fairwayHalf(s) {
    // organic width: narrows a touch into the green, wobbles
    const k = 1 + 0.12 * Math.sin(s * 0.031 + this.hole.n) + 0.06 * Math.sin(s * 0.11);
    return this.fwHalf * k * (1 - 0.18 * smooth(this.length - 70, this.length, s));
  }

  groundHeight = (x, z) => this.terrain(x, z).height;

  /** Distance (m) from a point to the pin. */
  toPin(x, z) { return Math.hypot(x - this.pin.x, z - this.pin.z); }

  /** Bounding box of the playable area plus margin, for mesh building. */
  bounds(margin = 160) {
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    const ext = [...this.pts, this.pin];
    for (const p of ext) {
      minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x);
      minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z);
    }
    return { minx: minx - margin, maxx: maxx + margin, minz: minz - margin - 60, maxz: maxz + 60 };
  }
}
