#!/usr/bin/env python3
"""
Test MacWhisper → HyperFrames kit adapter.

Generates a synthetic speech sample, transcribes it with MacWhisper,
and validates the output is in the correct kit format.
"""

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

HOME = Path.home()
MW_SUPPORT = HOME / "Library" / "Application Support" / "MacWhisper"
MODELS_DIR = MW_SUPPORT / "models"
SAY_TEST_AIFF = HOME / "Desktop" / "say-test.aiff"
SAY_TEST_WAV = Path("/tmp/say-test.wav")
MACWHISPER_CLI = "/Applications/MacWhisper.app/Contents/MacOS/mw"
MACWHISPER_APP = "/Applications/MacWhisper.app"


def is_macos_say_available():
    """Check if macOS say command works for generating test audio."""
    try:
        r = subprocess.run(
            ["say", "test", "-o", str(SAY_TEST_AIFF)],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return r.returncode == 0 and SAY_TEST_AIFF.exists()
    except Exception:
        return False


def generate_test_audio():
    """Generate a test speech clip using macOS say."""
    print("Generating test speech with macOS say…")
    SAY_TEST_AIFF.parent.mkdir(parents=True, exist_ok=True)
    # Remove old test files
    for f in [SAY_TEST_AIFF, SAY_TEST_WAV]:
        try:
            f.unlink()
        except FileNotFoundError:
            pass

    r = subprocess.run(
        ["say", "Hello world this is a test recording for the video editing pipeline. "
                "The quick brown fox jumps over the lazy dog near the river bank.",
         "-v", "Samantha", "-o", str(SAY_TEST_AIFF)],
        capture_output=True,
        text=True,
        timeout=15,
    )
    if r.returncode != 0:
        print(f"say failed: {r.stderr}", file=sys.stderr)
        return None

    if not SAY_TEST_AIFF.exists():
        print("say did not create AIFF file", file=sys.stderr)
        return None

    print(f"Generated: {SAY_TEST_AIFF} ({SAY_TEST_AIFF.stat().st_size} bytes)")

    # Convert to WAV
    r = subprocess.run(
        ["ffmpeg", "-y", "-i", str(SAY_TEST_AIFF),
         "-ar", "16000", "-ac", "1", str(SAY_TEST_WAV)],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if r.returncode != 0:
        print(f"ffmpeg conversion failed: {r.stderr}", file=sys.stderr)
        return None

    print(f"Converted: {SAY_TEST_WAV} ({SAY_TEST_WAV.stat().st_size} bytes)")
    return SAY_TEST_WAV


def get_model_id():
    """Read the model ID from MacWhisper's state."""
    # Try to find whisper-large-v3
    candidate = MODELS_DIR / "whisperkit" / "models" / "openai" / "whisper-large-v3"
    if candidate.exists():
        return "whisperkit:openai/whisper-large-v3"
    
    # Try whisperkit-pro
    candidate = MODELS_DIR / "whisperkitpro" / "models" / "openai" / "whisper-large-v3"
    if candidate.exists():
        return "whisperkitpro:openai/whisper-large-v3"
    
    # Try coreml variant
    candidate = MODELS_DIR / "whisperkit" / "models" / "argmaxinc" / "whisperkit-coreml" / "openai_whisper-large-v3"
    if candidate.exists():
        return "whisperkit:argmaxinc/whisperkit-coreml/openai_whisper-large-v3"
    
    return None


def launch_mw_and_wait(timeout=120):
    """Launch MacWhisper and wait for the CLI socket to be ready."""
    # Check if already running
    r = subprocess.run(["pgrep", "-x", "MacWhisper"], capture_output=True)
    if r.returncode == 0:
        print("MacWhisper already running")
        return True
    
    print("Launching MacWhisper…")
    subprocess.Popen(
        [MACWHISPER_APP],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = subprocess.run(["pgrep", "-x", "MacWhisper"], capture_output=True)
        if r.returncode == 0:
            # Wait for socket
            cli_sock = MW_SUPPORT / "cli.sock"
            if cli_sock.exists():
                print("MacWhisper launched, socket ready")
                return True
        time.sleep(2)
    
    print("ERROR: MacWhisper failed to launch", file=sys.stderr)
    return False


def transcribe_with_mw(input_file: Path, model_id: str) -> Optional[Path]:
    """Run mw transcribe and return the output JSON path."""
    output_json = Path("/tmp/mw-transcription.json")
    if output_json.exists():
        output_json.unlink()
    
    cmd = [
        MACWHISPER_CLI,
        "transcribe",
        str(input_file),
        "--model", model_id,
        "--format", "json",
        "--output", str(output_json),
    ]
    
    print(f"Transcribing with: {' '.join(cmd)}")
    print("(This may take a while for large models…)")
    
    deadline = time.time() + 600  # 10 minutes
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired:
        print("ERROR: transcribe timed out", file=sys.stderr)
        return None
    
    print(f"mw exit code: {p.returncode}")
    if p.stdout:
        print(f"mw stdout: {p.stdout[:500]}")
    if p.stderr:
        print(f"mw stderr: {p.stderr[:500]}")
    
    if p.returncode != 0 or not output_json.exists():
        print("ERROR: transcription failed", file=sys.stderr)
        return None
    
    print(f"Output: {output_json} ({output_json.stat().st_size} bytes)")
    return output_json


def convert_to_kit_format(mw_json: Path) -> dict:
    """Convert MacWhisper JSON to kit format."""
    with open(mw_json) as f:
        data = json.load(f)
    
    words = []
    full_text = []
    audio_duration = 0.0
    
    for segment in data.get("segments", []):
        seg_text = segment.get("text", "").strip()
        if seg_text:
            full_text.append(seg_text)
        
        seg_start = float(segment.get("start", 0))
        seg_end = float(segment.get("end", seg_start))
        audio_duration = max(audio_duration, seg_end)
        
        segment_words = segment.get("words", [])
        if segment_words:
            # Use word-level timestamps from MacWhisper
            for w in segment_words:
                word_text = (w.get("text") or "").strip()
                if word_text:
                    words.append({
                        "text": word_text,
                        "start": float(w.get("start", seg_start)),
                        "end": float(w.get("end", seg_end)),
                    })
        else:
            # No word-level data — split segment text into words
            if seg_text:
                tokens = seg_text.split()
                if tokens:
                    span = seg_end - seg_start
                    slot = span / len(tokens) if len(tokens) > 1 else span
                    for i, token in enumerate(tokens):
                        words.append({
                            "text": token,
                            "start": seg_start + i * slot,
                            "end": seg_start + (i + 1) * slot,
                        })
    
    return {
        "text": " ".join(full_text).strip(),
        "audio_duration_secs": round(audio_duration, 3),
        "words": words,
    }


def main():
    print("=" * 60)
    print("MacWhisper → HyperFrames Kit Adapter Test")
    print("=" * 60)
    
    # Step 1: Check prerequisites
    print("\n[1] Checking prerequisites…")
    
    if not Path(MACWHISPER_CLI).exists():
        print(f"ERROR: MacWhisper CLI not found: {MACWHISPER_CLI}", file=sys.stderr)
        sys.exit(1)
    
    print(f"  MacWhisper CLI: {MACWHISPER_CLI}")
    print(f"  Models dir: {MODELS_DIR}")
    
    model_id = get_model_id()
    if model_id:
        print(f"  Model: {model_id}")
    else:
        print("  ERROR: no whisper model found", file=sys.stderr)
        sys.exit(1)
    
    # List available models
    print("\n  Available model engines:")
    for engine_dir in MODELS_DIR.iterdir():
        if engine_dir.is_dir():
            print(f"    - {engine_dir.name}")
    
    # Step 2: Generate test audio
    print("\n[2] Generating test audio…")
    input_file = generate_test_audio()
    if input_file is None:
        print("ERROR: could not generate test audio", file=sys.stderr)
        sys.exit(1)
    
    # Step 3: Launch MacWhisper
    print("\n[3] Launching MacWhisper…")
    if not launch_mw_and_wait():
        print("ERROR: cannot proceed", file=sys.stderr)
        sys.exit(1)
    
    # Step 4: Transcribe
    print("\n[4] Transcribing…")
    mw_json = transcribe_with_mw(input_file, model_id)
    if mw_json is None:
        print("ERROR: transcription failed", file=sys.stderr)
        sys.exit(1)
    
    # Step 5: Convert to kit format
    print("\n[5] Converting to kit format…")
    kit_data = convert_to_kit_format(mw_json)
    
    output_kit = Path("/tmp/kit-transcription.json")
    with open(output_kit, "w") as f:
        json.dump(kit_data, f, indent=2)
        f.write("\n")
    
    print(f"\n  Kit transcript: {output_kit}")
    print(f"  Duration: {kit_data['audio_duration_secs']}s")
    print(f"  Words: {len(kit_data['words'])}")
    print(f"  Text: {kit_data['text'][:100]}…")
    
    # Step 6: Validate format
    print("\n[6] Validating kit format…")
    
    required_fields = ["text", "audio_duration_secs", "words"]
    for field in required_fields:
        if field not in kit_data:
            print(f"  ERROR: missing field '{field}'", file=sys.stderr)
            sys.exit(1)
        print(f"  ✓ {field}: {type(kit_data[field]).__name__}")
    
    if not isinstance(kit_data["words"], list):
        print("  ERROR: 'words' must be a list", file=sys.stderr)
        sys.exit(1)
    
    for i, word in enumerate(kit_data["words"][:5]):
        for wf in ["text", "start", "end"]:
            if wf not in word:
                print(f"  ERROR: word {i} missing '{wf}'", file=sys.stderr)
                sys.exit(1)
        print(f"  ✓ word[{i}]: '{word['text']}' [{word['start']:.2f}s - {word['end']:.2f}s]")
    
    if len(kit_data["words"]) > 5:
        print(f"  … and {len(kit_data['words']) - 5} more words")
    
    # Validate timestamps are monotonic
    prev_end = 0.0
    for word in kit_data["words"]:
        if word["start"] < prev_end - 0.01:
            print(f"  WARNING: non-monotonic timestamp at '{word['text']}'")
        prev_end = word["end"]
    
    print("\n✓ All checks passed!")
    print(f"\nKit transcript saved to: {output_kit}")
    
    # Also save to the kit scripts directory for reference
    kit_script = Path(__file__).parent / "mw-transcribe.py"
    if kit_script.exists():
        print(f"\nTo transcribe your own footage:")
        print(f"  python3 {kit_script} /path/to/your/video.mp4")
        print(f"  # or with explicit model:")
        print(f"  python3 {kit_script} /path/to/video.mp4 --model {model_id}")


if __name__ == "__main__":
    main()
