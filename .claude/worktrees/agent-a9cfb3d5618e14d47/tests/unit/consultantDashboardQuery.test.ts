import { describe, it, expect } from "vitest";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { inArray, sql } from "drizzle-orm";
import { projecttasks } from "../../src/db/schema/projecttask.js";

// Regression guard for the 2026-08-01 consultant dashboard outage.
//
// `GET /api/consultant/dashboard` 500'd for every consultant who had at least
// one project. Two filters were written as:
//
//     sql`${projecttasks.projectid} = ANY(${projectids})`
//
// Drizzle interpolates a JS array into a `sql` template as a parenthesised list
// of bind params — `IN` syntax — so `ANY()` was handed a scalar (1 id) or a row
// constructor (2+ ids) and never an array. Postgres answered 22P02
// (`array_in`: "Array value must start with {") or 42809 respectively.
//
// The bug hid because the call site guards with `projectids.length ? ... : []`,
// so the only people who saw a working dashboard were those with no projects.
//
// QueryBuilder generates SQL with no driver and no env, so this runs in CI.
const qb = new QueryBuilder();

describe("consultant dashboard — project id filter", () => {
  it("inArray emits a real IN list, not ANY(scalar)", () => {
    for (const ids of [["a"], ["a", "b"], ["a", "b", "c"]]) {
      const { sql: text } = qb
        .select({ id: projecttasks.id })
        .from(projecttasks)
        .where(inArray(projecttasks.projectid, ids))
        .toSQL();

      expect(text).toContain(" in (");
      expect(text).not.toContain("ANY(");
    }
  });

  it("documents the broken form: ANY(array) degrades to a param list", () => {
    // Pinned so the day drizzle changes this behaviour, we find out here rather
    // than from a production 500.
    const one = qb
      .select({ id: projecttasks.id })
      .from(projecttasks)
      .where(sql`${projecttasks.projectid} = ANY(${["a"]})`)
      .toSQL();
    expect(one.sql).toContain("ANY(($1))"); // scalar -> 22P02

    const two = qb
      .select({ id: projecttasks.id })
      .from(projecttasks)
      .where(sql`${projecttasks.projectid} = ANY(${["a", "b"]})`)
      .toSQL();
    expect(two.sql).toContain("ANY(($1, $2))"); // row constructor -> 42809
  });

  it("no ANY(interpolated-array) remains in the dashboard route", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/server/routes/consultantDashboard.ts", "utf8");
    // Comment lines are excluded on purpose: the fix is documented in prose that
    // quotes the broken construct, and matching that would be matching the cure.
    const code = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");
    expect(code).not.toMatch(/ANY\(\$\{/);
  });
});
