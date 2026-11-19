// [SCOPE 043 fix / list_my_feedback project scoping]
// All VS Code feedback is STORED in one central sink project (feedback-sink.ts),
// but a submitter's "My Feedback" view in the Cockpit must reflect the project
// they are currently in — not the whole sink backlog. Without this scoping, every
// project shows the wxKanban-origin feedback, because list_my_feedback bound only
// by userId. Each row records its origin in context.originProjectId at submit
// time; this helper scopes the view to the caller's current project via that
// provenance, then applies the status/hidden filters and the sort/cap. Pure and
// deterministic so it is unit-testable without the DB.

// [SCOPE 043] BEGIN — project-scope the "My Feedback" view (list_my_feedback fix)
export interface MyFeedbackViewRow {
  status: string;
  submitterHiddenAt: Date | null;
  createdAt: Date;
  context: unknown;
  /** Owning company. Null on auto-captured runtime errors, which have no submitter. */
  companyId?: string | null;
}

export interface MyFeedbackViewOptions {
  /** The caller's CURRENT project (the token's project, before sink rebinding). */
  currentProjectId: string;
  status?: string;
  includeHidden?: boolean;
  maxItems?: number;
  /**
   * When the current project IS the feedback sink (wxKanban), show EVERY row
   * stored there — the sink is the central triage hub, so it lists all feedback
   * regardless of which project each item originated from. Consumer projects
   * leave this false and stay scoped to their own originating feedback.
   *
   * @deprecated Left false everywhere since 2026-08-03 — see the call site in
   * server.ts. Kept so the option's meaning stays documented rather than being
   * silently reintroduced.
   */
  showAllInProject?: boolean;
  /**
   * The caller's company (McpScope.customerId). When set, rows are additionally
   * restricted to it.
   *
   * This is deliberately redundant with the project filter: reaching this code at
   * all requires assertCallerCanViewProject to have passed, which already proves
   * the project belongs to the caller's company. But the project filter matches on
   * `context.originProjectId` — a value inside a JSON blob, stamped at submit time
   * — whereas this matches the `companyid` COLUMN. Tenancy should not rest on
   * provenance metadata alone; SCOPE-043 was exactly that mistake.
   */
  callerCompanyId?: string | null;
  /**
   * Inverts the view into the vendor's INCOMING queue: every row in the sink whose
   * owning company is NOT this one, ignoring project origin entirely.
   *
   * Scoping "My Feedback" to the caller's own project+company (2026-08-03) was
   * right for the submitter's view but removed the only surface where the sink
   * owner saw customer reports. Rather than conflate the two lists again, this
   * asks the opposite question, and the caller must prove sink ownership before
   * using it. Mutually exclusive with callerCompanyId.
   */
  incomingForCompanyId?: string | null;
}

function originProjectIdOf(context: unknown): string | undefined {
  if (context && typeof context === 'object') {
    const v = (context as Record<string, unknown>)['originProjectId'];
    if (typeof v === 'string') return v;
  }
  return undefined;
}

export function scopeMyFeedbackRows<T extends MyFeedbackViewRow>(
  rows: T[],
  opts: MyFeedbackViewOptions,
): T[] {
  // The sink/wxKanban project lists EVERYTHING stored in it (it's the triage hub);
  // any other project scopes to its own originating feedback via provenance. Rows
  // without an origin (legacy or non-submission) are excluded from the scoped view.
  // Incoming mode ignores project origin by design — the whole point is to see
  // reports from projects that are not yours. It still requires an owning company
  // on the row, so unattributable rows (auto-captured errors) stay out.
  if (opts.incomingForCompanyId) {
    let incoming = rows.filter(
      (r) => r.companyId != null && r.companyId !== opts.incomingForCompanyId,
    );
    if (opts.status) incoming = incoming.filter((r) => r.status === opts.status);
    else incoming = incoming.filter((r) => r.status !== 'resolved');
    if (!opts.includeHidden) incoming = incoming.filter((r) => !r.submitterHiddenAt);
    return incoming
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, opts.maxItems ?? 50);
  }

  let items = opts.showAllInProject
    ? rows.slice()
    : rows.filter((r) => originProjectIdOf(r.context) === opts.currentProjectId);
  // Company guard on the real column. Rows with a null companyId (auto-captured
  // runtime errors, which have no submitter) are excluded rather than admitted —
  // an unattributable row must not be shown under a company's view. They are
  // already excluded by the origin filter above; this keeps that true if the
  // origin filter is ever relaxed.
  if (opts.callerCompanyId) {
    items = items.filter((r) => r.companyId === opts.callerCompanyId);
  }
  // Status: an explicit filter matches exactly; otherwise resolved items are
  // hidden by default (you clear a report by resolving it — it leaves the queue).
  if (opts.status) items = items.filter((r) => r.status === opts.status);
  else items = items.filter((r) => r.status !== "resolved");
  if (!opts.includeHidden) items = items.filter((r) => !r.submitterHiddenAt);
  return items
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, opts.maxItems ?? 50);
}
// [SCOPE 043] END
