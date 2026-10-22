#!/usr/bin/env bash
# Sequential render queue for overlays-project videos.
#
# Runs the full PNG-sequence capture -> ffmpeg HEVC+alpha encode workflow
# (see the "overlays-project" template) for multiple projects one at a time,
# never in parallel — these are both heavyweight (GPU capture, VideoToolbox
# encode) and contend for the same machine, so queueing keeps them from
# stepping on each other.
#
# Usage:
#   scripts/render-queue.sh <project-dir> [<project-dir> ...]
#   scripts/render-queue.sh --file <queue-file>
#   scripts/render-queue.sh                       # defaults to render-queue.txt
#
#   <project-dir>   Path to a video project (e.g. video-projects/my-video).
#   --file <path>   A text file with one project-dir per line (# comments
#                    and blank lines ignored). Defaults to render-queue.txt
#                    at the repo root if no args are given at all.
#   --force         Re-render a project even if renders/<slug>.mov already
#                    exists (default: skip projects already rendered).
#
# Each project's two phases are logged to its own renders/capture.log and
# renders/ffmpeg-encode.log (readable live with the render-progress skill:
#   bash .claude/skills/render-progress/scripts/render-progress.sh <project-dir>
# while this queue is running). Progress across the whole queue is appended
# to render-queue.log at the repo root.
#
# On a project's capture or encode failure, the queue stops there (leaving
# later projects unstarted) rather than silently skipping ahead — check
# render-queue.log and that project's own logs, fix, then re-run the queue
# (already-completed projects before it are skipped automatically unless
# --force is passed).
#
# This script does NOT verify the final rendered file (no ffprobe, no frame
# extraction) — same standing rule as the rest of the overlays-project
# workflow. It only confirms each step's process exited cleanly.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUEUE_LOG="$REPO_ROOT/render-queue.log"
FORCE=0
QUEUE_FILE=""
PROJECT_DIRS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    --file) QUEUE_FILE="$2"; shift 2 ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) PROJECT_DIRS+=("$1"); shift ;;
  esac
done

if [[ ${#PROJECT_DIRS[@]} -eq 0 ]]; then
  [[ -z "$QUEUE_FILE" ]] && QUEUE_FILE="$REPO_ROOT/render-queue.txt"
  if [[ ! -f "$QUEUE_FILE" ]]; then
    echo "ERROR: no project dirs given and queue file not found: $QUEUE_FILE" >&2
    exit 1
  fi
  while IFS= read -r line; do
    line="${line%%#*}"
    line="$(echo "$line" | xargs)"
    [[ -n "$line" ]] && PROJECT_DIRS+=("$line")
  done < "$QUEUE_FILE"
fi

if [[ ${#PROJECT_DIRS[@]} -eq 0 ]]; then
  echo "ERROR: queue is empty." >&2
  exit 1
fi

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$QUEUE_LOG"
}

log "==== Render queue starting: ${#PROJECT_DIRS[@]} project(s) ===="
for p in "${PROJECT_DIRS[@]}"; do log "  - $p"; done

TOTAL=${#PROJECT_DIRS[@]}
IDX=0
FAILED=0

for PROJECT_DIR in "${PROJECT_DIRS[@]}"; do
  IDX=$((IDX + 1))
  # Resolve relative to repo root if not already absolute/resolvable from cwd.
  if [[ ! -d "$PROJECT_DIR" && -d "$REPO_ROOT/$PROJECT_DIR" ]]; then
    PROJECT_DIR="$REPO_ROOT/$PROJECT_DIR"
  fi
  if [[ ! -d "$PROJECT_DIR" ]]; then
    log "[$IDX/$TOTAL] ERROR: project directory not found: $PROJECT_DIR — stopping queue."
    FAILED=1
    break
  fi
  SLUG="$(basename "$PROJECT_DIR")"
  RENDERS_DIR="$PROJECT_DIR/renders"
  OUTPUT="$RENDERS_DIR/$SLUG.mov"
  mkdir -p "$RENDERS_DIR"

  log "[$IDX/$TOTAL] === $SLUG ==="

  if [[ -f "$OUTPUT" && "$FORCE" -eq 0 ]]; then
    log "[$IDX/$TOTAL] $SLUG: renders/$SLUG.mov already exists — skipping (pass --force to re-render)."
    continue
  fi

  FPS=$(python3 -c "import json; print(json.load(open('$PROJECT_DIR/meta.json')).get('fps',30))" 2>/dev/null || echo 30)
  DURATION=$(grep -o 'data-duration="[0-9.]*"' "$PROJECT_DIR/index.html" 2>/dev/null | head -1 | grep -o '[0-9.]*')

  log "[$IDX/$TOTAL] $SLUG: phase 1/2 — PNG-sequence capture (fps=$FPS, duration=${DURATION:-unknown}s). Watch live with:"
  log "    bash .claude/skills/render-progress/scripts/render-progress.sh ${PROJECT_DIR#$REPO_ROOT/}"

  rm -rf "$RENDERS_DIR/png-seq"
  # HF_WORKERS=<n> forces the capture worker count (default: HyperFrames auto).
  ( cd "$PROJECT_DIR" && npx hyperframes render -q standard --format png-sequence ${HF_WORKERS:+--workers "$HF_WORKERS"} -o renders/png-seq ) \
    2>&1 | tee "$RENDERS_DIR/capture.log"
  CAPTURE_STATUS=${PIPESTATUS[0]}

  if [[ $CAPTURE_STATUS -ne 0 ]]; then
    log "[$IDX/$TOTAL] $SLUG: capture FAILED (exit $CAPTURE_STATUS) — see renders/capture.log. Stopping queue."
    FAILED=1
    break
  fi

  PNG_PATTERN=$(ls "$RENDERS_DIR/png-seq" 2>/dev/null | grep -E '^frame_[0-9]+\.png$' | head -1 | sed -E 's/frame_[0-9]+/frame_%06d/')
  if [[ -z "$PNG_PATTERN" ]]; then
    log "[$IDX/$TOTAL] $SLUG: could not find frame_NNNNNN.png output in renders/png-seq — stopping queue for manual inspection."
    FAILED=1
    break
  fi
  if [[ ! -f "$RENDERS_DIR/png-seq/audio.m4a" ]]; then
    log "[$IDX/$TOTAL] $SLUG: no renders/png-seq/audio.m4a sidecar found — stopping queue for manual inspection."
    FAILED=1
    break
  fi

  log "[$IDX/$TOTAL] $SLUG: phase 2/2 — HEVC+alpha ffmpeg encode -> renders/$SLUG.mov"

  ( cd "$PROJECT_DIR" && ffmpeg -y -framerate "$FPS" -i "renders/png-seq/$PNG_PATTERN" \
      -i renders/png-seq/audio.m4a \
      -c:v hevc_videotoolbox -alpha_quality 0.9 -tag:v hvc1 -pix_fmt bgra \
      -allow_sw 1 -c:a aac -b:a 192k -shortest \
      -y "renders/$SLUG.mov" ) 2>&1 | tee "$RENDERS_DIR/ffmpeg-encode.log"
  ENCODE_STATUS=${PIPESTATUS[0]}

  if [[ $ENCODE_STATUS -ne 0 || ! -f "$OUTPUT" ]]; then
    log "[$IDX/$TOTAL] $SLUG: encode FAILED (exit $ENCODE_STATUS) — see renders/ffmpeg-encode.log. Stopping queue."
    FAILED=1
    break
  fi

  SIZE=$(du -h "$OUTPUT" 2>/dev/null | cut -f1)
  log "[$IDX/$TOTAL] $SLUG: done — renders/$SLUG.mov ($SIZE). Not verified automatically; review it yourself."
done

if [[ $FAILED -eq 1 ]]; then
  log "==== Render queue stopped early after failure ===="
  exit 1
else
  log "==== Render queue finished: $IDX/$TOTAL project(s) processed ===="
fi
