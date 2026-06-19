// [SCOPE 060 / Cockpit] Ensure the kit's slash commands are available to Claude
// Code. The kit ships them in `_wxAI/commands/`, but Claude Code reads `/`
// commands from `.claude/commands/`. We COPY them across (Windows-safe; symlinks
// need Developer Mode) — idempotently, only missing/changed files — so commands
// like /buildscope and /analyzescope actually work. Read-only check + on-demand
// install, both driven from the Cockpit. Mirrors scripts/install-claude-commands.mjs.
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Kept in sync with helpCatalog STANDARD and scripts/install-claude-commands.mjs.
const STANDARD_COMMANDS = [
  'buildscope', 'createspecs', 'implement', 'wxconversion', 'wxconversionscope',
  'dbpush', 'validatescope', 'analyzescope', 'createtesttasks', 'runqa',
  'runhuman', 'preparerelease', 'finalizerelease',
];
// Non-command docs that ship alongside the commands but aren't slash commands.
const SKIP = /^(ENFORCEMENT_SUMMARY|README)\.md$/i;

export interface CommandsStatus {
  /** workspace root that holds _wxAI/commands (null when none is open). */
  root: string | null;
  sourceDir: string;
  targetDir: string;
  total: number;
  missing: string[]; // present in source, absent from target
  stale: string[]; // present in both but content differs
  standardMissing: string[]; // standard commands (with a source file) not yet in target
  standardInstalled: boolean;
  /** true when at least one command is missing or stale (an install would change things). */
  actionNeeded: boolean;
}

/** First workspace folder that actually contains `_wxAI/commands`. */
function findRoot(): string | null {
  for (const f of vscode.workspace.workspaceFolders ?? []) {
    if (fs.existsSync(path.join(f.uri.fsPath, '_wxAI', 'commands'))) return f.uri.fsPath;
  }
  return null;
}

function listSourceFiles(sourceDir: string): string[] {
  try {
    return fs.readdirSync(sourceDir).filter((f) => f.toLowerCase().endsWith('.md') && !SKIP.test(f));
  } catch {
    return [];
  }
}

/** Read-only: report which commands are missing/stale in `.claude/commands/`. */
export function checkCommands(): CommandsStatus {
  const root = findRoot();
  const sourceDir = root ? path.join(root, '_wxAI', 'commands') : '';
  const targetDir = root ? path.join(root, '.claude', 'commands') : '';
  const status: CommandsStatus = {
    root, sourceDir, targetDir, total: 0,
    missing: [], stale: [], standardMissing: [], standardInstalled: true, actionNeeded: false,
  };
  if (!root) return status;

  const files = listSourceFiles(sourceDir);
  status.total = files.length;
  const targetExists = fs.existsSync(targetDir);
  for (const file of files) {
    const name = file.replace(/\.md$/i, '');
    const dstPath = path.join(targetDir, file);
    if (!targetExists || !fs.existsSync(dstPath)) {
      status.missing.push(name);
    } else if (fs.readFileSync(dstPath, 'utf8') !== fs.readFileSync(path.join(sourceDir, file), 'utf8')) {
      status.stale.push(name);
    }
  }

  const hasSource = (c: string) => files.some((f) => f.replace(/\.md$/i, '').toLowerCase() === c.toLowerCase());
  status.standardMissing = STANDARD_COMMANDS.filter(
    (c) => hasSource(c) && status.missing.some((m) => m.toLowerCase() === c.toLowerCase()),
  );
  status.standardInstalled = status.standardMissing.length === 0;
  status.actionNeeded = status.missing.length > 0 || status.stale.length > 0;
  return status;
}

export interface InstallResult {
  ok: boolean;
  installed: string[];
  updated: string[];
  error?: string;
}

/** Copy missing/changed command files from `_wxAI/commands/` into `.claude/commands/`. */
export function installCommands(): InstallResult {
  const root = findRoot();
  if (!root) return { ok: false, installed: [], updated: [], error: 'No wxKanban project folder open (no _wxAI/commands found).' };
  const sourceDir = path.join(root, '_wxAI', 'commands');
  const targetDir = path.join(root, '.claude', 'commands');
  const result: InstallResult = { ok: true, installed: [], updated: [] };
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    for (const file of listSourceFiles(sourceDir)) {
      const name = file.replace(/\.md$/i, '');
      const src = fs.readFileSync(path.join(sourceDir, file), 'utf8');
      const dstPath = path.join(targetDir, file);
      const dstExists = fs.existsSync(dstPath);
      if (!dstExists) {
        fs.writeFileSync(dstPath, src, 'utf8');
        result.installed.push(name);
      } else if (fs.readFileSync(dstPath, 'utf8') !== src) {
        fs.writeFileSync(dstPath, src, 'utf8');
        result.updated.push(name);
      }
    }
  } catch (e) {
    return { ok: false, installed: result.installed, updated: result.updated, error: (e as Error).message };
  }
  return result;
}
