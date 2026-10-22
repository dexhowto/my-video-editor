---
name: video-iphone-edit
description: Build a 4K iPhone tutorial video from projects-full/<name>/ (audio/ narration files, video/ iPhone screen recordings, script/ script), using the overlays-v5 template. The recording plays inside an iPhone placeholder frame with rounded screen corners, on a background image from backgrounds/. Each step gets a red highlight box (highlight-video), and the phone video is synced to the narration by holding frames before, during, or after a clip when the explanation runs longer than the footage. Use for "iPhone tutorial", "mobile edit", "phone mockup video", "/video-iphone-edit", or a request to put iPhone recordings in a phone frame with narration. Waits (10-minute cron) while another project is building. Never asks for confirmation at any time of day: after transcription and input analysis it takes open decisions itself, builds to the end, and reports important improvements and gaps; never renders.
---

# iPhone mobile edit

Produces a finished, opaque 4K video in the style of `examples/demo_iphone.mp4`:

- Background: one image from `backgrounds/` (repo root), full frame.
- Center: the iPhone placeholder `placeholder/iphone.png`, a full 4K frame with
  the phone already placed (same position and size as the reference). The
  recording is fitted to the placeholder's screen with rounded corners, and the
  placeholder PNG is layered ON TOP of the recording, full frame and unscaled,
  so the bezel and frame edges cover the video edges. Layer order, bottom to
  top: background, recording (with highlights), `iphone.png`, tier-1 cards,
  badges.
- Red highlight box plus spotlight dim on the target of each step, inside the
  phone screen only (from the `highlight-video` skill).
- overlays-v5 graphics on top: hook intro, agenda, section titles (tier-1,
  opaque, full screen) and bottom-left step badges (tier-2).
- Narration audio drives the timeline. The phone video waits for the
  narration: it holds the first frame before a step, freezes mid-clip while the
  narrator explains, and holds the last frame after the clip.

**Working directory.** Every path in this skill is relative to the kit repo
`/Users/dexter/VS AI Projects/hyperframes-frame/herk-edit-kit`. The skill is also linked
at user level (`~/.claude/skills/video-iphone-edit` points to this
folder), so it can be invoked from any conversation. If the current directory
is not the kit repo, `cd` there first and run every command from it.

Read the template's `style-templates/overlays-v5/DESIGN.md` first. Everything
there applies, except the "transparent output" rule: this skill builds an
opaque video because the background and phone are inside the composition.

Scripts (Node + ffmpeg, no API calls):
`M=.claude/skills/video-iphone-edit/scripts/measure-phone.mjs`,
`B=.claude/skills/video-iphone-edit/scripts/build-phone-track.mjs`,
`T=.claude/skills/video-iphone-edit/scripts/transcript-lines.mjs`,
`H=.claude/skills/highlight-video/scripts/highlight.mjs`.

Templates in `.claude/skills/video-iphone-edit/templates/`:
- `index.html`: the starter composition. It is overlays-v5 with every fix from
  the first real build (demo-project) already applied. Start from this, not from
  the plain overlays-v5 `index.html`.
- `phone-plan.example.json`: a real sync plan (one recording, 7 segments,
  freeze on every tap).
- `phone-track.highlight.example.json`: real highlight steps for the same video.

Read the "Worked example" section at the end before planning a new video.

## Inputs

The user calls `/video-iphone-edit <name>`. All per-video data comes
from `projects-full/<name>/` at the repo root:

```
projects-full/<name>/
  audio/    narration files (.wav/.mp3/.m4a), already edited
  video/    iPhone screen recordings (.MP4/.MOV), raw
  script/   the script (.md/.txt/.docx/.pdf)
```

If the folder or one of the three subfolders is missing or empty, list what
exists and ask. Exception: if `script/` is missing but the user pasted the
script in chat, use that and save it to `video-projects/<name>/source/script.md`
(never write into `projects-full/`). Never invent steps or audio order. Read these files in place:
never move, rename, re-encode or edit anything in `projects-full/`.

**Copy to `original/` (user rule 2026-10-21).** Step 1 copies the inputs
(narration, recordings, script files, transcripts) from `projects-full/<name>/`
into `video-projects/<name>/original/`, with the same folder layout, using
`node scripts/copy-original.mjs <name>`. From then on every step reads the
inputs from `video-projects/<name>/original/` (`original/audio/`,
`original/video/`, `original/script/`, `original/script.md`), so the build
project holds everything it needs. `original/` is a read-only copy: never edit,
re-encode or rename files in it. The locations below are where the user puts
the inputs.

| Input | Location | Notes |
| --- | --- | --- |
| Script | `projects-full/<name>/script/`, else `projects-full/<name>/script.md` (written by `video-process-script` Finalize) | Steps, section names, badge text. If there are several files, ask which is current. Read `.docx` with `textutil -convert txt -stdout <file>`; read `.pdf` with the Read tool. |
| Narration | `projects-full/<name>/audio/` | Played in natural filename order (`1, 2, ... 10`). Never re-trim. One file per step is common; match files to script steps and confirm the order with the user when names do not make it obvious. |
| Recordings | `projects-full/<name>/video/` | Raw. Match each recording to the script steps it shows by contact sheet. |
| Backgrounds | `backgrounds/*.png` at the repo root | 3840x2160 PNG. Every new project gets a RANDOM one (see step 1), unless the user names one. |
| Placeholder | `placeholder/iphone.png` at the repo root | 3840x2160 PNG, transparent outside the phone and in the screen. Use this one. |
| Placeholder (alt) | `placeholder/iphone-green.png` | Same phone with a green screen and green surround. Use only if asked; `iphone-green.af` is the design source, not an input. |
| Endscreen | `endscreen/end-romana.mp4`, `endscreen/end-english.mp4` | 3840x2160, 60 fps, 15.93 s, opaque, with its own audio. Picked by script language (step 7b). |
| Reference | `examples/demo_iphone.mp4` | The target look. Compare your snapshots against it. |

If `backgrounds/` or `placeholder/iphone.png` is missing, stop and ask for it.

Background contact sheet, only if the user asks to see or choose one
(numbered left to right, top to bottom):

```bash
ffmpeg -v error -y -start_number 1 -i backgrounds/%d.png -vf "scale=384:-1,tile=5x3" -frames:v 1 <scratchpad>/backgrounds.png
```

## Project layout

The build lives in `video-projects/<name>/` (same name as the input folder).
HyperFrames only serves files from inside its project, so the background,
placeholder and every built media file go into the build's `assets/`. The raw
audio and video are copied to `original/` (step 1); the plan file reads them
there through relative paths (`original/audio/...`, `original/video/...`).

```
projects-full/<name>/           # inputs as the user delivered them, read only
  audio/  video/  script/
video-projects/<name>/          # build
  original/                     # copy of projects-full/<name>/ (step 1), read only
    audio/  video/  script/  script.md  audio-parts/*.json
    transcript.kit.json         # copy of source/transcript.kit.json (step 3)
  assets/background.png         # random image from backgrounds/ (step 1)
  source/background.txt         # which backgrounds/ file was picked
  assets/iphone.png             # copy of placeholder/iphone.png
  assets/narration.wav          # built by build-phone-track.mjs
  assets/phone-track.mp4        # built by build-phone-track.mjs
  assets/phone-track.timeline.json
  assets/phone-track.highlight.json
  assets/phone-track.highlighted.mp4   # the video the composition plays
  assets/endscreen.mp4          # copy of the language's endscreen/ file (step 7b)
  assets/endscreen.m4a          # its audio, extracted (step 7b)
  phone-plan.json
  phone-layout.json
  index.html  DESIGN.md  meta.json  VERIFY.md  qa/  renders/
```

The raw files in `original/` feed the track builders only: the built
`narration.wav` and `phone-track*.mp4` are the only media the composition uses.
`copy-original.mjs` clones the files on APFS, so the copy uses no extra disk.

## Workflow

Run commands from the repo root unless the step says otherwise.

### 0. Wait for a free machine (user rule 2026-10-13)

Only one project builds at a time. Before step 1, take the build lock:

```bash
node scripts/video-busy.mjs --lock <name> --skill <skill>
```

`<skill>` is the skill that runs (`video-iphone-edit`, `video-pc-edit` or
`video-iphone-pc-edit`). The script reports busy (exit 2) while another `/video-*`
build holds `.video-build.lock`. A running video render does not count; the
build may run next to it. A lock without a heartbeat for 4 hours is stale and is replaced.

- **Exit 0 (free):** the lock is yours. Continue with step 1. Refresh it at the
  start of every later step: `node scripts/video-busy.mjs --touch <name>`.
- **Exit 2 (busy):** do not start. Tell the user what is running (the reasons
  the script printed). Create a recurring session cron job with `CronCreate`,
  cron `3,13,23,33,43,53 * * * *` (every 10 minutes), with this prompt:

  > Wait check for /`<skill>` `<name>`: run `node scripts/video-busy.mjs --lock <name> --skill <skill>`.
  > Exit 2: reply in one line that the build still waits and why; do nothing else.
  > Exit 0: find this job with `CronList` (the prompt that starts with
  > "Wait check for /`<skill>` `<name>`"), delete it with `CronDelete`, then run
  > /`<skill>` `<name>` from step 1. The lock is already held. No-ask mode: do
  > not ask for confirmation, build to the end.

  If the user gave decisions in this message, put them in the prompt too.
  Request keep-awake (`mcp__ccd_host__request_keep_awake`) when the tool exists,
  so the Mac does not sleep during the wait. Tell the user: the job lives only in
  this session (keep it open), fires only while the session is idle, and expires
  after 7 days. Then stop.

Release the lock with `node scripts/video-busy.mjs --unlock <name>` when the run
stops: at the final report, and when a blocker stops the build.

### No-ask mode (always, user rule 2026-10-21)

The user sending the build command is the approval. Never ask for confirmation
and never stop at the step 3b gate, at any time of day (this replaces the old
00:00-06:59 night mode). The only wait is step 0 (another build holds the lock).
At every point where this skill would ask or stop for the user (the step 3b
analysis, an ambiguous input, a missing decision):

- Do not ask anything and do not stop. Still write `ANALYSIS.md` (step 3b),
  then take every decision yourself: pick what best serves the video (most likely
  recording order, part switch, background, workarounds for input problems).
  Write each decision and the reason in an `## Decisions taken` section of
  `ANALYSIS.md`, and continue with step 4.
- All other rules stay: never render, never modify inputs, no paid services,
  no uploads. Work around input problems where the build can (holds, badges,
  interludes); leave the rest for the user.
- Stop only for a real blocker (no narration, no recordings, a tool that keeps
  failing). Write the reason to `ANALYSIS.md`, release the lock, and report.
- In the final report, after the normal content, add **Important improvements
  and gaps**: only the big items. Examples: input problems that only the user can fix
  (re-record a file, a level gap between narration files, a missing step in the
  footage), decisions taken that change the video and that the user may
  want different, and checks that still need a human. Leave out small nits. If
  nothing important is open, say so in one line.

### 1. Scaffold

```bash
npm run new-video -- <name>
cp .claude/skills/video-iphone-edit/templates/index.html video-projects/<name>/
cp style-templates/overlays-v5/DESIGN.md video-projects/<name>/
cp placeholder/iphone.png video-projects/<name>/assets/iphone.png
mkdir -p video-projects/<name>/source video-projects/<name>/qa video-projects/<name>/assets/cards
cp style-templates/overlays-v5/fx/overlays-fx.css style-templates/overlays-v5/fx/overlays-fx.js video-projects/<name>/assets/
node scripts/copy-original.mjs <name>
```

`new-video` already copies `assets/gsap.min.js`; the starter loads GSAP from
there, then `assets/overlays-fx.css` and `assets/overlays-fx.js` (the effects kit,
step 7.11). Copy the kit again when continuing an older build, so it gets the
current version.

`copy-original.mjs` copies `projects-full/<name>/` into `original/`: every
file in `audio/`, `video/` and `script/`, the script files (`script.md`,
`original/script.md`, `commands.md`, `audio-script.md`), the JSON files of
`audio-parts/` (task-4 transcript and manifest), and
`source/transcript.kit.json` as `original/transcript.kit.json`. It skips
`youtube/`, logs, dotfiles and the cached WAV paragraphs. It never deletes: a
file that is gone from `projects-full/` is printed as `stale` and kept. Report
stale files in `ANALYSIS.md`. When continuing an earlier build, run it again
first: it copies only new or changed inputs. If `projects-full/<name>/` no
longer exists, it keeps `original/` and the build continues from it.

**Background: random for every new project.** Unless the user names one, pick
a random image from `backgrounds/`. Exclude the one used by the most recent
other project, so two videos in a row never share a background. Record the
pick in `source/background.txt`:

```bash
P=video-projects/<name>
LAST=$(ls -t video-projects/*/source/background.txt 2>/dev/null | grep -v "^$P/" | head -1 | xargs cat 2>/dev/null)
BG=$(ls backgrounds/*.png | grep -vx "${LAST:-none}" | sort -R | head -1)
cp "$BG" $P/assets/background.png && echo "$BG" > $P/source/background.txt && echo "background: $BG"
```

Run this only when `source/background.txt` does not exist. When continuing an
earlier build, keep its background; re-randomize only if the user asks.
Say which background was picked in the final report. If the user names a
background, copy that file and record it the same way.

If `video-projects/<name>/` already exists, it is an earlier build of this
video: continue it, do not recreate it.

Set `fps` in `meta.json`. Default 30. Use 60 only if the user asks (the
reference is 60 fps, but render time doubles). `phone-plan.json` `fps` must
match `meta.json`.

### 2. Probe and look at the inputs

- List `audio/`, `video/` and `script/`, and read the script.
- `ffprobe` every narration file (duration) and recording (size, fps, duration).
- Make a contact sheet of each recording to learn where every step happens:
  ```bash
  ffmpeg -v error -y -i video-projects/<name>/original/video/<clip> -vf "fps=2,scale=180:-1,tile=10x4" -frames:v 1 <scratchpad>/sheet-<clip>.png
  ```
  This ffmpeg build has no `drawtext`, so tiles carry no timestamps. Tile `i`
  (0-based, left to right, top to bottom) is at `ss + i / fps`. Then pin each
  tap with a dense sheet at 0.2 s per tile:
  ```bash
  ffmpeg -v error -y -ss 1.5 -t 8 -i <clip> -vf "fps=5,scale=150:-1,tile=10x4" -frames:v 1 <scratchpad>/dense.png
  ```
  For every tap, write down two source times: `dot` (the touch dot reaches
  the target) and `open` (the next screen starts to appear). These two numbers
  drive both the sync plan and the highlights.
- iPhone recordings are HEVC with a variable frame rate (for example
  `723600/12041`), 1180x2556, and carry their own audio track. The builder
  normalizes the fps and ignores that audio; only the narration is heard.
- Read the script and list the steps. Map each step to its narration span and
  to the part of a recording that shows it.

### 3. Transcribe the narration

Word timestamps are the source of every badge and highlight time. Follow the
root guide (`docs/TOOLS-AND-API-KEYS.md`, the user's provider choice). Reuse an
existing transcript. This student's default is local MacWhisper. With a single
narration file, transcribe it directly (its offset is 0):

```bash
python3 scripts/mw-transcribe.py video-projects/<name>/original/audio/<file> \
  --output video-projects/<name>/source/transcript.kit.json
node $T video-projects/<name>/source/transcript.kit.json --words-from <s>
node scripts/copy-original.mjs <name>     # saves the transcript in original/ too
```

`transcript-lines.mjs` prints timed sentences (to map the structure: hook,
agenda, sections, steps) and, with `--words-from`, every word's start time (to
anchor beats). With several narration files, transcribe each and pass
`--offset <file start>` from `phone-track.timeline.json`, or build first and
transcribe `assets/narration.wav`. Compare the transcript with the script: MacWhisper
merges or splits some words (for example "foto partajat" became
"fotopartajat"), so search for word stems.

### 3b. Analyze the inputs (no stop, user rules 2026-10-10 and 2026-10-21)

After transcription and the probe, and BEFORE any build step (plan, track,
highlights, composition), analyze the inputs. Do not stop and do not ask for
confirmation (see "No-ask mode"): write the analysis, take the decisions, and
continue with step 4. If the user later changes inputs (a new narration file,
a new recording, a fixed script), probe and transcribe the changed files again
and repeat this analysis.

**Audio checks** (run on every narration file; nothing is changed):

```bash
F=video-projects/<name>/original/audio/<file>
ffprobe -v error -show_entries stream=codec_name,sample_rate,channels -of csv=p=0 "$F"
ffmpeg -nostats -i "$F" -af ebur128=peak=true -f null - 2>&1 | tail -12      # loudness (LUFS), true peak
ffmpeg -nostats -i "$F" -af volumedetect -f null - 2>&1 | grep -E "mean|max"  # max_volume near 0 dB = clipping risk
ffmpeg -nostats -i "$F" -af silencedetect=noise=-45dB:d=1.5 -f null - 2>&1 | grep silence_
```

Report: integrated loudness per file (target about -16 LUFS; a difference above
3 LU between files is audible), true peak above -1 dBTP (clipping), long silences
inside a file (over 1.5 s), leading/trailing silence, and sample rate or channel
differences between files. Say which checks still need a human ear
(background noise, mouth clicks, breaths). The build normalizes the joined
narration to -16 LUFS, so a low or high overall level needs no fix; a level gap
between files still does.

**Script vs transcript:** sentences in the script that were not spoken, spoken
sentences not in the script, words that MacWhisper heard wrong (likely a slip or
mispronunciation), repeated or restarted sentences, and the narration file order.

**Video checks:** size, fps, duration and orientation of every recording (from
step 2). Steps in the script that have no footage, recordings that no step uses,
recordings much shorter than their narration (long holds or freezes needed),
mis-taps or wrong screens, and recordings below the expected size (PC: below
3840x2160 softens the zoom). Do not suggest masking personal data (user rule).

**Pacing:** total narration length, words per minute per section, the hook
length, and long spans with no matching footage (they will need held frames,
badges and interludes).

**Plan preview:** the background picked, fps, the planned number of segments,
highlights, cards and interludes (PC: zooms; combined skill: `SWITCH`), and the
new sections found in the script with their pause points ("Section pauses").

Write the result to `video-projects/<name>/ANALYSIS.md` in three groups (the
user reads them in the final report):

1. **OK:** what needs no change.
2. **Can improve:** each item with the problem, where (file and time), and the
   fix the user can do (re-record file 3, re-record the tap at 0:12, fix the
   script line). Say which items the build can work around and
   which only the user can fix.
3. **Decisions taken:** what you decided for open questions (ambiguous order,
   part switch, which recording a step uses) and why.

Keep the lock and run steps 4 onward without stopping, and never render: no
draft render, no final render (see "No render" below).

### 4. Plan the sync (`phone-plan.json`)

The plan maps recording segments onto the narration timeline. Paths are
relative to the plan file (`video-projects/<name>/phone-plan.json`), so inputs
start with `original/`. List `narration.files` in natural
filename order of `audio/`. Add `narration.pauses` first, one per new section
("Section pauses"). Every `start` in the plan is then on the paused timeline.

```json
{
  "fps": 30,
  "narration": { "files": ["original/audio/01.wav",
                           "original/audio/02.wav"],
                 "gap": 0.0, "output": "assets/narration.wav" },
  "output": "assets/phone-track.mp4",
  "segments": [
    { "label": "Pasul 1 - Configurări", "clip": "original/video/rec1.MP4",
      "in": 0.0, "out": 14.2, "audio": 2, "lead": 1.0,
      "freezes": [ { "at": 6.3, "dur": 4.0 } ] },
    { "label": "Pasul 2 - Albume", "clip": "original/video/rec2.MP4",
      "start": 61.4, "lead": "end" }
  ]
}
```

How a segment is placed:

- **Window.** A segment's window opens at `start` (timeline seconds) or at the
  start of narration file `audio` (1-based), plus `offset`. The window closes
  where the next segment's window opens; the last one runs to the end.
- **Before the first window** the first segment's first frame holds.
- **Inside the window:** first-frame hold for `lead` seconds, then playback of
  `in`-`out` with `freezes`, then the last frame holds until the window closes.
- **Short video, long audio** (the narrator explains): add `freezes` at the
  source second where the screen should wait, and/or let the tail hold. Put
  the freeze on a settled screen, never mid-animation or mid-scroll.
- **Video needs a moment before the action:** `lead` holds the first frame.
  `"lead": "end"` right-aligns playback so the action finishes exactly as the
  narration moves on.
- **Video longer than the narration:** trim `in`/`out` to the useful part
  (cut dead time at the start and end), shorten freezes, or use
  `"speed"` up to 1.5. If it still does not fit, move the next window later and
  tell the user the narration needs a pause there. Never speed up past 1.5.
- **One recording, many steps:** use several segments with the same `clip`
  and consecutive `in`/`out` ranges.
- Recordings of different sizes are fitted into the first clip's size (or
  `"size": [w, h]`) with black padding. Prefer recordings from the same phone.
- Tier-1 cards (hook, agenda, section titles) are opaque and cover the phone.
  Do not start playback under them: open the window, or set `lead`, so the
  action starts after the card's `dissolveOut` finishes.

Sync rule: the tap or screen change that the narrator describes appears on
screen when the narrator says it, or up to about 0.5 s before. It must never lag
the words.

**Recommended pattern: one segment per tap, frozen on the target.** Screen
recordings move fast (a tap every 1-2 s) while narration takes 3-5 s per step,
and a highlight needs about 2 s (fade in, hold, fade out) before the screen
changes. So for each tap:

1. Find, at 0.2 s precision, when the touch dot reaches the target (`dot`) and
   when the next screen appears (`open`).
2. Make one segment per screen: `in` = previous segment's `out` (just after the
   previous screen opened), `out` = just after this tap's `open`.
3. Add a freeze at `dot + 0.1` (dot on the target, screen still) and set
   `start` so that freeze lands ~0.1 s after the narrator starts the step
   (`start = word + 0.1 - (freeze.at - in)`).
4. Size the freeze so `open` lands just after the narrator names the target:
   `freeze.dur = target time - (start + (open - in))`.
5. Put the highlight on the freeze: `start` = freeze start, fades 0.5/0.4 s,
   `hold` so the fade-out ends before `open`.
6. Cut idle source time (the user waiting before a scroll) by ending one
   segment and starting the next later in the same clip; on a static screen the
   cut is invisible.

Use the dry run to check each segment ends before the next window opens
(`hold 0s` or more on every line). Then sample the built track at each step's
spoken word and confirm the right screen is showing.

Dry run, fix every reported overflow, then build:

```bash
node $B video-projects/<name>/phone-plan.json --dry
node $B video-projects/<name>/phone-plan.json
```

The build writes `assets/narration.wav` (joined, then two-pass loudness
normalized to -16 LUFS with true peak -1.5 dBFS; set `"loudnorm"` in
`narration` to another LUFS target, or `false` to keep the source level),
`assets/phone-track.mp4` (H.264,
constant fps, no audio, length = narration) and
`assets/phone-track.timeline.json` (narration offsets and resolved windows). It
fails if the frame count differs from the narration length.

### 5. Highlight the steps (`highlight-video`)


Load the `highlight-video` skill and follow its steps 3-8, with these changes:

- Run it on `assets/phone-track.mp4`, not on the raw recordings. Step times are
  then timeline seconds, the same clock as the narration and the badges.
- Plan file: `assets/phone-track.highlight.json` with
  `"video": "phone-track.mp4"` and `"output": "phone-track.highlighted.mp4"`.
- Box coordinates are in phone-track pixels (`size` in the timeline JSON).
- One highlight per step target. `start` = when the narrator names the target
  (word timestamp + 0.2 s), or when the touch dot arrives, whichever is first.
- During a freeze the screen does not change, so the highlight may hold for the
  whole explanation. The fade-out must still finish before the screen changes.
- Use the skill's `grid` and `preview` commands and read every PNG.
- Grid labels are source pixels. The PNG is shown scaled down (for
  1180x2556 it shows at 923x2000, factor 1.28), so read edges against the labels.
- Box conventions that matched the reference on a 1180 px wide recording:
  a list row or card spans x 49 to 1133 (`[49, y, 1084, h]`), and the box
  covers the row from its top edge to its separator line. An app icon box
  includes the label under it (`[76, 525, 210, 275]` for a home-screen icon,
  `radius 44`). A tile in a grid covers just that tile.
- Style that read well at this phone size: `border 8`, `radius 30`,
  `fadeIn 0.5`, `fadeOut 0.4`. Short fades are needed because each highlight
  sits inside a 1-2 s freeze. On a long static screen (the final toggle),
  use `fadeIn 0.8`, `fadeOut 0.9` and a long `hold`.
- Run `preview`, then tile all step PNGs into one image to check them together:
  `ffmpeg -pattern_type glob -i "<dir>/*.png" -vf "scale=300:-1,tile=8x1" ...`.

```bash
node $H grid video-projects/<name>/assets/phone-track.mp4 <time> --out <scratchpad>/grid.png
node $H preview video-projects/<name>/assets/phone-track.highlight.json
node $H render  video-projects/<name>/assets/phone-track.highlight.json
```

If the user asks for no highlights, play `phone-track.mp4` directly.

### 6. Measure the placeholder

```bash
node $M video-projects/<name>/assets/iphone.png --out video-projects/<name>/phone-layout.json
```

It prints the video rectangle, the corner radius and ready CSS for the phone
stack. A 16:9 placeholder (the supplied `iphone.png`) is used full frame:
`.phone` covers the whole canvas and the PNG goes on top unscaled. For a
cropped phone-only PNG, the script instead scales it to `--height 1040`,
centered at `--cx 960`, `--top 20`.

The video rectangle is the screen hole plus a 3 px bleed under the bezel, with
the largest corner radius that leaves no see-through pixel uncovered. iPhone
corners are continuous curves, not circles, so do not hand-tune the radius:
a larger one shows background slivers in the corners, which is the bug this
fit prevents. Supplied `iphone.png` gives `left:724px; top:43px;
width:465.5px; height:997px; border-radius:68.5px` (1080p px).

Mode `hole` (transparent screen): the frame PNG sits above the video. Mode
`solid` (green screen): the video sits above the frame, clipped by the radius.
If the screen aspect (`screenAspect`) differs from the recording's, the video
uses `object-fit:cover`; check that the status bar and the bottom bar are not
cropped too much.

### 7. Build the composition (`index.html`)

Starting from the overlays-v5 template:

1. `#chroma` and `#phone-video` `data-duration` = `duration` (D) from the timeline JSON. Root `data-duration` = D - 5 + endscreen length (step 7b).
2. Narration, as a sibling of `#canvas` inside `#root`, before `#canvas`:
   ```html
   <audio id="narration" data-start="0" data-duration="<D>" data-track-index="4" src="assets/narration.wav"></audio>
   ```
3. Background on the base layer. Add to the CSS:
   `#chroma{background:#000 url(assets/background.png) center/cover no-repeat}`.
   Keep the rest of the template's transparent rules; the output is opaque
   because `#chroma` is.
4. Phone stack, directly after `#chroma`, with the CSS that `measure-phone.mjs`
   printed:
   ```html
   <div class="phone" id="phone">
     <div class="phone-screen">
       <video id="phone-video" data-start="0" data-duration="<D>" data-track-index="1"
              src="assets/phone-track.highlighted.mp4" muted playsinline></video>
     </div>
     <img class="phone-frame" src="assets/iphone.png" alt="">
   </div>
   ```
   `.phone` and `.phone-screen` are non-timed wrappers. Animate the wrapper, never
   the video. Stacking: `#chroma` < `.phone` (z-index 0) < callouts and the zoom
   vignette (1) < `.takeover` (2) < `.badge`, command chips, checklists (3) <
   on-screen statements (4) < endscreen (5). Track 1 is the phone video only; track 4 the narration.
5. Badges must not cover the screen. Set
   `.badge{max-width:<screenOnCanvas.left - 64 + 12>px}` from
   `phone-layout.json`. With the supplied placeholder this is 672 px, so
   `.badge-sub` holds about 28 characters (two lines wrap; avoid that).
   Shorten the copy; do not shrink the font below the template's sizes.
6. Replace all demo copy and timestamps with the script, following DESIGN.md:
   hook intro (optional), agenda for the topics the intro previews, a section
   title per section (it starts at the pause's `cardStart`, "Section pauses"),
   and one badge per step for the rest of the runtime. Badge
   style from the reference: title = video name in mono + `.idx` chip with the
   section name; `.badge-sub` = `<span class="hl">Pasul N:</span> action`;
   `badgeDetails()` lines for the specifics the narrator names; `.pips` for
   progress through the section.
7. Agenda with 4 topics: set `.ag-box{flex:0 0 390px;padding:40px 28px}`.
   The template's 480 px boxes wrap 3+1 inside the stage's 1680 px and push
   the title off the top of the frame.
8. Back-to-back tier-1 cards (hook → agenda → section title): `dissolveOut()`
   fades the opaque fill, which here reveals the phone for ~0.45 s between two
   cards. For a card followed immediately by another card, fade only its
   content and hard-kill the fill at the boundary:
   ```js
   function handoffOut(id, stage, start, dur){
     tl.to(id+' '+stage, {opacity:0, filter:'blur(8px)', duration:.45, ease:'power2.in'}, start+dur-.45);
     tl.set(id+' .inner', {opacity:0}, start+dur);
   }
   handoffOut('#hook-intro', '.hook-stage', 0, 17.9);
   ```
   Keep `dissolveOut()` on the last card before the phone shows (the section
   title), so the card dissolves onto the phone.
9. Load GSAP from `assets/gsap.min.js` (copied by `new-video`), not the CDN.
10. Rewrite the anchor table comment with real transcript anchors. Badge starts
   follow the step's first word (+0.2 s). Badges and highlights describe the
   same step at the same time.
11. **On-screen text and effects (overlays-fx, user rule 2026-10-21).** Write
   text on the screen where it matters, and give the cards real images. Spec,
   markup and limits: `style-templates/overlays-v5/fx/README.md` (read it before
   this step). Plan these beats with the badges, from the transcript:
   - **Command chip** (`fxCmd`, track 9): every command, URL, path, search term
     or exact text the viewer must type or tap in, exactly as typed. From the
     word (+0.1 s) to the end of the typing on screen (+1 s); `data-ok` when the
     result appears.
   - **Callout** (`fxCallout`, track 7): pin + line + glass note on a value or
     result that is easy to miss (a new list entry, the result line, a warning in
     the output). 2.5-6 s, 0.3-0.6 s after the highlight on the same target. About
     1 per minute, 2 at most. Not for every tap: the highlight box does that.
     `data-x/y` in track pixels; `FX.screens` in the starter maps them (iPhone:
     the `.phone-screen` rect from `phone-layout.json`, phone-track size).
   - **On-screen statement** (`fxTitle`, track 8): the footage blurs and a 2-6
     word statement rises, with a marker sweep under the key word. For warnings,
     rules and takeaways tied to the moment on screen ("Never in Program Files",
     "No issues found!"). 3.5-6 s, about 1 per 60-90 s; it counts as an interlude
     for spacing (12 s from any interlude or other statement).
   - **Checklist** (`fxCheck`, track 10): when the narrator lists 3-6
     requirements or recaps the steps, a glass panel on the right ticks each item
     at its word. Best over held footage.
   - **Section cards** (`fxSection`): every section card gets the outlined
     numeral (`.st-num`) and, when the section has footage, a screenshot of it
     (`.st-media` + `has-media`): one real frame from the built track
     (`assets/cards/<card-id>.jpg`, command in the README). A card that starts
     over footage enters with the light-beam wipe; behind another card use
     `{afterCard:true}`.
   - **Backdrop image** (`.bg-shot` + `fxDrift`): a dim real frame behind the hook,
     agenda, interludes and closing card (the hook and closing show the final result).
   - **Interludes:** count-up numbers (`fxCount`) and a marker sweep (`fxMark`) on
     the key word.
   Never stack two text elements on the same spot, never cover the data the
   narrator reads out, and never put fx text under a tier-1 card.

### 7b. Endscreen (always)

An opaque endscreen video covers the whole frame at the end. It starts
**5 s before the narration ends** and plays to its own end, so the video is
longer than the narration by `endscreen length - 5` (10.93 s with the supplied
files).

1. Pick the file by the language of the script (narration language when the
   script is missing): Romanian (diacritics ăâîșț, Romanian words) uses
   `endscreen/end-romana.mp4`; English uses `endscreen/end-english.mp4`. Any
   other or mixed language: ask the user. Say which file was used in the report.
2. Copy the video and extract its audio (the video element stays muted):
   ```bash
   P=video-projects/<name>; E=endscreen/end-romana.mp4   # or end-english.mp4
   cp $E $P/assets/endscreen.mp4
   ffmpeg -v error -y -i $E -vn -c:a copy $P/assets/endscreen.m4a
   ffprobe -v error -show_entries format=duration -of csv=p=0 $E   # EL
   ```
3. In `index.html` (the starter already has the block; replace its numbers):
   `ES = D - 5` where D is the narration duration. Set `#endscreen-video` and
   `#endscreen-audio` `data-start=ES`, `data-duration=EL`; the fade-in `tl.to`
   at `ES`; root `data-duration = ES + EL`. `#chroma`, `#phone-video` and
   `#narration` keep `data-duration = D`. The narration therefore overlaps the
   endscreen audio for the last 5 s; if the mix sounds crowded, lower the
   endscreen audio volume (`data-volume`) for those 5 s and tell the user.
4. Badges and tier-1 cards end before ES, or are covered by the endscreen
   (z-index 5 is above the badges). The endscreen is 60 fps in a 30 fps
   composition: that is fine.
5. Verify: frames at ES-0.5, ES, ES+0.4, ES+5 and the last frame; the endscreen
   fully covers the phone, no black flash at ES, endscreen audio joins cleanly.

### 8. Verify (no render)

Keep `data-start="0"` on `#root`. `scripts/preflight.mjs` reports
`root_data_start_conflicts_with_video` for the inline phone video, but removing
it makes HyperFrames lint fail (`root_composition_missing_data_start`), and the
inline video renders correctly with it (confirmed on demo-project). Record
this known conflict in VERIFY.md; it is not a blocker for this skill.

Follow "No render" below. iPhone snapshot checks:

- Every segment boundary and every freeze start/end (t-0.2, t, t+0.2): no jump
  back, no black frame where a hold meets playback.
- Every section pause, as in "Section pauses".
- Each highlight at full strength: inside the screen, on the right target,
  gone before the screen changes.
- Rounded corners: `--zoom` on the four screen corners (for example
  `--zoom 690,30,250,200` in 1080p canvas pixels). No background sliver between the
  video and the bezel, no video outside the bezel.
- Badges never cover the phone screen; tier-1 cards cover the phone fully.
- Every overlays-fx element (step 7.11) fully in (start + 0.8 s) and just before
  its end: text readable, not cut at the frame edge, not on a badge, not hiding
  the data it explains; callout pins on their targets; each section card at
  start + 0.35 (beam) and + 2.5 (screenshot settled).
- Compare one frame side by side with `examples/demo_iphone.mp4` (phone size,
  position, badge position).

Save snapshots under `qa/` and the findings in `VERIFY.md`. Report the background
used, the endscreen file used, the segment table (window, lead, freezes, tail),
every timing you had to guess, and the render command. Do not upload or publish.
Release the build lock (`node scripts/video-busy.mjs --unlock <name>`). End the
report with **Important improvements and gaps** ("No-ask mode").

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
5. Report and stop. Give the command the user can run:
   ```bash
   cd video-projects/<name> && npx hyperframes render -o renders/<name>.mp4
   ```
   Root duration: end it about 0.05 s before ES + endscreen length. The endscreen
   video's last frame lies past the clip end, so ending exactly at ES + EL gives
   1-2 black frames (dezinstaleaza-app, 2026-10-09).


## Cards vs footage (visual rhythm)

The blue full-screen card (tier-1) is NOT the default picture. Footage is.

- **Full-screen cards, only these:** the hook (intro), the agenda ("what you will learn"),
  the section card at each new script section (it starts 0.5 s into the section pause; see
  "Section pauses"), the switch card between the iPhone and PC parts (short), and the closing
  recap / call to action. Nothing else gets a long card.
- **Everything between them shows the footage:** the phone (home screen or the last screen,
  held), with the bottom-left badges carrying the text. This holds even for a long explanation that has no matching recording
  (for example 100 s about how a feature works): keep the held phone on screen and use
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
- **Text on the footage (overlays-fx, step 7.11):** when the key idea belongs to what is on
  screen right now (a warning about this folder, the result just shown), prefer an
  on-screen statement (`fxTitle`) to an interlude: the footage stays, blurred, behind the
  text. When the narrator lists items over held footage, use a checklist panel. Commands,
  URLs and paths always get a command chip. These keep the footage as the picture.

## Section pauses (user rule 2026-10-17)

Every new section of the script gets 1.5 s of silence before its first spoken
word. The full-screen section card starts 0.5 s into that silence.

- **New section:** a heading or numbered part in the script ("Pasul N",
  "Partea N", "Metoda N", a markdown heading, a titled block such as "Crearea
  sticker-ului static"). The hook at 0 s and the agenda are the intro, not
  sections. In the combined skill, the switch to the PC part is a new section.
- **Not a new section:** interludes (key idea, number, warning), the options or
  variants the narrator shows one after another inside a section (for example
  the effects Original, Live, Contur), badge changes, and the steps inside a
  section. These get no pause and keep their normal timing.
- **Pause point.** Match each section heading to the transcript (step 3) and
  find the section's first spoken word (often the heading read aloud). Set `at`
  in the gap before that word: 0.1 s before the word start, but never before
  the end of the previous word. If the gap is shorter than 0.1 s, use its
  middle. Add one entry per section to `narration.pauses` in the plan that
  builds the narration:
  ```json
  "narration": { "files": ["original/audio/full.mp3"], "gap": 0.0,
                 "output": "assets/narration.wav",
                 "pauses": [ { "at": 78.94, "dur": 1.5, "label": "Crearea sticker-ului static" } ] }
  ```
  `at` is on the raw clock: the step-3 transcript of the joined narration files
  (with `--offset <rawStart>` for one file of several). `dur` is 1.5 (default).
- **All other times are on the paused timeline.** The builder inserts the
  silence (15 ms fades at the splice, so no click) and moves everything after
  it later. Print the transcript on the paused clock, and take every segment
  `start`, highlight, badge, card and zoom time from it:
  ```bash
  node $T video-projects/<name>/source/transcript.kit.json --pauses video-projects/<name>/phone-plan.json --words-from <s>
  ```
  Do not use `--pauses` on a transcript of the built `assets/narration.wav`. That
  file already contains the pauses.
- **Builder output.** The dry run prints each pause as `raw at -> silence
  start-end, card start`. The same values are in `pauses[]` of
  `assets/phone-track.timeline.json` (`start`, `end`, `cardStart`). A warning
  `splices audio at ... dBFS` means `at` is inside a word. Move `at` into the
  gap and build again.
- **Section card.** Set its `data-start` to `cardStart` (pause start + 0.5 s).
  The card is then fully in 1.0 s before the first word. Keep the card's normal
  length (6.2 s in the starter) and its `dissolveOut()` onto the footage. If
  the card before it (for example the agenda) is still on screen, end that card
  at `cardStart` and use `handoffOut()` for it. Fade out the active badge before
  `cardStart`.
- **Footage.** The track holds its frame during the pause; the card covers it.
  Open the section's first segment window so the action starts after the card
  dissolves (step 4).
- **Verify.** Snapshots at the pause `start`, `cardStart - 0.1`,
  `cardStart + 0.4` and the pause `end`: footage until the card, card fully
  opaque before the first word. `silencedetect` on `assets/narration.wav`
  (`noise=-60dB:d=1.4`) shows a silence of at least 1.5 s at every pause. List
  the pauses in `VERIFY.md` (label, raw `at`, timeline silence, card start) and
  ask the user to listen to each one.

## Rules

- After `highlight.mjs render`, re-encode each highlighted video with a 1 s GOP,
  or HyperFrames warns "sparse keyframes (max interval 8.33s)" and can freeze frames
  while seeking: `ffmpeg -i X.highlighted.mp4 -c:v libx264 -crf 14 -preset veryfast -r 30 -g 30 -keyint_min 30 -pix_fmt yuv420p -movflags +faststart -an X.reenc.mp4`,
  then replace the file. Do this for every highlighted track before lint/check/snapshot.
- Never modify the user's recordings, narration files, backgrounds or placeholder.
- Never re-trim or re-time the narration. The video adapts to the audio. The endscreen is the only part that extends past it.
  The one exception: the builder inserts the 1.5 s section pauses ("Section pauses"). Nothing
  is cut, and the files in `projects-full/` and `original/` stay unchanged.
- Holds and freezes are the tool for long explanations. Do not loop footage
  and do not invent screen content.
- One video element for the whole phone track. Do not stack many `<video>` clips.
- Inputs stay in `projects-full/<name>/`, with a copy in
  `video-projects/<name>/original/` (step 1) that the build reads; builds and
  renders stay in `video-projects/<name>/`. Both are gitignored. Never
  copy them into `examples/` or the style library.

## Time budget (93 s video, 4K, 30 fps, this Mac)

| Stage | Time |
| --- | --- |
| MacWhisper transcription | under 1 min |
| `build-phone-track.mjs` | about 30 s |
| `highlight.mjs render` | about 30 s |
| `hyperframes check --samples=40` | about 1 min |
| `hyperframes snapshot` | a few seconds per frame |

No render in this skill. The user renders (a 4K render takes about 28 s per second
of video).

## Worked example: demo-project (2026-10-07)

The first real build is in `video-projects/demo-project/` (local, gitignored):
`phone-plan.json`, `assets/phone-track.highlight.json`, `index.html`,
`VERIFY.md` and the `qa/` strips. Copies of the plan files are in `templates/`.

Inputs: one 93.5 s narration (`audio.mp3`), one 20 s recording, script pasted
in chat. The recording covers only the last 43 s of narration.

Structure that matched the reference, as narration sections:

| Narration | Beat | Timing rule |
| --- | --- | --- |
| Hook (problem, pain, promise) | `#hook-intro`, 3 stat lines | Starts at 0. Ends where the narrator starts previewing topics ("În acest ghid"). |
| During the hook | `badge-intro` (title + "Intro" chip) | 3.2 s to the end of the hook. |
| Topic preview | agenda, one box per topic (here 4) | fadeIn ~1-1.5 s before the topic, activate after its last word, at least 1.5 s between an activate and the next fadeIn. |
| "Pasul N" + why it matters | section title, 6.2 s, rail with one node per agenda topic plus the current step | Starts at the "Pasul" word. Since 2026-10-17: starts at `cardStart`, 0.5 s into the 1.5 s section pause ("Section pauses"). Dissolves onto the phone. |
| The steps on the phone | badges, one per screen group, with `badgeDetails()` lines | See below. |

Badges: group the sub-steps by screen sequence, not one badge per
sentence. One badge per 2-4 s sentence flickers. demo-project used 3 badges
for 7 sub-steps:
`Pasul 0: Activează funcția` (4 detail lines: Configurări, cont Apple,
iCloud, Salvate în iCloud › Poze), `Secțiunea Partajare` (3 lines),
`Comutatorul verde` (3 lines). The `.idx` chip names the section ("Pasul 0").
`chipScramble()` runs only on the section's first badge. `.pips` show the
position among the section's badges. Consecutive badges are 0.1 s apart. The
starter's `badgeOut()` fades a badge out over 0.3 s before its clip ends.

Copy limits measured at the 672 px badge width: `.badge-sub` about 27
characters, a `.det` line about 32 characters (it is `nowrap`, so a longer
line overflows the badge).

Sync: the "Recommended pattern" in step 4. The table below shows the result.
Freezes of 1.1-1.4 s on each tap gave the highlight time to show while the
narrator named the target. The 1.5 s idle wait before a scroll was cut by
starting the next segment later in the same clip.

| Tap | Source dot / open | Freeze | Screen opens at | Word |
| --- | --- | --- | --- | --- |
| Configurări icon | 2.3 / 3.4 | 2.4 @ 1.1 | 59.5 | "Configurări" 58.4 |
| Cont Apple row | 4.1 / 5.1 | 4.2 @ 1.3 | 62.4 | "contul tău Apple" 60.6 |
| iCloud row | 6.7 / 7.2 | 6.75 @ 1.3 | 65.9 | "iCloud" 65.0 |
| Poze tile | 7.5 / 8.9 | 7.6 @ 1.4 | 69.0 | "Poze" 68.9 |
| Scroll | 10.9-11.7 | none, source 9.2-10.7 cut | 70.0 | "Glisează" 69.9 |
| Albume partajate row | 12.3 / 13.5 | 12.4 @ 1.1 | 79.6 | "Albume partajate" 78.2 |
| Toggle | 14.3 | none, last frame held 86.4-93.5 | 80.6 | "comutatorul" 82.4 |

What broke on the first draft, now fixed in the starter:
1. Four agenda boxes wrapped 3+1 and pushed the title off the frame.
2. Back-to-back tier-1 cards flashed the phone for 0.45 s between them.
3. Preflight and HyperFrames lint disagree about root `data-start`. Keep it.

Check order that worked: sample the built phone track at each spoken step
before writing any HTML. Then preview the highlights, then lint and check,
then snapshots: 16 hero frames, both sides of every tier-1 boundary,
badge change, segment boundary and freeze, and the four 4K corners. Then stop: the user renders.

