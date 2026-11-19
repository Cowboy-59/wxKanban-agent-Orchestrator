import {
  pgTable,
  uuid,
  jsonb,
  timestamp,
  varchar,
  integer,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projectspecifications } from "./projectspecification";
import { companyprojects } from "./companyproject";
import { userprofiles } from "./userprofiles";

// [SCOPE 111 / T001] BEGIN — Test plan per scope: force-test default + provenance
// Extends the pre-existing testplans stub additively (FR-001, FR-029). The two
// legacy jsonb columns are deliberately retained and unused: the scope-delete
// cascade and the merge_scope raw-SQL reassignment both reference this table,
// and dropping them would break paths this scope does not own.
export const testplans = pgTable(
  "testplans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    specid: uuid("specid")
      .notNull()
      .references(() => projectspecifications.id, { onDelete: "cascade" }),

    // Nullable so the migration stays additive — no existing row needs backfill.
    projectid: uuid("projectid").references(() => companyprojects.id, {
      onDelete: "cascade",
    }),

    // 'active' | 'superseded'
    status: varchar("status", { length: 50 }).default("active").notNull(),
    // 'ai' | 'manual' | 'imported'
    source: varchar("source", { length: 20 }).default("ai").notNull(),

    generatedbyid: uuid("generatedbyid").references(() => userprofiles.id, {
      onDelete: "set null",
    }),
    generatedat: timestamp("generatedat"),
    itemcount: integer("itemcount").default(0).notNull(),

    // FR-029 — the administrator's scope-level default. Items may override it
    // in either direction; a null override on an item inherits this value.
    forcetest: boolean("forcetest").default(false).notNull(),

    // Legacy (pre-SCOPE-111), retained unused. Do not read or write these.
    testcases: jsonb("testcases").notNull().default([]),
    results: jsonb("results").notNull().default({}),

    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    // One plan per scope (FR-001).
    specUnique: uniqueIndex("idx_testplans_spec").on(table.specid),
    projectIdx: index("idx_testplans_project").on(table.projectid),
    // FK covering index — see the note in testplanitems.
    generatedbyIdx: index("idx_testplans_generatedby").on(table.generatedbyid),
  }),
);
// [SCOPE 111 / T001] END

export type TestPlan = typeof testplans.$inferSelect;
export type NewTestPlan = typeof testplans.$inferInsert;
