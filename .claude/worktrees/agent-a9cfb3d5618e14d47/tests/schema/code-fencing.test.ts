import { describe, it, expect } from "vitest";
import {
  taskfences,
  taskfencemodifications,
  taskfencehistory,
  taskfenceslegacy,
  TASK_FENCE_UNIT_KINDS,
} from "../../src/db/schema/index.js";

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

describe("Spec 026 — taskfences schema (T001)", () => {
  const cols = getColumns(taskfences);

  it("declares all 13 required columns", () => {
    const required = [
      "id",
      "projectid",
      "filepath",
      "unitkind",
      "unitname",
      "ownerscope",
      "ownertask",
      "description",
      "contenthash",
      "linestart",
      "lineend",
      "createdat",
      "updatedat",
    ];
    for (const c of required) {
      expect(cols[c], `missing column ${c}`).toBeDefined();
    }
  });

  it("primary key id is uuid with v7 default", () => {
    expect(cols["id"]?.columnType).toMatch(/PgUUID/);
    expect(cols["id"]?.hasDefault).toBe(true);
  });

  it("projectid is uuid and NOT NULL (tenant scoping)", () => {
    expect(cols["projectid"]?.columnType).toMatch(/PgUUID/);
    expect(cols["projectid"]?.notNull).toBe(true);
  });

  it("ownership columns ownerscope/ownertask/description are NOT NULL", () => {
    expect(cols["ownerscope"]?.notNull).toBe(true);
    expect(cols["ownertask"]?.notNull).toBe(true);
    expect(cols["description"]?.notNull).toBe(true);
  });

  it("contenthash is NOT NULL (drift detection foundation, FR-010)", () => {
    expect(cols["contenthash"]?.notNull).toBe(true);
  });

  it("linestart and lineend are integer NOT NULL", () => {
    expect(cols["linestart"]?.columnType).toMatch(/PgInteger/);
    expect(cols["lineend"]?.columnType).toMatch(/PgInteger/);
    expect(cols["linestart"]?.notNull).toBe(true);
    expect(cols["lineend"]?.notNull).toBe(true);
  });

  it("createdat and updatedat default to now()", () => {
    expect(cols["createdat"]?.hasDefault).toBe(true);
    expect(cols["updatedat"]?.hasDefault).toBe(true);
  });

  it("exports TASK_FENCE_UNIT_KINDS with the six FR-002 unit kinds", () => {
    expect(TASK_FENCE_UNIT_KINDS).toEqual([
      "function",
      "class",
      "route",
      "table",
      "migration",
      "component",
    ]);
  });

  it("migration SQL declares unique index on (projectid, filepath, unitkind, unitname)", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      "src/db/migrations/0007_spec026_codefencing.sql",
      "utf-8",
    );
    expect(sql).toMatch(/CREATE UNIQUE INDEX "taskfences_unique_unit"/);
    expect(sql).toMatch(/"projectid","filepath","unitkind","unitname"/);
  });

  it("migration SQL declares FK to companyprojects with ON DELETE CASCADE", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      "src/db/migrations/0007_spec026_codefencing.sql",
      "utf-8",
    );
    expect(sql).toMatch(
      /taskfences.*FOREIGN KEY \("projectid"\) REFERENCES "public"\."companyprojects"\("id"\) ON DELETE cascade/s,
    );
  });
});

describe("Spec 026 — taskfencemodifications schema (T002)", () => {
  const cols = getColumns(taskfencemodifications);

  it("declares all 8 required columns", () => {
    const required = [
      "id",
      "taskfenceid",
      "modifierscope",
      "modifiertask",
      "description",
      "contenthashbefore",
      "contenthashafter",
      "createdat",
    ];
    for (const c of required) {
      expect(cols[c], `missing column ${c}`).toBeDefined();
    }
  });

  it("primary key id is uuid with v7 default", () => {
    expect(cols["id"]?.columnType).toMatch(/PgUUID/);
    expect(cols["id"]?.hasDefault).toBe(true);
  });

  it("taskfenceid is uuid NOT NULL (every modification belongs to a fence)", () => {
    expect(cols["taskfenceid"]?.columnType).toMatch(/PgUUID/);
    expect(cols["taskfenceid"]?.notNull).toBe(true);
  });

  it("modifier columns and both hash columns are NOT NULL", () => {
    expect(cols["modifierscope"]?.notNull).toBe(true);
    expect(cols["modifiertask"]?.notNull).toBe(true);
    expect(cols["contenthashbefore"]?.notNull).toBe(true);
    expect(cols["contenthashafter"]?.notNull).toBe(true);
  });

  it("no updatedat column — table is append-only audit trail (FR-003)", () => {
    expect(cols["updatedat"]).toBeUndefined();
  });

  it("migration SQL declares chronological index on (taskfenceid, createdat)", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      "src/db/migrations/0007_spec026_codefencing.sql",
      "utf-8",
    );
    expect(sql).toMatch(/CREATE INDEX "taskfencemodifications_chrono_idx"/);
    expect(sql).toMatch(/"taskfenceid","createdat"/);
  });

  it("migration SQL declares FK to taskfences with ON DELETE CASCADE", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      "src/db/migrations/0007_spec026_codefencing.sql",
      "utf-8",
    );
    expect(sql).toMatch(
      /taskfencemodifications.*FOREIGN KEY \("taskfenceid"\) REFERENCES "public"\."taskfences"\("id"\) ON DELETE cascade/s,
    );
  });
});

describe("Spec 026 — taskfencehistory schema (T003a)", () => {
  const cols = getColumns(taskfencehistory);

  it("declares all 10 required columns including ownership-transfer pair", () => {
    const required = [
      "id",
      "projectid",
      "filepath",
      "unitkind",
      "unitname",
      "priorownerscope",
      "priorownertask",
      "replacedbyscope",
      "replacedbytask",
      "closedat",
    ];
    for (const c of required) {
      expect(cols[c], `missing column ${c}`).toBeDefined();
    }
  });

  it("prior + replacedby ownership columns are NOT NULL", () => {
    expect(cols["priorownerscope"]?.notNull).toBe(true);
    expect(cols["priorownertask"]?.notNull).toBe(true);
    expect(cols["replacedbyscope"]?.notNull).toBe(true);
    expect(cols["replacedbytask"]?.notNull).toBe(true);
  });

  it("closedat defaults to now()", () => {
    expect(cols["closedat"]?.hasDefault).toBe(true);
  });

  it("migration SQL declares FK to companyprojects with ON DELETE CASCADE", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      "src/db/migrations/0007_spec026_codefencing.sql",
      "utf-8",
    );
    expect(sql).toMatch(
      /taskfencehistory.*FOREIGN KEY \("projectid"\) REFERENCES "public"\."companyprojects"\("id"\) ON DELETE cascade/s,
    );
  });
});

describe("Spec 026 — taskfenceslegacy schema (T003b)", () => {
  const cols = getColumns(taskfenceslegacy);

  it("declares the 5 required columns", () => {
    const required = [
      "id",
      "projectid",
      "filepath",
      "contenthash",
      "baselinedat",
    ];
    for (const c of required) {
      expect(cols[c], `missing column ${c}`).toBeDefined();
    }
  });

  it("projectid, filepath, contenthash are all NOT NULL", () => {
    expect(cols["projectid"]?.notNull).toBe(true);
    expect(cols["filepath"]?.notNull).toBe(true);
    expect(cols["contenthash"]?.notNull).toBe(true);
  });

  it("baselinedat defaults to now() (one-time --baseline capture)", () => {
    expect(cols["baselinedat"]?.hasDefault).toBe(true);
  });

  it("migration SQL declares unique index on (projectid, filepath)", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      "src/db/migrations/0007_spec026_codefencing.sql",
      "utf-8",
    );
    expect(sql).toMatch(/CREATE UNIQUE INDEX "taskfenceslegacy_unique_file"/);
    expect(sql).toMatch(/"projectid","filepath"/);
  });
});

describe("Spec 026 — index.ts exports", () => {
  it("re-exports all four new schemas + the unit-kinds constant", async () => {
    const mod = await import("../../src/db/schema/index.js");
    expect(mod.taskfences).toBeDefined();
    expect(mod.taskfencemodifications).toBeDefined();
    expect(mod.taskfencehistory).toBeDefined();
    expect(mod.taskfenceslegacy).toBeDefined();
    expect(mod.TASK_FENCE_UNIT_KINDS).toBeDefined();
  });
});

describe("Spec 026 — naming conventions (per CLAUDE.md DB section)", () => {
  it("all four table names are lowercase, no underscores, no spaces", () => {
    const names = [
      "taskfences",
      "taskfencemodifications",
      "taskfencehistory",
      "taskfenceslegacy",
    ];
    for (const n of names) {
      expect(n).toMatch(/^[a-z]+$/);
      expect(n).not.toMatch(/_/);
      expect(n).not.toMatch(/\s/);
    }
  });

  it("all column names follow lowercase, no underscores convention", () => {
    const tables = [
      taskfences,
      taskfencemodifications,
      taskfencehistory,
      taskfenceslegacy,
    ];
    for (const t of tables) {
      const cols = getColumns(t);
      for (const colName of Object.keys(cols)) {
        expect(colName, `column ${colName} has uppercase or underscore`).toMatch(
          /^[a-z]+$/,
        );
      }
    }
  });
});
