import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { companyprojects } from "./companyproject";

import { projectphases } from "./projectphase";
import { userprofiles } from "./userprofiles";


export const projectspecifications = pgTable("projectspecifications", {

  id: uuid("id").primaryKey().defaultRandom(),
  projectid: uuid("projectid")
    .notNull()
    .references(() => companyprojects.id, { onDelete: "cascade" }),

  phaseid: uuid("phaseid").references(() => projectphases.id, {
    onDelete: "set null",
  }),
  specnumber: varchar("specnumber", { length: 10 }).notNull(), // '001', '002', etc.
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  // Lifecycle status values:
  // 'draft', 'in_review', 'pending_clarification', 'clarified', 'planned',
  // 'tasks_generated', 'implementing', 'implemented', 'qa_passed', 'human_tested',
  // 'beta_cleared', 'released', 'deferred', 'archived'
  // 'archived' = non-destructive retire from working surfaces (SCOPE-103); free varchar, no migration.
  status: varchar("status", { length: 50 }).default("draft").notNull(),
  specorder: integer("specorder").default(0).notNull(),
  isoptional: boolean("isoptional").default(false).notNull(),
  createdbyid: uuid("createdbyid").references(() => userprofiles.id, {

    onDelete: "set null",
  }),
  createdat: timestamp("createdat").defaultNow().notNull(),
  approvedat: timestamp("approvedat"),
  // [SCOPE 058 / T001] BEGIN — scope check-out claim (who is working it, when claimed)
  claimedbyid: uuid("claimedbyid").references(() => userprofiles.id, {
    onDelete: "set null",
  }),
  claimedat: timestamp("claimedat"),
  // [SCOPE 058 / T001] END
  updatedat: timestamp("updatedat").defaultNow().notNull(),
}, (table) => ({
  // [SCOPE 058 dedup] One spec per (project, specnumber) — prevents the duplicate
  // rows createSpecs produced. Applied directly to prod 2026-06-20; named to match.
  projectSpecnumberUnique: uniqueIndex("idx_projectspec_project_specnumber").on(
    table.projectid,
    table.specnumber,
  ),
}));

export type ProjectSpecification = typeof projectspecifications.$inferSelect;
export type NewProjectSpecification = typeof projectspecifications.$inferInsert;
