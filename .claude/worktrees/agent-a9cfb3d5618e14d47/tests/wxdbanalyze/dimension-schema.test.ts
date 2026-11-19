// tests/wxdbanalyze/dimension-schema.test.ts
import { describe, expect, it } from "vitest";
import { analyzeSchema } from "../../_wxAI/skills/wxDBAnalyze/scripts/dimensions/schema.js";
import { validateFinding } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/finding.js";
import type { DeclaredSchema } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/declared.js";
import type { LiveSchema } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/schema.js";

const col = (name: string, over: Partial<{ sqlType: string; notNull: boolean; hasDefault: boolean; isPrimaryKey: boolean }> = {}) => ({
  name,
  sqlType: "uuid",
  notNull: false,
  hasDefault: false,
  isPrimaryKey: false,
  ...over,
});

function declared(tables: Record<string, string[]>, conflicts: DeclaredSchema["conflicts"] = []): DeclaredSchema {
  return {
    conflicts,
    tables: new Map(
      Object.entries(tables).map(([name, cols]) => [
        name,
        { name, sources: ["app"], columns: cols.map((c) => col(c)), foreignKeys: [], indexes: [] },
      ]),
    ),
  };
}

function live(tables: Record<string, string[]>): LiveSchema {
  return {
    tables: new Map(
      Object.entries(tables).map(([name, cols]) => [
        name,
        { name, columns: cols.map((c) => col(c)), foreignKeys: [], indexes: [] },
      ]),
    ),
  };
}

const ids = (f: ReturnType<typeof analyzeSchema>) => f.map((x) => x.id).sort();

describe("analyzeSchema", () => {
  it("every finding it produces satisfies the contract", () => {
    const findings = analyzeSchema(
      declared({ tasks: ["id", "projectid"], gone: ["id"] }, [
        { table: "tasks", sources: ["app", "mcp"], difference: "columns only in app: projectid", direction: "subset" },
      ]),
      live({ tasks: ["id"], extra: ["id"] }),
    );
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(validateFinding(f)).toEqual([]);
  });

  it("reports a declared table absent from the database", () => {
    const findings = analyzeSchema(declared({ gone: ["id"] }), live({}));
    expect(ids(findings)).toContain("schema.missing-table.gone");
    const f = findings.find((x) => x.id === "schema.missing-table.gone")!;
    expect(f.severity).toBe("critical");
    expect(f.whyItNeedsChanging).toMatch(/42P01/);
  });

  it("reports a declared column absent from a live table as critical", () => {
    const findings = analyzeSchema(
      declared({ tasks: ["id", "projectid"] }),
      live({ tasks: ["id"] }),
    );
    const f = findings.find((x) => x.id === "schema.missing-column.tasks.projectid")!;
    expect(f.severity).toBe("critical");
    expect(f.whyItNeedsChanging).toMatch(/42703/);
    expect(f.whyItNeedsChanging).toMatch(/partial select/i);
    expect(f.remediation.fixClass).toBe("additive-safe");
    // This column is nullable, so the risk text should not claim leftover
    // backfill/SET NOT NULL work.
    expect(f.fixRisk).not.toMatch(/backfill/i);
  });

  it("flags the remaining backfill/SET NOT NULL work for a missing NOT NULL column", () => {
    const d = declared({ tasks: [] });
    d.tables.get("tasks")!.columns = [col("name", { notNull: true })];
    const l = live({ tasks: [] });
    const f = analyzeSchema(d, l).find((x) => x.id === "schema.missing-column.tasks.name")!;
    expect(f.remediation.fixClass).toBe("additive-safe");
    expect(f.fixRisk).toMatch(/nullable/i);
    expect(f.fixRisk).toMatch(/backfill/i);
    expect(f.fixRisk).toMatch(/SET NOT NULL/i);
  });

  it("reports a live table nothing declares, and warns about push", () => {
    const findings = analyzeSchema(declared({}), live({ marketingcontacts: ["id"] }));
    const f = findings.find((x) => x.id === "schema.undeclared-table.marketingcontacts")!;
    expect(f.remediation.fixClass).toBe("manual-only");
    expect(f.doingNothing).toMatch(/drizzle-kit push/i);
  });

  it("reports a type mismatch with both types named", () => {
    const d = declared({ tasks: ["id"] });
    d.tables.get("tasks")!.columns = [col("id", { sqlType: "uuid" })];
    const l = live({ tasks: [] });
    l.tables.get("tasks")!.columns = [col("id", { sqlType: "text" })];
    const f = analyzeSchema(d, l).find((x) => x.id === "schema.type-mismatch.tasks.id")!;
    expect(f.observation).toContain("uuid");
    expect(f.observation).toContain("text");
  });

  it("does NOT report a type mismatch when Drizzle shorthand and Postgres canonical spelling are the same type", () => {
    // Regression for the round-2 false-positive defect: declared "timestamp"
    // (Drizzle's getSQLType() shorthand) against live "timestamp without
    // time zone" (pg_catalog.format_type()'s canonical spelling) is the same
    // Postgres type, not drift.
    const d = declared({ tasks: ["id"] });
    d.tables.get("tasks")!.columns = [col("createdat", { sqlType: "timestamp" })];
    const l = live({ tasks: ["id"] });
    l.tables.get("tasks")!.columns = [col("createdat", { sqlType: "timestamp without time zone" })];
    expect(analyzeSchema(d, l)).toEqual([]);
  });

  it("still reports a real type mismatch that happens to share a base spelling", () => {
    // Same shape as the false-positive regression above, but the base types
    // genuinely differ (timezone-naive vs timezone-aware), so this must stay
    // a finding — proves the alias table doesn't over-collapse.
    const d = declared({ tasks: ["id"] });
    d.tables.get("tasks")!.columns = [col("createdat", { sqlType: "timestamp" })];
    const l = live({ tasks: ["id"] });
    l.tables.get("tasks")!.columns = [col("createdat", { sqlType: "timestamp with time zone" })];
    const f = analyzeSchema(d, l).find((x) => x.id === "schema.type-mismatch.tasks.createdat")!;
    expect(f).toBeDefined();
    expect(validateFinding(f)).toEqual([]);
  });

  it("reports a nullability mismatch where code assumes NOT NULL", () => {
    const d = declared({ tasks: [] });
    d.tables.get("tasks")!.columns = [col("name", { notNull: true })];
    const l = live({ tasks: [] });
    l.tables.get("tasks")!.columns = [col("name", { notNull: false })];
    const f = analyzeSchema(d, l).find((x) => x.id === "schema.nullability-mismatch.tasks.name")!;
    expect(f.confidence).toBe("proven");
  });

  it("reports an undeclared NOT NULL column with no default as blocking inserts", () => {
    const d = declared({ tasks: ["id"] });
    const l = live({ tasks: ["id"] });
    l.tables.get("tasks")!.columns.push(col("legacycol", { notNull: true, hasDefault: false }));
    const f = analyzeSchema(d, l).find((x) => x.id === "schema.undeclared-column.tasks.legacycol")!;
    expect(f.severity).toBe("critical");
    expect(f.urgency).toBe("immediate");
    expect(f.whyItNeedsChanging).toMatch(/23502/);
    expect(validateFinding(f)).toEqual([]);
  });

  it("reports an undeclared nullable column as stranded but non-blocking", () => {
    const d = declared({ tasks: ["id"] });
    const l = live({ tasks: ["id"] });
    l.tables.get("tasks")!.columns.push(col("note", { notNull: false }));
    const f = analyzeSchema(d, l).find((x) => x.id === "schema.undeclared-column.tasks.note")!;
    expect(f.severity).toBe("medium");
    expect(f.urgency).toBe("deferred");
    expect(validateFinding(f)).toEqual([]);
  });

  it("every rule class produces a contract-complete finding", () => {
    const d: DeclaredSchema = {
      conflicts: [
        { table: "tasks", sources: ["app", "mcp"], difference: "columns only in app: projectid", direction: "subset" },
      ],
      tables: new Map([
        ["gone", { name: "gone", sources: ["app"], columns: [col("id")], foreignKeys: [], indexes: [] }],
        [
          "tasks",
          {
            name: "tasks",
            sources: ["app"],
            columns: [
              col("id", { sqlType: "uuid" }),
              col("projectid"),
              col("name", { notNull: true }),
            ],
            foreignKeys: [],
            indexes: [],
          },
        ],
      ]),
    };
    const l: LiveSchema = {
      tables: new Map([
        [
          "tasks",
          {
            name: "tasks",
            columns: [
              col("id", { sqlType: "text" }),
              col("name", { notNull: false }),
              col("legacycol", { notNull: true, hasDefault: false }),
              col("note", { notNull: false }),
            ],
            foreignKeys: [],
            indexes: [],
          },
        ],
        ["marketingcontacts", { name: "marketingcontacts", columns: [col("id")], foreignKeys: [], indexes: [] }],
      ]),
    };

    const findings = analyzeSchema(d, l);
    const rules = new Set(findings.map((f) => f.rule));
    expect(rules).toEqual(
      new Set([
        "source-conflict",
        "missing-table",
        "undeclared-table",
        "missing-column",
        "undeclared-column",
        "type-mismatch",
        "nullability-mismatch",
      ]),
    );
    expect(findings.length).toBeGreaterThanOrEqual(7);
    for (const f of findings) expect(validateFinding(f)).toEqual([]);
  });

  it("reports disagreement between declaration sources", () => {
    const findings = analyzeSchema(
      declared({ tasks: ["id"] }, [
        { table: "tasks", sources: ["app", "mcp"], difference: "columns only in app: projectid", direction: "subset" },
      ]),
      live({ tasks: ["id"] }),
    );
    expect(ids(findings)).toContain("schema.source-conflict.tasks");
  });

  it("returns nothing when declared and live agree", () => {
    expect(analyzeSchema(declared({ tasks: ["id"] }), live({ tasks: ["id"] }))).toEqual([]);
  });

  // --- Phase 1 punch list P3b — `sourceConflict`'s divergent branch must
  // cover a shared-column type/nullability disagreement, not only "each
  // source holds a column the other lacks". `describeDifference` (SCOPE-121
  // final wave I5) already classifies this shape as `direction: "divergent"`
  // (pinned separately in declared.test.ts); this test pins that the finding
  // built from such a conflict, at the dimension layer, treats it with the
  // same weight as a name-only divergence — a defect, not a confirmable
  // narrowing — rather than the stale name-only prose the fixed doc comment
  // used to describe.
  it("treats a shared-column type disagreement classified divergent as a defect, same as a name-only divergence", () => {
    const findings = analyzeSchema(
      declared({ tasks: ["id"] }, [
        {
          table: "tasks",
          sources: ["app", "mcp"],
          difference: "type mismatch on: id (app: uuid vs mcp: text)",
          direction: "divergent",
        },
      ]),
      live({ tasks: ["id"] }),
    );
    const f = findings.find((x) => x.id === "schema.source-conflict.tasks")!;
    expect(f).toBeDefined();
    expect(f.severity).toBe("high");
    expect(f.urgency).toBe("scheduled");
    expect(f.whyItNeedsChanging).toMatch(/different type or nullability/i);
    expect(validateFinding(f)).toEqual([]);
  });
});
