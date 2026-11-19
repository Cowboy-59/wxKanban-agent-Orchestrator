// [SCOPE 148 / T008] Triage output never leaves the machine (SPEC-148 FR-015, SC-20).
//
// A triage report quotes every company's feedback, and the agent that writes it lives in
// `.claude/agents/`. The kit release is a PUBLIC GitHub release and the sync mirrors the
// FILESYSTEM, not git — so being gitignored is not enough on its own. This reads the mirror's
// own lists from its source (importing it would run a sync) and fails the moment either path
// could ship.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SYNC = readFileSync(join(ROOT, 'scripts', 'sync-to-orchestrator.mjs'), 'utf8');

/** The string entries of `const NAME = [ ... ]` or `const NAME = new Set([ ... ])`. */
function listOf(name: string): string[] {
  const m = new RegExp(`const ${name} = (?:new Set\\()?\\[([^\\]]*)\\]`).exec(SYNC);
  expect(m, `${name} not found in sync-to-orchestrator.mjs - the mirror was restructured; re-point this guard`).not.toBeNull();
  return [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** True when shipping `entry` would ship `target` (the entry is the target or one of its parents). */
const covers = (entry: string, target: string) => {
  const e = entry.replace(/\/+$/, '');
  return target === e || target.startsWith(`${e}/`);
};

describe('the kit mirror never ships triage output or vendor agents', () => {
  it('no mirrored directory or file covers docs/triage/', () => {
    for (const entry of [...listOf('KIT_DIRS'), ...listOf('KIT_FILES')]) {
      expect(covers(entry, 'docs/triage'), `"${entry}" would mirror docs/triage/`).toBe(false);
    }
  });

  it('.claude/agents/ stays author-only, so feedback-triage.md is never published', () => {
    expect(listOf('CLAUDE_AUTHOR_ONLY_DIRS')).toContain('agents');
  });

  it('docs/triage/ is gitignored', () => {
    const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());
    expect(ignore).toContain('docs/triage/');
  });

  // The guard must be able to fail, or it guards nothing.
  it('would fail if docs/ or .claude/agents were added to the mirror', () => {
    expect(covers('docs', 'docs/triage')).toBe(true);
    expect(covers('docs/triage/', 'docs/triage')).toBe(true);
    expect(covers('documents', 'docs/triage')).toBe(false);
  });
});
