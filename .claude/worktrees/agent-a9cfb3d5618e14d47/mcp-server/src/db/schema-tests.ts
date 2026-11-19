// [SCOPE 111 / T027] BEGIN — Test Suite Lifecycle schema mirrors for the MCP server
//
// Hand-maintained mirrors of the app schema (src/db/schema/test*.ts). Property
// names are camelCase per this package's convention; the DB column names in the
// second argument are the authority and MUST match the app side exactly, since
// both packages talk to the same database. Kept in its own module rather than
// appended to schema.ts so the eight tables this scope adds are reviewable as a
// unit and do not bloat the shared file.
import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, integer } from 'drizzle-orm/pg-core';

export const testplans = pgTable('testplans', {
  id: uuid('id').primaryKey().defaultRandom(),
  specId: uuid('specid').notNull(),
  projectId: uuid('projectid'),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  source: varchar('source', { length: 20 }).default('ai').notNull(),
  generatedById: uuid('generatedbyid'),
  generatedAt: timestamp('generatedat', { withTimezone: true }),
  itemCount: integer('itemcount').default(0).notNull(),
  forceTest: boolean('forcetest').default(false).notNull(),
  createdAt: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedat', { withTimezone: true }).defaultNow().notNull(),
});

export const testplanitems = pgTable('testplanitems', {
  id: uuid('id').primaryKey(),
  testPlanId: uuid('testplanid').notNull(),
  projectId: uuid('projectid').notNull(),
  specId: uuid('specid'),
  taskId: uuid('taskid'),
  itemKey: varchar('itemkey', { length: 100 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  requirementId: varchar('requirementid', { length: 50 }),
  specRef: varchar('specref', { length: 500 }),
  fenceRef: varchar('fenceref', { length: 100 }),
  gate: varchar('gate', { length: 20 }).notNull(),
  layer: varchar('layer', { length: 20 }).default('app').notNull(),
  variant: varchar('variant', { length: 20 }).default('happy').notNull(),
  priority: varchar('priority', { length: 10 }).default('P2').notNull(),
  riskTier: varchar('risktier', { length: 10 }).default('MEDIUM').notNull(),
  testLevel: varchar('testlevel', { length: 20 }).default('integration').notNull(),
  tier: varchar('tier', { length: 20 }).default('unit-mocked').notNull(),
  automation: varchar('automation', { length: 20 }).default('automatable').notNull(),
  automationRef: varchar('automationref', { length: 500 }),
  // machine | human — which set the item belongs to, and which gate answers for it.
  executor: varchar('executor', { length: 10 }).notNull(),
  // ai | user — who AUTHORED it. Independent of executor.
  origin: varchar('origin', { length: 10 }).default('ai').notNull(),
  released: boolean('released').default(false).notNull(),
  releasedAt: timestamp('releasedat', { withTimezone: true }),
  // null = inherit the plan's flag. Never coerce this to false.
  forceTest: boolean('forcetest'),
  lastResultStatus: varchar('lastresultstatus', { length: 20 }),
  lastResultAt: timestamp('lastresultat', { withTimezone: true }),
  lastRunId: uuid('lastrunid'),
  detail: jsonb('detail').notNull(),
  createdAt: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedat', { withTimezone: true }).defaultNow().notNull(),
});

export const testitemsubjects = pgTable('testitemsubjects', {
  id: uuid('id').primaryKey(),
  itemId: uuid('itemid').notNull(),
  projectId: uuid('projectid').notNull(),
  sourcePath: varchar('sourcepath', { length: 500 }).notNull(),
  sourceLine: integer('sourceline'),
  unitId: varchar('unitid', { length: 500 }),
  role: varchar('role', { length: 20 }).default('primary').notNull(),
  createdAt: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
});

export const testcycles = pgTable('testcycles', {
  id: uuid('id').primaryKey(),
  projectId: uuid('projectid').notNull(),
  version: varchar('version', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).default('open').notNull(),
  commitSha: varchar('commitsha', { length: 100 }),
  buildRef: varchar('buildref', { length: 255 }),
  openedAt: timestamp('openedat', { withTimezone: true }).defaultNow().notNull(),
  promotedToUatAt: timestamp('promotedtouatat', { withTimezone: true }),
  promotedToProductionAt: timestamp('promotedtoproductionat', { withTimezone: true }),
  supersededAt: timestamp('supersededat', { withTimezone: true }),
  promotedById: uuid('promotedbyid'),
  notes: text('notes'),
  createdAt: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedat', { withTimezone: true }).defaultNow().notNull(),
});

export const testruns = pgTable('testruns', {
  id: uuid('id').primaryKey(),
  cycleId: uuid('cycleid').notNull(),
  projectId: uuid('projectid').notNull(),
  testPlanId: uuid('testplanid'),
  specId: uuid('specid'),
  runnerType: varchar('runnertype', { length: 20 }).notNull(),
  runnerRef: varchar('runnerref', { length: 500 }),
  isRegression: boolean('isregression').default(false).notNull(),
  gate: varchar('gate', { length: 20 }),
  environment: varchar('environment', { length: 20 }).default('local').notNull(),
  status: varchar('status', { length: 20 }).default('queued').notNull(),
  startedAt: timestamp('startedat', { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp('endedat', { withTimezone: true }),
  lastHeartbeatAt: timestamp('lastheartbeatat', { withTimezone: true }).defaultNow().notNull(),
  totalItems: integer('totalitems').default(0).notNull(),
  passedItems: integer('passeditems').default(0).notNull(),
  failedItems: integer('faileditems').default(0).notNull(),
  skippedItems: integer('skippeditems').default(0).notNull(),
  blockedItems: integer('blockeditems').default(0).notNull(),
  declaredItemIds: jsonb('declareditemids').default('[]').notNull(),
  // What the runner is executing right now — the column the live view exists for.
  currentItemId: uuid('currentitemid'),
  triggeredById: uuid('triggeredbyid'),
  createdAt: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedat', { withTimezone: true }).defaultNow().notNull(),
});

export const testrunresults = pgTable('testrunresults', {
  id: uuid('id').primaryKey(),
  runId: uuid('runid').notNull(),
  itemId: uuid('itemid').notNull(),
  cycleId: uuid('cycleid').notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  bucket: varchar('bucket', { length: 20 }),
  evidence: text('evidence'),
  durationMs: integer('durationms'),
  bugReportId: uuid('bugreportid'),
  startedAt: timestamp('startedat', { withTimezone: true }),
  endedAt: timestamp('endedat', { withTimezone: true }),
  createdAt: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
});

export const testsignoffs = pgTable('testsignoffs', {
  id: uuid('id').primaryKey(),
  cycleId: uuid('cycleid').notNull(),
  itemId: uuid('itemid').notNull(),
  // Tied to testplanitems(id, executor) by a composite FK on the app side, with
  // a check constraint fixing the legal pairings. Do not write this by hand.
  itemExecutor: varchar('itemexecutor', { length: 10 }).notNull(),
  signoffType: varchar('signofftype', { length: 10 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  signedById: uuid('signedbyid'),
  signedByLabel: varchar('signedbylabel', { length: 100 }),
  runId: uuid('runid'),
  signedAgainstVersion: varchar('signedagainstversion', { length: 50 }),
  signedAgainstBuildRef: varchar('signedagainstbuildref', { length: 255 }),
  notes: text('notes'),
  superseded: boolean('superseded').default(false).notNull(),
  supersededAt: timestamp('supersededat', { withTimezone: true }),
  signedAt: timestamp('signedat', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedat', { withTimezone: true }).defaultNow().notNull(),
});

export const testretests = pgTable('testretests', {
  id: uuid('id').primaryKey(),
  cycleId: uuid('cycleid').notNull(),
  itemId: uuid('itemid').notNull(),
  reason: varchar('reason', { length: 20 }).notNull(),
  triggerPath: varchar('triggerpath', { length: 500 }),
  triggerFence: varchar('triggerfence', { length: 100 }),
  triggerUnit: varchar('triggerunit', { length: 500 }),
  reachedSubjectId: uuid('reachedsubjectid'),
  chain: text('chain'),
  pathLength: integer('pathlength'),
  appliedAt: timestamp('appliedat', { withTimezone: true }).defaultNow().notNull(),
  // null = unanswered, which is what blocks the gate.
  resolution: varchar('resolution', { length: 20 }),
  resolvedAt: timestamp('resolvedat', { withTimezone: true }),
  dismissedById: uuid('dismissedbyid'),
  dismissReason: text('dismissreason'),
  createdAt: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedat', { withTimezone: true }).defaultNow().notNull(),
});

export type TestPlanRow = typeof testplans.$inferSelect;
export type TestPlanItemRow = typeof testplanitems.$inferSelect;
export type TestCycleRow = typeof testcycles.$inferSelect;
export type TestRunRow = typeof testruns.$inferSelect;
export type TestSignoffRow = typeof testsignoffs.$inferSelect;
export type TestRetestRow = typeof testretests.$inferSelect;
// [SCOPE 111 / T027] END
