#!/usr/bin/env node
/**
 * Task board for video-full-deploy. Reads projects-full/<name>/ and
 * video-projects/<name>/ and works out the state of the 8 tasks (0-7) from the files.
 * A name that has no project yet gives a board where only task 0 (create) can run.
 *
 *   node deploy-status.mjs <name>                 # JSON state
 *   node deploy-status.mjs <name> --html          # widget HTML for show_widget (play buttons)
 *   node deploy-status.mjs <name> --set platform=pc voice=elite language=English
 *   node deploy-status.mjs <name> --approve script
 *   node deploy-status.mjs <name> --log "Update 2: 3 new videos"
 *
 * Settings and approvals live in projects-full/<name>/DEPLOY.json.
 * Run from the kit root.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const name = argv.find((a) => !a.startsWith('--') && !a.includes('='));
if (!name) { console.error('usage: deploy-status.mjs <name> [--html] [--set k=v ...] [--approve script] [--log text]'); process.exit(1); }

const root = resolve('.');
const P = join(root, 'projects-full', name);
const V = join(root, 'video-projects', name);
const exists = existsSync(P);

const statePath = join(P, 'DEPLOY.json');
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { name, approvals: {}, log: [] };
state.approvals ??= {};
state.log ??= [];
const today = new Date().toISOString().slice(0, 16).replace('T', ' ');
let dirty = false;

const setIdx = argv.indexOf('--set');
if (setIdx >= 0) {
  for (const kv of argv.slice(setIdx + 1).filter((a) => a.includes('='))) {
    const [k, ...v] = kv.split('=');
    state[k] = v.join('=');
  }
  dirty = true;
}
const apIdx = argv.indexOf('--approve');
if (apIdx >= 0) { state.approvals[argv[apIdx + 1]] = today; state.log.push(`${today} approved ${argv[apIdx + 1]}`); dirty = true; }
const logIdx = argv.indexOf('--log');
if (logIdx >= 0) { state.log.push(`${today} ${argv[logIdx + 1]}`); dirty = true; }
if (dirty && !exists) { console.error(`projects-full/${name} does not exist. Run task 0 (create) first.`); process.exit(1); }
if (dirty) writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');

// ---------- helpers ----------
const mtime = (f) => (existsSync(f) ? statSync(f).mtimeMs : 0);
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const VIDEO = /\.(mp4|mov|m4v|mkv|webm)$/i;
const videos = existsSync(join(P, 'video'))
  ? readdirSync(join(P, 'video')).filter((f) => VIDEO.test(f)).map((f) => ({ name: f, size: statSync(join(P, 'video', f)).size }))
  : [];
const originalScript = read(join(P, 'original', 'script.md')).trim().length > 0;

const audit = read(join(P, 'script_audit.md'));
const reviewed = new Map();
for (const m of audit.matchAll(/^\|\s*`?([^|`]+?\.(?:mp4|mov|m4v|mkv|webm))`?\s*\|\s*(\d+)\s*\|/gim)) reviewed.set(m[1].trim(), Number(m[2]));
const newVideos = videos.filter((v) => reviewed.get(v.name) !== v.size);
const footage = [...audit.matchAll(/^###\s+\d+\.\s+.*?\((REQUIRED|OPTIONAL)\)\s*:?\s*(OPEN|PARTIAL|DONE)/gim)].map((m) => ({ need: m[1].toUpperCase(), status: m[2].toUpperCase() }));
const openRequired = footage.filter((f) => f.need === 'REQUIRED' && f.status !== 'DONE').length;
const openOptional = footage.filter((f) => f.need === 'OPTIONAL' && f.status !== 'DONE').length;

const tChanged = mtime(join(P, 'script_changed.md'));
const tFinal = mtime(join(P, 'script.md'));
const tCommands = mtime(join(P, 'commands.md'));
const audioPath = join(P, 'audio', 'audio-full.mp3');
const tAudio = mtime(audioPath);
const tAnalysis = mtime(join(V, 'ANALYSIS.md'));
const tVerify = mtime(join(V, 'VERIFY.md'));
const tDesc = mtime(join(P, 'youtube', 'description.md'));
const tThumb = mtime(join(P, 'youtube', 'thumbnail.png'));

// ---------- task states ----------
// status: done | ready | waiting | blocked | stale
const tasks = [];
const add = (id, cmd, title, status, detail) => tasks.push({ id, cmd, title, status, detail });
const done = (id) => tasks.find((t) => t.id === id)?.status === 'done';

add(0, 'create', 'Generate project', exists ? 'done' : 'ready', exists ? `projects-full/${name}` : 'copy projects-full/demo');

if (!exists) {
  add(1, 'review', 'Check script against videos', 'blocked', 'run task 0 first');
} else if (!originalScript || !videos.length) {
  add(1, 'review', 'Check script against videos', 'blocked',
    [!originalScript && 'paste your script into original/script.md', !videos.length && 'add recordings to video/'].filter(Boolean).join(', '));
} else if (tChanged && audit) {
  add(1, 'review', 'Check script against videos', 'done', `${reviewed.size} video(s) reviewed`);
} else {
  add(1, 'review', 'Check script against videos', 'ready', `${videos.length} video(s) to review`);
}

if (!tChanged) add(2, 'update', 'Review new recordings', 'blocked', 'run task 1 first');
else if (newVideos.length) add(2, 'update', 'Review new recordings', 'ready', `${newVideos.length} new or changed video(s)`);
else add(2, 'update', 'Review new recordings', openRequired ? 'waiting' : 'done',
  openRequired ? `record ${openRequired} required clip(s)${openOptional ? `, ${openOptional} optional` : ''}` : `no new videos${openOptional ? `, ${openOptional} optional clip(s) open` : ''}`);

if (!tChanged) add(3, 'finalize', 'Approve and write final script', 'blocked', 'run task 1 first');
else if (tFinal >= tChanged && tCommands >= tChanged && state.approvals.script) add(3, 'finalize', 'Approve and write final script', 'done', 'script.md and commands.md written');
else if (tFinal && tFinal < tChanged && state.approvals.script) add(3, 'finalize', 'Approve and write final script', 'stale', 'script changed since the last final version');
else add(3, 'finalize', 'Approve and write final script', 'ready', openRequired ? `${openRequired} required clip(s) still open` : 'waiting for your approval');

if (!done(3)) add(4, 'audio', 'Generate narration (audio-elite)', 'blocked', 'finish task 3 first');
else if (tAudio > tFinal) add(4, 'audio', 'Generate narration (audio-elite)', 'done', `audio/audio-full.mp3 · ${state.voice || 'elite'}`);
else if (tAudio) add(4, 'audio', 'Generate narration (audio-elite)', 'stale', 'script.md is newer than the audio');
else add(4, 'audio', 'Generate narration (audio-elite)', 'ready', `voice ${state.voice || 'elite'}`);

const skill = { pc: 'video-pc-edit', iphone: 'video-iphone-edit', 'iphone-pc': 'video-iphone-pc-edit' }[state.platform] || 'video-pc-edit / video-iphone-edit';
if (!tAudio) add(5, 'build', 'Build the video', 'blocked', 'run task 4 first');
else if (tVerify > tAudio) add(5, 'build', 'Build the video', 'done', `${skill} · ready to render`);
else if (tVerify) add(5, 'build', 'Build the video', 'stale', 'audio is newer than the build');
else if (tAnalysis > tAudio) add(5, 'build', 'Build the video', 'waiting', 'analysis ready, waiting for your OK');
else add(5, 'build', 'Build the video', 'ready', skill);

if (!done(5)) add(6, 'description', 'YouTube description (SEO)', 'blocked', 'finish task 5 first');
else if (tDesc > tVerify) add(6, 'description', 'YouTube description (SEO)', 'done', 'youtube/description.md');
else add(6, 'description', 'YouTube description (SEO)', tDesc ? 'stale' : 'ready', tDesc ? 'build changed, chapters may be off' : 'title, chapters, commands, tags');

if (!done(3)) add(7, 'thumbnail', 'Thumbnail image', 'blocked', 'finish task 3 first');
else if (tThumb) add(7, 'thumbnail', 'Thumbnail image', 'done', 'youtube/thumbnail.png');
else add(7, 'thumbnail', 'Thumbnail image', 'ready', '1280x720 PNG');

const next = tasks.find((t) => t.status === 'ready' || t.status === 'stale');
const result = {
  name, exists, platform: state.platform || null, voice: state.voice || 'elite', language: state.language || 'Auto',
  approvals: state.approvals, videos: videos.length, newVideos: newVideos.map((v) => v.name),
  footage: { openRequired, openOptional }, next: next ? next.cmd : null, tasks,
};

if (!argv.includes('--html')) { console.log(JSON.stringify(result, null, 2)); process.exit(0); }

// ---------- widget HTML (Claude passes it to show_widget) ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rows = tasks.map((t) => {
  const isNext = next && t.id === next.id;
  const cmd = `/video-full-deploy ${name} ${t.cmd}`;
  return `<div style="display:grid;grid-template-columns:20px minmax(0,1fr);gap:12px;align-items:start;padding:10px 12px;border:${isNext ? '2px solid var(--border-accent)' : '0.5px solid var(--border)'};border-radius:var(--radius);margin-bottom:8px;background:var(--surface-2)">
<input type="checkbox" data-k="${t.id}" data-done="${t.status === 'done' ? 1 : 0}" aria-label="Mark task ${t.id} as done" style="margin-top:3px">
<div style="min-width:0"><p style="margin:0;font-size:15px;font-weight:500">${t.id}. ${esc(t.title)}</p><p style="margin:0;font-size:13px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.detail)}</p>
<div style="display:flex;align-items:center;gap:6px;margin-top:6px"><code style="flex:1;min-width:0;font-family:var(--font-mono);font-size:13px;padding:4px 8px;background:var(--surface-1);border-radius:var(--radius);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(cmd)}</code><button data-c="${esc(cmd)}" aria-label="Copy command for task ${t.id}" title="Copy command" style="padding:4px 8px"><i class="ti ti-copy" aria-hidden="true" style="font-size:15px"></i></button><button data-c="${esc(cmd)} new" data-n="1" aria-label="Copy command that starts task ${t.id} in a new session" title="Run in a new session" style="padding:4px 8px"><i class="ti ti-message-plus" aria-hidden="true" style="font-size:15px"></i></button></div></div>
</div>`;
}).join('\n');

const meta = !exists ? 'new project, not created yet' : [state.platform ? `platform ${state.platform}` : 'platform not set', `voice ${result.voice}`, `${videos.length} video(s)`].join(' · ');
process.stdout.write(`<h2 class="sr-only">Deploy tasks for ${esc(name)}: ${tasks.filter((t) => t.status === 'done').length} of ${tasks.length} done${next ? `, next is task ${next.id}` : ''}.</h2>
<div style="padding:0.5rem 0 12px"><p style="margin:0;font-size:16px;font-weight:500">${esc(name)}</p><p style="margin:0;font-size:13px;color:var(--text-secondary)">${esc(meta)}</p></div>
${rows}
<p id="msg" style="margin:4px 0 0;font-size:13px;color:var(--text-secondary);min-height:18px"></p>
<script>
// Copy a task's command to paste in chat. The second icon copies the command
// with "new", which makes Claude start the task in a fresh session (SKILL.md).
// Checkboxes are the user's own
// progress marks: they start checked for done tasks and are kept per browser.
var KEY = 'vfd:${esc(name)}:';
document.querySelectorAll('input[data-k]').forEach(function (c) {
  var v = null;
  try { v = localStorage.getItem(KEY + c.dataset.k); } catch (e) {}
  c.checked = v === null ? c.dataset.done === '1' : v === '1';
  c.addEventListener('change', function () {
    try { localStorage.setItem(KEY + c.dataset.k, c.checked ? '1' : '0'); } catch (e) {}
  });
});
document.querySelectorAll('button[data-c]').forEach(function (b) {
  b.addEventListener('click', function () {
    var p = b.dataset.c, m = document.getElementById('msg'), i = b.querySelector('i'), ic = i.className;
    var done = function () {
      i.className = 'ti ti-check';
      m.textContent = b.dataset.n
        ? 'Copied. Paste it in chat: Claude starts this task in a new session.'
        : 'Copied. Paste it in chat and press Enter.';
      setTimeout(function () { i.className = ic; }, 1500);
    };
    var ta = document.createElement('textarea');
    ta.value = p; ta.style.position = 'absolute'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    if (ok) return done();
    var fail = function () {
      var r = document.createRange(); r.selectNodeContents(b.parentNode.querySelector('code'));
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      m.textContent = 'Copy is blocked here. The command is selected: press Cmd+C'
        + (b.dataset.n ? ' and add " new" at the end.' : '.');
    };
    if (navigator.clipboard) navigator.clipboard.writeText(p).then(done, fail); else fail();
  });
});
</script>
`);
