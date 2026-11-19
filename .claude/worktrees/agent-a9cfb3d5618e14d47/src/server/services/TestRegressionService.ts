import { db } from "~/db/client.js";
import { testplanitems } from "~/db/schema/testplanitems.js";
import { testrunresults } from "~/db/schema/testrunresults.js";
import { testcycles } from "~/db/schema/testcycles.js";
import { eq, and, ne, desc, inArray } from "drizzle-orm";
import { createLogger } from "~/server/lib/logger.js";
import type { RegressionEntry, RegressionReport } from "~/shared/types/tests.js";

const logger = createLogger("test-regression-service");

// [SCOPE 111 / T014] BEGIN — Regression measured against an item's own last execution
export class TestRegressionService {
  /**
   * Classify every machine item in the project into exactly one of three
   * buckets (FR-052, FR-052a, FR-052b).
   *
   * The baseline is the item's OWN most recent prior result — the last time
   * that test actually ran — not whatever the immediately preceding cycle
   * happened to contain. An item skipped for three cycles is judged against the
   * run that last exercised it, which is the only comparison that answers the
   * question a team is actually asking: did this used to work?
   *
   * The distinction between "newly failing" and "never passed" is load-bearing.
   * Without it, four brand-new red tests read as four regressions and bury the
   * one real one.
   */
  static async compare(cycleid: string): Promise<RegressionReport> {
    const [cycle] = await db.select().from(testcycles).where(eq(testcycles.id, cycleid)).limit(1);
    if (!cycle) {
      throw new Error(`Test cycle ${cycleid} not found`);
    }

    const items = await db
      .select({
        id: testplanitems.id,
        itemkey: testplanitems.itemkey,
        title: testplanitems.title,
      })
      .from(testplanitems)
      .where(
        and(
          eq(testplanitems.projectid, cycle.projectid),
          eq(testplanitems.executor, "machine"),
        ),
      );

    if (items.length === 0) {
      return { cycleid, version: cycle.version, stillPassing: [], newlyFailing: [], neverPassed: [] };
    }

    const itemIds = items.map((i) => i.id);

    // This cycle's outcome per item.
    const currentRows = await db
      .select({
        itemid: testrunresults.itemid,
        status: testrunresults.status,
        createdat: testrunresults.createdat,
      })
      .from(testrunresults)
      .where(and(eq(testrunresults.cycleid, cycleid), inArray(testrunresults.itemid, itemIds)))
      .orderBy(desc(testrunresults.createdat));

    const current = new Map<string, string>();
    for (const row of currentRows) {
      if (!current.has(row.itemid)) current.set(row.itemid, row.status);
    }

    // The baseline: each item's most recent result from ANY earlier cycle.
    const priorRows = await db
      .select({
        itemid: testrunresults.itemid,
        status: testrunresults.status,
        cycleid: testrunresults.cycleid,
        createdat: testrunresults.createdat,
      })
      .from(testrunresults)
      .where(and(ne(testrunresults.cycleid, cycleid), inArray(testrunresults.itemid, itemIds)))
      .orderBy(desc(testrunresults.createdat));

    const lastPriorByItem = new Map<string, { status: string; cycleid: string }>();
    const lastPassByItem = new Map<string, string>();
    for (const row of priorRows) {
      if (!lastPriorByItem.has(row.itemid)) {
        lastPriorByItem.set(row.itemid, { status: row.status, cycleid: row.cycleid });
      }
      if (row.status === "pass" && !lastPassByItem.has(row.itemid)) {
        lastPassByItem.set(row.itemid, row.cycleid);
      }
    }

    const versionByCycle = await this.versionMap([
      ...new Set([...lastPassByItem.values()]),
    ]);

    const stillPassing: RegressionEntry[] = [];
    const newlyFailing: RegressionEntry[] = [];
    const neverPassed: RegressionEntry[] = [];

    for (const item of items) {
      const now = current.get(item.id);
      const priorPassCycle = lastPassByItem.get(item.id) ?? null;
      const entry: RegressionEntry = {
        itemid: item.id,
        itemkey: item.itemkey,
        title: item.title,
        lastPassedCycleId: priorPassCycle,
        lastPassedVersion: priorPassCycle ? versionByCycle.get(priorPassCycle) ?? null : null,
      };

      // Never green anywhere, ever — outstanding new work, not a regression.
      if (!priorPassCycle && now !== "pass") {
        neverPassed.push(entry);
        continue;
      }

      if (now === "pass") {
        stillPassing.push(entry);
        continue;
      }

      // Passed the last time it ran, and is not passing now.
      if (priorPassCycle && (now === "fail" || now === "blocked" || now === "unresolved")) {
        newlyFailing.push(entry);
        continue;
      }

      // Not exercised in this cycle at all: it keeps whatever standing its own
      // last execution gave it and is not reported as a new failure.
      if (!now) {
        const prior = lastPriorByItem.get(item.id);
        if (prior?.status === "pass") stillPassing.push(entry);
        else if (priorPassCycle) newlyFailing.push(entry);
        else neverPassed.push(entry);
      }
    }

    logger.info(
      {
        cycleid,
        stillPassing: stillPassing.length,
        newlyFailing: newlyFailing.length,
        neverPassed: neverPassed.length,
      },
      "Regression comparison computed",
    );

    return { cycleid, version: cycle.version, stillPassing, newlyFailing, neverPassed };
  }

  private static async versionMap(cycleIds: string[]): Promise<Map<string, string>> {
    if (cycleIds.length === 0) return new Map();
    const rows = await db
      .select({ id: testcycles.id, version: testcycles.version })
      .from(testcycles)
      .where(inArray(testcycles.id, cycleIds));
    return new Map(rows.map((r) => [r.id, r.version]));
  }
}
// [SCOPE 111 / T014] END
