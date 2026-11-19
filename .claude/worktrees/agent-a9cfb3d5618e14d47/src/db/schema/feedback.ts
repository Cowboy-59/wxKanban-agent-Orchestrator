import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { projectphases } from "./projectphase";

export const feedbacks = pgTable("feedbacks", {
  id: uuid("id").primaryKey().defaultRandom(),
  phaseid: uuid("phaseid")
    .notNull()
    .references(() => projectphases.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 50 }).notNull(), // Type of feedback
  content: text("content").notNull(),
  status: varchar("status", { length: 50 }).default("open").notNull(), // 'open', 'resolved', 'dismissed'
  linkedspecid: uuid("linkedspecid"), // Reference to spec if feedback becomes a new requirement
  createdat: timestamp("createdat").defaultNow().notNull(),
  updatedat: timestamp("updatedat").defaultNow().notNull(),
});

export type Feedback = typeof feedbacks.$inferSelect;
export type NewFeedback = typeof feedbacks.$inferInsert;
