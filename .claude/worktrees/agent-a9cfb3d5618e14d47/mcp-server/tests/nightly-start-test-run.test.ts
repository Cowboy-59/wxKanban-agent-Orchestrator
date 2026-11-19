import { describe, it, expect } from "vitest";
import { handleTestLifecycleTool } from "../src/tools/test-lifecycle.js";
import { testcycles, testitemsubjects, testplanitems, testruns } from "../src/db/schema-tests.js";
import type { ScopedDb } from "../src/db/scoped-query.js";

// [SCOPE 140 / T003] BEGIN — start_test_run: subjects for selection, dryRun lists without writing
//
// A nightly run must see each item's code (subjects) to select by impact, and must be able to ask
// for that list without opening a run or a test cycle. A fake database serves rows per table and
// records every write.

const PROJECT = "00000000-0000-7000-8000-000000000001";
type Row = Record<string, unknown>;

function fakeDb(rows: Map<unknown, Row[]>) {
  const writes: Array<{ op: string; table: unknown; values?: unknown }> = [];
  const query = (table: unknown) => {
    const q = {
      where: () => q,
      limit: () => q,
      orderBy: () => q,
      then: (resolve: (v: Row[]) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(rows.get(table) ?? []).then(resolve, reject),
    };
    return q;
  };
  const write = (op: string) => (table: unknown) => ({
    values: (values: unknown) => {
      writes.push({ op, table, values });
      return Object.assign(Promise.resolve([]), { returning: () => Promise.resolve([{ id: "new-run", version: "1.0.0", commitSha: null, ...(values as Row) }]) });
    },
    set: (values: unknown) => {
      writes.push({ op, table, values });
      return { where: () => Promise.resolve([]) };
    },
    where: () => {
      writes.push({ op, table });
      return Promise.resolve([]);
    },
  });
  const raw = { select: () => ({ from: (table: unknown) => query(table) }), insert: write("insert"), update: write("update"), delete: write("delete") };
  return { scoped: { raw, scope: { authMode: "token", projectId: PROJECT, userId: null } } as unknown as ScopedDb, writes };
}

const tables = () =>
  new Map<unknown, Row[]>([
    [testplanitems, [
      { id: "i1", itemKey: "TC-1", title: "Create", requirementId: "FR-001", gate: "crud", riskTier: "HIGH", priority: "P1", automationRef: "tests/e2e/create.spec.ts" },
      { id: "i2", itemKey: "TC-2", title: "Edit", requirementId: "FR-002", gate: "crud", riskTier: "LOW", priority: "P3", automationRef: null },
    ]],
    [testitemsubjects, [{ itemId: "i1", sourcePath: "src/a.ts" }, { itemId: "i1", sourcePath: "src/b.ts" }, { itemId: "i2", sourcePath: "src/c.ts" }]],
    [testcycles, [{ id: "c1", version: "1.0.0", commitSha: null, status: "open" }]],
  ]);

const parse = (r: { content: Array<{ text: string }> }) => JSON.parse(r.content[0].text) as Record<string, unknown>;

describe("SCOPE-140 T003 — start_test_run for a nightly selection", () => {
  it("dryRun lists every machine item with its subjects and risk tier, and writes nothing", async () => {
    const { scoped, writes } = fakeDb(tables());
    const out = parse((await handleTestLifecycleTool("project.start_test_run", { projectId: PROJECT, version: "1.0.0", isRegression: true, dryRun: true }, scoped)) as never);
    expect(out.dryRun).toBe(true);
    expect(out.items).toEqual([
      expect.objectContaining({ itemKey: "TC-1", riskTier: "HIGH", automationRef: "tests/e2e/create.spec.ts", subjects: [{ sourcePath: "src/a.ts" }, { sourcePath: "src/b.ts" }] }),
      expect.objectContaining({ itemKey: "TC-2", riskTier: "LOW", automationRef: null, subjects: [{ sourcePath: "src/c.ts" }] }),
    ]);
    expect(writes).toEqual([]);
  });

  it("a real run still opens one run, and returns the items with their subjects", async () => {
    const { scoped, writes } = fakeDb(tables());
    const out = parse((await handleTestLifecycleTool("project.start_test_run", { projectId: PROJECT, version: "1.0.0", isRegression: true, runnerType: "ci", environment: "uat" }, scoped)) as never);
    expect(out.runId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect((out.items as Array<{ subjects: unknown[] }>)[0].subjects).toHaveLength(2);
    const runs = writes.filter((w) => w.table === testruns);
    expect(runs).toHaveLength(1);
    expect(runs[0].values).toMatchObject({ runnerType: "ci", environment: "uat" });
  });
});
// [SCOPE 140 / T003] END
