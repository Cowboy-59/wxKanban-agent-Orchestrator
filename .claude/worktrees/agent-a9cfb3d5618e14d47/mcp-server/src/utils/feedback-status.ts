// [SCOPE 043 / T021] BEGIN — pure decision logic for vendor status transitions.
// MODIFIED-BY: [SCOPE 148 / T005] — the triaged wording (FR-009), shared with the app copy
//
// WHY THIS IS ITS OWN MODULE: mcp-server has zero imports from src/, so the app's
// FeedbackTriageService is unreachable and these rules must be re-implemented.
// Keeping them dependency-free means they are unit-testable without a DB, and it
// gives the drift-guard test (FR-020) one obvious place to point at.
export const FEEDBACK_STATUSES = [
  'new',
  'triaged',
  'needsinfo',
  'inprogress',
  'resolved',
  'declined',
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export interface StatusMessageRow {
  id: string;
  title: string;
  status: string;
  reopenedAt: Date | null;
  clarificationQuestion: string | null;
  declineReason: string | null;
}

/**
 * SPEC-148 FR-009: what a submitter reads when their report is triaged, after the report's
 * lead-in. It promises a fix, so a report the operator does not mean to fix goes to
 * inprogress or needsinfo instead. The app's FeedbackNotificationService carries the same
 * constant; feedback-status-drift.test.ts holds the two equal.
 */
export const TRIAGED_MESSAGE =
  "We're looking at your issue and have triaged it for correction. The fix will be in an upcoming release.";

/**
 * Which report a message is about, as every status message opens. An emailed message has
 * nothing else to say which report it means (SPEC-148, 2026-10-26).
 */
export function reportLead(row: { id: string; title: string }): string {
  return `Your report "${row.title}" (${row.id.slice(0, 8)}):`;
}

/** Append using the app's separator so a history written by either surface reads the same. */
export function appendInternalNote(existing: string | null, note: string): string {
  const incoming = note.trim();
  return existing ? `${existing}\n---\n${incoming}` : incoming;
}

/**
 * Submitter-facing wording, mirroring the app's messageForStatus. This is a
 * deliberate duplicate: the alternative was a cross-deployment HTTP call. FR-020's
 * drift guard covers the vocabulary; wording drift is accepted and bounded here.
 */
export function buildStatusMessage(row: StatusMessageRow, note?: string | null): string {
  const ref = row.id.slice(0, 8);
  // A row returned to 'new' carrying reopenedAt is a recurrence of a closed error
  // (SCOPE-110), not a generic status change — say so, or it reads as noise.
  if (row.status === 'new' && row.reopenedAt) {
    return `A previously closed error "${row.title}" (${ref}) has recurred and was reopened as a regression.`;
  }
  switch (row.status) {
    case 'needsinfo':
      return `Your report "${row.title}" (${ref}) needs more info: ${row.clarificationQuestion ?? 'please add details.'}`;
    case 'triaged':
      return `${reportLead(row)} ${TRIAGED_MESSAGE}`;
    case 'inprogress':
      return `Your report "${row.title}" (${ref}) is now in progress.`;
    case 'resolved': {
      // FR-018's "one field, both jobs", extended to resolved: the note IS the
      // resolution note. Until this, a fixed report told the submitter only that
      // it was "resolved" — no version, no date, nothing to upgrade TO. The note
      // went to internalNotes, which no submitter-facing projection returns, so
      // the one thing they needed was written where they could never read it.
      //
      // `note` is THIS transition's note, deliberately not `row.internalNotes`:
      // that column is the accumulated triage history and publishing it would
      // leak every prior internal remark on the report.
      const said = note?.trim();
      return said
        ? `Your report "${row.title}" (${ref}) has been resolved: ${said}`
        : `Your report "${row.title}" (${ref}) has been resolved.`;
    }
    case 'declined':
      return `Your report "${row.title}" (${ref}) was declined: ${row.declineReason ?? 'no reason given'}.`;
    default:
      return `Your report "${row.title}" (${ref}) status: ${row.status}.`;
  }
}

/**
 * MCP can write the in-app inbox row but cannot send email (no SES in this
 * deployment). The app surfaces a retry button ONLY for notifystatus='failed', so
 * 'pending' would leave an email-channel submitter with silence AND no way to fix
 * it. 'failed' here means "in-app delivered, email still owed" — a visible gap one
 * click from resolution beats an invisible one.
 */
export function resolveNotifyStatus(channel: string | null): 'done' | 'failed' {
  return channel === 'email' ? 'failed' : 'done';
}
// [SCOPE 043 / T021] END

// [SCOPE 148 / T003] BEGIN — server-rendered resolved templates (FR-010)
// The whole customer message comes from here when a template is named, never from the
// caller. That is what lets an unattended agent resolve a report without being able to put
// words in front of a customer: it picks a template and a version, and the server writes.
export const RESOLUTION_TEMPLATES = ['kit', 'cockpit', 'hosted'] as const;
export type ResolutionTemplate = (typeof RESOLUTION_TEMPLATES)[number];

/** Plain x.y.z, optionally prefixed with v. Pre-release and build tags are not accepted. */
export const SEMVER_PATTERN = /^v?\d+\.\d+\.\d+$/;

/** The token-name prefix of the kit's per-project agent (the app's PROJECT_AGENT_TOKEN_PREFIX). */
export const PROJECT_AGENT_TOKEN_PREFIX = 'project-agent:';

/** `project-agent` for a token the server minted for the project agent, else `manual`. */
export function statusChangeVia(tokenName: string | null | undefined): 'project-agent' | 'manual' {
  return tokenName?.startsWith(PROJECT_AGENT_TOKEN_PREFIX) ? 'project-agent' : 'manual';
}

export function renderResolutionMessage(
  row: { id: string; title: string },
  template: ResolutionTemplate,
  fixedInVersion?: string,
): string {
  const version = fixedInVersion?.replace(/^v/, '');
  const lead = reportLead(row);
  switch (template) {
    case 'kit':
      return (
        `${lead} Your issue has been resolved in a previous release. Check your kit release: it should be ${version} or later. ` +
        'Run wxkanban-agent --version in a terminal to see yours. Thanks for your patience.'
      );
    case 'cockpit':
      return (
        `${lead} Your issue has been resolved in a previous release. Check your Dev Cockpit version: it should be ${version} or later. ` +
        "You can see yours in VS Code's Extensions view. Thanks for your patience."
      );
    case 'hosted':
      return `${lead} Your issue has been resolved. The fix is live in wxKanban now. Thanks for your patience.`;
  }
}
// [SCOPE 148 / T003] END

// [SCOPE 148 / T004] BEGIN — the recurrence guard (FR-012)
function parseSemver(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** -1, 0 or 1; null when either side is not a version. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 | null {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

/**
 * The version the report itself recorded for the product the template names: the kit
 * version for `kit`, the Cockpit (extension) version for `cockpit`. `hosted` has none.
 */
export function recordedVersion(template: ResolutionTemplate, context: unknown): string | null {
  if (template === 'hosted' || typeof context !== 'object' || context === null) return null;
  const key = template === 'kit' ? 'kitversion' : 'extensionversion';
  const v = (context as Record<string, unknown>)[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * True when the report was filed from a version that already carried the fix: telling that
 * submitter "fixed in a previous release" would be false, so the resolve is refused. No
 * recorded version, or one that does not parse, is not a recurrence — deciding those by
 * filing date is the agent's rule (FR-011), not the server's.
 */
export function isRecurrence(template: ResolutionTemplate, context: unknown, fixedInVersion: string): boolean {
  const recorded = recordedVersion(template, context);
  if (!recorded) return false;
  const cmp = compareSemver(recorded, fixedInVersion);
  return cmp !== null && cmp >= 0;
}
// [SCOPE 148 / T004] END
