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
import type { ProjectTheme } from "../../shared/theme-tokens";
import type { BrandSchema } from "../../shared/brand-schema";

// companythemeprofiles (SCOPE-062 / T003) — company-wide default Theme per app type.
// One profile per (company, application type) — at most 3 per company (web/desktop/mobile).
// The middle tier of theme resolution: a project with no theme of its own resolves to
// the company profile for its app type, then to the wxKanban built-in default. Mirrors
// companystackprofiles; `theme` is the structured ProjectTheme object (jsonb), not markdown.
// [SCOPE 062 / T003] BEGIN — Schema + migration — `projectthemes` + `companythemeprofile…
export const companythemeprofiles = pgTable(
  "companythemeprofiles",
  {
    id: uuid("id").primaryKey(),
    companyid: uuid("companyid")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    apptype: varchar("apptype", { length: 20 }).notNull(), // 'web' | 'desktop' | 'mobile'
    theme: jsonb("theme").$type<ProjectTheme>().notNull(),
    // SCOPE-129 (SPEC-126 / T007): a company-wide brand selection. Before this column the
    // company tier resolved to a colour-only bundle BY CONSTRUCTION — it carried no rich
    // data at all — so a brand chosen company-wide would have been lost here for every
    // project that had not imported it individually.
    brandschema: jsonb("brandschema").$type<BrandSchema>(),
    createdbyid: uuid("createdbyid").references(() => userprofiles.id, {
      onDelete: "set null",
    }),
    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    companyApptypeIdx: uniqueIndex("uq_companythemeprofiles_company_apptype").on(
      table.companyid,
      table.apptype,
    ),
  }),
);
// [SCOPE 062 / T003] END

export type CompanyThemeProfile = typeof companythemeprofiles.$inferSelect;
export type NewCompanyThemeProfile = typeof companythemeprofiles.$inferInsert;
