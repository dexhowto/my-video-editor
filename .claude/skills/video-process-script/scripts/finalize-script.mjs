#!/usr/bin/env node
/**
 * Finalize step for the video-process-script skill.
 * Reads <project>/script_changed.md, strips every change marker, legend block,
 * and reviewer comment, and writes the clean script to <project>/script.md.
 * <project>/original/ is never touched; an older script.md goes to <project>/archive/.
 *
 * Usage: node finalize-script.mjs <project-dir> [--dry-run]
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const projectArg = args.find((a) => !a.startsWith('--'));

if (!projectArg) {
  console.error('Usage: node finalize-script.mjs <project-dir> [--dry-run]');
  process.exit(1);
}

const project = resolve(projectArg);
const changedPath = join(project, 'script_changed.md');
const originalPath = join(project, 'original', 'script.md');
const finalPath = join(project, 'script.md');

if (!existsSync(changedPath)) {
  console.error(`Missing ${changedPath}. Run the review first.`);
  process.exit(1);
}

const TAGS = ['CHANGED', 'ADDED', 'NOT RECORDED'];
const source = readFileSync(changedPath, 'utf8');

const notRecorded = (source.match(/\*\*\[NOT RECORDED\]\*\*/g) || []).length;

let text = source
  // Legend block written by the skill.
  .replace(/<!--\s*vps:legend:start\s*-->[\s\S]*?<!--\s*vps:legend:end\s*-->\s*/g, '')
  // Reviewer or skill comments.
  .replace(/<!--\s*vps:[\s\S]*?-->/g, '');

for (const tag of TAGS) {
  const marker = `\\*\\*\\[${tag}\\]\\*\\*`;
  text = text
    .replace(new RegExp(`${marker}[ \\t]+`, 'g'), '')
    .replace(new RegExp(`[ \\t]+${marker}`, 'g'), '')
    .replace(new RegExp(marker, 'g'), '');
}

text = text.replace(/\n{3,}/g, '\n\n').trim() + '\n';

const leftover = text.match(/\[(CHANGED|ADDED|NOT RECORDED)\]|vps:/g);
if (leftover) {
  console.error(`Markers left after cleanup: ${[...new Set(leftover)].join(', ')}. Fix script_changed.md by hand.`);
  process.exit(1);
}

if (dryRun) {
  process.stdout.write(text);
  process.exit(0);
}

// Keep any earlier root script.md that is neither the original nor this result.
if (existsSync(finalPath)) {
  const current = readFileSync(finalPath, 'utf8');
  const original = existsSync(originalPath) ? readFileSync(originalPath, 'utf8') : null;
  if (current !== text && current !== original) {
    mkdirSync(join(project, 'archive'), { recursive: true });
    const backup = join(project, 'archive', `script.before-final-${Date.now()}.md`);
    copyFileSync(finalPath, backup);
    console.log(`Backed up previous script.md to ${backup}`);
  }
}

writeFileSync(finalPath, text);
console.log(`Wrote ${finalPath} (${text.split('\n').length} lines).`);
if (notRecorded) {
  console.log(`Note: ${notRecorded} part(s) were still marked NOT RECORDED. Their text was kept.`);
}
