import { z } from 'zod';
import { FEEDBACK_STATUSES, RESOLUTION_TEMPLATES, SEMVER_PATTERN } from './feedback-status.js';
import { attachmentRejectionReason, sanitizeAttachment } from './attachment-guard.js';

// Event types.
// `task_push` added 2026-05-24 to match the kit's documented task-push
// slash command (_wxAI/commands/task-push.md) which tells callers to
// emit type='task_push' when batch-pushing a spec's tasks. Pre-fix the
// command failed with `Invalid enum value` and callers worked around by
// sending 'spec_created', conflating two distinct audit semantics
// (BUG-2026-05-24-task-push-event-type-enum.md).
//
// 2026-08-20 — the same break recurred (feedback 4678de36 / 2f4ac63f / 9ce61551):
// implement.md Phase 3 instructs `type: "spec_implementation_progress"`, which was
// never in this enum, so every implement run's report event failed validation and
// callers fell back to 'task_completed' — conflating an implementation-run summary
// with an ordinary task completion in the event stream.
//
// Auditing that report found it was 1 of 17: every value below the divider is a type
// a shipped kit command tells consumers to emit, and NONE of them validated. This
// enum is the tool-input contract for those commands; a documented type that is not
// listed here is a broken command, not a rejected caller. `tests/event-type-
// contract.test.ts` now fails the build if the two ever diverge again.
//
// Adding values here is safe: events.type is varchar(50) with no CHECK constraint
// (verified against production 2026-08-20), and server-internal writers already
// store values outside this enum (scope_checked_out, scope_checked_in,
// scope_checkout_forced, proposal_submitted). This is an input allow-list, not a
// DB domain.
export const ProjectEventTypeSchema = z.enum([
  // Core vocabulary — emitted by tools and by hand.
  'meeting_notes',
  'chat_thread',
  'commit',
  'ticket_update',
  'manual_note',
  'spec_created',
  'task_created',
  'task_completed',
  'task_push',
  'document_updated',

  // ---- Command-emitted. Each is instructed by a kit command doc; keep in sync. ----
  'spec_implementation_progress', // implement.md
  'data_sync_complete',           // dbpush.md
  'autofix_started',              // autofix-tests.md
  'test_analysis',                // autofix-tests.md
  'fix_attempt',                  // autofix-tests.md
  'fix_success',                  // autofix-tests.md
  'fix_failed',                   // autofix-tests.md
  'translation_started',          // autofix-translation.md
  'translation_analysis',         // autofix-translation.md
  'translation_validation',       // autofix-translation.md
  'cpl_sync_started',             // sync-cpl.md
  'cpl_discovery',                // sync-cpl.md
  'task_dependency',              // sync-cpl.md
  'starter_kit_sync_started',     // sync-starter-kit.md
  'starter_kit_fetched',          // sync-starter-kit.md
  'starter_kit_backup',           // sync-starter-kit.md
  'starter_kit_complete',         // sync-starter-kit.md

  // [SCOPE 133 / T008] Agent session start. Added to the ZOD enum only — the
  // advertised JSON-Schema enum is derived from this list in server.ts, and has
  // drifted twice when someone hand-copied it. Do not hand-copy it.
  'agent_session_start',          // project.session_start
  // [SCOPE 134 / T009] Override decision — granted, denied, expired or consumed.
  'agent_override',               // project.record_override
  // [SCOPE 137 / T014] Change Impact agreement log (FR-013). Append-only: no tool or route
  // updates or deletes these (tests/change-impact-events.test.ts). Metadata shape below.
  'change_impact_ack',            // a developer agreed to the impact of their own hand edit
  'change_impact_approval',       // a developer approved the AI's change at an Impact Boundary
  'change_impact_crossing',       // an unattended run crossed an Impact Boundary and continued
  // [SCOPE 138 / T012] One record per wxHelpGenerate --teach run (FR-011): who, when, app version,
  // screens, lessons written and which were stale. No learner data exists to record.
  'teaching_skill_generated',     // wxHelpGenerate --teach (_wxAI/skills/wxHelpGenerate/scripts/teach.mjs)
  // [SCOPE 140 / T012] One record per nightly run; [SCOPE 140 / T013] one per framework's evidence
  // folder, with the SHA-256 of every manifest file. Metadata validated below.
  'nightly_run_completed',        // wxPreTest --nightly (_wxAI/skills/wxPreTest/scripts/nightly.mjs)
  'compliance_artifact_written',  // wxPreTest --nightly, after a completely green run only
  // [SCOPE 139 / T012] One record per wxHelpGenerate --video run: who, when, environment, attestation,
  // the pinned HyperFrames version and the videos produced. No footage is ever sent.
  'onboarding_video_generated',   // wxHelpGenerate --video (_wxAI/skills/wxHelpGenerate/scripts/video.mjs)
]);

// [SCOPE 139 / T012] BEGIN — Onboarding video generation metadata (FR-012)
export const OnboardingVideoMetadataSchema = z.object({
  appVersion: z.string().min(1).max(50),
  environment: z.string().min(1).max(50),
  attestation: z.string().min(1).max(100),
  hyperframesVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  videos: z.array(z.object({ lessonId: z.string().min(1).max(200), lessonVersion: z.number().int().min(1), durationS: z.number().min(0), flaggedForSplit: z.boolean() })).max(500),
  refused: z.string().max(500).nullable(),
  occurredAt: z.string().datetime(),
}).passthrough();

export function onboardingVideoMetadataIssues(type: string, metadata: unknown): string[] {
  if (type !== 'onboarding_video_generated') return [];
  const parsed = OnboardingVideoMetadataSchema.safeParse(metadata);
  return parsed.success ? [] : parsed.error.issues.map((i) => `metadata.${i.path.join('.')}: ${i.message}`);
}
// [SCOPE 139 / T012] END

// [SCOPE 140 / T012] BEGIN — Nightly run and compliance-artifact metadata (FR-012, FR-013)
export const NightlyRunMetadataSchema = z.object({
  runId: z.string().min(1).max(100),
  designatedAgent: z.string().min(1).max(255),
  environment: z.enum(['uat', 'fallback']),
  estimateMs: z.number().int().min(0),
  actualMs: z.number().int().min(0),
  selection: z.object({ impacted: z.number().int().min(0), rotation: z.number().int().min(0), carried: z.number().int().min(0), unmapped: z.number().int().min(0) }),
  results: z.object({ total: z.number().int().min(0), passed: z.number().int().min(0), failed: z.number().int().min(0), flaky: z.number().int().min(0), notRun: z.number().int().min(0) }),
  permissionCheck: z.enum(['passed', 'failed', 'not-run']),
  cleanup: z.object({ choice: z.enum(['remove', 'keep-on-failure', 'keep']), removed: z.boolean(), leftovers: z.number().int().min(0).nullable() }),
  green: z.boolean(),
  artifactFrameworks: z.array(z.string().max(30)).max(10),
  notTested: z.array(z.string().max(300)).max(50),
}).passthrough();

export const ComplianceArtifactMetadataSchema = z.object({
  runId: z.string().min(1).max(100),
  framework: z.enum(['SOC2', 'HIPAA', 'GDPR', 'NIST_SSDF', 'ISO27001', 'HITRUST']),
  releaseVersion: z.string().min(1).max(50),
  manifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
  files: z.array(z.object({ file: z.string().min(1).max(200), sha256: z.string().regex(/^[0-9a-f]{64}$/) })).min(1).max(20),
}).passthrough();

/** Issues with a nightly record's metadata; other event types are not checked here. */
export function nightlyMetadataIssues(type: string, metadata: unknown): string[] {
  const schema = type === 'nightly_run_completed' ? NightlyRunMetadataSchema : type === 'compliance_artifact_written' ? ComplianceArtifactMetadataSchema : null;
  if (!schema) return [];
  const parsed = schema.safeParse(metadata);
  return parsed.success ? [] : parsed.error.issues.map((i) => `metadata.${i.path.join('.')}: ${i.message}`);
}
// [SCOPE 140 / T012] END

// [SCOPE 137 / T014] BEGIN — Change Impact agreement log metadata (FR-013)
export const CHANGE_IMPACT_EVENT_TYPES = ['change_impact_ack', 'change_impact_approval', 'change_impact_crossing'] as const;

/**
 * What every agreement-log record carries: the change, the impact list, the mode, the kind,
 * and whether a person was present. `scopes` (3-digit numbers) is what the app's Change
 * Impact tab filters on; `clientEventId` lets a resend from the offline queue be recognized
 * as the same record rather than a second agreement.
 */
export const ChangeImpactEventMetadataSchema = z.object({
  clientEventId: z.string().uuid(),
  kind: z.enum(['acknowledgment', 'approval', 'crossing']),
  attended: z.boolean(),
  mode: z.enum(['notify', 'boundaries', 'always']),
  decision: z.enum(['notify', 'ask', 'stop']),
  answer: z.enum(['agree', 'undo', 'approve', 'decline', 'continued']),
  change: z.object({
    files: z.array(z.string().max(500)).min(1).max(200),
    hash: z.string().min(1).max(128),
    commit: z.string().max(100).optional(),
  }),
  impact: z.object({
    affected: z.number().int().min(0),
    reasons: z.array(z.object({ kind: z.string().max(50), detail: z.string().max(500) })).max(100),
    files: z.array(z.string().max(500)).max(500),
    broad: z.boolean().optional(),
  }),
  scopes: z.array(z.string().regex(/^\d{3}$/)).max(100),
  entryPoint: z.enum(['hook', 'cockpit', 'unattended', 'buildscope', 'remote']),
  occurredAt: z.string().datetime(),
  queued: z.boolean().optional(),
}).passthrough();

const KIND_FOR_TYPE: Record<(typeof CHANGE_IMPACT_EVENT_TYPES)[number], 'acknowledgment' | 'approval' | 'crossing'> = {
  change_impact_ack: 'acknowledgment',
  change_impact_approval: 'approval',
  change_impact_crossing: 'crossing',
};

/** A self-agreement must never be stored as an approval (FR-013): the type and the kind must agree. */
export function changeImpactMetadataIssues(type: string, metadata: unknown): string[] {
  if (!(CHANGE_IMPACT_EVENT_TYPES as readonly string[]).includes(type)) return [];
  const parsed = ChangeImpactEventMetadataSchema.safeParse(metadata);
  if (!parsed.success) return parsed.error.issues.map((i) => `metadata.${i.path.join('.')}: ${i.message}`);
  const expected = KIND_FOR_TYPE[type as (typeof CHANGE_IMPACT_EVENT_TYPES)[number]];
  if (parsed.data.kind !== expected) return [`metadata.kind must be "${expected}" for ${type}`];
  if (type === 'change_impact_crossing' && parsed.data.attended) return ['metadata.attended must be false for a crossing'];
  return [];
}
// [SCOPE 137 / T014] END

// Task status and priority
export const TaskStatusSchema = z.enum(['todo', 'in_progress', 'blocked', 'done']);
export const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

// User role
export const UserRoleSchema = z.enum(['read_only', 'editor', 'admin']);

// Capture Event Input
export const CaptureEventInputSchema = z.object({
  projectId: z.string().uuid(),
  type: ProjectEventTypeSchema,
  source: z.string().min(1).max(50),
  actor: z.string().min(1).max(255),
  rawContent: z.string().min(1),
  normalizedContent: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  // BUG-2026-07-18 (Minor 3b): first-class spec association. The events table has
  // no specid column (yet), so the handler folds this into metadata.specId —
  // queryable via metadata->>'specId'. A dedicated column can follow if indexed
  // spec-scoped event queries are needed.
  specId: z.string().uuid().optional(),
}).superRefine((input, ctx) => {
  // [SCOPE 137 / T014] Agreement-log records are validated in full before they are stored.
  for (const message of changeImpactMetadataIssues(input.type, input.metadata)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['metadata'], message });
  }
  // [SCOPE 140 / T012] Nightly records too.
  for (const message of nightlyMetadataIssues(input.type, input.metadata)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['metadata'], message });
  }
  // [SCOPE 139 / T012] Onboarding video records too.
  for (const message of onboardingVideoMetadataIssues(input.type, input.metadata)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['metadata'], message });
  }
});

// Capture Event Result
export const CaptureEventResultSchema = z.object({
  event: z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    type: ProjectEventTypeSchema,
    source: z.string(),
    actor: z.string(),
    rawContent: z.string(),
    normalizedContent: z.string().nullable(),
    metadata: z.record(z.unknown()).nullable(),
    createdAt: z.string().datetime(),
  }),
});

// Upsert Document Input
export const UpsertDocumentInputSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(500),
  bodyMarkdown: z.string().min(1),
  sourceEventId: z.string().uuid().optional(),
  taskIds: z.array(z.string().uuid()).optional(),
  tags: z.array(z.string().max(100)).optional(),
  documentId: z.string().uuid().optional(),
  // doctype is REQUIRED. Every document carries a doctype so it is locatable by
  // the doctype-based read paths (doc-status, viewers, get_stack); a doctype-less
  // row is an orphan no surface can find, and the projectdocuments column is NOT
  // NULL in the app schema (insert would fail). Project-level docs are
  // matched/upserted by (projectId, doctype, title) with specId IS NULL; per-scope
  // docs by (projectId, doctype, specId). The earlier title-only fallback is gone.
  doctype: z.string().min(1).max(50),
  // [SCOPE 060] Optional specId. When provided alongside doctype, the row is
  // matched/upserted by (projectId, doctype, specId) and specId is stored — so
  // per-scope docs (e.g. ScopeAnalysis) keep one row per spec. Omitted →
  // project-level behavior (match by doctype, specId null).
  specId: z.string().uuid().optional(),
});

// Upsert Document Result
export const UpsertDocumentResultSchema = z.object({
  document: z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    title: z.string(),
    bodyMarkdown: z.string(),
    sourceEventId: z.string().uuid().nullable(),
    taskIds: z.array(z.string().uuid()),
    tags: z.array(z.string()),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
  created: z.boolean(),
});

// Create Task Input
export const CreateTaskInputSchema = z.object({
  projectId: z.string().uuid(),
  specId: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  descriptionMarkdown: z.string().min(1),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  dueDate: z.string().datetime().optional(),
  sourceEventId: z.string().uuid().optional(),
  documentIds: z.array(z.string().uuid()).optional(),
  assignee: z.string().max(255).optional(),
});

// [SCOPE 043 / T002] BEGIN — submit_feedback input (User Feedback channel)
// MODIFIED-BY: [SCOPE 043 / T025] — Amendment E: bounded text attachments (FR-023)
// MODIFIED-BY: [SCOPE 126 / T001] — FR-016: server-side content boundary on attachments
export const FeedbackTypeSchema = z.enum(['bug', 'suggestion']);
export const FeedbackNotificationChannelSchema = z.enum(['inapp', 'email']);

// [SCOPE 043 / T025] Ceilings mirror the Cockpit reader (services/attachments.ts).
// They are re-asserted here because the client is not the enforcement point: the
// MCP tool is reachable by whatever the caller's token allows, and the reason
// these bounds exist (list payloads, triage prompt cost — Amendment E) is a
// server-side reason.
export const ATTACHMENT_MAX_FILES = 3;
/** 128 KB of content plus headroom for the truncation marker the reader prepends. */
export const ATTACHMENT_MAX_CONTENT_CHARS = 132_000;
export const ATTACHMENT_MAX_TOTAL_CHARS = 262_144;

export const FeedbackAttachmentSchema = z
  .object({
    name: z.string().min(1).max(255),
    /** Size on disk before truncation — may legitimately exceed the content length. */
    bytes: z.number().int().nonnegative(),
    truncated: z.boolean(),
    /**
     * Credential values masked client-side (FR-024); 0 means "scanned, nothing
     * found" — as CLAIMED by the caller. [SCOPE 126 / T001] the server no longer
     * takes that on trust; it rescans and adds its own count.
     */
    redactions: z.number().int().nonnegative(),
    content: z.string().max(ATTACHMENT_MAX_CONTENT_CHARS),
  })
  // [SCOPE 126 / T001] FR-016 — the content boundary, enforced where it binds.
  // The Cockpit already refuses these files; this closes the path around it for
  // any other token holder. Reject what masking cannot fix (wrong KIND of file);
  // mask what it can (secrets inside a legitimate log).
  .superRefine((a, ctx) => {
    const reason = attachmentRejectionReason(a);
    if (reason) ctx.addIssue({ code: z.ZodIssueCode.custom, message: reason });
  })
  .transform(sanitizeAttachment);
export type FeedbackAttachment = z.infer<typeof FeedbackAttachmentSchema>;

export const SubmitFeedbackInputSchema = z.object({
  projectId: z.string().uuid(),
  type: FeedbackTypeSchema,
  title: z.string().min(1).max(255),
  // Persona-elicited structured answers (Bug Reporter / Feature Suggester) — not freeform.
  details: z.record(z.unknown()),
  // [SCOPE 043 / T025] Text attachments (Amendment E). A first-class, validated
  // field rather than another `details` key — `details` is a free-form record,
  // so folding attachments into it would make every cap above advisory.
  attachments: z
    .array(FeedbackAttachmentSchema)
    .max(ATTACHMENT_MAX_FILES)
    .superRefine((files, ctx) => {
      const total = files.reduce((n, f) => n + f.content.length, 0);
      if (total > ATTACHMENT_MAX_TOTAL_CHARS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `attachments total ${total} characters, over the ${ATTACHMENT_MAX_TOTAL_CHARS} limit`,
        });
      }
    })
    .optional(),
  // Auto-captured context: kitversion, activescope, vscodeversion, os.
  context: z.record(z.unknown()).optional(),
  notificationChannel: FeedbackNotificationChannelSchema.optional(),
});
export type SubmitFeedbackInput = z.infer<typeof SubmitFeedbackInputSchema>;
// [SCOPE 043 / T002] END

// [SCOPE 043 / T007] BEGIN — needs-info round (list own feedback + answer)
export const FeedbackStatusSchema = z.enum([
  'new',
  'triaged',
  'needsinfo',
  'inprogress',
  'resolved',
  'declined',
]);
export const ListMyFeedbackInputSchema = z.object({
  projectId: z.string().uuid(),
  status: FeedbackStatusSchema.optional(),
  maxItems: z.number().int().positive().max(100).optional(),
  // [SCOPE 110 / T011] default excludes submitter-hidden items (FR-004).
  includeHidden: z.boolean().optional(),
  // [SCOPE 043 amendment 2026-08-03] Vendor's INCOMING queue: feedback submitted by
  // OTHER companies into the sink this caller's company owns. Refused unless the
  // caller's company actually owns the sink, so it is not a way to read across
  // tenants by asking nicely.
  incoming: z.boolean().optional(),
});
export type ListMyFeedbackInput = z.infer<typeof ListMyFeedbackInputSchema>;

// [SCOPE 110 / T011] BEGIN — submitter manages own feedback visibility/removal
// FR-004 hide/unhide (reversible) and FR-005 self-delete (audited, owner-only).
// Bulk-first: acts on a set of ids; a single item is a one-element call.
export const ManageMyFeedbackInputSchema = z.object({
  projectId: z.string().uuid(),
  action: z.enum(['hide', 'unhide', 'delete']),
  ids: z.array(z.string().uuid()).min(1).max(200),
});
export type ManageMyFeedbackInput = z.infer<typeof ManageMyFeedbackInputSchema>;
// [SCOPE 110 / T011] END

export const AnswerFeedbackInputSchema = z.object({
  projectId: z.string().uuid(),
  feedbackId: z.string().uuid(),
  answer: z.string().min(1).max(5000),
});
export type AnswerFeedbackInput = z.infer<typeof AnswerFeedbackInputSchema>;
// [SCOPE 043 / T007] END

// [SCOPE 043 / T011b] BEGIN — triage_feedback: submitter marks own item triaged
export const TriageFeedbackInputSchema = z.object({
  projectId: z.string().uuid(),
  feedbackId: z.string().uuid(),
});
export type TriageFeedbackInput = z.infer<typeof TriageFeedbackInputSchema>;
// [SCOPE 043 / T011b] END

// [SCOPE 043 / T021] BEGIN — update_feedback_status input (vendor status transitions)
// MODIFIED-BY: [SCOPE 148 / T003] — resolutionTemplate + fixedInVersion and their refusals (FR-010)
// FR-018: `note` is optional in general but REQUIRED when declining OR requesting
// more info, because the web path rejects a reason-less decline and the submitter's
// notification quotes it. Declining stores the note as declineReason; needsinfo
// stores it as clarificationQuestion. Without this rule both transitions would be
// unreachable — or silently wrong — over MCP.
export const UpdateFeedbackStatusInputSchema = z
  .object({
    projectId: z.string().uuid(),
    feedbackId: z.string().uuid(),
    status: z.enum(FEEDBACK_STATUSES),
    note: z.string().min(1).max(4000).optional(),
    resolutionTemplate: z.enum(RESOLUTION_TEMPLATES).optional(),
    fixedInVersion: z.string().max(40).optional(),
  })
  .superRefine((v, ctx) => {
    // SPEC-148 FR-010: a template means the server writes the whole message, so it can
    // never travel with caller text, and kit/cockpit need the version they name.
    if (v.resolutionTemplate !== undefined) {
      if (v.status !== 'resolved') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['resolutionTemplate'], message: 'resolutionTemplate applies only when status is resolved' });
      }
      if (v.note !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['note'], message: 'note cannot be sent with resolutionTemplate; the server writes the whole message' });
      }
      if (v.resolutionTemplate !== 'hosted' && v.fixedInVersion === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fixedInVersion'], message: `fixedInVersion is required for the ${v.resolutionTemplate} template` });
      }
    } else if (v.fixedInVersion !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fixedInVersion'], message: 'fixedInVersion is only used with resolutionTemplate' });
    }
    if (v.fixedInVersion !== undefined && !SEMVER_PATTERN.test(v.fixedInVersion)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fixedInVersion'], message: 'fixedInVersion must be a version like 1.7.78' });
    }
    if (v.status === 'declined' && !v.note?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'note is required when declining; it is stored as the decline reason',
      });
    }
    // Mirrors the declined rule: without a required note, needsinfo has no
    // clarifying question to store, and the submitter would see the generic
    // "please add details." fallback — or worse, a stale question from an
    // earlier round that answer_feedback never cleared.
    if (v.status === 'needsinfo' && !v.note?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'note is required when requesting more info; it is stored as the clarification question',
      });
    }
  });
export type UpdateFeedbackStatusInput = z.infer<typeof UpdateFeedbackStatusInputSchema>;
// [SCOPE 043 / T021] END

// [SCOPE 043 / T017] BEGIN — scope-seed materialization (kit ⇄ server)
export const ListScopeSeedsInputSchema = z.object({
  projectId: z.string().uuid(),
});
export type ListScopeSeedsInput = z.infer<typeof ListScopeSeedsInputSchema>;

export const RecordScopeMaterializedInputSchema = z.object({
  projectId: z.string().uuid(),
  feedbackId: z.string().uuid(),
  scopeNumber: z.string().regex(/^\d{3}$/, 'scopeNumber must be a 3-digit NNN'),
});
export type RecordScopeMaterializedInput = z.infer<typeof RecordScopeMaterializedInputSchema>;
// [SCOPE 043 / T017] END

// Create Task Result
export const CreateTaskResultSchema = z.object({
  task: z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    title: z.string(),
    descriptionMarkdown: z.string(),
    status: TaskStatusSchema,
    priority: TaskPrioritySchema,
    dueDate: z.string().datetime().nullable(),
    sourceEventId: z.string().uuid().nullable(),
    documentIds: z.array(z.string().uuid()),
    assignee: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
});

// Update Task Status Input
export const UpdateTaskStatusInputSchema = z.object({
  taskId: z.string().uuid(),
  status: TaskStatusSchema,
});

// Update Task Status Result
export const UpdateTaskStatusResultSchema = z.object({
  task: z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    title: z.string(),
    descriptionMarkdown: z.string(),
    status: TaskStatusSchema,
    priority: TaskPrioritySchema,
    dueDate: z.string().datetime().nullable(),
    sourceEventId: z.string().uuid().nullable(),
    documentIds: z.array(z.string().uuid()),
    assignee: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
});

// [SCOPE 074 / T004] BEGIN — capability index tool inputs (projectId derived from token scope, not input)
const CapabilityTypeSchema = z.enum(['process', 'table', 'route', 'doctype', 'command', 'workflow']);
const SourceTypeSchema = z.enum(['scope', 'app', 'code']);

export const IndexCapabilitiesInputSchema = z.object({
  sourceRef: z.string().min(1).max(128),
  sourceType: SourceTypeSchema,
  capabilities: z
    .array(
      z.object({
        owner: z.string().min(1).max(255),
        capabilityType: CapabilityTypeSchema,
        name: z.string().min(1).max(255),
        description: z.string().min(1),
      }),
    )
    .max(500),
});

export const SearchCapabilitiesInputSchema = z.object({
  queryText: z.string().min(1),
  topK: z.number().int().min(1).max(100).optional(),
  sourceType: SourceTypeSchema.optional(),
  capabilityType: CapabilityTypeSchema.optional(),
});
// [SCOPE 074 / T004] END

// [SCOPE 073 / T003] BEGIN — set_scope_dependencies input (raw Depends On / Related lines; server resolves)
export const SetScopeDependenciesInputSchema = z.object({
  scopeNumber: z.number().int().min(1).max(999),
  dependsOnRaw: z.string().max(4000).optional(),
  relatedRaw: z.string().max(4000).optional(),
});
// [SCOPE 073 / T003] END

// Link Doc to Task Input
export const LinkDocToTaskInputSchema = z.object({
  taskId: z.string().uuid(),
  documentId: z.string().uuid(),
});

// Link Doc to Task Result
export const LinkDocToTaskResultSchema = z.object({
  task: z.object({
    id: z.string().uuid(),
    title: z.string(),
    documentIds: z.array(z.string().uuid()),
  }),
  document: z.object({
    id: z.string().uuid(),
    title: z.string(),
    taskIds: z.array(z.string().uuid()),
  }),
});

// List Open Items Input
export const ListOpenItemsInputSchema = z.object({
  projectId: z.string().uuid(),
  maxItems: z.number().int().min(1).max(100).optional(),
  // Optional filters for list_open_items. cockpit_summary reuses this schema and
  // ignores the fields it does not need, so they are safe to add here.
  status: z.array(z.string().min(1)).nonempty().optional(), // filter tasks by status; omit = all statuses
  since: z.string().datetime().optional(), // ISO 8601; return only events at/after this instant
  // BUG-2026-07-18 (Issue 4): make reads scale. list_open_items uses these.
  offset: z.number().int().min(0).optional(), // pagination cursor within each category (default 0)
  // [SCOPE 124 / T006] `specs` added. The envelope previously carried only tasks,
  // documents and events, so a caller asking "which specs already exist?" had no way to
  // ask — which is why dbpush inferred it by regex-matching task titles. Additive: an
  // omitted `category` now also returns `specs`, and existing values are unchanged.
  category: z.enum(['tasks', 'documents', 'events', 'specs']).optional(), // return only this collection; omit = all four
  documentBody: z.enum(['none', 'preview', 'full']).optional(), // 'none' omits preview/body (smallest), 'preview' (default) = bodyChars+200-char preview, 'full' = whole body
  // Single-scope filter — cockpit_summary uses these to return one spec instead of
  // the whole project. Match by EITHER specId OR specNumber.
  specId: z.string().uuid().optional(),
  specNumber: z.string().min(1).max(10).optional(),
  // [SCOPE 137 / T019] cockpit_summary only: answer { projectId, impactMode } and nothing else.
  impactModeOnly: z.boolean().optional(),
});

// [SCOPE 058 / T003] BEGIN — scope check-out / check-in tool inputs
export const CheckoutScopeInputSchema = z.object({
  projectId: z.string().uuid(),
  specNumber: z.string().min(1).max(10),
  force: z.boolean().optional(),
});

export const CheckinScopeInputSchema = z.object({
  projectId: z.string().uuid(),
  specNumber: z.string().min(1).max(10),
});
// [SCOPE 058 / T003] END

// List Open Items Result
export const ListOpenItemsResultSchema = z.object({
  tasks: z.array(z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    title: z.string(),
    descriptionMarkdown: z.string(),
    status: TaskStatusSchema,
    priority: TaskPrioritySchema,
    dueDate: z.string().datetime().nullable(),
    sourceEventId: z.string().uuid().nullable(),
    documentIds: z.array(z.string().uuid()),
    assignee: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })),
  documents: z.array(z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    title: z.string(),
    bodyMarkdown: z.string(),
    sourceEventId: z.string().uuid().nullable(),
    taskIds: z.array(z.string().uuid()),
    tags: z.array(z.string()),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })),
  events: z.array(z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    type: ProjectEventTypeSchema,
    source: z.string(),
    actor: z.string(),
    rawContent: z.string(),
    normalizedContent: z.string().nullable(),
    metadata: z.record(z.unknown()).nullable(),
    createdAt: z.string().datetime(),
  })),
});

// Spec Task Definition
export const SpecTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  priority: TaskPrioritySchema,
  status: TaskStatusSchema.default('todo'),
});

// [SCOPE 058 dedup] Merge a duplicate spec into a keeper (same specNumber).
export const MergeScopeInputSchema = z.object({
  projectId: z.string().uuid(),
  fromSpecId: z.string().uuid(), // the duplicate to remove
  intoSpecId: z.string().uuid(), // the keeper to reassign children to
  dryRun: z.boolean().default(false),
});
export type MergeScopeInput = z.infer<typeof MergeScopeInputSchema>;

// [SCOPE 098 / T007] BEGIN — delete_scope input (permanent removal, MCP parity with the web route)
// The web UI has had DELETE /projects/:id/scopes/:scopeid since T001; the MCP had no
// equivalent, which is why SCOPE-124/T015 has sat blocked. Targets by EITHER specId
// (uuid) OR specNumber — exactly one, mirroring TaskSpecLinkSchema — because a caller
// working from a scope document knows the number, not the row id.
//
// Two separate brakes, and they are not interchangeable:
//   dryRun — report what WOULD be removed and mutate nothing.
//   force  — proceed even though the scope still owns tasks or documents.
// Both default false, so the destructive path is never the one a caller gets by omission.
export const DeleteScopeInputSchema = z
  .object({
    projectId: z.string().uuid(),
    specId: z.string().uuid().optional(),
    specNumber: z.string().min(1).max(10).optional(),
    dryRun: z.boolean().default(false),
    force: z.boolean().default(false),
  })
  .refine((i) => (i.specId ? 1 : 0) + (i.specNumber ? 1 : 0) === 1, {
    message: 'Requires exactly one of specId or specNumber',
  });
export type DeleteScopeInput = z.infer<typeof DeleteScopeInputSchema>;
// [SCOPE 098 / T007] END

// [SCOPE 134 / T009] BEGIN — override record (the decision, after the fact)
// This is an AUDIT SINK, not a gate. The room is the approval channel: a blocked action
// suspends in the bridge via canUseTool, the request surfaces to the operator, the
// operator answers there, and the bridge then records what happened here. The server
// cannot enforce an override because it cannot execute anything — only the local runtime
// can. Recording is what makes the decision reviewable afterwards.
//
// The constitution (amended 2026-09-23) permits exactly this shape: a tool may REQUEST an
// override and may never self-approve one. `grantedby` therefore names a human and is
// required on a grant — a record without one is not an approval.
export const OverrideActionSchema = z.enum([
  'gitpush',      // the irreversible one: deploys app AND MCP, no staging
  'prodatawrite', // a write to the production database
]);

export const RecordOverrideInputSchema = z
  .object({
    projectId: z.string().uuid(),
    agentName: z.string().min(1).max(64),
    // Correlates the decision to the session that asked. Recorded, never validated —
    // the server holds no session state.
    sessionId: z.string().min(1).max(64).optional(),
    action: OverrideActionSchema,
    outcome: z.enum(['granted', 'denied', 'expired', 'consumed']),
    // Who answered. Required for a grant: the whole point is that no tool self-approves.
    grantedBy: z.string().min(1).max(200).optional(),
    // What the operator was actually shown when they answered. Stored verbatim so a
    // later reader judges the decision on what was in front of the human, not on a
    // summary written afterwards.
    requestText: z.string().max(4000).optional(),
    // Minutes from now. Absent means single-use: good for this one action only.
    expiresInMinutes: z.number().int().min(1).max(1440).optional(),
    detail: z.record(z.unknown()).optional(),
  })
  .refine((i) => i.outcome !== 'granted' || !!i.grantedBy, {
    message: 'grantedBy is required when outcome is "granted" — a tool never self-approves',
  });
export type RecordOverrideInput = z.infer<typeof RecordOverrideInputSchema>;
// [SCOPE 134 / T009] END

// [SCOPE 101 / T002] BEGIN — link_task_to_spec input (re-parent existing tasks)
// Repair path for tasks created via create_task (which never set specid) or
// otherwise orphaned. A task's specid is the ONLY thing cockpit_summary groups
// on, so a null/unmatched specid renders the task as unlinked. This tool sets it.
// Batch by design: a real project has dozens–hundreds of orphaned tasks, and one
// MCP round-trip per task is impractical. Each link targets its spec by EITHER a
// specId (uuid) OR a specNumber (e.g. "0012") — exactly one, never both.
export const TaskSpecLinkSchema = z
  .object({
    taskId: z.string().uuid(),
    specId: z.string().uuid().optional(),
    specNumber: z.string().min(1).max(10).optional(),
  })
  .refine((l) => (l.specId ? 1 : 0) + (l.specNumber ? 1 : 0) === 1, {
    message: 'Each link requires exactly one of specId or specNumber',
  });
export const LinkTaskToSpecInputSchema = z.object({
  projectId: z.string().uuid(),
  links: z.array(TaskSpecLinkSchema).min(1).max(500),
});
export type LinkTaskToSpecInput = z.infer<typeof LinkTaskToSpecInputSchema>;
// [SCOPE 101 / T002] END

// [SCOPE 123 / T018] BEGIN — scope_stage + backfill_scope_stages inputs
// scope_stage names its scope by EITHER specId OR specNumber — exactly one, like
// update_spec_status. backfill_scope_stages is a dry run unless confirm is true.
export const ScopeStageInputSchema = z
  .object({
    projectId: z.string().uuid(),
    specId: z.string().uuid().optional(),
    specNumber: z.string().min(1).max(10).optional(),
  })
  .refine((v) => (v.specId ? 1 : 0) + (v.specNumber ? 1 : 0) === 1, {
    message: 'Provide exactly one of specId or specNumber.',
  });
export type ScopeStageInput = z.infer<typeof ScopeStageInputSchema>;

export const BackfillScopeStagesInputSchema = z.object({
  projectId: z.string().uuid(),
  confirm: z.boolean().default(false),
});
export type BackfillScopeStagesInput = z.infer<typeof BackfillScopeStagesInputSchema>;
// [SCOPE 123 / T018] END

// [SCOPE 101 / T004] BEGIN — update_spec_status input (spec lifecycle transition)
// The canonical lifecycle vocabulary write-path. These are the exact statuses
// create_specs assigns from `phase` (draft→…→released); projectspecifications.status
// is a free varchar, so the enum here is the guard that keeps a transition inside
// this vocabulary. Target the spec by EITHER specId (uuid) OR specNumber — exactly one.
//
// [SCOPE 122 / T005] CORRECTION. This comment used to claim the enum kept transitions
// "inside the vocabulary the app's PhaseService and cockpit understand." That was FALSE
// for half of these values and it cost a customer real time: `qa`, `human_testing`,
// `beta` and `archived` were all unknown to the Kanban board, whose placement was a bare
// lookup, so a scope set to any of them rendered in NO column and simply vanished.
// Measured 2026-08-03: 8 of one customer's 9 scopes invisible, every one status `beta`.
//
// The enum is a real guard against junk — zod rejects anything outside this list and
// names the valid set — but it was never evidence that the app could DISPLAY the result.
// The board now maps this vocabulary (SCOPE-122 / T001) and falls back to a visible
// column for anything unmapped (T002), and a drift guard fails the build if the two
// sides diverge again (T006). Do not re-add a claim about the app's understanding here;
// the guard is what makes it true, not the comment.
export const SpecStatusSchema = z.enum([
  'draft',
  'planned',
  'implementing',
  'qa',
  'human_testing',
  'beta',
  'released',
  'archived',
  // [SCOPE 122 / T009] `deferred` closes an asymmetry surfaced by the SCOPE-122 audit:
  // the app could defer a scope (it has a Deferred column and the status in its union)
  // but the MCP could not write it, so the orchestrator and Claude had no way to park a
  // scope. Safe to add because the board already maps `deferred` to its own column —
  // this widens what can be written to something already renderable, which is the
  // opposite of the defect that started this scope.
  'deferred',
]);
export const UpdateSpecStatusInputSchema = z
  .object({
    projectId: z.string().uuid(),
    specId: z.string().uuid().optional(),
    specNumber: z.string().min(1).max(10).optional(),
    // BUG-2026-07-18 (Issue 6): status is now optional so this tool can also
    // rename a spec. Provide status, title, or both — the refine below requires
    // at least one. projectspecifications.title is varchar(500).
    status: SpecStatusSchema.optional(),
    title: z.string().min(1).max(500).optional(),
  })
  .refine((v) => (v.specId ? 1 : 0) + (v.specNumber ? 1 : 0) === 1, {
    message: 'Provide exactly one of specId or specNumber',
  })
  .refine((v) => v.status !== undefined || v.title !== undefined, {
    message: 'Provide at least one of status or title to update',
  });
export type UpdateSpecStatusInput = z.infer<typeof UpdateSpecStatusInputSchema>;
// [SCOPE 101 / T004] END

// [SCOPE 101 / T013] BEGIN — update_task / delete_task inputs (Amendment B)
// update_task is a PATCH: only the fields sent change. Status and spec link are
// deliberately absent — update_task_status and link_task_to_spec own those, and a
// second write path for either would split their vocabularies. dueDate and
// assignedToId accept null to clear. assignedToId writes projecttasks.assignedtoid,
// the column the app reads — not create_task's free-text `assignee`.
export const UpdateTaskInputSchema = z
  .object({
    taskId: z.string().uuid(),
    title: z.string().min(1).max(255).optional(),
    descriptionMarkdown: z.string().optional(),
    priority: TaskPrioritySchema.optional(),
    dueDate: z.string().date().or(z.string().datetime()).nullable().optional(),
    assignedToId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (p) =>
      p.title !== undefined ||
      p.descriptionMarkdown !== undefined ||
      p.priority !== undefined ||
      p.dueDate !== undefined ||
      p.assignedToId !== undefined,
    { message: 'update_task requires at least one of title, descriptionMarkdown, priority, dueDate, assignedToId' },
  );
export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

export const DeleteTaskInputSchema = z.object({
  taskId: z.string().uuid(),
});
export type DeleteTaskInput = z.infer<typeof DeleteTaskInputSchema>;
// [SCOPE 101 / T013] END

// [SCOPE 135 / T005] BEGIN — one stated create_specs contract
/**
 * FR-008. The create_specs description used to demand literal "## Business Problem" and "## Actors"
 * headings. The gate is runPreflight — the same function project.validatescope runs — and it also
 * accepts a Core Design table and "## Success Criteria", and falls back to the Overview for the
 * business problem. 523f65ed restructured a scope that already scored 100 because of the old text.
 */
export const CREATE_SPECS_SCOPE_CONTENT_DESCRIPTION =
  'The FULL scope document in Markdown, not just an Overview body. It is scored by the same preflight gate as project.validatescope, so a scope that passes validatescope passes here. To pass it needs: a business problem ("## Business Problem", or else the "## Overview" text); a primary and at least one secondary actor ("## Actors" with "Primary:" and "Secondary:" lines, or "Primary Actor" / "Secondary Actors" rows in a Core Design table); 3+ measurable metrics under "## Success Metrics" or "## Success Criteria"; what is included ("## Scope Boundary" / "## In Scope", or a Core Design "Scope Boundary" row); what is excluded ("## Out of Scope", or that same row); and no TODO, TBD, NEEDS CLARIFICATION or "placeholder" markers. Also include "## Overview" and "## Open Questions" (or "## Clarifications"): neither blocks on its own, but each one missing lowers the score, and the gate also requires a score of 80 or more.';
// [SCOPE 135 / T005] END

// Create Specs Input
export const CreateSpecsInputSchema = z.object({
  projectId: z.string().uuid(),
  specNumber: z.string().min(1).max(10),
  featureName: z.string().min(1).max(255),
  scopeContent: z.string().min(1).describe(CREATE_SPECS_SCOPE_CONTENT_DESCRIPTION), // [SCOPE 135 / T005]
  phase: z.enum(['scoping', 'design', 'implementation', 'qa', 'human_testing', 'beta', 'released']).default('scoping'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  tasks: z.array(SpecTaskSchema).optional(),
  generateLifecycle: z.boolean().default(true),
});

// Create Specs Result
export const CreateSpecsResultSchema = z.object({
  success: z.boolean().default(true),
  blocked: z.boolean().default(false),
  message: z.string().optional(),
  blockingIssues: z.array(z.string()).default([]),
  preflight: z.object({
    success: z.boolean(),
    specNumber: z.string(),
    filePath: z.string(),
    status: z.enum(['valid', 'invalid', 'error']),
    isValid: z.boolean(),
    score: z.number().min(0).max(100),
    placeholdersFound: z.array(z.string()),
    blockingIssues: z.array(z.string()),
    minimumCriteriaStatus: z.object({
      businessProblem: z.boolean(),
      primaryActor: z.boolean(),
      secondaryActors: z.boolean(),
      measurableSuccessMetrics: z.boolean(),
      scopeBoundary: z.boolean(),
      outOfScope: z.boolean(),
      noPlaceholders: z.boolean(),
    }),
    message: z.string(),
  }).nullable().optional(),
  spec: z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    specNumber: z.string(),
    title: z.string(),
    status: z.string(),
    createdAt: z.string().datetime(),
  }).nullable(),
  documents: z.array(z.object({
    id: z.string().uuid(),
    title: z.string(),
    type: z.enum(['spec', 'plan', 'tasks', 'quickstart', 'lifecycle']),
  })),
  tasks: z.array(z.object({
    id: z.string().uuid(),
    title: z.string(),
    status: TaskStatusSchema,
  })),
  lifecycleGenerated: z.boolean(),
  projectLifecycleUpdated: z.boolean(),
  events: z.array(z.object({
    id: z.string().uuid(),
    type: z.string(),
  })),
});

// Check for Updates Input
export const CheckForUpdatesInputSchema = z.object({
  force: z.boolean().default(false),
});

// Check for Updates Result
export const CheckForUpdatesResultSchema = z.object({
  currentVersion: z.string(),
  latestVersion: z.string().nullable(),
  updateAvailable: z.boolean(),
  releaseInfo: z.object({
    version: z.string(),
    tagName: z.string(),
    publishedAt: z.string(),
    htmlUrl: z.string(),
    tarballUrl: z.string(),
    body: z.string(),
    prerelease: z.boolean(),
    draft: z.boolean(),
  }).nullable(),
  lastChecked: z.string().datetime().nullable(),
  error: z.string().optional(),
});

// Upgrade MCP Input
export const UpgradeMcpInputSchema = z.object({
  version: z.string().optional(),
  dryRun: z.boolean().default(false),
});

// Upgrade MCP Result
export const UpgradeMcpResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  previousVersion: z.string().optional(),
  newVersion: z.string().optional(),
});

// Git Init Repo Input
export const GitInitRepoInputSchema = z.object({
  projectPath: z.string().min(1).max(500).describe('Path to the project directory'),
  remoteUrl: z.string().url().optional().describe('Remote repository URL (optional)'),
  commitMessage: z.string().max(255).optional().describe('Custom commit message (optional)'),
  pushToRemote: z.boolean().default(false).describe('Push to remote after initialization (optional)'),
});

// Git Init Repo Result
export const GitInitRepoResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  projectPath: z.string(),
  commitMessage: z.string(),
  alreadyInitialized: z.boolean().optional(),
  remoteAdded: z.boolean(),
  remoteUrl: z.string().nullable(),
  pushed: z.boolean(),
});

// Git Commit Input
export const GitCommitInputSchema = z.object({
  projectPath: z.string().min(1).max(500).describe('Path to the project directory'),
  message: z.string().max(255).optional().describe('Custom commit message (optional)'),
  skipChangelog: z.boolean().default(false).describe('Skip changelog update (optional)'),
});

// Git Commit Result
export const GitCommitResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  commitHash: z.string().optional(),
  filesCommitted: z.number(),
  changelogUpdated: z.boolean(),
});

// Git Push Input
export const GitPushInputSchema = z.object({
  projectPath: z.string().min(1).max(500).describe('Path to the project directory'),
  remote: z.string().default('origin').describe('Remote name (optional)'),
  branch: z.string().optional().describe('Branch name (optional)'),
  force: z.boolean().default(false).describe('Force push (optional)'),
});

// Git Push Result
export const GitPushResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  remote: z.string(),
  branch: z.string(),
  commitsPushed: z.number().optional(),
});

// Git Merge Input
export const GitMergeInputSchema = z.object({
  projectPath: z.string().min(1).max(500).describe('Path to the project directory'),
  sourceBranch: z.string().describe('Source branch to merge from'),
  targetBranch: z.string().default('main').describe('Target branch to merge into (optional)'),
  createNewBranch: z.boolean().default(true).describe('Create a new working branch after merge (optional)'),
  newBranchName: z.string().optional().describe('Name for the new branch (optional)'),
});

// Git Merge Result
export const GitMergeResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  mergedBranch: z.string(),
  targetBranch: z.string(),
  newBranchCreated: z.boolean(),
  newBranchName: z.string().optional(),
});

// Project Kit Status Input
export const GetKitStatusInputSchema = z.object({
  projectId: z.string().uuid(),
});

// Project Kit Status Result
export const GetKitStatusResultSchema = z.object({
  status: z.enum(['not_generated', 'generating', 'ready', 'failed']),
  primaryAI: z.string().nullable(),
  kitVersion: z.string().nullable(),
  downloadUrl: z.string().nullable(),
  generatedAt: z.string().datetime().nullable(),
  downloadCount: z.number().int().nullable(),
});

// Download Kit Input
export const DownloadKitInputSchema = z.object({
  projectId: z.string().uuid(),
});

// Download Kit Result
export const DownloadKitResultSchema = z.object({
  success: z.boolean(),
  downloadUrl: z.string(),
  filename: z.string(),
  expiresAt: z.string().datetime().optional(),
});

// Regenerate Kit Input
export const RegenerateKitInputSchema = z.object({
  projectId: z.string().uuid(),
});

// Regenerate Kit Result
export const RegenerateKitResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  status: z.enum(['generating', 'ready', 'failed']),
  kitVersion: z.string(),
});

// Import Project Input
export const ImportProjectInputSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  primaryAI: z.enum(['claude-code', 'blackboxai', 'cursor', 'copilot', 'generic']).default('generic'),
  localDirectoryPath: z.string().max(500).optional(),
  generateKit: z.boolean().default(true),
  phaseAssignments: z.record(z.string()).optional(),
  companyId: z.string().uuid(),
});

// Import Project Result
export const ImportProjectResultSchema = z.object({
  project: z.object({
    id: z.string().uuid(),
    name: z.string(),
    status: z.string(),
    createdAt: z.string().datetime(),
  }),
  kit: z.object({
    status: z.string(),
    downloadUrl: z.string().optional(),
    primaryAI: z.string(),
  }).optional(),
  scaffolding: z.string(),
});

// Create API Token Input
export const CreateApiTokenInputSchema = z.object({
  label: z.string().max(100).optional(),
  companyId: z.string().uuid().optional(),
  // Phase 11 made a token project-scoped: mcpapitokens.projectid is NOT NULL, and
  // only a project-scoped row authenticates against the hosted MCP. Optional here
  // because the tool is project-scoped, so the caller's own token supplies it.
  projectId: z.string().uuid().optional(),
});

// Create API Token Result
export const CreateApiTokenResultSchema = z.object({
  token: z.string(),
  tokenPrefix: z.string(),
  label: z.string().nullable(),
  createdAt: z.string().datetime(),
  message: z.string(),
});

// List API Tokens Input
export const ListApiTokensInputSchema = z.object({});

// List API Tokens Result
export const ListApiTokensResultSchema = z.object({
  tokens: z.array(z.object({
    id: z.string().uuid(),
    tokenPrefix: z.string(),
    label: z.string().nullable(),
    createdAt: z.string().datetime(),
    revokedAt: z.string().datetime().nullable(),
  })),
  count: z.number().int(),
});

// Revoke API Token Input
export const RevokeApiTokenInputSchema = z.object({
  tokenId: z.string().uuid(),
});

// Revoke API Token Result
export const RevokeApiTokenResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  revokedAt: z.string().datetime(),
});

// wxAI Implement Input
export const ImplementInputSchema = z.object({
  specNumber: z.string().min(1).max(10).describe('Spec number to implement (e.g., "017")'),
  scopeCheck: z.boolean().default(true).describe('Run scope-first gate verification'),
  force: z.boolean().default(false).describe('DEPRECATED: Force overrides are blocked. Escalation is logged but command is still rejected. Resolve prerequisites instead.'),
  reason: z.string().optional().describe('Reason for escalation request (logged for admin review, does NOT bypass enforcement)'),
});

// Spec 024: Submit Proposal Input (AI Agent proposal submission)
export const SubmitProposalInputSchema = z.object({
  title: z.string().min(1).max(255).describe('Proposal title'),
  description: z.string().optional().describe('Proposal description'),
  priority: z.enum(['low', 'medium', 'high']).default('medium').describe('Proposal priority'),
  estimatedEffort: z.string().max(100).optional().describe('Estimated effort (e.g., "2 weeks")'),
  projectId: z.string().uuid().describe('Company project context UUID'),
  source: z.string().max(255).optional().describe('Source identifier (defaults to "AI Agent")'),
});

// wxAI Analyze Input
export const AnalyzeInputSchema = z.object({
  specNumber: z.string().min(1).max(10).describe('Spec number to analyze (e.g., "017")'),
  includeConstitution: z.boolean().default(true).describe('Include constitution alignment check'),
  maxFindings: z.number().int().min(1).max(100).default(50).describe('Maximum findings to report'),
});

// wxAI Session Start Input
// [SCOPE 133 / T003] MODIFIED-BY — agentName + repoName for agent-gated session start.
export const SessionStartInputSchema = z.object({
  scopeNumber: z.string().min(1).max(10).optional().describe('Active scope number (optional)'),
  skipVersionCheck: z.boolean().default(false).describe('Skip governance version check'),
  skipTodoScan: z.boolean().default(false).describe('Skip unlinked TODO scan'),
  // The agent's declared name, matched against the token's `clientbinding`. Required
  // in practice: a caller that omits it cannot pass the gate.
  agentName: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe('Agent name, e.g. "KAIN". Must match the binding on the presented token.'),
  // Client-declared and NEVER verified — echoed back as `repoReported` so the caller
  // can catch a wrong-repo mismatch. The server has no way to confirm it.
  repoName: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Repository the agent believes it is operating on. Reported, never verified.'),
  // A session id previously issued by this server, carried forward purely as a
  // correlation label. Recorded, never validated — the server holds no session state.
  sessionId: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe('A sessionId from an earlier call, for correlation. Not validated.'),
  // Trim the status block. Default is the light form; the full form carries every
  // scope with its incomplete tasks and can be large.
  fullStatus: z
    .boolean()
    .default(false)
    .describe('Return the full scope/task status block instead of counts only.'),
});

// [SCOPE 090 / BUG-2026-07-22] BEGIN — buildscope narrative field limits
/**
 * Field limits for the buildscope narrative sections, exported so the zod schema
 * and the advertised JSON schema in server.ts share one source of truth. They
 * previously drifted as two hand-maintained copies of the same numbers.
 *
 * Why these are large: the old 2000-character cap rejected ordinary interview
 * output ("constraintsAndRisks: String must contain at most 2000 character(s)"),
 * which is a real scope for a real feature, not abuse. Nothing downstream needed
 * the limit — projectdocuments.content is `text`, and the sibling
 * upsert_document.bodyMarkdown has no cap at all. These remain bounded only to
 * turn a runaway payload into a clear validation error instead of a 413.
 *
 * The genuine ceiling is the HTTP body limit in index-http.ts, which is set well
 * above the sum of these.
 */
export const SCOPE_NARRATIVE_MAX = 20000;
export const SCOPE_DESCRIPTION_MAX = 4000;

// [SCOPE 135 / T006] BEGIN — buildscope's structured requirement inputs, one copy for Zod and JSON
/**
 * FR-009. server.ts advertises a hand-written JSON schema beside this Zod one; the two drifted once
 * already (the 2000-char caps). Descriptions and limits live here and both copies consume them.
 */
export const BUILDSCOPE_QUICK_DESCRIPTION =
  'Explicit opt-in to return a draft immediately, without the guided interview. It does NOT bypass the create_specs quality gate: inputs you omit leave blocking markers in the draft.';
export const BUILDSCOPE_TEMPLATE_ONLY_DESCRIPTION =
  'With quick, fill the legacy .specify/templates/scope-template.md when the workspace has one. Ignored, and reported as ignored, where no template exists (the hosted server has none). Never bypasses the create_specs quality gate.';

export const BUILDSCOPE_INPUT_DESCRIPTIONS = {
  functionalRequirements:
    'The approved functional requirements, rendered verbatim as FR-001, FR-002… Each: { title, requirement, acceptanceCriteria[] }. Omit it and the draft carries a blocking marker naming this input — no generic requirements are ever generated.',
  userScenarios:
    'The approved user scenarios, rendered verbatim as US1, US2… Each: { title, actor, steps[], expectedOutcome }. Supply primary, secondary, and an edge case.',
  dataRequirements: 'Markdown for the Data Requirements section (tables added, modified, or forbidden), rendered verbatim. "None" if this scope touches no data.',
  apiRoutes: 'Markdown for the API Routes section (method, path, one-line description), rendered verbatim. "None" if this scope changes no routes.',
  frontendComponents: 'Markdown for the Frontend Components section, rendered verbatim. "None" if this scope changes no UI.',
  keyEntities: 'Markdown for the Key Entities section, rendered verbatim. "None" if this scope introduces or modifies no domain entity.',
  currentScopeContent:
    'On an edit: the full text of YOUR local specs/Project-Scope/NNN-*.md. The edit merges into it, and no stored record is needed. Omit it and the edit merges into the copy stored in the project, which may be older than your file. Write the result back to the same local file.',
  localSpecNumbers:
    'On a create: every spec number present in your specs/NNN-* folders and specs/Project-Scope/NNN-* files. The new number is counted past these and the stored ones, so a spec that exists only on your disk is never reused.',
  title: 'Short scope title (a few words) for the H1 and file name. On an edit, the only input that renames the scope. Defaults to the first clause of featureDescription.',
} as const;

export const ScopeFunctionalRequirementSchema = z.object({
  title: z.string().trim().min(1).max(255),
  requirement: z.string().trim().min(1).max(SCOPE_NARRATIVE_MAX),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(SCOPE_NARRATIVE_MAX)).min(1),
});

export const ScopeUserScenarioSchema = z.object({
  title: z.string().trim().min(1).max(255),
  actor: z.string().trim().min(1).max(255),
  steps: z.array(z.string().trim().min(1).max(SCOPE_NARRATIVE_MAX)).min(1),
  expectedOutcome: z.string().trim().min(1).max(SCOPE_NARRATIVE_MAX),
});
// [SCOPE 135 / T006] END
// [SCOPE 090 / BUG-2026-07-22] END

// [SCOPE 124 / T019] A whole scope document, not one narrative field. The largest scope in this
// repository is ~92 KB, so 500 KB is headroom rather than a working limit; it exists so a runaway
// payload becomes a validation error instead of an unbounded run through the preflight regexes.
export const SCOPE_CONTENT_MAX = 512000;

// [SCOPE 135 / T016] BEGIN — FR-018: one named item per edit
export const ScopeItemEditSchema = z.object({
  op: z.enum(['add', 'replace', 'remove']),
  target: z.string().trim().min(1).max(40).describe('FR-003, US2 or FR-003/AC2; add also takes a bare FR or US, or FR-003/AC'),
  content: z.string().max(SCOPE_NARRATIVE_MAX).optional().describe('New text for add / replace; the reason for remove'),
});
export const BUILDSCOPE_EDITS_DESCRIPTION =
  'On an edit: change ONE named item without touching the rest. [{ op: add|replace|remove, target: FR-003 | US2 | FR-003/AC2, content }]. add appends the next free number (target FR or US; content = title on line 1, body after). replace swaps the item body, or one acceptance line for FR-003/AC2. remove keeps the heading and number and writes "Removed (Amendment X, date) - reason" (content = the reason); nothing is renumbered. An unknown target is refused and the items that exist are listed.';
export const BUILDSCOPE_AMENDMENT_DESCRIPTION = 'On an edit: the amendment letter (e.g. B) stamped into "Removed" stubs and the Amendment Log entry.';
// [SCOPE 135 / T016] END
// [SCOPE 135 / T020] BEGIN — FR-022: what the Amendment Log entry records
export const BUILDSCOPE_REASON_DESCRIPTION =
  'On an edit: why it was made, recorded in the scope\'s Amendment Log with the items touched and the replaced text. Optional; omitted, the entry reads "No reason given".';
export const BUILDSCOPE_UNATTENDED_DESCRIPTION =
  'On an edit: set when the caller will write the draft without an interactive confirm (the kit\'s --yes). Recorded in the Amendment Log entry.';
// [SCOPE 135 / T020] END

// Build Scope Input
export const BuildScopeInputSchema = z.object({
  // [SCOPE 089] Scope numbering is counted per-project from the DB, so the
  // authenticated project must reach buildScope. The auth layer injects this
  // from the token context; optional here so local kit-author runs still parse.
  projectId: z.string().uuid().optional().describe('Project the scope belongs to (injected from the auth token); scope numbers are counted per-project'),
  featureDescription: z.string().min(1).max(SCOPE_DESCRIPTION_MAX).describe('High-level description of the feature. In guided mode this is NOT the starting point — anchor the interview on businessProblem first, build the scope from that problem, then revisit and reconcile this description against the built scope before the final write. Pass the revised, reconciled wording here.'),
  // [SCOPE 135 / T011] FR-015 — say plainly that neither flag bypasses the create_specs gate (17b7ae98).
  quick: z.boolean().default(false).describe(BUILDSCOPE_QUICK_DESCRIPTION),
  templateOnly: z.boolean().default(false).describe(BUILDSCOPE_TEMPLATE_ONLY_DESCRIPTION),
  editSpecNumber: z.string().min(1).max(10).optional().describe('Edit existing scope file instead of creating new'),
  primaryActor: z.string().max(255).optional().describe('Primary user actor for the scope'),
  secondaryActors: z.array(z.string().max(255)).optional().describe('Secondary actors or stakeholder groups affected by the scope'),
  businessProblem: z.string().max(SCOPE_NARRATIVE_MAX).optional().describe('Business problem this solves'),
  successMetrics: z.array(z.string().max(SCOPE_NARRATIVE_MAX)).optional().describe('List of success metrics'),
  scopeBoundary: z.string().max(SCOPE_NARRATIVE_MAX).optional().describe('What is explicitly in scope for this effort'),
  outOfScope: z.string().max(SCOPE_NARRATIVE_MAX).optional().describe('What is explicitly out of scope for this effort'),
  integrationContext: z.string().max(SCOPE_NARRATIVE_MAX).optional().describe('Existing workflows, systems, or documents this scope must align with'),
  constraintsAndRisks: z.string().max(SCOPE_NARRATIVE_MAX).optional().describe('Known constraints, assumptions, or delivery risks that should be reviewed'),
  // [SCOPE 135 / T006] FR-009 — the author's requirements and Amendment A's inputs, all optional so
  // kits already in the field keep working (they get an honest blocked draft instead of filler).
  functionalRequirements: z.array(ScopeFunctionalRequirementSchema).max(200).optional().describe(BUILDSCOPE_INPUT_DESCRIPTIONS.functionalRequirements),
  userScenarios: z.array(ScopeUserScenarioSchema).max(100).optional().describe(BUILDSCOPE_INPUT_DESCRIPTIONS.userScenarios),
  dataRequirements: z.string().min(1).max(SCOPE_NARRATIVE_MAX).optional().describe(BUILDSCOPE_INPUT_DESCRIPTIONS.dataRequirements),
  apiRoutes: z.string().min(1).max(SCOPE_NARRATIVE_MAX).optional().describe(BUILDSCOPE_INPUT_DESCRIPTIONS.apiRoutes),
  frontendComponents: z.string().min(1).max(SCOPE_NARRATIVE_MAX).optional().describe(BUILDSCOPE_INPUT_DESCRIPTIONS.frontendComponents),
  keyEntities: z.string().min(1).max(SCOPE_NARRATIVE_MAX).optional().describe(BUILDSCOPE_INPUT_DESCRIPTIONS.keyEntities),
  currentScopeContent: z.string().min(1).max(SCOPE_CONTENT_MAX).optional().describe(BUILDSCOPE_INPUT_DESCRIPTIONS.currentScopeContent),
  localSpecNumbers: z.array(z.string().min(1).max(10)).max(5000).optional().describe(BUILDSCOPE_INPUT_DESCRIPTIONS.localSpecNumbers),
  title: z.string().min(1).max(255).optional().describe(BUILDSCOPE_INPUT_DESCRIPTIONS.title),
  // [SCOPE 135 / T016] FR-018
  edits: z.array(ScopeItemEditSchema).max(100).optional().describe(BUILDSCOPE_EDITS_DESCRIPTION),
  amendment: z.string().trim().min(1).max(20).optional().describe(BUILDSCOPE_AMENDMENT_DESCRIPTION),
  // [SCOPE 135 / T020] FR-022
  reason: z.string().max(SCOPE_NARRATIVE_MAX).optional().describe(BUILDSCOPE_REASON_DESCRIPTION),
  unattended: z.boolean().optional().describe(BUILDSCOPE_UNATTENDED_DESCRIPTION),
});

// Build Scope Result
export const BuildScopeResultSchema = z.object({
  success: z.boolean(),
  mode: z.enum(['guided', 'quick']),
  specNumber: z.string(),
  shortName: z.string(),
  // [SCOPE 124 / T020] Destinations for the caller to write, never a record of a write. The
  // suggested* names say so outright; filePath/checklistPath keep theirs because kits in the field
  // write the scope and checklist from them.
  filePath: z.string().optional(),
  checklistPath: z.string().optional(),
  suggestedFilePath: z.string().optional(),
  suggestedChecklistPath: z.string().optional(),
  persisted: z.boolean().optional(),
  scopeContent: z.string().optional(),
  sectionsCreated: z.array(z.string()),
  status: z.enum(['draft_interview', 'ready_for_write', 'drafted', 'draft_updated', 'created', 'updated', 'template_only']),
  questions: z.array(z.object({
    field: z.string(),
    question: z.string(),
  })).default([]),
  qualityScore: z.number().min(0).max(100),
  blockingIssues: z.array(z.string()).default([]),
  canProceedToCreateSpecs: z.boolean(),
  message: z.string(),
  nextSteps: z.array(z.string()),
});

// Validate Scope Input
// [SCOPE 124 / T019] scopeContent is how a caller validates a scope that is not in the database
// yet. buildscope writes the file on the CLIENT, so before create_specs or dbpush runs there is no
// record here to look up — and filePath cannot bridge that, because the hosted server would resolve
// it against its own disk, not the caller's. The caller reads their own file and sends the text.
export const ValidateScopeInputSchema = z.object({
  specNumber: z.string().min(1).max(10).optional().describe('Spec number to validate (e.g., "017")'),
  scopeContent: z.string().min(1).max(SCOPE_CONTENT_MAX).optional().describe('Raw scope markdown to validate. Use this to validate a scope that has not been pushed yet — read the local file and pass its text. Takes precedence over specNumber.'),
  filePath: z.string().optional().describe('Label only — the path this content came from, echoed back in the result. The server does NOT read it when projectId is set; pass scopeContent to validate a local file.'),
  projectId: z.string().uuid().optional().describe('Project ID'),
});

// Validate Scope Result
export const ValidateScopeResultSchema = z.object({
  success: z.boolean(),
  specNumber: z.string().optional(),
  filePath: z.string().optional(),
  status: z.enum(['valid', 'invalid', 'error']),
  score: z.number().min(0).max(100),
  checks: z.object({
    hasOverview: z.boolean(),
    hasBusinessProblem: z.boolean(),
    hasActors: z.boolean(),
    hasSuccessMetrics: z.boolean(),
    hasScopeBoundary: z.boolean(),
    hasOutOfScope: z.boolean(),
    hasOpenQuestions: z.boolean(),
  }),
  placeholdersFound: z.array(z.string()),
  blockingIssues: z.array(z.string()),
  minimumCriteriaStatus: z.object({
    businessProblem: z.boolean(),
    primaryActor: z.boolean(),
    secondaryActors: z.boolean(),
    measurableSuccessMetrics: z.boolean(),
    scopeBoundary: z.boolean(),
    outOfScope: z.boolean(),
    noPlaceholders: z.boolean(),
  }),
  missingSections: z.array(z.string()),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
  suggestions: z.array(z.string()),
  message: z.string(),
});

// Export types
export type CaptureEventInput = z.infer<typeof CaptureEventInputSchema>;
export type UpsertDocumentInput = z.infer<typeof UpsertDocumentInputSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;
export type UpdateTaskStatusInput = z.infer<typeof UpdateTaskStatusInputSchema>;
export type LinkDocToTaskInput = z.infer<typeof LinkDocToTaskInputSchema>;
export type ListOpenItemsInput = z.infer<typeof ListOpenItemsInputSchema>;
export type CreateSpecsInput = z.infer<typeof CreateSpecsInputSchema>;
export type SpecTask = z.infer<typeof SpecTaskSchema>;
export type CheckForUpdatesInput = z.infer<typeof CheckForUpdatesInputSchema>;
export type UpgradeMcpInput = z.infer<typeof UpgradeMcpInputSchema>;
export type GitInitRepoInput = z.infer<typeof GitInitRepoInputSchema>;
export type GitCommitInput = z.infer<typeof GitCommitInputSchema>;
export type GitPushInput = z.infer<typeof GitPushInputSchema>;
export type GitMergeInput = z.infer<typeof GitMergeInputSchema>;
export type GetKitStatusInput = z.infer<typeof GetKitStatusInputSchema>;
export type DownloadKitInput = z.infer<typeof DownloadKitInputSchema>;
export type RegenerateKitInput = z.infer<typeof RegenerateKitInputSchema>;
export type ImportProjectInput = z.infer<typeof ImportProjectInputSchema>;
export type CreateApiTokenInput = z.infer<typeof CreateApiTokenInputSchema>;
export type ListApiTokensInput = z.infer<typeof ListApiTokensInputSchema>;
export type RevokeApiTokenInput = z.infer<typeof RevokeApiTokenInputSchema>;
export type ImplementInput = z.infer<typeof ImplementInputSchema>;
export type AnalyzeInput = z.infer<typeof AnalyzeInputSchema>;
export type SessionStartInput = z.infer<typeof SessionStartInputSchema>;
export type BuildScopeInput = z.infer<typeof BuildScopeInputSchema>;
export type BuildScopeResult = z.infer<typeof BuildScopeResultSchema>;
export type ValidateScopeInput = z.infer<typeof ValidateScopeInputSchema>;
export type ValidateScopeResult = z.infer<typeof ValidateScopeResultSchema>;
