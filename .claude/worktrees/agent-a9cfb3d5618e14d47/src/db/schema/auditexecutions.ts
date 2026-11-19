import {
  pgTable,
  uuid,
  varchar,
  integer,
  decimal,
  timestamp,
  customType,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { wxkanbandocuments } from "./wxkanbandocuments";
import { projectspecifications } from "./projectspecification";
import { userprofiles } from "./userprofiles";


// Custom array type
const textArray = customType<{ data: string[] }>({
  dataType() {
    return "text[]";
  },
});

/**
 * Audit execution tracking.
 * Each row represents one run of the automated audit engine.
 * Tracks status, timing, and results summary.
 */
export const auditexecutions = pgTable("auditexecutions", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),

  // Execution type: 'manual' | 'scheduled' | 'pipeline_triggered'
  executiontype: varchar("executiontype", { length: 50 }).notNull(),

  // Who triggered this audit
  triggeredby: uuid("triggeredby").references(() => userprofiles.id, { onDelete: "set null" }),


  // Optional: specific spec being audited
  specid: uuid("specid").references(() => projectspecifications.id, { onDelete: "set null" }),


  // Feature scope being audited (e.g., 'authentication', 'billing')
  featurescope: varchar("featurescope", { length: 255 }),

  // Which frameworks were enabled during this audit
  enabledframeworks: textArray("enabledframeworks"),

  // Timing
  starttime: timestamp("starttime").defaultNow().notNull(),
  endtime: timestamp("endtime"),

  // Status: 'running' | 'completed' | 'failed' | 'cancelled'
  status: varchar("status", { length: 20 }).notNull().default("running"),

  // Results summary
  totaltasks: integer("totaltasks").notNull().default(0),
  passedtasks: integer("passedtasks").notNull().default(0),
  failedtasks: integer("failedtasks").notNull().default(0),
  reviewtasks: integer("reviewtasks").notNull().default(0),
  overallscore: decimal("overallscore", { precision: 5, scale: 2 }),

  // Link to generated report document
  reportdocumentid: uuid("reportdocumentid").references(() => wxkanbandocuments.id, { onDelete: "set null" }),

  createdat: timestamp("createdat").defaultNow().notNull(),
});

export type AuditExecution = typeof auditexecutions.$inferSelect;
export type NewAuditExecution = typeof auditexecutions.$inferInsert;
