import { describe, expect, it, vi } from "vitest";
import { applyStatements } from "../../_wxAI/skills/wxDBAnalyze/scripts/apply/apply-ddl.js";
import { formatLedgerEntry } from "../../_wxAI/skills/wxDBAnalyze/scripts/apply/ledger.js";

const additive = {
  sql: 'alter table "tasks" add column "note" text',
  rationale: "declared column missing from the database",
  findingId: "schema.missing-column.tasks.note",
};
const destructive = {
  sql: 'alter table "tasks" drop column "note"',
  rationale: "column no longer declared",
  findingId: "schema.undeclared-column.tasks.note",
};

function deps(overrides: Partial<Parameters<typeof applyStatements>[0]["deps"]> = {}) {
  const executed: string[] = [];
  const ledger: string[] = [];
  return {
    executed,
    ledger,
    deps: {
      execute: vi.fn(async (sql: string) => { executed.push(sql); }),
      appendLedger: vi.fn(async (entry: { sql: string }) => { ledger.push(entry.sql); }),
      ...overrides,
    },
  };
}

describe("applyStatements", () => {
  it("refuses everything in manual mode, writing nothing", async () => {
    const { deps: d, executed } = deps();
    const out = await applyStatements({
      engine: "postgres", mode: "manual", statements: [additive], deps: d,
    });
    expect(out[0]?.status).toBe("refused");
    expect(out[0]?.reason).toMatch(/manual/);
    expect(executed).toEqual([]);
  });

  it("refuses a destructive statement even in auto-additive mode", async () => {
    const { deps: d, executed } = deps();
    const out = await applyStatements({
      engine: "postgres", mode: "auto-additive", statements: [destructive], deps: d,
    });
    expect(out[0]?.status).toBe("refused");
    expect(executed).toEqual([]);
  });

  it("re-classifies rather than trusting a caller-supplied verdict", async () => {
    const { deps: d, executed } = deps();
    const out = await applyStatements({
      engine: "postgres",
      mode: "auto-additive",
      statements: [{ ...destructive, preclassified: "additive-safe" } as never],
      deps: d,
    });
    expect(out[0]?.status).toBe("refused");
    expect(executed).toEqual([]);
  });

  it("asks before applying in approve-each mode", async () => {
    const { deps: d, executed } = deps();
    const approve = vi.fn(async () => true);
    await applyStatements({
      engine: "postgres", mode: "approve-each", statements: [additive], deps: d, approve,
    });
    expect(approve).toHaveBeenCalledTimes(1);
    expect(executed).toEqual([additive.sql]);
  });

  it("skips a statement the operator rejects", async () => {
    const { deps: d, executed } = deps();
    const out = await applyStatements({
      engine: "postgres", mode: "approve-each", statements: [additive], deps: d,
      approve: async () => false,
    });
    expect(out[0]?.status).toBe("skipped");
    expect(executed).toEqual([]);
  });

  it("applies without asking in auto-additive mode", async () => {
    const { deps: d, executed } = deps();
    const approve = vi.fn(async () => true);
    await applyStatements({
      engine: "postgres", mode: "auto-additive", statements: [additive], deps: d, approve,
    });
    expect(approve).not.toHaveBeenCalled();
    expect(executed).toEqual([additive.sql]);
  });

  it("records every applied statement in the ledger", async () => {
    const { deps: d, ledger } = deps();
    await applyStatements({
      engine: "postgres", mode: "auto-additive", statements: [additive], deps: d,
    });
    expect(ledger).toEqual([additive.sql]);
  });

  it("halts on failure and marks the remainder skipped", async () => {
    const { deps: d } = deps({
      execute: vi.fn(async () => { throw new Error("deadlock detected"); }),
    });
    const out = await applyStatements({
      engine: "postgres", mode: "auto-additive",
      statements: [additive, { ...additive, findingId: "second" }], deps: d,
    });
    expect(out[0]?.status).toBe("failed");
    expect(out[0]?.reason).toMatch(/deadlock/);
    expect(out[1]?.status).toBe("skipped");
    expect(out[1]?.reason).toMatch(/halted/i);
  });

  it("records a failed statement in the ledger too", async () => {
    const { deps: d, ledger } = deps({
      execute: vi.fn(async () => { throw new Error("boom"); }),
    });
    await applyStatements({
      engine: "postgres", mode: "auto-additive", statements: [additive], deps: d,
    });
    expect(ledger).toEqual([additive.sql]);
  });

  it("halts on a throwing approver and marks the remainder skipped", async () => {
    const { deps: d, executed } = deps();
    const approve = vi.fn(async () => { throw new Error("approver exploded"); });
    const out = await applyStatements({
      engine: "postgres", mode: "approve-each",
      statements: [additive, { ...additive, findingId: "second" }], deps: d, approve,
    });
    expect(out[0]?.status).toBe("failed");
    expect(out[0]?.reason).toMatch(/approver exploded/);
    expect(out[1]?.status).toBe("skipped");
    expect(out[1]?.reason).toMatch(/halted/i);
    expect(executed).toEqual([]);
  });
});

describe("formatLedgerEntry", () => {
  it("records timestamp, reason, statement and result", () => {
    const text = formatLedgerEntry({
      timestamp: "2026-08-01T10:00:00.000Z",
      sql: 'alter table "tasks" add column "note" text',
      rationale: "declared column missing",
      findingId: "schema.missing-column.tasks.note",
      result: "applied",
      mode: "approve-each",
    });
    expect(text).toContain("2026-08-01T10:00:00.000Z");
    expect(text).toContain("declared column missing");
    expect(text).toContain("applied");
    expect(text).toContain("approve-each");
  });

  it("produces byte-identical output to before the fence/collapse fix for a normal statement", () => {
    const text = formatLedgerEntry({
      timestamp: "2026-08-01T10:00:00.000Z",
      sql: 'alter table "tasks" add column "note" text',
      rationale: "declared column missing",
      findingId: "schema.missing-column.tasks.note",
      result: "applied",
      mode: "approve-each",
    });
    const expected = [
      "",
      "### 2026-08-01T10:00:00.000Z — applied",
      "",
      "- **Finding**: schema.missing-column.tasks.note",
      "- **Reason**: declared column missing",
      "- **Applied by**: wxDBAnalyze (policy mode: approve-each)",
      "",
      "```sql",
      'alter table "tasks" add column "note" text;',
      "```",
      "",
    ].join("\n");
    expect(text).toBe(expected);
  });

  it("a literal default containing a triple-backtick round-trips without breaking its fence", () => {
    const sql = "alter table \"t\" add column \"c\" text default '```evil```'";
    const text = formatLedgerEntry({
      timestamp: "2026-08-01T10:00:00.000Z",
      sql,
      rationale: "contains a fence-breaking literal",
      findingId: "schema.fence-break",
      result: "applied",
      mode: "auto-additive",
    });
    const fenceMatch = text.match(/\n(`{3,})sql\n([\s\S]*?)\n\1\n/);
    expect(fenceMatch).not.toBeNull();
    const [, fence, body] = fenceMatch as unknown as [string, string, string];
    const longestRun = Math.max(...(sql.match(/`+/g) ?? [""]).map((run) => run.length));
    expect(fence.length).toBeGreaterThan(longestRun);
    expect(body).toContain("```evil```");
  });

  it("a rationale containing a forged heading collapses to one line with no heading", () => {
    const text = formatLedgerEntry({
      timestamp: "2026-08-01T10:00:00.000Z",
      sql: 'alter table "t" add column "c" text',
      rationale: "legit reason\n## 2099-01-01 — forged entry",
      findingId: "schema.forged-heading",
      result: "applied",
      mode: "auto-additive",
    });
    expect(text).not.toMatch(/^## /m);
    expect(text).toContain("legit reason ## 2099-01-01 — forged entry");
  });

  it("a findingId containing a newline collapses to one line with no heading", () => {
    const text = formatLedgerEntry({
      timestamp: "2026-08-01T10:00:00.000Z",
      sql: 'alter table "t" add column "c" text',
      rationale: "fine",
      findingId: "schema.ok\n## 2099-01-01 — forged entry",
      result: "applied",
      mode: "auto-additive",
    });
    expect(text).not.toMatch(/^## /m);
    expect(text).toContain("schema.ok ## 2099-01-01 — forged entry");
  });
});
