import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

export const taskfencehistory = pgTable(
  "taskfencehistory",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),

    projectid: uuid("projectid").notNull(),

    filepath: text("filepath").notNull(),
    unitkind: text("unitkind").notNull(),
    unitname: text("unitname").notNull(),

    priorownerscope: text("priorownerscope").notNull(),
    priorownertask: text("priorownertask").notNull(),
    replacedbyscope: text("replacedbyscope").notNull(),
    replacedbytask: text("replacedbytask").notNull(),

    closedat: timestamp("closedat").defaultNow().notNull(),
  },
  (t) => ({
    projectIdx: index("taskfencehistory_projectid_idx").on(t.projectid),
    unitIdx: index("taskfencehistory_unit_idx").on(
      t.projectid,
      t.filepath,
      t.unitname,
    ),
  }),
);

export type TaskFenceHistory = typeof taskfencehistory.$inferSelect;
export type NewTaskFenceHistory = typeof taskfencehistory.$inferInsert;
