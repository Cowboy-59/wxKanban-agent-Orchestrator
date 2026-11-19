import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { companies } from "./company";
import { campaigns } from "./campaigns";
import { marketingassets } from "./marketingassets";

// [SCOPE 048 / T001] BEGIN — campaignposts table (Marketing: channel/post tracking + calendar)
// A tracked post on a specific channel for a campaign. Publishing is MANUAL — the
// post is composed/scheduled in-app (scheduledat drives the content calendar), a
// human posts to the channel, then records the liveurl and marks it published.
export const campaignposts = pgTable(
  "campaignposts",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    companyid: uuid("companyid").references(() => companies.id, {
      onDelete: "cascade",
    }),
    campaignid: uuid("campaignid")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    assetid: uuid("assetid").references(() => marketingassets.id, {
      onDelete: "set null",
    }),
    channel: varchar("channel", { length: 20 }).notNull(), // facebook|x|linkedin|forum|youtube|blog
    content: text("content"), // [SCOPE 065 / T009] the post's copy (AI-assisted, human-reviewed)
    locale: varchar("locale", { length: 35 }).notNull(),
    status: varchar("status", { length: 20 }).default("draft").notNull(), // draft|scheduled|published
    scheduledat: timestamp("scheduledat"), // [SCOPE 048 / T008] content-calendar slot
    liveurl: varchar("liveurl", { length: 1000 }), // set when manually published
    publishedat: timestamp("publishedat"),
    createdbyid: uuid("createdbyid"),
    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    campaignidIdx: index("idx_campaignposts_campaignid").on(table.campaignid),
    statusIdx: index("idx_campaignposts_status").on(table.status),
    scheduledatIdx: index("idx_campaignposts_scheduledat").on(table.scheduledat),
  }),
);
// [SCOPE 048 / T001] END

export type CampaignPost = typeof campaignposts.$inferSelect;
export type NewCampaignPost = typeof campaignposts.$inferInsert;
