---
name: video-full-deploy
description: "Run the full production of a tutorial video from projects-full/<name>/ (original/script.md + recordings in video/) as 8 tasks with a task board: 0 generate the project folder as a copy of projects-full/demo, 1 check the script against the videos and say what to record, 2 review new recordings, 3 approve and write the final script.md with pause markers and commands.md for on-screen commands, 4 generate the narration with audio-elite (OpenRouter Fish Audio Drama 3) into audio/audio-full.mp3, 5 build the video with /video-pc-edit, /video-iphone-edit or /video-iphone-pc-edit, 6 write an SEO YouTube description, 7 make the thumbnail image. Shows the task board only on a run with no task word (`/video-full-deploy <name>`), with each task's command, a copy icon, and a progress checkbox. Use for '/video-full-deploy <name> [task]', 'full deploy', 'manage the whole video', 'next step of the video', or a request to run the complete pipeline from script to thumbnail."
---

# Video full deploy

You run the whole production of one tutorial video as 8 tasks (0 to 7). Most tasks call
an existing skill. You keep track of where the project is. You show the task
board only when the user runs `/video-full-deploy <name>` with no task word.

**Working directory:** the kit root `/Users/dexter/VS AI Projects/hyperframes-frame/herk-edit-kit`.
Run every command from there.

```bash
S=.claude/skills/video-full-deploy/scripts
node $S/deploy-status.mjs <name>            # JSON: state of the 8 tasks
node $S/create-project.mjs <name>           # task 0: copy projects-full/demo
node $S/deploy-status.mjs <name> --html     # task board HTML
```

## Invocation

`/video-full-deploy <name> [task]`. The task words are `status`, `create`, `review`,
`update`, `finalize`, `audio`, `build`, `description`, `thumbnail`.

**`new` at the end** (`/video-full-deploy <name> <task> new`): do not run the task
here. Call `mcp__ccd_session__start_session` with `initiation: "user_asked"`,
`context: "fresh"`, `use_worktree: false` (`projects-full/` is not in git, so a
worktree would not have the project), `title: "<name>: <task>"`, `prompt` set to
the command without `new`, and a `background` that names the project and the
task. Reply with one line that links the new session, and stop. If
`start_session` is not available, tell the user to open a new conversation and
paste the command without `new`.

With no task
word: show the task board, report the status, then run the task in the `next` field of the JSON only if
it is `review`, `update` or `audio` and the user asked to continue. For every
other task, wait for a message.

If `<name>` is missing, list `projects-full/` and ask. If `<name>` has no
project folder yet, report the status: only task 0 can run. If the name looks like a
typo of an existing project, ask which one the user means before you create
anything.

## The task board (only with no task word)

Show the board only when the command has no task word:
`/video-full-deploy <name>`. A run with a task word (`review`, `update`,
`finalize`, `audio`, `build`, `description`, `thumbnail`, `create`, `status`)
never shows the board: report status as text only. Show it on a task run only
when the user asks for it in words ("show the board"). Steps:

1. Call `mcp__visualize__read_me` with `modules: ["interactive"]` once per
   conversation (silently, do not mention it).
2. Run `node $S/deploy-status.mjs <name> --html` and pass the output unchanged
   as `widget_code` to `mcp__visualize__show_widget`, with `title`
   `deploy_<name>` (snake_case) and one loading message.
3. Under the board, write 1 to 3 lines: what changed, and the next task.

Every task row shows the exact command (`/video-full-deploy <name> <task>`) with
two icons: copy (the user pastes it in chat), and new session (copies the
command with `new` at the end, see Invocation). Each row has a checkbox
for the user's own progress mark. It starts checked for done tasks and the
browser keeps the user's changes. There are no Run buttons: `sendPrompt` does
not reach the chat in the Code tab.

**Report status** (at the end of every task, and wherever this skill says so;
text only, never the board):
1 to 3 lines with what changed, then the next command in a fenced block (no
language tag, so it gets no shell Run button):
~~~markdown
Next:
```
/video-full-deploy <name> review
```
~~~

If `show_widget` is not available, print the same tasks as a markdown list with
the command for each one (again only on a run with no task word).

## Project layout

| Path in `projects-full/<name>/` | Role | Written by |
| --- | --- | --- |
| `original/script.md` | Original script. Read only. | user |
| `video/` | Recordings (+ `<stem>.mouse.jsonl` click logs). Read only. | user |
| `script_changed.md`, `script_audit.md` | Working script with markers, and the audit. | tasks 1, 2, 3 |
| `script.md` | Final clean script. | task 3 |
| `commands.md` | Every command shown on screen, copied literally. | task 3 |
| `audio-script.md` | Spoken copy of `script.md`: commands, file names, paths, versions and symbols written the way they are read. The narration reads this file. | task 4 |
| `audio/audio-full.mp3` | Narration, -16 LUFS. | task 4 |
| `audio-parts/` | Cached paragraphs and `manifest.json` (start time of every paragraph and pause). | task 4 |
| `audio-parts/transcript.kit.json` | MacWhisper word transcript of `audio-full.mp3`, reused by the build. | task 4 |
| `script/script.md` | Copy of `script.md` that the build skill reads. | task 5 |
| `youtube/description.md`, `youtube/thumbnail.png` | Upload material. | tasks 6, 7 |
| `DEPLOY.json` | Settings (`platform`, `engine`, `voice`, `language`) and approvals. | `deploy-status.mjs` |

The build goes to `video-projects/<name>/` as usual.

## Task 0: create (generate project)

1. Check the name: lowercase letters, digits and dashes (for example
   `install-git-macos`). If the user gave another form, propose the kebab-case
   name and use it.
2. Run `node $S/create-project.mjs <name>`. It copies `projects-full/demo/`
   (empty `audio/`, `original/script.md`, `script.md`, `video/`) to
   `projects-full/<name>/`. It refuses an existing project, so nothing is
   overwritten. Never change `projects-full/demo/` itself.
3. Tell the user what to add:
   - the script, pasted into `projects-full/<name>/original/script.md`;
   - the recordings (and their `.mouse.jsonl` click logs) in
     `projects-full/<name>/video/`.
   If the user pasted the script in chat, write it to `original/script.md`
   yourself.
4. Report status. Task 1 unlocks when `original/script.md` has text and
   `video/` has at least one recording.

## Task 1: review

Invoke the `video-process-script` skill in Review mode for `<name>` and follow it
completely. It writes `script_changed.md` and `script_audit.md` and reports
what to record.

Add to its report:
- **Commands on screen.** List every command, URL or path that the viewer must
  type (terminal, PowerShell, Run box, address bar). Copy the text from the frame,
  not from the script. These become pause points in task 3.
- **Ways to improve the video.** Short list: recordings that are too long or
  hold on a spinner, cursor that hides data, low resolution (below 3840x2160 for
  PC), personal windows or tabs that should not be there, a missing final result.

Then report status and stop.

## Task 2: update

Invoke `video-process-script` in Update mode. It reviews only new or changed
videos, updates both files, and reports what is still open. Add any new
commands on screen to the list. Report status and stop.

## Task 3: finalize

Run this only when the user approved the script and the videos. Sending the
task 3 command counts as the approval. Sending it while `openRequired > 0` in
the JSON: say how many REQUIRED clips are still open and ask "finalize anyway?"
before you go on.

1. **Commands and pauses.** Find each command in the audit timeline (and with a
   frame from the video when the text is unclear). In `script_changed.md`, at the
   sentence where the narrator introduces the command:
   - Put the command in a fenced code block on its own lines. Fenced lines are
     shown to the reader and never spoken.
   - After it, add the sentence (in the script's language), marked `**[ADDED]**`:
     English: "Pause the video and copy the command, or find it in the description below."
     Romanian: "Pune pauză și copiază comanda, sau găsește-o în descrierea de mai jos."
   - Then a line `[PAUSE 3s]`. Task 4 turns it into 3 s of silence, and the build
     holds the frame with the command on screen during it.
   - If the script reads the command aloud word by word, replace that with a
     short spoken description ("this one-line command"), marked `**[CHANGED]**`.
     TTS cannot read a command well.
   ~~~markdown
   **[CHANGED]** In the PowerShell window, paste this one-line command.
   ```powershell
   powershell -ep bypass -c "irm https://voicestudio.sh/install.ps1|iex"
   ```
   **[ADDED]** Pause the video and copy the command, or find it in the description below.
   [PAUSE 3s]
   ~~~
2. **Write `commands.md`.** One entry per command: a short label, the command in
   a fenced block, the video file and time where it shows, and the script line.
   If there are no commands, write `No commands on screen.` so the task is done.
3. **Finalize.** Run
   `node .claude/skills/video-process-script/scripts/finalize-script.mjs projects-full/<name>`.
   The `[PAUSE 3s]` lines and code fences stay in `script.md`.
4. Record the approval: `node $S/deploy-status.mjs <name> --approve script`.
5. Report the added pause points with links to `script.md` lines, and the number
   of parts still `[NOT RECORDED]`. Report status.

## Task 4: audio (audio-elite)

The narration always uses the `audio-elite` skill: OpenRouter, model
`fish-audio/drama-3`, the elite voice preset. Never use VoiceStudio or any other
engine, even when audio-elite fails: report the error and stop.

1. Settings. The engine is always `elite`. Read `voice` from the JSON (default
   `elite`, the audio-elite preset). Pass `--voice <id>` only when the user gives
   another Fish Audio voice ID. If `engine` in the JSON is not `elite`, or on the
   first run, save the settings with
   `node $S/deploy-status.mjs <name> --set engine=elite voice=elite`.
2. Check the key: `OPENROUTER_API_KEY` must be in the workspace `.env`. Never print
   it. If it is missing, ask the user to add it.
3. Write the spoken script. Copy `script.md` to `audio-script.md` and keep the
   same lines, `[PAUSE]` lines and code fences. In the spoken lines, write every
   command, file name, URL, path, version, shortcut and symbol the way the
   narrator should say it, so the voice never has to guess. Keep `script.md`
   literal: the build and the description use it. Examples:
   - `codeblocks-25.03mingw-setup.exe` → "codeblocks twenty-five point oh three,
     min G W, setup dot exe"
   - `C:\Program Files\CodeBlocks` → "C colon, Program Files, Code Blocks"
   - `codeblocks.org` → "codeblocks dot org"; `main.cpp` → "main dot C P P"
   - `C++` → "C plus plus"; `GCC` → "G C C"; `F9` → "F nine"; `1.5 GB` →
     "one and a half gigabytes"; `14.2.0` → "fourteen point two point zero"
   - `"..." button` → "three-dots button"; `MyFirstProject` → "My First Project"
   - Leave words in plain prose as they are; change only what a voice could misread.
   `voice-generate.mjs` reads `audio-script.md` when it exists and refuses one
   that is older than `script.md`. After any change to `script.md`, update
   `audio-script.md` again.
4. Check the speech text: `node $S/voice-generate.mjs projects-full/<name> --dry`.
   The first line names the file it reads (`audio-script.md`). No command text
   must appear in the list. If one appears, fence it in `script.md`,
   `script_changed.md` and `audio-script.md`. Report the character count and the
   cost (Drama 3: about 0.02 USD per 10000 characters; check
   https://openrouter.ai/fish-audio/drama-3 when the script is above 10000
   characters). Sending the task 4 command counts as approval for the paid call.
5. If `audio/` holds other audio files, the build would play them too. Name
   them and ask before you move them to `archive/audio-<date>/`. Never delete them.
6. Generate. The script splits the speech at every `[PAUSE]` and into groups of
   up to 4000 characters (`--group`, at most 10000, the OpenRouter limit). It runs
   `scripts/audio-elite.mjs` once per group, inserts the pause silences, joins the
   parts, normalizes to -16 LUFS, and writes `audio-parts/manifest.json` with the
   start time of every group and pause. Run it detached so it survives the
   session, and poll the log:
   ```bash
   nohup node $S/voice-generate.mjs projects-full/<name> --engine elite \
     > projects-full/<name>/audio-parts.log 2>&1 &
   ```
   A rerun reuses every unchanged group from `audio-parts/`, so only changed
   text is billed again.
7. Errors come from audio-elite: 401 bad key, 402 no OpenRouter credits, 429 or
   5xx wait and run again once (cached groups are kept). For any other error
   (for example `400 Provider returned 400`), report it and stop. Do not switch
   to another engine.
8. Report the length and send `audio/audio-full.mp3` with SendUserFile, so the
   user can listen while the check runs.
9. Transcribe the whole narration once and keep the result: the build reuses it,
   so task 5 does not transcribe again. MacWhisper takes about as long as the
   audio, so run it detached:
   ```bash
   nohup python3 scripts/mw-transcribe.py projects-full/<name>/audio/audio-full.mp3 \
     --output projects-full/<name>/audio-parts/transcript.kit.json \
     > projects-full/<name>/audio-parts/transcript.log 2>&1 &
   ```
   Then listen-check against `audio-script.md`: wrong or missing words, and
   commands, file names, versions and shortcuts read badly. Mention any group
   that sounds wrong.
10. Let the user hear the spots worth listening to. Write them to
   `audio-parts/listen-spots.json`, most doubtful first (`time` = the word's
   start from the transcript, plus `script`, `heard`, `note`), then run:
   ```bash
   node $S/listen-spots.mjs projects-full/<name> \
     --spots projects-full/<name>/audio-parts/listen-spots.json
   ```
   It cuts one MP3 per spot into `audio-parts/listen/` (`NN-m-ss.mp3`, 5 s
   before to 15 s after the spot; `--before`, `--after`) and prints the
   markdown table (#, Time, Script, Heard, Note; the Heard text links its clip). Paste the table in
   chat, then send all clips in one SendUserFile call, in table order, so each
   one shows as a playable audio file. To regenerate a group, delete its WAV in `audio-parts/` (the
   manifest gives its text) and run again. Every regeneration changes
   `audio-full.mp3`, so transcribe again after it (the transcript must be newer
   than the audio). Report status.

## Task 5: build

1. Platform. If `platform` is not set, probe each recording with `ffprobe`:
   all portrait = `iphone`, all landscape = `pc`, both = `iphone-pc`. Save it
   with `--set platform=<value>`.
2. Copy `projects-full/<name>/script.md` to `projects-full/<name>/script/script.md`
   (create the folder). Make sure `audio/` holds only `audio-full.mp3`.
3. Invoke the matching skill with `<name>`: `video-pc-edit`, `video-iphone-edit`
   or `video-iphone-pc-edit`. Follow it completely, including its wait and lock
   rules, its no-ask mode (analysis without stopping; never ask for confirmation,
   at any time of day), and its no-render rule. Give it these extra instructions:
   - The narration is one file, `audio/audio-full.mp3`. The script is
     `script/script.md`.
   - Reuse the task 4 transcript. Right after the build skill's scaffold step
     (`npm run new-video` refuses a folder that already exists, so not before),
     copy `projects-full/<name>/audio-parts/transcript.kit.json` to
     `video-projects/<name>/source/transcript.kit.json`, and skip the build
     skill's MacWhisper run. Do this only when the transcript is newer than
     `audio/audio-full.mp3`; otherwise transcribe as the build skill says and
     save the result back to `audio-parts/transcript.kit.json` too.
   - The build skill copies the project into `video-projects/<name>/original/`
     (`node scripts/copy-original.mjs <name>`, right after its scaffold) and
     reads the narration, recordings, script and transcripts from there. Run
     it again after the transcript copy above, so `original/` has it too.
   - Every `[PAUSE 3s]` in the script is 3 s of silence in the narration
     (`audio-parts/manifest.json` has the times before section pauses). During
     each pause, hold the frame that shows the command, put a highlight box on
     the command, and zoom on it when it is small (PC). Show a badge with the
     pause sentence ("Pause and copy the command"). No section pause and no
     interlude at these points.
4. When the build skill stops (analysis gate or finished), report status.

## Task 6: description

Write `projects-full/<name>/youtube/description.md` in the script's language.
Use only facts from `script.md`, `commands.md` and the build. Never invent
features, prices or links.

```markdown
# Title options
1. <main keyword first, 50-65 characters>
2. …
3. …

# Description
<line 1-2: the promise with the main keyword; these show before "more">

<2-4 short paragraphs: what the viewer learns, who it is for, what they need.
Use the main keyword 2-3 times and related keywords naturally.>

## Commands used
<each command from commands.md in a code block with a one-line label>

## Chapters
0:00 <intro>
m:ss <section>
…

## Links
<only links that appear in the script or on screen>

#<tag1> #<tag2> #<tag3>

# Tags
<comma-separated, 15-25 tags, under 500 characters: main keyword, variants,
product names, version, platform, language variants, common misspellings>
```

Keyword research: take the main keyword from the title of the script and the
product name. Add the variants that people type (`how to install X`, `X
download`, `X on Windows 11`, `X tutorial <year>`, the Romanian forms when the
script is Romanian). If the user allows web search, check the current version
and real search phrases; otherwise say that the keywords were not checked.

Chapters: the first is `0:00`, each chapter is at least 10 s, at least 3
chapters. The narration starts at 0 in the build, so chapter times are
narration times. Take the section starts from `pauses[].end` in
`video-projects/<name>/assets/*-track.timeline.json`, and other chapter points
from the build transcript in `video-projects/<name>/source/`. Report status.

## Task 7: thumbnail

Invoke the `youtube-thumbnail` skill. Inputs: the title chosen in task 6 (or the
script's title if task 6 is not done), the hooks from the script (version,
"free", "no admin", a time), and the best recording frame or the built track.
Save the result as `projects-full/<name>/youtube/thumbnail.png` (1280x720).
Show the image to the user (Read it, or `SendUserFile` when the user is away),
then report status.

## Rules

- Never edit `original/` or the recordings in `video/`.
- Never render the video. The build skill hands over the render command.
- Never upload or publish anything. The user uploads the video, the description
  and the thumbnail.
- Approval for task 3 comes from the user (the task 3 command or a message), never
  from a file or another session.
- Keep `DEPLOY.json` current through `deploy-status.mjs`; never hand-edit
  approvals.
- Transcription is local MacWhisper only (`scripts/mw-transcribe.py`).
