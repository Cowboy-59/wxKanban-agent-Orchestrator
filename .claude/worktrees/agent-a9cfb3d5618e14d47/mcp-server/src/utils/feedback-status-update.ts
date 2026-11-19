import { and, eq } from 'drizzle-orm';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { McpScope } from '../middleware/auth.js';
import type { ScopedDb } from '../db/scoped-query.js';
import { companyauditlogs, feedbacksubmissions, notifications } from '../db/schema.js';
import { assertCallerCanViewProject } from './project-access.js';
import { resolveSinkScope, sinkProjectId } from './feedback-sink.js';
import {
  appendInternalNote,
  buildStatusMessage,
  isRecurrence,
  recordedVersion,
  renderResolutionMessage,
  resolveNotifyStatus,
  statusChangeVia,
} from './feedback-status.js';
import type { UpdateFeedbackStatusInput } from './schemas.js';
import logger from './logger.js';

// [SCOPE 043 / T021] BEGIN — vendor status transition, extracted from the server switch
// MODIFIED-BY: [SCOPE 148 / T002] — the status change and its companyauditlogs row in one transaction (FR-013)
// MODIFIED-BY: [SCOPE 148 / T003] — server-rendered resolved templates; an agent resolve needs one (FR-010)
// MODIFIED-BY: [SCOPE 148 / T004] — recurrence_suspected refusal (FR-012)
// so the privilege boundary is testable without a database. Dependencies are injected
// because the gate must be provable: a test has to be able to make it fail and then
// assert that NOTHING was written.
export interface UpdateFeedbackStatusDeps {
  assertCallerCanViewProject: (scope: McpScope, projectId: string) => Promise<void>;
  resolveSinkScope: (scope: McpScope) => Promise<ScopedDb>;
  sinkProjectId: () => string;
}

export const defaultDeps: UpdateFeedbackStatusDeps = {
  assertCallerCanViewProject,
  resolveSinkScope,
  sinkProjectId,
};

export interface UpdateFeedbackStatusResult {
  id: string;
  status: string;
  firstTriagedAt: Date | null;
  notified: boolean;
}

/** The audit action every MCP feedback status change writes (SPEC-148 FR-013). */
export const FEEDBACK_STATUS_AUDIT_ACTION = 'feedback.status.changed';

/** A refusal the caller can act on, with a stable code in `data.code`. */
function refuse(code: string, message: string): McpError {
  return new McpError(ErrorCode.InvalidParams, `${code}: ${message}`, { code });
}

export async function updateFeedbackStatus(
  callerScope: McpScope,
  input: UpdateFeedbackStatusInput,
  deps: UpdateFeedbackStatusDeps = defaultDeps,
): Promise<UpdateFeedbackStatusResult> {
  const callerId = callerScope.userId;
  if (!callerId) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'update_feedback_status requires a user-scoped token.',
    );
  }

  await deps.assertCallerCanViewProject(callerScope, deps.sinkProjectId());
  const sink = await deps.resolveSinkScope(callerScope);

  const rows = (await sink.selectScoped(
    feedbacksubmissions,
    eq(feedbacksubmissions.id, input.feedbackId),
  )) as Array<typeof feedbacksubmissions.$inferSelect>;
  const row = rows[0];
  if (!row) {
    throw new McpError(ErrorCode.InvalidParams, `Feedback not found: ${input.feedbackId}`);
  }

  // Derived from the token the server minted, never declared by the caller (FR-013).
  const via = statusChangeVia(callerScope.tokenName);
  const template = input.resolutionTemplate;

  // Refusals come before any write, so a refused call changes nothing and notifies no one.
  if (input.status === 'resolved' && via === 'project-agent' && !template) {
    // An unattended agent never writes words a customer reads (FR-010).
    throw refuse('template_required', 'a project-agent resolve must name a resolutionTemplate.');
  }
  if (template && template !== 'hosted' && input.fixedInVersion && isRecurrence(template, row.context, input.fixedInVersion)) {
    throw refuse(
      'recurrence_suspected',
      `the report records ${template} ${recordedVersion(template, row.context)}, at or above the fix ${input.fixedInVersion}; it is not fixed for this submitter.`,
    );
  }

  const sinkProject = sink.scope.projectId;
  const auditCompany = callerScope.customerId ?? sink.scope.customerId;
  if (!sinkProject || !auditCompany) {
    throw new McpError(ErrorCode.InternalError, 'feedback sink scope unresolved');
  }

  // One UPDATE, so the row transition is atomic on its own. firstTriagedAt is
  // stamped on first touch only, matching the web path.
  const set: Partial<typeof feedbacksubmissions.$inferInsert> = {
    status: input.status,
    firstTriagedAt: row.firstTriagedAt ?? new Date(),
    updatedAt: new Date(),
  };
  if (input.note) {
    set.internalNotes = appendInternalNote(row.internalNotes, input.note);
  }
  // FR-018: one field, both jobs — the note is also the decline reason.
  if (input.status === 'declined') {
    set.declineReason = input.note!.trim();
  }
  // Mirrors FR-018: needsinfo's note IS the clarifying question, replacing any
  // stale value — otherwise the submitter is told "please add details." (the
  // generic fallback in buildStatusMessage) or re-asked a prior, already-answered
  // question. schemas.ts requires `note` whenever status === 'needsinfo'.
  if (input.status === 'needsinfo') {
    set.clarificationQuestion = input.note!.trim();
  }

  // FR-013: the change and its audit row commit together or not at all. Same shape as the
  // self-delete audit in server.ts: the raw transaction, with the sink filter spelled out
  // because the scoped helpers cannot join a transaction.
  const newRow = await sink.raw.transaction(async (tx) => {
    const updated = await tx
      .update(feedbacksubmissions)
      .set(set)
      .where(and(eq(feedbacksubmissions.projectId, sinkProject), eq(feedbacksubmissions.id, row.id)))
      .returning();
    const changed = updated[0];
    if (!changed) throw new McpError(ErrorCode.InvalidParams, `Feedback not found: ${input.feedbackId}`);
    await tx.insert(companyauditlogs).values({
      companyid: auditCompany,
      changedby: callerId,
      action: FEEDBACK_STATUS_AUDIT_ACTION,
      previousvalue: { status: row.status },
      newvalue: {
        resourceType: 'feedback',
        resourceId: row.id,
        status: input.status,
        via,
        ...(template ? { resolutionTemplate: template } : {}),
        ...(input.fixedInVersion ? { fixedInVersion: input.fixedInVersion } : {}),
      },
      description: `${FEEDBACK_STATUS_AUDIT_ACTION} ${row.id} ${row.status} -> ${input.status} via ${via}`,
    });
    return changed;
  });

  // FR-019 — tell the submitter. Best-effort like every other fan-out leg in
  // this scope: the row is already the source of truth, so a failed inbox
  // write must not undo a real status change. `notified` is returned rather
  // than swallowed, so the caller is never guessing at silence.
  let notified = false;
  try {
    await sink.insertScoped(notifications, {
      userid: newRow.userId,
      type: 'feedback_status',
      entityid: newRow.id,
      entitytype: 'feedback',
      // A named template is the whole message (FR-010). Otherwise the note reaches the
      // submitter on resolved as well as declined/needsinfo — passed from the input rather
      // than read off the row so it is only ever this transition's note, never the
      // internalNotes history.
      message: template
        ? renderResolutionMessage(newRow, template, input.fixedInVersion)
        : buildStatusMessage(newRow, input.note),
    });
    await sink.updateScoped(
      feedbacksubmissions,
      { notifyStatus: resolveNotifyStatus(newRow.notificationChannel) },
      eq(feedbacksubmissions.id, newRow.id),
    );
    notified = true;
  } catch (err) {
    logger.warn('Feedback status notification failed', {
      feedbackId: newRow.id,
      error: (err as Error).message,
    });
    // Make the failure visible: notifyStatus='failed' is the ONLY value that makes
    // SysAdmin show a retry button (mirrors FeedbackNotificationService). Without
    // this, a failed inbox write leaves notifyStatus at its stale prior value and
    // nobody ever learns — the exact silent-failure disease this scope exists to
    // cure. Guarded so a SECOND failure here cannot throw out of the handler: the
    // status change above already succeeded and must still be returned.
    try {
      await sink.updateScoped(
        feedbacksubmissions,
        { notifyStatus: 'failed' },
        eq(feedbacksubmissions.id, newRow.id),
      );
    } catch (reconcileErr) {
      logger.warn('Feedback status notifyStatus=failed reconcile also failed', {
        feedbackId: newRow.id,
        error: (reconcileErr as Error).message,
      });
    }
  }

  logger.info('Feedback status updated by vendor', {
    feedbackId: newRow.id,
    status: newRow.status,
    by: callerId,
    via,
    notified,
  });

  return {
    id: newRow.id,
    status: newRow.status,
    firstTriagedAt: newRow.firstTriagedAt,
    notified,
  };
}
// [SCOPE 043 / T021] END
