import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

export const taskfenceslegacy = pgTable(
  "taskfenceslegacy",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),

    projectid: uuid("projectid").notNull(),

    filepath: text("filepath").notNull(),
    contenthash: text("contenthash").notNull(),

    baselinedat: timestamp("baselinedat").defaultNow().notNull(),
  },
  (t) => ({
    uniqueFile: uniqueIndex("taskfenceslegacy_unique_file").on(
      t.projectid,
      t.filepath,
    ),
    projectIdx: index("taskfenceslegacy_projectid_idx").on(t.projectid),
  }),
);

export type TaskFenceLegacy = typeof taskfenceslegacy.$inferSelect;
export type NewTaskFenceLegacy = typeof taskfenceslegacy.$inferInsert;
