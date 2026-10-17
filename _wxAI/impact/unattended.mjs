#!/usr/bin/env node
// Unattended runs and their checkpoint list (SCOPE-137 FR-009).
//
//   node _wxAI/impact/unattended.mjs start --by wxG-O-D   mark this run unattended (12 hours, one session)
//   node _wxAI/impact/unattended.mjs stop                  end it
//   node _wxAI/impact/unattended.mjs checkpoint [--json]   list crossings since the last checkpoint, once
//   node _wxAI/impact/unattended.mjs status                is a marker in place?
//
// While unattended, an edit that crosses an Impact Boundary is logged and goes ahead; one with
// possible data loss still stops. A checkpoint lists every crossing and stop since the last one.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { crossingsSinceCheckpoint, MARKER_FILE, renderCrossings, startUnattended, stopUnattended } from './lib/unattended.mjs';

// [SCOPE 137 / T010] BEGIN — Unattended CLI: start, stop, status, checkpoint (FR-009)
function main(argv) {
  const [cmd] = argv;
  const i = argv.indexOf('--root');
  const root = resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  const by = (() => {
    const j = argv.indexOf('--by');
    return j >= 0 && argv[j + 1] ? argv[j + 1] : 'unattended run';
  })();

  if (cmd === 'start') {
    const m = startUnattended(root, { by });
    process.stdout.write(`Unattended until ${m.expiresAt} (${by}). Boundaries are logged and continue; possible data loss still stops.\n`);
    return 0;
  }
  if (cmd === 'stop') {
    process.stdout.write(stopUnattended(root) ? 'Unattended run ended.\n' : 'No unattended marker was set.\n');
    return 0;
  }
  if (cmd === 'status') {
    const file = join(root, MARKER_FILE);
    process.stdout.write(existsSync(file) ? readFileSync(file, 'utf8') : 'No unattended marker.\n');
    return 0;
  }
  if (cmd === 'checkpoint') {
    const entries = crossingsSinceCheckpoint(root, { advance: true });
    process.stdout.write(argv.includes('--json') ? JSON.stringify({ entries }, null, 2) + '\n' : renderCrossings(entries) + '\n');
    return 0;
  }
  process.stderr.write('Usage: unattended.mjs start --by <who> | stop | status | checkpoint [--json]\n');
  return 2;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/impact/unattended.mjs')) process.exit(main(process.argv.slice(2)));
// [SCOPE 137 / T010] END
