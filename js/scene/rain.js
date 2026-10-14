// Rain: thin streaks in a box that follows the camera, slanted by the wind.
// Streak length matches what a camera sees at 1/60 s (drops fall ~9 m/s), and
// they fade by distance so the far field reads as haze rather than lines.
import * as THREE from 'three';

const N = 6000, BOX = 44, H = 24;

export class Rain {
  constructor(scene) {
    const pos = new Float32Array(N * 2 * 3);
    const seed = new Float32Array(N * 2);
    this.base = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this.base[i * 3] = (Math.random() - 0.5) * BOX;
      this.base[i * 3 + 1] = Math.random() * H;
      this.base[i * 3 + 2] = (Math.random() - 0.5) * BOX;
      seed[i * 2] = seed[i * 2 + 1] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.uni = { uOpacity: { value: 0 }, uCam: { value: new THREE.Vector3() }, uDay: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uni, transparent: true, depthWrite: false, fog: false,
      vertexShader: `
        attribute float seed; varying float vA; uniform vec3 uCam;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = length(position - uCam);
          vA = smoothstep(${BOX * 0.5}.0, 2.0, d) * (0.55 + 0.45 * seed);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA; uniform float uOpacity; uniform float uDay;
        void main() { gl_FragColor = vec4(mix(vec3(0.55, 0.6, 0.7), vec3(0.82, 0.86, 0.9), uDay), vA * uOpacity); }`,
    });
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    this.lines.renderOrder = 5;
    scene.add(this.lines);
    this.amount = 0;
    this.target = 0;
    this.t = 0;
  }

  /** 0 (dry) to 1 (steady rain). */
  set(amount) { this.target = amount; }

  update(dt, camera, wind = { x: 0, z: 0 }, day = 1) {
    this.amount += (this.target - this.amount) * (1 - Math.exp(-dt * 0.8));
    if (this.amount < 0.01 && this.target === 0) { this.lines.visible = false; return; }
    this.lines.visible = true;
    this.t += dt;
    this.uni.uOpacity.value = this.amount * 0.6;
    this.uni.uDay.value = day;
    const c = camera.position;
    this.uni.uCam.value.copy(c);
    const fall = 9, sx = wind.x * 0.8, sz = wind.z * 0.8;
    const len = 1 / 30;
    const pos = this.lines.geometry.attributes.position.array;
    const b = this.base;
    for (let i = 0; i < N; i++) {
      // each drop loops through the box at its own phase, wrapped around the camera
      let y = b[i * 3 + 1] - ((this.t * fall + i * 0.37) % H);
      if (y < 0) y += H;
      const drift = (H - y) / fall;
      let x = b[i * 3] + sx * drift - c.x, z = b[i * 3 + 2] + sz * drift - c.z;
      x = ((x % BOX) + BOX * 1.5) % BOX - BOX / 2 + c.x;
      z = ((z % BOX) + BOX * 1.5) % BOX - BOX / 2 + c.z;
      const yw = c.y - 10 + y;
      const o = i * 6;
      pos[o] = x; pos[o + 1] = yw; pos[o + 2] = z;
      pos[o + 3] = x - sx * len * 3.6; pos[o + 4] = yw + 1.1; pos[o + 5] = z - sz * len * 3.6;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}
