// Time of day + weather. Everything that changes between the night range and
// a bright afternoon (sky, sun/moon, floodlights, fog, river, skyline, bloom,
// exposure) is driven from one blend value so switching is a smooth 2.5 s
// cross-fade rather than a scene swap. Weather sets cloud cover, light levels
// and the wind that the ball flight actually uses.
import * as THREE from 'three';
import { MOON_DIR, SUN_DIR } from './sky.js';
import { waterMaterials } from './river.js';

const MPH = 0.44704;

export const WEATHER = {
  clear: { label: 'Clear', cloud: 0.12, windMph: 1.5, gust: 0.15, sun: 1, icon: 'sun' },
  cloudy: { label: 'Cloudy', cloud: 0.82, windMph: 4, gust: 0.2, sun: 0.42, icon: 'cloud' },
  breezy: { label: 'Light wind', cloud: 0.35, windMph: 8, gust: 0.25, sun: 0.92, icon: 'breeze' },
  windy: { label: 'Strong wind', cloud: 0.55, windMph: 17, gust: 0.3, sun: 0.75, icon: 'wind' },
};

const NIGHT = {
  fog: new THREE.Color(0x0a111d), fogDensity: 0.00032, exposure: 1.05, bloom: 0.85, bloomThreshold: 0.82,
  hemiSky: new THREE.Color(0x22324f), hemiGround: new THREE.Color(0x0d0b08), hemi: 0.4,
  key: new THREE.Color(0x9fb4e6), keyIntensity: 0.42,
};
const DAY = {
  fog: new THREE.Color(0xb7cce0), fogDensity: 0.00017, exposure: 0.92, bloom: 0.32, bloomThreshold: 0.93,
  hemiSky: new THREE.Color(0xbcd6f0), hemiGround: new THREE.Color(0x4a5a34), hemi: 1.05,
  key: new THREE.Color(0xfff0d8), keyIntensity: 2.7,
};
const OVERCAST_FOG = new THREE.Color(0xa7b0ba);

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
    this.apply();
  }

  get isDay() { return this.targetDay > 0.5; }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const f of this.listeners) f(this); }

  setTime(which, immediate = false) {
    this.targetDay = which === 'day' ? 1 : 0;
    if (immediate) { this.day = this.targetDay; this.apply(); }
    this._emit();
  }

  setWeather(id, { immediate = false, windFromDeg = null } = {}) {
    if (!WEATHER[id]) id = 'clear';
    this.weatherId = id;
    if (windFromDeg != null) this.windFromDeg = windFromDeg;
    if (immediate) { this.cloud = WEATHER[id].cloud; this.sunAmt = WEATHER[id].sun; }
    this.apply();
    this._emit();
  }

  setWindDirection(fromDeg) { this.windFromDeg = ((fromDeg % 360) + 360) % 360; this.apply(); this._emit(); }

  get weather() { return WEATHER[this.weatherId]; }

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
    const k = 1 - Math.exp(-dt * 1.6);
    const prev = this.day + this.cloud + this.sunAmt;
    this.day += (this.targetDay - this.day) * k;
    if (Math.abs(this.targetDay - this.day) < 0.002) this.day = this.targetDay;
    const w = this.weather;
    this.cloud += (w.cloud - this.cloud) * k;
    this.sunAmt += (w.sun - this.sunAmt) * k;
    if (Math.abs(prev - (this.day + this.cloud + this.sunAmt)) > 1e-5) this.apply();

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
    key.target.position.copy(this._focus);
    key.position.copy(this._focus).addScaledVector(dir, 150);
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
    for (const m of waterMaterials) { m.uniforms.uDay.value = d; m.uniforms.uCloud.value = c; }

    // key light: moon at night, sun by day (dimmer through cloud)
    const key = w.range.moon;
    key.color.copy(lerpC(NIGHT.key, DAY.key, d));
    key.intensity = THREE.MathUtils.lerp(NIGHT.keyIntensity * (1 - c * 0.6), DAY.keyIntensity * this.sunAmt, d);
    const shadowSize = d > 0.5 ? 60 : 30;
    const cam = key.shadow.camera;
    if (cam.right !== shadowSize) {
      Object.assign(cam, { left: -shadowSize, right: shadowSize, top: shadowSize, bottom: -shadowSize });
      cam.updateProjectionMatrix();
    }
    const hemi = w.range.hemi;
    hemi.color.copy(lerpC(NIGHT.hemiSky, DAY.hemiSky, d));
    hemi.groundColor.copy(lerpC(NIGHT.hemiGround, DAY.hemiGround, d));
    hemi.intensity = THREE.MathUtils.lerp(NIGHT.hemi, DAY.hemi * (1 + c * 0.35), d);

    // fog + post
    const fog = w.scene.fog;
    if (fog) {
      const dayFog = this._tmpC2.copy(DAY.fog).lerp(OVERCAST_FOG, c);
      fog.color.copy(NIGHT.fog).lerp(dayFog, d);
      fog.density = THREE.MathUtils.lerp(NIGHT.fogDensity * (1 + c * 0.4), DAY.fogDensity * (1 + c * 1.2), d);
    }
    const r = w.r;
    r.renderer.toneMappingExposure = THREE.MathUtils.lerp(NIGHT.exposure, DAY.exposure, d);
    r.bloom.strength = THREE.MathUtils.lerp(NIGHT.bloom, DAY.bloom, d);
    r.bloom.threshold = THREE.MathUtils.lerp(NIGHT.bloomThreshold, DAY.bloomThreshold, d);

    // the set pieces
    w.skyline.setDay(d);
    w.range.setDay(d);
    w.tracer.setDay(d);
    w.course?.setDay?.(d);
    const windAmt = Math.min(1, this.weather.windMph / 18);
    w.range.setWind(windAmt, this.windFromDeg);
    w.course?.setWind?.(windAmt, this.windFromDeg);
  }
}
