#!/usr/bin/env node
// wxai-http — Launches the orchestrator HTTP gateway (port 3003).
// Mirrors wxai.mjs but targets http.ts instead of cli.ts.

import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(here, '..', 'src', 'http.ts');
// Phase 3 — prefer the compiled bundle; fall back to tsx for source checkouts.
const distHttp = path.resolve(here, '..', '..', '..', 'dist', 'http.cjs');
if (existsSync(distHttp)) {
  const proc = spawn(process.execPath, [distHttp, ...process.argv.slice(2)], { stdio: 'inherit' });
  proc.on('exit', (code) => process.exit(code ?? 0));
  proc.on('error', (err) => {
    console.error(`wxai-http: failed to launch ${distHttp}`);
    console.error(err.message);
    process.exit(1);
  });
} else {
  runViaTsx();
}

function runViaTsx() {
const kitRoot = path.resolve(here, '..', '..', '..', '..');
const agentRoot = path.resolve(here, '..', '..', '..');
const tsxCandidates = () => [
  path.join(agentRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
  path.join(kitRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
];
let tsxEntry = tsxCandidates().find(p => existsSync(p));
if (!tsxEntry) {
  // Fresh download: the kit ships without node_modules, and the gateway is
  // launched (e.g. by .vscode/tasks.json on folderOpen) before any install
  // has run. Bootstrap deps in-place instead of failing the orchestrator.
  ensureDeps(kitRoot, 'wxai-http');
  tsxEntry = tsxCandidates().find(p => existsSync(p));
}
if (!tsxEntry) {
  console.error('wxai-http: tsx still not found after npm install, looked in:');
  tsxCandidates().forEach(p => console.error('  ' + p));
  console.error('Run `npm install` at the kit root OR inside wxkanban-agent/.');
  process.exit(1);
}

const proc = spawn(process.execPath, [tsxEntry, entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
proc.on('exit', (code) => process.exit(code ?? 0));
proc.on('error', (err) => {
  console.error(`wxai-http: failed to launch tsx at ${tsxEntry}`);
  console.error(err.message);
  process.exit(1);
});
}

// Bootstrap kit dependencies on first run. The release archive ships without
// node_modules (platform-specific binaries), so the first invocation must
// `npm install` at the kit root. `npm audit fix` follows to clear advisories
// pulled in transitively; it is best-effort and never blocks startup.
function ensureDeps(kitRoot, tag) {
  console.error(`[${tag}] dependencies missing -> running \`npm install\` at ${kitRoot} (first run)...`);
  try {
    execSync('npm install --no-fund', { cwd: kitRoot, stdio: 'inherit' });
  } catch (err) {
    console.error(`[${tag}] npm install failed: ${err.message}`);
    console.error(`[${tag}] Fix the error above, then re-open the project or run \`npm install\` manually.`);
    process.exit(1);
  }
  try {
    console.error(`[${tag}] running \`npm audit fix\`...`);
    execSync('npm audit fix', { cwd: kitRoot, stdio: 'inherit' });
  } catch (err) {
    console.error(`[${tag}] npm audit fix left unresolved advisories (continuing): ${err.message}`);
  }
}
