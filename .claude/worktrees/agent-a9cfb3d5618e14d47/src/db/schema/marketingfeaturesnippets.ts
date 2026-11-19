import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

// [SCOPE 096 / T001] BEGIN — marketingfeaturesnippets sidecar table
// Per-feature config for the Marketing Feature Snippets manager (SCOPE-096).
// The snippet COPY + on/off live in marketingassets (type='synopsis',
// assetkey='feature-<slug>', status published|draft). This sidecar holds the
// per-feature attributes that are NOT per-locale: the CTA link, carousel dwell,
// the enhanced/featured flag, display order, and the source scope it was drafted
// from. One row per feature, keyed 1:1 to the marketingassets assetkey.
export const marketingfeaturesnippets = pgTable(
  "marketingfeaturesnippets",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    assetkey: varchar("assetkey", { length: 120 }).notNull().unique(), // feature-<slug>; matches marketingassets.assetkey
    ctaurl: varchar("ctaurl", { length: 1000 }), // clickable CTA target (nullable)
    dwellms: integer("dwellms").default(5000).notNull(), // carousel display duration
    enhanced: boolean("enhanced").default(false).notNull(), // featured treatment (longer dwell + zoom + glow)
    sortorder: integer("sortorder").default(0).notNull(), // carousel order (lower = earlier)
    sourcescope: varchar("sourcescope", { length: 120 }), // Project-Scope ref for add-by-scope (nullable)
    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    sortorderIdx: index("idx_marketingfeaturesnippets_sortorder").on(
      table.sortorder,
    ),
  }),
);
// [SCOPE 096 / T001] END

export type MarketingFeatureSnippet =
  typeof marketingfeaturesnippets.$inferSelect;
export type NewMarketingFeatureSnippet =
  typeof marketingfeaturesnippets.$inferInsert;
