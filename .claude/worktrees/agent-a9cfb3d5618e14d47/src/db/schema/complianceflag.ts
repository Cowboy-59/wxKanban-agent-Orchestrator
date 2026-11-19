import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { projecttasks } from "./projecttask";
import { userprofiles } from "./userprofiles";

export const complianceflags = pgTable(
  "complianceflags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskid: uuid("taskid")
      .notNull()
      .references(() => projecttasks.id, { onDelete: "cascade" }),
    ruletype: varchar("ruletype", { length: 50 }).notNull(),
    triggeredbyid: uuid("triggeredbyid").references(() => userprofiles.id, {
      onDelete: "set null",
    }),
    flaggedat: timestamp("flaggedat").notNull().defaultNow(),
    resolvedat: timestamp("resolvedat"),
  },
  (table) => ({
    taskidIdx: index("idx_complianceflags_taskid").on(table.taskid),
    ruletypeIdx: index("idx_complianceflags_ruletype").on(table.ruletype),
    resolvedatIdx: index("idx_complianceflags_resolvedat").on(table.resolvedat),
  }),
);

export type ComplianceFlag = typeof complianceflags.$inferSelect;
export type NewComplianceFlag = typeof complianceflags.$inferInsert;