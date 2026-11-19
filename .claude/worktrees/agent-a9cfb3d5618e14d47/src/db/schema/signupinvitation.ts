/**
 * Signup Invitation Schema
 * Spec 023 — FR-002a (invite-bound signup promotions)
 *
 * A prospect-facing invitation that grants a promotional free period at
 * registration. Deliberately NOT modelled on `userinvitations`, which carries a
 * NOT NULL FK to companies.id and adds a user to an existing company — a signup
 * invite has no company yet. The nearest precedent is `engagementinvitations`
 * (token → provision a brand-new company bound to the invited email).
 *
 * Two departures from the existing invite tables, both deliberate:
 *
 *  1. The token is stored as a sha256 hash, following emailverificationtokens /
 *     passwordresettokens. `userinvitations` and `engagementinvitations` store
 *     invite tokens in plaintext, so a DB leak exposes every live invite. The
 *     raw token is shown once at mint time and is not recoverable afterwards.
 *
 *  2. `status` values are honest. `InvitationService.revokeInvitation` writes
 *     'expired' for a revocation, making revoked and expired indistinguishable;
 *     this table keeps them separate.
 *
 * Single-use is enforced at redemption by a conditional UPDATE guarded on
 * status='pending' (see SignupInvitationService.burn), not by a constraint here.
 */

import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { companies } from "./company";
import { userprofiles } from "./userprofiles";

// [SCOPE 023 / T106] BEGIN — signupinvitations table
export const signupinvitations = pgTable(
  "signupinvitations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),

    /** The one address this invite may be redeemed by. Stored lowercased. */
    email: varchar("email", { length: 255 }).notNull(),

    /** Pinned tier — the registrant cannot choose another. */
    billingplan: varchar("billingplan", { length: 32 }).notNull(),

    /** Promotional free days applied as the Stripe trial_period_days. */
    promodays: integer("promodays").notNull(),

    /** sha256 of the raw token. The raw value is never stored. */
    tokenhash: varchar("tokenhash", { length: 64 }).notNull(),

    /** pending | redeemed | revoked | expired */
    status: varchar("status", { length: 20 }).notNull().default("pending"),

    expiresat: timestamp("expiresat", { withTimezone: true }).notNull(),
    invitedbyid: uuid("invitedbyid"),
    invitedat: timestamp("invitedat", { withTimezone: true })
      .defaultNow()
      .notNull(),
    redeemedat: timestamp("redeemedat", { withTimezone: true }),

    /** Set at burn time; the company this invite produced. */
    redeemedcompanyid: uuid("redeemedcompanyid"),

    createdat: timestamp("createdat", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedat: timestamp("updatedat", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      // set null, not cascade: deleting the admin who sent an invite must not
      // delete the record of a redeemed promotion.
      fkInvitedBy: foreignKey({
        columns: [table.invitedbyid],
        foreignColumns: [userprofiles.id],
      }).onDelete("set null"),

      fkRedeemedCompany: foreignKey({
        columns: [table.redeemedcompanyid],
        foreignColumns: [companies.id],
      }).onDelete("set null"),

      ukTokenHash: uniqueIndex("uk_signupinvitations_tokenhash").on(
        table.tokenhash,
      ),
      idxEmail: index("idx_signupinvitations_email").on(table.email),
      idxStatus: index("idx_signupinvitations_status").on(table.status),
    };
  },
);
// [SCOPE 023 / T106] END

export type SignupInvitation = typeof signupinvitations.$inferSelect;
export type NewSignupInvitation = typeof signupinvitations.$inferInsert;
