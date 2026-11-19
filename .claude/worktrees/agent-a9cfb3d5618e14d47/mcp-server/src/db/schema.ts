// Re-export relevant schema from main project
// These are the tables we'll be working with for MCP tools

import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, integer, uniqueIndex, index, customType } from 'drizzle-orm/pg-core';

// [SCOPE 074 / T001] BEGIN — pgvector column type (drizzle 0.30 has no native vector).
// Stored as `vector(N)`; driver value is the pgvector text form `[a,b,c]`.
export const vector = (name: string, dimensions: number) =>
  customType<{ data: number[]; driverData: string; config: { dimensions: number } }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(',')}]`;
    },
    fromDriver(value: string): number[] {
      return value.replace(/^\[|\]$/g, '').split(',').filter(Boolean).map(Number);
    },
  })(name);
// [SCOPE 074 / T001] END


// [SCOPE 058 / T003] BEGIN — minimal read-only mirrors for the scope check-out guard:
// holder-name resolution, single-member-company short-circuit, and the consultant
// engagement guard. Not project-scoped; queried via scoped.raw with explicit WHEREs.
export const userprofiles = pgTable('userprofiles', {
  id: uuid('id').primaryKey(),
  fullname: varchar('fullname', { length: 80 }),
  emailaddr: varchar('emailaddr', { length: 80 }),
  companyid: uuid('companyid'),
  // [SCOPE 058 / T004] usertype — needed to gate ADMIN-only forced check-in.
  usertype: varchar('usertype', { length: 50 }),
});

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey(),
  // Mirrored for [SCOPE 043 / T020]: the feedback notification names the
  // reporting company. Absent from this mirror until then, so any read of
  // `.name` here silently returned undefined rather than failing.
  name: varchar('name', { length: 255 }),
  billingplan: varchar('billingplan', { length: 50 }),
  // Entitlement mirror (read-only). Source of truth: src/db/schema/company.ts.
  // subscriptionstatus ∈ ACTIVE | TRIAL | SUSPENDED | CANCELLED | PENDING.
  subscriptionstatus: varchar('subscriptionstatus', { length: 20 }),
  activeflag: boolean('activeflag'),
  // billingexempt customers (internal / kit-author) always pass entitlement.
  billingexempt: boolean('billingexempt'),
});

export const engagements = pgTable('engagements', {
  id: uuid('id').primaryKey(),
  clientcompanyid: uuid('clientcompanyid').notNull(),
  consultingcompanyid: uuid('consultingcompanyid').notNull(),
  state: varchar('state', { length: 20 }).notNull(),
});

export const engagementassignments = pgTable('engagementassignments', {
  id: uuid('id').primaryKey(),
  engagementid: uuid('engagementid').notNull(),
  scopeid: varchar('scopeid', { length: 32 }),
  taskid: uuid('taskid'),
  projectid: uuid('projectid').notNull(),
  removedat: timestamp('removedat', { withTimezone: true }),
});
// [SCOPE 058 / T003] END

// [SCOPE 043 / T022] BEGIN — notifications mirror (submitter's in-app inbox).
// Mirrored so an MCP-driven status change reaches the submitter, matching the web
// screen's always-on in-app leg. Column set verified against production before
// declaring: Drizzle SELECTs every declared column, so a wrong name breaks every
// read of this table.
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userid: uuid('userid').notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  entityid: uuid('entityid'),
  entitytype: varchar('entitytype', { length: 50 }),
  message: text('message').notNull(),
  read: boolean('read').default(false).notNull(),
  createdat: timestamp('createdat').defaultNow().notNull(),
});
// [SCOPE 043 / T022] END

// Events table (new for MCP)
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('projectid').notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  source: varchar('source', { length: 50 }).notNull(),
  actor: varchar('actor', { length: 255 }).notNull(),
  rawContent: text('raw_content').notNull(),
  normalizedContent: text('normalized_content'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Project Documents (existing table)
export const projectdocuments = pgTable('projectdocuments', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('projectid').notNull(),
  specId: uuid('specid'),
  doctype: varchar('doctype', { length: 50 }),
  title: varchar('title', { length: 500 }).notNull(),
  content: text('content').notNull(),
  filepath: varchar('filepath', { length: 1000 }),
  isGenerated: boolean('isgenerated').default(false),
  createdById: uuid('createdbyid'),
  sourceEventId: uuid('sourceeventid'),
  taskIds: jsonb('taskids').default('[]'),
  tags: jsonb('tags').default('[]'),
  createdAt: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedat', { withTimezone: true }).defaultNow().notNull(),
});


// Project Tasks (existing table)
export const projecttasks = pgTable('projecttasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('projectid').notNull(),
  specId: uuid('specid'),
  createdById: uuid('createdbyid'),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).default('open').notNull(),
  priority: varchar('priority', { length: 50 }).default('medium').notNull(),
  dueDate: timestamp('duedate', { withTimezone: true }),
  sourceEventId: uuid('sourceeventid'),
  documentIds: jsonb('documentids').default('[]'),
  assignee: varchar('assignee', { length: 255 }),
  // [SCOPE 101 / T014] The app's assignee column (FK → userprofiles). Present in
  // production (verified 2026-09-25) — declared only after confirming, since a
  // declared-but-missing column makes every SELECT on this table 500.
  assignedToId: uuid('assignedtoid'),
  createdAt: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedat', { withTimezone: true }).defaultNow().notNull(),
});


// Project Specifications (existing table)
export const projectspecifications = pgTable('projectspecifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('projectid').notNull(),
  specNumber: varchar('specnumber', { length: 10 }).notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  content: text('content'),
  // status vocabulary mirrors the app schema; includes 'archived' (SCOPE-103). Free varchar, no enum.
  status: varchar('status', { length: 50 }).default('draft').notNull(),
  specOrder: integer('specorder').default(0),
  isOptional: boolean('isoptional').default(false),
  createdById: uuid('createdbyid'),
  // [SCOPE 058 / T001] BEGIN — scope check-out claim (mirror of app schema)
  claimedById: uuid('claimedbyid'),
  claimedAt: timestamp('claimedat', { withTimezone: true }),
  // [SCOPE 058 / T001] END
  createdAt: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedat', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // [SCOPE 058 dedup] mirror of the app-side unique index (one spec per project+specnumber).
  projectSpecnumberUnique: uniqueIndex('idx_projectspec_project_specnumber').on(table.projectId, table.specNumber),
}));

// Company Projects (existing table - for project context)
export const companyprojects = pgTable('companyprojects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('userid'),
  companyId: uuid('companyid'),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).default('active'),
  // [SCOPE 133 / T016] currentphase is varchar(50) NOT NULL in production and always
  // has been. It was simply never declared here — this mirror carried 8 of the table's
  // 17 columns — so Drizzle never selected it, `project.currentphase` read `undefined`,
  // and a hardcoded `currentPhase: null` was written in loadProjectSummary to cover it.
  // Verified present 2026-09-23 before declaring.
  currentphase: varchar('currentphase', { length: 50 }),
  createdAt: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedat', { withTimezone: true }).defaultNow().notNull(),
});

// Project Phases (existing table — for lifecycle stage enforcement)
export const projectphases = pgTable('projectphases', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('projectid').notNull(),
  phaseName: varchar('phasename', { length: 50 }).notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(),
  enteredAt: timestamp('enteredat', { withTimezone: true }),
  completedAt: timestamp('completedat', { withTimezone: true }),
  createdAt: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
});

// Project Proposals (Spec 024 — proposal pipeline for new projects)
export const projectproposals = pgTable('projectproposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyid: uuid('companyid').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  priority: varchar('priority', { length: 20 }).default('medium').notNull(),
  estimatedeffort: varchar('estimatedeffort', { length: 100 }),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  rejectionreason: text('rejectionreason'),
  proposeddate: timestamp('proposeddate', { withTimezone: true }).defaultNow().notNull(),
  source: varchar('source', { length: 255 }).notNull(),
  projectid: uuid('projectid'),
  createdbyid: varchar('createdbyid', { length: 255 }).notNull(),
  createdAt: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedat', { withTimezone: true }).defaultNow().notNull(),
});

// App Audit Configuration (compliance framework flags per project)
// [SCOPE 112 / T003] MODIFIED-BY — mirror refreshed for migration 0010: `projectid`
// is the authoritative grain and `nistssdfenabled`/`iso27001enabled` were added.
// `appid` is retained because pre-cutover rows still carry company ids there.
export const appauditconfiguration = pgTable('appauditconfiguration', {
  id: uuid('id').primaryKey().defaultRandom(),
  appid: uuid('appid').notNull().unique(),
  projectid: uuid('projectid'),
  soc2enabled: boolean('soc2enabled').notNull().default(false),
  hipaaenabled: boolean('hipaaenabled').notNull().default(false),
  hitrustenabled: boolean('hitrustenabled').notNull().default(false),
  gdprenabled: boolean('gdprenabled').notNull().default(false),
  nistssdfenabled: boolean('nistssdfenabled').notNull().default(false),
  iso27001enabled: boolean('iso27001enabled').notNull().default(false),
  autoauditondeploy: boolean('autoauditondeploy').notNull().default(true),
  autoauditschedule: varchar('autoauditschedule', { length: 50 }).notNull().default('weekly'),
  auditseveritythreshold: varchar('auditseveritythreshold', { length: 20 }).notNull().default('medium'),
  failoncritical: boolean('failoncritical').notNull().default(true),
  auditreportretentiondays: integer('auditreportretentiondays').notNull().default(365),
  createdat: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
  updatedat: timestamp('updatedat', { withTimezone: true }).defaultNow().notNull(),
});

// Spec 028 hosted-MCP tables — schema mirror; authoritative declarations live
// in wxKanban's src/db/schema/{mcpapitokens,mcprequestaudit}.ts. Mirror here so
// the MCP server can read/write without importing across package boundaries.
export const mcpapitokens = pgTable('mcpapitokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerid: uuid('customerid').notNull(),
  projectid: uuid('projectid').notNull(),
  tokenhash: text('tokenhash').notNull(),
  tokenprefix: text('tokenprefix').notNull(),
  name: text('name').notNull(),
  issuedbyid: uuid('issuedbyid').notNull(),
  issuedat: timestamp('issuedat', { withTimezone: true }).notNull().defaultNow(),
  expiresat: timestamp('expiresat', { withTimezone: true }),
  revokedat: timestamp('revokedat', { withTimezone: true }),
  revokedbyid: uuid('revokedbyid'),
  lastusedat: timestamp('lastusedat', { withTimezone: true }),
  // [SCOPE 133 / T001] Agent identity: `NAME:<sha256-of-token>`, e.g. `KAIN:<hash>`.
  // NULLABLE and must stay so — 356 unbound tokens authenticate through this table on
  // every request. Declared only after the column was applied to production 2026-09-23.
  clientbinding: varchar('clientbinding', { length: 255 }),
  createdat: timestamp('createdat', { withTimezone: true }).notNull().defaultNow(),
});

// [SCOPE 134 / T028] BEGIN — projectagentgrants mirror (read-only here)
// The MCP auth middleware re-checks a grant-minted token's grant on EVERY call, so
// unticking the box stops an agent already working. Mirrors the app's declaration;
// the table was applied to production 2026-09-25 (migration 0070) before this landed.
export const projectagentgrants = pgTable('projectagentgrants', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectid: uuid('projectid').notNull(),
  agentname: varchar('agentname', { length: 64 }).notNull(),
  grantedbyid: uuid('grantedbyid').notNull(),
  grantedat: timestamp('grantedat', { withTimezone: true }).notNull().defaultNow(),
  revokedat: timestamp('revokedat', { withTimezone: true }),
  revokedbyid: uuid('revokedbyid'),
});
// [SCOPE 134 / T028] END

// [SCOPE 152 / T003] BEGIN — agentdevicetokens mirror (read-only here)
// The MCP auth middleware checks the K.A.I.N. device behind a connect-minted token on EVERY
// call, so a revoked device stops at its next call (FR-065, FR-070). Mirrors the app's
// declaration; the table was applied to production 2026-10-28 before this landed.
export const agentdevicetokens = pgTable('agentdevicetokens', {
  id: uuid('id').primaryKey(),
  userid: uuid('userid').notNull(),
  companyid: uuid('companyid').notNull(),
  devicename: varchar('devicename', { length: 100 }).notNull(),
  tokenhash: varchar('tokenhash', { length: 64 }).notNull(),
  createdat: timestamp('createdat', { withTimezone: true }).notNull().defaultNow(),
  lastusedat: timestamp('lastusedat', { withTimezone: true }),
  revokedat: timestamp('revokedat', { withTimezone: true }),
  revokedbyid: uuid('revokedbyid'),
  revokereason: varchar('revokereason', { length: 32 }),
});
// [SCOPE 152 / T003] END

// [SCOPE 134 / T004] BEGIN — projectrooms mirror (FR-017: declared in BOTH schemas)
// Declared in one schema only, a read here would come back `undefined` silently — the
// mechanism that once turned companyprojects.currentphase into a hardcoded null.
export const projectrooms = pgTable('projectrooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectid: uuid('projectid').notNull(),
  agentname: varchar('agentname', { length: 64 }).notNull(),
  conversationid: varchar('conversationid', { length: 255 }).notNull(),
  agenttokenmintedat: timestamp('agenttokenmintedat', { withTimezone: true }),
  createdat: timestamp('createdat', { withTimezone: true }).notNull().defaultNow(),
  updatedat: timestamp('updatedat', { withTimezone: true }).notNull().defaultNow(),
});
// [SCOPE 134 / T004] END

export const mcprequestaudit = pgTable('mcprequestaudit', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestid: uuid('requestid').notNull(),
  tokenid: uuid('tokenid'),
  customerid: uuid('customerid'),
  projectid: uuid('projectid'),
  // [SCOPE 043 / audit] The project the caller ASKED for, vs `projectid` above
  // which is the project their TOKEN is bound to. Equal for well-behaved traffic;
  // different for exactly the traffic an audit trail exists to catch.
  // Requires migration 0061 — see that file for the mandatory apply ordering.
  requestedprojectid: uuid('requestedprojectid'),
  tool: text('tool'),
  methodpath: text('methodpath').notNull(),
  durationms: integer('durationms').notNull(),
  outcome: text('outcome').notNull(),
  errorcode: text('errorcode'),
  responsestatus: integer('responsestatus').notNull(),
  clientip: text('clientip'),
  useragent: text('useragent'),
  createdat: timestamp('createdat', { withTimezone: true }).notNull().defaultNow(),
});

// [SCOPE 043 / T002] BEGIN — feedbacksubmissions (User Feedback: bug reports & suggestions)
// MODIFIED-BY: [SCOPE 043 / T013] — v2 disposition + scope-seed columns
// MODIFIED-BY: [SCOPE 063 / T001] — AI-suggested fix + linked-task columns (mirror)
// Plain `timestamp` (no tz) to match migration 0024 + the main-app schema's
// physical column type. DB row is the source of truth; artifactstatus/notifystatus
// are the fan-out legs (pending|done|failed), reconciled — never silently dropped.
export const feedbacksubmissions = pgTable('feedbacksubmissions', {
  // DB-side default (gen_random_uuid), matching every other MCP-managed table.
  // Migration 0025 adds the column default that 0024 omitted.
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('projectid').notNull(),
  userId: uuid('userid').notNull(),
  companyId: uuid('companyid'),
  type: varchar('type', { length: 20 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  details: jsonb('details').notNull(),
  context: jsonb('context'),
  classification: varchar('classification', { length: 20 }),
  severity: varchar('severity', { length: 20 }),
  duplicateOfId: uuid('duplicateofid'),
  status: varchar('status', { length: 20 }).default('new').notNull(),
  declineReason: text('declinereason'),
  internalNotes: text('internalnotes'),
  clarificationQuestion: text('clarificationquestion'),
  clarificationAnswer: text('clarificationanswer'),
  notificationChannel: varchar('notificationchannel', { length: 20 }).default('inapp').notNull(),
  artifactStatus: varchar('artifactstatus', { length: 20 }).default('pending').notNull(),
  artifactPath: varchar('artifactpath', { length: 500 }),
  notifyStatus: varchar('notifystatus', { length: 20 }).default('pending').notNull(),
  // [SCOPE 043 / T013] v2 decision layer — AI proposes a disposition; admin
  // overrides in SysAdmin; accept-to-scope stores a seed (kit materializes it).
  aiproposedDisposition: varchar('aiproposeddisposition', { length: 20 }),
  dispositionRationale: text('dispositionrationale'),
  disposition: varchar('disposition', { length: 20 }),
  dispositionedAt: timestamp('dispositionedat'),
  dispositionedById: uuid('dispositionedbyid'),
  linkedScopeNumber: varchar('linkedscopenumber', { length: 10 }),
  scopeSeed: jsonb('scopeseed'),
  // [SCOPE 061] automatic error capture (mirror of app schema).
  source: varchar('source', { length: 10 }).default('manual').notNull(),
  errorFingerprint: varchar('errorfingerprint', { length: 64 }),
  occurrenceCount: integer('occurrencecount').default(1).notNull(),
  firstOccurredAt: timestamp('firstoccurredat'),
  lastOccurredAt: timestamp('lastoccurredat'),
  // [SCOPE 063] customer per-project triage: AI-suggested fix + linked task (mirror of app schema).
  suggestedSolution: text('suggestedsolution'),
  suggestedSolutionRationale: text('suggestedsolutionrationale'),
  suggestedAt: timestamp('suggestedat'),
  linkedTaskId: uuid('linkedtaskid'),
  // [SCOPE 110 / T001] feedback queue hygiene (mirror of app schema). The submitter
  // hide/self-delete MCP tool (T011) writes submitterhiddenat here, so these columns
  // MUST exist in the hosted MCP DB, not only the app DB.
  dismissedAt: timestamp('dismissedat'),
  dismissedById: uuid('dismissedbyid'),
  submitterHiddenAt: timestamp('submitterhiddenat'),
  reopenedAt: timestamp('reopenedat'),
  createdAt: timestamp('createdat').defaultNow().notNull(),
  firstTriagedAt: timestamp('firsttriagedat'),
  updatedAt: timestamp('updatedat').defaultNow().notNull(),
});
export type FeedbackSubmission = typeof feedbacksubmissions.$inferSelect;
export type NewFeedbackSubmission = typeof feedbacksubmissions.$inferInsert;
// [SCOPE 043 / T002] END

// [SCOPE 110 / T011] BEGIN — companyauditlogs mirror (submitter self-delete audit)
// FR-005: a submitter's self-delete is audited identically to the SysAdmin purge
// (FR-002), which writes to companyauditlogs. The hosted MCP runs a separate DB,
// so the table must exist here too. Mirror of the app schema, without FKs (matching
// the MCP mirror convention). Created on the hosted MCP DB by the T007 migration batch.
export const companyauditlogs = pgTable('companyauditlogs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyid: uuid('companyid').notNull(),
  action: varchar('action', { length: 100 }).notNull(),
  changedby: uuid('changedby'),
  previousvalue: jsonb('previousvalue'),
  newvalue: jsonb('newvalue'),
  description: text('description'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});
export type CompanyAuditLog = typeof companyauditlogs.$inferSelect;
// [SCOPE 110 / T011] END

// [SCOPE 074 / T001] BEGIN — capabilityindex (System Capability Index, semantic reuse)
// Source-agnostic: `sourcetype` (scope|app|code) + `sourceref` identify the owning unit,
// so the same index scales from this project's scopes to a customer's app fleet (SCOPE-075)
// with no schema change. Embedding dim = 768 (Gemini text-embedding-004, the v1 default).
// Tenant-scoped by `projectid`. Re-indexing replaces a sourceref's rows. The embedding +
// similarity ops are done via raw parameterized SQL in utils/capability-index.ts.
export const capabilityindex = pgTable('capabilityindex', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectid: uuid('projectid').notNull(),
  sourcetype: varchar('sourcetype', { length: 16 }).notNull(), // scope | app | code
  sourceref: varchar('sourceref', { length: 128 }).notNull(),  // e.g. 073 or app:billing@alitho
  owner: varchar('owner', { length: 255 }).notNull(),
  capabilitytype: varchar('capabilitytype', { length: 32 }).notNull(), // process|table|route|doctype|command|workflow
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').notNull(),
  embedding: vector('embedding', 768),
  createdat: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
  updatedat: timestamp('updatedat', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  projectSourceIdx: index('idx_capabilityindex_project_sourceref').on(table.projectid, table.sourceref),
}));
export type CapabilityIndexRow = typeof capabilityindex.$inferSelect;
export type NewCapabilityIndexRow = typeof capabilityindex.$inferInsert;
// [SCOPE 074 / T001] END

// [SCOPE 073 / T001] BEGIN — scopedependencies (cross-scope dependency edges for scope-flow)
// Stores the namespaced refs harvested from each scope's Depends On / Related Scopes lines.
// Resolution against the known scope set happens at generation/health time (so "missing/
// not-yet-built" is recomputed as scopes are added). Re-capturing a source replaces its rows.
export const scopedependencies = pgTable('scopedependencies', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectid: uuid('projectid').notNull(),
  sourcescope: integer('sourcescope').notNull(),        // the scope citing the dependency
  targetnumber: integer('targetnumber').notNull(),      // the cited number
  targetnamespace: varchar('targetnamespace', { length: 16 }).notNull(), // scope|spec|specword|bare
  kind: varchar('kind', { length: 16 }).notNull(),      // dependsOn | related
  createdat: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  projectSourceIdx: index('idx_scopedependencies_project_source').on(table.projectid, table.sourcescope),
}));
export type ScopeDependencyRow = typeof scopedependencies.$inferSelect;
export type NewScopeDependencyRow = typeof scopedependencies.$inferInsert;
// [SCOPE 073 / T001] END

// [SCOPE 112 / T009] BEGIN — read-only mirrors backing project.get_compliance_context.
// Authoritative declarations live in wxKanban's src/db/schema/{wxkanbandocuments,
// complianceaudittasks}.ts. Mirrored rather than imported because the MCP server does
// not reach across the package boundary into src/, and NOT extracted to shared/ because
// shared/ is packed into the kit and the kit must not gain drizzle or pg.
//
// Neither table is project-scoped: framework rules are global reference content, the
// same for every tenant. Both are queried through scoped.raw with explicit WHEREs, never
// selectScoped — selectScoped would AND in a projectid these tables do not have.
export const wxkanbandocuments = pgTable('wxkanbandocuments', {
  id: uuid('id').primaryKey(),
  documenttype: varchar('documenttype', { length: 50 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  filename: varchar('filename', { length: 255 }),
  filecontent: text('filecontent'),
  filehash: varchar('filehash', { length: 64 }),
  framework: varchar('framework', { length: 50 }),
  version: varchar('version', { length: 20 }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  extractedtasks: integer('extractedtasks').notNull().default(0),
  createdat: timestamp('createdat').defaultNow().notNull(),
});
export type WxKanbanDocumentRow = typeof wxkanbandocuments.$inferSelect;

export const complianceaudittasks = pgTable('complianceaudittasks', {
  id: uuid('id').primaryKey(),
  documentid: uuid('documentid'),
  framework: varchar('framework', { length: 50 }).notNull(),
  category: varchar('category', { length: 100 }).notNull(),
  controlreference: varchar('controlreference', { length: 50 }),
  priority: varchar('priority', { length: 20 }).notNull(),
  tasktype: varchar('tasktype', { length: 50 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  requirementtext: text('requirementtext'),
  checkmethod: varchar('checkmethod', { length: 50 }),
  checkpattern: text('checkpattern'),
  suggestedfix: text('suggestedfix'),
  applicablephases: text('applicablephases').array().$type<string[]>(),
  applicablefiletypes: text('applicablefiletypes').array().$type<string[]>(),
  isautomated: boolean('isautomated').notNull().default(true),
  createdat: timestamp('createdat').defaultNow().notNull(),
});
export type ComplianceAuditTaskRow = typeof complianceaudittasks.$inferSelect;
// [SCOPE 112 / T009] END

export const MCP_AUDIT_OUTCOMES = [
  'success',
  'auth-failed',
  'throttled',
  'scope-violation',
  'error',
] as const;
export type McpAuditOutcome = (typeof MCP_AUDIT_OUTCOMES)[number];

// Export types
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type ProjectDocument = typeof projectdocuments.$inferSelect;
export type NewProjectDocument = typeof projectdocuments.$inferInsert;
export type ProjectTask = typeof projecttasks.$inferSelect;
export type NewProjectTask = typeof projecttasks.$inferInsert;
export type ProjectSpecification = typeof projectspecifications.$inferSelect;
export type CompanyProject = typeof companyprojects.$inferSelect;
export type McpApiToken = typeof mcpapitokens.$inferSelect;
export type NewMcpApiToken = typeof mcpapitokens.$inferInsert;
export type McpRequestAudit = typeof mcprequestaudit.$inferSelect;
export type NewMcpRequestAudit = typeof mcprequestaudit.$inferInsert;

// [SCOPE 111 / T027] Test Suite Lifecycle tables — mirrored in their own module.
export * from './schema-tests.js';
