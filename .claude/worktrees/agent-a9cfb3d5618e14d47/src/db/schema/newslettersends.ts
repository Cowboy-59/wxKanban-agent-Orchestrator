import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { newsletterissues } from "./newsletterissues";

// [SCOPE 064 / T004] BEGIN — newslettersends table (per-recipient send log)
// One row per (issue, recipient) attempt, written by NewsletterSendService as the
// background send runs. `contactid` references marketingcontacts (which has no
// Drizzle schema — the DB-level FK is added in the migration). The per-recipient
// rows back the issue's sent/failed tallies and give an audit trail + retry basis.
export const newslettersends = pgTable(
  "newslettersends",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    issueid: uuid("issueid")
      .references(() => newsletterissues.id, { onDelete: "cascade" })
      .notNull(),
    contactid: uuid("contactid"), // → marketingcontacts.id (FK added in migration) — marketing audience
    // [SCOPE 064 / T010] Amendment A — registered-user recipient (FK added in migration 0047).
    // Exactly one of contactid / userid is set, identifying which audience the row came from.
    userid: uuid("userid"), // → userprofiles.id
    email: varchar("email", { length: 320 }).notNull(),
    status: varchar("status", { length: 20 }).default("pending").notNull(), // pending|sent|failed
    error: text("error"),
    sentat: timestamp("sentat"),
  },
  (table) => ({
    issueidIdx: index("idx_newslettersends_issueid").on(table.issueid),
  }),
);
// [SCOPE 064 / T004] END

export type NewsletterSend = typeof newslettersends.$inferSelect;
export type NewNewsletterSend = typeof newslettersends.$inferInsert;
