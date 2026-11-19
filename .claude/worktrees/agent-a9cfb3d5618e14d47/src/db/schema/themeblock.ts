import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { companies } from "./company";
import { userprofiles } from "./userprofiles";
import type { BlockNode } from "../../shared/block-model";

// themeblocks (SCOPE-107 / T004) — the Block Library: named, reusable drag-drop-composed
// branded sections, one collection per company. `block` is the structured node tree
// ({ nodes }). Any member may save; only an ADMIN may rename/delete (enforced in the
// route layer). Tenant-scoped by companyid. UNIQUE (companyid, name). Mirrors themetemplates.
// [SCOPE 107 / T004] BEGIN — themeblocks table (named reusable block trees)
export const themeblocks = pgTable(
  "themeblocks",
  {
    id: uuid("id").primaryKey(),
    companyid: uuid("companyid")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    block: jsonb("block").$type<{ nodes: BlockNode[] }>().notNull(),
    createdbyid: uuid("createdbyid").references(() => userprofiles.id, {
      onDelete: "set null",
    }),
    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    companyNameIdx: uniqueIndex("uq_themeblocks_company_name").on(table.companyid, table.name),
  }),
);
// [SCOPE 107 / T004] END

export type ThemeBlockRow = typeof themeblocks.$inferSelect;
export type NewThemeBlockRow = typeof themeblocks.$inferInsert;
