// Time of day + weather. Everything that changes between the night range and
// a bright afternoon (sky, sun/moon, floodlights, fog, river, skyline, bloom,
// exposure) is driven from one blend value so switching is a smooth 2.5 s
// cross-fade rather than a scene swap. Weather sets cloud cover, light levels
// and the wind that the ball flight actually uses.
import * as THREE from 'three';
import { MOON_DIR, SUN_DIR } from './sky.js';
import { waterMaterials } from './river.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const MPH = 0.44704;

export const WEATHER = {
  clear: { label: 'Clear', cloud: 0.12, windMph: 1.5, gust: 0.15, sun: 1, icon: 'sun' },
  cloudy: { label: 'Cloudy', cloud: 0.82, windMph: 4, gust: 0.2, sun: 0.42, icon: 'cloud' },
  breezy: { label: 'Light wind', cloud: 0.35, windMph: 8, gust: 0.25, sun: 0.92, icon: 'breeze' },
  windy: { label: 'Strong wind', cloud: 0.55, windMph: 17, gust: 0.3, sun: 0.75, icon: 'wind' },
  // steady rain: soft turf (less bounce and roll), low light, a moderate wind
  rain: { label: 'Rain', cloud: 0.97, windMph: 7, gust: 0.25, sun: 0.28, icon: 'rain', rain: 1 },
};

const NIGHT = {
  fog: new THREE.Color(0x0a111d), fogDensity: 0.00032, exposure: 1.05, bloom: 0.85, bloomThreshold: 0.82,
  hemiSky: new THREE.Color(0x22324f), hemiGround: new THREE.Color(0x0d0b08), hemi: 0.4,
  key: new THREE.Color(0x9fb4e6), keyIntensity: 0.42,
};
const DAY = {
  fog: new THREE.Color(0xb7cce0), fogDensity: 0.00024, exposure: 0.92, bloom: 0.32, bloomThreshold: 0.93,
  hemiSky: new THREE.Color(0xbcd6f0), hemiGround: new THREE.Color(0x4a5a34), hemi: 0.8,
  key: new THREE.Color(0xfff0d8), keyIntensity: 2.7,
};
const OVERCAST_FOG = new THREE.Color(0xa7b0ba);

// Per-course daylight character: the high plains in late-afternoon gold, the
// Provençal coast in hard white light and blue haze.
const THEME_DAY = {
  western: { key: new THREE.Color(0xffd3a0), keyMul: 1.05, fog: new THREE.Color(0xd8cdb6), hemiGround: new THREE.Color(0x76653f) },
  coastal: { key: new THREE.Color(0xfff4e2), keyMul: 1.1, fog: new THREE.Color(0xbfd3e6), hemiGround: new THREE.Color(0x6b6a52) },
};

/**
 * Image-based lighting: a small generated sky (zenith → horizon glow →
 * ground bounce) prefiltered for PBR, so every material picks up soft sky
 * reflections and coloured ambient instead of looking flat-lit.
 */
function skyEnvironment(renderer, { zenith, horizon, glow, glowDir, ground }) {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uZ: { value: new THREE.Color(zenith) }, uH: { value: new THREE.Color(horizon) },
      uG: { value: new THREE.Color(ground) }, uGlow: { value: new THREE.Color(glow) }, uDir: { value: glowDir.clone().normalize() },
    },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 uZ; uniform vec3 uH; uniform vec3 uG; uniform vec3 uGlow; uniform vec3 uDir; varying vec3 vD;
      void main() {
        vec3 d = normalize(vD);
        float up = clamp(d.y, 0.0, 1.0);
        vec3 sky = mix(uH, uZ, pow(up, 0.5));
        float s = max(dot(d, uDir), 0.0);
        sky += uGlow * (pow(s, 6.0) * 0.6 + pow(s, 64.0) * 2.5);
        vec3 col = d.y >= 0.0 ? sky : mix(uH * 0.6, uG, clamp(-d.y * 3.0, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), mat));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.02);
  pm.dispose();
  mat.dispose();
  return rt.texture;
}

// Photographed skies from Poly Haven (CC0) for image-based light: a partly
// cloudy midday, a flat overcast, and a moonless night over a golf course.
const HDRI = {
  day: 'kloofendal_48d_partly_cloudy_puresky_1k.hdr',
  overcast: 'kloofendal_overcast_puresky_1k.hdr',
  storm: 'overcast_soil_puresky_1k.hdr', // heavy rolling storm cloud (Poly Haven, CC0)
  night: 'moonless_golf_1k.hdr',
};

/**
 * Prepare a photographed sky for lighting: turn it so its brightest point
 * (the sun) sits at the scene's sun azimuth, clip the sun disc (the
 * directional light already draws it), and scale it to a mean sky radiance
 * of 1 so day, overcast and night share one intensity scale.
 */
function prepareHdri(tex, align) {
  const { data, width: W, height: H } = tex.image;
  let max = 0, mi = 0, sum = 0, n = 0;
  for (let i = 0; i < W * H; i++) {
    const L = data[i * 4] * 0.2126 + data[i * 4 + 1] * 0.7152 + data[i * 4 + 2] * 0.0722;
    if (L > max) { max = L; mi = i; }
  }
  if (align) {
    // three's equirect lookup: u = atan2(z, x) / 2π + 0.5
    const uSun = ((mi % W) + 0.5) / W;
    const uWant = Math.atan2(align.z, align.x) / (2 * Math.PI) + 0.5;
    const shift = Math.round((uWant - uSun) * W);
    const row = new Float32Array(W * 4);
    for (let y = 0; y < H; y++) {
      const o = y * W * 4;
      for (let x = 0; x < W; x++) {
        const t = (((x + shift) % W) + W) % W;
        row.set(data.subarray(o + x * 4, o + x * 4 + 4), t * 4);
      }
      data.set(row, o);
    }
  }
  const CAP = 6;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const L = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
    if (L > CAP) { const k = CAP / L; data[i] *= k; data[i + 1] *= k; data[i + 2] *= k; }
    if (y < H / 2) { sum += Math.min(L, CAP); n++; }
  }
  const norm = n ? n / sum : 1;
  for (let i = 0; i < W * H; i++) { data[i * 4] *= norm; data[i * 4 + 1] *= norm; data[i * 4 + 2] *= norm; }
  tex.needsUpdate = true;
  return tex;
}

export class Environment {
  constructor(world) {
    this.w = world;
    this.day = 0;
    this.targetDay = 0;
    this.weatherId = 'clear';
    this.cloud = WEATHER.clear.cloud;
    this.sunAmt = 1;
    this.windFromDeg = 200;
    this.drift = new THREE.Vector2();
    this.t = 0;
    this._focus = new THREE.Vector3();
    this._tmpC = new THREE.Color();
    this._tmpC2 = new THREE.Color();
    this.listeners = new Set();
    try {
      const r = world.r.renderer;
      this.envDay = skyEnvironment(r, { zenith: 0x3d74c4, horizon: 0xc9dcec, glow: 0xfff0d0, glowDir: SUN_DIR, ground: 0x4c5a35 });
      this.envNight = skyEnvironment(r, { zenith: 0x05080f, horizon: 0x1c2232, glow: 0x4a2c18, glowDir: new THREE.Vector3(0.2, 0.05, -1), ground: 0x0b0d09 });
    } catch (e) { console.warn('environment map unavailable', e); }
    this.hdri = null;
    this._loadHdri(world.r.renderer);
    this.apply();
  }

  async _loadHdri(renderer) {
    if (typeof window === 'undefined') return;
    try {
      const loader = new HDRLoader().setDataType(THREE.FloatType);
      const base = new URL('../../assets/hdri/', import.meta.url).href;
      const [day, overcast, night, storm] = await Promise.all([HDRI.day, HDRI.overcast, HDRI.night, HDRI.storm].map((f) => loader.loadAsync(base + f)));
      const pm = new THREE.PMREMGenerator(renderer);
      const make = (t, align) => { t.mapping = THREE.EquirectangularReflectionMapping; const rt = pm.fromEquirectangular(prepareHdri(t, align)); t.dispose(); return rt.texture; };
      this.hdri = { day: make(day, SUN_DIR), overcast: make(overcast, null), night: make(night, MOON_DIR), storm: make(storm, null) };
      pm.dispose();
      this.apply();
    } catch (e) { console.warn('HDRI sky lighting unavailable; using the generated sky', e); }
  }

  get isDay() { return this.targetDay > 0.5; }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const f of this.listeners) f(this); }

  setTime(which, immediate = false) {
    this.targetDay = which === 'day' ? 1 : 0;
    if (immediate) { this.day = this.targetDay; this.apply(); }
    this._emit();
  }

  /**
   * 'changing': the weather looks after itself. Every few minutes it moves on
   * (clear skies cloud over, the wind gets up, a shower blows through and
   * clears), and the wind's direction wanders a little all the while.
   */
  setWeather(id, { immediate = false, windFromDeg = null } = {}) {
    this.auto = id === 'changing';
    if (this.auto) {
      const pick = [['clear', 0.3], ['cloudy', 0.25], ['breezy', 0.25], ['windy', 0.1], ['rain', 0.1]];
      let r = Math.random(); id = pick.find(([, p]) => (r -= p) < 0)?.[0] || 'cloudy';
      this._next = 150 + Math.random() * 240;
    }
    if (!WEATHER[id]) id = 'clear';
    this.weatherId = id;
    if (windFromDeg != null) this.windFromDeg = windFromDeg;
    if (immediate) { this.cloud = WEATHER[id].cloud; this.sunAmt = WEATHER[id].sun; }
    this.apply();
    this._emit();
  }

  setWindDirection(fromDeg) { this.windFromDeg = ((fromDeg % 360) + 360) % 360; this.apply(); this._emit(); }

  get weather() { return WEATHER[this.weatherId]; }

  /** The weather director's next move from where it is (rain never lasts long). */
  _advance() {
    const next = {
      clear: [['clear', 0.3], ['cloudy', 0.35], ['breezy', 0.35]],
      cloudy: [['clear', 0.25], ['breezy', 0.2], ['windy', 0.15], ['rain', 0.4]],
      breezy: [['clear', 0.3], ['cloudy', 0.3], ['windy', 0.3], ['rain', 0.1]],
      windy: [['breezy', 0.45], ['cloudy', 0.25], ['rain', 0.3]],
      rain: [['cloudy', 0.6], ['breezy', 0.25], ['rain', 0.15]],
    }[this.weatherId] || [['clear', 1]];
    let r = Math.random();
    const id = next.find(([, p]) => (r -= p) < 0)?.[0] || next[0][0];
    this._next = id === 'rain' ? 120 + Math.random() * 180 : 180 + Math.random() * 300;
    if (id !== this.weatherId) {
      this.weatherId = id;
      // a front swings the wind round a little
      this.windFromDeg = ((this.windFromDeg + (Math.random() - 0.5) * 70) % 360 + 360) % 360;
      this.apply();
      this._emit();
      for (const f of this.weatherListeners || []) f(id);
    }
  }
  onWeatherChange(fn) { (this.weatherListeners ||= []).push(fn); }

  /** How soaked the turf is (0–1), for the bounce and roll. */
  get wet() { return this.weather.rain || 0; }

  /**
   * Wind for the next shot (air velocity, m/s). Includes a gust so strong wind
   * is never perfectly predictable. fromDeg 0 = into the player's face.
   */
  wind(headingDeg = 0, { gust = true } = {}) {
    const w = this.weather;
    const g = gust ? 1 + (Math.random() * 2 - 1) * w.gust : 1;
    const mph = w.windMph * g;
    const a = ((this.windFromDeg + headingDeg) * Math.PI) / 180;
    const s = mph * MPH;
    return { x: -Math.sin(a) * s, z: Math.cos(a) * s, mph, fromDeg: this.windFromDeg };
  }

  /** Set the point lights/shadows should centre on (usually where the camera looks). */
  focus(v) { this._focus.copy(v); }

  update(dt) {
    this.t += dt;
    if (this.auto) {
      this._next -= dt;
      if (this._next <= 0) this._advance();
      // the wind never quite settles
      this.windFromDeg = (this.windFromDeg + Math.sin(this.t * 0.013) * dt * 0.6 + 360) % 360;
    }
    const k = 1 - Math.exp(-dt * 1.6);
    const prev = this.day + this.cloud + this.sunAmt;
    this.day += (this.targetDay - this.day) * k;
    if (Math.abs(this.targetDay - this.day) < 0.002) this.day = this.targetDay;
    const w = this.weather;
    this.cloud += (w.cloud - this.cloud) * k;
    this.sunAmt += (w.sun - this.sunAmt) * k;
    // the storm sky comes in with the rain, a little slower than the cloud
    this.storm = (this.storm || 0) + ((w.rain ? 1 : 0) - (this.storm || 0)) * (1 - Math.exp(-dt * 0.6));
    this.w.sky.uniforms.uStorm.value = this.storm;
    this.w.sky.uniforms.uStormTurn.value += dt * (0.0004 + w.windMph * 0.00006);
    if (Math.abs(prev - (this.day + this.cloud + this.sunAmt)) > 1e-5 || Math.abs((this._lastStorm ?? -1) - this.storm) > 0.02) { this._lastStorm = this.storm; this.apply(); }

    // clouds drift with the wind
    const ws = 0.0006 + w.windMph * 0.00045;
    const a = (this.windFromDeg * Math.PI) / 180;
    this.drift.x += Math.sin(a) * ws * dt * 10;
    this.drift.y -= Math.cos(a) * ws * dt * 10;
    this.w.sky.uniforms.uDrift.value.copy(this.drift);
    for (const m of waterMaterials) m.uniforms.uTime.value = this.t;

    // keep the key light's shadow frustum on the action
    const key = this.w.range.moon;
    const dir = this.day > 0.5 ? SUN_DIR : MOON_DIR;
    // Snap the shadow camera to whole shadow-map texels in light space, so a
    // moving camera doesn't make every shadow edge crawl and flicker.
    const sc = key.shadow.camera;
    const texel = (sc.right - sc.left) / (key.shadow.mapSize.x || 1024);
    const f = this._snapV || (this._snapV = new THREE.Vector3());
    const right = this._lr || (this._lr = new THREE.Vector3());
    const upL = this._lu || (this._lu = new THREE.Vector3());
    right.set(0, 1, 0).cross(dir).normalize();
    upL.copy(dir).cross(right).normalize();
    const fx = Math.round(this._focus.dot(right) / texel) * texel;
    const fy = Math.round(this._focus.dot(upL) / texel) * texel;
    const fz = this._focus.dot(dir);
    f.copy(right).multiplyScalar(fx).addScaledVector(upL, fy).addScaledVector(dir, fz);
    key.target.position.copy(f);
    key.position.copy(f).addScaledVector(dir, 150);
    key.target.updateMatrixWorld();
  }

  apply() {
    const d = this.day;
    const c = this.cloud;
    const w = this.w;
    const lerpC = (a, b, t) => this._tmpC.copy(a).lerp(b, t);

    // sky + water
    w.sky.uniforms.uDay.value = d;
    w.sky.uniforms.uCloud.value = c;
    w.sky.uniforms.uStorm.value = this.storm || 0;
    for (const m of waterMaterials) { m.uniforms.uDay.value = d; m.uniforms.uCloud.value = c; }

    // key light: moon at night, sun by day (dimmer through cloud)
    const key = w.range.moon;
    const TD = THEME_DAY[w.theme];
    key.color.copy(lerpC(NIGHT.key, TD ? TD.key : DAY.key, d));
    // the course has no range floodlights over the fairways: a brighter moon there
    const nightBoost = w.sceneMode === 'course' ? 1.9 : 1;
    key.intensity = THREE.MathUtils.lerp(NIGHT.keyIntensity * nightBoost * (1 - c * 0.6), DAY.keyIntensity * this.sunAmt * (TD?.keyMul ?? 1), d);
    const shadowSize = d > 0.5 ? 85 : 30;
    const cam = key.shadow.camera;
    if (cam.right !== shadowSize) {
      Object.assign(cam, { left: -shadowSize, right: shadowSize, top: shadowSize, bottom: -shadowSize });
      cam.updateProjectionMatrix();
      // the bias follows the texel size: with the wide daytime box a fixed 2 cm
      // let the ground shadow itself, a dark square round the player
      const texel = (2 * shadowSize) / (key.shadow.mapSize.x || 1024);
      key.shadow.normalBias = Math.max(0.02, texel * 1.4);
      key.shadow.bias = -0.0004 - texel * 0.002;
    }
    const hemi = w.range.hemi;
    hemi.color.copy(lerpC(NIGHT.hemiSky, DAY.hemiSky, d));
    hemi.groundColor.copy(lerpC(NIGHT.hemiGround, TD ? TD.hemiGround : DAY.hemiGround, d));
    hemi.intensity = THREE.MathUtils.lerp(NIGHT.hemi * nightBoost, DAY.hemi * (1 + c * 0.35), d);

    // image-based light: the sky's colour in every material's reflections
    const scn = w.scene;
    if (this.hdri) {
      // photographed skies: overcast takes over as the cloud thickens
      scn.environment = d > 0.5 ? (this.storm > 0.5 ? this.hdri.storm : c > 0.6 ? this.hdri.overcast : this.hdri.day) : this.hdri.night;
      scn.environmentIntensity = d > 0.5
        ? THREE.MathUtils.lerp(0.16, 0.34, (d - 0.5) * 2) * (c > 0.6 ? 1.1 : 1 - c * 0.25) * (this.envScale ?? 1)
        : THREE.MathUtils.lerp(0.025, 0.08, d * 2) * (w.sceneMode === 'course' ? 1.5 : 1) * (this.envScale ?? 1);
    } else if (this.envDay) {
      scn.environment = d > 0.5 ? this.envDay : this.envNight;
      scn.environmentIntensity = d > 0.5 ? THREE.MathUtils.lerp(0.25, 0.55, (d - 0.5) * 2) * (1 - c * 0.3) : THREE.MathUtils.lerp(0.12, 0.25, d * 2);
    }

    // fog + post
    const fog = w.scene.fog;
    if (fog) {
      const dayFog = this._tmpC2.copy(TD ? TD.fog : DAY.fog).lerp(OVERCAST_FOG, c);
      fog.color.copy(NIGHT.fog).lerp(dayFog, d);
      fog.density = THREE.MathUtils.lerp(NIGHT.fogDensity * (1 + c * 0.4), DAY.fogDensity * (1 + c * 1.2), d) * (w.fogScale ?? 1);
    }
    const r = w.r;
    r.renderer.toneMappingExposure = THREE.MathUtils.lerp(NIGHT.exposure, DAY.exposure, d) * (r.toneGain ?? 1);
    r.bloom.strength = THREE.MathUtils.lerp(NIGHT.bloom, DAY.bloom, d);
    r.bloom.threshold = THREE.MathUtils.lerp(NIGHT.bloomThreshold, DAY.bloomThreshold, d);
    if (r.grade) r.grade.uniforms.uNight.value = 1 - d;

    // the set pieces
    w.skyline.setDay(d);
    w.range.setDay(d);
    w.tracer.setDay(d);
    w.ball?.setDay?.(d);
    w.ambient?.setDay?.(d);
    w.course?.setDay?.(d);
    w.rain?.set(this.weather.rain || 0);
    const windAmt = Math.min(1, this.weather.windMph / 18);
    w.range.setWind(windAmt, this.windFromDeg);
    w.course?.setWind?.(windAmt, this.windFromDeg);
  }
}
