import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

// Atmosphere, for every material: three's exponential fog made height-aware (air is thicker low down, so
// valleys and the far side of a lake haze over while a rise against the sky stays clear) and, far off, a
// little bluer (aerial perspective on the hills behind a course). Same fogColor and fogDensity as before.
THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying vec3 vFogWorld;\n#endif';
THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
\tvFogDepth = - mvPosition.z;
\tvFogWorld = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );
#endif`;
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
\tuniform vec3 fogColor;
\tvarying float vFogDepth;
\tvarying vec3 vFogWorld;
\t#ifdef FOG_EXP2
\t\tuniform float fogDensity;
\t#else
\t\tuniform float fogNear;
\t\tuniform float fogFar;
\t#endif
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
\t#ifdef FOG_EXP2
\t\tvec3 fogRay = vFogWorld - cameraPosition;
\t\tfloat fogDist = length( fogRay );
\t\t// density falls off with height above the eye: integrate it along the ray
\t\tfloat fogB = 0.0045, fogDy = fogRay.y * fogB;
\t\tfloat fogK = abs( fogDy ) < 1e-3 ? 1.0 - 0.5 * fogDy : ( 1.0 - exp( - fogDy ) ) / fogDy;
\t\tfloat fogAmt = fogDensity * fogDist * clamp( fogK, 0.15, 3.0 );
\t\tfloat fogFactor = 1.0 - exp( - fogAmt * fogAmt );
\t\tvec3 fogC = mix( fogColor, fogColor * vec3( 0.86, 0.95, 1.1 ), smoothstep( 600.0, 6000.0, fogDist ) );
\t#else
\t\tfloat fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
\t\tvec3 fogC = fogColor;
\t#endif
\tgl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );
#endif`;

/**
 * Ambient occlusion (ground-truth AO, half resolution): the soft contact shadow where the ball sits in the
 * grass, under the tee, round the cup, in bunker faces, at the foot of trees and buildings. Only solid things
 * take part: leaf and grass cards, sprites and see-through water would draw as solid shapes in the AO's own
 * depth pass and leave dark halos, so they're hidden from it (they still receive the AO the solids cast).
 */
class FairwayGTAO extends GTAOPass {
  _overrideVisibility() {
    const cache = this._visibilityCache;
    this.scene.traverse((o) => {
      if (!o.visible) return;
      let hide = o.isPoints || o.isLine || o.isLine2 || o.isSprite || o.userData?.noAO;
      if (!hide && o.isMesh) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        hide = ms.some((m) => m && (m.transparent || m.alphaTest > 0 || m.isShaderMaterial || m.side === THREE.BackSide));
      }
      if (hide) { o.visible = false; cache.push(o); }
    });
  }
}

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

// One finish over every course, so scanned models, real trees and the
// procedural pieces sit in the same picture: a gentle filmic S-curve, foliage
// saturation pulled back from ACES's neon, shadows a touch cool and
// highlights a touch warm, and a soft vignette. Display-referred (runs after
// tone mapping); `uAmount` 0 leaves the frame untouched.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 1 }, uNight: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uAmount; uniform float uNight; varying vec2 vUv;
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = clamp(src.rgb, 0.0, 1.0);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      vec3 g = mix(c, c * c * (3.0 - 2.0 * c), 0.16);
      // greens and yellows lose a little saturation, skin and sky keep theirs
      float green = smoothstep(0.02, 0.12, c.g - max(c.r, c.b) * 0.92);
      g = mix(vec3(l), g, 1.0 - 0.1 * green - 0.03);
      g += (vec3(-0.010, 0.0, 0.016) * (1.0 - l) + vec3(0.018, 0.007, -0.016) * l) * (1.0 - uNight);
      vec2 q = vUv - 0.5;
      g *= 1.0 - dot(q, q) * mix(0.32, 0.5, uNight);
      gl_FragColor = vec4(mix(src.rgb, g, uAmount), src.a);
    }`,
};

// smaa: edge anti-aliasing at the end of the post chain (the canvas's own antialias doesn't reach the chain;
// multisampling its half-float buffer measured ~60 ms a frame at iPad resolution, SMAA a few); msaa: samples
// if wanted anyway; ao: ground-truth ambient occlusion; reflections: water mirrors the scene (else the sky).
// Medium is the iPad budget; High is the Mac and the TV. The height-aware haze is on at every level.
export const QUALITY = {
  high: { pixelRatio: 2, bloom: true, smaa: true, msaa: 0, ao: true, reflections: true, shadows: true, shadowSize: 2048, waterLights: 64, trees: 1 },
  medium: { pixelRatio: 1.5, bloom: true, smaa: true, msaa: 0, ao: false, reflections: false, shadows: true, shadowSize: 1024, waterLights: 40, trees: 0.7 },
  low: { pixelRatio: 1, bloom: false, smaa: false, msaa: 0, ao: false, reflections: false, shadows: false, shadowSize: 512, waterLights: 20, trees: 0.4 },
};
// the tone curve: Khronos PBR Neutral keeps the course's own colours (ACES pushed greens neon and yellow)
export const TONE = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping };

export class Renderer {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    // reversed-Z (float depth, where EXT_clip_control exists) keeps depth
    // precise from the ball at your feet to real terrain on the horizon;
    // three.js falls back to a standard buffer elsewhere
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false, reversedDepthBuffer: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.setTone(new URLSearchParams(location.search).get('tone') || 'neutral');
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.05, 90000);
    this.quality = QUALITY[quality] || QUALITY.high;
    this.qualityName = quality;

    // the post chain renders into its own multisampled half-float target, so edges stay smooth with bloom on
    this.target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: this.quality.msaa || 0 });
    this.composer = new EffectComposer(this.renderer, this.target);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.82);
    this.composer.addPass(this.renderPass);
    this.ao = new FairwayGTAO(this.scene, this.camera, 256, 256);
    // contact shadows within a metre or so: nothing reaches across the fairway or darkens the hills
    this.ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.6, thickness: 1.2, scale: 1.0, samples: 12 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.ao.blendIntensity = 0.85;
    this.composer.addPass(this.ao);
    this.sanitize = new ShaderPass(SanitizeShader);
    this.composer.addPass(this.sanitize);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);

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
    this.quality = { ...(QUALITY[name] || QUALITY.high) };
    // test switches: ?ao=0 ?refl=0 ?msaa=0 ?bloom=0 (measuring what each effect costs)
    const q = new URLSearchParams(location.search);
    if (q.get('ao') === '0') this.quality.ao = false;
    if (q.get('refl') === '0') this.quality.reflections = false;
    if (q.get('msaa') != null) this.quality.msaa = Number(q.get('msaa')) || 0;
    if (q.get('bloom') === '0') this.quality.bloom = false;
    if (q.get('smaa') === '0') this.quality.smaa = false;
    this.qualityName = name;
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.bloom.enabled = this.quality.bloom;
    this.ao.enabled = !!this.quality.ao && !this.backdrop;
    this.smaa.enabled = !!this.quality.smaa;
    if (this.target.samples !== (this.quality.msaa || 0)) {
      this.target.samples = this.quality.msaa || 0;
      this.composer.renderTarget1.samples = this.target.samples;
      this.composer.renderTarget2.samples = this.target.samples;
      this.target.dispose(); this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose();
    }
    this.resize(true);
  }

  /** The tone curve ('neutral', 'agx' or 'aces'), with the exposure that suits it. */
  setTone(name) {
    this.toneName = TONE[name] !== undefined ? name : 'neutral';
    this.renderer.toneMapping = TONE[this.toneName];
    // (environment.js sets the exposure for the time of day; this is the curve's gain on top of it)
    this.toneGain = { aces: 1, agx: 1.12, neutral: 0.96 }[this.toneName];
    this.renderer.toneMappingExposure = 1.05 * this.toneGain;
  }

  /**
   * Behind the launch screen the 3D range is a darkened backdrop: draw it at a fraction of the resolution
   * (and without the AO and mirror passes) so the screen's motion stays smooth; play restores it.
   */
  setBackdrop(on) {
    if (this.backdrop === on) return;
    this.backdrop = on;
    this.ao.enabled = !on && !!this.quality.ao;
    this.resize(true);
  }

  /** Returns true when the drawing buffer actually changed. */
  resize(force = false) {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio) * (this.backdrop ? 0.5 : 1);
    if (!force && w === this._w && h === this._h && pr === this._pr) return false;
    this._w = w; this._h = h; this._pr = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * pr * 0.5, h * pr * 0.5);
    this.ao.setSize(Math.round(w * pr * 0.5), Math.round(h * pr * 0.5));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    return true;
  }

  render() {
    if (this.quality.bloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    // a cut was asked for: hold this frame over the next ones and let it dissolve
    if (this._snapCbs?.length) {
      const cbs = this._snapCbs; this._snapCbs = [];
      try { this._hold(); } catch (e) { /* no snapshot: the cut just happens */ }
      for (const cb of cbs) cb();
    }
  }

  /** Cross-dissolve the next camera change: cb runs once this frame is held. */
  snapshot(cb) { (this._snapCbs ||= []).push(cb); }

  _hold() {
    const src = this.renderer.domElement;
    let o = this._dissolve;
    if (!o) {
      o = this._dissolve = document.createElement('canvas');
      o.className = 'cut-dissolve';
      Object.assign(o.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', opacity: '0' });
      src.parentNode.insertBefore(o, src.nextSibling);
    }
    // draw at half resolution: it's a moment of motion, and cheaper on iPad
    o.width = Math.max(2, src.width >> 1); o.height = Math.max(2, src.height >> 1);
    o.getContext('2d').drawImage(src, 0, 0, o.width, o.height);
    o.style.transition = 'none';
    o.style.opacity = '1';
    void o.offsetWidth;
    o.style.transition = 'opacity 0.55s cubic-bezier(0.4, 0, 0.2, 1)';
    o.style.opacity = '0';
  }
}
