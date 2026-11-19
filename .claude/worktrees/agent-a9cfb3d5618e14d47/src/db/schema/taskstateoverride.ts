import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { projecttasks } from "./projecttask";
import { userprofiles } from "./userprofiles";

export const taskstateoverrides = pgTable(
  "taskstateoverrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskid: uuid("taskid")
      .notNull()
      .references(() => projecttasks.id, { onDelete: "cascade" }),
    userid: uuid("userid")
      .notNull()
      .references(() => userprofiles.id, { onDelete: "set null" }),
    status: varchar("status", { length: 20 }).notNull(),
    reason: text("reason"),
    resolvedat: timestamp("resolvedat"),
    createdat: timestamp("createdat").defaultNow().notNull(),
  },
  (table) => ({
    taskidIdx: index("idx_taskstateoverrides_taskid").on(table.taskid),
  }),
);

export type TaskStateOverride = typeof taskstateoverrides.$inferSelect;
export type NewTaskStateOverride = typeof taskstateoverrides.$inferInsert;
