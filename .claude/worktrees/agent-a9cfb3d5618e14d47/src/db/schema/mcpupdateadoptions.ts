import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { companyprojects } from "./companyproject.js";

export const mcpupdateadoptions = pgTable(
  "mcpupdateadoptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectid: uuid("projectid")
      .notNull()
      .references(() => companyprojects.id, { onDelete: "cascade" }),
    mcpversion: varchar("mcpversion", { length: 50 }).notNull(),
    decisionstate: varchar("decisionstate", { length: 20 })
      .notNull()
      .default("pending"),
    decidedat: timestamp("decidedat", { withTimezone: true }),
    maintenancewindow: jsonb("maintenancewindow"),
    nextreminderat: timestamp("nextreminderat", { withTimezone: true }),
    deferralcount: integer("deferralcount").notNull().default(0),
    createdat: timestamp("createdat", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedat: timestamp("updatedat", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uniqProjectVersion: unique("mcpupdateadoptions_projectid_mcpversion_key").on(
      table.projectid,
      table.mcpversion
    ),
  })
);

export type McpUpdateAdoption = typeof mcpupdateadoptions.$inferSelect;
export type NewMcpUpdateAdoption = typeof mcpupdateadoptions.$inferInsert;
