import { pgTable, uuid, varchar, timestamp, unique } from "drizzle-orm/pg-core";
import { companyprojects } from "./companyproject";
import { userprofiles } from "./userprofiles";

export const projectusers = pgTable(
  "projectusers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectid: uuid("projectid")
      .notNull()
      .references(() => companyprojects.id, { onDelete: "cascade" }),
    userid: uuid("userid")
      .notNull()
      .references(() => userprofiles.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 50 }).notNull().default("TeamMember"),
    assignedat: timestamp("assignedat").defaultNow().notNull(),
    removedat: timestamp("removedat"),
  },
  (table) => {
    return {
      uniqueProjectUser: unique().on(table.projectid, table.userid),
    };
  },
);

export type ProjectUser = typeof projectusers.$inferSelect;
export type NewProjectUser = typeof projectusers.$inferInsert;
