/**
 * Engagement Schema
 * Spec 037 — Consultants Management (Engagement Core)
 *
 * Company-to-Company contractual link between a Client Company and a
 * Consulting Company. Lifecycle states: active, paused, disabled, ended.
 *
 * Partial unique constraint ensures only one open engagement per
 * (clientcompanyid, consultingcompanyid) pair (where state is one of
 * active/paused/disabled); multiple ended tombstones permitted.
 *
 * `invitationid` ties the engagement back to its originating invite for
 * provenance — engagementinvitations rows are retained indefinitely.
 */

import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./company";
import { userprofiles } from "./userprofiles";
import { engagementinvitations } from "./engagementinvitation";

// [SCOPE 037 / T002] BEGIN — engagements table
export const engagements = pgTable(
  "engagements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientcompanyid: uuid("clientcompanyid").notNull(),
    consultingcompanyid: uuid("consultingcompanyid").notNull(),
    state: varchar("state", { length: 20 }).notNull().default("active"),
    invitationid: uuid("invitationid").notNull(),
    createdat: timestamp("createdat").defaultNow().notNull(),
    createdbyid: uuid("createdbyid").notNull(),
    acceptedat: timestamp("acceptedat").notNull(),
    acceptedbyid: uuid("acceptedbyid").notNull(),
    pausedat: timestamp("pausedat"),
    disabledat: timestamp("disabledat"),
    endedat: timestamp("endedat"),
    endedbyid: uuid("endedbyid"),
  },
  (table) => {
    return {
      fkClientCompany: foreignKey({
        columns: [table.clientcompanyid],
        foreignColumns: [companies.id],
      }).onDelete("restrict"),

      fkConsultingCompany: foreignKey({
        columns: [table.consultingcompanyid],
        foreignColumns: [companies.id],
      }).onDelete("restrict"),

      fkInvitation: foreignKey({
        columns: [table.invitationid],
        foreignColumns: [engagementinvitations.id],
      }).onDelete("restrict"),

      fkCreatedBy: foreignKey({
        columns: [table.createdbyid],
        foreignColumns: [userprofiles.id],
      }).onDelete("set null"),

      fkAcceptedBy: foreignKey({
        columns: [table.acceptedbyid],
        foreignColumns: [userprofiles.id],
      }).onDelete("set null"),

      fkEndedBy: foreignKey({
        columns: [table.endedbyid],
        foreignColumns: [userprofiles.id],
      }).onDelete("set null"),

      idxClientCompany: index("idx_engagements_clientcompanyid").on(
        table.clientcompanyid,
      ),
      idxConsultingCompany: index("idx_engagements_consultingcompanyid").on(
        table.consultingcompanyid,
      ),
      idxState: index("idx_engagements_state").on(table.state),

      // Partial unique: only one open engagement per (client, consulting) pair.
      // Multiple `ended` tombstones permitted so re-engagement is supported.
      ukOpenPair: uniqueIndex("uk_engagements_open_pair")
        .on(table.clientcompanyid, table.consultingcompanyid)
        .where(sql`state in ('active', 'paused', 'disabled')`),
    };
  },
);
// [SCOPE 037 / T002] END

export type Engagement = typeof engagements.$inferSelect;
export type NewEngagement = typeof engagements.$inferInsert;
