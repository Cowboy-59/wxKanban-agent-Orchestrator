/**
 * SCOPE-081 / T012 — deterministic devplan-generator pure-function tests.
 * Locks foundation-up layering, critical-path ranking, state markers, and the
 * determinism + full-coverage guarantees the auto-refreshed `devplan` doctype relies on.
 */
import { describe, it, expect } from 'vitest';
import {
  specState,
  specPct,
  layerNodes,
  criticalPath,
  generateDevplanMarkdown,
  type SpecProgress,
} from '../src/utils/devplan-generator.js';
import type { ScopeGraph } from '../src/utils/scopeflow-generator.js';

// 1 <- 2 <- 3 chain: 3 depends on 2 depends on 1. Edge {from,to} = from dependsOn to.
const chain: ScopeGraph = {
  nodes: [
    { num: 1, title: 'Foundation' },
    { num: 2, title: 'Middle' },
    { num: 3, title: 'Leaf' },
  ],
  edges: [
    { from: 2, to: 1, kind: 'dependsOn' },
    { from: 3, to: 2, kind: 'dependsOn' },
  ],
  externals: [],
  clusters: [[1, 2, 3]],
};

const specs: SpecProgress[] = [
  { num: 1, title: 'Foundation', status: 'released', taskTotal: 0, taskDone: 0 },
  { num: 2, title: 'Middle', status: 'implementing', taskTotal: 4, taskDone: 2 },
  { num: 3, title: 'Leaf', status: 'draft', taskTotal: 4, taskDone: 0 },
];

describe('specState', () => {
  it('all tasks done -> done', () => {
    expect(specState({ num: 1, title: '', status: 'draft', taskTotal: 5, taskDone: 5 })).toBe('done');
  });
  it('some tasks done -> partial', () => {
    expect(specState({ num: 1, title: '', status: 'draft', taskTotal: 5, taskDone: 1 })).toBe('partial');
  });
  it('no tasks done -> todo', () => {
    expect(specState({ num: 1, title: '', status: 'draft', taskTotal: 5, taskDone: 0 })).toBe('todo');
  });
  it('no tasks but released status -> done', () => {
    expect(specState({ num: 1, title: '', status: 'released', taskTotal: 0, taskDone: 0 })).toBe('done');
  });
});

describe('specPct', () => {
  it('rounds completion percentage', () => {
    expect(specPct({ num: 1, title: '', status: '', taskTotal: 3, taskDone: 1 })).toBe(33);
  });
  it('0 tasks -> 0 percent (no divide-by-zero)', () => {
    expect(specPct({ num: 1, title: '', status: '', taskTotal: 0, taskDone: 0 })).toBe(0);
  });
});

describe('layerNodes (foundation-up)', () => {
  it('layers each node one above its deepest prerequisite', () => {
    const layer = layerNodes(chain);
    expect(layer.get(1)).toBe(0);
    expect(layer.get(2)).toBe(1);
    expect(layer.get(3)).toBe(2);
  });
  it('is cycle-safe (no infinite recursion)', () => {
    const cyclic: ScopeGraph = {
      nodes: [{ num: 1, title: 'A' }, { num: 2, title: 'B' }],
      edges: [
        { from: 1, to: 2, kind: 'dependsOn' },
        { from: 2, to: 1, kind: 'dependsOn' },
      ],
      externals: [],
      clusters: [[1, 2]],
    };
    expect(() => layerNodes(cyclic)).not.toThrow();
  });
});

describe('criticalPath', () => {
  it('ranks scopes by how many others they unblock', () => {
    expect(criticalPath(chain)).toEqual([1, 2]); // 1 unblocks {2,3}, 2 unblocks {3}
  });
  it('returns empty when there are no edges', () => {
    expect(criticalPath({ nodes: [{ num: 9, title: 'lonely' }], edges: [], externals: [], clusters: [[9]] })).toEqual([]);
  });
});

describe('generateDevplanMarkdown', () => {
  it('is deterministic for the same inputs', () => {
    expect(generateDevplanMarkdown(specs, chain)).toBe(generateDevplanMarkdown(specs, chain));
  });
  it('covers 100% of specs (every scope appears with a state marker)', () => {
    const md = generateDevplanMarkdown(specs, chain);
    expect(md).toContain('SCOPE-001');
    expect(md).toContain('SCOPE-002');
    expect(md).toContain('SCOPE-003');
    expect(md).toMatch(/🟢|🟡|🔴/);
  });
  it('emits a renderable Mermaid flowchart with classDefs and phase subgraphs', () => {
    const md = generateDevplanMarkdown(specs, chain);
    expect(md).toContain('```mermaid');
    expect(md).toContain('flowchart TD');
    expect(md).toContain('classDef done');
    expect(md).toContain('subgraph P0[Phase 0]');
  });
});
