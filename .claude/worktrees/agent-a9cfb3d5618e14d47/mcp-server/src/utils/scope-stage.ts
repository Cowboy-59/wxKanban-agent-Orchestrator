// SCOPE-123 — the MCP server's door into per-scope stage progression.
//
// The logic lives in the kit (wxkanban-agent/core/stage/) so the application and this server run
// the same code. `postbuild` bundles it into dist/_kit/scope-stage.cjs next to the policy adapter;
// it is loaded on first use (not at import) so modules that import this file stay loadable in
// tests that never build the bundle.
//
// Every advance runs AFTER the write that triggered it has committed, and never fails that write:
// a task status change is the user's fact; the stage that follows from it is derived, and a
// derivation that cannot run right now is logged and retried on the next trigger.
import { createRequire } from 'module';
import { pool, db } from '../db/connection.js';
import logger from './logger.js';
import {
  computeTestGate,
  latestCycleId,
  projectSkipsTesting,
  releaseScopeHumanSet,
  type GateRequirement,
} from './test-gate.js';

const require = createRequire(import.meta.url);

export type StageName = 'Design' | 'Implementation' | 'QA' | 'HumanTesting' | 'Beta' | 'Release';

export interface StageBlocker {
  kind: string;
  message: string;
  count?: number;
  requirement?: GateRequirement;
  items?: Array<{ itemKey: string; title: string; why: string }>;
}

export interface ScopeGateVerdict {
  passed: boolean;
  skipped: boolean;
  itemCount: number;
  blocking: Array<{ itemKey: string; title: string; why: string }>;
}

type ScopeGateChecker = (q: { projectId: string; scopeId: string; requirement: GateRequirement }) => Promise<ScopeGateVerdict>;

export interface AdvanceResult {
  scopeId: string;
  found: boolean;
  startStage: StageName | null;
  endStage: StageName | null;
  steps: Array<{ from: StageName; to: StageName; specificationPhaseId: string }>;
  blockers: StageBlocker[];
  refused?: { from: StageName; to: StageName; reason: string };
}

interface ScopeRecord {
  id: string;
  projectId: string;
  specNumber: string;
  title: string;
  status: string;
}

export interface ScopeAssessment {
  scope: ScopeRecord;
  stage: StageName;
  taskCount: number;
  openTaskCount: number;
  ready: boolean;
  next: StageName | null;
  blockers: StageBlocker[];
  tracked: boolean;
  inferredEvidence?: string[];
}

export interface BackfillScopePlan {
  scopeId: string;
  specNumber: string;
  title: string;
  status: string;
  action: 'write' | 'skip-tracked' | 'skip-inactive';
  stage: StageName | null;
  taskCount: number;
  openTaskCount: number;
  evidence: string[];
  stoppedBy: StageBlocker[];
}

export interface BackfillApplyResult {
  scopeId: string;
  specNumber: string;
  outcome: 'written' | 'skipped-tracked' | 'skipped-inactive';
  stage: StageName | null;
  hookError?: string;
}

interface StageQueryClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
interface StageDb extends StageQueryClient {
  transaction<T>(fn: (tx: StageQueryClient) => Promise<T>): Promise<T>;
}
type StageEnteredHook = (event: { projectId: string; scopeId: string; from: StageName | null; to: StageName }) => Promise<void>;

interface AdvanceOptions {
  gates: ScopeGateChecker;
  actor: string;
  source: string;
  trigger: string;
  onStageEntered?: StageEnteredHook;
}

// The slice of the kit bundle this server uses. Kept in step with core/stage/scope-stage.ts.
interface KitScopeStage {
  stageDbFromPool(p: typeof pool): StageDb;
  advanceScopes(db: StageDb, scopeIds: readonly string[], options: AdvanceOptions): Promise<AdvanceResult[]>;
  scopeIdsForTasks(db: StageQueryClient, taskIds: readonly string[]): Promise<string[]>;
  scopeIdsForTestItems(db: StageQueryClient, itemIds: readonly string[]): Promise<string[]>;
  assessScope(db: StageQueryClient, scopeId: string, gates: ScopeGateChecker, options: { full: boolean }): Promise<ScopeAssessment | null>;
  findScopeByRef(db: StageQueryClient, projectId: string, ref: { specId?: string; specNumber?: string }): Promise<ScopeRecord | null>;
  readStageHistory(db: StageQueryClient, scopeId: string): Promise<Array<{ phase: StageName; enteredAt: string; exitedAt: string | null; notes: string | null }>>;
  readProjectScopeStages(db: StageQueryClient, projectId: string): Promise<Array<{ scopeId: string; specNumber: string; stage: StageName; tracked: boolean }>>;
  resolveProjectRollupStage(db: StageQueryClient, projectId: string): Promise<StageName>;
  planBackfill(db: StageQueryClient, projectId: string, gates: ScopeGateChecker): Promise<BackfillScopePlan[]>;
  applyBackfill(
    db: StageDb,
    projectId: string,
    plans: readonly BackfillScopePlan[],
    options: { actor: string; source: string; onStageEntered?: StageEnteredHook },
  ): Promise<BackfillApplyResult[]>;
  scopeLabel(specNumber: string): string;
}

let kitModule: KitScopeStage | null = null;
let stageDbInstance: StageDb | null = null;

// [SCOPE 123 / T019] BEGIN — kit / stageDb: load the bundled stage module on first use
function kit(): KitScopeStage {
  if (!kitModule) kitModule = require('../_kit/scope-stage.cjs') as KitScopeStage;
  return kitModule;
}

function stageDb(): StageDb {
  if (!stageDbInstance) stageDbInstance = kit().stageDbFromPool(pool);
  return stageDbInstance;
}

// Test seam: run the glue against an in-memory kit and database.
export function setScopeStageKitForTests(module: KitScopeStage | null, database: StageDb | null): void {
  kitModule = module;
  stageDbInstance = database;
}
// [SCOPE 123 / T019] END

// [SCOPE 123 / T015] BEGIN — mcpScopeGates: this server's test gate, narrowed to one scope
export const mcpScopeGates: ScopeGateChecker = async ({ projectId, scopeId, requirement }) => {
  const [cycleId, skipped] = await Promise.all([latestCycleId(db, projectId), projectSkipsTesting(db, projectId)]);
  // includeUnreleasedHuman: an unreleased human test still blocks the scope's human gate, so a
  // failed release can never let a scope pass Human Testing vacuously.
  // includeUnforced (Amendment C, decision 11): every test the scope owns blocks its own advance.
  const gate = await computeTestGate(db, {
    projectId,
    cycleId,
    requirement,
    specId: scopeId,
    includeUnreleasedHuman: true,
    includeUnforced: true,
  });
  return {
    // A project with testing switched off passes, with the evidence still listed (SCOPE-111 Amdt A).
    passed: skipped || gate.passed,
    skipped,
    itemCount: gate.itemCount,
    blocking: gate.blocking,
  };
};
// [SCOPE 123 / T015] END

// [SCOPE 123 / T015] BEGIN — mcpStageEntered: entering Human Testing releases the scope's human tests
export const mcpStageEntered: StageEnteredHook = async ({ projectId, scopeId, to }) => {
  if (to === 'HumanTesting') {
    const released = await releaseScopeHumanSet(db, projectId, scopeId);
    logger.info('scope human test set released', { projectId, scopeId, released });
  }
};
// [SCOPE 123 / T015] END

// [SCOPE 123 / T019] BEGIN — advanceAfterTaskWrite / advanceAfterTestWrite: the MCP's two triggers
//
// Never throws. A failure is logged with what was being attempted; the next task or test write on
// the same scope retries it, because the advance is a function of state, not of the event.
export async function advanceAfterTaskWrite(
  taskIds: readonly string[],
  context: { actor: string; trigger: string },
): Promise<AdvanceResult[]> {
  try {
    const scopeIds = await kit().scopeIdsForTasks(stageDb(), taskIds);
    return await advanceScopeIds(scopeIds, context);
  } catch (err) {
    logger.error('scope stage advance failed after task write', err instanceof Error ? err : new Error(String(err)), {
      taskIds,
      trigger: context.trigger,
    });
    return [];
  }
}

export async function advanceAfterTestWrite(
  itemIds: readonly string[],
  context: { actor: string; trigger: string },
): Promise<AdvanceResult[]> {
  try {
    const scopeIds = await kit().scopeIdsForTestItems(stageDb(), itemIds);
    return await advanceScopeIds(scopeIds, context);
  } catch (err) {
    logger.error('scope stage advance failed after test write', err instanceof Error ? err : new Error(String(err)), {
      itemIds,
      trigger: context.trigger,
    });
    return [];
  }
}

export async function advanceScopeIds(
  scopeIds: readonly string[],
  context: { actor: string; trigger: string },
): Promise<AdvanceResult[]> {
  if (scopeIds.length === 0) return [];
  try {
    const results = await kit().advanceScopes(stageDb(), scopeIds, {
      gates: mcpScopeGates,
      actor: context.actor,
      source: 'mcp-server',
      trigger: context.trigger,
      onStageEntered: mcpStageEntered,
    });
    for (const r of results) {
      if (r.steps.length > 0) {
        logger.info('scope stage advanced', {
          scopeId: r.scopeId,
          from: r.startStage,
          to: r.endStage,
          steps: r.steps.length,
          trigger: context.trigger,
        });
      }
      if (r.refused) logger.warn('scope stage move refused', { scopeId: r.scopeId, ...r.refused });
    }
    return results;
  } catch (err) {
    logger.error('scope stage advance failed', err instanceof Error ? err : new Error(String(err)), {
      scopeIds,
      trigger: context.trigger,
    });
    return [];
  }
}
// [SCOPE 123 / T019] END

// [SCOPE 123 / T018] BEGIN — scopeStageReport: what project.scope_stage returns
export async function scopeStageReport(
  projectId: string,
  ref: { specId?: string; specNumber?: string },
): Promise<{
  found: boolean;
  scope: {
    scopeId: string | null;
    specNumber: string;
    label: string;
    title: string | null;
    status: string | null;
    stage: StageName;
    taskCount: number;
    openTaskCount: number;
    next: StageName | null;
    blockers: StageBlocker[];
    tracked: boolean;
    inferredEvidence?: string[];
    inactive: boolean;
  };
  history: Array<{ phase: StageName; enteredAt: string; exitedAt: string | null; notes: string | null }>;
  projectRollupStage: StageName;
}> {
  const k = kit();
  const database = stageDb();
  const record = await k.findScopeByRef(database, projectId, ref);
  const projectRollupStage = await k.resolveProjectRollupStage(database, projectId);
  const specNumber = record?.specNumber ?? ref.specNumber ?? '';
  if (!record) {
    // A scope that does not exist yet is a scope about to be created: Design, no tasks.
    return {
      found: false,
      scope: {
        scopeId: null,
        specNumber,
        label: k.scopeLabel(specNumber),
        title: null,
        status: null,
        stage: 'Design',
        taskCount: 0,
        openTaskCount: 0,
        next: 'Implementation',
        blockers: [{ kind: 'no_tasks', message: 'The scope has no tasks yet. Run createSpecs to generate them.' }],
        tracked: false,
        inactive: false,
      },
      history: [],
      projectRollupStage,
    };
  }
  const [assessment, history] = await Promise.all([
    k.assessScope(database, record.id, mcpScopeGates, { full: true }),
    k.readStageHistory(database, record.id),
  ]);
  return {
    found: true,
    scope: {
      scopeId: record.id,
      specNumber: record.specNumber,
      label: k.scopeLabel(record.specNumber),
      title: record.title,
      status: record.status,
      stage: assessment?.stage ?? 'Design',
      taskCount: assessment?.taskCount ?? 0,
      openTaskCount: assessment?.openTaskCount ?? 0,
      next: assessment?.next ?? null,
      blockers: assessment?.blockers ?? [],
      // Amendment C, decision 9: an untracked scope's stage is inferred, and recorded only by the
      // backfill or its next task write.
      tracked: assessment?.tracked ?? false,
      inferredEvidence: assessment?.inferredEvidence,
      inactive: record.status === 'archived' || record.status === 'deferred',
    },
    history,
    projectRollupStage,
  };
}

export async function projectScopeStages(
  projectId: string,
): Promise<Map<string, { stage: StageName; tracked: boolean }>> {
  const rows = await kit().readProjectScopeStages(stageDb(), projectId);
  return new Map(rows.map((r) => [r.scopeId, { stage: r.stage, tracked: r.tracked }]));
}
// [SCOPE 123 / T018] END

// [SCOPE 123 / T018] BEGIN — backfillScopeStages: the FR-007 command (dry run unless confirmed)
export async function backfillScopeStages(
  projectId: string,
  options: { confirm: boolean; actor: string },
): Promise<{ dryRun: boolean; plan: BackfillScopePlan[]; applied: BackfillApplyResult[] }> {
  const k = kit();
  const database = stageDb();
  const plan = await k.planBackfill(database, projectId, mcpScopeGates);
  if (!options.confirm) return { dryRun: true, plan, applied: [] };
  const applied = await k.applyBackfill(database, projectId, plan, {
    actor: options.actor,
    source: 'mcp-server',
    onStageEntered: mcpStageEntered,
  });
  logger.info('scope stages backfilled', {
    projectId,
    written: applied.filter((a) => a.outcome === 'written').length,
    skipped: applied.filter((a) => a.outcome !== 'written').length,
  });
  return { dryRun: false, plan, applied };
}
// [SCOPE 123 / T018] END
