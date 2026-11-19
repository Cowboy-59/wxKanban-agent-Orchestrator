import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { companyprojects } from "./companyproject";


export const projectphases = pgTable("projectphases", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectid: uuid("projectid")
    .notNull()
    .references(() => companyprojects.id, { onDelete: "cascade" }),

  phasename: varchar("phasename", { length: 50 }).notNull(), // 'Design', 'Implementation', 'QA', 'HumanTesting', 'Beta', 'Release'
  status: varchar("status", { length: 50 }).default("pending").notNull(), // 'pending', 'in_progress', 'complete', 'reopened'
  // DB column is character varying (not uuid) — kept as varchar to match actual schema
  assigneduserid: varchar("assigneduserid", { length: 100 }),
  enteredat: timestamp("enteredat"),
  completedat: timestamp("completedat"),
  reason: text("reason"),
  createdat: timestamp("createdat").defaultNow().notNull(),
});

export type ProjectPhase = typeof projectphases.$inferSelect;
export type NewProjectPhase = typeof projectphases.$inferInsert;
