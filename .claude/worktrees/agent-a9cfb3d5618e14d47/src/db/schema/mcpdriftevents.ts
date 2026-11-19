import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { companyprojects } from "./companyproject.js";

export const mcpdriftevents = pgTable("mcpdriftevents", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectid: uuid("projectid")
    .notNull()
    .references(() => companyprojects.id, { onDelete: "cascade" }),
  projectidentifier: varchar("projectidentifier", { length: 255 }).notNull(),
  mcpversionmain: varchar("mcpversionmain", { length: 50 }).notNull(),
  mcpversionkit: varchar("mcpversionkit", { length: 50 }).notNull(),
  changedpaths: jsonb("changedpaths").notNull().default([]),
  severity: varchar("severity", { length: 20 }).notNull(),
  githubfeedbackref: varchar("githubfeedbackref", { length: 500 }),
  resolvedstatus: varchar("resolvedstatus", { length: 20 })
    .notNull()
    .default("open"),
  resolvedat: timestamp("resolvedat", { withTimezone: true }),
  createdat: timestamp("createdat", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type McpDriftEvent = typeof mcpdriftevents.$inferSelect;
export type NewMcpDriftEvent = typeof mcpdriftevents.$inferInsert;
