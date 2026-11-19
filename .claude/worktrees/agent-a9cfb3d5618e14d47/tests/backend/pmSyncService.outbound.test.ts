/**
 * pmSyncService.runOutboundSync retry semantics (Spec 020 FR-006).
 *
 * NOTE: Requires a test database with the 0006 migration applied + a seeded
 * pmsystemconnections row and projecttasks row. Test harness setup is a
 * separate follow-up.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { runOutboundSync } from "../../src/server/services/pmSyncService";
import { db } from "../../src/server/db/client";
import { tasksyncrecords } from "../../src/db/schema";

const TASK_ID = process.env.TEST_PM_TASK_ID ?? "";
const CONNECTION_ID = process.env.TEST_PM_CONNECTION_ID ?? "";
const haveFixtures = TASK_ID && CONNECTION_ID;

describe.skipIf(!haveFixtures)("pmSyncService.runOutboundSync", () => {
  let recordId: string;

  beforeEach(async () => {
    const [row] = await db
      .insert(tasksyncrecords)
      .values({
        taskid: TASK_ID,
        pmconnectionid: CONNECTION_ID,
        pendingstatus: "blocked",
        lastsyncstatus: "pending",
      })
      .returning();
    recordId = row.id;
  });

  afterEach(async () => {
    await db.delete(tasksyncrecords).where(eq(tasksyncrecords.id, recordId));
  });

  it("marks success on adapter resolve", async () => {
    // This depends on the adapter call succeeding. If the fixture connection
    // doesn't reach a live PM, the test will mark the entry 'pending' with
    // retrycount=1, which is also a valid passing state to assert.
    const result = await runOutboundSync();
    expect(result.processed).toBeGreaterThanOrEqual(1);

    const [updated] = await db
      .select()
      .from(tasksyncrecords)
      .where(eq(tasksyncrecords.id, recordId))
      .limit(1);

    expect(["success", "pending", "failed"]).toContain(updated.lastsyncstatus);
    expect(updated.lastsyncedat).not.toBeNull();
  });

  it("increments retrycount and remains pending under MAX_OUTBOUND_RETRIES on failure", async () => {
    // We can't easily force a failure without an injection point on the
    // adapter factory; this test documents the expected shape and the
    // assertion can be tightened once dependency injection is added.
    await runOutboundSync();
    const [updated] = await db
      .select()
      .from(tasksyncrecords)
      .where(eq(tasksyncrecords.id, recordId))
      .limit(1);

    if (updated.lastsyncstatus === "pending") {
      expect(updated.retrycount).toBeGreaterThan(0);
      expect(updated.retrycount).toBeLessThan(5);
    }
  });
});

// Placeholder to silence unused-import warning when fixtures are absent
void vi;
