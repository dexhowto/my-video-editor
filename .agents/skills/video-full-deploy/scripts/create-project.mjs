#!/usr/bin/env node
/**
 * Task 0 of video-full-deploy: create projects-full/<name>/ as a copy of the
 * template folder projects-full/demo/ (audio/, original/script.md, script.md, video/).
 *
 *   node create-project.mjs <name> [--from demo]
 *
 * The name must be kebab-case. An existing project is never overwritten.
 * .DS_Store files are not copied. Run from the kit root.
 */

import { existsSync, cpSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const argv = process.argv.slice(2);
const fromIdx = argv.indexOf('--from');
const from = fromIdx >= 0 ? argv.splice(fromIdx, 2)[1] : 'demo';
const name = argv.find((a) => !a.startsWith('--'));

function die(msg) { console.error(`error: ${msg}`); process.exit(1); }
if (!name) die('usage: create-project.mjs <name> [--from demo]');
if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) die(`"${name}" is not a valid name. Use lowercase letters, digits and dashes, e.g. install-git-macos.`);

const base = resolve('projects-full');
const src = join(base, from);
const dest = join(base, name);
if (!existsSync(src)) die(`template folder projects-full/${from} not found`);
if (existsSync(dest)) die(`projects-full/${name} already exists. Nothing was changed.`);

cpSync(src, dest, { recursive: true, filter: (p) => basename(p) !== '.DS_Store' });
console.log(`Created projects-full/${name} from projects-full/${from}.`);
console.log(`Next: paste the script into projects-full/${name}/original/script.md and put the recordings in projects-full/${name}/video/.`);
