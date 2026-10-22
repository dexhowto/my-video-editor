#!/usr/bin/env node
/**
 * Video inspection utility for the video-process-script skill.
 * Probes video properties, extracts frames, generates contact sheets,
 * and parses mouse click logs if available.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename, extname, join } from 'node:path';

const args = process.argv.slice(2);
const command = args[0];

function usage() {
  console.log(`Usage:
  node inspect-video.mjs probe <video-path>
  node inspect-video.mjs sheet <video-path> [--fps <fps>] [--tile <WxH>] [--scale <width>] [--out <path>]
  node inspect-video.mjs frame <video-path> --time <seconds> [--out <path>]
  node inspect-video.mjs clicks <video-path>
  node inspect-video.mjs summary <video-path>
`);
  process.exit(1);
}

if (!command || ['-h', '--help', 'help'].includes(command)) {
  usage();
}

function probeVideo(videoPath) {
  const jsonStr = execFileSync(
    'ffprobe',
    [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,duration,nb_frames:format=duration,size',
      '-of', 'json',
      videoPath,
    ],
    { encoding: 'utf8' }
  );
  const data = JSON.parse(jsonStr);
  const videoStream = data.streams?.find((s) => s.codec_type === 'video') || {};
  const audioStream = data.streams?.find((s) => s.codec_type === 'audio') || null;

  let fps = null;
  if (videoStream.r_frame_rate) {
    const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
    fps = den ? Math.round((num / den) * 100) / 100 : null;
  }

  const durationSec = parseFloat(videoStream.duration || data.format?.duration || 0);
  const sizeBytes = parseInt(data.format?.size || 0, 10);

  return {
    path: videoPath,
    width: videoStream.width || null,
    height: videoStream.height || null,
    fps,
    durationSec,
    sizeBytes,
    hasAudio: !!audioStream,
    videoCodec: videoStream.codec_name || 'unknown',
  };
}

function parseMouseClicks(videoPath) {
  const dir = dirname(videoPath);
  const base = basename(videoPath, extname(videoPath));
  
  // Potential mouse log locations
  const candidates = [
    join(dir, `${base}.mouse.jsonl`),
    join(dir, `${basename(videoPath)}.mouse.jsonl`),
    join(dir, 'mouse.jsonl'),
  ];

  let mouseFile = candidates.find((f) => existsSync(f));
  if (!mouseFile) {
    return null;
  }

  const lines = readFileSync(mouseFile, 'utf8').split('\n').filter(Boolean);
  const clicks = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.event && entry.event.includes('click')) {
        clicks.push({
          timeSec: entry.t ?? (entry.time_ms ? entry.time_ms / 1000 : null),
          event: entry.event,
          button: entry.button || (entry.event.startsWith('right') ? 'right' : 'left'),
          norm_x: entry.norm_x ?? null,
          norm_y: entry.norm_y ?? null,
          x: entry.x ?? null,
          y: entry.y ?? null,
        });
      }
    } catch {
      // ignore malformed line
    }
  }

  return { mouseFile, clicks };
}

function generateContactSheet(videoPath, opts = {}) {
  const fps = opts.fps || 2;
  const tile = opts.tile || '10x4';
  const scale = opts.scale || 180;
  const outPath = opts.out || resolve(dirname(videoPath), `${basename(videoPath, extname(videoPath))}.sheet.png`);

  mkdirSync(dirname(outPath), { recursive: true });

  const vf = `fps=${fps},scale=${scale}:-1,tile=${tile}`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', videoPath, '-vf', vf, '-frames:v', '1', outPath]);
  return outPath;
}

function extractFrame(videoPath, timeSec, outPath) {
  const target = outPath || resolve(dirname(videoPath), `${basename(videoPath, extname(videoPath))}-frame-${timeSec}s.png`);
  mkdirSync(dirname(target), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(timeSec), '-i', videoPath, '-frames:v', '1', target]);
  return target;
}

const videoPath = args[1];
if (!videoPath) {
  console.error('Error: video path is required.');
  usage();
}

if (!existsSync(videoPath)) {
  console.error(`Error: file not found at ${videoPath}`);
  process.exit(1);
}

switch (command) {
  case 'probe': {
    const info = probeVideo(videoPath);
    console.log(JSON.stringify(info, null, 2));
    break;
  }

  case 'sheet': {
    const fpsIdx = args.indexOf('--fps');
    const tileIdx = args.indexOf('--tile');
    const scaleIdx = args.indexOf('--scale');
    const outIdx = args.indexOf('--out');

    const fps = fpsIdx !== -1 ? parseFloat(args[fpsIdx + 1]) : 2;
    const tile = tileIdx !== -1 ? args[tileIdx + 1] : '10x4';
    const scale = scaleIdx !== -1 ? parseInt(args[scaleIdx + 1], 10) : 180;
    const out = outIdx !== -1 ? args[outIdx + 1] : null;

    const sheetFile = generateContactSheet(videoPath, { fps, tile, scale, out });
    console.log(`Contact sheet generated: ${sheetFile}`);
    break;
  }

  case 'frame': {
    const timeIdx = args.indexOf('--time');
    if (timeIdx === -1 || !args[timeIdx + 1]) {
      console.error('Error: --time <seconds> is required for frame extraction.');
      process.exit(1);
    }
    const timeSec = parseFloat(args[timeIdx + 1]);
    const outIdx = args.indexOf('--out');
    const out = outIdx !== -1 ? args[outIdx + 1] : null;

    const frameFile = extractFrame(videoPath, timeSec, out);
    console.log(`Frame extracted: ${frameFile}`);
    break;
  }

  case 'clicks': {
    const result = parseMouseClicks(videoPath);
    if (!result) {
      console.log('No .mouse.jsonl log found for this video.');
    } else {
      console.log(`Found mouse log: ${result.mouseFile}`);
      console.log(`Total click events: ${result.clicks.length}`);
      console.log(JSON.stringify(result.clicks, null, 2));
    }
    break;
  }

  case 'summary': {
    const info = probeVideo(videoPath);
    const mouse = parseMouseClicks(videoPath);
    console.log(`Video: ${basename(videoPath)}`);
    console.log(`Duration: ${info.durationSec.toFixed(2)}s`);
    console.log(`Resolution: ${info.width}x${info.height} (${info.fps || 'variable'} fps)`);
    console.log(`Audio: ${info.hasAudio ? 'yes' : 'no'}`);
    if (mouse) {
      console.log(`Mouse log: ${mouse.clicks.length} click events recorded in ${basename(mouse.mouseFile)}`);
      for (const c of mouse.clicks.slice(0, 10)) {
        console.log(`  - t=${c.timeSec.toFixed(2)}s: ${c.event} at (${c.x?.toFixed(1) || '?'}, ${c.y?.toFixed(1) || '?'})`);
      }
      if (mouse.clicks.length > 10) {
        console.log(`  ... and ${mouse.clicks.length - 10} more`);
      }
    } else {
      console.log('Mouse log: None');
    }
    break;
  }

  default:
    console.error(`Unknown command: ${command}`);
    usage();
}
