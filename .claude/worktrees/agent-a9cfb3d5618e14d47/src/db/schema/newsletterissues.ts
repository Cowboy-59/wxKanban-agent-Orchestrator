import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { userprofiles } from "./userprofiles";

// [SCOPE 064 / T004] BEGIN — newsletterissues table (Newsletter: compose + send)
// One authored newsletter issue. Composed as a draft, then sent to a recipient
// segment of marketingcontacts via SES as a background job (NewsletterSendService).
// Counts are rolled up from per-recipient newslettersends rows as the send runs.
export const newsletterissues = pgTable(
  "newsletterissues",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    subject: varchar("subject", { length: 255 }).notNull(),
    body: text("body").notNull(),
    segment: varchar("segment", { length: 40 }).notNull(), // targeted marketingcontacts.signuplist (marketing audience)
    // [SCOPE 064 / T010] Amendment A — which audience(s) this issue targets, and
    // (when it includes registered users) which user opt-in category it belongs to.
    audience: varchar("audience", { length: 20 }).default("marketing").notNull(), // marketing|users|both
    usercategory: varchar("usercategory", { length: 20 }), // updates|promos — required when audience includes users
    status: varchar("status", { length: 20 }).default("draft").notNull(), // draft|sending|sent|failed
    recipientcount: integer("recipientcount").default(0).notNull(),
    sentcount: integer("sentcount").default(0).notNull(),
    failedcount: integer("failedcount").default(0).notNull(),
    createdbyid: uuid("createdbyid").references(() => userprofiles.id, {
      onDelete: "set null",
    }),
    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
    sentat: timestamp("sentat"),
  },
  (table) => ({
    statusIdx: index("idx_newsletterissues_status").on(table.status),
    createdatIdx: index("idx_newsletterissues_createdat").on(table.createdat),
  }),
);
// [SCOPE 064 / T004] END

export type NewsletterIssue = typeof newsletterissues.$inferSelect;
export type NewNewsletterIssue = typeof newsletterissues.$inferInsert;
