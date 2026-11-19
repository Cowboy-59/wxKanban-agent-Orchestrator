import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { userprofiles } from "./userprofiles.js";
import { companies } from "./company.js";

// [SCOPE 119 / T002] BEGIN — customers: a consultant's own record of a client
/**
 * A consultant-owned CRM record of a client.
 *
 * SPEC-119 / FR-001. This is a **record, not a relationship**. It carries no login,
 * no seat, and grants no access to anything. A client who needs to see inside
 * wxKanban is an Engagement (SCOPE-037), never this.
 *
 * WHY IT EXISTS: SCOPE-037's Engagement models the client who is themselves a
 * wxKanban tenant, and models it well. It cannot represent the client who has never
 * heard of wxKanban — which for an independent consultant is most of them. SPEC-017
 * assumed this table already existed and specified an entire external-connection
 * layer on top of it; the table did not exist, and that layer has been blocked ever
 * since.
 *
 * Mirrors `src/db/migrations/0059_scope119_customers.sql`, applied by hand to
 * production on 2026-07-31 per SCOPE-117. Any divergence between this declaration
 * and that DDL is exactly the drift SCOPE-117 exists to prevent.
 */
export const customers = pgTable(
  "customers",
  {
    // UUID v7 supplied by the application. The DDL deliberately has no SQL default:
    // gen_random_uuid() would silently emit v4 rows on any insert made outside the app.
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),

    // The owner. RESTRICT, not CASCADE (SPEC-119 Clarification 6) — CASCADE would let
    // deleting a departing consultant destroy their customer rows and make every
    // invoice referencing those clients unresolvable. FR-011's transfer flow is the
    // sanctioned way to release a consultant's customers before offboarding.
    consultantid: uuid("consultantid")
      .notNull()
      .references(() => userprofiles.id, { onDelete: "restrict" }),

    // Tenant scoping — the consulting company this record belongs to.
    companyid: uuid("companyid")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    // OPTIONAL link to a wxKanban tenant (FR-004). NULL is the normal case.
    //
    // This points at the COMPANY, not at an engagement. That is the whole design:
    // every engagement between the two companies is then discoverable through the
    // existing `engagement` table, engagement history comes free, and there is no
    // ambiguity about which engagement is "the" one.
    //
    // SET NULL on delete is deliberate — if that tenant is ever removed, the
    // consultant's own record survives as an ordinary unlinked customer. Cascading
    // here would destroy one user's data because of an event in someone else's account.
    //
    // Setting this field grants NOTHING.
    clientcompanyid: uuid("clientcompanyid").references(() => companies.id, {
      onDelete: "set null",
    }),

    name: varchar("name", { length: 255 }).notNull(),
    company: varchar("company", { length: 255 }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    billingaddress: text("billingaddress"),
    taxid: varchar("taxid", { length: 100 }),

    // Soft archive only (FR-003). There is deliberately no delete path anywhere in
    // this spec: time entries and invoices reference these rows.
    archivedat: timestamp("archivedat"),

    // [SCOPE 005 / T002] BEGIN — statement period (FR-009)
    // Declared ONLY after 0072_scope005_time_billing.sql was hand-applied and verified
    // (2026-11-01; SCOPE-117 change log). 'weekly' (default) or 'biweekly' if negotiated;
    // a CHECK in the DDL enforces the two values.
    billingcycle: varchar("billingcycle", { length: 10 }).notNull().default("weekly"),
    // [SCOPE 005 / T002] END

    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    consultantidIdx: index("idx_customers_consultantid").on(table.consultantid),
    companyidIdx: index("idx_customers_companyid").on(table.companyid),
    clientcompanyidIdx: index("idx_customers_clientcompanyid").on(
      table.clientcompanyid,
    ),
    // NOTE: the DDL also creates `idx_customers_consultant_name_live`, a PARTIAL
    // unique index on (consultantid, lower(name)) WHERE archivedat IS NULL, which
    // enforces FR-001's per-consultant name uniqueness among live rows only —
    // archiving a customer frees its name for reuse. Drizzle cannot express a
    // partial expression index, so it lives in SQL alone and is intentionally not
    // declared here. Uniqueness is still enforced by the database.
  }),
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
// [SCOPE 119 / T002] END
