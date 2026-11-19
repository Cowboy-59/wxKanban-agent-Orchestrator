import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { welcomemessages } from "./welcomemessages";
import { userprofiles } from "./userprofiles";

// [SCOPE 109 / T001] BEGIN — welcomesends table (per-recipient welcome record)
// SPEC-109 FR-007. One row per recipient attempt, written by WelcomeMessageService
// in the same transaction that claims link capacity.
//
// The once-per-person guarantee is a PARTIAL unique index on lower(email) WHERE
// status = 'sent' — added by hand in the migration, because Drizzle's generator
// does not express partial indexes. Scoping it to successful sends is deliberate
// and load-bearing: the sender is direct SES with no queue-level retry, so a
// blanket unique index would let one transient failure bar that person from ever
// being welcomed. A 'failed' row must be able to sit alongside a later 'sent' one
// so FR-011 (retry) can work.
export const welcomesends = pgTable(
  "welcomesends",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    welcomemessageid: uuid("welcomemessageid")
      .notNull()
      .references(() => welcomemessages.id, { onDelete: "cascade" }),
    // The welcomed person. Nullable so a record survives account deletion.
    userid: uuid("userid").references(() => userprofiles.id, {
      onDelete: "set null",
    }),
    // Identity for the dedupe constraint — matched case-insensitively.
    email: varchar("email", { length: 320 }).notNull(),
    // sent|failed
    status: varchar("status", { length: 20 }).default("failed").notNull(),
    error: text("error"),
    // subscription|invitation|backfill|retry — which path produced this send.
    trigger: varchar("trigger", { length: 20 }).notNull(),
    sentat: timestamp("sentat"),
    createdat: timestamp("createdat").defaultNow().notNull(),
  },
  (table) => ({
    messageIdx: index("idx_welcomesends_messageid").on(table.welcomemessageid),
    statusIdx: index("idx_welcomesends_status").on(table.status),
    useridIdx: index("idx_welcomesends_userid").on(table.userid),
  }),
);
// [SCOPE 109 / T001] END

export type WelcomeSend = typeof welcomesends.$inferSelect;
export type NewWelcomeSend = typeof welcomesends.$inferInsert;

export const WELCOME_SEND_STATUSES = ["sent", "failed"] as const;
export type WelcomeSendStatus = (typeof WELCOME_SEND_STATUSES)[number];

export const WELCOME_SEND_TRIGGERS = [
  "subscription",
  "invitation",
  "backfill",
  "retry",
] as const;
export type WelcomeSendTrigger = (typeof WELCOME_SEND_TRIGGERS)[number];
