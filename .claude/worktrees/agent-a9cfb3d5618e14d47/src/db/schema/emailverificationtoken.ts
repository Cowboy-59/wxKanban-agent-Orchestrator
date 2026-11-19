import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { userprofiles } from './userprofiles';

/**
 * Email verification tokens
 * Stores hashed JWT tokens for email verification
 * One-time use, 24-hour expiry
 * Tracks brute force attempts (max 5 per token)
 */
export const emailverificationtokens = pgTable('emailverificationtokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userid: uuid('userid')
    .references(() => userprofiles.id, { onDelete: 'cascade' })
    .notNull(),
  tokenhash: text('tokenhash').notNull(),
  expiresat: timestamp('expiresat', { withTimezone: true }).notNull(),
  createdat: timestamp('createdat', { withTimezone: true }).defaultNow(),
  attemptcount: integer('attemptcount').default(0),
});

export type EmailVerificationToken = typeof emailverificationtokens.$inferSelect;
export type NewEmailVerificationToken = typeof emailverificationtokens.$inferInsert;
