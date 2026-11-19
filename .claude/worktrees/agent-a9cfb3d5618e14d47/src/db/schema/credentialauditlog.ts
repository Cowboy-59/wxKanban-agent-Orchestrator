import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  inet,
  index,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { userprofiles } from "./userprofiles.js";
import { companies } from "./company.js";
import { externalconnections } from "./externalconnection.js";

// [SCOPE 017 / T006] BEGIN — credentialauditlogs: every credential access, retained
/**
 * An immutable record of every credential access — view, edit, test, delete, sync.
 * SPEC-017 FR-012, which requires entries be "immutable and retained for 90 days
 * minimum".
 *
 * NOTHING CASCADES INTO THIS TABLE, and that is the whole design.
 *
 * The spec's own DDL declared `connectionid ... ON DELETE CASCADE`, which
 * contradicted its retention requirement: deleting a connection would have
 * destroyed its entire credential-access trail, handing anyone who wanted to
 * erase evidence a one-step way to do it. Both foreign keys here are therefore
 * NULLABLE with SET NULL, and each carries a denormalised snapshot
 * (`connectionname`, `useremail`) so a row stays readable after the connection
 * and the user it names are both gone.
 *
 * An audit log that can be deleted by deleting its subject is not an audit log.
 *
 * Rows are INSERT-ONLY. Nothing in the application may update or delete them;
 * retention pruning, when it exists, is the sole exception and belongs to a
 * dedicated job rather than any request path.
 */
export const credentialauditlogs = pgTable(
  "credentialauditlogs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),

    // Nullable by design — see the note above.
    connectionid: uuid("connectionid").references(() => externalconnections.id, {
      onDelete: "set null",
    }),
    connectionname: varchar("connectionname", { length: 255 }).notNull(),

    userid: uuid("userid").references(() => userprofiles.id, {
      onDelete: "set null",
    }),
    useremail: varchar("useremail", { length: 255 }).notNull(),

    // The company survives its members, so this one may cascade.
    companyid: uuid("companyid")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    // 'view' | 'edit' | 'test' | 'delete' | 'synctrigger' | 'synccomplete'
    action: varchar("action", { length: 50 }).notNull(),
    // 'success' | 'failure' — failures matter more than successes here.
    actionresult: varchar("actionresult", { length: 20 }).notNull(),

    ipaddress: inet("ipaddress"),
    useragent: text("useragent"),
    details: jsonb("details"),

    createdat: timestamp("createdat").defaultNow().notNull(),
  },
  (table) => ({
    connectionidIdx: index("idx_credentialauditlogs_connectionid").on(table.connectionid),
    useridIdx: index("idx_credentialauditlogs_userid").on(table.userid),
    companyidIdx: index("idx_credentialauditlogs_companyid").on(table.companyid),
    createdatIdx: index("idx_credentialauditlogs_createdat").on(table.createdat),
    actionIdx: index("idx_credentialauditlogs_action").on(table.action),
  }),
);

export type CredentialAuditLog = typeof credentialauditlogs.$inferSelect;
export type NewCredentialAuditLog = typeof credentialauditlogs.$inferInsert;
// [SCOPE 017 / T006] END
