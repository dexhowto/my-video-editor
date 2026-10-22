#!/usr/bin/env node
// Copy a build's inputs into the build project, so it is self-contained.
//
// Copies projects-full/<name>/ into video-projects/<name>/original/, keeping
// the folder structure (audio/, video/, script/, script.md, original/script.md,
// commands.md, the task-4 transcript ...). The /video-* build skills run this
// right after the scaffold and read every input from original/ afterwards.
//
// Usage (from the repo root):
//   node scripts/copy-original.mjs <name> [--dry]
//
// Rules:
// - projects-full/<name>/ is never changed.
// - audio-parts/: only the JSON files (transcript.kit.json, manifest.json);
//   the cached WAV paragraphs and logs are not needed by the build.
// - youtube/, logs, and dotfiles are skipped.
// - video-projects/<name>/source/transcript.kit.json (the build's own
//   MacWhisper transcript) is copied to original/transcript.kit.json.
// - A file that is already in original/ with the same size and an equal or
//   newer mtime is skipped, so a re-run copies only new or changed inputs.
// - Nothing in original/ is deleted. Files that are no longer in
//   projects-full/<name>/ are listed as stale.
// - On APFS the copy is a clone: it takes no extra disk space.
//
// If projects-full/<name>/ is gone but original/ has files, the script keeps
// original/ as it is and exits 0 (the build continues from its copy).
// Exit codes: 0 = done, 1 = usage error or nothing to copy.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const name = args.find((a) => !a.startsWith("--"));

if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
  console.error("Usage: node scripts/copy-original.mjs <name> [--dry]");
  process.exit(1);
}

const SRC = path.join(REPO, "projects-full", name);
const PROJECT = path.join(REPO, "video-projects", name);
const DEST = path.join(PROJECT, "original");
const rel = (p) => path.relative(REPO, p);

if (!fs.existsSync(PROJECT)) {
  console.error(`No build project: ${rel(PROJECT)}. Run npm run new-video -- ${name} first.`);
  process.exit(1);
}

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else if (entry.isFile()) out.push(path.relative(base, full));
  }
  return out;
}

function wanted(file) {
  const [top] = file.split(path.sep);
  if (top === "youtube") return false;
  if (file.endsWith(".log")) return false;
  if (top === "audio-parts") return file.endsWith(".json");
  return true;
}

// [source, destination relative to original/]
const pairs = listFiles(SRC).filter(wanted).map((f) => [path.join(SRC, f), f]);
const buildTranscript = path.join(PROJECT, "source", "transcript.kit.json");
if (fs.existsSync(buildTranscript)) pairs.push([buildTranscript, "transcript.kit.json"]);

if (!fs.existsSync(SRC)) {
  const kept = listFiles(DEST).length;
  if (kept) {
    console.log(`${rel(SRC)} not found; keeping ${rel(DEST)} as is (${kept} files).`);
    process.exit(0);
  }
  console.error(`Nothing to copy: ${rel(SRC)} not found and ${rel(DEST)} is empty.`);
  process.exit(1);
}

// Node has no clonefile on macOS (COPYFILE_FICLONE falls back to a full
// copy), so clone with `cp -c` and use a plain copy where that fails.
function copy(src, dest, s) {
  fs.rmSync(dest, { force: true });
  try {
    execFileSync("cp", ["-c", "-p", src, dest], { stdio: "ignore" });
  } catch {
    fs.copyFileSync(src, dest);
    fs.utimesSync(dest, s.atime, s.mtime);
  }
}

const mb = (n) => (n / 1048576).toFixed(1);
let copied = 0;
let skipped = 0;
let bytes = 0;
for (const [src, relDest] of pairs) {
  const dest = path.join(DEST, relDest);
  const s = fs.statSync(src);
  if (fs.existsSync(dest)) {
    const d = fs.statSync(dest);
    if (d.size === s.size && d.mtimeMs + 1 >= s.mtimeMs) {
      skipped++;
      continue;
    }
  }
  console.log(`${dry ? "would copy" : "copy"}  ${rel(src)} -> ${rel(dest)} (${mb(s.size)} MB)`);
  if (!dry) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    copy(src, dest, s);
  }
  copied++;
  bytes += s.size;
}

const current = new Set(pairs.map(([, f]) => f));
const stale = listFiles(DEST).filter((f) => !current.has(f));
for (const f of stale) console.log(`stale  ${rel(path.join(DEST, f))} (no longer in ${rel(SRC)}; kept)`);

console.log(
  `${dry ? "dry run: " : ""}${copied} copied (${mb(bytes)} MB), ${skipped} unchanged, ` +
    `${stale.length} stale -> ${rel(DEST)}`
);
