// [SCOPE 058 / T023] FR-008 editor read-only computation — a scope's spec docs are
// read-only unless the viewer holds it (multi-member), fully disabled single-member,
// and the user's own readonly globs are preserved. Pure (no vscode), per the
// cockpit test convention.
import { describe, it, expect } from 'vitest';
import { computeReadonlyConfig, INCLUDE_GLOB } from '../src/providers/readonlyConfig.js';

describe('computeReadonlyConfig (SCOPE-058 / T022)', () => {
  it('multi-member, no held scopes: all spec docs read-only (include set, no scope excludes)', () => {
    const { include, exclude } = computeReadonlyConfig(true, [], {}, {});
    expect(include[INCLUDE_GLOB]).toBe(true);
    expect(Object.keys(exclude)).toHaveLength(0);
  });

  it('multi-member, holding 058: that scope is excluded (editable), others stay read-only', () => {
    const { include, exclude } = computeReadonlyConfig(true, ['058'], {}, {});
    expect(include[INCLUDE_GLOB]).toBe(true);
    expect(exclude['specs/058-*/**/*.md']).toBe(true);
    expect(exclude['specs/Project-Scope/058-*.md']).toBe(true);
  });

  it('single-member (claims off): relinquishes our include glob so everything is editable', () => {
    const { include, exclude } = computeReadonlyConfig(false, [], { [INCLUDE_GLOB]: true }, {});
    expect(include[INCLUDE_GLOB]).toBeUndefined();
    expect(Object.keys(exclude)).toHaveLength(0);
  });

  it("preserves the user's own readonly globs (foreign keys) on both include and exclude", () => {
    const { include, exclude } = computeReadonlyConfig(
      true,
      ['042'],
      { 'vendor/**': true },
      { 'docs/keepme.md': true, 'specs/999-*/**/*.md': true /* a stale ours-shaped key gets recomputed */ },
    );
    expect(include['vendor/**']).toBe(true); // foreign include preserved
    expect(include[INCLUDE_GLOB]).toBe(true);
    expect(exclude['docs/keepme.md']).toBe(true); // foreign exclude preserved
    expect(exclude['specs/999-*/**/*.md']).toBeUndefined(); // our prior scope key dropped
    expect(exclude['specs/042-*/**/*.md']).toBe(true); // current held scope added
  });

  it('switching off (single-member) drops our prior scope excludes but keeps foreign ones', () => {
    const { include, exclude } = computeReadonlyConfig(
      false,
      [],
      { [INCLUDE_GLOB]: true },
      { 'specs/058-*/**/*.md': true, 'build/**': true },
    );
    expect(include[INCLUDE_GLOB]).toBeUndefined();
    expect(exclude['specs/058-*/**/*.md']).toBeUndefined();
    expect(exclude['build/**']).toBe(true);
  });
});
