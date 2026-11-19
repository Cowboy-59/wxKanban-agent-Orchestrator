import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MessageSquare, FileText, X, ExternalLink, Workflow, FileSearch, Trash2, Lock } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProjectScope, ScopeStatus, PanelDocument } from '~/shared/types/projects';



// ── Types ─────────────────────────────────────────────────────────────────────

interface ScopeKanbanCardProps {
  scope: ProjectScope;
  canDrag: boolean;
  onOpenChat: (scopeId: string) => void;
  onEditDocument?: (doc: PanelDocument) => void;
  // [SCOPE 098 / T003] Hard-delete this scope + its children. Optional so the
  // drag-overlay ghost card can render without it.
  onDelete?: (scope: ProjectScope) => void;
}


// ── Status badge colours (matches SpecList.tsx palette) ───────────────────────

const STATUS_BADGE: Record<ScopeStatus, string> = {
  draft:                 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  in_review:             'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  pending_clarification: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  clarified:             'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  planned:               'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  tasks_generated:       'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  implementing:          'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  implemented:           'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  qa_passed:             'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  human_tested:          'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  beta_cleared:          'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400',
  released:              'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  deferred:              'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

const STATUS_LABEL: Record<ScopeStatus, string> = {
  draft:                 'Draft',
  in_review:             'In Review',
  pending_clarification: 'Needs Clarification',
  clarified:             'Clarified',
  planned:               'Planned',
  tasks_generated:       'Tasks Generated',
  implementing:          'Implementing',
  implemented:           'Implemented',
  qa_passed:             'QA Passed',
  human_tested:          'Human Tested',
  beta_cleared:          'Beta Cleared',
  released:              'Released',
  deferred:              'Deferred',
};

// ── Task progress bar ─────────────────────────────────────────────────────────

function TaskProgressBar({ scope }: { scope: ProjectScope }) {
  const total = scope.taskcount;
  if (total === 0) return null;

  const completedPct = Math.round((scope.completedtaskcount / total) * 100);
  const inProgressPct = Math.round((scope.inprogresscount / total) * 100);

  return (
    <div className="mt-2">
      {/* Bar */}
      <div
        className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden"
        role="progressbar"
        aria-valuenow={completedPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${completedPct}% complete`}
      >
        <div className="h-full flex">
          {completedPct > 0 && (
            <div
              className="h-full bg-green-500 dark:bg-green-400 transition-all"
              style={{ width: `${completedPct}%` }}
            />
          )}
          {inProgressPct > 0 && (
            <div
              className="h-full bg-blue-400 dark:bg-blue-500 transition-all"
              style={{ width: `${inProgressPct}%` }}
            />
          )}
        </div>
      </div>
      {/* Counts */}
      <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400 dark:text-gray-500">
        <span>{scope.completedtaskcount}/{total} done</span>
        {scope.inprogresscount > 0 && (
          <span className="text-blue-500 dark:text-blue-400">{scope.inprogresscount} in progress</span>
        )}
        {scope.opencount > 0 && (
          <span>{scope.opencount} open</span>
        )}
      </div>
    </div>
  );
}

// ── Main card component ───────────────────────────────────────────────────────

export function ScopeKanbanCard({ scope, canDrag, onOpenChat, onEditDocument, onDelete }: ScopeKanbanCardProps) {
  const [showDocs, setShowDocs] = useState(false);
  const navigate = useNavigate();

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: scope.id,
    data: { scope },
    disabled: !canDrag,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  const badgeClass = STATUS_BADGE[scope.status] ?? STATUS_BADGE.draft;
  const statusLabel = STATUS_LABEL[scope.status] ?? scope.status;
  // [SCOPE 058 / T032] Checkout holder — who is working this scope (null when free).
  const holderName = scope.claimedbyid ? (scope.claimedbyname ?? 'Unknown user') : null;
  const holderTitle = holderName
    ? `Checked out by ${holderName}${scope.claimedat ? ` on ${new Date(scope.claimedat).toLocaleString()}` : ''}`
    : '';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(canDrag ? { ...attributes, ...listeners } : {})}
      className={[
        'group relative bg-white dark:bg-gray-800 rounded-lg border transition-all',
        isDragging
          ? 'border-indigo-400 dark:border-indigo-500 shadow-lg opacity-80 z-50 rotate-1'
          : 'border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600',
        canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
      ].join(' ')}
      role="button"
      tabIndex={0}
      aria-label={`Scope ${scope.specnumber}: ${scope.title} — ${statusLabel}${holderName ? ` — ${holderTitle}` : ''}`}
      aria-grabbed={isDragging}
      onClick={() => onOpenChat(scope.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenChat(scope.id);
        }
      }}
    >
      {/* Drag handle indicator (visual only) */}
      {canDrag && (
        <div
          className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity p-1 text-gray-400 pointer-events-none"
          aria-hidden="true"
        >
          <GripVertical className="w-3 h-3" />
        </div>
      )}

      <div className={['p-3', canDrag ? 'pl-5' : ''].join(' ')}>
        {/* Header row: spec number + chat button */}
        <div className="flex items-start justify-between gap-1 mb-1">
          <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5">
            #{scope.specnumber}
          </span>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {/* [SCOPE 059 / T007] Process flow — task-dependency + AI-derived diagrams */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/projects/${scope.projectid}/specs/${scope.id}/process-flow`);
              }}
              className="transition-colors text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 p-0.5 rounded"
              aria-label={`Process flow for scope ${scope.specnumber}`}
              title="Process flow"
              tabIndex={-1}
            >
              <Workflow className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenChat(scope.id); }}
              className="transition-colors text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 p-0.5 rounded"
              aria-label={`Open chat for scope ${scope.specnumber}`}
              tabIndex={-1}
            >
              <MessageSquare className="w-3 h-3" />
            </button>
            {/* [SCOPE 098 / T003] Delete this scope + its children. */}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(scope); }}
                className="transition-colors text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-0.5 rounded"
                aria-label={`Delete scope ${scope.specnumber}`}
                title="Delete scope"
                tabIndex={-1}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Title with spec number */}
        <p className="text-sm font-medium text-gray-900 dark:text-white leading-snug line-clamp-2 mb-1">
          <span className="font-mono text-gray-500 dark:text-gray-400 mr-1">#{scope.specnumber}</span>
          {scope.title}
        </p>

        {/* [SCOPE 058 / T032] Checkout holder */}
        {holderName && (
          <p
            className="flex items-center gap-1 min-w-0 text-[11px] font-medium text-amber-700 dark:text-amber-400 mb-1"
            title={holderTitle}
            data-testid="scope-card-holder"
          >
            <Lock className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{holderName}</span>
          </p>
        )}

        {/* Outstanding tasks count */}
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
          {scope.taskcount - scope.completedtaskcount} task
          {scope.taskcount - scope.completedtaskcount !== 1 ? 's' : ''} outstanding
        </p>

        {/* Status badge */}
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${badgeClass}`}>
          {statusLabel}
        </span>

        {/* Optional marker */}
        {scope.isoptional && (
          <span className="ml-1.5 text-[10px] text-gray-400 dark:text-gray-500">optional</span>
        )}

        {/* Task progress */}
        <TaskProgressBar scope={scope} />

        {/* [SCOPE 060 / T013] Report links — per-scope Process Flow + Scope Analysis;
            attached documents stay reachable via a subtle trailing link. */}
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex flex-col gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate(`/projects/${scope.projectid}/specs/${scope.id}/process-flow`); }}
            className="flex items-center gap-1.5 w-full text-left text-[11px] font-medium text-indigo-600 dark:text-indigo-300 hover:underline"
          >
            <Workflow className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
            Scope Process Flow
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate(`/projects/${scope.projectid}/specs/${scope.id}/scope-analysis`); }}
            className="flex items-center gap-1.5 w-full text-left text-[11px] font-medium text-indigo-600 dark:text-indigo-300 hover:underline"
          >
            <FileSearch className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
            Scope Analysis
          </button>
          {scope.documents && scope.documents.length > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowDocs(true); }}
              className="flex items-center gap-1.5 w-full text-left text-[11px] text-gray-500 dark:text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400"
            >
              <FileText className="w-3.5 h-3.5 flex-shrink-0" />
              {scope.documents.length} document{scope.documents.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {/* Document List Modal/Popup */}
      {showDocs && scope.documents && scope.documents.length > 0 && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => setShowDocs(false)}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-80 max-w-[90vw] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-500" />
                Documents for {scope.specnumber}
              </h3>
              <button
                type="button"
                onClick={() => setShowDocs(false)}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
              >
                <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {scope.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-50 dark:border-gray-700/50 last:border-0"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                      {doc.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {doc.filepath && (
                      <a
                        href={doc.filepath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors"
                        title="Open document"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {onEditDocument && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onEditDocument(doc); }}
                        className="px-2 py-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/30 rounded transition-colors"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                {scope.documents.length} document{scope.documents.length !== 1 ? 's' : ''} attached
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
