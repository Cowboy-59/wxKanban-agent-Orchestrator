import {
  pgTable,
  varchar,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { companies } from "./company";
import { userprofiles } from "./userprofiles";

/**
 * Company status enum values
 */
export type CompanyStatus = "ACTIVE" | "SUSPENDED" | "TRIAL" | "CANCELLED" | "PENDING";

/**
 * Company status history table for audit trail
 * Tracks all lifecycle changes with attribution
 */
export const companyStatusHistory = pgTable("company_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, {
    onDelete: "cascade",
  }),
  previousStatus: varchar("previous_status", { length: 50 }),
  newStatus: varchar("new_status", { length: 50 }).notNull(),
  reason: text("reason"),
  changedAt: timestamp("changed_at").defaultNow(),
  changedBy: uuid("changed_by").references(() => userprofiles.id, {
    onDelete: "set null",
  }),
  changedByType: varchar("changed_by_type", { length: 50 }).notNull().default("SYSADMIN"),
  metadata: jsonb("metadata"),
});

/**
 * Company analytics materialized view data
 * Aggregated metrics for company health scoring and reporting
 */
export const companyAnalytics = pgTable("company_analytics", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, {
    onDelete: "cascade",
  }),

  // User metrics
  totalUsers: integer("total_users").notNull().default(0),
  activeUsers: integer("active_users").notNull().default(0),
  lastLoginAt: timestamp("last_login_at"),

  // Project metrics
  totalProjects: integer("total_projects").notNull().default(0),
  activeProjects: integer("active_projects").notNull().default(0),
  completedProjects: integer("completed_projects").notNull().default(0),

  // Task metrics
  totalTasks: integer("total_tasks").notNull().default(0),
  completedTasks: integer("completed_tasks").notNull().default(0),
  overdueTasks: integer("overdue_tasks").notNull().default(0),

  // Time tracking metrics
  totalHoursLogged: integer("total_hours_logged").notNull().default(0),
  billableHours: integer("billable_hours").notNull().default(0),

  // Financial metrics
  mrr: integer("mrr").notNull().default(0),
  totalBilled: integer("total_billed").notNull().default(0),
  totalPaid: integer("total_paid").notNull().default(0),

  // Health score (0-100)
  healthScore: integer("health_score").notNull().default(0),

  // Metadata
  calculatedAt: timestamp("calculated_at").defaultNow(),
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),

  // Raw data snapshot
  rawData: jsonb("raw_data"),
});

export type CompanyStatusHistory = typeof companyStatusHistory.$inferSelect;
export type NewCompanyStatusHistory = typeof companyStatusHistory.$inferInsert;
export type CompanyAnalytics = typeof companyAnalytics.$inferSelect;
export type NewCompanyAnalytics = typeof companyAnalytics.$inferInsert;
