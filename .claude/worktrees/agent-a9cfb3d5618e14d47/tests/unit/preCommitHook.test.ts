/**
 * Pre-commit hook — constitution enforcement
 *
 * The hook had never blocked anything. Three basic-regex bugs, discovered 2026-07-28:
 *
 *   1. `grep -v '^\+\+\+'` was meant to drop the diff's `+++ b/file` header. In BRE,
 *      `\+` means "one or more of the preceding atom", so it matched any line starting
 *      with one or more `+` and consumed EVERY added line. All four rules received an
 *      empty stream and passed unconditionally.
 *   2. `grep -v 'describe\('` was a BRE with an unclosed group, so grep aborted with
 *      "Unmatched ( or \(" once per staged file. `|| true` swallowed it — that error was
 *      the only outward sign anything was wrong.
 *   3. The secrets pattern used `["\x27]` for quote-or-apostrophe, but grep does not
 *      interpret `\x27`; the class became the literal characters " \ x 2 7, so a secret
 *      containing x, 2 or 7 stopped matching before the 8-character minimum.
 *
 * A silently-passing gate is worse than no gate: it reports enforcement that is not
 * happening. These tests run the real hook against planted violations in a scratch git
 * repository, so a regression in any of the four rules fails the suite instead of
 * quietly disabling the guarantee.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const HOOK = join(process.cwd(), '.husky', 'pre-commit');
let repo: string;

function git(args: string[]): void {
  execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
}

/** Stage `content` as a .ts file and run the real hook. Returns its exit code. */
function runHook(content: string): number {
  writeFileSync(join(repo, 'src', 'candidate.ts'), content);
  git(['add', 'src/candidate.ts']);
  try {
    execFileSync('sh', ['.husky/pre-commit'], { cwd: repo, stdio: 'pipe' });
    return 0;
  } catch (error) {
    return (error as { status?: number }).status ?? 1;
  }
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'wxk-hook-'));
  git(['init', '-q']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'test']);
  mkdirSync(join(repo, 'src'), { recursive: true });
  mkdirSync(join(repo, '.husky'), { recursive: true });
  copyFileSync(HOOK, join(repo, '.husky', 'pre-commit'));
  // A base commit, so `git diff --cached` produces a normal diff rather than the
  // initial-commit special case.
  writeFileSync(join(repo, 'README.md'), 'base\n');
  git(['add', 'README.md']);
  git(['commit', '-q', '-m', 'base']);
});

afterAll(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
});

describe('pre-commit hook', () => {
  it('blocks console.log in production code (Constitution IV)', () => {
    expect(runHook('export const f = (): void => { console.log("x"); };\n')).not.toBe(0);
  });

  it('blocks the any type (Constitution III)', () => {
    expect(runHook('export const f = (x: any) => x;\n')).not.toBe(0);
  });

  it('blocks @ts-ignore (Constitution III)', () => {
    expect(runHook('// @ts-ignore\nexport const f = 1;\n')).not.toBe(0);
  });

  it('blocks a hardcoded secret (Constitution VI)', () => {
    expect(runHook('export const c = { password: "hunter2supersecret" };\n')).not.toBe(0);
  });

  it('blocks a secret containing x, 2 or 7 — the characters the \\x27 bug excluded', () => {
    expect(runHook('export const c = { apikey: "x27x27x27x27" };\n')).not.toBe(0);
  });

  it('allows clean code', () => {
    expect(runHook('export const f = (x: string): string => x.trim();\n')).toBe(0);
  });

  it('allows a commit message containing parentheses to reach the hook without grep aborting', () => {
    // Bug 2 surfaced as `grep: Unmatched ( or \(` on stderr. The hook must now run
    // silently on a clean file — any stderr means a malformed expression is back.
    writeFileSync(join(repo, 'src', 'candidate.ts'), 'export const ok = (): number => 1;\n');
    git(['add', 'src/candidate.ts']);
    const stderr = execFileSync('sh', ['.husky/pre-commit'], {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    expect(stderr).not.toMatch(/Unmatched/);
  });
});
