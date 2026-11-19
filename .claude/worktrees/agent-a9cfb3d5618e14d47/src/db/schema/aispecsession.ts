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
import { companyprojects } from "./companyproject";
import { userprofiles } from "./userprofiles";
import { companies } from "./company";

export const aispecsessions = pgTable(
  "aispecsessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    specid: varchar("specid", { length: 50 }).notNull(),
    projectid: uuid("projectid")
      .notNull()
      .references(() => companyprojects.id, { onDelete: "cascade" }),
    userid: uuid("userid")
      .notNull()
      .references(() => userprofiles.id, { onDelete: "cascade" }),
    companyid: uuid("companyid")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).default("active").notNull(),
    starttime: timestamp("starttime").defaultNow().notNull(),
    endtime: timestamp("endtime"),
    overheadduration: integer("overheadduration").default(0).notNull(),
    totalduration: integer("totalduration"),
    taskcount: integer("taskcount").default(0).notNull(),
    summary: text("summary"),
    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    activeIdx: index("idx_aispecsessions_active")
      .on(table.specid, table.userid)
      .where(sql`${table.status} = 'active'`),
  }),
);

export type AiSpecSession = typeof aispecsessions.$inferSelect;
export type NewAiSpecSession = typeof aispecsessions.$inferInsert;
