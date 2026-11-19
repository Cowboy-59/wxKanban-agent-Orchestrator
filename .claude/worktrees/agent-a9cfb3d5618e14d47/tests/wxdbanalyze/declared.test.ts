import { describe, expect, it } from "vitest";
import {
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  uuid,
} from "drizzle-orm/pg-core";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  extractDeclaredSchema,
  loadSchemaModules,
  primeTableConfig,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/declared.js";

primeTableConfig(getTableConfig as never);

const projects = pgTable("projects", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
});

const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey(),
  projectid: uuid("projectid").references(() => projects.id, {
    onDelete: "cascade",
  }),
  createdat: timestamp("createdat").defaultNow().notNull(),
});

describe("extractDeclaredSchema", () => {
  it("extracts tables with their columns", () => {
    const schema = extractDeclaredSchema([
      { label: "app", module: { projects, tasks } },
    ]);
    expect([...schema.tables.keys()].sort()).toEqual(["projects", "tasks"]);
    expect(
      schema.tables.get("tasks")?.columns.map((c) => c.name).sort(),
    ).toEqual(["createdat", "id", "projectid"]);
  });

  it("records nullability, defaults and primary keys", () => {
    const schema = extractDeclaredSchema([
      { label: "app", module: { projects, tasks } },
    ]);
    const columns = schema.tables.get("tasks")!.columns;
    const byName = (n: string) => columns.find((c) => c.name === n)!;
    expect(byName("id").isPrimaryKey).toBe(true);
    expect(byName("projectid").notNull).toBe(false);
    expect(byName("createdat").hasDefault).toBe(true);
  });

  it("extracts foreign keys with their referential action", () => {
    const schema = extractDeclaredSchema([
      { label: "app", module: { projects, tasks } },
    ]);
    // Deviation from the brief: the installed drizzle-orm (^0.45.2) always
    // materializes an unspecified onUpdate/onDelete as the literal string
    // "no action" (see drizzle-orm/pg-core/foreign-keys.js), never
    // `undefined`. The brief's expected `onUpdate: undefined` does not match
    // this installed version's real behavior; `extractDeclaredSchema` passes
    // Drizzle's own value through unchanged (per its "read the metadata,
    // don't reinterpret it" design), so the test is corrected to match
    // observed reality rather than the implementation being made to lie.
    expect(schema.tables.get("tasks")?.foreignKeys).toEqual([
      {
        columns: ["projectid"],
        foreignTable: "projects",
        foreignColumns: ["id"],
        onDelete: "cascade",
        onUpdate: "no action",
      },
    ]);
  });

  it("ignores non-table exports without throwing", () => {
    const schema = extractDeclaredSchema([
      {
        label: "app",
        module: { projects, someHelper: () => 1, CONSTANT: "x", nothing: null },
      },
    ]);
    expect([...schema.tables.keys()]).toEqual(["projects"]);
  });

  it("reports a table declared in two sources with differing columns as a subset (mirror)", () => {
    const mcpTasks = pgTable("tasks", {
      id: uuid("id").primaryKey(),
      projectid: uuid("projectid"),
    });
    const schema = extractDeclaredSchema([
      { label: "app", module: { tasks } },
      { label: "mcp", module: { tasks: mcpTasks } },
    ]);
    expect(schema.conflicts).toEqual([
      {
        table: "tasks",
        sources: ["app", "mcp"],
        difference: "columns only in app: createdat",
        direction: "subset",
      },
    ]);
  });

  // [SCOPE 121 / T005] BEGIN — Divergent-direction conflict test
  it("reports a table where each source has columns the other lacks as divergent", () => {
    const appTasks = pgTable("tasks", {
      id: uuid("id").primaryKey(),
      projectid: uuid("projectid"),
    });
    const mcpTasks = pgTable("tasks", {
      id: uuid("id").primaryKey(),
      assignee: text("assignee"),
    });
    const schema = extractDeclaredSchema([
      { label: "app", module: { tasks: appTasks } },
      { label: "mcp", module: { tasks: mcpTasks } },
    ]);
    expect(schema.conflicts).toEqual([
      {
        table: "tasks",
        sources: ["app", "mcp"],
        difference:
          "columns only in app: projectid; columns only in mcp: assignee",
        direction: "divergent",
      },
    ]);
  });
  // [SCOPE 121 / T005] END

  // SCOPE-121 final wave, I5 [Important]: describeDifference used to compare
  // column NAMES only — two sources declaring the SAME column with a
  // different TYPE or NULLABILITY produced no conflict at all, and the
  // second declaration was silently discarded by the last-wins merge.
  describe("type and nullability disagreement on a shared column", () => {
    it("reports a type mismatch on a column both sources declare, as divergent", () => {
      const appWidgets = pgTable("widgets", {
        id: uuid("id").primaryKey(),
        code: uuid("code"),
      });
      const mcpWidgets = pgTable("widgets", {
        id: uuid("id").primaryKey(),
        code: text("code"),
      });
      const schema = extractDeclaredSchema([
        { label: "app", module: { widgets: appWidgets } },
        { label: "mcp", module: { widgets: mcpWidgets } },
      ]);
      expect(schema.conflicts).toHaveLength(1);
      const conflict = schema.conflicts[0]!;
      expect(conflict.direction).toBe("divergent");
      expect(conflict.difference).toMatch(/type mismatch/i);
      expect(conflict.difference).toContain("code");
      expect(conflict.difference).toContain("uuid");
      expect(conflict.difference).toContain("text");
    });

    it("reports a nullability mismatch on a column both sources declare, as divergent", () => {
      const appWidgets = pgTable("widgets", {
        id: uuid("id").primaryKey(),
        name: text("name").notNull(),
      });
      const mcpWidgets = pgTable("widgets", {
        id: uuid("id").primaryKey(),
        name: text("name"),
      });
      const schema = extractDeclaredSchema([
        { label: "app", module: { widgets: appWidgets } },
        { label: "mcp", module: { widgets: mcpWidgets } },
      ]);
      expect(schema.conflicts).toHaveLength(1);
      const conflict = schema.conflicts[0]!;
      expect(conflict.direction).toBe("divergent");
      expect(conflict.difference).toMatch(/nullability mismatch/i);
      expect(conflict.difference).toContain("not null");
      expect(conflict.difference).toContain("nullable");
    });

    it("does not report a mismatch for a column both sources declare identically", () => {
      const appWidgets = pgTable("widgets", {
        id: uuid("id").primaryKey(),
        name: text("name").notNull(),
      });
      const mcpWidgets = pgTable("widgets", {
        id: uuid("id").primaryKey(),
        name: text("name").notNull(),
      });
      const schema = extractDeclaredSchema([
        { label: "app", module: { widgets: appWidgets } },
        { label: "mcp", module: { widgets: mcpWidgets } },
      ]);
      expect(schema.conflicts).toEqual([]);
    });

    it("still reports a pure column-name subset as subset, unaffected by the new value comparison", () => {
      // Regression guard: the mirror-pattern test above (columns only in
      // app: createdat) must still resolve to "subset" now that value
      // comparison runs alongside the name comparison.
      const mcpTasks = pgTable("tasks", {
        id: uuid("id").primaryKey(),
        projectid: uuid("projectid"),
      });
      const schema = extractDeclaredSchema([
        { label: "app", module: { tasks } },
        { label: "mcp", module: { tasks: mcpTasks } },
      ]);
      expect(schema.conflicts[0]?.direction).toBe("subset");
    });
  });

  // Phase 1 punch list, P1: describeDifference's type comparison now goes
  // through core/pgtypes.ts's typesEquivalent instead of raw getSQLType()
  // string equality — the same defect class Task 7 fixed for declared-vs-live
  // (548 false positives from spelling, not drift), never applied to this
  // file's independent declared-vs-declared (app-vs-mcp) comparison. Provably
  // reachable: drizzle-orm itself emits "timestamp (3)" from a plain
  // timestamp({precision:3}) column and "timestamp(3)" from
  // timestamp({mode:"string",precision:3}) for the SAME logical type, and
  // "serial" vs "integer" differ the same way.
  describe("type comparison uses typesEquivalent, not raw string equality", () => {
    it("does not report a conflict for timestamp(3) spelled two different ways by drizzle", () => {
      const appWidgets = pgTable("widgets", {
        id: uuid("id").primaryKey(),
        ts: timestamp("ts", { precision: 3 }),
      });
      const mcpWidgets = pgTable("widgets", {
        id: uuid("id").primaryKey(),
        ts: timestamp("ts", { mode: "string", precision: 3 }),
      });
      // Pin the exact raw spellings this test depends on, so a future
      // drizzle-orm upgrade that changes them fails loudly here rather than
      // silently making this test vacuous.
      expect(appWidgets.ts.getSQLType()).toBe("timestamp (3)");
      expect(mcpWidgets.ts.getSQLType()).toBe("timestamp(3)");
      const schema = extractDeclaredSchema([
        { label: "app", module: { widgets: appWidgets } },
        { label: "mcp", module: { widgets: mcpWidgets } },
      ]);
      expect(schema.conflicts).toEqual([]);
    });

    it("does not report a conflict for serial vs its underlying integer type", () => {
      const appWidgets = pgTable("widgets", {
        id: uuid("id").primaryKey(),
        n: serial("n"),
      });
      const mcpWidgets = pgTable("widgets", {
        id: uuid("id").primaryKey(),
        // serial() implies NOT NULL; matched here so only the type spelling
        // (serial vs integer) is under test, not an incidental nullability
        // difference.
        n: integer("n").notNull(),
      });
      expect(appWidgets.n.getSQLType()).toBe("serial");
      expect(mcpWidgets.n.getSQLType()).toBe("integer");
      const schema = extractDeclaredSchema([
        { label: "app", module: { widgets: appWidgets } },
        { label: "mcp", module: { widgets: mcpWidgets } },
      ]);
      expect(schema.conflicts).toEqual([]);
    });

    it("still reports a conflict for varchar(20) vs varchar(50) — same base type, different length", () => {
      const appWidgets = pgTable("widgets", {
        id: uuid("id").primaryKey(),
        code: varchar("code", { length: 20 }),
      });
      const mcpWidgets = pgTable("widgets", {
        id: uuid("id").primaryKey(),
        code: varchar("code", { length: 50 }),
      });
      const schema = extractDeclaredSchema([
        { label: "app", module: { widgets: appWidgets } },
        { label: "mcp", module: { widgets: mcpWidgets } },
      ]);
      expect(schema.conflicts).toHaveLength(1);
      expect(schema.conflicts[0]?.difference).toMatch(/type mismatch/i);
    });

    it("still reports a conflict for timestamp vs timestamp with time zone", () => {
      const appWidgets = pgTable("widgets", {
        id: uuid("id").primaryKey(),
        ts: timestamp("ts"),
      });
      const mcpWidgets = pgTable("widgets", {
        id: uuid("id").primaryKey(),
        ts: timestamp("ts", { withTimezone: true }),
      });
      const schema = extractDeclaredSchema([
        { label: "app", module: { widgets: appWidgets } },
        { label: "mcp", module: { widgets: mcpWidgets } },
      ]);
      expect(schema.conflicts).toHaveLength(1);
      expect(schema.conflicts[0]?.difference).toMatch(/type mismatch/i);
    });

    it("still reports a conflict for numeric(10,2) vs bare numeric — precision dropped", () => {
      const appWidgets = pgTable("widgets", {
        id: uuid("id").primaryKey(),
        amount: numeric("amount", { precision: 10, scale: 2 }),
      });
      const mcpWidgets = pgTable("widgets", {
        id: uuid("id").primaryKey(),
        amount: numeric("amount"),
      });
      const schema = extractDeclaredSchema([
        { label: "app", module: { widgets: appWidgets } },
        { label: "mcp", module: { widgets: mcpWidgets } },
      ]);
      expect(schema.conflicts).toHaveLength(1);
      expect(schema.conflicts[0]?.difference).toMatch(/type mismatch/i);
    });

    it("still reports a conflict for uuid vs varchar — genuinely different types", () => {
      const appWidgets = pgTable("widgets", {
        id: uuid("id").primaryKey(),
        externalid: uuid("externalid"),
      });
      const mcpWidgets = pgTable("widgets", {
        id: uuid("id").primaryKey(),
        externalid: varchar("externalid", { length: 50 }),
      });
      const schema = extractDeclaredSchema([
        { label: "app", module: { widgets: appWidgets } },
        { label: "mcp", module: { widgets: mcpWidgets } },
      ]);
      expect(schema.conflicts).toHaveLength(1);
      expect(schema.conflicts[0]?.difference).toMatch(/type mismatch/i);
    });
  });

  it("does not report a conflict when both sources agree", () => {
    const schema = extractDeclaredSchema([
      { label: "app", module: { projects } },
      { label: "mcp", module: { projects } },
    ]);
    expect(schema.conflicts).toEqual([]);
  });

  // [SCOPE 121 / T005] BEGIN — Guard test for missing getTableConfig
  it("throws a clear, actionable error when no getTableConfig is available", () => {
    // Pass `null`, not `undefined` — a JS default parameter only kicks in for
    // an omitted or explicitly-`undefined` argument, and this test file's
    // module-level `primeTableConfig(...)` call above has already populated
    // the module cache the default parameter falls back to. `null` bypasses
    // the default and reaches the function unresolved, the way an unprimed
    // module would.
    expect(() =>
      extractDeclaredSchema(
        [{ label: "app", module: { projects } }],
        null as never,
      ),
    ).toThrow(/loadSchemaModules|primeTableConfig/);
  });
  // [SCOPE 121 / T005] END
});

// [SCOPE 121 / T005] BEGIN — loadSchemaModules unresolved-source tests
describe("loadSchemaModules", () => {
  it("reports a nonexistent path as unresolved instead of silently dropping it", async () => {
    const result = await loadSchemaModules([
      { label: "ghost", path: "tests/wxdbanalyze/fixtures/__does_not_exist__" },
    ]);
    expect(result.sources).toEqual([]);
    expect(result.unresolved).toEqual([
      {
        label: "ghost",
        path: "tests/wxdbanalyze/fixtures/__does_not_exist__",
        reason: "path does not exist",
      },
    ]);
  });

  it("reports a directory with no index.ts as unresolved instead of silently dropping it", async () => {
    const result = await loadSchemaModules([
      { label: "no-barrel", path: "tests/wxdbanalyze/fixtures/no-index" },
    ]);
    expect(result.sources).toEqual([]);
    expect(result.unresolved).toEqual([
      {
        label: "no-barrel",
        path: "tests/wxdbanalyze/fixtures/no-index",
        reason: "directory has no index.ts",
      },
    ]);
  });
});
// [SCOPE 121 / T005] END
