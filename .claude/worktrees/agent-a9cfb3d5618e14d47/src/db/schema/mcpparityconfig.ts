import {
  pgTable,
  uuid,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { userprofiles } from "./userprofiles.js";

export const mcpparityconfig = pgTable("mcpparityconfig", {
  id: uuid("id").primaryKey().defaultRandom(),
  gatemode: varchar("gatemode", { length: 20 }).notNull().default("advisory"),
  advisorystartedat: timestamp("advisorystartedat", { withTimezone: true }),
  mandatoryactivatedat: timestamp("mandatoryactivatedat", {
    withTimezone: true,
  }),
  rollbackat: timestamp("rollbackat", { withTimezone: true }),
  rollbackby: uuid("rollbackby").references(() => userprofiles.id, {
    onDelete: "set null",
  }),
  createdat: timestamp("createdat", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedat: timestamp("updatedat", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type McpParityConfig = typeof mcpparityconfig.$inferSelect;
export type NewMcpParityConfig = typeof mcpparityconfig.$inferInsert;
