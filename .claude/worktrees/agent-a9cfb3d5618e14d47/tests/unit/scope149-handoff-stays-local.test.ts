import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SYNC = readFileSync(join(ROOT, 'scripts', 'sync-to-orchestrator.mjs'), 'utf8');
const TARGETS = ['.wxai/handoff', '.wxai/project-agent-status.json'];

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

// [SCOPE 149 / T003] BEGIN — Handoff output stays local (SPEC-149 FR-005)
describe('the kit mirror never ships handoff files or the project agent status', () => {
  it('no mirrored directory or file covers the handoff folder or status file', () => {
    for (const entry of [...listOf('KIT_DIRS'), ...listOf('KIT_FILES')]) {
      for (const t of TARGETS) {
        expect(covers(entry, t), `"${entry}" would mirror ${t}`).toBe(false);
      }
    }
  });

  it('both paths are gitignored', () => {
    const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());
    expect(ignore).toContain('**/.wxai/handoff/');
    expect(ignore).toContain('**/.wxai/project-agent-status.json');
  });

  // The guard must be able to fail, or it guards nothing.
  it('would fail if .wxai were added to the mirror', () => {
    expect(covers('.wxai', '.wxai/handoff')).toBe(true);
    expect(covers('.wxai/handoff/', '.wxai/handoff')).toBe(true);
    expect(covers('.wxai/project-agent-status.json', '.wxai/project-agent-status.json')).toBe(true);
    expect(covers('.wxai-other', '.wxai/handoff')).toBe(false);
  });
});
// [SCOPE 149 / T003] END
