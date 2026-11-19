import {
  pgTable,
  uuid,
  boolean,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { companyprojects } from "./companyproject.js";

/**
 * Per-PROJECT compliance framework configuration.
 *
 * SPEC-112 / FR-001 — enablement is per project, not per company: one company can
 * ship a HIPAA product and a non-HIPAA one, and "which frameworks cover this
 * generated product" is inherently a per-product question. Several frameworks may
 * be active on the same project at once.
 *
 * Transitional state: `appid` (company-keyed) is retained so pre-cutover readers
 * keep working. New per-project rows carry `appid = projectid`, which satisfies the
 * existing NOT NULL + UNIQUE constraint without colliding with company rows. Once
 * every reader moves to `projectid`, `appid` and the leftover company rows go.
 *
 * All frameworks are disabled by default. Disabling one never deletes historical
 * audit data.
 */
export const appauditconfiguration = pgTable("appauditconfiguration", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),

  // Legacy company-keyed identifier — retained until the reader cutover completes.
  appid: uuid("appid").notNull().unique(),

  // The authoritative key. Nullable only while legacy company rows still exist.
  projectid: uuid("projectid").references(() => companyprojects.id, {
    onDelete: "cascade",
  }),

  // Framework enablement flags — all disabled by default (opt-in)
  soc2enabled: boolean("soc2enabled").notNull().default(false),
  hipaaenabled: boolean("hipaaenabled").notNull().default(false),
  hitrustenabled: boolean("hitrustenabled").notNull().default(false),
  gdprenabled: boolean("gdprenabled").notNull().default(false),
  nistssdfenabled: boolean("nistssdfenabled").notNull().default(false),
  iso27001enabled: boolean("iso27001enabled").notNull().default(false),

  // Audit execution settings
  autoauditondeploy: boolean("autoauditondeploy").notNull().default(true),
  autoauditschedule: varchar("autoauditschedule", { length: 20 }).notNull().default("weekly"),
  auditseveritythreshold: varchar("auditseveritythreshold", { length: 20 }).notNull().default("medium"),
  failoncritical: boolean("failoncritical").notNull().default(true),
  auditreportretentiondays: integer("auditreportretentiondays").notNull().default(365),

  createdat: timestamp("createdat").defaultNow().notNull(),
  updatedat: timestamp("updatedat").defaultNow().notNull(),
}, (table) => ({
  // Partial unique: one config per project, while legacy company rows keep projectid null.
  projectidUnique: uniqueIndex("appauditconfiguration_projectid_unique")
    .on(table.projectid)
    .where(sql`${table.projectid} is not null`),
}));

export type AppAuditConfiguration = typeof appauditconfiguration.$inferSelect;
export type NewAppAuditConfiguration = typeof appauditconfiguration.$inferInsert;
