import {
  pgTable,
  varchar,
  boolean,
  numeric,
  integer,
  uuid,
  bigint,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { companies } from "./company";

/**
 * User type enum values
 * - TEAM_MEMBER: Regular team member with limited permissions
 * - TEAM_MANAGER: Team manager with project/phase control permissions
 * - ADMIN: Company administrator with full company-level access
 * - SYSADMIN: Platform-level administrator with cross-tenant access
 */
export type UserType = "TEAM_MEMBER" | "TEAM_MANAGER" | "ADMIN" | "SYSADMIN";

export const userprofiles = pgTable("userprofiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileid: bigint("profileid", { mode: "number" }),
  emailaddr: varchar("emailaddr", { length: 80 }).notNull().unique(),
  fullname: varchar("fullname", { length: 80 }),
  password: varchar("password", { length: 256 }).notNull(),
  active: boolean("active").notNull().default(true),
  securitylevel: integer("securitylevel").notNull().default(7),
  usertype: varchar("usertype", { length: 50 }).notNull().default("TEAM_MEMBER"),
  // Valid values: TEAM_MEMBER, TEAM_MANAGER, ADMIN, SYSADMIN

  companyid: uuid("companyid").notNull().references(() => companies.id, {
    onDelete: "restrict",
  }),
  payrate: numeric("payrate", { precision: 10, scale: 2 }),
  payratemethod: varchar("payratemethod", { length: 20 }),
  profiletype: varchar("profiletype", { length: 20 }),
  responsibility: varchar("responsibility"),
  basepercentage: numeric("basepercentage", { precision: 10, scale: 2 }),
  tracktime: boolean("tracktime").default(true),
  timezone: varchar("timezone", { length: 50 }).default("UTC"),
  language: varchar("language", { length: 10 }).default("en-US").notNull(), // [SCOPE 051] preferred UI locale
  // [profile self-service] Profile photo (S3 URL) + a new email address awaiting
  // verification (email only switches to it once the user clicks the emailed link).
  avatarurl: varchar("avatarurl", { length: 1024 }),
  pendingemail: varchar("pendingemail", { length: 80 }),
  dashboardconfig: jsonb("dashboardconfig"),
  joinedat: timestamp("joinedat").defaultNow(),
  lastloginedat: timestamp("lastloginedat"),
  // Account lockout (SOC 2 CC6.1 / M-12): consecutive failed login attempts and
  // the timestamp until which sign-in is blocked (null = not locked).
  failedlogins: integer("failedlogins").notNull().default(0),
  lockeduntil: timestamp("lockeduntil"),
  requirepasswordchange: boolean("requirepasswordchange").default(false),
  devcycleid: bigint("devcycleid", { mode: "number" }),
  startchat: boolean("startchat").default(true),
  allowoutsideteams: boolean("allowoutsideteams").default(false),
  clientid: varchar("clientid", { length: 500 }),
  clientsecret: varchar("clientsecret", { length: 500 }),
  // [SCOPE 064 / T010] Amendment A — registered-user newsletter opt-in.
  // Two nullable opt-out timestamps (NULL = subscribed), symmetric with
  // marketingcontacts.unsubscribedat, so every existing user is opted-in by default.
  updatesunsubscribedat: timestamp("updatesunsubscribedat"), // Product updates & announcements
  promosunsubscribedat: timestamp("promosunsubscribedat"), // Marketing / promotions
  // [SCOPE 144 / T004] BEGIN — Person's YappChatt user id, stored on membership sync (FR-004; contract C2)
  // SCOPE-144: declared before the column exists in production — do not push until the owner applies specs/144-company-yappchatt-account/sql/0001-company-yappchatt.sql
  yappchattuserid: uuid("yappchattuserid"),
  // [SCOPE 144 / T004] END
});

export type UserProfile = typeof userprofiles.$inferSelect;
export type NewUserProfile = typeof userprofiles.$inferInsert;

export type User = UserProfile;
export type NewUser = NewUserProfile;
