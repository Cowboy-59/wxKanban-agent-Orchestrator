#!/usr/bin/env node
// SCOPE-082 / T011 — manual watermark CLI over @wxkanban/watermark.
// Stamp or verify a Markdown file by hand when a generator was bypassed or a
// document was hand-authored. Branding/funnel mark, not a tamper-proof control.
//
// Usage:
//   node scripts/watermark.mjs verify <file.md>
//   node scripts/watermark.mjs stamp  <file.md> [--converted] [--version <v>] [--generator <name>] [--write]
//
// stamp prints the stamped Markdown to stdout; pass --write to overwrite in place.
// verify prints the detected signature and exits 0 when present, 1 when absent.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stampMarkdown, verifyMarkdown } from '../shared/watermark/dist/index.js';

// [SCOPE 082 / T011] BEGIN — defaultVersion (read APP_VERSION for the mark)
function defaultVersion() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, '../src/client/version.ts'), 'utf8');
    const match = src.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
    return match ? match[1] : '0.0.0';
  } catch {
    return '0.0.0';
  }
}
// [SCOPE 082 / T011] END

// [SCOPE 082 / T011] BEGIN — parseFlags (--key value / --bool)
function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (key === 'converted' || key === 'write') {
        flags[key] = true;
      } else {
        flags[key] = args[i + 1];
        i += 1;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}
// [SCOPE 082 / T011] END

// [SCOPE 082 / T011] BEGIN — usage
function usage() {
  process.stderr.write(
    [
      'wxKanban watermark — manual stamp/verify (SCOPE-082)',
      '',
      'Usage:',
      '  node scripts/watermark.mjs verify <file.md>',
      '  node scripts/watermark.mjs stamp  <file.md> [--converted] [--version <v>] [--generator <name>] [--write]',
      '',
    ].join('\n'),
  );
}
// [SCOPE 082 / T011] END

// [SCOPE 082 / T011] BEGIN — main (CLI entry: verify | stamp)
function main(argv) {
  const cmd = argv[0];
  const { flags, positional } = parseFlags(argv.slice(1));
  const file = positional[0];

  if (!cmd || !file || (cmd !== 'verify' && cmd !== 'stamp')) {
    usage();
    process.exit(2);
  }

  const content = readFileSync(file, 'utf8');

  if (cmd === 'verify') {
    const info = verifyMarkdown(content);
    if (info.present) {
      process.stdout.write(`watermark: PRESENT — kind=${info.kind} version=${info.version} (${file})\n`);
      process.exit(0);
    }
    process.stdout.write(`watermark: ABSENT (${file})\n`);
    process.exit(1);
  }

  // stamp
  const stamped = stampMarkdown(content, {
    kind: flags.converted ? 'converted' : 'generated',
    version: flags.version ?? defaultVersion(),
    generator: flags.generator ?? 'manual',
  });

  if (flags.write) {
    writeFileSync(file, stamped, 'utf8');
    const info = verifyMarkdown(stamped);
    process.stderr.write(
      `stamped ${file} — kind=${info.kind} version=${info.version}` +
        (info.present ? '' : ' (already stamped — unchanged)') +
        '\n',
    );
  } else {
    process.stdout.write(stamped);
  }
}
// [SCOPE 082 / T011] END

main(process.argv.slice(2));
