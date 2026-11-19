import { pgTable, uuid, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { companyprojects } from "./companyproject";

export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectid: uuid("projectid")
    .notNull()
    .references(() => companyprojects.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  author: varchar("author", { length: 255 }), // Author name or user reference
  createdat: timestamp("createdat").defaultNow().notNull(),
  updatedat: timestamp("updatedat").defaultNow().notNull(),
});

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
