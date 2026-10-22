# Design: Overlays v5 Template

Style: **Kallaway** (`style-library/02-kallaway`) — premium dark "aurora glass"
creator-explainer, adapted for a graphics-only overlay pass. Origin: built and
confirmed on `video-projects/excel-contacts-to-iphone` (2026-09-20 rebuild),
extracted here as a reusable starting point so the design doesn't need to be
rebuilt from scratch on every new overlays-project video.

**v5 (2026-09-28) = v4 plus build-safety rules and a section-chip scramble.**
The look, palette, two-tier system, agenda, hook intro and render workflow are
v4 unchanged. v5 adds rules adapted from the upstream `motion-showreel` skill
that apply to any seek-rendered overlay: a stagger-completion check, seek
safety for shared properties, measuring layout once, and 10-frame transition
strips as a required verification step. The one visual addition is
`chipScramble()`, which decodes a badge's `.idx` chip into its new label when
the section changes. See [v5 build-safety rules](#v5-build-safety-rules).

**v4 (2026-09-22) = v3 plus evolving badge detail lines.** Everything else in
this template is v3 unchanged — same palette, same two-tier system, same
`agendaBox()` box-grid agenda, same hook intro, same render workflow. The one
addition is `badgeDetails()`, below, which fixes the "long badge goes stale"
problem v3 had no answer for. See [Evolving badge detail lines](#evolving-badge-detail-lines-v4)
for the rule on when to use it — it is deliberately NOT something to put on
every badge.

This file is meant to be the only reference you need. Everything required to
build a video with this template — the markup contract, every fillable text
slot, the timing conventions, the helper APIs, and the exact verify/render
commands — is written out below. You should not have to open another video
project to copy a pattern out of it.

## Starting a new project from this template

```bash
npm run new-video -- my-video                      # creates video-projects/my-video
cp style-templates/overlays-v5/index.html \
   style-templates/overlays-v5/DESIGN.md \
   video-projects/my-video/
```

Then, in the new project:

1. **Add the narration audio.** Put the supplied WAV at `assets/narration.wav`
   and add an `<audio id="narration" data-start="0" src="assets/narration.wav">`
   element inside `#root`, as a **sibling of `#canvas`**, before it. The
   template deliberately ships without one. Without it the render produces no
   `audio.m4a` sidecar, and `scripts/render-queue.sh` stops after burning the
   full capture time. Narration supplied by the user is already edited — never
   re-trim it.
2. **Set `#root`'s `data-duration` to the narration's real length** in seconds
   (`ffprobe -v error -show_entries format=duration -of csv=p=0
   assets/narration.wav`). The hook intro overlays the first 20s rather than
   adding to it, so the total is exactly the audio length. Set `#chroma`'s
   `data-duration` to the same value.
3. **Get a word-level transcript** (`scripts/mw-transcribe.py`, local
   MacWhisper) and keep it in the project as the source of every timestamp.
4. **Replace all demo copy and all demo timestamps** (see "Demo content",
   below). Nothing in `index.html` is meant to survive unedited except the CSS
   system and the four JS helpers.
5. `meta.json` carries `fps` (30 unless the project says otherwise); the render
   queue reads it.

## Composition contract

The rules the HyperFrames runtime enforces — breaking one is a lint error, not
a style opinion:

- **One root composition**: a visible `div#root` with `data-composition-id`,
  `data-start`, `data-duration`, `data-width="3840"`, `data-height="2160"`.
- **Authoring scale**: everything visual lives inside `#canvas`, a 1920x1080
  box with `transform:scale(2)`. Always write 1080p pixel values; never
  hand-author at native 4K.
- **Every timed element** carries `data-start`, `data-duration`, and
  `data-track-index`. Visible timed divs also carry `class="clip"`.
- **Same-track clips must not overlap.** Track map for this template:

  | Track | Contents | Overlap rule |
  | --- | --- | --- |
  | 0 | `#chroma` transparent base | one element, whole duration |
  | 2 | tier-1 `.takeover` cards | strictly sequential, never overlapping |
  | 3 | tier-2 `.badge` elements | strictly sequential, never overlapping |

  Tier-1 and tier-2 are on different tracks, so they freely overlap each other
  — that is the whole point of the two-tier system.
- **`data-track-index` does not set z-order.** Visual stacking comes from CSS
  `z-index` (`.takeover{z-index:1}`, `.badge{z-index:2}`); see the hook-intro
  section for why this matters and what breaks without it.
- **One synchronous, paused GSAP timeline per composition**, registered in
  `window.__timelines` under the exact composition id:
  `window.__timelines['root'] = tl;`. Finite durations only; no
  `repeat:-1`, no runtime randomness, no `requestAnimationFrame` loops. Every
  frame of a render is an arbitrary seek, so any animation that isn't a pure
  function of timeline position will flicker between frames.
- **Local assets only**, and keep media playback to HyperFrames — don't call
  `.play()` on anything yourself.

## Text slots & copy limits

Every string you fill in, with the length each slot actually holds at 1080p
authoring scale. Overflowing a slot is usually invisible in a static preview
and obvious only in a rendered frame, so respect these:

| Element | Slot | Holds |
| --- | --- | --- |
| `#hi-problem` / `#hi-pivot` / `#hi-solution` | `.stat-line` hook beats | 1-2 lines at 72px in a 1500px box; ~60 chars per line. Wrap the emotional phrase in `.accent` (add `.alert` for red on the problem beat). Optional `.note` span adds a 30px dim second line. |
| `#badge-intro-1 .badge-title` | video title + `.idx` chip | title ~45 chars at 20px mono; chip 1-2 words ("Intro", "Section 1") |
| `.badge-sub` | what's happening now | ~50 chars at 39px inside the badge's 1250px max-width; one phrase in `.hl` |
| `.det` (v4 detail line) | one specific | ~40 chars — `white-space:nowrap`, so overflow shows up as obvious clipping in preview rather than silently reflowing |
| `.ag-kicker` | agenda eyebrow | 2-4 words, uppercase, letterspaced ("In This Video") |
| `.ag-title` | agenda headline | 2-4 words at 84px; accent word in `<em>` |
| `.ag-label` | topic name | 2-5 words; wraps to 2 lines max inside a 480px box |
| `.ag-note-pre` / `.ag-note-done` | topic note pair | ~34 chars each at 23px; the done line starts with `&#10003;` |
| `.st-kicker` | section eyebrow | "Section N", or the section's short name |
| `.st-headline` | section title | 1-2 short words at 126px; break by hand with `<br>` |
| `.st-sub` | section promise | one sentence, ~110 chars, wraps to 2 lines in a 1200px box |
| `.rail .lbl` | rail node label | "NN Name", ~16 chars at 16px mono — each node is 340px wide and `nowrap` |

## Timing and transcript anchoring

Every `data-start` and every helper timestamp comes from the project's word
timestamps. The convention, which `scripts/validate-beat-sync.mjs` also checks
for anchored sub-compositions:

- **Enter 0.2s after** the anchor word begins, and **at least 1.8s before** the
  word the beat refers to ends. A beat that lands after its own phrase has
  finished reads as lag even when it is "only" half a second late.
- **Tier-2 badges cover the runtime end-to-end** — one per script step, each
  starting on the step's first word and ending when the next begins. A bare gap
  with no graphic is fine only for genuinely non-tutorial passages (a CTA, an
  aside).
- **Tier-1 cards are punctuation**, not coverage. A section title runs
  4.5-6s; the agenda card 15-20s; the hook intro 20s.
- **`dissolveOut(id, start, dur)` must be called with the same `start`/`dur`**
  as the element's own `data-start`/`data-duration`, or the card's opaque fill
  outlives its clip window.
- The hook intro is the one exception: its three internal beats are paced for
  attention, not word-matched. Keep each beat readable (~4-6s) and the
  crossfades snappy.

## JS helpers (the full API)

Four helpers live in `index.html`; there is nothing else to import.

```js
dissolveOut(selector, start, dur)
```
Fades, blurs and scales a tier-1 card's opaque `.inner` out over the last 0.45s
of its clip window, then hard-kills opacity exactly at the boundary. The
`tl.set` hard kill is mandatory — without it the `gsap_exit_missing_hard_kill`
lint rule fires and stale opaque state leaks onto later frames when the renderer
seeks backwards. Call once per tier-1 card.

```js
agendaBox(id, {fadeIn, activate})
```
The whole behaviour of one agenda box in one call: fade/rise in at `fadeIn`, one
breathing pulse on the icon tile while pending, then at `activate` a single
coordinated payoff (border, icon tile, icon stroke all flip to green, a 3.5%
scale pop, and the note crossfade — all on the same timestamp so it reads as one
hit). Requires `#<id>-note-pre` and `#<id>-note-done` to exist; the helper
builds those id strings itself.

```js
badgeDetails(id, [{at, text}, ...])
```
One entry per `.det` row inside that badge's `.badge-dets`, in document order.
`text` is a readability aid for whoever edits the timeline; the visible copy
lives in the markup, so keep the two in sync. See the full rules below.

```js
chipScramble(selector, at, dur = .45)
```
Decodes a badge's `.idx` chip from seeded mono glyphs into its real label,
left to right, over `dur` seconds. Call it with `at` equal to the badge's own
entrance timestamp, so any pre-decode state happens while the badge is still
invisible. Use it only on the first badge of a new section (the chip's text
actually changes). On every badge it stops meaning anything. The label is read
from the markup, so there is nothing else to keep in sync.

## v5 build-safety rules

These come from the `motion-showreel` skill's build rules. They are not
showreel-specific: every HyperFrames render is a sequence of arbitrary seeks,
so they apply to this template too.

**1. Stagger completion must land before the exit.** For any staggered or
delayed group, compute `latest finish = start + max delay + duration` (for a
GSAP `stagger`, max delay = `stagger × (count − 1)`). That time must be before
the card's `dissolveOut` begins (`start + dur − 0.45`), with at least ~2s of
settled hold on a card the viewer needs to read. Check it on paper when you
retime a card, then confirm with a transition strip. This is the general
form of the rail bug caught on `how-to-uninstall-apps-on-windows-11`: the rail
finished so late it was legible for under a second.

Worked example (demo section title, start 40, dur 5.5): the rail nodes start
at 41.5, stagger 0.1 over 3 nodes, duration 0.4, so they finish at
41.5 + 0.2 + 0.4 = 42.1. The pulse starts at 42.4, runs 0.7 × 2 and finishes
at 43.8. The dissolve begins at 45.05, so there is a 1.25s settled hold after
the pulse. That is the minimum; do not push it later.

**2. Do not animate one property from many places.** If several tweens
across the timeline all write the same property on the same element (a shared
flash layer, a colour that flips back and forth, a class swap), a backward
seek can leave it stuck on the wrong value. The existing helpers are safe:
each writes a property once or in a strict sequence. When you add something
that repeatedly toggles one property, compute that property in a single
`onUpdate` from timeline time instead of chaining tweens:

```js
const drv = {t:0};
tl.fromTo(drv, {t:0}, {t:END, duration:END, ease:'none', onUpdate(){
  el.classList.toggle('inverted', ranges.some(([a,b]) => drv.t >= a && drv.t < b));
}}, 0);
```

Never use `Math.random()` inside such a function; hash an index instead
(see `chipScramble()`).

**3. Measure layout once, up front.** If a card needs a text width or box
position (`getBoundingClientRect`, `offsetWidth`), read it once at the top of
the script, after fonts are ready and before any `from()`/`immediateRender`
tween applies a transform. A measurement taken after a transform is applied,
or inside `onUpdate`, returns a different value on different seeks.

**4. Transitions are verified with 10-frame strips, not single snapshots.**
Snapshots sample one instant and miss layers that stick, ghost or flash for
2-3 frames. See the strip command in [Build → verify → render](#build--verify--render).

## Icons

Inline SVG only, `viewBox="0 0 64 64"`, stroke-based with `fill:none` —
stroke width, colour, glow and size all come from `.ag-icon svg` /
`.hook-glyph svg`, so an icon that ships its own `fill` or `stroke` attribute
will not participate in the activation colour flip. Draw simple, literal
shapes (a shield, a bolt, a bar chart, a folder); one concept per icon. No
icon fonts, no external icon libraries, no emoji.

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
  10x+ the file size for the same content). `hyperframes render` has no direct
  HEVC+alpha flag, so it is a two-step: PNG-sequence capture, then a
  VideoToolbox encode. Both steps and the exact flags are in
  "Build → verify → render" below — don't reconstruct them from memory.

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
  A badge that holds for a long stretch should carry evolving detail lines —
  see below.

## Evolving badge detail lines (v4)

**The problem this solves.** In v3 a tier-2 badge is a single fixed title for
its whole span. That is fine for a 20s step, but real builds routinely have
badges holding 40s+ while the narrator enumerates specifics. Measured on
`how-to-uninstall-apps-on-windows-11`: `badge-2-0` ("Leftover Files &
Folders") sat completely motionless for **46 seconds**, `badge-1-2` for 43.6s.
Tier-1 cards covered only ~13% of that video's runtime, so for the other 87%
the sole graphic on screen was a badge that had stopped saying anything new
several sentences ago.

**The fix.** `badgeDetails(id, [{at, text}, ...])` grows one short line per
specific the narration names, each anchored to its own transcript timestamp:

```js
badgeDetails('badge-2-0', [
  {at: 185.2, text: 'Program Files'},
  {at: 191.0, text: 'AppData'},
  {at: 198.4, text: 'Hidden registry keys'},
]);
```

with a matching `.det` row per entry inside `.badge-dets` in the markup, in
the same order. `text` in the JS is a readability aid for whoever edits the
timeline; the visible copy lives in the markup, so keep the two in sync.

**Behaviour — stacking, not swapping.** Earlier lines stay on screen and dim
to `--fg-dim` (their dot goes grey and loses its glow) while the newest line
sits at full `--fg` with an accent dot. The viewer keeps the whole list in
view, so it reads as accumulating evidence rather than a ticker that discards
each point as the next arrives. For a badge whose points really are mutually
exclusive, change the demote tween on the previous line to fade it to
`opacity:0, height:0` at the same timestamp — that gives swap behaviour with
no other change.

**The badge grows upward.** It is anchored `bottom:56px`, so the bottom edge
stays pinned against the frame and the badge expands into empty space above.
It never walks around over the footage as lines land.

**Rules of use:**

- **Only on badges holding roughly 25s or longer.** On a short badge this is
  noise — the title alone is the right amount of information. Most badges in
  a video should still be plain v3 badges; if every badge has detail lines,
  the device stops meaning "there is more to say here".
- **2-4 lines.** One line is not an evolution; beyond four the badge starts
  competing with the footage it is supposed to annotate.
- **One short line each, and keep them short.** `.det` is `white-space:nowrap`
  on purpose, so an over-long line shows up as obvious overflow in preview
  instead of silently reflowing to two lines and being clipped by the fixed
  row height.
- **Anchor each line to the transcript**, ~0.2s after the narrator starts
  naming that specific — same convention as every other beat. Lines that
  appear on a timer instead of on the words are worse than no lines.
- **`BADGE_DET_H` (42px) must match the `.det` line box in the CSS.** The row
  height is a fixed number rather than `height:auto` deliberately: an
  auto-height tween is not reliably reproducible when HyperFrames seeks to an
  arbitrary frame, and every frame of a render is an arbitrary seek.
- **Colour:** `--fg` for the newest line, `--fg-dim` for superseded ones.
  Never `--fg-faint` — it fails WCAG AA on this background.
- `.badge-dets` carries `data-layout-allow-overlap`. While a row grows from
  `height:0` its inner text span is clipped by `overflow:hidden`, but its raw
  bounding box still measures over the row above for the ~0.45s of the tween.
  That is a measurement artefact of the clip, not a visual overlap — the same
  reason `.ag-note-wrap` carries the marker for its crossfade.

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
- **A persistent "shared object" motif**: one recurring visual anchor — a
  before/after pair, a checklist, a counter, the one artifact the whole video
  is about — planted in the intro, revisited at each section boundary in a
  changed state, and resolved in the outro. It is what makes a video feel like
  one place rather than a run of unrelated cards. Deliberately **not** in this
  template, because the object has to come from the video's own concept; build
  it as a tier-1 card using the same shell (`.inner` + `.dotgrid` + `.aurora` +
  `.vignette`), a two-column flex stage inside it, and `dissolveOut()` for the
  exit, so it inherits the system instead of introducing a second look.
- **An outro bookend**: the agenda card again at the end, with every box
  already in its activated green state — a cheap, strong payoff, since
  `agendaBox()`'s `activate` state is exactly what "done" should look like.

## Demo content in `index.html`

`index.html` ships filled with a **fictional** tutorial, *"How to Free Up
Storage on Windows 11"* — three agenda topics, a hook, a section title with a
3-node rail, and a 37s step badge carrying three detail lines. There is no such
project, no audio file and no real transcript; the copy exists so the template
renders as a believable video instead of a grid of "Replace Me" placeholders,
and so every slot demonstrates its own realistic length and tone.

The file also carries a **dummy anchor table** in a comment at the top, mapping
each timestamp in the file to the (invented) narration line it is anchored to.
That table is the shape every real project needs: a timestamp in the markup or
in a helper call should always be traceable back to a word in the transcript.
Rewrite it with the real anchors rather than deleting it.

Replace: every visible string, every `data-start`/`data-duration`, every
`agendaBox()` and `badgeDetails()` timestamp, the agenda box count, the rail
nodes, and the `<title>`. Keep: the CSS, the three helpers, the track/z-index
structure, and the comment blocks explaining them.

The `snapshots/` PNGs are frames of this demo content, regenerated whenever it
changes — they are a visual reference for the system, not a baseline to diff
against.

## Build → verify → render

Run all of these from the project directory (`video-projects/<slug>/`), except
`preflight.mjs` which takes the project path from the repo root.

```bash
node scripts/preflight.mjs video-projects/<slug>     # assets, audio, structure
npx hyperframes lint                                 # 0 errors required
npx hyperframes check --samples=40 --at-transitions  # layout, motion, WCAG AA
```

`check` with the default 9 samples misses real issues on a dense overlay
composition — always pass `--samples=40 --at-transitions` before a render, so
every tween boundary is sampled, not just segment midpoints. Add
`--snapshots --at=<t1>,<t2>,...` to save PNGs of specific beats, and review
them: pick a frame ~2s into each section-title card (the rail's legibility
window), one mid-agenda, one at each badge detail line, and one at every
tier-1 → tier-2 hand-off. Lint passing proves nothing about how it looks.

Preview interactively with `npx hyperframes preview` (HyperFrames Studio) and
scrub the tier-1 boundaries and the badge growth before committing to a render.

Before the final render, make a draft MP4 and cut a 10-frame strip across
**every** tier-1 dissolve, every tier-1 → tier-2 hand-off, every
`badgeDetails()` line arrival and every `chipScramble()`. The draft is on the
black background (MP4 has no alpha), which makes stuck or ghost layers easy to
see. Each strip must show no stuck layer, no ghost of the previous card, no
black or white flash, and no clipped text:

```bash
npx hyperframes render -q draft -o renders/draft.mp4
# frame n = seconds × fps. Example: the demo section title's hard kill at
# 45.5s × 30 = frame 1365, so frames 1361-1370 straddle it.
ffmpeg -i renders/draft.mp4 \
  -vf "select='between(n\,1361\,1370)',scale=384:-1,tile=layout=5x2" \
  -frames:v 1 -fps_mode passthrough qa/strip-45.5s.png
```

Save the strips under `qa/` and list them in `VERIFY.md`.

Then render — via the queue, never by hand, and never two at once:

```bash
# append video-projects/<slug> to render-queue.txt at the repo root, then:
bash scripts/render-queue.sh
```

The queue runs, per project, exactly these two phases:

```bash
npx hyperframes render -q standard --format png-sequence -o renders/png-seq

ffmpeg -y -framerate 30 -i renders/png-seq/frame_%06d.png \
  -i renders/png-seq/audio.m4a \
  -c:v hevc_videotoolbox -alpha_quality 0.9 -tag:v hvc1 -pix_fmt bgra \
  -allow_sw 1 -c:a aac -b:a 192k -shortest \
  -y renders/<slug>.mov
```

Watch progress with
`bash .claude/skills/render-progress/scripts/render-progress.sh --queue`.
Notes that cost real time when forgotten:

- **No `audio.m4a` sidecar means no audio element** — the queue stops there,
  after the full capture has already run. Check the audio element first.
- `ffprobe`'s `pix_fmt` is not trustworthy for HEVC+alpha; verify alpha by
  actual playback or by decoding and sampling a frame, not by reading metadata.
- A capture worker dying with "Target closed" is almost always RAM pressure
  from a concurrent session, not a composition bug — check `ps`/`vm_stat`,
  wait, retry.
- The rendered file is the user's to verify and the user's to publish. Report
  the output path and size; don't upload anything.

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
