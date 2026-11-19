// Helper to extract auth from request context
function extractAuth(extra: Record<string, unknown> | undefined): AuthContext {
  // HTTP transport: auth comes from request headers (or falls through to config defaults).
  const apiKey = (extra?.apiKey as string) || config.apiKey;
  const role = (extra?.role as AuthContext['role']) || 'editor';
  const userId = extra?.userId as string | undefined;
  const source = (extra?.source as string) || 'unknown';
  return {
    apiKey,
    role,
    userId,
    source,
  };
}
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { eq, desc, and, or, isNull, isNotNull, inArray, notInArray, gte, sql } from 'drizzle-orm';
import logger from './utils/logger.js';
import { randomUUID } from 'crypto'; // [SCOPE 133 / T007] server-minted session ids
import { db, pool } from './db/connection.js';
import { events, projectdocuments, projecttasks, projectspecifications, projectproposals, appauditconfiguration, feedbacksubmissions, companyauditlogs, userprofiles, companies, engagements, engagementassignments, companyprojects, wxkanbandocuments, complianceaudittasks, mcpapitokens, type ComplianceAuditTaskRow } from './db/schema.js';
// Spec 028 / T010 — every handler that reads/writes a project-scoped table
// must route through the scoped-query wrapper. The wrapper is request-scoped
// via the McpScope attached to `_meta.mcpScope` by the HTTP layer.
import { withScope, ScopeViolationError, type ScopedDb } from './db/scoped-query.js';
import type { McpScope } from './middleware/auth.js';

function getRequestScope(request: { params: { _meta?: unknown } }): ScopedDb {
  const meta = (request.params._meta ?? {}) as { mcpScope?: McpScope };
  return withScope(meta.mcpScope);
}

// [SCOPE 097 / T003] Load a project summary for project_mcp_health so a
// token-authenticated caller sees ITS project, not the server container's
// startup default (FR-002). Best-effort: any DB failure returns null rather
// than degrading the health tool.
async function loadProjectSummary(
  projectId: string
): Promise<{ id: string; name: string; status: string | null; currentPhase: string | null; companyId: string | null; updatedAt: string | null } | null> {
  try {
    const [project] = await db
      .select()
      .from(companyprojects)
      .where(eq(companyprojects.id, projectId))
      .limit(1);
    if (!project) return null;
    return {
      id: project.id,
      name: project.name,
      status: project.status ?? null,
      // [SCOPE 133 / T016] was a hardcoded `null` covering an undeclared column, not a
      // missing data source. The column exists and is NOT NULL in production; it is now
      // declared in the mirror, so this reads the real value. `?? null` only guards the
      // undeclared-mirror case, never substitutes for a measurement.
      currentPhase: project.currentphase ?? null,
      companyId: project.companyId ?? null,
      updatedAt: project.updatedAt ? project.updatedAt.toISOString() : null,
    };
  } catch {
    return null;
  }
}

// [SCOPE 058 / T003] BEGIN — helpers for scope check-out/check-in
/** Resolve a user's display name (fullname → email → 'unknown'); null id → 'unknown'. */
async function resolveUserName(scoped: ScopedDb, userId: string | null): Promise<string> {
  if (!userId) return 'unknown';
  const rows = (await scoped.raw
    .select({ fullname: userprofiles.fullname, emailaddr: userprofiles.emailaddr })
    .from(userprofiles)
    .where(eq(userprofiles.id, userId))) as Array<{ fullname: string | null; emailaddr: string | null }>;
  return rows[0]?.fullname || rows[0]?.emailaddr || 'unknown';
}

/** Kebab-case a scope title for the branch name: lowercase, non-alphanumeric → '-', trimmed, capped. */
function kebab(title: string): string {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '') || 'scope';
}

/** Resolve the caller's company id + billing plan (null if unknown). */
async function getCallerCompany(
  scoped: ScopedDb,
  userId: string | null,
): Promise<{ companyId: string | null; billingPlan: string | null }> {
  if (!userId) return { companyId: null, billingPlan: null };
  const rows = (await scoped.raw
    .select({ companyid: userprofiles.companyid, billingplan: companies.billingplan })
    .from(userprofiles)
    .leftJoin(companies, eq(companies.id, userprofiles.companyid))
    .where(eq(userprofiles.id, userId))) as Array<{ companyid: string | null; billingplan: string | null }>;
  return { companyId: rows[0]?.companyid ?? null, billingPlan: rows[0]?.billingplan ?? null };
}

// [SCOPE 058 / T004] BEGIN — resolve whether the acting user is an ADMIN.
// FR-003 gates forced check-in (releasing another dev's claim) on ADMIN. The
// request's auth.role is NOT the user's role on the HTTP/git-hook paths (it
// defaults to 'editor'), so we must resolve the caller's actual usertype from
// userprofiles by id — same pattern as getCallerCompany.
async function isCallerAdmin(scoped: ScopedDb, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const rows = (await scoped.raw
    .select({ usertype: userprofiles.usertype })
    .from(userprofiles)
    .where(eq(userprofiles.id, userId))) as Array<{ usertype: string | null }>;
  const t = rows[0]?.usertype;
  return t === 'ADMIN' || t === 'SYSADMIN';
}
// [SCOPE 058 / T004] END

/** Single-member company? (one person → no coordination needed, check-out/in are no-ops). */
async function isSingleMemberCompany(scoped: ScopedDb, companyId: string | null): Promise<boolean> {
  if (!companyId) return false;
  const rows = (await scoped.raw
    .select({ id: userprofiles.id })
    .from(userprofiles)
    .where(eq(userprofiles.companyid, companyId))
    .limit(2)) as Array<{ id: string }>;
  return rows.length <= 1;
}

/**
 * Does the consultant's company hold an active engagement grant for this scope?
 * Grant = an active engagement (consultingcompanyid = caller company, state 'active')
 * with an engagementassignment on this project (removedat null) that is either a direct
 * scope grant (scopeid = specNumber) or a project-level grant (scopeid AND taskid null).
 */
async function consultantScopeGranted(
  scoped: ScopedDb,
  consultingCompanyId: string,
  projectId: string,
  specNumber: string,
): Promise<boolean> {
  const rows = (await scoped.raw
    .select({ id: engagementassignments.id })
    .from(engagementassignments)
    .innerJoin(engagements, eq(engagements.id, engagementassignments.engagementid))
    .where(
      and(
        eq(engagements.consultingcompanyid, consultingCompanyId),
        eq(engagements.state, 'active'),
        eq(engagementassignments.projectid, projectId),
        isNull(engagementassignments.removedat),
        or(
          eq(engagementassignments.scopeid, specNumber),
          and(isNull(engagementassignments.scopeid), isNull(engagementassignments.taskid)),
        ),
      ),
    )
    .limit(1)) as Array<{ id: string }>;
  return rows.length > 0;
}
// [SCOPE 058 / T003] END
import { AuthContext, createAuthError } from './auth/auth-context.js';
import { checkPermission } from './auth/role-checker.js';
import { checkEntitlement, isEntitlementExempt } from './auth/entitlement.js';
import { signEntitlementToken } from './auth/entitlement-token.js';
import { getCommandPrompt } from './prompts/registry.js';
import { isTestLifecycleTool, handleTestLifecycleTool, TEST_LIFECYCLE_TOOL_DEFS } from './tools/test-lifecycle.js'; // [SCOPE 111 / T027]
import { LIST_AGENT_CONNECTIONS_TOOL, LIST_AGENT_CONNECTIONS_TOOL_DEF, handleListAgentConnections } from './tools/agent-connections.js'; // [SCOPE 151 / T005]
import { GET_SESSION_STATUS_TOOL, GET_SESSION_STATUS_TOOL_DEF, handleGetSessionStatus } from './tools/session-status.js'; // [SCOPE 155 / T006]
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
    // (rest of the schemas remain as is)
  CaptureEventInputSchema,
  UpsertDocumentInputSchema,
  CreateSpecsInputSchema,
  MergeScopeInputSchema,
  DeleteScopeInputSchema, // [SCOPE 098 / T008]
  RecordOverrideInputSchema, // [SCOPE 134 / T009]
  CheckForUpdatesInputSchema,
  UpgradeMcpInputSchema,
  DownloadKitInputSchema,
  RegenerateKitInputSchema,
  ImportProjectInputSchema,
  CreateApiTokenInputSchema,
  ListApiTokensInputSchema,
  RevokeApiTokenInputSchema,
  ImplementInputSchema,
  AnalyzeInputSchema,
  SessionStartInputSchema,
  BuildScopeInputSchema,
  ValidateScopeInputSchema,
  SubmitProposalInputSchema,
  CreateTaskInputSchema,
  UpdateTaskStatusInputSchema,
  LinkTaskToSpecInputSchema, // [SCOPE 101 / T002] re-parent existing tasks to a spec
  ScopeStageInputSchema, // [SCOPE 123 / T018] a named scope's stage
  BackfillScopeStagesInputSchema, // [SCOPE 123 / T018] FR-007 backfill
  UpdateTaskInputSchema, // [SCOPE 101 / T014] patch task content
  DeleteTaskInputSchema, // [SCOPE 101 / T015] guarded task delete
  UpdateSpecStatusInputSchema, // [SCOPE 101 / T004] spec lifecycle transition
  LinkDocToTaskInputSchema,
  ListOpenItemsInputSchema,
  GetKitStatusInputSchema,
  SubmitFeedbackInputSchema,
  ListMyFeedbackInputSchema,
  ManageMyFeedbackInputSchema,
  AnswerFeedbackInputSchema,
  TriageFeedbackInputSchema,
  UpdateFeedbackStatusInputSchema, // [SCOPE 043 / T021]
  RecordScopeMaterializedInputSchema, // [SCOPE 043 / T017]
  CheckoutScopeInputSchema, // [SCOPE 058 / T003]
  CheckinScopeInputSchema, // [SCOPE 058 / T003]
  IndexCapabilitiesInputSchema, // [SCOPE 074 / T004]
  SearchCapabilitiesInputSchema, // [SCOPE 074 / T004]
  SetScopeDependenciesInputSchema, // [SCOPE 073 / T003]
  SCOPE_NARRATIVE_MAX, // [SCOPE 090 / BUG-2026-07-22] shared with the advertised JSON schema
  SCOPE_DESCRIPTION_MAX,
  SCOPE_CONTENT_MAX, // [SCOPE 124 / T019] whole-document cap for validatescope's scopeContent
  ProjectEventTypeSchema, // shared with the advertised capture_event JSON schema — see below
  BUILDSCOPE_INPUT_DESCRIPTIONS, // [SCOPE 135 / T006] shared with the advertised buildscope JSON schema
  BUILDSCOPE_EDITS_DESCRIPTION, // [SCOPE 135 / T016]
  BUILDSCOPE_AMENDMENT_DESCRIPTION,
  BUILDSCOPE_REASON_DESCRIPTION, // [SCOPE 135 / T020]
  BUILDSCOPE_UNATTENDED_DESCRIPTION,
  BUILDSCOPE_QUICK_DESCRIPTION, // [SCOPE 135 / T011]
  BUILDSCOPE_TEMPLATE_ONLY_DESCRIPTION, // [SCOPE 135 / T011]
  CREATE_SPECS_SCOPE_CONTENT_DESCRIPTION, // [SCOPE 135 / T005]
} from './utils/schemas.js';
import {
  checkForUpdates,
  installUpdate,
  autoCheckOnStartup,
} from './utils/github-updater.js';

import {
  generateSpecLifecycleJson,
  generateProjectLifecycleMarkdown,
  pushLifecycleToDb,
  getAllSpecsForLifecycle,
} from './utils/lifecycle-generator.js';

import {
  // getKitStatus, // Not exported from project-kit.js, comment out to fix error
  generateDownloadUrl,
  regenerateKit,
  importProject,
  createApiToken,
  listApiTokens,
  revokeApiToken,
  buildScope,
  createSpecsPreflight,
  validateScope,
} from './utils/project-kit.js';
// [SCOPE 124 / T008] FR-005 — identity rules for idempotent spec persistence.
import {
  specDocumentSet,
  lifecycleDocumentTitle,
  partitionTasksByName,
  // [SCOPE 124 / T022] Which row a spec write lands on is a rule, not a lookup — it lives beside
  // the other identity rules so it can be proved without a database. Reports 3ea10d39, 928f604f.
  resolveSpecTarget,
  SpecTargetAmbiguousError,
  SpecTargetNotFoundError,
} from './utils/spec-persistence.js';

import config from './config.js';
import { renderAndUpsertFeedbackArtifact } from './utils/feedback-artifact.js'; // [SCOPE 043 / T003]
import { stripAttachmentContent } from './utils/feedback-attachments.js'; // [SCOPE 043 / T029]
import { triageWithTimeout } from './utils/feedback-triage.js'; // [SCOPE 043 / T005]
import { resolveSinkScope, sinkProjectId } from './utils/feedback-sink.js'; // [SCOPE 043 / T012]
import { scopeMyFeedbackRows } from './utils/my-feedback-filter.js'; // [SCOPE 043 fix] project-scope My Feedback
import {
  assertCallerCanViewProject,
  callerCanViewProject,
  ProjectAccessError,
  PROJECT_ACCESS_DENIAL_MARKER,
  recordDenialFromMeta, // [SCOPE 043 / T025]
} from './utils/project-access.js'; // [SCOPE 043] cross-tenant disclosure fix + Amendment D classification
import { notifyVendorSafely } from './utils/feedback-notify.js'; // [SCOPE 043 / T020] fan-out leg 3
import { updateFeedbackStatus } from './utils/feedback-status-update.js'; // [SCOPE 043 / T021]
import { resolveProjectContext } from './utils/project-context.js';
import { getMcpHealthState } from './utils/mcp-health.js';
import { MCP_HELP_TEXT, type HelpMode, renderHelpText } from './utils/help-context.js';
import { enforceTool } from './utils/stage-enforcement.js';
// [SCOPE 123] per-scope stage progression: the advance, the scope_stage read, the FR-007 backfill
import {
  advanceAfterTaskWrite,
  advanceScopeIds,
  backfillScopeStages,
  mcpScopeGates,
  projectScopeStages,
  scopeStageReport,
} from './utils/scope-stage.js';
import { stampMarkdown } from '@wxkanban/watermark'; // [SCOPE 082 / T006]
import { WXKANBAN_VERSION } from './version.js'; // [SCOPE 082 / T006]
// [SCOPE 042 / T002] cockpit_summary pure builders (grouping + scope assertion)
import { assertCockpitScope, buildCockpitSummary } from './utils/cockpit-summary.js';
import { IMPACT_MODE_EVENT_TYPE, latestImpactMode, type OwnerImpactMode } from './utils/impact-mode.js'; // [SCOPE 137 / T019]
import { indexCapabilities, searchCapabilities } from './utils/capability-index.js'; // [SCOPE 074 / T004]
import { parseDepsFromContent } from './utils/scope-edges.js'; // [SCOPE 073 / T003]
import { regenerateScopeFlow, captureScopeEdges, buildScopeGraph } from './utils/scopeflow-generator.js'; // [SCOPE 073 / T003]
import { regenerateDevplan, loadStoredRefs, layerNodes } from './utils/devplan-generator.js'; // [SCOPE 081 / T002]
// [SCOPE 056 / T001] effective-stack resolver (project -> company -> built-in)
import { resolveEffectiveStack } from './utils/effective-stack.js';

// Initialize MCP Server
// [SCOPE 133 / T017] was a hardcoded '0.1.0' while version.ts said 0.1.1 — and this is
// the `initialize` handshake, so every connecting client was told the wrong version.
// One source now; four surfaces previously disagreed with it.
const SERVER_INFO = { name: 'mcp-project-hub', version: WXKANBAN_VERSION };
const SERVER_OPTIONS = { capabilities: { tools: {} } };
const server = new Server(SERVER_INFO, SERVER_OPTIONS);

// Helper to extract auth from request context
// Validate API key
function validateApiKey(auth: AuthContext): void {
  if (auth.apiKey !== config.apiKey) {
    throw createAuthError('Invalid API key', 'INVALID_KEY');
  }
}

const PROJECT_SCOPED_TOOLS = new Set([
  'project.capture_event',
  'project.upsert_document',
  'project.create_task',
  'project.list_open_items',
  'project.cockpit_summary',
  'project.scope_stage', // [SCOPE 123 / T018]
  'project.backfill_scope_stages', // [SCOPE 123 / T018]
  'project.checkout_scope', // [SCOPE 058 / T003]
  'project.checkin_scope', // [SCOPE 058 / T003]
  'project.delete_scope', // [SCOPE 098 / T008] permanent removal, scoped to the token's project
  'project.record_override', // [SCOPE 134 / T009] audit record of an override decision
  // Repaired 2026-09-23: a token is project-scoped since Phase 11, so these resolve
  // the caller's project rather than asking for it.
  'project.create_api_token',
  'project.list_api_tokens',
  'project.create_specs',
  'project.kit_status',
  'project.download_kit',
  'project.regenerate_kit',
  'project.validatescope',
  'project.submit_feedback', // [SCOPE 043 / T002] User Feedback
  'project.list_my_feedback', // [SCOPE 043 / T007]
  'project.answer_feedback', // [SCOPE 043 / T007]
  'project.triage_feedback', // [SCOPE 043 / T011b] submitter marks own item triaged
  'project.update_feedback_status', // [SCOPE 043 / T021] vendor moves any sink row
  'project.manage_my_feedback', // [SCOPE 110 / T011] hide/unhide/delete own submissions
  'project.list_scope_seeds', // [SCOPE 043 / T017] kit pulls pending accept-to-scope seeds
  'project.record_scope_materialized', // [SCOPE 043 / T017] kit reports the assigned NNN
  'project.get_stack', // [SCOPE 055] kit pulls the ProjectStack doc to materialize stack.md
  // [SCOPE 111 / T027] Test Suite Lifecycle — all project-scoped.
  'project.upsert_test_plan',
  'project.start_test_run',
  'project.report_test_progress',
  'project.complete_test_run',
  'project.sign_off_test',
  'project.report_change_impact',
  'project.test_gate_status',
  // [SCOPE 133 / T002] session_start resolves the caller's project from its token.
  // Absent from this set it resolved no project at all, which is why the old stub
  // could not have answered a project question even if it had tried.
  'project.session_start',
  'project.list_agent_connections', // [SCOPE 151 / T005] the token decides the reach (FR-062)
]);

// [SCOPE 028 / Phase 12 — FR-021] Server-side artifact file writing removed.
// The client (kit CLI / VS Code extension) now authors spec/plan/tasks/lifecycle
// and scope files into the developer's workspace FIRST, then calls the MCP tool to
// persist content to the DB. On the hosted MCP these writes targeted the server
// container, not the developer's machine. project.create_specs / project.buildscope
// are DB-only persistence endpoints; see resolveWorkspaceRoot/toSpecFolderName/
// createTasksMarkdown/writeSpecArtifacts (deleted) in git history.

// analyzeSpecArtifacts was removed: it resolved its artifacts directory from a
// `TODO: undefined`, so every call took the early return and reported 0 requirements,
// 0 tasks, 0% coverage and a critical "no spec artifacts directory found" finding for
// every spec that has ever existed — a measurement of nothing, returned as a result.
// The analysis below that return read spec.md / plan.md / tasks.md off THIS server's
// filesystem, which is the wxKanban repository, not the caller's workspace: the same
// wrong-tenant read T018 closed in validateScope. Nothing here could be repaired in
// place; project.analyze now says it has no access to those artifacts. Git history
// keeps the reader if a database-backed analysis is ever built.
type ParsedImplementationTask = {
  taskId: string;
  name: string;
  description: string;
  status: 'todo' | 'in_progress' | 'blocked' | 'done';
  priority: 'low' | 'medium' | 'high' | 'critical';
};

// parseTasksMarkdown was removed: project.implement now sources its task list from
// `projecttasks` rather than reading tasks.md off the server filesystem. It also
// expected `- [ ] T001 [high] Title - description`, which the kit's own
// generateTasksMarkdown never emits (it writes a table plus `### T001 — Title`), so
// the two disagreed on format even when a file was readable.

// [SCOPE 112 / T003] BEGIN — compliance enablement resolution.
// Migration 0010 moved enablement from company grain to project grain. Rows written
// after the cutover carry `projectid`; legacy company rows carry only `appid`. The
// backfill also set `appid = projectid` on new rows to satisfy the legacy NOT NULL +
// UNIQUE, which is why the pre-cutover reader started matching by accident. Prefer
// `projectid` and keep the `appid` fallback until T010 drops the column, so a project
// whose row predates the backfill is not reported as unconfigured.
type AuditConfigRow = typeof appauditconfiguration.$inferSelect;

async function resolveAuditConfig(projectId: string): Promise<AuditConfigRow | null> {
  const [byProject] = await db
    .select()
    .from(appauditconfiguration)
    .where(eq(appauditconfiguration.projectid, projectId))
    .limit(1);
  if (byProject) return byProject;

  const [byAppId] = await db
    .select()
    .from(appauditconfiguration)
    .where(eq(appauditconfiguration.appid, projectId))
    .limit(1);
  return byAppId ?? null;
}

function activeFrameworksOf(config: AuditConfigRow | null): string[] {
  if (!config) return [];
  return [
    config.soc2enabled && 'SOC2',
    config.hipaaenabled && 'HIPAA',
    config.hitrustenabled && 'HITRUST',
    config.gdprenabled && 'GDPR',
    config.nistssdfenabled && 'NIST_SSDF',
    config.iso27001enabled && 'ISO27001',
  ].filter(Boolean) as string[];
}
// [SCOPE 112 / T003] END

// [SCOPE 112 / T009] BEGIN — Amendment A. Compliance context selection.
// Maps a wxKanban lifecycle phase onto the SDLC phase tags carried in
// complianceaudittasks.applicablephases. Both spellings are accepted so a caller can
// pass either its own phase ("Implementation") or the SDLC term ("development").
const PHASE_TO_SDLC: Record<string, string> = {
  design: 'design',
  requirements: 'design',
  implementation: 'development',
  development: 'development',
  qa: 'testing',
  qatesting: 'testing',
  humantesting: 'testing',
  testing: 'testing',
  beta: 'deployment',
  release: 'deployment',
  deployment: 'deployment',
  maintenance: 'deployment',
};

const ComplianceContextInputSchema = z.object({
  projectId: z.string().uuid(),
  mode: z.enum(['summary', 'full']).default('summary'),
  phase: z.string().optional(),
  keywords: z.array(z.string()).max(20).optional(),
  limit: z.number().int().min(1).max(200).default(60),
});

type ComplianceContextInput = z.infer<typeof ComplianceContextInputSchema>;

type ComplianceControl = {
  controlReference: string | null;
  category: string;
  priority: string;
  title: string;
  requirement: string;
  guidance: string | null;
  automated: boolean;
};

function toComplianceControl(row: ComplianceAuditTaskRow): ComplianceControl {
  // `description` duplicates `title` on every row the original markdown extractor
  // produced. Emitting both would spend tokens restating the title, so the duplicate
  // is collapsed to null and only genuinely authored prose survives.
  const authored = row.description && row.description !== row.title ? row.description : null;
  return {
    controlReference: row.controlreference,
    category: row.category,
    priority: row.priority,
    title: row.title,
    requirement: row.requirementtext && row.requirementtext !== row.title ? row.requirementtext : row.title,
    guidance: authored ?? row.suggestedfix,
    automated: row.isautomated,
  };
}

async function selectComplianceControls(
  scoped: ScopedDb,
  framework: string,
  input: ComplianceContextInput,
): Promise<ComplianceControl[]> {
  const conditions = [eq(complianceaudittasks.framework, framework)];

  const sdlcPhase = input.phase
    ? PHASE_TO_SDLC[input.phase.toLowerCase().replace(/[^a-z]/g, '')]
    : undefined;
  if (sdlcPhase) {
    // A row with no phase tags applies everywhere rather than nowhere — absence of a
    // tag is missing metadata, not a statement that the control is irrelevant.
    conditions.push(sql`(
      ${complianceaudittasks.applicablephases} IS NULL
      OR ${sdlcPhase} = ANY(${complianceaudittasks.applicablephases})
    )`);
  }

  const keywords = (input.keywords ?? []).map((k) => k.trim()).filter(Boolean);
  if (keywords.length > 0) {
    const matches = keywords.map(
      (k) => sql`(${complianceaudittasks.title} ILIKE ${'%' + k + '%'}
        OR ${complianceaudittasks.description} ILIKE ${'%' + k + '%'}
        OR ${complianceaudittasks.category} ILIKE ${'%' + k + '%'})`,
    );
    conditions.push(sql`(${sql.join(matches, sql` OR `)})`);
  }

  const rows = (await scoped.raw
    .select()
    .from(complianceaudittasks)
    .where(and(...conditions))
    // Authored rows first: a control carrying its criterion reference is worth more
    // context than an unreferenced checklist fragment.
    .orderBy(
      sql`CASE WHEN ${complianceaudittasks.controlreference} IS NULL THEN 1 ELSE 0 END`,
      sql`CASE ${complianceaudittasks.priority}
            WHEN 'critical' THEN 0 WHEN 'high' THEN 1
            WHEN 'medium' THEN 2 ELSE 3 END`,
      complianceaudittasks.category,
    )
    .limit(input.limit)) as ComplianceAuditTaskRow[];

  return rows.map(toComplianceControl);
}
// [SCOPE 112 / T009] END

function withResolvedProjectId(
  toolName: string,
  args: Record<string, unknown> | undefined,
  // [SCOPE 097 / T002] the authenticated token's project. When a project-scoped
  // call omits projectId, this is the authoritative default (FR-001) — ranked
  // above env + the server container's own .wxkanban-project.json file.
  tokenProjectId?: string
): { resolvedArgs: Record<string, unknown> | undefined; resolutionSource: 'args' | 'token' | 'env' | 'file' | 'none' } {
  if (!PROJECT_SCOPED_TOOLS.has(toolName)) {
    return { resolvedArgs: args, resolutionSource: 'none' };
  }

  // Accept the DB-column name `projectid` (lowercase) as the canonical tool
  // argument, while still honouring the legacy camelCase `projectId` from
  // already-deployed clients (VS Code extension <= 0.1.0, kit <= 1.3.5).
  // Populate BOTH keys from whichever casing the caller supplied so every
  // downstream schema/handler resolves regardless of which it reads.
  if (args && typeof args === 'object') {
    const pid = args.projectid ?? args.projectId;
    if (pid !== undefined && pid !== null) {
      args = { ...args, projectid: pid, projectId: pid };
    }
  }

  const context = resolveProjectContext(args, { tokenProjectId });
  if (context.projectId && (!args || (!args.projectId && !args.projectid))) {
    return {
      resolvedArgs: {
        ...(args || {}),
        projectId: context.projectId,
        projectid: context.projectId,
      },
      resolutionSource: context.source,
    };
  }

  return { resolvedArgs: args, resolutionSource: context.source };
}

function resolveHelpMode(args: Record<string, unknown> | undefined): HelpMode {
  if (!args) {
    return 'all';
  }

  const directMode = args.mode;
  if (directMode === 'all' || directMode === 'git' || directMode === 'docs') {
    return directMode;
  }

  const possibleTokens: string[] = [];
  const appendToken = (value: unknown): void => {
    if (typeof value === 'string') {
      possibleTokens.push(value.toLowerCase());
    }
  };

  appendToken(args.flag);
  appendToken(args.flags);
  appendToken(args.filter);
  appendToken(args.command);

  if (Array.isArray(args.flags)) {
    for (const entry of args.flags) {
      appendToken(entry);
    }
  }

  if (possibleTokens.some((token) => token.includes('--git') || token === 'git')) {
    return 'git';
  }

  if (possibleTokens.some((token) => token.includes('--docs') || token === 'docs')) {
    return 'docs';
  }

  return 'all';
}

function summarizeToolArgs(args: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!args) {
    return {};
  }

  if (config.mcpLogPayloads) {
    return args;
  }

  return {
    keys: Object.keys(args),
  };
}

// Tool: project.capture_event
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const auth = extractAuth(request.params._meta as Record<string, unknown> | undefined);
  const requestMeta = request.params._meta as Record<string, unknown> | undefined;
  const requestId = typeof requestMeta?.requestId === 'string' ? requestMeta.requestId : undefined;
  // Spec 028 / T010 — every project-scoped DB call must route through this
  // wrapper. Handlers below use scoped.insertScoped + scoped.selectScoped +
  // scoped.updateScoped instead of raw Drizzle.
  const scoped = getRequestScope(request);
  const startedAt = Date.now();
  let didFail = false;
  // [SCOPE 043 / T023] Tracked apart from didFail so a refusal does not land in the
  // same bucket as a fault — see the catch and finally below (Amendment D, FR-021).
  let didDeny = false;
  // [SCOPE 097 / T002] The token's project (from the auth middleware, carried on
  // scoped.scope) is the authoritative default when a project-scoped call omits
  // projectId — so a token-only caller lands in its OWN project, not the server
  // container's .wxkanban-project.json. Null under dev-bypass → env/file fallback.
  const { resolvedArgs: args, resolutionSource } = withResolvedProjectId(
    name,
    rawArgs as Record<string, unknown> | undefined,
    scoped.scope.projectId ?? undefined
  );

  logger.info('tool.call.start', {
    requestId,
    tool: name,
    resolutionSource,
    args: summarizeToolArgs(args),
  });
  
  try {
    // Validate auth
    validateApiKey(auth);
    checkPermission(name, auth);
    
    logger.audit('tool_call', name, auth.userId, args?.projectId as string || 'unknown', {
      requestId,
      args: summarizeToolArgs(args),
      resolutionSource,
    });

    // Entitlement gate — the durable IP-protection control. The token's customer
    // must have an active wxKanban subscription. Customer-level (not project-
    // level), so it runs before stage enforcement. Skipped under dev-bypass
    // (no token) and for a small exempt set so lapsed customers can still
    // diagnose/recover (help, health, kit_status, get_entitlement, ...).
    const mcpScope = (request.params._meta as { mcpScope?: McpScope } | undefined)?.mcpScope;
    if (mcpScope?.authMode === 'token' && !isEntitlementExempt(name)) {
      const entitlement = await checkEntitlement(mcpScope.customerId);
      if (!entitlement.allowed) {
        logger.audit('entitlement_blocked', name, auth.userId, (args?.projectId as string) || 'unknown', {
          requestId,
          status: entitlement.status,
          code: entitlement.code,
        });
        throw new McpError(
          ErrorCode.InvalidRequest,
          entitlement.reason || 'wxKanban subscription is inactive.',
        );
      }
    }

    // Stage enforcement — block tools that are not permitted in the stage of the scope they name.
    // [SCOPE 123 / T002] The gate reads the NAMED scope's stage (from the call's args), never a
    // project-wide phase. The refusal carries a machine-readable code in the error's data.
    const projectIdForStage = (args as Record<string, unknown>)?.projectId as string | undefined;
    if (projectIdForStage) {
      const stageCheck = await enforceTool(pool, projectIdForStage, name, {
        args: args as Record<string, unknown>,
        gates: mcpScopeGates,
        // [SCOPE 123 / T021] A token-bound caller may only be judged on its own project: the
        // refusal names a scope's stage, tasks and test keys, so another project's must not be read.
        boundProjectId: scoped.scope.authMode === 'token' ? scoped.scope.projectId ?? undefined : undefined,
      });
      if (!stageCheck.allowed) {
        logger.audit('stage_gate_blocked', name, auth.userId, projectIdForStage, {
          requestId,
          currentStage: stageCheck.currentStage,
          code: stageCheck.refusal?.code,
          reason: stageCheck.reason,
        });
        throw new McpError(
          ErrorCode.InvalidRequest,
          stageCheck.reason || `Tool '${name}' is not permitted in the stage of the scope it names.`,
          stageCheck.refusal ? { refusal: stageCheck.refusal } : undefined,
        );
      }
    }

    switch (name) {
      case 'project.capture_event': {
        const input = CaptureEventInputSchema.parse(args);

        if (input.type === 'chat_thread') {
          logger.info('chat.capture_event', {
            requestId,
            projectId: input.projectId,
            actor: input.actor,
            source: input.source,
            metadataKeys: input.metadata ? Object.keys(input.metadata) : [],
            rawContentLength: input.rawContent.length,
            normalizedContentLength: input.normalizedContent?.length || 0,
            rawContent: config.mcpLogRawChat ? input.rawContent : '[redacted]',
            normalizedContent: config.mcpLogRawChat ? input.normalizedContent : '[redacted]',
          });
        }
        
        if (resolutionSource !== 'args') {
          logger.warn('project.capture_event using resolved project context (not explicit args)', {
            projectId: input.projectId,
            resolutionSource,
            actor: input.actor,
            source: input.source,
          });
        }
        
        const inserted = (await scoped.insertScoped(events, {
          projectId: input.projectId,
          type: input.type,
          source: input.source,
          actor: input.actor,
          rawContent: input.rawContent,
          normalizedContent: input.normalizedContent || null,
          // BUG-2026-07-18 (Minor 3b): fold optional specId into metadata.specId
          // so events are traceable to a spec without a schema migration.
          metadata: input.specId
            ? { ...(input.metadata ?? {}), specId: input.specId }
            : (input.metadata || null),
        })) as Array<typeof events.$inferSelect>;
        const event = inserted[0];

        logger.info('Event captured', { eventId: event.id, projectId: event.projectId });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                event: {
                  id: event.id,
                  projectId: event.projectId,
                  type: event.type,
                  source: event.source,
                  actor: event.actor,
                  rawContent: event.rawContent,
                  normalizedContent: event.normalizedContent,
                  metadata: event.metadata,
                  createdAt: event.createdAt.toISOString(),
                },
              }),
            },
          ],
        };
      }
      
      case 'project.upsert_document': {
        // Pre-2026-05-24 this handler was a STUB returning hardcoded empty
        // arrays — every dbpush document write silently no-op'd while
        // appearing successful, dropping spec.md/plan.md/tests.md content
        // for every consumer (BUG-2026-05-24-mcp-silent-write-noop.md).
        // The real fix: actually implement the upsert. Match by (projectid,
        // title) for idempotency so re-running dbpush updates the existing
        // row rather than creating duplicates. If `documentId` is supplied,
        // update that row specifically. Scope is enforced by `scoped.*`
        // wrappers — cross-project writes throw at the DB layer.
        const input = UpsertDocumentInputSchema.parse(args);

        // [SCOPE 082 / T006] Stamp skill-pushed generated docs (scope-analysis)
        // with the wxKanban watermark before storing. Idempotent + fail-open.
        const bodyMarkdown =
          input.doctype === 'ScopeAnalysis' || input.doctype === 'ProjectScopeAnalysis'
            ? stampMarkdown(input.bodyMarkdown, {
                kind: 'generated',
                version: WXKANBAN_VERSION,
                generator: input.doctype,
              })
            : input.bodyMarkdown;

        let existing: typeof projectdocuments.$inferSelect | undefined;
        if (input.documentId) {
          const rows = (await scoped.selectScoped(
            projectdocuments,
            eq(projectdocuments.id, input.documentId),
          )) as Array<typeof projectdocuments.$inferSelect>;
          existing = rows[0];
        } else if (input.doctype && input.specId) {
          // [SCOPE 060] Per-scope doc: match by (doctype, specId) so each scope
          // keeps its own row (e.g. ScopeAnalysis, one per spec).
          const rows = (await scoped.selectScoped(
            projectdocuments,
            and(
              eq(projectdocuments.doctype, input.doctype),
              eq(projectdocuments.specId, input.specId),
            ),
          )) as Array<typeof projectdocuments.$inferSelect>;
          existing = rows[0];
        } else {
          // Project-level doc (doctype required, no specId): match by
          // (doctype, title) with specId IS NULL. Including title keeps docs that
          // SHARE a doctype but differ by title as distinct rows — e.g. dbpush
          // pushes spec/plan/tests all under doctype 'specs' and they must not
          // collapse onto one row. specId IS NULL keeps project-level docs off the
          // per-scope rows. [SCOPE 055 / 060] + doctype-required fix.
          const rows = (await scoped.selectScoped(
            projectdocuments,
            and(
              eq(projectdocuments.doctype, input.doctype),
              eq(projectdocuments.title, input.title),
              isNull(projectdocuments.specId),
            ),
          )) as Array<typeof projectdocuments.$inferSelect>;
          existing = rows[0];
        }

        let document: typeof projectdocuments.$inferSelect;
        let created: boolean;

        if (existing) {
          const updated = (await scoped.updateScoped(
            projectdocuments,
            {
              // BUG-2026-07-18 (Issue 6): the update path previously omitted
              // `title`, so a doc matched by (doctype, specId) or documentId kept
              // its OLD title while the body updated — a spec repurposed from
              // "Time Tracking" to "Rostering" showed the new body under the old
              // label forever. title is required on input; honour it on update.
              title: input.title,
              content: bodyMarkdown,
              doctype: input.doctype ?? existing.doctype,
              specId: input.specId ?? existing.specId, // [SCOPE 060]
              sourceEventId: input.sourceEventId ?? existing.sourceEventId,
              taskIds: input.taskIds ?? existing.taskIds ?? [],
              tags: input.tags ?? existing.tags ?? [],
              updatedAt: new Date(),
            },
            eq(projectdocuments.id, existing.id),
          )) as Array<typeof projectdocuments.$inferSelect>;
          document = updated[0];
          created = false;
        } else {
          const inserted = (await scoped.insertScoped(projectdocuments, {
            projectId: input.projectId,
            title: input.title,
            content: bodyMarkdown,
            doctype: input.doctype ?? null,
            specId: input.specId ?? null, // [SCOPE 060]
            sourceEventId: input.sourceEventId ?? null,
            taskIds: input.taskIds ?? [],
            tags: input.tags ?? [],
          })) as Array<typeof projectdocuments.$inferSelect>;
          document = inserted[0];
          created = true;
        }

        logger.info('Document upserted', {
          documentId: document.id,
          projectId: document.projectId,
          created,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                document: {
                  id: document.id,
                  projectId: document.projectId,
                  title: document.title,
                  bodyMarkdown: document.content,
                  sourceEventId: document.sourceEventId,
                  taskIds: (document.taskIds as string[]) ?? [],
                  tags: (document.tags as string[]) ?? [],
                  createdAt: document.createdAt.toISOString(),
                  updatedAt: document.updatedAt.toISOString(),
                },
                created,
              }),
            },
          ],
        };
      }
      
      case 'project.create_task': {
        const input = CreateTaskInputSchema.parse(args);

        const insertedTask = (await scoped.insertScoped(projecttasks, {
          projectId: input.projectId,
          specId: input.specId ?? null,
          name: input.title,
          description: input.descriptionMarkdown,
          status: input.status || 'todo',
          priority: input.priority || 'medium',
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          sourceEventId: input.sourceEventId || null,
          documentIds: input.documentIds || [],
          assignee: input.assignee || null,
        })) as Array<typeof projecttasks.$inferSelect>;
        const task = insertedTask[0];

        logger.info('Task created', { taskId: task.id, projectId: task.projectId });

        // [SCOPE 123 / T019] A scope's first task moves it out of Design (FR-011).
        if (task.specId) {
          await advanceAfterTaskWrite([task.id], { actor: scoped.scope.userId ?? 'mcp', trigger: 'task_created' });
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                task: {
                  id: task.id,
                  projectId: task.projectId,
                  title: task.name,
                  descriptionMarkdown: task.description || '',
                  status: task.status,
                  priority: task.priority,
                  dueDate: task.dueDate?.toISOString() || null,
                  sourceEventId: task.sourceEventId,
                  documentIds: (task.documentIds as string[]) || [],
                  assignee: task.assignee,
                  createdAt: task.createdAt.toISOString(),
                  updatedAt: task.updatedAt.toISOString(),
                },
              }),
            },
          ],
        };
      }

      // [SCOPE 043 / T002] BEGIN — project.submit_feedback (User Feedback channel)
      // Write the feedbacksubmissions row FIRST — it is the single source of
      // truth. The lifecycle artifact (T003) and notifications (T008) are
      // fan-out legs reconciled against this row; their pending defaults keep a
      // failed leg from being silently dropped. insertScoped binds + validates
      // projectid against the caller's token, so a token for project A can never
      // file feedback against project B.
      case 'project.submit_feedback': {
        const input = SubmitFeedbackInputSchema.parse(args);

        const submitterId = scoped.scope.userId;
        if (!submitterId) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'submit_feedback requires a user-scoped token.',
          );
        }

        // [SCOPE 043 / T012] Central sink (FR-010): route every submission to the
        // configured sink project, regardless of the caller's token project.
        // projectId is omitted here so insertScoped stamps the sink project; the
        // submitter's userId/companyId are preserved and the originating project
        // is recorded in context.originProjectId for triage provenance.
        const sink = await resolveSinkScope(scoped.scope);

        // [SCOPE 110 / T005] BEGIN — manual double-submit guard (FR-011).
        // A submission identical in submitter, type, and title to one made within
        // the previous 60 seconds returns the EXISTING record instead of creating a
        // new one, so a double-click cannot file two rows. Beyond the window a
        // genuine repeat report is accepted — this guards double-submits, not
        // repeat reporting. Bound to the sink by selectScoped + the submitter's id.
        const dupWindowCutoff = new Date(Date.now() - 60_000);
        const recent = (await sink.selectScoped(
          feedbacksubmissions,
          and(
            eq(feedbacksubmissions.userId, submitterId),
            eq(feedbacksubmissions.type, input.type),
            eq(feedbacksubmissions.title, input.title),
            gte(feedbacksubmissions.createdAt, dupWindowCutoff),
          ),
        )) as Array<typeof feedbacksubmissions.$inferSelect>;
        if (recent.length > 0) {
          const existing = recent
            .slice()
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
          logger.info('Feedback double-submit recognized as repeat — returning existing row', {
            feedbackId: existing.id,
            type: existing.type,
          });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  feedback: {
                    id: existing.id,
                    referenceId: existing.id,
                    projectId: existing.projectId,
                    type: existing.type,
                    title: existing.title,
                    status: existing.status,
                    notificationChannel: existing.notificationChannel,
                    artifactStatus: existing.artifactStatus,
                    createdAt: existing.createdAt.toISOString(),
                  },
                  recognizedRepeat: true,
                }),
              },
            ],
          };
        }
        // [SCOPE 110 / T005] END

        // [SCOPE 043 / T025] BEGIN — Amendment E: re-home the validated attachments
        // into `details` under a reserved key, and DISCARD whatever the caller put
        // at `details.attachments` themselves. The reserved key is what triage, the
        // artifact renderer, and the list responses key off (FR-025/FR-026); if a
        // caller could write it directly, every bound on this feature would be
        // advisory. `attachments` is dropped from the spread, then re-added only
        // from the schema-validated field.
        const { attachments: _clientSuppliedAttachments, ...safeDetails } = input.details;
        const detailsToStore: Record<string, unknown> = input.attachments?.length
          ? { ...safeDetails, attachments: input.attachments }
          : safeDetails;
        // [SCOPE 043 / T025] END

        const inserted = (await sink.insertScoped(feedbacksubmissions, {
          userId: submitterId,
          companyId: scoped.scope.customerId ?? null,
          type: input.type,
          title: input.title,
          details: detailsToStore,
          // [SCOPE 043 fix] Stamp the origin as the CURRENT application the Cockpit
          // is in (input.projectId), not the caller's token project — so "My
          // Feedback" scopes correctly even when one token spans several projects.
          context: { ...(input.context ?? {}), originProjectId: input.projectId },
          notificationChannel: input.notificationChannel ?? 'inapp',
        })) as Array<typeof feedbacksubmissions.$inferSelect>;
        const row = inserted[0];

        logger.info('Feedback submitted', {
          feedbackId: row.id,
          projectId: row.projectId,
          type: row.type,
        });

        // [SCOPE 043 / T003] BEGIN — fan-out leg 1: render the lifecycle artifact
        // Best-effort and reconciled against the row. A failure leaves
        // artifactstatus = 'pending' (the DB default) for manual SysAdmin retry;
        // it never fails the submit (the row is already the source of truth).
        const artifact = await renderAndUpsertFeedbackArtifact(sink, row);
        if (!artifact.ok) {
          logger.warn('Feedback artifact render failed — leg left pending for retry', {
            feedbackId: row.id,
            error: artifact.error,
          });
        }
        // [SCOPE 043 / T003] END

        // [SCOPE 043 / T005] BEGIN — background AI triage (inline, bounded)
        // Awaited with a timeout rather than fire-and-forget: App Runner can
        // throttle the container after the response is sent, stalling a
        // post-response LLM call. The bound keeps submit within the 3s target;
        // self-contained + never throws; a missing LLM key / timeout just leaves
        // the row untriaged for manual SysAdmin triage.
        await triageWithTimeout(sink, row);
        // [SCOPE 043 / T005] END

        // [SCOPE 043 / T020] BEGIN — fan-out leg 3: tell a human.
        // Runs AFTER triage because the severity gate depends on triage's verdict,
        // and triage persists that verdict rather than returning it — hence the
        // re-read. Sits on the insert path only, so SCOPE-110's dedup early-return
        // cannot produce a second notification for a double-submit.
        try {
          const [fresh] = (await sink.selectScoped(
            feedbacksubmissions,
            eq(feedbacksubmissions.id, row.id),
          )) as Array<typeof feedbacksubmissions.$inferSelect>;
          // Inferred, not hand-cast: an ad-hoc `{ name: string | null }` cast
          // here typechecked while the mirror had no `name` column at all, so
          // every notification silently fell back to the raw company UUID.
          const [company] = fresh?.companyId
            ? ((await sink.selectScoped(
                companies,
                eq(companies.id, fresh.companyId),
              )) as Array<typeof companies.$inferSelect>)
            : [];
          await notifyVendorSafely(fresh ?? row, company?.name ?? null);
        } catch (err) {
          // Best-effort like the two legs above: the row is already the source of
          // truth, so a failed notification must never fail the submit.
          logger.warn('Feedback notification leg failed', {
            feedbackId: row.id,
            error: (err as Error).message,
          });
        }
        // [SCOPE 043 / T020] END

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                feedback: {
                  id: row.id,
                  referenceId: row.id,
                  projectId: row.projectId,
                  type: row.type,
                  title: row.title,
                  status: row.status,
                  notificationChannel: row.notificationChannel,
                  artifactStatus: artifact.ok ? 'done' : 'pending',
                  createdAt: row.createdAt.toISOString(),
                },
              }),
            },
          ],
        };
      }
      // [SCOPE 043 / T002] END

      // [SCOPE 043 / T007] BEGIN — project.list_my_feedback (submitter's own items + status)
      // Bound to BOTH the token's project (selectScoped) and the caller's userId,
      // so a user only ever sees feedback they submitted. Surfaces the needs-info
      // question and dedup link so the Dev Cockpit can render status + a reply box.
      case 'project.list_my_feedback': {
        const input = ListMyFeedbackInputSchema.parse(args);

        const viewerId = scoped.scope.userId;
        if (!viewerId) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'list_my_feedback requires a user-scoped token.',
          );
        }

        // [SCOPE 043] The view below is driven by input.projectId, which is caller
        // supplied. Authorise it against the caller's OWN company BEFORE
        // resolveSinkScope rebinds the scope to the sink — after that rebind the
        // caller's company is no longer on the scope to check against. Without this,
        // any authenticated token could read another tenant's feedback, or pass the
        // sink's public id to read every tenant's feedback at once.
        await assertCallerCanViewProject(scoped.scope, input.projectId);

        // [SCOPE 043 / T012] Feedback lives in the central sink project (FR-010);
        // resolve there. A user-scoped token is still required (auth floor), but the
        // LIST is scoped by PROJECT, not user.
        const sink = await resolveSinkScope(scoped.scope);
        const rows = (await sink.selectScoped(
          feedbacksubmissions,
        )) as Array<typeof feedbacksubmissions.$inferSelect>;

        // [SCOPE 043 fix] Scope the feedback list to the CURRENT application — the
        // project the Cockpit is in (input.projectId, = the workspace's
        // .wxkanban-project.json), which submit_feedback stamps as
        // context.originProjectId. Every submission for that project is shown,
        // regardless of WHO filed it (project-scoped, not user-scoped) — so the
        // wxperts team sees the team's feedback for a project, not just their own.
        // Keying off the passed project (not the caller's token) is setup-
        // independent. Storage stays central in the sink; only the VIEW is scoped.
        // [SCOPE 043 fix, REVISED 2026-08-03] Every project — including the sink —
        // now sees ONLY its own originating feedback.
        //
        // The previous rule made the sink (wxKanban Dev) list every row stored in
        // it, on the reasoning that the sink is the central triage hub. In practice
        // that turned the Cockpit's "My Feedback" into everyone's queue: measured
        // 2026-08-03, 93 rows spanning 17 origin projects, of which only 16 were
        // wxKanban's own — the rest consumer and dogfooding projects, plus 20
        // auto-captured runtime errors carrying no origin at all. A view meant to
        // show "what is outstanding for the project I am in" cannot do that job
        // while it is also the cross-tenant triage hub.
        //
        // The hub did not go away: the web app's per-project Bug Reports tab
        // (SCOPE-063 ProjectBugReportService) filters on the projectid COLUMN, and
        // since the sink IS wxKanban Dev it still lists every stored row there.
        // Triage keeps its full view; the Cockpit gets an honest per-project one.
        // [SCOPE 043 amendment] `incoming: true` asks the opposite question — the
        // reports OTHER companies filed into the sink. Gated on the caller's company
        // actually owning the sink project; without that check this flag would be a
        // polite way to read across tenants, which is the hole SCOPE-043 already was.
        if (input.incoming) {
          await assertCallerCanViewProject(scoped.scope, sinkProjectId());
        }

        const items = scopeMyFeedbackRows(rows, {
          currentProjectId: input.projectId,
          status: input.status,
          includeHidden: input.includeHidden,
          maxItems: input.maxItems ?? 500,
          showAllInProject: false,
          // Tenancy on the companyid COLUMN, not just JSON provenance.
          callerCompanyId: input.incoming ? undefined : scoped.scope.customerId,
          incomingForCompanyId: input.incoming ? scoped.scope.customerId : undefined,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                items: items.map((r) => ({
                  id: r.id,
                  referenceId: r.id,
                  type: r.type,
                  title: r.title,
                  // [SCOPE 043 / T011] body + auto-captured context, so the cockpit
                  // can open a read-only detail view of what the submitter entered.
                  // [SCOPE 043 / T029] Amendment E (FR-025): attachment CONTENT is
                  // stripped to a summary here. This response is polled roughly
                  // twice a minute per project (see Amendment D) and returns every
                  // row, so inlining attachments would multiply a 128 KB payload by
                  // the queue depth on a fixed interval — and charge it to
                  // submitters who attached nothing. The submitter already has the
                  // file on their own disk; sending it back is the one payload with
                  // guaranteed-zero information gain.
                  details: stripAttachmentContent(r.details),
                  context: r.context,
                  status: r.status,
                  severity: r.severity,
                  classification: r.classification,
                  duplicateOfId: r.duplicateOfId,
                  clarificationQuestion:
                    r.status === 'needsinfo' ? r.clarificationQuestion : null,
                  clarificationAnswer: r.clarificationAnswer,
                  declineReason: r.status === 'declined' ? r.declineReason : null,
                  artifactStatus: r.artifactStatus,
                  notificationChannel: r.notificationChannel,
                  createdAt: r.createdAt.toISOString(),
                  // MODIFIED-BY: [SCOPE 148 / T013] — updatedAt for the triage no-change
                  // fingerprint (SPEC-148 FR-003). Additive and optional: FR-003 keys on
                  // "count + latest updatedAt per status", and createdAt alone cannot see an
                  // in-place edit — a customer answering a needs-info question changes neither
                  // the row count nor createdAt, so the fingerprint would call that "no change"
                  // and skip a run that had new information waiting in it.
                  updatedAt: r.updatedAt.toISOString(),
                  firstTriagedAt: r.firstTriagedAt ? r.firstTriagedAt.toISOString() : null,
                })),
              }),
            },
          ],
        };
      }
      // [SCOPE 043 / T007] END

      // [SCOPE 110 / T011] BEGIN — project.manage_my_feedback (hide / unhide / delete OWN)
      // Submitter-only visibility + removal of their own submissions. Ownership is
      // enforced INSIDE the data query (userId = caller) so no route-level guard can be
      // bypassed. Hide is reversible (FR-004); delete is audited identically to the
      // SysAdmin purge (FR-005/FR-002). Routed through the same sink as the other tools.
      case 'project.manage_my_feedback': {
        const input = ManageMyFeedbackInputSchema.parse(args);
        const callerId = scoped.scope.userId;
        if (!callerId) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'manage_my_feedback requires a user-scoped token.',
          );
        }
        const sink = await resolveSinkScope(scoped.scope);

        if (input.action === 'hide' || input.action === 'unhide') {
          // FR-004 — reversible submitter hide. updateScoped binds projectid=sink;
          // the userId predicate makes ownership part of the query itself.
          const updated = (await sink.updateScoped(
            feedbacksubmissions,
            {
              submitterHiddenAt: input.action === 'hide' ? new Date() : null,
              updatedAt: new Date(),
            },
            and(
              eq(feedbacksubmissions.userId, callerId),
              inArray(feedbacksubmissions.id, input.ids),
            ),
          )) as Array<typeof feedbacksubmissions.$inferSelect>;
          return {
            content: [
              { type: 'text', text: JSON.stringify({ action: input.action, updated: updated.length }) },
            ],
          };
        }

        // action === 'delete' — FR-005 self-delete, audited, owner-only.
        const sinkProjectId = sink.scope.projectId;
        const sinkCompanyId = sink.scope.customerId;
        if (!sinkProjectId) {
          throw new McpError(ErrorCode.InternalError, 'feedback sink project unresolved');
        }
        // Ownership enforced in the query: sink project + caller's userId.
        const owned = (await sink.raw
          .select()
          .from(feedbacksubmissions)
          .where(
            and(
              eq(feedbacksubmissions.projectId, sinkProjectId),
              eq(feedbacksubmissions.userId, callerId),
              inArray(feedbacksubmissions.id, input.ids),
            ),
          )) as Array<typeof feedbacksubmissions.$inferSelect>;

        // A request naming another user's record (or any not-owned record in a mixed
        // set) deletes nothing and reports not-found — leaking neither existence nor
        // lack of rights.
        if (owned.length !== input.ids.length) {
          throw new McpError(ErrorCode.InvalidParams, 'one or more submissions were not found');
        }

        await sink.raw.transaction(async (tx) => {
          for (const row of owned) {
            const companyId = row.companyId ?? sinkCompanyId;
            if (!companyId) {
              throw new Error(`cannot resolve a company for the self-delete audit of ${row.id}`);
            }
            await tx.insert(companyauditlogs).values({
              companyid: companyId,
              changedby: callerId,
              action: 'FEEDBACK_SELF_DELETED',
              previousvalue: row as unknown as Record<string, unknown>, // full snapshot survives deletion
              newvalue: {
                resourceType: 'feedback',
                resourceId: row.id,
                source: row.source,
                title: row.title,
                submitterId: row.userId,
                originalCompanyId: row.companyId,
                deletedBy: callerId,
              },
              description: `FEEDBACK_SELF_DELETED ${row.id} by submitter ${callerId}`,
            });
          }
          await tx.delete(feedbacksubmissions).where(
            and(
              eq(feedbacksubmissions.projectId, sinkProjectId),
              eq(feedbacksubmissions.userId, callerId),
              inArray(feedbacksubmissions.id, input.ids),
            ),
          );
        });

        return {
          content: [
            { type: 'text', text: JSON.stringify({ action: 'delete', deleted: owned.length }) },
          ],
        };
      }
      // [SCOPE 110 / T011] END

      // [SCOPE 043 / T007] BEGIN — project.answer_feedback (single-round needs-info reply)
      // The submitter answers one clarifying question on their own record: status
      // needsinfo -> triaged, the answer is written back, and the lifecycle artifact
      // is re-rendered in place (Clarification section). Only the original submitter
      // may answer, and only while the item is awaiting clarification.
      case 'project.answer_feedback': {
        const input = AnswerFeedbackInputSchema.parse(args);

        const answererId = scoped.scope.userId;
        if (!answererId) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'answer_feedback requires a user-scoped token.',
          );
        }

        // [SCOPE 043 / T012] The item lives in the central sink project (FR-010);
        // resolve/update there. Ownership is still enforced by userId below.
        const sink = await resolveSinkScope(scoped.scope);
        const rows = (await sink.selectScoped(
          feedbacksubmissions,
          eq(feedbacksubmissions.id, input.feedbackId),
        )) as Array<typeof feedbacksubmissions.$inferSelect>;
        const row = rows[0];

        if (!row) {
          throw new McpError(ErrorCode.InvalidParams, `Feedback not found: ${input.feedbackId}`);
        }
        if (row.userId !== answererId) {
          throw new McpError(ErrorCode.InvalidParams, 'You can only answer your own feedback.');
        }
        if (row.status !== 'needsinfo' || !row.clarificationQuestion) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'This feedback is not awaiting clarification.',
          );
        }

        const updated = (await sink.updateScoped(
          feedbacksubmissions,
          { clarificationAnswer: input.answer, status: 'triaged', updatedAt: new Date() },
          eq(feedbacksubmissions.id, row.id),
        )) as Array<typeof feedbacksubmissions.$inferSelect>;
        const newRow = updated[0];

        const artifact = await renderAndUpsertFeedbackArtifact(sink, newRow);
        if (!artifact.ok) {
          logger.warn('Feedback artifact re-render after answer failed — leg left pending', {
            feedbackId: row.id,
            error: artifact.error,
          });
        }

        logger.info('Feedback clarification answered', {
          feedbackId: newRow.id,
          status: newRow.status,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                feedback: {
                  id: newRow.id,
                  status: newRow.status,
                  clarificationQuestion: newRow.clarificationQuestion,
                  clarificationAnswer: newRow.clarificationAnswer,
                },
              }),
            },
          ],
        };
      }
      // [SCOPE 043 / T007] END

      // [SCOPE 043 / T011b] BEGIN — project.triage_feedback (submitter marks own item triaged)
      // MODIFIED-BY: [SCOPE 043 / T035] — no longer changes status (FR-031)
      // Cockpits up to 0.2.40 call this after every "push to chat". It used to set
      // status='triaged', which let a submitter take their own report out of the vendor's
      // "new" queue — and could flip a resolved/declined report back — with nobody at
      // wxperts having looked (feedback b4d8b0c6; 6d76a9fb went unanswered that way).
      // Status is now the vendor's call alone (project.update_feedback_status, T021).
      // Kept registered so older Cockpits get an answer, not an error: ownership is still
      // checked, and the current status comes back unchanged.
      case 'project.triage_feedback': {
        const input = TriageFeedbackInputSchema.parse(args);

        const callerId = scoped.scope.userId;
        if (!callerId) {
          throw new McpError(ErrorCode.InvalidParams, 'triage_feedback requires a user-scoped token.');
        }

        // The item lives in the central sink project (FR-010); ownership enforced by userId.
        const sink = await resolveSinkScope(scoped.scope);
        const rows = (await sink.selectScoped(
          feedbacksubmissions,
          eq(feedbacksubmissions.id, input.feedbackId),
        )) as Array<typeof feedbacksubmissions.$inferSelect>;
        const row = rows[0];

        if (!row) {
          throw new McpError(ErrorCode.InvalidParams, `Feedback not found: ${input.feedbackId}`);
        }
        if (row.userId !== callerId) {
          throw new McpError(ErrorCode.InvalidParams, 'You can only triage your own feedback.');
        }

        // [SCOPE 043 / T035] FR-031 — no write. Report what is there.
        logger.info('Submitter triage_feedback ignored (status is vendor-owned)', {
          feedbackId: row.id,
          status: row.status,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ feedback: { id: row.id, status: row.status } }),
            },
          ],
        };
      }
      // [SCOPE 043 / T011b] END

      // [SCOPE 043 / T021] BEGIN — project.update_feedback_status (vendor transitions)
      // Deliberately NOT an extension of triage_feedback: that tool is owner-only
      // ("you can only triage your own feedback"), and widening it would silently
      // escalate an existing tool's privilege. Authority here is SINK OWNERSHIP —
      // the same gate list_my_feedback uses for incoming:true — so "may I read other
      // tenants' reports in this sink" and "may I move them" are one question with
      // one answer, and cannot drift apart into a hole.
      case 'project.update_feedback_status': {
        const input = UpdateFeedbackStatusInputSchema.parse(args);
        const feedback = await updateFeedbackStatus(scoped.scope, input);
        return { content: [{ type: 'text', text: JSON.stringify({ feedback }) }] };
      }
      // [SCOPE 043 / T021] END

      // [SCOPE 055] BEGIN — project.get_stack (kit pulls ProjectStack to materialize stack.md)
      // MODIFIED-BY: [SCOPE 056 / T001] resolve the effective stack via the chain
      //   project ProjectStack doc -> company-wide profile -> null (built-in default).
      // The kit calls this on project open to write/refresh the local stack.md from
      // the DB source of truth (the web walkthrough wrote the doc; the hosted server
      // cannot write the dev's working tree). Project-scoped; returns null if unset.
      case 'project.get_stack': {
        const rows = (await scoped.selectScoped(
          projectdocuments,
          eq(projectdocuments.doctype, 'ProjectStack'),
        )) as Array<typeof projectdocuments.$inferSelect>;
        const doc = rows[0];
        const projectDoc = doc ? { content: doc.content, updatedAt: doc.updatedAt } : null;
        // [SCOPE 057] company-wide tier slots in here: a company-scoped lookup by
        // app type supplies the live default for projects with no ProjectStack doc.
        // Until SPEC-057 lands, pass null so resolution falls through to the project
        // tier and then to null (the kit built-in default = today's behaviour).
        const companyProfile = null;
        const resolved = resolveEffectiveStack(projectDoc, companyProfile);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                stack: resolved
                  ? { content: resolved.content, updatedAt: resolved.updatedAt, source: resolved.source }
                  : null,
              }),
            },
          ],
        };
      }
      // [SCOPE 055] END

      // [SCOPE 043 / T017] BEGIN — project.list_scope_seeds (kit pulls pending seeds)
      // The kit calls this on project open to materialize accepted-to-scope seeds.
      // RESTRICTED to the feedback sink project: a seed embeds another customer's
      // submitted text, so only a token scoped to the sink (a wxperts dev working
      // in wxKanban Development) may read them. A consumer token is rejected.
      case 'project.list_scope_seeds': {
        if (scoped.scope.projectId !== sinkProjectId()) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'list_scope_seeds is restricted to the feedback sink project.',
          );
        }
        const sink = await resolveSinkScope(scoped.scope);
        const rows = (await sink.selectScoped(
          feedbacksubmissions,
          and(
            isNotNull(feedbacksubmissions.scopeSeed),
            isNull(feedbacksubmissions.linkedScopeNumber),
          ),
        )) as Array<typeof feedbacksubmissions.$inferSelect>;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                seeds: rows.map((r) => ({ feedbackId: r.id, seed: r.scopeSeed })),
              }),
            },
          ],
        };
      }
      // [SCOPE 043 / T017] END

      // [SCOPE 043 / T017] BEGIN — project.record_scope_materialized (kit reports NNN)
      // After the kit assigns a collision-safe scope number and writes the file,
      // it reports the number back so the row carries durable traceability
      // (FR-014/015). Idempotent: a row already linked is returned unchanged.
      case 'project.record_scope_materialized': {
        const input = RecordScopeMaterializedInputSchema.parse(args);
        if (scoped.scope.projectId !== sinkProjectId()) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'record_scope_materialized is restricted to the feedback sink project.',
          );
        }
        const sink = await resolveSinkScope(scoped.scope);
        const rows = (await sink.selectScoped(
          feedbacksubmissions,
          eq(feedbacksubmissions.id, input.feedbackId),
        )) as Array<typeof feedbacksubmissions.$inferSelect>;
        const row = rows[0];
        if (!row) {
          throw new McpError(ErrorCode.InvalidParams, `Feedback not found: ${input.feedbackId}`);
        }
        if (!row.scopeSeed) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'This feedback was not accepted to scope.',
          );
        }
        if (row.linkedScopeNumber) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  feedbackId: row.id,
                  linkedScopeNumber: row.linkedScopeNumber,
                  alreadyLinked: true,
                }),
              },
            ],
          };
        }
        const updated = (await sink.updateScoped(
          feedbacksubmissions,
          { linkedScopeNumber: input.scopeNumber, updatedAt: new Date() },
          eq(feedbacksubmissions.id, row.id),
        )) as Array<typeof feedbacksubmissions.$inferSelect>;
        logger.info('Scope seed materialized', {
          feedbackId: row.id,
          scopeNumber: input.scopeNumber,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                feedbackId: row.id,
                linkedScopeNumber: updated[0].linkedScopeNumber,
              }),
            },
          ],
        };
      }
      // [SCOPE 043 / T017] END

      // [SCOPE 042 / T036] BEGIN — scope-bind project.update_task_status
      // [SCOPE 123 / T019] MODIFIED-BY — after the write, advance the task's scope (FR-003, FR-010)
      // Previously a raw `db.update(projecttasks).where(eq(id))` with NO project
      // filter: a token for project A could flip a task in project B by UUID
      // (the within-customer leak class 042 set out to close, and a spec-028
      // T011 direct-db violation). Route through scoped.updateScoped so the
      // WHERE is AND-ed with projectid = scope.projectId; a cross-project taskId
      // simply matches nothing and returns "task not found".
      case 'project.update_task_status': {
        const input = UpdateTaskStatusInputSchema.parse(args);

        const [task] = (await scoped.updateScoped(
          projecttasks,
          { status: input.status, updatedAt: new Date() },
          eq(projecttasks.id, input.taskId),
        )) as Array<typeof projecttasks.$inferSelect>;

        if (!task) {
          throw new McpError(ErrorCode.InvalidParams, `Task not found: ${input.taskId}`);
        }

        logger.info('Task status updated', { taskId: task.id, status: task.status });

        // SCOPE-123: the task write has committed; move its scope if this closed its last open
        // task (and any test gate is clear). Never fails the write — see utils/scope-stage.ts.
        const [stageResult] = await advanceAfterTaskWrite([task.id], {
          actor: scoped.scope.userId ?? 'mcp',
          trigger: 'task_status',
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ...(stageResult && stageResult.steps.length > 0
                  ? {
                      stageAdvance: {
                        specId: stageResult.scopeId,
                        from: stageResult.startStage,
                        to: stageResult.endStage,
                        steps: stageResult.steps.map((s) => `${s.from}->${s.to}`),
                      },
                    }
                  : {}),
                task: {
                  id: task.id,
                  projectId: task.projectId,
                  title: task.name,
                  descriptionMarkdown: task.description || '',
                  status: task.status,
                  priority: task.priority,
                  dueDate: task.dueDate?.toISOString() || null,
                  sourceEventId: task.sourceEventId,
                  documentIds: (task.documentIds as string[]) || [],
                  assignee: task.assignee,
                  createdAt: task.createdAt.toISOString(),
                  updatedAt: task.updatedAt.toISOString(),
                },
              }),
            },
          ],
        };
      }
      // [SCOPE 042 / T036] END

      // [SCOPE 101 / T003] BEGIN — link_task_to_spec (re-parent existing tasks to a spec)
      case 'project.link_task_to_spec': {
        const input = LinkTaskToSpecInputSchema.parse(args);

        // Load the project's specs once and index by id + specNumber. selectScoped
        // AND-ins the caller's projectId, so a token for project A can never target
        // project B's specs/tasks. specNumber match is exact OR numeric-equal so a
        // caller can pass "12" or "0012" against a stored "0012".
        const specs = (await scoped.selectScoped(
          projectspecifications,
        )) as Array<typeof projectspecifications.$inferSelect>;
        const byId = new Map(specs.map((s) => [s.id, s]));
        const resolveSpecId = (link: { specId?: string; specNumber?: string }): string | null => {
          if (link.specId) return byId.has(link.specId) ? link.specId : null;
          const wanted = String(link.specNumber);
          const wantedNum = Number(wanted);
          const match = specs.find(
            (s) =>
              String(s.specNumber) === wanted ||
              (Number.isFinite(wantedNum) && Number(s.specNumber) === wantedNum),
          );
          return match ? match.id : null;
        };

        const results: Array<{ taskId: string; status: 'linked' | 'task_not_found' | 'spec_not_found'; specId?: string }> = [];
        let linked = 0;
        // [SCOPE 123 / T021] The scopes these tasks belong to BEFORE the re-parent: a scope that
        // loses its last open task may now be able to advance, so it is re-assessed too.
        const priorSpecIds = (
          (await scoped.selectScoped(
            projecttasks,
            inArray(projecttasks.id, input.links.map((l) => l.taskId)),
          )) as Array<typeof projecttasks.$inferSelect>
        )
          .map((t) => t.specId)
          .filter((s): s is string => !!s);
        for (const link of input.links) {
          const targetSpecId = resolveSpecId(link);
          if (!targetSpecId) {
            results.push({ taskId: link.taskId, status: 'spec_not_found' });
            continue;
          }
          const [task] = (await scoped.updateScoped(
            projecttasks,
            { specId: targetSpecId, updatedAt: new Date() },
            eq(projecttasks.id, link.taskId),
          )) as Array<typeof projecttasks.$inferSelect>;
          if (!task) {
            results.push({ taskId: link.taskId, status: 'task_not_found' });
            continue;
          }
          linked++;
          results.push({ taskId: link.taskId, status: 'linked', specId: targetSpecId });
        }

        logger.info('Tasks linked to specs', {
          projectId: input.projectId,
          requested: input.links.length,
          linked,
        });

        // [SCOPE 123 / T019] MODIFIED-BY — re-parenting changes which scope owns a task, so the
        // receiving scopes are re-assessed (a first task leaves Design, FR-011).
        const linkedSpecIds = results.filter((r) => r.status === 'linked' && r.specId).map((r) => r.specId as string);
        await advanceScopeIds([...priorSpecIds, ...linkedSpecIds], { actor: scoped.scope.userId ?? 'mcp', trigger: 'task_linked' });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                summary: {
                  requested: input.links.length,
                  linked,
                  taskNotFound: results.filter((r) => r.status === 'task_not_found').length,
                  specNotFound: results.filter((r) => r.status === 'spec_not_found').length,
                },
                results,
              }),
            },
          ],
        };
      }
      // [SCOPE 101 / T003] END

      // [SCOPE 101 / T014] BEGIN — update_task (patch task content, Amendment B)
      // Feedback edd34387: agents could create a task but never correct one. PATCH
      // semantics — only fields sent change. Status and specId stay with
      // update_task_status and link_task_to_spec so neither gets a second write path.
      case 'project.update_task': {
        const input = UpdateTaskInputSchema.parse(args);

        // Resolve through the tenant scope first: a cross-project taskId is simply
        // not found, and the assignee check below needs the task's project.
        const [existing] = (await scoped.selectScoped(
          projecttasks,
          eq(projecttasks.id, input.taskId),
        )) as Array<typeof projecttasks.$inferSelect>;
        if (!existing) {
          throw new McpError(ErrorCode.InvalidParams, `Task not found: ${input.taskId}`);
        }

        // assignedtoid is a FK to userprofiles, so any real user id would be accepted
        // by the database — including another tenant's. Only the project's company or
        // an explicit project member (consultants) is a legitimate assignee.
        if (input.assignedToId) {
          const r = await scoped.raw.execute(sql`
            SELECT 1 AS ok
              FROM userprofiles u
              JOIN companyprojects p ON p.id = ${existing.projectId}
             WHERE u.id = ${input.assignedToId}
               AND (u.companyid = p.companyid
                    OR EXISTS (SELECT 1 FROM projectusers pu
                                WHERE pu.projectid = p.id AND pu.userid = u.id))
             LIMIT 1`);
          if (((r as unknown as { rows?: unknown[] }).rows ?? []).length === 0) {
            throw new McpError(
              ErrorCode.InvalidParams,
              `assignedToId ${input.assignedToId} is not a user in this project's company or a member of this project. Nothing was changed.`,
            );
          }
        }

        const set: Record<string, unknown> = { updatedAt: new Date() };
        const before: Record<string, unknown> = {};
        if (input.title !== undefined) { set.name = input.title; before.title = existing.name; }
        if (input.descriptionMarkdown !== undefined) { set.description = input.descriptionMarkdown; before.descriptionMarkdown = existing.description; }
        if (input.priority !== undefined) { set.priority = input.priority; before.priority = existing.priority; }
        if (input.dueDate !== undefined) {
          // duedate is a DATE column (the mirror declares it timestamp). Write the
          // calendar day as ::date so a timezone offset can never shift it a day.
          set.dueDate = input.dueDate === null ? null : sql`${input.dueDate.slice(0, 10)}::date`;
          before.dueDate = existing.dueDate?.toISOString().slice(0, 10) ?? null;
        }
        if (input.assignedToId !== undefined) { set.assignedToId = input.assignedToId; before.assignedToId = existing.assignedToId; }

        const [task] = (await scoped.updateScoped(
          projecttasks,
          set,
          eq(projecttasks.id, input.taskId),
        )) as Array<typeof projecttasks.$inferSelect>;
        if (!task) {
          throw new McpError(ErrorCode.InvalidParams, `Task not found: ${input.taskId}`);
        }

        // The prior values go into the audit event, so an agent's edit is reversible
        // by hand without a database restore.
        await scoped.insertScoped(events, {
          projectId: task.projectId,
          type: 'task_updated',
          source: 'mcp-server',
          actor: 'update_task',
          rawContent: `Task ${task.id} updated: ${Object.keys(before).join(', ')}`,
          metadata: { taskId: task.id, changed: Object.keys(before), before, tokenPrefix: scoped.scope.tokenPrefix },
        });

        logger.info('Task updated', { taskId: task.id, changed: Object.keys(before) });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                changed: Object.keys(before),
                task: {
                  id: task.id,
                  projectId: task.projectId,
                  specId: task.specId,
                  title: task.name,
                  descriptionMarkdown: task.description || '',
                  status: task.status,
                  priority: task.priority,
                  dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null,
                  assignedToId: task.assignedToId,
                  assignee: task.assignee,
                  createdAt: task.createdAt.toISOString(),
                  updatedAt: task.updatedAt.toISOString(),
                },
              }),
            },
          ],
        };
      }
      // [SCOPE 101 / T014] END

      // [SCOPE 101 / T015] BEGIN — delete_task (guarded hard delete, Amendment B)
      // [SCOPE 123 / T021] MODIFIED-BY — re-assess the deleted task's scope (SCOPE-123 advance)
      // Every one of these child tables is ON DELETE CASCADE to projecttasks, so a
      // plain delete would silently destroy billable time, the external PM link,
      // dependency edges, and compliance evidence. Any of them present → refuse.
      // The check and the delete share ONE transaction that first locks the task
      // row: a time entry logged between a bare count and the delete would otherwise
      // be cascaded away; under FOR UPDATE a concurrent child insert waits, then
      // fails its FK. A count that cannot be read aborts the transaction — the guard
      // fails closed, never treating "unknown" as zero.
      case 'project.delete_task': {
        const input = DeleteTaskInputSchema.parse(args);

        const [existing] = (await scoped.selectScoped(
          projecttasks,
          eq(projecttasks.id, input.taskId),
        )) as Array<typeof projecttasks.$inferSelect>;
        if (!existing) {
          throw new McpError(ErrorCode.InvalidParams, `Task not found: ${input.taskId}`);
        }

        type CountRow = Record<string, number>;
        const firstRow = (r: unknown): CountRow => {
          const row = (r as { rows?: CountRow[] }).rows?.[0];
          if (!row) throw new Error('delete_task: blocker count returned no row');
          return row;
        };

        const outcome = await scoped.raw.transaction(async (tx) => {
          const locked = await tx.execute(sql`
            SELECT id FROM projecttasks
             WHERE id = ${existing.id} AND projectid = ${existing.projectId}
             FOR UPDATE`);
          if (((locked as unknown as { rows?: unknown[] }).rows ?? []).length === 0) {
            return { kind: 'gone' as const };
          }

          const blockers = firstRow(await tx.execute(sql`
            SELECT
              (SELECT count(*)::int FROM projecttimeentries WHERE taskid = ${existing.id}) AS "timeEntries",
              (SELECT count(*)::int FROM tasksyncrecords    WHERE taskid = ${existing.id}) AS "externalSyncRecords",
              (SELECT count(*)::int FROM taskdependencies
                WHERE taskid = ${existing.id} OR blockedbyid = ${existing.id})              AS "dependencies",
              (SELECT count(*)::int FROM complianceflags    WHERE taskid = ${existing.id}) AS "complianceFlags",
              (SELECT count(*)::int FROM taskstateoverrides WHERE taskid = ${existing.id}) AS "stateOverrides"`));
          const present = Object.fromEntries(Object.entries(blockers).filter(([, n]) => n > 0));
          if (Object.keys(present).length > 0) {
            return { kind: 'blocked' as const, blockers: present };
          }

          // ON DELETE SET NULL children survive but lose their link — reported, not silent.
          const unlinked = firstRow(await tx.execute(sql`
            SELECT
              (SELECT count(*)::int FROM aiproposals   WHERE taskid = ${existing.id}) AS "aiProposals",
              (SELECT count(*)::int FROM testplanitems WHERE taskid = ${existing.id}) AS "testPlanItems"`));

          await tx
            .delete(projecttasks)
            .where(and(eq(projecttasks.id, existing.id), eq(projecttasks.projectId, existing.projectId)));
          return { kind: 'deleted' as const, unlinked };
        });

        if (outcome.kind === 'gone') {
          throw new McpError(ErrorCode.InvalidParams, `Task not found: ${input.taskId}`);
        }

        if (outcome.kind === 'blocked') {
          const detail = Object.entries(outcome.blockers).map(([k, n]) => `${k}: ${n}`).join(', ');
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  blocked: true,
                  taskId: existing.id,
                  blockers: outcome.blockers,
                  message: `delete_task refused: task "${existing.name}" has dependent records that a delete would cascade away (${detail}). Nothing was deleted. Remove those deliberately in the Portal first, or leave the task and mark it done.`,
                }),
              },
            ],
          };
        }

        const snapshot = {
          id: existing.id,
          projectId: existing.projectId,
          specId: existing.specId,
          title: existing.name,
          descriptionMarkdown: existing.description || '',
          status: existing.status,
          priority: existing.priority,
          dueDate: existing.dueDate?.toISOString().slice(0, 10) ?? null,
          assignedToId: existing.assignedToId,
          createdAt: existing.createdAt.toISOString(),
        };

        await scoped.insertScoped(events, {
          projectId: existing.projectId,
          type: 'task_deleted',
          source: 'mcp-server',
          actor: 'delete_task',
          rawContent: `Task ${existing.id} deleted: ${existing.name}`,
          metadata: { snapshot, unlinked: outcome.unlinked, tokenPrefix: scoped.scope.tokenPrefix },
        });

        logger.info('Task deleted', { taskId: existing.id, unlinked: outcome.unlinked });

        // [SCOPE 123 / T021] Deleting a scope's last open task can clear its exit condition.
        if (existing.specId) {
          await advanceScopeIds([existing.specId], { actor: scoped.scope.userId ?? 'mcp', trigger: 'task_deleted' });
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, deleted: snapshot, unlinked: outcome.unlinked }),
            },
          ],
        };
      }
      // [SCOPE 101 / T015] END

      // [SCOPE 101 / T005] BEGIN — update_spec_status (spec lifecycle transition)
      case 'project.update_spec_status': {
        const input = UpdateSpecStatusInputSchema.parse(args);

        // [SCOPE 124 / T022] Report 64dadcc1: a projectId one character wrong was accepted, the
        // write went to the token's project, and the success response read as confirmation the id
        // was right. A parameter that guards nothing is worse than no parameter — this one now
        // guards. The write still goes to the token's project; a mismatch is refused rather than
        // ignored. Deliberately NOT global: the feedback sink and list_my_feedback accept another
        // project on purpose, so a blanket rule would break the channel bugs are reported through.
        if (
          input.projectId &&
          scoped.scope.projectId &&
          input.projectId !== scoped.scope.projectId
        ) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `projectId ${input.projectId} is not the project this token is scoped to (${scoped.scope.projectId}). ` +
              'This write would have gone to the token\'s project, not the one named. Re-issue with the correct projectId, or omit it.',
          );
        }

        // Resolve the target spec within the caller's project scope.
        const specs = (await scoped.selectScoped(
          projectspecifications,
        )) as Array<typeof projectspecifications.$inferSelect>;

        // [SCOPE 124 / T022] Reports 3ea10d39 and 928f604f: the old predicate accepted an exact
        // match OR a numeric one in a single pass, so row order decided which won and "0006" could
        // land on an archived "006". Exact wins outright now, normalization is a fallback, and a
        // normalization that matches more than one row is refused by name rather than picked.
        let spec: typeof projectspecifications.$inferSelect;
        let resolvedBy: 'specId' | 'exact' | 'normalized';
        try {
          const resolution = resolveSpecTarget(
            specs.map((s) => ({ ...s, specNumber: String(s.specNumber), title: String(s.title), status: String(s.status) })),
            { specId: input.specId, specNumber: input.specNumber },
          );
          spec = specs.find((s) => s.id === resolution.spec.id) as typeof projectspecifications.$inferSelect;
          resolvedBy = resolution.resolvedBy;
        } catch (error) {
          if (error instanceof SpecTargetAmbiguousError || error instanceof SpecTargetNotFoundError) {
            throw new McpError(ErrorCode.InvalidParams, error.message);
          }
          throw error;
        }

        const previousStatus = spec.status;
        const previousTitle = spec.title;
        // BUG-2026-07-18 (Issue 6): status and title are each optional; write
        // only what was supplied so a rename doesn't force a status change and
        // vice-versa. The schema guarantees at least one is present.
        const specUpdates: Partial<typeof projectspecifications.$inferInsert> = { updatedAt: new Date() };
        if (input.status !== undefined) specUpdates.status = input.status;
        if (input.title !== undefined) specUpdates.title = input.title;
        const [updated] = (await scoped.updateScoped(
          projectspecifications,
          specUpdates,
          eq(projectspecifications.id, spec.id),
        )) as Array<typeof projectspecifications.$inferSelect>;

        // Audit whatever actually changed (best-effort; does not fail the operation).
        const changes: string[] = [];
        if (input.status !== undefined && input.status !== previousStatus) {
          changes.push(`status ${previousStatus} → ${input.status}`);
        }
        if (input.title !== undefined && input.title !== previousTitle) {
          changes.push(`title "${previousTitle}" → "${input.title}"`);
        }
        try {
          await scoped.insertScoped(events, {
            projectId: input.projectId,
            type: 'document_updated',
            source: 'mcp-server',
            actor: 'update_spec_status',
            rawContent: `Spec ${spec.specNumber} ${changes.length ? changes.join('; ') : 'update (no-op)'}`,
            metadata: {
              specId: spec.id,
              specNumber: spec.specNumber,
              from: previousStatus,
              to: input.status ?? previousStatus,
              titleFrom: previousTitle,
              titleTo: input.title ?? previousTitle,
            },
          });
        } catch {
          /* audit is non-critical */
        }

        logger.info('Spec updated', {
          specId: spec.id,
          specNumber: spec.specNumber,
          requestedSpecNumber: input.specNumber,
          resolvedBy,
          statusFrom: previousStatus,
          statusTo: input.status ?? previousStatus,
          titleChanged: input.title !== undefined && input.title !== previousTitle,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                spec: {
                  id: updated.id,
                  specNumber: updated.specNumber,
                  title: updated.title,
                  previousStatus,
                  status: updated.status,
                  updatedAt: updated.updatedAt.toISOString(),
                },
                // [SCOPE 124 / T022] What was asked for, and how it was matched. A caller who asked
                // for "0006" and reached "006" can see that here rather than infer it from a title
                // that looks wrong — which is how both reporters eventually caught it.
                requestedSpecNumber: input.specNumber ?? null,
                resolvedBy,
              }),
            },
          ],
        };
      }
      // [SCOPE 101 / T005] END

      // [SCOPE 074 / T004] BEGIN — capability index write (re)index a unit's capabilities
      case 'project.index_capabilities': {
        const input = IndexCapabilitiesInputSchema.parse(args);
        const projectId = scoped.scope.projectId;
        if (!projectId) {
          throw new McpError(ErrorCode.InvalidParams, 'index_capabilities requires an authenticated project scope');
        }
        const indexed = await indexCapabilities(projectId, input.sourceRef, input.sourceType, input.capabilities);
        return {
          content: [{ type: 'text', text: JSON.stringify({ indexed, sourceRef: input.sourceRef, sourceType: input.sourceType }) }],
        };
      }
      // [SCOPE 074 / T004] END

      // [SCOPE 074 / T005] BEGIN — capability index read (semantic reuse search, tenant-scoped)
      case 'project.search_capabilities': {
        const input = SearchCapabilitiesInputSchema.parse(args);
        const projectId = scoped.scope.projectId;
        if (!projectId) {
          throw new McpError(ErrorCode.InvalidParams, 'search_capabilities requires an authenticated project scope');
        }
        const matches = await searchCapabilities(projectId, input.queryText, {
          topK: input.topK,
          sourceType: input.sourceType,
          capabilityType: input.capabilityType,
        });
        return { content: [{ type: 'text', text: JSON.stringify({ matches }) }] };
      }
      // [SCOPE 074 / T005] END

      // [SCOPE 073 / T003] BEGIN — capture a scope's dependency edges, regenerate scopeflow, return warnings
      case 'project.set_scope_dependencies': {
        const input = SetScopeDependenciesInputSchema.parse(args);
        const projectId = scoped.scope.projectId;
        if (!projectId) {
          throw new McpError(ErrorCode.InvalidParams, 'set_scope_dependencies requires an authenticated project scope');
        }
        const edgesCaptured = await captureScopeEdges(
          projectId,
          input.scopeNumber,
          input.dependsOnRaw ?? '',
          input.relatedRaw ?? '',
        );
        const warnings = await regenerateScopeFlow(projectId);
        return {
          content: [{ type: 'text', text: JSON.stringify({ scope: input.scopeNumber, edgesCaptured, warnings }) }],
        };
      }
      // [SCOPE 073 / T003] END

      case 'project.link_doc_to_task': {
        const input = LinkDocToTaskInputSchema.parse(args);

        // SOC 2 H-4 (2026-08-03): these four calls used the raw `db` handle and
        // matched on id alone, so any authenticated token could read AND rewrite
        // a task/document belonging to another tenant. `projecttasks` and
        // `projectdocuments` are both in PROJECT_SCOPED_TABLES, so the scoped
        // wrapper AND-s `projectid = scope.projectId` onto every one of them —
        // a row outside the caller's project now simply does not match, and the
        // handler reports it as not-found rather than mutating it.
        const [task] = (await scoped.selectScoped(
          projecttasks,
          eq(projecttasks.id, input.taskId),
        )) as Array<typeof projecttasks.$inferSelect>;
        if (!task) {
          throw new McpError(ErrorCode.InvalidParams, `Task not found: ${input.taskId}`);
        }

        const [doc] = (await scoped.selectScoped(
          projectdocuments,
          eq(projectdocuments.id, input.documentId),
        )) as Array<typeof projectdocuments.$inferSelect>;
        if (!doc) {
          throw new McpError(ErrorCode.InvalidParams, `Document not found: ${input.documentId}`);
        }

        const currentDocIds = (task.documentIds as string[]) || [];
        const currentTaskIds = (doc.taskIds as string[]) || [];
        const newDocIds = currentDocIds.includes(input.documentId)
          ? currentDocIds
          : [...currentDocIds, input.documentId];
        const newTaskIds = currentTaskIds.includes(input.taskId)
          ? currentTaskIds
          : [...currentTaskIds, input.taskId];

        const [updatedTask] = (await scoped.updateScoped(
          projecttasks,
          { documentIds: newDocIds, updatedAt: new Date() },
          eq(projecttasks.id, input.taskId),
        )) as Array<typeof projecttasks.$inferSelect>;

        const [updatedDoc] = (await scoped.updateScoped(
          projectdocuments,
          { taskIds: newTaskIds, updatedAt: new Date() },
          eq(projectdocuments.id, input.documentId),
        )) as Array<typeof projectdocuments.$inferSelect>;

        logger.info('Document linked to task', {
          taskId: updatedTask.id,
          documentId: updatedDoc.id,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                task: {
                  id: updatedTask.id,
                  title: updatedTask.name,
                  documentIds: (updatedTask.documentIds as string[]) || [],
                },
                document: {
                  id: updatedDoc.id,
                  title: updatedDoc.title,
                  taskIds: (updatedDoc.taskIds as string[]) || [],
                },
              }),
            },
          ],
        };
      }

      case 'project.list_open_items': {
        const input = ListOpenItemsInputSchema.parse(args);
        const maxItems = input.maxItems ?? 50;

        // [SCOPE 042 / T003] scope-leak fix: bind reads to the token's project,
        // not the caller-supplied projectId, so a project-scoped token cannot
        // read a sibling project under the same customer
        // (project_028_scope_leak_observation). Dev-bypass keeps prior behavior.
        const sc = scoped.scope;
        if (sc.authMode !== 'dev-bypass') {
          if (!sc.projectId) {
            throw new ScopeViolationError('scope-incomplete: list_open_items requires a resolved projectId.');
          }
          if (input.projectId !== sc.projectId) {
            throw new ScopeViolationError(
              `scope-mismatch: list_open_items requested ${input.projectId} but token is scoped to ${sc.projectId}.`,
            );
          }
        }
        const effectiveProjectId: string = sc.authMode === 'dev-bypass' ? input.projectId : sc.projectId!;

        // BUG-2026-07-18 (Issue 4): reads must scale on large projects. Support
        // `offset` (pagination cursor per category), `category` (return just one
        // collection), and `documentBody` ('none' omits the preview entirely).
        const offset = input.offset ?? 0;
        const cat = input.category; // undefined = all three
        const wantTasks = !cat || cat === 'tasks';
        const wantDocs = !cat || cat === 'documents';
        const wantEvents = !cat || cat === 'events';
        // [SCOPE 124 / T006] BEGIN — the envelope can now answer "which specs exist?"
        const wantSpecs = !cat || cat === 'specs';
        // [SCOPE 124 / T006] END
        const docBody = input.documentBody ?? 'preview';

        // Optional filters: `status` narrows tasks (omit = all statuses, so the
        // dbpush idempotency read still sees DONE tasks); `since` bounds events —
        // the one collection that grows without limit over a project's lifetime.
        const taskWhere = input.status?.length
          ? and(eq(projecttasks.projectId, effectiveProjectId), inArray(projecttasks.status, input.status))
          : eq(projecttasks.projectId, effectiveProjectId);
        const sinceDate = input.since ? new Date(input.since) : null;
        const eventWhere = sinceDate
          ? and(eq(events.projectId, effectiveProjectId), gte(events.createdAt, sinceDate))
          : eq(events.projectId, effectiveProjectId);

        // [SCOPE 103 / T004] Hide documents belonging to archived scopes from the
        // raw open-items listing (the last read site that could leak one). Docs
        // with no spec link (specId IS NULL) are never archived, so they stay —
        // NOT-IN alone would drop them because `NULL NOT IN (...)` is NULL/false.
        const archivedSpecIds = wantDocs
          ? (
              await db
                .select({ id: projectspecifications.id })
                .from(projectspecifications)
                .where(
                  and(
                    eq(projectspecifications.projectId, effectiveProjectId),
                    eq(projectspecifications.status, 'archived'),
                  ),
                )
            ).map((r) => r.id)
          : [];
        const docWhere = archivedSpecIds.length
          ? and(
              eq(projectdocuments.projectId, effectiveProjectId),
              or(
                isNull(projectdocuments.specId),
                notInArray(projectdocuments.specId, archivedSpecIds),
              ),
            )
          : eq(projectdocuments.projectId, effectiveProjectId);

        // [SCOPE 124 / T006] BEGIN — authoritative spec identity, not inferred
        //
        // WHY THIS EXISTS: `dbpush` decided whether a spec already existed by regex-matching
        // an `[NNN-T###]` prefix out of TASK TITLE TEXT (dbpush.ts:499-512), because this
        // envelope had no way to tell it. A spec with no open tasks, or with untagged titles,
        // was therefore invisible and treated as new — hard-blocked by the unique index
        // ("Duplicate specNumber 010") or silently duplicated where no index guards it.
        //
        // WHY A `specs[]` COLLECTION rather than resolving `specNumber` onto each task: a spec
        // with ZERO tasks has no task row to decorate. That is the sharpest form of the defect —
        // the more finished the work, the more likely it was to be duplicated — so decorating
        // tasks could not have fixed it. (`specId`/`specNumber` are added to the task projection
        // too, but as a convenience, not as the identity answer.)
        //
        // NOT bounded by `maxItems`, deliberately (FR-006): a truncated list is a WRONG answer to
        // "does this spec exist", and silently bounding a correctness check is how the original
        // defect hid. Four narrow columns over a project's specs is a small payload — the largest
        // project here has ~122. SPEC_IDENTITY_CAP is a runaway backstop, and reaching it is
        // reported rather than applied silently.
        //
        // ARCHIVED SPECS ARE INCLUDED. SCOPE-103 hides archived scopes' documents from this
        // listing, and extending that to `specs[]` would be a correctness bug here: an archived
        // spec still OWNS its specNumber, so omitting it tells a caller the number is free and
        // walks straight back into a duplicate. `status` is returned so callers can filter.
        // Loaded for `wantTasks` too, so `category:'tasks'` still resolves each task's
        // specNumber rather than silently returning null for all of them.
        const SPEC_IDENTITY_CAP = 1000;
        const specRows = wantSpecs || wantTasks
          ? await db
              .select({
                id: projectspecifications.id,
                specNumber: projectspecifications.specNumber,
                title: projectspecifications.title,
                status: projectspecifications.status,
                updatedAt: projectspecifications.updatedAt,
              })
              .from(projectspecifications)
              .where(eq(projectspecifications.projectId, effectiveProjectId))
              .orderBy(projectspecifications.specNumber)
              .limit(SPEC_IDENTITY_CAP)
          : [];
        // [SCOPE 124 / T006] END

        const [tasks, documents, recentEvents] = await Promise.all([
          wantTasks
            ? db
                .select()
                .from(projecttasks)
                .where(taskWhere)
                .orderBy(desc(projecttasks.updatedAt))
                .limit(maxItems)
                .offset(offset)
            : Promise.resolve([] as Array<typeof projecttasks.$inferSelect>),
          wantDocs
            ? db
                .select()
                .from(projectdocuments)
                .where(docWhere)
                .orderBy(desc(projectdocuments.updatedAt))
                .limit(maxItems)
                .offset(offset)
            : Promise.resolve([] as Array<typeof projectdocuments.$inferSelect>),
          wantEvents
            ? db
                .select()
                .from(events)
                .where(eventWhere)
                .orderBy(desc(events.createdAt))
                .limit(maxItems)
                .offset(offset)
            : Promise.resolve([] as Array<typeof events.$inferSelect>),
        ]);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                // Echo paging so callers can advance without guessing: a full page
                // (length === maxItems) implies more rows at offset+maxItems.
                paging: { offset, maxItems, category: cat ?? 'all', documentBody: docBody },
                // [SCOPE 124 / T006] BEGIN — authoritative spec identity.
                // `specsComplete: false` means the cap was hit and this list must NOT be used
                // to decide existence. Saying so is the point: the defect being fixed was a
                // correctness check silently reading a truncated set.
                specs: wantSpecs
                  ? specRows.map((s) => ({
                      id: s.id,
                      specNumber: s.specNumber,
                      title: s.title,
                      status: s.status,
                      updatedAt: s.updatedAt.toISOString(),
                    }))
                  : [],
                // `wantSpecs &&`, not `!wantSpecs ||`: a category-filtered call returns
                // `specs: []` because specs were not ASKED for, which is not the same fact as
                // "this project has no specs". Reporting that empty list as complete hands a
                // caller doing an existence check a confidently wrong answer — the exact defect
                // T006 exists to close, re-entered through the category door. Not asked ⇒ not
                // complete, so any such check fails closed. Callers that pass no category (the
                // identity path, including dbpush) are unaffected.
                specsComplete: wantSpecs && specRows.length < SPEC_IDENTITY_CAP,
                // [SCOPE 124 / T006] END
                tasks: tasks.map((t) => ({
                  id: t.id,
                  projectId: t.projectId,
                  // [SCOPE 124 / T006] The task→spec link, previously absent from this
                  // projection entirely. `specNumber` is resolved from `specs[]` above so
                  // dbpush's long-dead `t.specNumber ?? …` branch finally has a value —
                  // convenience only; `specs[]` is the identity answer (see T007).
                  specId: t.specId ?? null,
                  specNumber: t.specId
                    ? (specRows.find((s) => s.id === t.specId)?.specNumber ?? null)
                    : null,
                  title: t.name,
                  descriptionMarkdown: t.description || '',
                  status: t.status,
                  priority: t.priority,
                  dueDate: t.dueDate?.toISOString() || null,
                  sourceEventId: t.sourceEventId,
                  documentIds: (t.documentIds as string[]) || [],
                  assignee: t.assignee,
                  createdAt: t.createdAt.toISOString(),
                  updatedAt: t.updatedAt.toISOString(),
                })),
                documents: documents.map((d) => {
                  // A list/index call returns metadata only by default. Inlining
                  // `bodyMarkdown: d.content` — the full spec/plan/lifecycle for
                  // every document — blew the whole-project payload past the
                  // tool-result token limit once a project had ~30 specs. So the
                  // body is controlled by `documentBody`: 'none' omits the preview
                  // (smallest), 'preview' (default) surfaces a 200-char preview,
                  // 'full' inlines the whole body (use with category+offset to
                  // bound the payload). BUG-2026-07-18 (Issue 4).
                  const body = d.content || '';
                  return {
                    id: d.id,
                    projectId: d.projectId,
                    title: d.title,
                    bodyChars: body.length,
                    ...(docBody === 'preview' ? { preview: body.slice(0, 200) } : {}),
                    ...(docBody === 'full' ? { bodyMarkdown: body } : {}),
                    sourceEventId: d.sourceEventId,
                    taskIds: (d.taskIds as string[]) || [],
                    tags: (d.tags as string[]) || [],
                    createdAt: d.createdAt.toISOString(),
                    updatedAt: d.updatedAt.toISOString(),
                  };
                }),
                events: recentEvents.map((e) => ({
                  id: e.id,
                  projectId: e.projectId,
                  type: e.type,
                  source: e.source,
                  actor: e.actor,
                  rawContent: e.rawContent,
                  normalizedContent: e.normalizedContent,
                  metadata: e.metadata,
                  createdAt: e.createdAt.toISOString(),
                })),
              }),
            },
          ],
        };
      }

      // [SCOPE 042 / T002] BEGIN — project.cockpit_summary (scoped read for the Dev Cockpit)
      // [SCOPE 123 / T018] MODIFIED-BY — additive per-scope `stage` field
      // MODIFIED-BY: [SCOPE 137 / T019] — the owner-set impactMode; impactModeOnly answers just that (FR-007a)
      case 'project.cockpit_summary': {
        const input = ListOpenItemsInputSchema.parse(args);

        // T003 — reject a mismatched caller projectId up front; selectScoped
        // also binds the reads below to the token's project, so a token for
        // project A can never surface project B (or a sibling under the same
        // customer).
        const scopedProjectId = assertCockpitScope(input.projectId, scoped.scope);

        // The owner-set Change Impact mode (latest impact_mode_set event). Fail-open: null.
        let impactMode: OwnerImpactMode | null = null;
        try {
          const rows = await db
            .select({ actor: events.actor, metadata: events.metadata, createdAt: events.createdAt })
            .from(events)
            .where(and(eq(events.projectId, scopedProjectId), eq(events.type, IMPACT_MODE_EVENT_TYPE)))
            .orderBy(desc(events.createdAt))
            .limit(20);
          impactMode = latestImpactMode(rows);
        } catch (err) {
          logger.warn('cockpit_summary: impactMode unavailable', { error: (err as Error).message });
        }
        // The Change Impact hook asks for the mode alone, so it never waits for the whole summary.
        if (input.impactModeOnly) {
          return { content: [{ type: 'text', text: JSON.stringify({ projectId: scopedProjectId, impactMode }) }] };
        }

        const [allSpecsRaw, allTasksRaw] = (await Promise.all([
          scoped.selectScoped(projectspecifications),
          scoped.selectScoped(projecttasks),
        ])) as [
          Array<typeof projectspecifications.$inferSelect>,
          Array<typeof projecttasks.$inferSelect>,
        ];
        // [SCOPE 103 / T004] archived scopes are hidden from the cockpit summary
        const allSpecs = allSpecsRaw.filter((s) => s.status !== 'archived');
        // [SCOPE 103 / T004] ...and so are their tasks. Left in, a task whose spec was
        // filtered out matches no visible scope and resurfaces under unlinkedTasks
        // (feedback 3de3efa6: 4 open tasks from archived duplicate scopes).
        const archivedSpecIds = new Set(allSpecsRaw.filter((s) => s.status === 'archived').map((s) => s.id));
        const liveTasks = allTasksRaw.filter((t) => !t.specId || !archivedSpecIds.has(t.specId));

        // BUG-2026-07-18 (Issue 4): single-scope filter. Answering "what is spec
        // 0026's status?" previously required fetching the whole ~108k-char
        // project and filtering client-side. When specId/specNumber is supplied,
        // return just that spec's scope + its tasks.
        let specs = allSpecs;
        let allTasks = liveTasks;
        if (input.specId || input.specNumber) {
          const match = allSpecs.filter((s) =>
            input.specId
              ? s.id === input.specId
              : String(s.specNumber) === String(input.specNumber) ||
                (Number.isFinite(Number(input.specNumber)) &&
                  Number(s.specNumber) === Number(input.specNumber)),
          );
          if (!match.length) {
            throw new McpError(
              ErrorCode.InvalidParams,
              `Spec not found in this project: ${input.specId ?? input.specNumber}`,
            );
          }
          const ids = new Set(match.map((s) => s.id));
          specs = match;
          allTasks = liveTasks.filter((t) => t.specId && ids.has(t.specId));
        }

        // [SCOPE 058 / T006] resolve claim-holder display names (userprofiles is
        // not project-scoped; read by id via the raw client).
        const claimerIds = Array.from(
          new Set(specs.map((s) => s.claimedById).filter((v): v is string => !!v)),
        );
        const nameById = new Map<string, string>();
        if (claimerIds.length) {
          const profiles = (await scoped.raw
            .select({ id: userprofiles.id, fullname: userprofiles.fullname, emailaddr: userprofiles.emailaddr })
            .from(userprofiles)
            .where(inArray(userprofiles.id, claimerIds))) as Array<{
            id: string;
            fullname: string | null;
            emailaddr: string | null;
          }>;
          for (const p of profiles) nameById.set(p.id, p.fullname || p.emailaddr || 'unknown');
        }

        // [SCOPE 058 / T006] claims (and the FR-008 read-only) apply only in multi-member
        // companies — a single-member company has no one to coordinate with.
        const { companyId: viewerCompanyId } = await getCallerCompany(scoped, scoped.scope.userId);
        const claimsEnabled = !(await isSingleMemberCompany(scoped, viewerCompanyId));

        // [SCOPE 081 / T005] Order scopes + the Development Plan panel foundation-up
        // (build order), reusing the devplan scope-dependency graph. Fail-open: on
        // any error the summary falls back to specNumber-ascending order.
        let scopeLayers: Map<number, number> | undefined;
        try {
          const refs = await loadStoredRefs(scopedProjectId);
          const known = new Map(specs.map((s) => [parseInt(s.specNumber, 10), s.title]));
          scopeLayers = layerNodes(buildScopeGraph(refs, known));
        } catch (err) {
          logger.warn('cockpit_summary: scope layering failed; using specNumber order', { err });
        }

        const summary = buildCockpitSummary(specs, allTasks, scopedProjectId, nameById, scoped.scope.userId, claimsEnabled, scopeLayers);

        // [SCOPE 103 / T007] Expose the archived set (computed from the UNfiltered
        // rows) so the kit can reconcile on-disk files to specs/_archive/ — server
        // writes the DB, the kit syncs the FS. Additive field; other consumers ignore it.
        const archivedSpecNumbers = allSpecsRaw
          .filter((s) => s.status === 'archived')
          .map((s) => String(s.specNumber));

        // [SCOPE 043 / T024] Amendment D (FR-022) — tell the Cockpit up front whether
        // it may ask for the vendor's incoming queue. Without this the extension had
        // no way to know, so it asked on every refresh for every project and was
        // refused: three consumer projects generated 5,396 refusals in a day.
        // Answered on the caller's OWN scope (cockpit_summary never rebinds to the
        // sink), and it grants nothing — list_my_feedback still gates every call.
        const canViewIncoming = await callerCanViewProject(scoped.scope, sinkProjectId());

        // [SCOPE 123 / T018] Additive: each scope's own stage (its open specificationphases row).
        // An active scope with no row shows its task-count lower bound with stageTracked: false
        // (Amendment C, decision 9); an inactive scope has no stage. Fail-open: a stage read
        // failure drops the fields rather than the summary.
        let scopes: Array<(typeof summary.scopes)[number] & { stage?: string | null; stageTracked?: boolean }> =
          summary.scopes;
        try {
          const stages = await projectScopeStages(scopedProjectId);
          scopes = summary.scopes.map((s) => {
            const st = stages.get(s.id);
            return { ...s, stage: st?.stage ?? null, stageTracked: st?.tracked ?? false };
          });
        } catch (err) {
          logger.warn('cockpit_summary: scope stages unavailable', { error: (err as Error).message });
        }

        return {
          content: [{ type: 'text', text: JSON.stringify({ ...summary, scopes, archivedSpecNumbers, canViewIncoming, impactMode }) }],
        };
      }
      // [SCOPE 042 / T002] END

      // [SCOPE 123 / T018] BEGIN — project.scope_stage (a named scope's stage, open tasks, open gates)
      // The kit's CLI gate reads this before a scoped command: the kit has no database in a
      // customer project. Read-only; bound to the caller's project like cockpit_summary.
      case 'project.scope_stage': {
        const input = ScopeStageInputSchema.parse(args);
        const scopedProjectId = assertCockpitScope(input.projectId, scoped.scope);
        const report = await scopeStageReport(scopedProjectId, { specId: input.specId, specNumber: input.specNumber });
        return {
          content: [{ type: 'text', text: JSON.stringify(report) }],
        };
      }

      // FR-007 — the explicit backfill for scopes that have never had a stage row. A dry run
      // unless confirm is true: it returns each scope's inferred stage and the evidence first.
      case 'project.backfill_scope_stages': {
        const input = BackfillScopeStagesInputSchema.parse(args);
        const scopedProjectId = assertCockpitScope(input.projectId, scoped.scope);
        const outcome = await backfillScopeStages(scopedProjectId, {
          confirm: input.confirm,
          actor: scoped.scope.userId ?? 'mcp',
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ...outcome,
                summary: {
                  scopes: outcome.plan.length,
                  toWrite: outcome.plan.filter((p) => p.action === 'write').length,
                  alreadyTracked: outcome.plan.filter((p) => p.action === 'skip-tracked').length,
                  inactive: outcome.plan.filter((p) => p.action === 'skip-inactive').length,
                  written: outcome.applied.filter((a) => a.outcome === 'written').length,
                },
                next: outcome.dryRun
                  ? 'Dry run: nothing was written. Review each scope\'s inferred stage and evidence, then call again with confirm: true.'
                  : 'Written. Running it again changes nothing for scopes that now have a stage.',
              }),
            },
          ],
        };
      }
      // [SCOPE 123 / T018] END

      // [SCOPE 058 / T003] BEGIN — check out a scope (claim + conflict detection + branch name)
      case 'project.checkout_scope': {
        const input = CheckoutScopeInputSchema.parse(args);
        const scopedProjectId = assertCockpitScope(input.projectId, scoped.scope);
        const callerId = scoped.scope.userId;

        const rows = (await scoped.selectScoped(
          projectspecifications,
          eq(projectspecifications.specNumber, input.specNumber),
        )) as Array<typeof projectspecifications.$inferSelect>;
        const spec = rows[0];
        if (!spec) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ ok: false, status: 'not_found', message: `Scope ${input.specNumber} not found in this project.` }) }],
          };
        }

        const branchName = `scope/${input.specNumber}-${kebab(spec.title)}`;

        // [SCOPE 058 / T003] Single-member company short-circuit — with one member
        // there is no one to coordinate with, so skip the claim entirely and just
        // return the branch name. Checked BEFORE any claim is written or forced.
        const { companyId, billingPlan } = await getCallerCompany(scoped, callerId);
        if (await isSingleMemberCompany(scoped, companyId)) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ ok: true, status: 'single_user', branchName, claimedBy: null, claimedAt: null }) }],
          };
        }

        // [SCOPE 058 / T003] Consultant engagement guard — a caller whose company is on
        // the CONSULTANT plan may check out only scopes their active engagement is
        // granted (direct or project-level). Internal callers are unrestricted.
        if (billingPlan === 'CONSULTANT' && companyId) {
          const granted = await consultantScopeGranted(scoped, companyId, scopedProjectId, input.specNumber);
          if (!granted) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ ok: false, status: 'forbidden', message: `Your engagement is not assigned scope ${input.specNumber}.` }) }],
            };
          }
        }

        const holderId = spec.claimedById;
        const collision = holderId && holderId !== callerId;

        if (collision && !input.force) {
          const holderName = await resolveUserName(scoped, holderId);
          return {
            content: [{ type: 'text', text: JSON.stringify({
              ok: false,
              status: 'conflict',
              heldBy: { userId: holderId, name: holderName },
              claimedAt: spec.claimedAt ? new Date(spec.claimedAt).toISOString() : null,
              message: `Scope ${input.specNumber} is checked out by ${holderName}.`,
            }) }],
          };
        }

        const now = new Date();
        await scoped.updateScoped(
          projectspecifications,
          { claimedById: callerId, claimedAt: now },
          eq(projectspecifications.specNumber, input.specNumber),
        );

        const forced = Boolean(collision && input.force);
        await scoped.insertScoped(events, {
          projectId: scopedProjectId,
          type: forced ? 'scope_checkout_forced' : 'scope_checked_out',
          source: 'mcp-server',
          actor: 'checkout_scope',
          rawContent: forced
            ? `Scope ${input.specNumber} force-checked-out by ${callerId ?? 'unknown'}, displacing ${holderId}`
            : `Scope ${input.specNumber} checked out by ${callerId ?? 'unknown'}`,
          metadata: { specNumber: input.specNumber, claimedById: callerId, displacedHolderId: forced ? holderId : null },
        });

        return {
          content: [{ type: 'text', text: JSON.stringify({
            ok: true,
            status: forced ? 'reclaimed' : 'claimed',
            branchName,
            claimedBy: { userId: callerId, name: await resolveUserName(scoped, callerId) },
            claimedAt: now.toISOString(),
          }) }],
        };
      }
      // [SCOPE 058 / T003] END

      // [SCOPE 058 / T004] BEGIN — check in a scope (release; ADMIN-only forced release)
      case 'project.checkin_scope': {
        const input = CheckinScopeInputSchema.parse(args);
        assertCockpitScope(input.projectId, scoped.scope);
        const callerId = scoped.scope.userId;

        const rows = (await scoped.selectScoped(
          projectspecifications,
          eq(projectspecifications.specNumber, input.specNumber),
        )) as Array<typeof projectspecifications.$inferSelect>;
        const spec = rows[0];
        if (!spec) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ ok: false, status: 'not_found', message: `Scope ${input.specNumber} not found in this project.` }) }],
          };
        }
        // [SCOPE 058 / T004] Single-member company — check-in is unnecessary (no claim is ever written).
        const { companyId: checkinCompanyId } = await getCallerCompany(scoped, callerId);
        if (await isSingleMemberCompany(scoped, checkinCompanyId)) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ ok: true, status: 'single_user' }) }],
          };
        }
        if (!spec.claimedById) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ ok: true, status: 'noop', message: `Scope ${input.specNumber} is not checked out.` }) }],
          };
        }

        const isClaimer = spec.claimedById === callerId;
        // FR-003: a developer may release only their own claim; forcing the
        // release of another developer's claim is ADMIN-only (TEAM_MANAGER may not).
        // Resolve the caller's real usertype — auth.role is unreliable here.
        if (!isClaimer && !(await isCallerAdmin(scoped, callerId))) {
          const holderName = await resolveUserName(scoped, spec.claimedById);
          return {
            content: [{ type: 'text', text: JSON.stringify({
              ok: false,
              status: 'conflict',
              heldBy: { userId: spec.claimedById, name: holderName },
              message: `Scope ${input.specNumber} is checked out by ${holderName}; only the holder or an ADMIN can check it in.`,
            }) }],
          };
        }

        const forced = !isClaimer; // an ADMIN releasing someone else's claim
        const displacedHolderId = spec.claimedById;
        await scoped.updateScoped(
          projectspecifications,
          { claimedById: null, claimedAt: null },
          eq(projectspecifications.specNumber, input.specNumber),
        );
        await scoped.insertScoped(events, {
          projectId: input.projectId,
          type: 'scope_checked_in',
          source: 'mcp-server',
          actor: 'checkin_scope',
          rawContent: forced
            ? `Scope ${input.specNumber} force-checked-in by ADMIN ${callerId ?? 'unknown'}, releasing ${displacedHolderId}`
            : `Scope ${input.specNumber} checked in by ${callerId ?? 'unknown'}`,
          metadata: { specNumber: input.specNumber, forced, displacedHolderId },
        });

        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, status: 'released', forced }) }],
        };
      }
      // [SCOPE 058 / T004] END

      case 'project.check_for_updates': {
        const input = CheckForUpdatesInputSchema.parse(args);
        
        const status = await checkForUpdates(input.force);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                currentVersion: status.currentVersion,
                latestVersion: status.latestVersion,
                updateAvailable: status.updateAvailable,
                releaseInfo: status.releaseInfo ? {
                  version: status.releaseInfo.version,
                  tagName: status.releaseInfo.tagName,
                  publishedAt: status.releaseInfo.publishedAt,
                  htmlUrl: status.releaseInfo.htmlUrl,
                  tarballUrl: status.releaseInfo.tarballUrl,
                  body: status.releaseInfo.body,
                  prerelease: status.releaseInfo.prerelease,
                  draft: status.releaseInfo.draft,
                } : null,
                lastChecked: status.lastChecked?.toISOString() || null,
                error: status.error,
              }),
            },
          ],
        };
      }
      
      case 'project.upgrade_mcp': {
        const input = UpgradeMcpInputSchema.parse(args);
        
        if (input.dryRun) {
          // Just check without installing
          const status = await checkForUpdates(true);
          
          if (!status.updateAvailable || !status.releaseInfo) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: 'No update available or already on latest version',
                    previousVersion: status.currentVersion,
                    newVersion: status.latestVersion,
                  }),
                },
              ],
            };
          }
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `Would upgrade from ${status.currentVersion} to ${status.releaseInfo.version} (dry run)`,
                  previousVersion: status.currentVersion,
                  newVersion: status.releaseInfo.version,
                }),
              },
            ],
          };
        }
        
        // Get latest release info
        const status = await checkForUpdates(true);
        
        if (!status.updateAvailable || !status.releaseInfo) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  message: 'No update available or already on latest version',
                }),
              },
            ],
          };
        }
        
        // Install the update
        const result = await installUpdate(status.releaseInfo);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: result.success,
                message: result.message,
                previousVersion: status.currentVersion,
                newVersion: status.releaseInfo.version,
              }),
            },
          ],
        };
      }
      
      // [SCOPE 058 dedup] Merge a duplicate spec into a keeper (same specNumber).
      case 'project.merge_scope': {
        const input = MergeScopeInputSchema.parse(args);

        // Both specs must exist in THIS project (selectScoped enforces scope).
        const specsInProject = (await scoped.selectScoped(
          projectspecifications,
        )) as Array<typeof projectspecifications.$inferSelect>;
        const from = specsInProject.find((s) => s.id === input.fromSpecId);
        const into = specsInProject.find((s) => s.id === input.intoSpecId);

        const blocked = (message: string) => ({
          content: [{ type: 'text', text: JSON.stringify({ success: false, blocked: true, message }) }],
        });
        if (!from || !into) {
          return blocked(`merge_scope blocked: ${!from ? 'fromSpecId' : 'intoSpecId'} not found in this project.`);
        }
        if (from.id === into.id) {
          return blocked('merge_scope blocked: fromSpecId and intoSpecId are the same row.');
        }
        // Safety: only merge TRUE duplicates (same specNumber).
        if (String(from.specNumber) !== String(into.specNumber)) {
          return blocked(
            `merge_scope blocked: specNumbers differ (from=${from.specNumber}, into=${into.specNumber}). This tool only dedups rows that share a specNumber.`,
          );
        }

        // Count children that point at the duplicate.
        const fromTasks = (await scoped.selectScoped(
          projecttasks,
          eq(projecttasks.specId, from.id),
        )) as Array<typeof projecttasks.$inferSelect>;
        const fromDocs = (await scoped.selectScoped(
          projectdocuments,
          eq(projectdocuments.specId, from.id),
        )) as Array<typeof projectdocuments.$inferSelect>;

        if (input.dryRun) {
          return {
            content: [{ type: 'text', text: JSON.stringify({
              success: true, blocked: false, dryRun: true,
              message: `Would merge spec ${from.specNumber} (${from.id}) into ${into.id}.`,
              specNumber: from.specNumber,
              wouldReassign: { tasks: fromTasks.length, documents: fromDocs.length },
              wouldDelete: { specId: from.id },
            }) }],
          };
        }

        // Reassign the duplicate's children to the keeper (preserve everything;
        // non-destructive). Scoped updates AND-in the project automatically.
        await scoped.updateScoped(projecttasks, { specId: into.id }, eq(projecttasks.specId, from.id));
        await scoped.updateScoped(projectdocuments, { specId: into.id }, eq(projectdocuments.specId, from.id));
        // Non-mirrored child tables (QA/audit) — best-effort via raw SQL, keyed
        // by the duplicate's specid (which we already verified is in-project).
        let testplansMoved: number | null = null;
        let auditMoved: number | null = null;
        try {
          const r = await scoped.raw.execute(
            sql`UPDATE testplans SET specid = ${into.id} WHERE specid = ${from.id}`,
          );
          testplansMoved = (r as unknown as { rowCount?: number }).rowCount ?? null;
        } catch { /* table/col may not exist — ignore */ }
        try {
          const r = await scoped.raw.execute(
            sql`UPDATE auditexecutions SET specid = ${into.id} WHERE specid = ${from.id}`,
          );
          auditMoved = (r as unknown as { rowCount?: number }).rowCount ?? null;
        } catch { /* ignore */ }

        // Delete the duplicate (manually scoped: id + projectId we verified).
        await scoped.raw
          .delete(projectspecifications)
          .where(and(eq(projectspecifications.id, from.id), eq(projectspecifications.projectId, input.projectId)));

        // Audit the merge.
        await scoped.insertScoped(events, {
          projectId: input.projectId,
          type: 'document_updated',
          source: 'mcp-server',
          actor: 'merge_scope',
          rawContent: `Merged duplicate spec ${from.specNumber} (${from.id}) into ${into.id}`,
          metadata: { specNumber: from.specNumber, fromSpecId: from.id, intoSpecId: into.id, reassignedTasks: fromTasks.length, reassignedDocuments: fromDocs.length },
        });

        // [SCOPE 123 / T021] The surviving scope gained tasks (and possibly tests): re-assess it.
        await advanceScopeIds([into.id], { actor: scoped.scope.userId ?? 'mcp', trigger: 'scope_merged' });

        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true, blocked: false,
            message: `Merged duplicate spec ${from.specNumber} into ${into.id}.`,
            specNumber: from.specNumber,
            reassigned: { tasks: fromTasks.length, documents: fromDocs.length, testplans: testplansMoved, auditexecutions: auditMoved },
            deleted: { specId: from.id },
          }) }],
        };
      }

      // [SCOPE 134 / T009] BEGIN — project.record_override (the decision, after the fact)
      case 'project.record_override': {
        const input = RecordOverrideInputSchema.parse(args);

        // Same gate as session_start, reusing SCOPE-133's binding rather than inventing a
        // second identity check. Only a bound agent may file an override record.
        const ovTokenId = scoped.scope.tokenId;
        const ovRefuse = (reason: string, message: string) => {
          didDeny = true;
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ success: false, blocked: true, reason, message }),
              },
            ],
          };
        };

        if (!ovTokenId) {
          return ovRefuse(
            'no_token',
            'record_override identifies its caller by token binding. Not available under dev-bypass.',
          );
        }
        const ovRows = (await scoped.raw
          .select({ binding: mcpapitokens.clientbinding, hash: mcpapitokens.tokenhash })
          .from(mcpapitokens)
          .where(eq(mcpapitokens.id, ovTokenId))
          .limit(1)) as Array<{ binding: string | null; hash: string }>;
        const ovRow = ovRows[0];
        if (!ovRow?.binding) {
          return ovRefuse(
            'unbound_token',
            'This token carries no client binding, so it is not an agent token and cannot file an override record.',
          );
        }
        if (ovRow.binding !== `${input.agentName}:${ovRow.hash}`) {
          return ovRefuse(
            'binding_mismatch',
            `This token is not bound to "${input.agentName}".`,
          );
        }

        // A grant without a named human is not an approval. The schema already refuses
        // it; this is the second line, because the constitution's whole position is that
        // a tool may request an override and may never self-approve one.
        if (input.outcome === 'granted' && !input.grantedBy) {
          return ovRefuse(
            'no_grantor',
            'A granted override must name the human who approved it. A tool never self-approves.',
          );
        }

        const grantedAt = new Date();
        const expiresAt = input.expiresInMinutes
          ? new Date(grantedAt.getTime() + input.expiresInMinutes * 60_000)
          : null;

        const ovInserted = (await scoped.insertScoped(events, {
          projectId: input.projectId,
          type: 'agent_override',
          source: 'mcp',
          actor: input.agentName,
          rawContent:
            `Override ${input.outcome} for ${input.action}` +
            (input.grantedBy ? ` by ${input.grantedBy}` : ''),
          metadata: {
            sessionId: input.sessionId ?? null,
            agentName: input.agentName,
            action: input.action,
            outcome: input.outcome,
            grantedBy: input.grantedBy ?? null,
            // Verbatim, so a later reader judges the decision on what the human actually
            // saw rather than on a summary written after the fact.
            requestText: input.requestText ?? null,
            grantedAt: grantedAt.toISOString(),
            expiresAt: expiresAt ? expiresAt.toISOString() : null,
            // Absent expiry means single-use: this one action, not a window.
            singleUse: !input.expiresInMinutes,
            detail: input.detail ?? null,
          },
        })) as Array<typeof events.$inferSelect>;

        logger.info('agent override recorded', {
          agentName: input.agentName,
          action: input.action,
          outcome: input.outcome,
          grantedBy: input.grantedBy ?? null,
          projectId: input.projectId,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                recordId: ovInserted[0]?.id ?? null,
                action: input.action,
                outcome: input.outcome,
                grantedBy: input.grantedBy ?? null,
                grantedAt: grantedAt.toISOString(),
                expiresAt: expiresAt ? expiresAt.toISOString() : null,
                singleUse: !input.expiresInMinutes,
                // Said plainly so no caller mistakes this for permission. The server
                // cannot execute anything, so it cannot authorize anything either.
                note: 'This is a RECORD of a decision already made, not a grant. Enforcement is local: the runtime suspends the action and resumes only on the operator answering. Recording here does not permit anything.',
              }),
            },
          ],
        };
      }
      // [SCOPE 134 / T009] END

      // [SCOPE 098 / T008] BEGIN — project.delete_scope (MCP parity with the web route)
      case 'project.delete_scope': {
        const input = DeleteScopeInputSchema.parse(args);

        const specsHere = (await scoped.selectScoped(
          projectspecifications,
        )) as Array<typeof projectspecifications.$inferSelect>;

        const target = input.specId
          ? specsHere.find((s) => s.id === input.specId)
          : specsHere.find((s) => String(s.specNumber) === String(input.specNumber));

        const blocked = (message: string) => ({
          content: [
            { type: 'text', text: JSON.stringify({ success: false, blocked: true, message }) },
          ],
        });

        if (!target) {
          // A cross-project specId lands here too: selectScoped never returned it,
          // so it is not-found rather than forbidden, and nothing is deleted.
          return blocked(
            `delete_scope blocked: ${input.specId ? `specId ${input.specId}` : `specNumber ${input.specNumber}`} not found in this project.`,
          );
        }

        const ownTasks = (await scoped.selectScoped(
          projecttasks,
          eq(projecttasks.specId, target.id),
        )) as Array<typeof projecttasks.$inferSelect>;
        const ownDocs = (await scoped.selectScoped(
          projectdocuments,
          eq(projectdocuments.specId, target.id),
        )) as Array<typeof projectdocuments.$inferSelect>;

        // Verified against pg_constraint 2026-09-23, because the task text named only
        // one of these. Four children are SET NULL, not one: projecttasks (deleted
        // explicitly below, as the web route does), plus auditexecutions, testplanitems
        // and testruns — which the web route also leaves behind. They are QA and audit
        // history, so nulling the link rather than destroying the record is the right
        // default; it is reported rather than left silent.
        const countOrphaned = async (table: string): Promise<number | null> => {
          try {
            const r = await scoped.raw.execute(
              sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)} WHERE specid = ${target.id}`,
            );
            const rows = (r as unknown as { rows?: Array<{ n: number }> }).rows;
            return rows?.[0]?.n ?? null;
          } catch {
            return null; // table absent in this deployment
          }
        };
        const willOrphan = {
          auditexecutions: await countOrphaned('auditexecutions'),
          testplanitems: await countOrphaned('testplanitems'),
          testruns: await countOrphaned('testruns'),
        };

        if ((ownTasks.length > 0 || ownDocs.length > 0) && !input.force) {
          return blocked(
            `delete_scope blocked: spec ${target.specNumber} still owns ${ownTasks.length} task(s) and ${ownDocs.length} document(s). Re-run with force:true to delete it and them.`,
          );
        }

        if (input.dryRun) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  blocked: false,
                  dryRun: true,
                  message: `Would delete spec ${target.specNumber} (${target.id}). Nothing was changed.`,
                  specNumber: target.specNumber,
                  wouldDelete: {
                    specId: target.id,
                    tasks: ownTasks.length,
                    documents: ownDocs.length,
                  },
                  wouldCascade: ['projectdocuments', 'scopeconversations', 'specificationphases', 'testplans'],
                  wouldOrphan: willOrphan,
                }),
              },
            ],
          };
        }

        // Order matters and is not cosmetic. `projecttasks.specid` is SET NULL, so
        // deleting the spec first detaches every task instead of removing it — the
        // row survives with a null specid and renders as unlinked work forever.
        // Delete the tasks, THEN the spec.
        await scoped.raw
          .delete(projecttasks)
          .where(and(eq(projecttasks.specId, target.id), eq(projecttasks.projectId, input.projectId)));

        await scoped.raw
          .delete(projectspecifications)
          .where(
            and(
              eq(projectspecifications.id, target.id),
              eq(projectspecifications.projectId, input.projectId),
            ),
          );

        await scoped.insertScoped(events, {
          projectId: input.projectId,
          type: 'document_updated',
          source: 'mcp-server',
          actor: 'delete_scope',
          rawContent: `Deleted spec ${target.specNumber} (${target.id}) with ${ownTasks.length} task(s) and ${ownDocs.length} document(s)`,
          metadata: {
            specNumber: target.specNumber,
            specId: target.id,
            deletedTasks: ownTasks.length,
            cascadedDocuments: ownDocs.length,
            orphaned: willOrphan,
            forced: input.force,
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                blocked: false,
                message: `Deleted spec ${target.specNumber} and ${ownTasks.length} task(s).`,
                specNumber: target.specNumber,
                deleted: { specId: target.id, tasks: ownTasks.length, documents: ownDocs.length },
                orphaned: willOrphan,
              }),
            },
          ],
        };
      }
      // [SCOPE 098 / T008] END

      case 'project.create_specs': {

        const input = CreateSpecsInputSchema.parse(args);
        const preflight = createSpecsPreflight(input.scopeContent);

        if (!preflight.isValid) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  blocked: true,
                  message: `create_specs blocked for scope ${input.specNumber}. Resolve the scope quality issues first.`,
                  blockingIssues: preflight.blockingIssues,
                  preflight,
                  spec: null,
                  documents: [],
                  tasks: [],
                  lifecycleGenerated: false,
                  projectLifecycleUpdated: false,
                  artifactFiles: [],
                  events: [],
                }),
              },
            ],
          };
        }

        // [SCOPE 061] Uniqueness guard — never a second spec row with the same specNumber in this
        // project. This is the check that stopped the duplicate scope-058 rows: create_specs used
        // to insert blindly. Application-level here; the matching DB unique index on
        // (projectid, specnumber) is added with the 058 dedup.
        //
        // MODIFIED-BY: [SCOPE 124 / T008] — the guard now UPDATES instead of refusing.
        // Refusing was correct about the duplicate and wrong about the remedy: a re-push is the
        // normal way to sync an edited spec, and answering it with "Duplicate specNumber 010" left
        // customers with no route to update a spec at all. Uniqueness is still absolute — one row
        // per (project, specNumber) — it is now reached by writing to the row that already owns the
        // number rather than by turning the caller away.
        const existingSpec = (await scoped.selectScoped(
          projectspecifications,
          eq(projectspecifications.specNumber, input.specNumber),
        )) as Array<typeof projectspecifications.$inferSelect>;
        const reusingSpec = existingSpec.length > 0;

        const results = {
          success: true,
          blocked: false,
          reused: reusingSpec,
          message: `create_specs completed for scope ${input.specNumber}.`,
          blockingIssues: [] as string[],
          preflight,
          spec: null as any,
          documents: [] as any[],
          tasks: [] as any[],
          // [SCOPE 124 / T008] Created-vs-updated is the evidence that a re-push did not duplicate.
          documentsCreated: 0,
          documentsUpdated: 0,
          tasksCreated: 0,
          tasksUpdated: 0,
          lifecycleGenerated: false,
          projectLifecycleUpdated: false,
          artifactFiles: [] as string[],
          events: [] as any[],
        };
        
        // Phase 0: Capture spec_pipeline_started event
        const insertedStartEvent = (await scoped.insertScoped(events, {
          projectId: input.projectId,
          type: 'spec_created',
          source: 'mcp-server',
          actor: 'create_specs',
          rawContent: `Starting createSpecs pipeline for ${input.specNumber} - ${input.featureName}`,
          metadata: { specNumber: input.specNumber, phase: input.phase },
        })) as Array<typeof events.$inferSelect>;
        const startEvent = insertedStartEvent[0];
        results.events.push({ id: startEvent.id, type: 'spec_pipeline_started' });

        // [SCOPE 124 / T008] BEGIN — write the spec row on identity, not blindly
        // (projectId, specNumber) is the identity, so a re-push updates the row that already holds
        // the number. `status` is deliberately NOT overwritten on update: the incoming `phase` is
        // whatever the caller's local files say, and letting a content sync rewind a spec from
        // `implementing` back to `planned` is how a board stops being believed. Stage transitions
        // belong to update_spec_status and to SCOPE-123, which owns per-scope progression.
        const phaseStatus =
          input.phase === 'scoping' ? 'draft' :
          input.phase === 'design' ? 'planned' :
          input.phase === 'implementation' ? 'implementing' :
          input.phase === 'qa' ? 'qa' :
          input.phase === 'human_testing' ? 'human_testing' :
          input.phase === 'beta' ? 'beta' :
          input.phase === 'released' ? 'released' : 'draft';

        let spec: typeof projectspecifications.$inferSelect;
        if (reusingSpec) {
          const updatedSpec = (await scoped.updateScoped(
            projectspecifications,
            {
              title: input.featureName,
              content: input.scopeContent,
              updatedAt: new Date(),
            },
            eq(projectspecifications.id, existingSpec[0].id),
          )) as Array<typeof projectspecifications.$inferSelect>;
          spec = updatedSpec[0] ?? { ...existingSpec[0], title: input.featureName, content: input.scopeContent };
        } else {
          const insertedSpec = (await scoped.insertScoped(projectspecifications, {
            projectId: input.projectId,
            specNumber: input.specNumber,
            title: input.featureName,
            content: input.scopeContent,
            status: phaseStatus,
          })) as Array<typeof projectspecifications.$inferSelect>;
          spec = insertedSpec[0];
        }
        // [SCOPE 124 / T008] END

        results.spec = {
          id: spec.id,
          projectId: spec.projectId,
          specNumber: spec.specNumber,
          title: spec.title,
          status: spec.status,
          createdAt: spec.createdAt.toISOString(),
        };
        
        // [SCOPE 124 / T008] BEGIN — upsertSpecDocument (a document's identity is doctype + title)
        /**
         * FR-005. create_specs inserted a fresh document row on every call, so a re-pushed spec
         * accumulated a parallel set — 975ada4a, and 115 excess rows across 83 (project, title,
         * doctype) groups in production when this was written.
         *
         * The match key is (projectId, doctype, title) with `specId IS NULL`, which is EXACTLY the
         * key `project.upsert_document` uses for project-level docs. That is not a coincidence to
         * be tidied up later: `dbpush`'s pushExistingSpec upserts these same rows through that tool
         * with no specId, so the two writers must agree or they build two parallel sets — the
         * failure BUG-2026-07-18 already fixed once by aligning the titles.
         *
         * For the same reason this does NOT start populating `specId` on these rows, even though
         * the column exists and would be the better identity. Setting it here would move the rows
         * out from under upsert_document's `specId IS NULL` filter and re-create the parallel set
         * for every consumer on the next dbpush. Migrating both writers together is its own change.
         */
        const upsertSpecDocument = async (
          title: string,
          content: string,
          doctype: string,
          tags: string[],
          kind: string,
        ): Promise<typeof projectdocuments.$inferSelect> => {
          const found = (await scoped.selectScoped(
            projectdocuments,
            and(
              eq(projectdocuments.doctype, doctype),
              eq(projectdocuments.title, title),
              isNull(projectdocuments.specId),
            ),
          )) as Array<typeof projectdocuments.$inferSelect>;

          let row: typeof projectdocuments.$inferSelect;
          if (found[0]) {
            const updated = (await scoped.updateScoped(
              projectdocuments,
              { content, tags, updatedAt: new Date() },
              eq(projectdocuments.id, found[0].id),
            )) as Array<typeof projectdocuments.$inferSelect>;
            row = updated[0] ?? { ...found[0], content, tags };
            results.documentsUpdated += 1;
          } else {
            const inserted = (await scoped.insertScoped(projectdocuments, {
              projectId: input.projectId,
              title,
              content,
              doctype,
              sourceEventId: startEvent.id,
              tags,
            })) as Array<typeof projectdocuments.$inferSelect>;
            row = inserted[0];
            results.documentsCreated += 1;
          }

          results.documents.push({ id: row.id, title: row.title, type: kind });
          return row;
        };

        // Titles and doctypes come from spec-persistence so the kit and this handler cannot drift
        // apart — see the cross-writer contract documented there.
        const specDocs = specDocumentSet({
          specNumber: input.specNumber,
          featureName: input.featureName,
          phase: input.phase,
          scopeContent: input.scopeContent,
        });

        let specDoc!: typeof projectdocuments.$inferSelect;
        for (const doc of specDocs) {
          const row = await upsertSpecDocument(doc.title, doc.content, doc.doctype, doc.tags, doc.kind);
          if (doc.kind === 'spec') {
            specDoc = row;
          }
        }
        // [SCOPE 124 / T008] END

        // Create tasks from spec
        const taskDefinitions = input.tasks || [];
        const createdTasks: Array<{ id: string; name: string; status: string; [key: string]: unknown }> = [];
        // [SCOPE 124 / T008] BEGIN — task identity is (specId, name)
        // A task's name is its key within its spec, so a re-push updates the row instead of adding
        // a second one with the same title. `status` is left alone on update for the same reason
        // the spec's is: the caller's local tasks file may be behind the board, and a content sync
        // must never move a task backwards. dbpush syncs status separately (syncTaskStatuses), and
        // project.update_task_status is the explicit route.
        const existingTasksForSpec = (await scoped.selectScoped(
          projecttasks,
          eq(projecttasks.specId, spec.id),
        )) as Array<typeof projecttasks.$inferSelect>;
        const taskPlan = partitionTasksByName(existingTasksForSpec, taskDefinitions);
        const plannedTasks = new Map<unknown, typeof projecttasks.$inferSelect | null>();
        for (const pair of taskPlan.updates) plannedTasks.set(pair.incoming, pair.existing);
        for (const fresh of taskPlan.creates) plannedTasks.set(fresh, null);
        if (taskPlan.duplicateTitles.length > 0) {
          logger.warn('create_specs received repeated task titles in one push', {
            specNumber: input.specNumber,
            duplicateTitles: taskPlan.duplicateTitles,
          });
        }

        for (const taskDef of taskDefinitions) {
          // Skip repeats within this same push — the first occurrence already handled the row.
          if (!plannedTasks.has(taskDef)) continue;
          const priorTask = plannedTasks.get(taskDef);
          let task: typeof projecttasks.$inferSelect;

          if (priorTask) {
            const currentDocIds = Array.isArray(priorTask.documentIds) ? priorTask.documentIds : [];
            const updatedTaskRow = (await scoped.updateScoped(
              projecttasks,
              {
                description: taskDef.description,
                priority: taskDef.priority,
                documentIds: [...new Set([...currentDocIds, specDoc.id])],
                updatedAt: new Date(),
              },
              eq(projecttasks.id, priorTask.id),
            )) as Array<typeof projecttasks.$inferSelect>;
            task = updatedTaskRow[0] ?? priorTask;
            results.tasksUpdated += 1;
          } else {
            const insertedTaskRow = (await scoped.insertScoped(projecttasks, {
              projectId: input.projectId,
              name: taskDef.title,
              description: taskDef.description,
              status: taskDef.status || 'todo',
              priority: taskDef.priority,
              sourceEventId: startEvent.id,
              specId: spec.id,
              documentIds: [specDoc.id],
            })) as Array<typeof projecttasks.$inferSelect>;
            task = insertedTaskRow[0];
            results.tasksCreated += 1;
          }
          // [SCOPE 124 / T008] END

          createdTasks.push(task);
          results.tasks.push({
            id: task.id,
            title: task.name,
            status: task.status,
          });
          
          // Link task to spec document
          const currentTaskIds = Array.isArray(specDoc.taskIds) ? specDoc.taskIds : [];
          await scoped.updateScoped(
            projectdocuments,
            {
              taskIds: [...new Set([...currentTaskIds, task.id])],
              updatedAt: new Date(),
            },
            eq(projectdocuments.id, specDoc.id),
          );
        }
        
        // Generate lifecycle if requested
        if (input.generateLifecycle) {
          const currentPhaseNum = input.phase === 'scoping' ? 0 :
                                  input.phase === 'design' ? 1 :
                                  input.phase === 'implementation' ? 2 :
                                  input.phase === 'qa' ? 3 :
                                  input.phase === 'human_testing' ? 4 :
                                  input.phase === 'beta' ? 5 :
                                  input.phase === 'released' ? 6 : 0;
          
          const progress = createdTasks.length > 0 
            ? Math.round((createdTasks.filter(t => t.status === 'done').length / createdTasks.length) * 100)
            : 0;
          
          // Generate lifecycle.json content
          const lifecycleData = generateSpecLifecycleJson(
            input.specNumber,
            input.featureName,
            currentPhaseNum,
            progress
          );
          
          // Create lifecycle document
          const lifecycleContent = JSON.stringify(lifecycleData, null, 2);

          // [SCOPE 124 / T008] Same identity rule as the spec and plan docs. This one duplicated
          // hardest in practice — 1196 lifecycle rows in production, six of them for one scope.
          await upsertSpecDocument(
            lifecycleDocumentTitle(input.featureName),
            lifecycleContent,
            'lifecycle',
            ['lifecycle', input.specNumber],
            'lifecycle',
          );

          // Generate and push project lifecycle
          const allSpecs = await getAllSpecsForLifecycle(input.projectId);
          // Add the new spec to the list
          allSpecs.push({
            specNumber: input.specNumber,
            featureName: input.featureName,
            currentPhase: currentPhaseNum,
            status: lifecycleData.status,
            progress,
          });
          
          const projectLifecycleContent = generateProjectLifecycleMarkdown(allSpecs);
          const lifecycleResult = await pushLifecycleToDb(
            input.projectId,
            projectLifecycleContent,
            'wxKanban Platform Development Lifecycle — Aggregated View',
            'specs/projectlifecycle.md'
          );
          
          results.lifecycleGenerated = true;
          results.projectLifecycleUpdated = lifecycleResult.created || !lifecycleResult.created;

          // [SCOPE 028 / Phase 12 — FR-021] DB-only: the client wrote the files.
          results.artifactFiles = [];
        }

        // [SCOPE 073 / T007] BEGIN — capture this scope's deps from its materialized content, then
        // regenerate the scope-flow doc (new known scope). Fail-open: never block create_specs.
        try {
          const sn = parseInt(input.specNumber, 10);
          if (!Number.isNaN(sn) && input.scopeContent) {
            const { dependsOnRaw, relatedRaw } = parseDepsFromContent(input.scopeContent);
            const edges = await captureScopeEdges(input.projectId, sn, dependsOnRaw, relatedRaw);
            logger.info('scopeflow.capture', { trigger: 'create_specs', projectId: input.projectId, scope: sn, edges });
          }
          await regenerateScopeFlow(input.projectId);
        } catch (sfErr) {
          logger.warn('scopeflow.regenerate.failed', { trigger: 'create_specs', projectId: input.projectId, error: (sfErr as Error).message });
        }
        // [SCOPE 073 / T007] END

        // [SCOPE 081 / T003] BEGIN — refresh the deterministic devplan doctype alongside
        // lifecycle/scopeflow. Own fail-open guard: a devplan failure never blocks create_specs.
        try {
          await regenerateDevplan(input.projectId);
        } catch (dpErr) {
          logger.warn('devplan.regenerate.failed', { trigger: 'create_specs', projectId: input.projectId, error: (dpErr as Error).message });
        }
        // [SCOPE 081 / T003] END

        // [SCOPE 123 / T019] BEGIN — createSpecs finishing is Design's last step (FR-011): a scope
        // with tasks moves to Implementation, so implement is permitted right after. Never blocks.
        await advanceScopeIds([spec.id], { actor: 'create_specs', trigger: 'create_specs' });
        // [SCOPE 123 / T019] END

        // [SCOPE 124 / T008] Report what a re-push actually did. "created 6 documents" on a spec
        // that already had them is how duplication stayed invisible for months.
        results.message = reusingSpec
          ? `create_specs updated existing scope ${input.specNumber} in place: ` +
            `${results.documentsUpdated} document(s) updated, ${results.documentsCreated} created; ` +
            `${results.tasksUpdated} task(s) updated, ${results.tasksCreated} created. ` +
            `Spec and task statuses were left unchanged.`
          : `create_specs completed for scope ${input.specNumber}.`;

        // Capture completion event
        const insertedCompleteEvent = (await scoped.insertScoped(events, {
          projectId: input.projectId,
          type: 'spec_created',
          source: 'mcp-server',
          actor: 'create_specs',
          rawContent: reusingSpec
            ? `createSpecs pipeline complete for ${input.specNumber} — existing scope updated in place`
            : `createSpecs pipeline complete for ${input.specNumber} — ${results.tasks.length} tasks created`,
          metadata: {
            specNumber: input.specNumber,
            reused: reusingSpec,
            taskCount: results.tasks.length,
            documentCount: results.documents.length,
          },
        })) as Array<typeof events.$inferSelect>;
        const completeEvent = insertedCompleteEvent[0];
        results.events.push({ id: completeEvent.id, type: 'spec_pipeline_complete' });

        logger.info('createSpecs pipeline complete', {
          specNumber: input.specNumber,
          specId: spec.id,
          reused: reusingSpec,
          taskCount: results.tasks.length,
          documentCount: results.documents.length,
          documentsCreated: results.documentsCreated,
          documentsUpdated: results.documentsUpdated,
          tasksCreated: results.tasksCreated,
          tasksUpdated: results.tasksUpdated,
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results),
            },
          ],
        };
      }
      
      case 'project.kit_status': {
        // Re-enabled minimal handler. The original depended on getKitStatus()
        // which is no longer exported from project-kit.js, so the case was
        // commented out — but the tool stayed advertised in ListTools + the
        // permission matrix. The kit's init.mjs / upgrade-kit.mjs call this tool
        // as the token-validation sentinel, so the missing handler made every
        // `/call project.kit_status` fall through to "Unknown tool" (-32601) →
        // HTTP 500 → kit install/upgrade abort. Kit-generation state (version,
        // download count, generatedAt) lives in the wxKanban app, not the MCP,
        // so from here this is a token-scoped reachability check: a valid,
        // project-scoped token that reaches the server gets a well-formed 200.
        const input = GetKitStatusInputSchema.parse(args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                projectId: input.projectId,
                // [SCOPE 124 / T021] `ready` reports reachability, NOT kit state — kit generation
                // lives in the wxKanban app and this server does not know it. The value is left
                // alone because kit install and upgrade use this tool as their token sentinel and
                // may branch on it; changing it needs those installers checked first.
                status: 'ready',
                statusMeaning: 'Token reached the server and is scoped to this project. It is not a statement about the kit: kitVersion, generatedAt and downloadCount are null because this server does not hold them.',
                primaryAI: null,
                kitVersion: null,
                downloadUrl: generateDownloadUrl(input.projectId),
                generatedAt: null,
                downloadCount: null,
              }),
            },
          ],
        };
      }
      
      case 'project.download_kit': {
        const input = DownloadKitInputSchema.parse(args);
        const downloadUrl = generateDownloadUrl(input.projectId);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                projectId: input.projectId,
                downloadUrl,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
              }),
            },
          ],
        };
      }
      
      case 'project.regenerate_kit': {
        const input = RegenerateKitInputSchema.parse(args);
        const result = await regenerateKit(input.projectId);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      }
      
      case 'project.import_project': {
        const input = ImportProjectInputSchema.parse(args);
        const normalizedPhaseAssignments = input.phaseAssignments
          ? Object.fromEntries(
              Object.entries(input.phaseAssignments).map(([k, v]) => [String(k), String(v)])
            )
          : undefined;
        const result = await importProject({
          name: input.name,
          description: input.description,
          primaryAI: input.primaryAI,
          localDirectoryPath: input.localDirectoryPath,
          generateKit: input.generateKit,
          phaseAssignments: normalizedPhaseAssignments,
          createdById: auth.userId || 'unknown',
          companyId: input.companyId,
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      }
      
      case 'project.create_api_token': {
        const input = CreateApiTokenInputSchema.parse(args);
        
        if (!auth.userId) {
          throw new McpError(ErrorCode.InvalidRequest, 'User ID required for token creation');
        }
        
        // Repaired 2026-09-23. Company and project both come from the caller's own
        // token scope when not supplied: mcpapitokens requires both, and 'default-company'
        // was never a real id — it would have failed the uuid FK even had the table existed.
        const companyId = input.companyId || scoped.scope.customerId;
        const tokenProjectId = input.projectId || scoped.scope.projectId;

        if (!companyId || !tokenProjectId) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'create_api_token needs a company and a project. Both are normally resolved from the calling token; supply companyId/projectId explicitly when calling under dev-bypass.',
          );
        }

        const result = await createApiToken(
          auth.userId,
          companyId,
          tokenProjectId,
          input.label
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                token: result.token,
                tokenPrefix: result.record.tokenprefix,
                label: result.record.label,
                createdAt: result.record.createdat.toISOString(),
                message: 'Store this token securely - it will not be shown again',
              }),
            },
          ],
        };
      }
      
      case 'project.list_api_tokens': {
        // Validate input schema (even if empty)
        ListApiTokensInputSchema.parse(args);
        
        if (!auth.userId) {
          throw new McpError(ErrorCode.InvalidRequest, 'User ID required');
        }
        
        // Scoped to the caller's project when the token carries one, so a listing
        // cannot span projects the caller did not ask about.
        const tokens = await listApiTokens(auth.userId, scoped.scope.projectId ?? undefined);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                tokens: tokens.map(t => ({
                  id: t.id,
                  tokenPrefix: t.tokenPrefix,
                  label: t.label,
                  // Repaired 2026-09-23: names the agent a token is bound to, if any.
                  // Never the binding itself — that embeds the token's hash.
                  agentName: t.agentName ?? null,
                  createdAt: t.createdAt,
                  revokedAt: t.revokedAt,
                })),
                count: tokens.length,
              }),
            },
          ],
        };
      }
      
      case 'project.revoke_api_token': {
        const input = RevokeApiTokenInputSchema.parse(args);
        
        if (!auth.userId) {
          throw new McpError(ErrorCode.InvalidRequest, 'User ID required');
        }
        
        const revoked = await revokeApiToken(input.tokenId, auth.userId);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: revoked,
                message: revoked ? 'Token revoked successfully' : 'Token not found or already revoked',
              }),
            },
          ],
        };
      }
      
      case 'project.mcp_health': {
        const health = getMcpHealthState();
        // [SCOPE 097 / T003] Under a token, report the CALLER'S project (resolved
        // from the token) rather than the server container's startup file default,
        // so the readout matches where a same-token write actually lands (FR-002).
        // Dev-bypass (no token) keeps the unchanged startup file/env readout.
        let projectContext = health.projectContext;
        let project = health.project;
        const healthTokenProjectId =
          mcpScope?.authMode === 'token' ? mcpScope.projectId : null;
        if (healthTokenProjectId) {
          projectContext = {
            projectId: healthTokenProjectId,
            source: 'token',
            projectFilePath: null,
          };
          project = await loadProjectSummary(healthTokenProjectId);
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                service: 'mcp-project-hub',
                // [SCOPE 133 / T017] was '0.1.0' — this is the surface anyone probing
                // health reads, so it is exactly the one that must not be a literal.
                version: WXKANBAN_VERSION,
                status: health.status,
                dbConnected: health.dbConnected,
                startupTime: health.startupTime,
                projectContext,
                project,
                lastUpdated: health.lastUpdated,
              }),
            },
          ],
        };
      }

      case 'project.get_entitlement': {
        // Phase 1B — issue a short-lived signed entitlement token the kit caches
        // to fail-close local-only commands offline. Entitlement-exempt so a
        // lapsed customer can still learn their state.
        const customerId = mcpScope?.customerId ?? null;
        const ent = await checkEntitlement(customerId);
        const token = customerId ? signEntitlementToken(customerId, ent.status) : null;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                allowed: ent.allowed,
                status: ent.status,
                code: ent.code,
                // enforced=false → server has no signing key yet; kit treats as no-op.
                enforced: token !== null,
                token,
              }),
            },
          ],
        };
      }

      case 'project.get_command_prompt': {
        // Phase 2 — server-delivered premium methodology. The body lives only on
        // the server (src/prompts/); the shipped command/skill is a thin stub.
        // Entitlement-gated (NOT exempt) so only active customers receive it.
        const command = String((args as Record<string, unknown>)?.command ?? '').trim();
        const prompt = command ? getCommandPrompt(command) : null;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                command,
                found: prompt !== null,
                prompt: prompt ?? null,
              }),
            },
          ],
        };
      }

      case 'project.help': {
        const mode = resolveHelpMode(args);
        return {
          content: [
            {
              type: 'text',
              text: mode === 'all' ? MCP_HELP_TEXT : renderHelpText(mode),
            },
          ],
        };
      }
      
      case 'project.implement': {
        const input = ImplementInputSchema.parse(args);

        // Spec 028 / T010 — selectScoped auto-adds projectid = scope.projectId
        // to the where clause. The pre-028 contextProject conditional that
        // narrowed by projectId is now redundant (scope wins).
        const specCandidates = (await scoped.selectScoped(
          projectspecifications,
          eq(projectspecifications.specNumber, input.specNumber),
        )) as Array<typeof projectspecifications.$inferSelect>;
        specCandidates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        const specRecord = specCandidates[0];
        const blockers: string[] = [];
        const warnings: string[] = [];

        if (!specRecord) {
          blockers.push(`No projectspecifications record found for spec ${input.specNumber}.`);
        }

        // Tasks are sourced from `projecttasks` (populated by create_specs), NOT by
        // parsing tasks.md off the server filesystem. The hosted MCP cannot see a local
        // client's specs/ directory, so the previous disk read always yielded zero tasks
        // and — together with a hard-coded `artifactDir = undefined` — blocked every
        // spec unconditionally, with force overrides explicitly disallowed.
        let parsedTasks: ParsedImplementationTask[] = [];
        if (specRecord) {
          const specTaskRows = (await scoped.selectScoped(
            projecttasks,
            eq(projecttasks.specId, specRecord.id),
          )) as Array<typeof projecttasks.$inferSelect>;
          parsedTasks = specTaskRows.map((row, index) => ({
            taskId: `T${String(index + 1).padStart(3, '0')}`,
            name: row.name,
            description: row.description ?? '',
            status: row.status as ParsedImplementationTask['status'],
            priority: row.priority as ParsedImplementationTask['priority'],
          }));
        }

        if (input.scopeCheck && parsedTasks.length === 0) {
          blockers.push(`Scope-first gate failed: spec ${input.specNumber} has no linked tasks. Run createSpecs for this spec first.`);
        }

        if (blockers.length > 0) {
          // Force overrides are NOT permitted — enforcement is absolute.
          // If force was requested, log the escalation but still block.
          if (input.force && input.reason) {
            warnings.push(`ESCALATION LOGGED: Override requested with reason: "${input.reason}" — but enforcement is absolute. Resolve prerequisites and retry.`);
          }
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Implementation blocked for spec ${input.specNumber}: ${blockers.join(' ')}${input.force ? ' (force override is not permitted — escalation logged for admin review)' : ''}`
          );
        }

        if (!specRecord) {
          throw new McpError(ErrorCode.InvalidRequest, `Cannot implement spec ${input.specNumber} without a spec record.`);
        }

        const insertedStartEventImpl = (await scoped.insertScoped(events, {
          projectId: specRecord.projectId,
          type: 'task_created',
          source: 'mcp-server',
          actor: 'implement',
          rawContent: `Starting implementation for spec ${input.specNumber}`,
          metadata: {
            specId: specRecord.id,
            specNumber: input.specNumber,
            scopeCheck: input.scopeCheck,
            force: input.force,
            reason: input.reason,
          },
        })) as Array<typeof events.$inferSelect>;
        const startEvent = insertedStartEventImpl[0];

        const existingTasks = (await scoped.selectScoped(
          projecttasks,
          eq(projecttasks.specId, specRecord.id),
        )) as Array<typeof projecttasks.$inferSelect>;
        const existingByName = new Map(existingTasks.map((t) => [t.name, t]));

        let createdTasks = 0;
        let updatedTasks = 0;
        const synchronizedTaskIds: string[] = [];

        for (const task of parsedTasks) {
          const existing = existingByName.get(task.name);
          if (existing) {
            await scoped.updateScoped(
              projecttasks,
              {
                description: task.description || existing.description,
                status: task.status,
                priority: task.priority,
                sourceEventId: startEvent.id,
                updatedAt: new Date(),
              },
              eq(projecttasks.id, existing.id),
            );
            updatedTasks += 1;
            synchronizedTaskIds.push(existing.id);
          } else {
            const insertedTaskImpl = (await scoped.insertScoped(projecttasks, {
              projectId: specRecord.projectId,
              specId: specRecord.id,
              name: task.name,
              description: task.description || null,
              status: task.status,
              priority: task.priority,
              sourceEventId: startEvent.id,
            })) as Array<typeof projecttasks.$inferSelect>;
            const inserted = insertedTaskImpl[0];
            createdTasks += 1;
            synchronizedTaskIds.push(inserted.id);
          }
        }

        await scoped.updateScoped(
          projectspecifications,
          {
            status: 'implementing',
            updatedAt: new Date(),
          },
          eq(projectspecifications.id, specRecord.id),
        );

        const lifecycleDocs = (await scoped.selectScoped(
          projectdocuments,
          eq(projectdocuments.doctype, 'lifecycle'),
        )) as Array<typeof projectdocuments.$inferSelect>;

        const lifecycleDoc = lifecycleDocs.find((doc) => doc.tags && JSON.stringify(doc.tags).includes(input.specNumber));
        if (lifecycleDoc) {
          try {
            const parsed = JSON.parse(lifecycleDoc.content) as Record<string, unknown>;
            parsed.currentPhase = 2;
            parsed.status = 'implementing';
            parsed.updatedAt = new Date().toISOString();
            await scoped.updateScoped(
              projectdocuments,
              {
                content: JSON.stringify(parsed, null, 2),
                updatedAt: new Date(),
              },
              eq(projectdocuments.id, lifecycleDoc.id),
            );
          } catch {
            warnings.push('Lifecycle JSON could not be parsed; skipped lifecycle document phase update.');
          }
        }

        const completedCount = parsedTasks.filter((t) => t.status === 'done').length;
        const progress = parsedTasks.length > 0 ? Math.round((completedCount / parsedTasks.length) * 100) : 0;
        const allSpecs = await getAllSpecsForLifecycle(specRecord.projectId);
        const mergedSpecs = allSpecs.filter((s) => s.specNumber !== input.specNumber);
        mergedSpecs.push({
          specNumber: input.specNumber,
          featureName: specRecord.title,
          currentPhase: 2,
          status: 'implementing',
          progress,
        });

        const projectLifecycleContent = generateProjectLifecycleMarkdown(mergedSpecs);
        await pushLifecycleToDb(
          specRecord.projectId,
          projectLifecycleContent,
          'wxKanban Platform Development Lifecycle — Aggregated View',
          'specs/projectlifecycle.md'
        );

        // [SCOPE 073 / T007] BEGIN — regenerate the scope-flow doc on implement/task-sync, fail-open
        try {
          await regenerateScopeFlow(specRecord.projectId);
        } catch (sfErr) {
          logger.warn('scopeflow.regenerate.failed', { trigger: 'implement', projectId: specRecord.projectId, error: (sfErr as Error).message });
        }
        // [SCOPE 073 / T007] END

        // [SCOPE 081 / T003] BEGIN — refresh the deterministic devplan doctype on implement/task-sync, fail-open
        try {
          await regenerateDevplan(specRecord.projectId);
        } catch (dpErr) {
          logger.warn('devplan.regenerate.failed', { trigger: 'implement', projectId: specRecord.projectId, error: (dpErr as Error).message });
        }
        // [SCOPE 081 / T003] END

        const insertedImplComplete = (await scoped.insertScoped(events, {
          projectId: specRecord.projectId,
          type: 'task_completed',
          source: 'mcp-server',
          actor: 'implement',
          rawContent: `Implementation sync complete for spec ${input.specNumber}`,
          metadata: {
            specId: specRecord.id,
            specNumber: input.specNumber,
            createdTasks,
            updatedTasks,
            parsedTaskCount: parsedTasks.length,
            progress,
          },
        })) as Array<typeof events.$inferSelect>;
        const completeEvent = insertedImplComplete[0];

        logger.info('implement task-sync completed', {
          specNumber: input.specNumber,
          projectId: specRecord.projectId,
          createdTasks,
          updatedTasks,
          parsedTaskCount: parsedTasks.length,
          progress,
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                // [SCOPE 124 / T021] "wxAI-implement completed" read as though an implementation
                // ran. This call syncs task rows, records two events and moves the spec status —
                // it reads no tasks.md and writes no code, deliberately (see the task-source note
                // above). The message says what it did.
                message: `Spec ${input.specNumber} moved to implementing — ${createdTasks} task(s) created and ${updatedTasks} updated from this project's records. No files were read or written by this call; run the kit's implement command locally for the code work.`,
                specNumber: input.specNumber,
                specId: specRecord.id,
                projectId: specRecord.projectId,
                scopeCheck: input.scopeCheck,
                force: input.force,
                reason: input.reason,
                // [SCOPE 124 / T021] The four steps this handler actually performs, replacing a
                // six-phase list that included setup, checklist validation and completion
                // validation — none of which run here.
                phases: [
                  'Scope-first gate: spec has linked tasks',
                  'Task sync from projecttasks',
                  'Spec status set to implementing',
                  'Lifecycle progress recalculated',
                ],
                status: 'implementing',
                taskSync: {
                  parsedTaskCount: parsedTasks.length,
                  createdTasks,
                  updatedTasks,
                  synchronizedTaskIds,
                  taskSource: 'projecttasks',
                },
                lifecycle: {
                  currentPhase: 2,
                  status: 'implementing',
                  progress,
                },
                events: {
                  startEventId: startEvent.id,
                  completeEventId: completeEvent.id,
                },
                warnings,
              }),
            },
          ],
        };
      }
      
      case 'project.analyze': {
        const input = AnalyzeInputSchema.parse(args);

        // [SCOPE 124 / T021] This answered `success: true` and "wxAI-analyze completed" with an
        // analysis it never performed — zeros and a critical finding about a directory missing from
        // OUR container. spec.md, plan.md and tasks.md live in the caller's workspace, which this
        // host cannot see, so there is no analysis to give and inventing one is worse than none.
        logger.info('wxAI-analyze unavailable on the hosted server', { specNumber: input.specNumber });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                status: 'unavailable',
                specNumber: input.specNumber,
                message: `wxAI-analyze cannot run here. Cross-artifact analysis reads spec.md, plan.md and tasks.md, and those live in your workspace — this server has no access to them. Nothing was analyzed for spec ${input.specNumber}, and no finding is implied about it either way.`,
                analysis: null,
                findings: [],
                artifacts: {},
                nextSteps: [
                  'Run the analysis where the artifacts are: the analyzescope / analyzecode commands in the kit, locally.',
                  'For what this project has actually stored, use project.cockpit_summary or project.list_open_items.',
                  'To judge a scope document before it is pushed, call project.validatescope with scopeContent.',
                ],
              }),
            },
          ],
        };
      }      
      case 'project.session_start': {
        const input = SessionStartInputSchema.parse(args);

        // [SCOPE 124 / T021] This once returned `success: true` and four invented facts —
        // projectType 'CONSUMER', governance 1.2.0 upToDate, 0 unlinked TODOs, sessionReady
        // true — with a `note` admitting it was a placeholder underneath them. None of those
        // checks was ever performed. T021 gutted it to an honest refusal.
        // [SCOPE 133] rebuilds it as a real, agent-gated tool. T021's rule survives intact
        // and governs everything below: every field is measured here or explicitly null,
        // and no literal stands in for a measurement.

        // ── [SCOPE 133 / T004,T005] agent gate ───────────────────────────────────
        // Identity comes from the token, never from the caller. The binding is
        // `NAME:<sha256-of-token>`; `tokenhash` already IS that sha256, so the
        // expected value is reconstructed without the raw token ever being needed.
        const refuse = (reason: string, message: string) => {
          didDeny = true;
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  status: 'refused',
                  reason,
                  message,
                  sessionId: null,
                  projectId: null,
                  projectName: null,
                  status_block: null,
                }),
              },
            ],
          };
        };

        const tokenId = scoped.scope.tokenId;
        if (!tokenId) {
          return refuse(
            'no_token',
            'This tool identifies its caller by token binding, and no token was presented. It is not available under dev-bypass.',
          );
        }
        if (!input.agentName) {
          return refuse(
            'no_agent_name',
            'agentName is required: it is matched against the binding recorded on the presented token.',
          );
        }

        const tokenRows = (await scoped.raw
          .select({ binding: mcpapitokens.clientbinding, hash: mcpapitokens.tokenhash })
          .from(mcpapitokens)
          .where(eq(mcpapitokens.id, tokenId))
          .limit(1)) as Array<{ binding: string | null; hash: string }>;
        const tokenRow = tokenRows[0];

        if (!tokenRow) {
          return refuse('token_not_found', 'The presented token could not be read.');
        }
        if (!tokenRow.binding) {
          return refuse(
            'unbound_token',
            'This token carries no client binding, so it is not an agent token. It continues to work normally on every other tool.',
          );
        }
        // Exact match, as typed — a casing difference is a different agent.
        if (tokenRow.binding !== `${input.agentName}:${tokenRow.hash}`) {
          const sep = tokenRow.binding.indexOf(':');
          const boundName = sep > 0 ? tokenRow.binding.slice(0, sep) : '';
          const nameMatches = boundName === input.agentName;
          // Name the half that failed; never disclose the stored binding or hash.
          return refuse(
            nameMatches ? 'binding_token_mismatch' : 'binding_name_mismatch',
            nameMatches
              ? "The agent name matches this token's binding, but the token half does not. The binding was issued against a different token."
              : `This token is not bound to "${input.agentName}".`,
          );
        }

        // ── [SCOPE 133 / T007,T010] session identity ─────────────────────────────
        // Minted here, never accepted from the caller. A carried id is recorded as a
        // correlation label only: the server holds no session state and validates nothing.
        const sessionId = randomUUID();
        const carriedSessionId = input.sessionId ?? null;

        // ── [SCOPE 133 / T011,T012] project identity from the token ──────────────
        const sessionProjectId = scoped.scope.projectId;
        const sessionProject = sessionProjectId ? await loadProjectSummary(sessionProjectId) : null;

        // ── [SCOPE 133 / T014,T015] status via the cockpit-summary builders ──────
        // One status path, not two. On failure say so rather than return an empty
        // summary that reads as "nothing outstanding".
        let statusBlock: unknown = null;
        let statusError: string | null = null;
        try {
          const [specsRaw, tasksRaw] = (await Promise.all([
            scoped.selectScoped(projectspecifications),
            scoped.selectScoped(projecttasks),
          ])) as [
            Array<typeof projectspecifications.$inferSelect>,
            Array<typeof projecttasks.$inferSelect>,
          ];
          const liveSpecs = specsRaw.filter((s) => s.status !== 'archived');
          // [SCOPE 103 / T004] drop archived scopes' tasks too, or they read as unlinked
          const archivedIds = new Set(specsRaw.filter((s) => s.status === 'archived').map((s) => s.id));
          const liveTasks = tasksRaw.filter((t) => !t.specId || !archivedIds.has(t.specId));
          const summary = buildCockpitSummary(liveSpecs, liveTasks, sessionProjectId ?? '');
          statusBlock = input.fullStatus
            ? summary
            : {
                form: 'counts',
                scopeCount: summary.scopes.length,
                remainingTotal: summary.scopes.reduce((n, s) => n + s.remainingCount, 0),
                unlinkedTaskCount: summary.unlinkedTasks.length,
                activeScopes: summary.scopes
                  .filter((s) => s.remainingCount > 0)
                  .slice(0, 10)
                  .map((s) => ({
                    specNumber: s.specNumber,
                    title: s.title,
                    remainingCount: s.remainingCount,
                  })),
                note: 'Counts only. Pass fullStatus:true for every scope with its incomplete tasks.',
              };
        } catch (err) {
          statusError = err instanceof Error ? err.message : 'status could not be read';
          logger.warn('session_start: status block unavailable', { err });
        }

        // ── [SCOPE 133 / T009] record the session, correlated by metadata.sessionId ─
        let sessionEventId: string | null = null;
        if (sessionProjectId) {
          try {
            const insertedSession = (await scoped.insertScoped(events, {
              projectId: sessionProjectId,
              type: 'agent_session_start',
              source: 'mcp',
              actor: input.agentName,
              rawContent: `Session start for ${input.agentName}`,
              metadata: {
                sessionId,
                carriedSessionId,
                agentName: input.agentName,
                // Reported by the client and NOT verified — stored under a name that
                // says so, so a later reader cannot mistake it for a checked fact.
                repoReported: input.repoName ?? null,
                scopeNumber: input.scopeNumber ?? null,
              },
            })) as Array<typeof events.$inferSelect>;
            sessionEventId = insertedSession[0]?.id ?? null;
          } catch (err) {
            logger.warn('session_start: event not recorded', { err });
          }
        }

        logger.info('agent session start', {
          agentName: input.agentName,
          sessionId,
          projectId: sessionProjectId,
          repoReported: input.repoName ?? null,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                sessionId,
                carriedSessionId,
                agentName: input.agentName,
                // Authoritative — resolved from the token, not from arguments.
                projectId: sessionProjectId ?? null,
                projectName: sessionProject?.name ?? null,
                currentPhase: sessionProject?.currentPhase ?? null,
                // NOT authoritative. Named and flagged so it cannot read as verified.
                repoReported: input.repoName ?? null,
                repoVerified: false,
                version: WXKANBAN_VERSION,
                status: statusBlock,
                statusError,
                eventId: sessionEventId,
                scopeNumber: input.scopeNumber ?? null,
                // What this host genuinely cannot check, stated as unchecked rather
                // than answered. [SCOPE 124 / T021]'s rule, kept.
                governance: null,
                todos: null,
                notChecked: [
                  'governance version — reads the local workspace',
                  'unlinked TODO scan — reads the local workspace',
                  'repoReported — a client claim, never verified by this server',
                ],
              }),
            },
          ],
        };
      }
      case 'project.buildscope': {
        const input = BuildScopeInputSchema.parse(args);

        // Use project-kit buildScope function
        const result = await buildScope({
          featureDescription: input.featureDescription,
          projectId: input.projectId, // [SCOPE 089] per-project DB numbering (was global-filesystem → every new project got 092)
          quick: input.quick,
          templateOnly: input.templateOnly,
          editSpecNumber: input.editSpecNumber,
          primaryActor: input.primaryActor,
          secondaryActors: input.secondaryActors,
          businessProblem: input.businessProblem,
          successMetrics: input.successMetrics,
          scopeBoundary: input.scopeBoundary,
          outOfScope: input.outOfScope,
          integrationContext: input.integrationContext,
          constraintsAndRisks: input.constraintsAndRisks,
          // [SCOPE 135 / T006] FR-009 — the author's requirements and Amendment A's inputs.
          functionalRequirements: input.functionalRequirements,
          userScenarios: input.userScenarios,
          dataRequirements: input.dataRequirements,
          apiRoutes: input.apiRoutes,
          frontendComponents: input.frontendComponents,
          keyEntities: input.keyEntities,
          currentScopeContent: input.currentScopeContent,
          localSpecNumbers: input.localSpecNumbers,
          title: input.title,
          edits: input.edits, // [SCOPE 135 / T016]
          amendment: input.amendment,
          reason: input.reason, // [SCOPE 135 / T020]
          unattended: input.unattended,
        });

        // [SCOPE 077 / FR-008] BEGIN — orchestrator in-chat reuse check at buildscope authoring
        // Run the deterministic SCOPE-074 capability search on the authored feature
        // description and surface any overlap inline in the buildscope response, so the
        // developer sees "has the company already built this?" while still authoring.
        // Warn-only, fail-open, deterministic (no LLM in the MCP) — reuses the same
        // searchCapabilities() path as project.search_capabilities.
        const buildscopeResult: Record<string, unknown> = { ...result };
        try {
          const reuseProjectId = scoped.scope.projectId;
          const reuseQuery = input.featureDescription?.trim();
          if (reuseProjectId && reuseQuery) {
            // Cosine-similarity floor + result cap for "possible overlap". Env-tunable
            // (REUSE_MIN_SCORE / REUSE_TOP_K) so the noise/recall tradeoff can be dialed
            // on the hosted MCP without a redeploy. Default floor raised 0.6 → 0.72:
            // Gemini embeddings score loosely-related text ~0.6, so 0.6 surfaced noise.
            const envMin = Number(process.env.REUSE_MIN_SCORE);
            const REUSE_MIN_SCORE = Number.isFinite(envMin) && envMin >= 0 && envMin <= 1 ? envMin : 0.72;
            const envK = Number(process.env.REUSE_TOP_K);
            const REUSE_TOP_K = Number.isFinite(envK) && envK > 0 ? Math.floor(envK) : 5;
            const rawMatches = await searchCapabilities(reuseProjectId, reuseQuery, {
              topK: REUSE_TOP_K,
            });
            // When editing an existing scope, exclude its own capabilities from the result.
            const editingRef = input.editSpecNumber
              ? String(input.editSpecNumber).replace(/\D/g, '')
              : null;
            const reuseMatches = rawMatches
              .filter((m) => m.score >= REUSE_MIN_SCORE)
              .filter((m) => !editingRef || m.sourceRef !== editingRef)
              .map((m) => ({
                owner: m.owner,
                name: m.name,
                capabilityType: m.capabilityType,
                score: Math.round(m.score * 1000) / 1000,
              }));
            if (reuseMatches.length > 0) {
              buildscopeResult.reuseMatches = reuseMatches;
              buildscopeResult.reuseWarning =
                `⚠️ Possible reuse — this feature overlaps existing work: ` +
                reuseMatches.map((m) => `${m.owner} (${m.name})`).join(', ') +
                `. Review whether to reuse or extend before adding a new scope.`;
            }
          }
        } catch (err) {
          // Fail-open: a reuse-search failure must never block or delay authoring.
          logger.warn('buildscope.reuse_check_failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        // [SCOPE 077 / FR-008] END

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(buildscopeResult),
            },
          ],
        };
      }
      
      case 'project.validatescope': {
        const input = ValidateScopeInputSchema.parse(args);
        
        // Use project-kit validateScope function
        const result = await validateScope({
          specNumber: input.specNumber,
          // [SCOPE 124 / T019] The caller's own document, sent rather than read off a path.
          scopeContent: input.scopeContent,
          filePath: input.filePath,
          projectId: input.projectId,
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      }
      
      case 'project.submit_proposal': {
        const input = SubmitProposalInputSchema.parse(args);

        // Spec 028 / T010 — companyid + projectid both filled from the
        // resolved scope. The pre-028 implementation passed `input.projectId`
        // into the companyid column (mojibake); fixed here.
        const insertedProposal = (await scoped.insertScoped(projectproposals, {
          companyid: scoped.scope.customerId ?? input.projectId,
          projectid: input.projectId,
          title: input.title,
          description: input.description || null,
          priority: input.priority || 'medium',
          estimatedeffort: input.estimatedEffort || null,
          status: 'pending',
          source: input.source || 'AI Agent',
          proposeddate: new Date(),
          createdbyid: auth.userId || 'mcp-agent',
        })) as Array<typeof projectproposals.$inferSelect>;
        const proposal = insertedProposal[0];

        // Log event
        await scoped.insertScoped(events, {
          projectId: input.projectId,
          type: 'proposal_submitted',
          source: 'mcp-server',
          actor: input.source || 'AI Agent',
          rawContent: `Project proposal submitted: "${input.title}"`,
          metadata: {
            proposalId: proposal.id,
            title: input.title,
            priority: input.priority || 'medium',
          },
        });

        logger.info('proposal.submitted', { proposalId: proposal.id, title: input.title });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                proposalId: proposal.id,
                title: proposal.title,
                status: proposal.status,
              }),
            },
          ],
        };
      }

      case 'project.get_audit_config': {
        const input = z.object({ projectId: z.string().uuid() }).parse(args);
        const config = await resolveAuditConfig(input.projectId);
        const activeFrameworks = activeFrameworksOf(config);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              projectId: input.projectId,
              configured: config !== null,
              soc2enabled: config?.soc2enabled ?? false,
              hipaaenabled: config?.hipaaenabled ?? false,
              hitrustenabled: config?.hitrustenabled ?? false,
              gdprenabled: config?.gdprenabled ?? false,
              nistssdfenabled: config?.nistssdfenabled ?? false,
              iso27001enabled: config?.iso27001enabled ?? false,
              activeFrameworks,
              complianceActive: activeFrameworks.length > 0,
            }),
          }],
        };
      }

      // [SCOPE 112 / T009] BEGIN — Amendment A. Compliance rules are served from the
      // database, not shipped as files into the consumer's repository. The shipped
      // _wxAI/rules/compliance-context.md is a thin stub that calls this, the same
      // pattern project.get_command_prompt uses for server-owned methodology.
      case 'project.get_compliance_context': {
        const input = ComplianceContextInputSchema.parse(args);
        const config = await resolveAuditConfig(input.projectId);
        const activeFrameworks = activeFrameworksOf(config);

        if (activeFrameworks.length === 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                projectId: input.projectId,
                complianceActive: false,
                activeFrameworks: [],
                frameworks: [],
                guidance: 'No compliance frameworks are enabled for this project. Skip all compliance steps.',
              }),
            }],
          };
        }

        const frameworks = await Promise.all(
          activeFrameworks.map(async (framework) => {
            const [doc] = await scoped.raw
              .select()
              .from(wxkanbandocuments)
              .where(and(
                eq(wxkanbandocuments.framework, framework),
                eq(wxkanbandocuments.documenttype, 'compliance_framework'),
                eq(wxkanbandocuments.status, 'active'),
              ))
              // Several rows can share a framework while stale seeds survive; the
              // longest active document is the real ruleset. Ordering by length
              // rather than date keeps a 22-byte test row from winning.
              .orderBy(desc(sql`length(coalesce(${wxkanbandocuments.filecontent}, ''))`))
              .limit(1);

            const base = {
              framework,
              documentFound: Boolean(doc),
              version: doc?.version ?? null,
              filehash: doc?.filehash ?? null,
            };

            if (input.mode === 'full') {
              return { ...base, mode: 'full' as const, content: doc?.filecontent ?? null };
            }

            const controls = await selectComplianceControls(scoped, framework, input);
            return {
              ...base,
              mode: 'summary' as const,
              phase: input.phase ?? null,
              controlCount: controls.length,
              controls,
            };
          }),
        );

        // A framework can be enabled with no document behind it — that is a real
        // misconfiguration, and the caller is told rather than left to infer it from
        // an empty payload. FR-005: never silently treated as inactive.
        const missing = frameworks.filter((f) => !f.documentFound).map((f) => f.framework);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              projectId: input.projectId,
              complianceActive: true,
              activeFrameworks,
              mode: input.mode,
              frameworks,
              missingDocuments: missing,
              guidance: missing.length > 0
                ? `HALT. ${missing.join(', ')} enabled for this project but no active rules document exists. Report this and do not proceed as though compliance were inactive.`
                : 'Apply these requirements to the work in hand. Compliance context is ACTIVE.',
            }),
          }],
        };
      }
      // [SCOPE 112 / T009] END

      default:
        // [SCOPE 111 / T027] Test Suite Lifecycle tools are handled in their own
        // module rather than as seven more inline cases in this ~4k-line switch.
        if (isTestLifecycleTool(name)) {
          return await handleTestLifecycleTool(name, args as Record<string, unknown>, scoped);
        }
        // [SCOPE 151 / T005] KAIN's view of which project agents are connected (FR-062).
        if (name === LIST_AGENT_CONNECTIONS_TOOL) {
          const listed = await handleListAgentConnections(args as Record<string, unknown>, scoped);
          return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...listed }) }] };
        }
        // [SCOPE 155 / T006] KAIN's session status read (FR-004).
        if (name === GET_SESSION_STATUS_TOOL) {
          const status = await handleGetSessionStatus(args as Record<string, unknown>, scoped);
          return { content: [{ type: 'text', text: JSON.stringify(status) }] };
        }
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);

    }
  } catch (error) {
    didFail = true;
    if (error instanceof z.ZodError) {
      logger.error('Validation error', error, { tool: name, args });
      throw new McpError(
        ErrorCode.InvalidParams,
        `Validation error: ${error.issues
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', ')}`
      );
    }
    
    if (error instanceof McpError) {
      throw error;
    }

    // [SCOPE 043 / T023] Amendment D (FR-021) — a denial is the caller's answer, not
    // a server fault. Without this branch ProjectAccessError falls through to the
    // generic handler below: logged at ERROR and rethrown as InternalError. The
    // refusal itself is unchanged — same opaque message, same non-disclosure — only
    // its classification. Placed after the McpError branch so it cannot intercept a
    // denial some handler has already chosen to phrase itself.
    if (error instanceof ProjectAccessError) {
      didDeny = true;
      // [SCOPE 043 / T025] Tell the audit row directly. On /call the 403 below would
      // have covered this; on /mcp and /messages nothing else can, because those
      // transports answer 200/202 whatever the tool decided.
      recordDenialFromMeta(request.params._meta);
      throw new McpError(ErrorCode.InvalidRequest, error.message, {
        reason: PROJECT_ACCESS_DENIAL_MARKER,
      });
    }

    logger.error('Tool execution error', error as Error, { tool: name, args });
    throw new McpError(
      ErrorCode.InternalError,
      `Error executing tool ${name}: ${(error as Error).message}`
    );
  } finally {
    if (didDeny) {
      // [SCOPE 043 / T023] Kept OUT of tool.call.failed on purpose: an alarm on the
      // failure rate must not be desensitised by refusals that are working as
      // designed, which is exactly how NEW-9 stayed invisible for two days.
      logger.warn('tool.call.denied', {
        requestId,
        tool: name,
        reason: PROJECT_ACCESS_DENIAL_MARKER,
        durationMs: Date.now() - startedAt,
      });
    } else if (!didFail) {
      logger.info('tool.call.success', {
        requestId,
        tool: name,
        durationMs: Date.now() - startedAt,
      });
    } else {
      logger.warn('tool.call.failed', {
        requestId,
        tool: name,
        durationMs: Date.now() - startedAt,
      });
    }
  }
});

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'project.capture_event',
        description: 'Capture a project event (chat, commit, meeting notes, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
            type: {
              type: 'string',
              // Derived from the zod enum, never re-typed. This list was hand-copied
              // twice before and drifted from the validator both times — the advertised
              // schema said one thing and CaptureEventInputSchema.parse rejected it
              // (task_push 2026-05-24, spec_implementation_progress 2026-08-20).
              enum: [...ProjectEventTypeSchema.options],
              description: 'Event type'
            },
            source: { type: 'string', description: 'Event source (e.g., vscode, cli, github)' },
            actor: { type: 'string', description: 'User or system that triggered the event' },
            rawContent: { type: 'string', description: 'Raw event content' },
            normalizedContent: { type: 'string', description: 'Normalized/processed content (optional)' },
            metadata: { type: 'object', description: 'Additional metadata (optional)' },
            specId: { type: 'string', format: 'uuid', description: 'Associate this event with a specific spec/scope (optional). Stored under metadata.specId so meeting notes / client updates are traceable to the spec they concern; queryable via metadata->>\'specId\'.' },
          },
          required: ['projectId', 'type', 'source', 'actor', 'rawContent'],
        },
      },
      {
        name: 'project.upsert_document',
        description: 'Create or update a project document',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
            title: { type: 'string', description: 'Document title' },
            bodyMarkdown: { type: 'string', description: 'Document content in Markdown' },
            sourceEventId: { type: 'string', format: 'uuid', description: 'Source event ID (optional)' },
            taskIds: { type: 'array', items: { type: 'string', format: 'uuid' }, description: 'Linked task IDs (optional)' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Document tags (optional)' },
            documentId: { type: 'string', format: 'uuid', description: 'Existing document ID to update (optional)' },
            doctype: { type: 'string', description: 'Document doctype (REQUIRED, non-empty) — e.g. "ProjectStack", "ScopeAnalysis". Project-level docs are matched/upserted by (projectId, doctype, title); a doctype-less row is an orphan no read path can find.' },
            specId: { type: 'string', format: 'uuid', description: 'Spec/scope ID (optional). When set with doctype, the row is matched/upserted by (projectId, doctype, specId) — for per-scope docs like "ScopeAnalysis" (one row per spec).' },
          },
          required: ['projectId', 'title', 'bodyMarkdown', 'doctype'],
        },
      },
      {
        name: 'project.get_stack',
        description: "Read the project's Stack & Style (ProjectStack) document; returns null if not set",
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'project.create_task',
        description: 'Create a new project task',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
            // [SCOPE 101 / T001] Expose specId so callers can create a task already
            // bound to its spec. The validator + handler already persist it; only
            // the published schema was hiding it, so every create_task task landed
            // with specid=null and rendered as unlinked in cockpit_summary.
            specId: { type: 'string', format: 'uuid', description: 'Owning spec ID — links the task to a spec so it groups under that scope in the Dev Cockpit (optional)' },
            title: { type: 'string', maxLength: 255, description: 'Task title (1–255 chars — hard cap; longer titles are rejected, so pre-truncate)' },
            descriptionMarkdown: { type: 'string', description: 'Task description in Markdown' },
            status: { type: 'string', enum: ['todo', 'in_progress', 'blocked', 'done'], description: 'Task status (default: todo)' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Task priority (default: medium)' },
            dueDate: { type: 'string', format: 'date-time', description: 'Due date ISO string (optional)' },
            sourceEventId: { type: 'string', format: 'uuid', description: 'Source event ID (optional)' },
            documentIds: { type: 'array', items: { type: 'string', format: 'uuid' }, description: 'Linked document IDs (optional)' },
            assignee: { type: 'string', description: 'Task assignee (optional)' },
          },
          required: ['projectId', 'title', 'descriptionMarkdown'],
        },
      },
      // [SCOPE 043 / T002] BEGIN — project.submit_feedback tool registration
      // MODIFIED-BY: [SCOPE 043 / T031] — the description names who the channel is for (FR-027).
      //   It read "submit a bug report" with no owner, so agents filed defects in their OWN
      //   application here; FR-010 then routed them to the vendor's queue, where nobody can fix them.
      {
        name: 'project.submit_feedback',
        description:
          "Report a defect in, or a suggestion about, wxKanban itself: the web app, these hosted MCP tools, the kit and its commands and skills, or the Dev Cockpit. The report goes to the wxKanban team, not to your project; every submission lands in wxKanban's central feedback queue, whatever projectId you pass. Do NOT use this for a bug in the application you are building. A defect in your own code belongs in your own project: record it there with project.create_task. Returns a reference id; follow its status with project.list_my_feedback.",
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
            type: { type: 'string', enum: ['bug', 'suggestion'], description: 'Feedback type' },
            title: { type: 'string', description: 'Short title for the report' },
            details: { type: 'object', description: 'Persona-elicited structured answers (Bug Reporter / Feature Suggester)' },
            attachments: {
              type: 'array',
              maxItems: 3,
              description:
                'Optional text attachments, e.g. a log file (max 3, 128 KB each after truncation, 256 KB total). Content must already be credential-redacted by the client. Binary is not supported.',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'File name (base name only)' },
                  bytes: { type: 'number', description: 'Size on disk before truncation' },
                  truncated: { type: 'boolean', description: 'True when content is a tail slice of a larger file' },
                  redactions: { type: 'number', description: 'Count of credential values masked client-side' },
                  content: { type: 'string', description: 'Bounded, redacted UTF-8 text' },
                },
                required: ['name', 'bytes', 'truncated', 'redactions', 'content'],
              },
            },
            context: { type: 'object', description: 'Auto-captured context: kitversion, activescope, vscodeversion, os (optional)' },
            notificationChannel: { type: 'string', enum: ['inapp', 'email'], description: 'Where to notify the submitter of status changes (default: inapp)' },
          },
          required: ['projectId', 'type', 'title', 'details'],
        },
      },
      // [SCOPE 043 / T002] END
      // [SCOPE 043 / T007] BEGIN — needs-info tool registrations
      {
        name: 'project.list_my_feedback',
        description:
          "List feedback for the current project and the caller's own company, with status (including any needs-info question and dedup link). Set incoming:true to list instead the reports OTHER companies filed into a feedback sink your company owns.",
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
            status: {
              type: 'string',
              enum: ['new', 'triaged', 'needsinfo', 'inprogress', 'resolved', 'declined'],
              description: 'Optional status filter',
            },
            maxItems: { type: 'number', description: 'Maximum items (default: 50, max: 100)' },
            includeHidden: { type: 'boolean', description: 'Include items you have hidden (default: false)' },
            incoming: {
              type: 'boolean',
              description:
                "List feedback submitted by OTHER companies into the sink your company owns, instead of your own (default: false). Refused unless your company owns the sink.",
            },
          },
          required: ['projectId'],
        },
      },
      // [SCOPE 110 / T011] submitter hides/unhides/deletes their OWN submissions.
      {
        name: 'project.manage_my_feedback',
        description:
          'Hide, unhide, or permanently delete your own feedback submissions (bulk-capable). Hiding is a reversible clear from your own list; deleting is permanent and audited. You can only act on submissions you made — ownership is enforced at the data layer and a request naming another user\'s item reports not-found.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
            action: { type: 'string', enum: ['hide', 'unhide', 'delete'], description: 'hide (reversible) | unhide | delete (permanent, audited)' },
            ids: {
              type: 'array',
              items: { type: 'string', format: 'uuid' },
              description: 'Feedback submission IDs to act on (1–200)',
            },
          },
          required: ['projectId', 'action', 'ids'],
        },
      },
      {
        name: 'project.answer_feedback',
        description:
          'Answer the single needs-info clarification question on your own feedback item. Moves it back to triaged and appends the answer to the lifecycle artifact.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
            feedbackId: { type: 'string', format: 'uuid', description: 'Feedback submission ID' },
            answer: { type: 'string', description: 'Answer to the clarifying question' },
          },
          required: ['projectId', 'feedbackId', 'answer'],
        },
      },
      {
        name: 'project.triage_feedback',
        description:
          "Deprecated: returns your own feedback item's current status unchanged. Status (including 'triaged') is set by wxperts when it reviews the report — pushing a report into chat no longer changes it. Owner-only. Kept so older Dev Cockpits get a response.",
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
            feedbackId: { type: 'string', format: 'uuid', description: 'Feedback submission ID' },
          },
          required: ['projectId', 'feedbackId'],
        },
      },
      // [SCOPE 043 / T007] END
      // [SCOPE 043 / T021] BEGIN — update_feedback_status registration
      // MODIFIED-BY: [SCOPE 148 / T003] — resolutionTemplate + fixedInVersion advertised (FR-010)
      {
        name: 'project.update_feedback_status',
        description:
          "Move a feedback report through the triage vocabulary (new, triaged, needsinfo, inprogress, resolved, declined). For the VENDOR: works on any report filed into a feedback sink your company owns, not just your own. Optionally appends an internal note; a note is REQUIRED when declining (stored as the decline reason) or when moving to needsinfo (stored as the clarification question, replacing any prior one). Notifies the submitter's in-app inbox. THE NOTE IS SHOWN TO THE SUBMITTER on declined, needsinfo AND resolved — on resolved it is the only place they learn WHAT was fixed and WHICH release carries it, so write it for them: name the version and, if useful, the date. Anything you do not want the submitter to read does not belong in this field. Alternatively, on resolved, name a resolutionTemplate (kit | cockpit | hosted; kit and cockpit need fixedInVersion) and the server writes the whole message — no note may be sent with it. A template resolve is refused with recurrence_suspected when the report itself records a version at or above fixedInVersion. A project-agent token must use a template to resolve. Every change is recorded in the company audit log.",
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
            feedbackId: { type: 'string', format: 'uuid', description: 'Feedback submission ID' },
            status: {
              type: 'string',
              enum: ['new', 'triaged', 'needsinfo', 'inprogress', 'resolved', 'declined'],
              description: 'New status',
            },
            note: {
              type: 'string',
              description:
                'Note appended to the triage history. SHOWN TO THE SUBMITTER on "declined" (as the decline reason), "needsinfo" (as the clarification question) and "resolved" (as the resolution note — name the release it ships in). Required for "declined" and "needsinfo". Only this transition\'s note is shown; earlier notes stay internal. Not allowed with resolutionTemplate.',
            },
            resolutionTemplate: {
              type: 'string',
              enum: ['kit', 'cockpit', 'hosted'],
              description:
                'Only with status "resolved". The server writes the whole submitter message: kit / cockpit = "resolved in a previous release, it should be <fixedInVersion> or later" with how to check their version; hosted = the fix is live.',
            },
            fixedInVersion: {
              type: 'string',
              description: 'The release that carries the fix, e.g. "1.7.78". Required with the kit and cockpit templates.',
            },
          },
          required: ['projectId', 'feedbackId', 'status'],
        },
      },
      // [SCOPE 043 / T021] END
      // [SCOPE 043 / T017] BEGIN — scope-seed materialization tools (sink-only)
      {
        name: 'project.list_scope_seeds',
        description:
          'List feedback items accepted-to-scope whose draft scope seed has not yet been materialized to a file (scopeseed set, no linked scope number). Restricted to the feedback sink project; the kit calls this on open to write the draft scope files.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID (must be the feedback sink)' },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'project.record_scope_materialized',
        description:
          'Report the collision-safe scope number the kit assigned when it wrote a seed to specs/Project-Scope/NNN-*.md, linking the feedback row to that scope. Idempotent. Restricted to the feedback sink project.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID (must be the feedback sink)' },
            feedbackId: { type: 'string', format: 'uuid', description: 'Feedback submission ID' },
            scopeNumber: { type: 'string', description: 'Assigned 3-digit scope number (NNN)' },
          },
          required: ['projectId', 'feedbackId', 'scopeNumber'],
        },
      },
      // [SCOPE 043 / T017] END
      {
        name: 'project.update_task_status',
        description: 'Update the status of an existing task',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', format: 'uuid', description: 'Task ID' },
            status: { type: 'string', enum: ['todo', 'in_progress', 'blocked', 'done'], description: 'New status' },
          },
          required: ['taskId', 'status'],
        },
      },
      // [SCOPE 101 / T003] BEGIN — link_task_to_spec tool registration
      {
        name: 'project.link_task_to_spec',
        description:
          'Associate existing tasks with their spec by setting each task\'s specId (the repair path for tasks created via create_task, which never set it). Batch: pass an array of links, each naming a task and its spec by specId (uuid) OR specNumber (e.g. "0012"). This is what makes tasks group under their scope in the Dev Cockpit. Project derived from the caller\'s token.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
            links: {
              type: 'array',
              description: 'Task→spec links (1-500). Each requires taskId and exactly one of specId / specNumber.',
              items: {
                type: 'object',
                properties: {
                  taskId: { type: 'string', format: 'uuid', description: 'Task to re-parent' },
                  specId: { type: 'string', format: 'uuid', description: 'Target spec ID (mutually exclusive with specNumber)' },
                  specNumber: { type: 'string', description: 'Target spec number, e.g. "0012" (mutually exclusive with specId)' },
                },
                required: ['taskId'],
              },
            },
          },
          required: ['projectId', 'links'],
        },
      },
      // [SCOPE 101 / T003] END
      // [SCOPE 101 / T014] BEGIN — update_task tool registration
      {
        name: 'project.update_task',
        description:
          'Edit an existing task in place: title, description, priority, due date, assignee. Only the fields you send change; send null for dueDate or assignedToId to clear them. Status and spec link are NOT edited here — use project.update_task_status and project.link_task_to_spec. The previous values are kept in the project event log. Project derived from the caller\'s token.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', format: 'uuid', description: 'Task to edit' },
            title: { type: 'string', maxLength: 255, description: 'New title' },
            descriptionMarkdown: { type: 'string', description: 'New description (Markdown); replaces the whole description' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'New priority' },
            dueDate: { type: ['string', 'null'], description: 'Due date as YYYY-MM-DD (or ISO datetime; the date part is used). null clears it.' },
            assignedToId: { type: ['string', 'null'], format: 'uuid', description: 'User id to assign — must be in the project\'s company or a project member. null unassigns.' },
          },
          required: ['taskId'],
        },
      },
      // [SCOPE 101 / T014] END
      // [SCOPE 101 / T015] BEGIN — delete_task tool registration
      {
        name: 'project.delete_task',
        description:
          'Permanently delete a task — for removing duplicates or tasks created in error. REFUSES, deleting nothing, if the task has time entries, an external PM sync record, dependencies, compliance flags or state overrides (a delete would cascade them away); the response names each blocker. On success returns a snapshot of the deleted task and how many AI proposals / test-plan items lost their link. Project derived from the caller\'s token.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', format: 'uuid', description: 'Task to delete' },
          },
          required: ['taskId'],
        },
      },
      // [SCOPE 101 / T015] END
      // [SCOPE 101 / T004] BEGIN — update_spec_status tool registration
      {
        name: 'project.update_spec_status',
        description:
          'Update a spec: transition its lifecycle status (draft → planned → implementing → qa → human_testing → beta → released) and/or rename it. Provide `status`, `title`, or both (at least one required). Target the spec by specId (uuid) OR specNumber (e.g. "0012"). Project derived from the caller\'s token.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: "Optional. The write always goes to the project this token is scoped to; supplying a DIFFERENT project id is refused rather than ignored, so a mistyped id cannot look like a successful write." },
            specId: { type: 'string', format: 'uuid', description: 'Target spec ID (mutually exclusive with specNumber). Exact, never normalized — the unambiguous way to name a spec.' },
            specNumber: { type: 'string', description: 'Target spec number, e.g. "0012" (mutually exclusive with specId). Matched EXACTLY first; only if nothing matches exactly are leading zeros ignored, and if that matches more than one spec the call is refused naming the candidates. The response echoes requestedSpecNumber and resolvedBy so you can see which record was hit.' },
            status: {
              type: 'string',
              enum: ['draft', 'planned', 'implementing', 'qa', 'human_testing', 'beta', 'released', 'archived'],
              description: 'New lifecycle status (optional if renaming via title)',
            },
            title: { type: 'string', maxLength: 500, description: 'New spec title (optional). Use to rename a spec whose purpose changed — updates the spec record cockpit_summary reads. Provide status, title, or both.' },
          },
          required: ['projectId'],
        },
      },
      // [SCOPE 101 / T004] END
      // [SCOPE 074 / T004-5] BEGIN — capability index tools
      {
        name: 'project.index_capabilities',
        description:
          "(Re)index a source unit's owned capabilities into the semantic capability index. Replaces the unit's prior rows (by sourceRef) and embeds each description. Project derived from the caller's token.",
        inputSchema: {
          type: 'object',
          properties: {
            sourceRef: { type: 'string', description: "Owning unit ref, e.g. '073' or 'app:billing@alitho'" },
            sourceType: { type: 'string', enum: ['scope', 'app', 'code'], description: 'Source kind' },
            capabilities: {
              type: 'array',
              description: 'The capabilities this unit owns',
              items: {
                type: 'object',
                properties: {
                  owner: { type: 'string', description: 'Owning unit identifier' },
                  capabilityType: { type: 'string', enum: ['process', 'table', 'route', 'doctype', 'command', 'workflow'] },
                  name: { type: 'string' },
                  description: { type: 'string', description: 'The text that gets embedded' },
                },
                required: ['owner', 'capabilityType', 'name', 'description'],
              },
            },
          },
          required: ['sourceRef', 'sourceType', 'capabilities'],
        },
      },
      {
        name: 'project.search_capabilities',
        description:
          'Semantic similarity search over the capability index (discovery only). Returns ranked owners/matches. Tenant-scoped to the caller\'s token.',
        inputSchema: {
          type: 'object',
          properties: {
            queryText: { type: 'string', description: 'Natural-language description of the capability to find' },
            topK: { type: 'number', description: 'Max matches (1-100, default 10)' },
            sourceType: { type: 'string', enum: ['scope', 'app', 'code'], description: 'Optional filter' },
            capabilityType: { type: 'string', enum: ['process', 'table', 'route', 'doctype', 'command', 'workflow'], description: 'Optional filter' },
          },
          required: ['queryText'],
        },
      },
      // [SCOPE 074 / T004-5] END
      // [SCOPE 073 / T003] BEGIN — scope-flow dependency capture
      {
        name: 'project.set_scope_dependencies',
        description:
          "Capture a scope's dependency edges from its raw Depends On / Related Scopes text (server resolves the SCOPE/SPEC namespace), replace the scope's prior edges, regenerate the per-project `scopeflow` doc, and return non-blocking graph-health warnings. Project derived from the caller's token.",
        inputSchema: {
          type: 'object',
          properties: {
            scopeNumber: { type: 'number', description: 'The scope number whose dependencies these are (e.g. 73)' },
            dependsOnRaw: { type: 'string', description: 'Raw Depends On line text (optional)' },
            relatedRaw: { type: 'string', description: 'Raw Related Scopes line text (optional)' },
          },
          required: ['scopeNumber'],
        },
      },
      // [SCOPE 073 / T003] END
      {
        name: 'project.link_doc_to_task',
        description: 'Link a document to a task (bidirectional)',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', format: 'uuid', description: 'Task ID' },
            documentId: { type: 'string', format: 'uuid', description: 'Document ID' },
          },
          required: ['taskId', 'documentId'],
        },
      },
      {
        name: 'project.list_open_items',
        description:
          'List tasks, recent documents, and events for a project. Documents default to metadata + a short preview (bodyChars + preview), NOT full bodies. For large projects, page with `offset`, request a single collection with `category` (tasks|documents|events), and shrink the payload with `documentBody` ("none" omits the preview, "full" inlines the whole body). Response includes a `paging` echo. Optionally filter tasks by status and events by a `since` timestamp.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
            maxItems: { type: 'number', description: 'Maximum items per category (default: 50, max: 100)' },
            offset: { type: 'number', description: 'Pagination cursor within each category (default 0). A full page (length === maxItems) implies more at offset+maxItems.' },
            category: { type: 'string', enum: ['tasks', 'documents', 'events'], description: 'Return only this collection (others come back empty). Omit for all three.' },
            documentBody: { type: 'string', enum: ['none', 'preview', 'full'], description: "Document body detail: 'none' omits preview (smallest), 'preview' (default) = bodyChars + 200-char preview, 'full' = whole body (pair with category+offset to bound size)." },
            status: {
              type: 'array',
              items: { type: 'string' },
              description: "Filter tasks to these statuses (e.g. ['open','in-progress']). Omit for all statuses.",
            },
            since: {
              type: 'string',
              format: 'date-time',
              description: 'ISO 8601 timestamp; return only events at/after this instant.',
            },
          },
          required: ['projectId'],
        },
      },
      // [SCOPE 042 / T002] BEGIN — project.cockpit_summary tool registration
      {
        name: 'project.cockpit_summary',
        description: "Return the current project's scopes/specs each with their incomplete tasks (the Dev Cockpit read). Strictly scoped to the caller's token — single project only. Pass specId OR specNumber to return just one scope (answers 'what is spec 0026's status?' without fetching the whole project).",
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID (must match the token scope)' },
            specId: { type: 'string', format: 'uuid', description: 'Return only this spec\'s scope (optional; mutually exclusive with specNumber)' },
            specNumber: { type: 'string', description: 'Return only this spec\'s scope, e.g. "0026" (optional; mutually exclusive with specId)' },
            impactModeOnly: { type: 'boolean', description: 'Return only { projectId, impactMode }: the Change Impact mode the project owner set in wxKanban, or null (optional)' },
          },
          required: ['projectId'],
        },
      },
      // [SCOPE 042 / T002] END
      // [SCOPE 123 / T018] BEGIN — scope_stage + backfill_scope_stages tool registrations
      {
        name: 'project.scope_stage',
        description:
          "Return one scope's lifecycle stage, its task counts, what would advance it (open tasks, open test gates), its stage history, and the project's rollup stage (the lowest stage among its active scopes). A stage belongs to a scope, not to the project: commands are gated on the stage of the scope they name. Name the scope by specId OR specNumber (exactly one).",
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID (must match the token scope)' },
            specId: { type: 'string', format: 'uuid', description: 'The scope\'s spec ID (mutually exclusive with specNumber)' },
            specNumber: { type: 'string', description: 'The scope\'s spec number, e.g. "123" (mutually exclusive with specId)' },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'project.backfill_scope_stages',
        description:
          "Give every scope that has never had a stage recorded its stage, inferred from the evidence in the database (tasks, test gates) by the same rule the automatic advance uses, conservatively: ambiguous evidence lands in the earlier stage. DRY RUN by default: returns each scope's inferred stage and the evidence; nothing is written until called again with confirm: true. Idempotent: scopes that already have a stage are skipped.",
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID (must match the token scope)' },
            confirm: { type: 'boolean', default: false, description: 'Write the inferred stages. Omit or false for the dry run.' },
          },
          required: ['projectId'],
        },
      },
      // [SCOPE 123 / T018] END
      // [SCOPE 058 / T003] BEGIN — scope check-out / check-in tool registrations
      {
        name: 'project.checkout_scope',
        description: "Claim (check out) a scope for the calling developer and return the branch name scope/<NNN>-<kebab-title>. If already claimed by another developer and force is not set, returns a conflict result naming the holder (no mutation). force re-claims and audits the override.",
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID (must match the token scope)' },
            specNumber: { type: 'string', minLength: 1, maxLength: 10, description: 'Scope/spec number (e.g., "058")' },
            force: { type: 'boolean', description: 'Override an existing claim by another developer (audited)' },
          },
          required: ['projectId', 'specNumber'],
        },
      },
      {
        name: 'project.checkin_scope',
        description: "Release (check in) a scope claim. A developer may release only their own claim; forcing the release of another developer's claim is ADMIN-only.",
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID (must match the token scope)' },
            specNumber: { type: 'string', minLength: 1, maxLength: 10, description: 'Scope/spec number (e.g., "058")' },
          },
          required: ['projectId', 'specNumber'],
        },
      },
      // [SCOPE 058 / T003] END
      {
        name: 'project.merge_scope',
        description: "Dedup two spec rows that share the same specNumber in one project: reassign the duplicate's tasks + documents (and best-effort testplans/audit) to the keeper, then delete the duplicate. Refuses unless both specs exist in the project and share the same specNumber. Pass dryRun to preview counts without mutating.",
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID (must match the token scope)' },
            fromSpecId: { type: 'string', format: 'uuid', description: 'The duplicate spec id to remove' },
            intoSpecId: { type: 'string', format: 'uuid', description: 'The keeper spec id to reassign children to' },
            dryRun: { type: 'boolean', description: 'Preview reassignment counts without mutating (default false)' },
          },
          required: ['projectId', 'fromSpecId', 'intoSpecId'],
        },
      },
      {
        // [SCOPE 134 / T009]
        name: 'project.record_override',
        description: "Record an override decision that a HUMAN already made. This is an audit record, NOT a grant — calling it permits nothing. The server cannot execute anything, so it cannot authorize anything: enforcement is local, where the runtime suspends the action and resumes only on the operator answering. Agent-only, gated on the token's clientbinding. A 'granted' outcome must name the human who approved it; a tool never self-approves. Omitting expiresInMinutes means single-use — good for that one action, not a window.",
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID (must match the token scope)' },
            agentName: { type: 'string', minLength: 1, maxLength: 64, description: 'Agent name, matched against the token binding' },
            sessionId: { type: 'string', minLength: 1, maxLength: 64, description: 'Session this decision belongs to. Recorded for correlation, never validated.' },
            action: { type: 'string', enum: ['gitpush', 'prodatawrite'], description: 'The gated action class. Deliberately short: a gate that fires constantly trains reflexive approval and stops being a safeguard.' },
            outcome: { type: 'string', enum: ['granted', 'denied', 'expired', 'consumed'], description: 'What the human decided, or what became of the grant' },
            grantedBy: { type: 'string', minLength: 1, maxLength: 200, description: 'The human who approved. REQUIRED when outcome is "granted".' },
            requestText: { type: 'string', maxLength: 4000, description: 'What the operator was actually shown when they answered. Stored verbatim so the decision is judged on what was in front of them.' },
            expiresInMinutes: { type: 'number', minimum: 1, maximum: 1440, description: 'Grant lifetime. Omit for single-use.' },
            detail: { type: 'object', description: 'Anything else worth keeping with the record' },
          },
          required: ['projectId', 'agentName', 'action', 'outcome'],
        },
      },
      {
        // [SCOPE 098 / T008]
        name: 'project.delete_scope',
        description: "PERMANENTLY delete one spec and its tasks. Not reversible — use project.merge_scope to fold a duplicate into a keeper, or archive the scope, if you want its content kept. Target by exactly one of specId or specNumber. Refuses by default when the scope still owns tasks or documents: re-run with force:true to delete it and them. dryRun reports what would go and changes nothing. Documents, scope conversations, specification phases and test plans are removed by database cascade; audit executions, test plan items and test runs keep their rows and lose the link, and the response reports how many.",
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID (must match the token scope)' },
            specId: { type: 'string', format: 'uuid', description: 'The spec row id to delete. Supply this OR specNumber, never both.' },
            specNumber: { type: 'string', minLength: 1, maxLength: 10, description: 'The spec number to delete, e.g. "0026". Supply this OR specId, never both.' },
            dryRun: { type: 'boolean', description: 'Report what would be deleted and change nothing (default false)' },
            force: { type: 'boolean', description: 'Proceed even though the scope still owns tasks or documents (default false)' },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'project.create_specs',
        description: 'Execute the complete wxKanban spec workflow with a strict scope-quality preflight. Blocks placeholder-heavy scopes before any spec artifacts are created.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
            specNumber: { type: 'string', minLength: 1, maxLength: 10, description: 'Spec number (e.g., "017")' },
            featureName: { type: 'string', minLength: 1, maxLength: 255, description: 'Feature name' },
            // [SCOPE 135 / T005] FR-008 — describe the gate runPreflight actually enforces, which is the
            // same gate project.validatescope runs. The old text demanded literal headings the gate does
            // not require, and 523f65ed restructured a scope that already scored 100 to satisfy it.
            scopeContent: { type: 'string', minLength: 1, description: CREATE_SPECS_SCOPE_CONTENT_DESCRIPTION },
            phase: { 
              type: 'string', 
              enum: ['scoping', 'design', 'implementation', 'qa', 'human_testing', 'beta', 'released'],
              default: 'scoping',
              description: 'Current lifecycle phase' 
            },
            priority: { 
              type: 'string', 
              enum: ['low', 'medium', 'high', 'critical'],
              default: 'medium',
              description: 'Spec priority' 
            },
            tasks: {
              type: 'array',
              description: 'Tasks to create from the spec',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', minLength: 1, maxLength: 255, description: 'Task title' },
                  description: { type: 'string', minLength: 1, description: 'Task description' },
                  priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Task priority' },
                  status: { type: 'string', enum: ['todo', 'in_progress', 'blocked', 'done'], default: 'todo', description: 'Task status' },
                },
                required: ['title', 'description', 'priority'],
              },
            },
            generateLifecycle: { 
              type: 'boolean', 
              default: true, 
              description: 'Generate lifecycle.json and update projectlifecycle.md' 
            },
          },
          required: ['projectId', 'specNumber', 'featureName', 'scopeContent'],
        },
      },
      {
        name: 'project.check_for_updates',
        description: 'Check whether a newer MCP server release is published. Covers the MCP server ONLY — '
          + 'to check the orchestrator kit version, run scripts/check-kit-version.mjs in the project. '
          + 'Throttled to once per 24h unless force:true. A non-null `error` means no comparison was made: '
          + 'treat it as "unknown", never as "up to date".',
        inputSchema: {
          type: 'object',
          properties: {
            force: { 
              type: 'boolean', 
              default: false, 
              description: 'Force check even if recently checked' 
            },
          },
        },
      },
      {
        name: 'project.upgrade_mcp',
        description: 'Download and install the latest MCP server release into a LOCAL MCP install. '
          + 'Disabled unless MCP_ALLOW_SELF_UPGRADE=true — the hosted MCP is deployed by its own '
          + 'pipeline and cannot be upgraded by a tool call. Backs up the current install first.',
        inputSchema: {
          type: 'object',
          properties: {
            version: { 
              type: 'string', 
              description: 'Specific version to install (optional, defaults to latest)' 
            },
            dryRun: { 
              type: 'boolean', 
              description: 'Check what would be installed without actually upgrading' 
            },
          },
        },
      },
      {
        name: 'project.kit_status',
        description: 'Get the current status of a project kit including generation state, download URL, and metadata.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { 
              type: 'string', 
              format: 'uuid', 
              description: 'Project ID' 
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'project.download_kit',
        description: 'Generate a time-limited download URL for a project kit.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { 
              type: 'string', 
              format: 'uuid', 
              description: 'Project ID' 
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'project.regenerate_kit',
        description: 'Trigger regeneration of a project kit. This updates the kit with the latest project state.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { 
              type: 'string', 
              format: 'uuid', 
              description: 'Project ID' 
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'project.import_project',
        description: 'NOT IMPLEMENTED on this server. It previously returned a freshly generated UUID for a project it never created, so callers held an id that existed nowhere. Create projects in the wxKanban app; this tool now reports that it did nothing.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { 
              type: 'string', 
              minLength: 1, 
              maxLength: 255, 
              description: 'Project name' 
            },
            description: { 
              type: 'string', 
              description: 'Project description (optional)' 
            },
            primaryAI: { 
              type: 'string', 
              enum: ['cursor', 'claude-code', 'blackboxai', 'copilot', 'generic'],
              description: 'Primary AI assistant for the project' 
            },
            localDirectoryPath: { 
              type: 'string', 
              description: 'Local directory path (optional)' 
            },
            generateKit: { 
              type: 'boolean', 
              default: true, 
              description: 'Generate kit after import' 
            },
            phaseAssignments: { 
              type: 'object', 
              description: 'Phase assignments mapping (optional)' 
            },
            companyId: { 
              type: 'string', 
              format: 'uuid', 
              description: 'Company ID' 
            },
          },
          required: ['name', 'primaryAI', 'companyId'],
        },
      },
      {
        name: 'project.create_api_token',
        description: 'Create a project-scoped API token that authenticates against this MCP server. Returns the raw token ONCE — only its hash is stored, so it cannot be recovered afterwards. Company and project are taken from the calling token unless given explicitly.',
        inputSchema: {
          type: 'object',
          properties: {
            companyId: {
              type: 'string',
              format: 'uuid',
              description: 'Company ID. Defaults to the calling token\'s company.'
            },
            projectId: {
              type: 'string',
              format: 'uuid',
              description: 'Project the token is scoped to. Defaults to the calling token\'s project. A token is project-scoped since Phase 11 and only a project-scoped token authenticates.',
            },
            label: {
              type: 'string',
              description: 'Token label for identification (optional). Stored as the token name; a dated default is used when omitted.'
            },
          },
          required: ['companyId'],
        },
      },
      {
        name: 'project.list_api_tokens',
        description: 'List all active API tokens for the authenticated user.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'project.revoke_api_token',
        description: 'Revoke an API token by ID. Revoked tokens cannot be used for authentication.',
        inputSchema: {
          type: 'object',
          properties: {
            tokenId: { 
              type: 'string', 
              format: 'uuid', 
              description: 'Token ID to revoke' 
            },
          },
          required: ['tokenId'],
        },
      },
      {
        name: 'project.mcp_health',
        description: 'Return MCP server health status, DB connectivity, and startup project context.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'project.get_command_prompt',
        description:
          'Fetch the server-delivered runtime methodology for a wxKanban command/skill (createspecs, buildscope, analyzescope, validatescope, research, wxuiuxcodereview, wxconversionparity, and the conversion skills). Entitlement-gated — returns the premium prompt body the thin command stubs run. Handler at project.get_command_prompt case.',
        inputSchema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Command/skill key, e.g. "createspecs", "buildscope", "analyzescope".',
            },
          },
          required: ['command'],
        },
      },
      {
        name: 'project.help',
        description: 'Display help information about all available MCP tools and their usage. Supports modes: help --all, help --git, help --docs.',
        inputSchema: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['all', 'git', 'docs'],
              description: 'Help view mode. Equivalent to help --all, help --git, help --docs.',
            },
            flags: {
              oneOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' } },
              ],
              description: 'Optional CLI-style flags, such as --all, --git, or --docs.',
            },
          },
        },
      },
      {
        name: 'project.implement',
        description: 'Advance a spec to implementing. Syncs the tasks already linked to the spec in this project (created by create_specs), records start and complete events, sets the spec status and recalculates lifecycle progress. It does NOT read tasks.md, validate a checklist, or write code — this server cannot see your workspace; the kit CLI implement command does the code work locally.',
        inputSchema: {
          type: 'object',
          properties: {
            specNumber: { 
              type: 'string', 
              minLength: 1, 
              maxLength: 10, 
              description: 'Spec number to implement (e.g., "017")' 
            },
            scopeCheck: { 
              type: 'boolean', 
              default: true, 
              description: 'Run scope-first gate verification' 
            },
            force: { 
              type: 'boolean', 
              default: false, 
              description: 'Force implementation even if scope check fails' 
            },
            reason: { 
              type: 'string', 
              description: 'Reason for force override (required if force=true)' 
            },
          },
          required: ['specNumber'],
        },
      },
      {
        name: 'project.analyze',
        description: 'NOT AVAILABLE from this server, and answers so explicitly rather than returning an empty analysis. Cross-artifact analysis reads spec.md, plan.md and tasks.md in your workspace, which this host cannot access — run analyzescope / analyzecode locally in the kit instead. For project state stored here, use project.cockpit_summary or project.list_open_items.',
        inputSchema: {
          type: 'object',
          properties: {
            specNumber: { 
              type: 'string', 
              minLength: 1, 
              maxLength: 10, 
              description: 'Spec number to analyze (e.g., "017")' 
            },
            includeConstitution: { 
              type: 'boolean', 
              default: true, 
              description: 'Include constitution alignment check' 
            },
            maxFindings: { 
              type: 'number', 
              minimum: 1, 
              maximum: 100, 
              default: 50, 
              description: 'Maximum findings to report' 
            },
          },
          required: ['specNumber'],
        },
      },
      {
        name: 'project.session_start',
        // [SCOPE 133 / T018] Descriptions are served fresh per connection, so this text
        // is also a deploy tell: if a client still sees "NOT IMPLEMENTED" here, the
        // SCOPE-133 build did not reach production regardless of what a version says.
        description: 'AGENT-ONLY. Opens a session for a named agent and returns, in one call: a server-minted sessionId, the token-resolved projectId/projectName/currentPhase, the repo name the caller REPORTED (never verified), and a project status block. Refused unless the presented token carries a matching clientbinding — every other caller, including the kit and the Cockpit, is refused here while continuing to work normally on every other tool. Fields this host cannot measure (governance version, unlinked TODO scan) are returned null and listed under notChecked; nothing is inferred or invented.',
        inputSchema: {
          type: 'object',
          properties: {
            agentName: {
              type: 'string',
              minLength: 1,
              maxLength: 64,
              description: 'Agent name, e.g. "KAIN". Matched exact-as-typed against the binding on the presented token. Required in practice — a caller that omits it is refused.',
            },
            repoName: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
              description: 'Repository the agent believes it is operating on. Echoed back as repoReported with repoVerified:false — this server has no way to confirm it.',
            },
            sessionId: {
              type: 'string',
              minLength: 1,
              maxLength: 64,
              description: 'A sessionId from an earlier call, carried forward for correlation only. Recorded, never validated: the server holds no session state.',
            },
            fullStatus: {
              type: 'boolean',
              default: false,
              description: 'Return every scope with its incomplete tasks instead of counts only. The full form can be large.',
            },
            scopeNumber: {
              type: 'string',
              minLength: 1,
              maxLength: 10,
              description: 'Active scope number (optional)'
            },
            skipVersionCheck: {
              type: 'boolean',
              default: false,
              description: 'Accepted for compatibility. No governance check runs here — it reads the local workspace.'
            },
            skipTodoScan: {
              type: 'boolean',
              default: false,
              description: 'Accepted for compatibility. No TODO scan runs here — it reads the local workspace.'
            },
          },
        },
      },
      {
        name: 'project.buildscope',
        description: 'Guided-first scope drafting. Returns a DRAFT and nothing more: this server writes no file and stores no record, so filePath/suggestedFilePath name where YOU should write the returned scopeContent (the wxkanban-agent buildscope CLI does this for you) and no spec exists in the project until create_specs or dbpush runs. Asks clarification questions by default and only returns a draft when required scope details are provided, unless quick mode is explicitly enabled. Pass the approved requirements as functionalRequirements, userScenarios, dataRequirements, apiRoutes, frontendComponents and keyEntities — they are rendered verbatim, and any you omit leave a blocking marker (never generic filler). On a create, pass localSpecNumbers so the new number skips specs that exist only on your disk; on an edit, pass your local file as currentScopeContent and write the result back to it.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { 
              type: 'string', 
              format: 'uuid', 
              description: 'Project ID' 
            },
            featureDescription: { 
              type: 'string',
              minLength: 1,
              maxLength: SCOPE_DESCRIPTION_MAX,
              description: 'High-level description of the feature'
            },
            // [SCOPE 135 / T011] FR-015 — wording shared with the Zod schema in schemas.ts.
            quick: {
              type: 'boolean',
              default: false,
              description: BUILDSCOPE_QUICK_DESCRIPTION,
            },
            templateOnly: {
              type: 'boolean',
              default: false,
              description: BUILDSCOPE_TEMPLATE_ONLY_DESCRIPTION,
            },
            editSpecNumber: { 
              type: 'string', 
              minLength: 1, 
              maxLength: 10, 
              description: 'Edit existing scope file instead of creating new' 
            },
            primaryActor: { 
              type: 'string', 
              maxLength: 255, 
              description: 'Primary user actor for the scope' 
            },
            secondaryActors: {
              type: 'array',
              items: { type: 'string', maxLength: 255 },
              description: 'Secondary actors or stakeholder groups affected by the scope'
            },
            // [SCOPE 090 / BUG-2026-07-22] Limits come from schemas.ts so this
            // advertised copy cannot drift from the zod schema that enforces it.
            businessProblem: {
              type: 'string',
              maxLength: SCOPE_NARRATIVE_MAX,
              description: 'Business problem this solves'
            },
            successMetrics: {
              type: 'array',
              items: { type: 'string', maxLength: SCOPE_NARRATIVE_MAX },
              description: 'List of measurable success metrics (3+ required to pass quality gates)'
            },
            scopeBoundary: {
              type: 'string',
              maxLength: SCOPE_NARRATIVE_MAX,
              description: 'What is explicitly in scope for this effort'
            },
            outOfScope: {
              type: 'string',
              maxLength: SCOPE_NARRATIVE_MAX,
              description: 'What is explicitly out of scope for this effort'
            },
            integrationContext: {
              type: 'string',
              maxLength: SCOPE_NARRATIVE_MAX,
              description: 'Existing workflows, systems, or documents this scope must align with'
            },
            constraintsAndRisks: {
              type: 'string',
              maxLength: SCOPE_NARRATIVE_MAX,
              description: 'Known constraints, assumptions, or delivery risks that should be reviewed'
            },
            // [SCOPE 135 / T006] FR-009 — limits and wording come from schemas.ts, like the fields above.
            functionalRequirements: {
              type: 'array',
              maxItems: 200,
              description: BUILDSCOPE_INPUT_DESCRIPTIONS.functionalRequirements,
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', minLength: 1, maxLength: 255 },
                  requirement: { type: 'string', minLength: 1, maxLength: SCOPE_NARRATIVE_MAX },
                  acceptanceCriteria: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1, maxLength: SCOPE_NARRATIVE_MAX } },
                },
                required: ['title', 'requirement', 'acceptanceCriteria'],
              },
            },
            userScenarios: {
              type: 'array',
              maxItems: 100,
              description: BUILDSCOPE_INPUT_DESCRIPTIONS.userScenarios,
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', minLength: 1, maxLength: 255 },
                  actor: { type: 'string', minLength: 1, maxLength: 255 },
                  steps: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1, maxLength: SCOPE_NARRATIVE_MAX } },
                  expectedOutcome: { type: 'string', minLength: 1, maxLength: SCOPE_NARRATIVE_MAX },
                },
                required: ['title', 'actor', 'steps', 'expectedOutcome'],
              },
            },
            dataRequirements: { type: 'string', minLength: 1, maxLength: SCOPE_NARRATIVE_MAX, description: BUILDSCOPE_INPUT_DESCRIPTIONS.dataRequirements },
            apiRoutes: { type: 'string', minLength: 1, maxLength: SCOPE_NARRATIVE_MAX, description: BUILDSCOPE_INPUT_DESCRIPTIONS.apiRoutes },
            frontendComponents: { type: 'string', minLength: 1, maxLength: SCOPE_NARRATIVE_MAX, description: BUILDSCOPE_INPUT_DESCRIPTIONS.frontendComponents },
            keyEntities: { type: 'string', minLength: 1, maxLength: SCOPE_NARRATIVE_MAX, description: BUILDSCOPE_INPUT_DESCRIPTIONS.keyEntities },
            currentScopeContent: { type: 'string', minLength: 1, maxLength: SCOPE_CONTENT_MAX, description: BUILDSCOPE_INPUT_DESCRIPTIONS.currentScopeContent },
            // [SCOPE 135 / T016] FR-018
            edits: {
              type: 'array',
              maxItems: 100,
              description: BUILDSCOPE_EDITS_DESCRIPTION,
              items: {
                type: 'object',
                properties: {
                  op: { type: 'string', enum: ['add', 'replace', 'remove'] },
                  target: { type: 'string', minLength: 1, maxLength: 40 },
                  content: { type: 'string', maxLength: SCOPE_NARRATIVE_MAX },
                },
                required: ['op', 'target'],
              },
            },
            amendment: { type: 'string', minLength: 1, maxLength: 20, description: BUILDSCOPE_AMENDMENT_DESCRIPTION },
            reason: { type: 'string', maxLength: SCOPE_NARRATIVE_MAX, description: BUILDSCOPE_REASON_DESCRIPTION }, // [SCOPE 135 / T020]
            unattended: { type: 'boolean', description: BUILDSCOPE_UNATTENDED_DESCRIPTION },
            localSpecNumbers: {
              type: 'array',
              maxItems: 5000,
              items: { type: 'string', minLength: 1, maxLength: 10 },
              description: BUILDSCOPE_INPUT_DESCRIPTIONS.localSpecNumbers,
            },
            title: { type: 'string', minLength: 1, maxLength: 255, description: BUILDSCOPE_INPUT_DESCRIPTIONS.title },
          },
          required: ['projectId', 'featureDescription'],
        },
      },
      {
        name: 'project.validatescope',
        description: 'Validate a scope document for completeness, placeholder markers, and minimum quality gates required before create_specs can run. Two routes: pass scopeContent to validate a scope that has not been pushed yet (buildscope returns the scope for you to write locally and stores nothing, so there is no record here until create_specs or dbpush runs), or pass specNumber to validate the copy already stored for the project. This server never reads a path on your machine — filePath is a label only.',
        inputSchema: {
          type: 'object',
          properties: {
            specNumber: {
              type: 'string',
              minLength: 1,
              maxLength: 10,
              description: 'Spec number to validate (e.g., "017") — reads the copy stored for this project'
            },
            // [SCOPE 124 / T019] The pre-push route. See ValidateScopeInputSchema for why a path
            // cannot serve this and content can.
            scopeContent: {
              type: 'string',
              minLength: 1,
              maxLength: SCOPE_CONTENT_MAX,
              description: 'Raw scope markdown to validate. Use this to validate a scope that has not been pushed yet — read the local file and pass its text. Takes precedence over specNumber.'
            },
            filePath: {
              type: 'string',
              description: 'Label only — the path this content came from, echoed back in the result. The server does NOT read it when projectId is set; pass scopeContent to validate a local file.'
            },
            projectId: {
              type: 'string',
              format: 'uuid',
              description: 'Project ID'
            },
          },
        },
      },
      {
        name: 'project.get_audit_config',
        description: 'Get the compliance framework configuration for a project. Returns which frameworks (SOC2, HIPAA, HITRUST, GDPR, NIST SSDF, ISO 27001) are enabled and the list of active frameworks. Returns complianceActive: false if none are enabled, and configured: false if the project has no configuration row at all.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
          },
          required: ['projectId'],
        },
      },
      {
        // [SCOPE 112 / T009] Amendment A — rules are served from the DB, not shipped as files.
        name: 'project.get_compliance_context',
        description: 'Load the compliance rules that apply to this project, for each enabled framework. Call this at the start of buildscope, createSpecs, implement, and code-review work. mode "summary" (default) returns structured controls filtered by SDLC phase and optional keywords; mode "full" returns the complete framework rules document. If this call fails while frameworks are enabled, HALT and report — never proceed as though compliance were inactive, and never fall back to a local copy.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
            mode: { type: 'string', enum: ['summary', 'full'], default: 'summary', description: 'summary = structured controls (token-efficient); full = complete rules document' },
            phase: { type: 'string', description: 'Lifecycle phase to filter by — Design, Implementation, QA, HumanTesting, Beta, Release — or an SDLC phase name directly (design/development/testing/deployment). Omit for all phases.' },
            keywords: { type: 'array', items: { type: 'string' }, maxItems: 20, description: 'Optional relevance filter, e.g. ["authentication","encryption"]. Matches control title, description and category.' },
            limit: { type: 'number', minimum: 1, maximum: 200, default: 60, description: 'Maximum controls returned per framework (summary mode)' },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'project.submit_proposal',
        description: 'Submit a project proposal from an AI agent. Creates a proposal with status "pending" for human review in the Admin Dashboard.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 255, description: 'Proposal title' },
            description: { type: 'string', description: 'Proposal description' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium', description: 'Proposal priority' },
            estimatedEffort: { type: 'string', maxLength: 100, description: 'Estimated effort (e.g., "2 weeks")' },
            projectId: { type: 'string', format: 'uuid', description: 'Company project context UUID' },
            source: { type: 'string', maxLength: 255, description: 'Source identifier (defaults to "AI Agent")' },
          },
          required: ['title', 'projectId'],
        },
      },
      // [SCOPE 111 / T027] Test Suite Lifecycle. Defined in ./tools/test-lifecycle.js
      // and spread in here so the advertised list and the handler cannot drift.
      ...TEST_LIFECYCLE_TOOL_DEFS,
      LIST_AGENT_CONNECTIONS_TOOL_DEF, // [SCOPE 151 / T005]
      GET_SESSION_STATUS_TOOL_DEF, // [SCOPE 155 / T006]
    ],
  };
});

// Auto-check for updates on startup (non-blocking)
autoCheckOnStartup().catch(() => {
  // Non-critical, ignore errors
});

// [SCOPE 028 / Amendment A] Per-request server factory for the Streamable HTTP
// transport. The SDK `Server` (Protocol) holds a single `_transport`, so the
// stateless Streamable HTTP transport — created per request — cannot share the
// module-level singleton without racing on concurrent requests. This returns a
// fresh Server that reuses the SAME tool handlers (which close over module state
// + the request, not the server instance), while keeping its own built-in
// initialize/ping. The singleton above still backs /sse + /call unchanged.
// (Reading `_requestHandlers` mirrors the existing /call + /tools paths in
// index-http.ts, which dispatch via the same private map.)
export function createRequestServer(): Server {
  const s = new Server(SERVER_INFO, SERVER_OPTIONS);
  const src = (server as unknown as { _requestHandlers?: Map<string, unknown> })._requestHandlers;
  const dst = (s as unknown as { _requestHandlers?: Map<string, unknown> })._requestHandlers;
  if (src && dst) {
    for (const method of ['tools/call', 'tools/list']) {
      const handler = src.get(method);
      if (handler) dst.set(method, handler);
    }
  }
  return s;
}

export default server;
