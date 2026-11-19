import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { marketinglinks } from "./marketinglinks";

// [SCOPE 070 / T001] BEGIN — marketinglinkclicks table (Banner Studio: per-click event log)
// One row per /r/:code hit (populated in SPEC-068). Privacy-respecting: `iphash` is a
// salted/truncated hash (no raw IP, no PII) and `uaclass` coarsely classifies the hit as
// human|bot|preview. `counted=false` rows (bots, link unfurlers, HEAD prefetches) are
// stored but excluded from marketinglinks.clickcount so they never inflate the
// human-click counter.
export const marketinglinkclicks = pgTable(
  "marketinglinkclicks",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    linkid: uuid("linkid")
      .notNull()
      .references(() => marketinglinks.id, { onDelete: "cascade" }),
    clickedat: timestamp("clickedat").defaultNow().notNull(),
    iphash: varchar("iphash", { length: 64 }), // salted+truncated hash — no raw IP, no PII
    uaclass: varchar("uaclass", { length: 10 }).default("human").notNull(), // human|bot|preview
    referrer: varchar("referrer", { length: 1000 }),
    counted: boolean("counted").default(true).notNull(), // false for bots/previews — excluded from clickcount
  },
  (table) => ({
    linkidIdx: index("idx_marketinglinkclicks_linkid").on(table.linkid),
    clickedatIdx: index("idx_marketinglinkclicks_clickedat").on(
      table.clickedat,
    ),
  }),
);
// [SCOPE 070 / T001] END

export type MarketingLinkClick = typeof marketinglinkclicks.$inferSelect;
export type NewMarketingLinkClick = typeof marketinglinkclicks.$inferInsert;
