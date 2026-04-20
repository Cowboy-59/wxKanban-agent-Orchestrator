#!/usr/bin/env node
// wxai-http — Launches the orchestrator HTTP gateway (port 3003).
// Mirrors wxai.mjs but targets http.ts instead of cli.ts.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(here, '..', 'src', 'http.ts');
const kitRoot = path.resolve(here, '..', '..', '..', '..');
const tsxEntry = path.join(kitRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const proc = spawn(process.execPath, [tsxEntry, entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
proc.on('exit', (code) => process.exit(code ?? 0));
proc.on('error', (err) => {
  console.error(`wxai-http: failed to launch tsx at ${tsxEntry}`);
  console.error(err.message);
  process.exit(1);
});
