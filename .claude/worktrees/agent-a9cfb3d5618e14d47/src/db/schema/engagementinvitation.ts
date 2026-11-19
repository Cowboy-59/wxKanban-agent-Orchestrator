/**
 * Engagement Invitation Schema
 * Spec 037 — Consultants Management (Engagement Core)
 *
 * Stores pending Client Company → Consulting Company invitations.
 * Mirrors the userinvitations pattern but represents a Company-to-Company
 * relationship rather than a Company-to-User one. Single-use 7-day token;
 * does not consume Client seat-cap quota. Retained indefinitely after
 * acceptance for engagement provenance (see engagements.invitationid FK).
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";
import { companies } from "./company";
import { userprofiles } from "./userprofiles";

// [SCOPE 037 / T001] BEGIN — engagementinvitations table
export const engagementinvitations = pgTable(
  "engagementinvitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientcompanyid: uuid("clientcompanyid").notNull(),
    invitedemail: varchar("invitedemail", { length: 255 }).notNull(),
    invitedbyid: uuid("invitedbyid").notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    expiresat: timestamp("expiresat").notNull(),
    invitedat: timestamp("invitedat").defaultNow().notNull(),
    acceptedat: timestamp("acceptedat"),
    message: text("message"),
  },
  (table) => {
    return {
      fkClientCompany: foreignKey({
        columns: [table.clientcompanyid],
        foreignColumns: [companies.id],
      }).onDelete("cascade"),

      fkInvitedBy: foreignKey({
        columns: [table.invitedbyid],
        foreignColumns: [userprofiles.id],
      }).onDelete("set null"),

      idxClientCompany: index("idx_engagementinvitations_clientcompanyid").on(
        table.clientcompanyid,
      ),
      idxStatus: index("idx_engagementinvitations_status").on(table.status),
      idxInvitedEmail: index("idx_engagementinvitations_invitedemail").on(
        table.invitedemail,
      ),

      ukToken: uniqueIndex("uk_engagementinvitations_token").on(table.token),
    };
  },
);
// [SCOPE 037 / T001] END

export type EngagementInvitation = typeof engagementinvitations.$inferSelect;
export type NewEngagementInvitation =
  typeof engagementinvitations.$inferInsert;
