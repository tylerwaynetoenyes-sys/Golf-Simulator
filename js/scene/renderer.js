import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Bloom blurs through a chain of half-size targets, so a single NaN / Inf pixel
// (a shader edge case, or a highlight above the half-float limit of 65504)
// spreads into flashing black squares. Scrub the frame before it gets there.
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float s = c.r + c.g + c.b + c.a;
      // NaN fails every comparison; Inf fails the upper bound
      bool ok = (s > -1.0) && (s < 1.0e4);
      bvec4 bad = bvec4(isnan(c.r) || isinf(c.r), isnan(c.g) || isinf(c.g), isnan(c.b) || isinf(c.b), isnan(c.a) || isinf(c.a));
      if (!ok || any(bad)) {
        c = vec4((isnan(c.r) || c.r < 0.0) ? 0.0 : min(c.r, 40.0), (isnan(c.g) || c.g < 0.0) ? 0.0 : min(c.g, 40.0),
                 (isnan(c.b) || c.b < 0.0) ? 0.0 : min(c.b, 40.0), 1.0);
      }
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 40.0), clamp(c.a, 0.0, 1.0));
    }`,
};

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
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.05, 90000);
    this.quality = QUALITY[quality] || QUALITY.high;
    this.qualityName = quality;

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.82);
    this.composer.addPass(this.renderPass);
    this.sanitize = new ShaderPass(SanitizeShader);
    this.composer.addPass(this.sanitize);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    // Coalesce resize bursts (iPad toolbar show/hide, rotation, AirPlay) into
    // one reallocation per frame, skip no-op resizes, and redraw straight away
    // so the cleared canvas never reaches the screen as a black frame.
    this._resizeQueued = false;
    const queue = () => {
      if (this._resizeQueued) return;
      this._resizeQueued = true;
      requestAnimationFrame(() => { this._resizeQueued = false; if (this.resize()) this.render(); });
    };
    window.addEventListener('resize', queue);
    window.visualViewport?.addEventListener('resize', queue);
    this.setQuality(quality);
  }

  setQuality(name) {
    this.quality = QUALITY[name] || QUALITY.high;
    this.qualityName = name;
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.bloom.enabled = this.quality.bloom;
    this.resize(true);
  }

  /** Returns true when the drawing buffer actually changed. */
  resize(force = false) {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio);
    if (!force && w === this._w && h === this._h && pr === this._pr) return false;
    this._w = w; this._h = h; this._pr = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * pr * 0.5, h * pr * 0.5);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    return true;
  }

  render() {
    if (this.quality.bloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
