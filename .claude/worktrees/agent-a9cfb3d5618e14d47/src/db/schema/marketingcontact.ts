/**
 * Marketing contacts schema.
 *
 * This table already exists in production and holds live campaign data. It is
 * declared here NOT to create it, but to protect it: while a live table is
 * undeclared, any reconcile-to-declared operation (e.g. `drizzle-kit push`)
 * treats it as an object to drop.
 *
 * The declaration below mirrors the deployed structure exactly, so schema
 * generation produces no diff for it.
 */

import { pgTable, uuid, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// [SCOPE 117 / T005] BEGIN — Marketing contacts (declaration mirrors deployed table)
export const marketingcontacts = pgTable("marketingcontacts", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  cell: text("cell"),
  platform: text("platform"),
  language: text("language"),
  signuplist: text("signuplist").notNull().default("launch-notify"),
  wantshandson: boolean("wantshandson").notNull().default(false),
  sourceip: text("sourceip"),
  payload: jsonb("payload"),
  submittedat: timestamp("submittedat", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  unsubscribedat: timestamp("unsubscribedat", { withTimezone: true }),
});
// [SCOPE 117 / T005] END

export type MarketingContact = typeof marketingcontacts.$inferSelect;
export type NewMarketingContact = typeof marketingcontacts.$inferInsert;
