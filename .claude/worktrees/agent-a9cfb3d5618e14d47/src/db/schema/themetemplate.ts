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
import type { BusinessChrome } from "../../shared/theme-template";
import type { NamedBlock } from "../../shared/block-model";
import type { DesignSystemTokens } from "../../shared/design-system";
import type { BrandSchema } from "../../shared/brand-schema";

// themetemplates (SCOPE-106 / T002) — named, reusable "Borrow-a-Look" templates.
// Unlike companythemeprofiles (one per company+app type), this is a COLLECTION: many
// named templates per company, each bundling a look (`theme`, a ProjectTheme) and the
// business chrome (`chrome`, a BusinessChrome — logo + name + footer line). Any member
// may save; only an admin may rename/delete (enforced in the route layer). Tenant-scoped
// by companyid. UNIQUE (companyid, name) — no duplicate names within a company.
// [SCOPE 106 / T002] BEGIN — themetemplates table (named reusable look+chrome bundles)
// MODIFIED-BY [SCOPE 115 / T004] — added nullable `tokens` + `designsystemslug` so a
// template picked from the global design-system catalog carries the RICH token set
// (control specs, type scale, spacing, elevation) that ProjectTheme cannot hold.
export const themetemplates = pgTable(
  "themetemplates",
  {
    id: uuid("id").primaryKey(),
    companyid: uuid("companyid")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    theme: jsonb("theme").$type<ProjectTheme>().notNull(),
    chrome: jsonb("chrome").$type<BusinessChrome>().notNull(),
    // SCOPE-107 (FR-009): a template may carry an ordered list of blocks (nullable).
    blocks: jsonb("blocks").$type<NamedBlock[]>(),
    // SCOPE-114 (SPEC-115 / T004): the rich design-system token set, copied at pick time.
    // NULL for templates that were hand-built or URL-derived rather than picked from the
    // catalog — those keep working exactly as before and execute to a colour-only bundle.
    // `theme` stays authoritative for ALL colour; this column is authoritative only for
    // what it uniquely holds, so a user recolouring in the Studio cannot desynchronise it.
    tokens: jsonb("tokens").$type<DesignSystemTokens>(),
    // Provenance: which catalog entry this template was copied from, by slug. Nullable.
    // Deliberately a slug rather than a foreign key — picking is a SNAPSHOT (Theme Studio
    // Phase 1), so a later change to the catalog row must NOT reach this copy, and the
    // copy must survive its catalog entry being re-seeded or removed.
    designsystemslug: varchar("designsystemslug", { length: 80 }),
    // SCOPE-129 (SPEC-126 / T007): the brand schema for this named look. This is the
    // company-scoped gallery, which is where a tenant's OWN brand lives — the global
    // `designsystems` catalog is read-only and system-owned, so it is the wrong home.
    brandschema: jsonb("brandschema").$type<BrandSchema>(),
    createdbyid: uuid("createdbyid").references(() => userprofiles.id, {
      onDelete: "set null",
    }),
    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    companyNameIdx: uniqueIndex("uq_themetemplates_company_name").on(
      table.companyid,
      table.name,
    ),
  }),
);
// [SCOPE 106 / T002] END

export type ThemeTemplateRow = typeof themetemplates.$inferSelect;
export type NewThemeTemplateRow = typeof themetemplates.$inferInsert;
