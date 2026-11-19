import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { testplans } from "./testPlan";
import { companyprojects } from "./companyproject";
import { projectspecifications } from "./projectspecification";
import { projecttasks } from "./projecttask";
import { testruns } from "./testruns";

/**
 * Criteria held as structured JSON — the parts the database never queries but
 * the User Testing screen renders verbatim: preconditions, testData, steps
 * (each with its own machine-checkable expected result), flow, postconditions,
 * exemptions, and the data-layer extension keys for `layer: 'data'` items.
 *
 * The authoritative field contract lives in the generation skill's reference
 * (`_wxAI/skills/wxCreateTestPlan/references/test-item-schema.md`). This scope
 * persists that contract; it does not redefine it.
 */
export interface TestItemDetail {
  preconditions: string[];
  testData: Array<{ name: string; value: unknown; source: string }>;
  steps: Array<{ step: number; action: string; expected: string }>;
  flow: {
    startRoute: string;
    navAction: string;
    destRoute: string;
    backTo: string | null;
    elements: Array<{ selector: string; assert: string; value: unknown }>;
  } | null;
  postconditions: string[];
  exemptions: Array<{ variant: string; code: string; note: string }>;
  targetObjects?: string[];
  isolationLevel?: string;
  seedScript?: string;
  teardownScript?: string;
  expectedPlan?: string | null;
  rationale?: string | null;
  tags?: string[];
}

// [SCOPE 111 / T002] BEGIN — One row per test item, criteria intact and queryable
export const testplanitems = pgTable(
  "testplanitems",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),

    testplanid: uuid("testplanid")
      .notNull()
      .references(() => testplans.id, { onDelete: "cascade" }),
    projectid: uuid("projectid")
      .notNull()
      .references(() => companyprojects.id, { onDelete: "cascade" }),
    specid: uuid("specid").references(() => projectspecifications.id, {
      onDelete: "set null",
    }),

    // Optional cross-reference only — an item never requires a task to exist (FR-043).
    taskid: uuid("taskid").references(() => projecttasks.id, {
      onDelete: "set null",
    }),

    // Stable key (e.g. 'TC-AUTH-001-N1'). Immutable once filed; this is what
    // re-generation matches on so results and signoffs survive (FR-007).
    itemkey: varchar("itemkey", { length: 100 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),

    // Provenance (FR-002)
    requirementid: varchar("requirementid", { length: 50 }),
    specref: varchar("specref", { length: 500 }),
    fenceref: varchar("fenceref", { length: 100 }),

    // Queryable classification (FR-003)
    gate: varchar("gate", { length: 20 }).notNull(), // smoke | crud | ui-flow | unit
    layer: varchar("layer", { length: 20 }).default("app").notNull(), // app | data
    variant: varchar("variant", { length: 20 }).default("happy").notNull(),
    // Self-reference: a negative/edge variant points at the happy-path item it
    // varies. Cascades — a variant of a deleted item has nothing left to vary.
    // The AnyPgColumn annotation is what lets a table reference itself without
    // TypeScript recursing on its own inferred type.
    parentitemid: uuid("parentitemid").references(
      (): AnyPgColumn => testplanitems.id,
      { onDelete: "cascade" },
    ),
    priority: varchar("priority", { length: 10 }).default("P2").notNull(),
    risktier: varchar("risktier", { length: 10 }).default("MEDIUM").notNull(),
    testlevel: varchar("testlevel", { length: 20 }).default("integration").notNull(),
    tier: varchar("tier", { length: 20 }).default("unit-mocked").notNull(),
    automation: varchar("automation", { length: 20 }).default("automatable").notNull(),
    automationref: varchar("automationref", { length: 500 }),
    blockedreason: text("blockedreason"),

    // FR-005 — who RUNS it. Determines which set the item belongs to and which
    // gate it answers to. Exactly one of the two.
    executor: varchar("executor", { length: 10 }).notNull(), // machine | human
    // FR-005a — who AUTHORED it. Independent of executor: the AI authors most
    // human items, and a tester-authored item is always a human item.
    origin: varchar("origin", { length: 10 }).default("ai").notNull(), // ai | user

    // FR-005b, FR-021b — a human item is withheld until the release is promoted
    // to UAT. Machine items are released on creation.
    released: boolean("released").default(false).notNull(),
    releasedat: timestamp("releasedat"),

    // FR-030 — null means inherit the plan's flag; non-null overrides it in
    // either direction.
    forcetest: boolean("forcetest"),

    // FR-006 — denormalised current view; the authoritative history lives in
    // testrunresults, which the regression baseline reads.
    lastresultstatus: varchar("lastresultstatus", { length: 20 }),
    lastresultat: timestamp("lastresultat"),
    // Set null rather than cascade: this is a convenience pointer, and losing a
    // run must not erase the item's last known status. The authoritative history
    // is in testrunresults either way.
    //
    // This and testruns.currentitemid form a deliberate circular reference
    // between the two tables. Both are declared with drizzle's lazy `() =>`
    // callback form, which is not evaluated during module initialisation — so
    // the import cycle resolves. Do NOT restate either side with `foreignKey()`
    // in the extras callback: that form evaluates its column arrays eagerly and
    // would fault on whichever module happens to load second.
    lastrunid: uuid("lastrunid").references(() => testruns.id, {
      onDelete: "set null",
    }),

    // FR-004 — the criteria the interface renders and a runner consumes.
    detail: jsonb("detail").$type<TestItemDetail>().notNull(),

    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    // Re-generation matches on (plan, itemkey) — this is what makes FR-007
    // an upsert rather than a destructive rewrite.
    planItemkeyUnique: uniqueIndex("idx_testplanitems_plan_itemkey").on(
      table.testplanid,
      table.itemkey,
    ),
    // FK target for testsignoffs' composite (itemid, itemexecutor) reference —
    // this is what makes "a person cannot sign a machine test" a database
    // constraint rather than a service-layer convention.
    idExecutorUnique: uniqueIndex("idx_testplanitems_id_executor").on(
      table.id,
      table.executor,
    ),
    // NOTE: there is deliberately no standalone index on (testplanid). It would
    // be a left-prefix of idx_testplanitems_plan_itemkey above, which Postgres
    // already uses for testplanid-only lookups — a second index would cost
    // writes on the hottest table here and buy nothing.
    specIdx: index("idx_testplanitems_spec").on(table.specid),
    // Postgres does not index foreign keys automatically, and an un-indexed
    // child FK turns every parent DELETE into a sequential scan of this table.
    // Everything below exists for that reason, not for a read path.
    taskIdx: index("idx_testplanitems_task").on(table.taskid),
    parentIdx: index("idx_testplanitems_parent").on(table.parentitemid),
    lastrunIdx: index("idx_testplanitems_lastrun").on(table.lastrunid),
    // The gate runs this shape on every completion check and phase render.
    projectGateIdx: index("idx_testplanitems_project_gate").on(
      table.projectid,
      table.executor,
      table.forcetest,
    ),
  }),
);
// [SCOPE 111 / T002] END

export type TestPlanItem = typeof testplanitems.$inferSelect;
export type NewTestPlanItem = typeof testplanitems.$inferInsert;
