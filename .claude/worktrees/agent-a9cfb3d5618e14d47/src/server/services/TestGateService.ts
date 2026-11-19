import { db } from "~/db/client.js";
import { testplanitems } from "~/db/schema/testplanitems.js";
import { testplans } from "~/db/schema/testPlan.js";
import { companyprojects } from "~/db/schema/companyproject.js";
import { and, eq } from "drizzle-orm";
import { createLogger } from "~/server/lib/logger.js";
import { TestCycleService } from "./TestCycleService.js";
import { TestPlanService } from "./TestPlanService.js";
import { TestSignoffService } from "./TestSignoffService.js";
import type { GateRequirement, TestGateBlocker, TestGateVerdict } from "~/shared/types/tests.js";

const logger = createLogger("test-gate-service");

// [SCOPE 111 / T017] BEGIN — THE single source of "is this release clear?"
// [SCOPE 123 / T015] MODIFIED-BY — optional specid narrows the gate to one scope; verdict reports inscopetotal
// [SCOPE 123 / T020] MODIFIED-BY — options object; includeUnforced for the per-scope advance (decision 11)
//
// The phase views, the phase advance check and the release commands all ask
// this one function. That is deliberate and worth defending: a second
// implementation of this question will disagree with the first exactly when it
// matters — at a release, under pressure, with the two surfaces reporting
// different answers and nobody able to say which is right.
//
// If you find yourself writing "is this item signed off?" anywhere else, call
// this instead.
export class TestGateService {
  /**
   * Forced items standing in the way, evaluated within the project's CURRENT
   * cycle.
   *
   *   - 'ai'   — the QA gate. Machine items only; human items are not
   *              considered, because the human set has not been released yet
   *              and a person has not been asked for anything.
   *   - 'user' — the User Testing gate. Released human items only; machine
   *              items are not re-checked, having already cleared QA.
   *   - 'all'  — the Release gate. Every forced item of either kind, project
   *              wide, which is what catches an item added after its phase
   *              already advanced (FR-036).
   */
  static async checkForcedCoverage(
    projectid: string,
    requirement: GateRequirement,
    // SCOPE-123 — options for one scope's own stage advance. Omitted: the
    // project-wide gate, exactly as before.
    //   specid                  narrow to that scope's items
    //   includeUnreleasedHuman  count human items whether or not released yet: a
    //                           failed release must not let a scope pass vacuously
    //   includeUnforced         every item blocks, forced or not (Amendment C,
    //                           decision 11); force keeps its meaning for this
    //                           project-wide gate
    opts: { specid?: string; includeUnreleasedHuman?: boolean; includeUnforced?: boolean } = {},
  ): Promise<TestGateVerdict> {
    const specid = opts.specid;
    const includeUnreleasedHuman = opts.includeUnreleasedHuman === true;
    const includeUnforced = opts.includeUnforced === true;
    const cycle = await TestCycleService.resolveCurrent(projectid);

    const rows = await db
      .select({
        id: testplanitems.id,
        itemkey: testplanitems.itemkey,
        title: testplanitems.title,
        executor: testplanitems.executor,
        specid: testplanitems.specid,
        requirementid: testplanitems.requirementid,
        released: testplanitems.released,
        itemForce: testplanitems.forcetest,
        planForce: testplans.forcetest,
        lastresultstatus: testplanitems.lastresultstatus,
      })
      .from(testplanitems)
      .innerJoin(testplans, eq(testplanitems.testplanid, testplans.id))
      .where(
        specid
          ? and(eq(testplanitems.projectid, projectid), eq(testplanitems.specid, specid))
          : eq(testplanitems.projectid, projectid),
      );

    const inScope = rows.filter((row) => {
      const released = row.released || (includeUnreleasedHuman && row.executor === "human");
      if (requirement === "ai") return row.executor === "machine";
      if (requirement === "user") return row.executor === "human" && released;
      // 'all' — an unreleased human item has never been asked of anyone, so it
      // cannot be outstanding against them.
      return row.executor === "machine" || released;
    });

    const isBlocking = (row: (typeof inScope)[number]) =>
      includeUnforced || TestPlanService.resolveForce(row.itemForce, row.planForce);
    const forced = inScope.filter(isBlocking);
    const unforced = inScope.filter((row) => !isBlocking(row));

    const signoffs = await TestSignoffService.currentSignoffsFor(
      forced.map((f) => ({ id: f.id, executor: f.executor as "machine" | "human" })),
      cycle.id,
    );
    const outstandingRetests = await TestSignoffService.outstandingRetests(
      cycle.id,
      forced.filter((f) => f.executor === "human").map((f) => f.id),
    );

    const blocking: TestGateBlocker[] = [];
    for (const row of forced) {
      const signoff = signoffs.get(row.id);

      // A failing last result blocks the QA gate even if something signed it —
      // FR-034 names the failing result separately from the missing signoff.
      if (
        (requirement === "ai" || requirement === "all") &&
        row.executor === "machine" &&
        row.lastresultstatus === "fail"
      ) {
        blocking.push(toBlocker(row, "failing"));
        continue;
      }

      if (!signoff) {
        blocking.push(
          toBlocker(row, outstandingRetests.has(row.id) ? "retest-outstanding" : "unsigned"),
        );
      }
    }

    // FR-038 — unforced items are reported so nothing is hidden, but they never
    // contribute to the block.
    const outstandingUnforced = unforced.filter((row) => !row.lastresultstatus).length;

    // [SCOPE 111 / Amendment A] Project-level opt-out. Applied LAST, on purpose:
    // the blocking list is computed in full first and handed back intact, so the
    // caller can say "3 forced tests bypassed" rather than showing an unqualified
    // pass. A skip that erased the evidence would be indistinguishable from
    // having done the work.
    const [project] = await db
      .select({ skiptesting: companyprojects.skiptesting })
      .from(companyprojects)
      .where(eq(companyprojects.id, projectid))
      .limit(1);

    if (project?.skiptesting) {
      logger.warn(
        { projectid, requirement, bypassed: blocking.length },
        "Test gate BYPASSED — project has testing switched off",
      );
      return {
        passed: true,
        requirement,
        cycleid: cycle.id,
        version: cycle.version,
        blocking,
        outstandingUnforced,
        skipped: true,
        bypassedCount: blocking.length,
        inscopetotal: inScope.length,
      };
    }

    const verdict: TestGateVerdict = {
      passed: blocking.length === 0,
      requirement,
      cycleid: cycle.id,
      version: cycle.version,
      blocking,
      outstandingUnforced,
      skipped: false,
      bypassedCount: 0,
      inscopetotal: inScope.length,
    };

    logger.debug(
      { projectid, requirement, blocking: blocking.length, cycle: cycle.version },
      "Test gate evaluated",
    );
    return verdict;
  }

  /**
   * Promotion checks, expressed in the pipeline's own words so the release
   * commands and the interface cannot drift apart (FR-039, FR-053, FR-054).
   */
  static async canPromoteToUat(projectid: string): Promise<TestGateVerdict> {
    return this.checkForcedCoverage(projectid, "ai");
  }

  static async canPromoteToProduction(projectid: string): Promise<TestGateVerdict> {
    return this.checkForcedCoverage(projectid, "all");
  }
}

function toBlocker(
  row: {
    id: string;
    itemkey: string;
    title: string;
    executor: string;
    specid: string | null;
    requirementid: string | null;
  },
  why: TestGateBlocker["why"],
): TestGateBlocker {
  return {
    itemid: row.id,
    itemkey: row.itemkey,
    title: row.title,
    executor: row.executor as "machine" | "human",
    specid: row.specid,
    requirementid: row.requirementid,
    why,
  };
}
// [SCOPE 111 / T017] END
