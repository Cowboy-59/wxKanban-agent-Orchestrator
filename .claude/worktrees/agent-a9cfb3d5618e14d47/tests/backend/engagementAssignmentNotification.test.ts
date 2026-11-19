/**
 * SPEC-037 Amendment A — FR-023 / FR-031 notification body.
 *
 * A whole-project grant carries null scopeid AND null taskid. Before this fix the
 * summary fell through to the task branch and rendered "+ task null" once per
 * project, so the bulk-add mail named nothing — FR-031 requires it to list the
 * projects. The db and mail are stubbed; nothing reaches the database or Mailgun.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  results: new Map<unknown, unknown[]>(),
  sent: [] as Array<{ to: string; subject: string; html: string; text: string }>,
}));

vi.mock("../../src/server/db/client.js", () => {
  const select = () => ({
    from: (table: unknown) => ({
      where: (_where: unknown) => {
        const rows = (): unknown[] => h.results.get(table) ?? [];
        const p = Promise.resolve().then(rows);
        return Object.assign(p, { limit: async () => rows() });
      },
    }),
  });
  return { db: { select } };
});

vi.mock("../../src/server/lib/email.js", () => ({
  sendEmail: vi.fn(async (to: string, subject: string, html: string, text: string) => {
    h.sent.push({ to, subject, html, text });
  }),
}));

const { notifyAssignmentsModified } = await import(
  "../../src/server/services/EngagementNotifications.js"
);
const { engagements, companies, companyprojects, userprofiles } = await import(
  "../../src/db/schema/index.js"
);

function seed(): void {
  h.results.set(engagements, [{ clientcompanyid: "client-1" }]);
  h.results.set(companies, [{ name: "Wxperts LLC" }]);
  h.results.set(companyprojects, [
    { id: "p1", name: "Blue Cube" },
    { id: "p2", name: "wxAI" },
  ]);
  h.results.set(userprofiles, [{ emailaddr: "admin@has.example" }]);
}

describe("notifyAssignmentsModified — assignment labels", () => {
  beforeEach(() => {
    h.results.clear();
    h.sent.length = 0;
    seed();
  });

  it("names each project for whole-project grants, never 'task null' (FR-031)", async () => {
    await notifyAssignmentsModified({
      engagementId: "e1",
      consultingCompanyId: "cc1",
      added: [
        { scopeid: null, taskid: null, projectid: "p1" },
        { scopeid: null, taskid: null, projectid: "p2" },
      ],
      removed: [],
      actorUserId: "u1",
    });

    expect(h.sent).toHaveLength(1);
    const { text, html } = h.sent[0];
    expect(text).toContain("+ project Blue Cube");
    expect(text).toContain("+ project wxAI");
    expect(text).not.toContain("task null");
    expect(text).not.toContain("null");
    expect(html).toContain("+ project Blue Cube");
  });

  it("still labels scope- and task-level grants unchanged (FR-006)", async () => {
    await notifyAssignmentsModified({
      engagementId: "e1",
      consultingCompanyId: "cc1",
      added: [{ scopeid: "s9", taskid: null, projectid: "p1" }],
      removed: [{ scopeid: null, taskid: "t7", projectid: "p2" }],
      actorUserId: "u1",
    });

    const { text } = h.sent[0];
    expect(text).toContain("+ scope s9");
    expect(text).toContain("− task t7");
  });

  it("falls back to the project id when the project row is missing", async () => {
    h.results.set(companyprojects, []);
    await notifyAssignmentsModified({
      engagementId: "e1",
      consultingCompanyId: "cc1",
      added: [{ scopeid: null, taskid: null, projectid: "p-unknown" }],
      removed: [],
      actorUserId: "u1",
    });

    expect(h.sent[0].text).toContain("+ project p-unknown");
  });

  it("sends nothing when there is no change", async () => {
    await notifyAssignmentsModified({
      engagementId: "e1",
      consultingCompanyId: "cc1",
      added: [],
      removed: [],
      actorUserId: "u1",
    });

    expect(h.sent).toHaveLength(0);
  });
});
