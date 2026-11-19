#!/usr/bin/env node
/**
 * install-claude-commands.mjs — Make the kit's slash commands available to
 * Claude Code by copying `_wxAI/commands/*.md` into the project's
 * `.claude/commands/` directory (where Claude Code reads project-scoped `/`
 * commands).
 *
 * Why this exists: the kit ships command definitions in `_wxAI/commands/`, but
 * Claude Code only sees them under `.claude/commands/`. Historically this was a
 * manual symlink documented in ai-settings.json that most installs never did —
 * so `/buildscope` etc. silently weren't available. This syncs them by COPY
 * (Windows-safe; symlinks need Developer Mode), idempotently: only missing or
 * changed files are written.
 *
 * Usage:
 *   node scripts/install-claude-commands.mjs            # install/update (copy)
 *   node scripts/install-claude-commands.mjs --check    # report only, write nothing
 *   node scripts/install-claude-commands.mjs --root /path/to/project
 *
 * Exit codes:
 *   0 — all standard commands present (check) / sync succeeded (install)
 *   1 — check mode found missing/stale commands (so callers/CI can gate)
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The canonical "standard" lifecycle commands — kept in sync with the Cockpit's
// helpCatalog STANDARD set. Used to decide install success and to warn loudly
// when a core command is missing. Extended commands are still copied; they just
// don't gate the "standard commands installed?" result.
export const STANDARD_COMMANDS = [
  'buildscope', 'createspecs', 'implement', 'wxconversion', 'wxconversionscope',
  'wxconversionparity', 'cwconversion', 'cwconversionscope', 'vbconversion', 'vbconversionscope',
  'dbpush', 'validatescope', 'analyzescope', 'createtesttasks', 'runqa',
  'runhuman', 'preparerelease', 'finalizerelease', 'dev-plan', 'watermark',
  'help-catalog', 'wxhelpgenerate', 'wxuiuxcodereview', 'wxdesigner', 'wxcreatetestplan',
  'wxrefreshhelp', 'wxdbanalyze', 'wxg-o-d', 'wxbrainstorm',
];

/**
 * Sync `_wxAI/commands/*.md` → `<root>/.claude/commands/`.
 * @param {string} root  project root (contains `_wxAI/` and `.claude/`)
 * @param {{ check?: boolean }} opts  check-only (no writes) when true
 * @returns {{ sourceDir:string, targetDir:string, total:number,
 *   installed:string[], updated:string[], upToDate:string[], missing:string[],
 *   standardMissing:string[], standardInstalled:boolean, wrote:boolean,
 *   error?:string }}
 */
export function syncClaudeCommands(root, opts = {}) {
  const check = !!opts.check;
  const sourceDir = join(root, '_wxAI', 'commands');
  const targetDir = join(root, '.claude', 'commands');
  const result = {
    sourceDir, targetDir, total: 0,
    installed: [], updated: [], upToDate: [], missing: [],
    standardMissing: [], standardInstalled: true,
    wrote: false,
  };

  if (!existsSync(sourceDir)) {
    result.error = `No command source at ${sourceDir}`;
    return result;
  }

  // Mirror the Cockpit helpCatalog SKIP: these ship alongside the commands but
  // aren't slash commands, so they shouldn't land in .claude/commands/.
  const SKIP = /^(ENFORCEMENT_SUMMARY|README)\.md$/i;
  const files = readdirSync(sourceDir).filter(
    (f) => f.toLowerCase().endsWith('.md') && !SKIP.test(f),
  );
  result.total = files.length;

  const targetExists = existsSync(targetDir);
  for (const file of files) {
    const name = file.replace(/\.md$/i, '');
    const srcContent = readFileSync(join(sourceDir, file), 'utf8');
    const dstPath = join(targetDir, file);
    const dstExists = targetExists && existsSync(dstPath);
    const dstContent = dstExists ? readFileSync(dstPath, 'utf8') : null;

    if (!dstExists) {
      result.missing.push(name);
      result.installed.push(name); // recorded whether written (install) or would-be (check)
      if (!check) writeOne(targetDir, dstPath, srcContent, result);
    } else if (dstContent !== srcContent) {
      result.updated.push(name);
      if (!check) writeOne(targetDir, dstPath, srcContent, result);
    } else {
      result.upToDate.push(name);
    }
  }

  // "Are the standard slash commands installed?" — consider only standard
  // commands that ship as a source file (CLI-only ones like runqa have no .md
  // and are irrelevant here). A standard command counts as installed if its file
  // is present in the target (stale-but-present still counts — it works). In
  // check mode nothing was written, so `missing` is the authoritative gap.
  const inTarget = (name) =>
    check
      ? !result.missing.some((m) => m.toLowerCase() === name.toLowerCase())
      : true; // install mode wrote everything with a source file
  result.standardMissing = STANDARD_COMMANDS.filter(
    (c) => fileForName(files, c) && !inTarget(c),
  );
  result.standardInstalled = result.standardMissing.length === 0;
  return result;
}

function fileForName(files, name) {
  return files.some((f) => f.replace(/\.md$/i, '').toLowerCase() === name.toLowerCase());
}

function writeOne(targetDir, dstPath, content, result) {
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(dstPath, content, 'utf8');
  result.wrote = true;
}

// ─── CLI ────────────────────────────────────────────────────────────────────
function isMain() {
  return resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url));
}

if (isMain()) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const rootIdx = args.indexOf('--root');
  const root = rootIdx !== -1 ? resolve(args[rootIdx + 1]) : resolve(__dirname, '..');

  const r = syncClaudeCommands(root, { check });
  if (r.error) {
    console.error(`[commands] ${r.error}`);
    process.exit(1);
  }

  const verb = check ? 'would install' : 'installed';
  const changed = check ? r.missing.length + r.updated.length : r.installed.length + r.updated.length;
  console.log(`[commands] ${r.total} kit commands → ${r.targetDir}`);
  if (check) {
    if (r.missing.length) console.log(`[commands] missing: ${r.missing.join(', ')}`);
    if (r.updated.length) console.log(`[commands] stale (differ): ${r.updated.join(', ')}`);
    if (!changed) console.log(`[commands] ✓ all up to date`);
  } else {
    if (r.installed.length) console.log(`[commands] ${verb}: ${r.installed.join(', ')}`);
    if (r.updated.length) console.log(`[commands] updated: ${r.updated.join(', ')}`);
    if (!changed) console.log(`[commands] ✓ already current`);
  }
  if (r.standardMissing.length) {
    console.log(`[commands] ⚠ standard commands ${check ? 'not yet installed' : 'unavailable'}: ${r.standardMissing.join(', ')}`);
  } else {
    console.log(`[commands] ✓ all standard commands ${check ? 'present' : 'installed'}`);
  }
  // check mode gates on missing/stale; install mode succeeds unless source absent.
  process.exit(check && changed ? 1 : 0);
}
