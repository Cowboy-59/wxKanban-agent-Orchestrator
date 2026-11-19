/**
 * Spec 042 / Phase 1 — pure builders for project.cockpit_summary.
 *
 * Extracted from the server.ts switch so the grouping rules and the scope
 * assertion are unit-testable without a DB or HTTP layer. The handler feeds
 * these already-scoped rows (rows are filtered to the token's project by
 * withScope().selectScoped before they ever reach here).
 */
import { ScopeViolationError } from '../db/scoped-query.js';
import type { McpScope } from '../middleware/auth.js';

// [SCOPE 042 / T005] BEGIN — the "incomplete" task status set
// A task counts as remaining work unless it is in a terminal/closed state.
// Mirrors dbpush's status enum ('todo' | 'in_progress' | 'blocked' | 'done');
// anything not in this set (done/completed/cancelled/…) is excluded.
export const INCOMPLETE_TASK_STATUSES = new Set<string>(['todo', 'in_progress', 'blocked']);

export function isIncompleteStatus(status: string | null | undefined): boolean {
  return INCOMPLETE_TASK_STATUSES.has((status ?? '').toLowerCase());
}
// [SCOPE 042 / T005] END

// [SCOPE 042 / T002] BEGIN — cockpit summary DTOs (wire contract; mirrors vscode-extension/src/types.ts)
export interface CockpitTaskDto {
  id: string;
  title: string;
  status: string;
  descriptionMarkdown: string;
}

export interface CockpitScopeDto {
  id: string;
  specNumber: string;
  title: string;
  status: string;
  remainingCount: number;
  tasks: CockpitTaskDto[];
  // [SCOPE 058 / T006] BEGIN — scope check-out claim state (null when free)
  claimedBy: { userId: string; name: string } | null;
  claimedAt: string | null;
  // [SCOPE 058 / T006] END
}

export interface CockpitSummaryDto {
  projectId: string;
  scopes: CockpitScopeDto[];
  unlinkedTasks: CockpitTaskDto[];
  // [SCOPE 058 / T006] the caller's own user id (claimed-by-me vs -others); null in dev-bypass.
  viewerUserId: string | null;
  // [SCOPE 058 / T006] false for single-member companies — the cockpit then skips
  // the claim coordination + the FR-008 editor read-only (no teammates to coordinate).
  claimsEnabled: boolean;
  // [SCOPE 081 / T005] deterministic build-roadmap checklist for the Cockpit "Development
  // Plan" panel — one entry per scope with a done/partial/todo state from its task counts.
  devplan: Array<{ scope: string; title: string; state: 'done' | 'partial' | 'todo' }>;
}

/** Minimal row shapes the builder needs — a structural subset of the Drizzle rows. */
export interface SpecRow {
  id: string;
  specNumber: string;
  title: string;
  status: string;
  // [SCOPE 058 / T006] claim columns (optional so pre-058 callers/tests still satisfy the shape)
  claimedById?: string | null;
  claimedAt?: Date | string | null;
}
export interface TaskRow {
  id: string;
  name: string;
  status: string;
  description: string | null;
  specId: string | null;
}
// [SCOPE 042 / T002] END

// [SCOPE 042 / T003] BEGIN — assertCockpitScope (parity with list_open_items)
// Defence-in-depth: selectScoped already binds reads to scope.projectId, so a
// token for project A physically cannot read project B's rows. This assertion
// rejects a mismatched caller-supplied projectId up front so the leak is
// impossible AND legible (project_028_scope_leak_observation). Dev-bypass keeps
// prior behaviour for local/no-auth runs.
export function assertCockpitScope(inputProjectId: string | undefined, scope: McpScope): string {
  if (scope.authMode === 'dev-bypass') {
    return inputProjectId ?? scope.projectId ?? '';
  }
  if (!scope.projectId) {
    throw new ScopeViolationError('scope-incomplete: cockpit_summary requires a resolved projectId.');
  }
  if (inputProjectId && inputProjectId !== scope.projectId) {
    throw new ScopeViolationError(
      `scope-mismatch: cockpit_summary requested ${inputProjectId} but token is scoped to ${scope.projectId}.`,
    );
  }
  return scope.projectId;
}
// [SCOPE 042 / T003] END

// [SCOPE 042 / T005] BEGIN — buildCockpitSummary (scope -> incomplete tasks, grouped by scope)
// Groups incomplete tasks under their owning spec (scope). Tasks whose specId
// matches no spec in the scoped set (or is null) fall into unlinkedTasks rather
// than being dropped or attributed to the wrong scope — guards the historical
// dropped-spec-linkage bug. Scopes are returned in foundation-up build order
// when a scopeLayers map is supplied (development-plan order), else
// specNumber-ascending; the active-scope pin is a presentation concern handled
// client-side.
// [SCOPE 058 / T006] MODIFIED-BY — accept an optional claimer-name map to populate claimedBy.
// [SCOPE 081 / T005] MODIFIED-BY — order scopes by foundation-up layer (dev-plan order) when given scopeLayers.
export function buildCockpitSummary(
  specs: SpecRow[],
  tasks: TaskRow[],
  projectId: string,
  nameById?: Map<string, string>,
  viewerUserId?: string | null,
  claimsEnabled?: boolean,
  scopeLayers?: Map<number, number>,
): CockpitSummaryDto {
  const incompleteBySpec = new Map<string, TaskRow[]>();
  const specIds = new Set(specs.map((s) => s.id));

  // [SCOPE 058 / T006] normalize a claim timestamp (Date or string) to an ISO string.
  const toIso = (v: Date | string | null | undefined): string | null =>
    v == null ? null : typeof v === 'string' ? v : v.toISOString();

  for (const t of tasks) {
    if (!isIncompleteStatus(t.status)) continue;
    const key = t.specId && specIds.has(t.specId) ? t.specId : '__unlinked__';
    const bucket = incompleteBySpec.get(key);
    if (bucket) bucket.push(t);
    else incompleteBySpec.set(key, [t]);
  }

  const toDto = (t: TaskRow): CockpitTaskDto => ({
    id: t.id,
    title: t.name,
    status: t.status,
    descriptionMarkdown: t.description ?? '',
  });

  const scopes: CockpitScopeDto[] = specs
    .map((s) => {
      const its = incompleteBySpec.get(s.id) ?? [];
      return {
        id: s.id,
        specNumber: s.specNumber,
        title: s.title,
        status: s.status,
        remainingCount: its.length,
        tasks: its.map(toDto),
        // [SCOPE 058 / T006] claim state — name resolved from the caller-supplied map
        claimedBy: s.claimedById
          ? { userId: s.claimedById, name: nameById?.get(s.claimedById) ?? 'unknown' }
          : null,
        claimedAt: toIso(s.claimedAt),
      };
    })
    .sort((a, b) => {
      // [SCOPE 081 / T005] foundation-up (dev-plan) order: lower layer first,
      // then specNumber within a layer. Scopes absent from the graph sort last.
      const la = scopeLayers?.get(parseInt(a.specNumber, 10)) ?? Number.POSITIVE_INFINITY;
      const lb = scopeLayers?.get(parseInt(b.specNumber, 10)) ?? Number.POSITIVE_INFINITY;
      if (la !== lb) return la - lb;
      return a.specNumber.localeCompare(b.specNumber);
    });

  const unlinkedTasks = (incompleteBySpec.get('__unlinked__') ?? []).map(toDto);

  // [SCOPE 081 / T005] BEGIN — derive the build-roadmap checklist from task counts.
  const doneSpecStatuses = new Set(['released', 'done', 'complete', 'completed']);
  const totalsBySpec = new Map<string, { total: number; done: number }>();
  for (const t of tasks) {
    if (!t.specId || !specIds.has(t.specId)) continue;
    const c = totalsBySpec.get(t.specId) ?? { total: 0, done: 0 };
    c.total += 1;
    if (!isIncompleteStatus(t.status)) c.done += 1;
    totalsBySpec.set(t.specId, c);
  }
  const devplan = scopes.map((sc) => {
    const c = totalsBySpec.get(sc.id);
    let state: 'done' | 'partial' | 'todo' = 'todo';
    if (c && c.total > 0) state = c.done >= c.total ? 'done' : c.done > 0 ? 'partial' : 'todo';
    else if (doneSpecStatuses.has(sc.status.toLowerCase())) state = 'done';
    const n = parseInt(sc.specNumber, 10);
    const label = Number.isNaN(n) ? sc.specNumber : `SCOPE-${String(n).padStart(3, '0')}`;
    return { scope: label, title: sc.title, state };
  });
  // [SCOPE 081 / T005] END

  return { projectId, scopes, unlinkedTasks, viewerUserId: viewerUserId ?? null, claimsEnabled: claimsEnabled ?? true, devplan };
}
// [SCOPE 042 / T005] END
