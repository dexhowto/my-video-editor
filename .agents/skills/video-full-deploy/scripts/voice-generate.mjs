#!/usr/bin/env node
/**
 * Step 4 of video-full-deploy: turn the spoken script into one narration file.
 * It reads <project>/audio-script.md when it exists (script.md with every command,
 * file name, path, version and symbol written the way it should be read), else
 * script.md. It refuses an audio-script.md that is older than script.md.
 *
 * Engines (--engine):
 * - elite (default): OpenRouter Fish Audio Drama 3 through scripts/audio-elite.mjs
 *   (voice = the audio-elite preset unless --voice <id> is given). Billed to
 *   OpenRouter credits; needs OPENROUTER_API_KEY in the workspace .env.
 * - voicestudio: the local VoiceStudio app (REST API, default http://127.0.0.1:3900).
 *
 *   node voice-generate.mjs <project-dir> [--engine elite|voicestudio] [--voice <id|name>]
 *        [--language Auto] [--steps 32] [--speed 1] [--group N] [--pause 3]
 *        [--out audio/audio-full.mp3] [--dry] [--force]
 *
 * Script rules (see SKILL.md):
 * - Every non-empty line is one paragraph. Consecutive paragraphs are sent together,
 *   up to --group characters per request (default 4000 for elite, max 10000 per
 *   OpenRouter request; 1500 for VoiceStudio, which reloads its model on every
 *   request, about 45 s, so few large requests are much faster than many small ones).
 * - `[PAUSE 3s]` (or `[PAUSE]`, default --pause seconds) on its own line inserts silence.
 * - Lines inside ``` fences, and lines that are only `inline code`, are not spoken
 *   (commands shown on screen). Markdown heading marks, bold, and links are stripped.
 * - HTML comments are ignored.
 *
 * Parts are cached in <project>/audio-parts/ by a hash of text + voice settings,
 * so a rerun after an edit only generates the changed groups. The joined
 * file is normalized to -16 LUFS (scripts/normalize-audio.mjs) and written to --out.
 * A report goes to <project>/audio-parts/manifest.json (paragraph start times).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(name);
  if (i < 0) return def;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const engine = opt('--engine', 'elite');
if (!['elite', 'voicestudio'].includes(engine)) { console.error('error: --engine must be elite or voicestudio'); process.exit(1); }
const elite = engine === 'elite';
const api = opt('--api', process.env.VOICESTUDIO_URL || 'http://127.0.0.1:3900');
const voice = opt('--voice', elite ? 'elite' : 'Dexter');
const language = opt('--language', 'Auto');
const steps = Number(opt('--steps', 32));
const speed = Number(opt('--speed', 1));
const groupMax = Math.min(Number(opt('--group', elite ? 4000 : 1500)), elite ? 10000 : Infinity);
const defaultPause = Number(opt('--pause', 3));
const outArg = opt('--out', 'audio/audio-full.mp3');
const dry = argv.includes('--dry');
const force = argv.includes('--force');
const projectArg = argv.find((a) => !a.startsWith('--'));

function die(msg) { console.error(`error: ${msg}`); process.exit(1); }
if (!projectArg) die('usage: voice-generate.mjs <project-dir> [--voice Dexter] [--language Auto] [--dry]');

const project = resolve(projectArg);
const finalPath = join(project, 'script.md');
if (!existsSync(finalPath)) die(`missing ${finalPath}. Finalize the script first (step 3).`);
const spokenPath = join(project, 'audio-script.md');
let scriptPath = finalPath;
if (existsSync(spokenPath)) {
  if (statSync(finalPath).mtimeMs > statSync(spokenPath).mtimeMs) {
    die('audio-script.md is older than script.md. Update the spoken script first.');
  }
  scriptPath = spokenPath;
}

// ---------- parse the script into speech items ----------
function clean(line) {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__/g, '')
    .replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*>\s?/, '')
    .trim();
}

const raw = readFileSync(scriptPath, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const items = [];
let fence = false;
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim();
  if (t.startsWith('```')) { fence = !fence; continue; }
  if (fence || !t) continue;
  const pause = t.match(/^\[PAUSE(?:\s+(\d+(?:\.\d+)?)\s*s?)?\]$/i);
  if (pause) { items.push({ type: 'pause', sec: pause[1] ? Number(pause[1]) : defaultPause }); continue; }
  if (/^`[^`]+`$/.test(t)) continue;
  const text = clean(t);
  if (text && /[\p{L}\p{N}]/u.test(text)) items.push({ type: 'speech', text });
}
const speech = items.filter((i) => i.type === 'speech');
if (!speech.length) die(`no spoken text found in ${scriptPath}`);

const pauses = items.filter((i) => i.type === 'pause');
// Merge consecutive paragraphs into groups (one request each); pauses split groups.
const groups = [];
for (const item of items) {
  const last = groups[groups.length - 1];
  if (item.type === 'speech' && last?.type === 'speech' && last.text.length + item.text.length + 2 <= groupMax) {
    last.text += `\n\n${item.text}`;
    last.paragraphs++;
  } else groups.push({ ...item, paragraphs: 1 });
}
const requests = groups.filter((g) => g.type === 'speech');
console.log(`${engine} (${scriptPath.endsWith('audio-script.md') ? 'audio-script.md' : 'script.md'}): ${speech.length} paragraphs in ${requests.length} request(s), ${pauses.length} pause(s), ${speech.reduce((n, i) => n + i.text.length, 0)} characters.`);
if (dry) {
  for (const i of items) console.log(i.type === 'pause' ? `  [pause ${i.sec}s]` : `  ${i.text.slice(0, 110)}`);
  process.exit(0);
}

// ---------- resolve the voice ----------
async function resolveVoice() {
  const res = await fetch(`${api}/profiles`).catch(() => null);
  if (!res || !res.ok) die(`VoiceStudio is not reachable at ${api}. Open the VoiceStudio app and try again.`);
  const profiles = await res.json();
  const hit = profiles.find((p) => p.id === voice) || profiles.find((p) => p.name?.toLowerCase() === voice.toLowerCase());
  if (!hit) die(`voice "${voice}" not found. Available: ${profiles.map((p) => `${p.name} (${p.id})`).join(', ')}`);
  return hit;
}

function ff(args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) die(`ffmpeg failed: ${r.stderr.trim().split('\n').pop()}`);
}
function duration(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return Number(r.stdout.trim());
}

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const profile = elite ? { id: voice, name: voice } : await resolveVoice();
const partsDir = join(project, 'audio-parts');
mkdirSync(partsDir, { recursive: true });

const RATE = 48000;
const settings = elite ? { engine, voice } : { profile: profile.id, language, steps, speed };
let made = 0;
for (const [n, item] of requests.entries()) {
  const key = createHash('sha1').update(JSON.stringify({ ...settings, text: item.text })).digest('hex').slice(0, 12);
  item.file = join(partsDir, `${key}.wav`);
  if (existsSync(item.file) && !force) continue;
  const t0 = Date.now();
  if (elite) {
    // One audio-elite call per group; it reads the key from .env and never prints it.
    const txt = join(partsDir, `${key}.txt`);
    const mp3 = join(partsDir, `${key}.elite.mp3`);
    writeFileSync(txt, item.text + '\n');
    const args = [join(kitRoot, 'scripts/audio-elite.mjs'), '--file', txt, '--output', mp3];
    if (voice !== 'elite') args.push('--voice', voice);
    const r = spawnSync('node', args, { encoding: 'utf8', cwd: kitRoot });
    if (r.status !== 0 || !existsSync(mp3)) die(`request ${n + 1}: audio-elite failed: ${(r.stderr || r.stdout).trim().split('\n').pop()}`);
    ff(['-i', mp3, '-ar', String(RATE), '-ac', '1', '-c:a', 'pcm_s16le', item.file]);
    rmSync(mp3);
    rmSync(txt);
    made++;
    console.log(`[${n + 1}/${requests.length}] ${((Date.now() - t0) / 1000).toFixed(1)} s  ${item.text.slice(0, 70)}`);
    continue;
  }
  const form = new FormData();
  form.set('text', item.text);
  form.set('profile_id', profile.id);
  form.set('language', language);
  form.set('num_step', String(steps));
  form.set('speed', String(speed));
  const res = await fetch(`${api}/generate`, { method: 'POST', body: form });
  if (!res.ok) die(`request ${n + 1}: VoiceStudio answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 4).toString() !== 'RIFF') die(`request ${n + 1}: answer is not a WAV file`);
  const tmp = `${item.file}.raw.wav`;
  writeFileSync(tmp, buf);
  ff(['-i', tmp, '-ar', String(RATE), '-ac', '1', '-c:a', 'pcm_s16le', item.file]);
  rmSync(tmp);
  made++;
  console.log(`[${n + 1}/${requests.length}] ${((Date.now() - t0) / 1000).toFixed(1)} s  ${item.text.slice(0, 70)}`);
}
console.log(`Generated ${made} new request(s), reused ${requests.length - made}.`);

// ---------- join with gaps and pauses ----------
const silence = (sec) => {
  const f = join(partsDir, `silence-${sec.toFixed(2)}.wav`);
  if (!existsSync(f)) ff(['-f', 'lavfi', '-i', `anullsrc=r=${RATE}:cl=mono`, '-t', sec.toFixed(3), '-c:a', 'pcm_s16le', f]);
  return f;
};
const list = [];
const manifest = [];
let t = 0;
for (const item of groups) {
  if (item.type === 'pause') {
    list.push(silence(item.sec));
    manifest.push({ type: 'pause', start: +t.toFixed(3), dur: item.sec });
    t += item.sec;
    continue;
  }
  const d = duration(item.file);
  list.push(item.file);
  manifest.push({ type: 'speech', start: +t.toFixed(3), dur: +d.toFixed(3), paragraphs: item.paragraphs, text: item.text });
  t += d;
}
const listFile = join(partsDir, 'concat.txt');
writeFileSync(listFile, list.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
const joined = join(partsDir, 'joined.wav');
ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c:a', 'pcm_s16le', joined]);

const out = resolve(project, outArg);
mkdirSync(dirname(out), { recursive: true });
const rawMp3 = join(partsDir, 'joined.mp3');
ff(['-i', joined, '-c:a', 'libmp3lame', '-b:a', '256k', rawMp3]);

const norm = spawnSync('node', [join(kitRoot, 'scripts/normalize-audio.mjs'), rawMp3], { encoding: 'utf8' });
if (norm.status !== 0) die(`normalize-audio failed: ${norm.stderr.trim()}`);
renameSync(join(partsDir, 'joined.norm.mp3'), out);

writeFileSync(join(partsDir, 'manifest.json'), JSON.stringify({ engine, voice: profile.name, ...settings, group: groupMax, total: +t.toFixed(3), items: manifest }, null, 2));
console.log(`Wrote ${out} (${duration(out).toFixed(1)} s, -16 LUFS). Parts and manifest in ${partsDir}.`);
