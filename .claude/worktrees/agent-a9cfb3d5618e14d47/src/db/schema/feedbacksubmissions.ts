import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  integer,
  index,
  AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { companyprojects } from "./companyproject";
import { userprofiles } from "./userprofiles";
import { companies } from "./company";

// [SCOPE 043 / T001] BEGIN — feedbacksubmissions table + migration
// MODIFIED-BY: [SCOPE 043 / T011] — v2 disposition + scope-seed columns
// MODIFIED-BY: [SCOPE 063 / T001] — AI-suggested fix + linked-task columns
// MODIFIED-BY: [SCOPE 110 / T001] — queue hygiene: dismissal/hide/reopen fields + not-dismissed index
export const feedbacksubmissions = pgTable("feedbacksubmissions", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  // Project-scoped like specs 042/028 — Layer 1 is wxKanban's own channel, but
  // the row carries no wxKanban-specific assumption so Layer 2 reuse is free.
  projectid: uuid("projectid")
    .notNull()
    .references(() => companyprojects.id, { onDelete: "cascade" }),
  userid: uuid("userid")
    .notNull()
    .references(() => userprofiles.id, { onDelete: "cascade" }),
  companyid: uuid("companyid").references(() => companies.id, {
    onDelete: "cascade",
  }),
  type: varchar("type", { length: 20 }).notNull(), // submitter's choice: 'bug' | 'suggestion'
  title: varchar("title", { length: 255 }).notNull(),
  details: jsonb("details").notNull(), // persona-elicited structured answers (Bug Reporter / Feature Suggester)
  context: jsonb("context"), // auto-captured: kitversion, activescope, vscodeversion, os
  // Background AI triage results (null until triaged).
  classification: varchar("classification", { length: 20 }), // AI: 'bug' | 'suggestion'
  severity: varchar("severity", { length: 20 }), // AI-assigned severity tag
  duplicateofid: uuid("duplicateofid").references(
    (): AnyPgColumn => feedbacksubmissions.id,
    { onDelete: "set null" },
  ), // dedup link — set when AI/admin marks this a duplicate of an existing item
  // Triage workflow.
  status: varchar("status", { length: 20 }).default("new").notNull(), // new|triaged|needsinfo|inprogress|resolved|declined
  declinereason: text("declinereason"), // required when status = 'declined'
  internalnotes: text("internalnotes"), // wxperts-only triage notes
  // Single-round needs-info clarification (same record).
  clarificationquestion: text("clarificationquestion"),
  clarificationanswer: text("clarificationanswer"),
  // Submitter-side notification channel (v1: inapp|email; v2 adds sms, aiassistant).
  notificationchannel: varchar("notificationchannel", { length: 20 })
    .default("inapp")
    .notNull(),
  // Fan-out legs — DB row is source of truth; a failed leg is marked pending for
  // manual SysAdmin retry (no background worker in v1). Never silently dropped.
  artifactstatus: varchar("artifactstatus", { length: 20 })
    .default("pending")
    .notNull(), // pending|done|failed — lifecycle-artifact render leg
  artifactpath: varchar("artifactpath", { length: 500 }), // path to the rendered bugreports.md-style artifact
  notifystatus: varchar("notifystatus", { length: 20 })
    .default("pending")
    .notNull(), // pending|done|failed — notification leg
  // v2 (spec 043 / T011) — web triage console decision layer + accept-to-scope.
  aiproposeddisposition: varchar("aiproposeddisposition", { length: 20 }), // AI: scope|outofbandfix|duplicate|decline|needsinfo
  dispositionrationale: text("dispositionrationale"), // AI's one-line reason
  disposition: varchar("disposition", { length: 20 }), // admin's final choice (override retained alongside aiproposeddisposition)
  dispositionedat: timestamp("dispositionedat"), // when the admin set the final disposition
  dispositionedbyid: uuid("dispositionedbyid"), // admin who dispositioned (audit; no FK to keep the decision row self-contained)
  linkedscopenumber: varchar("linkedscopenumber", { length: 10 }), // NNN produced by accept-to-scope; null until scoped
  scopeseed: jsonb("scopeseed"), // { title, shortname, body } the kit materializes to specs/Project-Scope/NNN.md on open
  // [SCOPE 061] BEGIN — automatic error capture (source='auto', type='error')
  source: varchar("source", { length: 10 }).default("manual").notNull(), // 'manual' (user feedback) | 'auto' (trapped runtime error)
  errorfingerprint: varchar("errorfingerprint", { length: 64 }), // deterministic hash for grouping auto-errors
  occurrencecount: integer("occurrencecount").default(1).notNull(), // grouped repeats increment instead of inserting
  firstoccurredat: timestamp("firstoccurredat"),
  lastoccurredat: timestamp("lastoccurredat"),
  // [SCOPE 061] END
  // [SCOPE 063] BEGIN — customer per-project triage: AI-suggested fix + linked task
  suggestedsolution: text("suggestedsolution"), // AI's proposed cause + fix (null until /suggest runs)
  suggestedsolutionrationale: text("suggestedsolutionrationale"), // AI's one-line reasoning / confidence
  suggestedat: timestamp("suggestedat"), // when the AI suggestion pass last ran (null = not yet)
  linkedtaskid: uuid("linkedtaskid"), // task created from this report (audit; no FK to keep the row self-contained)
  // [SCOPE 063] END
  // [SCOPE 110 / T001] feedback queue hygiene — removal + reopen visibility state.
  // All optional and self-contained (no FKs), matching the dispositioned* pattern.
  dismissedat: timestamp("dismissedat"), // admin dismissed — reversible hide (FR-001)
  dismissedbyid: uuid("dismissedbyid"), // admin who dismissed (no FK; decision stays self-contained)
  submitterhiddenat: timestamp("submitterhiddenat"), // submitter hid from own list (FR-004)
  reopenedat: timestamp("reopenedat"), // last reopened by a recurrence (FR-010)
  createdat: timestamp("createdat").defaultNow().notNull(),
  firsttriagedat: timestamp("firsttriagedat"), // stamped once, on first status change
  updatedat: timestamp("updatedat").defaultNow().notNull(),
}, (table) => ({
  projectidIdx: index("idx_feedbacksubmissions_projectid").on(table.projectid),
  useridStatusIdx: index("idx_feedbacksubmissions_userid_status").on(
    table.userid,
    table.status,
  ), // project.list_my_feedback — submitter's own items by status
  statusIdx: index("idx_feedbacksubmissions_status").on(table.status), // SysAdmin triage queue
  // [SCOPE 061] dedup lookup for auto-captured errors by fingerprint.
  errorFingerprintIdx: index("idx_feedbacksubmissions_errorfingerprint")
    .on(table.errorfingerprint)
    .where(sql`source = 'auto'`),
  // [SCOPE 110 / T001] default not-dismissed queue — a project's live (non-dismissed) items.
  // The unique (projectid, errorfingerprint) WHERE source='auto' index is added in T007,
  // AFTER the T006 merge — applying it to un-merged data fails loudly by design.
  notDismissedIdx: index("idx_feedbacksubmissions_project_notdismissed").on(
    table.projectid,
    table.dismissedat,
  ),
}));
// [SCOPE 043 / T001] END

export type FeedbackSubmission = typeof feedbacksubmissions.$inferSelect;
export type NewFeedbackSubmission = typeof feedbacksubmissions.$inferInsert;
