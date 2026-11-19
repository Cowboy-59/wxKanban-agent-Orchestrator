import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { auditexecutions } from "./auditexecutions";
import { complianceaudittasks } from "./complianceaudittasks";

/**
 * Individual audit task results.
 * Each row represents the result of checking one compliance task
 * against the codebase during an audit execution.
 */
export const auditresults = pgTable("auditresults", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),

  // Parent execution
  executionid: uuid("executionid")
    .notNull()
    .references(() => auditexecutions.id, { onDelete: "cascade" }),

  // The compliance task that was checked
  taskid: uuid("taskid")
    .notNull()
    .references(() => complianceaudittasks.id, { onDelete: "cascade" }),

  // Code location (if applicable)
  filepath: varchar("filepath", { length: 500 }),
  linenumber: integer("linenumber"),

  // Code snippet showing the issue (if found)
  codesnippet: text("codesnippet"),

  // Result status: 'pass' | 'fail' | 'needs_review' | 'not_applicable'
  resultstatus: varchar("resultstatus", { length: 20 }).notNull(),

  // Detailed explanation of the finding
  resultdetails: text("resultdetails"),

  // Suggested fix (may be template or generated)
  suggestedfix: text("suggestedfix"),

  // Severity: 'critical' | 'high' | 'medium' | 'low'
  severity: varchar("severity", { length: 20 }),

  createdat: timestamp("createdat").defaultNow().notNull(),
});

export type AuditResult = typeof auditresults.$inferSelect;
export type NewAuditResult = typeof auditresults.$inferInsert;
