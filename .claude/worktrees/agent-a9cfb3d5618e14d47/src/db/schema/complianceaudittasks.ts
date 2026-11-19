import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  customType,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { wxkanbandocuments } from "./wxkanbandocuments";

// Custom array types
const textArray = customType<{ data: string[] }>({
  dataType() {
    return "text[]";
  },
});

/**
 * Extracted analyzable compliance tasks from framework documents.
 * Each task represents a specific compliance requirement that can be
 * checked against code (automated) or manually reviewed.
 */
export const complianceaudittasks = pgTable("complianceaudittasks", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),

  // Source document
  documentid: uuid("documentid").references(() => wxkanbandocuments.id, { onDelete: "cascade" }),

  // Compliance framework: 'SOC2' | 'HIPAA' | 'HITRUST' | 'GDPR'
  framework: varchar("framework", { length: 50 }).notNull(),

  // Category: 'Access Control' | 'Encryption' | 'Audit Logging' | etc.
  category: varchar("category", { length: 100 }).notNull(),

  // Control reference: 'CC6.1' | '§164.312(a)' | '02.a.1' | 'Article 32'
  controlreference: varchar("controlreference", { length: 50 }),

  // Priority: 'critical' | 'high' | 'medium' | 'low'
  priority: varchar("priority", { length: 20 }).notNull(),

  // Task type: 'code_pattern' | 'configuration' | 'process' | 'documentation'
  tasktype: varchar("tasktype", { length: 50 }).notNull(),

  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),

  // Original requirement text from the compliance document
  requirementtext: text("requirementtext"),

  // How to check this task
  // 'static_analysis' | 'regex_pattern' | 'ast_query' | 'manual_review'
  checkmethod: varchar("checkmethod", { length: 50 }),

  // Regex pattern, AST query, or check logic
  checkpattern: text("checkpattern"),

  // Template for remediation
  suggestedfix: text("suggestedfix"),

  // Applicable SDLC phases: ['design', 'development', 'testing', 'deployment']
  applicablephases: textArray("applicablephases"),

  // File types this task applies to: ['.ts', '.tsx', '.sql', '.json']
  applicablefiletypes: textArray("applicablefiletypes"),

  // Whether this task can be automated (false = manual review required)
  isautomated: boolean("isautomated").notNull().default(true),

  createdat: timestamp("createdat").defaultNow().notNull(),
});

export type ComplianceAuditTask = typeof complianceaudittasks.$inferSelect;
export type NewComplianceAuditTask = typeof complianceaudittasks.$inferInsert;
