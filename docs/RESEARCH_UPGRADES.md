# Fairway: what would lift it next

October 2026. Four questions: how to animate the people and animals, whether
real building models are worth it, which game modes would be an upgrade, and
how to make the interface feel modern and premium rather than generic. Each
section ends with what to do.

## 1. People and animals that actually move

The rule from the brief: moving figures are only worth it if limbs move with
them. Sliding or floating statues are worse than standing ones.

**How it is done in three.js at crowd scale**
- *Vertex animation textures (VAT).* Bake every frame of a clip (walk, idle,
  sit, clap) into a texture; the vertex shader reads the frame. One
  InstancedMesh per character, any number of instances, each at its own
  phase. Proven for low-poly figures up to about 2,000 vertices
  ([three.js forum](https://discourse.threejs.org/t/playback-the-animation-of-many-low-poly-models-as-they-are-moved-around/42205)).
- *Bone matrices in a texture* (GPU Gems 3 skinned instancing): more flexible
  (blend clips), more shader work
  ([GPU Gems 3](https://developer.nvidia.com/gpugems/GPUGems3/gpugems3_ch02.html)).
- *A library:* InstancedMesh2 adds skinning with frustum culling, LOD and
  "animate only what's visible, slower when far"; its demo runs about 3,000
  animated instances
  ([three.js forum](https://discourse.threejs.org/t/animated-instanced-skinned-meshes-gltf/41958?page=2)).

**Where the figures and clips come from**
- CC0 animated humans (Quaternius): idle, walk, run, sit, among others. They
  are free for any use and can ship as GLB
  ([OpenGameArt](https://opengameart.org/content/animated-human-low-poly)).
- Mixamo clips can be used in a game, but the raw files may not be
  redistributed. A web game's GLBs are downloadable, so keep Mixamo out
  ([Adobe FAQ](https://community.adobe.com/questions-696/mixamo-faq-licensing-royalties-ownership-eula-and-tos-589400)).
- Our scanned people (Renderpeople and deep3dstudio) have no rigs. Rigging them in
  Blender (Rigify or MPFB2) and retargeting CC0 clips onto them keeps today's
  realism.
- Animals: the bison, ox and zoo models are static. Several of the Sketchfab
  sources have rigged and animated versions; a walk and a graze clip each
  covers most uses.

**Plan**
1. In Blender: rig two or three of the scanned people (MPFB2/Rigify), retarget
   CC0 clips (idle, walk, sit, clap, golf swing), and bake each clip to a VAT.
2. A `crowdAnimated()` beside today's `crowdAt()`: the same spots, plus a clip
   and a phase. Walkers follow paths (park paths and quays are already
   mapped) at the clip's own stride speed, so feet don't slide.
3. Sitting: benches, the Seine's quay walls and the venue sofas get seated
   figures, and lawns get picnic blankets with seated groups.
4. Budget: animate within about 120 m of the camera at full rate and at half
   rate beyond that; past 300 m use the static figures.

## 2. Real building models

I searched Sketchfab for Paris and New York buildings.
- The best Haussmann block is an untextured white model of about 290k faces.
  A Rue Bonaparte scan is a single facade.
- There are no usable New York apartment towers.
- None of them beat the photographed-stone facades now on every OSM building,
  across whole cities.

The step up from here is photorealistic 3D city tiles (Google's). That needs
your own API key, and the terms require attribution and limit use.

**Recommendation:** keep the procedural cities. Model a handful of hero
buildings that are in view from the tees, using Blender from photographs:
the Dakota and the San Remo for Central Park, and a Champ de Mars block for
Paris.

## 3. Game modes and features worth adding

What exists today: free range, closest to the pin, long drive, stroke play
on 16 courses, multiplayer, and party mode.

What the leading products offer
([Trackman venue games](https://nscsports.org/four-must-play-games-on-the-trackman/),
[Topgolf Swing Suite games](https://fourseasons.com/houston/services-and-amenities/topgolf-swing-suites),
[GSPro modes](https://golfstead.com/best-golf-simulator-software)):

| Idea | Why | Effort |
|---|---|---|
| **Target points** on the new range (Topgolf-style: ring scores, closer and farther targets worth more, 20 balls) | The range now has the rings; it's the social mode everyone knows | Small |
| **Capture the flag**: three rounds of three shots at six greens; closest wins the flag | Trackman's most-played venue game; great for groups | Small |
| **Nine-shot challenge**: draw, fade and straight, each high, mid and low, judged on the R10's launch data | Uses the R10's numbers as gameplay, which no arcade sim does | Medium |
| **Skins, match play, scramble and best ball** in multiplayer | Standard formats players expect (GSPro has them all) | Medium |
| **Daily challenge** with a shared leaderboard (one hole, one shot, everyone gets the same wind) | A reason to come back every day | Medium (needs a small backend) |
| **Ghost rival**: replay your best round or a friend's as a tracer alongside yours | Competitive without both being online | Medium |
| **Shot gapping and dispersion** in practice: a carry map per club built from your R10 shots | What players buy launch monitors for | Medium |
| **Around the world** chipping and putting | The short game is the weakest part of every sim; this makes it a game | Small |
| **Highlight reel**: the round's best shots replayed with cinematic cameras at the end | Shareable, and it shows off the courses | Medium |

## 4. Interface design: modern and clean, not generic

### What the sources say
From Design Taste ([repo](https://github.com/madebymustafa/design-taste)),
whose rules are the most concrete of the four:
- **One accent with a job.** Use 60% neutrals, 30% structure and 10% accent.
  An accent seen everywhere stops pointing at anything. Status colours
  (success, danger) are for status only.
- **Listed as the marks of generic, AI-made UI:**
  - frosted glass on everything;
  - the same big radius on everything;
  - shadows as the only depth;
  - emoji as icons;
  - one neutral sans for all text.
- **Depth from structure:** hairlines, tonal panels, and solid fills over
  gradients.
- **Motion:**
  - fixed duration tokens (150, 250, 500 and 800 ms);
  - an emphasised ease of `cubic-bezier(.22,1,.36,1)` for entrances;
  - faster exits;
  - transform and opacity only;
  - reduced-motion support;
  - and nothing that loops except status indicators.
- **Quiet luxury** (the closest genre to a premium golf product):
  - near-black ink and an off-white, never pure white;
  - **one** accent: antique brass, oxblood or deep forest, never more;
  - thin rules rather than boxes;
  - small-caps labels with wide letterspacing.

Better Design ([repo](https://github.com/marvkr/better-design)) adds:
- one icon family, never mixed;
- colours from semantic tokens, never raw hex.

Canvas UI ([repo](https://github.com/DavidHDev/canvas-ui)) is WebGL effects
over live HTML (liquid, glass, particles). It's useful for a single signature
moment, such as the hole-out burst, not for everyday chrome.

### What Fairway does today
- **Three golds** (`--amber`, `--amber-hi`, `--gold`) cover about 40 accent
  uses: buttons, focus rings, the active club, code, the tee dot, and the
  glow on "Hold to swing". Green, red and blue are also in play. Because gold
  appears everywhere, it means nothing, and warm gold on dark glass reads as
  "casino". You're right that it looks cheap; the hue isn't the problem, its
  overuse is.
- **Frosted glass** on almost every panel, and fully round pills for most
  buttons.
- **Hard-coded colours** in many components, outside the tokens. Swapping
  tokens only half-changes the UI (the mockups below show this), so a palette
  decision first needs a token refactor.
- **What works,** and you said so: the minimap and the wind dial. They use
  colour as data: water blue, green, the white yardages, an orange tee and
  ball.

### Recommendation
- **Neutral:** graphite panels, solid at 85–92% rather than frosted glass,
  with 1 px hairlines, an 8–10 px radius on panels, and pills only for chips.
- **One accent:** a signal orange (about `#FF6A3D`), the colour already on the
  minimap's tee and ball.
  - Use it for the primary action, the active selection and the player's own
    ball and tracer, and nothing else.
  - Orange is the strongest colour-blind-safe accent on dark neutrals and
    against grass and sky.
- **Gold kept with a meaning:** achievement only (birdie, eagle, ace,
  personal best), so gold equals a moment.
- **Data colours:** water blue, turf green, wind, white yardages, red only for
  penalty. These are already good.
- **Type:**
  - Jost for display, set large with tight leading;
  - a system sans for body;
  - tabular numerals for every number (yardages, scores, speeds);
  - uppercase, letterspaced small labels.
- **Icons:** one stroke family (Lucide-style 1.5 px line icons) throughout;
  no emoji.
- **Motion tokens** as above, applied to the new animations (section 5).

Mockups (tokens swapped on a live hole; only partial, for the reason above):
[A current](research/cp-A.jpg) · [B](research/cp-B.jpg) · [C](research/cp-C.jpg) · [D](research/cp-D.jpg)
`B` signal orange, `C` fairway green, `D` light ivory panels.

## 5. Animations (from your brief)

Built on GSAP and the camera rig, documented in `js/ui/moments.js`, each with
its own on/off switch in Settings → Effects.
- **Round end and winner:**
  - the camera eases up from the last green to a wide shot of the course;
  - the winner's name and score rise in large type with a thin gold rule;
  - the leaderboard rows stagger in.
  - It is restrained: no confetti, and the gold rule is the payoff.
- **Hole-out, scaled by result:**
  - *Birdie:* a gold ring on the cup, the score chip ticks over, a soft crowd
    sound.
  - *Eagle:* the camera holds on the cup and pushes in slowly, with a second
    ring and a bigger sound.
  - *Ace:* slow motion as the ball drops, the flag stirs, a light bloom
    lifts, the course name in display type, and the crowd.
- **Notable shots:**
  - *Long drive* (over 300 yd, or a personal best): a brief side camera on
    the landing and a distance count-up.
  - *Approach* within 6 ft: a pin-cam cut.
  - *Lip-out:* a slow-motion replay of the last half-second at the cup.
- **Transitions:**
  - a course intro card over the flyover;
  - turn changes slide the player's colour bar;
  - the radio uses a 150 ms cross-fade with a thin progress line.
- **Driving range:**
  - the ball drops from the dispenser and rolls to the mat while the camera
    turns from the bay's interior to the player's view;
  - venue cutaways between shots (a crane up the tiers, a pass along the
    bays);
  - other golfers' balls drawn with short tracers, so they read from the mat.
