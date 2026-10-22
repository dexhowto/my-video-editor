---
name: render-progress
description: Show live progress (percent, frame count/video-time, rate, ETA) for a running `hyperframes render` AND for a separate `ffmpeg` encode pass (e.g. the PNG-sequence → HEVC+alpha export step) in any project, or follow scripts/render-queue.sh across every project it processes with `--queue`. Use this whenever a render, an ffmpeg encode, or the render queue has been started in the background and the user asks how it's going, wants live/real-time progress, or wants to watch/monitor it, since neither the hyperframes CLI nor a backgrounded ffmpeg process gives interim output by default.
---

# Render progress monitor

Two separate slow steps in this workspace's video pipeline give no live
progress by default, so this skill covers both:

- **`hyperframes render` frame capture** (any format) — captures frames into
  `renders/work-<id>/capture-attempt-*/worker-*/` before assembling/encoding.
  The CLI's own progress bar only flushes to the terminal log when the whole
  render finishes.
- **A separate `ffmpeg` encode pass** — e.g. the PNG-sequence → HEVC+alpha
  `.mov` step used for the overlays-project template's transparent exports.
  `ffmpeg` *does* print live stats on its own (`frame=`/`time=`/`speed=`),
  but only to that specific process's own stderr — if it's backgrounded
  (e.g. via a tool's `run_in_background`), that output is often buffered and
  invisible until the process exits, not actually live.

Both are painful for slow 4K/PNG-sequence work that can run for tens of
minutes. This skill's bundled script polls disk state for whichever phase is
active and renders a live, self-updating progress bar with rate and ETA, so
work that's already running in the background can be watched in real time
instead of guessing.

## When to use this

- The user asks "how's the render going", "can I see progress", "watch this
  live", or similar, for a render that's running or about to run.
- Right after kicking off a render in the background — proactively offer or
  run this instead of leaving the user with no visibility until it finishes.
  **The moment a render starts, immediately give the user the exact,
  ready-to-paste command**, repo-root-relative, e.g.
  `bash .agents/skills/render-progress/scripts/render-progress.sh video-projects/<slug>`
  — resolve `<slug>` to the actual project, don't leave a placeholder. This
  is the user's own preferred/default form (confirmed 2026-09-17). It
  assumes the terminal is `cd`'d to the repo root — worth a one-time
  reminder to `cd` there if unsure, rather than defaulting to absolute paths.
- Works identically for a standard MP4 render, a `--format png-sequence`
  capture, or any other `hyperframes render` invocation, since they all
  share the same capture-then-assemble pipeline on disk — and also covers a
  standalone `ffmpeg` encode run afterward (see below).

## Usage

Single project:

```bash
bash .agents/skills/render-progress/scripts/render-progress.sh <project-dir> [total-frames] [interval-seconds]
```

- `<project-dir>` — the video project directory (the one containing
  `index.html`, `meta.json`, and where `renders/` will appear). Required.
- `[total-frames]` — expected total frame count. If omitted, the script
  infers it from the project's `meta.json` `"fps"` field (defaults to 30 if
  missing) times the root composition's `data-duration` in `index.html`.
  Pass this explicitly if the project's fps isn't in `meta.json`, or the
  inferred value looks wrong. The same inferred/given duration is also used
  for phase-2 (ffmpeg) percentage.
- `[interval-seconds]` — poll interval, default 5s. Lower it for a short
  render, raise it for a very long one to avoid excessive disk scans.

Whole queue (see the `render-video` skill for the queue itself):

```bash
bash .agents/skills/render-progress/scripts/render-progress.sh --queue [interval-seconds]
```

Run this from the repo root, same as `scripts/render-queue.sh` itself. It
re-targets itself at each project as `render-queue.log` reports the queue
advancing — capture, then encode, then straight into the next queued
project — with **no need to re-run the command** between projects or
between phases within a project. It exits on its own once the queue log
shows the whole queue finished or stopped on a failure. This is the
preferred way to watch a queue-driven render — don't just point the
single-project form at whatever project happens to be first and expect it
to follow along past that one project's encode.

**For real phase-2 (ffmpeg) progress, redirect the encode's own output to
`renders/ffmpeg-encode.log`** — this is what the script watches for real
`time=`/`speed=` values instead of falling back to a rough file-size
heartbeat. Add this to any `ffmpeg` encode command for the project (this is
also now the standard form of the overlays-project template's HEVC+alpha
command — see that template's own docs):

```bash
ffmpeg -y -framerate 30 -i renders/png-seq/frame_%06d.png \
  -i renders/png-seq/audio.m4a \
  -c:v hevc_videotoolbox -alpha_quality 0.9 -tag:v hvc1 -pix_fmt bgra \
  -allow_sw 1 -c:a aac -b:a 192k -shortest \
  -y renders/output.mov 2>&1 | tee renders/ffmpeg-encode.log
```

Without that redirect, the script still detects that an `ffmpeg` output file
exists and reports its growing size, but can't show a real percentage or ETA
for the encode phase — only for the `hyperframes` capture phase, which
doesn't need this trick since its progress lives in files on disk already.

The script blocks and prints continuously (it's a live monitor, not a
one-shot check). It auto-detects which phase is active — `hyperframes`
frame capture first if a `renders/work-*` directory exists, then an `ffmpeg`
encode once capture completes or if it finds a `renders/ffmpeg-encode.log`
directly (e.g. if you attach the monitor after capture already finished).
**Run it in the foreground of its own terminal/tool call** (not backgrounded
itself) so its live updates are actually visible — it is meant to be
watched, not polled for a final result. If running it through a tool that
captures output as a single block rather than a live TTY (like an agent's
own shell tool), expect the carriage-return updates to appear concatenated
rather than overwriting a single line — that's a display artifact of the
capture, not a bug in the script; the underlying progress data is still
correct, and a human running it in an actual terminal will see it animate
normally.

## Interpreting the output

Phase 1 (hyperframes capture):

```
Watching for a render work directory or ffmpeg encode log under video-projects/my-video/renders ...
Found work directory: video-projects/my-video/renders/work-<id>
Target: 12421 frames

  [capture] [##########                    ]  34%  4230/12421 frames  128s elapsed 33.0 fr/s ETA 248s
```

Once capture completes and an `ffmpeg-encode.log` is found (phase 2):

```
Capture complete: 12421/12421 frames in 380s.
Found ffmpeg encode log: video-projects/my-video/renders/ffmpeg-encode.log
  [encode ] [######                        ]  22%  00:01:30.00/414.03s video encoded frame 2700 speed 0.83x ETA 340s  (108s elapsed)
```

And on completion:

```
Encode complete (382s).
```

If frame count stalls for ~2 minutes during phase 1, the script prints a
note that capture may be stalled — that's a signal to check the render
process is still alive (e.g. `ps aux | grep hyperframes`), not necessarily a
real failure, since large blur/gradient-heavy frames can occasionally take
longer per worker batch.

## Why this approach instead of alternatives

- **Not `hyperframes render`'s own stdout** — it's silent until the end.
- **Not the top-level `captured-frames/` folder** — that only fills in once
  capture is fully done, so it can't show interim progress.
- **The per-worker subfolders under `capture-attempt-*/`** are the only
  thing that grows continuously during capture, which is why the script
  counts files there.
- **Not a backgrounded shell tool's own captured stdout for the ffmpeg
  phase** — that capture is frequently buffered until the process exits
  (confirmed in practice: a task's own output file stayed at 0 bytes for the
  whole runtime of an in-progress `ffmpeg` encode), so tailing it live
  doesn't work even though `ffmpeg` is actively printing. Redirecting
  `ffmpeg`'s own output straight to a file with `tee` — as this skill's
  encode command does — sidesteps that buffering entirely, since the file is
  written by `ffmpeg` itself, not relayed through another process's captured
  output.
- Rate/ETA for both phases are computed from a start-time reference on disk
  (the work directory's or log file's own creation time), not from when this
  script happens to attach — so launching the monitor mid-run (the common
  case, since you'll usually start watching after already backgrounding the
  work) still gives an accurate estimate instead of one skewed by a late
  start.
- `ffmpeg`'s stats line updates in place using `\r` (carriage return, not
  newline) even when its output isn't a terminal, so the script normalizes
  `\r` to `\n` before searching for the last `time=`/`speed=`/`frame=`
  value — grepping the raw log content for `time=` without that step would
  usually just match the same in-place line's stale first value.
