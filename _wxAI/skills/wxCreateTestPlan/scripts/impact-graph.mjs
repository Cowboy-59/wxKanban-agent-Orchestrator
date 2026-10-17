#!/usr/bin/env node
// Change-impact graph for project.report_change_impact (SCOPE-111 / T041).
//
// Computes what a release changed and everything that transitively depends on
// it, then emits the payload the MCP tool expects. Runs where the code is —
// the application never reads a repository, so reachability has to be computed
// here and posted.
//
// Deliberately over-marks. The two errors are not symmetric: an under-mark
// ships a defect under a green human signoff and has no recovery, while an
// over-mark costs a tester one dismissal with a stated reason.
//
// The graph itself now lives in the shared Change Impact engine at
// _wxAI/impact/lib/graph.mjs (SCOPE-137 FR-001), so this script, the Claude Code
// hook, and the Cockpit all compute impact the same way. Output is unchanged.
//
// Usage:
//   node impact-graph.mjs --base <ref> [--head HEAD] [--root .] [--max 5000]
//   node impact-graph.mjs --changed "src/a.ts,src/b.ts" --commit <sha>
//
// Output: JSON on stdout — { commitsha, changedFiles, dependents[], edgeless[] } or
// { commitsha, changedFiles, broad: true, broadReason } when oversized.

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { analyzeChange, norm } from '../../../impact/lib/graph.mjs';

// [SCOPE 137 / T001] BEGIN — impact-graph.mjs as a thin wrapper over the shared engine (replaces 111/T041)
function readArgs(argv) {
  const arg = (name, fallback = null) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  return {
    root: resolve(arg('root', process.cwd())),
    base: arg('base', null),
    head: arg('head', 'HEAD'),
    max: Number(arg('max', '5000')),
    changed: arg('changed', null),
    commit: arg('commit', null),
  };
}
// [SCOPE 137 / T001] END

// [SCOPE 137 / T001] BEGIN — impact-graph.mjs as a thin wrapper over the shared engine (replaces 111/T041)
function main() {
  const opts = readArgs(process.argv.slice(2));
  const git = (...a) => execFileSync('git', a, { cwd: opts.root, encoding: 'utf8' }).trim();

  let changedFiles;
  let commitsha;
  if (opts.changed) {
    changedFiles = opts.changed.split(',').map((s) => norm(s.trim())).filter(Boolean);
    commitsha = opts.commit ?? git('rev-parse', opts.head);
  } else {
    if (!opts.base) {
      process.stderr.write('Need --base <ref> (or --changed "a,b" --commit <sha>)\n');
      process.exit(2);
    }
    commitsha = git('rev-parse', opts.head);
    changedFiles = git('diff', '--name-only', `${opts.base}..${opts.head}`)
      .split('\n')
      .map(norm)
      .filter(Boolean);
  }

  const result = analyzeChange({ root: opts.root, changedFiles, max: opts.max });

  // Oversized means DECLARE IT, never truncate.
  if (result.broad) {
    process.stdout.write(
      JSON.stringify({ commitsha, changedFiles, broad: true, broadReason: result.broadReason }, null, 2) + '\n',
    );
    process.exit(0);
  }

  process.stdout.write(
    JSON.stringify({ commitsha, changedFiles, dependents: result.reached, edgeless: result.edgeless }, null, 2) + '\n',
  );
}
// [SCOPE 137 / T001] END

main();
