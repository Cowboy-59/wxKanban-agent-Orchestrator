import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { companyprojects } from "./companyproject";
import { userprofiles } from "./userprofiles";


export const phasetransitionlogs = pgTable("phasetransitionlogs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectid: uuid("projectid")
    .notNull()
    .references(() => companyprojects.id, { onDelete: "cascade" }),

  sourcephase: varchar("sourcephase", { length: 50 }).notNull(), // Previous phase name
  targetphase: varchar("targetphase", { length: 50 }).notNull(), // New phase name
  transitionedat: timestamp("transitionedat").defaultNow().notNull(),
  reason: text("reason"), // Reason for transition or reopening
  userid: uuid("userid").references(() => userprofiles.id, {

    onDelete: "set null",
  }), // User who initiated the transition
  createdat: timestamp("createdat").defaultNow().notNull(),
});

export type PhaseTransitionLog = typeof phasetransitionlogs.$inferSelect;
export type NewPhaseTransitionLog = typeof phasetransitionlogs.$inferInsert;
