#!/usr/bin/env node
// Build the narration WAV and one frame-exact "phone track" video that is
// already synced to the narration timeline, holding frames wherever the
// narration runs longer than the recording.
//
//   node build-phone-track.mjs <phone-plan.json> [--dry] [--crf 14]
//
// Plan (paths relative to the plan file):
// {
//   "fps": 30,
//   "narration": { "files": ["audio/01.wav", "audio/02.wav"], "gap": 0.0,
//                  "output": "assets/narration.wav",
//                  "loudnorm": -16,           // LUFS target (two-pass); false = off
//                  "pauses": [ { "at": 61.3, "dur": 1.5, "label": "Pasul 2" } ] },
//                  // silence inserted at RAW narration second `at` (the clock of
//                  // the joined files, before any pause: the step-3 transcript)
//   "duration": null,                     // default: narration length
//   "output": "assets/phone-track.mp4",
//   "size": [1180, 2556],                 // optional; default first clip's size
//   "segments": [
//     { "label": "Pasul 1", "clip": "recordings/IMG_0001.MP4",
//       "in": 0, "out": 14.2,             // source range (default whole clip)
//       "start": 20.0,                    // timeline second the segment's window opens
//       "audio": 1,                       // OR: open the window where narration file #1 starts
//       "offset": 0.0,                    // added to start/audio start
//       "lead": 1.0,                      // first-frame hold before playback, or "end"
//       "speed": 1.0,                     // 1.0-1.5 only
//       "freezes": [ { "at": 6.3, "dur": 4.0 } ]   // pause at SOURCE second `at`
//     }
//   ]
// }
//
// Each segment owns the timeline from its window start to the next segment's
// window start (the last one owns until the end). Inside that window:
// first-frame hold for `lead` seconds, then playback (with freezes), then the
// last frame holds until the window closes. Before the first window, the first
// segment's first frame holds. `lead: "end"` right-aligns playback so it
// finishes exactly when the window closes. If the playback does not fit the
// window, the script stops and prints the overflow.
//
// Section pauses: each `narration.pauses` entry inserts `dur` seconds of
// silence (default 1.5) into the narration at raw second `at`, so a new
// section's full-screen card can start in the quiet. Every other time in the
// plan (segment `start`, highlights, badges) is on the paused timeline; map a
// raw transcript time with transcript-lines.mjs --pauses <plan>. The section
// card starts 0.5 s into the pause (`cardStart` in the timeline JSON).
//
// Writes <output> (H.264, no audio, constant fps, 1 s GOP) and
// <output stem>.timeline.json (narration offsets, pauses + resolved windows).

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, renameSync } from "node:fs";
import { dirname, resolve, join, basename, extname } from "node:path";
import { spawnSync } from "node:child_process";

function die(msg) { console.error(`error: ${msg}`); process.exit(1); }

const argv = process.argv.slice(2);
const planPath = argv.find(a => !a.startsWith("--"));
if (!planPath) die("usage: build-phone-track.mjs <phone-plan.json> [--dry] [--crf 14]");
const dry = argv.includes("--dry");
const crfIdx = argv.indexOf("--crf");
const crf = crfIdx >= 0 ? argv[crfIdx + 1] : "14";

const base = dirname(resolve(planPath));
const plan = JSON.parse(readFileSync(planPath, "utf8"));
const P = p => resolve(base, p);
const F = Number(plan.fps || 30);

function probe(file) {
  if (!existsSync(file)) die(`missing file: ${file}`);
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries",
    "stream=codec_type,width,height,avg_frame_rate:stream_side_data=rotation:format=duration",
    "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) die(`ffprobe failed for ${file}: ${r.stderr.trim()}`);
  const j = JSON.parse(r.stdout);
  const v = j.streams.find(s => s.codec_type === "video");
  let w = v?.width, h = v?.height;
  const rot = Math.abs(Number(v?.side_data_list?.find(d => "rotation" in d)?.rotation || 0));
  if (rot === 90 || rot === 270) [w, h] = [h, w];
  return { duration: Number(j.format.duration), width: w, height: h };
}

function run(args, what) {
  console.log(`$ ffmpeg ${args.length > 12 ? args.slice(0, 12).join(" ") + " ..." : args.join(" ")}`);
  const r = spawnSync("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0) die(`${what} failed (ffmpeg exit ${r.status})`);
}

// Two-pass EBU R128 loudness normalization (true peak -1.5 dBFS), 48 kHz s16.
function loudnorm(src, dst, target) {
  const ln = `loudnorm=I=${target}:TP=-1.5:LRA=11`;
  const m = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", src, "-af", `${ln}:print_format=json`,
    "-f", "null", "-"], { encoding: "utf8" });
  const json = m.status === 0 && m.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
  if (!json) die(`loudness measure failed for ${src}`);
  const v = JSON.parse(json[0]);
  if (!Number.isFinite(Number(v.input_i))) {
    console.log("narration is silent; loudness left as is");
    renameSync(src, dst);
    return;
  }
  console.log(`narration loudness ${v.input_i} LUFS -> ${target} LUFS`);
  run(["-v", "error", "-y", "-i", src, "-af",
    `${ln}:measured_I=${v.input_i}:measured_TP=${v.input_tp}:measured_LRA=${v.input_lra}` +
    `:measured_thresh=${v.input_thresh}:offset=${v.target_offset}:linear=true`,
    "-ar", "48000", "-c:a", "pcm_s16le", dst], "narration loudnorm");
  rmSync(src);
}

// ---- narration ----------------------------------------------------------
const nar = plan.narration || {};
const narFiles = (nar.files || []).map(P);
const gap = Number(nar.gap || 0);
const narOut = P(nar.output || "assets/narration.wav");
const rawOffsets = [];
let t = 0;
for (const f of narFiles) {
  const d = probe(f).duration;
  rawOffsets.push({ file: f, start: t, end: t + d, duration: d });
  t += d + gap;
}
const rawLength = narFiles.length ? t - gap : 0;

// Section pauses, sorted, on the raw clock. A pause at `at` shifts everything
// at or after `at` (a pause exactly at a file start lands before that file).
const pauses = (nar.pauses || []).map((p, k) => ({ label: p.label || `pause ${k + 1}`,
  at: Number(p.at), dur: Number(p.dur ?? 1.5) })).sort((a, b) => a.at - b.at);
if (pauses.length && !narFiles.length)
  die("narration.pauses needs narration.files: give pauses only in the plan that builds the narration");
for (const p of pauses) {
  if (!(p.dur > 0)) die(`pause "${p.label}": dur must be > 0`);
  if (!(p.at > 0 && p.at < rawLength)) die(`pause "${p.label}": at ${p.at}s is outside the narration 0-${rawLength.toFixed(2)}s`);
}
const shift = (raw, strict = false) => raw + pauses.reduce((n, p) => n + ((strict ? p.at < raw : p.at <= raw) ? p.dur : 0), 0);
const pauseSum = pauses.reduce((n, p) => n + p.dur, 0);
const offsets = rawOffsets.map(o => ({ file: o.file, start: +shift(o.start).toFixed(3),
  end: +shift(o.end, true).toFixed(3), duration: +o.duration.toFixed(3),
  rawStart: +o.start.toFixed(3) }));
const pauseTimes = pauses.map(p => {
  const start = shift(p.at, true);
  return { label: p.label, at: p.at, dur: p.dur, start: +start.toFixed(3), end: +(start + p.dur).toFixed(3),
    cardStart: +(start + 0.5).toFixed(3) };
});
const narLength = narFiles.length ? rawLength + pauseSum : (existsSync(narOut) ? probe(narOut).duration : 0);
const total = Number(plan.duration || narLength);
if (!(total > 0)) die("timeline length unknown: give narration.files, an existing narration.output, or duration");
const totalFrames = Math.round(total * F);

// ---- segments -----------------------------------------------------------
const segs = (plan.segments || []).map((s, k) => {
  const clip = P(s.clip);
  const info = probe(clip);
  const speed = Number(s.speed || 1);
  if (speed < 1 || speed > 1.5) die(`segment ${k} (${s.label}): speed must be 1.0-1.5`);
  const inT = Number(s.in || 0);
  const outT = Number(s.out ?? info.duration);
  if (!(outT > inT)) die(`segment ${k} (${s.label}): out must be after in`);
  let start;
  if (s.audio != null) {
    const o = offsets[Number(s.audio) - 1];
    if (!o) die(`segment ${k} (${s.label}): audio #${s.audio} not in narration.files (1-based)`);
    start = o.start;
  } else if (s.start != null) start = Number(s.start);
  else die(`segment ${k} (${s.label}): needs "start" or "audio"`);
  start += Number(s.offset || 0);
  const freezes = (s.freezes || []).map(z => ({ at: Number(z.at), dur: Number(z.dur) }))
    .sort((a, b) => a.at - b.at);
  for (const z of freezes) if (z.at <= inT || z.at >= outT) die(`segment ${k} (${s.label}): freeze at ${z.at}s is outside in/out ${inT}-${outT}`);
  return { ...s, k, clip, info, speed, inT, outT, start, freezes };
});
if (!segs.length) die("plan has no segments");
for (let i = 1; i < segs.length; i++)
  if (segs[i].start <= segs[i - 1].start) die(`segment ${i} (${segs[i].label}) starts at ${segs[i].start}s, not after segment ${i - 1}`);

const [outW, outH] = plan.size || [segs[0].info.width, segs[0].info.height];
const evenW = outW - (outW % 2), evenH = outH - (outH % 2);

// Frame-exact layout.
const fr = x => Math.round(x * F);
const problems = [];
const windows = segs.map((s, i) => {
  const wStart = i === 0 ? 0 : fr(s.start);
  const wEnd = i === segs.length - 1 ? totalFrames : fr(segs[i + 1].start);
  // playback pieces between freezes, in source seconds
  const cuts = [s.inT, ...s.freezes.map(z => z.at), s.outT];
  const pieces = [];
  for (let p = 0; p < cuts.length - 1; p++) {
    const a = cuts[p], b = cuts[p + 1];
    pieces.push({ a, b, frames: Math.max(1, Math.round(((b - a) / s.speed) * F)),
      hold: p < s.freezes.length ? fr(s.freezes[p].dur) : 0 });
  }
  const playFrames = pieces.reduce((n, q) => n + q.frames + q.hold, 0);
  const firstWindowLead = i === 0 ? fr(s.start) : 0;   // hold first frame before the first window
  const avail = wEnd - wStart;
  let lead;
  if (s.lead === "end") lead = avail - playFrames;
  else lead = firstWindowLead + fr(Number(s.lead || 0));
  const tail = avail - lead - playFrames;
  if (lead < 0 || tail < 0) {
    const over = (playFrames + Math.max(0, lead) - avail) / F;
    problems.push(`segment ${i} (${s.label || basename(s.clip)}): needs ${(playFrames / F).toFixed(2)}s` +
      ` (+${(Math.max(0, lead) / F).toFixed(2)}s lead) but window ${(wStart / F).toFixed(2)}-${(wEnd / F).toFixed(2)}s` +
      ` holds ${(avail / F).toFixed(2)}s; over by ${over.toFixed(2)}s. Trim in/out, shorten freezes/lead,` +
      ` raise speed (max 1.5), or move the next segment's start later.`);
  }
  return { label: s.label || basename(s.clip), clip: s.clip, startFrame: wStart, endFrame: wEnd,
    start: +(wStart / F).toFixed(3), end: +(wEnd / F).toFixed(3),
    playStart: +((wStart + lead) / F).toFixed(3), playEnd: +((wStart + lead + playFrames) / F).toFixed(3),
    lead, tail, pieces, speed: s.speed };
});

const timeline = { fps: F, duration: +(totalFrames / F).toFixed(3), totalFrames, size: [evenW, evenH],
  narration: offsets, pauses: pauseTimes, segments: windows.map(({ pieces, lead, tail, startFrame, endFrame, ...w }, i) => ({
    ...w, leadSeconds: +(lead / F).toFixed(3), tailSeconds: +(tail / F).toFixed(3),
    freezes: segs[i].freezes })) };

console.log("\nNarration offsets:");
for (const [i, o] of offsets.entries()) console.log(`  #${i + 1} ${o.start.toFixed(2)}-${o.end.toFixed(2)}s  ${basename(o.file)}`);
if (pauseTimes.length) console.log("\nSection pauses (raw at -> timeline silence, card start):");
for (const p of pauseTimes)
  console.log(`  ${p.label}: raw ${p.at.toFixed(2)}s -> silence ${p.start.toFixed(2)}-${p.end.toFixed(2)}s, card ${p.cardStart.toFixed(2)}s`);
console.log(`\nTimeline ${timeline.duration}s @ ${F} fps, phone track ${evenW}x${evenH}`);
for (const w of timeline.segments)
  console.log(`  ${w.start.toFixed(2)}-${w.end.toFixed(2)}s  ${w.label}: hold ${w.leadSeconds}s, play ${w.playStart}-${w.playEnd}s, hold ${w.tailSeconds}s`);
if (problems.length) { console.error("\n" + problems.join("\n")); process.exit(2); }
if (dry) process.exit(0);

// ---- render narration -----------------------------------------------------
// Concatenate, then normalize loudness so every video lands at the same level.
const lufs = nar.loudnorm === false ? null : Number(nar.loudnorm ?? -16);
if (narFiles.length) {
  mkdirSync(dirname(narOut), { recursive: true });
  const args = ["-v", "error", "-y"];
  narFiles.forEach(f => args.push("-i", f));
  const parts = [];
  let chain = "";
  narFiles.forEach((_, i) => {
    chain += `[${i}:a]aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo[a${i}];`;
    parts.push(`[a${i}]`);
    if (gap > 0 && i < narFiles.length - 1) {
      chain += `aevalsrc=0|0:d=${gap}:s=48000,aformat=sample_fmts=s16:channel_layouts=stereo[g${i}];`;
      parts.push(`[g${i}]`);
    }
  });
  chain += `${parts.join("")}concat=n=${parts.length}:v=0:a=1[out]`;
  const stem = join(dirname(narOut), basename(narOut, extname(narOut)));
  const concatOut = lufs == null && !pauses.length ? narOut : stem + ".concat.wav";
  args.push("-filter_complex", chain, "-map", "[out]", "-c:a", "pcm_s16le", concatOut);
  run(args, "narration concat");
  let joined = concatOut;
  if (pauses.length) {
    warnLoudSplices(concatOut);
    joined = lufs == null ? narOut : stem + ".paused.wav";
    insertPauses(concatOut, joined);
    rmSync(concatOut);
  }
  if (lufs != null) loudnorm(joined, narOut, lufs);
}

// A splice inside a word is an audible cut: warn when the 60 ms around `at` is not quiet.
function warnLoudSplices(src) {
  for (const p of pauses) {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-ss", String(Math.max(0, p.at - 0.03)), "-t", "0.06",
      "-i", src, "-af", "astats=measure_perchannel=none", "-f", "null", "-"], { encoding: "utf8" });
    const m = r.stderr.match(/RMS level dB:\s*(-?[\d.]+|-inf)/);
    const db = m ? (m[1] === "-inf" ? -Infinity : Number(m[1])) : NaN;
    if (db > -40) console.warn(`warning: pause "${p.label}" at ${p.at}s splices audio at ${db.toFixed(1)} dBFS RMS;` +
      " move `at` into the gap before the section's first word");
  }
}

// Cut the joined narration at each pause and put silence between the pieces,
// with 15 ms fades at the splices so the cut never clicks.
function insertPauses(src, dst) {
  const F15 = 0.015, fmt = "aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo";
  const cuts = [0, ...pauses.map(p => p.at), rawLength];
  let chain = "";
  const parts = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1], last = i === cuts.length - 2;
    let f = `[0:a]atrim=start=${a}${last ? "" : `:end=${b}`},asetpts=PTS-STARTPTS`;
    if (i > 0) f += `,afade=t=in:d=${F15}`;
    if (!last) f += `,afade=t=out:st=${Math.max(0, b - a - F15).toFixed(4)}:d=${F15}`;
    chain += `${f},${fmt}[p${i}];`;
    parts.push(`[p${i}]`);
    if (!last) {
      chain += `aevalsrc=0|0:d=${pauses[i].dur}:s=48000,${fmt}[s${i}];`;
      parts.push(`[s${i}]`);
    }
  }
  chain += `${parts.join("")}concat=n=${parts.length}:v=0:a=1[out]`;
  run(["-v", "error", "-y", "-i", src, "-filter_complex", chain, "-map", "[out]", "-c:a", "pcm_s16le", dst],
    "narration pauses");
}

// ---- render phone track ---------------------------------------------------
const output = P(plan.output || "assets/phone-track.mp4");
mkdirSync(dirname(output), { recursive: true });
const clipList = [...new Set(segs.map(s => s.clip))];
const uses = clipList.map(c => windows.filter(w => w.clip === c).reduce((n, w) => n + w.pieces.length, 0));
const args = ["-v", "error", "-stats", "-y"];
clipList.forEach(c => args.push("-i", c));
let g = "";
const pads = clipList.map((c, ci) => {
  const n = uses[ci];
  const labels = Array.from({ length: n }, (_, j) => `c${ci}_${j}`);
  g += `[${ci}:v]setpts=PTS-STARTPTS,split=${n}${labels.map(l => `[${l}]`).join("")};`;
  return labels;
});
const used = clipList.map(() => 0);
const outs = [];
windows.forEach((w, i) => {
  const ci = clipList.indexOf(w.clip);
  w.pieces.forEach((q, p) => {
    const src = pads[ci][used[ci]++];
    const lbl = `s${i}p${p}`;
    const first = p === 0 ? w.lead : 0;
    const last = p === w.pieces.length - 1 ? w.tail : 0;
    const stop = q.hold + last;
    g += `[${src}]trim=start=${q.a}:end=${q.b},setpts=(PTS-STARTPTS)/${w.speed},fps=${F},` +
      `scale=${evenW}:${evenH}:force_original_aspect_ratio=decrease:flags=lanczos,` +
      `pad=${evenW}:${evenH}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p,` +
      // clone 2 spare frames so rounding never leaves a piece short, then cut exact
      `tpad=stop=2:stop_mode=clone,trim=end_frame=${q.frames},setpts=PTS-STARTPTS,` +
      `tpad=start=${first}:start_mode=clone:stop=${stop}:stop_mode=clone[${lbl}];`;
    outs.push(`[${lbl}]`);
  });
});
g += `${outs.join("")}concat=n=${outs.length}:v=1:a=0,trim=end_frame=${totalFrames}[v]`;
args.push("-filter_complex", g, "-map", "[v]", "-r", String(F), "-an",
  "-c:v", "libx264", "-preset", "medium", "-crf", crf, "-pix_fmt", "yuv420p",
  "-g", String(F), "-movflags", "+faststart", output);
run(args, "phone track render");

// ---- verify ---------------------------------------------------------------
const c = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets",
  "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", output], { encoding: "utf8" });
const frames = Number(c.stdout.trim());
const tlPath = join(dirname(output), `${basename(output, extname(output))}.timeline.json`);
writeFileSync(tlPath, JSON.stringify({ ...timeline, output, frames }, null, 2) + "\n");
console.log(`\nwrote ${output} (${frames} frames, expected ${totalFrames})`);
console.log(`wrote ${tlPath}`);
if (frames !== totalFrames) { console.error(`error: frame count mismatch (${frames} vs ${totalFrames})`); process.exit(3); }
