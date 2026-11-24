#!/usr/bin/env node
// Unattended runs and their checkpoint list (SCOPE-137 FR-009).
//
//   node _wxAI/impact/unattended.mjs start --by wxG-O-D [--attended]   mark this run unattended (12 hours, one session)
//   node _wxAI/impact/unattended.mjs stop                              end it (only this session's marker)
//   node _wxAI/impact/unattended.mjs checkpoint [--since <n>] [--json] list crossings since the last checkpoint, once
//   node _wxAI/impact/unattended.mjs status                            is a marker in place?
//
// While unattended, an edit that crosses an Impact Boundary is logged and goes ahead; one with
// possible data loss still stops. A checkpoint lists every crossing and stop since the last one.
//
// --attended (SPEC-136 FR-045, wxG-O-D --impact-bypass): the developer is present. Boundaries are
// logged and continue the same way, but questions still reach the developer (the Ask Gate keeps
// asking) and a data-loss stop says the developer can approve it.
// --session <id> (default: CLAUDE_CODE_SESSION_ID): start refuses while another session holds a
// live marker, and stop leaves another session's marker in place.
// --since <n>: list crossings from log line n (a run records `offset` from `checkpoint --json` at
// its start), so a run lists only its own crossings.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { crossingsOffset, crossingsSince, crossingsSinceCheckpoint, MARKER_FILE, renderCrossings, startUnattended, stopUnattended } from './lib/unattended.mjs';

// [SCOPE 137 / T010] BEGIN — Unattended CLI: start, stop, status, checkpoint (FR-009)
// MODIFIED-BY: [SCOPE 136 / T053] — --attended, --session ownership on start/stop, checkpoint --since and its offset (SPEC-136 FR-045)
function main(argv) {
  const [cmd] = argv;
  const opt = (name) => {
    const j = argv.indexOf(name);
    return j >= 0 && argv[j + 1] ? argv[j + 1] : null;
  };
  const root = resolve(opt('--root') ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  const by = opt('--by') ?? 'unattended run';
  const sessionId = opt('--session') ?? process.env.CLAUDE_CODE_SESSION_ID ?? null;

  if (cmd === 'start') {
    const attended = argv.includes('--attended');
    const m = startUnattended(root, { by, attended, sessionId });
    if (m.refused) {
      process.stderr.write(`Not started: another session (${m.holder.sessionId}) holds a live marker (${m.holder.by}) until ${m.holder.expiresAt}.\n`);
      return 1;
    }
    process.stdout.write(attended
      ? `Impact bypass until ${m.expiresAt} (${by}). Boundaries are logged and continue; possible data loss still stops and asks you; questions still reach you.\n`
      : `Unattended until ${m.expiresAt} (${by}). Boundaries are logged and continue; possible data loss still stops.\n`);
    return 0;
  }
  if (cmd === 'stop') {
    const file = join(root, MARKER_FILE);
    const had = existsSync(file);
    const removed = stopUnattended(root, { sessionId });
    process.stdout.write(removed ? 'Unattended run ended.\n' : had ? 'Left in place: the marker belongs to another session.\n' : 'No unattended marker was set.\n');
    return 0;
  }
  if (cmd === 'status') {
    const file = join(root, MARKER_FILE);
    process.stdout.write(existsSync(file) ? readFileSync(file, 'utf8') : 'No unattended marker.\n');
    return 0;
  }
  if (cmd === 'checkpoint') {
    const since = opt('--since');
    const offset = crossingsOffset(root);
    const entries = since !== null ? crossingsSince(root, since) : crossingsSinceCheckpoint(root, { advance: true });
    if (since !== null) crossingsSinceCheckpoint(root, { advance: true });
    const label = since !== null ? 'this run began' : 'the last checkpoint';
    process.stdout.write(argv.includes('--json') ? JSON.stringify({ offset, entries }, null, 2) + '\n' : renderCrossings(entries, { since: label }) + '\n');
    return 0;
  }
  process.stderr.write('Usage: unattended.mjs start --by <who> [--attended] [--session <id>] | stop [--session <id>] | status | checkpoint [--since <n>] [--json]\n');
  return 2;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/impact/unattended.mjs')) process.exit(main(process.argv.slice(2)));
// [SCOPE 137 / T010] END
