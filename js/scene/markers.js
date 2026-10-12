// Other players' balls left on the course/range: a ball plus a coloured ring
// so everyone can see where they lie. Names are drawn by the HUD.
import * as THREE from 'three';
import { BALL } from '../core/physics.js';

export class PlayerMarkers {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = [];
    this.ballGeo = new THREE.SphereGeometry(BALL.radius, 16, 12);
    this.ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: 0x332a20, emissiveIntensity: 0.5 });
    this.ringGeo = new THREE.RingGeometry(0.32, 0.42, 40).rotateX(-Math.PI / 2);
  }

  /** @param {{x,y,z,color,name}[]} list */
  set(list) {
    for (const it of this.items) this.group.remove(it.obj);
    this.items = [];
    for (const m of list) {
      const obj = new THREE.Group();
      const b = new THREE.Mesh(this.ballGeo, this.ballMat);
      b.position.y = BALL.radius;
      const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({
        color: new THREE.Color(m.color).multiplyScalar(1.5), transparent: true, opacity: 0.85, depthWrite: false,
      }));
      ring.position.y = 0.03;
      obj.add(b, ring);
      obj.position.set(m.x, m.y, m.z);
      this.group.add(obj);
      this.items.push({ obj, ...m });
    }
  }

  update(t) {
    for (const it of this.items) {
      const ring = it.obj.children[1];
      const s = 1 + 0.15 * Math.sin(t * 3 + it.x);
      ring.scale.set(s, 1, s);
    }
  }
}
