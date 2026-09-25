#!/usr/bin/env node
// [SCOPE 134 / T032] BEGIN — project agent launcher (SCOPE-132 Amendment A, FR-030/034)
//
// Starts the kit's per-project agent: the SCOPE-102 bridge in `--project-agent` mode.
// Used by the Dev Cockpit (manual start, and auto-start on VS Code startup when the
// operator opts in) and runnable by hand:
//
//   node wxkanban-agent/apps/remote-bridge/bin/project-agent.mjs
//
// Run from anywhere: the project root is the directory holding `wxkanban-agent/`.
// Prefers the compiled bundle (shipped builds); falls back to the TypeScript source via
// tsx (source checkouts), exactly as the kit CLI launcher does.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const agentRoot = path.resolve(here, '..', '..', '..');
const projectRoot = path.resolve(agentRoot, '..');
const dist = path.join(agentRoot, 'dist', 'remote-bridge.cjs');
const src = path.join(agentRoot, 'apps', 'remote-bridge', 'src', 'main.ts');

const env = { ...process.env, WXKANBAN_REPO_ROOT: projectRoot };
const args = ['--project-agent', ...process.argv.slice(2)];

let cmd;
if (existsSync(dist)) {
  cmd = [dist, ...args];
} else {
  const tsx = [
    path.join(agentRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
  ].find((p) => existsSync(p));
  if (!tsx) {
    process.stderr.write(
      'project-agent: no compiled bundle and no tsx found. Run `npm install` in the project root (or wxkanban-agent/).\n',
    );
    process.exit(1);
  }
  cmd = [tsx, src, ...args];
}

const child = spawn(process.execPath, cmd, { stdio: 'inherit', cwd: projectRoot, env });
// Forward stop signals so the bridge's own teardown (disconnect notice, lock release) runs.
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  process.stderr.write(`project-agent: failed to launch — ${err.message}\n`);
  process.exit(1);
});
// [SCOPE 134 / T032] END
