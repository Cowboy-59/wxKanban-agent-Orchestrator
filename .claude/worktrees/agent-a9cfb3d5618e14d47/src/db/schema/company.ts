import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  boolean,
  timestamp,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  contactemail: varchar("contactemail", { length: 255 }).notNull().unique(),
  phone: varchar("phone", { length: 20 }),
  billingplan: varchar("billingplan", { length: 50 }).notNull().default("SINGLE_USER"),
  subscriptionstatus: varchar("subscriptionstatus", { length: 20 })
    .notNull()
    .default("ACTIVE"),
  maxusers: integer("maxusers").notNull().default(5),
  hourlyrate: numeric("hourlyrate", { precision: 10, scale: 2 }),
  logourl: varchar("logourl", { length: 1024 }),
  // [SCOPE 037 / T005] billingemail — B2B invoice delivery target (FR-017).
  // Editable from Company settings; null = invoice generation fails-fast.
  billingemail: varchar("billingemail", { length: 255 }),
  activeflag: boolean("activeflag").notNull().default(true),
  billingexempt: boolean("billingexempt").notNull().default(false),
  // [SCOPE 088 / T001] BEGIN — Distributor affiliate + referral attribution (FR-006, Data Requirements)
  // distributor: account provisioned via the unlisted /distributor-signup page.
  // referralcode: this account's own shareable code (distributors only; unique).
  // referredby: the distributor referralcode a customer entered at signup (attribution-only).
  distributor: boolean("distributor").notNull().default(false),
  referralcode: varchar("referralcode", { length: 16 }).unique(),
  referredby: varchar("referredby", { length: 16 }),
  // [SCOPE 088 / T001] END
  digestconfig: jsonb("digestconfig"),
  settings: text("settings"),
  verifiedat: timestamp("verifiedat"),
  // [SCOPE 132 / T002] BEGIN — Subscription lifecycle timestamps (FR-001)
  // Declared ONLY after 0065_scope132_company_lifecycle_timestamps.sql was hand-applied and
  // verified (2026-09-22; see specs/117-production-schema-integrity/schema-change-log.md).
  // Drizzle names every declared column in its SELECTs and `companies` is read on nearly
  // every authenticated request, so declaring ahead of the DDL 500s the whole application,
  // not one endpoint.
  //
  // cancelrequestedat  ADMIN asked to cancel; Stripe set to cancel_at_period_end. Access
  //                    continues to period end and it is reversible. NOT the archival clock.
  // cancelledat        cancellation became effective. The 30-day archival clock starts here,
  //                    and the sweep selects on this column ALONE — FR-002 forbids deriving
  //                    an archival date from `updatedat` anywhere.
  // pausedat           billing suspended via Stripe pause_collection. Walled, never archived.
  // archivedat         archival completed; presence makes re-archival a no-op. Nothing is deleted.
  cancelrequestedat: timestamp("cancelrequestedat"),
  cancelledat: timestamp("cancelledat"),
  pausedat: timestamp("pausedat"),
  archivedat: timestamp("archivedat"),
  // [SCOPE 132 / T002] END
  // [SCOPE 002 / T072] BEGIN — VAT registration number (SPEC-002 Amendment A, FR-012a)
  // Declared ONLY after 0071_scope002_company_vatnumber.sql was hand-applied and verified
  // (2026-10-09; see specs/117-production-schema-integrity/schema-change-log.md).
  // As entered, display only — trimmed, empty stored as NULL, max 50. No format validation.
  vatnumber: varchar("vatnumber", { length: 50 }),
  // [SCOPE 002 / T072] END
  // [SCOPE 144 / T004] BEGIN — Company YappChatt account (FR-001, FR-003; contract C2)
  // SCOPE-144: declared before the column exists in production — do not push until the owner applies specs/144-company-yappchatt-account/sql/0001-company-yappchatt.sql
  // yappchattuserid    the company account's YappChatt user id (owner of its group and rooms).
  // yappchattemail     the email the account was created or linked with.
  // yappchattlinkedat  when the account was created or linked.
  // yappchattgroupid   the company's YappChatt corporate group (org id).
  yappchattuserid: uuid("yappchattuserid"),
  yappchattemail: varchar("yappchattemail", { length: 255 }),
  yappchattlinkedat: timestamp("yappchattlinkedat", { withTimezone: true }),
  yappchattgroupid: uuid("yappchattgroupid"),
  // [SCOPE 144 / T004] END
  // [SCOPE 005 / T002] BEGIN — Time and Billing rates and ACH details (FR-008, FR-012)
  // Declared ONLY after 0072_scope005_time_billing.sql was hand-applied and verified
  // (2026-11-01; see specs/117-production-schema-integrity/schema-change-log.md).
  // `hourlyrate` above is the default Developer rate; 0072 set its DB default to 150.00
  // for new companies, and the app falls back to 150.00 where it is NULL.
  // ach* hold AES-256-GCM ciphertext from src/server/lib/crypto.ts — never plain text,
  // never logged; the account number is masked to its last 4 everywhere but the statement.
  resourcerate: numeric("resourcerate", { precision: 10, scale: 2 }).notNull().default("50.00"),
  achbankname: text("achbankname"),
  achroutingnumber: text("achroutingnumber"),
  achaccountnumber: text("achaccountnumber"),
  achaccountname: text("achaccountname"),
  // [SCOPE 005 / T002] END
  createdat: timestamp("createdat").defaultNow().notNull(),
  updatedat: timestamp("updatedat").defaultNow().notNull(),
});

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
