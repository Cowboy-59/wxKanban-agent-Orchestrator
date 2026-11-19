import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companyprojects } from "./companyproject";
import { userprofiles } from "./userprofiles";
import { projectphases } from "./projectphase";
import { projectspecifications } from "./projectspecification";

export const projecttasks = pgTable("projecttasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectid: uuid("projectid")
    .notNull()
    .references(() => companyprojects.id, { onDelete: "cascade" }),
  phaseid: uuid("phaseid").references(() => projectphases.id, {
    onDelete: "set null",
  }),
  createdbyid: uuid("createdbyid").references(() => userprofiles.id, {
    onDelete: "set null",
  }),
  assignedtoid: uuid("assignedtoid").references(() => userprofiles.id, {
    onDelete: "set null",
  }),
  sourcepmssystem: varchar("sourcepmssystem", { length: 50 }), // 'jira', 'monday', 'asana', 'trello', or NULL
  externalid: varchar("externalid", { length: 255 }), // e.g., "JIRA-123"
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  assignedduty: varchar("assignedduty", { length: 255 }),
  nextduty: varchar("nextduty", { length: 255 }),
  issuetype: varchar("issuetype", { length: 50 }).default("task"), // 'task', 'bug', 'feature'
  priority: varchar("priority", { length: 50 }).default("medium").notNull(), // 'low', 'medium', 'high', 'critical'
  duedate: date("duedate"),
  status: varchar("status", { length: 50 }).default("open").notNull(), // 'open', 'in_progress', 'completed', 'orphaned'
  results: varchar("results", { length: 50 }), // 'pass', 'fail' — QA phase
  effort: varchar("effort", { length: 50 }), // 'small', 'medium', 'large', 'unknown'
  sourceoforigin: varchar("sourceoforigin", { length: 50 })
    .default("external")
    .notNull(), // 'external', 'internal', 'ai_proposed'
  specid: uuid("specid").references(() => projectspecifications.id, {
    onDelete: "set null",
  }),
  createdat: timestamp("createdat").defaultNow().notNull(),
  updatedat: timestamp("updatedat").defaultNow().notNull(),
}, (table) => ({
  externalIdx: index("idx_projecttasks_external")
    .on(table.sourcepmssystem, table.externalid)
    .where(sql`${table.externalid} IS NOT NULL`),
}));

export type ProjectTask = typeof projecttasks.$inferSelect;
export type NewProjectTask = typeof projecttasks.$inferInsert;
