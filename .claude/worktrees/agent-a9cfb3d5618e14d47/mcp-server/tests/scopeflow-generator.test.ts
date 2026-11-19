/**
 * SCOPE-073 / T004 — scope-flow graph build, clustering, and warn-only graph-health.
 * Pure-function tests (the DB wrappers are integration-gated). Run needs DATABASE_URL +
 * API_KEY in env (the module imports db→config), same as the rest of the suite.
 */
import { describe, it, expect } from 'vitest';
import {
  buildScopeGraph,
  clusterScopes,
  runScopeHealth,
  generateScopeFlowMarkdown,
  type StoredRef,
} from '../src/utils/scopeflow-generator.js';

const known = new Map<number, string>([
  [7, 'Project Layout'],
  [13, 'Audit'],
  [42, 'Dev Cockpit'],
  [43, 'User Feedback'],
  [61, 'Bug Trapping'],
]);

describe('buildScopeGraph', () => {
  it('resolves scope edges, routes SPEC to external, drops unknown-bare', () => {
    const refs: StoredRef[] = [
      { sourcescope: 13, targetnumber: 7, targetnamespace: 'scope', kind: 'dependsOn' },
      { sourcescope: 61, targetnumber: 43, targetnamespace: 'scope', kind: 'dependsOn' },
      { sourcescope: 61, targetnumber: 42, targetnamespace: 'spec', kind: 'dependsOn' }, // external (also collides)
      { sourcescope: 43, targetnumber: 99, targetnamespace: 'scope', kind: 'dependsOn' }, // unknown scope -> not an edge
      { sourcescope: 13, targetnumber: 500, targetnamespace: 'bare', kind: 'related' }, // unknown bare -> dropped
    ];
    const g = buildScopeGraph(refs, known);
    expect(g.edges).toEqual([
      { from: 13, to: 7, kind: 'dependsOn' },
      { from: 61, to: 43, kind: 'dependsOn' },
    ]);
    expect(g.externals).toEqual([42]);
    expect(g.nodes.map((n) => n.num)).toEqual([7, 13, 42, 43, 61]);
  });

  it('dedupes a pair, dependsOn winning over related', () => {
    const refs: StoredRef[] = [
      { sourcescope: 13, targetnumber: 7, targetnamespace: 'scope', kind: 'related' },
      { sourcescope: 13, targetnumber: 7, targetnamespace: 'scope', kind: 'dependsOn' },
    ];
    expect(buildScopeGraph(refs, known).edges).toEqual([{ from: 13, to: 7, kind: 'dependsOn' }]);
  });
});

describe('clusterScopes', () => {
  it('returns deterministic connected components', () => {
    const nodes = [7, 13, 42, 43, 61].map((num) => ({ num, title: '' }));
    const edges = [
      { from: 13, to: 7, kind: 'dependsOn' as const },
      { from: 61, to: 43, kind: 'dependsOn' as const },
    ];
    expect(clusterScopes(nodes, edges)).toEqual([[7, 13], [42], [43, 61]]);
  });
});

describe('runScopeHealth', () => {
  it('flags missing/not-yet-built and SCOPE/SPEC collisions', () => {
    const refs: StoredRef[] = [
      { sourcescope: 61, targetnumber: 42, targetnamespace: 'spec', kind: 'dependsOn' }, // 42 also a scope -> collision
      { sourcescope: 43, targetnumber: 99, targetnamespace: 'scope', kind: 'dependsOn' }, // 99 missing
    ];
    const g = buildScopeGraph(refs, known);
    const w = runScopeHealth(g, refs, known);
    const ids = w.map((x) => x.id);
    expect(ids).toContain('COLLIDE-061-042');
    expect(ids).toContain('MISSING-043-099');
    expect(w.find((x) => x.id === 'COLLIDE-061-042')!.category).toBe('collision');
  });

  it('detects a dependency cycle', () => {
    const refs: StoredRef[] = [
      { sourcescope: 7, targetnumber: 13, targetnamespace: 'scope', kind: 'dependsOn' },
      { sourcescope: 13, targetnumber: 7, targetnamespace: 'scope', kind: 'dependsOn' },
    ];
    const g = buildScopeGraph(refs, known);
    const w = runScopeHealth(g, refs, known);
    expect(w.some((x) => x.category === 'cycle' && x.id === 'CYCLE-007-013')).toBe(true);
  });

  it('flags a non-reciprocal related edge', () => {
    const refs: StoredRef[] = [{ sourcescope: 42, targetnumber: 43, targetnamespace: 'scope', kind: 'related' }];
    const g = buildScopeGraph(refs, known);
    const w = runScopeHealth(g, refs, known);
    expect(w.some((x) => x.id === 'NONRECIP-042-043' && x.category === 'nonreciprocal')).toBe(true);
  });

  it('clean graph yields no warnings', () => {
    const refs: StoredRef[] = [{ sourcescope: 13, targetnumber: 7, targetnamespace: 'scope', kind: 'dependsOn' }];
    const g = buildScopeGraph(refs, known);
    expect(runScopeHealth(g, refs, known)).toEqual([]);
  });
});

describe('generateScopeFlowMarkdown', () => {
  it('renders mermaid + edges + clean message', () => {
    const refs: StoredRef[] = [{ sourcescope: 13, targetnumber: 7, targetnamespace: 'scope', kind: 'dependsOn' }];
    const g = buildScopeGraph(refs, known);
    const md = generateScopeFlowMarkdown(g, runScopeHealth(g, refs, known));
    expect(md).toContain('```mermaid');
    expect(md).toContain('graph LR');
    expect(md).toContain('S013 --> S007');
    expect(md).toContain('No structural warnings');
  });

  it('lists warnings when present', () => {
    const refs: StoredRef[] = [{ sourcescope: 43, targetnumber: 99, targetnamespace: 'scope', kind: 'dependsOn' }];
    const g = buildScopeGraph(refs, known);
    const md = generateScopeFlowMarkdown(g, runScopeHealth(g, refs, known));
    expect(md).toContain('MISSING-043-099');
  });
});
