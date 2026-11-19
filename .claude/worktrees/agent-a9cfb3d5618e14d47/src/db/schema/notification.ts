import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { userprofiles } from "./userprofiles";


export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userid: uuid("userid")
    .notNull()
    .references(() => userprofiles.id, { onDelete: "cascade" }),

  type: varchar("type", { length: 50 }).notNull(),
  // Notification type values:
  // 'task_assigned', 'task_due_tomorrow', 'phase_assigned', 'phase_tasks_complete',
  // 'phase_advanced', 'scope_submitted', 'scope_approved', 'qa_fail_bug_created',
  // 'task_approval_required', 'project_kit_ready'

  entityid: uuid("entityid"),
  entitytype: varchar("entitytype", { length: 50 }), // 'task', 'scope', 'phase'
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  createdat: timestamp("createdat").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
