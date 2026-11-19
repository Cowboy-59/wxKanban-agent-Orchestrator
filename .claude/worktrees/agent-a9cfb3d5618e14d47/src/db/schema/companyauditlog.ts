import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { companies } from "./company";
import { userprofiles } from "./userprofiles";

export const companyauditlogs = pgTable("companyauditlogs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyid: uuid("companyid")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 100 }).notNull(),
  changedby: uuid("changedby").references(() => userprofiles.id, {
    onDelete: "set null",
  }),
  previousvalue: jsonb("previousvalue"),
  newvalue: jsonb("newvalue"),
  description: text("description"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export type CompanyAuditLog = typeof companyauditlogs.$inferSelect;
export type NewCompanyAuditLog = typeof companyauditlogs.$inferInsert;
