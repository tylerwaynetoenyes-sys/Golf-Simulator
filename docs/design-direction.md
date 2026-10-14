# Fairway design direction

**The clubhouse after dark.** Restrained, warm and exact: a graphite room,
brass fittings, good paper. The 3D course is the hero; the interface frames
it and gets out of the way.

Drawn from the reviewed sources (scrolltide.co's component and shader
library: glass, grain, bento metrics, morphing pills, staged type reveals;
recent.design's curation: dark glass app UI, confident typographic posters,
tactile paper textures) and from the logo.

## Colour

| Token | Value | Use |
|---|---|---|
| graphite | `#0b0d0f` → `#15181b` | panels, glass base |
| ink | `#f2efe8` | primary text, the wordmark |
| brass | `#e6c983` → `#b88d45` | the brand: primary actions, active states, the flag, key numbers |
| signal green | `#5fe39a` | live only: the R10 link, "in the hole" |
| signal red | `#ff6f61` | penalties and errors only |

One accent. Gold is earned: the primary action on a screen, the selected
item, the number that matters. Everything else is ink at three opacities.

## Type

- **Display and labels: Jost** (Futura's geometry, OFL, bundled). Labels in
  caps, tracked wide (0.16–0.22em), like the tagline. Hole numbers and
  scores large and light.
- **Numbers:** Jost with tabular figures.
- **Commentary:** the warm serif italic stays, for the human voice only.
- Body text in the system UI face.

## Surfaces

- Glass over the scene: graphite at 70–86%, 1px ink hairline at 8%, a fine
  **film grain** over every panel so glass reads as material, not plastic.
- **Bento** tiles for stats (scorecards, summaries): one hero number per tile.
- Corners 18–28px, generous padding, a gold rule (1px) to mark the title.

## Motion

GSAP (vendored). Fast in, soft out: `expo.out` / `power3.out`, 0.35–0.7 s.

- **Panels:** rise 12px and fade, contents stagger 30 ms per row.
- **Numbers count** to their value (carry, scores, totals).
- **Hole transition:** curtain closes, the hole number reveals behind a
  mask, the name follows letter by letter, a gold rule draws under it, then
  the curtain lifts on the flyover.
- **Toasts** slide and morph like a pill; nothing bounces.
- `prefers-reduced-motion`: every animation collapses to a fade.

## Sound

UI ticks stay quiet and dry; the radio ducks under big moments.
