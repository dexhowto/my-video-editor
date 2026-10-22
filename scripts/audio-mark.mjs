#!/usr/bin/env node
// audio-mark: generate a voice track with the OpenRouter TTS API
// (POST /api/v1/audio/speech) from inline text or a text file.
// scripts/audio-elite.mjs runs this same script with the "elite" voice.
//
// Usage:
//   node scripts/audio-mark.mjs "Text to speak" [options]
//   node scripts/audio-mark.mjs --file script.txt [options]
//
// Options:
//   --model <id>          default from the preset below
//   --voice <id>          default from the preset below
//   --format mp3|pcm      default mp3 (pcm = raw 16-bit little-endian)
//   --instructions <txt>  delivery guidance (OpenAI, Gemini, Fish Audio only)
//   --speed <n>           playback multiplier (only some models honor it)
//   --output <path>       default video-projects/_<preset script>/<name>.<format>
//
// One request takes at most 10000 characters. Longer text is not sent: the
// script splits it at natural points (paragraph, then sentence, then line,
// then word), writes each part to <name>.partN.txt, prints one command per
// part, and exits.
//
// Reads OPENROUTER_API_KEY from process.env or the workspace .env file.
// Every call is billed to your OpenRouter credits, except ":free" models.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { argv, exit, env, cwd } from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(SCRIPT_DIR, "..");
const ENDPOINT = "https://openrouter.ai/api/v1/audio/speech";
const MAX_CHARS = 10000;

// Defaults per entry script; scripts/audio-elite.mjs selects "audio-elite".
const PRESETS = {
  "audio-mark": { model: "elevenlabs/eleven-v4-turbo", voice: "UgBBYS2sOqTuMpoF3BR0" },
  "audio-elite": { model: "fish-audio/drama-3", voice: "edb4d200ed2f4eb8b9b58dd042e21c6a" },
};
const ENTRY = basename(argv[1] ?? "", ".mjs");
const PRESET_NAME = PRESETS[ENTRY] ? ENTRY : "audio-mark";
const PRESET = PRESETS[PRESET_NAME];
const OUT_DIR = join(WORKSPACE_ROOT, "video-projects", `_${PRESET_NAME}`);

function die(msg, code = 1) {
  console.error(msg);
  exit(code);
}

function displayPath(p) {
  const rel = relative(cwd(), p);
  return rel.startsWith("..") ? p : rel;
}

function shellQuote(s) {
  return /^[\w./:-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
}

// Cut text into parts of at most `max` characters. Each cut lands on the best
// boundary inside the allowed window, nearest an even share of the text.
function splitNatural(text, max) {
  const parts = [];
  let rest = text.trim();
  while (rest.length > max) {
    const count = Math.ceil(rest.length / max);
    const target = Math.ceil(rest.length / count);
    const window = rest.slice(0, max + 1);
    const boundaries = [
      /\n\s*\n/g, // paragraph
      /[.!?…]["')\]]?\s+/g, // sentence
      /\n/g, // line
      /[,;:]\s+/g, // clause
      /\s+/g, // word
    ];
    let cut = -1;
    for (const re of boundaries) {
      let best = -1;
      for (const m of window.matchAll(re)) {
        const end = m.index + m[0].length;
        if (end > max || end < max * 0.3) continue;
        if (best < 0 || Math.abs(end - target) < Math.abs(best - target)) best = end;
      }
      if (best > 0) {
        cut = best;
        break;
      }
    }
    if (cut < 0) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

// --- parse args ---
const opts = {
  ...PRESET,
  format: "mp3",
};
const positional = [];
const args = argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith("--")) {
    const key = a.slice(2);
    const val = args[++i];
    if (val === undefined) die(`missing value for ${a}`);
    opts[key] = val;
  } else {
    positional.push(a);
  }
}

let text = positional.join(" ");
let name = `audio-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
if (opts.file) {
  const filePath = resolve(opts.file);
  if (!existsSync(filePath)) die(`file not found: ${filePath}`);
  text = readFileSync(filePath, "utf8");
  name = basename(filePath, extname(filePath));
}
text = text.trim();
if (!text) die(`usage: node scripts/${PRESET_NAME}.mjs "Text to speak" | --file script.txt [--voice id]`);
if (!["mp3", "pcm"].includes(opts.format)) die("--format must be mp3 or pcm");

// --- over the limit: split, write parts, print one command per part ---
if (text.length > MAX_CHARS) {
  const parts = splitNatural(text, MAX_CHARS);
  const partDir = opts.file ? dirname(resolve(opts.file)) : OUT_DIR;
  mkdirSync(partDir, { recursive: true });
  const extra = [];
  for (const key of ["model", "voice", "format", "instructions", "speed"]) {
    if (opts[key] !== undefined && args.includes(`--${key}`)) extra.push(`--${key}`, shellQuote(String(opts[key])));
  }
  const outBase = opts.output ? resolve(opts.output) : join(OUT_DIR, `${name}.${opts.format}`);
  const outExt = extname(outBase) || `.${opts.format}`;
  const outStem = outBase.slice(0, outBase.length - extname(outBase).length);
  console.log(`Text is ${text.length} characters; the limit is ${MAX_CHARS}. Split into ${parts.length} parts:\n`);
  parts.forEach((part, i) => {
    const partFile = join(partDir, `${name}.part${i + 1}.txt`);
    writeFileSync(partFile, part + "\n");
    const ending = part.slice(-60).replace(/\s+/g, " ");
    console.log(`Part ${i + 1}: ${part.length} characters, ends "...${ending}"`);
    const cmd = [
      `node scripts/${PRESET_NAME}.mjs`,
      "--file", shellQuote(displayPath(partFile)),
      "--output", shellQuote(displayPath(`${outStem}.part${i + 1}${outExt}`)),
      ...extra,
    ].join(" ");
    console.log(`  ${cmd}\n`);
  });
  exit(0);
}

// --- load API key (env first, then workspace .env) ---
let apiKey = env.OPENROUTER_API_KEY;
if (!apiKey) {
  const dotenv = join(WORKSPACE_ROOT, ".env");
  if (existsSync(dotenv)) {
    for (const line of readFileSync(dotenv, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) {
        apiKey = m[1].replace(/^["']|["']$/g, "");
        break;
      }
    }
  }
}
if (!apiKey) die("OPENROUTER_API_KEY not set (env or workspace .env)");

const outputPath = resolve(opts.output ?? join(OUT_DIR, `${name}.${opts.format}`));

// --- request ---
const body = {
  model: opts.model,
  input: text,
  voice: opts.voice,
  response_format: opts.format,
};
if (opts.instructions) body.instructions = opts.instructions;
if (opts.speed) body.speed = Number(opts.speed);

console.log(`model ${opts.model}, voice ${opts.voice}, ${text.length} characters`);
const started = Date.now();
const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

if (!res.ok) {
  const detail = await res.text();
  die(`OpenRouter ${res.status}: ${detail}`);
}

const audio = Buffer.from(await res.arrayBuffer());
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, audio);

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`wrote ${outputPath} (${(audio.length / 1024).toFixed(0)} KB, ${seconds}s)`);
const generationId = res.headers.get("x-generation-id");
if (generationId) console.log(`generation id ${generationId}`);
