import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projecttasks } from "./projecttask";
import { pmsystemconnections } from "./pmSystemConnection";

export const tasksyncrecords = pgTable(
  "tasksyncrecords",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskid: uuid("taskid")
      .notNull()
      .references(() => projecttasks.id, { onDelete: "cascade" }),
    pmconnectionid: uuid("pmconnectionid")
      .notNull()
      .references(() => pmsystemconnections.id, { onDelete: "cascade" }),
    pendingstatus: varchar("pendingstatus", { length: 20 }),
    lastsyncedat: timestamp("lastsyncedat"),
    lastsyncstatus: varchar("lastsyncstatus", { length: 20 }),
    lastsyncerror: text("lastsyncerror"),
    retrycount: integer("retrycount").default(0).notNull(),
    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    pendingIdx: index("idx_tasksyncrecords_pending")
      .on(table.lastsyncstatus)
      .where(sql`${table.lastsyncstatus} = 'pending'`),
  }),
);

export type TaskSyncRecord = typeof tasksyncrecords.$inferSelect;
export type NewTaskSyncRecord = typeof tasksyncrecords.$inferInsert;
