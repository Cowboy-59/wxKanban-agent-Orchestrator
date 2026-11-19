// SCOPE-123 FR-010 — the MCP server's ONE test-gate evaluation.
//
// `project.test_gate_status` used to compute this inline. The per-scope stage advance needs the
// same answer narrowed to one scope, so the computation moved here and both call it: the tool
// passes no specId (project-wide, unchanged output), the advance passes the scope's id. Writing a
// second copy for the advance is exactly what SCOPE-111 warns against: two answers to "is this
// signed?" disagree at a release.
//
// The application keeps its own TestGateService (it cannot import from this package); that
// duplication predates this scope and is tracked under SCOPE-111.
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { db as Db } from '../db/connection.js';
import { testplans, testplanitems, testsignoffs, testretests } from '../db/schema.js';

export type GateRequirement = 'ai' | 'user' | 'all';

export interface GateItemBlocker {
  itemKey: string;
  title: string;
  why: string;
}

export interface TestGateResult {
  passed: boolean;
  requirement: GateRequirement;
  cycleId: string | null;
  blocking: GateItemBlocker[];
  forcedTotal: number;
  // Items of this requirement in scope, forced or not (SCOPE-123: "no machine tests stops in QA").
  itemCount: number;
}

// [SCOPE 123 / T015] BEGIN — computeTestGate: forced items standing in the way, optionally for one scope
export async function computeTestGate(
  raw: typeof Db,
  input: {
    projectId: string;
    cycleId: string | null;
    requirement: GateRequirement;
    specId?: string;
    // The per-scope advance counts a scope's human items whether or not they have been released:
    // a release that failed must not let a scope pass a human gate vacuously.
    includeUnreleasedHuman?: boolean;
    // SCOPE-123 Amendment C, decision 11: the per-scope advance treats EVERY item of the kind as
    // blocking, forced or not. Force keeps its SCOPE-111 meaning for test_gate_status itself.
    includeUnforced?: boolean;
  },
): Promise<TestGateResult> {
  const { projectId, cycleId, requirement, specId } = input;
  const includeUnreleasedHuman = input.includeUnreleasedHuman === true;
  const includeUnforced = input.includeUnforced === true;
  const rows = (await raw
    .select({
      id: testplanitems.id,
      itemKey: testplanitems.itemKey,
      title: testplanitems.title,
      executor: testplanitems.executor,
      released: testplanitems.released,
      itemForce: testplanitems.forceTest,
      planForce: testplans.forceTest,
      lastResultStatus: testplanitems.lastResultStatus,
    })
    .from(testplanitems)
    .innerJoin(testplans, eq(testplanitems.testPlanId, testplans.id))
    .where(
      specId
        ? and(eq(testplanitems.projectId, projectId), eq(testplanitems.specId, specId))
        : eq(testplanitems.projectId, projectId),
    )) as Array<{
    id: string;
    itemKey: string;
    title: string;
    executor: string;
    released: boolean;
    itemForce: boolean | null;
    planForce: boolean;
    lastResultStatus: string | null;
  }>;

  const inScope = rows.filter((r) => {
    const released = r.released || (includeUnreleasedHuman && r.executor === 'human');
    if (requirement === 'ai') return r.executor === 'machine';
    if (requirement === 'user') return r.executor === 'human' && released;
    return r.executor === 'machine' || released;
  });
  // null means inherit — never coerce it to false.
  const forced = includeUnforced ? inScope : inScope.filter((r) => r.itemForce ?? r.planForce);

  const signoffs = forced.length
    ? ((await raw
        .select()
        .from(testsignoffs)
        .where(
          and(
            inArray(
              testsignoffs.itemId,
              forced.map((f) => f.id),
            ),
            eq(testsignoffs.superseded, false),
          ),
        )) as Array<{ itemId: string; cycleId: string }>)
    : [];

  const outstandingRetests =
    forced.length && cycleId
      ? ((await raw
          .select({ itemId: testretests.itemId })
          .from(testretests)
          .where(
            and(
              eq(testretests.cycleId, cycleId),
              sql`${testretests.resolution} IS NULL`,
              inArray(
                testretests.itemId,
                forced.map((f) => f.id),
              ),
            ),
          )) as Array<{ itemId: string }>)
      : [];
  const outstandingSet = new Set(outstandingRetests.map((r) => r.itemId));

  const blocking = forced
    .map((row) => {
      if (row.executor === 'machine' && row.lastResultStatus === 'fail') {
        return { itemKey: row.itemKey, title: row.title, why: 'failing' };
      }
      const signed = signoffs.some(
        (s) =>
          s.itemId === row.id &&
          // A machine signoff never carries across cycles.
          (row.executor === 'human' || (cycleId !== null && s.cycleId === cycleId)),
      );
      if (row.executor === 'human' && outstandingSet.has(row.id)) {
        return { itemKey: row.itemKey, title: row.title, why: 'retest-outstanding' };
      }
      if (!signed) return { itemKey: row.itemKey, title: row.title, why: 'unsigned' };
      return null;
    })
    .filter((b): b is GateItemBlocker => b !== null);

  return {
    passed: blocking.length === 0,
    requirement,
    cycleId,
    blocking,
    forcedTotal: forced.length,
    itemCount: inScope.length,
  };
}
// [SCOPE 123 / T015] END

// [SCOPE 123 / T015] BEGIN — latestCycleId / projectSkipsTesting: the inputs the advance has no version for
//
// The tool is called with a version and opens that cycle. The advance runs on a task write that
// names no version, so it judges against the project's newest unsuperseded cycle and never opens
// one. With no cycle at all, no machine signoff can count — the conservative answer.
export async function latestCycleId(raw: typeof Db, projectId: string): Promise<string | null> {
  const result = await raw.execute(
    sql`SELECT id FROM testcycles WHERE projectid = ${projectId} AND supersededat IS NULL ORDER BY openedat DESC LIMIT 1`,
  );
  const row = (result.rows as Array<{ id: string }>)[0];
  return row ? row.id : null;
}

// `skiptesting` is not in this package's schema mirror; reading it through the mirror would return
// undefined and silently mean "testing on". Raw SQL reads the real column.
export async function projectSkipsTesting(raw: typeof Db, projectId: string): Promise<boolean> {
  const result = await raw.execute(sql`SELECT skiptesting FROM companyprojects WHERE id = ${projectId} LIMIT 1`);
  const row = (result.rows as Array<{ skiptesting: boolean | null }>)[0];
  return row?.skiptesting === true;
}
// [SCOPE 123 / T015] END

// [SCOPE 123 / T015] BEGIN — releaseScopeHumanSet: a scope entering Human Testing asks its testers
//
// The same write as the application's TestPlanService.releaseHumanSet(projectid, specid), which the
// project-level phase advance made on QA exit. Per-scope progression has no project QA exit, so the
// scope's own move into Human Testing releases its human set. Idempotent: only unreleased rows move.
export async function releaseScopeHumanSet(raw: typeof Db, projectId: string, specId: string): Promise<number> {
  const result = await raw.execute(
    sql`UPDATE testplanitems SET released = true, releasedat = now()
         WHERE projectid = ${projectId} AND specid = ${specId} AND executor = 'human' AND released = false
     RETURNING id`,
  );
  return (result.rows as unknown[]).length;
}
// [SCOPE 123 / T015] END
