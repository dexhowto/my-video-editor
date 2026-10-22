#!/usr/bin/env node
// Measure the screen area of an iPhone placeholder PNG and print the CSS
// placement for the phone stack in a 1920x1080 authoring canvas.
//
//   node measure-phone.mjs <placeholder.png> [--height 1040] [--cx 960] [--top 20]
//                          [--out <layout.json>]
//
// Screen detection:
//   1. "hole" mode: transparent pixels (alpha < 128) that are not connected to
//      the image border form the screen. The frame PNG then sits ABOVE the video.
//   2. "solid" mode (no hole): flood fill from the image center over pixels of
//      the center colour (tolerance 24). The video then sits ABOVE the frame PNG,
//      clipped to the measured radius.
// The video rectangle is the screen box plus a small bleed (--bleed, source px),
// with the largest corner radius that leaves no see-through pixel uncovered.
//
// Full-frame placeholders: a 16:9 PNG (for example 3840x2160 with the phone
// already placed) is used as-is over the whole canvas; --height/--cx/--top are
// ignored. Pass --crop to force the cropped-phone layout instead.

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

function die(msg) { console.error(`error: ${msg}`); process.exit(1); }

const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i];
  else positional.push(argv[i]);
}
const file = positional[0];
if (!file) die("usage: measure-phone.mjs <placeholder.png> [--height 1040] [--cx 960] [--top 20] [--out layout.json]");
const opt = (k, d) => flags[k] ?? d;
const targetH = Number(opt("height", 1040));
const cx = Number(opt("cx", 960));
const top = Number(opt("top", 20));

const pr = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries",
  "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8" });
if (pr.status !== 0) die(`ffprobe failed: ${pr.stderr.trim()}`);
const [W, H] = pr.stdout.trim().split(",").map(Number);
const raw = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
  { maxBuffer: W * H * 4 + 1024 });
if (raw.status !== 0) die(`ffmpeg decode failed: ${raw.stderr.toString().trim()}`);
const px = raw.stdout;
if (px.length < W * H * 4) die("decoded buffer too small");

const alpha = i => px[i * 4 + 3];

// Flood fill helper over a predicate, from a list of seed pixel indices.
function flood(seeds, ok) {
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (const s of seeds) if (ok(s) && !seen[s]) { seen[s] = 1; stack.push(s); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % W, y = (i / W) | 0;
    const n = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
    for (const j of n) if (j >= 0 && !seen[j] && ok(j)) { seen[j] = 1; stack.push(j); }
  }
  return seen;
}

const transparent = i => alpha(i) < 128;
const border = [];
for (let x = 0; x < W; x++) border.push(x, (H - 1) * W + x);
for (let y = 0; y < H; y++) border.push(y * W, y * W + W - 1);
const outside = flood(border, transparent);

let region = new Uint8Array(W * H);
let count = 0;
for (let i = 0; i < W * H; i++) if (transparent(i) && !outside[i]) { region[i] = 1; count++; }
let mode = "hole";

if (count < W * H * 0.05) {
  mode = "solid";
  const c = ((H / 2) | 0) * W + ((W / 2) | 0);
  const [r0, g0, b0] = [px[c * 4], px[c * 4 + 1], px[c * 4 + 2]];
  const same = i => alpha(i) >= 128 &&
    Math.abs(px[i * 4] - r0) + Math.abs(px[i * 4 + 1] - g0) + Math.abs(px[i * 4 + 2] - b0) <= 24;
  region = flood([c], same);
  count = region.reduce((a, b) => a + b, 0);
  if (count < W * H * 0.05) die("could not find a screen area: no enclosed transparent hole and no uniform screen colour at the center");
}

// Largest connected hole only (ignore camera cut-outs or speaker slits).
let minX = W, minY = H, maxX = -1, maxY = -1;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (region[y * W + x]) {
  if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
}
const sw = maxX - minX + 1, sh = maxY - minY + 1;

// Fit the video's rounded rectangle. It is the screen bounding box grown by a
// small bleed (hidden under the bezel in hole mode), with the LARGEST corner
// radius that still covers every pixel the viewer can see through: in hole
// mode the hole plus its partly transparent 2 px antialiased edge, in solid mode the screen
// colour region. iPhone corners are continuous curves, not circles, so a
// radius read off the outline leaks background at the corners; this fit does not.
const mustCover = [];
// Antialiased edge: partly transparent pixels within 2 px of the hole.
function nearRegion(x, y) {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const xx = x + dx, yy = y + dy;
    if (xx >= 0 && yy >= 0 && xx < W && yy < H && region[yy * W + xx]) return true;
  }
  return false;
}
const B0 = Number(opt("bleed", mode === "hole" ? 3 : 1));
for (let y = Math.max(0, minY - 8); y <= Math.min(H - 1, maxY + 8); y++)
  for (let x = Math.max(0, minX - 8); x <= Math.min(W - 1, maxX + 8); x++) {
    const i = y * W + x;
    if (region[i] || (mode === "hole" && alpha(i) < 250 && nearRegion(x, y))) mustCover.push(x, y);
  }
function covers(b, r) {
  const L = minX - b, T = minY - b, R = maxX + 1 + b, Bm = maxY + 1 + b;
  for (let k = 0; k < mustCover.length; k += 2) {
    const px = mustCover[k] + 0.5, py = mustCover[k + 1] + 0.5;
    if (px < L || px > R || py < T || py > Bm) return false;
    const dx = Math.max(L + r - px, 0, px - (R - r)), dy = Math.max(T + r - py, 0, py - (Bm - r));
    if (dx * dx + dy * dy > r * r) return false;
  }
  return true;
}
let bleed = B0;
while (!covers(bleed, 0) && bleed < B0 + 8) bleed++;
if (!covers(bleed, 0)) die("screen area is not rectangular enough to fit a rounded rectangle");
let lo = 0, hi = Math.floor(Math.min(sw, sh) / 2);
while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (covers(bleed, mid)) lo = mid; else hi = mid - 1; }
const radius = lo;
const vx = minX - bleed, vy = minY - bleed, vw = sw + 2 * bleed, vh = sh + 2 * bleed;

const fullFrame = Math.abs(W / H - 16 / 9) < 0.01 && !("crop" in flags);
const scale = fullFrame ? 1920 / W : targetH / H;
const phoneW = W * scale;
const phoneLeft = fullFrame ? 0 : +(cx - phoneW / 2).toFixed(1);
const phoneTop = fullFrame ? 0 : top;
const layout = {
  placeholder: { file: resolve(file), width: W, height: H, mode, fullFrame },
  screenSource: { x: minX, y: minY, w: sw, h: sh },
  videoSource: { x: vx, y: vy, w: vw, h: vh, radius, bleed },
  canvas: {
    phone: { left: phoneLeft, top: phoneTop, width: +phoneW.toFixed(1), height: +(H * scale).toFixed(1) },
    screen: {
      left: +(vx * scale).toFixed(2), top: +(vy * scale).toFixed(2),
      width: +(vw * scale).toFixed(2), height: +(vh * scale).toFixed(2),
      radius: +(radius * scale).toFixed(2),
    },
  },
  screenAspect: +(sw / sh).toFixed(4),
};
// Screen position in canvas px, for badge width and highlight math.
layout.canvas.screenOnCanvas = {
  left: +(phoneLeft + layout.canvas.screen.left).toFixed(1), top: +(phoneTop + layout.canvas.screen.top).toFixed(1),
  right: +(phoneLeft + layout.canvas.screen.left + layout.canvas.screen.width).toFixed(1),
  bottom: +(phoneTop + layout.canvas.screen.top + layout.canvas.screen.height).toFixed(1),
};

const out = opt("out");
if (out) writeFileSync(out, JSON.stringify(layout, null, 2) + "\n");
console.log(JSON.stringify(layout, null, 2));
const p = layout.canvas.phone, s = layout.canvas.screen;
console.log(`
/* phone stack (1080p authoring px), mode=${mode} */
.phone{position:absolute;left:${p.left}px;top:${p.top}px;width:${p.width}px;height:${p.height}px;z-index:0}
.phone-screen{position:absolute;left:${s.left}px;top:${s.top}px;width:${s.width}px;height:${s.height}px;
  border-radius:${s.radius}px;overflow:hidden;background:#000;z-index:${mode === "hole" ? 0 : 1}}
.phone-screen video{width:100%;height:100%;object-fit:cover;display:block}
.phone-frame{position:absolute;inset:0;width:100%;height:100%;z-index:${mode === "hole" ? 1 : 0};pointer-events:none}`);
