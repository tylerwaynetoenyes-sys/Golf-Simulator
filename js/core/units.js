import { MPH, YD } from './physics.js';

export const units = {
  system: 'imperial', // 'imperial' | 'metric'
};

export const isMetric = () => units.system === 'metric';

export function dist(m, digits = 0) {
  return isMetric() ? (m).toFixed(digits) : (m / YD).toFixed(digits);
}
export const distUnit = () => (isMetric() ? 'm' : 'yd');

export function speed(mps, digits = 1) {
  return isMetric() ? (mps * 3.6).toFixed(digits) : (mps / MPH).toFixed(digits);
}
export const speedUnit = () => (isMetric() ? 'km/h' : 'mph');

export function height(m, digits = 0) {
  return isMetric() ? m.toFixed(digits) : (m / YD).toFixed(digits);
}

/** Short proximity string: 4' 7" / 12 ft / 1.4 m */
export function proximity(m) {
  if (isMetric()) return m < 10 ? `${m.toFixed(1)} m` : `${m.toFixed(0)} m`;
  const feet = m / 0.3048;
  if (feet < 10) {
    const ft = Math.floor(feet);
    const inch = Math.round((feet - ft) * 12);
    return inch === 12 ? `${ft + 1}' 0"` : `${ft}' ${inch}"`;
  }
  if (feet < 90) return `${Math.round(feet)} ft`;
  return `${(m / YD).toFixed(0)} yd`;
}

export function signedDir(m, digits = 0) {
  const v = Math.abs(isMetric() ? m : m / YD);
  if (v < 0.5) return 'Center';
  return `${v.toFixed(digits)} ${m > 0 ? 'R' : 'L'}`;
}

export function deg(v, digits = 1) { return `${v.toFixed(digits)}°`; }

export function signedDeg(v, digits = 1) {
  if (Math.abs(v) < 0.05) return '0.0°';
  return `${Math.abs(v).toFixed(digits)}° ${v > 0 ? 'R' : 'L'}`;
}
