/**
 * E2E: AI session capture journey (Spec 020 FR-005).
 *
 * Drives the /api/consultant-hub/ai-session/* endpoints directly via
 * page.request — the wxAI runtime hooks are protocol-level (see
 * _wxAI/protocols/ai-session-protocol.md). This spec proves the server
 * surface behaves end-to-end.
 *
 * Pre-conditions:
 *  - TEST_CONSULTANT_EMAIL / TEST_CONSULTANT_PASSWORD env vars
 *  - TEST_PROJECT_ID, TEST_TASK_A, TEST_TASK_B env vars (UUIDs of fixtures)
 */

import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_CONSULTANT_EMAIL ?? "consultant@example.com";
const PASSWORD = process.env.TEST_CONSULTANT_PASSWORD ?? "TestPass123!";
const PROJECT_ID = process.env.TEST_PROJECT_ID ?? "";
const TASK_A = process.env.TEST_TASK_A ?? "";
const TASK_B = process.env.TEST_TASK_B ?? "";
const SPEC_ID = "020-consultant-e2e";

test.skip(!PROJECT_ID || !TASK_A || !TASK_B, "Test fixtures not configured");

test.describe("AI session capture — server protocol", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', EMAIL);
    await page.fill('[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);
  });

  test("start -> task -> overhead -> task -> close", async ({ page }) => {
    // 1. Start
    const startRes = await page.request.post("/api/consultant-hub/ai-session/start", {
      data: { specid: SPEC_ID, projectid: PROJECT_ID },
    });
    expect(startRes.ok()).toBeTruthy();
    const startBody = await startRes.json();
    const sessionid = startBody.session.id as string;
    expect(startBody.session.status).toBe("active");

    // 2. Idempotent start
    const startAgain = await page.request.post("/api/consultant-hub/ai-session/start", {
      data: { specid: SPEC_ID, projectid: PROJECT_ID },
    });
    const startAgainBody = await startAgain.json();
    expect(startAgainBody.session.id).toBe(sessionid);

    // 3. Switch to task A
    const switchA = await page.request.post(
      `/api/consultant-hub/ai-session/${sessionid}/task-switch`,
      { data: { taskid: TASK_A } },
    );
    expect(switchA.ok()).toBeTruthy();

    // 4. Overhead minutes
    const oh = await page.request.post(
      `/api/consultant-hub/ai-session/${sessionid}/overhead`,
      { data: { minutes: 4 } },
    );
    expect(oh.ok()).toBeTruthy();
    const ohBody = await oh.json();
    expect(ohBody.session.overheadduration).toBe(4);

    // 5. Switch to task B
    const switchB = await page.request.post(
      `/api/consultant-hub/ai-session/${sessionid}/task-switch`,
      { data: { taskid: TASK_B } },
    );
    expect(switchB.ok()).toBeTruthy();

    // 6. Close with summaries
    const close = await page.request.post(
      `/api/consultant-hub/ai-session/${sessionid}/close`,
      {
        data: {
          taskSummaries: {
            [TASK_A]: "Drafted schema changes",
            [TASK_B]: "Wired up the route",
          },
          sessionSummary: "Implementation pass on spec 020 fixtures",
        },
      },
    );
    expect(close.ok()).toBeTruthy();
    const closeBody = await close.json();
    expect(closeBody.session.status).toBe("completed");
    expect(closeBody.session.summary).toContain("Implementation pass");
    expect(closeBody.session.taskcount).toBe(2);

    // 7. Detail endpoint reflects per-task entries
    const detail = await page.request.get(
      `/api/consultant-hub/ai-session/${sessionid}`,
    );
    const detailBody = await detail.json();
    expect(detailBody.entries.length).toBeGreaterThanOrEqual(2);
    const taskAEntry = detailBody.entries.find(
      (e: { taskid: string }) => e.taskid === TASK_A,
    );
    expect(taskAEntry?.completionnotesummary).toBe("Drafted schema changes");
  });
});
