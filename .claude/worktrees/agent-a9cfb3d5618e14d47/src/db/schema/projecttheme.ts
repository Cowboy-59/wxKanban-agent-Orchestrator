import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { companyprojects } from "./companyproject";
import { userprofiles } from "./userprofiles";
import type { ProjectTheme } from "../../shared/theme-tokens";
import type { BusinessChrome } from "../../shared/theme-template";
import type { NamedBlock } from "../../shared/block-model";
import type { DesignSystemTokens } from "../../shared/design-system";
import type { BrandSchema } from "../../shared/brand-schema";

// projectthemes (SCOPE-062 / T003) — one active visual Theme per (project, app type).
// The project tier of theme resolution (project → company theme profile → wxKanban
// built-in default). `theme` is the structured ProjectTheme object (source, sourceRef,
// light + dark ThemeTokenSet, typography) — NOT round-tripped markdown. The structured
// shape (src/shared/theme-tokens.ts, T001) is the source of truth; theme.css / shadcn
// artifacts are derived output materialized beside the stack artifacts.
// [SCOPE 062 / T003] BEGIN — Schema + migration — `projectthemes` + `companythemeprofile…
// MODIFIED-BY [SCOPE 106 / T008] — added nullable `chrome` (BusinessChrome) so a project
// persists its own header/footer (logo + name + footer line) alongside the theme.
// MODIFIED-BY [SCOPE 115 / T004] — added nullable `tokens` + `designsystemslug`. THIS TIER
// IS LOAD-BEARING: `theme/execute` resolves from projectthemes, so without these columns a
// catalog-sourced look would lose its rich token set at the project boundary and the
// download would silently emit colour with no control files while reporting success.
export const projectthemes = pgTable(
  "projectthemes",
  {
    id: uuid("id").primaryKey(),
    projectid: uuid("projectid")
      .notNull()
      .references(() => companyprojects.id, { onDelete: "cascade" }),
    apptype: varchar("apptype", { length: 20 }).notNull(), // 'web' | 'desktop' | 'mobile'
    theme: jsonb("theme").$type<ProjectTheme>().notNull(),
    // SCOPE-106: per-project business chrome (nullable — projects without chrome render theme.css only).
    chrome: jsonb("chrome").$type<BusinessChrome>(),
    // SCOPE-107: per-project ordered blocks (nullable) executed to component code.
    blocks: jsonb("blocks").$type<NamedBlock[]>(),
    // SCOPE-114 (SPEC-115 / T004): the rich design-system token set, carried here by
    // `apply-template` from the company template. NULL for hand-built or URL-derived
    // themes, which continue to execute to exactly today's colour-only artifact set.
    // The carry-across must be written in BOTH the insert values and the
    // onConflictDoUpdate set clause — re-applying a profile to a project that already has
    // a theme takes the update path, and missing it there strands stale tokens.
    tokens: jsonb("tokens").$type<DesignSystemTokens>(),
    // Provenance by slug, not a foreign key: applying is a SNAPSHOT, so this copy must
    // survive its catalog entry being re-seeded or removed.
    designsystemslug: varchar("designsystemslug", { length: 80 }),
    // SCOPE-129 (SPEC-126 / T007): the brand schema — base theme, extension tokens,
    // typefaces, named modes under a declared contract, and the brand's rules. NULL for
    // every look that predates SCOPE-129, which continues to execute exactly as today.
    // Like `tokens` above, the carry-across must be written in BOTH the insert values and
    // the onConflictDoUpdate set clause: re-applying to a project that already has a theme
    // takes the update path, and missing it there silently drops the modes and rules while
    // the interface still reports success.
    brandschema: jsonb("brandschema").$type<BrandSchema>(),
    createdbyid: uuid("createdbyid").references(() => userprofiles.id, {
      onDelete: "set null",
    }),
    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    projectApptypeIdx: uniqueIndex("uq_projectthemes_project_apptype").on(
      table.projectid,
      table.apptype,
    ),
  }),
);
// [SCOPE 062 / T003] END

export type ProjectThemeRow = typeof projectthemes.$inferSelect;
export type NewProjectThemeRow = typeof projectthemes.$inferInsert;
