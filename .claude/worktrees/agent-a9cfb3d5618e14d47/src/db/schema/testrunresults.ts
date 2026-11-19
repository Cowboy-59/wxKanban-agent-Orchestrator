import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { testruns } from "./testruns";
import { testplanitems } from "./testplanitems";
import { testcycles } from "./testcycles";
import { feedbacksubmissions } from "./feedbacksubmissions";

// [SCOPE 111 / T006] BEGIN — One result per item per run; never overwritten
// FR-013, FR-014, FR-025. Modelled on auditresults.
//
// This table is the reason a regression is legible. The item's lastresult*
// columns are a denormalised convenience; THIS is the history, and the
// regression baseline reads an item's own most recent prior row here rather
// than whatever the immediately preceding cycle happened to contain (FR-052).
// Nothing here is ever updated in place.
export const testrunresults = pgTable(
  "testrunresults",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),

    runid: uuid("runid")
      .notNull()
      .references(() => testruns.id, { onDelete: "cascade" }),
    itemid: uuid("itemid")
      .notNull()
      .references(() => testplanitems.id, { onDelete: "cascade" }),
    // Denormalised from the run so the regression comparison can find an item's
    // prior results without joining through runs on every row.
    cycleid: uuid("cycleid")
      .notNull()
      .references(() => testcycles.id, { onDelete: "cascade" }),

    // 'pass' | 'fail' | 'skip' | 'blocked' | 'unresolved'
    status: varchar("status", { length: 20 }).notNull(),
    // 'TEST-BUG' | 'CODE-BUG' | 'NOT-IMPLEMENTED' | 'SPEC-GAP' | 'UNRESOLVED'
    bucket: varchar("bucket", { length: 20 }),

    evidence: text("evidence"),
    durationms: integer("durationms"),

    // FR-025 — where a failure filed a bug report, this is the link back to it.
    // Referenced, not owned: the report survives independently in the existing
    // bug queue (SCOPE-063) even if the run is deleted.
    bugreportid: uuid("bugreportid").references(() => feedbacksubmissions.id, {
      onDelete: "set null",
    }),

    startedat: timestamp("startedat"),
    endedat: timestamp("endedat"),
    createdat: timestamp("createdat").defaultNow().notNull(),
  },
  (table) => ({
    runIdx: index("idx_testrunresults_run").on(table.runid),
    // The regression baseline lookup: an item's own results, newest first.
    itemCreatedIdx: index("idx_testrunresults_item_created").on(
      table.itemid,
      table.createdat,
    ),
    cycleIdx: index("idx_testrunresults_cycle").on(table.cycleid),
    // FK covering index — see the note in testplanitems. itemid needs none of
    // its own: idx_testrunresults_item_created above already leads with it.
    bugreportIdx: index("idx_testrunresults_bugreport").on(table.bugreportid),
  }),
);
// [SCOPE 111 / T006] END

export type TestRunResult = typeof testrunresults.$inferSelect;
export type NewTestRunResult = typeof testrunresults.$inferInsert;
