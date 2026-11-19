// [SCOPE 043 / T003] BEGIN — lifecycle artifact rendering for User Feedback
// MODIFIED-BY: [SCOPE 043 / T028] — Amendment E: attachments excerpted into their own section (FR-026)
// A persisted feedbacksubmissions row is rendered as a bugreports.md-style
// document into the submitter's project lifecycle (projectdocuments), triaged
// through the normal flow. This is fan-out leg 1 — best-effort and reconciled
// against the source-of-truth row: on success artifactstatus -> 'done', on
// failure it stays 'pending' for manual SysAdmin retry (T006). Never throws to
// the caller (must not block the submit). Reused by T007's needs-info re-render
// so the Clarification exchange is appended in place on the same document.
import { eq } from 'drizzle-orm';
import type { ScopedDb } from '../db/scoped-query.js';
import { projectdocuments, feedbacksubmissions, type FeedbackSubmission } from '../db/schema.js';
import { renderForArtifact, splitDetails } from './feedback-attachments.js'; // [SCOPE 043 / T028]

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return '_(not provided)_';
  if (typeof v === 'string') return v.trim() || '_(empty)_';
  return '```json\n' + JSON.stringify(v, null, 2) + '\n```';
}

/** Pure render — a feedbacksubmissions row to markdown. No I/O. */
export function renderFeedbackArtifact(row: FeedbackSubmission): string {
  const isBug = row.type === 'bug';
  const heading = isBug ? 'Bug Report' : 'Feature Suggestion';
  const lines: string[] = [];

  lines.push(`# ${heading}: ${row.title}`);
  lines.push('');
  lines.push(`**Reference**: \`${row.id}\``);
  lines.push(`**Type**: ${row.type}`);
  lines.push(`**Status**: ${row.status}`);
  if (row.classification) lines.push(`**AI classification**: ${row.classification}`);
  if (row.severity) lines.push(`**Severity**: ${row.severity}`);
  if (row.duplicateOfId) lines.push(`**Duplicate of**: \`${row.duplicateOfId}\``);
  lines.push(`**Submitted**: ${row.createdAt.toISOString()}`);
  lines.push('');

  // Persona-elicited structured answers (Bug Reporter / Feature Suggester).
  lines.push('## Details');
  lines.push('');
  // [SCOPE 043 / T028] Amendment E (FR-026): attachments are lifted out and
  // rendered as bounded excerpts in their own section below. Left in `details`
  // they would be `fmtValue`'d into this document in full — a project artifact
  // is not where a 128 KB log belongs.
  const { plain: details, attachments } = splitDetails(row.details);
  const entries = Object.entries(details);
  if (entries.length === 0 && attachments.length === 0) {
    lines.push('_No structured details captured._');
  } else {
    for (const [k, v] of entries) {
      lines.push(`**${k}**: ${fmtValue(v)}`);
      lines.push('');
    }
  }
  lines.push(...renderForArtifact(attachments));

  // Auto-captured environment context.
  const ctx = (row.context ?? null) as Record<string, unknown> | null;
  if (ctx && Object.keys(ctx).length > 0) {
    lines.push('## Context');
    lines.push('');
    for (const [k, v] of Object.entries(ctx)) {
      lines.push(`- **${k}**: ${fmtValue(v)}`);
    }
    lines.push('');
  }

  // Single-round needs-info clarification, appended in place (T007).
  if (row.clarificationQuestion) {
    lines.push('## Clarification');
    lines.push('');
    lines.push(`**wxperts asked**: ${row.clarificationQuestion}`);
    lines.push('');
    lines.push(`**Reply**: ${row.clarificationAnswer ? row.clarificationAnswer : '_(awaiting submitter)_'}`);
    lines.push('');
  }

  // Triage disposition.
  if (row.status === 'declined' && row.declineReason) {
    lines.push('## Disposition');
    lines.push('');
    lines.push(`**Declined** — ${row.declineReason}`);
    lines.push('');
  }

  return lines.join('\n');
}

export interface ArtifactResult {
  ok: boolean;
  documentId?: string;
  filepath?: string;
  error?: string;
}

/**
 * Render the row and upsert it as a project-lifecycle document, then reconcile
 * the artifact leg on the source-of-truth row. Idempotent: matched by title so
 * a re-render (e.g. after a needs-info answer) updates the same document.
 * Best-effort — returns {ok:false} instead of throwing; the caller logs and the
 * row's artifactstatus stays 'pending' for manual retry.
 */
export async function renderAndUpsertFeedbackArtifact(
  scoped: ScopedDb,
  row: FeedbackSubmission,
): Promise<ArtifactResult> {
  try {
    const content = renderFeedbackArtifact(row);
    const shortId = row.id.slice(0, 8);
    const title = `Feedback ${shortId} — ${row.title}`;
    const filepath = `Bug-reports/feedback-${row.id}.md`;
    const doctype = row.type === 'bug' ? 'BugReport' : 'FeatureSuggestion';

    const existing = (await scoped.selectScoped(
      projectdocuments,
      eq(projectdocuments.title, title),
    )) as Array<typeof projectdocuments.$inferSelect>;

    let document: typeof projectdocuments.$inferSelect;
    if (existing[0]) {
      const updated = (await scoped.updateScoped(
        projectdocuments,
        { content, doctype, filepath, isGenerated: true, updatedAt: new Date() },
        eq(projectdocuments.id, existing[0].id),
      )) as Array<typeof projectdocuments.$inferSelect>;
      document = updated[0];
    } else {
      const inserted = (await scoped.insertScoped(projectdocuments, {
        projectId: row.projectId,
        doctype,
        title,
        content,
        filepath,
        isGenerated: true,
      })) as Array<typeof projectdocuments.$inferSelect>;
      document = inserted[0];
    }

    // Reconcile fan-out leg 1 on the source-of-truth row.
    await scoped.updateScoped(
      feedbacksubmissions,
      { artifactStatus: 'done', artifactPath: filepath, updatedAt: new Date() },
      eq(feedbacksubmissions.id, row.id),
    );

    return { ok: true, documentId: document.id, filepath };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
// [SCOPE 043 / T003] END
