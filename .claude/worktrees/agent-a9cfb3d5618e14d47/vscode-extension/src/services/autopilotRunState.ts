// SCOPE-154 / T014 (FR-014) — Cockpit live view of the running scope and process.
//
// Pure read side: parses the local Autopilot run-state file and turns it into the view model the
// "Autopilot" tree shows. No `vscode` import here (mirrors impactModel.ts) so the mapping rules
// are unit-testable in plain Node.
//
// INTERIM NOTE (2026-11-08): SPEC-154 T001-T013 are still `todo` in tasks.md, and the
// Autopilot-specific run-state writer that exists so far
// (wxkanban-agent/apps/remote-bridge/src/autopilot-skip.ts, AUTOPILOT_STATE_PATH =
// "docs/GOD-State-Autopilot.json") only persists `{ mode, skips, units }` — it does not yet write
// a current-scope / current-step / step-start-time field. This module reads that same real path
// and shape, and maps what is actually there (the `units` done/failed/parked list) onto FR-014's
// "remaining startup-list items with status"; `currentScope`, `currentStep` and `elapsedMs` stay
// `null` (shown as "unknown") until a later T005/T007/T008 task starts writing them into this
// same file — this module requires no change to pick them up once it does, since the fields are
// read defensively as optional.

// [SCOPE 154 / T014] BEGIN — Autopilot run-state file shape + view model (FR-014)
export type UnitStatus = 'done' | 'failed' | 'skipped' | 'in-progress' | 'waiting' | 'parked';

/** The on-disk shape as written today (autopilot-skip.ts `AutopilotRunState`), plus the
 *  optional "where things stand right now" fields FR-014 asks for, read defensively since no
 *  current task writes them yet. */
export interface AutopilotRunStateFile {
  mode?: string;
  /** Not yet written by any built task; present for forward-compatibility with T005/T008. */
  currentScope?: string;
  currentStep?: 'validateScope' | 'createSpecs' | 'implement' | string;
  /** ISO timestamp the current step began; elapsed time is derived from this, not stored. */
  stepStartedAt?: string;
  /** The startup list in build order, when a startup-list writer (T003) persists it here. */
  startupList?: Array<{ scope: string; title?: string; status?: UnitStatus }>;
  skips?: Array<{ scope: string; title: string; status: 'skipped' | 'partly-worked' }>;
  units?: Array<{ scope: string; title: string; status: 'done' | 'failed' | 'parked'; error?: string }>;
}

export interface AutopilotListItem {
  scope: string;
  title: string;
  status: UnitStatus;
}

export interface AutopilotView {
  running: boolean;
  currentScope: string | null;
  currentStep: string | null;
  elapsedMs: number | null;
  items: AutopilotListItem[];
}

/** No file on disk, or a file that fails to parse: "not running" (FR-014 — never simply absent). */
export const NOT_RUNNING: AutopilotView = {
  running: false,
  currentScope: null,
  currentStep: null,
  elapsedMs: null,
  items: [],
};
// [SCOPE 154 / T014] END

// [SCOPE 154 / T014] BEGIN — AutopilotRunStateFile → AutopilotView mapping (FR-014)
/**
 * Builds the view the tree renders from the parsed run-state file. A present-but-empty file
 * (no `currentScope`, no units, no startupList) still counts as "running" — the file's mere
 * presence is Autopilot's only signal that a run was started; a file that cannot be read at all
 * is the only "not running" case (the caller passes `null` for that).
 */
export function toAutopilotView(state: AutopilotRunStateFile | null, now: number = Date.now()): AutopilotView {
  if (!state) return NOT_RUNNING;

  const byScope = new Map<string, AutopilotListItem>();
  for (const s of state.startupList ?? []) {
    byScope.set(s.scope, { scope: s.scope, title: s.title ?? s.scope, status: s.status ?? 'waiting' });
  }
  for (const s of state.skips ?? []) {
    byScope.set(s.scope, { scope: s.scope, title: s.title, status: s.status === 'partly-worked' ? 'in-progress' : 'skipped' });
  }
  for (const u of state.units ?? []) {
    byScope.set(u.scope, { scope: u.scope, title: u.title, status: u.status });
  }
  if (state.currentScope && !byScope.has(state.currentScope)) {
    byScope.set(state.currentScope, { scope: state.currentScope, title: state.currentScope, status: 'in-progress' });
  }

  const elapsedMs = state.stepStartedAt ? Math.max(0, now - Date.parse(state.stepStartedAt)) : null;

  return {
    running: true,
    currentScope: state.currentScope ?? null,
    currentStep: state.currentStep ?? null,
    elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : null,
    items: [...byScope.values()],
  };
}
// [SCOPE 154 / T014] END

// [SCOPE 154 / T014] BEGIN — Tree-label formatting helpers (FR-014)
/** `3h 05m`, `12m`, `42s` — the elapsed-time label for the current step. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** One line per item, for the tree's description column. */
export function statusLabel(status: UnitStatus): string {
  switch (status) {
    case 'done':
      return 'done';
    case 'failed':
      return 'failed';
    case 'skipped':
      return 'skipped';
    case 'in-progress':
      return 'in progress';
    case 'parked':
      return 'parked';
    default:
      return 'waiting';
  }
}
// [SCOPE 154 / T014] END
