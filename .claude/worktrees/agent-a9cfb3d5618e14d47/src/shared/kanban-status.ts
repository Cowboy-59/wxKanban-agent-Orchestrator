// [SCOPE 122 / T002] BEGIN — Kanban status → column resolution.
//
// WHY THIS IS A SHARED, REACT-FREE MODULE: this logic decides whether a scope is
// visible at all, and it must be provable. Living inside ScopeKanbanBoard.tsx it could
// only be tested by importing React and dnd-kit into a node-environment test suite —
// which is exactly the kind of friction that leaves the important rule untested. Here
// it is plain TypeScript that any test can import.
//
// THE DEFECT THIS REPLACES: placement used to be a bare lookup,
// `STATUS_TO_COLUMN[s.status] === columnId`. An unrecognised status yields `undefined`,
// which is equal to no column id, so the card was filtered out of EVERY column at once
// and vanished from the board. Nothing errored. Measured 2026-08-03: a customer had 8
// of 9 scopes invisible, all of them status `beta`, while every other surface reported
// the rows as healthy.
import type { ScopeStatus } from './types/projects';

/**
 * Sentinel for a status hidden BY INTENT.
 *
 * Distinct from "unmapped", and the distinction is load-bearing: an unmapped status
 * falls back to a visible column, whereas a status pointed at this sentinel leaves the
 * board deliberately — documented, reversible, and reachable again through the filter
 * bar. Hidden-by-intent is a rule; vanished-by-accident is the bug.
 */
export const HIDDEN_COLUMN = '__hidden__';

/** The column unmapped statuses fall back to. Visible, so nothing can disappear. */
export const FALLBACK_COLUMN_ID = 'deferred';

/**
 * The app's own vocabulary. `Record<ScopeStatus, string>` is deliberate — it forces
 * every member of the union to be mapped, and it is why `archived` being absent was a
 * latent type error. Nothing caught it because the client is never typechecked (Vite
 * and esbuild strip types without checking), so the app could hide a scope unaided.
 */
export const STATUS_TO_COLUMN: Record<ScopeStatus, string> = {
  draft: 'phase1',
  in_review: 'phase1',
  pending_clarification: 'phase1',
  clarified: 'phase1',
  planned: 'phase2',
  tasks_generated: 'phase2',
  implementing: 'phase2',
  implemented: 'phase3',
  qa_passed: 'phase3',
  human_tested: 'phase4',
  beta_cleared: 'phase5',
  released: 'phase6',
  deferred: 'deferred',
  archived: HIDDEN_COLUMN,
};

/**
 * The MCP's vocabulary, written by `project.update_spec_status`.
 *
 * The MCP's shorter set is canonical: customer data already holds these values, so
 * adopting them needs no production migration — whereas migrating everyone to the app's
 * longer names would be a breaking data change. Both vocabularies render, so nothing
 * that works today breaks. Kept in step with the MCP by a drift guard (T006).
 */
export const MCP_STATUS_TO_COLUMN: Record<string, string> = {
  qa: 'phase3',
  human_testing: 'phase4',
  beta: 'phase5',
  archived: HIDDEN_COLUMN,
};

/**
 * Resolve a status to a column id — and never to nothing.
 *
 * Returns a real column for every input. An unrecognised status lands in the fallback
 * column, so a future vocabulary drift shows up as a card in the wrong place — visible,
 * reportable, obviously wrong — instead of a card nobody can find.
 */
export function resolveColumnId(status: string): string {
  return (
    STATUS_TO_COLUMN[status as ScopeStatus] ??
    MCP_STATUS_TO_COLUMN[status] ??
    FALLBACK_COLUMN_ID
  );
}

/** True when a status is hidden by an explicit rule rather than by falling through. */
export function isHiddenStatus(status: string): boolean {
  return resolveColumnId(status) === HIDDEN_COLUMN;
}
// [SCOPE 122 / T002] END
