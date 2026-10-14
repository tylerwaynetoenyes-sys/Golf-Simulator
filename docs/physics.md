# Ball physics: model, calibration and checks

Everything here is reproducible with three Node scripts:

```
node tools/calibrate.mjs          # flight vs Trackman PGA Tour averages
node tools/bounce-audit.mjs       # landing, bounce and roll on every surface
node tools/perspective-check.mjs  # on-screen size of ball, cup and flag at every distance
```

## Flight

`js/core/physics.js` integrates the ball with RK4 at 240 Hz: gravity, drag
and Magnus lift with coefficients driven by the spin factor S = rω/|v|, a
drag rise at low Reynolds number, and spin decay in flight. The coefficients
are fitted jointly to Trackman PGA Tour averages for carry, apex height and
landing angle (driver through pitching wedge):

| Club | Carry (Tour) | Apex yd (Tour) | Landing ° (Tour) |
|---|---|---|---|
| Driver | 271 (282) | 36 (35) | 41 (38) |
| 3-wood | 257 (249) | 35 (32) | 42 (43) |
| 5-iron | 205 (199) | 31 (33) | 43 (47) |
| 7-iron | 177 (176) | 34 (32) | 48 (50) |
| 9-iron | 148 (152) | 30 (30) | 49 (51) |
| PW | 134 (136) | 30 (29) | 51 (52) |

Worst carry error 3.7%. The long and middle irons still land 2–4° flatter
than Trackman's figures; closing that gap needs a different drag-curve form
(Reynolds-dependent drag crisis), not more tuning of the present one.

## Landing, bounce and roll

Each impact is resolved against the real surface normal (a ball landing on
a slope kicks down it). Restitution falls with impact speed, the turf takes
tangential speed in proportion to how steeply the ball lands and how much
backspin it carries, and what is left rolls with slope (5/7·g·sinθ for a
rolling sphere) and per-surface rolling resistance. This follows the
structure of A. R. Penner, "The run of a golf ball", *Canadian Journal of
Physics* 80(8):931–940 (2002): a compliant turf impact treated as a rigid
bounce with speed-dependent restitution and friction that grows with the
landing angle.

Per-surface parameters (`GROUND` in physics.js):

| Surface | Character |
|---|---|
| Fairway | firm: the reference for Tour rollout; a little check with wedges |
| Green | softer at impact than the fairway (greens hold), putting pace once rolling (~10.5 Stimp); wedges can check back up to ~1 yd |
| Rough | the grass takes the spin (no zip back) and about half the run |
| Fringe / tee | between fairway and green |
| Sand | plugs or dies in the bunker |
| Water / out of bounds | the ball is gone (penalty handled by the rules) |

Audit results, flat ground, Trackman Tour launches (rollout after carry, yd):

| Club | Fairway | Green | Rough | Sand |
|---|---|---|---|---|
| Driver | 17.5 | 24.2 | 8.2 | 0 |
| 3-wood | 14.5 | 17.8 | 6.7 | 0 |
| 5-iron | 10.0 | 9.2 | 4.5 | 0 |
| 7-iron | 4.9 | 1.3 | 2.1 | 0 |
| 9-iron | 3.0 | 0.2 | 1.0 | 0 |
| PW | 1.8 | −0.9 | 0.4 | 0 |
| SW (80 yd) | 2.0 | −0.5 | 0.5 | 0 |

Every value sits inside the target band in `tools/bounce-audit.mjs`. The
bands are working targets, not published constants: Tour rollout depends
heavily on turf firmness, so they are deliberately ranges.

Two fixes came out of the audit:

- A bounce could add speed. A wedge that checked back on its first bounce
  still carried most of its backspin, which acted as topspin on the second
  bounce and sent the ball 8 yd back down the green. The turf now never adds
  ground speed, and the spin that survives an impact is limited to what a
  ball rolling at the new speed would have.
- Rough no longer stops a ball dead or backs it up. Greens are softer at
  impact so long clubs no longer run 38 yd across them.

## The strike

The club (`js/scene/club.js`) is built to typical modern specs (length, lie
and loft per club) and swings on a single inclined plane through the ball.
The downswing takes 0.26 s, close to the ~0.25 s of a Tour 3:1 tempo. The
launch, the strike sound, the ball's compression (about 20% at Tour speed,
for a frame or two) and the turf or sand spray all fire on the contact
frame. With a launch monitor the shot has already happened when the data
arrives, so the club plays the downswing from the top first.

## Perspective

The ball (42.67 mm), cup (108 mm) and flagstick (2.4 m above the green) are
drawn at true size, so their projection is exact at every distance. The only
screen-space aids are the ball's night halo and the pin beacon:

- The pin beacon used to be a fixed 17 px dot, as large as the whole
  flagstick at 200+ yd, which made the pin read closer than it was. It is now
  a 0.9 m glow in world terms that shrinks with distance like the flag, with a
  6 px floor.
- The ball's halo is 30 cm of light in world terms with a 4.5 px floor. Past
  ~150 yd at night it sits at that floor so the ball never disappears; by day
  there is no halo.

The renderer uses a reversed-Z depth buffer where the GPU supports it, so the
ball at your feet and real terrain 7 km away both keep precise depth.

## Why not a physics engine (Cannon.js, Rapier)

Both were evaluated for ball flight and ground contact and judged a poor fit:

- **No aerodynamics.** Neither has drag or Magnus lift. Ball flight is
  almost entirely aerodynamic (a driver carries about twice as far as it
  would in a vacuum at the same launch), so the flight model would still
  have to be written by hand and applied as external forces each step.
- **Turf is not a rigid body.** Golf turf is a compliant, frictional surface
  whose response depends on landing angle, speed and spin (Penner's model
  above). Rigid-body contact with one restitution and friction coefficient
  can't reproduce checking wedges and running drivers at the same time.
- **Determinism and look-ahead.** The game simulates the whole shot the
  moment a launch arrives (a few milliseconds), so the camera, commentary
  and rules know the outcome before the ball lands. A dedicated closed-form
  integrator does this exactly and reproducibly; stepping a general engine
  ahead and rolling it back adds cost and complexity for no gain.
- **Size.** Rapier's WASM build is roughly 1.5 MB, a lot to ship for one
  sphere and a heightfield.

A physics engine would earn its place for props the ball can hit (flagstick
contact, tree trunks, buildings). The current model handles canopies and the
flagstick analytically.
