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

// [SCOPE 046 / T001] BEGIN — campaigns table (minimal; extended in spec 048)
// MODIFIED-BY [SCOPE 048 / T001] — added goal, startdate, createdbyid (full CRUD).
// A marketing campaign (e.g. the July 5 2026 launch). 046 created the minimal
// shape so leads attribute via campaignid; 048 extends it for full management.
export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    companyid: uuid("companyid").references(() => companies.id, {
      onDelete: "cascade",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    goal: text("goal"), // [SCOPE 048 / T001]
    segment: varchar("segment", { length: 20 }).notNull(), // windev | careerchanger | broad
    startdate: timestamp("startdate"), // [SCOPE 048 / T001]
    launchdate: timestamp("launchdate"),
    status: varchar("status", { length: 20 }).default("planned").notNull(), // planned|active|completed|archived
    createdbyid: uuid("createdbyid"), // [SCOPE 048 / T001] authoring admin (no FK constraint — nullable)
    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("idx_campaigns_status").on(table.status),
  }),
);
// [SCOPE 046 / T001] END

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
