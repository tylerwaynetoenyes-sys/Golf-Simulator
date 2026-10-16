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
import { Divots } from './divots.js';
import { BallBed } from './ballBed.js';
import { Environment } from './environment.js';
import { Ambient } from './ambient.js';
import { Rain } from './rain.js';
import { patchOccluders, setOcclusion } from './occlusion.js';
import { patchRock } from '../course/rock.js';
import { Club } from './club.js';
import { updateInstanceCulling } from './instanceCull.js';

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
    this.effects.ground = (x, z) => (this.groundFn ? this.groundFn(x, z) : 0);
    this.effects.camera = camera;
    this.rig = new CameraRig(camera);
    this.rig.snapshot = (cb) => this.r.snapshot(cb); // camera changes dissolve instead of cutting hard
    this.characters = new Characters(scene);
    this.club = new Club(scene);
    this.course = new CourseWorld(scene);
    this.markers = new PlayerMarkers(scene);
    this.divots = new Divots(scene);
    this.ballBed = new BallBed(scene);
    this.ambient = new Ambient(scene);
    this.rain = new Rain(scene);
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
      this.sky.setPlace?.({}); // the range: the St. Louis glow, the generated sky
      this.terrainFn = rangeTerrain;
      this.groundFn = rangeGround;
      this.ball.setGround(rangeGround);
      this.visualGround = rangeGround;
      this.rig.setGround(rangeGround);
      this.rig.obstacle = null;
      this.rig.canopy = null;
      this.rig.nearPole = null;
      this.rig.setAddress(new THREE.Vector3(0, 0.1, 0), 0);
      this.markers.set([]);
      this.divots.clear();
      this.ambient.setCenter(0, -160);
      this.fogScale = 1;
      this.theme = 'parkland';
      this.skyline.group.visible = true;
    }
    // the moon/sun key light lives in the range group; keep it lit everywhere
    this.range.group.visible = true;
    this.range.setPropsVisible(!course);
    this.env?.apply();
  }

  /** Build a course hole and point physics/camera/ball at its terrain. */
  loadHole(hole) {
    this.setScene('course');
    // fewer trees and grass tufts on lighter quality settings (iPad)
    this.course.treeDensity = this.r.quality.trees ?? 1;
    // dry high-plains and Mediterranean air carries much farther than
    // Mississippi valley haze
    this.fogScale = { western: 0.5, coastal: 0.6, harbor: 0.8, urban: 0.85, paris: 0.8, industrial: 0.9 }[hole.theme] ?? 1;
    this.theme = hole.theme || 'parkland';
    // the place's own skies: the Milky Way over a dark site, a prairie or Mediterranean day
    this.sky.setPlace?.(hole.sky || {});
    // the St. Louis skyline belongs to the Confluence Course only
    this.skyline.group.visible = !hole.course || hole.course === 'confluence';
    // a hole can turn the skyline about the tee, to sit where it reads from there (Chain of Rocks)
    this.skyline.group.rotation.y = hole.skylineYaw || 0;
    // ...or move it nearer: the Riverboat hole stands directly across the river from the Arch
    this.skyline.group.position.set(...(hole.skylineShift ? [hole.skylineShift[0], 0, hole.skylineShift[1]] : [0, 0, 0]));
    const T = this.course.load(hole);
    this.divots.clear();
    // trees, shrubs and long grass fade where they'd hide the ball
    patchOccluders(this.course.root);
    // real rock on the steep faces: bluffs, cliffs, badlands
    patchRock(this.course.root, hole.course || 'confluence');
    this.terrainFn = T.terrain;
    this.groundFn = T.groundHeight;
    this.ball.setGround(this.course.visualHeight);
    this.visualGround = this.course.visualHeight;
    this.rig.setGround(T.groundHeight);
    this.rig.obstacle = this.course.cameraClear;
    this.rig.canopy = this.course.treeHit;
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

  /**
   * The lie view: a close-up of the ball from just behind it, rendered once
   * into a small offscreen target and read back (no per-frame cost). Returns
   * ImageData, or null.
   */
  renderLieView(pos, headingDeg, size = 512) {
    const r = this.r.renderer;
    if (!this._lieRT || this._lieRT.width !== size) {
      this._lieRT?.dispose();
      this._lieRT = new THREE.WebGLRenderTarget(size, size, { samples: 8 });
      this._lieRT.texture.colorSpace = THREE.SRGBColorSpace;
      this._lieCam = new THREE.PerspectiveCamera(30, 1, 0.005, 400);
      this._liePx = new Uint8Array(size * size * 4);
    }
    const cam = this._lieCam;
    const a = (headingDeg * Math.PI) / 180;
    const fx = Math.sin(a), fz = -Math.cos(a), rx = -fz, rz = fx;
    const by = this.ball.mesh.position.y;
    const gy = this.visualGround(pos.x, pos.z);
    // down at the ball's level from just behind and to one side: the dimples, the tee under it, the blades
    // round it (and how far down in them it sits), with the line ahead out of focus beyond
    // in long grass, from higher, to see the ball down in it
    const lift = Math.max(0.035, by - gy + 0.02) + (this.ballBed?.uFade.value.y > 3 ? 0.06 : 0);
    cam.position.set(pos.x - fx * 0.24 + rx * 0.09, gy + lift + 0.035, pos.z - fz * 0.24 + rz * 0.09);
    cam.lookAt(pos.x + fx * 0.04, (by + gy) / 2 + 0.006, pos.z + fz * 0.04);
    const clubVis = this.club.root.visible;
    this.club.root.visible = false;
    const prevTarget = r.getRenderTarget();
    r.setRenderTarget(this._lieRT);
    r.clear();
    // the sun's shadow map from the last frame is still right (nothing has
    // moved since): drawing it again would double the frame's shadow work
    const shadows = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.render(this.scene, cam);
    r.shadowMap.autoUpdate = shadows;
    r.readRenderTargetPixels(this._lieRT, 0, 0, size, size, this._liePx);
    r.setRenderTarget(prevTarget);
    this.club.root.visible = clubVis;
    // flip rows (GL reads bottom-up)
    const out = new ImageData(size, size);
    for (let y = 0; y < size; y++) out.data.set(this._liePx.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    return out;
  }

  update(dt, ballPos, playT, render = true) {
    this.time += dt;
    const t = this.time;
    this.sky.update(t);
    this.river.update(t);
    this.skyline.update(t, dt, this.camera, this.r.renderer.domElement.height);
    this.range.update(t, dt, this.camera);
    this.rig.update(dt, ballPos, playT);
    // keep the view clear along what the camera is aiming at (the ball, or
    // the landing area the spotter frames). In a flyover only what passes
    // right by the lens fades (a focus on the camera itself has no corridor),
    // until the landing onto the ball (rig.flyOcclude)
    const fly = this.rig.mode === 'flyover';
    const focus = this.rig.mode === 'address' ? ballPos : fly && !this.rig.flyOcclude ? this.camera.position : this.rig.look;
    setOcclusion(this.camera.position, focus, this.sceneMode === 'course' && this.rig.mode !== 'showcase');
    this.env.focus(this._focusV.lerpVectors(this.camera.position, this.rig.look, 0.3));
    this.env.update(dt);
    this.ball.update(dt, this.camera);
    this.tracer.update(dt);
    this.effects.update(dt);
    this.divots.update(dt);
    this.ballBed.update(dt, t, this.env.wind?.(0, { gust: false }));
    this.characters.update(dt);
    this.club.update(dt, t);
    if (this.sceneMode === 'course') { this.course.ballPos = ballPos; this.course.update(t, dt, this.camera); }
    this.markers.update(t);
    this.ambient.update(dt, t);
    this.rain.update(dt, this.camera, this.env.wind(0, { gust: false }), this.env.day);
    updateInstanceCulling(this.camera); // crowds, cars and boats: only the ones in view
    if (render) this.r.render();
  }
}
