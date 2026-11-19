// Wire contract for project.cockpit_summary (mcp-server/src/server.ts). Kept in
// sync with that tool's JSON output — they're coupled by the MCP response shape.

// [SCOPE 042 / T011] BEGIN — cockpit DTOs
export interface CockpitTask {
  id: string;
  title: string;
  status: string;
  descriptionMarkdown: string;
}

export interface CockpitScope {
  id: string;
  specNumber: string;
  title: string;
  status: string;
  remainingCount: number;
  tasks: CockpitTask[];
  // [SCOPE 058 / T014] scope check-out claim state (null when free)
  claimedBy?: { userId: string; name: string } | null;
  claimedAt?: string | null;
}

export interface CockpitSummary {
  projectId: string;
  scopes: CockpitScope[];
  unlinkedTasks: CockpitTask[];
  // [SCOPE 058 / T014] the caller's own user id, so the cockpit can tell
  // claimed-by-me from claimed-by-others (null in dev-bypass / unauth).
  viewerUserId?: string | null;
  // [SCOPE 058 / T014] false for single-member companies — skip claim visuals + editor read-only.
  claimsEnabled?: boolean;
  // [SCOPE 081 / T005] deterministic build-roadmap checklist for the "Development Plan" panel.
  devplan?: Array<{ scope: string; title: string; state: 'done' | 'partial' | 'todo' }>;
  // [SCOPE 043 / T024] Amendment D (FR-022) — may this caller ask for the vendor's
  // incoming-feedback queue? Absent on a server older than Amendment D; see
  // cockpitTreeProvider for why absence is treated as "ask anyway".
  canViewIncoming?: boolean;
}
// [SCOPE 042 / T011] END

// [SCOPE 058 / T009] BEGIN — checkout/checkin tool result shapes
export interface CheckoutScopeResult {
  ok: boolean;
  status: 'claimed' | 'reclaimed' | 'conflict' | 'forbidden' | 'not_found' | 'single_user';
  branchName?: string;
  claimedBy?: { userId: string; name: string } | null;
  claimedAt?: string | null;
  heldBy?: { userId: string; name: string };
  message?: string;
}

export interface CheckinScopeResult {
  ok: boolean;
  status: 'released' | 'conflict' | 'not_found' | 'noop' | 'single_user';
  forced?: boolean;
  heldBy?: { userId: string; name: string };
  message?: string;
}
// [SCOPE 058 / T009] END

// [SCOPE 043 / T010] BEGIN — list_my_feedback wire shape
export interface MyFeedbackItem {
  id: string;
  referenceId: string;
  type: string;
  title: string;
  // [SCOPE 043 / T011] body the submitter entered + auto-captured context (for the read-only detail view)
  details: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  status: string;
  severity: string | null;
  classification: string | null;
  duplicateOfId: string | null;
  clarificationQuestion: string | null;
  clarificationAnswer: string | null;
  declineReason: string | null;
  artifactStatus: string;
  notificationChannel: string;
  createdAt: string;
  firstTriagedAt: string | null;
}

// Statuses that mean the item is finished with. `list_my_feedback` returns every
// status — the Cockpit never sent a `status` filter — so a closed item would sit
// in the list forever. It has not bitten yet only because nothing in the queue has
// ever been resolved (measured 2026-08-03: 0 resolved / 0 declined out of 93), but
// the moment triage starts closing items they would pile up in the view that is
// supposed to show outstanding work.
export const CLOSED_FEEDBACK_STATUSES = ['resolved', 'declined'] as const;

/** True when an item still wants attention. Use for anything showing "my feedback". */
export function isOpenFeedback(item: MyFeedbackItem): boolean {
  return !CLOSED_FEEDBACK_STATUSES.includes(
    item.status as (typeof CLOSED_FEEDBACK_STATUSES)[number],
  );
}
// [SCOPE 043 / T010] END
