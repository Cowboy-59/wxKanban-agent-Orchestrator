/**
 * SPEC-146 / T004 (FR-006) — extractTasksFromDocument replaces a document's tasks instead of
 * appending, and refuses a parse that finds none. The db is an in-memory stand-in for one
 * document and its complianceaudittasks rows; nothing reaches a database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  doc: { id: "doc-1", framework: "SOC2", filecontent: "" } as Record<string, unknown>,
  tasks: [] as Array<{ id: string; documentid: string }>,
  failInsert: false,
  next: 0,
}));

vi.mock("../../src/db/client.js", async () => {
  const { complianceaudittasks } = await import("../../src/db/schema/complianceaudittasks.js");
  const run = (target: typeof h.tasks) => ({
    delete: (table: unknown) => ({
      where: () => ({
        returning: async () => {
          if (table !== complianceaudittasks) return [];
          const removed = target.filter((t) => t.documentid === h.doc.id);
          target.splice(0, target.length, ...target.filter((t) => t.documentid !== h.doc.id));
          return removed.map((t) => ({ id: t.id }));
        },
      }),
    }),
    insert: () => ({
      values: async (rows: Array<{ documentid: string }>) => {
        if (h.failInsert) throw new Error("insert failed");
        for (const r of rows) target.push({ id: `t-${h.next++}`, documentid: r.documentid });
      },
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  });
  return {
    db: {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [h.doc] }) }) }),
      // A transaction works on a copy and commits only when the callback resolves.
      transaction: async <T>(fn: (tx: ReturnType<typeof run>) => Promise<T>): Promise<T> => {
        const copy = h.tasks.map((t) => ({ ...t }));
        const result = await fn(run(copy));
        h.tasks.splice(0, h.tasks.length, ...copy);
        return result;
      },
    },
  };
});

import { extractTasksFromDocument, NoTasksExtractedError } from "../../src/server/services/AuditTaskService.js";

// [SCOPE 146 / T004] BEGIN — replace-on-extract and the empty-parse refusal
const THREE = "- [ ] Access control with MFA\n- [ ] Encrypt data at rest with AES\n- [x] Audit log every change\n";

beforeEach(() => {
  h.doc = { id: "doc-1", framework: "SOC2", filecontent: THREE };
  h.tasks = [{ id: "other", documentid: "doc-2" }];
  h.failInsert = false;
});

describe("extractTasksFromDocument (FR-006)", () => {
  it("a first extract adds the parsed tasks and removes none", async () => {
    expect(await extractTasksFromDocument("doc-1")).toEqual({ tasksRemoved: 0, tasksExtracted: 3 });
    expect(h.tasks.filter((t) => t.documentid === "doc-1")).toHaveLength(3);
  });

  it("extracting twice leaves the same count as once", async () => {
    await extractTasksFromDocument("doc-1");
    expect(await extractTasksFromDocument("doc-1")).toEqual({ tasksRemoved: 3, tasksExtracted: 3 });
    expect(h.tasks.filter((t) => t.documentid === "doc-1")).toHaveLength(3);
  });

  it("another document's tasks are never touched", async () => {
    await extractTasksFromDocument("doc-1");
    await extractTasksFromDocument("doc-1");
    expect(h.tasks.filter((t) => t.documentid === "doc-2")).toEqual([{ id: "other", documentid: "doc-2" }]);
  });

  it("a parse that finds no tasks is refused and leaves the existing set", async () => {
    await extractTasksFromDocument("doc-1");
    const before = h.tasks.map((t) => t.id);
    h.doc = { ...h.doc, filecontent: "# Heading only, no checklist items\n" };
    await expect(extractTasksFromDocument("doc-1")).rejects.toBeInstanceOf(NoTasksExtractedError);
    expect(h.tasks.map((t) => t.id)).toEqual(before);
  });

  it("a failed insert rolls back the delete", async () => {
    await extractTasksFromDocument("doc-1");
    const before = h.tasks.map((t) => t.id);
    h.failInsert = true;
    await expect(extractTasksFromDocument("doc-1")).rejects.toThrow("insert failed");
    expect(h.tasks.map((t) => t.id)).toEqual(before);
  });
});
// [SCOPE 146 / T004] END
