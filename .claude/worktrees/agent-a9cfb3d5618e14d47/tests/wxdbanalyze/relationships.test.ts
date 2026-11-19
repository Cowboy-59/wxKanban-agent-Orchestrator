import { describe, expect, it } from "vitest";
import {
  inferRelationships,
  resolveParentTable,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/dimensions/relationships.js";

const tables = new Set(["projects", "users", "companies", "tasks", "boxes"]);

describe("resolveParentTable", () => {
  it.each([
    ["projectid", "projects"],
    ["userid", "users"],
    ["companyid", "companies"],
    ["boxid", "boxes"],
  ])("resolves %s to %s", (column, expected) => {
    expect(resolveParentTable(column, tables, "lowercase-concat")).toBe(expected);
  });

  it("returns undefined when no plausible parent exists", () => {
    expect(resolveParentTable("externalid", tables, "lowercase-concat")).toBeUndefined();
  });

  it("ignores a column that does not match the pattern", () => {
    expect(resolveParentTable("name", tables, "lowercase-concat")).toBeUndefined();
  });

  it("never resolves a table to itself via its own id column", () => {
    expect(resolveParentTable("id", tables, "lowercase-concat")).toBeUndefined();
  });

  it("handles snake_case and PascalCase patterns", () => {
    expect(resolveParentTable("project_id", tables, "snake_case")).toBe("projects");
    expect(resolveParentTable("ProjectId", tables, "pascal-case")).toBe("projects");
  });

  // Code review Finding 4 (Task 8, round 1): stemFor strips any trailing "id"
  // with no word-boundary awareness, so a real, non-FK column like
  // "totalpaid" (see src/db/schema/companyStatus.ts totalPaid) stems exactly
  // like a genuine FK column would ("totalpa"). This is a documented
  // limitation, not a bug: it produces no relationship here only because no
  // table named "totalpas"/"totalpa"/"totalpaes" exists in this table set.
  // A coincidental name collision against a real table would invent one.
  it("stems a non-FK column ending in \"id\" (e.g. totalpaid) but resolves nothing when no matching table exists", () => {
    expect(resolveParentTable("totalpaid", tables, "lowercase-concat")).toBeUndefined();
  });
});

function schemas(opts: {
  declaredFk?: boolean;
  liveFk?: boolean;
  conventionColumn?: boolean;
}) {
  const declaredTasks = {
    name: "tasks",
    sources: ["app"],
    columns: opts.conventionColumn === false
      ? [{ name: "id", sqlType: "uuid", notNull: true, hasDefault: true, isPrimaryKey: true }]
      : [
          { name: "id", sqlType: "uuid", notNull: true, hasDefault: true, isPrimaryKey: true },
          { name: "projectid", sqlType: "uuid", notNull: false, hasDefault: false, isPrimaryKey: false },
        ],
    foreignKeys: opts.declaredFk
      ? [{ columns: ["projectid"], foreignTable: "projects", foreignColumns: ["id"], onDelete: "cascade", onUpdate: undefined }]
      : [],
    indexes: [],
  };
  const liveTasks = {
    name: "tasks",
    columns: declaredTasks.columns.map((c) => ({ ...c })),
    foreignKeys: opts.liveFk
      ? [{ name: "tasks_projectid_fkey", columns: ["projectid"], foreignTable: "projects", foreignColumns: ["id"], onDelete: "cascade", onUpdate: "no action" }]
      : [],
    indexes: [],
  };
  const projects = { name: "projects", columns: [{ name: "id", sqlType: "uuid", notNull: true, hasDefault: true, isPrimaryKey: true }], foreignKeys: [], indexes: [] };
  return {
    declared: { tables: new Map([["tasks", declaredTasks], ["projects", { ...projects, sources: ["app"] }]]), conflicts: [] },
    live: { tables: new Map([["tasks", liveTasks], ["projects", projects]]) },
  };
}

describe("inferRelationships", () => {
  it("marks a relationship asserted by all three available sources", () => {
    const { declared, live } = schemas({ declaredFk: true, liveFk: true });
    const { relationships } = inferRelationships({ declared: declared as never, live: live as never });
    const rel = relationships[0]!;
    expect(rel.sources.sort()).toEqual(["convention", "declared", "live"]);
  });

  it("infers a relationship from naming alone when nothing declares it", () => {
    const { declared, live } = schemas({});
    const { relationships } = inferRelationships({ declared: declared as never, live: live as never });
    const rel = relationships[0]!;
    expect(rel.sources).toEqual(["convention"]);
    expect(rel.parent).toBe("projects");
    expect(rel.constraintName).toBeUndefined();
  });

  it("captures the child column's nullability, type and index state", () => {
    const { declared, live } = schemas({});
    const { relationships } = inferRelationships({ declared: declared as never, live: live as never });
    const rel = relationships[0]!;
    expect(rel.childColumnNullable).toBe(true);
    expect(rel.childColumnType).toBe("uuid");
    expect(rel.parentColumnType).toBe("uuid");
    expect(rel.indexedOnChild).toBe(false);
  });

  it("merges a data-model edge into the same relationship", () => {
    const { declared, live } = schemas({});
    const { relationships } = inferRelationships({
      declared: declared as never,
      live: live as never,
      dataModel: [{ child: "tasks", childColumn: "projectid", parent: "projects", parentColumn: "id" }],
    });
    const rel = relationships[0]!;
    expect(rel.sources.sort()).toEqual(["convention", "datamodel"]);
  });

  it("produces one relationship per child column, not one per source", () => {
    const { declared, live } = schemas({ declaredFk: true, liveFk: true });
    const { relationships } = inferRelationships({ declared: declared as never, live: live as never });
    expect(relationships).toHaveLength(1);
  });

  // Code review Finding 1 (Critical): composite foreign keys were being
  // silently truncated to their first column. Modeled on the real
  // src/db/schema/testsignoffs.ts fk_testsignoffs_item_executor constraint,
  // which pairs (itemid, itemexecutor) -> testplanitems(id, executor).
  it("captures a composite foreign key's full column arrays and marks it composite", () => {
    const declaredParent = {
      name: "testplanitems",
      sources: ["app"],
      columns: [
        { name: "id", sqlType: "uuid", notNull: true, hasDefault: true, isPrimaryKey: true },
        { name: "executor", sqlType: "text", notNull: true, hasDefault: false, isPrimaryKey: false },
      ],
      foreignKeys: [],
      indexes: [],
    };
    const declaredChild = {
      name: "testsignoffs",
      sources: ["app"],
      columns: [
        { name: "id", sqlType: "uuid", notNull: true, hasDefault: true, isPrimaryKey: true },
        { name: "itemid", sqlType: "uuid", notNull: true, hasDefault: false, isPrimaryKey: false },
        { name: "itemexecutor", sqlType: "text", notNull: true, hasDefault: false, isPrimaryKey: false },
      ],
      foreignKeys: [
        {
          columns: ["itemid", "itemexecutor"],
          foreignTable: "testplanitems",
          foreignColumns: ["id", "executor"],
          onDelete: "cascade",
          onUpdate: undefined,
        },
      ],
      indexes: [],
    };
    const declared = {
      tables: new Map([["testsignoffs", declaredChild], ["testplanitems", declaredParent]]),
      conflicts: [],
    };
    const live = {
      tables: new Map([
        ["testsignoffs", { ...declaredChild, foreignKeys: [] }],
        ["testplanitems", declaredParent],
      ]),
    };
    const { relationships } = inferRelationships({ declared: declared as never, live: live as never });
    const rel = relationships.find((r) => r.child === "testsignoffs")!;
    expect(rel.childColumns).toEqual(["itemid", "itemexecutor"]);
    expect(rel.parentColumns).toEqual(["id", "executor"]);
    expect(rel.isComposite).toBe(true);
    expect(rel.childColumn).toBe("itemid");
    expect(rel.parentColumn).toBe("id");
  });

  it("marks a single-column foreign key as not composite with one-element arrays", () => {
    const { declared, live } = schemas({ declaredFk: true, liveFk: true });
    const { relationships } = inferRelationships({ declared: declared as never, live: live as never });
    const rel = relationships[0]!;
    expect(rel.childColumns).toEqual(["projectid"]);
    expect(rel.parentColumns).toEqual(["id"]);
    expect(rel.isComposite).toBe(false);
  });

  // Code review Finding 2 (Critical): a convention match that resolves to a
  // real table with no primary key must be recorded in `skipped`, not
  // silently dropped.
  it("records a skipped convention resolution when the resolved parent has no primary key", () => {
    const child = {
      name: "tasks",
      columns: [
        { name: "id", sqlType: "uuid", notNull: true, hasDefault: true, isPrimaryKey: true },
        { name: "boxid", sqlType: "uuid", notNull: false, hasDefault: false, isPrimaryKey: false },
      ],
      foreignKeys: [],
      indexes: [],
    };
    const boxesNoPk = {
      name: "boxes",
      columns: [{ name: "label", sqlType: "text", notNull: true, hasDefault: false, isPrimaryKey: false }],
      foreignKeys: [],
      indexes: [],
    };
    const declared = { tables: new Map([["tasks", { ...child, sources: ["app"] }]]), conflicts: [] };
    const live = { tables: new Map([["tasks", child], ["boxes", boxesNoPk]]) };
    const { relationships, skipped } = inferRelationships({ declared: declared as never, live: live as never });
    expect(relationships).toHaveLength(0);
    expect(skipped).toEqual([
      { child: "tasks", childColumn: "boxid", parent: "boxes", reason: 'resolved parent table "boxes" has no primary key' },
    ]);
  });

  // Bonus coverage for the previously-untested self-reference guard (flagged
  // as a deferred minor in the Task 8 review): now that skips are recorded
  // rather than silently dropped, the guard's own exclusion becomes visible
  // too. No behaviour change — only the recording is new.
  it("records a skipped convention resolution when the resolved parent equals the child (self-reference guard)", () => {
    const boxes = {
      name: "boxes",
      columns: [
        { name: "id", sqlType: "uuid", notNull: true, hasDefault: true, isPrimaryKey: true },
        { name: "boxid", sqlType: "uuid", notNull: false, hasDefault: false, isPrimaryKey: false },
      ],
      foreignKeys: [],
      indexes: [],
    };
    const declared = { tables: new Map([["boxes", { ...boxes, sources: ["app"] }]]), conflicts: [] };
    const live = { tables: new Map([["boxes", boxes]]) };
    const { relationships, skipped } = inferRelationships({ declared: declared as never, live: live as never });
    expect(relationships).toHaveLength(0);
    expect(skipped).toEqual([
      {
        child: "boxes",
        childColumn: "boxid",
        parent: "boxes",
        reason: "resolved parent is the same table as the child (self-reference guarded)",
      },
    ]);
  });

  // Code review Finding 3 (Important): the live catalog's enforced ON DELETE
  // must win over a disagreeing declared value — the tool reports what the
  // database actually does, not what the code merely intends. The declared
  // value must still be visible via declaredOnDelete so a caller can report
  // the mismatch itself.
  it("prefers the live ON DELETE over a disagreeing declared value, while keeping the declared value visible", () => {
    const { declared, live } = schemas({ declaredFk: true, liveFk: true });
    // schemas() declares onDelete "cascade" on both sides; override live to
    // disagree with the declared "cascade" intent.
    const liveTasks = live.tables.get("tasks")!;
    liveTasks.foreignKeys = [
      {
        name: "tasks_projectid_fkey",
        columns: ["projectid"],
        foreignTable: "projects",
        foreignColumns: ["id"],
        onDelete: "no action",
        onUpdate: "no action",
      },
    ];
    const { relationships } = inferRelationships({ declared: declared as never, live: live as never });
    const rel = relationships[0]!;
    expect(rel.onDelete).toBe("no action");
    expect(rel.declaredOnDelete).toBe("cascade");
  });
});
