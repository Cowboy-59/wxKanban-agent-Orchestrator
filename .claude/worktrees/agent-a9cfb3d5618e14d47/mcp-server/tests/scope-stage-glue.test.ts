// SCOPE-123 — MCP glue around the kit's stage module.
//
// The stage logic itself is tested in the kit (wxkanban-agent/tests/unit/stage). These tests
// cover what this package adds: an advance failure must never fail the write that triggered
// it, results are passed through, and the new tools' inputs are validated.
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn(), debug: vi.fn() },
}));

import {
  advanceAfterTaskWrite,
  advanceAfterTestWrite,
  advanceScopeIds,
  setScopeStageKitForTests,
} from '../src/utils/scope-stage.js';
import { ScopeStageInputSchema, BackfillScopeStagesInputSchema } from '../src/utils/schemas.js';

const fakeDb = {
  query: async () => ({ rows: [] }),
  transaction: async <T>(fn: (tx: { query: () => Promise<{ rows: never[] }> }) => Promise<T>) =>
    fn({ query: async () => ({ rows: [] }) }),
};

type KitArg = Parameters<typeof setScopeStageKitForTests>[0];

function kitWith(overrides: Record<string, unknown>): KitArg {
  return {
    stageDbFromPool: () => fakeDb,
    advanceScopes: async () => [],
    scopeIdsForTasks: async () => [],
    scopeIdsForTestItems: async () => [],
    assessScope: async () => null,
    findScopeByRef: async () => null,
    readStageHistory: async () => [],
    readProjectScopeStages: async () => [],
    resolveProjectRollupStage: async () => 'Design',
    planBackfill: async () => [],
    applyBackfill: async () => [],
    scopeLabel: (n: string) => `SPEC-${n}`,
    ...overrides,
  } as unknown as KitArg;
}

afterEach(() => setScopeStageKitForTests(null, null));

describe('SCOPE-123 T019 — the advance never fails the write that triggered it', () => {
  it('a throwing scope lookup returns [] instead of throwing', async () => {
    setScopeStageKitForTests(
      kitWith({ scopeIdsForTasks: async () => { throw new Error('db down'); } }),
      fakeDb as never,
    );
    await expect(advanceAfterTaskWrite(['t1'], { actor: 'a', trigger: 'task_status' })).resolves.toEqual([]);
  });

  it('a throwing advance returns [] instead of throwing', async () => {
    setScopeStageKitForTests(
      kitWith({
        scopeIdsForTestItems: async () => ['s1'],
        advanceScopes: async () => { throw new Error('lock timeout'); },
      }),
      fakeDb as never,
    );
    await expect(advanceAfterTestWrite(['i1'], { actor: 'a', trigger: 'test_signoff' })).resolves.toEqual([]);
  });

  it('passes the scopes a task write touched to the shared advance, with the MCP door as source', async () => {
    const calls: Array<{ ids: readonly string[]; source: string; trigger: string }> = [];
    setScopeStageKitForTests(
      kitWith({
        scopeIdsForTasks: async () => ['s1', 's2'],
        advanceScopes: async (_db: unknown, ids: readonly string[], opts: { source: string; trigger: string }) => {
          calls.push({ ids, source: opts.source, trigger: opts.trigger });
          return ids.map((id) => ({ scopeId: id, found: true, startStage: 'Implementation', endStage: 'QA', steps: [], blockers: [] }));
        },
      }),
      fakeDb as never,
    );
    const results = await advanceAfterTaskWrite(['t1', 't2'], { actor: 'u', trigger: 'task_status' });
    expect(calls).toEqual([{ ids: ['s1', 's2'], source: 'mcp-server', trigger: 'task_status' }]);
    expect(results.map((r) => r.scopeId)).toEqual(['s1', 's2']);
  });

  it('no scopes means no advance call at all', async () => {
    const advanceScopes = vi.fn();
    setScopeStageKitForTests(kitWith({ advanceScopes }), fakeDb as never);
    expect(await advanceScopeIds([], { actor: 'a', trigger: 'x' })).toEqual([]);
    expect(advanceScopes).not.toHaveBeenCalled();
  });
});

describe('SCOPE-123 T018 — tool inputs', () => {
  const projectId = '00000000-0000-4000-8000-000000000000';

  it('scope_stage takes exactly one of specId or specNumber', () => {
    expect(ScopeStageInputSchema.safeParse({ projectId, specNumber: '123' }).success).toBe(true);
    expect(ScopeStageInputSchema.safeParse({ projectId, specId: projectId }).success).toBe(true);
    expect(ScopeStageInputSchema.safeParse({ projectId }).success).toBe(false);
    expect(ScopeStageInputSchema.safeParse({ projectId, specId: projectId, specNumber: '123' }).success).toBe(false);
  });

  it('backfill_scope_stages is a dry run unless confirm is true', () => {
    expect(BackfillScopeStagesInputSchema.parse({ projectId }).confirm).toBe(false);
    expect(BackfillScopeStagesInputSchema.parse({ projectId, confirm: true }).confirm).toBe(true);
  });
});
