/**
 * AISpecSessionService unit tests (Spec 020 FR-005).
 *
 * NOTE: Requires a test database with the 0006 migration applied. Test
 * harness (vitest root config + DB setup/teardown) is a separate follow-up.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import { AISpecSessionService } from "../../src/server/services/AISpecSessionService";
import { db } from "../../src/server/db/client";
import {
  aispecsessions,
  projecttasks,
  projecttimeentries,
} from "../../src/db/schema";

// Fixture identifiers — populate from your test seed
const SPEC_ID = "020-consultant-test";
const USER_ID = process.env.TEST_USER_ID ?? "";
const PROJECT_ID = process.env.TEST_PROJECT_ID ?? "";
const COMPANY_ID = process.env.TEST_COMPANY_ID ?? "";
const TASK_A = process.env.TEST_TASK_A ?? "";
const TASK_B = process.env.TEST_TASK_B ?? "";

const haveFixtures = USER_ID && PROJECT_ID && COMPANY_ID && TASK_A && TASK_B;

describe.skipIf(!haveFixtures)("AISpecSessionService", () => {
  let sessionid: string;

  beforeEach(async () => {
    const session = await AISpecSessionService.startSession({
      specid: SPEC_ID,
      projectid: PROJECT_ID,
      userid: USER_ID,
      companyid: COMPANY_ID,
    });
    sessionid = session.id;
  });

  afterEach(async () => {
    await db
      .delete(projecttimeentries)
      .where(eq(projecttimeentries.aispecsessionid, sessionid));
    await db.delete(aispecsessions).where(eq(aispecsessions.id, sessionid));
  });

  it("startSession is idempotent for the same (specid, userid)", async () => {
    const second = await AISpecSessionService.startSession({
      specid: SPEC_ID,
      projectid: PROJECT_ID,
      userid: USER_ID,
      companyid: COMPANY_ID,
    });
    expect(second.id).toBe(sessionid);
  });

  it("switchTask opens a new entry and closes the prior open one", async () => {
    await AISpecSessionService.switchTask({
      sessionid,
      taskid: TASK_A,
      userid: USER_ID,
    });
    // Simulate elapsed work
    await new Promise((r) => setTimeout(r, 50));
    await AISpecSessionService.switchTask({
      sessionid,
      taskid: TASK_B,
      userid: USER_ID,
    });

    const entries = await db
      .select()
      .from(projecttimeentries)
      .where(eq(projecttimeentries.aispecsessionid, sessionid));

    expect(entries).toHaveLength(2);
    const taskAEntry = entries.find((e) => e.taskid === TASK_A);
    const taskBEntry = entries.find((e) => e.taskid === TASK_B);
    expect(taskAEntry?.endtime).not.toBeNull();
    expect(taskBEntry?.endtime).toBeNull();
    expect(taskAEntry?.source).toBe("ai");
    expect(taskBEntry?.source).toBe("ai");
  });

  it("addOverhead accumulates non-task minutes", async () => {
    await AISpecSessionService.addOverhead({ sessionid, minutes: 7 });
    await AISpecSessionService.addOverhead({ sessionid, minutes: 3 });
    const session = await AISpecSessionService.getSession(sessionid);
    expect(session?.overheadduration).toBe(10);
  });

  it("closeSession persists summaries and computes totalduration", async () => {
    await AISpecSessionService.switchTask({
      sessionid,
      taskid: TASK_A,
      userid: USER_ID,
    });
    await new Promise((r) => setTimeout(r, 60_000)); // 1 minute
    await AISpecSessionService.addOverhead({ sessionid, minutes: 5 });
    const closed = await AISpecSessionService.closeSession({
      sessionid,
      userid: USER_ID,
      taskSummaries: { [TASK_A]: "Refactored auth service" },
      sessionSummary: "Test session rollup",
    });
    expect(closed.status).toBe("completed");
    expect(closed.summary).toBe("Test session rollup");
    expect(closed.totalduration).toBeGreaterThanOrEqual(5);

    const entry = await db
      .select()
      .from(projecttimeentries)
      .where(
        and(
          eq(projecttimeentries.aispecsessionid, sessionid),
          eq(projecttimeentries.taskid, TASK_A),
        ),
      )
      .limit(1);
    expect(entry[0]?.completionnotesummary).toBe("Refactored auth service");
  }, 90_000);

  it("runAutoClose closes a session when all linked spec tasks are completed", async () => {
    // Open work for TASK_A
    await AISpecSessionService.switchTask({
      sessionid,
      taskid: TASK_A,
      userid: USER_ID,
    });

    // Mark both fixture tasks completed (simulating spec done)
    await db
      .update(projecttasks)
      .set({ status: "completed" })
      .where(eq(projecttasks.id, TASK_A));
    await db
      .update(projecttasks)
      .set({ status: "completed" })
      .where(eq(projecttasks.id, TASK_B));

    const result = await AISpecSessionService.runAutoClose();
    expect(result.closed).toBeGreaterThanOrEqual(1);

    const session = await AISpecSessionService.getSession(sessionid);
    expect(session?.status).toBe("completed");
  });
});
