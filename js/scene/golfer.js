// The golfer. A MakeHuman body dressed for golf (tools/blender/golfer.py) moving
// with real motion capture: CMU subject 64's swings, the whole body as a golfer
// actually swung. The club in his hands is still the one the R10 measured
// (js/scene/club.js): his clip is time-warped onto it, address to the top in
// the player's backswing time, the top to impact in their downswing, impact to
// the finish, so the body turns, shifts and releases with the club; then both
// hands are held on the grip by IK (the capture's own club was a different
// club on a different path), the lead hand gloved near the butt, the trail hand
// below it.
import * as THREE from 'three';
import { loadEquipment } from './models.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _p = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _X = new THREE.Vector3(1, 0, 0), _Z = new THREE.Vector3(0, 0, 1);

/** Rotate a bone (in world terms) by q, keeping its parent where it is. */
function rotateWorld(bone, q) {
  bone.getWorldQuaternion(_q2);
  const want = q.clone().multiply(_q2);
  const parentQ = new THREE.Quaternion();
  bone.parent.getWorldQuaternion(parentQ);
  bone.quaternion.copy(parentQ.invert().multiply(want));
  bone.updateMatrixWorld(true);
}

/**
 * Two-bone IK: turn upper and lower so end's joint reaches target, the elbow bending toward the side it
 * already bends to (the capture's own elbow).
 */
function twoBone(upper, lower, end, target) {
  upper.getWorldPosition(_a); lower.getWorldPosition(_b); end.getWorldPosition(_c);
  const la = _a.distanceTo(_b), lb = _b.distanceTo(_c);
  const d = Math.min(la + lb - 1e-4, Math.max(Math.abs(la - lb) + 1e-4, _a.distanceTo(target)));
  // the bend plane: shoulder, target and the current elbow
  const toT = _t.copy(target).sub(_a).normalize();
  const pole = _p.copy(_b).sub(_a);
  pole.sub(toT.clone().multiplyScalar(pole.dot(toT)));
  if (pole.lengthSq() < 1e-8) pole.set(0, -1, 0);
  pole.normalize();
  const cosA = (la * la + d * d - lb * lb) / (2 * la * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const elbow = _a.clone().addScaledVector(toT, la * cosA).addScaledVector(pole, la * sinA);
  // turn the upper arm onto the new elbow, then the forearm onto the target
  rotateWorld(upper, _q.setFromUnitVectors(_b.clone().sub(_a).normalize(), elbow.clone().sub(_a).normalize()));
  lower.getWorldPosition(_b); end.getWorldPosition(_c);
  rotateWorld(lower, _q.setFromUnitVectors(_c.clone().sub(_b).normalize(), target.clone().sub(_b).normalize()));
}

// the golfers to choose from (tools/blender/golfer.py presets)
export const GOLFERS = [
  { id: 'james', name: 'James', note: 'Navy shirt, charcoal trousers' },
  { id: 'marcus', name: 'Marcus', note: 'White shirt, navy trousers, black cap' },
  { id: 'sofia', name: 'Sofia', note: 'White shirt, navy trousers, ponytail' },
  { id: 'mei', name: 'Mei', note: 'Teal shirt, white trousers' },
];
export const golferById = (id) => GOLFERS.find((g) => g.id === id) || GOLFERS[0];

export class Golfer {
  constructor(scene) {
    this.root = new THREE.Group();           // follows the club's root: on the ball, turned to the aim
    this.inner = new THREE.Group();          // the golfer, lined up to stand to the club
    this.root.add(this.inner);
    this.root.visible = false;
    scene.add(this.root);
    this.ready = false;
    this.clip = 'swing';
    this.models = new Map();                 // id → {scn, info, mixer, actions, b}
    this.id = null;
    this.onReady = null;
    this.id = 'james';
  }

  /** Change golfer (the next address uses him or her). Nothing loads until a golfer is actually shown. */
  setCharacter(id) {
    id = golferById(id).id;
    if (id === this.id && (this.model || !this.wanted)) return;
    this.id = id;
    const have = this.models.get(id);
    if (have) { this._use(have); return; }
    this.ready = false;
    if (this.wanted) this._load(id);
  }

  _load(id) {
    if (this._loading === id) return;
    this._loading = id;
    loadEquipment(`golfers/${id}.glb`).then((scn) => {
      this._loading = null;
      if (!scn) return;
      const m = this._init(scn);
      this.models.set(id, m);
      if (this.id === id) { this._use(m); this.onReady?.(); }
    });
  }

  _use(m) {
    if (this.model) this.inner.remove(this.model);
    Object.assign(this, { model: m.scn, info: m.info, mixer: m.mixer, actions: m.actions, b: m.b });
    this._snap = null; this._bones = null; this._armLen = null; this._bendNow = 0;
    this.inner.add(m.scn);
    this.ready = m.ok;
  }

  _init(scn) {
    let info = null;
    scn.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        // MakeHuman's materials come in alpha-blended: draw him solid, cutting only the true holes
        // (eyebrows, lashes, the hair's strands) so nothing sorts wrong or shows through
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          const cut = /eyebrow|eyelash|short0|ponytail|bob0|hair/i.test(m.name);
          m.transparent = false; m.depthWrite = true; m.alphaTest = cut ? 0.45 : 0.0;
          if (!cut) m.alphaMap = null;
          m.needsUpdate = true;
        }
      }
      if (o.userData?.fairway) info = JSON.parse(o.userData.fairway);
    });
    const bone = (n) => scn.getObjectByName(n);
    const b = {
      lArm: bone('LeftArm'), lFore: bone('LeftForeArm'), lHand: bone('LeftHand'), lFinger: bone('LeftFingerBase'),
      rArm: bone('RightArm'), rFore: bone('RightForeArm'), rHand: bone('RightHand'), rFinger: bone('RightFingerBase'),
      lF1: bone('LeftHandFinger1'), rF1: bone('RightHandFinger1'), lThumb: bone('LThumb'), rThumb: bone('RThumb'),
      low: bone('LowerBack'), sp: bone('Spine'), sp1: bone('Spine1'),
    };
    const mixer = new THREE.AnimationMixer(scn);
    const actions = {};
    for (const clip of scn.userData.animations || []) {
      const a = mixer.clipAction(clip);
      a.play(); a.paused = true; a.enabled = clip.name === this.clip; a.setEffectiveWeight(clip.name === this.clip ? 1 : 0);
      actions[clip.name] = a;
    }
    const ok = !!info && !!actions.swing && Object.values(b).every(Boolean);
    if (!ok) console.warn('golfer: model incomplete', { info: !!info, actions: Object.keys(actions) });
    return { scn, info, mixer, actions, b, ok };
  }

  _time(club) {
    const I = this.info[this.clip];
    const lerp = (a, b, u) => a + (b - a) * Math.min(1, Math.max(0, u));
    switch (club.phase) {
      case 'address': return I.address;
      case 'back': return lerp(I.address, I.top, club.back / 1.0);
      case 'replay': return lerp(I.address, I.top, club.t / club.backTime);
      case 'down': return lerp(I.top, I.impact, club.t / club.downTime);
      case 'follow': return lerp(I.impact, I.finish, club.t / 0.55);
      default: return I.finish;
    }
  }

  /** Stand to the club as it is addressed (call after club.setAddress). */
  address(club, hidden = false, rig = null) {
    // (shown for the first time: fetch the model; the game re-addresses through onReady once it arrives)
    if (!hidden) { this.wanted = true; if (!this.models.has(this.id)) this._load(this.id); }
    if (!this.ready || hidden || !club.root.visible) {
      this.root.visible = false;
      if (rig) rig.withGolfer = false;
      // the club alone: its own stand-in hands come back
      club.golferHands = false;
      club.clubG?.traverse((o) => { if (o.userData?.stubHand) o.visible = true; });
      return;
    }
    this.root.visible = true;
    if (rig) rig.withGolfer = true;
    const I = this.info[this.clip];
    const A = I.atAddress;
    // face the ball: the capture's feet-to-hands direction onto the club's +x (the golfer stands on -x)
    const fx = A.hands[0] - A.feet[0], fz = A.hands[2] - A.feet[2];
    const yaw = Math.atan2(fz, fx);
    this.inner.rotation.set(0, yaw, 0);
    // the hands at address onto the grip at address (across the ground; the IK takes up any height)
    club.root.updateMatrixWorld(true);
    const grip = club.gripWorld ? club.root.worldToLocal(club.gripWorld(0.1)) : new THREE.Vector3(-0.35, 0.8, 0);
    const h = new THREE.Vector3(A.hands[0], 0, A.hands[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.inner.position.set(grip.x - h.x, -Math.min(0, A.feet[1] - 0.075) - 0.0, grip.z - h.z);
    this._hideClubHands(club);
  }

  _hideClubHands(club) {
    club.golferHands = true;
    club.clubG?.traverse((o) => { if (o.userData?.stubHand) o.visible = false; });
  }

  /** Bend forward from the hips by ang (radians) about the lateral axis, shared down the spine. */
  _bend(lateral, ang) {
    const parts = [[this.b.low, 0.45], [this.b.sp, 0.33], [this.b.sp1, 0.22]];
    for (const [bn, k] of parts) {
      // toward the grip: a rotation about the lateral axis that tips the chest down and forward
      rotateWorld(bn, new THREE.Quaternion().setFromAxisAngle(lateral, ang * k));
    }
  }

  update(dt, club) {
    if (!this.ready || !this.root.visible) return;
    if (!club.root.visible && club.phase !== 'hidden') { this.root.visible = false; return; }
    // follow the club's root (the ball, the aim)
    this.root.position.copy(club.root.position);
    this.root.quaternion.copy(club.root.quaternion);
    // the swing at the club's moment
    const a = this.actions[this.clip];
    // the mixer only writes values that changed since it last wrote them, and the IK below moves the bones
    // every frame: put back the clip's own pose first, so nothing accumulates when the clip stands still
    if (this._snap) for (const [bn, q, p] of this._snap) { bn.quaternion.copy(q); bn.position.copy(p); }
    a.time = this._time(club);
    this.mixer.update(0);
    if (!this._bones) { this._bones = []; this.model.traverse((o) => { if (o.isBone) this._bones.push(o); }); }
    this._snap = this._bones.map((bn) => [bn, bn.quaternion.clone(), bn.position.clone()]);
    this.model.updateMatrixWorld(true);
    if (!club.gripWorld || club.phase === 'hidden') return;
    // posture: if the arms can't reach the grip from where the capture's shoulders are (his club, his height),
    // he bends a little more from the hips, the way a golfer settles over a shorter club; eased, never popped
    {
      const t1 = club.gripWorld(0.065), t2 = club.gripWorld(0.15);
      const arms = this._armLen || (this._armLen = (() => { const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        this.b.lArm.getWorldPosition(a); this.b.lFore.getWorldPosition(b); this.b.lHand.getWorldPosition(c); return a.distanceTo(b) + b.distanceTo(c); })());
      const over = () => {
        this.b.lArm.getWorldPosition(_a); this.b.rArm.getWorldPosition(_b);
        return Math.max(_a.distanceTo(t1), _b.distanceTo(t2)) - arms * 0.93;
      };
      const hips = this.b.low.getWorldPosition(new THREE.Vector3());
      const toward = t1.clone().sub(hips); toward.y = 0; toward.normalize();
      const lateral = new THREE.Vector3(0, 1, 0).cross(toward).normalize();
      let want = 0;
      if (over() > 0) {
        // find the bend (toward the grip) that brings both hands in reach
        const save = [this.b.low.quaternion.clone(), this.b.sp.quaternion.clone(), this.b.sp1.quaternion.clone()];
        for (let k = 1; k <= 18; k++) {
          const ang = k * 0.04;
          this.b.low.quaternion.copy(save[0]); this.b.sp.quaternion.copy(save[1]); this.b.sp1.quaternion.copy(save[2]);
          this.b.low.updateMatrixWorld(true);
          this._bend(lateral, ang);
          want = ang;
          if (over() <= 0) break;
        }
        this.b.low.quaternion.copy(save[0]); this.b.sp.quaternion.copy(save[1]); this.b.sp1.quaternion.copy(save[2]);
        this.b.low.updateMatrixWorld(true);
      }
      this._bendNow = (this._bendNow || 0) + (want - (this._bendNow || 0)) * Math.min(1, dt * 10 + (club.phase === 'address' ? 0 : 0.5));
      if (this._bendNow > 1e-3) this._bend(lateral, this._bendNow);
    }
    // the hands onto the grip: fingers closed into a grip, each hand turned so its fist runs along the shaft,
    // the wrist placed so the handle sits in the fingers
    const sd = club.gripWorld(0.0).sub(club.gripWorld(0.2)).normalize();   // up the shaft, toward the butt
    const C = this.curl || (this.curl = { s: typeof window !== 'undefined' && window.__curlSign ? window.__curlSign : 1 });
    for (const [arm, fore, hand, finger, f1, thumb, k] of [
      [this.b.lArm, this.b.lFore, this.b.lHand, this.b.lFinger, this.b.lF1, this.b.lThumb, 0.065],
      [this.b.rArm, this.b.rFore, this.b.rHand, this.b.rFinger, this.b.rF1, this.b.rThumb, 0.15],
    ]) {
      finger.quaternion.multiply(_q.setFromAxisAngle(_X, 0.35 * C.s));
      f1.quaternion.multiply(_q.setFromAxisAngle(_X, 1.35 * C.s));
      thumb.quaternion.multiply(_q.setFromAxisAngle(_Z, 0.6 * C.s));
      hand.updateMatrixWorld(true);
      const g = club.gripWorld(k);
      for (let it = 0; it < 2; it++) {
        hand.getWorldPosition(_a); finger.getWorldPosition(_b);
        const reach = _b.clone().sub(_a).multiplyScalar(0.62);
        twoBone(arm, fore, hand, g.clone().sub(reach));
        // the fist's axis (the hand's own x) along the shaft
        const ax = _c.set(1, 0, 0).applyQuaternion(hand.getWorldQuaternion(_q2)).normalize();
        const to = ax.dot(sd) >= 0 ? sd : sd.clone().negate();
        rotateWorld(hand, new THREE.Quaternion().setFromUnitVectors(ax.clone(), to));
      }
    }
  }
}
