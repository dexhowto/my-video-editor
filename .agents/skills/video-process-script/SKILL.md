---
name: video-process-script
description: "Review a tutorial project's screen recordings against its original script and rewrite the script to follow the exact path, clicks, and UI labels shown on screen. Works on projects-full/<name>/ (original/script.md stays unchanged, recordings in video/). Writes script_changed.md (marked changes) and script_audit.md (timeline, classification, what to record). On 'update' it reviews only new videos, updates both files, and reports back; on approval it writes the clean final script.md to the project root. Preserves general information and other-device instructions. Use for '/video-process-script <name>', 'process script based on video', 'update script from video', 'align script with recording', or checking whether recordings cover a script."
---

# Video Process Script

You are a meticulous technical script writer. You watch the screen recordings of a tutorial and update its script so every narrated step matches the path, clicks, UI labels, and on-screen text in the footage. Where the script describes something that was not recorded, you say exactly what to record.

## Invocation and modes

The user calls the skill with a project name, plus an optional mode word:

| Command | Mode |
| --- | --- |
| `/video-process-script <name>` | **Review**. The first pass over all videos. |
| `/video-process-script <name> update` (or "update the script") | **Update**. Reviews only the videos added or changed since the last pass. |
| `/video-process-script <name> ok` (or "ok", "approved", "finalize") | **Finalize**. Writes the clean `script.md`. |

If `script_changed.md` already exists and the user gives no mode word, ask which mode they want. Never redo Review on top of reviewed work.

## Project layout

Project folder: `projects-full/<name>/` (repository root). If it does not exist, list `projects-full/` and ask which project the user means.

| Path | Role | Rule |
| --- | --- | --- |
| `original/script.md` | The original script. | **Read only. Never edit, move, or rename anything in `original/`.** |
| `video/*.mp4`, `*.mov` | Screen recordings. A `<stem>.mouse.jsonl` beside a video is its click log. | Read only. |
| `script_changed.md` | The working script with change markers. | Written by Review and Update. |
| `script_audit.md` | The audit: videos reviewed, timeline, classification, missing footage. | Written by Review and Update. |
| `script.md` (project root) | The final clean script. | Written only by Finalize, after the user approves. |
| `archive/` | Backups of an older root `script.md`. | Written only by the finalize helper. |

If `original/script.md` is missing but a root `script.md` exists and `script_changed.md` does not, ask the user whether to move it to `original/script.md` first. Do not move it without a yes.

## Core rules

1. **Follow the exact path and clicks in the video.** Use the real order, menu items, settings paths, and button names on screen.
2. **Do not modify general information.** This covers the hook, intro, problem framing, conceptual or "why" explanations, takeaways, ethics notes, the outro, and calls to action.
3. **Do not modify other-device information.** This covers steps or caveats for other platforms, architectures, or paths: Mac in a Windows guide, ARM vs x64, AMD/Intel vs NVIDIA, web vs desktop.
4. **Keep as much information as possible, but stay on point.** Keep tips, shortcuts, sizes, and edge cases. Cut wording that the footage contradicts. Write sentences that are natural to speak.
5. **Correct facts the screen proves wrong.** Examples are a command, URL, file size, version, or label that differs on screen. Note each one in the audit under Key corrections.
6. **Narrate unscripted recorded actions.** If the video shows steps that the script does not mention (a wizard page, a choice, a tour of the app), add short narration so the voice stays in sync.
7. **Never silently delete unrecorded steps.** Keep the text, mark it `[NOT RECORDED]`, and write a "what to record" item for it.
8. **Check that actions really finish.** Watch for spinners that never end ("Saving…"), buttons that are enabled but never clicked, and videos that end before the result appears. These are missing footage, not done steps.

## Markers in script_changed.md

`script_changed.md` is the full script with the original order and headings. It starts with this legend block, written exactly like this so the finalize helper can remove it:

```markdown
<!-- vps:legend:start -->
Legend: **[CHANGED]** adapted to the recording · **[ADDED]** narration for recorded actions not in the original · **[NOT RECORDED]** kept text with no footage yet (see script_audit.md). Unmarked text is original wording.
<!-- vps:legend:end -->
```

- Put the marker at the start of the paragraph or sentence it covers: `**[CHANGED]** Click **Download installer**…`. A heading marker goes at the end of the heading: `## Developer install **[NOT RECORDED]**`.
- Use only `**[CHANGED]**`, `**[ADDED]**`, and `**[NOT RECORDED]**`. Notes for the user go in `<!-- vps: … -->` comments. Anything else is treated as script text and would end up in the final script.
- Do not put change explanations in the script. They go in `script_audit.md`.

## Inspection toolkit

```bash
V=.agents/skills/video-process-script/scripts/inspect-video.mjs
node $V summary <video>             # duration, resolution, fps, audio, first clicks
node $V clicks <video>              # all clicks from <stem>.mouse.jsonl (timeSec, x, y in video pixels)
node $V frame <video> --time 14.5 --out <scratch>/f.png
```

Method that worked on 4K recordings:

1. **Overview.** Make one contact sheet per 60 s, with 1 frame every 3 s:
   `ffmpeg -v error -y -ss <start> -t 60 -i <video> -vf "fps=1/3,scale=640:-1,tile=4x5" -frames:v 1 <scratch>/ov-<n>.png`.
   Use it to find the scene changes.
2. **Read the labels.** At each scene change and each click, extract full frames (`scale=1920:-1`). Crop to the app window when the UI text is small, for example `crop=2560:1700:640:200,scale=1600:-1`. Put 4 frames in one image with `xstack` to save reads.
3. **Map the clicks.** Map each click's x/y to the element under it on the nearest frame. A click log time is when the button was released.
4. **Copy text literally.** Copy commands, URLs, sizes, versions, and paths from the screen, not from memory.

Keep scratch images in the session scratchpad, not in the project. ffmpeg here has no `drawtext` filter.

## Mode 1: Review

1. Find the project. Read `original/script.md`. List `video/`: name, size, and modified time for each video file (skip `.jsonl`).
2. Inspect every video with the toolkit. Build a timeline of recorded actions with timestamps. If there are several videos, take them in name order and say which file each step comes from.
3. Classify each script paragraph:
   - general information: untouched;
   - other-device information: untouched;
   - target-device steps: adapt to the video;
   - unrecorded steps: keep and mark;
   - unscripted recorded actions: add narration.
4. Write `script_changed.md`, the full script with the legend and markers.
5. Write `script_audit.md`, using the template below.
6. Report in chat:
   - the main changes;
   - the key corrections;
   - the list of missing footage, marked REQUIRED or OPTIONAL, as a table (see **Clickable script links** below);
   - links to both files.
   Then stop and wait for the user's review.

### Clickable script links

Every missing-footage item that has script text must link to that text, so a click opens `script_changed.md` at the exact line.

- In chat, write the step name as a link with a line suffix, relative to the working directory: `[Synthesize audio and the result](projects-full/<name>/script_changed.md:61)`. For a range, link the first line and name the range in the link or the row: `Lines 61–62`.
- In `script_audit.md`, end each **Script location** line with `[Lines 61–62](script_changed.md#L61)`.
- Get line numbers with `grep -n` on the finished `script_changed.md`, after all edits. Items with no script text (for example B-roll only) stay plain text.
- Line numbers move when the script changes. Recompute every link in the audit and in chat on each Update.

## Mode 2: Update

1. Re-read `script_changed.md` and `script_audit.md` from disk. The user may have edited them by hand. Their edits win, so never overwrite them with older text. Also apply any feedback the user gave in chat.
2. Compare `video/` with the **Videos reviewed** table in the audit, by name and size. New or changed files are the ones to review. If there are none, say so and only apply the chat feedback.
3. Inspect only the new or changed videos. Match each one to the missing-footage items and to the `[NOT RECORDED]` parts.
4. Update `script_changed.md`:
   - When new footage covers a `[NOT RECORDED]` part, adapt that text to the footage and change its marker to `[CHANGED]`. If the text already matches, remove the marker.
   - Correct labels or names that the new footage proves, such as a menu name that was only guessed before.
   - Add narration for new unscripted actions as `[ADDED]`.
   - Keep the original order of the script. Footage from a new video goes where its section belongs.
5. Update `script_audit.md`:
   - add the new rows to Videos reviewed;
   - add a timeline section per new video;
   - mark each missing-footage item as **DONE (video, time)**, **PARTIAL (what is still missing)**, or **OPEN**;
   - recompute the script line links on every **Script location** line;
   - add an "Update N" entry to the Change log.
6. Give feedback in chat:
   - which videos were reviewed;
   - which script parts changed, with a short reason for each;
   - which missing-footage items are now done;
   - what is still open, as a table with clickable script links;
   - any problem in the new footage, such as an unfinished action, a wrong order, a visible error, or a mismatch with the script.
   Then wait.

## Mode 3: Finalize

Run this only after the user approves ("ok"). From the repository root:

```bash
node .agents/skills/video-process-script/scripts/finalize-script.mjs projects-full/<name>
```

The helper writes `projects-full/<name>/script.md` from `script_changed.md`:
- It strips the legend, every marker, and every `vps:` comment.
- It keeps `original/` unchanged.
- It backs up an older root `script.md` to `archive/` when that file is neither the original nor the new result.

Use `--dry-run` to print the result without writing it. Then:
- Confirm the path in chat.
- If parts were still `[NOT RECORDED]`, say how many. Their text stays in the final script.
- Add a line "Finalized: date" to the Change log in `script_audit.md`.

## script_audit.md template

```markdown
# Script audit: <name>

## Videos reviewed
| File | Size (bytes) | Modified | Duration | Reviewed in |
| --- | --- | --- | --- | --- |

## Recorded timeline
### <file>
| Time | Action on screen |
| --- | --- |

## Classification
- **Untouched (general info):** …
- **Untouched (other device or other path):** …
- **Adapted to video:** …
- **Added (recorded but not in the script):** …

## Key corrections
1. …

## Missing footage: what to record
### 1. <step> (REQUIRED | OPTIONAL): OPEN | PARTIAL | DONE (<file> <time>)
- **Script location:** … [Lines N–M](script_changed.md#LN)
- **Starting state:** …
- **Actions to record:** 1. … 2. …
- **Ending state:** …
- **Duration:** … s (1 s lead-in, 1–1.5 s hold at the end)

## Change log
- Review (<date>): …
```

Mark an item REQUIRED when the script narrates it as something the viewer watches happen. Mark it OPTIONAL when it is B-roll for spoken-only content (troubleshooting, warnings, alternatives).

## Example: adapting a path

- **Original:** "Click the Start menu, go to Settings, select Personalization, then Taskbar."
- **Video:** right-click on the taskbar, then **Taskbar settings**, which opens Personalization > Taskbar.
- **script_changed.md:** "**[CHANGED]** Right-click any empty space on your taskbar and select **Taskbar settings** to jump straight to the Personalization menu."
- **Not changed:** the paragraph that explains why the taskbar gets stuck (general information), and the Mac Dock note (other device).
