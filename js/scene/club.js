// The club at address: a real-proportioned golf club (shaft, grip, and a
// driver, fairway-wood, iron or wedge head) that swings on an inclined plane
// through the ball. The demo meter drives the backswing; the downswing takes
// the measured ~0.25 s of a tour swing and fires `onImpact` on the exact
// frame the face reaches the ball, so the launch, the strike sound, ball
// squash and turf spray all land together. Each set's heads, shafts and grip
// are models built in Blender (assets/models/clubs, tools/equipment); a
// procedural club stands in while they load.
//
// With a launch monitor the shot has already happened, so the club replays it,
// shaped by what the R10 measured (see strike()):
//   backswing and downswing time   the R10's own swing timestamps (real tempo)
//   backswing length, finish        club speed against the club's full-swing speed
//   path                            the swing plane turns in-to-out or out-to-in
//   face                            the head twists open or closed to the path
//   attack angle                    the low point moves ahead of (down) or behind (up) the ball
// The demo meter's shots carry the same numbers, so they are shaped the same way.
//
// Frame (local to the ball): -Z toward the target, +X away from the golfer
// (a right-handed player stands on -X, facing +X), +Y up.
import * as THREE from 'three';
import { SETS } from '../data/equipment.js';
import { BALL } from '../core/physics.js';
import { loadEquipment, equipment } from './models.js';

// Club length (in), lie (°) and loft (°): typical modern specs
const SPEC = {
  DR9: { len: 45.5, lie: 58, loft: 9, kind: 'driver' },
  DR: { len: 45.5, lie: 58, loft: 10.5, kind: 'driver' },
  DR12: { len: 45.5, lie: 58.5, loft: 12, kind: 'driver' },
  '3W': { len: 43, lie: 58.5, loft: 15, kind: 'wood' },
  '5W': { len: 42.5, lie: 59, loft: 18, kind: 'wood' },
  '7W': { len: 42, lie: 59.5, loft: 21, kind: 'wood' },
  '3H': { len: 40.5, lie: 59.5, loft: 19, kind: 'wood' }, // hybrids: a smaller wood-style head
  '4H': { len: 40, lie: 60, loft: 22, kind: 'wood' },
  '3I': { len: 39, lie: 60.5, loft: 20, kind: 'iron' },
  '4I': { len: 38.5, lie: 61, loft: 22, kind: 'iron' },
  '5I': { len: 38, lie: 61.5, loft: 24, kind: 'iron' },
  '6I': { len: 37.5, lie: 62, loft: 27, kind: 'iron' },
  '7I': { len: 37, lie: 62.5, loft: 31, kind: 'iron' },
  '8I': { len: 36.5, lie: 63, loft: 35, kind: 'iron' },
  '9I': { len: 36, lie: 63.5, loft: 39, kind: 'iron' },
  PW: { len: 35.75, lie: 64, loft: 45, kind: 'wedge' },
  GW: { len: 35.5, lie: 64, loft: 50, kind: 'wedge' },
  SW: { len: 35.25, lie: 64, loft: 56, kind: 'wedge' },
  LW: { len: 35, lie: 64, loft: 60, kind: 'wedge' },
};
const IN = 0.0254;
const DOWNSWING = 0.26; // s from the top to impact (tour tempo is ~3:1, ~0.25 s down)
const FOLLOW = 0.55; // s from impact to the finish
const SHAPE_GAIN = 1.5; // path and face are a few degrees; drawn 1.5x so they read
const D2R = Math.PI / 180;

const ease = (t) => t * t * (3 - 2 * t);

/**
 * Club sets: the look of the bag. Ball flight is the same for every set (the
 * launch comes from the R10 or the swing meter), so this is purely visual.
 * Each is modelled on a well-known style of club rather than a brand.
 */
// the look of each branded set (js/data/equipment.js SETS)
export const CLUB_SETS = SETS.map((x) => ({ ...x, name: `${x.brand} ${x.model}` }));
export const clubSet = (id) => CLUB_SETS.find((x) => x.id === id) || CLUB_SETS[0];

// the set's modelled heads, shafts and grip (assets/models/clubs; see models.js)
const headPath = (set, id) => (set.hockey ? 'clubs/hockey/HOCKEY.glb' : `clubs/${set.id}/${id}.glb`);
const shaftsPath = (set) => `clubs/${set.hockey ? 'hockey' : set.id}/shafts.glb`;
const UP = new THREE.Vector3(0, 1, 0);
const SPIN = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2); // turns the shaft's label toward the camera

function headMesh(spec, mats, set) {
  const g = new THREE.Group();
  if (set.hockey) return hockeyBlade(mats);
  if (spec.kind === 'driver' || spec.kind === 'wood') {
    // 460 cc driver: ~118 mm heel-to-toe, ~112 mm face-to-back, ~62 mm tall
    const big = spec.kind === 'driver';
    const w = big ? 0.118 : 0.1, d = big ? 0.112 : 0.085, h = big ? 0.062 : 0.04;
    const persimmon = set.wood === 'persimmon';
    // persimmon heads were small: about 190 cc
    const k = persimmon ? 0.78 : 1;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 16), persimmon ? mats.persimmon : mats.crown);
    crown.scale.set(w * k, h * k, d * k);
    crown.position.set(w * 0.46 * k, h * 0.5 * k, d * 0.36 * k);
    g.add(crown);
    if (persimmon) {
      // brass sole plate and the face insert
      const sole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.004, 24), mats.brass);
      sole.scale.set(w * k * 0.8, 1, d * k * 0.75);
      sole.position.set(w * 0.46 * k, 0.002, d * 0.36 * k);
      g.add(sole);
    }
    const face = new THREE.Mesh(new THREE.BoxGeometry(w * 0.84, h * 0.8, 0.004), mats.face);
    face.position.set(w * 0.46, h * 0.5, -0.002 + d * 0.0);
    g.add(face);
    // hosel up to the shaft
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.008, 0.05, 10).translate(0, 0.025, 0.004), mats.steel));
  } else {
    // iron / wedge: a thin blade ~76 mm long, sole ~20 mm wide, face ~48 mm tall at the toe
    const w = 0.076, h = spec.kind === 'wedge' ? 0.054 : 0.048, d = 0.02;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(w, 0); shape.quadraticCurveTo(w + 0.006, h * 0.6, w * 0.9, h);
    shape.lineTo(w * 0.15, h * 0.55); shape.lineTo(0, h * 0.3); shape.closePath();
    const cavity = set.iron === 'cavity';
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: cavity ? d * 1.35 : d, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 }), mats.iron);
    blade.position.z = 0.002;
    g.add(blade);
    if (cavity) {
      // the hollowed back with a badge, perimeter weighting round it
      const badge = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, h * 0.32, 0.003), mats.badge);
      badge.position.set(w * 0.5, h * 0.36, d * 1.35 + 0.004);
      g.add(badge);
    } else {
      // a muscle-back: thicker low behind the sweet spot
      const muscle = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, h * 0.28, 0.008), mats.iron);
      muscle.position.set(w * 0.48, h * 0.2, d + 0.004);
      g.add(muscle);
    }
    // score lines on the face
    for (let i = 0; i < 8; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.0008, 0.0006), mats.grooves);
      line.position.set(w * 0.52, 0.008 + i * 0.0045, -0.0004);
      g.add(line);
    }
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.0085, 0.07, 10).translate(0, 0.035, 0.008), mats.iron));
  }
  // tilt the face back by the loft (about the heel-toe axis)
  const lofted = new THREE.Group();
  lofted.add(g);
  g.rotation.x = -THREE.MathUtils.degToRad(spec.loft) * 0.6;
  return lofted;
}

/** Happy Gilmore's stick: a wooden blade with a hook, wrapped in black tape. */
function hockeyBlade(mats) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  // the blade runs out toward the toe and curls up at the end
  shape.moveTo(-0.02, 0); shape.lineTo(0.27, 0); shape.quadraticCurveTo(0.32, 0.005, 0.33, 0.04);
  shape.lineTo(0.31, 0.075); shape.lineTo(0.02, 0.075); shape.lineTo(-0.02, 0.05); shape.closePath();
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 1 }), mats.hockeyWood);
  blade.position.z = -0.004;
  g.add(blade);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.058, 0.0175), mats.tape);
  tape.position.set(0.17, 0.037, 0.002);
  g.add(tape);
  return g;
}

export class Club {
  constructor(scene) {
    this.root = new THREE.Group(); // at the ball, facing the target
    this.root.visible = false;
    scene.add(this.root);
    this.plane = new THREE.Group(); // turns for the path, slides for the attack angle
    this.root.add(this.plane);
    this.pivot = new THREE.Group(); // the swing centre (sternum)
    this.plane.add(this.pivot);
    this.mats = {
      steel: new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.28 }),
      crown: new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.4, roughness: 0.25 }),
      face: new THREE.MeshStandardMaterial({ color: 0x8d9298, metalness: 0.9, roughness: 0.35 }),
      grooves: new THREE.MeshBasicMaterial({ color: 0x3a3d42 }),
      shaft: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 1, roughness: 0.22 }),
      graphite: new THREE.MeshStandardMaterial({ color: 0x23262b, metalness: 0.3, roughness: 0.35 }),
      grip: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.85 }),
      glove: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.8 }),
      persimmon: new THREE.MeshStandardMaterial({ color: 0x5a2c17, roughness: 0.32, metalness: 0.05 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.3 }),
      leather: new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.7 }),
      badge: new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 0.6, roughness: 0.4 }),
      hockeyWood: new THREE.MeshStandardMaterial({ color: 0xc89b62, roughness: 0.6 }),
      tape: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }),
      iron: null,
    };
    this.setId = 'tour';
    this.id = null;
    this.phase = 'hidden'; // address | back | down | follow | hidden
    this.theta = 0;
    this.back = 0;
    this._axis = new THREE.Vector3();
    this.onImpact = null;
    this.shape = null;
  }

  /** Build the club for `clubId` and stand it behind the ball at (origin), aimed along headingDeg. */
  setAddress(origin, headingDeg, clubId, groundY = origin.y) {
    if (clubId !== this.id) this._build(clubId);
    this.root.position.set(origin.x, groundY, origin.z);
    this.root.rotation.y = (-headingDeg * Math.PI) / 180;
    this.phase = 'address';
    this.theta = 0;
    this.back = 0;
    this.shape = null;
    this._shapeW = 0;
    this._applyShape(0);
    this.root.visible = true;
    this._fade = 1;
    this._pose();
  }

  hide() { this.root.visible = false; this.phase = 'hidden'; }

  /** Change the bag (see CLUB_SETS); takes effect on the next address. */
  setSet(id) {
    if (id === this.setId) return;
    this.setId = clubSet(id).id;
    this.id = null;
  }

  _build(id) {
    this.id = id;
    this.pivot.clear();
    const set = clubSet(this.setId);
    const base = SPEC[id] || SPEC['7I'];
    // a hockey stick is about 60 inches whatever the shot, with a flat lie
    const spec = set.hockey ? { ...base, len: 58, lie: 52, loft: 4, kind: 'hockey' } : base;
    const m = this.mats;
    m.iron = set.finish === 'black'
      ? (m._black ||= new THREE.MeshStandardMaterial({ color: 0x1c1d20, metalness: 0.85, roughness: 0.38 }))
      : set.finish === 'satin' ? (m._satin ||= new THREE.MeshStandardMaterial({ color: 0xb7bbc1, metalness: 1, roughness: 0.48 })) : m.steel;
    if (set.wood === 'carbon') m.crown.color.set(0x0c0d0f); else m.crown.color.set(0x15171a);
    const L = spec.len * IN;
    // swing centre: between the shoulders, further from the ball with longer clubs
    const P = new THREE.Vector3(-(0.3 + L * 0.42), 1.32 + (L - 0.9) * 0.15, 0.02);
    // the head soles just behind the ball, face square to the target
    const hosel = new THREE.Vector3(-0.012, 0.004, 0.03);
    // shaft rises from the hosel at the lie angle, toward the golfer
    const lie = THREE.MathUtils.degToRad(spec.lie);
    const dir = new THREE.Vector3(-Math.cos(lie), Math.sin(lie), 0.02).normalize();
    const butt = hosel.clone().addScaledVector(dir, L);
    const club = new THREE.Group();
    const wood = spec.kind === 'driver' || spec.kind === 'wood';
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
    const hp = headPath(set, id), sp = shaftsPath(set);
    const H = equipment(hp), Sh = equipment(sp);
    let head = null;
    if (H && Sh) {
      // the modelled club: the head at its true loft and lie, its face centre
      // square behind the ball, the shaft running up its axis to the butt
      const src = H.getObjectByName('head');
      head = src.clone();
      const ud = src.userData;
      const fc = new THREE.Vector3().fromArray(ud.faceCenter);
      const ax = new THREE.Vector3().fromArray(ud.axis);
      const O = new THREE.Vector3(-fc.x, 0, BALL.radius + 0.003 - fc.z);
      head.position.copy(O);
      club.add(head);
      // the shaft follows the head's own axis (its lie), soled flat
      dir.copy(ax);
      q.setFromUnitVectors(UP, dir);
      const s0 = O.clone().addScaledVector(dir, ud.shaftStart);
      butt.copy(O).addScaledVector(dir, L);
      if (set.hockey) {
        // the stick's shaft sits 9.5 mm behind the blade's face line (tools/equipment/heads.py)
        s0.z += 0.0095;
        butt.z += 0.0095;
      }
      const shaft = Sh.getObjectByName(set.hockey ? 'hshaft' : wood ? 'shaft_wood' : 'shaft_iron').clone();
      // round shafts turn their label to the camera; the stick's flat sides stay square to the blade
      shaft.quaternion.copy(q);
      if (!set.hockey) shaft.quaternion.multiply(SPIN);
      shaft.position.copy(s0);
      shaft.scale.set(1, butt.distanceTo(s0), 1);
      const grip = Sh.getObjectByName(set.hockey ? 'hgrip' : 'grip').clone();
      grip.quaternion.copy(shaft.quaternion);
      grip.position.copy(butt).addScaledVector(dir, set.hockey ? -0.2716 : -0.2702);
      club.add(shaft, grip);
    } else {
      if (H === undefined || Sh === undefined) this._fetch(set, id, hp, sp);
      const shaftMat = set.hockey ? m.hockeyWood : set.finish === 'black' ? m.graphite : set.wood === 'persimmon' ? m.shaft : wood ? m.graphite : m.shaft;
      const shaft = set.hockey
        ? new THREE.Mesh(new THREE.BoxGeometry(0.028, L - 0.27, 0.018), shaftMat)
        : new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0042, L - 0.27, 10), shaftMat);
      const grip = set.hockey
        ? new THREE.Mesh(new THREE.BoxGeometry(0.031, 0.27, 0.021), m.tape)
        : new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0088, 0.27, 14), set.wood === 'persimmon' ? m.leather : m.grip);
      shaft.quaternion.copy(q);
      shaft.position.copy(hosel).addScaledVector(dir, (L - 0.27) / 2);
      grip.quaternion.copy(q);
      grip.position.copy(hosel).addScaledVector(dir, L - 0.135);
      club.add(shaft, grip);
    }
    // two gloved hands on the grip (lead glove, trail hand) so the club reads as held
    for (const [k, m] of [[0.06, this.mats.glove], [0.14, this.mats.glove]]) {
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.034, 14, 10), m);
      hand.scale.set(1, 1.35, 1);
      hand.quaternion.copy(q);
      hand.position.copy(butt).addScaledVector(dir, -k);
      club.add(hand);
    }
    if (!head) {
      // the procedural stand-in while the model loads
      head = headMesh(spec, this.mats, set);
      // orient the head: toe out (+X), face to the target (-Z), hosel at the shaft
      head.position.copy(hosel);
      club.add(head);
    }
    club.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    // everything hangs off the pivot so the swing is one rotation in the plane
    club.position.sub(P);
    this.pivot.position.copy(P);
    this.pivot.add(club);
    this.clubG = club;
    this._P = P.clone();
    this._hosel = hosel.clone();
    this._shaftDir = dir.clone();
    // swing plane: through the pivot, the ball and the target line
    const toBall = new THREE.Vector3().sub(P).normalize();
    this._axis.crossVectors(toBall, new THREE.Vector3(0, 0, -1)).normalize();
    // the club must go back away from the target (+Z) first: check the sign
    const test = new THREE.Vector3().sub(P).applyAxisAngle(this._axis, 0.05).add(P);
    if (test.z < 0) this._axis.negate();
    // which way a twist about the shaft opens the face (turns it toward +X, right of target)
    const n = new THREE.Vector3(0, 0, -1).applyAxisAngle(dir, 0.1);
    this._openSign = n.x > 0 ? 1 : -1;
    this.spec = spec;
  }

  /** Load this club's head and the set's shafts, then rebuild it if it is still the one in hand. */
  _fetch(set, id, hp, sp) {
    Promise.all([loadEquipment(hp), loadEquipment(sp)]).then(([h, s]) => {
      if (h && s && this.setId === set.id && this.id === id) {
        this.id = null;
        this._build(id);
        this._pose();
      }
      this._prefetch(set);
    });
  }

  /** Fetch the rest of the set in the background, a head at a time. */
  _prefetch(set) {
    if (this._prefetched === set.id || typeof window === 'undefined') return;
    this._prefetched = set.id;
    const ids = set.hockey ? [] : [...set.bag, ...Object.keys(SPEC).filter((k) => !set.bag.includes(k))];
    const next = () => {
      if (this._prefetched !== set.id) return;
      const id = ids.shift();
      if (id) loadEquipment(headPath(set, id)).then(() => setTimeout(next, 120));
    };
    setTimeout(next, 600);
  }

  /** Demo meter: 0 = address … 1 = a full backswing (club about parallel at the top). */
  setBackswing(p) {
    if (this.phase !== 'address' && this.phase !== 'back') return;
    this.phase = p > 0.001 ? 'back' : 'address';
    this.back = Math.min(1.1, p);
  }

  /**
   * Swing through the ball and call onImpact at contact.
   * fromTop: a launch-monitor shot. The swing has already happened, so it is
   * replayed from address: back and down at the R10's measured times when it
   * sent them, as long as the club speed says, along the measured path.
   * launch: { clubSpeed, clubPath, faceAngle, attackAngle, backswingMs, downswingMs },
   * angles relative to the aim line. fullMps: this club's full-swing head speed.
   */
  strike(onImpact, { fromTop = false, launch = null, fullMps = null } = {}) {
    if (!this.root.visible || this.phase === 'hidden') { onImpact?.(); return; }
    const L = launch || {};
    // how full the swing was: measured head speed against this club's full swing
    const r = L.clubSpeed && fullMps ? Math.max(0.15, Math.min(1.2, L.clubSpeed / fullMps)) : 1;
    const num = (v) => (Number.isFinite(v) ? v : 0);
    const path = num(L.clubPath), face = num(L.faceAngle), aoa = num(L.attackAngle);
    const impact = Math.max(-12, Math.min(8, aoa)) * D2R; // contact before (down) or after (up) the low point
    this.shape = {
      // +path (in-to-out) sends the head right of target (+X); an inclined plane already travels a little
      // in-to-out before its low point (out-to-in after it), so turn only by the difference
      yaw: this._naturalPath(impact) - path * SHAPE_GAIN * D2R,
      twist: (face - path) * SHAPE_GAIN * D2R * this._openSign,  // face to path, about the shaft
      impact,
      finish: THREE.MathUtils.degToRad(250) * Math.min(1, 0.4 + 0.65 * r),
    };
    this.onImpact = onImpact;
    if (fromTop) {
      // the replay: from address, at the player's own tempo
      this.back = Math.min(1.08, Math.max(0.28, 0.25 + 0.8 * r ** 1.4));
      const bs = L.backswingMs > 0 ? L.backswingMs / 1000 : 0.78 * (0.6 + 0.4 * this.back);
      const ds = L.downswingMs > 0 ? L.downswingMs / 1000 : DOWNSWING;
      this.backTime = Math.min(1.3, Math.max(0.35, bs));
      this.downTime = Math.min(0.45, Math.max(0.17, ds));
      this.topTheta = this._backTheta(this.back);
      this.phase = 'replay';
      this.t = 0;
      return;
    }
    if (this.back < 0.25) this.back = Math.max(this.back, 0.85);
    this.topTheta = this._backTheta(this.back);
    this.phase = 'down';
    this.t = 0;
    // shorter backswings come down a little quicker
    this.downTime = DOWNSWING * (0.7 + 0.3 * Math.min(1, this.back));
  }

  /** The head's own direction of travel (radians, + toward +X) at swing angle theta on the unturned plane. */
  _naturalPath(theta) {
    const P = this._P;
    if (!P) return 0;
    const at = (t) => new THREE.Vector3().sub(P).applyAxisAngle(this._axis, -t);
    const d = at(theta + 0.01).sub(at(theta));
    return Math.atan2(d.x, -d.z) - Math.atan2(at(0.01).sub(at(0)).x, -at(0.01).sub(at(0)).z);
  }

  /** Path, face and low point, eased in by w (0 at address, 1 from the top on). */
  _applyShape(w) {
    const sh = this.shape;
    const P = this._P;
    if (!this.clubG || !P) return;
    const yaw = sh ? sh.yaw * w : 0, twist = sh ? sh.twist * w : 0, imp = sh ? sh.impact * w : 0;
    // slide the arc so the head meets the ball at the impact angle, not at the low point
    const head = new THREE.Vector3().sub(P).applyAxisAngle(this._axis, -imp).add(P);
    this.plane.position.set(-head.x, -head.y, -head.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.plane.rotation.y = yaw;
    // twist the club about its shaft, keeping the hosel where it is
    const q = new THREE.Quaternion().setFromAxisAngle(this._shaftDir, twist);
    this.clubG.quaternion.copy(q);
    this.clubG.position.copy(this._hosel).sub(this._hosel.clone().applyQuaternion(q)).sub(P);
  }

  _backTheta(p) { return -THREE.MathUtils.degToRad(255) * Math.min(1.1, p); }

  _pose() {
    this.pivot.quaternion.setFromAxisAngle(this._axis, -this.theta);
  }

  update(dt, t) {
    if (!this.root.visible) return;
    if (this.phase === 'address') {
      // a small waggle so it reads as held, not placed
      this.theta = -0.012 * Math.sin(t * 1.7) * Math.max(0, Math.sin(t * 0.35));
    } else if (this.phase === 'back') {
      const want = this._backTheta(this.back);
      this.theta += (want - this.theta) * (1 - Math.exp(-14 * dt));
    } else if (this.phase === 'replay') {
      // the backswing, at the player's measured time, with the shape coming in
      this.t += dt;
      const u = Math.min(1, this.t / this.backTime);
      this.theta = this.topTheta * ease(u);
      this._shapeW = ease(u);
      this._applyShape(this._shapeW);
      if (u >= 1) { this.phase = 'down'; this.t = 0; }
    } else if (this.phase === 'down') {
      this.t += dt;
      // the club accelerates all the way into the ball, which it meets at the impact angle
      const u = Math.min(1, this.t / this.downTime);
      const imp = this.shape ? this.shape.impact : 0;
      this.theta = this.topTheta + (imp - this.topTheta) * (u * u * (1.6 - 0.6 * u));
      // a meter swing turns onto its path in the first half of the downswing
      if (this.shape) { this._shapeW = Math.max(this._shapeW || 0, Math.min(1, u * 2)); this._applyShape(this._shapeW); }
      if (u >= 1) {
        this.theta = imp;
        this.phase = 'follow';
        this.t = 0;
        const cb = this.onImpact;
        this.onImpact = null;
        cb?.();
      }
    } else if (this.phase === 'follow') {
      this.t += dt;
      const u = Math.min(1, this.t / FOLLOW);
      const imp = this.shape ? this.shape.impact : 0;
      const fin = this.shape ? this.shape.finish : THREE.MathUtils.degToRad(250);
      this.theta = imp + (fin - imp) * (1 - (1 - u) ** 3);
      if (this.t > FOLLOW + 0.9) this.hide();
    }
    this._pose();
  }
}
