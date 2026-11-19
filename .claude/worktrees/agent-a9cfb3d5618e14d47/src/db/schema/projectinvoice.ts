import {
  pgTable,
  uuid,
  varchar,
  numeric,
  boolean,
  timestamp,
  text,
  date,
} from "drizzle-orm/pg-core";
import { companyprojects } from "./companyproject";
import { companies } from "./company";
import { customers } from "./customer.js"; // [SCOPE 005 / T002]

export const projectinvoices = pgTable("projectinvoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectid: uuid("projectid").references(() => companyprojects.id, {
    onDelete: "cascade",
  }),
  companyid: uuid("companyid")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  clientemail: varchar("clientemail", { length: 255 }),
  invoicenumber: varchar("invoicenumber", { length: 50 }).notNull(),
  billedto: varchar("billedto", { length: 255 }),
  generatedat: timestamp("generatedat").defaultNow().notNull(),
  totalamount: numeric("totalamount", { precision: 12, scale: 2 }).notNull(),
  hoursworked: numeric("hoursworked", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  downloadurl: varchar("downloadurl", { length: 1024 }),
  emailsent: boolean("emailsent").default(false).notNull(),
  sentat: timestamp("sentat"),
  // [SCOPE 005 / T002] BEGIN — client statement per Customer and period (FR-009)
  // Declared ONLY after 0072_scope005_time_billing.sql was hand-applied and verified
  // (2026-11-01; SCOPE-117 change log). A statement covers all of one Customer's billed
  // projects, so `projectid` stays NULL on it. RESTRICT: customers are archive-only.
  customerid: uuid("customerid").references(() => customers.id, { onDelete: "restrict" }),
  periodstart: date("periodstart", { mode: "string" }),
  periodend: date("periodend", { mode: "string" }),
  developerhours: numeric("developerhours", { precision: 10, scale: 2 }),
  resourcehours: numeric("resourcehours", { precision: 10, scale: 2 }),
  // [SCOPE 005 / T002] END
  createdat: timestamp("createdat").defaultNow().notNull(),
});

export type ProjectInvoice = typeof projectinvoices.$inferSelect;
export type NewProjectInvoice = typeof projectinvoices.$inferInsert;
