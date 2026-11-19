import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { companysubscriptions } from "./companysubscription";

export const subscriptionbillingevents = pgTable(
  "subscriptionbillingevents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companysubscriptionid: uuid("companysubscriptionid")
      .references(() => companysubscriptions.id, { onDelete: "cascade" })
      .notNull(),
    eventtype: text("eventtype").notNull(),
    eventstatus: text("eventstatus").notNull(),
    stripeeventid: text("stripeeventid"),
    payload: jsonb("payload"),
    createdat: timestamp("createdat", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedat: timestamp("updatedat", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

export type SubscriptionBillingEvent =
  typeof subscriptionbillingevents.$inferSelect;
export type NewSubscriptionBillingEvent =
  typeof subscriptionbillingevents.$inferInsert;
