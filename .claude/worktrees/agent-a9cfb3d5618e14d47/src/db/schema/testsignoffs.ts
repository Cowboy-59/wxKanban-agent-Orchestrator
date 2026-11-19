import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { testcycles } from "./testcycles";
import { testplanitems } from "./testplanitems";
import { testruns } from "./testruns";
import { userprofiles } from "./userprofiles";

// [SCOPE 111 / T007] BEGIN — One signoff per item, given by its own executor
// FR-017 through FR-021a, FR-033, FR-049h.
//
// The central rule of this scope is that AI tests and user tests are SEPARATE
// tests, not one test signed twice. An item therefore carries exactly one
// signoff, and it must come from the executor that was supposed to run it. That
// is enforced here rather than in a service: `itemexecutor` is carried on the
// row and tied to the item's real executor by a composite foreign key, and a
// check constraint fixes the only two legal pairings. A person cannot sign off
// a machine test and a run cannot sign off a human test, whatever the caller
// believes.
//
// The two signoff types then age differently, deliberately:
//   - a MACHINE signoff is keyed to its cycle and never carries — the gate asks
//     for one in the current cycle, does not find it, and the item reads
//     unsigned until that cycle's regression run re-earns it. Nearly free.
//   - a HUMAN signoff carries forward with every new version (FR-049h),
//     including versions needing no re-testing, and is withdrawn only on
//     evidence: an unanswered Retest mark, or a later failing run. Human time
//     is the scarce resource, so it is never discarded by default.
export const testsignoffs = pgTable(
  "testsignoffs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),

    cycleid: uuid("cycleid")
      .notNull()
      .references(() => testcycles.id, { onDelete: "cascade" }),

    itemid: uuid("itemid").notNull(),
    // Mirrors the item's executor; the composite FK below keeps the two honest.
    itemexecutor: varchar("itemexecutor", { length: 10 }).notNull(),

    // 'ai' | 'user' — must correspond to itemexecutor (see the check below).
    signofftype: varchar("signofftype", { length: 10 }).notNull(),
    // 'passed' | 'failed' | 'waived'. A waiver is stored HERE rather than as a
    // pass, so a gate satisfied by administrative decision is always
    // distinguishable from one satisfied by a test (FR-033).
    status: varchar("status", { length: 20 }).notNull(),

    // Null for an automated signoff; required for a human one (FR-021).
    signedbyid: uuid("signedbyid").references(() => userprofiles.id, {
      onDelete: "set null",
    }),
    // Identifies an automated producer, e.g. 'claude-opus-5'.
    signedbylabel: varchar("signedbylabel", { length: 100 }),

    runid: uuid("runid").references(() => testruns.id, { onDelete: "set null" }),

    // FR-049h — the version and build actually exercised, which for a human
    // signoff is the promoted UAT build and may trail the cycle being assembled.
    signedagainstversion: varchar("signedagainstversion", { length: 50 }),
    signedagainstbuildref: varchar("signedagainstbuildref", { length: 255 }),

    notes: text("notes"),

    // FR-021a — invalidated by a later failing run. Shown as superseded, never
    // deleted; the record of who once vouched for this survives.
    superseded: boolean("superseded").default(false).notNull(),
    supersededat: timestamp("supersededat"),

    signedat: timestamp("signedat").defaultNow().notNull(),
    createdat: timestamp("createdat").defaultNow().notNull(),
    // Signoffs mutate when superseded by a later failing run.
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    itemExecutorFk: foreignKey({
      columns: [table.itemid, table.itemexecutor],
      foreignColumns: [testplanitems.id, testplanitems.executor],
      name: "fk_testsignoffs_item_executor",
    }).onDelete("cascade"),

    // The only two legal pairings. Anything else is a caller bug and is refused
    // by the database.
    executorMatch: check(
      "chk_testsignoffs_executor_match",
      sql`(${table.itemexecutor} = 'machine' AND ${table.signofftype} = 'ai')
       OR (${table.itemexecutor} = 'human'   AND ${table.signofftype} = 'user')`,
    ),

    // One signoff of a given type per item per cycle.
    itemCycleTypeUnique: uniqueIndex("idx_testsignoffs_item_cycle_type").on(
      table.itemid,
      table.cycleid,
      table.signofftype,
    ),
    itemIdx: index("idx_testsignoffs_item").on(table.itemid, table.signofftype),
    cycleIdx: index("idx_testsignoffs_cycle").on(table.cycleid),
    // FK covering indexes — see the note in testplanitems. itemid needs none of
    // its own: idx_testsignoffs_item above already leads with it, which is what
    // the composite fk_testsignoffs_item_executor scans on.
    signedbyIdx: index("idx_testsignoffs_signedby").on(table.signedbyid),
    runIdx: index("idx_testsignoffs_run").on(table.runid),
  }),
);
// [SCOPE 111 / T007] END

export type TestSignoff = typeof testsignoffs.$inferSelect;
export type NewTestSignoff = typeof testsignoffs.$inferInsert;
