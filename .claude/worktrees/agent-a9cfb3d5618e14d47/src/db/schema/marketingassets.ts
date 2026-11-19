import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { companies } from "./company";
import { campaigns } from "./campaigns";

// [SCOPE 048 / T001] BEGIN — marketingassets table (Marketing: in-app asset library)
// A marketing asset: post, page, video, synopsis, image, or download. Text assets
// store `content`; binary assets store `fileurl` (a public-read S3/CloudFront URL,
// uploaded via admin-issued presigned PUT). Language variants of one asset share an
// `assetkey` and differ by `locale` — (assetkey, locale) is unique.
export const marketingassets = pgTable(
  "marketingassets",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    companyid: uuid("companyid").references(() => companies.id, {
      onDelete: "cascade",
    }),
    assetkey: varchar("assetkey", { length: 120 }).notNull(), // groups locale variants
    locale: varchar("locale", { length: 35 }).notNull(), // en-US, fr-FR, es, pt-BR, it, de
    type: varchar("type", { length: 20 }).notNull(), // post|page|video|synopsis|image|download|guide
    category: varchar("category", { length: 50 }).default("open").notNull(), // open|training|faq|trainingsession|bio|migrationguides — asset library section
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content"), // text/markdown body (nullable for binary types)
    fileurl: varchar("fileurl", { length: 1000 }), // public CloudFront URL (nullable for text types)
    targetsegment: varchar("targetsegment", { length: 20 }), // windev | careerchanger | broad
    campaignid: uuid("campaignid").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 20 }).default("draft").notNull(), // draft|scheduled|published
    createdbyid: uuid("createdbyid"),
    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    assetkeyLocaleUq: unique("uq_marketingassets_assetkey_locale").on(
      table.assetkey,
      table.locale,
    ),
    campaignidIdx: index("idx_marketingassets_campaignid").on(table.campaignid),
    statusIdx: index("idx_marketingassets_status").on(table.status),
    categoryIdx: index("idx_marketingassets_category").on(table.category),
  }),
);
// [SCOPE 048 / T001] END

export type MarketingAsset = typeof marketingassets.$inferSelect;
export type NewMarketingAsset = typeof marketingassets.$inferInsert;
