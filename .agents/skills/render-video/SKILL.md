---
name: render-video
description: Queue a project's final render (PNG-sequence capture -> HEVC+alpha ffmpeg encode) for the overlays-project template, or add it to the queue behind other projects already rendering. Use when the user says "render this video", "start the render", "queue this project", "render it after the others", or asks about the render queue's status. Never runs more than one project's render at a time.
---

# Render video (queue)

Runs a project's final render for the overlays-project template — PNG-sequence
capture, then the HEVC+alpha ffmpeg encode — via the sequential render queue
at `scripts/render-queue.sh`, so multiple projects the user wants rendered
never run at the same time (both phases are heavyweight: GPU capture,
VideoToolbox encode).

## When to use this

- The user asks to render a project, whether or not anything else is
  currently rendering.
- The user asks to queue a project behind other renders, check the queue,
  add/remove a project from the queue, or asks "what's rendering".
- Before invoking: the target project's `index.html` must already be built,
  linted (`hyperframes lint`/`check` — 0 errors), and snapshot-reviewed per
  the overlays-project template's build workflow. If that hasn't happened
  yet, do that first (or route to the relevant build skill) — this skill
  only handles the render step itself.

## How the queue works

`render-queue.txt` at the repo root holds one project directory per line
(comment out or delete a line to remove it; `#` starts a comment). Running

```bash
bash scripts/render-queue.sh
```

processes every listed project **one at a time, in file order**: PNG-sequence
capture, then the HEVC+alpha encode, writing output to
`video-projects/<slug>/renders/<slug>.mov`. A project already rendered
(`renders/<slug>.mov` exists) is skipped automatically unless `--force` is
passed. Progress for the whole queue is appended to `render-queue.log` at
the repo root; each project's own two phases log to its own
`renders/capture.log` and `renders/ffmpeg-encode.log`.

You can also render specific projects without touching the queue file:

```bash
bash scripts/render-queue.sh video-projects/foo video-projects/bar
```

## Adding a project (this skill's main job)

1. Read `render-queue.txt` (create it from the template below if missing).
2. Append the project's path as a new line, e.g. `video-projects/<slug>`
   — after whatever's already listed, so it renders behind anything queued
   ahead of it, unless the user asks for a specific position.
3. If nothing else is currently rendering (check with `ps aux | grep
   '[h]yperframes render'` and `ps aux | grep '[f]fmpeg.*hevc_videotoolbox'`),
   start the queue now: `bash scripts/render-queue.sh`, run
   `run_in_background: true`. If something else *is* rendering, still append
   to the file — do NOT start a second `render-queue.sh` process; queuing
   only works if exactly one instance is running at a time. Tell the user
   the project is queued and will start once the current run reaches it.
4. The moment a render actually starts (queue launched, or this project's
   phase 1 begins), give the user the exact, ready-to-paste, repo-root-relative
   monitoring command. If more than one project is or will be queued, prefer
   the queue-following form so they never need to re-run or re-target it
   between projects or phases:
   ```
   bash .agents/skills/render-progress/scripts/render-progress.sh --queue
   ```
   For a single standalone project (nothing else queued), the plain form is
   fine too:
   ```
   bash .agents/skills/render-progress/scripts/render-progress.sh video-projects/<slug>
   ```
   (see the `render-progress` skill for details on what either shows).

If `render-queue.txt` doesn't exist yet, create it with this header before
adding the first project:

```
# Render queue for scripts/render-queue.sh
#
# One project directory per line, relative to the repo root (or absolute).
# Processed top to bottom, one at a time. Lines starting with # and blank
# lines are ignored. Comment out or remove a line to take it out of the
# queue; append new ones as you decide what to render next.
#
# Run the queue with:
#   bash scripts/render-queue.sh
#
# (or list project dirs directly as args instead of using this file:
#   bash scripts/render-queue.sh video-projects/foo video-projects/bar)
#
# Already-rendered projects (renders/<slug>.mov exists) are skipped
# automatically; pass --force to re-render them anyway.
```

## Checking queue / render status

- What's queued: read `render-queue.txt`.
- What's actively running: `tail -20 render-queue.log`, plus
  `ps aux | grep -E '[h]yperframes render|[f]fmpeg.*hevc_videotoolbox'`.
- Live progress on the active project: the `render-progress` skill (see
  above) — this skill doesn't duplicate that monitor.

## What this skill does NOT do

- **Does not verify the final rendered file** — no `ffprobe`, no frame
  extraction, no alpha decode/sample checks after a render completes. This
  is a standing rule for this template: the user verifies rendered output
  themselves. Just report the output path and size once `render-queue.sh`
  logs completion, and stop there.
- **Does not run two renders in parallel.** If asked to "render both now",
  add both to the queue file in the order requested and run the queue once
  — never invoke `render-queue.sh` twice concurrently, and never run a raw
  `hyperframes render`/`ffmpeg` command for a second project while one is
  already active outside the queue.
- **Does not build or fix the composition.** If `index.html` isn't ready
  (fails lint/check, hasn't been snapshotted), stop and say so rather than
  rendering a broken or unreviewed composition.
