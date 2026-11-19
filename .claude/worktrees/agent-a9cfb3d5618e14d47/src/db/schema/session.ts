import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { userprofiles } from "./userprofiles";

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userid: uuid("userid")
    .notNull()
    .references(() => userprofiles.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 1024 }).notNull(),
  expiresat: timestamp("expiresat").notNull(),
  createdat: timestamp("createdat").defaultNow().notNull(),
  updatedat: timestamp("updatedat").defaultNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
