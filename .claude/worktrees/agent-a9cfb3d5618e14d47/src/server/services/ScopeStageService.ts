import { pool } from '~/db/client.js';
import { createLogger } from '~/server/lib/logger.js';
import { TestGateService } from './TestGateService.js';
import {
  advanceScopes,
  readProjectScopeStages,
  resolveProjectRollupStage,
  resolveRollupStages,
  scopeIdsForTasks,
  scopeIdsForTestItems,
  stageDbFromPool,
  type AdvanceResult,
  type ScopeGateChecker,
  type StageDb,
  type StageEnteredHook,
} from '../../../wxkanban-agent/core/stage/scope-stage.js';
import { TestPlanService } from './TestPlanService.js';

const logger = createLogger('scope-stage-service');

// SCOPE-123 — the application's door into per-scope stage progression.
//
// Task completion reaches the database through two doors: this application's task service and the
// MCP `project.update_task_status` tool. Both call the SAME shared service (the kit's core/stage,
// bundled into this server by esbuild), so the rule cannot drift between them.
//
// Every call runs AFTER the triggering write and never fails it: the task status is the user's
// fact, the stage is derived from it, and a derivation that cannot run now is logged and retried
// on the next write to that scope (the advance is a function of state, not of the event).

let stageDb: StageDb | null = null;

// [SCOPE 123 / T019] BEGIN — db: the shared stage service on this application's pool
function db(): StageDb {
  if (!stageDb) stageDb = stageDbFromPool(pool);
  return stageDb;
}
// [SCOPE 123 / T019] END

// [SCOPE 123 / T015] BEGIN — appScopeGates: TestGateService narrowed to one scope
//
// SCOPE-111's single source of "is this signed?", asked for one scope's items. Not a second copy of
// the gate: the same function, with the spec filter it now accepts.
export const appScopeGates: ScopeGateChecker = async ({ projectId, scopeId, requirement }) => {
  // includeUnreleasedHuman: a human test not yet released still blocks the scope's human gate, so a
  // failed release can never let a scope pass Human Testing vacuously.
  // includeUnforced (Amendment C, decision 11): every test the scope owns blocks its own advance.
  const verdict = await TestGateService.checkForcedCoverage(projectId, requirement, {
    specid: scopeId,
    includeUnreleasedHuman: true,
    includeUnforced: true,
  });
  return {
    passed: verdict.passed,
    skipped: verdict.skipped === true,
    itemCount: verdict.inscopetotal ?? 0,
    blocking: verdict.blocking.map((b) => ({ itemKey: b.itemkey, title: b.title, why: b.why })),
  };
};
// [SCOPE 123 / T015] END

// [SCOPE 123 / T015] BEGIN — appStageEntered: entering Human Testing releases the scope's human tests
//
// The project-level phase advance released the human set on QA exit (PhaseService.advancePhase).
// Per-scope progression has no project QA exit, so a scope's own move into Human Testing does it,
// narrowed to that scope. Idempotent: only unreleased items are touched.
export const appStageEntered: StageEnteredHook = async ({ projectId, scopeId, to }) => {
  if (to === 'HumanTesting') {
    await TestPlanService.releaseHumanSet(projectId, scopeId);
  }
};
// [SCOPE 123 / T015] END

// [SCOPE 123 / T019] BEGIN — ScopeStageService: the app's triggers for the shared advance
export class ScopeStageService {
  /** After a task write: advance the scope(s) those tasks belong to. */
  static async onTasksWritten(
    taskids: readonly string[],
    context: { actor: string; trigger: string },
  ): Promise<AdvanceResult[]> {
    try {
      const scopeids = await scopeIdsForTasks(db(), taskids);
      return await this.advance(scopeids, context);
    } catch (err) {
      logger.error({ err, taskids, trigger: context.trigger }, 'scope stage advance failed after task write');
      return [];
    }
  }

  /** After a test result or signoff: a gate may have cleared (FR-010). */
  static async onTestItemsWritten(
    itemids: readonly string[],
    context: { actor: string; trigger: string },
  ): Promise<AdvanceResult[]> {
    try {
      const scopeids = await scopeIdsForTestItems(db(), itemids);
      return await this.advance(scopeids, context);
    } catch (err) {
      logger.error({ err, itemids, trigger: context.trigger }, 'scope stage advance failed after test write');
      return [];
    }
  }

  /** Advance named scopes directly (e.g. after tasks were generated for a scope). */
  static async advance(
    scopeids: readonly string[],
    context: { actor: string; trigger: string },
  ): Promise<AdvanceResult[]> {
    if (scopeids.length === 0) return [];
    try {
      const results = await advanceScopes(db(), scopeids, {
        gates: appScopeGates,
        actor: context.actor,
        source: 'app',
        trigger: context.trigger,
        onStageEntered: appStageEntered,
      });
      for (const r of results) {
        if (r.steps.length > 0) {
          logger.info(
            { scopeid: r.scopeId, from: r.startStage, to: r.endStage, steps: r.steps.length, trigger: context.trigger },
            'scope stage advanced',
          );
        }
        if (r.refused) logger.warn({ scopeid: r.scopeId, ...r.refused }, 'scope stage move refused');
      }
      return results;
    } catch (err) {
      logger.error({ err, scopeids, trigger: context.trigger }, 'scope stage advance failed');
      return [];
    }
  }

  // [SCOPE 123 / T021] Re-assess every active scope of a project: after a project-wide change that
  // can clear gates without any task or test write (the skiptesting toggle).
  static async advanceProject(
    projectid: string,
    context: { actor: string; trigger: string },
  ): Promise<AdvanceResult[]> {
    try {
      const stages = await readProjectScopeStages(db(), projectid);
      return await this.advance(stages.map((s) => s.scopeId), context);
    } catch (err) {
      logger.error({ err, projectid, trigger: context.trigger }, 'project-wide scope stage advance failed');
      return [];
    }
  }

  // [SCOPE 123 / T010] Each active scope's display stage: its open specificationphases row, or for
  // an untracked scope the task-count lower bound (Amendment C). Replaces reads of
  // projectspecifications.phaseid, which pointed a scope at the PROJECT's phase.
  static async projectScopeStages(projectid: string): Promise<Map<string, string>> {
    const rows = await readProjectScopeStages(db(), projectid);
    return new Map(rows.map((r) => [r.scopeId, r.stage]));
  }

  // [SCOPE 123 / T009] The project's stage as a rollup: the lowest stage among its active scopes.
  static async projectRollupStage(projectid: string): Promise<string> {
    return resolveProjectRollupStage(db(), projectid);
  }

  // [SCOPE 123 / T009] The same rollup for a list of projects, in one query (project cards).
  // Fail-open to an empty map: a card list must still render if the stage read fails.
  static async projectRollupStages(projectids: readonly string[]): Promise<Map<string, string>> {
    try {
      return await resolveRollupStages(db(), projectids);
    } catch (err) {
      logger.error({ err, count: projectids.length }, 'project rollup stages unavailable');
      return new Map();
    }
  }
}
// [SCOPE 123 / T019] END
