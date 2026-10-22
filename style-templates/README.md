# Scene templates

- `dark-graph-paper-template/`: animated background; no footage required. Copy
  the HTML and config into a new video project, then add your story content.
- `left-glass-popout/`: a camera reframe with an animated glass panel. Supply
  your own `assets/source.mp4` with video and audio, and adjust source duration,
  crop, card copy, and timings before rendering.
- `overlays-v5/`: **the default starting point for new overlays-project-style
  tutorial videos.** Everything in `overlays-v4-project/` (see below) plus
  build-safety rules adapted from the `motion-showreel` skill: a stagger
  completion check against each card's dissolve, seek safety for properties
  animated from several places, measuring layout once, and 10-frame
  transition strips from a draft render as a required verification step.
  The one visual addition is `chipScramble()`, which decodes a badge's section
  chip into its new label when the section changes. See its DESIGN.md.
  `overlays-v5/fx/` (2026-10-21) is the effects kit the `/video-*` skills copy
  into every project: command chips, callouts, on-screen statements, checklist
  panels, section cards with a screenshot and a light-beam wipe, card backdrop
  images, count-ups, marker sweeps and a zoom focus vignette. See `fx/README.md`.
- `overlays-v4-project/`: the previous default, kept unchanged for existing v4
  builds. Everything in `overlays-v3-project/` (see below) plus
  the `badgeDetails()` helper: a long-holding tier-2 badge can grow a short
  detail line per specific the narration names, each on its own transcript
  anchor, so a badge that would otherwise sit motionless for 40s+ keeps
  tracking what is actually being said. Lines accumulate and dim rather than
  replacing each other, and the badge grows upward from its pinned bottom edge.
  Use it only on badges holding roughly 25s or longer — see its DESIGN.md for
  the full rule.
- `overlays-v3-project/`: the previous default, kept for reference and for
  existing v3 builds. The graphics-only overlays-project base (4K,
  transparent/alpha, tier-1/tier-2 system) with the confirmed "What We'll
  Cover" agenda box-grid built in, including the `agendaBox()` JS helper so
  adding a topic box is one function call instead of hand-writing its
  animation, plus an optional ~20s hook-intro cold open that overlays (not
  prepends) the first 20s of real narration audio. Copy the whole file into
  a new video project, replace the demo copy, and retime every beat against
  that project's own transcript. See its DESIGN.md for the full spec and
  `CLAUDE.md`/`AGENTS.md` for scope notes.

These are standalone scene starting points, while style-library contains cards.
Templates currently reference a public GSAP CDN. For a self-contained project,
copy `node_modules/gsap/dist/gsap.min.js` into its assets folder and change the
script source to `assets/gsap.min.js`, as the starter setup does.
