// Water that mirrors the scene, not just the sky: the trees, flags, grandstands
// and clubhouse upside down in the pond, wobbling with its ripples. One planar
// reflection for the water nearest the camera (a mirrored camera, clipped at
// the water line, rendering at a quarter of the screen into a half-float
// target), shared by every water material at that level; other water keeps
// reflecting the sky. The same technique as three.js's Reflector.
import * as THREE from 'three';
import { waterMaterials, REFLECT } from './river.js';

const _plane = new THREE.Plane(), _n = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3(), _v = new THREE.Vector3();
const _look = new THREE.Vector3(), _target = new THREE.Vector3(), _clip = new THREE.Vector4(), _q = new THREE.Vector4();

export class WaterReflections {
  constructor() {
    this.enabled = false;
    this.rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 0 });
    this.cam = new THREE.PerspectiveCamera();
    this.matrix = new THREE.Matrix4();
    this.level = null;
    this.waters = [];          // [{mesh, level}]
    this._scanT = 0;
    this.shared = REFLECT;
    REFLECT.uReflTex.value = this.rt.texture;
    REFLECT.uReflMatrix.value = this.matrix;
  }

  _scan(scene) {
    this.waters = [];
    scene.traverse((o) => {
      if (o.isMesh && o.material && waterMaterials.has(o.material) && o.visible !== false) {
        o.updateMatrixWorld();
        this.waters.push({ mesh: o, level: o.getWorldPosition(_p).y });
      }
    });
  }

  setSize(w, h) { this.rt.setSize(Math.max(2, Math.round(w / 4)), Math.max(2, Math.round(h / 4))); }

  update(renderer, scene, camera, dt) {
    this.shared.uReflOn.value = 0;
    if (!this.enabled) return;
    this._scanT -= dt;
    if (this._scanT <= 0) { this._scan(scene); this._scanT = 1.5; }
    // the water nearest the camera that is in front of it
    let best = null, bd = Infinity;
    for (const w of this.waters) {
      if (!w.mesh.visible) continue;
      w.mesh.geometry.boundingSphere || w.mesh.geometry.computeBoundingSphere();
      const c = _p.copy(w.mesh.geometry.boundingSphere.center).applyMatrix4(w.mesh.matrixWorld);
      const r = w.mesh.geometry.boundingSphere.radius * w.mesh.matrixWorld.getMaxScaleOnAxis();
      const d = Math.max(0, camera.position.distanceTo(c) - r);
      if (d < bd && camera.position.y > w.level + 0.05) { bd = d; best = w; }
    }
    if (!best || bd > 900) return;
    const L = best.level;
    // the mirrored camera (three.js Reflector's construction)
    _plane.setFromNormalAndCoplanarPoint(_n, _p.set(0, L, 0));
    const mirrorWorld = new THREE.Vector3(camera.position.x, 2 * L - camera.position.y, camera.position.z);
    camera.getWorldDirection(_look);
    _target.copy(camera.position).add(_look);
    _target.y = 2 * L - _target.y;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    up.y = -up.y;
    const c = this.cam;
    c.position.copy(mirrorWorld);
    c.up.copy(up);
    c.lookAt(_target);
    c.far = camera.far; c.near = camera.near; c.fov = camera.fov; c.aspect = camera.aspect;
    c.updateMatrixWorld();
    c.projectionMatrix.copy(camera.projectionMatrix);
    // texture matrix: world → the reflection's uv
    this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.matrix.multiply(c.projectionMatrix).multiply(c.matrixWorldInverse);
    // clip at the water line with a world-space clipping plane (the oblique-near-plane trick assumes a
    // standard depth buffer; this game uses a reversed one)
    this._clipPlane = this._clipPlane || new THREE.Plane();
    this._clipPlane.set(_n, -(L - 0.02));
    // render: the water itself and the small stuff stay out of it
    const hidden = [];
    for (const w of this.waters) if (w.mesh.visible) { w.mesh.visible = false; hidden.push(w.mesh); }
    scene.traverse((o) => { if (o.visible && (o.userData?.noAO || o.isSprite || o.isPoints)) { o.visible = false; hidden.push(o); } });
    const prevTarget = renderer.getRenderTarget(), prevXr = renderer.xr.enabled, prevShadow = renderer.shadowMap.autoUpdate;
    renderer.xr.enabled = false;
    renderer.shadowMap.autoUpdate = false;
    const prevClip = renderer.clippingPlanes;
    renderer.clippingPlanes = [this._clipPlane];
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, c);
    renderer.clippingPlanes = prevClip;
    renderer.setRenderTarget(prevTarget);
    renderer.xr.enabled = prevXr;
    renderer.shadowMap.autoUpdate = prevShadow;
    for (const o of hidden) o.visible = true;
    this.shared.uReflLevel.value = L;
    this.shared.uReflOn.value = 1;
  }
}
