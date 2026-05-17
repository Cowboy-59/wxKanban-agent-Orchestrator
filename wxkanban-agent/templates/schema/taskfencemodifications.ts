import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { taskfences } from "./taskfences";

export const taskfencemodifications = pgTable(
  "taskfencemodifications",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),

    taskfenceid: uuid("taskfenceid")
      .notNull()
      .references(() => taskfences.id, { onDelete: "cascade" }),

    modifierscope: text("modifierscope").notNull(),
    modifiertask: text("modifiertask").notNull(),
    description: text("description").notNull(),

    contenthashbefore: text("contenthashbefore").notNull(),
    contenthashafter: text("contenthashafter").notNull(),

    createdat: timestamp("createdat").defaultNow().notNull(),
  },
  (t) => ({
    fenceIdx: index("taskfencemodifications_fence_idx").on(t.taskfenceid),
    chronoIdx: index("taskfencemodifications_chrono_idx").on(
      t.taskfenceid,
      t.createdat,
    ),
  }),
);

export type TaskFenceModification = typeof taskfencemodifications.$inferSelect;
export type NewTaskFenceModification =
  typeof taskfencemodifications.$inferInsert;
