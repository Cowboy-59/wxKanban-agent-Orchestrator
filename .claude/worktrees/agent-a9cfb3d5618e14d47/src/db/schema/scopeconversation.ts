import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { projectspecifications } from "./projectspecification";


export const scopeconversations = pgTable("scopeconversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  scopeid: uuid("scopeid")
    .notNull()
    .references(() => projectspecifications.id, { onDelete: "cascade" }),

  role: varchar("role", { length: 10 }).notNull(), // 'user', 'assistant', 'system'
  content: text("content").notNull(),
  createdat: timestamp("createdat").defaultNow().notNull(),
});

export type ScopeConversation = typeof scopeconversations.$inferSelect;
export type NewScopeConversation = typeof scopeconversations.$inferInsert;
