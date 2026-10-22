#!/usr/bin/env node
// Highlight Video — red box + spotlight dim with eased fades over a screen recording.
//
// Draws, per step, a rounded red outline around a target region and dims the
// rest of the frame, fading in and out. Pixels are generated in Node and piped
// to ffmpeg as a raw RGBA overlay, so no browser or fonts are needed.
//
// Commands:
//   node highlight.mjs probe   <video>
//   node highlight.mjs grid    <video> <time> [--out <png>] [--step <px>]
//   node highlight.mjs preview <plan.json>
//   node highlight.mjs render  <plan.json> [--crf 16]
//
// Plan file (paths are relative to the plan file):
//   {
//     "video": "clip.mp4",
//     "output": "clip.highlighted.mp4",
//     "style": { "dim": 0.5, "color": "#ff0000", "border": 6, "radius": 12,
//                "pad": 0, "fadeIn": 1.0, "fadeOut": 0.9,
//                "easeIn": "in", "easeOut": "out" },
//     "steps": [ { "label": "Settings icon", "start": 2.8, "hold": 3.0,
//                  "box": [x, y, w, h] } ]
//   }
// A step starts fading in at `start`, is fully on at start+fadeIn, holds for
// `hold` seconds, then fades out over fadeOut. Any style key may be overridden
// per step. Box coordinates are in source video pixels.

import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve, basename, extname } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";

const DEFAULT_STYLE = {
  dim: 0.5, color: "#ff0000", border: 6, radius: 12, pad: 0,
  fadeIn: 1.0, fadeOut: 0.9, easeIn: "in", easeOut: "out",
};

const EASES = {
  linear: t => t,
  in: t => t * t,
  out: t => 1 - (1 - t) * (1 - t),
  inOut: t => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
};

function die(msg) { console.error(`error: ${msg}`); process.exit(1); }

function probe(video) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,avg_frame_rate:format=duration",
    "-of", "json", video], { encoding: "utf8" });
  if (r.status !== 0) die(`ffprobe failed for ${video}: ${r.stderr.trim()}`);
  const j = JSON.parse(r.stdout);
  const s = j.streams[0];
  const [n, d] = s.avg_frame_rate.split("/").map(Number);
  const a = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a",
    "-show_entries", "stream=index", "-of", "csv=p=0", video], { encoding: "utf8" });
  return { width: s.width, height: s.height, fps: n / (d || 1),
    fpsExpr: s.avg_frame_rate, duration: Number(j.format.duration),
    hasAudio: a.stdout.trim().length > 0 };
}

function hexColor(hex) {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16));
}

// Full-strength RGBA overlay for one step: dim outside the box, red ring around it.
function buildMask(W, H, box, st) {
  const buf = Buffer.alloc(W * H * 4);
  const [cr, cg, cb] = hexColor(st.color);
  const x = box[0] - st.pad, y = box[1] - st.pad;
  const w = box[2] + 2 * st.pad, h = box[3] + 2 * st.pad;
  const cx = x + w / 2, cy = y + h / 2;
  const r = Math.min(st.radius, w / 2, h / 2);
  const hx = w / 2 - r, hy = h / 2 - r;
  const bw = st.border;
  for (let py = 0; py < H; py++) {
    const qy = Math.abs(py + 0.5 - cy) - hy;
    for (let px = 0; px < W; px++) {
      const qx = Math.abs(px + 0.5 - cx) - hx;
      // Signed distance to the rounded rectangle; negative inside.
      const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
        + Math.min(Math.max(qx, qy), 0) - r;
      const dimA = st.dim * Math.min(Math.max(sd + 0.5, 0), 1);
      const ringA = bw > 0 ? Math.min(Math.max(Math.min(sd, bw - sd) + 0.5, 0), 1) : 0;
      const a = ringA + dimA * (1 - ringA);
      if (a <= 0) continue;
      const i = (py * W + px) * 4;
      buf[i] = Math.round((cr * ringA) / a);
      buf[i + 1] = Math.round((cg * ringA) / a);
      buf[i + 2] = Math.round((cb * ringA) / a);
      buf[i + 3] = Math.round(a * 255);
    }
  }
  return buf;
}

function scaleAlpha(mask, k) {
  if (k >= 1) return mask;
  const out = Buffer.from(mask);
  for (let i = 3; i < out.length; i += 4) out[i] = Math.round(out[i] * k);
  return out;
}

function loadPlan(planPath) {
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const base = dirname(resolve(planPath));
  if (!plan.video) die("plan needs a \"video\" path");
  const video = resolve(base, plan.video);
  if (!existsSync(video)) die(`video not found: ${video}`);
  const stem = basename(video, extname(video));
  const output = resolve(base, plan.output || `${stem}.highlighted.mp4`);
  if (output === video) die("output must differ from the source video");
  const style = { ...DEFAULT_STYLE, ...(plan.style || {}) };
  const info = probe(video);
  const steps = (plan.steps || []).map((s, n) => {
    const st = { ...style, ...s };
    if (!Array.isArray(s.box) || s.box.length !== 4) die(`step ${n + 1}: box must be [x, y, w, h]`);
    if (!(s.start >= 0) || !(s.hold >= 0)) die(`step ${n + 1}: needs start >= 0 and hold >= 0`);
    for (const e of [st.easeIn, st.easeOut]) if (!EASES[e]) die(`step ${n + 1}: unknown ease "${e}"`);
    const [bx, by, bw, bh] = s.box;
    if (bx < 0 || by < 0 || bx + bw > info.width || by + bh > info.height)
      console.warn(`warning: step ${n + 1} box extends past the ${info.width}x${info.height} frame`);
    const end = s.start + st.fadeIn + s.hold + st.fadeOut;
    if (end > info.duration + 0.01) console.warn(`warning: step ${n + 1} ends at ${end.toFixed(2)}s, after the video (${info.duration.toFixed(2)}s)`);
    return { ...st, n: n + 1, end };
  }).sort((a, b) => a.start - b.start);
  if (!steps.length) die("plan has no steps");
  for (let i = 1; i < steps.length; i++)
    if (steps[i].start < steps[i - 1].end - 1e-6)
      die(`step ${steps[i].n} starts at ${steps[i].start}s before step ${steps[i - 1].n} finishes fading out at ${steps[i - 1].end.toFixed(2)}s`);
  return { plan, base, video, output, info, steps };
}

// Overlay strength of a step at time t (0..1).
function strength(s, t) {
  if (t < s.start || t >= s.end) return 0;
  const inEnd = s.start + s.fadeIn, outStart = inEnd + s.hold;
  if (t < inEnd) return EASES[s.easeIn](s.fadeIn ? (t - s.start) / s.fadeIn : 1);
  if (t < outStart) return 1;
  return 1 - EASES[s.easeOut](s.fadeOut ? (t - outStart) / s.fadeOut : 1);
}

async function writeFrame(stream, buf) {
  if (!stream.write(buf)) await once(stream, "drain");
}

function rawInputArgs(info, rate) {
  return ["-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${info.width}x${info.height}`,
    "-r", rate, "-i", "pipe:0"];
}

async function runFfmpeg(args, feed) {
  const ff = spawn("ffmpeg", args, { stdio: ["pipe", "inherit", "inherit"] });
  ff.stdin.on("error", () => {});
  const done = once(ff, "close");
  await feed(ff.stdin);
  ff.stdin.end();
  const [code] = await done;
  if (code !== 0) die(`ffmpeg exited with code ${code}`);
}

async function cmdRender(planPath, args) {
  const { video, output, info, steps } = loadPlan(planPath);
  const crf = String(args.crf ?? 16);
  const total = Math.ceil(info.duration * info.fps) + 1;
  console.log(`source ${info.width}x${info.height} @ ${info.fps.toFixed(3)}fps, ${info.duration.toFixed(2)}s, ${steps.length} step(s)`);
  const masks = new Map();
  const blank = Buffer.alloc(info.width * info.height * 4);
  mkdirSync(dirname(output), { recursive: true });
  const ffArgs = ["-y", "-v", "error", "-stats", "-i", video, ...rawInputArgs(info, info.fpsExpr),
    "-filter_complex", "[0:v]setpts=PTS-STARTPTS[b];[1:v]setpts=PTS-STARTPTS[o];[b][o]overlay=eof_action=pass:format=auto,format=yuv420p[v]",
    "-map", "[v]", "-fps_mode", "passthrough", ...(info.hasAudio ? ["-map", "0:a", "-c:a", "copy"] : []),
    "-c:v", "libx264", "-preset", "medium", "-crf", crf,
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
    "-movflags", "+faststart", output];
  await runFfmpeg(ffArgs, async stdin => {
    let si = 0;
    for (let f = 0; f < total; f++) {
      const t = f / info.fps;
      while (si < steps.length && t >= steps[si].end) si++;
      const s = steps[si];
      const k = s ? strength(s, t) : 0;
      if (k <= 0) { await writeFrame(stdin, blank); continue; }
      if (!masks.has(s.n)) masks.set(s.n, buildMask(info.width, info.height, s.box, s));
      await writeFrame(stdin, scaleAlpha(masks.get(s.n), k));
    }
  });
  console.log(`wrote ${output}`);
}

async function cmdPreview(planPath) {
  const { video, output, info, steps } = loadPlan(planPath);
  const dir = join(dirname(output), `${basename(output, extname(output))}.previews`);
  mkdirSync(dir, { recursive: true });
  for (const s of steps) {
    const t = s.start + s.fadeIn + s.hold / 2;
    const out = join(dir, `step-${String(s.n).padStart(2, "0")}.png`);
    await runFfmpeg(["-y", "-v", "error", "-ss", t.toFixed(3), "-i", video,
      ...rawInputArgs(info, "1"), "-filter_complex", "[0:v][1:v]overlay=format=auto",
      "-frames:v", "1", "-update", "1", out],
    stdin => writeFrame(stdin, buildMask(info.width, info.height, s.box, s)));
    console.log(`step ${s.n} (${s.label ?? "unlabeled"}) @ ${t.toFixed(2)}s -> ${out}`);
  }
}

// 3x5 digit glyphs for grid labels.
const DIGITS = ["111101101101111", "010110010010111", "111001111100111", "111001111001111",
  "101101111001001", "111100111001111", "111100111101111", "111001001001001",
  "111101111101111", "111101111001111"];

function drawLabel(buf, W, H, text, x0, y0, scale) {
  const put = (x, y, rgba) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    buf.set(rgba, (y * W + x) * 4);
  };
  const cw = 4 * scale, w = text.length * cw + scale, h = 7 * scale;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x0 + x, y0 + y, [0, 0, 0, 200]);
  [...text].forEach((ch, c) => {
    const g = DIGITS[Number(ch)];
    for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++) {
      if (g[gy * 3 + gx] !== "1") continue;
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++)
        put(x0 + scale + c * cw + gx * scale + sx, y0 + scale + gy * scale + sy, [255, 230, 0, 255]);
    }
  });
}

async function cmdGrid(video, time, args) {
  const info = probe(video);
  const W = info.width, H = info.height;
  const step = Number(args.step ?? 100);
  const scale = Math.max(2, Math.round(Math.min(W, H) / 330));
  const buf = Buffer.alloc(W * H * 4);
  const line = [0, 255, 255, 170], major = [255, 0, 255, 220];
  for (let v = step; v < Math.max(W, H); v += step) {
    const col = v % (step * 5) === 0 ? major : line;
    if (v < W) for (let y = 0; y < H; y++) buf.set(col, (y * W + v) * 4);
    if (v < H) for (let x = 0; x < W; x++) buf.set(col, (v * W + x) * 4);
  }
  for (let v = step; v < W; v += step) drawLabel(buf, W, H, String(v), v + 2, 2, scale);
  for (let v = step; v < H; v += step) drawLabel(buf, W, H, String(v), 2, v + 2, scale);
  const out = args.out ? resolve(args.out)
    : join(dirname(resolve(video)), `${basename(video, extname(video))}.grid-${Number(time).toFixed(2)}s.png`);
  await runFfmpeg(["-y", "-v", "error", "-ss", String(time), "-i", video,
    ...rawInputArgs(info, "1"), "-filter_complex", "[0:v][1:v]overlay=format=auto",
    "-frames:v", "1", "-update", "1", out], stdin => writeFrame(stdin, buf));
  console.log(`${W}x${H}, grid every ${step}px (magenta every ${step * 5}px) -> ${out}`);
}

function parseArgs(argv) {
  const pos = [], opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) opts[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") ? true : argv[++i];
    else pos.push(argv[i]);
  }
  return { pos, opts };
}

const [cmd, ...rest] = process.argv.slice(2);
const { pos, opts } = parseArgs(rest);
if (cmd === "probe" && pos[0]) console.log(JSON.stringify(probe(pos[0]), null, 2));
else if (cmd === "grid" && pos.length >= 2) await cmdGrid(pos[0], pos[1], opts);
else if (cmd === "preview" && pos[0]) await cmdPreview(pos[0]);
else if (cmd === "render" && pos[0]) await cmdRender(pos[0], opts);
else {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 28)
    .map(l => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(cmd ? 1 : 0);
}
