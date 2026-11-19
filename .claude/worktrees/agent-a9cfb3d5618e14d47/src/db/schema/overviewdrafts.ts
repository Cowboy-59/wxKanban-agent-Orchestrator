import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { companies } from "./company.js";
import { companyprojects } from "./companyproject.js";
import { projectproposals } from "./projectproposal.js";
import { userprofiles } from "./userprofiles.js";

export const overviewdrafts = pgTable("overviewdrafts", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  projectid: uuid("projectid").references(() => companyprojects.id, {
    onDelete: "cascade",
  }),

  proposalid: uuid("proposalid").references(() => projectproposals.id, {
    onDelete: "cascade",
  }),

  authoruserid: uuid("authoruserid")
    .notNull()
    .references(() => userprofiles.id, { onDelete: "cascade" }),

  companyid: uuid("companyid")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),

  status: text("status").notNull().default("draft"),

  // Proposal metadata — populated when dialog originated the draft.
  // Carried through to projectproposals on Submit (FR-015 + spec 024 handoff).
  title: text("title"),
  priority: text("priority"),
  estimatedeffort: text("estimatedeffort"),

  content: text("content").notNull().default(""),

  createdat: timestamp("createdat").defaultNow().notNull(),
  updatedat: timestamp("updatedat").defaultNow().notNull(),
});

export type OverviewDraft = typeof overviewdrafts.$inferSelect;
export type NewOverviewDraft = typeof overviewdrafts.$inferInsert;

export const OVERVIEW_DRAFT_STATUSES = [
  "draft",
  "submitted",
  "accepted",
  "rejected",
] as const;

export type OverviewDraftStatus = (typeof OVERVIEW_DRAFT_STATUSES)[number];
