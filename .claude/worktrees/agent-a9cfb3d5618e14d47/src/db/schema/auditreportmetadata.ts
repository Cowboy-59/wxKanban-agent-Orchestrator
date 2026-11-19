import {
  pgTable,
  uuid,
  varchar,
  integer,
  decimal,
  timestamp,
  boolean,
  customType,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { wxkanbandocuments } from "./wxkanbandocuments";
import { auditexecutions } from "./auditexecutions";
import { userprofiles } from "./userprofiles";


// Custom array type
const textArray = customType<{ data: string[] }>({
  dataType() {
    return "text[]";
  },
});

/**
 * Extended metadata for generated audit reports.
 * Links audit execution to the stored report document.
 * Tracks review status and approval workflow.
 */
export const auditreportmetadata = pgTable("auditreportmetadata", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),

  // Link to the report document in wxkanbandocuments
  documentid: uuid("documentid")
    .notNull()
    .references(() => wxkanbandocuments.id, { onDelete: "cascade" }),

  // Link to the audit execution that generated this report
  executionid: uuid("executionid")
    .notNull()
    .references(() => auditexecutions.id, { onDelete: "cascade" }),

  // Which frameworks were included in this report
  frameworks: textArray("frameworks"),

  // Feature scope that was audited
  featurescope: varchar("featurescope", { length: 255 }),

  // When the audit was executed
  executiondate: timestamp("executiondate"),

  // Overall compliance score (percentage)
  overallcompliance: decimal("overallcompliance", { precision: 5, scale: 2 }),

  // Finding counts by severity
  criticalfindings: integer("criticalfindings").notNull().default(0),
  highfindings: integer("highfindings").notNull().default(0),
  mediumfindings: integer("mediumfindings").notNull().default(0),
  lowfindings: integer("lowfindings").notNull().default(0),

  // Remediation status: 'open' | 'in_progress' | 'resolved'
  remediationstatus: varchar("remediationstatus", { length: 20 }).notNull().default("open"),

  // Review workflow
  reviewedby: uuid("reviewedby").references(() => userprofiles.id, { onDelete: "set null" }),

  reviewdate: timestamp("reviewdate"),
  approved: boolean("approved").notNull().default(false),

  createdat: timestamp("createdat").defaultNow().notNull(),
});

export type AuditReportMetadata = typeof auditreportmetadata.$inferSelect;
export type NewAuditReportMetadata = typeof auditreportmetadata.$inferInsert;
