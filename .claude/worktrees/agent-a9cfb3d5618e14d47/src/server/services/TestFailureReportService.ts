import { db } from "~/db/client.js";
import { feedbacksubmissions } from "~/db/schema/feedbacksubmissions.js";
import { createLogger } from "~/server/lib/logger.js";
import type { TestPlanItem } from "~/db/schema/testplanitems.js";
import type { TestItemDetail } from "~/db/schema/testplanitems.js";

const logger = createLogger("test-failure-report-service");

// [SCOPE 111 / T022] BEGIN — A failed test files into the EXISTING bug queue
//
// FR-025. Reuses the SCOPE-063 pipeline (feedbacksubmissions) with its current
// statuses, notes and AI-suggested-fix behaviour rather than adding a second
// bug path. The tester who found the problem is the person holding the detail,
// and this is the moment they have it — so the report carries the steps, the
// expected result and what actually happened, not just a status.
export class TestFailureReportService {
  static async fileFromFailedTest(input: {
    item: TestPlanItem;
    projectid: string;
    companyid: string | null;
    userid: string;
    actualResult: string;
    cycleVersion: string | null;
  }): Promise<string> {
    const detail = (input.item.detail ?? {}) as TestItemDetail;

    const expected = (detail.steps ?? [])
      .map((s) => `${s.step}. ${s.action} → EXPECTED: ${s.expected}`)
      .join("\n");

    const [row] = await db
      .insert(feedbacksubmissions)
      .values({
        projectid: input.projectid,
        userid: input.userid,
        companyid: input.companyid,
        type: "bug",
        title: `Test failed: ${input.item.itemkey} — ${input.item.title}`.slice(0, 255),
        details: {
          testitemid: input.item.id,
          testitemkey: input.item.itemkey,
          requirementid: input.item.requirementid,
          specref: input.item.specref,
          fenceref: input.item.fenceref,
          preconditions: detail.preconditions ?? [],
          steps: detail.steps ?? [],
          postconditions: detail.postconditions ?? [],
          expectedSummary: expected,
          actualResult: input.actualResult,
        },
        context: {
          source: "user-test",
          version: input.cycleVersion,
          gate: input.item.gate,
        },
        source: "manual",
        status: "new",
      })
      .returning({ id: feedbacksubmissions.id });

    logger.info(
      { itemid: input.item.id, itemkey: input.item.itemkey, bugreportid: row.id },
      "Bug report filed from failed test",
    );
    return row.id;
  }
}
// [SCOPE 111 / T022] END
