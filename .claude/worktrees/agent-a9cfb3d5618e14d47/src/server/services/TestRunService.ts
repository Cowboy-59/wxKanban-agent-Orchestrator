import { db } from "~/db/client.js";
import { testruns } from "~/db/schema/testruns.js";
import { testrunresults } from "~/db/schema/testrunresults.js";
import { testplanitems } from "~/db/schema/testplanitems.js";
import { eq, inArray, desc, sql } from "drizzle-orm";
import { createLogger } from "~/server/lib/logger.js";
import { TestCycleService } from "./TestCycleService.js";
import type { TestRun } from "~/db/schema/testruns.js";
import type {
  TestResultStatus,
  TestRunSnapshot,
  TestRunSnapshotItem,
  TestRunStatus,
} from "~/shared/types/tests.js";

const logger = createLogger("test-run-service");

/**
 * A run silent for longer than this is reported as stalled rather than left
 * reading as running forever (FR-015). Derived at read time — never written, so
 * a runner that recovers simply stops looking stalled.
 */
export const RUN_STALL_MS = 5 * 60_000;

export class TestRunStartError extends Error {}

// [SCOPE 111 / T013] BEGIN — Runner-agnostic run lifecycle
export class TestRunService {
  /**
   * Start a run and return it together with the ordered list it will execute
   * (FR-010). Declaring the list up front is what lets the QA view show what is
   * ABOUT to happen rather than only what already has — the whole point of the
   * live view.
   *
   * Nothing here branches on who is running. The AI agent posts today; a CI job
   * posts tomorrow through the same path (FR-016).
   */
  static async start(input: {
    projectid: string;
    cycleid: string;
    testplanid?: string | null;
    specid?: string | null;
    gate?: string | null;
    runnertype: string;
    runnerref?: string | null;
    environment?: string;
    isregression?: boolean;
    itemids: string[];
    triggeredbyid?: string | null;
  }): Promise<{ run: TestRun; items: TestRunSnapshotItem[] }> {
    // FR-050 — a run may not be started inside a closed cycle.
    await TestCycleService.assertWritable(input.cycleid, "machine");
    if (input.itemids.length === 0) {
      throw new TestRunStartError("A run must declare at least one item");
    }

    // FR-046 — a live-write gate against a target that is not verified
    // non-production is refused before a single statement runs.
    if (input.gate === "crud" && !isNonProductionTarget(input.environment)) {
      throw new TestRunStartError(
        "crud gate refused: target database is not verified non-production",
      );
    }

    const items = await db
      .select()
      .from(testplanitems)
      .where(inArray(testplanitems.id, input.itemids));

    // Execute mode operates only on machine items (FR-041). A human item
    // reaching a runner would be a category error, not a workload.
    const humanItem = items.find((i) => i.executor !== "machine");
    if (humanItem) {
      throw new TestRunStartError(
        `Item ${humanItem.itemkey} is a human test and cannot be executed by a runner`,
      );
    }

    const ordered = input.itemids.filter((id) => items.some((i) => i.id === id));

    const [run] = await db
      .insert(testruns)
      .values({
        projectid: input.projectid,
        cycleid: input.cycleid,
        testplanid: input.testplanid ?? null,
        specid: input.specid ?? null,
        gate: input.gate ?? null,
        runnertype: input.runnertype,
        runnerref: input.runnerref ?? null,
        environment: input.environment ?? "local",
        isregression: input.isregression ?? false,
        status: "running",
        totalitems: ordered.length,
        declareditemids: ordered,
        triggeredbyid: input.triggeredbyid ?? null,
      })
      .returning();

    logger.info(
      { runid: run.id, cycleid: input.cycleid, total: ordered.length, gate: input.gate },
      "Test run started",
    );

    return { run, items: toSnapshotItems(ordered, items, new Map()) };
  }

  /** FR-011 — set what the runner is executing right now, and keep it alive. */
  static async heartbeat(
    runid: string,
    patch: { currentitemid?: string | null; status?: TestRunStatus },
  ): Promise<TestRun | null> {
    const [updated] = await db
      .update(testruns)
      .set({
        lastheartbeatat: new Date(),
        updatedat: new Date(),
        ...(patch.currentitemid !== undefined ? { currentitemid: patch.currentitemid } : {}),
        ...(patch.status && patch.status !== "stalled" ? { status: patch.status } : {}),
      })
      .where(eq(testruns.id, runid))
      .returning();
    return updated ?? null;
  }

  /**
   * Record one item's outcome (FR-013, FR-014).
   *
   * Two writes, deliberately: an immutable row in the history, and the item's
   * denormalised last-result pointer. The history is what the regression
   * baseline reads; the pointer is what the lists render. Neither is derivable
   * from the other cheaply enough to drop.
   */
  static async reportResult(input: {
    runid: string;
    itemid: string;
    status: TestResultStatus;
    bucket?: string | null;
    evidence?: string | null;
    durationms?: number | null;
    bugreportid?: string | null;
    startedat?: Date | null;
    endedat?: Date | null;
  }): Promise<void> {
    const run = await this.getRun(input.runid);
    if (!run) throw new TestRunStartError(`Run ${input.runid} not found`);
    // FR-050 — the cycle is read from the RUN rather than trusted from the
    // caller: a delayed callback carries a runid, not a cycleid, and this is
    // the exact path by which a stale result would rewrite the baseline.
    await TestCycleService.assertWritable(run.cycleid, "machine");

    await db.insert(testrunresults).values({
      runid: input.runid,
      itemid: input.itemid,
      cycleid: run.cycleid,
      status: input.status,
      bucket: input.bucket ?? null,
      evidence: input.evidence ?? null,
      durationms: input.durationms ?? null,
      bugreportid: input.bugreportid ?? null,
      startedat: input.startedat ?? null,
      endedat: input.endedat ?? new Date(),
    });

    await db
      .update(testplanitems)
      .set({
        lastresultstatus: input.status,
        lastresultat: new Date(),
        lastrunid: input.runid,
        updatedat: new Date(),
      })
      .where(eq(testplanitems.id, input.itemid));

    await this.recountTotals(input.runid);
  }

  /** Totals recomputed from the results rather than incremented — a dropped or
   * repeated event cannot drift the counters away from the truth. */
  private static async recountTotals(runid: string): Promise<void> {
    const rows = await db
      .select({ status: testrunresults.status, n: sql<number>`count(*)::int` })
      .from(testrunresults)
      .where(eq(testrunresults.runid, runid))
      .groupBy(testrunresults.status);

    const by = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;

    await db
      .update(testruns)
      .set({
        passeditems: by("pass"),
        faileditems: by("fail"),
        skippeditems: by("skip"),
        blockeditems: by("blocked") + by("unresolved"),
        lastheartbeatat: new Date(),
        updatedat: new Date(),
      })
      .where(eq(testruns.id, runid));
  }

  static async complete(
    runid: string,
    status: Extract<TestRunStatus, "completed" | "failed" | "cancelled"> = "completed",
  ): Promise<TestRun | null> {
    const [updated] = await db
      .update(testruns)
      .set({
        status,
        endedat: new Date(),
        currentitemid: null,
        lastheartbeatat: new Date(),
        updatedat: new Date(),
      })
      .where(eq(testruns.id, runid))
      .returning();

    logger.info({ runid, status }, "Test run closed");
    return updated ?? null;
  }

  static async getRun(runid: string): Promise<TestRun | null> {
    const [row] = await db.select().from(testruns).where(eq(testruns.id, runid)).limit(1);
    return row ?? null;
  }

  static async listRuns(projectid: string, limit = 25): Promise<TestRun[]> {
    return db
      .select()
      .from(testruns)
      .where(eq(testruns.projectid, projectid))
      .orderBy(desc(testruns.startedat))
      .limit(limit);
  }

  /** What the QA view polls while a run is in flight. */
  static async snapshot(runid: string): Promise<TestRunSnapshot | null> {
    const run = await this.getRun(runid);
    if (!run) return null;

    const declared = (run.declareditemids ?? []) as string[];
    const items = declared.length
      ? await db.select().from(testplanitems).where(inArray(testplanitems.id, declared))
      : [];

    const results = await db
      .select()
      .from(testrunresults)
      .where(eq(testrunresults.runid, runid));

    const resultByItem = new Map(results.map((r) => [r.itemid, r]));

    return {
      runid: run.id,
      status: effectiveStatus(run),
      gate: run.gate,
      environment: run.environment,
      runnertype: run.runnertype,
      isregression: run.isregression,
      startedat: run.startedat.toISOString(),
      endedat: run.endedat ? run.endedat.toISOString() : null,
      lastheartbeatat: run.lastheartbeatat.toISOString(),
      currentitemid: run.currentitemid,
      totals: {
        total: run.totalitems,
        passed: run.passeditems,
        failed: run.faileditems,
        skipped: run.skippeditems,
        blocked: run.blockeditems,
      },
      items: toSnapshotItems(declared, items, resultByItem),
    };
  }
}

/**
 * Stalled is derived, never stored (FR-015). A run whose runner died mid-flight
 * would otherwise read as "running" indefinitely, which is the one status that
 * tells an observer nothing.
 */
export function effectiveStatus(run: TestRun, now: Date = new Date()): TestRunStatus {
  const stored = run.status as TestRunStatus;
  if (stored !== "running") return stored;
  const silentMs = now.getTime() - run.lastheartbeatat.getTime();
  return silentMs > RUN_STALL_MS ? "stalled" : "running";
}

function toSnapshotItems(
  ordered: string[],
  items: Array<typeof testplanitems.$inferSelect>,
  resultByItem: Map<string, { status: string; evidence: string | null; durationms: number | null }>,
): TestRunSnapshotItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return ordered
    .map((id) => byId.get(id))
    .filter((i): i is NonNullable<typeof i> => Boolean(i))
    .map((item) => {
      const result = resultByItem.get(item.id);
      return {
        itemid: item.id,
        itemkey: item.itemkey,
        title: item.title,
        requirementid: item.requirementid,
        gate: item.gate,
        status: (result?.status as TestResultStatus) ?? "pending",
        evidence: result?.evidence ?? null,
        durationms: result?.durationms ?? null,
      };
    });
}

/**
 * The local environment points at the production database and the hosted
 * orchestrator shares it, so this refuses by default rather than trusting a
 * caller's word (FR-046).
 *
 * Merely HAVING a TEST_DATABASE_URL proves nothing — it has to actually differ
 * from the production target. A copy-paste that leaves both variables pointing
 * at the same database would otherwise read as "verified non-production" and
 * run destructive tests against live data, which is the exact accident this
 * function exists to prevent.
 *
 * A different database on the same host counts. Writes cannot cross a database
 * boundary in Postgres, so production DATA is safe. What it does not isolate is
 * server resources — a heavy concurrency or performance test still lands on the
 * instance production is served from. See `testTargetWarning()`.
 */
export function isNonProductionTarget(environment: string | undefined): boolean {
  if (environment === "uat" || environment === "ci") return true;

  const testUrl = process.env.TEST_DATABASE_URL?.trim();
  if (!testUrl) return false;

  const prodUrl = process.env.DATABASE_URL?.trim();
  if (!prodUrl) return true; // nothing to collide with

  const target = describeTarget(testUrl);
  const prod = describeTarget(prodUrl);
  if (!target || !prod) return false; // unparseable — fail closed

  return target.host !== prod.host || target.database !== prod.database;
}

/**
 * Non-blocking caveat for a target that is isolated by database but shares a
 * server with production. Surfaced so a team choosing this trade-off does so
 * knowingly rather than discovering it during an incident.
 */
export function testTargetWarning(): string | null {
  const testUrl = process.env.TEST_DATABASE_URL?.trim();
  const prodUrl = process.env.DATABASE_URL?.trim();
  if (!testUrl || !prodUrl) return null;

  const target = describeTarget(testUrl);
  const prod = describeTarget(prodUrl);
  if (!target || !prod) return null;

  if (target.host === prod.host && target.database !== prod.database) {
    return `Test database ${target.database} shares a host with production (${target.host}). Data is isolated; server load is not.`;
  }
  return null;
}

function describeTarget(url: string): { host: string; database: string } | null {
  try {
    const parsed = new URL(url);
    return { host: `${parsed.hostname}:${parsed.port || "5432"}`, database: parsed.pathname };
  } catch {
    return null;
  }
}
// [SCOPE 111 / T013] END
