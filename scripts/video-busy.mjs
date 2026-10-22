#!/usr/bin/env node
// Build lock for the /video-* build skills.
//
// Only one /video-* build runs at a time. A build waits while another
// project's build holds the lock (.video-build.lock). Video renders do not
// count: a build may run while a render is in progress.
//
// Usage (from the repo root):
//   node scripts/video-busy.mjs                       status only
//   node scripts/video-busy.mjs --lock <name> [--skill <skill>]
//                                                     take the lock if free
//   node scripts/video-busy.mjs --touch <name> [--mode night|day]
//                                                     refresh the heartbeat
//   node scripts/video-busy.mjs --unlock <name>       release the lock
//
// Exit codes: 0 = free (or lock taken / touched / released), 2 = busy,
// 1 = usage error. Every call prints `mode: night` between 00:00 and 06:59
// local time, otherwise `mode: day`.
//
// A lock whose heartbeat is older than 4 hours is stale and is replaced.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCK = path.join(REPO, ".video-build.lock");
const STALE_MS = 4 * 60 * 60 * 1000;

const args = process.argv.slice(2);
const opt = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

function nightMode(now = new Date()) {
  return now.getHours() < 7;
}

function readLock() {
  try {
    const lock = JSON.parse(fs.readFileSync(LOCK, "utf8"));
    const age = Date.now() - Date.parse(lock.heartbeat || lock.started);
    return { ...lock, stale: !(age < STALE_MS) };
  } catch {
    return null;
  }
}

function writeLock(lock, exclusive) {
  const data = JSON.stringify(lock, null, 2) + "\n";
  if (!exclusive) return fs.writeFileSync(LOCK, data);
  const fd = fs.openSync(LOCK, "wx"); // fails if another waiter won the race
  fs.writeSync(fd, data);
  fs.closeSync(fd);
}

function report(busy) {
  console.log(`mode: ${nightMode() ? "night" : "day"}`);
  if (busy.length === 0) {
    console.log("status: free");
  } else {
    console.log("status: busy");
    for (const reason of busy) console.log(`  - ${reason}`);
  }
}

function busyReasons(ownName) {
  const reasons = [];
  const lock = readLock();
  if (lock && !lock.stale && lock.project !== ownName) {
    reasons.push(
      `build lock: /${lock.skill || "video-*"} ${lock.project} (started ${lock.started}, heartbeat ${lock.heartbeat})`
    );
  }
  return reasons;
}

const lockName = opt("--lock");
const touchName = opt("--touch");
const unlockName = opt("--unlock");

if (lockName) {
  const busy = busyReasons(lockName);
  if (busy.length) {
    report(busy);
    process.exit(2);
  }
  const now = new Date().toISOString();
  const prev = readLock();
  const lock = {
    project: lockName,
    skill: opt("--skill") || prev?.skill || "",
    started: prev && prev.project === lockName && !prev.stale ? prev.started : now,
    heartbeat: now,
    mode: prev && prev.project === lockName ? prev.mode : undefined,
  };
  try {
    if (prev) fs.rmSync(LOCK, { force: true }); // own, stale, or absent lock
    writeLock(lock, true);
  } catch {
    report([`build lock was taken by another waiter just now`]);
    process.exit(2);
  }
  report([]);
  console.log(`lock: taken for ${lockName}`);
  process.exit(0);
}

if (touchName) {
  const lock = readLock();
  if (!lock || lock.project !== touchName) {
    console.error(`no lock held for ${touchName}; run --lock ${touchName} first`);
    process.exit(1);
  }
  delete lock.stale;
  lock.heartbeat = new Date().toISOString();
  const mode = opt("--mode");
  if (mode) lock.mode = mode;
  writeLock(lock, false);
  console.log(`mode: ${nightMode() ? "night" : "day"}`);
  console.log(`lock: refreshed for ${touchName}${lock.mode ? ` (run mode ${lock.mode})` : ""}`);
  process.exit(0);
}

if (unlockName) {
  const lock = readLock();
  if (lock && lock.project === unlockName) fs.rmSync(LOCK, { force: true });
  console.log(`lock: released for ${unlockName}`);
  process.exit(0);
}

if (args.length) {
  console.error("usage: video-busy.mjs [--lock <name> [--skill <s>] | --touch <name> [--mode night|day] | --unlock <name>]");
  process.exit(1);
}

const busy = busyReasons();
report(busy);
process.exit(busy.length ? 2 : 0);
