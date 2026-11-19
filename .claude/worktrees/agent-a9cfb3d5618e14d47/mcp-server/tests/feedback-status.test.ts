// [SCOPE 043 / T021] Decision logic is pure so it is pinned without a DB.
import { describe, it, expect } from 'vitest';
import {
  FEEDBACK_STATUSES,
  appendInternalNote,
  buildStatusMessage,
  resolveNotifyStatus,
  type StatusMessageRow,
} from '../src/utils/feedback-status.js';
import { UpdateFeedbackStatusInputSchema } from '../src/utils/schemas.js';

const row = (over: Partial<StatusMessageRow> = {}): StatusMessageRow => ({
  id: 'abcdef12-0000-0000-0000-000000000000',
  title: 'Export button does nothing',
  status: 'triaged',
  reopenedAt: null,
  clarificationQuestion: null,
  declineReason: null,
  ...over,
});

describe('FEEDBACK_STATUSES', () => {
  it('is the app vocabulary, in order', () => {
    expect(FEEDBACK_STATUSES).toEqual([
      'new', 'triaged', 'needsinfo', 'inprogress', 'resolved', 'declined',
    ]);
  });
});

describe('appendInternalNote', () => {
  it('uses the app separator when there is prior history', () => {
    expect(appendInternalNote('first', 'second')).toBe('first\n---\nsecond');
  });

  it('does not lead with a separator on the first note', () => {
    expect(appendInternalNote(null, 'first')).toBe('first');
    expect(appendInternalNote('', 'first')).toBe('first');
  });

  it('trims the incoming note', () => {
    expect(appendInternalNote(null, '  padded  ')).toBe('padded');
  });
});

describe('buildStatusMessage', () => {
  it('leads with the 8-char reference the submitter sees', () => {
    expect(buildStatusMessage(row())).toContain('abcdef12');
  });

  it('quotes the clarifying question for needsinfo', () => {
    const m = buildStatusMessage(row({ status: 'needsinfo', clarificationQuestion: 'Which browser?' }));
    expect(m).toContain('Which browser?');
  });

  it('quotes the decline reason', () => {
    const m = buildStatusMessage(row({ status: 'declined', declineReason: 'works as designed' }));
    expect(m).toContain('works as designed');
  });

  it('falls back when a declined row somehow has no reason', () => {
    expect(buildStatusMessage(row({ status: 'declined' }))).toContain('no reason given');
  });

  it('reports a reopened row as a regression, not a generic change', () => {
    // SCOPE-110: a closed error that recurred is returned to 'new' with reopenedAt set.
    const m = buildStatusMessage(row({ status: 'new', reopenedAt: new Date('2026-08-01') }));
    expect(m).toContain('recurred');
    expect(m).toContain('regression');
  });

  it('carries the resolution note to the submitter, so a fix names its release', () => {
    // Before this, a fixed report told the submitter only "has been resolved" — no
    // version, nothing to upgrade TO. The note went to internalNotes, which no
    // submitter-facing projection returns, so the one fact they needed was written
    // where they could never read it.
    const m = buildStatusMessage(row({ status: 'resolved' }), 'Fixed — ships in kit v1.7.58 on Sun 23 Aug');
    expect(m).toContain('has been resolved');
    expect(m).toContain('kit v1.7.58');
  });

  it('keeps the plain wording when a resolution is recorded without a note', () => {
    expect(buildStatusMessage(row({ status: 'resolved' }))).toBe(
      'Your report "Export button does nothing" (abcdef12) has been resolved.',
    );
    expect(buildStatusMessage(row({ status: 'resolved' }), '   ')).not.toContain(':');
  });

  it('shows ONLY this transition note, never the accumulated internal history', () => {
    // The guard that matters. internalNotes is the whole triage history; publishing
    // it would leak every prior internal remark on the report. buildStatusMessage
    // has no access to it by construction — StatusMessageRow does not carry it — and
    // this pins that, because the cheap "fix" is to read the column off the row.
    const m = buildStatusMessage(row({ status: 'resolved' }), 'shipped in v2');
    expect(m).toContain('shipped in v2');
    expect(m).not.toContain('---');
    expect(Object.keys(row())).not.toContain('internalNotes');
  });

  it('has distinct wording per status', () => {
    const seen = new Set(
      FEEDBACK_STATUSES.map((s) => buildStatusMessage(row({ status: s }))),
    );
    expect(seen.size).toBe(FEEDBACK_STATUSES.length);
  });
});

describe('resolveNotifyStatus', () => {
  it("marks inapp done - the in-app row IS the whole delivery", () => {
    expect(resolveNotifyStatus('inapp')).toBe('done');
    expect(resolveNotifyStatus(null)).toBe('done');
  });

  it("marks email failed so SysAdmin shows a retry button", () => {
    // Deliberate (FR-019): MCP has no SES. 'failed' is the only value the app's
    // retry affordance reacts to, so it means "in-app delivered, email still owed".
    expect(resolveNotifyStatus('email')).toBe('failed');
  });
});

describe('UpdateFeedbackStatusInputSchema', () => {
  const base = {
    projectId: '11111111-1111-1111-1111-111111111111',
    feedbackId: '22222222-2222-2222-2222-222222222222',
  };

  it('accepts a status with no note', () => {
    expect(UpdateFeedbackStatusInputSchema.parse({ ...base, status: 'inprogress' }).status)
      .toBe('inprogress');
  });

  it('REJECTS declined without a note - the note is the decline reason (FR-018)', () => {
    const r = UpdateFeedbackStatusInputSchema.safeParse({ ...base, status: 'declined' });
    expect(r.success).toBe(false);
  });

  it('rejects declined with a whitespace-only note', () => {
    const r = UpdateFeedbackStatusInputSchema.safeParse({ ...base, status: 'declined', note: '   ' });
    expect(r.success).toBe(false);
  });

  it('accepts declined with a note', () => {
    const r = UpdateFeedbackStatusInputSchema.safeParse({
      ...base, status: 'declined', note: 'works as designed',
    });
    expect(r.success).toBe(true);
  });

  it('rejects a status outside the vocabulary', () => {
    expect(UpdateFeedbackStatusInputSchema.safeParse({ ...base, status: 'archived' }).success)
      .toBe(false);
  });

  it('REJECTS needsinfo without a note - the note is the clarifying question', () => {
    const r = UpdateFeedbackStatusInputSchema.safeParse({ ...base, status: 'needsinfo' });
    expect(r.success).toBe(false);
  });

  it('rejects needsinfo with a whitespace-only note', () => {
    const r = UpdateFeedbackStatusInputSchema.safeParse({ ...base, status: 'needsinfo', note: '   ' });
    expect(r.success).toBe(false);
  });

  it('accepts needsinfo with a note', () => {
    const r = UpdateFeedbackStatusInputSchema.safeParse({
      ...base, status: 'needsinfo', note: 'Which browser are you using?',
    });
    expect(r.success).toBe(true);
  });
});
