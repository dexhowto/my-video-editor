#!/usr/bin/env python3
"""
MacWhisper → HyperFrames kit transcript adapter.

MacWhisper's CLI (mw) requires the GUI app to be running and can hang.
This adapter instead drives MacWhisper's local REST API if available,
or falls back to the CLI with proper timeout/retry.

Output: writes a JSON file in the kit's expected word-level transcript
format:
{
  "text": "...",
  "audio_duration_secs": ...,
  "words": [{"text": "...", "start": ..., "end": ...}, ...]
}

Usage:
  python3 mw-transcribe.py <input-audio-or-video> [--output <file>] [--model <engine:model-id>]
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Optional


MACWHISPER_CLI = "/Applications/MacWhisper.app/Contents/MacOS/mw"
MACWHISPER_APP = "/Applications/MacWhisper.app"


def is_app_running():
    """Check if MacWhisper GUI app is running (needed for CLI)."""
    return shutil.which("pgrep") is not None and (
        subprocess.run(
            ["pgrep", "-x", "MacWhisper"], capture_output=True
        ).returncode
        == 0
    )


def ensure_app_running(timeout=90):
    """Launch MacWhisper if not running, wait for it."""
    if is_app_running():
        return True
    print("MacWhisper not running — launching…")
    subprocess.Popen([MACWHISPER_APP], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.time() + timeout
    while time.time() < deadline:
        if is_app_running():
            print("MacWhisper launched.")
            return True
        time.sleep(2)
    print("ERROR: MacWhisper failed to launch within timeout.", file=sys.stderr)
    return False


def get_active_model():
    """Ask mw for the currently selected model."""
    try:
        r = subprocess.run(
            [MACWHISPER_CLI, "models", "list"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        # Parse "Selected: <engine>:<model-id>" or similar
        for line in r.stdout.splitlines():
            if "selected" in line.lower() or "default" in line.lower():
                m = re.search(r"(\w+:\S+)", line)
                if m:
                    return m.group(1)
    except (subprocess.TimeoutExpired, Exception):
        pass
    return None


def transcribe_cli(input_path: Path, output_json: Path, model: Optional[str] = None):
    """
    Run mw transcribe, producing a JSON file.
    Returns the path to the output file.
    """
    cmd = [MACWHISPER_CLI, "transcribe", str(input_path)]
    if model:
        cmd += ["--model", model]
    else:
        active = get_active_model()
        if active:
            cmd += ["--model", active]
    # MacWhisper JSON output is fully structured; --style/--timestamps don't apply.
    cmd += ["--format", "json", "--output", str(output_json)]
    print(f"Running: {' '.join(cmd)}")
    cli_timeout = 1800  # 30 min max
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=cli_timeout)
    except subprocess.TimeoutExpired:
        print(f"ERROR: mw transcribe timed out after {cli_timeout}s.", file=sys.stderr)
        return None
    if p.returncode != 0:
        print("STDERR:", p.stderr.strip(), file=sys.stderr)
        return None
    if not output_json.exists():
        print("ERROR: mw did not write output file.", file=sys.stderr)
        return None
    return output_json


def mac_whisper_json_to_kit_json(mw_json_path: Path) -> dict:
    """
    Convert MacWhisper's JSON output into the kit's word-level transcript
    format: { text, audio_duration_secs, words: [{text, start, end}] }.

    MacWhisper's actual `mw transcribe --format json` output (verified against
    a real run, not the vendor docs) has no top-level "type"/"language"/"model"
    keys, and segment/word "start"/"end" are **milliseconds**, not seconds:
    {
      "text": "full transcript text",
      "segments": [
        {
          "id": "...",
          "text": "Hello world.",
          "start": 20,
          "end": 1200,
          "words": [  // may or may not be present
            {"text":" Hello","start":20,"end":500},
            {"text":" world.","start":500,"end":1200}
          ]
        }
      ]
    }
    """
    with open(mw_json_path) as f:
        data = json.load(f)

    # Collect words from segments
    words = []
    full_text_parts = []
    audio_duration = 0.0

    MS_TO_S = 1000.0

    segments = data.get("segments", [])
    for seg in segments:
        seg_text = seg.get("text", "").strip()
        if seg_text:
            full_text_parts.append(seg_text)
        seg_start = float(seg.get("start", 0)) / MS_TO_S
        seg_end = float(seg.get("end", seg.get("start", 0))) / MS_TO_S
        audio_duration = max(audio_duration, seg_end)

        seg_words = seg.get("words", [])
        if seg_words:
            # Words carry their own start/end
            for w in seg_words:
                t = (w.get("text") or "").strip()
                if t:
                    words.append(
                        {
                            "text": t,
                            "start": float(w.get("start", seg_start * MS_TO_S)) / MS_TO_S,
                            "end": float(w.get("end", seg_end * MS_TO_S)) / MS_TO_S,
                        }
                    )
        else:
            # No word-level data in this segment — approximate by splitting
            # the segment text into words and spreading evenly.
            if seg_text:
                tokens = seg_text.split()
                if tokens:
                    span = seg_end - seg_start
                    slot = span / len(tokens) if len(tokens) > 1 else span
                    for i, tok in enumerate(tokens):
                        words.append(
                            {
                                "text": tok,
                                "start": seg_start + i * slot,
                                "end": seg_start + (i + 1) * slot,
                            }
                        )

    kit = {
        "text": " ".join(full_text_parts).strip(),
        "audio_duration_secs": round(audio_duration, 3),
        "words": words,
    }
    return kit


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("input", type=Path, help="Audio/video file to transcribe")
    p.add_argument(
        "--output", "-o", type=Path, help="Output JSON path (default: <input>.kit.json)"
    )
    p.add_argument(
        "--model",
        help="MacWhisper model ID, engine:model-id format (default: currently selected)",
    )
    p.add_argument(
        "--no-launch",
        action="store_true",
        help="Don't launch MacWhisper app if not running",
    )
    args = p.parse_args()

    if not args.input.exists():
        print(f"ERROR: input not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    out = args.output or args.input.with_suffix(".kit.json")
    out.parent.mkdir(parents=True, exist_ok=True)

    if not args.no_launch:
        if not ensure_app_running():
            print("ERROR: cannot proceed without MacWhisper running.", file=sys.stderr)
            sys.exit(1)

    mw_json = out.with_suffix(".mw.json")
    result = transcribe_cli(args.input, mw_json, args.model)
    if result is None:
        sys.exit(1)

    kit = mac_whisper_json_to_kit_json(result)
    with open(out, "w") as f:
        json.dump(kit, f, indent=2)
        f.write("\n")

    print(f"Wrote kit transcript: {out}")
    print(f"  words: {len(kit['words'])}, duration: {kit['audio_duration_secs']}s")
    print(f"  text: {kit['text'][:120]}{'…' if len(kit['text']) > 120 else ''}")


if __name__ == "__main__":
    main()
