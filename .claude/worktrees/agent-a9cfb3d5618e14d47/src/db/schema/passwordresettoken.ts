import { pgTable, uuid, text, timestamp, integer } from "drizzle-orm/pg-core";
import { userprofiles } from "./userprofiles";

export const passwordresettokens = pgTable("passwordresettokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userid: uuid("userid")
    .references(() => userprofiles.id, { onDelete: "cascade" })
    .notNull(),
  tokenhash: text("tokenhash").notNull(),
  expiresat: timestamp("expiresat", { withTimezone: true }).notNull(),
  createdat: timestamp("createdat", { withTimezone: true }).defaultNow(),
  usedat: timestamp("usedat", { withTimezone: true }),
  attemptcount: integer("attemptcount").default(0),
});

export type PasswordResetToken = typeof passwordresettokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordresettokens.$inferInsert;
