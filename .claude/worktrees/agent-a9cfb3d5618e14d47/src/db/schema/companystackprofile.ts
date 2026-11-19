import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { companies } from "./company";
import { userprofiles } from "./userprofiles";

// [SCOPE 057 / T001] BEGIN — companystackprofiles (company-wide stack/style default per app type)
// One profile per (company, application type) — at most 3 per company (web/desktop/mobile).
// The live default for any project that has not set its own ProjectStack doc; the
// project tier always wins (resolved in project.get_stack via effective-stack).
// content holds the stack/style markdown (same shape as the ProjectStack document).
export const companystackprofiles = pgTable(
  "companystackprofiles",
  {
    id: uuid("id").primaryKey(),
    companyid: uuid("companyid")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    apptype: varchar("apptype", { length: 20 }).notNull(), // 'web' | 'desktop' | 'mobile'
    content: text("content").notNull(),
    createdbyid: uuid("createdbyid").references(() => userprofiles.id, {
      onDelete: "set null",
    }),
    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    companyApptypeIdx: uniqueIndex("uq_companystackprofiles_company_apptype").on(
      table.companyid,
      table.apptype,
    ),
  }),
);

export type CompanyStackProfile = typeof companystackprofiles.$inferSelect;
export type NewCompanyStackProfile = typeof companystackprofiles.$inferInsert;
// [SCOPE 057 / T001] END
