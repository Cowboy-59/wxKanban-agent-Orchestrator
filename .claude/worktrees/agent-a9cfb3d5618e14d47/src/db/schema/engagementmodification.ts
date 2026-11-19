/**
 * Engagement Modification Queue Schema
 * Spec 037 — Consultants Management (Engagement Core), T028 / FR-005 AC4
 *
 * Stores assignment modification requests made while an engagement is in a
 * non-active state (paused or disabled). On the next active-state transition
 * (resume or enable), the queue is drained in order: each row replayed against
 * the live assignment handler logic; `appliedat` set on success, `failedat`
 * + `erroredwith` set on failure.
 *
 * Hard cascade with engagements: ending an engagement drops any pending
 * queue rows along with it.
 */

import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  text,
  jsonb,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { engagements } from "./engagement";
import { userprofiles } from "./userprofiles";

// [SCOPE 037 / T028] BEGIN — engagementmodifications table
export const engagementmodifications = pgTable(
  "engagementmodifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementid: uuid("engagementid").notNull(),
    operationtype: varchar("operationtype", { length: 50 }).notNull(),
    payload: jsonb("payload").notNull(),
    queuedat: timestamp("queuedat").defaultNow().notNull(),
    queuedbyid: uuid("queuedbyid").notNull(),
    appliedat: timestamp("appliedat"),
    failedat: timestamp("failedat"),
    erroredwith: text("erroredwith"),
  },
  (table) => {
    return {
      fkEngagement: foreignKey({
        columns: [table.engagementid],
        foreignColumns: [engagements.id],
      }).onDelete("cascade"),

      fkQueuedBy: foreignKey({
        columns: [table.queuedbyid],
        foreignColumns: [userprofiles.id],
      }).onDelete("set null"),

      idxEngagement: index("idx_engagementmodifications_engagementid").on(
        table.engagementid,
      ),
      idxPending: index("idx_engagementmodifications_pending").on(
        table.engagementid,
        table.appliedat,
      ),
    };
  },
);
// [SCOPE 037 / T028] END

export type EngagementModification =
  typeof engagementmodifications.$inferSelect;
export type NewEngagementModification =
  typeof engagementmodifications.$inferInsert;
