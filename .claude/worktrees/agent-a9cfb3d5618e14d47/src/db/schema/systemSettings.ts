import {
  pgTable,
  varchar,
  text,
  timestamp,
  uuid,
  jsonb,
} from "drizzle-orm/pg-core";
import { userprofiles } from "./userprofiles";

/**
 * Setting category enum values
 */
export type SettingCategory = "billing" | "features" | "security" | "integrations" | "general";

/**
 * System settings table for global platform configuration (key-value).
 *
 * [SCOPE 067 follow-up] Aligned to the actual DB table `systemsettings`
 * (project no-underscore convention): `value` is jsonb, audit columns are
 * `updatedat`/`updatedby` only. The previous schema named a non-existent
 * `system_settings` table, so every read silently failed to its default
 * (e.g. billing.promoDays -> 0) and SysAdmin settings never persisted.
 */
export const systemSettings = pgTable("systemsettings", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: jsonb("value").notNull(),
  category: varchar("category", { length: 50 }).notNull().default("general"),
  description: text("description"),
  updatedat: timestamp("updatedat").defaultNow(),
  updatedby: uuid("updatedby").references(() => userprofiles.id, {
    onDelete: "set null",
  }),
});

/**
 * System settings change history for audit trail. Created by migration 0041
 * (the prior `system_settings_history` table never existed on the DB).
 */
export const systemSettingsHistory = pgTable("systemsettingshistory", {
  id: uuid("id").primaryKey().defaultRandom(),
  settingid: uuid("settingid").notNull().references(() => systemSettings.id, {
    onDelete: "cascade",
  }),
  previousvalue: jsonb("previousvalue"),
  newvalue: jsonb("newvalue").notNull(),
  changedat: timestamp("changedat").defaultNow(),
  changedby: uuid("changedby").references(() => userprofiles.id, {
    onDelete: "set null",
  }),
  changereason: text("changereason"),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type NewSystemSetting = typeof systemSettings.$inferInsert;
export type SystemSettingHistory = typeof systemSettingsHistory.$inferSelect;
export type NewSystemSettingHistory = typeof systemSettingsHistory.$inferInsert;
