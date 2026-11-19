import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { userprofiles } from "./userprofiles.js";
import { companies } from "./company.js";
import { customers } from "./customer.js";

// [SCOPE 017 / T005] BEGIN — externalconnections: a customer's PM system + credentials
/**
 * A connection from a Customer to an external PM system (Jira, Monday, Trello…),
 * with credentials encrypted at rest.
 *
 * SPEC-017 FR-007. Blocked since the spec was written because it references
 * `customers`, which did not exist until SCOPE-119 supplied it.
 *
 * `credentialsencrypted` holds AES-256-GCM ciphertext in `iv:authTag:ciphertext`
 * form, produced by `src/server/lib/crypto.ts`. It MUST never be returned by any
 * endpoint — decryption happens server-side at the point of use, and the plaintext
 * never crosses the API boundary.
 *
 * Mirrors `src/db/migrations/0060_scope017_connections.sql`.
 */
export const externalconnections = pgTable(
  "externalconnections",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),

    customerid: uuid("customerid")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),

    // CASCADE is correct: credentials scoped PERSONAL belong to this consultant,
    // and deleting the user should destroy them rather than leave orphaned secrets
    // encrypted with a key nobody needs.
    consultantid: uuid("consultantid")
      .notNull()
      .references(() => userprofiles.id, { onDelete: "cascade" }),

    companyid: uuid("companyid")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 255 }).notNull(),
    // 'jira' | 'monday' | 'trello' | 'asana' | 'azuredevops' | 'custom'
    systemtype: varchar("systemtype", { length: 50 }).notNull(),
    apiendpoint: varchar("apiendpoint", { length: 500 }).notNull(),

    credentialsencrypted: text("credentialsencrypted").notNull(),

    // 'PERSONAL' — owner only. 'TEAM' — owner plus Team Manager/Leader (FR-007).
    credentialscope: varchar("credentialscope", { length: 20 })
      .notNull()
      .default("PERSONAL"),

    // 'connected' | 'disconnected' | 'error'
    status: varchar("status", { length: 20 }).notNull().default("disconnected"),

    lastsyncat: timestamp("lastsyncat"),
    lastsyncresult: jsonb("lastsyncresult"),

    // 'healthy' | 'warning' | 'error' | 'unknown'
    healthstatus: varchar("healthstatus", { length: 20 }).default("unknown"),
    healthcheckedat: timestamp("healthcheckedat"),

    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
    deletedat: timestamp("deletedat"),
  },
  (table) => ({
    customeridIdx: index("idx_externalconnections_customerid").on(table.customerid),
    consultantidIdx: index("idx_externalconnections_consultantid").on(table.consultantid),
    companyidIdx: index("idx_externalconnections_companyid").on(table.companyid),
    statusIdx: index("idx_externalconnections_status").on(table.status),
    healthstatusIdx: index("idx_externalconnections_healthstatus").on(table.healthstatus),
  }),
);

export type ExternalConnection = typeof externalconnections.$inferSelect;
export type NewExternalConnection = typeof externalconnections.$inferInsert;
// [SCOPE 017 / T005] END
