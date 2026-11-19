import { db } from "~/db/client.js";
import { testcycles } from "~/db/schema/testcycles.js";
import { eq, and, desc } from "drizzle-orm";
import { createLogger } from "~/server/lib/logger.js";
import { APP_VERSION } from "~/client/version.js";
import type { TestCycle } from "~/db/schema/testcycles.js";
import type { TestCycleStatus } from "~/shared/types/tests.js";

const logger = createLogger("test-cycle-service");

/**
 * A write aimed at a cycle that has closed (FR-050). Distinct from the other
 * service errors so the route can answer 409 Conflict — the request is
 * well-formed and the caller is authorised; it is the cycle's state that
 * refuses it, and the caller's correct response is to retry against the
 * current cycle rather than to fix the payload.
 */
export class ClosedCycleError extends Error {}

// [SCOPE 111 / T012] BEGIN — Test cycles keyed to the application version
export class TestCycleService {
  /**
   * The version that identifies the current cycle. Reads the application
   * version, which the pre-push hook bumps on every push to main.
   *
   * A cycle opening on every push is safe precisely because invalidation is
   * selective: a push touching no covered code marks nothing for re-test, so
   * the cycle opens, the machine set re-runs, and no tester repeats anything.
   */
  static currentVersion(): string {
    return process.env.WXKANBAN_TEST_CYCLE_VERSION?.trim() || APP_VERSION;
  }

  /**
   * Resolve the project's current cycle, opening one if this version has not
   * been seen (FR-048). No deliberate act is required to start a cycle.
   *
   * Concurrent callers are handled by the (projectid, version) unique index
   * rather than by a lock: whoever loses the race re-reads the winner's row.
   */
  static async resolveCurrent(
    projectid: string,
    opts: { commitsha?: string | null; buildref?: string | null } = {},
  ): Promise<TestCycle> {
    const version = this.currentVersion();

    const existing = await this.findByVersion(projectid, version);
    if (existing) return existing;

    try {
      const [created] = await db
        .insert(testcycles)
        .values({
          projectid,
          version,
          status: "open",
          commitsha: opts.commitsha ?? null,
          buildref: opts.buildref ?? null,
        })
        .returning();

      // Everything before this version is now history.
      await this.supersedeOlderCycles(projectid, created.id);

      logger.info({ projectid, version, cycleid: created.id }, "Test cycle opened");
      return created;
    } catch (err) {
      // Lost the insert race — the other caller's row is the answer.
      const raced = await this.findByVersion(projectid, version);
      if (raced) return raced;
      throw err;
    }
  }

  static async findByVersion(projectid: string, version: string): Promise<TestCycle | null> {
    const [row] = await db
      .select()
      .from(testcycles)
      .where(and(eq(testcycles.projectid, projectid), eq(testcycles.version, version)))
      .limit(1);
    return row ?? null;
  }

  static async getById(cycleid: string): Promise<TestCycle | null> {
    const [row] = await db.select().from(testcycles).where(eq(testcycles.id, cycleid)).limit(1);
    return row ?? null;
  }

  static async list(projectid: string, limit = 25): Promise<TestCycle[]> {
    return db
      .select()
      .from(testcycles)
      .where(eq(testcycles.projectid, projectid))
      .orderBy(desc(testcycles.openedat))
      .limit(limit);
  }

  /**
   * Mark every other cycle superseded. Superseded is a label, not a deletion —
   * the rows stay readable because the regression comparison reads across them.
   */
  private static async supersedeOlderCycles(projectid: string, keepCycleId: string): Promise<void> {
    const rows = await db
      .select({ id: testcycles.id, status: testcycles.status })
      .from(testcycles)
      .where(eq(testcycles.projectid, projectid));

    for (const row of rows) {
      if (row.id === keepCycleId) continue;
      if (row.status === "superseded") continue;
      await db
        .update(testcycles)
        .set({ status: "superseded", supersededat: new Date(), updatedat: new Date() })
        .where(eq(testcycles.id, row.id));
    }
  }

  /**
   * Promote the cycle. UAT promotion is the moment the human set is released
   * (FR-021b) — the caller performs that release, because releasing items is
   * the plan service's business, not the cycle's.
   */
  static async promote(
    cycleid: string,
    to: Extract<TestCycleStatus, "uat" | "production">,
    userid: string | null,
  ): Promise<TestCycle> {
    const now = new Date();
    const patch =
      to === "uat"
        ? { status: to, promotedtouatat: now, promotedbyid: userid }
        : { status: to, promotedtoproductionat: now, promotedbyid: userid };

    const [updated] = await db
      .update(testcycles)
      .set({ ...patch, updatedat: new Date() })
      .where(eq(testcycles.id, cycleid))
      .returning();

    logger.info({ cycleid, to, userid }, "Test cycle promoted");
    return updated;
  }

  /**
   * FR-050 — a closed cycle is retained in full AND read-only.
   *
   * Retention was already satisfied (nothing here deletes; `superseded` is a
   * label and a signoff is flagged rather than removed). Read-only was not: any
   * caller could still post a run, a result, or a signoff into a cycle that had
   * already closed.
   *
   * Nobody does that deliberately. The path that matters is a delayed or retried
   * runner callback arriving after promotion — it lands silently, and because
   * FR-052 reads an item's own last actual execution out of a prior cycle as the
   * regression baseline, it rewrites the very history the regression report is
   * computed from. A refusal turns an invisible corruption into a loud error.
   *
   * Where the line sits:
   *   - `superseded` — a NEWER cycle exists (supersedeOlderCycles marks every
   *     other cycle when one opens). Any write here is by definition stale, so
   *     all writes are refused.
   *   - `production` — refuses MACHINE writes: runs execute before UAT, so a run
   *     or machine signoff arriving after production promotion is out of order.
   *     Human signoffs stay allowed, because a tester finishing late is ordinary
   *     and harmless.
   *   - `open` / `uat` — the working states; unaffected.
   */
  static async assertWritable(
    cycleid: string,
    kind: "machine" | "human" | "any" = "any",
  ): Promise<void> {
    const [row] = await db
      .select({ status: testcycles.status, version: testcycles.version })
      .from(testcycles)
      .where(eq(testcycles.id, cycleid))
      .limit(1);

    if (!row) throw new ClosedCycleError(`Test cycle ${cycleid} not found`);

    if (row.status === "superseded") {
      throw new ClosedCycleError(
        `Test cycle ${row.version} is superseded and read-only (FR-050). A newer cycle has opened, so this write is stale — re-run it against the current cycle.`,
      );
    }
    if (row.status === "production" && kind === "machine") {
      throw new ClosedCycleError(
        `Test cycle ${row.version} has been promoted to production and no longer accepts machine runs or signoffs (FR-050).`,
      );
    }
  }

  static async setCommit(cycleid: string, commitsha: string): Promise<void> {
    await db
      .update(testcycles)
      .set({ commitsha, updatedat: new Date() })
      .where(eq(testcycles.id, cycleid));
  }
}
// [SCOPE 111 / T012] END
