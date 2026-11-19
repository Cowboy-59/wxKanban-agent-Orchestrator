import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { companyprojects } from "./companyproject";
import { userprofiles } from "./userprofiles";

// [SCOPE 111 / T004] BEGIN — Test cycle keyed to the application version
// FR-047, FR-048, FR-056. The container everything else hangs from: runs,
// results, signoffs and retest marks all record their cycle.
//
// The reset semantics fall out of this key rather than from any sweep job. A
// machine signoff carries a cycleid, so a signoff from an earlier version
// simply does not answer the current cycle's gate query — it is not found, and
// the item reads as unsigned until this cycle's regression run proves it again.
// Nothing is deleted, nothing can half-complete, and the previous cycle stays
// intact for the regression comparison.
export const testcycles = pgTable(
  "testcycles",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),

    projectid: uuid("projectid")
      .notNull()
      .references(() => companyprojects.id, { onDelete: "cascade" }),

    // The application version that identifies this cycle. A version the system
    // has not seen opens a cycle on first sight — no deliberate act required.
    version: varchar("version", { length: 50 }).notNull(),

    // 'open' | 'uat' | 'production' | 'superseded'
    status: varchar("status", { length: 20 }).default("open").notNull(),

    // The commit the cycle corresponds to. Impact analysis refuses a graph whose
    // commit does not match this (FR-049b1c1) — without it a graph computed
    // against different code marks the wrong items undetectably.
    commitsha: varchar("commitsha", { length: 100 }),
    buildref: varchar("buildref", { length: 255 }),

    openedat: timestamp("openedat").defaultNow().notNull(),
    promotedtouatat: timestamp("promotedtouatat"),
    promotedtoproductionat: timestamp("promotedtoproductionat"),
    supersededat: timestamp("supersededat"),

    promotedbyid: uuid("promotedbyid").references(() => userprofiles.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),

    createdat: timestamp("createdat").defaultNow().notNull(),
    // Cycles mutate as they move open → uat → production → superseded.
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    // One cycle per project per version — the uniqueness that makes
    // "open on first sight" safe against concurrent callers.
    projectVersionUnique: uniqueIndex("idx_testcycles_project_version").on(
      table.projectid,
      table.version,
    ),
    projectStatusIdx: index("idx_testcycles_project_status").on(
      table.projectid,
      table.status,
    ),
    // FK covering index — see the note in testplanitems.
    promotedbyIdx: index("idx_testcycles_promotedby").on(table.promotedbyid),
  }),
);
// [SCOPE 111 / T004] END

export type TestCycle = typeof testcycles.$inferSelect;
export type NewTestCycle = typeof testcycles.$inferInsert;
