#!/usr/bin/env bash
# Live progress monitor for a hyperframes render, covering BOTH phases of the
# HEVC+alpha overlays-project export workflow, for a single project or for
# the whole scripts/render-queue.sh queue:
#
#   Phase 1 — hyperframes frame capture (standard MP4, --format png-sequence,
#             or otherwise). The CLI's own progress bar only flushes to the
#             log once the whole render finishes, so this reads frame counts
#             directly from renders/work-*/capture-attempt-*/worker-*/ on
#             disk instead.
#   Phase 2 — a separate `ffmpeg` encode pass (e.g. the PNG-sequence ->
#             HEVC+alpha .mov step), if one is running. `ffmpeg` DOES print
#             live stats (frame=/time=/speed=) on its own, but only to
#             stderr of that specific process — this script reads them back
#             out of a log file, so redirect ffmpeg's output to
#             renders/ffmpeg-encode.log when you run the encode (see below).
#
# Usage:
#   render-progress.sh <project-dir> [total-frames] [interval-seconds]
#   render-progress.sh --queue [interval-seconds]
#
#   <project-dir>      Path to a single video project (contains renders/).
#                       Watches that project's capture then encode, then
#                       exits once the encode completes (or, if no encode
#                       ever starts, keeps watching indefinitely — same as
#                       before).
#   --queue             Follow scripts/render-queue.sh across ALL projects
#                       it processes, one after another, without needing to
#                       be re-run — it re-targets itself at each project as
#                       render-queue.log (repo root) reports the queue
#                       advancing, and exits once the queue itself finishes
#                       or stops on a failure. Run from the repo root (same
#                       assumption render-queue.sh itself makes).
#   [total-frames]     Expected total frame count (fps * duration) for phase
#                       1, single-project mode only. If omitted, inferred
#                       from the project's meta.json "fps" (falls back to
#                       30) and index.html's root data-duration.
#   [interval-seconds] Poll interval, default 5s. In --queue mode this is
#                       the second argument instead of the third.
#
# To get real phase-2 progress, redirect the ffmpeg encode's output to a log
# file the script knows to look for (scripts/render-queue.sh already does
# this for you):
#
#   ffmpeg -y -framerate 30 -i renders/png-seq/frame_%06d.png \
#     -i renders/png-seq/audio.m4a \
#     -c:v hevc_videotoolbox -alpha_quality 0.9 -tag:v hvc1 -pix_fmt bgra \
#     -allow_sw 1 -c:a aac -b:a 192k -shortest \
#     -y renders/output.mov 2>&1 | tee renders/ffmpeg-encode.log
#
# Without that log file, phase 2 falls back to just watching the output
# file's growing size as a rough heartbeat (no percentage/ETA).
#
# NOTE on `set -e`: deliberately NOT used here. This is a long-running
# monitor that polls disk state (including directories that get renamed or
# removed out from under it, e.g. a capture work-* dir right after it
# finishes assembling) — a single transient `find`/`stat` failure on a
# vanished path must not kill the whole monitor. (This bit a real run: the
# script used to exit silently the moment PNG capture finished and its
# work-* dir disappeared, right before it would have announced completion
# and moved on to watching the encode — `pipefail` turns a `find` ENOENT
# into a nonzero pipeline status, and `set -e` on a bare `VAR=$(pipeline)`
# assignment then kills the script. `-u` and `pipefail` alone don't have
# this failure mode, so those stay on.)
set -uo pipefail

INTERVAL_DEFAULT=5

# ---------------------------------------------------------------------------
# Shared helpers (used by both single-project and --queue modes)
# ---------------------------------------------------------------------------

find_work_dir() {
  local project_dir="$1"
  find "$project_dir/renders" -maxdepth 1 -type d -name 'work-*' -print0 2>/dev/null \
    | xargs -0 ls -dt 2>/dev/null | head -1
}

count_captured() {
  local work_dir="$1"
  [[ -z "$work_dir" || ! -d "$work_dir" ]] && { echo 0; return; }
  # CLI versions differ on where in-progress frames land: older/multi-worker
  # builds write under capture-attempt-*/worker-*/ (and only fill the
  # top-level captured-frames/ at the very end of the run — a late, low, or
  # empty count there during an old-style run is expected, not a stall).
  # Newer single-worker builds skip the per-worker dirs entirely and write
  # straight into captured-frames/ throughout. Both layouts are kept
  # supported side by side here (not a pick-one-and-fall-back): count each
  # pattern separately and report whichever is currently higher, so this
  # works unmodified across old- and new-style projects/CLI versions without
  # needing to know in advance which layout a given render will use.
  local per_worker top_level
  per_worker=$(find "$work_dir" -path '*/capture-attempt-*/worker-*' -type f \( -iname '*.png' -o -iname '*.jpg' \) 2>/dev/null | wc -l | tr -d ' ')
  top_level=$(find "$work_dir/captured-frames" -maxdepth 1 -type f \( -iname '*.png' -o -iname '*.jpg' \) 2>/dev/null | wc -l | tr -d ' ')
  # Retry layout: when a capture attempt fails partway, the CLI keeps the frames
  # it already finished in captured-frames/ and writes the rest under
  # capture-attempt-N/retry-*-worker-*/. Those two sets are disjoint, so add
  # them; taking the higher one alone would freeze the count at the
  # pre-failure frames while the retry runs.
  local retry_files
  retry_files=$(find "$work_dir" -path '*/capture-attempt-*/retry-*' -type f \( -iname '*.png' -o -iname '*.jpg' \) 2>/dev/null | wc -l | tr -d ' ')
  if (( retry_files > 0 )); then
    echo $(( retry_files + top_level ))
  elif (( per_worker > top_level )); then
    echo "$per_worker"
  else
    echo "$top_level"
  fi
}

find_ffmpeg_log() {
  local project_dir="$1"
  find "$project_dir/renders" -maxdepth 1 -type f -name 'ffmpeg-encode*.log' -print0 2>/dev/null \
    | xargs -0 ls -t 2>/dev/null | head -1
}

# ffmpeg writes its stats line with \r between updates (even when piped), so
# normalize those to newlines before grepping for the last real value.
ffmpeg_last_field() {
  local log_file="$1" field="$2"
  [[ -f "$log_file" ]] || { echo ""; return; }
  tail -c 20000 "$log_file" 2>/dev/null | tr '\r' '\n' | grep -o "${field}=[^ ]*" 2>/dev/null | tail -1 | cut -d'=' -f2
  true
}

hhmmss_to_secs() {
  # "00:03:21.45" -> 201.45
  python3 -c "
t='$1'.strip()
try:
    h,m,s = t.split(':')
    print(float(h)*3600 + float(m)*60 + float(s))
except Exception:
    print(0)
" 2>/dev/null || echo 0
}

# ---------------------------------------------------------------------------
# watch_one_project <project-dir> <interval> [total-frames]
#
# Watches a single project through capture then encode. Returns (does not
# exit the shell) once the encode completes, OR once EARLY_STOP_CHECK (a
# function name, if set in the caller's $EARLY_STOP_CHECK var) reports the
# project is done some other way (used by --queue mode to also notice a
# capture/encode FAILURE or a skip, not just a successful encode, without
# hanging forever waiting for an encode log that will never appear).
# ---------------------------------------------------------------------------
watch_one_project() {
  local PROJECT_DIR="$1" INTERVAL="$2" TOTAL_FRAMES="${3:-}"

  if [[ ! -d "$PROJECT_DIR" ]]; then
    echo "ERROR: project directory not found: $PROJECT_DIR" >&2
    return 1
  fi

  local FPS=30 DURATION_SECS="" META_JSON="$PROJECT_DIR/meta.json" INDEX_HTML="$PROJECT_DIR/index.html"
  if [[ -f "$META_JSON" ]]; then
    local META_FPS
    META_FPS=$(python3 -c "import json; print(json.load(open('$META_JSON')).get('fps',''))" 2>/dev/null)
    [[ -n "$META_FPS" ]] && FPS="$META_FPS"
  fi
  if [[ -f "$INDEX_HTML" ]]; then
    DURATION_SECS=$(grep -o 'data-duration="[0-9.]*"' "$INDEX_HTML" 2>/dev/null | head -1 | grep -o '[0-9.]*')
  fi

  if [[ -z "$TOTAL_FRAMES" ]]; then
    if [[ -n "$DURATION_SECS" ]]; then
      TOTAL_FRAMES=$(python3 -c "import math; print(math.ceil(${DURATION_SECS} * ${FPS}))")
      echo "Inferred total frames: $TOTAL_FRAMES (duration ${DURATION_SECS}s @ ${FPS}fps — pass an explicit count as arg 2 if this is wrong)"
    fi
  fi
  if [[ -z "$TOTAL_FRAMES" ]]; then
    echo "ERROR: could not infer total frame count (no readable meta.json/index.html); pass it explicitly as arg 2." >&2
    return 1
  fi
  if [[ -n "$DURATION_SECS" ]]; then
    echo "Total video duration: ${DURATION_SECS}s (used for phase-2 encode percentage, if an ffmpeg-encode.log is found)"
  fi

  echo "Watching for a render work directory or ffmpeg encode log under $PROJECT_DIR/renders ..."
  local WORK_DIR="" FFMPEG_LOG=""
  while [[ -z "$WORK_DIR" && -z "$FFMPEG_LOG" ]]; do
    WORK_DIR=$(find_work_dir "$PROJECT_DIR")
    FFMPEG_LOG=$(find_ffmpeg_log "$PROJECT_DIR")
    if [[ -n "${EARLY_STOP_CHECK:-}" ]] && "$EARLY_STOP_CHECK"; then
      echo "(project resolved before any render activity appeared on disk — moving on)"
      return 0
    fi
    [[ -z "$WORK_DIR" && -z "$FFMPEG_LOG" ]] && sleep "$INTERVAL"
  done

  local CAPTURE_DONE=0
  if [[ -n "$WORK_DIR" ]]; then
    echo "Found work directory: $WORK_DIR"
    echo "Target: $TOTAL_FRAMES frames"
  else
    CAPTURE_DONE=1
  fi
  echo

  local START_TS
  if [[ -n "$WORK_DIR" ]]; then
    START_TS=$(stat -f '%B' "$WORK_DIR" 2>/dev/null || stat -c '%W' "$WORK_DIR" 2>/dev/null || date +%s)
  else
    START_TS=$(date +%s)
  fi
  [[ -z "$START_TS" || "$START_TS" == "-1" || "$START_TS" == "0" ]] && START_TS=$(date +%s)

  local LAST_COUNT=-1 STALL_TICKS=0 ASSEMBLY_ANNOUNCED=0 ENCODE_START_TS="" ENCODE_ANNOUNCED=0

  while true; do
    local NOW; NOW=$(date +%s)

    if [[ -n "${EARLY_STOP_CHECK:-}" ]] && "$EARLY_STOP_CHECK"; then
      printf "\r\033[K"
      echo "(queue log reports this project is done — moving on)"
      return 0
    fi

    # ---- Phase 1: hyperframes frame capture ----
    if (( CAPTURE_DONE == 0 )); then
      local CUR_WORK_DIR; CUR_WORK_DIR=$(find_work_dir "$PROJECT_DIR")
      [[ -n "$CUR_WORK_DIR" ]] && WORK_DIR="$CUR_WORK_DIR"
      local COUNT; COUNT=$(count_captured "$WORK_DIR")
      local ELAPSED=$((NOW - START_TS))

      if (( COUNT >= TOTAL_FRAMES )); then
        printf "\r\033[K"
        echo "Capture complete: $COUNT/$TOTAL_FRAMES frames in ${ELAPSED}s."
        CAPTURE_DONE=1
      else
        local PCT=$(( COUNT * 100 / TOTAL_FRAMES ))
        local BAR_WIDTH=30
        local FILLED=$(( PCT * BAR_WIDTH / 100 ))
        local BAR; BAR=$(printf '%*s' "$FILLED" '' | tr ' ' '#')
        BAR=$(printf '%-*s' "$BAR_WIDTH" "$BAR")

        local RATE="" ETA=""
        if (( ELAPSED > 0 && COUNT > 0 )); then
          local FPS_RATE; FPS_RATE=$(python3 -c "print(f'{${COUNT}/${ELAPSED}:.1f}')" 2>/dev/null || echo "")
          local REMAINING=$(( TOTAL_FRAMES - COUNT ))
          local ETA_SECS; ETA_SECS=$(python3 -c "print(int(${REMAINING} / (${COUNT}/${ELAPSED})) if ${COUNT} > 0 else 0)" 2>/dev/null || echo "")
          [[ -n "$FPS_RATE" ]] && RATE=" ${FPS_RATE} fr/s"
          [[ -n "$ETA_SECS" ]] && ETA=" ETA ${ETA_SECS}s"
        fi

        printf "\r\033[K  [capture] [%s] %3d%%  %d/%d frames  %ss elapsed%s%s" \
          "$BAR" "$PCT" "$COUNT" "$TOTAL_FRAMES" "$ELAPSED" "$RATE" "$ETA"

        if (( COUNT == LAST_COUNT )); then
          STALL_TICKS=$((STALL_TICKS + 1))
          if (( STALL_TICKS == 24 )); then
            printf "\n  (no new frames in ~%ss — capture may be stalled or between workers' batches)\n" $(( STALL_TICKS * INTERVAL ))
          fi
        else
          STALL_TICKS=0
        fi
        LAST_COUNT=$COUNT

        sleep "$INTERVAL"
        continue
      fi
    fi

    # ---- Phase 2: separate ffmpeg encode (if any) ----
    local CUR_FFMPEG_LOG; CUR_FFMPEG_LOG=$(find_ffmpeg_log "$PROJECT_DIR")
    [[ -n "$CUR_FFMPEG_LOG" ]] && FFMPEG_LOG="$CUR_FFMPEG_LOG"

    if [[ -n "$FFMPEG_LOG" && -f "$FFMPEG_LOG" ]]; then
      if [[ -z "$ENCODE_START_TS" ]]; then
        ENCODE_START_TS=$(stat -f '%B' "$FFMPEG_LOG" 2>/dev/null || stat -c '%W' "$FFMPEG_LOG" 2>/dev/null || date +%s)
        [[ -z "$ENCODE_START_TS" || "$ENCODE_START_TS" == "-1" || "$ENCODE_START_TS" == "0" ]] && ENCODE_START_TS=$(date +%s)
      fi
      if (( ENCODE_ANNOUNCED == 0 )); then
        echo "Found ffmpeg encode log: $FFMPEG_LOG"
        ENCODE_ANNOUNCED=1
      fi

      local ENCODE_ELAPSED=$((NOW - ENCODE_START_TS))
      local TIME_STR; TIME_STR=$(ffmpeg_last_field "$FFMPEG_LOG" "time")
      local SPEED_STR; SPEED_STR=$(ffmpeg_last_field "$FFMPEG_LOG" "speed" | tr -d 'x')
      local FRAME_STR; FRAME_STR=$(ffmpeg_last_field "$FFMPEG_LOG" "frame")

      if grep -qi "^Lmux\|muxing overhead\|video:.*audio:.*global headers" <(tail -c 4000 "$FFMPEG_LOG" 2>/dev/null) 2>/dev/null; then
        printf "\r\033[K"
        echo "Encode complete (${ENCODE_ELAPSED}s)."
        return 0
      fi

      if [[ -n "$TIME_STR" && -n "$DURATION_SECS" ]]; then
        local ENC_SECS; ENC_SECS=$(hhmmss_to_secs "$TIME_STR")
        local PCT; PCT=$(python3 -c "print(min(100, int(${ENC_SECS}/${DURATION_SECS}*100)))" 2>/dev/null || echo 0)
        local BAR_WIDTH=30
        local FILLED=$(( PCT * BAR_WIDTH / 100 ))
        local BAR; BAR=$(printf '%*s' "$FILLED" '' | tr ' ' '#')
        BAR=$(printf '%-*s' "$BAR_WIDTH" "$BAR")

        local SPEED_DISP="" ETA=""
        [[ -n "$SPEED_STR" ]] && SPEED_DISP=" speed ${SPEED_STR}x"
        if [[ -n "$SPEED_STR" ]] && python3 -c "exit(0 if float('$SPEED_STR') > 0 else 1)" 2>/dev/null; then
          local REMAINING_VIDEO_SECS; REMAINING_VIDEO_SECS=$(python3 -c "print(max(0, ${DURATION_SECS} - ${ENC_SECS}))")
          local ETA_SECS; ETA_SECS=$(python3 -c "print(int(${REMAINING_VIDEO_SECS} / float('$SPEED_STR')))" 2>/dev/null || echo "")
          [[ -n "$ETA_SECS" ]] && ETA=" ETA ${ETA_SECS}s"
        fi
        local FRAME_DISP=""
        [[ -n "$FRAME_STR" ]] && FRAME_DISP=" frame ${FRAME_STR}"

        printf "\r\033[K  [encode ] [%s] %3s%%  %s/%ss video encoded%s%s%s  (%ss elapsed)" \
          "$BAR" "$PCT" "$TIME_STR" "$DURATION_SECS" "$FRAME_DISP" "$SPEED_DISP" "$ETA" "$ENCODE_ELAPSED"
      else
        local OUT_HINT
        OUT_HINT=$(find "$PROJECT_DIR/renders" -maxdepth 1 -type f \( -iname '*.mov' -o -iname '*.mp4' \) -newer "$FFMPEG_LOG" 2>/dev/null | head -1)
        [[ -z "$OUT_HINT" ]] && OUT_HINT=$(find "$PROJECT_DIR/renders" -maxdepth 1 -type f \( -iname '*.mov' -o -iname '*.mp4' \) 2>/dev/null | xargs -I{} ls -t {} 2>/dev/null | head -1)
        if [[ -n "$OUT_HINT" ]]; then
          local SIZE; SIZE=$(du -h "$OUT_HINT" 2>/dev/null | cut -f1)
          printf "\r\033[K  [encode ] no time= data yet ... output growing: %s (%ss elapsed)" "$SIZE" "$ENCODE_ELAPSED"
        else
          printf "\r\033[K  [encode ] starting ... (%ss elapsed)" "$ENCODE_ELAPSED"
        fi
      fi
    else
      if (( ASSEMBLY_ANNOUNCED == 0 )); then
        echo "No ffmpeg-encode.log found yet — showing output-file size as a rough heartbeat only."
        ASSEMBLY_ANNOUNCED=1
      fi
      local ELAPSED=$((NOW - START_TS))
      local OUT_HINT
      OUT_HINT=$(find "$PROJECT_DIR/renders" -maxdepth 1 -type f \( -iname '*.mov' -o -iname '*.mp4' \) 2>/dev/null | xargs -I{} ls -t {} 2>/dev/null | head -1)
      if [[ -n "$OUT_HINT" ]]; then
        local SIZE; SIZE=$(du -h "$OUT_HINT" 2>/dev/null | cut -f1)
        printf "\r\033[K  assembling ... output growing: %s (%ss elapsed)" "$SIZE" "$ELAPSED"
      else
        printf "\r\033[K  waiting for an ffmpeg encode to start ... (%ss elapsed)" "$ELAPSED"
      fi
    fi

    sleep "$INTERVAL"
  done
}

# ---------------------------------------------------------------------------
# --queue mode: follow scripts/render-queue.sh across every project it runs
# ---------------------------------------------------------------------------
run_queue_mode() {
  local INTERVAL="${1:-$INTERVAL_DEFAULT}"
  local QUEUE_LOG="$PWD/render-queue.log"

  echo "Following render queue via $QUEUE_LOG (run this from the repo root)."
  echo "Waiting for the queue to start ..."
  while [[ ! -f "$QUEUE_LOG" ]]; do sleep "$INTERVAL"; done

  local LAST_SECTION_SEEN=""
  while true; do
    # Most recent "[IDX/TOTAL] === SLUG ===" section header in the log.
    local SECTION_LINE
    SECTION_LINE=$(grep -E '\[[0-9]+/[0-9]+\] === .+ ===' "$QUEUE_LOG" 2>/dev/null | tail -1)

    if [[ -z "$SECTION_LINE" ]]; then
      if grep -q '==== Render queue finished' "$QUEUE_LOG" 2>/dev/null || grep -q '==== Render queue stopped early' "$QUEUE_LOG" 2>/dev/null; then
        echo "Queue ended with no projects processed:"
        tail -5 "$QUEUE_LOG"
        return 0
      fi
      sleep "$INTERVAL"
      continue
    fi

    local SLUG; SLUG=$(echo "$SECTION_LINE" | sed -E 's/.*=== (.+) ===.*/\1/')
    local IDXTOTAL; IDXTOTAL=$(echo "$SECTION_LINE" | grep -oE '\[[0-9]+/[0-9]+\]')

    # Has this project's own terminal line (done/skip/failure) already been
    # logged after its section header? If so it's not the active one.
    local SECTION_LINE_NUM
    SECTION_LINE_NUM=$(grep -n -F "$SECTION_LINE" "$QUEUE_LOG" | tail -1 | cut -d: -f1)
    local TAIL_AFTER
    TAIL_AFTER=$(tail -n "+$((SECTION_LINE_NUM + 1))" "$QUEUE_LOG")

    local SLUG_DONE_PATTERN
    SLUG_DONE_PATTERN="${SLUG//./\\.}: (done —|capture FAILED|encode FAILED|renders/${SLUG//./\\.}\\.mov already exists)"
    if echo "$TAIL_AFTER" | grep -qE "$SLUG_DONE_PATTERN"; then
      if echo "$TAIL_AFTER" | grep -q '==== Render queue finished' || echo "$TAIL_AFTER" | grep -q '==== Render queue stopped early'; then
        echo "Queue complete:"
        tail -5 "$QUEUE_LOG"
        return 0
      fi
      # This project already resolved but the next one hasn't logged its
      # section header yet — wait for it.
      sleep "$INTERVAL"
      continue
    fi

    if [[ "$SECTION_LINE" != "$LAST_SECTION_SEEN" ]]; then
      echo
      echo "==== Now watching queue project $IDXTOTAL: $SLUG ===="
      LAST_SECTION_SEEN="$SECTION_LINE"
    fi

    local PROJECT_DIR="video-projects/$SLUG"
    # Let the per-project watcher know how to tell if the queue has already
    # moved past this project (e.g. capture failed and no encode ever
    # started) so it doesn't wait on disk state forever.
    EARLY_STOP_CHECK="_queue_slug_done__${SLUG//[^A-Za-z0-9_]/_}"
    eval "$EARLY_STOP_CHECK() {
      local tail_after
      tail_after=\$(tail -n \"+\$(( $SECTION_LINE_NUM + 1 ))\" \"$QUEUE_LOG\" 2>/dev/null)
      echo \"\$tail_after\" | grep -qE \"$SLUG_DONE_PATTERN\"
    }"
    watch_one_project "$PROJECT_DIR" "$INTERVAL"
    unset -f "$EARLY_STOP_CHECK" 2>/dev/null || true
    unset EARLY_STOP_CHECK
  done
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if [[ "${1:-}" == "--queue" ]]; then
  run_queue_mode "${2:-$INTERVAL_DEFAULT}"
else
  PROJECT_DIR="${1:?Usage: render-progress.sh <project-dir> [total-frames] [interval-seconds]  OR  render-progress.sh --queue [interval-seconds]}"
  TOTAL_FRAMES="${2:-}"
  INTERVAL="${3:-$INTERVAL_DEFAULT}"
  watch_one_project "$PROJECT_DIR" "$INTERVAL" "$TOTAL_FRAMES"
fi
