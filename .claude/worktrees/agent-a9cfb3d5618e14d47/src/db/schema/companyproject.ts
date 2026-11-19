import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { userprofiles } from "./userprofiles";

import { companies } from "./company";
import { customers } from "./customer.js"; // [SCOPE 119 / T003]

export const companyprojects = pgTable("companyprojects", {

  id: uuid("id").primaryKey().defaultRandom(),
  userid: uuid("userid")
    .notNull()
    .references(() => userprofiles.id, { onDelete: "cascade" }),

  companyid: uuid("companyid").references(() => companies.id, {
    onDelete: "cascade",
  }),

  // [SCOPE 119 / T003] The client this project is being done for. Nullable — an
  // unassigned project behaves exactly as it did before this column existed.
  //
  // One customer per project, never many: a time entry rolls up to a project, and
  // if that project had two customers nothing could say which one to invoice
  // (SPEC-119 FR-006). A genuinely shared engagement is modelled as two projects.
  //
  // ORDERING: the column was added to production by 0059_scope119_customers.sql on
  // 2026-07-31 BEFORE this declaration shipped. That order is mandatory — Drizzle
  // emits every declared column in its SELECT list, so declaring ahead of the DDL
  // returns 42703 on every companyprojects query and takes the dashboard, Work Hub
  // and project list down together.
  customerid: uuid("customerid").references(() => customers.id, {
    onDelete: "set null",
  }),

  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  pmsystems: varchar("pmsystems", { length: 255 }), // Comma-separated: 'jira,monday,asana'
  hourlyrate: numeric("hourlyrate", { precision: 10, scale: 2 }),
  allocatedhours: numeric("allocatedhours", { precision: 10, scale: 2 }),
  status: varchar("status", { length: 20 }).default("ACTIVE").notNull(),
  currentphase: varchar("currentphase", { length: 50 })
    .default("Design")
    .notNull(),
  // [SCOPE 112 / T010] MODIFIED-BY — framework names were harvested out of
  // `securityclassification` into appauditconfiguration by migration 0012. The column
  // now means data classification only ('NONE', 'HIGH'), per SPEC-112 open question 2.
  securityclassification: varchar("securityclassification", { length: 50 }),
  // [SCOPE 112 / T010] `audittype` was removed here. It was superseded by
  // appauditconfiguration, which is per-project and holds a SET of frameworks rather
  // than one varchar; every value it held was migrated by 0010 and 0012.
  //
  // Removing the DECLARATION is what makes the column droppable. Drizzle names every
  // declared column in its SELECTs, so while this line existed the deployed bundle
  // asked for `audittype` on every companyprojects query — which is why dropping the
  // column ahead of this change 500'd every signed-in dashboard load on 2026-07-28.
  // Declaration first, deploy, then drop. Never the other way round.
  // [SCOPE 111 / Amendment A] BEGIN — project-level testing opt-out
  // Turns the whole test gate off for this project: forced items stop blocking
  // phase advance and release. Deliberately NOT silent — the gate still reports
  // what WOULD have blocked, labelled as skipped, so a green release never
  // looks like it was earned. Administrator-only and audited.
  skiptesting: boolean("skiptesting").default(false).notNull(),
  // [SCOPE 111 / Amendment A] END
  // [SCOPE 145 / T001] BEGIN — "Allow remote" per project (SCOPE-132 Amendment B, FR-036)
  // Lets this project's agent (the remote) start; the server refuses every start while it is
  // off. Changed by a company ADMIN or the project's TEAM_MANAGER, audited. Applied by hand and
  // verified 2026-10-25 before this declaration (SCOPE-117 change log).
  allowremote: boolean("allowremote").default(false).notNull(),
  // [SCOPE 145 / T001] END
  // [SCOPE 005 / T002] BEGIN — billed flag and Resource rate override (FR-002, FR-008)
  // Declared ONLY after 0072_scope005_time_billing.sql was hand-applied and verified
  // (2026-11-01; SCOPE-117 change log). `hourlyrate` above is the Developer rate
  // override; `resourcerate` is the Resource override. NULL = use the company default.
  // Only billed projects with a Customer appear on statements.
  billed: boolean("billed").default(false).notNull(),
  resourcerate: numeric("resourcerate", { precision: 10, scale: 2 }),
  // [SCOPE 005 / T002] END
  // [SCOPE 154 / T001] BEGIN — Autopilot switch (SCOPE-132 Amendment H, FR-001)
  // Lets this project's agent work the dev plan unattended. Off by default; only settable
  // where allowremote is already on, by the same roles that can change allowremote (enforced
  // in the API route, not here). Turning allowremote off also turns this off (API route).
  // Applied by hand and verified 2026-11-07 before this declaration (SCOPE-117 change log).
  autopilotenabled: boolean("autopilotenabled").default(false).notNull(),
  // [SCOPE 154 / T001] END
  createdat: timestamp("createdat").defaultNow().notNull(),
  updatedat: timestamp("updatedat").defaultNow().notNull(),
});

export type CompanyProject = typeof companyprojects.$inferSelect;
export type NewCompanyProject = typeof companyprojects.$inferInsert;
