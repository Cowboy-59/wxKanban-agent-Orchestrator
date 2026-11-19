/**
 * Engagement Assignment Schema
 * Spec 037 — Consultants Management (Engagement Core)
 *
 * Records a single grant on an Engagement: either scope-level (whole
 * scope) or task-level (specific task). FR-006: exactly one of scopeid
 * or taskid is populated per row (enforced by DB check constraint).
 * Mixed-granularity assignments per Engagement allowed.
 *
 * `scopeid` is `text`, not a FK — scope numbers are filesystem-immutable
 * by convention (CLAUDE.md fencing rules). App-layer validation handles
 * referential integrity. `projectid` is denormalized for multi-project
 * filtering on the Engagement view.
 *
 * Soft-delete via `removedat` (FR-005 AC2): removed assignments preserve
 * time-entry history.
 */

import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { userprofiles } from "./userprofiles";
import { engagements } from "./engagement";
import { companyprojects } from "./companyproject";
import { projecttasks } from "./projecttask";

// [SCOPE 037 / T003] BEGIN — engagementassignments table
export const engagementassignments = pgTable(
  "engagementassignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementid: uuid("engagementid").notNull(),
    scopeid: varchar("scopeid", { length: 32 }),
    taskid: uuid("taskid"),
    projectid: uuid("projectid").notNull(),
    addedat: timestamp("addedat").defaultNow().notNull(),
    addedbyid: uuid("addedbyid").notNull(),
    removedat: timestamp("removedat"),
    removedbyid: uuid("removedbyid"),
  },
  (table) => {
    return {
      fkEngagement: foreignKey({
        columns: [table.engagementid],
        foreignColumns: [engagements.id],
      }).onDelete("cascade"),

      fkTask: foreignKey({
        columns: [table.taskid],
        foreignColumns: [projecttasks.id],
      }).onDelete("set null"),

      fkProject: foreignKey({
        columns: [table.projectid],
        foreignColumns: [companyprojects.id],
      }).onDelete("cascade"),

      fkAddedBy: foreignKey({
        columns: [table.addedbyid],
        foreignColumns: [userprofiles.id],
      }).onDelete("set null"),

      fkRemovedBy: foreignKey({
        columns: [table.removedbyid],
        foreignColumns: [userprofiles.id],
      }).onDelete("set null"),

      // FR-006: at most one of scopeid or taskid is populated. Both null is
      // a project-level grant (covers all scopes/tasks under projectid).
      chkScopeOrTask: check(
        "chk_engagementassignments_scope_or_task",
        sql`NOT (scopeid IS NOT NULL AND taskid IS NOT NULL)`,
      ),

      idxEngagement: index("idx_engagementassignments_engagementid").on(
        table.engagementid,
      ),
      idxProject: index("idx_engagementassignments_projectid").on(
        table.projectid,
      ),
      idxScope: index("idx_engagementassignments_scopeid").on(table.scopeid),
      idxTask: index("idx_engagementassignments_taskid").on(table.taskid),
      idxRemovedAt: index("idx_engagementassignments_removedat").on(
        table.removedat,
      ),
    };
  },
);
// [SCOPE 037 / T003] END

export type EngagementAssignment = typeof engagementassignments.$inferSelect;
export type NewEngagementAssignment =
  typeof engagementassignments.$inferInsert;
