import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { companies } from "./company";
import { campaigns } from "./campaigns";
import { marketingassets } from "./marketingassets";

// [SCOPE 070 / T001] BEGIN — marketinglinks table (Banner Studio: first-class tracked redirect link)
// A tracked short link. `code` is the opaque, non-enumerable id in /r/:code; the
// redirect (SPEC-068) reads `destinationurl` server-side from this row (never from the
// URL — open-redirect-proof) and 302s with UTM appended. `clickcount` is a denormalized
// counter (the read path); per-hit detail lives in marketinglinkclicks. The link is
// reusable outside a banner — a text link, an email CTA, or a social post can all point
// at the same /r/:code.
export const marketinglinks = pgTable(
  "marketinglinks",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    companyid: uuid("companyid").references(() => companies.id, {
      onDelete: "cascade",
    }),
    campaignid: uuid("campaignid").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    code: varchar("code", { length: 32 }).notNull(), // opaque, non-enumerable — the :code in /r/:code
    destinationurl: varchar("destinationurl", { length: 1000 }).notNull(), // read server-side only
    utmsource: varchar("utmsource", { length: 80 }),
    utmmedium: varchar("utmmedium", { length: 80 }),
    utmcampaign: varchar("utmcampaign", { length: 120 }),
    clickcount: integer("clickcount").default(0).notNull(), // denormalized human-click counter (read path)
    assetid: uuid("assetid").references(() => marketingassets.id, {
      onDelete: "set null",
    }), // optional tie to an asset (banners use marketingbanners.linkid)
    status: varchar("status", { length: 20 }).default("active").notNull(), // active|archived
    createdbyid: uuid("createdbyid"),
    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    codeUq: unique("uq_marketinglinks_code").on(table.code),
    companyidIdx: index("idx_marketinglinks_companyid").on(table.companyid),
    campaignidIdx: index("idx_marketinglinks_campaignid").on(table.campaignid),
    statusIdx: index("idx_marketinglinks_status").on(table.status),
  }),
);
// [SCOPE 070 / T001] END

export type MarketingLink = typeof marketinglinks.$inferSelect;
export type NewMarketingLink = typeof marketinglinks.$inferInsert;
