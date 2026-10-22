---
name: video-iphone-pc-edit
description: Build one 4K tutorial video that has two parts on one narration: first iPhone screen recordings inside a phone frame on a background, then PC screen recordings full frame with highlight boxes and zoom on data. Parts are switched under an opaque section card. Reads projects-full/<name>/ (audio/, video/ with iPhone and PC recordings, script/), uses overlays-v5. Use for "iPhone then PC", "phone and computer tutorial", "mobile and desktop edit", "/video-iphone-pc-edit", or a script with an iPhone section followed by a PC section. Waits (10-minute cron) while another project is building. Never asks for confirmation at any time of day: after transcription and input analysis it takes open decisions itself, builds to the end, and reports important improvements and gaps; never renders.
---

# iPhone part, then PC part

One video, one narration, two screens in order: **Part 1 = iPhone** (phone frame,
background image), **Part 2 = PC** (full-frame screen, zoom). Output is opaque
**4K (3840x2160)**, 30 fps by default.

This skill is a combination. Do not duplicate their rules; read and apply:

- `.claude/skills/video-iphone-edit/SKILL.md` for everything about the iPhone
  part and for the shared steps (scaffold, probe, transcribe, sync pattern,
  highlights, phone measure, badges, endscreen, verify). Never render: see "No render"
  in the iPhone skill (no draft, no final; the user renders).
- `.claude/skills/video-pc-edit/SKILL.md` for everything about the PC part
  (full-frame screen, 4K size, highlights in 4K pixels, the zoom rules).

Only the differences are listed here. Kit repo:
`/Users/dexter/VS AI Projects/hyperframes-frame/herk-edit-kit`; `cd` there first.

Scripts (all in `.claude/skills/video-iphone-pc-edit/scripts/`):
`MP=measure-phone.mjs`, `BP=build-phone-track.mjs`, `BC=build-pc-track.mjs`,
`T=transcript-lines.mjs`; `H=.claude/skills/highlight-video/scripts/highlight.mjs`.
Templates in `templates/`: `index.html` (starter with phone stack, `#screen`,
switch card, `SWITCH`, `ZOOMS`), `phone-plan.example.json`,
`phone-track.highlight.example.json`, `pc-plan.example.json`,
`pc-track.highlight.example.json`.

## Inputs

`/video-iphone-pc-edit <name>` reads `projects-full/<name>/` (`audio/`,
`video/`, `script/`). Recordings from both devices are in `video/`. Tell them
apart by size: iPhone is portrait (about 1180x2556), PC is landscape 16:9.
If the script does not show where Part 1 ends and Part 2 begins, or a recording
is ambiguous, ask. Never modify these files. Step 1 of the iPhone skill copies
them into `video-projects/<name>/original/` (`node scripts/copy-original.mjs <name>`);
both plans and every later step read the inputs from there
(`original/audio/...`, `original/video/...`). Needs `backgrounds/`,
`placeholder/iphone.png`, and the endscreen files, as in the iPhone skill.

## What differs

00. **Wait for a free machine; no-ask mode.** Step 0 and "No-ask mode" of the
   iPhone skill apply, with `<skill>` = `video-iphone-pc-edit`. The switch point
   and recording order are your decisions too.
0. **Analysis (no stop).** After probe and transcription, follow step 3b of the
   iPhone skill (with the PC extras from the PC skill) for both parts. Also
   choose `SWITCH` and say why. Do not stop or ask; build, then never render.
1. **Two tracks, one clock.** Build both from the same narration, each at full
   narration length (a track holds its first or last frame outside its own part):
   - `phone-plan.json` (iPhone clips, segments before the switch) -> `assets/phone-track.mp4`.
     Build it first with `narration.files`; it writes `assets/narration.wav`.
   - `pc-plan.json` (PC clips, segments after the switch, `"size": [3840, 2160]`).
     Give `narration` only `"output": "assets/narration.wav"` (no `files`) so it
     reuses the built narration length. -> `assets/pc-track.mp4`.
   ```bash
   node $BP video-projects/<name>/phone-plan.json --dry && node $BP video-projects/<name>/phone-plan.json
   node $BC video-projects/<name>/pc-plan.json --dry && node $BC video-projects/<name>/pc-plan.json
   ```
   **Section pauses (user rule 2026-10-17):** every new script section gets 1.5 s
   of silence before its first word, and its full-screen card starts 0.5 s into
   the silence. Follow "Section pauses" in the iPhone skill. Put
   `narration.pauses` only in `phone-plan.json` (it builds the narration);
   `pc-plan.json` has no `files` and must not repeat them. Print the transcript
   with `$T ... --pauses video-projects/<name>/phone-plan.json` and take every
   time in both plans from it. The pause values are in `pauses[]` of
   `assets/phone-track.timeline.json`.
2. **Pick `SWITCH`** (timeline seconds). The move from iPhone to PC (a "Partea 2"
   / "now on PC" sentence) is a new section, so it gets a section pause. Set
   `SWITCH = cardStart + 1.2` for that pause: the switch card then starts at
   `cardStart`, 0.5 s into the silence. It is the only card at that point: no
   separate section card for the first PC section. All iPhone segments end before
   `SWITCH - 1.2`; the first PC segment's window opens at or after
   `SWITCH + 1.2`.
3. **Highlights, twice.** Run `highlight-video` on each track:
   `assets/phone-track.highlight.json` (phone pixels, iPhone conventions) and
   `assets/pc-track.highlight.json` (4K pixels, PC conventions). Outputs
   `phone-track.highlighted.mp4`, `pc-track.highlighted.mp4`. Same timeline clock.
4. **Composition.** Start from `templates/index.html`:
   - `#phone-video` (track 1): `data-start="0"`, `data-duration="SWITCH"`.
   - `#pc-video` (track 7): `data-start="SWITCH"`, `data-media-start="SWITCH"`,
     `data-duration="D - SWITCH"` (D = narration length). The PC track is full
     length, so source time equals timeline time. Not track 6: `#endscreen-video`
     uses track 6 and starts at D - 5, inside the PC clip, and clips on one
     track must not overlap.
   - `#chroma` and the narration run the full D; root `data-duration` = D - 5 +
     endscreen length (endscreen step as in the iPhone skill).
   - **Switch card** `#section-pc` (tier-1, opaque): start at `SWITCH - 1.2`,
     duration 6.0. The template fades its fill in over 0.5 s, sets `#phone`
     opacity 0 and `#screen` opacity 1 exactly at `SWITCH`, and dissolves onto
     the PC screen. The swap is invisible only while the card is fully opaque, so
     keep fade-in done (`SWITCH - 0.7`) and do not change those offsets.
   - **Badges are z-index 3, above tier-1 cards (2).** Phone-part badges must fade
     out before `SWITCH - 1.2` or they stay on top of the switch card. PC-part
     badges start after the card dissolves (`SWITCH + 4.8`).
   - Badge width: phone badges obey the phone `max-width` (from `phone-layout.json`);
     PC badges sit over the screen and may be wider. Use two badge classes or set
     `max-width` per badge.
   - `ZOOMS` is PC part only; the zoom rules are in the PC skill (settled data
     only, zoom out before cards and the endscreen, keep data out of the
     bottom-left badge area). Set `TW`/`TH` from `pc-track.timeline.json`.
   - Hook and agenda: as the iPhone skill (they run before the phone part). The agenda may
     list topics of both parts. After the agenda go straight to the footage; add interludes
     only as described in "Cards vs footage".
   - **On-screen text and effects (overlays-fx):** iPhone skill step 7.11 and
     `style-templates/overlays-v5/fx/README.md` (scaffold: copy
     `style-templates/overlays-v5/fx/overlays-fx.*` into `assets/` and
     `mkdir assets/cards`). The starter sets `FX.screens` to the phone rect until
     `SWITCH`, then full-frame PC, so callout `data-x/y` are phone-track pixels
     before the switch and pc-track pixels after it. No fx element may cross
     `SWITCH - 1.2` to `SWITCH + 4.8` (the switch card).
5. **Verify, extra for this skill.**
   - Every section pause, as in "Section pauses" of the iPhone skill.
   - Snapshots across the switch: `SWITCH-1.5` to `SWITCH+5.5` (at 0.5 s steps,
     plus `SWITCH-0.2`, `SWITCH`, `SWITCH+0.2`). The card must be fully opaque at the swap; no phone or PC
     flash, no black frame, no badge on the card.
   - Sample both tracks at their first spoken step, and the PC track at the first
     frame after the card dissolves (right screen, `scale` 1, no zoom offset).
   - Everything else from both skills: preflight, lint, `check`, snapshot hero
     frames, rounded corners (phone), zoom frames (PC), endscreen join, and every
     overlays-fx element fully in and just before its end.
6. **No render.** Do not run `hyperframes render` at all: no draft, no Full HD
   copy, no 4K final, no `render-video`. Follow "No render" in the iPhone skill:
   check with lint, `check` and `hyperframes snapshot --describe false`, write
   `VERIFY.md`, then hand over the render command. The user renders and reviews.

## Cards vs footage (visual rhythm)

The blue full-screen card (tier-1) is NOT the default picture. Footage is.

- **Full-screen cards, only these:** the hook (intro), the agenda ("what you will learn"),
  the section card at each new script section (it starts 0.5 s into the 1.5 s section pause;
  see step 1), the switch card between the iPhone and PC parts (short, also on a section
  pause), and the closing recap / call to action. Nothing else gets a long card.
- **Everything between them shows the footage:** the phone (home screen or the last screen,
  held) in Part 1, the PC screen (last screen, held) in Part 2, with the bottom-left badges
  carrying the text. This holds even for a long explanation that has no matching recording
  (for example 100 s about how a feature works): keep the held phone or PC on screen and use
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

## Report

Background and endscreen used, `SWITCH` and why, both segment tables, zoom list,
the snapshot sheets checked, every guessed timing, and the render command ready to run.
Do not upload or publish. Release the build lock. End with
**Important improvements and gaps**.

## Rules

- After `highlight.mjs render`, re-encode each highlighted video with a 1 s GOP,
  or HyperFrames warns "sparse keyframes (max interval 8.33s)" and can freeze frames
  while seeking: `ffmpeg -i X.highlighted.mp4 -c:v libx264 -crf 14 -preset veryfast -r 30 -g 30 -keyint_min 30 -pix_fmt yuv420p -movflags +faststart -an X.reenc.mp4`,
  then replace the file. Do this for every highlighted track before lint/check/snapshot.
- Never modify recordings, narration, backgrounds or placeholder; never retime narration.
  The one exception: the builder inserts the 1.5 s section pauses (step 1). Nothing is cut.
- Do not invent screen content; zoom crops real pixels only.
- One `<video>` per track (two in total). Animate the `#phone` and `#screen`
  wrappers, never a video. Videos stay muted; the narration is a sibling `<audio>`.
- Inputs stay in `projects-full/<name>/`, with a copy in
  `video-projects/<name>/original/` that the build reads; builds in
  `video-projects/<name>/`. Never modify `original/`.
