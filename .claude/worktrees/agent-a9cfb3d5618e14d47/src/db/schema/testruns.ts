import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { testcycles } from "./testcycles";
import { testplans } from "./testPlan";
import { companyprojects } from "./companyproject";
import { projectspecifications } from "./projectspecification";
import { userprofiles } from "./userprofiles";
import { testplanitems } from "./testplanitems";

// [SCOPE 111 / T005] BEGIN — Runner-agnostic execution record
// FR-009 through FR-012, FR-016, FR-055. Modelled on auditexecutions, which
// already proved the execution-plus-results shape in this codebase.
//
// Runner-agnostic is a hard requirement, not an aspiration: nothing in this
// table or the services over it branches on WHO is running. The AI agent posts
// today; a CI job posts tomorrow with no schema or route change.
export const testruns = pgTable(
  "testruns",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),

    cycleid: uuid("cycleid")
      .notNull()
      .references(() => testcycles.id, { onDelete: "cascade" }),
    projectid: uuid("projectid")
      .notNull()
      .references(() => companyprojects.id, { onDelete: "cascade" }),
    testplanid: uuid("testplanid").references(() => testplans.id, {
      onDelete: "set null",
    }),
    specid: uuid("specid").references(() => projectspecifications.id, {
      onDelete: "set null",
    }),

    // 'ai-agent' | 'ci' | 'manual'
    runnertype: varchar("runnertype", { length: 20 }).notNull(),
    // Agent session id, CI job URL — whatever identifies this particular runner.
    runnerref: varchar("runnerref", { length: 500 }),

    // FR-051 — a regression run covers every machine item in the project, not
    // only the scopes the release changed.
    isregression: boolean("isregression").default(false).notNull(),

    // 'smoke' | 'crud' | 'ui-flow' | 'unit'
    gate: varchar("gate", { length: 20 }),
    // FR-055 — 'local' | 'ci' | 'uat' | 'production'. A crud-gate run against a
    // target that is not verified non-production is refused before it starts.
    environment: varchar("environment", { length: 20 }).default("local").notNull(),

    // 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
    status: varchar("status", { length: 20 }).default("queued").notNull(),

    startedat: timestamp("startedat").defaultNow().notNull(),
    endedat: timestamp("endedat"),
    // FR-015 — a run silent beyond the stall interval is reported as stalled
    // rather than left reading as running forever.
    lastheartbeatat: timestamp("lastheartbeatat").defaultNow().notNull(),

    totalitems: integer("totalitems").default(0).notNull(),
    passeditems: integer("passeditems").default(0).notNull(),
    faileditems: integer("faileditems").default(0).notNull(),
    skippeditems: integer("skippeditems").default(0).notNull(),
    blockeditems: integer("blockeditems").default(0).notNull(),

    // FR-010 — the ordered list the run declared at start, stored so the QA view
    // can show what is ABOUT to run, not merely what has finished.
    declareditemids: jsonb("declareditemids").$type<string[]>().default([]).notNull(),

    // FR-011 — what the runner is executing at this moment. This single column
    // is what makes the live view live.
    //
    // Set null, never cascade: an item being deleted mid-run must not delete the
    // run record along with its results. See the note on testplanitems.lastrunid
    // for why this pair is declared with the lazy callback form.
    currentitemid: uuid("currentitemid").references(() => testplanitems.id, {
      onDelete: "set null",
    }),

    triggeredbyid: uuid("triggeredbyid").references(() => userprofiles.id, {
      onDelete: "set null",
    }),

    createdat: timestamp("createdat").defaultNow().notNull(),
    // Runs mutate constantly — status, counts, heartbeat and currentitemid all
    // move while a run is in flight.
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    cycleIdx: index("idx_testruns_cycle").on(table.cycleid),
    projectStartedIdx: index("idx_testruns_project_started").on(
      table.projectid,
      table.startedat,
    ),
    statusIdx: index("idx_testruns_status").on(table.projectid, table.status),
    // FK covering indexes — see the note in testplanitems.
    testplanIdx: index("idx_testruns_testplan").on(table.testplanid),
    specIdx: index("idx_testruns_spec").on(table.specid),
    currentitemIdx: index("idx_testruns_currentitem").on(table.currentitemid),
    triggeredbyIdx: index("idx_testruns_triggeredby").on(table.triggeredbyid),
  }),
);
// [SCOPE 111 / T005] END

export type TestRun = typeof testruns.$inferSelect;
export type NewTestRun = typeof testruns.$inferInsert;
