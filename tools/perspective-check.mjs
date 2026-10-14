// Perspective check: what the ball, cup, flagstick and their screen-space
// aids look like from the game's cameras at every distance, against the
// true angular size. `node tools/perspective-check.mjs [screenHeightPx=1080]`
//
// Real objects are drawn at true size (ball 42.67 mm, cup 108 mm, flagstick
// 2.4 m above the green), so their projection is exact by construction; the
// check is on the aids that are sized in screen space (the ball's night halo
// floor, the pin beacon) and on whether the true-size objects stay visible.
import * as THREE from '../vendor/three/three.module.js';
import { BALL, CUP, YD } from '../js/core/physics.js';

const H = Number(process.argv[2]) || 1080;
const W = Math.round((H * 16) / 9);
const CAMS = [
  // name, fov°, camera height above ball (m), back from ball (m)
  ['Address', 44, 1.75, 4.2],
  ['Landing cam', 34, 1.6, 0],
  ['Cup cam (end)', 27, 0.36, 0],
];
const FLAG = 2.4;
const DIST_YD = [1, 3, 10, 30, 60, 100, 150, 200, 250, 300];

/** Projected height in px of a vertical segment [y0, y1] at ground distance d from the camera. */
function projected(cam, d, y0, y1) {
  const a = new THREE.Vector3(0, y0, -d).project(cam);
  const b = new THREE.Vector3(0, y1, -d).project(cam);
  return Math.abs(b.y - a.y) * (H / 2);
}
/** Pixels per radian at the centre of the view (where the eye judges size). */
const pxPerRad = (fov) => H / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));

let bad = 0;
for (const [name, fov, up] of CAMS) {
  const cam = new THREE.PerspectiveCamera(fov, W / H, 0.05, 90000);
  cam.position.set(0, up, 0);
  cam.lookAt(0, up, -100);
  cam.updateMatrixWorld();
  console.log(`\n${name}: ${fov}° vertical FOV, ${W}×${H}`);
  console.log('distance   ball px (true)  halo px  cup px  flag px  beacon px  note');
  const view = 2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  for (const yd of DIST_YD) {
    const d = yd * YD;
    const ball = projected(cam, d, 0, BALL.radius * 2);
    // the same ball seen dead centre: angular size × pixels per radian
    const trueBall = 2 * Math.atan(BALL.radius / Math.hypot(d, up)) * pxPerRad(fov);
    // ball.js: halo is 30 cm of light in world terms with a floor of 0.0042 of the view
    const halo = Math.max(0.0042, 0.3 / Math.max(1e-3, Math.hypot(d, up) * view)) * H;
    const cup = projected(cam, d, 0, CUP.radius * 2) * (up / Math.hypot(d, up)); // seen foreshortened
    const flag = projected(cam, d, 0, FLAG);
    // courseWorld: the pin beacon is a 0.9 m glow in world terms (floor 0.0056 of the view)
    const beacon = d > 40 ? Math.max(0.0056, 0.9 / (Math.hypot(d, up) * view)) * H : 0;
    const notes = [];
    // a screen-space aid larger than the thing it marks overstates nearness
    if (beacon > flag * 1.05) { notes.push('beacon larger than the flagstick'); bad++; }
    if (d > 20 && Math.abs(ball - trueBall) / trueBall > 0.05) { notes.push('ball off its true angular size'); bad++; }
    if (halo > 0.3 / (Math.hypot(d, up) * view) * H + 0.5) notes.push('halo at its floor (reads closer than true)');
    if (flag < 2) notes.push('flagstick under 2 px: beacon carries the pin');
    console.log(`${String(yd).padStart(4)} yd   ${ball.toFixed(2).padStart(6)} (${trueBall.toFixed(2)})  ${halo.toFixed(1).padStart(7)}  ${cup.toFixed(2).padStart(6)}  ${flag.toFixed(1).padStart(7)}  ${beacon.toFixed(1).padStart(9)}  ${notes.join('; ')}`);
  }
}
console.log(bad ? `\n${bad} problems` : '\ntrue-size objects and screen aids stay in proportion at every distance');
process.exitCode = bad ? 1 : 0;
