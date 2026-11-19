#!/usr/bin/env node
import { spawn, execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '..', 'src', 'cli.ts');
// Phase 3 — prefer the compiled, minified bundle when present (shipped builds);
// fall back to running the TypeScript source via tsx (source checkouts / dev).
const distCli = path.resolve(here, '..', '..', '..', 'dist', 'cli.cjs');

// Load .env from the consumer's project root (CWD) so init.mjs-written
// values like WXKANBAN_API_TOKEN are available to the spawned tsx child
// without the operator having to `source .env` in every shell. Existing
// exported env vars win — .env never overrides what the operator set.
const envPath = path.join(process.cwd(), '.env');
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// Shipped build: run the compiled bundle directly with node (no tsx needed).
if (existsSync(distCli)) {
  const proc = spawn(process.execPath, [distCli, ...process.argv.slice(2)], { stdio: 'inherit' });
  proc.on('exit', (code) => process.exit(code ?? 0));
  proc.on('error', (err) => {
    console.error(`wxai: failed to launch ${distCli}`);
    console.error(err.message);
    process.exit(1);
  });
} else {
  runViaTsx();
}

function runViaTsx() {
// tsx can live in wxkanban-agent/node_modules/ (installed by the kit's
// release workflow) OR at the kit root (installed by `npm install` at root).
// Probe candidates in order of preference.
const kitRoot = path.resolve(here, '..', '..', '..', '..');
const agentRoot = path.resolve(here, '..', '..', '..');
const tsxCandidates = () => [
  path.join(agentRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
  path.join(kitRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
];
let tsxEntry = tsxCandidates().find(p => existsSync(p));
if (!tsxEntry) {
  // Fresh download: the kit ships without node_modules. Bootstrap deps in-place
  // (npm install + npm audit fix) instead of failing the command.
  ensureDeps(kitRoot, 'wxai');
  tsxEntry = tsxCandidates().find(p => existsSync(p));
}
if (!tsxEntry) {
  console.error('wxai: tsx still not found after npm install, looked in:');
  tsxCandidates().forEach(p => console.error('  ' + p));
  console.error('Run `npm install` at the kit root OR inside wxkanban-agent/.');
  process.exit(1);
}

const proc = spawn(process.execPath, [tsxEntry, cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
proc.on('exit', (code) => process.exit(code ?? 0));
proc.on('error', (err) => {
  console.error(`wxai: failed to launch tsx at ${tsxEntry}`);
  console.error(err.message);
  process.exit(1);
});
}

// Bootstrap kit dependencies on first run. The release archive ships without
// node_modules (platform-specific binaries), so the first invocation must
// `npm install` at the kit root. `npm audit fix` follows to clear advisories
// pulled in transitively; it is best-effort and never blocks the command.
function ensureDeps(kitRoot, tag) {
  console.error(`[${tag}] dependencies missing -> running \`npm install\` at ${kitRoot} (first run)...`);
  try {
    execSync('npm install --no-fund', { cwd: kitRoot, stdio: 'inherit' });
  } catch (err) {
    console.error(`[${tag}] npm install failed: ${err.message}`);
    console.error(`[${tag}] Fix the error above, then re-run the command or run \`npm install\` manually.`);
    process.exit(1);
  }
  try {
    console.error(`[${tag}] running \`npm audit fix\`...`);
    execSync('npm audit fix', { cwd: kitRoot, stdio: 'inherit' });
  } catch (err) {
    console.error(`[${tag}] npm audit fix left unresolved advisories (continuing): ${err.message}`);
  }
}
