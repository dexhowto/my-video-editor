# Design: Overlays v3 Project Template

Style: **Kallaway** (`style-library/02-kallaway`) — premium dark "aurora glass"
creator-explainer, adapted for a graphics-only overlay pass. Origin: built and
confirmed on `video-projects/excel-contacts-to-iphone` (2026-09-20 rebuild),
extracted here as a reusable starting point so the design doesn't need to be
rebuilt from scratch on every new overlays-project video.

## Palette & type

Canvas `#0A0E14`, text `#F0EEE9` (dim `.62` / faint `.34` alpha variants),
accent blue `#37BDF8`, accent yellow `#F5D82A`, alert red `#FF3B30`,
success/"done" green `#4ADE80`. Display type Plus Jakarta Sans, body Inter,
data/mono labels Space Mono.

## Output format

- **Resolution: 3840x2160 (4K)**, always. Author at 1920x1080 pixel values
  inside the `#canvas` `scale(2)` wrapper already set up in `index.html` —
  never hand-author at native 4K values.
- **Transparent (alpha) background**, not chroma-key green. `html`, `body`,
  `#root`, `#chroma` all stay `background:transparent`; only tier-1
  full-screen takeover cards are opaque. No footage baked into the file —
  the editor drops their own screen recording underneath.
- **Default render output: HEVC+alpha**, not ProRes (ProRes 4444 balloons to
  10x+ the file size for the same content). PNG-sequence capture
  (`hyperframes render -q standard --format png-sequence`) → `ffmpeg -c:v
  hevc_videotoolbox -alpha_quality 0.9 -tag:v hvc1 -pix_fmt bgra` two-step
  workaround, since `hyperframes render` has no direct HEVC+alpha flag. See
  the root `overlays-project` skill memory / `docs/` for the exact confirmed
  ffmpeg invocation and verification caveats (don't trust `ffprobe`'s
  `pix_fmt` for this format — verify by actual playback or decode-and-sample).

## Two-tier overlay system

- **Tier-1 "important" beats** (`.takeover`) — full-screen opaque card:
  dark Kallaway shell (`.dotgrid` + `.aurora` + `.vignette`), opaque fill
  lives on a child `.inner` div so it can dissolve to transparent right
  before the clip ends (`dissolveOut()` helper — always pair a `tl.to`
  fade/blur/scale with a `tl.set` hard-kill exactly at the boundary, or the
  `gsap_exit_missing_hard_kill` lint rule fires). Use **sparingly**: a brief
  hook opener, section titles, the agenda card, short "big stat" punctuation
  cards. Don't let it eat extended setup/explanation narration.
- **Tier-2 "step" beats** (`.badge`) — bottom-left flat black badge, no
  glass/blur, `background:rgba(0,0,0,.8)`, floats on the bare transparent
  background. One per script "Step N" (or equivalent unit), covering the
  entire runtime end-to-end alongside tier-1. A bare gap with no graphic is
  fine for genuinely non-tutorial passages (e.g. a like/subscribe CTA).

## Hook intro — silent-feeling cold open that overlays real audio

A ~20s tier-1 card at `data-start="0" data-duration="20"` whose content morphs
in place, problem → pivot → solution (three `.stat-line` beats plus a
`.hook-glyph` tile that crossfades between a red alert-triangle and a blue
checkmark — the checkmark motif is reused deliberately, priming the agenda
boxes' own activation payoff later). It **rolls on top of the first 20s of
the project's real narration audio** — it is not a prepended silent segment.
Never shift the `<audio>` element's `data-start`, or any other beat's timing,
to make room for it; every other beat keeps its normal transcript-anchored
position. The only placement rule: no other tier-1 element may start before
20s (same-track overlap on track 2) — push the next tier-1 beat (typically
the agenda card) to 20s or later if it would otherwise land earlier.

Tier-2 (track 3) always renders **above** tier-1 (track 2) — via explicit CSS
`z-index` (`.takeover{z-index:1}`, `.badge{z-index:2}` in `index.html`), **not**
via `data-track-index`. An earlier version of this doc claimed `data-track-index`
itself sets real z-order; that's wrong, and the `hyperframes` skill's own docs
say so directly — "`data-track-index` does **not** affect visual layering — use
CSS `z-index`." Without the explicit z-index, plain DOM order decides stacking,
which is unreliable: snapshot testing on this exact template caught
`badge-intro-1` staying visible over `hook-intro` (it happens to follow
`hook-intro` in the DOM) but getting **fully hidden** by `agenda-demo` (which
follows the badge in the DOM) — same track-index the whole time, opposite
result. The explicit `z-index` rule fixes this for real: an early-starting
tier-2 badge (e.g. an intro badge at `data-start="3"`) is NOT hidden by any
tier-1 takeover; it floats visibly on top for its whole span. Write that
badge's copy to read fine alongside the takeover's own on-screen lines, not
as something concealed and later revealed — confirmed by snapshot on this
template standalone and on `video-projects/excel-contacts-to-iphone`.

This card isn't transcript-timed internally (its three beats are paced for
attention, not word-matched) — only its total ~20s span needs to roll with
real audio underneath. Whatever the narrator is actually saying under it
doesn't need to match the on-screen text; no separate music bed is needed
either, since real narration audio is already playing (no silent gap to
fill). Skip this beat entirely on a project where the existing hook already
does this job well — it's optional, not a hard requirement of applying v3.

## "What We'll Cover" agenda — the v3 box-grid (this template's centerpiece)

Whenever the script's intro previews the video's own topics/sections,
replace what would otherwise be a tier-2 badge over that span with a
dedicated tier-1 "agenda" card holding **one centered box per topic**:

- **Grid**: `display:flex; flex-wrap:wrap; justify-content:center;
  align-content:center`, boxes `flex:0 0 480px`, container
  `max-width:1820px`, `gap:32px`. **Max 4 boxes per row** — a 5th wraps to a
  second centered row automatically. Typically only 2-4 topics fit well;
  don't pad with topics the intro doesn't actually preview.
- **Per box, top to bottom**: an icon in a glowing circular tile
  (`.ag-icon`, 104px, echoes `style-library/02-kallaway/cards/tier1/
  t1-overview-iconlist.html`'s icon-tile pattern — never a bare icon
  floating alone) → bold topic label → a note line that **crossfades** from
  a forward-looking preview to a confirmed "✓ ..." line on activation.
- **The `agendaBox(id, {fadeIn, activate})` JS helper** (in `index.html`)
  is the whole box's behavior in one call: fade in ~0.5-1.5s ahead of the
  topic's first transcript word; while pending, one gentle breathing pulse
  on the icon tile's glow; at `activate` (~0.2s after the topic's mention
  finishes), one coordinated payoff — border + icon tile + icon stroke flip
  to green, a quick 3.5% scale pop, and the note crossfade — all at the
  same timestamp so it reads as one hit, not a sequence.
- **To add a topic**: duplicate one `.ag-box` HTML block (new id, swap
  icon/label/notes) and add one `agendaBox('new-id', {fadeIn: X, activate:
  Y})` call. No other JS or CSS changes needed.

## Optional enhancement patterns (carry over per project as they fit)

- **Section-title progress rail** (`.rail`): a horizontal row of labeled
  nodes showing where the viewer is in the video's overall structure, with
  a connecting line/fill and `on`/`done` states.
  **Time the rail to land early — by ~`start+2.3` at the latest.** A section
  title card runs ~4.5-6s and `dissolveOut` begins its exit at
  `start+dur-0.45`, so a rail that animates in late is on screen, fully
  assembled, for well under a second — the viewer sees only the bare
  connector line for most of the card and never reads their position. The
  template's values (`nodes` at `+1.5` with a `.1` stagger, settled ~`+2.3`;
  `on`-dot pulse at `+2.4` with `repeat:1` so it completes) are the floor,
  not a starting point to push later. Caught for real on
  `how-to-uninstall-apps-on-windows-11` (2026-09-22), where the rail was
  legible for ~0.85s of each 4.5s card and the pulse was cut off mid-cycle;
  the bug survived template review only because this file's demo card used
  to be 18s long, which hid it. Verify by sampling a frame ~2s into a real
  section-title card, not by previewing the demo.
- **Badge rail-bar + section chip + progress pips**: a left-edge accent
  bar, an inline `.idx` chip naming the current section, and `.pips`
  showing progress through that section's own steps.
- **A persistent "shared object" motif**: one recurring visual anchor
  (tracker, comparison, shared document) planted early, referenced at
  section boundaries, and resolved in the outro — not included in this
  base template since it's specific to each video's own concept, but the
  same `.loop-stage`/`.loop-col` classes from the reference build
  (`video-projects/excel-contacts-to-iphone/index.html`) are a ready
  starting point if a project needs one.

## Known caveats

**Resolved 2026-09-22 — `.rail .lbl` is now `--fg-dim`.** It used to be
`--fg-faint`, which `hyperframes check`'s contrast pass flagged on the
**inactive** rail node labels: the rail sits low in the frame near the
`.aurora` glow's brightest point, and the glow lightens the background
enough there to drop faint text to ~2.7-2.83:1, below the 4.5:1 AA floor.
This file previously described that as an accepted characteristic of the
approved `excel-contacts-to-iphone` build and told agents not to brighten it
without asking. That guidance cost real time: the failure was rediscovered
and hand-fixed per-project on `how-to-change-cursor-on-windows-11` and again
on `how-to-uninstall-apps-on-windows-11`, where it was caught only *after* a
completed 45-minute render and forced a re-render. The user approved fixing
it at source, so new projects now inherit the accessible value and need no
per-project patch. Older builds predating this still carry `--fg-faint` and
should be fixed if they are ever re-rendered for other reasons.

The `.ag-note-pre`/`.ag-note-done` crossfade pair intentionally
overlaps mid-transition (marked `data-layout-allow-overlap`) — that's the
crossfade working as designed, confirmed correct via snapshot review, not a
layout bug.

## What to avoid

No hand-drawn/marker motifs, no paper collage, no strobing loops, no glass/
blur on tier-2 badges or agenda boxes (flat black only — glass is reserved
for the tier-1 shell's own ambient layers), no two saturated glow colors
competing in one frame. Blue is the hero glow; yellow is rare punctuation;
green is exclusively the "done"/confirmed state.
