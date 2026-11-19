/**
 * Sub-Assignment Schema
 * Spec 037 — Consultants Management (Engagement Core)
 *
 * The Consulting Company's internal distribution of an Engagement
 * Assignment to one or more of its own Consulting Members. Owned by
 * the Consulting Company's ADMIN or TEAM_MANAGER (FR-009 / FR-010).
 *
 * FR-009 AC3: sub-assignments are NOT visible to the Client; the only
 * Client-visible aggregate is FR-016 (members count + total hours + $).
 *
 * Soft-delete via `removedat`: removed sub-assignments preserve the
 * member's time-entry history per FR-018.
 */

import {
  pgTable,
  uuid,
  timestamp,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { userprofiles } from "./userprofiles";
import { engagementassignments } from "./engagementassignment";

// [SCOPE 037 / T004] BEGIN — subassignments table
export const subassignments = pgTable(
  "subassignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementassignmentid: uuid("engagementassignmentid").notNull(),
    consultingmemberid: uuid("consultingmemberid").notNull(),
    assignedat: timestamp("assignedat").defaultNow().notNull(),
    assignedbyid: uuid("assignedbyid").notNull(),
    removedat: timestamp("removedat"),
    removedbyid: uuid("removedbyid"),
  },
  (table) => {
    return {
      fkAssignment: foreignKey({
        columns: [table.engagementassignmentid],
        foreignColumns: [engagementassignments.id],
      }).onDelete("cascade"),

      fkMember: foreignKey({
        columns: [table.consultingmemberid],
        foreignColumns: [userprofiles.id],
      }).onDelete("restrict"),

      fkAssignedBy: foreignKey({
        columns: [table.assignedbyid],
        foreignColumns: [userprofiles.id],
      }).onDelete("set null"),

      fkRemovedBy: foreignKey({
        columns: [table.removedbyid],
        foreignColumns: [userprofiles.id],
      }).onDelete("set null"),

      idxAssignment: index("idx_subassignments_assignmentid").on(
        table.engagementassignmentid,
      ),
      idxMember: index("idx_subassignments_consultingmemberid").on(
        table.consultingmemberid,
      ),
      idxRemovedAt: index("idx_subassignments_removedat").on(table.removedat),
    };
  },
);
// [SCOPE 037 / T004] END

export type SubAssignment = typeof subassignments.$inferSelect;
export type NewSubAssignment = typeof subassignments.$inferInsert;
