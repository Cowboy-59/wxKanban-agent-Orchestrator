import { useState, useCallback, useEffect, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Loader2, RefreshCw, AlertCircle, X, ArrowRight, ArrowLeft } from 'lucide-react';
import { ScopeKanbanColumn, type KanbanColumnDef } from './ScopeKanbanColumn';
import { ScopeKanbanCard } from './ScopeKanbanCard';
import { ScopeKanbanFilterBar, type KanbanFilters } from './ScopeKanbanFilterBar';
import type { ProjectScope, ScopeStatus, PanelDocument } from '~/shared/types/projects';
// [SCOPE 122 / T001] status→column vocabulary + the never-returns-nothing resolver
import { resolveColumnId, HIDDEN_COLUMN } from '~/shared/kanban-status';


// ── Types ─────────────────────────────────────────────────────────────────────

interface ScopeKanbanBoardProps {
  projectid: string;
  usertype: string;
  onOpenChat: (scopeId: string) => void;
  onEditDocument?: (doc: PanelDocument) => void;
}


interface PendingDrop {
  scopeId: string;
  scopeTitle: string;
  fromColumnId: string;
  toColumnId: string;
  targetStatus: ScopeStatus;
  isBackward: boolean;
  defaultReason: string;
}

// ── Column definitions ────────────────────────────────────────────────────────

const COLUMNS: KanbanColumnDef[] = [
  { id: 'phase1', label: 'Phase 1', sublabel: 'Design & Tasks' },
  { id: 'phase2', label: 'Phase 2', sublabel: 'Implementation' },
  { id: 'phase3', label: 'Phase 3', sublabel: 'QA Testing' },
  { id: 'phase4', label: 'Phase 4', sublabel: 'Human Testing', isOptional: true },
  { id: 'phase5', label: 'Phase 5', sublabel: 'Beta & Feedback', isOptional: true },
  { id: 'phase6', label: 'Phase 6', sublabel: 'Release' },
];

const DEFERRED_COLUMN: KanbanColumnDef = {
  id: 'deferred',
  label: 'Deferred',
  sublabel: 'Out of pipeline',
  isDeferred: true,
};

// ── Status → column mapping ───────────────────────────────────────────────────

// [SCOPE 122 / T001] The status→column vocabulary and the resolver live in
// `~/shared/kanban-status` — React-free, so the rule that decides whether a scope is
// visible at all can be unit-tested without dragging React and dnd-kit into a
// node-environment suite. See that module for why the bare lookup was replaced.

// Entry status when dragging INTO a column
const COLUMN_ENTRY_STATUS: Record<string, ScopeStatus> = {
  phase1:   'draft',
  phase2:   'planned',
  phase3:   'implemented',
  phase4:   'human_tested',
  phase5:   'beta_cleared',
  phase6:   'released',
  deferred: 'deferred',
};

// Phase order for forward/backward detection (deferred = 99 = always backward)
const COLUMN_ORDER: Record<string, number> = {
  phase1: 0, phase2: 1, phase3: 2, phase4: 3, phase5: 4, phase6: 5, deferred: 99,
};

// ── Auth helpers ──────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('wxkanban_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    ...options,
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// ── Confirmation dialog ───────────────────────────────────────────────────────

interface ConfirmDialogProps {
  pending: PendingDrop;
  saving: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

function ConfirmDialog({ pending, saving, onConfirm, onCancel }: ConfirmDialogProps) {
  const [reason, setReason] = useState(pending.defaultReason);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Focus the textarea on mount
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const canSubmit = !pending.isBackward || reason.trim().length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (canSubmit) onConfirm(reason.trim());
  }

  const fromLabel = pending.fromColumnId === 'deferred'
    ? 'Deferred'
    : COLUMNS.find((c) => c.id === pending.fromColumnId)?.label ?? pending.fromColumnId;
  const toLabel = pending.toColumnId === 'deferred'
    ? 'Deferred'
    : COLUMNS.find((c) => c.id === pending.toColumnId)?.label ?? pending.toColumnId;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            {pending.isBackward ? (
              <ArrowLeft className="w-4 h-4 text-amber-500 flex-shrink-0" />
            ) : (
              <ArrowRight className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            )}
            <h2 id="confirm-dialog-title" className="text-sm font-semibold text-gray-900 dark:text-white">
              {pending.isBackward ? 'Move scope backward' : 'Advance scope'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Scope info */}
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium text-gray-900 dark:text-white">{pending.scopeTitle}</span>
            <div className="flex items-center gap-1.5 mt-1 text-xs">
              <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                {fromLabel}
              </span>
              {pending.isBackward ? (
                <ArrowLeft className="w-3 h-3 text-amber-500" />
              ) : (
                <ArrowRight className="w-3 h-3 text-indigo-500" />
              )}
              <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                {toLabel}
              </span>
            </div>
          </div>

          {/* Backward warning */}
          {pending.isBackward && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Moving a scope backward will be logged to the audit trail. A reason is required.
              </p>
            </div>
          )}

          {/* Reason textarea */}
          <div>
            <label
              htmlFor="drag-reason"
              className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {pending.isBackward ? 'Reason (required)' : 'Reason (optional)'}
            </label>
            <textarea
              id="drag-reason"
              ref={inputRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={
                pending.isBackward
                  ? 'Explain why this scope is moving backward…'
                  : 'Add a note about this advancement (optional)…'
              }
              className={[
                'w-full text-sm rounded-lg border px-3 py-2 resize-none',
                'bg-white dark:bg-gray-900 text-gray-900 dark:text-white',
                'placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500',
                pending.isBackward && reason.trim().length === 0
                  ? 'border-amber-300 dark:border-amber-700'
                  : 'border-gray-200 dark:border-gray-700',
              ].join(' ')}
              required={pending.isBackward}
              aria-required={pending.isBackward}
            />
            {pending.isBackward && reason.trim().length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                A reason is required for backward moves.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || saving}
              className={[
                'flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg transition-colors',
                canSubmit && !saving
                  ? pending.isBackward
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed',
              ].join(' ')}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {pending.isBackward ? 'Move backward' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main board component ──────────────────────────────────────────────────────

export function ScopeKanbanBoard({ projectid, usertype, onOpenChat, onEditDocument }: ScopeKanbanBoardProps) {

  const [scopes, setScopes] = useState<ProjectScope[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDragScope, setActiveDragScope] = useState<ProjectScope | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState<KanbanFilters>({
    search: '',
    statusFilter: 'all',
    showDeferred: true,
    // [SCOPE 122 / T004] Off by default — archived is hidden by intent; this is the
    // opt-in that keeps it retrievable.
    showArchived: false,
  });

  const canDrag = usertype === 'ADMIN' || usertype === 'TEAM_MANAGER';

  // ── Sensors ────────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor)
  );

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchScopes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ scopes: ProjectScope[] }>(
        `/api/projects/${projectid}/scopes`
      );
      setScopes(data.scopes);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectid]);

  useEffect(() => {
    void fetchScopes();
  }, [fetchScopes]);

  // [SCOPE 098 / T003] Hard-delete a scope + its children (any project member).
  // window.confirm states the impact (task + document counts). Refetch on both
  // success and error so the board resyncs to server truth. [FR-003/FR-004]
  const handleDeleteScope = useCallback(async (scope: ProjectScope) => {
    const taskCount = scope.taskcount ?? 0;
    const docCount = scope.documents?.length ?? 0;
    const confirmed = window.confirm(
      `Permanently delete scope ${scope.specnumber} "${scope.title}" and its ` +
        `${taskCount} task(s) and ${docCount} document(s)? This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await apiFetch(`/api/projects/${projectid}/scopes/${scope.id}`, { method: 'DELETE' });
    } catch (err) {
      window.alert((err as Error).message || 'Could not delete the scope. Please try again.');
    } finally {
      void fetchScopes();
    }
  }, [projectid, fetchScopes]);

  // ── Real-time refresh ───────────────────────────────────────────────────────

  useEffect(() => {
    // Listen for spec lifecycle changes from pg_notify via SSE
    const handleSpecChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ projectid: string; specid: string }>;
      if (customEvent.detail?.projectid === projectid) {
        // Refresh scopes when this project's specs change
        void fetchScopes();
      }
    };

    window.addEventListener('spec-lifecycle-changed', handleSpecChange);
    return () => {
      window.removeEventListener('spec-lifecycle-changed', handleSpecChange);
    };
  }, [projectid, fetchScopes]);


  // ── Filtering ──────────────────────────────────────────────────────────────

  const filteredScopes = scopes.filter((s) => {
    if (!filters.showDeferred && s.status === 'deferred') return false;
    if (filters.statusFilter !== 'all' && s.status !== filters.statusFilter) return false;
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      if (
        !s.title.toLowerCase().includes(q) &&
        !s.specnumber.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  // ── Column → scopes mapping ────────────────────────────────────────────────

  function getScopesForColumn(columnId: string): ProjectScope[] {
    return filteredScopes.filter((s) => {
      const resolved = resolveColumnId(s.status);
      // [SCOPE 122 / T004] Archived is off the board by an explicit rule, not by
      // falling through a lookup — and it stays retrievable: revealing it surfaces the
      // scope in Deferred rather than reappearing mid-pipeline, so "hidden" can never
      // quietly become "lost".
      if (resolved === HIDDEN_COLUMN) {
        return filters.showArchived === true && columnId === DEFERRED_COLUMN.id;
      }
      return resolved === columnId;
    });
  }

  // ── Drag handlers ──────────────────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    const scope = scopes.find((s) => s.id === event.active.id);
    setActiveDragScope(scope ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragScope(null);
    const { active, over } = event;
    if (!over) return;

    const scope = scopes.find((s) => s.id === active.id);
    if (!scope) return;

    const fromColumnId = resolveColumnId(scope.status);
    const toColumnId = over.id as string;

    // No-op: dropped in same column
    if (fromColumnId === toColumnId) return;

    const targetStatus = COLUMN_ENTRY_STATUS[toColumnId];
    if (!targetStatus) return;

    const fromOrder = COLUMN_ORDER[fromColumnId] ?? 0;
    const toOrder = COLUMN_ORDER[toColumnId] ?? 0;
    const isBackward = toOrder < fromOrder || toColumnId === 'deferred';

    // Phase skip rules: Phases 1–3 mandatory (no skipping forward)
    // Phases 4 and 5 are optional (may be skipped). Admins may skip any phase.
    if (!isBackward && toColumnId !== 'deferred' && usertype !== 'ADMIN') {
      const mandatoryPhases = ['phase1', 'phase2', 'phase3'];
      const isMandatorySkip = mandatoryPhases.some((p) => {
        const pOrder = COLUMN_ORDER[p];
        return pOrder > fromOrder && pOrder < toOrder;
      });
      if (isMandatorySkip) {
        return;
      }
    }

    const toLabel = toColumnId === 'deferred'
      ? 'Deferred'
      : COLUMNS.find((c) => c.id === toColumnId)?.label ?? toColumnId;

    const defaultReason = isBackward
      ? ''
      : `Advancing scope to ${toLabel}`;

    setPendingDrop({
      scopeId: scope.id,
      scopeTitle: scope.title,
      fromColumnId,
      toColumnId,
      targetStatus,
      isBackward,
      defaultReason,
    });
  }

  // ── Confirm drop ───────────────────────────────────────────────────────────

  async function handleConfirmDrop(reason: string) {
    if (!pendingDrop) return;
    setSaving(true);
    try {
      await apiFetch(`/api/projects/${projectid}/scopes/${pendingDrop.scopeId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: pendingDrop.targetStatus, reason: reason || undefined }),
      });
      // Optimistic update
      setScopes((prev) =>
        prev.map((s) =>
          s.id === pendingDrop.scopeId ? { ...s, status: pendingDrop.targetStatus } : s
        )
      );
      setPendingDrop(null);
    } catch (err) {
      setError((err as Error).message);
      setPendingDrop(null);
    } finally {
      setSaving(false);
    }
  }

  function handleCancelDrop() {
    setPendingDrop(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading scopes…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertCircle className="w-6 h-6 text-red-500" />
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button
          type="button"
          onClick={() => void fetchScopes()}
          className="flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    );
  }

  const activeColumns = COLUMNS;
  const deferredScopes = getScopesForColumn('deferred');

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <ScopeKanbanFilterBar
        filters={filters}
        onChange={setFilters}
        totalCount={scopes.length}
        visibleCount={filteredScopes.length}
      />

      {/* Board */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-3 p-4 min-w-max h-full items-start">
            {/* Active phase columns */}
            {activeColumns.map((col) => (
              <ScopeKanbanColumn
                key={col.id}
                column={col}
                scopes={getScopesForColumn(col.id)}
                canDrag={canDrag}
                onOpenChat={onOpenChat}
                onEditDocument={onEditDocument}
                onDeleteScope={handleDeleteScope}
              />

            ))}

            {/* Visual separator before deferred */}
            {filters.showDeferred && (
              <>
                <div className="flex-shrink-0 w-px bg-gray-200 dark:bg-gray-700 self-stretch mx-1" aria-hidden="true" />
                <ScopeKanbanColumn
                  column={DEFERRED_COLUMN}
                  scopes={deferredScopes}
                  canDrag={canDrag}
                  onOpenChat={onOpenChat}
                  onEditDocument={onEditDocument}
                  onDeleteScope={handleDeleteScope}
                />

              </>
            )}
          </div>
        </div>

        {/* Drag overlay — ghost card while dragging */}
        <DragOverlay dropAnimation={null}>
          {activeDragScope ? (
            <div className="rotate-2 opacity-90 pointer-events-none">
              <ScopeKanbanCard
                scope={activeDragScope}
                canDrag={false}
                onOpenChat={() => undefined}
                onEditDocument={onEditDocument}
              />

            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Confirmation dialog */}
      {pendingDrop && (
        <ConfirmDialog
          pending={pendingDrop}
          saving={saving}
          onConfirm={(reason) => void handleConfirmDrop(reason)}
          onCancel={handleCancelDrop}
        />
      )}
    </div>
  );
}
