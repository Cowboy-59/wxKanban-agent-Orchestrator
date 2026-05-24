#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '..', 'src', 'cli.ts');

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

// tsx can live in wxkanban-agent/node_modules/ (installed by the kit's
// release workflow) OR at the kit root (installed by `npm install` at root).
// Probe candidates in order of preference.
const kitRoot = path.resolve(here, '..', '..', '..', '..');
const agentRoot = path.resolve(here, '..', '..', '..');
const candidates = [
  path.join(agentRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
  path.join(kitRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
];
const tsxEntry = candidates.find(p => existsSync(p));
if (!tsxEntry) {
  console.error('wxai: tsx not found in either of:');
  candidates.forEach(p => console.error('  ' + p));
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
