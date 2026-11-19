import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import type { ProjectTheme } from "../../shared/theme-tokens";
import type {
  DesignSystemTokens,
  NativeMode,
  SynthesizedMode,
} from "../../shared/design-system";

// designsystems (SCOPE-114 / T003) — the wxKanban-curated design-system catalog.
//
// THE MISSING `companyid` IS DELIBERATE. Every other theme table is tenant-scoped —
// projectthemes by project, companythemeprofiles and themetemplates and themeblocks by
// company — so a reviewer's reflex on seeing no tenant column here should be "is that a
// missed predicate?". It is not. This is wxKanban's own curated content, identical for
// every customer: 50 rows in total rather than 50 per company, seeded by an operator and
// read-only to users. Picking an entry COPIES it into the picking company's
// `themetemplates`, which is where tenant ownership begins. Consequently the catalog read
// routes carry no tenant filter, and the guard against leaking `sourcebrand` has to be
// explicit column selection backed by a contract test rather than a WHERE clause.
//
// Two columns are load-bearing and easy to misread:
//   `tokens` — the rich DesignSystemTokens set, the ONLY place control specifications,
//     the type scale, spacing and elevation live. `theme` cannot hold them.
//   `sourcebrand` — the originating product name. Traceability only. It must never be
//     selected into a client-bound payload nor written into a generated artifact.
// [SCOPE 115 / T003] BEGIN — designsystems table + migration 0057
export const designsystems = pgTable(
  "designsystems",
  {
    id: uuid("id").primaryKey(),
    /** Stable url-safe identifier and the idempotent upsert key for re-seeding. */
    slug: varchar("slug", { length: 80 }).notNull(),
    /** Descriptive, customer-facing title, e.g. "Electric Indigo on Near-Black". */
    name: varchar("name", { length: 120 }).notNull(),
    /** The system's own summary prose, shown on the browse card. */
    description: text("description").notNull(),
    /** Originating product name. Internal traceability ONLY — never serialised to a client. */
    sourcebrand: varchar("sourcebrand", { length: 80 }),
    /** The one mode the source system actually defines: 40 of 50 are light, 10 dark. */
    nativemode: varchar("nativemode", { length: 10 }).$type<NativeMode>().notNull(),
    /** Browse filter facets; first element is always the native mode. */
    tags: jsonb("tags").$type<string[]>().notNull(),
    /** The rich token set, verbatim from the source analysis. */
    tokens: jsonb("tokens").$type<DesignSystemTokens>().notNull(),
    /** The derived 19-token light + dark theme every shipped consumer already speaks. */
    theme: jsonb("theme").$type<ProjectTheme>().notNull(),
    /** Which mode was approximated rather than captured, so the UI can badge it. */
    synthesizedmode: varchar("synthesizedmode", { length: 10 })
      .$type<SynthesizedMode>()
      .notNull()
      .default("none"),
    /** The long-form design analysis, emitted into the bundle as AI build context. */
    analysis: text("analysis").notNull(),
    /** The self-contained showcase page, served only to the sandboxed preview iframe. */
    showcasehtml: text("showcasehtml").notNull(),
    /** Resolved, loadable CSS font stack — substitutions already applied. */
    fontstack: varchar("fontstack", { length: 255 }).notNull(),
    /** Webfont stylesheet href lifted from the showcase, or null when it declares none. */
    fontimporturl: varchar("fontimporturl", { length: 500 }),
    /** Catalog ordering; the seed script writes the curated map's array index. */
    sortorder: integer("sortorder").notNull().default(0),
    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex("uq_designsystems_slug").on(table.slug),
    sortorderIdx: index("idx_designsystems_sortorder").on(table.sortorder),
    nativemodeIdx: index("idx_designsystems_nativemode").on(table.nativemode),
  }),
);
// [SCOPE 115 / T003] END

export type DesignSystemRow = typeof designsystems.$inferSelect;
export type NewDesignSystemRow = typeof designsystems.$inferInsert;

/**
 * The columns the catalog list route may select.
 *
 * Named here rather than inlined at the call site so the exclusion of `sourcebrand`,
 * `showcasehtml` and `analysis` is a single reviewable decision instead of a habit
 * repeated in three handlers. `showcasehtml` alone is roughly 25 KB per row, so a
 * `SELECT *` regression would both leak the originating brand and ship about 1.9 MB
 * on every browse. SPEC-116's contract test asserts against this list.
 */
export const DESIGN_SYSTEM_LIST_COLUMNS = [
  "id",
  "slug",
  "name",
  "description",
  "nativemode",
  "tags",
  "theme",
  "synthesizedmode",
  "fontstack",
  "fontimporturl",
  "sortorder",
] as const;

/**
 * Columns that must NEVER appear in any client-bound payload from the catalog.
 *
 * `showcasehtml` is exempt from this rule on the dedicated showcase route only, which
 * returns it as `text/html` to the sandboxed iframe rather than as JSON.
 */
export const DESIGN_SYSTEM_PRIVATE_COLUMNS = ["sourcebrand"] as const;
