/**
 * SCOPE-073 / T002 — namespace-aware scope-dependency edge parser.
 * Pure-function tests. Locks the SCOPE-NNN vs SPEC-NNN behavior that prevents the
 * phantom edges found in the real corpus (064/065/066/070 cite SPEC-046/048, which
 * collide as integers with SCOPE-046 Language / SCOPE-048 Lifecycle).
 */
import { describe, it, expect } from 'vitest';
import {
  classify,
  expandSlashed,
  harvestRefs,
  resolveLine,
} from '../src/utils/scope-edges.js';

describe('classify', () => {
  it('maps citation prefixes to namespaces', () => {
    expect(classify(undefined)).toBe('bare');
    expect(classify('SCOPE-')).toBe('scope');
    expect(classify('SPEC-')).toBe('spec');
    expect(classify('spec ')).toBe('specword');
    expect(classify('Spec ')).toBe('specword');
  });
});

describe('expandSlashed', () => {
  it('propagates the prefix across a slash list', () => {
    expect(expandSlashed('SPEC-046/048')).toBe('SPEC-046 SPEC-048');
    expect(expandSlashed('SCOPE-013/016/017')).toBe('SCOPE-013 SCOPE-016 SCOPE-017');
  });
  it('leaves non-slash text untouched', () => {
    expect(expandSlashed('SCOPE-042 and SPEC-028')).toBe('SCOPE-042 and SPEC-028');
  });
});

describe('harvestRefs', () => {
  it('classifies each cited number by its prefix and de-dupes', () => {
    const refs = harvestRefs('SPEC-046 (lead capture); SCOPE-013 (audit)');
    expect(refs).toEqual([
      { num: 46, ns: 'spec' },
      { num: 13, ns: 'scope' },
    ]);
  });
  it('strips dates, versions, FR/task ids so they never become edges', () => {
    expect(harvestRefs('provisioned 2026-06-14')).toEqual([]);
    expect(harvestRefs('shipped in v1.5.118')).toEqual([]);
    expect(harvestRefs('FR-001 and T042')).toEqual([]);
  });
  it('expands slash lists then classifies', () => {
    expect(harvestRefs('SPEC-046/048 marketing')).toEqual([
      { num: 46, ns: 'spec' },
      { num: 48, ns: 'spec' },
    ]);
  });
  it('treats bare and (paren) numbers as bare namespace', () => {
    expect(harvestRefs('(017), 002-Scope')).toEqual([
      { num: 17, ns: 'bare' },
      { num: 2, ns: 'bare' },
    ]);
  });
});

describe('resolveLine', () => {
  const known = new Set([2, 7, 9, 12, 13, 17, 42, 43, 46, 48, 60, 73, 74]);

  it('routes SPEC-NNN to external even when a same-numbered scope exists (the phantom-edge fix)', () => {
    const r = resolveLine(64, 'SPEC-046 (lead capture); SPEC-048 (marketing module)', 'dependsOn', known);
    expect(r.edges).toEqual([]);
    expect(r.externals).toEqual([
      { from: 64, to: 46, kind: 'dependsOn' },
      { from: 64, to: 48, kind: 'dependsOn' },
    ]);
    expect(r.unresolved).toEqual([]);
  });

  it('routes explicit SCOPE-NNN to a real scope edge', () => {
    const r = resolveLine(47, 'SCOPE-046 (Language — template injection)', 'dependsOn', known);
    expect(r.edges).toEqual([{ from: 47, to: 46, kind: 'dependsOn' }]);
    expect(r.externals).toEqual([]);
  });

  it('flags an explicit SCOPE-NNN with no scope file as unresolved', () => {
    const r = resolveLine(68, 'SCOPE-027 (Kit Runtime Hygiene)', 'dependsOn', known);
    expect(r.unresolved).toEqual([{ from: 68, to: 27, kind: 'dependsOn' }]);
    expect(r.edges).toEqual([]);
  });

  it('legacy "spec NNN": scope edge if it exists, else external', () => {
    const r = resolveLine(42, 'spec 019 (kit), spec 028 (hosted MCP)', 'dependsOn', known);
    expect(r.edges).toEqual([]); // 19 not in known here
    // 19 not in known -> external; 28 not in known -> external
    expect(r.externals).toEqual([
      { from: 42, to: 19, kind: 'dependsOn' },
      { from: 42, to: 28, kind: 'dependsOn' },
    ]);
  });

  it('bare numbers resolve to a scope only if it exists, else dropped', () => {
    const r = resolveLine(24, '(017) admin, (099) ghost', 'dependsOn', known);
    expect(r.edges).toEqual([{ from: 24, to: 17, kind: 'dependsOn' }]); // 17 known
    expect(r.externals).toEqual([]); // 99 bare + unknown -> dropped, not external
    expect(r.unresolved).toEqual([]);
  });

  it('returns nothing for None / empty', () => {
    expect(resolveLine(73, 'None', 'dependsOn', known)).toEqual({ edges: [], externals: [], unresolved: [] });
    expect(resolveLine(73, '', 'related', known)).toEqual({ edges: [], externals: [], unresolved: [] });
  });

  it('skips scope/bare self-references', () => {
    const r = resolveLine(73, 'SCOPE-073 and SCOPE-042', 'related', known);
    expect(r.edges).toEqual([{ from: 73, to: 42, kind: 'related' }]);
  });
});
