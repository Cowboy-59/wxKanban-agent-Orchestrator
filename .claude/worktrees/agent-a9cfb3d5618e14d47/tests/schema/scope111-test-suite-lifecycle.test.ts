import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  testplans,
  testplanitems,
  testitemsubjects,
  testcycles,
  testruns,
  testrunresults,
  testsignoffs,
  testretests,
} from "../../src/db/schema/index.js";

// [SCOPE 111 / T010] BEGIN — Schema conformance for the Test Suite Lifecycle tables
//
// The shared naming rules are asserted by naming-conventions.test.ts. What this
// file protects is the set of structural decisions the scope actually rests on —
// the ones a well-meaning refactor could quietly undo without any test going red.

const TABLES = {
  testplans,
  testplanitems,
  testitemsubjects,
  testcycles,
  testruns,
  testrunresults,
  testsignoffs,
  testretests,
} as const;

describe("SCOPE-111 schema — naming", () => {
  it.each(Object.entries(TABLES))("%s uses a plural lowercase name with no underscores", (_key, table) => {
    const { name } = getTableConfig(table);
    expect(name).toMatch(/^[a-z0-9]+$/);
    expect(name).not.toContain("_");
  });

  it.each(Object.entries(TABLES))("%s columns are lowercase with no underscores", (_key, table) => {
    for (const column of getTableConfig(table).columns) {
      expect(column.name).toMatch(/^[a-z0-9]+$/);
    }
  });

  it.each(Object.entries(TABLES))("%s has a uuid primary key", (_key, table) => {
    const pk = getTableConfig(table).columns.find((c) => c.primary);
    expect(pk).toBeDefined();
    expect(pk?.name).toBe("id");
    expect(pk?.getSQLType()).toBe("uuid");
  });

  it("names foreign keys for the singular parent entity plus id", () => {
    // e.g. testplans -> testplanid, testcycles -> cycleid, testplanitems -> itemid.
    const expectations: Array<[string, string]> = [
      ["testplanitems", "testplanid"],
      ["testitemsubjects", "itemid"],
      ["testruns", "cycleid"],
      ["testrunresults", "runid"],
      ["testrunresults", "itemid"],
      ["testsignoffs", "cycleid"],
      ["testretests", "cycleid"],
    ];
    for (const [tableKey, column] of expectations) {
      const table = TABLES[tableKey as keyof typeof TABLES];
      const names = getTableConfig(table).columns.map((c) => c.name);
      expect(names).toContain(column);
    }
  });
});

describe("SCOPE-111 schema — the invariants the design rests on", () => {
  it("gives every item exactly one executor and one origin, and keeps them separate", () => {
    // Conflating "who runs it" with "who wrote it" would break the human set:
    // the AI authors most human items, so origin cannot stand in for executor.
    const names = getTableConfig(testplanitems).columns.map((c) => c.name);
    expect(names).toContain("executor");
    expect(names).toContain("origin");
  });

  it("makes the item force flag nullable so null can mean inherit", () => {
    // A non-null default here would destroy the distinction between "inherits the
    // scope's flag" and "was explicitly set to false", and an admin turning a
    // single item OFF under a forced scope would silently stop working.
    const forcetest = getTableConfig(testplanitems).columns.find((c) => c.name === "forcetest");
    expect(forcetest?.notNull).toBe(false);

    // The plan-level flag is the opposite: always present, defaulting to off.
    const planForce = getTableConfig(testplans).columns.find((c) => c.name === "forcetest");
    expect(planForce?.notNull).toBe(true);
  });

  it("carries the item executor on the signoff and constrains it against the item", () => {
    // This is what makes "a person cannot sign off a machine test" a database
    // rule rather than a service-layer convention. The composite foreign key ties
    // itemexecutor to the item's real executor; the check constraint fixes the
    // only two legal pairings.
    const config = getTableConfig(testsignoffs);
    expect(config.columns.map((c) => c.name)).toContain("itemexecutor");

    const composite = config.foreignKeys.find(
      (fk) => fk.reference().columns.length === 2,
    );
    expect(composite).toBeDefined();
    expect(composite?.reference().foreignColumns.map((c) => c.name).sort()).toEqual([
      "executor",
      "id",
    ]);

    expect(config.checks.map((c) => c.name)).toContain("chk_testsignoffs_executor_match");
  });

  it("keeps subjects as rows so an item can declare several", () => {
    // A single source column on the item would make a multi-screen flow item
    // impossible to analyse, and would leave a Retest mark unable to say which
    // part of the flow the change reached.
    const names = getTableConfig(testitemsubjects).columns.map((c) => c.name);
    expect(names).toContain("sourcepath");
    expect(names).toContain("itemid");
    expect(getTableConfig(testplanitems).columns.map((c) => c.name)).not.toContain("sourcepath");
  });

  it("scopes runs, results, signoffs and retests to a cycle", () => {
    // The reset semantics are a consequence of this key. Lose cycleid anywhere
    // and the corresponding reset silently stops happening.
    for (const table of [testruns, testrunresults, testsignoffs, testretests]) {
      expect(getTableConfig(table).columns.map((c) => c.name)).toContain("cycleid");
    }
  });

  it("gives a run a current item and a heartbeat", () => {
    // currentitemid is the whole live view; lastheartbeatat is the only way a
    // dead runner is distinguishable from a slow one.
    const names = getTableConfig(testruns).columns.map((c) => c.name);
    expect(names).toContain("currentitemid");
    expect(names).toContain("lastheartbeatat");
    expect(names).toContain("declareditemids");
  });

  it("lets a retest mark record why it was applied and how it was answered", () => {
    // A tester asked to repeat work is owed the reason; a dismissal has to be
    // distinguishable from a fresh signoff at the gate.
    const names = getTableConfig(testretests).columns.map((c) => c.name);
    for (const column of ["reason", "triggerpath", "reachedsubjectid", "chain", "resolution", "dismissreason"]) {
      expect(names).toContain(column);
    }
  });

  it("references the bug report from a result rather than owning it", () => {
    // The report must survive independently in the existing bug queue, so this
    // is a nullable reference and never a cascade-owned child.
    const bug = getTableConfig(testrunresults).columns.find((c) => c.name === "bugreportid");
    expect(bug).toBeDefined();
    expect(bug?.notNull).toBe(false);
  });

  it("retains the legacy testplans columns so existing callers keep working", () => {
    // The scope-delete cascade and the merge_scope raw-SQL reassignment both
    // reference this table; the extension is additive for that reason.
    const names = getTableConfig(testplans).columns.map((c) => c.name);
    expect(names).toContain("testcases");
    expect(names).toContain("results");
  });
});
// [SCOPE 111 / T010] END
