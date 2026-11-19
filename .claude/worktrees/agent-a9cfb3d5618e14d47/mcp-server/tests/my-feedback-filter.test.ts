/**
 * [SCOPE 043 fix] "My Feedback" must be scoped to the caller's CURRENT project,
 * not the whole central sink. Regression: in any project the Cockpit showed the
 * wxKanban-origin feedback because list_my_feedback filtered only by userId.
 */
import { describe, it, expect } from 'vitest';
import { scopeMyFeedbackRows, type MyFeedbackViewRow } from '../src/utils/my-feedback-filter.js';

const CURRENT = 'current-project-uuid';
const WXKANBAN = 'ba924193-0335-4080-9fa6-33cd6b81300a';

function row(over: Partial<MyFeedbackViewRow> & { origin?: string; created: number }): MyFeedbackViewRow {
  return {
    status: over.status ?? 'new',
    submitterHiddenAt: over.submitterHiddenAt ?? null,
    createdAt: new Date(over.created),
    context: over.origin === undefined ? null : { originProjectId: over.origin },
  };
}

describe('scopeMyFeedbackRows', () => {
  it('shows only the current project — excludes wxKanban-origin items (the bug)', () => {
    const rows = [
      row({ origin: CURRENT, created: 3 }),
      row({ origin: WXKANBAN, created: 2 }),
      row({ origin: 'some-other-project', created: 1 }),
    ];
    const out = scopeMyFeedbackRows(rows, { currentProjectId: CURRENT });
    expect(out).toHaveLength(1);
    expect((out[0].context as { originProjectId: string }).originProjectId).toBe(CURRENT);
  });

  it('when the current project IS wxKanban, shows wxKanban-origin items', () => {
    const rows = [row({ origin: WXKANBAN, created: 2 }), row({ origin: CURRENT, created: 1 })];
    const out = scopeMyFeedbackRows(rows, { currentProjectId: WXKANBAN });
    expect(out).toHaveLength(1);
  });

  it('excludes rows with no origin (legacy / non-submission)', () => {
    const rows = [row({ origin: undefined, created: 2 }), row({ origin: CURRENT, created: 1 })];
    expect(scopeMyFeedbackRows(rows, { currentProjectId: CURRENT })).toHaveLength(1);
  });

  it('hides resolved by default; an explicit status filter still returns them', () => {
    const rows = [
      row({ origin: CURRENT, created: 3, status: 'new' }),
      row({ origin: CURRENT, created: 2, status: 'resolved' }),
    ];
    expect(scopeMyFeedbackRows(rows, { currentProjectId: CURRENT })).toHaveLength(1); // resolved hidden
    expect(scopeMyFeedbackRows(rows, { currentProjectId: CURRENT, status: 'resolved' })).toHaveLength(1);
    // Also hidden in the sink (show-all) view unless requested.
    expect(scopeMyFeedbackRows(rows, { currentProjectId: WXKANBAN, showAllInProject: true })).toHaveLength(1);
  });

  it('applies the status filter within the current project', () => {
    const rows = [
      row({ origin: CURRENT, created: 2, status: 'new' }),
      row({ origin: CURRENT, created: 1, status: 'resolved' }),
    ];
    expect(scopeMyFeedbackRows(rows, { currentProjectId: CURRENT, status: 'resolved' })).toHaveLength(1);
  });

  it('hides submitter-hidden items unless includeHidden', () => {
    const rows = [
      row({ origin: CURRENT, created: 2, submitterHiddenAt: new Date(5) }),
      row({ origin: CURRENT, created: 1 }),
    ];
    expect(scopeMyFeedbackRows(rows, { currentProjectId: CURRENT })).toHaveLength(1);
    expect(scopeMyFeedbackRows(rows, { currentProjectId: CURRENT, includeHidden: true })).toHaveLength(2);
  });

  it('showAllInProject (sink) returns every row regardless of origin', () => {
    const rows = [
      row({ origin: CURRENT, created: 3 }),
      row({ origin: 'other', created: 2 }),
      row({ origin: undefined, created: 1 }),
    ];
    // Sink view: all three; still honors status/hidden.
    expect(scopeMyFeedbackRows(rows, { currentProjectId: WXKANBAN, showAllInProject: true })).toHaveLength(3);
    const withHidden = [...rows, row({ origin: 'x', created: 4, submitterHiddenAt: new Date(9) })];
    expect(scopeMyFeedbackRows(withHidden, { currentProjectId: WXKANBAN, showAllInProject: true })).toHaveLength(3);
    expect(scopeMyFeedbackRows(withHidden, { currentProjectId: WXKANBAN, showAllInProject: true, includeHidden: true })).toHaveLength(4);
  });

  it('sorts newest-first and caps at maxItems', () => {
    const rows = [
      row({ origin: CURRENT, created: 1 }),
      row({ origin: CURRENT, created: 3 }),
      row({ origin: CURRENT, created: 2 }),
    ];
    const out = scopeMyFeedbackRows(rows, { currentProjectId: CURRENT, maxItems: 2 });
    expect(out.map((r) => r.createdAt.getTime())).toEqual([3, 2]);
  });
});
