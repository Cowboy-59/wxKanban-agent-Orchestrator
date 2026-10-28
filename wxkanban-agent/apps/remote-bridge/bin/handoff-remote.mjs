#!/usr/bin/env node
// [SCOPE 149 / T002] BEGIN — HANDOFF REMOTE writer launcher (FR-001)
//
// Writes one handoff file to .wxai/handoff/ for the running Project Agent to post:
//
//   node wxkanban-agent/apps/remote-bridge/bin/handoff-remote.mjs --input <fields.json>
//
// Run from anywhere: the project root is the directory holding `wxkanban-agent/`. Loads the
// compiled bundle in this process when present (shipped builds); otherwise runs the
// TypeScript source once through tsx and exits with its code (source checkouts). Starts no
// bridge, no agent and nothing that outlives the command.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const agentRoot = path.resolve(here, '..', '..', '..');
const projectRoot = path.resolve(agentRoot, '..');
const dist = path.join(agentRoot, 'dist', 'handoff-remote.cjs');
const src = path.join(agentRoot, 'apps', 'remote-bridge', 'src', 'handoff-main.ts');

process.env.WXKANBAN_REPO_ROOT = process.env.WXKANBAN_REPO_ROOT || projectRoot;

if (existsSync(dist)) {
  createRequire(import.meta.url)(dist);
} else {
  const tsx = [
    path.join(agentRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
  ].find((p) => existsSync(p));
  if (!tsx) {
    process.stdout.write(
      'Handoff stopped: no compiled writer and no tsx found. Fix: run `npm install` in the project root (or wxkanban-agent/), then try again.\n',
    );
    process.exit(1);
  }
  const r = spawnSync(process.execPath, [tsx, src, ...process.argv.slice(2)], {
    stdio: 'inherit',
    cwd: projectRoot,
    env: process.env,
  });
  process.exit(r.status ?? 1);
}
// [SCOPE 149 / T002] END
