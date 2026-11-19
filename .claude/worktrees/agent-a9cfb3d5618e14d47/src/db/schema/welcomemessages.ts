import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { userprofiles } from "./userprofiles";

// [SCOPE 109 / T001] BEGIN — welcomemessages table (the single standing welcome)
// SPEC-109 FR-001/FR-004. Unlike newsletterissues (one row per authored issue),
// this table holds exactly ONE standing record: the welcome message sent
// automatically on subscription activation and on invitation acceptance.
//
// The join link carries a finite capacity. `linkconsumed` is incremented only by
// a SUCCESSFUL delivery, inside the same transaction as the welcomesends insert,
// via a conditional UPDATE guarded on `linkconsumed < linkcapacity` — that one
// primitive is what makes FR-004/FR-009 correct under concurrency. A failed send
// releases the claim it provisionally took, so a run of failures cannot silently
// drain the link.
export const welcomemessages = pgTable("welcomemessages", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  subject: varchar("subject", { length: 255 }).notNull(),
  body: text("body").notNull(),
  // draft|live — triggers send nothing while draft (FR-001)
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  // The YappChatt join link handed to recipients (FR-004).
  joinlink: varchar("joinlink", { length: 1000 }),
  // Total uses the link supports, and how many successful sends have consumed it.
  linkcapacity: integer("linkcapacity").default(0).notNull(),
  linkconsumed: integer("linkconsumed").default(0).notNull(),
  publishedat: timestamp("publishedat"),
  updatedbyid: uuid("updatedbyid").references(() => userprofiles.id, {
    onDelete: "set null",
  }),
  createdat: timestamp("createdat").defaultNow().notNull(),
  updatedat: timestamp("updatedat").defaultNow().notNull(),
});
// [SCOPE 109 / T001] END

export type WelcomeMessage = typeof welcomemessages.$inferSelect;
export type NewWelcomeMessage = typeof welcomemessages.$inferInsert;

export const WELCOME_MESSAGE_STATUSES = ["draft", "live"] as const;
export type WelcomeMessageStatus = (typeof WELCOME_MESSAGE_STATUSES)[number];
