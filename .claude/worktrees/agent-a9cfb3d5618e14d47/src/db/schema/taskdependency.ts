import { pgTable, uuid, timestamp, unique } from "drizzle-orm/pg-core";
import { projecttasks } from "./projecttask";


export const taskdependencies = pgTable(
  "taskdependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskid: uuid("taskid")
      .notNull()
      .references(() => projecttasks.id, { onDelete: "cascade" }),
    blockedbyid: uuid("blockedbyid")
      .notNull()
      .references(() => projecttasks.id, { onDelete: "cascade" }),

    createdat: timestamp("createdat").defaultNow().notNull(),
  },
  (t) => ({
    uniq: unique().on(t.taskid, t.blockedbyid),
  })
);

export type TaskDependency = typeof taskdependencies.$inferSelect;
export type NewTaskDependency = typeof taskdependencies.$inferInsert;
