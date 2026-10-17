// Wildlife: the animals that live on each course, placed by the ground they
// need and moving on their own, quietly. Bodies and their animation are in
// js/scene/fauna.js; this file decides who lives where and what they do.
//
// Who (checked against field guides and the clubs' own accounts):
//   TPC Sawgrass   American alligators on the pond banks and floating with only
//                  the eyes and snout up; great egrets and great blue herons
//                  stalking the edges; ospreys and bald eagles overhead (NE
//                  Florida has hundreds of nesting pairs of each); grey squirrels
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
import { Beast, preloadRigs } from '../scene/fauna.js';
import { audio } from '../audio/audio.js';
import { store } from '../data/store.js';

const MIDWEST = { deer: [2, 5], geese: [5, 10], squirrels: [2, 4], soar: [['eagle', 1, { river: true }], ['hawk', 1]], song: 'cardinal' };
const ROSTERS = {
  sawgrass: { gators: [2, 4], waders: [2, 4], squirrels: [1, 3], soar: [['osprey', 1], ['eagle', 1]], song: 'cardinal' },
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

/** Fetch the rigged animals a course needs (called with the course's other models). */
export function preloadWildlife(courseId, theme) {
  const r = rosterFor({ course: courseId, theme });
  const k = [];
  if (r.gators) k.push('gator');
  if (r.waders) k.push('heron', 'egret', 'heron_fly', 'egret_fly');
  if (r.deer) k.push('doe', 'buck');
  if (r.geese) k.push('goose', 'goose_fly');
  if (r.sheep) k.push('sheep');
  if (r.squirrels) k.push('squirrel');
  if (r.mallards) k.push('mallard');
  if (r.seals) k.push('sealion', 'harborseal');
  for (const [kind] of r.soar || []) k.push(kind === 'hawk' ? 'eagle' : kind);
  if (r.gulls) k.push('gull');
  if (r.pelicans) k.push('pelican');
  return preloadRigs(k);
}

// ── small helpers ──
const TAU = Math.PI * 2;
const yawTo = (dx, dz) => Math.atan2(-dx, -dz); // heading that faces (dx, dz)
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const approach = (v, to, k) => v + (to - v) * Math.min(1, k);
const NEAR = 260; // animation runs within this distance of the camera; past FAR an animal is not drawn
const FAR = 650;

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
    this.day = 1;
    this.roster = rosterFor(hole);
    this.trees = trees;
    this.prevBall = null;
    this.momentUsed = false;
    this._songT = 4 + rnd() * 6;
    this.lite = quality < 1; // tablets: fewer animals
    try { this._populate(); } catch (e) { console.warn('wildlife: placement failed', e); }
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
        acc += Math.hypot(bx - ax, bz - az);
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

  /** A rigged animal record: its body (`b`), where it is, what it is doing. */
  _add(kind, a, opts = {}) {
    a.b = new Beast(kind, opts);
    a.s = opts.scale ?? 1;
    this.group.add(a.b.root);
    a.kind = kind;
    a.yaw ??= this.rnd() * TAU; a.pitch ??= 0; a.roll ??= 0; a.y ??= 0;
    a.t = 0; a.timer ??= 1 + this.rnd() * 6;
    this.animals.push(a);
    a.b.place(a.x, a.y, a.z, a.yaw, a.pitch, a.roll);
    return a;
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
    for (let k = 0; k < n; k++) {
      const s = 0.8 + this.rnd() * 0.3; // 2.6–3.5 m
      if (banks.length && this.rnd() < 0.6) {
        // basking on the bank, nose to the water
        const [x, z, nx, nz, pond] = banks.splice(Math.floor(this.rnd() * banks.length), 1)[0];
        const a = this._add('gator', { type: 'gator', state: 'bask', x: x + nx * 2.2, z: z + nz * 2.2, yaw: yawTo(-nx, -nz) + (this.rnd() - 0.5) * 0.6, pond, len: 3 * s }, { scale: s });
        this._onGround(a, a.len);
        a.b.play('bask');
      } else {
        // floating: eyes, nostrils and a line of back above the surface
        const p = this.T.ponds[Math.floor(this.rnd() * this.T.ponds.length)];
        const spot = this._inPond(p, 4);
        if (!spot) continue;
        const a = this._add('gator', { type: 'gator', state: 'float', x: spot[0], z: spot[1], pond: p, y: p.level - 0.2 * s, len: 3 * s }, { scale: s, shadow: false });
        a.b.play('float');
      }
    }
  }

  _waders(n) {
    const banks = this._banks(7);
    for (let k = 0; k < n && banks.length; k++) {
      const egret = this.rnd() < 0.55;
      const [x, z, nx, nz] = banks.splice(Math.floor(this.rnd() * banks.length), 1)[0];
      // at the water's edge, often a step into the shallows
      const w = (this.rnd() - 0.3) * 1.2;
      const px = x + nx * w, pz = z + nz * w;
      if (!this._clear(px + nx * 2, pz + nz * 2, { margin: 2 })) continue;
      const a = this._add(egret ? 'egret' : 'heron', { type: 'wader', state: 'stand', x: px, z: pz, y: this.ground(px, pz) - (w < 0 ? 0.1 : 0), yaw: yawTo(-nx, -nz) + (this.rnd() - 0.5) * 1.6, egret }, { scale: 0.95 + this.rnd() * 0.1 });
      a.b.play('idle');
    }
  }

  _deer(n) {
    if (!n) return;
    const edge = this._treeEdge().filter(([x, z]) => this._clear(x, z, { margin: 10 }));
    const spots = edge.length ? edge : this._flank(20, 70, n);
    if (!spots.length) return;
    const R = this.roster;
    // Pebble's black-tailed deer and the mule deer of the plains: a greyer coat on the whitetail's form
    const tint = R.blacktail ? 0xc8bcaf : R.mule ? 0xcabdaf : null;
    const grey = R.blacktail ? 0.35 : R.mule ? 0.45 : 0;
    const [cx, cz, dx, dz] = spots[Math.floor(this.rnd() * spots.length)];
    for (let k = 0; k < n; k++) {
      const buck = k === 0 && this.rnd() < 0.3;
      const x = cx + (this.rnd() - 0.5) * 14 + dx * this.rnd() * 6, z = cz + (this.rnd() - 0.5) * 14 + dz * this.rnd() * 6;
      if (!this._clear(x, z, { margin: R.blacktail ? 4 : 10, fairway: !!R.blacktail })) continue;
      const fawn = !buck && k > 1 && this.rnd() < 0.3;
      const s = fawn ? 0.68 : 0.95 + this.rnd() * 0.08;
      const a = this._add(buck ? 'buck' : 'doe', { type: 'grazer', species: 'deer', state: 'graze', x, z, len: 1.6 * s, alertR: R.blacktail ? 22 : 45, fleeR: R.blacktail ? 10 : 26, roles: { walk: 'walk', flee: 'trot', run: 'run' } }, { scale: s, tint, grey });
      this._onGround(a, a.len);
      a.b.play('graze');
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
    // once in a while one bird will not be moved (Settings → Effects → Moments turns it off)
    const stubborn = this.rnd() < 0.15 && store.settings.moments !== false;
    for (let k = 0; k < n; k++) {
      const x = c[0] + (this.rnd() - 0.5) * 9, z = c[1] + (this.rnd() - 0.5) * 9;
      if (!this._clear(x, z, { fairway: true, margin: 2 })) continue;
      const a = this._add('goose', { type: 'grazer', species: 'goose', state: 'graze', x, z, len: 0.6, alertR: 30, fleeR: 14, roles: { walk: 'walk', flee: 'walk', run: 'run' }, stubborn: stubborn && k === 0 }, { scale: 0.92 + this.rnd() * 0.14 });
      this._onGround(a, a.len);
      a.b.play('graze');
    }
  }

  _sheep(n) {
    const spots = this._flank(18, 90, 3);
    if (!spots.length) return;
    const [cx, cz] = spots[0];
    for (let k = 0; k < n; k++) {
      const x = cx + (this.rnd() - 0.5) * 26, z = cz + (this.rnd() - 0.5) * 26;
      if (!this._clear(x, z, { margin: 12 })) continue;
      const s = 0.88 + this.rnd() * 0.16;
      const a = this._add('sheep', { type: 'grazer', species: 'sheep', state: 'graze', x, z, len: 1.1 * s, alertR: 28, fleeR: 16, roles: { walk: 'walk', flee: 'walk', run: 'walk' }, fleeScale: 2.2 }, { scale: s });
      this._onGround(a, a.len);
      a.b.play('graze');
    }
  }

  _squirrels(n) {
    const fox = !!this.roster.fox;
    const edge = this._treeEdge().filter(([x, z]) => this._clear(x, z, { margin: 4 }));
    for (let k = 0; k < n && edge.length; k++) {
      const [x, z, , , tree] = edge.splice(Math.floor(this.rnd() * edge.length), 1)[0];
      // the model's coat is a fox squirrel's; greyed for the eastern grey squirrel
      const a = this._add('squirrel', { type: 'squirrel', state: 'forage', x, z, tree }, fox ? { scale: 1.15, shadow: false } : { scale: 1, tint: 0xfff8f0, grey: 0.8, shadow: false });
      this._onGround(a, 0.3);
      a.b.play('graze');
    }
  }

  _mallards(n) {
    const p = this.T.ponds[Math.floor(this.rnd() * this.T.ponds.length)];
    for (let k = 0; k < n; k++) {
      const spot = this._inPond(p, 2);
      if (!spot) continue;
      const a = this._add('mallard', { type: 'swimmer', state: 'paddle', x: spot[0], z: spot[1], pond: p, y: p.level - 0.07 }, { scale: 0.9 + this.rnd() * 0.15, shadow: false });
      a.b.play('idle');
    }
  }

  _seals(n) {
    const coast = this._coast(n);
    if (!coast.length) return;
    // hauled out together on one stretch of rock
    const [cx, cz] = coast[0];
    const near = coast.filter(([x, z]) => Math.hypot(x - cx, z - cz) < 60);
    for (let k = 0; k < n && near.length; k++) {
      const [x, z, wx, wz] = near.splice(Math.floor(this.rnd() * near.length), 1)[0];
      const lion = this.rnd() < 0.4;
      const a = this._add(lion ? 'sealion' : 'harborseal', { type: 'seal', lion, state: 'lie', x, z, yaw: yawTo(wx, wz) + Math.PI + (this.rnd() - 0.5) * 1.2, len: 1.5, sink: -0.04 }, { scale: 0.9 + this.rnd() * 0.15 });
      this._onGround(a, a.len);
      a.b.play('idle');
    }
  }

  _soarers(kind, n, { river = false } = {}) {
    // eagles, ospreys and red-tailed hawks (the eagle's form in a red-tail's colours) circling on the thermals
    const hawk = kind === 'hawk';
    const T = this.T;
    for (let k = 0; k < n; k++) {
      const s = 0.3 + this.rnd() * 0.7;
      const p = T.pointAt(T.length * s);
      const side = this.rnd() < 0.5 ? -1 : 1, off = (river ? 160 : 60) + this.rnd() * 140;
      const cx = p.x + p.rx * off * side, cz = p.z + p.rz * off * side;
      const a = this._add(hawk ? 'eagle' : kind, { type: 'soar', x: cx, z: cz, cx, cz, r: 45 + this.rnd() * 50, alt: (hawk ? 55 : 80) + this.rnd() * 60, ang: this.rnd() * TAU, speed: hawk ? 9 : 11, dir: this.rnd() < 0.5 ? -1 : 1, flapEvery: 14 + this.rnd() * 10, phase: this.rnd() * TAU },
        hawk ? { scale: 0.6, tint: 0xc8996e, shadow: false } : { scale: kind === 'osprey' ? 1.0 : 1.0, shadow: false });
      a.b.play('glide');
    }
  }

  _gulls(n) {
    const T = this.T;
    for (let k = 0; k < n; k++) {
      const p = T.pointAt(T.length * this.rnd());
      const off = (this.rnd() - 0.5) * 300;
      const cx = p.x + p.rx * off, cz = p.z + p.rz * off;
      const a = this._add('gull', { type: 'soar', gull: true, x: cx, z: cz, cx, cz, r: 25 + this.rnd() * 45, alt: 18 + this.rnd() * 40, ang: this.rnd() * TAU, speed: 8 + this.rnd() * 3, dir: this.rnd() < 0.5 ? -1 : 1, flapEvery: 3 + this.rnd() * 4, phase: this.rnd() * TAU }, { scale: 0.95 + this.rnd() * 0.15, shadow: false });
      a.b.play('glide');
    }
  }

  _pelicans() {
    // brown pelicans: a line of them gliding low past the cliffs, flaps rippling down the line
    const T = this.T;
    if (T.seaLevel == null) return;
    const coast = this._coast(6);
    if (!coast.length) return;
    const n = 4 + Math.floor(this.rnd() * 5);
    const [x, z, wx, wz] = coast[0];
    const ax = -wz, az = wx;
    const ox = x + wx * 35, oz = z + wz * 35;
    this.pelicanLine = { ox, oz, ax, az, len: 900, t: -this.rnd() * 30, speed: 11 };
    for (let k = 0; k < n; k++) {
      const a = this._add('pelican', { type: 'pelican', k, x: ox, z: oz, y: -999 }, { scale: 0.95, shadow: false });
      a.b.root.visible = false;
      a.b.play('glide');
    }
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
      this.animals.push({ type: 'glider', obj: g, hang, cx: x + wx * 40, cz: z + wz * 40, ax: -wz, az: wx, wx, wz, span: 220 + this.rnd() * 200, u: this.rnd(), speed: hang ? 11 : 8, alt: (hang ? 70 : 55) + this.rnd() * 50, phase: this.rnd() * TAU, base: this.T.seaLevel, t: 0 });
    }
  }

  // ── every frame ──
  setDay(d) { this.day = d; }

  update(dt, t, camera, ball) {
    if (!this.animals.length) return;
    dt = Math.min(dt, 0.1);
    const cam = camera?.position;
    this._cam = cam;
    // the ball as a threat: moving and low (dropping in, bouncing, rolling)
    let bx = null, bz = null;
    if (ball) {
      const pv = this.prevBall;
      const bv = pv ? Math.hypot(ball.x - pv.x, ball.z - pv.z, ball.y - pv.y) / Math.max(dt, 1e-3) : 0;
      this.prevBall = { x: ball.x, y: ball.y, z: ball.z };
      if (bv > 0.4 && ball.y - this.ground(ball.x, ball.z) < 10) { bx = ball.x; bz = ball.z; }
    }
    const night = this.day < 0.25;
    for (const a of this.animals) {
      a.t += dt; a.timer -= dt;
      if (a.type === 'glider') { this._glider(a, dt, t, night); continue; }
      if (a.type === 'done') continue;
      const dc = cam ? Math.hypot(a.x - cam.x, a.z - cam.z) : 0;
      const d = bx == null ? Infinity : Math.hypot(a.x - bx, a.z - bz);
      const far = dc > NEAR && a.type !== 'soar' && a.type !== 'pelican' && a.type !== 'flyer';
      switch (a.type) {
        case 'grazer': this._grazer(a, dt, d, bx, bz, far); break;
        case 'wader': this._wader(a, dt, d, bx, bz, far); break;
        case 'gator': this._gator(a, dt, d); break;
        case 'squirrel': this._squirrel(a, dt, d, far); break;
        case 'swimmer': this._swimmer(a, dt, d, bx, bz, far); break;
        case 'seal': this._seal(a, far); break;
        case 'soar': this._soar(a, dt, night); break;
        case 'flyer': this._flyer(a, dt); break;
        default: break;
      }
      if (a.type === 'pelican') continue;
      const b = a.b;
      b.root.visible = !a.hidden && (a.type === 'soar' || a.type === 'flyer' || dc < FAR);
      b.awake = b.root.visible && (!far || a.type === 'soar');
      if (b.root.visible) { b.place(a.x, a.y, a.z, a.yaw, a.pitch, a.roll); b.update(dt * (a.rate || 1)); }
    }
    if (this.pelicanLine) this._pelicanLine(dt, night, cam);
    this._sounds(dt, cam);
  }

  _turn(a, to, rate, dt) { a.yaw += Math.max(-rate * dt, Math.min(rate * dt, angDiff(a.yaw, to))); }

  /** Walk forward at `speed`, staying out of play and the water: turn aside instead. */
  _move(a, speed, dt) {
    const nx = a.x - Math.sin(a.yaw) * speed * dt, nz = a.z - Math.cos(a.yaw) * speed * dt;
    const sf = this._surf(nx, nz);
    if (sf === 'water' || sf === 'green' || sf === 'tee' || sf === 'sand') { a.yaw += 1.2 * dt * (a.dirSign ||= this.rnd() < 0.5 ? -1 : 1); return; }
    a.x = nx; a.z = nz;
    this._onGround(a, a.len || 1);
  }

  /** Play a clip, and remember it (a crossfade only when it changes). */
  _clip(a, role, opts) { if (a.role !== role || opts?.force) { a.role = role; a.b.play(role, opts); } }

  _grazer(a, dt, d, bx, bz, far) {
    // the stubborn goose: it squares up to the ball, head low, and holds its ground
    if (a.stubborn && d < 12 && a.state !== 'standoff') { a.state = 'standoff'; a.timer = 5; a.tx = bx; a.tz = bz; this._clip(a, 'hiss'); this._hiss(a); }
    if (a.state !== 'flee' && a.state !== 'standoff' && a.state !== 'run' && d < a.fleeR) {
      if (a.species === 'goose' && d < 10) { a.state = 'run'; a.timer = 0.7; a.goal = yawTo(a.x - bx, a.z - bz); this._clip(a, 'run', { fade: 0.15 }); this._honk(a, 2 + Math.floor(this.rnd() * 3)); return; }
      a.state = 'flee'; a.timer = 3 + this.rnd() * 3;
      a.goal = yawTo(a.x - bx, a.z - bz) + (this.rnd() - 0.5) * 0.6;
    } else if (a.state !== 'flee' && a.state !== 'alert' && a.state !== 'standoff' && a.state !== 'run' && d < a.alertR) {
      a.state = 'alert'; a.timer = 1.5 + this.rnd() * 2; a.goal = yawTo(bx - a.x, bz - a.z);
    }
    if (far && a.state === 'graze') return;
    a.rate = 1;
    switch (a.state) {
      case 'graze':
        this._clip(a, 'graze');
        if (a.timer <= 0) {
          const r = this.rnd();
          if (r < 0.3) { a.state = 'look'; a.timer = 2 + this.rnd() * 3; } else if (r < 0.7) { a.state = 'walk'; a.timer = 1.5 + this.rnd() * 3; a.goal = a.yaw + (this.rnd() - 0.5) * 1.6; } else a.timer = 3 + this.rnd() * 6;
        }
        break;
      case 'look':
        this._clip(a, a.b.has('look') ? 'look' : a.b.has('alert') ? 'alert' : 'idle');
        if (a.timer <= 0) { a.state = 'graze'; a.timer = 4 + this.rnd() * 8; }
        break;
      case 'walk':
        this._clip(a, a.roles.walk);
        this._turn(a, a.goal, 0.6, dt);
        this._move(a, a.b.speed(a.roles.walk), dt);
        if (a.timer <= 0) { a.state = 'graze'; a.timer = 4 + this.rnd() * 6; }
        break;
      case 'alert':
        this._clip(a, a.b.has('alert') ? 'alert' : 'idle');
        this._turn(a, a.goal, 2.5, dt);
        if (a.timer <= 0) { a.state = 'graze'; a.timer = 4 + this.rnd() * 6; }
        break;
      case 'flee': {
        // deer go from a few trotting strides to a run; sheep and geese hurry off at a walk
        const role = a.species === 'deer' && a.timer > 1.5 ? a.roles.run : a.roles.flee; // bound away, then ease to a trot
        a.rate = a.fleeScale || 1;
        this._clip(a, role, { fade: 0.25 });
        this._turn(a, a.goal, 3, dt);
        this._move(a, a.b.speed(role) * a.rate, dt);
        if (a.timer <= 0) { a.state = 'alert'; a.timer = 3 + this.rnd() * 3; a.goal = a.yaw; }
        break;
      }
      case 'run': // a goose's take-off run, then into the air
        this._turn(a, a.goal, 4, dt);
        this._move(a, Math.max(1.2, a.b.speed('run')), dt);
        if (a.timer <= 0) this._takeOff(a, 'goose_fly', { climb: 0.3, speed: 11, scale: a.s, land: null });
        break;
      case 'standoff':
        this._turn(a, yawTo(a.tx - a.x, a.tz - a.z), 3, dt);
        if (a.timer <= 0) { a.state = 'graze'; a.timer = 6; }
        break;
    }
  }

  /** Swap a standing bird for its flying body, heading away (or to `land`, a spot to come down on). */
  _takeOff(a, flyKind, { climb = 0.3, speed = 10, scale = 1, land = null, pitch = 0 } = {}) {
    a.hidden = true; a.state = 'gone';
    const f = this._add(flyKind, { type: 'flyer', x: a.x, y: a.y + 0.2, z: a.z, yaw: a.goal ?? a.yaw, pitch, climb, speed, land, from: a, cruisePitch: pitch, timer: 30 }, { scale, shadow: false });
    f.b.play('takeoff', { fade: 0.05 });
    f.role = 'takeoff';
    this._wingBurst(a);
  }

  _flyer(f, dt) {
    const sp = Math.min(f.speed, 3 + f.t * 4);
    if (f.t > 1.2 && f.role === 'takeoff') this._clip(f, 'flap');
    if (f.land) {
      // a short flight to another spot (a heron to the far bank): up, along, and down
      const dx = f.land[0] - f.x, dz = f.land[1] - f.z, dist = Math.hypot(dx, dz);
      this._turn(f, yawTo(dx, dz), 1.2, dt);
      const gy = this.ground(f.x, f.z) + Math.min(8, dist * 0.18);
      f.y = approach(f.y, gy, dt * 1.5);
      // the take-off pose climbs steeply; level the body as the flight settles
      f.pitch = approach(f.pitch, f.cruise ?? 0, dt * 0.8);
      if (dist < 12 && f.role !== 'takeoff') this._clip(f, 'takeoff'); // braking beats as it comes in
      if (dist < 1.5) {
        const a = f.from;
        a.x = f.land[0]; a.z = f.land[1]; a.yaw = f.yaw; a.hidden = false; a.state = 'stand'; a.timer = 6;
        a.y = this.ground(a.x, a.z);
        a.b.play('alert', { fade: 0.1 }); a.role = 'alert';
        f.hidden = true; f.type = 'done'; f.b.root.visible = false;
      }
    } else {
      f.pitch = approach(f.pitch, f.t > 4 ? (f.cruise ?? 0) + 0.08 : (f.cruise ?? 0) + f.climb, dt * 0.5);
      f.y += Math.max(0.6, Math.sin(f.climb) * sp) * dt * (f.t < 6 ? 1 : 0.4);
      if (f.t > 6 && f.role === 'flap' && f.t % 6 > 4) this._clip(f, 'glide'); else if (f.t > 6) this._clip(f, 'flap');
      if (f.timer <= 0 || f.y > 160) { f.hidden = true; f.type = 'done'; f.b.root.visible = false; }
    }
    f.x -= Math.sin(f.yaw) * sp * dt;
    f.z -= Math.cos(f.yaw) * sp * dt;
  }

  _wader(a, dt, d, bx, bz, far) {
    if (a.state === 'gone') return;
    if (d < 24 && a.state !== 'crouch') {
      // a crouch, a spring, and away low over the water to another bank
      a.state = 'crouch'; a.timer = 0.55; a.goal = yawTo(a.x - bx, a.z - bz);
      a.flee = [bx, bz];
      this._clip(a, 'crouch', { fade: 0.1, once: true });
      return;
    }
    if (a.state === 'crouch') {
      this._turn(a, a.goal, 3, dt);
      if (a.timer <= 0) {
        const [fx, fz] = a.flee;
        const banks = this._banks(9).filter(([x, z]) => Math.hypot(x - fx, z - fz) > 60 && this._clear(x, z, { margin: 2 }));
        const to = banks.length ? banks[Math.floor(this.rnd() * banks.length)] : null;
        this._takeOff(a, a.egret ? 'egret_fly' : 'heron_fly', { climb: 0.25, speed: 7, scale: a.s, land: to ? [to[0], to[1]] : null });
        const f = this.animals[this.animals.length - 1];
        f.cruise = -0.85; // the crane-built flight body rests mid-climb: pitched down it flies level
      }
      return;
    }
    if (far) return;
    switch (a.state) {
      case 'stand':
        this._clip(a, 'idle');
        if (a.timer <= 0) {
          const r = this.rnd();
          if (r < 0.35) { a.state = 'stalk'; a.timer = 3 + this.rnd() * 4; a.goal = a.yaw + (this.rnd() - 0.5) * 1.2; } else if (r < 0.6) { a.state = 'strike'; a.timer = 1.4; this._clip(a, 'strike', { once: true, fade: 0.15, force: true }); } else a.timer = 4 + this.rnd() * 6;
        }
        break;
      case 'stalk': {
        this._clip(a, 'stalk');
        this._turn(a, a.goal, 0.5, dt);
        const sp = a.b.speed('stalk');
        const nx = a.x - Math.sin(a.yaw) * sp * dt, nz = a.z - Math.cos(a.yaw) * sp * dt;
        if (this.T.greenEdge(nx, nz) > 10) { a.x = nx; a.z = nz; }
        if (a.timer <= 0) { a.state = 'stand'; a.timer = 3 + this.rnd() * 5; }
        break;
      }
      case 'strike':
        if (a.timer <= 0) { a.state = 'stand'; a.timer = 4 + this.rnd() * 6; }
        break;
      default: // landed: alert a moment, then settle
        if (a.timer <= 0) { a.state = 'stand'; a.timer = 3; }
    }
  }

  _gator(a, dt, d) {
    const p = a.pond, k = a.s;
    const floatY = p.level - 0.2 * k; // the body under, the eyes, nostrils and the ridge of the back above
    switch (a.state) {
      case 'bask':
        this._clip(a, 'bask');
        if (d < 15 || (a.timer <= 0 && this.rnd() < 0.003)) { a.state = 'rouse'; a.timer = 0.9; this._clip(a, 'alert', { once: true, fade: 0.2 }); }
        if (a.timer <= 0) a.timer = 4 + this.rnd() * 8;
        break;
      case 'rouse':
        if (a.timer <= 0) { a.state = 'slide'; a.timer = 8; }
        break;
      case 'slide': {
        // into the water: down the bank on its belly, tail driving, sinking as it goes
        this._clip(a, 'slide', { fade: 0.3 });
        const sp = a.b.speed('slide') || 0.9;
        a.x -= Math.sin(a.yaw) * sp * dt; a.z -= Math.cos(a.yaw) * sp * dt;
        if (this._surf(a.x, a.z) !== 'water') {
          this._onGround(a, a.len);
          if (a.timer <= 0) { a.state = 'bask'; a.timer = 10; } // a bank too long to reach the water: it settles again
        } else {
          if (!a.splashed) { a.splashed = true; this._splash(a); }
          a.y = approach(a.y, floatY, dt * 0.8);
          a.pitch = approach(a.pitch, 0, dt);
          if (Math.abs(a.y - floatY) < 0.04 || a.timer <= 0) { a.state = 'float'; a.timer = 6; }
        }
        break;
      }
      case 'float': {
        a.y = approach(a.y, floatY + Math.sin(a.t * 0.7) * 0.01, dt);
        a.pitch = approach(a.pitch, 0, dt);
        // drift: a slow cruise, turning away from the banks
        const sp = a.t % 20 < 8 ? 0.25 : 0;
        this._clip(a, sp ? 'swim' : 'float', { fade: 0.8 });
        a.rate = sp ? 0.5 : 1;
        const nx = a.x - Math.sin(a.yaw) * sp * 6 * dt, nz = a.z - Math.cos(a.yaw) * sp * 6 * dt;
        if (this._surf(nx, nz) !== 'water' || this.T.greenEdge(nx, nz) < 4) a.yaw += dt * 0.6; else { a.x -= Math.sin(a.yaw) * sp * dt; a.z -= Math.cos(a.yaw) * sp * dt; }
        if (d < 7) { a.state = 'dive'; a.timer = 2.5; }
        break;
      }
      case 'dive':
        a.y = approach(a.y, floatY - 1.4, dt * 0.9);
        if (a.timer <= 0) { a.state = 'under'; a.timer = 18 + this.rnd() * 20; a.hidden = true; }
        break;
      case 'under':
        if (a.timer <= 0) {
          const spot = this._inPond(p, 4);
          if (spot) { a.x = spot[0]; a.z = spot[1]; }
          a.hidden = false; a.state = 'float'; a.y = floatY - 0.5;
        }
        break;
    }
  }

  _squirrel(a, dt, d, far) {
    if (a.state === 'gone') return;
    if (d < 22 && a.state !== 'dash' && a.state !== 'climb') { a.state = 'dash'; a.timer = 4; }
    if (far && a.state === 'forage') return;
    a.rate = 1;
    switch (a.state) {
      case 'forage':
        this._clip(a, 'graze');
        if (a.timer <= 0) {
          const r = this.rnd();
          if (r < 0.35) { a.state = 'sit'; a.timer = 2 + this.rnd() * 3; this._clip(a, 'sit', { once: true, fade: 0.2, force: true }); } else { a.state = 'hop'; a.timer = 0.5 + this.rnd() * 0.6; a.goal = a.yaw + (this.rnd() - 0.5) * 2.5; }
        }
        break;
      case 'sit':
        if (a.timer <= 0) { a.state = 'forage'; a.timer = 2 + this.rnd() * 4; }
        break;
      case 'hop':
        a.rate = 2.2; this._clip(a, 'run'); this._turn(a, a.goal, 6, dt); this._move(a, a.b.speed('run') * a.rate, dt);
        if (a.timer <= 0) { a.state = 'forage'; a.timer = 2 + this.rnd() * 5; }
        break;
      case 'dash': {
        // for the tree, then up it
        const t = a.tree, dx = t.x - a.x, dz = t.z - a.z, dist = Math.hypot(dx, dz);
        a.rate = 3.2; this._clip(a, 'run', { fade: 0.1 });
        this._turn(a, yawTo(dx, dz), 9, dt);
        if (dist > 0.5) { const sp = Math.min(a.b.speed('run') * a.rate, dist / dt); a.x -= Math.sin(a.yaw) * sp * dt; a.z -= Math.cos(a.yaw) * sp * dt; this._onGround(a, 0.3); }
        if (dist < 0.8 || a.timer <= 0) {
          a.x = t.x - (dx / (dist || 1)) * 0.3; a.z = t.z - (dz / (dist || 1)) * 0.3;
          a.state = 'climb'; a.timer = 3; a.yaw = yawTo(dx, dz); a.pitch = Math.PI / 2; a.y = this.ground(a.x, a.z) + 0.15;
        }
        break;
      }
      case 'climb':
        a.rate = 2.5; a.y += 1.6 * dt;
        if (a.timer <= 0) { a.state = 'gone'; a.hidden = true; }
        break;
    }
  }

  _swimmer(a, dt, d, bx, bz, far) {
    if (far) return;
    const p = a.pond;
    let sp = 0.12;
    if (d < 16) { a.goal = yawTo(a.x - bx, a.z - bz); sp = 1.0; a.state = 'paddle'; }
    else if (a.timer <= 0) {
      a.goal = a.yaw + (this.rnd() - 0.5) * 2; a.timer = 4 + this.rnd() * 8;
      const r = this.rnd();
      if (r < 0.25) { a.state = 'dabble'; this._clip(a, 'dabble', { once: true, force: true, fade: 0.2 }); } else if (r < 0.4) { a.state = 'preen'; this._clip(a, 'preen', { once: true, force: true, fade: 0.2 }); } else a.state = 'paddle';
    }
    if (a.state !== 'paddle' && a.timer < 2) a.state = 'paddle'; // a dabble or a preen lasts ~3 s
    if (a.state === 'paddle') this._clip(a, 'idle');
    if (a.goal != null) this._turn(a, a.goal, 1.2, dt);
    a.y = p.level - 0.07;
    const nx = a.x - Math.sin(a.yaw) * sp * dt, nz = a.z - Math.cos(a.yaw) * sp * dt;
    if (this._surf(nx, nz) === 'water' && this.T.greenEdge(nx, nz) > 3) { a.x = nx; a.z = nz; } else a.goal = a.yaw + Math.PI * 0.7;
  }

  _seal(a, far) {
    if (far) return;
    // lying out: the head lifts now and then; a sea lion barks
    if (a.timer <= 0) {
      a.timer = 6 + this.rnd() * 10;
      const r = this.rnd();
      if (a.lion && r < 0.35) { this._clip(a, 'bark', { once: true, force: true, fade: 0.2 }); this._bark(a); } else if (r < 0.6) this._clip(a, 'look', { once: true, force: true, fade: 0.3 }); else if (!a.lion && r < 0.75) this._clip(a, 'banana', { once: true, force: true, fade: 0.4 }); else this._clip(a, 'idle', { force: true, fade: 0.6 });
    }
  }

  _soar(a, dt, night) {
    a.hidden = night;
    if (night) return;
    // a wide circle on the thermal, banked into the turn; the circle drifts slowly downwind
    a.ang += (a.speed / a.r) * dt * a.dir;
    a.cx += Math.sin(a.t * 0.02 + a.phase) * 0.6 * dt; a.cz += Math.cos(a.t * 0.017 + a.phase) * 0.6 * dt;
    a.x = a.cx + Math.cos(a.ang) * a.r; a.z = a.cz + Math.sin(a.ang) * a.r;
    const tx = -Math.sin(a.ang) * a.dir, tz = Math.cos(a.ang) * a.dir;
    a.yaw = yawTo(tx, tz);
    a.roll = -a.dir * Math.atan((a.speed * a.speed) / (9.8 * a.r)) * 0.9;
    a.y = this.ground(a.cx, a.cz) + a.alt + Math.sin(a.t * 0.1 + a.phase) * 4;
    a.pitch = 0;
    // a few beats now and then, otherwise the long glide
    const c = (a.t + a.phase * 3) % a.flapEvery;
    this._clip(a, c < (a.gull ? 1.6 : 1.2) ? 'flap' : 'glide', { fade: 0.3 });
  }

  _pelicanLine(dt, night, cam) {
    const L = this.pelicanLine;
    L.t += dt;
    const birds = this.animals.filter((a) => a.type === 'pelican');
    const u = L.t / (L.len / L.speed); // < 0 waiting, 0..1 passing
    const show = !night && u >= 0 && u <= 1;
    for (const a of birds) {
      a.b.root.visible = show;
      if (!show) continue;
      const along = (u - 0.5) * L.len - a.k * 7, aside = a.k * 3.2;
      a.x = L.ox + L.ax * along + L.az * aside; a.z = L.oz + L.az * along - L.ax * aside;
      a.y = this.T.seaLevel + 7 + Math.sin(L.t * 0.3 + a.k * 0.4) * 1.5;
      a.yaw = yawTo(L.ax, L.az);
      // a ripple of wingbeats passes down the line, then they glide
      const c = (L.t - a.k * 0.35) % 9;
      this._clip(a, c > 0 && c < 1.6 ? 'flap' : 'glide', { fade: 0.3 });
      a.b.place(a.x, a.y, a.z, a.yaw, 0, 0);
      a.b.awake = !cam || Math.hypot(a.x - cam.x, a.z - cam.z) < 900;
      a.b.update(dt);
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
    if (a.state === 'bask') { a.state = 'rouse'; a.timer = 1.8; this._clip(a, 'alert', { once: true, fade: 0.2 }); }
    return { kind: 'gator', at: { x: a.x, y: a.y, z: a.z }, ball: rest, yaw: a.yaw, len: a.len };
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
