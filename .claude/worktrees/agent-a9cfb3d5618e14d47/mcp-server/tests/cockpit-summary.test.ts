/**
 * Spec 042 / T005 + T006 — project.cockpit_summary builder + scope assertion.
 *
 * T005: grouping rules (incomplete-status set, scope linkage, unlinked bucket).
 * T006: a token scoped to project A cannot surface project B via the read path.
 */
import { describe, it, expect, vi } from 'vitest';

// cockpit-summary.ts pulls ScopeViolationError from scoped-query.ts, which
// imports the real DB connection (requires DATABASE_URL). Stub it — these are
// pure-function tests with no DB access.
vi.mock('../src/db/connection.js', () => ({ db: {}, pool: {} }));

import {
  buildCockpitSummary,
  assertCockpitScope,
  isIncompleteStatus,
  INCOMPLETE_TASK_STATUSES,
  type SpecRow,
  type TaskRow,
} from '../src/utils/cockpit-summary.js';
import { ScopeViolationError } from '../src/db/scoped-query.js';
import type { McpScope } from '../src/middleware/auth.js';

const specs: SpecRow[] = [
  { id: 'spec-042', specNumber: '042', title: 'VS Code Dev Cockpit', status: 'implementation' },
  { id: 'spec-019', specNumber: '019', title: 'Orchestrator Kit', status: 'released' },
];

const tasks: TaskRow[] = [
  { id: 't1', name: 'T001', status: 'todo', description: 'do a', specId: 'spec-042' },
  { id: 't2', name: 'T002', status: 'in_progress', description: null, specId: 'spec-042' },
  { id: 't3', name: 'T003', status: 'done', description: 'closed', specId: 'spec-042' },
  { id: 't4', name: 'T004', status: 'blocked', description: '', specId: 'spec-019' },
  { id: 't5', name: 'orphan', status: 'todo', description: '', specId: null },
  { id: 't6', name: 'ghost', status: 'todo', description: '', specId: 'spec-from-another-project' },
];

const tokenScope = (projectId: string | null): McpScope => ({
  tokenId: 't', customerId: 'c', projectId, tokenPrefix: 'wxk', authMode: 'token',
});

describe('isIncompleteStatus / INCOMPLETE_TASK_STATUSES', () => {
  it('counts todo, in_progress, blocked as incomplete (case-insensitive)', () => {
    expect(isIncompleteStatus('todo')).toBe(true);
    expect(isIncompleteStatus('IN_PROGRESS')).toBe(true);
    expect(isIncompleteStatus('blocked')).toBe(true);
  });
  it('excludes terminal statuses', () => {
    expect(isIncompleteStatus('done')).toBe(false);
    expect(isIncompleteStatus('completed')).toBe(false);
    expect(isIncompleteStatus('cancelled')).toBe(false);
    expect(isIncompleteStatus(null)).toBe(false);
  });
  it('exposes exactly the three incomplete statuses', () => {
    expect([...INCOMPLETE_TASK_STATUSES].sort()).toEqual(['blocked', 'in_progress', 'todo']);
  });
});

describe('buildCockpitSummary (T005)', () => {
  const summary = buildCockpitSummary(specs, tasks, 'proj-A');

  it('groups incomplete tasks under their owning scope and excludes done', () => {
    const s042 = summary.scopes.find((s) => s.specNumber === '042')!;
    expect(s042.remainingCount).toBe(2); // t1 + t2; t3 (done) excluded
    expect(s042.tasks.map((t) => t.title).sort()).toEqual(['T001', 'T002']);
  });

  it('returns scopes specNumber-ascending', () => {
    expect(summary.scopes.map((s) => s.specNumber)).toEqual(['019', '042']);
  });

  // [SCOPE 081 / T005] foundation-up (development-plan) ordering when scopeLayers is supplied.
  it('orders scopes foundation-up (by layer, then specNumber) when scopeLayers is given', () => {
    // 042 is foundation (layer 0); 019 depends on it (layer 1) — so 042 comes first,
    // overriding the specNumber-ascending default.
    const layers = new Map<number, number>([[42, 0], [19, 1]]);
    const ordered = buildCockpitSummary(specs, tasks, 'proj-A', undefined, undefined, undefined, layers);
    expect(ordered.scopes.map((s) => s.specNumber)).toEqual(['042', '019']);
    // the Development Plan panel follows the same order
    expect(ordered.devplan.map((d) => d.scope)).toEqual(['SCOPE-042', 'SCOPE-019']);
  });

  it('routes null-spec and unknown-spec tasks to unlinkedTasks (no drop, no misattribution)', () => {
    expect(summary.unlinkedTasks.map((t) => t.title).sort()).toEqual(['ghost', 'orphan']);
    // the ghost task (specId of a sibling project's spec) must NOT appear under any scope
    for (const s of summary.scopes) {
      expect(s.tasks.find((t) => t.title === 'ghost')).toBeUndefined();
    }
  });

  it('maps null description to empty string', () => {
    const s042 = summary.scopes.find((s) => s.specNumber === '042')!;
    expect(s042.tasks.find((t) => t.title === 'T002')!.descriptionMarkdown).toBe('');
  });

  it('echoes the resolved projectId', () => {
    expect(summary.projectId).toBe('proj-A');
  });
});

// [SCOPE 058 / T008] BEGIN — claim state in the cockpit summary (FR-004)
describe('buildCockpitSummary claim state (SCOPE-058 / T006)', () => {
  const claimDate = new Date('2026-06-15T21:00:00.000Z');
  const claimSpecs: SpecRow[] = [
    { id: 'spec-058', specNumber: '058', title: 'Scope Branch Check-out', status: 'planned', claimedById: 'user-1', claimedAt: claimDate },
    { id: 'spec-042', specNumber: '042', title: 'Dev Cockpit', status: 'implementation', claimedById: null, claimedAt: null },
    { id: 'spec-019', specNumber: '019', title: 'Kit', status: 'released', claimedById: 'user-2', claimedAt: '2026-06-14T10:00:00.000Z' },
  ];
  const names = new Map<string, string>([['user-1', 'Andy']]);
  const summary = buildCockpitSummary(claimSpecs, [], 'proj-A', names);
  const byNum = (n: string) => summary.scopes.find((s) => s.specNumber === n)!;

  it('a free scope reports claimedBy null and claimedAt null', () => {
    expect(byNum('042').claimedBy).toBeNull();
    expect(byNum('042').claimedAt).toBeNull();
  });

  it('a claimed scope reports the holder and resolves the name from the map', () => {
    expect(byNum('058').claimedBy).toEqual({ userId: 'user-1', name: 'Andy' });
  });

  it('normalizes a Date claimedAt to an ISO string', () => {
    expect(byNum('058').claimedAt).toBe('2026-06-15T21:00:00.000Z');
  });

  it('passes through a string claimedAt and falls back to "unknown" when the name is unmapped', () => {
    expect(byNum('019').claimedAt).toBe('2026-06-14T10:00:00.000Z');
    expect(byNum('019').claimedBy).toEqual({ userId: 'user-2', name: 'unknown' });
  });

  it('omitting the name map leaves claimers as "unknown" without throwing', () => {
    const s = buildCockpitSummary(claimSpecs, [], 'proj-A');
    expect(s.scopes.find((x) => x.specNumber === '058')!.claimedBy).toEqual({ userId: 'user-1', name: 'unknown' });
  });
});
// [SCOPE 058 / T008] END

describe('assertCockpitScope (T006 — cross-project isolation)', () => {
  it('rejects when the caller requests a different project than the token', () => {
    expect(() => assertCockpitScope('proj-B', tokenScope('proj-A'))).toThrow(ScopeViolationError);
  });

  it('rejects when the token has no resolved projectId', () => {
    expect(() => assertCockpitScope('proj-A', tokenScope(null))).toThrow(ScopeViolationError);
  });

  it('returns the token project when the caller omits or matches it', () => {
    expect(assertCockpitScope(undefined, tokenScope('proj-A'))).toBe('proj-A');
    expect(assertCockpitScope('proj-A', tokenScope('proj-A'))).toBe('proj-A');
  });

  it('always pins to the token project, never the caller value', () => {
    // even a matching call resolves to the token's project — the caller value
    // is never trusted as the read boundary.
    expect(assertCockpitScope('proj-A', tokenScope('proj-A'))).toBe('proj-A');
  });

  it('dev-bypass falls through to the caller projectId (local/no-auth runs)', () => {
    const dev: McpScope = { tokenId: null, customerId: null, projectId: null, tokenPrefix: null, authMode: 'dev-bypass' };
    expect(assertCockpitScope('proj-X', dev)).toBe('proj-X');
  });
});
