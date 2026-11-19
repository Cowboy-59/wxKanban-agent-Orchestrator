import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Regression tests for the reference parser in
 * `_wxAI/skills/wxCreateTestPlan/scripts/schema-analyze.mjs`.
 *
 * The analyzer reads Drizzle schema files as TEXT, so every rule it enforces
 * rests on a regex. Six separate parsing defects were found in it at once, and
 * each of them was invisible in exactly the same way: the audit still produced a
 * confident report and a referential-integrity score, just about the wrong
 * schema. The original run scored this repository 5.0/10 on the strength of 47
 * "missing onDelete" findings, every single one of which was false.
 *
 * A silently wrong audit is worse than no audit, because it gets acted on. These
 * tests pin each defect to a fixture so a future regex change has to break a
 * test rather than a score.
 */

const SCRIPT = resolve(
  process.cwd(),
  "_wxAI/skills/wxCreateTestPlan/scripts/schema-analyze.mjs",
);

interface Finding {
  table: string;
  line: number;
  issue: string;
  fix?: string;
}
interface Report {
  referentialIntegrity: {
    score: number;
    components: { unenforcedFk: number; fkNoOnDelete: number; fkNoIndex: number };
  };
  findings: {
    referentialIntegrity: Finding[];
    fieldMapping: Finding[];
    missingIndexes: Finding[];
    excessiveIndexes: Finding[];
  };
  orphanDataSql: Array<{ child: string; column: string; sql: string }>;
}

let report: Report;
let tmp: string;

// A single fixture schema carrying one instance of each defect class.
const FIXTURE = `
import { pgTable, uuid, varchar, timestamp, index, uniqueIndex, foreignKey, type AnyPgColumn } from "drizzle-orm/pg-core";

export const parents = pgTable("parents", {
  id: uuid("id").primaryKey(),
  executor: varchar("executor", { length: 10 }).notNull(),
  createdat: timestamp("createdat").defaultNow().notNull(),
  updatedat: timestamp("updatedat").defaultNow().notNull(),
}, (table) => ({
  idExecutor: uniqueIndex("idx_parents_id_executor").on(table.id, table.executor),
}));

export const children = pgTable("children", {
  id: uuid("id").primaryKey(),

  // (1) onDelete value contains a space. \\w+ could not match it.
  setnullid: uuid("setnullid").references(() => parents.id, { onDelete: "set null" }),

  // (2) the callback sits on its own line after references(.
  multilineid: uuid("multilineid").references(
    () => parents.id,
    { onDelete: "set null" },
  ),

  // (3) self-reference carrying a return-type annotation.
  parentitemid: uuid("parentitemid").references((): AnyPgColumn => children.id, {
    onDelete: "cascade",
  }),

  // (4) a varchar named like an FK. It is a text key and can never reference a uuid PK.
  requirementid: varchar("requirementid", { length: 50 }),

  // (5) a DECLARED fk whose column name does not end in "id", with NO onDelete rule.
  overriddenby: uuid("overriddenby").notNull().references(() => parents.id),

  // (6) chain boundary: this column must NOT absorb the reference that follows it.
  commitsha: varchar("commitsha", { length: 100 }),
  trailingid: uuid("trailingid").references(() => parents.id, { onDelete: "cascade" }),

  createdat: timestamp("createdat").defaultNow().notNull(),
  updatedat: timestamp("updatedat").defaultNow().notNull(),
}, (table) => ({
  setnullIdx: index("idx_children_setnull").on(table.setnullid),
  multilineIdx: index("idx_children_multiline").on(table.multilineid),
  parentIdx: index("idx_children_parent").on(table.parentitemid),
  overriddenbyIdx: index("idx_children_overriddenby").on(table.overriddenby),
  trailingIdx: index("idx_children_trailing").on(table.trailingid),
}));

export const signoffs = pgTable("signoffs", {
  id: uuid("id").primaryKey(),
  itemid: uuid("itemid").notNull(),
  itemexecutor: varchar("itemexecutor", { length: 10 }).notNull(),
  createdat: timestamp("createdat").defaultNow().notNull(),
  updatedat: timestamp("updatedat").defaultNow().notNull(),
}, (table) => ({
  // (7) a composite FK — both members are enforced, as a tuple.
  itemFk: foreignKey({
    columns: [table.itemid, table.itemexecutor],
    foreignColumns: [parents.id, parents.executor],
    name: "fk_signoffs_item_executor",
  }).onDelete("cascade"),
  itemIdx: index("idx_signoffs_item").on(table.itemid),
}));

export const buried = pgTable("buried", {
  id: uuid("id").primaryKey(),
  leadcol: varchar("leadcol", { length: 20 }).notNull(),
  // (8) indexed only as the SECOND column of a composite, so not covered.
  buriedid: uuid("buriedid").references(() => parents.id, { onDelete: "cascade" }),
  createdat: timestamp("createdat").defaultNow().notNull(),
  updatedat: timestamp("updatedat").defaultNow().notNull(),
}, (table) => ({
  composite: index("idx_buried_lead_buried").on(table.leadcol, table.buriedid),
}));
`;

const issuesFor = (table: string, key: keyof Report["findings"] = "referentialIntegrity") =>
  report.findings[key].filter((f) => f.table === table).map((f) => f.issue);

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "schema-analyze-test-"));
  const schemaDir = join(tmp, "schema");
  mkdirSync(schemaDir, { recursive: true });
  writeFileSync(join(schemaDir, "fixture.ts"), FIXTURE, "utf8");
  const out = join(tmp, "out.json");

  execFileSync(process.execPath, [SCRIPT, "--root", schemaDir, "--out", out, "--quiet"], {
    cwd: process.cwd(),
    stdio: "pipe",
  });
  report = JSON.parse(readFileSync(out, "utf8")) as Report;
});

afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe("schema-analyze reference parser", () => {
  it("reads an onDelete value containing a space", () => {
    // The headline defect: `onDelete: "set null"` was captured with \w+, which
    // cannot match across the space, so the rule read as absent. "cascade"
    // matched fine — which is why only set-null FKs were ever flagged.
    expect(issuesFor("children").join("\n")).not.toMatch(/'setnullid'.*onDelete/);
    expect(report.referentialIntegrity.components.fkNoOnDelete).toBe(1);
  });

  it("recognises a reference whose callback is on the following line", () => {
    expect(issuesFor("children").join("\n")).not.toMatch(/'multilineid'/);
  });

  it("recognises a self-reference carrying a return-type annotation", () => {
    expect(issuesFor("children").join("\n")).not.toMatch(/'parentitemid'/);
  });

  it("does not score a varchar text key as a foreign key", () => {
    expect(issuesFor("children").join("\n")).not.toMatch(/'requirementid'/);
    // Still surfaced, but as advisory rather than against the score.
    expect(issuesFor("children", "fieldMapping").join("\n")).toMatch(
      /'requirementid'.*named like a foreign key but is varchar/,
    );
  });

  it("checks onDelete on a declared FK whose column is not named *id", () => {
    // Gating the onDelete check behind the FK-NAME heuristic hid real defects:
    // complianceoverride.overriddenby and dutyassignment.assignedby are both
    // notNull uuid FKs to userprofiles.id with no rule, so deleting a user fails.
    expect(issuesFor("children").join("\n")).toMatch(/'overriddenby'.*has no onDelete rule/);
  });

  it("bounds a column's chain so it cannot absorb the next column's reference", () => {
    // The window used to be a flat 400 chars from the column start, so a column
    // inherited a later column's reference and was reported as an FK to a table
    // it has nothing to do with ("FK 'commitsha' → userprofiles.id").
    const all = [
      ...report.findings.referentialIntegrity,
      ...report.findings.missingIndexes,
    ]
      .map((f) => f.issue)
      .join("\n");
    expect(all).not.toMatch(/commitsha/);
  });

  it("treats both members of a composite foreignKey as enforced", () => {
    const issues = issuesFor("signoffs").join("\n");
    expect(issues).not.toMatch(/'itemid'/);
    expect(issues).not.toMatch(/'itemexecutor'/);
  });

  it("does not demand a useless index on a composite FK member", () => {
    // An index on itemexecutor alone would hold two distinct values; the tuple is
    // already reachable via the index leading with itemid.
    expect(issuesFor("signoffs", "missingIndexes").join("\n")).not.toMatch(/itemexecutor/);
  });

  it("does not emit single-column orphan SQL for a composite FK", () => {
    // Pairing one member against the parent's first column yields valid SQL that
    // answers the wrong question.
    expect(report.orphanDataSql.filter((o) => o.column === "itemexecutor")).toHaveLength(0);
  });

  it("reports an FK indexed only as a non-leading composite column", () => {
    // Postgres can use the LEADING column of a composite for a single-column
    // lookup, but not one buried in second position — so this FK is uncovered.
    expect(issuesFor("buried", "missingIndexes").join("\n")).toMatch(
      /'buriedid' has no covering index/,
    );
  });

  it("still reports a genuinely unenforced uuid FK", () => {
    // The guard against over-correction: the fixes must not make everything pass.
    expect(report.referentialIntegrity.components.fkNoOnDelete).toBeGreaterThan(0);
    expect(report.findings.missingIndexes.length).toBeGreaterThan(0);
  });
});
