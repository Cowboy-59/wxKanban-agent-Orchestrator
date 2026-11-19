import { describe, expect, it } from "vitest";
import {
  COLUMNS_SQL,
  collectLiveSchema,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/schema.js";

function connFrom(responses: Record<string, Record<string, unknown>[]>) {
  const seen: string[] = [];
  return {
    seen,
    conn: {
      async query(sql: string) {
        seen.push(sql);
        const key = Object.keys(responses).find((k) => sql.includes(k));
        return key ? responses[key] : [];
      },
      async close() {},
    },
  };
}

describe("collectLiveSchema", () => {
  it("reads from pg_catalog, never information_schema", () => {
    expect(COLUMNS_SQL).toContain("pg_catalog");
    expect(COLUMNS_SQL).not.toContain("information_schema");
  });

  it("groups columns under their table", async () => {
    const { conn } = connFrom({
      // DEVIATION (SCOPE-121/T006, controller decision): the brief keys this
      // fixture "pg_attribute", but CONSTRAINTS_SQL and INDEXES_SQL both
      // legitimately join pg_catalog.pg_attribute too (to resolve column
      // names by ordinal), so connFrom's substring match on "pg_attribute"
      // also matches those queries and misroutes fixture rows to them.
      // "atttypmod" appears only in COLUMNS_SQL (format_type(a.atttypid,
      // a.atttypmod)), so it disambiguates correctly. Verified no other
      // production code changed.
      atttypmod: [
        {
          table_name: "tasks",
          column_name: "id",
          sql_type: "uuid",
          not_null: true,
          has_default: true,
          is_primary_key: true,
        },
        {
          table_name: "tasks",
          column_name: "projectid",
          sql_type: "uuid",
          not_null: false,
          has_default: false,
          is_primary_key: false,
        },
      ],
    });
    const live = await collectLiveSchema(conn);
    expect(live.tables.get("tasks")?.columns.map((c) => c.name)).toEqual([
      "id",
      "projectid",
    ]);
    expect(live.tables.get("tasks")?.columns[0]?.isPrimaryKey).toBe(true);
  });

  it("attaches foreign keys with their referential actions", async () => {
    const { conn } = connFrom({
      // Same deviation as above: "atttypmod" replaces "pg_attribute" so this
      // fixture only matches COLUMNS_SQL.
      atttypmod: [
        {
          table_name: "tasks",
          column_name: "projectid",
          sql_type: "uuid",
          not_null: false,
          has_default: false,
          is_primary_key: false,
        },
      ],
      // "confdeltype" replaces "contype": "contype" also appears in
      // COLUMNS_SQL's primary-key subquery (pc.contype = 'p'), so it would
      // misroute this fixture there too. "confdeltype" (case
      // con.confdeltype ...) appears only in CONSTRAINTS_SQL.
      confdeltype: [
        {
          constraint_name: "tasks_projectid_fkey",
          table_name: "tasks",
          columns: ["projectid"],
          foreign_table: "projects",
          foreign_columns: ["id"],
          on_delete: "cascade",
          on_update: "no action",
        },
      ],
    });
    const live = await collectLiveSchema(conn);
    expect(live.tables.get("tasks")?.foreignKeys).toEqual([
      {
        name: "tasks_projectid_fkey",
        columns: ["projectid"],
        foreignTable: "projects",
        foreignColumns: ["id"],
        onDelete: "cascade",
        onUpdate: "no action",
      },
    ]);
  });

  it("creates a table entry for an index on a table with no columns returned", async () => {
    const { conn } = connFrom({
      pg_index: [
        {
          table_name: "orphantable",
          index_name: "idx_x",
          columns: ["a"],
          is_unique: false,
        },
      ],
    });
    const live = await collectLiveSchema(conn);
    expect(live.tables.get("orphantable")?.indexes).toHaveLength(1);
  });

  // Fix round 1 (code review Finding 1, Critical): expression positions must
  // survive as a visible marker, not be dropped by the join.
  it("marks an expression position instead of dropping it, preserving length and order", async () => {
    const { conn } = connFrom({
      pg_index: [
        {
          table_name: "customer",
          index_name: "idx_customers_consultant_name_live",
          is_unique: false,
          predicate: null,
          has_expression: true,
          // real position first, expression position second — as Postgres
          // would return for index (consultantid, lower(name))
          columns: ["consultantid", "(expression)"],
        },
      ],
    });
    const live = await collectLiveSchema(conn);
    const index = live.tables.get("customer")?.indexes[0];
    expect(index?.columns).toEqual(["consultantid", "(expression)"]);
    expect(index?.columns).toHaveLength(2);
    expect(index?.hasExpression).toBe(true);
  });

  // Fix round 1: the WHERE predicate of a partial index must be captured.
  it("captures the predicate of a partial index", async () => {
    const { conn } = connFrom({
      pg_index: [
        {
          table_name: "customer",
          index_name: "idx_customers_consultant_name_live",
          is_unique: false,
          predicate: "(archivedat IS NULL)",
          has_expression: true,
          columns: ["consultantid", "(expression)"],
        },
      ],
    });
    const live = await collectLiveSchema(conn);
    expect(live.tables.get("customer")?.indexes[0]?.predicate).toBe(
      "(archivedat IS NULL)",
    );
  });

  // Fix round 1: the common case (no expression, no predicate) must be
  // unchanged by the fix — predicate is explicitly null, not just falsy/absent.
  it("reports predicate null and hasExpression false for an ordinary index", async () => {
    const { conn } = connFrom({
      pg_index: [
        {
          table_name: "tasks",
          index_name: "tasks_projectid_idx",
          is_unique: false,
          predicate: null,
          has_expression: false,
          columns: ["projectid"],
        },
      ],
    });
    const live = await collectLiveSchema(conn);
    const index = live.tables.get("tasks")?.indexes[0];
    expect(index?.columns).toEqual(["projectid"]);
    expect(index?.predicate).toBeNull();
    expect(index?.hasExpression).toBe(false);
  });
});
