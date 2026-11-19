import { describe, it, expect } from "vitest";
import { handleTestLifecycleTool } from "../src/tools/test-lifecycle.js";
import { testcycles, testitemsubjects, testplanitems, testretests, testsignoffs } from "../src/db/schema-tests.js";
import type { ScopedDb } from "../src/db/scoped-query.js";

// [SCOPE 137 / T008] BEGIN — report_change_impact dryRun: same matching, no writes (FR-006)
//
// The sign-off question ("would this change undo a human sign-off?") is asked
// BEFORE a change lands, so asking must never withdraw anything. A fake database
// serves rows per table and records every write; the dry run must leave that
// record empty and must name exactly the items a real call would mark.

const PROJECT = "00000000-0000-7000-8000-000000000001";

type Row = Record<string, unknown>;

function fakeDb(rows: Map<unknown, Row[]>) {
  const writes: Array<{ op: string; table: unknown; values?: unknown }> = [];
  const query = (table: unknown) => {
    const result = () => Promise.resolve(rows.get(table) ?? []);
    const q = {
      where: () => q,
      limit: () => q,
      orderBy: () => q,
      then: (resolve: (v: Row[]) => unknown, reject?: (e: unknown) => unknown) => result().then(resolve, reject),
    };
    return q;
  };
  const write = (op: string) => (table: unknown) => ({
    values: (values: unknown) => {
      writes.push({ op, table, values });
      const done = { returning: () => Promise.resolve([{ id: "new", version: "1.0.0", commitSha: null, ...(values as Row) }]) };
      return Object.assign(Promise.resolve([]), done);
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
  const raw = {
    select: () => ({ from: (table: unknown) => query(table) }),
    insert: write("insert"),
    update: write("update"),
    delete: write("delete"),
  };
  const scoped = { raw, scope: { authMode: "token", projectId: PROJECT, userId: null } } as unknown as ScopedDb;
  return { scoped, writes };
}

const items = [
  { id: "i-checkout", itemKey: "UAT-001", title: "Checkout flow" },
  { id: "i-profile", itemKey: "UAT-002", title: "Profile edit" },
  { id: "i-report", itemKey: "UAT-003", title: "Monthly report" },
];
const subjects = [
  { id: "s1", itemId: "i-checkout", sourcePath: "src/client/Checkout.tsx" },
  { id: "s2", itemId: "i-profile", sourcePath: "src/client/Profile.tsx" },
  { id: "s3", itemId: "i-report", sourcePath: "src/client/Report.tsx" },
];
// Checkout and Report are reached; only Checkout carries a live human sign-off.
const graph = {
  commitsha: "abc123",
  changedFiles: ["src/server/cart.ts"],
  dependents: [
    { changedFile: "src/server/cart.ts", dependentPath: "src/client/Checkout.tsx", path: ["src/server/cart.ts", "src/client/Checkout.tsx"] },
    { changedFile: "src/server/cart.ts", dependentPath: "src/client/Report.tsx" },
  ],
};

function tables() {
  return new Map<unknown, Row[]>([
    [testplanitems, items],
    [testitemsubjects, subjects],
    [testsignoffs, [{ itemId: "i-checkout", signedByLabel: "andy", signedAt: "2026-10-01T00:00:00Z", signedAgainstVersion: "1.5.300" }]],
    [testcycles, [{ id: "c1", version: "1.0.0", commitSha: "abc123", status: "open" }]],
    [testretests, []],
  ]);
}

const parse = (r: { content: Array<{ text: string }> }) => JSON.parse(r.content[0].text) as Record<string, unknown>;

describe("SCOPE-137 T008 — report_change_impact dryRun (FR-006)", () => {
  it("returns the reached items that carry a live human sign-off, and writes nothing", async () => {
    const { scoped, writes } = fakeDb(tables());
    const out = parse(
      await handleTestLifecycleTool("project.report_change_impact", { projectId: PROJECT, version: "1.0.0", dryRun: true, graph }, scoped),
    );
    expect(writes).toEqual([]);
    expect(out.dryRun).toBe(true);
    expect(out.matched).toBe(2);
    const wouldUndo = out.wouldUndo as Array<Record<string, unknown>>;
    expect(wouldUndo.map((w) => w.itemKey)).toEqual(["UAT-001"]);
    expect(wouldUndo[0]).toMatchObject({
      title: "Checkout flow",
      reason: "impact",
      chain: "src/server/cart.ts → src/client/Checkout.tsx",
      signedBy: "andy",
    });
  });

  it("needs no commit: it is asked before the change is committed", async () => {
    const { scoped, writes } = fakeDb(tables());
    const out = parse(
      await handleTestLifecycleTool(
        "project.report_change_impact",
        { projectId: PROJECT, version: "1.0.0", dryRun: true, graph: { ...graph, commitsha: undefined } },
        scoped,
      ),
    );
    expect(out.blocked).toBeUndefined();
    expect(writes).toEqual([]);
  });

  it("still refuses a graph that claims nothing, so silence never reads as no sign-offs", async () => {
    const { scoped } = fakeDb(tables());
    const out = parse(
      await handleTestLifecycleTool("project.report_change_impact", { projectId: PROJECT, version: "1.0.0", dryRun: true, graph: { commitsha: "abc123", changedFiles: ["a.ts"] } }, scoped),
    );
    expect(out.blocked).toBe(true);
  });

  it("matches exactly the items a real call marks", async () => {
    const dry = fakeDb(tables());
    const preview = parse(
      await handleTestLifecycleTool("project.report_change_impact", { projectId: PROJECT, version: "1.0.0", dryRun: true, graph }, dry.scoped),
    );
    const real = fakeDb(tables());
    const applied = parse(
      await handleTestLifecycleTool("project.report_change_impact", { projectId: PROJECT, version: "1.0.0", graph }, real.scoped),
    );
    const markedIds = real.writes.filter((w) => w.table === testretests).map((w) => (w.values as Row).itemId);
    expect(markedIds).toEqual(["i-checkout", "i-report"]);
    expect(applied.marked).toBe(preview.matched);
  });
});
// [SCOPE 137 / T008] END
