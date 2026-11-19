import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./company";

export const userinvitations = pgTable("userinvitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyid: uuid("companyid")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  status: varchar("status", { length: 50 }).default("pending"),
  expiresat: timestamp("expiresat").notNull(),
  invitedat: timestamp("invitedat").defaultNow().notNull(),
  acceptedat: timestamp("acceptedat"),
  usertype: varchar("usertype", { length: 20 }).default("TEAM_MEMBER"),
});

export type UserInvitation = typeof userinvitations.$inferSelect;
export type NewUserInvitation = typeof userinvitations.$inferInsert;
