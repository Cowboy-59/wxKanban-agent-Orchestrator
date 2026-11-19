import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { projectspecifications } from "./projectspecification";

export const specificationphases = pgTable("specificationphases", {
  id: uuid("id").primaryKey().defaultRandom(),
  specificationid: uuid("specificationid")
    .notNull()
    .references(() => projectspecifications.id, { onDelete: "cascade" }),
  phase: varchar("phase", { length: 50 }).notNull(), // 'DESIGN', 'IMPLEMENTATION', 'QA', 'HUMAN_TESTING', 'BETA', 'RELEASE'
  enteredat: timestamp("enteredat").notNull(),
  exitedat: timestamp("exitedat"),
  approvedby: uuid("approvedby"),
  notes: text("notes"),
  blockers: text("blockers"), // JSON stringified array
  createdat: timestamp("createdat").defaultNow().notNull(),
});

export type SpecificationPhase = typeof specificationphases.$inferSelect;
export type NewSpecificationPhase = typeof specificationphases.$inferInsert;
