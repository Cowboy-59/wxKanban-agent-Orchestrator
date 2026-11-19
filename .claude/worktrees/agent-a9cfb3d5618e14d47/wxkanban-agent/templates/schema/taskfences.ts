import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

export const taskfences = pgTable(
  "taskfences",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),

    projectid: uuid("projectid").notNull(),

    filepath: text("filepath").notNull(),
    unitkind: text("unitkind").notNull(),
    unitname: text("unitname").notNull(),

    ownerscope: text("ownerscope").notNull(),
    ownertask: text("ownertask").notNull(),
    description: text("description").notNull(),

    contenthash: text("contenthash").notNull(),
    linestart: integer("linestart").notNull(),
    lineend: integer("lineend").notNull(),

    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (t) => ({
    uniqueUnit: uniqueIndex("taskfences_unique_unit").on(
      t.projectid,
      t.filepath,
      t.unitkind,
      t.unitname,
    ),
    projectIdx: index("taskfences_projectid_idx").on(t.projectid),
    ownerIdx: index("taskfences_owner_idx").on(t.ownerscope, t.ownertask),
  }),
);

export type TaskFence = typeof taskfences.$inferSelect;
export type NewTaskFence = typeof taskfences.$inferInsert;

export const TASK_FENCE_UNIT_KINDS = [
  "function",
  "class",
  "route",
  "table",
  "migration",
  "component",
] as const;

export type TaskFenceUnitKind = (typeof TASK_FENCE_UNIT_KINDS)[number];
