---
name: video-pc-edit
description: Build a 4K PC / desktop screen-recording tutorial video from projects-full/<name>/ (audio/ narration files, video/ screen recordings, script/ script), using the overlays-v5 template. The recording plays full frame, each step gets a red highlight box with spotlight dim (highlight-video), and a zoom feature punches in on small on-screen data (cells, numbers, formula bar) so it is readable. The screen video is synced to the narration by holding frames when the explanation runs longer than the footage. Use for "PC tutorial", "desktop edit", "screen recording tutorial", "zoom on the data", "/video-pc-edit", or a request to edit a computer screen recording with narration. Waits (10-minute cron) while another project is building. Never asks for confirmation at any time of day: after transcription and input analysis it takes open decisions itself, builds to the end, and reports important improvements and gaps; never renders.
---

# PC screen edit

Copy of `video-iphone-edit` adapted to PC screen recordings. Reference look:
`examples/demo-pc.mp4` (Excel tutorial: full-frame screen, overlays-v5 cards and
bottom-left badges). **Output is always 4K (3840x2160).** `demo-pc.mp4` is only
a 1280x720 look reference; real recordings are expected at 4K or at least
1080p. Differences from the iPhone skill:

| | iPhone | PC |
| --- | --- | --- |
| Frame | phone placeholder PNG, rounded screen | none, recording fills the 16:9 canvas |
| Background image | yes | no (the recording is the background) |
| Recording | portrait, HEVC VFR | landscape 16:9, any fps (builder normalizes) |
| Highlights | yes | yes, same `highlight-video` skill, pc-track pixel coordinates |
| Zoom | no | yes, `ZOOMS` block in `index.html` |
| Endscreen | yes | yes, same files |

Everything else (workflow, sync plan, narration drives the timeline, tier-1
cards, badges, endscreen, verification) follows
`.agents/skills/video-iphone-edit/SKILL.md`. Read it, then apply the changes
below. Where this file is silent, the iPhone skill rules apply (except rendering: never render, see "No render"), with these name
swaps: `phone-plan.json` = `pc-plan.json`, `phone-track*` = `pc-track*`,
`#phone-video` = `#pc-video`, build script `B` = `build-pc-track.mjs`.

**Working directory.** Kit repo `/Users/dexter/VS AI Projects/hyperframes-frame/herk-edit-kit`.
`cd` there first. Scripts: `B=.agents/skills/video-pc-edit/scripts/build-pc-track.mjs`,
`T=.agents/skills/video-pc-edit/scripts/transcript-lines.mjs`,
`H=.agents/skills/highlight-video/scripts/highlight.mjs`.
Templates in `.agents/skills/video-pc-edit/templates/`: `index.html` (starter,
with `#screen` wrapper and `ZOOMS`), `pc-plan.example.json`,
`pc-track.highlight.example.json`.

## Inputs

`/video-pc-edit <name>` reads `projects-full/<name>/` (`audio/`, `video/`,
`script/`), same rules as the iPhone skill. Never modify those files.
Step 1 copies them into `video-projects/<name>/original/` with
`node scripts/copy-original.mjs <name>` ("Copy to `original/`" in the iPhone
skill), and every later step reads the inputs from there.
**Script location:** the user puts the script in
`video-projects/<name>/assets/script.md`. Look there first, then in
`original/script/`, then `original/script.md` (copies of
`projects-full/<name>/script/` and `projects-full/<name>/script.md`, written
by `video-process-script` Finalize). If none exists, the MacWhisper transcript
is the script. Read the script before the sync plan: it gives the section order
(which recording comes first), the step list, the badge text, and the language
(endscreen choice). Never modify `script.md`. No
`backgrounds/` and no `placeholder/` are needed. Endscreen: pick by script
language (`endscreen/end-romana.mp4` or `end-english.mp4`), step 7b of the
iPhone skill.

Build layout: `video-projects/<name>/` with `original/` (input copy),
`assets/narration.wav`,
`assets/pc-track.mp4`, `assets/pc-track.timeline.json`,
`assets/pc-track.highlight.json`, `assets/pc-track.highlighted.mp4`,
`assets/endscreen.*`, `pc-plan.json`, `index.html`, `DESIGN.md`, `meta.json`,
`VERIFY.md`, `qa/`, `renders/`.

## Workflow

0. **Wait for a free machine; no-ask mode.** Follow step 0 and "No-ask mode"
   of the iPhone skill with `<skill>` = `video-pc-edit`: take the build lock with
   `node scripts/video-busy.mjs --lock <name> --skill video-pc-edit`, wait with a
   10-minute cron job while busy, and never ask for confirmation (any time of day).
1. **Scaffold.** `npm run new-video -- <name>`, copy
   `templates/index.html` and `style-templates/overlays-v5/DESIGN.md` into the
   project, `mkdir source qa assets/cards`, copy the effects kit
   (`cp style-templates/overlays-v5/fx/overlays-fx.css style-templates/overlays-v5/fx/overlays-fx.js video-projects/<name>/assets/`,
   again when continuing an older build), then copy the inputs:
   `node scripts/copy-original.mjs <name>`. Set `fps` in `meta.json` (default 30).
   Plan paths read the copy: `original/audio/...`, `original/video/...`.
2. **Probe.** `ffprobe` narration and recordings. Contact sheet per recording
   (`fps=2,scale=180:-1,tile=10x4`; no `drawtext` in this ffmpeg). Pin each
   action with a dense sheet at 0.2 s per tile. For a PC recording note, per
   step: `click` (cursor reaches the target), `change` (the screen changes), and
   `data` (when the numbers worth zooming on are on screen). The output stays 4K
   whatever the input. If a recording is below 3840x2160, say so in the report
   (zoomed text softens when the source is 1080p or lower); never lower the
   output size to match the input.
3. **Transcribe.** Same as the iPhone skill (`scripts/mw-transcribe.py`, then
   `$T`). Always use the local MacWhisper app; never ElevenLabs or another paid
   service, and do not ask before transcribing. Compare the transcript with
   `assets/script.md` (MacWhisper merges or splits some words).
3b. **Analyze (no stop).** Follow step 3b of the iPhone
   skill: audio, script-vs-transcript, video and pacing checks, written to
   `ANALYSIS.md` (OK / Can improve / Decisions taken). PC extras:
   recordings below 3840x2160, small data that needs a zoom but is unreadable
   even at 2.5x, and cursor movement that hides the data. Do not stop or ask:
   take the decisions, keep the lock, and continue with step 4; never render.
4. **Plan the sync (`pc-plan.json`).** Same segment model, `freezes`, `lead`,
   `speed` as the iPhone skill. Keep `"size": [3840, 2160]` (the builder default); 16:9 recordings are scaled, others get black padding. Recommended
   pattern: one segment per action, freeze on the settled screen while the
   narrator explains. Sample the built track at every spoken step before any HTML.
   ```bash
   node $B video-projects/<name>/pc-plan.json --dry
   node $B video-projects/<name>/pc-plan.json
   ```
   **Section pauses (user rule 2026-10-17):** every new script section gets 1.5 s
   of silence before its first word, and its full-screen section card starts
   0.5 s into the silence. Follow "Section pauses" in the iPhone skill: add
   `narration.pauses` to `pc-plan.json` before you set any `start`, print the
   transcript with `$T ... --pauses video-projects/<name>/pc-plan.json`, and read
   `pauses[]` (`start`, `end`, `cardStart`) from `assets/pc-track.timeline.json`.
   Interludes and the options shown inside a section get no pause.
5. **Highlight.** Follow the iPhone skill step 5 on `assets/pc-track.mp4`
   (plan file `assets/pc-track.highlight.json`, `"video": "pc-track.mp4"`,
   `"output": "pc-track.highlighted.mp4"`). Box coordinates are pc-track pixels
   (4K: 3840x2160). Use the skill's `grid` command to read edges. PC
   conventions: a cell box covers the cell border; a ribbon button box covers
   icon and label; a formula-bar box spans the typed text; `radius` 6-10,
   `border` 6 (4K). One highlight per target, start at the word (+0.2 s) or
   when the cursor arrives, whichever is first. Fade-out ends before the
   screen changes. Highlights are baked into the track, so a later zoom
   enlarges them too: that is intended.
6. **Zoom (new).** For anything too small to read at full frame (typed
   formulas, cell values, a result, a menu). Rules:
   - Zoom on DATA, not on every step. Typical video: 3-8 zooms, 2-5 s each.
   - Zoom only on a settled screen (inside a freeze or a long hold), never
     mid-scroll. The data must stay put for the whole zoom.
   - Box `[x, y, w, h]` in pc-track pixels, with margin around the data. The
     scale is `min(1920/w, 1080/h)` capped at 3, centered on the box and
     clamped to the frame. Prefer 1.8x to 2.5x; above 3x the picture is mush.
   - Timing: zoom-in 0.7 s starting at the word that names the data minus 0.3 s,
     hold, zoom-out 0.6 s. Leave at least 0.5 s at scale 1 between two zooms,
     or merge them into one box.
   - A highlight and a zoom on the same target: start the highlight, then the
     zoom 0.3 s later, so the box is already visible when the view moves.
   - Keep the zoomed data out of the bottom-left badge area (about 720x330 px
     of the 1920x1080 frame), or move the badge.
   - Zoom out to scale 1 before every tier-1 card and before the endscreen.
   - Write the entries in `ZOOMS` in `index.html`; `ZOOMS.forEach(z => FX.zoom(z, {TW}))`
     below it is deterministic, animates only the `#screen` wrapper, and adds the
     focus vignette (soft dark edges and a thin blue frame) while the zoom holds.
     Set `TW`/`TH` to `size` in `assets/pc-track.timeline.json`.
   - A zoom on a result is the best moment for a callout (`fxCallout`, step 7):
     start it after the zoom-in ends and end it before the zoom-out; the pin
     follows the zoom.
   Preview a zoom without a render: extract the frame at `start + 0.7 + 0.3`
   from `pc-track.highlighted.mp4` and crop it
   (`crop=<w>:<h>:<x>:<y>` with the box) to see what the viewer will see.
7. **Compose (`index.html`).** The template has: `#chroma` (black base),
   `#screen` > `#pc-video` (track 1), tier-1 cards, badges (track 3),
   endscreen, `ZOOMS`. Set `#chroma` and `#pc-video` `data-duration` = narration
   duration D, add the narration `<audio>` (track 4) as in the iPhone skill,
   root `data-duration` = D - 5 + endscreen length. Section cards: one per new
   section, `data-start` = the pause's `cardStart`. The starter has one
   `#section-0` card with its GSAP block: repeat it with new ids for each
   section. Zoom out before each card. Badges, agenda (4 topics =
   390 px boxes), `handoffOut()` between back-to-back cards: as in the iPhone
   skill steps 7.5-7.10, except that badges may overlap the screen (they do in
   `examples/demo-pc.mp4`), so there is no `max-width` from a phone layout.
   **On-screen text and effects:** iPhone skill step 7.11 and
   `style-templates/overlays-v5/fx/README.md`. On PC it matters most:
   - a **command chip** for every command, URL, path and search term typed on
     screen (`flutter doctor`, `flutter.dev`, `C:\src\flutter\bin`, `env`);
   - a **callout** on the result line or the new value inside a zoom;
   - an **on-screen statement** for warnings tied to the screen ("Never in
     Program Files");
   - a **checklist** for requirement lists over the held desktop;
   - a **screenshot** on every section card (`assets/cards/<card-id>.jpg`, one
     frame of the section from `pc-track.highlighted.mp4`).
   `FX.screens = [{kind:'pc', TW, TH}]` is already in the starter; callout
   `data-x/y` are pc-track pixels.
8. **Endscreen and verify, no render.** Endscreen as in step 7b of the iPhone
   skill (known root `data-start` preflight conflict included). Then follow
   "No render" below. Extra snapshot checks for PC:
   - Every zoom: start, fully zoomed, end. Data readable, not cut at the frame
     edge, not under a badge. Highlight still on the right target while zoomed.
   - Scale back to exactly 1 (no leftover offset) after each zoom.
   - Every section pause, as in "Section pauses" of the iPhone skill.
   - Every overlays-fx element fully in and just before its end (iPhone skill,
     step 8): command chips not over zoomed data, callout pins on target.
   - Compare one frame side by side with `examples/demo-pc.mp4`.

## No render: build, check, hand over (user rule, 2026-10-09)

Never run `hyperframes render`: no draft, no Full HD copy, no 4K final, no
`render-queue.sh`, no `render-video`. The user renders the video and reviews it.
The skill ends with a composition that is ready to render and checked without rendering:

1. `node scripts/preflight.mjs video-projects/<name>` (repo root), then, in the
   project folder, `npx hyperframes lint` (0 errors) and
   `npx hyperframes check --samples=40 --at-transitions`.
2. Composed 4K frames with `hyperframes snapshot` (a few seconds per frame, no
   render). Always pass `--describe false` (otherwise it sends frames to Gemini):
   ```bash
   npx hyperframes snapshot --at 2,18.5,64.9,155 --no-end --describe false -o qa/snap-<label>
   ```
   Take: hero frames (each card, interlude, badge change, zoom fully in),
   both sides of every card boundary and segment boundary (t-0.2, t, t+0.2), and
   the endscreen (ES-0.5, ES, ES+0.4, last frame - 0.05). Read `contact-sheet.jpg`,
   and open single PNGs where detail matters (corners, highlight edges, small text).
   Use `--zoom x,y,w,h` for a sharp crop.
3. Track-level checks with ffmpeg on the built tracks (sync at every spoken step,
   highlight start/middle/end), as in the planning steps.
4. Write `VERIFY.md`: checks run, findings, fixes, and what still needs a human
   (listening to the audio joins and A/V sync in motion, which snapshots cannot show).
5. Report, release the build lock (`node scripts/video-busy.mjs --unlock <name>`),
   and stop. End with **Important improvements and gaps** (iPhone
   skill, "No-ask mode"). Give the command the user can run:
   ```bash
   cd video-projects/<name> && npx hyperframes render -o renders/<name>.mp4
   ```
   Root duration: end it about 0.05 s before ES + endscreen length. The endscreen
   video's last frame lies past the clip end, so ending exactly at ES + EL gives
   1-2 black frames (dezinstaleaza-app, 2026-10-09).

## Cards vs footage (visual rhythm)

The blue full-screen card (tier-1) is NOT the default picture. Footage is.

- **Full-screen cards, only these:** the hook (intro), the agenda ("what you will learn"),
  the section card at each new script section (it starts 0.5 s into the 1.5 s section pause;
  see step 4), the switch card between the iPhone and PC parts (short), and the closing
  recap / call to action. Nothing else gets a long card.
- **Everything between them shows the footage:** the PC screen (first or last screen, held), with the bottom-left badges carrying the text. This holds even for a long explanation that has no matching recording
  (for example 100 s about how a feature works): keep the held PC screen on screen and use
  badge lines and interludes. Never fill it with one long card.
- **Interludes:** when the narrator states a key idea, number, contrast or warning ("over 1
  billion devices", "24 hours", "without the network the phone is invisible"), cut to a short
  full-screen interlude for 3-7 s, then return to the footage. Rules:
  - about one interlude per 20-30 s of narration, at least 12 s of footage between two, and none in the first 15 s after the agenda;
  - one idea per interlude, at most 2 lines of text plus one short note;
  - vary the look: the default blue, another colour (violet, amber, green: set the `theme-*`
    class on the card; see the template), or a graphic (a big number, an icon, a simple
    two-box diagram). Do not repeat the same look twice in a row;
  - fade the card in over 0.4 s and dissolve it out onto the footage (`dissolveOut`), because
    it follows footage, not another card. Two cards back to back use `handoffOut`;
  - badges are z-index 3 and sit ABOVE cards (z-index 2): fade the active badge out (`badgeOut`) before the
    interlude starts and bring the next badge in after it ends.
- Interludes replace nothing in the sync plan: the tracks keep playing underneath. Check that
  no highlight or zoom happens under an interlude. Interludes get no section pause.
- **Text on the footage (overlays-fx):** when the key idea belongs to what is on screen right
  now, prefer an on-screen statement (`fxTitle`, footage blurred behind) to an interlude; for
  a list over held footage use a checklist panel; commands, URLs and paths always get a
  command chip. See "Cards vs footage" in the iPhone skill and its step 7.11.

## Rules

- After `highlight.mjs render`, re-encode each highlighted video with a 1 s GOP,
  or HyperFrames warns "sparse keyframes (max interval 8.33s)" and can freeze frames
  while seeking: `ffmpeg -i X.highlighted.mp4 -c:v libx264 -crf 14 -preset veryfast -r 30 -g 30 -keyint_min 30 -pix_fmt yuv420p -movflags +faststart -an X.reenc.mp4`,
  then replace the file. Do this for every highlighted track before lint/check/snapshot.
- Never modify recordings, narration, or anything in `projects-full/` or `original/`.
- Never retime the narration; the video adapts by holding frames. The one exception: the
  builder inserts the 1.5 s section pauses (step 4). Nothing is cut.
- Do not invent screen content. Zoom is a crop of real pixels only.
- Animate the `#screen` wrapper, never the `<video>`. Keep one `<video>` for the
  whole screen track. Mute it; the narration is a sibling `<audio>`.
- Inputs stay in `projects-full/`, with a copy in `video-projects/<name>/original/`
  that the build reads; builds in `video-projects/`; both gitignored.
