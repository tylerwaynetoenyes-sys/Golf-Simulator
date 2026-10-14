// The club at address: a real-proportioned golf club (shaft, grip, and a
// driver, fairway-wood, iron or wedge head) that swings on an inclined plane
// through the ball. The demo meter drives the backswing; the downswing takes
// the measured ~0.25 s of a tour swing and fires `onImpact` on the exact
// frame the face reaches the ball, so the launch, the strike sound, ball
// squash and turf spray all land together. With a launch monitor the shot has
// already happened, so the club plays a quick downswing from the top first.
//
// Frame (local to the ball): -Z toward the target, +X away from the golfer
// (a right-handed player stands on -X, facing +X), +Y up.
import * as THREE from 'three';

// Club length (in), lie (°) and loft (°): typical modern specs
const SPEC = {
  DR: { len: 45.5, lie: 58, loft: 10.5, kind: 'driver' },
  '3W': { len: 43, lie: 58.5, loft: 15, kind: 'wood' },
  '5I': { len: 38, lie: 61.5, loft: 24, kind: 'iron' },
  '7I': { len: 37, lie: 62.5, loft: 31, kind: 'iron' },
  '9I': { len: 36, lie: 63.5, loft: 39, kind: 'iron' },
  PW: { len: 35.75, lie: 64, loft: 45, kind: 'wedge' },
  SW: { len: 35.25, lie: 64, loft: 56, kind: 'wedge' },
};
const IN = 0.0254;
const DOWNSWING = 0.26; // s from the top to impact (tour tempo is ~3:1, ~0.25 s down)
const FOLLOW = 0.55; // s from impact to the finish

const ease = (t) => t * t * (3 - 2 * t);

function headMesh(spec, mats) {
  const g = new THREE.Group();
  if (spec.kind === 'driver' || spec.kind === 'wood') {
    // 460 cc driver: ~118 mm heel-to-toe, ~112 mm face-to-back, ~62 mm tall
    const big = spec.kind === 'driver';
    const w = big ? 0.118 : 0.1, d = big ? 0.112 : 0.085, h = big ? 0.062 : 0.04;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 16), mats.crown);
    crown.scale.set(w, h, d);
    crown.position.set(w * 0.46, h * 0.5, d * 0.36);
    g.add(crown);
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
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 }), mats.steel);
    blade.position.z = 0.002;
    g.add(blade);
    // score lines on the face
    for (let i = 0; i < 8; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.0008, 0.0006), mats.grooves);
      line.position.set(w * 0.52, 0.008 + i * 0.0045, -0.0004);
      g.add(line);
    }
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.0085, 0.07, 10).translate(0, 0.035, 0.008), mats.steel));
  }
  // tilt the face back by the loft (about the heel-toe axis)
  const lofted = new THREE.Group();
  lofted.add(g);
  g.rotation.x = -THREE.MathUtils.degToRad(spec.loft) * 0.6;
  return lofted;
}

export class Club {
  constructor(scene) {
    this.root = new THREE.Group(); // at the ball, facing the target
    this.root.visible = false;
    scene.add(this.root);
    this.pivot = new THREE.Group(); // the swing centre (sternum)
    this.root.add(this.pivot);
    this.mats = {
      steel: new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.28 }),
      crown: new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.4, roughness: 0.25 }),
      face: new THREE.MeshStandardMaterial({ color: 0x8d9298, metalness: 0.9, roughness: 0.35 }),
      grooves: new THREE.MeshBasicMaterial({ color: 0x3a3d42 }),
      shaft: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 1, roughness: 0.22 }),
      graphite: new THREE.MeshStandardMaterial({ color: 0x23262b, metalness: 0.3, roughness: 0.35 }),
      grip: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.85 }),
      glove: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.8 }),
    };
    this.id = null;
    this.phase = 'hidden'; // address | back | down | follow | hidden
    this.theta = 0;
    this.back = 0;
    this._axis = new THREE.Vector3();
    this.onImpact = null;
  }

  /** Build the club for `clubId` and stand it behind the ball at (origin), aimed along headingDeg. */
  setAddress(origin, headingDeg, clubId, groundY = origin.y) {
    if (clubId !== this.id) this._build(clubId);
    this.root.position.set(origin.x, groundY, origin.z);
    this.root.rotation.y = (-headingDeg * Math.PI) / 180;
    this.phase = 'address';
    this.theta = 0;
    this.back = 0;
    this.root.visible = true;
    this._fade = 1;
    this._pose();
  }

  hide() { this.root.visible = false; this.phase = 'hidden'; }

  _build(id) {
    this.id = id;
    this.pivot.clear();
    const spec = SPEC[id] || SPEC['7I'];
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
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0042, L - 0.27, 10), wood ? this.mats.graphite : this.mats.shaft);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0088, 0.27, 14), this.mats.grip);
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
    shaft.quaternion.copy(q);
    shaft.position.copy(hosel).addScaledVector(dir, (L - 0.27) / 2);
    grip.quaternion.copy(q);
    grip.position.copy(hosel).addScaledVector(dir, L - 0.135);
    club.add(shaft, grip);
    // two gloved hands on the grip (lead glove, trail hand) so the club reads as held
    for (const [k, m] of [[0.06, this.mats.glove], [0.14, this.mats.glove]]) {
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.034, 14, 10), m);
      hand.scale.set(1, 1.35, 1);
      hand.quaternion.copy(q);
      hand.position.copy(butt).addScaledVector(dir, -k);
      club.add(hand);
    }
    const head = headMesh(spec, this.mats);
    // orient the head: toe out (+X), face to the target (-Z), hosel at the shaft
    head.position.copy(hosel);
    club.add(head);
    club.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    // everything hangs off the pivot so the swing is one rotation in the plane
    club.position.sub(P);
    this.pivot.position.copy(P);
    this.pivot.add(club);
    // swing plane: through the pivot, the ball and the target line
    const toBall = new THREE.Vector3().sub(P).normalize();
    this._axis.crossVectors(toBall, new THREE.Vector3(0, 0, -1)).normalize();
    // the club must go back away from the target (+Z) first: check the sign
    const test = new THREE.Vector3().sub(P).applyAxisAngle(this._axis, 0.05).add(P);
    if (test.z < 0) this._axis.negate();
    this.spec = spec;
  }

  /** Demo meter: 0 = address … 1 = a full backswing (club about parallel at the top). */
  setBackswing(p) {
    if (this.phase !== 'address' && this.phase !== 'back') return;
    this.phase = p > 0.001 ? 'back' : 'address';
    this.back = Math.min(1.1, p);
  }

  /**
   * Swing down through the ball. `fromTop`: start at the top (launch-monitor
   * shots, where the real swing has already happened). Calls onImpact at contact.
   */
  strike(onImpact, { fromTop = false } = {}) {
    if (!this.root.visible || this.phase === 'hidden') { onImpact?.(); return; }
    if (fromTop || this.back < 0.25) this.back = Math.max(this.back, 0.85);
    this.topTheta = this._backTheta(this.back);
    this.phase = 'down';
    this.t = 0;
    this.onImpact = onImpact;
    // shorter backswings come down a little quicker
    this.downTime = DOWNSWING * (0.7 + 0.3 * Math.min(1, this.back));
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
    } else if (this.phase === 'down') {
      this.t += dt;
      // the club accelerates all the way into the ball
      const u = Math.min(1, this.t / this.downTime);
      this.theta = this.topTheta * (1 - u * u * (1.6 - 0.6 * u));
      if (u >= 1) {
        this.theta = 0;
        this.phase = 'follow';
        this.t = 0;
        const cb = this.onImpact;
        this.onImpact = null;
        cb?.();
      }
    } else if (this.phase === 'follow') {
      this.t += dt;
      const u = Math.min(1, this.t / FOLLOW);
      this.theta = THREE.MathUtils.degToRad(250) * (1 - (1 - u) ** 3);
      if (this.t > FOLLOW + 0.9) this.hide();
    }
    this._pose();
  }
}
