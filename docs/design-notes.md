# Design notes

What the game's interface borrows, and from where. Most of the reference
sites on the list (Godly, Minimal Gallery, Refero, Mobbin, Land-book, shadcn/ui,
Aceternity, Magic UI, anime.js, Glass UI and others) could not be fetched from
the build environment (DNS or proxy blocked), so the patterns below come from
what is publicly documented about them and Apple's Human Interface Guidelines,
then checked against the game on a TV, a laptop and an iPad.

## Principles

1. **Content first.** The 3-D course is the content; UI floats above it on
   glass and gets out of the way during the shot (Apple HIG: Liquid Glass is for
   the functional layer above content, used sparingly).
2. **One accent.** Tee-light amber is the only brand colour. Semantic colours
   appear only where they carry meaning: fairway green, rough amber, sand,
   water blue, birdie gold.
3. **Numbers are the hero.** Large tabular figures, tight tracking, small
   caps labels (the pattern every premium sports-data UI uses: Trackman,
   Garmin Golf, Apple Fitness rings).
4. **Motion explains.** Things enter from where they relate (the shot card
   slides in from the right edge it lives on; the decision sheet scales up
   from centre); nothing moves for decoration.
5. **Plain language.** Professional golf terms only: "Rough · about 15% less
   distance", "Water hazard · one-stroke penalty".

## Tokens (css/app.css, "Design system v2")

| Token | Value | Use |
| --- | --- | --- |
| Spacing | 4 · 8 · 12 · 16 · 24 · 32 · 48 px | all padding and gaps |
| Type | 12 / 14 / 16 / 20 / 26 / 34 px | caption · body · callout · title 3–1 |
| Durations | 140 · 260 · 480 ms | press · state change · panel |
| Curves | `cubic-bezier(.16,1,.3,1)` out, `cubic-bezier(.34,1.56,.64,1)` spring | entrances · presses |
| Glass | blur 24–32 px, saturate 170–180%, 1 px top highlight, two-layer shadow | every panel |
| Accent | `#ffb46b` amber, `#ffd29a` amber-hi | selection, primary action |
| Semantic | fairway `#7fd18a`, rough `#ffd58e`, sand `#f2deb0`, water `#6fb7ff` | lie chip, hazards |

## Patterns used

- **Status chip** (lie badge in the turn banner): tinted fill + 1 px border
  only when the lie costs something, uppercase label + plain note.
- **Decision sheet** (water): one primary option pre-focused, keyboard letters
  shown as keycaps (D / B / U), spring-in at 0.45 s.
- **Ghost buttons with state** (Mulligan): appear only when usable, show the
  count left, never disabled-but-visible.
- **Reduced motion**: every animation collapses to 1 ms under
  `prefers-reduced-motion`.

## Working rules (from multica-ai/andrej-karpathy-skills)

Clarify before building, keep code short, touch only what the task needs,
match existing conventions, turn tasks into verifiable checks (the
`tools/holes-check.mjs`, landmark audit and Playwright runs) and loop until
each passes.
