#!/usr/bin/env node
// Listen check for task 4: cut one MP3 clip per spot worth listening to (5 s
// before to 15 s after the spot) and print a markdown table whose Heard cell links its clip.
//
// Usage:
//   node listen-spots.mjs projects-full/<name> --spots <spots.json> [--before 5] [--after 15]
// spots.json: [{ "time": 287.5, "script": "about 1.4 GB", "heard": "1.4 GBBs", "note": "stumble?" }]
// Output: projects-full/<name>/audio-parts/listen/NN-m-ss.mp3 and the table on stdout.

import { readFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const project = args.find((a) => !a.startsWith('--'));
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
if (!project || !opt('spots')) {
  console.error('Usage: node listen-spots.mjs projects-full/<name> --spots <spots.json> [--before 5] [--after 15]');
  process.exit(1);
}
const before = Number(opt('before', 5));
const after = Number(opt('after', 15));
const root = resolve(project);
const audio = join(root, 'audio/audio-full.mp3');
if (!existsSync(audio)) { console.error(`Missing ${audio}`); process.exit(1); }
const spots = JSON.parse(readFileSync(opt('spots'), 'utf8'));
const total = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audio]).toString());

// Fresh folder each run, so old clips never mix with a new narration.
const dir = join(root, 'audio-parts', 'listen');
mkdirSync(dir, { recursive: true });
for (const f of readdirSync(dir)) if (f.endsWith('.mp3')) rmSync(join(dir, f));

const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const cell = (s = '') => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

const rows = spots.map((s, i) => {
  const start = Math.max(0, s.time - before);
  const end = Math.min(total, s.time + after);
  const m = Math.floor(s.time / 60), sec = String(Math.floor(s.time % 60)).padStart(2, '0');
  const file = `${String(i + 1).padStart(2, '0')}-${m}-${sec}.mp3`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(start), '-t', String(end - start), '-i', audio,
    '-c:a', 'libmp3lame', '-b:a', '128k', join(dir, file)]);
  const href = encodeURI(join(dir, file));
  return `| ${String(i + 1).padStart(2, '0')} | ${fmt(s.time)} | ${cell(s.script)} | [▶ ${cell(s.heard)}](${href}) | ${cell(s.note)} |`;
});

console.log(`| # | Time | Script | Heard | Note |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}`);
console.error(`Wrote ${spots.length} clip(s) to ${dir}`);
