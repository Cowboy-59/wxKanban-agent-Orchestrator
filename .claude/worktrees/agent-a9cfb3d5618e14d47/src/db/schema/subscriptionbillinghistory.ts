import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { companysubscriptions } from "./companysubscription";

export const subscriptionbillinghistory = pgTable(
  "subscriptionbillinghistory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companysubscriptionid: uuid("companysubscriptionid")
      .references(() => companysubscriptions.id, { onDelete: "cascade" })
      .notNull(),
    historytype: text("historytype").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }),
    referencedocid: text("referencedocid"),
    displaylabel: text("displaylabel").notNull(),
    occurredat: timestamp("occurredat", { withTimezone: true }).notNull(),
    createdat: timestamp("createdat", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedat: timestamp("updatedat", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

export type SubscriptionBillingHistory =
  typeof subscriptionbillinghistory.$inferSelect;
export type NewSubscriptionBillingHistory =
  typeof subscriptionbillinghistory.$inferInsert;
