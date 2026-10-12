// Assembles the scene: sky, terrain, river, skyline, range props, ball,
// tracer, effects, camera rig and (optional) characters.
import { Renderer } from './renderer.js';
import { createSky } from './sky.js';
import { createTerrain } from './terrain.js';
import { createRiver } from './river.js';
import { createSkyline } from './skyline.js';
import { createRange } from './rangeProps.js';
import { Ball } from './ball.js';
import { Tracer } from './tracer.js';
import { Effects } from './effects.js';
import { CameraRig } from './cameraRig.js';
import { Characters } from './assets.js';
import { CTP_GREEN } from './layout.js';

export class World {
  constructor(canvas, quality = 'high') {
    this.r = new Renderer(canvas, quality);
    const { scene, camera } = this.r;
    this.scene = scene;
    this.camera = camera;
    this.sky = createSky();
    scene.add(this.sky.mesh);
    this.terrain = createTerrain(scene);
    this.river = createRiver(scene, this.r.quality.waterLights);
    this.skyline = createSkyline(scene, this.river);
    this.range = createRange(scene, this.river, this.r.quality);
    this.ball = new Ball(scene);
    this.tracer = new Tracer(scene);
    this.effects = new Effects(scene);
    this.rig = new CameraRig(camera);
    this.characters = new Characters(scene);
    this.time = 0;
  }

  setQuality(name) {
    this.r.setQuality(name);
    this.river.setBudget(this.r.quality.waterLights);
  }

  setCtp(on) {
    this.range.setCtp(CTP_GREEN.x, CTP_GREEN.z, on);
    this.terrain.rebuildHeights();
    this.terrain.setCtpGreen();
  }

  update(dt, ballPos, playT, render = true) {
    this.time += dt;
    const t = this.time;
    this.sky.update(t);
    this.river.update(t);
    this.skyline.update(t, dt, this.camera, this.r.renderer.domElement.height);
    this.range.update(t, dt);
    this.rig.update(dt, ballPos, playT);
    this.ball.update(dt, this.camera);
    this.tracer.update(dt);
    this.effects.update(dt);
    this.characters.update(dt);
    if (render) this.r.render();
  }
}
