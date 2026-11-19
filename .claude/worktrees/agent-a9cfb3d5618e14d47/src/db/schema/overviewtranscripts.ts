import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { overviewdrafts } from "./overviewdrafts.js";

export const overviewtranscripts = pgTable("overviewtranscripts", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  overviewdraftid: uuid("overviewdraftid")
    .notNull()
    .references(() => overviewdrafts.id, { onDelete: "cascade" }),

  role: text("role").notNull(),

  content: text("content").notNull(),

  sectionkey: text("sectionkey"),

  sourceuri: text("sourceuri"),

  createdat: timestamp("createdat").defaultNow().notNull(),
});

export type OverviewTranscript = typeof overviewtranscripts.$inferSelect;
export type NewOverviewTranscript = typeof overviewtranscripts.$inferInsert;

export const OVERVIEW_TRANSCRIPT_ROLES = [
  "user",
  "assistant",
  "system",
] as const;

export type OverviewTranscriptRole =
  (typeof OVERVIEW_TRANSCRIPT_ROLES)[number];
