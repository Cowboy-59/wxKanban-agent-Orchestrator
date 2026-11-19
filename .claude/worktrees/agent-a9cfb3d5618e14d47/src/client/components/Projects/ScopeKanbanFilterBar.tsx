import { Search, X } from 'lucide-react';
import type { ScopeStatus } from '~/shared/types/projects';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KanbanFilters {
  search: string;
  statusFilter: ScopeStatus | 'all';
  showDeferred: boolean;
  // [SCOPE 122 / T004] Archived scopes are off the board by an explicit rule. This is
  // the way back to them — without it, archiving a scope removes it from the UI with no
  // path to recover it, and "hidden by intent" degrades into "lost".
  showArchived: boolean;
}

interface ScopeKanbanFilterBarProps {
  filters: KanbanFilters;
  onChange: (filters: KanbanFilters) => void;
  totalCount: number;
  visibleCount: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: Array<{ value: ScopeStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'In Review' },
  { value: 'pending_clarification', label: 'Needs Clarification' },
  { value: 'clarified', label: 'Clarified' },
  { value: 'planned', label: 'Planned' },
  { value: 'tasks_generated', label: 'Tasks Generated' },
  { value: 'implementing', label: 'Implementing' },
  { value: 'implemented', label: 'Implemented' },
  { value: 'qa_passed', label: 'QA Passed' },
  { value: 'human_tested', label: 'Human Tested' },
  { value: 'beta_cleared', label: 'Beta Cleared' },
  { value: 'released', label: 'Released' },
  { value: 'deferred', label: 'Deferred' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function ScopeKanbanFilterBar({
  filters,
  onChange,
  totalCount,
  visibleCount,
}: ScopeKanbanFilterBarProps) {
  const hasActiveFilters =
    filters.search.trim() !== '' ||
    filters.statusFilter !== 'all' ||
    !filters.showDeferred ||
    // [SCOPE 122 / T004] Revealing archived scopes is a non-default view, so it counts
    // as an active filter — otherwise "Clear filters" would leave it on silently.
    filters.showArchived;

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange({ ...filters, search: e.target.value });
  }

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    onChange({ ...filters, statusFilter: e.target.value as ScopeStatus | 'all' });
  }

  function handleDeferredToggle() {
    onChange({ ...filters, showDeferred: !filters.showDeferred });
  }

  // [SCOPE 122 / T004] BEGIN — reveal archived scopes (they surface in Deferred).
  function handleArchivedToggle() {
    onChange({ ...filters, showArchived: !filters.showArchived });
  }
  // [SCOPE 122 / T004] END

  function handleClearFilters() {
    onChange({ search: '', statusFilter: 'all', showDeferred: true, showArchived: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={filters.search}
          onChange={handleSearchChange}
          placeholder="Search scopes…"
          className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          aria-label="Search scopes"
        />
        {filters.search && (
          <button
            type="button"
            onClick={() => onChange({ ...filters, search: '' })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Status filter */}
      <select
        value={filters.statusFilter}
        onChange={handleStatusChange}
        className="text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        aria-label="Filter by status"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Show deferred toggle */}
      <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={filters.showDeferred}
          onChange={handleDeferredToggle}
          className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
        />
        Show deferred
      </label>

      {/* [SCOPE 122 / T004] Show archived — the retrieval path for hidden scopes */}
      <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={filters.showArchived}
          onChange={handleArchivedToggle}
          className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
        />
        Show archived
      </label>

      {/* Scope count */}
      <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
        {visibleCount === totalCount
          ? `${totalCount} scope${totalCount !== 1 ? 's' : ''}`
          : `${visibleCount} of ${totalCount} scope${totalCount !== 1 ? 's' : ''}`}
      </span>

      {/* Clear filters */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={handleClearFilters}
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
