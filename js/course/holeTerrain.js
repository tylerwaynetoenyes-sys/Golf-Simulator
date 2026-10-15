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

/**
 * A real outline (green, bunker, pond, fairway) in hole-local metres, as
 * mapped on OpenStreetMap. `q` mimics the ellipse test: 0 at the middle, 1 on
 * the edge, growing outside, so outlines and ellipses share every consumer.
 */
export class Outline {
  constructor(pts) {
    this.pts = pts;
    let a = 0, cx = 0, cz = 0;
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
      const c = x1 * z2 - x2 * z1;
      a += c; cx += (x1 + x2) * c; cz += (z1 + z2) * c;
      minx = Math.min(minx, x1); maxx = Math.max(maxx, x1); minz = Math.min(minz, z1); maxz = Math.max(maxz, z1);
    }
    this.area = Math.abs(a / 2);
    this.x = cx / (3 * a); this.z = cz / (3 * a);
    this.R = Math.max(1, Math.sqrt(this.area / Math.PI));
    this.box = { minx, maxx, minz, maxz };
  }

  inside(x, z) {
    const b = this.box;
    if (x < b.minx || x > b.maxx || z < b.minz || z > b.maxz) return false;
    let c = false;
    const p = this.pts;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      if ((p[i][1] > z) !== (p[j][1] > z) && x < ((p[j][0] - p[i][0]) * (z - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
    }
    return c;
  }

  /** Signed distance to the edge (m): negative inside. */
  sd(x, z) {
    const b = this.box;
    const out = Math.max(b.minx - x, x - b.maxx, b.minz - z, z - b.maxz);
    if (out > 40) return out; // far away: a lower bound is enough
    let d2 = Infinity;
    const p = this.pts;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const ax = p[j][0], az = p[j][1], ex = p[i][0] - ax, ez = p[i][1] - az;
      const L = ex * ex + ez * ez || 1;
      const u = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L));
      d2 = Math.min(d2, (x - ax - ex * u) ** 2 + (z - az - ez * u) ** 2);
    }
    const d = Math.sqrt(d2);
    return this.inside(x, z) ? -d : d;
  }

  /** Ellipse-like quadratic: 0 at the middle, 1 on the edge. */
  q(x, z) {
    const k = Math.max(0, 1 + this.sd(x, z) / this.R);
    return k * k;
  }

  /** Deepest point inside nearest to (x, z) with at least `depth` metres of margin. */
  settle(x, z, depth) {
    if (this.sd(x, z) <= -depth) return { x, z };
    let best = null, bd = Infinity, deep = null, dd = 0;
    const b = this.box;
    for (let gx = b.minx; gx <= b.maxx; gx += 0.5) {
      for (let gz = b.minz; gz <= b.maxz; gz += 0.5) {
        const s = -this.sd(gx, gz);
        if (s > dd) { dd = s; deep = { x: gx, z: gz }; }
        if (s < depth) continue;
        const d = Math.hypot(gx - x, gz - z);
        if (d < bd) { bd = d; best = { x: gx, z: gz }; }
      }
    }
    return best || deep || { x, z };
  }
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
    // the sea or a river at its real level (relative to the tee)
    this.seaLevel = this.F && hole.waterLevel != null ? hole.waterLevel - this.F.teeH : null;
    // real ground is graded through the playing corridor (embankments, ditches
    // and drains smoothed, nothing left below the water line), easing back to
    // the untouched land ~70 m out so the backdrop meets it exactly
    // 1 m LiDAR (tools/fetch-lidar.py): the ground is already true to ~10 cm,
    // so no corridor grading, no added lumps, and greens, bunkers and tees
    // keep the surveyed shape
    this.lidar = !!this.F?.d?.dem?.meta?.lidar;
    if (this.F && !this.lidar) this._buildGrade();
    this.greenBase = this.elevAt(1) + (this.lidar ? 0 : this.F ? 0.25 : 0.4);
    // real outlines (OSM polygons, hole-local metres) where the course has them
    this.greenPoly = hole.green.poly ? new Outline(hole.green.poly) : null;
    this.fairwayPolys = (hole.fairways || []).map((p) => new Outline(p));
    if (this.greenPoly) {
      this.greenR = this.greenPoly.R;
      // the green's centre: the end of the hole line if it sits well inside
      const c = this.greenPoly.settle(this.green.x, this.green.z, Math.min(3, this.greenPoly.R * 0.4));
      this.green = { x: c.x, z: c.z };
    }
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
    if (this.greenPoly) this.pin = this.greenPoly.settle(this.pin.x, this.pin.z, Math.min(3.5, this.greenPoly.R * 0.45));
    this.tee = { x: 0, z: 0 };
    this.teeHeight = this.elevAt(0) + (this.lidar ? 0.05 : 0.3);
    this.oobLateral = Math.max(this.fwHalf, 14) + 78;

    // Hazards in world coordinates
    const place = (t, off) => {
      const p = this.pointAt(t * this.length);
      return { x: p.x + p.rx * off, z: p.z + p.rz * off, dirx: p.dx, dirz: p.dz };
    };
    const outline = (o) => {
      const poly = new Outline(o.poly);
      return { x: poly.x, z: poly.z, dirx: this.finalDir.x, dirz: this.finalDir.z, rx: poly.R, rz: poly.R, poly };
    };
    this.bunkers = (hole.bunkers || []).map((b) => (b.poly ? outline(b) : { ...place(b.t, b.off), rx: b.rx, rz: b.rz }));
    // shaping: mounds (+) and hollows (−) as soft Gaussian landforms
    this.mounds = (hole.mounds || []).map((m) => ({ ...place(m.t, m.off), r: m.r, h: m.h }));
    this.ponds = [];
    this.creeks = [];
    for (const w of hole.water || []) {
      if (w.poly) {
        // a mapped pond: on LiDAR the water surface is the (hydro-flattened)
        // ground inside it; sit the water just under that
        const o = outline(w);
        const hs = [];
        const bb = o.poly.box;
        const st = Math.max(1, Math.sqrt(o.poly.area) / 12);
        for (let x = bb.minx; x <= bb.maxx; x += st) for (let z = bb.minz; z <= bb.maxz; z += st) if (o.poly.inside(x, z)) hs.push(this.F ? this.F.height(x, z) : 0);
        hs.sort((a, b) => a - b);
        const level = (hs.length ? hs[Math.floor(hs.length / 2)] : 0) + (w.level ?? -0.15);
        this.ponds.push({ ...o, level, off: w.level ?? -0.15, island: !!w.island, mapped: true });
      } else if (w.creek != null) {
        this.creeks.push({ s: w.creek * this.length, half: w.width / 2, level: this.elevAt(w.creek) - 1.2 });
      } else {
        const p = place(w.t, w.off);
        this.ponds.push({ ...p, rx: w.rx, rz: w.rz, level: this.elevAt(w.t) + (w.level ?? -1), off: w.level ?? -1, island: !!w.island });
      }
    }
    // shaped ground (side slopes, mounds) can dip below a pond's nominal
    // level: sit the water a little under the lowest point of its banks
    for (const p of this.ponds) {
      if (p.mapped) continue;
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
      return this._grade ? this._graded(p.x, p.z) : this.F.height(p.x, p.z);
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
    if (o.poly) return o.poly.q(x, z);
    const dx = x - o.x, dz = z - o.z;
    const along = dx * o.dirx + dz * o.dirz;
    const across = dx * -o.dirz + dz * o.dirx;
    return (across / o.rx) ** 2 + (along / o.rz) ** 2;
  }

  /** Ground shape without water (shared by physics and mesh). */
  _buildGrade() {
    const st = 4;
    const b = this.bounds(240);
    const nx = Math.ceil((b.maxx - b.minx) / st) + 1, nz = Math.ceil((b.maxz - b.minz) / st) + 1;
    const raw = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) raw[j * nx + i] = this.F.height(b.minx + i * st, b.minz + j * st);
    // two passes of a separable box blur (radius 6 cells = 24 m): close to a Gaussian
    const blur = (src) => {
      const r = 6, tmp = new Float32Array(src.length), out = new Float32Array(src.length);
      for (let j = 0; j < nz; j++) {
        let acc = 0, n = 0;
        for (let i = -r; i <= r; i++) { const ii = Math.min(nx - 1, Math.max(0, i)); acc += src[j * nx + ii]; n++; }
        for (let i = 0; i < nx; i++) {
          tmp[j * nx + i] = acc / n;
          const add = Math.min(nx - 1, i + r + 1), sub = Math.max(0, i - r);
          acc += src[j * nx + add] - src[j * nx + sub];
        }
      }
      for (let i = 0; i < nx; i++) {
        let acc = 0, n = 0;
        for (let j = -r; j <= r; j++) { const jj = Math.min(nz - 1, Math.max(0, j)); acc += tmp[jj * nx + i]; n++; }
        for (let j = 0; j < nz; j++) {
          out[j * nx + i] = acc / n;
          const add = Math.min(nz - 1, j + r + 1), sub = Math.max(0, j - r);
          acc += tmp[add * nx + i] - tmp[sub * nx + i];
        }
      }
      return out;
    };
    const sm = blur(blur(raw));
    const corridor = Math.max(this.fwHalf, 14);
    const grade = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = b.minx + i * st, z = b.minz + j * st, k = j * nx + i;
        const pr = this.project(x, z);
        const inPlay = pr.s > -30 && pr.s < this.length + 40;
        let w = inPlay ? smooth(corridor + 70, corridor + 20, Math.abs(pr.d)) : 0;
        w = Math.max(w, smooth(this.greenR + 60, this.greenR + 15, Math.hypot(x - this.green.x, z - this.green.z)));
        w = Math.max(w, smooth(50, 15, Math.hypot(x, z)));
        let h = raw[k] + (sm[k] - raw[k]) * w;
        // fill: playing ground never sits in the river or the sea
        if (this.seaLevel != null && w > 0) h = Math.max(h, raw[k] + (Math.max(raw[k], this.seaLevel + 0.8) - raw[k]) * w);
        grade[k] = h;
      }
    }
    this._grade = { grade, nx, nz, st, minx: b.minx, minz: b.minz };
  }

  /** Graded ground (DEM courses): bilinear in the grade grid, raw DEM outside it. */
  _graded(x, z) {
    const G = this._grade;
    const fi = (x - G.minx) / G.st, fj = (z - G.minz) / G.st;
    if (fi < 0 || fj < 0 || fi > G.nx - 1.001 || fj > G.nz - 1.001) return this.F.height(x, z);
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, k = j * G.nx + i, g = G.grade;
    return g[k] * (1 - u) * (1 - v) + g[k + 1] * u * (1 - v) + g[k + G.nx] * (1 - u) * v + g[k + G.nx + 1] * u * v;
  }

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
      h = this._grade ? this._graded(x, z) : this.F.height(x, z);
      if (!this.lidar) {
        h += (vnoise(x * 0.03, z * 0.03) - 0.5) * 0.9 * smooth(corridor - 4, corridor + 20, ad);
        h += (vnoise(x * 0.09, z * 0.09) - 0.5) * 0.3;
      }
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
    const gw = this.lidar ? 0 : smooth(this.greenR + 9, this.greenR, gd);
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
    // (LiDAR already holds the real bunker floors and faces)
    if (!this.lidar) for (const b of this.bunkers) {
      const q = this._ellipse(b, x, z);
      if (q < 1.6) h += (-0.75 * smooth(1.15, 0, q) + 0.25 * smooth(1.6, 1.05, q) * smooth(0.9, 1.05, q)) * keepGreen;
    }
    return h;
  }

  _water(x, z, pr) {
    if (this.seaLevel != null) {
      const g = this._grade ? this._graded(x, z) : this.F.height(x, z);
      if (g < this.seaLevel + 0.05) return { level: this.seaLevel, q: 0.5, sea: true };
    }
    for (const c of this.creeks) {
      const u = Math.abs(pr.s - c.s);
      if (u < c.half + 6) return { level: c.level, q: u / c.half, bank: c.half };
    }
    for (const p of this.ponds) {
      if (p.mapped) {
        // a mapped outline: banks in real metres from its edge, never on a green
        const sd = p.poly.sd(x, z);
        if (sd < 3 && !(sd > 0 && this.greenEdge(x, z) < 1)) return { level: p.level, q: sd < 0 ? 0.5 : 1.2, sd };
        continue;
      }
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
    if (w && w.sd != null) {
      // mapped pond: the bed falls away from the edge to 1.4 m under the water
      const bowl = w.level - 1.4 * smooth(0, -6, w.sd);
      h = h + (Math.min(h, bowl) - h) * smooth(3, 0, w.sd);
    } else if (w && !w.sea) {
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
    if (w && (w.sd != null ? w.sd < 0 : w.q < 1)) return { height: w.level, surface: "water" };
    let surface;
    const ad = Math.abs(pr.d);
    if (ad > this.oobLateral || pr.s < -25 || pr.s > this.length + 75) surface = 'oob';
    else if (this.greenPoly ? this._onGreen(x, z) < 0 : Math.hypot(x - this.green.x, z - this.green.z) < this.greenR) surface = 'green';
    else if (this.greenPoly ? this._onGreen(x, z) < 1.8 : Math.hypot(x - this.green.x, z - this.green.z) < this.greenR + 1.8) surface = 'fringe';
    else if (Math.hypot(x - this.tee.x, z - this.tee.z) < 4.5) surface = 'tee';
    else if (this.bunkers.some((b) => this._ellipse(b, x, z) < 1)) surface = 'sand';
    else if (this.fairwayPolys.length ? this.fairwayPolys.some((f) => f.inside(x, z)) : this.fwHalf > 0 && pr.s > this.fwStart && pr.s < this.length && ad < this.fairwayHalf(pr.s)) surface = 'fairway';
    else surface = 'rough';
    // (mapped ponds: the bank exactly as drawn, down to the water's edge)
    if (w && w.sd != null) return { height: land + (Math.min(land, w.level) - land) * smooth(3, 0, w.sd), surface };
    return { height: w && w.q < 1.3 ? Math.max(land, w.level) : land, surface };
  };

  /** Signed distance to the green's mapped edge (negative on the green). */
  _onGreen(x, z) {
    return this.greenPoly.sd(x, z);
  }

  /** Distance off the green's edge (m; negative on it), for outlines and circles alike. */
  greenEdge(x, z) {
    return this.greenPoly ? this.greenPoly.sd(x, z) : Math.hypot(x - this.green.x, z - this.green.z) - this.greenR;
  }

  /**
   * Rough depth at (x, z): 'first' (the first cut, a few metres off the
   * fairway or green) or 'deep'. Only meaningful where the surface is rough.
   */
  roughDepth(x, z) {
    const pr = this.project(x, z);
    const ad = Math.abs(pr.d);
    if (this.fairwayPolys.length) {
      const near = this.fairwayPolys.some((f) => f.sd(x, z) < 4.5);
      return near || this.greenEdge(x, z) < 5 ? 'first' : 'deep';
    }
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
    const ext = [...this.pts, this.pin].filter(Boolean);
    for (const p of ext) {
      minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x);
      minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z);
    }
    return { minx: minx - margin, maxx: maxx + margin, minz: minz - margin - 60, maxz: maxz + 60 };
  }
}
