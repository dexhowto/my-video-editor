#!/usr/bin/env node
// Normalize the loudness of a voice track, narration, or finished video so it
// is easy to hear and every video plays at the same level.
//
//   node scripts/normalize-audio.mjs <input> [output] [--lufs -16] [--tp -1.5] [--check]
//
// Two-pass EBU R128 loudnorm: the first pass measures, the second applies the
// measured values. Default target: -16 LUFS integrated, true peak -1.5 dBFS
// (YouTube, Shorts, Reels). The output keeps the input length, so A/V sync and
// transcript timestamps stay valid.
//
// - Video input: the video stream is copied untouched; only the audio is
//   re-encoded (AAC 256k).
// - Audio input: .wav -> 48 kHz 16-bit PCM, .mp3 -> MP3 256k, .m4a/.aac -> AAC 256k.
// - Default output: <stem>.norm<ext> next to the input (the input is never changed).
// - --check: measure and print only, write nothing.

import { existsSync } from "node:fs";
import { dirname, join, basename, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function die(msg) { console.error(`error: ${msg}`); process.exit(1); }

const argv = process.argv.slice(2);
const opt = name => {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const lufs = Number(opt("--lufs") ?? -16);
const tp = Number(opt("--tp") ?? -1.5);
const check = argv.includes("--check");
const files = argv.filter(a => !a.startsWith("--"));
if (!files.length) die("usage: normalize-audio.mjs <input> [output] [--lufs -16] [--tp -1.5] [--check]");
if (!Number.isFinite(lufs) || !Number.isFinite(tp)) die("--lufs and --tp must be numbers");

const input = resolve(files[0]);
if (!existsSync(input)) die(`missing file: ${input}`);
const ext = extname(input).toLowerCase();
const output = resolve(files[1] ?? join(dirname(input), basename(input, extname(input)) + ".norm" + extname(input)));
if (!check && output === input) die("output must differ from input");

const pr = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "json", input],
  { encoding: "utf8" });
if (pr.status !== 0) die(`ffprobe failed: ${pr.stderr.trim()}`);
const types = JSON.parse(pr.stdout).streams.map(s => s.codec_type);
if (!types.includes("audio")) die(`no audio stream in ${input}`);
const hasVideo = types.includes("video");

const ln = `loudnorm=I=${lufs}:TP=${tp}:LRA=11`;

function measure(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-map", "0:a:0",
    "-af", `${ln}:print_format=json`, "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 << 20 });
  const json = r.status === 0 && r.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
  if (!json) die(`loudness measure failed for ${file}`);
  return JSON.parse(json[0]);
}

const m = measure(input);
console.log(`${basename(input)}: ${m.input_i} LUFS, true peak ${m.input_tp} dBFS, LRA ${m.input_lra} LU`);
if (check) process.exit(0);
if (!Number.isFinite(Number(m.input_i))) die("audio is silent; nothing to normalize");

const af = `${ln}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}` +
  `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
const args = ["-v", "error", "-y", "-i", input];
if (hasVideo) {
  args.push("-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy", "-af", af, "-ar", "48000",
    "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart");
} else {
  args.push("-map", "0:a:0", "-af", af, "-ar", "48000");
  if (ext === ".mp3") args.push("-c:a", "libmp3lame", "-b:a", "256k");
  else if (ext === ".m4a" || ext === ".aac") args.push("-c:a", "aac", "-b:a", "256k");
  else args.push("-c:a", "pcm_s16le");
}
args.push(output);
const r = spawnSync("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"] });
if (r.status !== 0) die(`ffmpeg failed (exit ${r.status})`);

const after = measure(output);
console.log(`${basename(output)}: ${after.input_i} LUFS, true peak ${after.input_tp} dBFS`);
console.log(`wrote ${output}`);
