# overlays-fx: on-screen text and effects for overlays-v5 videos

`overlays-fx.css` and `overlays-fx.js` add one layer of design to the overlays-v5
starters used by `video-pc-edit`, `video-iphone-edit` and `video-iphone-pc-edit`:
text written on the screen when it matters, images in the cards, and the effects
that tie them to the footage. Same "aurora glass" language as the rest of
overlays-v5: dark glass surfaces, one blue glow per beat, Plus Jakarta Sans for
statements, Space Mono for anything the viewer types.

Reference build: `video-projects/_fxtest/` (`source/build.py` writes every effect
over real footage stills; `qa/snap-1/` holds the snapshots).

## Install (step 1 of every overlays-v5 video skill)

```bash
cp style-templates/overlays-v5/fx/overlays-fx.css style-templates/overlays-v5/fx/overlays-fx.js video-projects/<name>/assets/
mkdir -p video-projects/<name>/assets/cards
```

The starter `index.html` already loads both files after `gsap.min.js`. Helpers add
tweens to the global `tl`, so call them in the inline script after `const tl`,
after `FX.screens = [...]` and after the ZOOMS loop (`FX.zoom`).

## Layering

| z-index | Layer |
| --- | --- |
| 0 | `#screen` / `.phone` (footage) |
| 1 | `#zoom-vig`, `.fx-callout` (pinned to the footage) |
| 2 | `.takeover` (hook, agenda, section cards, interludes) |
| 3 | `.badge`, `.fx-cmd`, `.fx-check` |
| 4 | `.fx-title` (its scrim blurs everything below, badges included) |
| 5 | `#endscreen` |

Tracks: 7 callouts, 8 statements, 9 command chips, 10 checklists (0-6 stay as in
the starter). Clips on one track must not overlap; if two callouts overlap, put
the second on track 11.

Tones: add `tone-ok` (green), `tone-warn` (amber), `tone-bad` (red) or
`tone-violet` to any fx element. No class = blue. Use the tone that matches the
meaning: green = success or the right value, amber = warning, red = error or
missing, blue = neutral information.

## The effects

### 1. Command chip `fxCmd` (what the viewer types)

A glass chip at the top of the frame. A label (`Type`, `Run`, `Go to`, `Search`,
`Path`), a prompt mark, and the exact text, typed in about 20 characters per
second with a blinking caret. Optional green check when the command succeeded.

```html
<div id="cmd-doctor" class="fx-cmd clip" data-start="240.1" data-duration="9" data-track-index="9"
     data-kind="Run" data-ok="251.5">flutter doctor</div>
```
```js
fxCmd('#cmd-doctor');
```

- **Use for:** every command, URL, path and search term the viewer must type to
  follow the tutorial (`flutter doctor`, `flutter.dev`, `C:\src\flutter\bin`, `env`).
  These are the most valuable text on screen: the viewer copies them.
- **Timing:** start at the narrator's word (+0.1 s) or when the typing starts on
  screen, whichever is first. Hold until the typing on screen ends plus about 1 s,
  or to the result (`data-ok` = when the result shows). 3-12 s.
- **Position:** `data-pos="top"` (default, centred), `top-left`, `top-right`,
  `bottom-right`. Never over the data a zoom shows: move it, or end it before the zoom.
- Write the text exactly as typed (case, slashes, spaces). One chip at a time.

### 2. Callout `fxCallout` (point at something on the screen)

A pin with a ring pulse on the target, a line that draws itself, and a glass note.

```html
<div id="co-path" class="fx-callout clip tone-ok" data-start="226.3" data-duration="4" data-track-index="7"
     data-x="2206" data-y="915" data-side="right">
  <div class="co-label"><span class="co-k">New entry</span><b class="co-t mono">C:\src\flutter\bin</b><span class="co-s">Flutter's tools</span></div>
</div>
```
```js
fxCallout('#co-path');
```

- `data-x/y`: the target in TRACK pixels (pc-track 3840x2160, or phone-track px).
  Read it from the highlight box or a `highlight.mjs grid` image. Pin the edge of
  the target that faces the empty space, not its centre.
- `data-side`: `right | left | up | down`, toward empty space. `data-len` (default
  150) and `data-rise` (elbow height for right/left, default -60) shape the line.
- **Use for:** a value or result the narrator explains that is easy to miss: a new
  entry in a list, the line of a result that matters, a warning in the output, a
  button with an unclear label. Not for every click (the red highlight box does that).
- **Timing:** 2.5-6 s, from the word that names the target. With a highlight on the
  same target, start the callout 0.3-0.6 s after the highlight.
- **With a zoom:** inside a zoom, start after the zoom-in ends (`start + 0.7`) and end
  before the zoom-out starts; the position follows the zoom. Never across a zoom move
  (the browser console prints `[fx] ... while the zoom ... is moving`).
- Keep the note out of the badge area (bottom-left) and off the data it explains.
  `co-t` is 36 px bold (about 28 characters); add class `mono` for paths and code.

### 3. On-screen statement `fxTitle` (a key sentence, footage stays behind)

The footage blurs and dims, and a big statement rises word by word, with a marker
sweep under the key word.

```html
<div id="say-admin" class="fx-title clip tone-warn" data-start="161.7" data-duration="4.8" data-track-index="8">
  <div class="ft-kicker">Warning</div>
  <div class="ft-line">Never in <span class="mark">Program Files</span></div>
  <div class="ft-sub">Folders that need admin rights cause errors later.</div>
</div>
```
```js
fxTitle('#say-admin');
```

- **Use for:** warnings, rules and key takeaways where the viewer must still
  sense the footage (it is the same moment, not a new topic): "Never in Program
  Files", "Visual Studio, not VS Code", "No issues found!".
- `data-pos`: `center` (default), `lower` (lower-left block: celebrates a result
  while the screen stays readable), `top`.
- **Copy:** kicker 1-2 words; line 2-6 words (about 30 characters, one line at 104 px);
  one `.mark` per line; sub at most about 60 characters.
- **Timing:** 3.5-6 s from the narrator's sentence. Counts as an interlude for
  spacing: at least 12 s from any interlude or other statement. Never under a card,
  never during a zoom move, never over a highlight the narrator is explaining.
  The badge can stay; the scrim blurs it.

### 4. Checklist panel `fxCheck` (a list the narrator goes through)

A glass panel on the right with every item pending; each one ticks when the
narrator names it (green circle, drawn check, white label, progress bar, n/N count).

```html
<div id="chk-req" class="fx-check clip" data-start="51.0" data-duration="57" data-track-index="10">
  <div class="ck-title">System check</div>
  <div class="ck-item" data-at="53.2"><b>Windows 10 or 11, 64-bit</b><span>64-bit systems only</span></div>
  <div class="ck-item" data-at="63.9"><b>10 GB free disk space</b><span>more is better</span></div>
</div>
```
```js
fxCheck('#chk-req');
```

- **Use for:** requirements, prerequisites, a recap of what was done: 3-6 items,
  `<b>` about 26 characters, `<span>` about 30.
- Best over held footage (an idle desktop, a finished screen): it turns a long
  explanation without action into something to watch.
- `data-pos="left"` only when nothing is on the left and no badge is shown.

### 5. Section card with a screenshot and a light-sweep entrance `fxSection`

A bright beam sweeps left to right and wipes the section card in over the footage.
The text moves to a left column, a 3D-tilted screenshot of the section swings in on
the right and slowly pushes in, and an outlined section numeral sits behind the text.

```html
<div id="section-sdk" class="takeover clip" data-start="111.54" data-duration="6.7" data-track-index="2">
  <div class="inner">
    <div class="dotgrid"></div><div class="aurora"></div><div class="vignette"></div>
    <div class="st-num">02</div>
    <div class="section-stage has-media">
      <div class="st-kicker">Step 2 · Flutter SDK</div>
      <div class="st-headline">Download the SDK</div>
      <div class="st-sub">Straight from the official source: flutter.dev.</div>
      <div class="rail">...</div>
    </div>
    <div class="st-media"><img src="assets/cards/section-sdk.jpg" alt=""></div>
  </div>
</div>
```
```js
fxSection('#section-sdk', 111.54, 6.7);                 // wipe in, dissolve out onto the footage
fxSection('#section-pre', 43.7, 6.4, {afterCard:true}); // follows another card: no wipe
fxSection('#section-x', 200, 6, {toCard:true});         // another card follows: handoffOut
```

- **Screenshot:** a real frame of the section's footage, taken from the built track
  at the section's most telling moment (the page, dialog or result it is about):
  ```bash
  ffmpeg -v error -y -ss <t> -i assets/pc-track.highlighted.mp4 -frames:v 1 -vf scale=1760:-1 -q:v 3 assets/cards/<card-id>.jpg
  ```
  For a phone track, crop to the screen and scale to the 880x495 box, or leave the
  media out. A section with no footage (for example prerequisites) gets no
  `.st-media` and no `has-media` (text stays centred).
- **Copy:** with media, the headline is 96 px in a 750 px column, balanced over 2 lines
  at most (about 14 characters per line, 28 in all); the sub line is 700 px wide. The
  column must end before the screenshot: check the card at `start + 2.5`.
- The beam wipe needs the card to start over footage. Behind another card, use `afterCard`.

### 6. Card backdrop image `.bg-shot` + `fxDrift`

A dim, blurred real frame behind any tier-1 card (hook, agenda, interlude, closing),
so a card shows where the viewer is. 13 % opacity, drifting slowly. Blur the image
in the file, not in CSS (see "Render safety"):

```bash
ffmpeg -v error -y -ss <t> -i assets/pc-track.mp4 -frames:v 1 -vf "scale=1280:-1,gblur=sigma=5" -q:v 4 assets/cards/hook.jpg
```

```html
<div class="inner"><div class="bg-shot" style="background-image:url(assets/cards/hook.jpg)"></div><div class="dotgrid"></div>...
```
```js
fxDrift('#hook-intro .bg-shot', 0, 13);
```

Hook: the final result (the working app, the all-green screen). Closing: the same.

### 7. Small effects

- `fxCount(sel, at, to, {from, dur, decimals, prefix, suffix, sep})`: count-up for a
  big number (`<div class="big-num"><span class="n">10</span><small>GB</small></div>`).
  Start it 0.3-0.4 s after the interlude starts.
- `fxMark(sel, at)`: marker sweep under any `<span class="mark">` (interlude lines,
  agenda titles). One per card.
- Zoom focus: `FX.zoom` adds a soft vignette and a thin blue frame while a zoom holds,
  so the viewer feels the punch-in. Nothing to do: it comes with the ZOOMS loop.

## How much is enough

Text on screen is for what matters; the footage is the picture. Per minute of
narration, as a guide:

| Effect | Typical | Max |
| --- | --- | --- |
| Command chips | every typed command, URL, path, search term | one at a time |
| Callouts | 1 | 2 |
| Statements (`fxTitle`) | about 1 per 60-90 s | 1 per 30 s, 12 s from any interlude |
| Checklists | where the narrator lists 3+ items | 1 on screen |
| Section screenshots | every section with footage | |

Never stack two fx text elements on the same spot. Never put text over the data
the narrator is reading out, unless that text is the callout pointing at it.

## Render safety

HyperFrames lint rule `composition_heavy_overlay_count_high` counts every element
matched by a CSS rule with `filter: blur(...)` (also `backdrop-filter: blur`),
`radial-gradient(...)` or `clip-path`, through the leftmost class of the selector,
hidden elements included. It warns at 25; at about 40 the capture can render black
frames. So the kit keeps surfaces near-opaque (no backdrop blur on chips, callouts,
checklists or badges), the beam has no CSS blur, and backdrop images are blurred in
the file. Only `.fx-title` uses a backdrop blur. Each tier-1 card counts once
(`.takeover .aurora`). If a long video still passes 25, drop interludes before
anything else, and never add CSS blur, radial gradients or clip-paths to elements
that repeat (badges, chips).

## Checks

`hyperframes check` passes with the kit: `fxTitle` marks the badges, chips, checklists and
callouts on screen during the statement with `data-layout-allow-occlusion` and itself with `data-layout-allow-overlap`
(the statement blurs them on purpose), and
`fxSection` marks the beam and the screenshot frame with `data-layout-allow-overflow`.
A remaining `text_occluded` error is real: usually a callout under a tier-1 card.

- Snapshot every fx element at its start + 0.8 s (fully in) and at its end - 0.1 s.
  Read the text, check that it is not cut at the frame edge, not on top of a
  badge, and not hiding the data it explains.
- Callouts: the pin is on the target (zoom a snapshot with `--zoom`).
- Section cards: one snapshot at `start + 0.35` (beam mid-frame) and one at `+2.5`.
- `npx hyperframes lint` and `check` as usual; the kit adds no lint errors.
