import * as THREE from 'three';
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
import { Characters, ASSET_MANIFEST, loadSlot } from './assets.js';
import { CTP_GREEN, terrain as rangeTerrain, groundHeight as rangeGround } from './layout.js';
import { CourseWorld } from '../course/courseWorld.js';
import { PlayerMarkers } from './markers.js';
import { Environment } from './environment.js';
import { Ambient } from './ambient.js';

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
    this.course = new CourseWorld(scene);
    this.markers = new PlayerMarkers(scene);
    this.ambient = new Ambient(scene);
    this.ambient.setCenter(0, -160);
    this.sceneMode = 'range';
    this.terrainFn = rangeTerrain;
    this.groundFn = rangeGround;
    this.visualGround = rangeGround;
    this.time = 0;
    this._focusV = new THREE.Vector3();
    this.env = new Environment(this);
    this.loadAuthoredAssets();
  }

  /** Swap procedural groups for authored glTF models where the manifest has a url. */
  async loadAuthoredAssets() {
    const targets = {
      arch: this.skyline.archMesh,
      bridge: this.skyline.bridgeGroup,
      riverboat: this.skyline.riverboat,
      canopy: this.range.canopy,
      altonSign: this.range.sign,
    };
    for (const [name, slot] of Object.entries(ASSET_MANIFEST)) {
      if (!slot.url || !slot.replaces) continue;
      const loaded = await loadSlot(name);
      const old = targets[slot.replaces];
      if (!loaded || !old) continue;
      // Without an explicit position, take over the procedural object's transform.
      if (!slot.position) {
        loaded.root.position.copy(old.position);
        loaded.root.rotation.copy(old.rotation);
      }
      old.parent.add(loaded.root);
      old.visible = false;
    }
  }

  /** 'range' (the bluff) or 'course' (a Confluence Course hole). */
  setScene(mode) {
    if (mode === this.sceneMode) return;
    this.sceneMode = mode;
    const course = mode === 'course';
    this.terrain.group.visible = !course;
    this.range.group.visible = !course;
    this.river.mesh.visible = !course;
    this.skyline.bridgeGroup.visible = !course;
    this.skyline.setNearVisible?.(!course);
    this.course.setVisible(course);
    if (!course) {
      this.terrainFn = rangeTerrain;
      this.groundFn = rangeGround;
      this.ball.setGround(rangeGround);
      this.visualGround = rangeGround;
      this.rig.setGround(rangeGround);
      this.rig.obstacle = null;
      this.rig.nearPole = null;
      this.rig.setAddress(new THREE.Vector3(0, 0.1, 0), 0);
      this.markers.set([]);
      this.ambient.setCenter(0, -160);
    }
    // the moon/sun key light lives in the range group; keep it lit everywhere
    this.range.group.visible = true;
    this.range.setPropsVisible(!course);
    this.env?.apply();
  }

  /** Build a course hole and point physics/camera/ball at its terrain. */
  loadHole(hole) {
    this.setScene('course');
    const T = this.course.load(hole);
    this.terrainFn = T.terrain;
    this.groundFn = T.groundHeight;
    this.ball.setGround(this.course.visualHeight);
    this.visualGround = this.course.visualHeight;
    this.rig.setGround(T.groundHeight);
    this.rig.obstacle = this.course.cameraClear;
    this.rig.nearPole = this.course.nearPole;
    const mid = T.pointAt(T.length * 0.5);
    this.ambient.setCenter(mid.x, mid.z);
    this.env.apply();
    return T;
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
    this.env.focus(this._focusV.lerpVectors(this.camera.position, this.rig.look, 0.3));
    this.env.update(dt);
    this.ball.update(dt, this.camera);
    this.tracer.update(dt);
    this.effects.update(dt);
    this.characters.update(dt);
    if (this.sceneMode === 'course') this.course.update(t, dt, this.camera);
    this.markers.update(t);
    this.ambient.update(dt, t);
    if (render) this.r.render();
  }
}
