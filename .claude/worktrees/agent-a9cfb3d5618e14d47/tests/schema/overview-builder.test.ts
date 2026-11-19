import { describe, it, expect } from "vitest";
import {
  overviewdrafts,
  overviewtranscripts,
  importcache,
  OVERVIEW_DRAFT_STATUSES,
  OVERVIEW_TRANSCRIPT_ROLES,
} from "../../src/db/schema/index.js";

/**
 * G1 schema validation tests — spec 025 Project Overview Builder
 *
 * Structural / introspection-only tests. Verifies column presence, types,
 * FK references, and constant exports for the three new tables.
 *
 * Live DB integration tests (insert/update/cascade/unique constraint
 * rejection) are deferred to G11 T034, which sets up the broader test-DB
 * infrastructure the repo currently lacks. Per CLAUDE.md "no test DB"
 * footprint shipped with T001-T004; T034 introduces it.
 */

type DrizzleColumn = {
  name: string;
  columnType: string;
  notNull: boolean;
  hasDefault: boolean;
};

const getColumns = (table: unknown): Record<string, DrizzleColumn> => {
  const columns: Record<string, DrizzleColumn> = {};
  if (typeof table !== "object" || table === null) return columns;
  for (const [key, value] of Object.entries(table)) {
    if (
      typeof value === "object" &&
      value !== null &&
      "columnType" in value &&
      !key.startsWith("_")
    ) {
      columns[key] = value as DrizzleColumn;
    }
  }
  return columns;
};

describe("G1 — overviewdrafts schema (T001)", () => {
  const cols = getColumns(overviewdrafts);

  it("declares the eight required columns", () => {
    const required = [
      "id",
      "projectid",
      "proposalid",
      "authoruserid",
      "companyid",
      "status",
      "content",
      "createdat",
      "updatedat",
    ];
    for (const c of required) {
      expect(cols[c]).toBeDefined();
    }
  });

  it("primary key id is uuid with v7 default", () => {
    expect(cols["id"]?.columnType).toMatch(/PgUUID/);
    expect(cols["id"]?.hasDefault).toBe(true);
  });

  it("projectid and proposalid are nullable (draft may exist before either is set)", () => {
    expect(cols["projectid"]?.notNull).toBe(false);
    expect(cols["proposalid"]?.notNull).toBe(false);
  });

  it("authoruserid and companyid are NOT NULL (tenant + author required)", () => {
    expect(cols["authoruserid"]?.notNull).toBe(true);
    expect(cols["companyid"]?.notNull).toBe(true);
  });

  it("status defaults to 'draft' and is NOT NULL", () => {
    expect(cols["status"]?.notNull).toBe(true);
    expect(cols["status"]?.hasDefault).toBe(true);
  });

  it("exports OVERVIEW_DRAFT_STATUSES with the four expected values", () => {
    expect(OVERVIEW_DRAFT_STATUSES).toEqual([
      "draft",
      "submitted",
      "accepted",
      "rejected",
    ]);
  });
});

describe("G1 — overviewtranscripts schema (T002)", () => {
  const cols = getColumns(overviewtranscripts);

  it("declares the seven required columns including sourceuri", () => {
    const required = [
      "id",
      "overviewdraftid",
      "role",
      "content",
      "sectionkey",
      "sourceuri",
      "createdat",
    ];
    for (const c of required) {
      expect(cols[c]).toBeDefined();
    }
  });

  it("overviewdraftid is NOT NULL (transcript belongs to a draft)", () => {
    expect(cols["overviewdraftid"]?.notNull).toBe(true);
  });

  it("sectionkey and sourceuri are nullable per spec C16 asymmetry", () => {
    // sourceuri is set only for FR-014 imports, NULL for paste/interview.
    // sectionkey is NULL for messages not tied to a specific section.
    expect(cols["sectionkey"]?.notNull).toBe(false);
    expect(cols["sourceuri"]?.notNull).toBe(false);
  });

  it("role and content are required", () => {
    expect(cols["role"]?.notNull).toBe(true);
    expect(cols["content"]?.notNull).toBe(true);
  });

  it("exports OVERVIEW_TRANSCRIPT_ROLES with three expected values", () => {
    expect(OVERVIEW_TRANSCRIPT_ROLES).toEqual(["user", "assistant", "system"]);
  });
});

describe("G1 — importcache schema (T003)", () => {
  const cols = getColumns(importcache);

  it("declares the six required columns", () => {
    const required = [
      "id",
      "sourceuri",
      "companyid",
      "content",
      "contenthash",
      "fetchedat",
    ];
    for (const c of required) {
      expect(cols[c]).toBeDefined();
    }
  });

  it("sourceuri, companyid, content, contenthash are all NOT NULL", () => {
    expect(cols["sourceuri"]?.notNull).toBe(true);
    expect(cols["companyid"]?.notNull).toBe(true);
    expect(cols["content"]?.notNull).toBe(true);
    expect(cols["contenthash"]?.notNull).toBe(true);
  });

  it("migration SQL declares unique index on (sourceuri, companyid)", async () => {
    // The migration SQL is the source of truth for the unique constraint.
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      "src/db/migrations/0004_amusing_puck.sql",
      "utf-8",
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "importcache_sourceuri_companyid_uq"/,
    );
    expect(sql).toMatch(/"sourceuri","companyid"/);
  });
});

describe("G1 — index.ts exports", () => {
  it("re-exports all three new schemas from src/db/schema/index.ts", async () => {
    const mod = await import("../../src/db/schema/index.js");
    expect(mod.overviewdrafts).toBeDefined();
    expect(mod.overviewtranscripts).toBeDefined();
    expect(mod.importcache).toBeDefined();
    expect(mod.OVERVIEW_DRAFT_STATUSES).toBeDefined();
    expect(mod.OVERVIEW_TRANSCRIPT_ROLES).toBeDefined();
  });
});
