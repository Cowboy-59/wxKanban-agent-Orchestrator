import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./company";
import { companyprojects } from "./companyproject";
import { userprofiles } from "./userprofiles";

export const projectproposals = pgTable("projectproposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyid: uuid("companyid")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  priority: varchar("priority", { length: 20 }).default("medium").notNull(), // low, medium, high
  estimatedeffort: varchar("estimatedeffort", { length: 100 }),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, good_idea, accepted, rejected
  rejectionreason: text("rejectionreason"),
  proposeddate: timestamp("proposeddate").defaultNow().notNull(),
  source: varchar("source", { length: 255 }).notNull(), // user fullname or "AI Agent"
  projectid: uuid("projectid").references(() => companyprojects.id, {
    onDelete: "set null",
  }), // populated when proposal is converted to project
  createdbyid: uuid("createdbyid")
    .notNull()
    .references(() => userprofiles.id, { onDelete: "cascade" }),
  createdat: timestamp("createdat").defaultNow().notNull(),
  updatedat: timestamp("updatedat").defaultNow().notNull(),
});

export type ProjectProposal = typeof projectproposals.$inferSelect;
export type NewProjectProposal = typeof projectproposals.$inferInsert;
