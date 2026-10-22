#!/usr/bin/env node
// Print a kit word-level transcript as timed sentences, and optionally every
// word with its start time after a given second (for anchoring beats).
//
//   node transcript-lines.mjs <transcript.kit.json> [--words-from 40] [--offset 0] [--pauses plan.json]
//
// --offset adds seconds to every time (use a narration file's offset from
// phone-track.timeline.json when the transcript covers one file of several;
// with --pauses use its `rawStart`).
// --pauses reads narration.pauses from a phone/pc plan (or `pauses` from a
// built timeline JSON) and prints times on the paused timeline: every time at
// or after a pause's raw `at` moves later by its `dur`. Times are raw (the
// clock of the joined files) without it. Do not use it on a transcript of the
// built narration.wav: that one already has the pauses.

import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const pi = argv.indexOf("--pauses");
const pausesFile = pi >= 0 ? argv[pi + 1] : null;
const file = argv.find((a, i) => !a.startsWith("--") && !/^-?\d/.test(a) && (pi < 0 || i !== pi + 1));
if (!file) { console.error("usage: transcript-lines.mjs <transcript.kit.json> [--words-from S] [--offset S] [--pauses plan.json]"); process.exit(1); }
const opt = k => { const i = argv.indexOf(`--${k}`); return i >= 0 ? Number(argv[i + 1]) : null; };
const rawOff = opt("offset") ?? 0;
const from = opt("words-from");
const { words } = JSON.parse(readFileSync(file, "utf8"));
let pauses = [];
if (pausesFile) {
  const j = JSON.parse(readFileSync(pausesFile, "utf8"));
  pauses = (j.narration?.pauses || j.pauses || []).map(p => ({ at: Number(p.at), dur: Number(p.dur ?? 1.5) }));
}
const T = s => { const raw = s + rawOff; return raw + pauses.reduce((n, p) => n + (p.at <= raw ? p.dur : 0), 0); };

let line = "", st = null;
for (const w of words) {
  const t = w.text.trim();
  if (st === null) st = w.start;
  line += t + " ";
  if (/[.!?]$/.test(t) || line.length > 90) {
    console.log(`${T(st).toFixed(2)}-${T(w.end).toFixed(2)}  ${line.trim()}`);
    line = ""; st = null;
  }
}
if (line) console.log(`${T(st).toFixed(2)}  ${line.trim()}`);

if (from !== null) {
  console.log("\nwords:");
  console.log(words.filter(w => T(w.start) >= from)
    .map(w => `${T(w.start).toFixed(2)} ${w.text.trim()}`).join(" | "));
}
