import { db } from "~/db/client.js";
import { testplans } from "~/db/schema/testPlan.js";
import { testplanitems, type TestItemDetail } from "~/db/schema/testplanitems.js";
import { testitemsubjects } from "~/db/schema/testitemsubjects.js";
import { companyauditlogs } from "~/db/schema/companyauditlog.js";
import { projectspecifications } from "~/db/schema/projectspecification.js";
import { companyprojects } from "~/db/schema/companyproject.js";
import { eq, and, sql, inArray, asc } from "drizzle-orm";
import { createLogger } from "~/server/lib/logger.js";
// [SCOPE 123 / T021] Import cycle (ScopeStageService imports this file) is safe: both sides use
// each other only inside functions, never at module evaluation.
import { ScopeStageService } from "./ScopeStageService.js";
import type { TestPlan } from "~/db/schema/testPlan.js";
import type { TestPlanItem } from "~/db/schema/testplanitems.js";
import type { TestExecutor, TestOrigin } from "~/shared/types/tests.js";

const logger = createLogger("test-plan-service");

export interface UpsertItemInput {
  itemkey: string;
  title: string;
  executor: TestExecutor;
  origin?: TestOrigin;
  gate: string;
  requirementid?: string | null;
  specref?: string | null;
  fenceref?: string | null;
  layer?: string;
  variant?: string;
  priority?: string;
  risktier?: string;
  testlevel?: string;
  tier?: string;
  automation?: string;
  automationref?: string | null;
  blockedreason?: string | null;
  forcetest?: boolean | null;
  detail: TestItemDetail;
  /** One or more code locations this item exercises (FR-049b1d). */
  subjects?: Array<{ sourcepath: string; sourceline?: number | null; unitid?: string | null; role?: string }>;
}

export interface ItemFilter {
  executor?: TestExecutor;
  released?: boolean;
  gate?: string;
  origin?: TestOrigin;
  forcedOnly?: boolean;
}

// [SCOPE 111 / T011] BEGIN — Plans, items, subjects, and force resolution
// [SCOPE 123 / T021] MODIFIED-BY — setProjectSkipTesting re-assesses the project's scope stages
export class TestPlanService {
  /**
   * The force question, answered in one place: an item's own override wins,
   * and null means inherit the scope's flag (FR-030). Everything that gates on
   * "is this binding" must come through here — a second copy of this rule is
   * how an item explicitly turned OFF starts blocking again.
   */
  static resolveForce(itemForce: boolean | null, planForce: boolean): boolean {
    return itemForce ?? planForce;
  }

  /** SQL form of the same rule, for set-based queries. */
  static forceExpr = sql<boolean>`COALESCE(${testplanitems.forcetest}, ${testplans.forcetest})`;

  static async listPlans(projectid: string, specid?: string): Promise<TestPlan[]> {
    const conds = [eq(testplans.projectid, projectid)];
    if (specid) conds.push(eq(testplans.specid, specid));
    return db.select().from(testplans).where(and(...conds));
  }

  /**
   * Plans with the scope they belong to, plus per-plan counts.
   *
   * The interface needs the scope NUMBER and TITLE, not a UUID — a filter that
   * offers "2cbb95e3-6204…" is not a filter anyone can use. Counts come back in
   * the same query so the picker can show where the work actually is.
   */
  static async listPlansWithScope(projectid: string): Promise<
    Array<{
      id: string;
      specid: string;
      specnumber: string | null;
      title: string | null;
      forcetest: boolean;
      itemcount: number;
      machinecount: number;
      humancount: number;
      outstandingcount: number;
    }>
  > {
    const rows = await db
      .select({
        id: testplans.id,
        specid: testplans.specid,
        specnumber: projectspecifications.specnumber,
        title: projectspecifications.title,
        forcetest: testplans.forcetest,
        itemcount: testplans.itemcount,
        machinecount: sql<number>`
          count(*) filter (where ${testplanitems.executor} = 'machine')::int`,
        humancount: sql<number>`
          count(*) filter (where ${testplanitems.executor} = 'human')::int`,
        outstandingcount: sql<number>`
          count(*) filter (where ${testplanitems.lastresultstatus} is null)::int`,
      })
      .from(testplans)
      .leftJoin(
        projectspecifications,
        eq(testplans.specid, projectspecifications.id),
      )
      .leftJoin(testplanitems, eq(testplanitems.testplanid, testplans.id))
      .where(eq(testplans.projectid, projectid))
      .groupBy(
        testplans.id,
        testplans.specid,
        projectspecifications.specnumber,
        projectspecifications.title,
        testplans.forcetest,
        testplans.itemcount,
      )
      .orderBy(asc(projectspecifications.specnumber));

    return rows;
  }

  static async getPlanBySpec(specid: string): Promise<TestPlan | null> {
    const [row] = await db.select().from(testplans).where(eq(testplans.specid, specid)).limit(1);
    return row ?? null;
  }

  static async getPlan(planid: string): Promise<TestPlan | null> {
    const [row] = await db.select().from(testplans).where(eq(testplans.id, planid)).limit(1);
    return row ?? null;
  }

  static async getItem(itemid: string): Promise<TestPlanItem | null> {
    const [row] = await db.select().from(testplanitems).where(eq(testplanitems.id, itemid)).limit(1);
    return row ?? null;
  }

  static async listItems(planid: string, filter: ItemFilter = {}): Promise<TestPlanItem[]> {
    const conds = [eq(testplanitems.testplanid, planid)];
    if (filter.executor) conds.push(eq(testplanitems.executor, filter.executor));
    if (filter.released !== undefined) conds.push(eq(testplanitems.released, filter.released));
    if (filter.gate) conds.push(eq(testplanitems.gate, filter.gate));
    if (filter.origin) conds.push(eq(testplanitems.origin, filter.origin));

    const rows = await db
      .select()
      .from(testplanitems)
      .where(and(...conds))
      .orderBy(asc(testplanitems.itemkey));

    if (!filter.forcedOnly) return rows;

    const plan = await this.getPlan(planid);
    const planForce = plan?.forcetest ?? false;
    return rows.filter((r) => this.resolveForce(r.forcetest, planForce));
  }

  static async listSubjects(itemids: string[]) {
    if (itemids.length === 0) return [];
    return db.select().from(testitemsubjects).where(inArray(testitemsubjects.itemid, itemids));
  }

  /**
   * File or refresh a scope's suite (FR-007, FR-040).
   *
   * Matching is on the immutable (plan, itemkey) pair, so re-generating after a
   * code change UPDATES the item in place. That is what preserves accumulated
   * results and signoffs — a delete-and-recreate here would silently discard
   * every human signoff on the scope, which is exactly the outcome the selective
   * invalidation design exists to avoid.
   */
  static async upsertPlan(input: {
    projectid: string;
    specid: string;
    source?: string;
    generatedbyid?: string | null;
    items: UpsertItemInput[];
  }): Promise<{ plan: TestPlan; created: number; updated: number }> {
    const existing = await this.getPlanBySpec(input.specid);

    const plan =
      existing ??
      (
        await db
          .insert(testplans)
          .values({
            specid: input.specid,
            projectid: input.projectid,
            source: input.source ?? "ai",
            generatedbyid: input.generatedbyid ?? null,
            generatedat: new Date(),
            status: "active",
          })
          .returning()
      )[0];

    let created = 0;
    let updated = 0;

    for (const item of input.items) {
      const [prior] = await db
        .select({ id: testplanitems.id })
        .from(testplanitems)
        .where(
          and(eq(testplanitems.testplanid, plan.id), eq(testplanitems.itemkey, item.itemkey)),
        )
        .limit(1);

      const values = {
        testplanid: plan.id,
        projectid: input.projectid,
        specid: input.specid,
        itemkey: item.itemkey,
        title: item.title,
        requirementid: item.requirementid ?? null,
        specref: item.specref ?? null,
        fenceref: item.fenceref ?? null,
        gate: item.gate,
        layer: item.layer ?? "app",
        variant: item.variant ?? "happy",
        priority: item.priority ?? "P2",
        risktier: item.risktier ?? "MEDIUM",
        testlevel: item.testlevel ?? "integration",
        tier: item.tier ?? "unit-mocked",
        automation: item.automation ?? "automatable",
        automationref: item.automationref ?? null,
        blockedreason: item.blockedreason ?? null,
        executor: item.executor,
        origin: item.origin ?? "ai",
        // Machine items are runnable at once; the human set is withheld until
        // the release is promoted to UAT (FR-021b).
        released: item.executor === "machine",
        detail: item.detail,
        updatedat: new Date(),
      };

      let itemid: string;
      if (prior) {
        // Deliberately does NOT touch forcetest, released, or lastresult* —
        // re-generation must not undo an administrator's override or re-hide a
        // set that has already been released to testers.
        const [row] = await db
          .update(testplanitems)
          .set({ ...values, released: undefined as unknown as boolean })
          .where(eq(testplanitems.id, prior.id))
          .returning({ id: testplanitems.id });
        itemid = row.id;
        updated += 1;
      } else {
        const [row] = await db
          .insert(testplanitems)
          .values(values)
          .returning({ id: testplanitems.id });
        itemid = row.id;
        created += 1;
      }

      if (item.subjects?.length) {
        await this.replaceSubjects(itemid, input.projectid, item.subjects);
      }
    }

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(testplanitems)
      .where(eq(testplanitems.testplanid, plan.id));

    const [refreshed] = await db
      .update(testplans)
      .set({ itemcount: total, updatedat: new Date() })
      .where(eq(testplans.id, plan.id))
      .returning();

    logger.info(
      { specid: input.specid, planid: plan.id, created, updated, total },
      "Test plan upserted",
    );
    return { plan: refreshed, created, updated };
  }

  private static async replaceSubjects(
    itemid: string,
    projectid: string,
    subjects: NonNullable<UpsertItemInput["subjects"]>,
  ): Promise<void> {
    await db.delete(testitemsubjects).where(eq(testitemsubjects.itemid, itemid));
    for (const subject of subjects) {
      await db.insert(testitemsubjects).values({
        itemid,
        projectid,
        sourcepath: normalizeSourcePath(subject.sourcepath),
        sourceline: subject.sourceline ?? null,
        unitid: subject.unitid ?? null,
        role: subject.role ?? "primary",
      });
    }
  }

  /**
   * A tester adds a test from real use (FR-026, FR-027, FR-027a).
   *
   * It is a human item and it is LIVE ON CREATION — release governs only the
   * set authored at generation time, and the set this joins has already been
   * released to the tester who is standing in it.
   */
  static async addUserItem(
    planid: string,
    input: Omit<UpsertItemInput, "executor" | "origin"> & { projectid: string; specid: string | null },
  ): Promise<TestPlanItem> {
    const [row] = await db
      .insert(testplanitems)
      .values({
        testplanid: planid,
        projectid: input.projectid,
        specid: input.specid,
        itemkey: input.itemkey,
        title: input.title,
        requirementid: input.requirementid ?? null,
        specref: input.specref ?? null,
        fenceref: input.fenceref ?? null,
        gate: input.gate,
        layer: input.layer ?? "app",
        variant: input.variant ?? "happy",
        priority: input.priority ?? "P2",
        risktier: input.risktier ?? "MEDIUM",
        testlevel: input.testlevel ?? "acceptance",
        tier: input.tier ?? "manual",
        automation: input.automation ?? "manual-only",
        executor: "human",
        origin: "user",
        released: true,
        releasedat: new Date(),
        forcetest: input.forcetest ?? null,
        detail: input.detail,
      })
      .returning();

    if (input.subjects?.length) {
      await this.replaceSubjects(row.id, input.projectid, input.subjects);
    }

    logger.info({ planid, itemid: row.id, itemkey: row.itemkey }, "Tester-authored item created");
    return row;
  }

  /**
   * Release the human set on promotion to UAT (FR-021b). Applies to the set as
   * a whole, needs no manual step, and is idempotent.
   */
  static async releaseHumanSet(projectid: string, specid?: string): Promise<number> {
    const conds = [
      eq(testplanitems.projectid, projectid),
      eq(testplanitems.executor, "human"),
      eq(testplanitems.released, false),
    ];
    if (specid) conds.push(eq(testplanitems.specid, specid));

    const released = await db
      .update(testplanitems)
      .set({ released: true, releasedat: new Date() })
      .where(and(...conds))
      .returning({ id: testplanitems.id });

    logger.info({ projectid, specid, count: released.length }, "Human test set released");
    return released.length;
  }

  /** FR-029, FR-031, FR-032 — administrator only, audited. */
  static async setPlanForce(
    planid: string,
    value: boolean,
    actor: { userid: string; companyid: string },
  ): Promise<TestPlan> {
    const before = await this.getPlan(planid);
    const [updated] = await db
      .update(testplans)
      .set({ forcetest: value, updatedat: new Date() })
      .where(eq(testplans.id, planid))
      .returning();

    await this.audit(actor, "testplan.forcetest", planid, {
      previous: before?.forcetest ?? null,
      next: value,
    });
    return updated;
  }

  /** FR-030, FR-031, FR-032 — null clears the override back to inherit. */
  static async setItemForce(
    itemid: string,
    value: boolean | null,
    actor: { userid: string; companyid: string },
  ): Promise<TestPlanItem> {
    const before = await this.getItem(itemid);
    const [updated] = await db
      .update(testplanitems)
      .set({ forcetest: value, updatedat: new Date() })
      .where(eq(testplanitems.id, itemid))
      .returning();

    await this.audit(actor, "testplanitem.forcetest", itemid, {
      previous: before?.forcetest ?? null,
      next: value,
    });
    return updated;
  }

  /**
   * [SCOPE 111 / Amendment A] Read the project-level testing opt-out.
   */
  static async getProjectSkipTesting(projectid: string): Promise<boolean> {
    const [row] = await db
      .select({ skiptesting: companyprojects.skiptesting })
      .from(companyprojects)
      .where(eq(companyprojects.id, projectid))
      .limit(1);
    return row?.skiptesting ?? false;
  }

  /**
   * Turn the whole test gate off (or back on) for a project.
   *
   * Administrator-only and audited at WARN. Switching this on disables a release
   * gate for every scope at once — the single most consequential control in this
   * scope — so it leaves a record naming who did it and what it bypassed.
   */
  static async setProjectSkipTesting(
    projectid: string,
    skip: boolean,
    actor: { userid: string; companyid: string },
  ): Promise<{ id: string; skiptesting: boolean }> {
    const before = await this.getProjectSkipTesting(projectid);

    const [updated] = await db
      .update(companyprojects)
      .set({ skiptesting: skip, updatedat: new Date() })
      .where(eq(companyprojects.id, projectid))
      .returning({ id: companyprojects.id, skiptesting: companyprojects.skiptesting });

    await db.insert(companyauditlogs).values({
      companyid: actor.companyid,
      action: skip ? "project.testing_disabled" : "project.testing_enabled",
      changedby: actor.userid,
      previousvalue: { skiptesting: before },
      newvalue: { skiptesting: skip, projectid },
      description: skip
        ? `Testing DISABLED for project ${projectid} — forced tests will no longer block release.`
        : `Testing re-enabled for project ${projectid}.`,
    });

    logger.warn({ projectid, skip, actor: actor.userid }, "Project testing opt-out changed");

    // SCOPE-123: switching testing off clears every scope's test conditions at once, with no task
    // or test write to trigger the advance; re-assess the project's scopes now.
    await ScopeStageService.advanceProject(projectid, { actor: actor.userid, trigger: "skiptesting_changed" });
    return updated;
  }

  private static async audit(
    actor: { userid: string; companyid: string },
    action: string,
    entityid: string,
    payload: { previous: boolean | null; next: boolean | null },
  ): Promise<void> {
    // FR-032 — actor, previous value and new value, on the existing SCOPE-013
    // audit infrastructure rather than a second log.
    await db.insert(companyauditlogs).values({
      companyid: actor.companyid,
      action,
      changedby: actor.userid,
      previousvalue: { forcetest: payload.previous },
      newvalue: { forcetest: payload.next, entityid },
      description: `${action}: ${String(payload.previous)} → ${String(payload.next)} on ${entityid}`,
    });
  }
}

/**
 * Repository-relative, forward-slashed, no line suffix — impact analysis matches
 * the runner's graph against this, and a mismatch here reads as "not reached",
 * which is the dangerous direction.
 */
export function normalizeSourcePath(input: string): string {
  return input
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/:\d+(:\d+)?$/, "");
}
// [SCOPE 111 / T011] END
