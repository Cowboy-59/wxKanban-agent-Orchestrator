import { pgTable, uuid, varchar, text, timestamp, integer } from "drizzle-orm/pg-core";
import { companyprojects } from "./companyproject";
import { userprofiles } from "./userprofiles";
import { projecttasks } from "./projecttask";


export const aiproposals = pgTable("aiproposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userid: uuid("userid")
    .notNull()
    .references(() => userprofiles.id, { onDelete: "cascade" }),
  projectid: uuid("projectid")
    .notNull()
    .references(() => companyprojects.id, { onDelete: "cascade" }),

  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  rationale: text("rationale"), // AI explanation for proposal
  priority: varchar("priority", { length: 20 }).default("medium"), // 'low', 'medium', 'high'
  effortestimate: integer("effortestimate"), // Estimated hours
  // Status tracking for acceptance rate calculation
  status: varchar("status", { length: 50 }).default("pending").notNull(), // 'pending', 'accepted', 'rejected', 'expired'
  decidedat: timestamp("decidedat"), // When user accepted/rejected
  taskid: uuid("taskid").references(() => projecttasks.id, {
    onDelete: "set null",
  }), // Created task if accepted

  createdat: timestamp("createdat").defaultNow().notNull(),
  expiresat: timestamp("expiresat"), // Proposal expiration (e.g., 24 hours)
});

export type AIProposal = typeof aiproposals.$inferSelect;
export type NewAIProposal = typeof aiproposals.$inferInsert;
