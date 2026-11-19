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

// [SCOPE 046 / T002] BEGIN — marketingleads table (Marketing: lead capture & funnel)
// A captured signup/lead from a marketing site. The DB row is the source of truth;
// the new-lead notification is a best-effort leg (notifystatus pending|sent|failed)
// that never blocks or rolls back the capture (spec 043 resilience pattern).
export const marketingleads = pgTable(
  "marketingleads",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    companyid: uuid("companyid").references(() => companies.id, {
      onDelete: "cascade",
    }),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 255 }),
    sourceproperty: varchar("sourceproperty", { length: 20 }).notNull(), // windev | wxperts
    campaignid: uuid("campaignid").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    segment: varchar("segment", { length: 20 }).notNull(), // windev | careerchanger | broad — server-derived
    locale: varchar("locale", { length: 35 }).notNull(), // e.g. en-US, fr-FR
    company: varchar("company", { length: 255 }), // qualifying: prospect's company
    platformfrom: varchar("platformfrom", { length: 100 }), // qualifying: platform converting from
    status: varchar("status", { length: 20 }).default("new").notNull(), // new|contacted|qualified|onboarded|declined
    declinedreason: text("declinedreason"), // required when status = 'declined'
    notes: text("notes"), // appended internal notes (timestamped entries)
    notifystatus: varchar("notifystatus", { length: 20 })
      .default("pending")
      .notNull(), // pending|sent|failed — new-lead notification leg
    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("idx_marketingleads_status").on(table.status), // SysAdmin funnel
    segmentIdx: index("idx_marketingleads_segment").on(table.segment),
    campaignidIdx: index("idx_marketingleads_campaignid").on(table.campaignid),
  }),
);
// [SCOPE 046 / T002] END

export type MarketingLead = typeof marketingleads.$inferSelect;
export type NewMarketingLead = typeof marketingleads.$inferInsert;
