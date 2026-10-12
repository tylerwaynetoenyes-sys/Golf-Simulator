import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const QUALITY = {
  high: { pixelRatio: 2, bloom: true, shadows: true, shadowSize: 2048, waterLights: 64, trees: 1 },
  medium: { pixelRatio: 1.5, bloom: true, shadows: true, shadowSize: 1024, waterLights: 40, trees: 0.7 },
  low: { pixelRatio: 1, bloom: false, shadows: false, shadowSize: 512, waterLights: 20, trees: 0.4 },
};

export class Renderer {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.05, 30000);
    this.quality = QUALITY[quality] || QUALITY.high;
    this.qualityName = quality;

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.82);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.setQuality(quality);
  }

  setQuality(name) {
    this.quality = QUALITY[name] || QUALITY.high;
    this.qualityName = name;
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.bloom.enabled = this.quality.bloom;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * pr * 0.5, h * pr * 0.5);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    if (this.quality.bloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
