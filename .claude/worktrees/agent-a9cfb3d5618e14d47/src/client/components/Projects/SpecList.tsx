import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Loader2,
  FileText,
  Edit2,
  Check,
  X,
  MessageSquare,
  SendHorizonal,
  ThumbsUp,
  ThumbsDown,
  Workflow,
  FileSearch,
} from "lucide-react";
import type { ProjectScope, ScopeStatus } from "~/shared/types/projects";

interface SpecListProps {
  specs: ProjectScope[];
  loading?: boolean;
  canEdit: boolean;
  /** True if the current user can approve/decline scopes (ADMIN or phase assignee) */
  canApprove?: boolean;
  onCreateSpec: (title: string, content?: string) => Promise<void>;
  onUpdateSpec: (specId: string, updates: { title?: string; content?: string }) => Promise<void>;
  onSubmitScope?: (specId: string) => Promise<void>;
  onApproveScope?: (specId: string, action: "approve" | "decline") => Promise<void>;
  onOpenChat?: (specId: string) => void;
}

const STATUS_BADGE: Record<ScopeStatus, string> = {
  draft: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  in_review: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  pending_clarification: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  clarified: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  planned: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  tasks_generated: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  implementing: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  implemented: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  qa_passed: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  human_tested: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  beta_cleared: "bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400",
  released: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  deferred: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_LABEL: Record<ScopeStatus, string> = {
  draft: "Draft",
  in_review: "In Review",
  pending_clarification: "Needs Clarification",
  clarified: "Clarified",
  planned: "Planned",
  tasks_generated: "Tasks Generated",
  implementing: "Implementing",
  implemented: "Implemented",
  qa_passed: "QA Passed",
  human_tested: "Human Tested",
  beta_cleared: "Beta Cleared",
  released: "Released",
  deferred: "Deferred",
};

interface NewSpecFormProps {
  onSubmit: (title: string, content?: string) => Promise<void>;
  onCancel: () => void;
  nextNumber: string;
}

function NewSpecForm({ onSubmit, onCancel, nextNumber }: NewSpecFormProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(title.trim(), content.trim() || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create spec");
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-indigo-200 dark:border-indigo-700 rounded-lg p-3 bg-indigo-50/50 dark:bg-indigo-900/10 space-y-2"
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-10 flex-shrink-0">
          {nextNumber}
        </span>
        <input
          type="text"
          required
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Spec title..."
          disabled={submitting}
          className="flex-1 px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Content / notes (optional)..."
        rows={3}
        disabled={submitting}
        className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim() || submitting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-md transition-colors"
        >
          {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
          Add Spec
        </button>
      </div>
    </form>
  );
}

interface SpecRowProps {
  spec: ProjectScope;
  canEdit: boolean;
  canApprove: boolean;
  onUpdate: (updates: { title?: string; content?: string }) => Promise<void>;
  onSubmit?: () => Promise<void>;
  onApprove?: (action: "approve" | "decline") => Promise<void>;
  onOpenChat?: () => void;
}

function SpecRow({ spec, canEdit, canApprove, onUpdate, onSubmit, onApprove, onOpenChat }: SpecRowProps) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(spec.title);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleTitleSave = async () => {
    if (!editTitle.trim() || editTitle === spec.title) {
      setEditing(false);
      setEditTitle(spec.title);
      return;
    }
    setSaving(true);
    try {
      await onUpdate({ title: editTitle.trim() });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!onSubmit) return;
    setActionError(null);
    setSaving(true);
    try {
      await onSubmit();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (action: "approve" | "decline") => {
    if (!onApprove) return;
    setActionError(null);
    setSaving(true);
    try {
      await onApprove(action);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update scope");
    } finally {
      setSaving(false);
    }
  };

  const statusVal = spec.status as ScopeStatus;
  const badgeClass = STATUS_BADGE[statusVal] ?? STATUS_BADGE.draft;
  const statusLabel = STATUS_LABEL[statusVal] ?? spec.status;

  const taskProgress = spec.taskcount > 0
    ? Math.round((spec.completedtaskcount / spec.taskcount) * 100)
    : null;

  return (
    <div className="border-b last:border-b-0 border-gray-100 dark:border-gray-700/50">
      <div className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
        {/* Spec number */}
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-10 flex-shrink-0 mt-0.5">
          {spec.specnumber}
        </span>

        {/* Title + task progress */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleTitleSave();
                  if (e.key === "Escape") {
                    setEditing(false);
                    setEditTitle(spec.title);
                  }
                }}
                disabled={saving}
                className="flex-1 px-2 py-1 border border-indigo-300 dark:border-indigo-600 rounded text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => void handleTitleSave()}
                disabled={saving}
                className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 disabled:opacity-50 transition-colors"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setEditTitle(spec.title); }}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <p className="text-sm font-medium text-gray-900 dark:text-white flex-1">
                {spec.title}
                {spec.isoptional && (
                  <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-gray-500">(optional)</span>
                )}
              </p>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors flex-shrink-0 mt-0.5"
                  title="Edit title"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Task progress bar */}
          {taskProgress !== null && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-1 bg-indigo-500 rounded-full transition-all"
                  style={{ width: `${taskProgress}%` }}
                />
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {spec.completedtaskcount}/{spec.taskcount}
              </span>
            </div>
          )}

          {actionError && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">{actionError}</p>
          )}
        </div>

        {/* Right side: status badge + action buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Status badge */}
          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${badgeClass}`}>
            {statusLabel}
          </span>

          {/* Submit for review — only on draft/pending_clarification when canEdit */}
          {canEdit && (statusVal === "draft" || statusVal === "pending_clarification") && onSubmit && (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving}
              title="Submit for review"
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <SendHorizonal className="w-3 h-3" />}
              Submit
            </button>
          )}

          {/* Approve / Decline — only on in_review when canApprove */}
          {canApprove && statusVal === "in_review" && onApprove && (
            <>
              <button
                type="button"
                onClick={() => void handleApprove("approve")}
                disabled={saving}
                title="Approve scope"
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
                Approve
              </button>
              <button
                type="button"
                onClick={() => void handleApprove("decline")}
                disabled={saving}
                title="Request clarification"
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/50 disabled:opacity-50 transition-colors"
              >
                <ThumbsDown className="w-3 h-3" />
                Clarify
              </button>
            </>
          )}

          {/* [SCOPE 059 / T007] Process Flow — per-scope diagram (tasks + AI-derived) */}
          <Link
            to={`/projects/${spec.projectid}/specs/${spec.id}/process-flow`}
            title="View process flow for this scope"
            className="p-1 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <Workflow className="w-3.5 h-3.5" />
          </Link>

          {/* [SCOPE 060 / T013] Scope Analysis — per-scope audit report */}
          <Link
            to={`/projects/${spec.projectid}/specs/${spec.id}/scope-analysis`}
            title="View scope analysis for this scope"
            className="p-1 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <FileSearch className="w-3.5 h-3.5" />
          </Link>

          {/* Chat button — for all scopes */}
          {onOpenChat && (
            <button
              type="button"
              onClick={onOpenChat}
              title="Open AI chat for this scope"
              className="p-1 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * SpecList — scope table for the Design phase.
 * Supports full scope lifecycle: submit, approve/decline, and AI chat.
 */
export function SpecList({
  specs,
  loading = false,
  canEdit,
  canApprove = false,
  onCreateSpec,
  onUpdateSpec,
  onSubmitScope,
  onApproveScope,
  onOpenChat,
}: SpecListProps) {
  const [showNewForm, setShowNewForm] = useState(false);

  const nextNumber = String(specs.length + 1).padStart(3, "0");

  const handleCreateSpec = async (title: string, content?: string) => {
    await onCreateSpec(title, content);
    setShowNewForm(false);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Add spec button / form */}
      {canEdit && !showNewForm && (
        <button
          type="button"
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add spec
        </button>
      )}

      {showNewForm && (
        <NewSpecForm
          onSubmit={handleCreateSpec}
          onCancel={() => setShowNewForm(false)}
          nextNumber={nextNumber}
        />
      )}

      {/* Empty state */}
      {specs.length === 0 && !showNewForm && (
        <div className="text-center py-8 text-gray-400 dark:text-gray-500">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No specifications yet</p>
          {canEdit && (
            <p className="text-xs mt-1">
              AI will generate initial specs automatically — or add your own above.
            </p>
          )}
        </div>
      )}

      {/* Specs table */}
      {specs.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
            <span className="w-10 flex-shrink-0">#</span>
            <span className="flex-1">Specification</span>
            <span className="flex-shrink-0">Status / Actions</span>
          </div>

          {specs.map((spec) => (
            <SpecRow
              key={spec.id}
              spec={spec}
              canEdit={canEdit}
              canApprove={canApprove}
              onUpdate={(updates) => onUpdateSpec(spec.id, updates)}
              onSubmit={onSubmitScope ? () => onSubmitScope(spec.id) : undefined}
              onApprove={onApproveScope ? (action) => onApproveScope(spec.id, action) : undefined}
              onOpenChat={onOpenChat ? () => onOpenChat(spec.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
