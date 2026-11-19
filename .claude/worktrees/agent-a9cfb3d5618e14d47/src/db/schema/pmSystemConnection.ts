import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { userprofiles } from "./userprofiles";

export const pmsystemconnections = pgTable("pmsystemconnections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userid: uuid("userid")
    .notNull()
    .references(() => userprofiles.id, { onDelete: "cascade" }),
  pmsystem: varchar("pmsystem", { length: 50 }).notNull(), // 'jira', 'monday', 'asana', 'trello'
  accesstoken: varchar("accesstoken", { length: 1024 }).notNull(), // Encrypted
  refreshtoken: varchar("refreshtoken", { length: 1024 }).notNull(), // Encrypted
  expiresat: timestamp("expiresat").notNull(),
  lastsyncsat: timestamp("lastsyncsat"),
  syncstatus: varchar("syncstatus", { length: 50 }).default("active").notNull(), // 'active', 'expired', 'failed'
  createdat: timestamp("createdat").defaultNow().notNull(),
  updatedat: timestamp("updatedat").defaultNow().notNull(),
});

export type PMSystemConnection = typeof pmsystemconnections.$inferSelect;
export type NewPMSystemConnection = typeof pmsystemconnections.$inferInsert;
