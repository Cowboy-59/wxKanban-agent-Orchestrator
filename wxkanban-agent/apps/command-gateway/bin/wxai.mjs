#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '..', 'src', 'cli.ts');
const kitRoot = path.resolve(here, '..', '..', '..', '..');
const tsxEntry = path.join(kitRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const proc = spawn(process.execPath, [tsxEntry, cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
proc.on('exit', (code) => process.exit(code ?? 0));
proc.on('error', (err) => {
  console.error(`wxai: failed to launch tsx at ${tsxEntry}`);
  console.error(err.message);
  process.exit(1);
});
