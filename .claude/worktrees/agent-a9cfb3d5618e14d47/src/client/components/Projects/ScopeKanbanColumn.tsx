import { useDroppable } from '@dnd-kit/core';
import { ScopeKanbanCard } from './ScopeKanbanCard';
import type { ProjectScope, PanelDocument } from '~/shared/types/projects';


// ── Types ─────────────────────────────────────────────────────────────────────

export interface KanbanColumnDef {
  id: string;           // e.g. 'phase1', 'deferred'
  label: string;        // e.g. 'Phase 1'
  sublabel: string;     // e.g. 'Design & Tasks'
  isDeferred?: boolean;
  isOptional?: boolean; // Phases 4 & 5 are optional
}

interface ScopeKanbanColumnProps {
  column: KanbanColumnDef;
  scopes: ProjectScope[];
  canDrag: boolean;
  onOpenChat: (scopeId: string) => void;
  onEditDocument?: (doc: PanelDocument) => void;
  // [SCOPE 098 / T003] Hard-delete a scope from the board.
  onDeleteScope?: (scope: ProjectScope) => void;
}


// ── Phase column header colours ───────────────────────────────────────────────

const COLUMN_HEADER: Record<string, string> = {
  phase1:   'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
  phase2:   'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300',
  phase3:   'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300',
  phase4:   'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300',
  phase5:   'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300',
  phase6:   'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300',
  deferred: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400',
};

const COLUMN_DROP_ACTIVE: Record<string, string> = {
  phase1:   'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50/50 dark:bg-blue-900/10',
  phase2:   'ring-2 ring-indigo-400 dark:ring-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10',
  phase3:   'ring-2 ring-yellow-400 dark:ring-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/10',
  phase4:   'ring-2 ring-orange-400 dark:ring-orange-500 bg-orange-50/50 dark:bg-orange-900/10',
  phase5:   'ring-2 ring-purple-400 dark:ring-purple-500 bg-purple-50/50 dark:bg-purple-900/10',
  phase6:   'ring-2 ring-green-400 dark:ring-green-500 bg-green-50/50 dark:bg-green-900/10',
  deferred: 'ring-2 ring-red-400 dark:ring-red-500 bg-red-50/50 dark:bg-red-900/10',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ScopeKanbanColumn({
  column,
  scopes,
  canDrag,
  onOpenChat,
  onEditDocument,
  onDeleteScope,
}: ScopeKanbanColumnProps) {

  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  const headerClass = COLUMN_HEADER[column.id] ?? COLUMN_HEADER.phase1;
  const dropActiveClass = isOver ? (COLUMN_DROP_ACTIVE[column.id] ?? '') : '';

  return (
    <div
      ref={setNodeRef}
      className={[
        'flex flex-col min-w-[220px] w-[220px] flex-shrink-0 rounded-xl border',
        'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50',
        'transition-all duration-150',
        dropActiveClass,
        column.isDeferred ? 'opacity-80' : '',
      ].join(' ')}
      aria-label={`${column.label} — ${column.sublabel} column`}
      aria-dropeffect={canDrag ? 'move' : 'none'}
    >
      {/* Column header */}
      <div className={`px-3 py-2.5 rounded-t-xl border-b ${headerClass}`}>
        <div className="flex items-center justify-between gap-1">
          <div>
            <p className="text-xs font-semibold leading-tight">{column.label}</p>
            <p className="text-[10px] opacity-75 leading-tight mt-0.5">{column.sublabel}</p>
          </div>
          <div className="flex items-center gap-1">
            {column.isOptional && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-white/40 dark:bg-black/20 font-medium opacity-70">
                optional
              </span>
            )}
            {/* Scope count badge */}
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/50 dark:bg-black/20 min-w-[20px] text-center">
              {scopes.length}
            </span>
          </div>
        </div>
      </div>

      {/* Cards area */}
      <div
        className={[
          'flex-1 p-2 space-y-2 min-h-[120px] overflow-y-auto',
          'max-h-[calc(100vh-280px)]',
          isOver ? 'bg-white/30 dark:bg-white/5' : '',
        ].join(' ')}
      >
        {scopes.length === 0 ? (
          <div
            className={[
              'flex items-center justify-center h-16 rounded-lg border-2 border-dashed text-xs',
              isOver
                ? 'border-indigo-400 dark:border-indigo-500 text-indigo-500 dark:text-indigo-400'
                : 'border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600',
            ].join(' ')}
          >
            {isOver ? 'Drop here' : 'Empty'}
          </div>
        ) : (
          scopes.map((scope) => (
            <ScopeKanbanCard
              key={scope.id}
              scope={scope}
              canDrag={canDrag}
              onOpenChat={onOpenChat}
              onEditDocument={onEditDocument}
              onDelete={onDeleteScope}
            />
          ))

        )}
      </div>
    </div>
  );
}
