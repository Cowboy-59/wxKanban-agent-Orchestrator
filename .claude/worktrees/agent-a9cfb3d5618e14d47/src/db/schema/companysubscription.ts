import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { companies } from "./company";

export const companysubscriptions = pgTable("companysubscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyid: uuid("companyid")
    .references(() => companies.id, { onDelete: "cascade" })
    .notNull(),
  stripesubscriptionid: text("stripesubscriptionid").notNull(),
  stripecustomerid: text("stripecustomerid").notNull(),
  planname: text("planname").notNull(),
  planamount: numeric("planamount", { precision: 10, scale: 2 }).notNull(),
  activeuserlimit: integer("activeuserlimit"),
  overageamount: numeric("overageamount", { precision: 10, scale: 2 }),
  promotrialdays: integer("promotrialdays"),
  status: text("status").notNull(),
  currentperiodstart: timestamp("currentperiodstart", { withTimezone: true }),
  currentperiodend: timestamp("currentperiodend", { withTimezone: true }),
  canceledat: timestamp("canceledat", { withTimezone: true }),
  createdat: timestamp("createdat", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedat: timestamp("updatedat", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type CompanySubscription = typeof companysubscriptions.$inferSelect;
export type NewCompanySubscription = typeof companysubscriptions.$inferInsert;
