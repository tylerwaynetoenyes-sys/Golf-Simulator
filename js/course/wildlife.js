// Wildlife: the animals that live on each course, placed by the ground they
// need and moving on their own, quietly. Bodies and their animation are in
// js/scene/fauna.js; this file decides who lives where and what they do.
//
// Who (checked against field guides and the clubs' own accounts):
//   TPC Sawgrass   American alligators on the pond banks and floating with only
//                  the eyes and snout up; great egrets and great blue herons
//                  stalking the edges; bald eagles (NE Florida has hundreds of
//                  nesting pairs) and red-tailed hawks overhead; grey squirrels
//   Augusta        grey squirrels, a whitetail at the edge of the pines, a
//                  hawk; cardinals and other songbirds heard, not seen
//   Pebble Beach   black-tailed deer grazing the fairways (famously tame),
//                  harbour seals and California sea lions hauled out on the
//                  rocks, brown pelicans gliding in lines past the cliffs, gulls
//   Torrey Pines   pelicans along the bluffs, gulls, red-tailed hawks on the
//                  cliff lift, and paragliders and hang gliders off the Gliderport
//   Whistling      the club's own flock of Scottish Blackface sheep on the dunes,
//   Straits        gulls over Lake Michigan, Canada geese
//   Pinehurst      fox squirrels (the Sandhills' big orange-and-black ones), a
//                  red-tailed hawk circling, deer at the pines
//   Alton, Godfrey and St. Louis courses: whitetail deer at the tree lines,
//                  Canada geese on the ponds and fairway edges, bald eagles over
//                  the Mississippi (Alton's wintering eagles), grey squirrels
//   Oregon Trail   mule deer and hawks (no pronghorn model under an open licence)
//   Cassis         yellow-legged gulls; the city parks: squirrels, mallards, gulls
//
// What they do: graze, look up, walk a little; when a ball comes near, geese
// and herons take off, deer lift their heads and trot away, a basking gator
// slides into the water, squirrels run for a tree. Nothing stands in play:
// animals keep off greens, tees, bunkers and the middle of the fairway, and away
// from the tee and the green.
import * as THREE from 'three';
import { Herd, preloadFauna, uFauna } from '../scene/fauna.js';
import { audio } from '../audio/audio.js';

const MIDWEST = { deer: [2, 5], geese: [5, 12], squirrels: [2, 5], soar: [['eagle', 1, { river: true }], ['hawk', 1]], song: 'cardinal' };
const ROSTERS = {
  sawgrass: { gators: [2, 4], waders: [2, 4], squirrels: [1, 3], soar: [['eagle', 1], ['hawk', 1]], song: 'cardinal' },
  augusta: { deer: [1, 2], squirrels: [3, 6], soar: [['hawk', 1]], song: 'cardinal' },
  pebble: { deer: [2, 4], blacktail: true, seals: [3, 7], pelicans: true, gulls: [3, 6], song: 'gull' },
  cassis: { gulls: [4, 8], song: 'gull' },
  torreypines: { pelicans: true, gulls: [3, 6], soar: [['hawk', 1]], gliders: [2, 4], song: 'gull' },
  whistlingstraits: { sheep: [8, 16], geese: [0, 6], gulls: [4, 8], song: 'gull' },
  pinehurst: { deer: [0, 2], squirrels: [2, 4], fox: true, soar: [['hawk', 1]], song: 'cardinal' },
  oregon: { deer: [2, 4], mule: true, soar: [['hawk', 2]] },
  centralpark: { squirrels: [3, 6], mallards: [3, 8], gulls: [1, 3], song: 'cardinal' },
  forestpark: { squirrels: [3, 6], geese: [4, 10], mallards: [2, 6], deer: [0, 2], song: 'cardinal' },
  paris: { gulls: [1, 3], mallards: [0, 4] },
  liberty: { gulls: [4, 8], geese: [0, 6], song: 'gull' },
  gatewayarch: { squirrels: [2, 4], geese: [0, 6], gulls: [1, 2], soar: [['eagle', 1, { river: true }]] },
  stlzoo: { squirrels: [2, 4], geese: [3, 8], song: 'cardinal' },
  eaststl: { soar: [['hawk', 1]] },
};
const BY_PATTERN = [[/torrey/, 'torreypines'], [/pinehurst/, 'pinehurst'], [/sawgrass/, 'sawgrass'], [/whistling/, 'whistlingstraits']];

/** The wildlife roster for a hole's course (Midwest parkland by default). */
export function rosterFor(hole) {
  const id = hole.course || 'confluence';
  if (ROSTERS[id]) return ROSTERS[id];
  for (const [re, k] of BY_PATTERN) if (re.test(id)) return ROSTERS[k];
  if (hole.theme === 'western') return ROSTERS.oregon;
  if (hole.theme === 'coastal' || hole.theme === 'harbor') return ROSTERS.liberty;
  if (hole.theme === 'industrial' || hole.theme === 'urban') return ROSTERS.eaststl;
  return MIDWEST;
}

/** Fetch the models a course needs (called with the course's other models). */
export function preloadWildlife(courseId, theme) {
  const r = rosterFor({ course: courseId, theme });
  const k = [];
  if (r.gators) k.push('gator');
  if (r.waders) k.push('heron', 'egret', 'goose_fly');
  if (r.deer) k.push('deer_doe', 'deer_buck');
  if (r.geese) k.push('goose', 'goose_fly');
  if (r.sheep) k.push('sheep');
  if (r.squirrels) k.push('squirrel');
  if (r.mallards) k.push('mallard');
  if (r.seals) k.push('sealion', 'harborseal');
  if (r.soar) k.push('eagle');
  if (r.gulls || r.pelicans) k.push('gull');
  return preloadFauna(k);
}

// ── small helpers ──
const TAU = Math.PI * 2;
const yawTo = (dx, dz) => Math.atan2(-dx, -dz); // heading that faces (dx, dz)
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const approach = (v, to, k) => v + (to - v) * Math.min(1, k);

/**
 * The wildlife of one hole: build with the hole, update every frame.
 * `ground(x, z)` is the ground as drawn; `trees` the hole's tree records.
 */
export class Wildlife {
  constructor(T, hole, { ground, trees = [], rnd = Math.random, quality = 1 } = {}) {
    this.T = T;
    this.hole = hole;
    this.ground = ground;
    this.rnd = rnd;
    this.group = new THREE.Group();
    this.group.name = 'wildlife';
    this.animals = [];
    this.herds = new Map();
    this.day = 1;
    this.roster = rosterFor(hole);
    this.trees = trees;
    this.prevBall = null;
    this.restDone = false;
    this.momentUsed = false;
    this._songT = 4 + rnd() * 6;
    this._audioT = 0;
    this.lite = quality < 1; // tablets: fewer animals
    try { this._populate(); } catch (e) { console.warn('wildlife: placement failed', e); }
  }

  herd(kind, cap, opts = {}, key = kind) {
    if (!this.herds.has(key)) {
      const h = new Herd(kind, cap, opts);
      this.herds.set(key, h);
      this.group.add(h.mesh);
    }
    return this.herds.get(key);
  }

  _n([a, b]) { const n = a + Math.floor(this.rnd() * (b - a + 1)); return this.lite ? Math.ceil(n * 0.7) : n; }

  // ── where things may stand ──
  _surf(x, z) { return this.T.terrain(x, z).surface; }

  /** Clear of play: off greens, tees, bunkers, water; away from the tee, the green and the fairway's middle. */
  _clear(x, z, { fairway = false, margin = 8 } = {}) {
    const T = this.T, sf = this._surf(x, z);
    if (sf === 'water' || sf === 'green' || sf === 'fringe' || sf === 'tee' || sf === 'sand') return false;
    if (!fairway && sf === 'fairway') return false;
    if (Math.hypot(x, z) < 30) return false;
    if (T.greenEdge(x, z) < 14) return false;
    const pr = T.project(x, z);
    const half = pr.s > 0 && pr.s < T.length && T.fwHalf > 0 ? T.fairwayHalf(pr.s) : Math.max(T.fwHalf || 0, 12);
    if (Math.abs(pr.d) < half * (fairway ? 0.75 : 1) + (fairway ? 0 : margin)) return false;
    return true;
  }

  /** Points on every pond's bank: [x, z, outward dx, dz, pond]. */
  _banks(step = 6) {
    const out = [];
    for (const p of this.T.ponds || []) {
      let pts = p.poly ? p.poly.pts : null;
      if (!pts) {
        pts = [];
        const n = Math.max(24, Math.round((p.rx + p.rz) * 0.6));
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU, ex = Math.cos(a) * p.rx, ez = Math.sin(a) * p.rz;
          pts.push([p.x + ex * -p.dirz + ez * p.dirx, p.z + ex * p.dirx + ez * p.dirz]);
        }
      }
      let acc = 0;
      for (let i = 0; i < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
        const L = Math.hypot(bx - ax, bz - az);
        acc += L;
        if (acc < step) continue;
        acc = 0;
        // outward: the side of the edge away from the pond's middle
        let nx = bz - az, nz = -(bx - ax);
        const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        if (nx * (ax - p.x) + nz * (az - p.z) < 0) { nx = -nx; nz = -nz; }
        out.push([ax, az, nx, nz, p]);
      }
    }
    return out;
  }

  /** Where the woods begin: points just in front of the tree line, facing the open ground. */
  _treeEdge() {
    const out = [], T = this.T;
    for (const t of this.trees) {
      const pr = T.project(t.x, t.z);
      if (pr.s < 20 || pr.s > T.length + 40) continue;
      // step out of the crown toward the hole
      const p = T.pointAt(Math.max(0, Math.min(T.length, pr.s)));
      let dx = p.x - t.x, dz = p.z - t.z;
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const r = (t.r || 3) + 1.5 + this.rnd() * 3;
      out.push([t.x + dx * r, t.z + dz * r, dx, dz, t]);
    }
    return out;
  }

  /** Points along the hole beyond the rough: |offset| in [a, b] metres from the fairway's edge. */
  _flank(a, b, n) {
    const out = [], T = this.T;
    for (let k = 0; k < n * 6 && out.length < n; k++) {
      const s = 40 + this.rnd() * Math.max(10, T.length - 40);
      const p = T.pointAt(s), side = this.rnd() < 0.5 ? -1 : 1;
      const half = T.fwHalf > 0 ? T.fairwayHalf(s) : 12;
      const d = side * (half + a + this.rnd() * (b - a));
      const x = p.x + p.rx * d, z = p.z + p.rz * d;
      if (this._clear(x, z)) out.push([x, z, -p.rx * side, -p.rz * side]);
    }
    return out;
  }

  /** The sea's edge, where the ground meets the water just above it (rocks and beaches). */
  _coast(n) {
    const T = this.T;
    if (T.seaLevel == null) return [];
    const b = T.bounds(260), out = [];
    for (let k = 0; k < 900 && out.length < n * 3; k++) {
      const x = b.minx + this.rnd() * (b.maxx - b.minx), z = b.minz + this.rnd() * (b.maxz - b.minz);
      const h = this.ground(x, z) - T.seaLevel;
      if (h < 0.15 || h > 2.6) continue;
      // the water within a few metres, and the slope gentle enough to lie on
      let wx = 0, wz = 0, wet = 0;
      for (let a = 0; a < TAU; a += TAU / 8) {
        const ex = x + Math.cos(a) * 5, ez = z + Math.sin(a) * 5;
        if (this.ground(ex, ez) < T.seaLevel) { wx += Math.cos(a); wz += Math.sin(a); wet++; }
      }
      if (!wet || wet > 5) continue;
      if (!this._clear(x, z, { margin: 30 })) continue;
      const l = Math.hypot(wx, wz) || 1;
      out.push([x, z, wx / l, wz / l]);
    }
    return out;
  }

  // ── population ──
  _populate() {
    const R = this.roster;
    if (R.gators && this.T.ponds?.length) this._gators(this._n(R.gators));
    if (R.waders && this.T.ponds?.length) this._waders(this._n(R.waders));
    if (R.deer) this._deer(this._n(R.deer));
    if (R.geese) this._geese(this._n(R.geese));
    if (R.sheep) this._sheep(this._n(R.sheep));
    if (R.squirrels) this._squirrels(this._n(R.squirrels));
    if (R.mallards && this.T.ponds?.length) this._mallards(this._n(R.mallards));
    if (R.seals) this._seals(this._n(R.seals));
    for (const [kind, n, o] of R.soar || []) this._soarers(kind, n, o || {});
    if (R.gulls) this._gulls(this._n(R.gulls));
    if (R.pelicans) this._pelicans();
    if (R.gliders) this._gliders(this._n(R.gliders));
  }

  _add(a) {
    a.phase ??= this.rnd() * TAU;
    a.head ??= 0; a.gait ??= 0; a.flap ??= 0; a.pitch ??= 0; a.roll ??= 0; a.s ??= 1;
    a.t ??= 0; a.timer ??= 1 + this.rnd() * 6;
    a.i = a.herd.add();
    if (a.i < 0) return null;
    this.animals.push(a);
    this._place(a);
    return a;
  }

  _place(a) {
    const h = a.herd;
    if (a.hidden) { h.set(a.i, 0, -9999, 0, 0, 0.0001); return; }
    h.set(a.i, a.x, a.y, a.z, a.yaw, a.s, a.pitch, a.roll);
    h.pose(a.i, a.phase, a.head, a.gait, a.flap);
  }

  /** Sit a walker on the ground: height and pitch from the slope under its length. */
  _onGround(a, len) {
    const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    const hf = this.ground(a.x + fx * len * 0.45, a.z + fz * len * 0.45), hb = this.ground(a.x - fx * len * 0.45, a.z - fz * len * 0.45);
    a.y = (hf + hb) / 2 + (a.sink || 0);
    a.pitch = Math.atan2(hf - hb, len * 0.9);
  }

  _gators(n) {
    const banks = this._banks(5).filter(([x, z, nx, nz]) => this._clear(x + nx * 1.5, z + nz * 1.5, { margin: 4 }));
    const H = this.herd('gator', n);
    for (let k = 0; k < n; k++) {
      const s = 0.75 + this.rnd() * 0.4; // 2.3–3.5 m
      if (banks.length && this.rnd() < 0.6) {
        // basking on the bank, nose to the water
        const [x, z, nx, nz, pond] = banks.splice(Math.floor(this.rnd() * banks.length), 1)[0];
        const a = this._add({ herd: H, type: 'gator', state: 'bask', x: x + nx * 2.2 * s, z: z + nz * 2.2 * s, yaw: yawTo(-nx, -nz) + (this.rnd() - 0.5) * 0.6, s, pond, sink: -0.22 * s });
        if (a) this._onGround(a, 3 * s);
      } else {
        // floating: eyes and snout up, the rest a shadow under the surface
        const p = this.T.ponds[Math.floor(this.rnd() * this.T.ponds.length)];
        const spot = this._inPond(p, 4);
        if (!spot) continue;
        this._add({ herd: H, type: 'gator', state: 'float', x: spot[0], z: spot[1], yaw: this.rnd() * TAU, s, pond: p, y: p.level - 0.7 * s, pitch: 0.19, head: -0.6 });
      }
    }
  }

  /** A point inside pond p, `edge` metres or more from its bank. */
  _inPond(p, edge) {
    for (let k = 0; k < 30; k++) {
      const r = Math.max(p.rx || 0, p.rz || 0, p.poly ? p.poly.R : 0);
      const x = p.x + (this.rnd() - 0.5) * r * 1.6, z = p.z + (this.rnd() - 0.5) * r * 1.6;
      let ok = true;
      for (let a = 0; a < TAU && ok; a += TAU / 6) if (this._surf(x + Math.cos(a) * edge, z + Math.sin(a) * edge) !== 'water') ok = false;
      if (ok && this.T.greenEdge(x, z) > 6) return [x, z];
    }
    return null;
  }

  _waders(n) {
    const banks = this._banks(7);
    const fly = this.herd('goose_fly', n, { tint: 0xc9d0d8, grey: 0.7 }, 'wader_fly');
    for (let k = 0; k < n && banks.length; k++) {
      const egret = this.rnd() < 0.55;
      const H = this.herd(egret ? 'egret' : 'heron', n, egret ? {} : { tint: 0xc2cad6 });
      const [x, z, nx, nz] = banks.splice(Math.floor(this.rnd() * banks.length), 1)[0];
      // at the water's edge, often a step into the shallows
      const w = (this.rnd() - 0.3) * 1.2;
      const px = x + nx * w, pz = z + nz * w;
      if (!this._clear(px + nx * 2, pz + nz * 2, { margin: 2 })) continue;
      const a = this._add({ herd: H, type: 'wader', state: 'stand', x: px, z: pz, yaw: yawTo(-nx, -nz) + (this.rnd() - 0.5) * 1.6, s: 0.92 + this.rnd() * 0.15, fly, egret });
      if (a) a.y = this.ground(px, pz) - (w < 0 ? 0.12 : 0); // ankle-deep in the shallows
    }
  }

  _deer(n) {
    if (!n) return;
    const edge = this._treeEdge().filter(([x, z]) => this._clear(x, z, { margin: 10 }));
    const spots = edge.length ? edge : this._flank(20, 70, n);
    if (!spots.length) return;
    const R = this.roster;
    const tint = R.blacktail ? 0xb9ab9c : R.mule ? 0xc2b5a6 : 0xffffff;
    const grey = R.blacktail ? 0.35 : R.mule ? 0.45 : 0;
    const does = this.herd('deer_doe', n, { tint, grey }), bucks = this.herd('deer_buck', 1, { tint, grey });
    // a small group: does and fawns together, now and then a buck
    const [cx, cz, dx, dz] = spots[Math.floor(this.rnd() * spots.length)];
    for (let k = 0; k < n; k++) {
      const buck = k === 0 && this.rnd() < 0.25;
      const x = cx + (this.rnd() - 0.5) * 14 + dx * this.rnd() * 6, z = cz + (this.rnd() - 0.5) * 14 + dz * this.rnd() * 6;
      if (!this._clear(x, z, { margin: R.blacktail ? 4 : 10, fairway: !!R.blacktail })) continue;
      const fawn = !buck && k > 1 && this.rnd() < 0.35;
      const a = this._add({ herd: buck ? bucks : does, type: 'grazer', species: 'deer', state: 'graze', x, z, yaw: this.rnd() * TAU, s: fawn ? 0.66 : buck ? 1.05 : 0.9 + this.rnd() * 0.08, head: 1, walk: 0.7, run: 6.5, alertR: 45, fleeR: 26 });
      if (a) this._onGround(a, 1.6 * a.s);
    }
  }

  _geese(n) {
    if (!n) return;
    // on a pond's bank or the edge of the fairway, grazing together
    const banks = this._banks(8).filter(([x, z, nx, nz]) => this._clear(x + nx * 3, z + nz * 3, { margin: 3 }));
    let c;
    if (banks.length && this.rnd() < 0.7) { const b = banks[Math.floor(this.rnd() * banks.length)]; c = [b[0] + b[2] * 5, b[1] + b[3] * 5]; } else {
      const f = this._flank(2, 18, 1)[0];
      if (!f) return;
      c = [f[0], f[1]];
    }
    const H = this.herd('goose', n), fly = this.herd('goose_fly', n);
    const stubborn = this.rnd() < 0.18; // once in a while one bird will not be moved
    for (let k = 0; k < n; k++) {
      const x = c[0] + (this.rnd() - 0.5) * 9, z = c[1] + (this.rnd() - 0.5) * 9;
      if (!this._clear(x, z, { fairway: true, margin: 2 })) continue;
      const a = this._add({ herd: H, type: 'grazer', species: 'goose', state: 'graze', x, z, yaw: this.rnd() * TAU, s: 0.92 + this.rnd() * 0.14, head: 1, walk: 0.45, run: 1.4, alertR: 30, fleeR: 14, fly, stubborn: stubborn && k === 0 });
      if (a) this._onGround(a, 0.6);
    }
  }

  _sheep(n) {
    const spots = this._flank(18, 90, 3);
    if (!spots.length) return;
    const H = this.herd('sheep', n);
    const [cx, cz] = spots[0];
    for (let k = 0; k < n; k++) {
      const x = cx + (this.rnd() - 0.5) * 26, z = cz + (this.rnd() - 0.5) * 26;
      if (!this._clear(x, z, { margin: 12 })) continue;
      const a = this._add({ herd: H, type: 'grazer', species: 'sheep', state: 'graze', x, z, yaw: this.rnd() * TAU, s: 0.85 + this.rnd() * 0.2, head: 1, walk: 0.5, run: 2.8, alertR: 28, fleeR: 16 });
      if (a) this._onGround(a, 1.1 * a.s);
    }
  }

  _squirrels(n) {
    const fox = !!this.roster.fox;
    const H = this.herd('squirrel', n, fox ? { tint: 0xc08a5a, grey: 0.15 } : { tint: 0xb4aca4, grey: 0.85 });
    const edge = this._treeEdge().filter(([x, z]) => this._clear(x, z, { margin: 4 }));
    for (let k = 0; k < n && edge.length; k++) {
      const [x, z, , , tree] = edge.splice(Math.floor(this.rnd() * edge.length), 1)[0];
      const a = this._add({ herd: H, type: 'squirrel', state: 'forage', x, z, yaw: this.rnd() * TAU, s: fox ? 1.15 : 1, tree, head: 1 });
      if (a) this._onGround(a, 0.3);
    }
  }

  _mallards(n) {
    const H = this.herd('mallard', n);
    const p = this.T.ponds[Math.floor(this.rnd() * this.T.ponds.length)];
    for (let k = 0; k < n; k++) {
      const spot = this._inPond(p, 2);
      if (!spot) continue;
      this._add({ herd: H, type: 'swimmer', state: 'paddle', x: spot[0], z: spot[1], yaw: this.rnd() * TAU, s: 0.9 + this.rnd() * 0.15, pond: p, y: p.level - 0.1 });
    }
  }

  _seals(n) {
    const coast = this._coast(n);
    if (!coast.length) return;
    const lions = this.herd('sealion', n), seals = this.herd('harborseal', n);
    // hauled out together on one stretch of rock
    const [cx, cz] = coast[0];
    const near = coast.filter(([x, z]) => Math.hypot(x - cx, z - cz) < 60);
    for (let k = 0; k < n && near.length; k++) {
      const [x, z, wx, wz] = near.splice(Math.floor(this.rnd() * near.length), 1)[0];
      const lion = this.rnd() < 0.4;
      const a = this._add({ herd: lion ? lions : seals, type: 'seal', lion, state: 'lie', x, z, yaw: yawTo(wx, wz) + Math.PI + (this.rnd() - 0.5) * 1.2, s: lion ? 0.8 + this.rnd() * 0.15 : 0.9 + this.rnd() * 0.15, sink: -0.05 });
      if (a) this._onGround(a, 1.4);
    }
  }

  _soarers(kind, n, { river = false } = {}) {
    // eagles (and hawks, the eagle's form in a red-tail's colours) circling high on the thermals
    const hawk = kind === 'hawk';
    const H = this.herd('eagle', 3, hawk ? { tint: 0xc79a72, shadow: false } : { shadow: false }, hawk ? 'hawk' : 'eagle');
    const T = this.T;
    for (let k = 0; k < n; k++) {
      const s = 0.3 + this.rnd() * 0.7;
      const p = T.pointAt(T.length * s);
      const side = this.rnd() < 0.5 ? -1 : 1, off = (river ? 160 : 60) + this.rnd() * 140;
      const cx = p.x + p.rx * off * side, cz = p.z + p.rz * off * side;
      this._add({ herd: H, type: 'soar', x: cx, z: cz, y: 0, yaw: 0, s: hawk ? 0.62 : 1, cx, cz, r: 45 + this.rnd() * 50, alt: (hawk ? 55 : 80) + this.rnd() * 60, ang: this.rnd() * TAU, speed: hawk ? 9 : 11, dir: this.rnd() < 0.5 ? -1 : 1, flapEvery: 14 + this.rnd() * 10 });
    }
  }

  _gulls(n) {
    const H = this.herd('gull', n + 2, { shadow: false });
    const T = this.T;
    for (let k = 0; k < n; k++) {
      const p = T.pointAt(T.length * this.rnd());
      const off = (this.rnd() - 0.5) * 300;
      const cx = p.x + p.rx * off, cz = p.z + p.rz * off;
      this._add({ herd: H, type: 'soar', gull: true, x: cx, z: cz, y: 0, yaw: 0, s: 0.9 + this.rnd() * 0.2, cx, cz, r: 25 + this.rnd() * 45, alt: 18 + this.rnd() * 40, ang: this.rnd() * TAU, speed: 8 + this.rnd() * 3, dir: this.rnd() < 0.5 ? -1 : 1, flapEvery: 3 + this.rnd() * 4 });
    }
  }

  _pelicans() {
    // brown pelicans: a line of them gliding low past the cliffs, flaps rippling down the line
    const T = this.T;
    if (T.seaLevel == null) return;
    const coast = this._coast(6);
    if (!coast.length) return;
    const n = 4 + Math.floor(this.rnd() * 5);
    // the gull's form, as large as a pelican and in its grey-brown
    const H = this.herd('gull', n, { tint: 0x8a7e6e, grey: 0.6, shadow: false }, 'pelican');
    const [x, z, wx, wz] = coast[0];
    // along the shore: perpendicular to the way to the water, a little out to sea
    const ax = -wz, az = wx;
    const ox = x + wx * 35, oz = z + wz * 35;
    this.pelicanLine = { ox, oz, ax, az, len: 900, t: -this.rnd() * 30, speed: 11, wait: 0 };
    for (let k = 0; k < n; k++) this._add({ herd: H, type: 'pelican', k, x: ox, z: oz, y: -9999, yaw: 0, s: 1.5, hidden: true, flapEvery: 9 });
  }

  _gliders(n) {
    // the Torrey Pines Gliderport: paragliders and hang gliders on the cliff's lift
    const coast = this._coast(4);
    if (!coast.length) return;
    const [x, z, wx, wz] = coast[0];
    for (let k = 0; k < n; k++) {
      const hang = this.rnd() < 0.35;
      const g = hang ? hangGlider(this.rnd) : paraglider(this.rnd);
      this.group.add(g);
      this.animals.push({ type: 'glider', obj: g, hang, cx: x + wx * 40, cz: z + wz * 40, ax: -wz, az: wx, wx, wz, span: 220 + this.rnd() * 200, u: this.rnd(), speed: hang ? 11 : 8, alt: (hang ? 70 : 55) + this.rnd() * 50, phase: this.rnd() * TAU, base: this.T.seaLevel });
    }
  }

  // ── every frame ──
  setDay(d) { this.day = d; }

  update(dt, t, camera, ball) {
    if (!this.animals.length) return;
    dt = Math.min(dt, 0.1);
    uFauna.uTime.value = t;
    const cam = camera?.position;
    // the ball as a threat: moving and low (dropping in, bouncing, rolling)
    let bx = null, bz = null, bv = 0;
    if (ball) {
      const pv = this.prevBall;
      if (pv) bv = Math.hypot(ball.x - pv.x, ball.z - pv.z, ball.y - pv.y) / Math.max(dt, 1e-3);
      this.prevBall = { x: ball.x, y: ball.y, z: ball.z };
      const low = ball.y - this.ground(ball.x, ball.z) < 10;
      if (bv > 0.4 && low) { bx = ball.x; bz = ball.z; }
    }
    const night = this.day < 0.25;
    for (const a of this.animals) {
      // far from the camera, the herd animals hold still (no cost but the matrices)
      const far = cam && a.type !== 'soar' && a.type !== 'pelican' && a.type !== 'glider' && Math.hypot(a.x - cam.x, a.z - cam.z) > 420;
      const d = bx == null ? Infinity : Math.hypot(a.x - bx, a.z - bz);
      a.t += dt; a.timer -= dt;
      switch (a.type) {
        case 'grazer': this._grazer(a, dt, d, bx, bz, far); break;
        case 'wader': this._wader(a, dt, d, bx, bz, far); break;
        case 'gator': this._gator(a, dt, d, bx, bz); break;
        case 'squirrel': this._squirrel(a, dt, d, bx, bz, far); break;
        case 'swimmer': this._swimmer(a, dt, d, bx, bz, far); break;
        case 'seal': this._seal(a, dt, far); break;
        case 'soar': this._soar(a, dt, night); break;
        case 'pelican': break;
        case 'flyer': this._flyer(a, dt); break;
        case 'glider': this._glider(a, dt, t, night); continue;
      }
      if (a.herd) this._place(a);
    }
    if (this.pelicanLine) this._pelicanLine(dt, night);
    this._sounds(dt, cam);
  }

  _turn(a, to, rate, dt) { a.yaw += Math.max(-rate * dt, Math.min(rate * dt, angDiff(a.yaw, to))); }

  _move(a, speed, dt, len) {
    const nx = a.x - Math.sin(a.yaw) * speed * dt, nz = a.z - Math.cos(a.yaw) * speed * dt;
    // keep out of play and the water while walking; turn aside instead
    const sf = this._surf(nx, nz);
    if (sf === 'water' || sf === 'green' || sf === 'tee' || sf === 'sand') { a.yaw += 1.2 * dt * (a.dirSign ||= this.rnd() < 0.5 ? -1 : 1); return; }
    a.x = nx; a.z = nz;
    this._onGround(a, len);
  }

  _grazer(a, dt, d, bx, bz, far) {
    const len = a.species === 'deer' ? 1.6 * a.s : a.species === 'sheep' ? 1.1 * a.s : 0.6 * a.s;
    // the stubborn goose: it squares up to the ball, head low, and holds its ground
    if (a.stubborn && d < 12 && a.state !== 'flee') { a.state = 'standoff'; a.timer = 5; a.tx = bx; a.tz = bz; }
    if (a.state !== 'flee' && a.state !== 'standoff' && d < a.fleeR) {
      if (a.species === 'goose' && d < 10 && a.fly) { this._takeOff(a, bx, bz, a.fly, { climb: 0.32, speed: 11, scale: a.s }); return; }
      a.state = 'flee'; a.timer = 3 + this.rnd() * 3; a.from = [bx, bz];
      a.goal = yawTo(a.x - bx, a.z - bz) + (this.rnd() - 0.5) * 0.6;
    } else if (a.state !== 'flee' && a.state !== 'alert' && a.state !== 'standoff' && d < a.alertR) {
      a.state = 'alert'; a.timer = 1.5 + this.rnd() * 2; a.goal = yawTo(bx - a.x, bz - a.z);
    }
    if (far && a.state === 'graze') return;
    switch (a.state) {
      case 'graze':
        a.head = approach(a.head, 1, dt * 1.5); a.gait = approach(a.gait, 0, dt * 3);
        if (a.timer <= 0) {
          const r = this.rnd();
          if (r < 0.35) { a.state = 'look'; a.timer = 1.5 + this.rnd() * 3; } else if (r < 0.75) { a.state = 'walk'; a.timer = 1 + this.rnd() * 2.5; a.goal = a.yaw + (this.rnd() - 0.5) * 1.6; } else a.timer = 2 + this.rnd() * 5;
        }
        break;
      case 'look':
        a.head = approach(a.head, 0, dt * 2.5);
        if (a.timer <= 0) { a.state = 'graze'; a.timer = 3 + this.rnd() * 7; }
        break;
      case 'walk':
        a.head = approach(a.head, 0.55, dt * 2); a.gait = approach(a.gait, 0.45, dt * 3);
        this._turn(a, a.goal, 0.8, dt);
        this._move(a, a.walk * 0.6, dt, len);
        if (a.timer <= 0) { a.state = 'graze'; a.timer = 3 + this.rnd() * 6; }
        break;
      case 'alert':
        a.head = approach(a.head, -0.12, dt * 4); a.gait = approach(a.gait, 0, dt * 4);
        this._turn(a, a.goal, 2.5, dt);
        if (a.timer <= 0) { a.state = 'graze'; a.timer = 4 + this.rnd() * 6; }
        break;
      case 'flee':
        a.head = approach(a.head, -0.1, dt * 4); a.gait = approach(a.gait, 1, dt * 3);
        this._turn(a, a.goal, 3, dt);
        this._move(a, a.run * Math.min(1, a.gait + 0.2), dt, len);
        if (a.timer <= 0) { a.state = 'alert'; a.timer = 3 + this.rnd() * 3; a.goal = a.yaw; }
        break;
      case 'standoff':
        a.head = approach(a.head, 0.35, dt * 3); a.gait = approach(a.gait, 0, dt * 4);
        this._turn(a, yawTo(a.tx - a.x, a.tz - a.z), 3, dt);
        if (!a.hissed) { a.hissed = true; this._hiss(a); }
        if (a.timer <= 0) { a.state = 'graze'; a.timer = 6; a.hissed = false; }
        break;
    }
  }

  /** Swap a standing bird for a flying one, away from the ball. */
  _takeOff(a, bx, bz, fly, { climb = 0.3, speed = 10, scale = 1, flapRate = 1, land = null } = {}) {
    const i = fly.add();
    if (i < 0) { a.state = 'flee'; a.timer = 3; return; }
    a.hidden = true; a.state = 'gone';
    this._place(a);
    const away = bx == null ? a.yaw : yawTo(a.x - bx, a.z - bz) + (this.rnd() - 0.5) * 0.5;
    const f = { herd: fly, i, type: 'flyer', x: a.x, y: a.y + 0.3, z: a.z, yaw: away, s: scale, pitch: climb, roll: 0, phase: this.rnd() * TAU, head: 0, gait: 0, flap: flapRate, t: 0, timer: 30, speed, climb, land, from: a };
    this.animals.push(f);
    this._wingBurst(a);
    if (a.species === 'goose') this._honk(a, 3 + Math.floor(this.rnd() * 3));
  }

  _flyer(f, dt) {
    const sp = Math.min(f.speed, 3 + f.t * 4);
    if (f.land) {
      // a short hop to another spot (a heron to the far bank): out, along, and down
      const dx = f.land[0] - f.x, dz = f.land[1] - f.z, dist = Math.hypot(dx, dz);
      this._turn(f, yawTo(dx, dz), 1.2, dt);
      const gy = this.ground(f.x, f.z) + Math.min(9, dist * 0.18);
      f.y = approach(f.y, gy, dt * 1.5);
      f.pitch = approach(f.pitch, 0, dt);
      f.flap = dist < 15 ? 1 : 0.55 + 0.45 * Math.max(0, Math.sin(f.t * 0.9));
      if (dist < 1.5) {
        const a = f.from;
        a.x = f.land[0]; a.z = f.land[1]; a.yaw = f.yaw; a.hidden = false; a.state = 'stand'; a.timer = 6;
        a.y = this.ground(a.x, a.z);
        f.hidden = true; f.type = 'done';
        this._place(a);
      }
    } else {
      f.pitch = approach(f.pitch, f.t > 4 ? 0.08 : f.climb, dt * 0.5);
      f.y += Math.sin(f.pitch) * sp * dt;
      f.flap = f.t < 6 ? 1 : 0.55;
      if (f.timer <= 0 || f.y > 160) { f.hidden = true; f.type = 'done'; }
    }
    f.x -= Math.sin(f.yaw) * Math.cos(f.pitch) * sp * dt;
    f.z -= Math.cos(f.yaw) * Math.cos(f.pitch) * sp * dt;
  }

  _wader(a, dt, d, bx, bz, far) {
    if (a.state === 'gone') return;
    if (d < 24) {
      // up and away, low over the water to another bank
      const banks = this._banks(9).filter(([x, z]) => Math.hypot(x - bx, z - bz) > 60 && this._clear(x, z, { margin: 2 }));
      const to = banks.length ? banks[Math.floor(this.rnd() * banks.length)] : null;
      this._takeOff(a, bx, bz, a.fly, { climb: 0.2, speed: 7, scale: a.egret ? 0.62 : 0.72, flapRate: 0.8, land: to ? [to[0], to[1]] : null });
      return;
    }
    if (far) return;
    switch (a.state) {
      case 'stand':
        a.head = approach(a.head, 0, dt * 2); a.gait = approach(a.gait, 0, dt * 3);
        if (a.timer <= 0) {
          const r = this.rnd();
          if (r < 0.4) { a.state = 'stalk'; a.timer = 2 + this.rnd() * 4; a.goal = a.yaw + (this.rnd() - 0.5) * 1.2; } else if (r < 0.6) { a.state = 'strike'; a.timer = 0.9; } else a.timer = 3 + this.rnd() * 6;
        }
        break;
      case 'stalk':
        a.head = approach(a.head, 0.25, dt * 2); a.gait = approach(a.gait, 0.35, dt * 2);
        this._turn(a, a.goal, 0.5, dt);
        {
          const nx = a.x - Math.sin(a.yaw) * 0.18 * dt, nz = a.z - Math.cos(a.yaw) * 0.18 * dt;
          if (this.T.greenEdge(nx, nz) > 10) { a.x = nx; a.z = nz; }
        }
        if (a.timer <= 0) { a.state = 'stand'; a.timer = 3 + this.rnd() * 5; }
        break;
      case 'strike':
        // the spear at the water, fast down and slowly back
        a.head = a.timer > 0.6 ? approach(a.head, 1, dt * 14) : approach(a.head, 0, dt * 3);
        if (a.timer <= 0) { a.state = 'stand'; a.timer = 4 + this.rnd() * 6; }
        break;
    }
  }

  _gator(a, dt, d, bx, bz) {
    const p = a.pond;
    const deep = p.level - 0.7 * a.s; // only the eyes, the snout and a line of the back above the surface
    switch (a.state) {
      case 'bask':
        // still as a log; now and then the head lifts a little
        a.head = approach(a.head, a.timer % 9 < 1.5 ? -0.5 : 0, dt);
        if (d < 15 || (a.timer <= 0 && this.rnd() < 0.003)) { a.state = 'rouse'; a.timer = 0.5 + this.rnd() * 0.6; }
        if (a.timer <= 0) a.timer = 4 + this.rnd() * 8;
        break;
      case 'rouse':
        a.head = approach(a.head, -1, dt * 4);
        if (a.timer <= 0) { a.state = 'slide'; a.timer = 8; }
        break;
      case 'slide': {
        // into the water: down the bank, the tail swinging, sinking as it goes
        a.gait = approach(a.gait, 0.9, dt * 2);
        a.head = approach(a.head, -0.3, dt * 2);
        const sp = 1.1;
        a.x -= Math.sin(a.yaw) * sp * dt; a.z -= Math.cos(a.yaw) * sp * dt;
        const wet = this._surf(a.x, a.z) === 'water';
        const gy = this.ground(a.x, a.z) - 0.22 * a.s;
        if (!wet) {
          this._onGround(a, 3 * a.s); a.y = Math.max(a.y, gy);
          if (a.timer <= 0) { a.state = 'bask'; a.gait = 0; a.timer = 10; } // a bank too long to reach the water: it settles again
        } else {
          if (!a.splashed) { a.splashed = true; this._splash(a); }
          a.y = approach(a.y, deep, dt * 0.8);
          a.pitch = approach(a.pitch, 0.19, dt);
          if (Math.abs(a.y - deep) < 0.05 || a.timer <= 0) { a.state = 'float'; a.timer = 6; }
        }
        break;
      }
      case 'float': {
        a.y = approach(a.y, deep + Math.sin(a.t * 0.7 + a.phase) * 0.012, dt);
        a.pitch = approach(a.pitch, 0.19, dt);
        a.head = approach(a.head, -0.6, dt);
        a.gait = approach(a.gait, 0.25, dt);
        // drift: a slow cruise, turning away from the banks
        const sp = 0.22;
        const nx = a.x - Math.sin(a.yaw) * sp * dt * 6, nz = a.z - Math.cos(a.yaw) * sp * dt * 6;
        if (this._surf(nx, nz) !== 'water' || this.T.greenEdge(nx, nz) < 4) a.yaw += dt * 0.6; else { a.x -= Math.sin(a.yaw) * sp * dt; a.z -= Math.cos(a.yaw) * sp * dt; }
        if (d < 7) { a.state = 'dive'; a.timer = 2.5; }
        break;
      }
      case 'dive':
        a.y = approach(a.y, deep - 1.2, dt * 0.9);
        if (a.timer <= 0) { a.state = 'under'; a.timer = 18 + this.rnd() * 20; a.hidden = true; }
        break;
      case 'under':
        if (a.timer <= 0) {
          // surfaces again somewhere else in the pond
          const spot = this._inPond(p, 4);
          if (spot) { a.x = spot[0]; a.z = spot[1]; }
          a.hidden = false; a.state = 'float'; a.y = deep - 0.4;
        }
        break;
    }
    a.near = d;
  }

  _squirrel(a, dt, d, bx, bz, far) {
    if (a.state === 'gone') return;
    if (d < 22 && a.state !== 'dash' && a.state !== 'climb') { a.state = 'dash'; a.timer = 4; }
    if (far && a.state === 'forage') return;
    switch (a.state) {
      case 'forage':
        // nose down, a hop, sit up
        a.head = approach(a.head, a.timer % 3 < 1 ? -0.4 : 1, dt * 6); a.gait = approach(a.gait, 0, dt * 6);
        if (a.timer <= 0) { a.state = 'hop'; a.timer = 0.4 + this.rnd() * 0.5; a.goal = a.yaw + (this.rnd() - 0.5) * 2.5; }
        break;
      case 'hop':
        a.gait = 1; this._turn(a, a.goal, 6, dt); this._move(a, 2.2, dt, 0.3);
        if (a.timer <= 0) { a.state = 'forage'; a.timer = 2 + this.rnd() * 5; }
        break;
      case 'dash': {
        // for the tree, then up it
        const t = a.tree, dx = t.x - a.x, dz = t.z - a.z, dist = Math.hypot(dx, dz);
        a.gait = 1; a.head = 0.2;
        this._turn(a, yawTo(dx, dz), 9, dt);
        if (dist > 0.6) { a.x -= Math.sin(a.yaw) * 5.5 * dt; a.z -= Math.cos(a.yaw) * 5.5 * dt; this._onGround(a, 0.3); }
        if (dist < 0.9 || a.timer <= 0) {
          // the trunk's near face: stand head-up on it
          const r = 0.3; // the trunk's near face
          a.x = t.x - (dx / (dist || 1)) * r; a.z = t.z - (dz / (dist || 1)) * r;
          a.state = 'climb'; a.timer = 3; a.yaw = yawTo(dx, dz); a.pitch = Math.PI / 2; a.y = this.ground(a.x, a.z) + 0.2;
        }
        break;
      }
      case 'climb':
        a.y += 1.8 * dt; a.gait = 1;
        if (a.timer <= 0) { a.state = 'gone'; a.hidden = true; }
        break;
    }
  }

  _swimmer(a, dt, d, bx, bz, far) {
    if (far) return;
    const p = a.pond;
    a.y = p.level - 0.1 + Math.sin(a.t * 1.3 + a.phase) * 0.01;
    let sp = 0.12;
    if (d < 16) { a.goal = yawTo(a.x - bx, a.z - bz); sp = 1.0; }
    else if (a.timer <= 0) { a.goal = a.yaw + (this.rnd() - 0.5) * 2; a.timer = 4 + this.rnd() * 8; }
    if (a.goal != null) this._turn(a, a.goal, 1.2, dt);
    a.head = approach(a.head, a.timer % 7 < 0.8 ? 0.8 : 0, dt * 3); // a dabble now and then
    const nx = a.x - Math.sin(a.yaw) * sp * dt, nz = a.z - Math.cos(a.yaw) * sp * dt;
    if (this._surf(nx, nz) === 'water' && this.T.greenEdge(nx, nz) > 3) { a.x = nx; a.z = nz; } else a.goal = a.yaw + Math.PI * 0.7;
  }

  _seal(a, dt, far) {
    if (far) return;
    // lying out: a lift of the head now and then, the bark of a sea lion
    const up = a.timer % 11 < 2.5;
    a.head = approach(a.head, up ? -1 : 0.2, dt * 1.2);
    if (a.timer <= 0) { a.timer = 6 + this.rnd() * 10; if (a.lion && this.rnd() < 0.5) this._bark(a); }
  }

  _soar(a, dt, night) {
    a.hidden = night;
    if (night) return;
    // a wide circle on the thermal, banked into the turn; the circle drifts slowly downwind
    a.ang += (a.speed / a.r) * dt * a.dir;
    a.cx += Math.sin(a.t * 0.02 + a.phase) * 0.6 * dt; a.cz += Math.cos(a.t * 0.017 + a.phase) * 0.6 * dt;
    a.x = a.cx + Math.cos(a.ang) * a.r; a.z = a.cz + Math.sin(a.ang) * a.r;
    // heading along the circle's tangent
    const tx = -Math.sin(a.ang) * a.dir, tz = Math.cos(a.ang) * a.dir;
    a.yaw = yawTo(tx, tz);
    a.roll = -a.dir * Math.atan((a.speed * a.speed) / (9.8 * a.r)) * 0.9;
    a.y = this.ground(a.cx, a.cz) + a.alt + Math.sin(a.t * 0.1 + a.phase) * 4;
    a.pitch = 0;
    // a few beats now and then, otherwise the long glide
    const c = (a.t + a.phase * 3) % a.flapEvery;
    a.flap = c < (a.gull ? 1.6 : 1.2) ? 1 : 0;
  }

  _pelicanLine(dt, night) {
    const L = this.pelicanLine;
    L.t += dt;
    const birds = this.animals.filter((a) => a.type === 'pelican');
    const run = L.len / L.speed;
    const u = L.t / run; // -… waiting, 0..1 passing
    const show = !night && u >= 0 && u <= 1;
    for (const a of birds) {
      a.hidden = !show;
      if (show) {
        const along = (u - 0.5) * L.len - a.k * 7, aside = a.k * 3.2;
        a.x = L.ox + L.ax * along + L.az * aside; a.z = L.oz + L.az * along - L.ax * aside;
        a.y = this.T.seaLevel + 7 + Math.sin(L.t * 0.3 + a.k * 0.4) * 1.5;
        a.yaw = yawTo(L.ax, L.az);
        a.roll = 0; a.pitch = 0;
        // a ripple of wingbeats passes down the line, then they glide
        const c = (L.t - a.k * 0.35) % 9;
        a.flap = c > 0 && c < 1.6 ? 0.8 : 0;
      }
      this._place(a);
    }
    if (u > 1) { L.t = -(25 + this.rnd() * 50); L.ax = -L.ax; L.az = -L.az; }
  }

  _glider(g, dt, t, night) {
    g.obj.visible = !night;
    if (night) return;
    // back and forth along the cliff in its lift, turning out to sea at each end
    g.u += (g.speed / (g.span * 2.4)) * dt;
    const ph = g.u * TAU;
    const along = Math.sin(ph) * g.span, out = (1 - Math.cos(ph * 2)) * 12;
    const x = g.cx + g.ax * along + g.wx * out, z = g.cz + g.az * along + g.wz * out;
    const vx = g.ax * Math.cos(ph) + g.wx * Math.sin(ph * 2) * 0.1, vz = g.az * Math.cos(ph) + g.wz * Math.sin(ph * 2) * 0.1;
    g.obj.position.set(x, g.base + g.alt + Math.sin(t * 0.13 + g.phase) * 5, z);
    g.obj.rotation.set(0, yawTo(vx, vz), -Math.sin(ph) * 0.25 * Math.sign(Math.cos(ph)), 'YXZ');
  }

  // ── the ball came to rest: a rare cutaway when it stops beside a gator ──
  /** Called once when the ball stops (game._onRest). Returns a moment for js/ui/moments.js, or null. */
  ballRest(rest) {
    if (this.momentUsed) return null;
    let best = null;
    for (const a of this.animals) {
      if (a.type !== 'gator' || a.hidden) continue;
      const d = Math.hypot(a.x - rest.x, a.z - rest.z);
      if (d < 9 && (!best || d < best.d)) best = { a, d };
    }
    if (!best || this.rnd() > 0.6) return null;
    this.momentUsed = true;
    const a = best.a;
    if (a.state === 'bask' || a.state === 'rouse') { a.state = 'rouse'; a.timer = 1.6; }
    return { kind: 'gator', at: { x: a.x, y: a.y, z: a.z }, ball: rest, yaw: a.yaw, len: 3 * a.s };
  }

  // ── sound: synthesised under the ambience bed, quiet, from where the animal is ──
  _out(gain, x, z, cam) {
    const ctx = audio.ctx;
    if (!ctx || !audio.amb) return null;
    const d = cam ? Math.hypot(x - cam.x, z - cam.z) : 50;
    const g = ctx.createGain();
    g.gain.value = gain * Math.min(1, 40 / Math.max(10, d));
    let out = g;
    if (ctx.createStereoPanner && cam) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-0.8, Math.min(0.8, (x - cam.x) / Math.max(20, d)));
      g.connect(p); p.connect(audio.amb);
    } else g.connect(audio.amb);
    return { ctx, out, t: ctx.currentTime };
  }

  _sounds(dt, cam) {
    this._cam = cam;
    if (!audio.ctx) return;
    this._songT -= dt;
    if (this._songT > 0) return;
    const song = this.roster.song;
    this._songT = 7 + this.rnd() * 16;
    if (!song || this.day < 0.3) return;
    const c = cam || { x: 0, z: 0 };
    const a = this.rnd() * TAU, r = 30 + this.rnd() * 60;
    if (song === 'cardinal') this._cardinal(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, cam);
    else if (song === 'gull') this._gullCall(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, cam);
  }

  /** Northern cardinal: a run of clear down-slurred whistles ("cheer cheer cheer"). */
  _cardinal(x, z, cam) {
    const o = this._out(0.05, x, z, cam);
    if (!o) return;
    const { ctx, out } = o;
    const n = 3 + Math.floor(this.rnd() * 5), hi = 3600 + this.rnd() * 700, lo = 1900 + this.rnd() * 300, len = 0.16 + this.rnd() * 0.08;
    for (let i = 0; i < n; i++) {
      const st = o.t + i * (len + 0.09);
      const os = ctx.createOscillator(), g = ctx.createGain();
      os.type = 'sine';
      os.frequency.setValueAtTime(hi, st);
      os.frequency.exponentialRampToValueAtTime(lo, st + len);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(1, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, st + len);
      os.connect(g).connect(out);
      os.start(st); os.stop(st + len + 0.02);
    }
  }

  /** A gull's mewing "kyow", in a short falling series. */
  _gullCall(x, z, cam) {
    const o = this._out(0.035, x, z, cam);
    if (!o) return;
    const { ctx, out } = o;
    const n = 1 + Math.floor(this.rnd() * 4);
    for (let i = 0; i < n; i++) {
      const st = o.t + i * 0.42, f = 1250 - i * 60 + this.rnd() * 120;
      const os = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      os.type = 'sawtooth';
      os.frequency.setValueAtTime(f * 0.75, st);
      os.frequency.linearRampToValueAtTime(f, st + 0.08);
      os.frequency.exponentialRampToValueAtTime(f * 0.7, st + 0.32);
      bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 2.5;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(1, st + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.34);
      os.connect(bp).connect(g).connect(out);
      os.start(st); os.stop(st + 0.36);
    }
  }

  /** Canada geese honking as they lift off. */
  _honk(a, n) {
    const o = this._out(0.06, a.x, a.z, this._cam);
    if (!o) return;
    const { ctx, out } = o;
    for (let i = 0; i < n; i++) {
      const st = o.t + i * (0.22 + this.rnd() * 0.15), f = 330 + this.rnd() * 60;
      const os = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      os.type = 'sawtooth';
      os.frequency.setValueAtTime(f * 0.85, st);
      os.frequency.linearRampToValueAtTime(f * 1.12, st + 0.06);
      os.frequency.linearRampToValueAtTime(f, st + 0.16);
      bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 3;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(1, st + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.18);
      os.connect(bp).connect(g).connect(out);
      os.start(st); os.stop(st + 0.2);
    }
  }

  /** A goose's hiss: breath through a narrow band. */
  _hiss(a) {
    const o = this._out(0.05, a.x, a.z, this._cam);
    if (!o) return;
    const { ctx, out } = o;
    const len = 1.1, buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.min(1, i / 2000) * Math.min(1, (d.length - i) / 8000);
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter();
    src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 1.2;
    src.connect(bp).connect(out); src.start(o.t);
  }

  /** Wings beating hard on take-off: soft noise bursts. */
  _wingBurst(a) {
    const o = this._out(0.04, a.x, a.z, this._cam);
    if (!o) return;
    const { ctx, out } = o;
    const len = 0.9, buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) { const t = i / ctx.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.max(0, Math.sin(t * TAU * 5)) ** 2 * (1 - t / len); }
    const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter();
    src.buffer = buf; lp.type = 'lowpass'; lp.frequency.value = 900;
    src.connect(lp).connect(out); src.start(o.t);
  }

  /** California sea lion: a hoarse bark, three or four times. */
  _bark(a) {
    const o = this._out(0.07, a.x, a.z, this._cam);
    if (!o) return;
    const { ctx, out } = o;
    const n = 2 + Math.floor(this.rnd() * 3);
    for (let i = 0; i < n; i++) {
      const st = o.t + i * 0.45, os = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      os.type = 'sawtooth';
      os.frequency.setValueAtTime(260, st); os.frequency.exponentialRampToValueAtTime(190, st + 0.22);
      bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 1.5;
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(1, st + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.25);
      os.connect(bp).connect(g).connect(out); os.start(st); os.stop(st + 0.27);
    }
  }

  _splash(a) {
    if (!this._cam) return;
    const d = Math.hypot(a.x - this._cam.x, a.z - this._cam.z);
    if (d < 250) audio.splash?.(Math.max(0.05, 0.25 * (1 - d / 250)));
  }
}

// ── the Gliderport's wings (built here: a sail, a frame, a pilot) ──
function sailTex(c1, c2) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 8;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? c2 : c1; g.fillRect(i * 8, 0, 8, 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const SAILS = [['#d8452b', '#f2efe6'], ['#1f5fa8', '#f2c230'], ['#2d8a57', '#f2efe6'], ['#7a3fa0', '#e9c97a'], ['#e07a1f', '#2a2a2a']];

function pilot(mat) {
  const p = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.1, 3, 8).rotateX(Math.PI / 2), mat);
  return p;
}

function paraglider(rnd) {
  const g = new THREE.Group();
  const [c1, c2] = SAILS[Math.floor(rnd() * SAILS.length)];
  // the canopy: an arched, cambered wing 11 m across, cells as stripes
  const geo = new THREE.PlaneGeometry(11, 2.6, 16, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), a = (x / 5.5) * 1.05;
    pos.setXYZ(i, Math.sin(a) * 5.8, Math.cos(a) * 5.8 - 5.8 + 7.5, y);
  }
  geo.computeVertexNormals();
  const sail = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: sailTex(c1, c2), side: THREE.DoubleSide, roughness: 0.7 }));
  g.add(sail);
  // the lines, gathered to the pilot
  const lp = [];
  for (let k = -4; k <= 4; k++) { const a = (k / 4) * 1.0; lp.push(Math.sin(a) * 5.8, Math.cos(a) * 5.8 - 5.8 + 7.5, 0, 0, 0.3, 0.2); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.5 })));
  g.add(pilot(new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.8 })));
  g.traverse((o) => { o.castShadow = false; });
  return g;
}

function hangGlider(rnd) {
  const g = new THREE.Group();
  const [c1, c2] = SAILS[Math.floor(rnd() * SAILS.length)];
  // a delta wing 10 m across, swept back, a little anhedral; the pilot prone under the keel
  const v = new Float32Array([0, 2.2, -2.2, -5, 1.9, 1.6, 0, 2.0, 0.9, 0, 2.2, -2.2, 0, 2.0, 0.9, 5, 1.9, 1.6]);
  const uv = new Float32Array([0.5, 0, 0, 1, 0.5, 0.8, 0.5, 0, 0.5, 0.8, 1, 1]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: sailTex(c1, c2), side: THREE.DoubleSide, roughness: 0.6 })));
  const frame = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4 });
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5).rotateZ(Math.PI / 2), frame); bar.position.set(0, 0.6, -0.3); g.add(bar);
  for (const s of [-1, 1]) { const u = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 5), frame); u.position.set(s * 0.4, 1.35, -0.3); u.rotation.z = s * 0.5; g.add(u); }
  const p = pilot(new THREE.MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.8 })); p.position.set(0, 0.95, 0.4); g.add(p);
  g.traverse((o) => { o.castShadow = false; });
  return g;
}
