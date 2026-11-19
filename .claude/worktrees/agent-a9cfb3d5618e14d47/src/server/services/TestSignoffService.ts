import { db } from "~/db/client.js";
import { testsignoffs } from "~/db/schema/testsignoffs.js";
import { testplanitems } from "~/db/schema/testplanitems.js";
import { testretests } from "~/db/schema/testretests.js";
import { testrunresults } from "~/db/schema/testrunresults.js";
import { companyauditlogs } from "~/db/schema/companyauditlog.js";
import { eq, and, isNull, desc, inArray } from "drizzle-orm";
import { createLogger } from "~/server/lib/logger.js";
import { TestImpactService } from "./TestImpactService.js";
import { TestCycleService } from "./TestCycleService.js";
// [SCOPE 123 / T015] Import cycle (ScopeStageService -> TestGateService -> here) is safe: every
// use on both sides is inside a function, never at module evaluation.
import { ScopeStageService } from "./ScopeStageService.js";
import type { TestSignoff } from "~/db/schema/testsignoffs.js";
import type { TestPlanItem } from "~/db/schema/testplanitems.js";

const logger = createLogger("test-signoff-service");

export class SignoffError extends Error {}

// [SCOPE 111 / T016] BEGIN — One signoff per item, from its own executor
// [SCOPE 123 / T015] MODIFIED-BY — insertSignoff re-attempts the signed item's scope stage advance (FR-010)
export class TestSignoffService {
  /**
   * Record the AI signoff for an item a run proved (FR-019, FR-020).
   *
   * Refused unless that run actually passed the item — a signoff is a claim
   * about evidence, and letting a runner assert one without a passing result
   * would make the QA gate self-certifying.
   */
  static async signMachine(input: {
    itemid: string;
    cycleid: string;
    runid: string;
    label: string;
    notes?: string | null;
  }): Promise<TestSignoff> {
    await TestCycleService.assertWritable(input.cycleid, "machine"); // FR-050
    const item = await this.requireItem(input.itemid);
    if (item.executor !== "machine") {
      throw new SignoffError(
        `${item.itemkey} is a human test — a run cannot sign it off. Only the person who performed it can.`,
      );
    }

    const [result] = await db
      .select({ status: testrunresults.status })
      .from(testrunresults)
      .where(
        and(eq(testrunresults.runid, input.runid), eq(testrunresults.itemid, input.itemid)),
      )
      .orderBy(desc(testrunresults.createdat))
      .limit(1);

    if (!result || result.status !== "pass") {
      throw new SignoffError(
        `${item.itemkey} did not pass in run ${input.runid} (${result?.status ?? "no result"}) — refusing to sign it off.`,
      );
    }

    return this.insertSignoff({
      itemid: item.id,
      itemexecutor: "machine",
      signofftype: "ai",
      status: "passed",
      cycleid: input.cycleid,
      runid: input.runid,
      signedbylabel: input.label,
      notes: input.notes ?? null,
    });
  }

  /**
   * Record a tester's verdict (FR-021, FR-023, FR-024).
   *
   * A fail requires a stated reason — the caller is responsible for filing the
   * bug report and passing its id, because the moment the tester has the detail
   * is the moment to capture it, not later.
   */
  static async signHuman(input: {
    itemid: string;
    cycleid: string;
    userid: string;
    passed: boolean;
    notes?: string | null;
    version?: string | null;
    buildref?: string | null;
  }): Promise<TestSignoff> {
    await TestCycleService.assertWritable(input.cycleid, "human"); // FR-050
    const item = await this.requireItem(input.itemid);
    if (item.executor !== "human") {
      throw new SignoffError(
        `${item.itemkey} is a machine test — a person cannot sign it off. It is proved by a run.`,
      );
    }
    if (!item.released) {
      throw new SignoffError(
        `${item.itemkey} has not been released to testers yet — the machine set for this release is still outstanding.`,
      );
    }
    if (!input.passed && !input.notes?.trim()) {
      throw new SignoffError(
        "Recording a failure requires a stated reason describing what actually happened.",
      );
    }

    const signoff = await this.insertSignoff({
      itemid: item.id,
      itemexecutor: "human",
      signofftype: "user",
      status: input.passed ? "passed" : "failed",
      cycleid: input.cycleid,
      signedbyid: input.userid,
      notes: input.notes ?? null,
      signedagainstversion: input.version ?? null,
      signedagainstbuildref: input.buildref ?? null,
    });

    // A fresh signoff answers any outstanding Retest mark for this cycle.
    if (input.passed) {
      await TestImpactService.resolveBySignoff(input.cycleid, item.id);
    }

    return signoff;
  }

  /**
   * FR-033 — an administrator releases a gate without a passing test. Stored as
   * a waiver, never as a pass: a release cleared by administrative decision must
   * always be distinguishable from one cleared by testing.
   */
  static async waive(input: {
    itemid: string;
    cycleid: string;
    actor: { userid: string; companyid: string };
    reason: string;
  }): Promise<TestSignoff> {
    if (!input.reason?.trim()) {
      throw new SignoffError("A waiver requires a stated reason");
    }
    // FR-050 — a closed cycle cannot be cleared retroactively, by test or by
    // administrative decision.
    await TestCycleService.assertWritable(input.cycleid, "any");
    const item = await this.requireItem(input.itemid);

    const signoff = await this.insertSignoff({
      itemid: item.id,
      itemexecutor: item.executor,
      signofftype: item.executor === "machine" ? "ai" : "user",
      status: "waived",
      cycleid: input.cycleid,
      signedbyid: input.actor.userid,
      notes: input.reason.trim(),
    });

    await db.insert(companyauditlogs).values({
      companyid: input.actor.companyid,
      action: "testsignoff.waived",
      changedby: input.actor.userid,
      newvalue: { itemid: item.id, itemkey: item.itemkey, cycleid: input.cycleid },
      description: `Forced test ${item.itemkey} waived: ${input.reason.trim()}`,
    });

    logger.warn({ itemid: item.id, itemkey: item.itemkey }, "Forced test waived by administrator");
    return signoff;
  }

  /**
   * FR-021a — a later failing run invalidates the standing signoff. Marked
   * superseded, never deleted: the record of who once vouched for this survives,
   * which is what makes a regression legible as a change of state.
   */
  static async supersedeOnFailure(itemid: string): Promise<void> {
    await db
      .update(testsignoffs)
      .set({ superseded: true, supersededat: new Date(), updatedat: new Date() })
      .where(and(eq(testsignoffs.itemid, itemid), eq(testsignoffs.superseded, false)));
  }

  /**
   * The current signoff for an item, under this scope's asymmetric rules.
   *
   *  - MACHINE: must have been given in THIS cycle. A signoff carrying an
   *    earlier cycleid is simply not found, so the item reads unsigned until the
   *    cycle's regression run re-earns it. The reset is the absence of a row,
   *    not the deletion of one.
   *  - HUMAN: carries forward across cycles by default (FR-049h), and counts
   *    unless it has been superseded by a failing run or sits under an
   *    unanswered Retest mark for this cycle.
   */
  static async currentSignoff(
    item: Pick<TestPlanItem, "id" | "executor">,
    cycleid: string,
  ): Promise<TestSignoff | null> {
    if (item.executor === "machine") {
      const [row] = await db
        .select()
        .from(testsignoffs)
        .where(
          and(
            eq(testsignoffs.itemid, item.id),
            eq(testsignoffs.cycleid, cycleid),
            eq(testsignoffs.superseded, false),
          ),
        )
        .limit(1);
      return row ?? null;
    }

    const outstanding = await this.outstandingRetests(cycleid, [item.id]);
    if (outstanding.has(item.id)) return null;

    const [row] = await db
      .select()
      .from(testsignoffs)
      .where(and(eq(testsignoffs.itemid, item.id), eq(testsignoffs.superseded, false)))
      .orderBy(desc(testsignoffs.signedat))
      .limit(1);
    return row ?? null;
  }

  /** Item ids carrying an unanswered Retest mark in this cycle. */
  static async outstandingRetests(cycleid: string, itemids: string[]): Promise<Set<string>> {
    if (itemids.length === 0) return new Set();
    const rows = await db
      .select({ itemid: testretests.itemid })
      .from(testretests)
      .where(
        and(
          eq(testretests.cycleid, cycleid),
          isNull(testretests.resolution),
          inArray(testretests.itemid, itemids),
        ),
      );
    return new Set(rows.map((r) => r.itemid));
  }

  /** All standing signoffs for a set of items, resolved by the rules above. */
  static async currentSignoffsFor(
    items: Array<Pick<TestPlanItem, "id" | "executor">>,
    cycleid: string,
  ): Promise<Map<string, TestSignoff>> {
    const out = new Map<string, TestSignoff>();
    if (items.length === 0) return out;

    const ids = items.map((i) => i.id);
    const machineIds = items.filter((i) => i.executor === "machine").map((i) => i.id);
    const humanIds = items.filter((i) => i.executor === "human").map((i) => i.id);

    const rows = await db
      .select()
      .from(testsignoffs)
      .where(and(inArray(testsignoffs.itemid, ids), eq(testsignoffs.superseded, false)))
      .orderBy(desc(testsignoffs.signedat));

    const outstanding = await this.outstandingRetests(cycleid, humanIds);

    for (const row of rows) {
      if (out.has(row.itemid)) continue;
      if (machineIds.includes(row.itemid)) {
        if (row.cycleid !== cycleid) continue; // never carries
        out.set(row.itemid, row);
        continue;
      }
      if (outstanding.has(row.itemid)) continue; // withdrawn pending re-test
      out.set(row.itemid, row);
    }

    return out;
  }

  private static async requireItem(itemid: string): Promise<TestPlanItem> {
    const [item] = await db
      .select()
      .from(testplanitems)
      .where(eq(testplanitems.id, itemid))
      .limit(1);
    if (!item) throw new SignoffError(`Test item ${itemid} not found`);
    return item;
  }

  private static async insertSignoff(values: {
    itemid: string;
    itemexecutor: string;
    signofftype: string;
    status: string;
    cycleid: string;
    runid?: string | null;
    signedbyid?: string | null;
    signedbylabel?: string | null;
    notes?: string | null;
    signedagainstversion?: string | null;
    signedagainstbuildref?: string | null;
  }): Promise<TestSignoff> {
    // Replace any prior signoff of this type in this cycle — one signoff per
    // item per type per cycle, enforced by the unique index.
    await db
      .delete(testsignoffs)
      .where(
        and(
          eq(testsignoffs.itemid, values.itemid),
          eq(testsignoffs.cycleid, values.cycleid),
          eq(testsignoffs.signofftype, values.signofftype),
        ),
      );

    const [row] = await db.insert(testsignoffs).values(values).returning();

    // SCOPE-123 FR-010: a signoff (or waiver) can clear the last gate holding a scope in QA or
    // Human Testing, with no further task closing. Re-attempt that scope's advance. Results alone
    // never clear a gate (a machine item still needs its signoff), so this is the one trigger.
    await ScopeStageService.onTestItemsWritten([values.itemid], {
      actor: values.signedbyid ?? values.signedbylabel ?? 'test-signoff',
      trigger: 'test_signoff',
    });
    return row;
  }
}
// [SCOPE 111 / T016] END
