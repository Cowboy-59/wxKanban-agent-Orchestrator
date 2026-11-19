import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { testplanitems } from "./testplanitems";
import { companyprojects } from "./companyproject";

// [SCOPE 111 / T003] BEGIN — The code an item exercises; impact analysis walks from every row
// FR-049b1d, FR-049b1e. Most items declare one subject; a flow item spanning
// several screens declares one per screen. Kept as rows rather than a column on
// the item because this is the join impact analysis runs on every cycle, and
// because a Retest mark has to name WHICH subject was reached — a tester
// re-testing a five-screen flow needs to know it is the invoice screen that
// changed, not the whole flow.
export const testitemsubjects = pgTable(
  "testitemsubjects",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),

    itemid: uuid("itemid")
      .notNull()
      .references(() => testplanitems.id, { onDelete: "cascade" }),
    projectid: uuid("projectid")
      .notNull()
      .references(() => companyprojects.id, { onDelete: "cascade" }),

    // Normalised repository-relative path — what the runner's dependency graph
    // is keyed by. Matching happens on this, so it must not carry a line suffix.
    sourcepath: varchar("sourcepath", { length: 500 }).notNull(),
    sourceline: integer("sourceline"),

    // Inventory unit id, e.g. 'express-route:POST /auth/signin',
    // 'drizzle-table:timeentries', 'ui-route:/dashboard'.
    unitid: varchar("unitid", { length: 500 }),

    // 'primary' for the subject an item is chiefly about; 'secondary' for the
    // further screens or units a flow item also touches.
    role: varchar("role", { length: 20 }).default("primary").notNull(),

    createdat: timestamp("createdat").defaultNow().notNull(),
  },
  (table) => ({
    itemSourceUnique: uniqueIndex("idx_testitemsubjects_item_source").on(
      table.itemid,
      table.sourcepath,
    ),
    // NOTE: no standalone index on (itemid) — it would be a left-prefix of
    // idx_testitemsubjects_item_source above, which Postgres already uses for
    // itemid-only lookups. Impact analysis joins on this table constantly, so
    // the redundant write cost is worth avoiding.
    // Impact analysis matches changed/dependent paths against this.
    projectSourceIdx: index("idx_testitemsubjects_project_source").on(
      table.projectid,
      table.sourcepath,
    ),
  }),
);
// [SCOPE 111 / T003] END

export type TestItemSubject = typeof testitemsubjects.$inferSelect;
export type NewTestItemSubject = typeof testitemsubjects.$inferInsert;
