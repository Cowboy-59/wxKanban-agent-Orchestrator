#!/usr/bin/env node
// [SCOPE 143 / T038] BEGIN — one-time re-derive of this project's own local run log (FR-027)
//
// Nothing in decisions/agentrun-log.jsonl has ever reached the server: decisions/agentrun-forwarded.txt
// and decisions/agentrun-rejected.jsonl do not exist, and no project token is configured on this
// machine. D-0166's original assumption that "the Breeze-1 client runs" ARE this project's local log
// was wrong (corrected by D-0179): a separate, independently-forwarded project folder is the real
// source of Breeze-1's billable data, and this wxKanban repo's own log is never sent or billed as
// Breeze-1 work. So there is nothing in production agentruns to retire for this project; this script
// does not use the retiredat/replacedbyid mechanism (that stays in agentRuns.ts for whichever
// project actually has a configured token and prior production rows).
//
// Instead it rebuilds the local log from the original Claude Code transcripts still on disk, using the
// already-fixed capture-worker.mjs build functions (T033 project-from-task is resolved server-side at
// send time and needs no local change; T036 active/waiting and T037 taskid-on-capture are re-derived
// here from the real per-line transcript data, not guessed from an aggregate row). taskid is filled in
// best-effort from decisions/routing-log.jsonl's model-choice events by time overlap; no match leaves
// it null rather than guessing wrong.
//
// Usage: node _wxAI/routing/redrive-log.mjs [--root <dir>] [--apply]
//   (no --apply): dry run. Prints a summary only; writes nothing.
//   --apply: backs up the current log to decisions/agentrun-log.pre-T038.jsonl.bak, then overwrites
//            decisions/agentrun-log.jsonl with the regenerated records.
//
// Record ids are deterministic from sessionId + turn index / agentId, never from content (see
// capture-worker.mjs), so re-running this script always reproduces the same ids for the same
// transcripts: safe to run more than once.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { buildSessionRecords, buildSubagentRecord, readProjectId, LOG_REL } from './capture-worker.mjs';

const ROUTING_LOG_REL = join('decisions', 'routing-log.jsonl');
const BACKUP_REL = join('decisions', 'agentrun-log.pre-T038.jsonl.bak');

/** Claude Code's own encoding of a project path into its transcripts folder name. */
function encodeProjectDir(root) {
  return root.replace(/[^a-zA-Z0-9]/g, '-').replace(/^./, (c) => c.toLowerCase());
}

function findTranscriptsDir(root) {
  const candidate = join(homedir(), '.claude', 'projects', encodeProjectDir(resolve(root)));
  return existsSync(candidate) ? candidate : null;
}

function loadRoutingEvents(root) {
  const file = join(root, ROUTING_LOG_REL);
  if (!existsSync(file)) return [];
  const out = [];
  for (const l of readFileSync(file, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try {
      const r = JSON.parse(l);
      if (r.event === 'model-choice' && r.taskid) out.push({ time: r.time, taskid: r.taskid });
    } catch { /* skip */ }
  }
  return out;
}

/**
 * Best-effort taskid for a record: the closest model-choice event whose timestamp falls within
 * [startMs, endMs]. No event in range -> null (never guessed from outside the run's own window).
 */
export function taskidFor(events, startMs, endMs) {
  let best = null;
  let bestDelta = Infinity;
  for (const e of events) {
    const t = Date.parse(e.time);
    if (Number.isNaN(t) || t < startMs || t > endMs) continue;
    const delta = Math.abs(t - startMs);
    if (delta < bestDelta) { best = e.taskid; bestDelta = delta; }
  }
  return best;
}

/** Rebuild every record this project's surviving transcripts can produce. */
export function redrive(root) {
  const transcriptsDir = findTranscriptsDir(root);
  if (!transcriptsDir) return { error: `No Claude Code transcripts folder found for ${root}` };
  const projectid = readProjectId(root);
  const events = loadRoutingEvents(root);

  const records = [];
  for (const entry of readdirSync(transcriptsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
    const sessionId = entry.name.slice(0, -'.jsonl'.length);
    const transcriptPath = join(transcriptsDir, entry.name);

    // One call covers every turn in the session; taskid is resolved per-turn below since a session
    // can span more than one task.
    for (const r of buildSessionRecords({ sessionId, transcriptPath, projectid, taskid: null })) {
      r.taskid = taskidFor(events, Date.parse(r.starttime), Date.parse(r.endtime));
      records.push(r);
    }

    const subagentsDir = join(transcriptsDir, sessionId, 'subagents');
    if (!existsSync(subagentsDir)) continue;
    for (const sub of readdirSync(subagentsDir)) {
      if (!sub.endsWith('.jsonl')) continue;
      const agentId = sub.slice('agent-'.length, -'.jsonl'.length);
      const r = buildSubagentRecord({
        sessionId, agentId, agentType: null, transcriptPath: join(subagentsDir, sub), projectid, taskid: null,
      });
      if (r) {
        r.taskid = taskidFor(events, Date.parse(r.starttime), Date.parse(r.endtime));
        records.push(r);
      }
    }
  }
  return { records, transcriptsDir };
}

export function summarize(oldRecords, newRecords) {
  const oldById = new Map(oldRecords.map((r) => [r.id, r]));
  const newById = new Map(newRecords.map((r) => [r.id, r]));
  let matched = 0;
  let added = 0;
  let taskidFilled = 0;
  let oldActive = 0;
  let newActive = 0;
  let oldWaiting = 0;
  let newWaiting = 0;
  for (const r of oldRecords) { oldActive += r.activeseconds ?? 0; oldWaiting += r.waitingseconds ?? 0; }
  for (const r of newRecords) {
    newActive += r.activeseconds ?? 0;
    newWaiting += r.waitingseconds ?? 0;
    const prior = oldById.get(r.id);
    if (prior) {
      matched++;
      if (r.taskid && !prior.taskid) taskidFilled++;
    } else added++;
  }
  const missing = oldRecords.filter((r) => !newById.has(r.id)).length;
  return { oldCount: oldRecords.length, newCount: newRecords.length, matched, added, missing, taskidFilled, oldActive, newActive, oldWaiting, newWaiting };
}

function main(argv) {
  const i = argv.indexOf('--root');
  const root = resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : process.cwd());
  const apply = argv.includes('--apply');

  const logFile = join(root, LOG_REL);
  const oldRecords = [];
  if (existsSync(logFile)) {
    for (const l of readFileSync(logFile, 'utf8').split('\n')) {
      if (!l.trim()) continue;
      try { oldRecords.push(JSON.parse(l)); } catch { /* a half-written line */ }
    }
  }

  const result = redrive(root);
  if (result.error) {
    process.stdout.write(result.error + '\n');
    process.exitCode = 1;
    return;
  }

  const stats = summarize(oldRecords, result.records);
  process.stdout.write(
    `Transcripts: ${result.transcriptsDir}\n` +
    `Old log: ${stats.oldCount} records (active ${stats.oldActive}s, waiting ${stats.oldWaiting}s)\n` +
    `Re-derived: ${stats.newCount} records (active ${stats.newActive}s, waiting ${stats.newWaiting}s)\n` +
    `  matched existing id: ${stats.matched}; new (transcript not in old log): ${stats.added}; ` +
    `old id no longer reproducible: ${stats.missing}\n` +
    `  taskid filled in on a previously-null record: ${stats.taskidFilled}\n`,
  );

  if (!apply) {
    process.stdout.write('Dry run only; nothing written. Re-run with --apply to replace the log.\n');
    return;
  }
  mkdirSync(dirname(logFile), { recursive: true });
  if (existsSync(logFile)) copyFileSync(logFile, join(root, BACKUP_REL));
  writeFileSync(logFile, result.records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  process.stdout.write(`Applied: ${logFile} replaced (${stats.newCount} records); backup at ${BACKUP_REL}\n`);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/routing/redrive-log.mjs')) main(process.argv.slice(2));
// [SCOPE 143 / T038] END
