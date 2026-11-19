import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Star,
  Bug,
  Circle,
  ChevronDown,
  ExternalLink,
  User,
  Calendar,
} from "lucide-react";
import type { ProjectTaskDetail } from "~/shared/types/projects";
import { TaskDrawerActivity } from "./TaskDrawerActivity";
import { TaskDrawerTime } from "./TaskDrawerTime";
import { TaskDrawerDeps } from "./TaskDrawerDeps";
import { TaskDrawerNotes } from "./TaskDrawerNotes";

interface Props {
  taskid: string | null;
  projectid: string;
  onClose: () => void;
  onTaskUpdated?: () => void;
}

type DrawerTab = "activity" | "time" | "dependencies" | "notes";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("wxkanban_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    ...options,
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// --- Badge helpers ---

function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case "low":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "medium":
      return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "high":
      return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    case "critical":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "completed":
    case "pass":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "in_progress":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "fail":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "escalated":
      return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    case "deferred":
      return "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400";
    default:
      return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
  }
}

function effortBadgeClass(effort: string): string {
  switch (effort) {
    case "xs":
    case "s":
      return "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400";
    case "m":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "l":
      return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    case "xl":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
  }
}

function IssueTypeIcon({ type }: { type: string | null }) {
  switch (type) {
    case "bug":
      return <Bug className="w-3.5 h-3.5" />;
    case "feature":
      return <Star className="w-3.5 h-3.5" />;
    default:
      return <Circle className="w-3.5 h-3.5" />;
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// --- Editable name ---

interface EditableNameProps {
  value: string;
  onCommit: (name: string) => void;
  saving: boolean;
}

function EditableName({ value, onCommit, saving }: EditableNameProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onCommit(trimmed);
    } else {
      setDraft(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className="flex-1 min-w-0 text-base font-semibold text-gray-900 dark:text-white bg-transparent border-b-2 border-indigo-500 focus:outline-none py-0.5"
        autoFocus
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      disabled={saving}
      title="Click to edit task name"
      className="flex-1 min-w-0 text-left text-base font-semibold text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate disabled:opacity-60"
    >
      {value}
    </button>
  );
}

// --- Inline select ---

interface InlineSelectProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled: boolean;
  badgeClass: string;
}

function InlineSelect({ value, options, onChange, disabled, badgeClass }: InlineSelectProps) {
  return (
    <div className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`appearance-none pl-2 pr-5 py-0.5 rounded text-xs font-medium cursor-pointer border-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 ${badgeClass}`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-1 top-1 w-3 h-3 pointer-events-none opacity-60" />
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "deferred", label: "Deferred" },
  { value: "escalated", label: "Escalated" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const TABS: Array<{ key: DrawerTab; label: string }> = [
  { key: "activity", label: "Activity" },
  { key: "time", label: "Time" },
  { key: "dependencies", label: "Dependencies" },
  { key: "notes", label: "Notes" },
];

// --- Main drawer ---

export function TaskDrawer({ taskid, projectid, onClose, onTaskUpdated }: Props) {
  const [task, setTask] = useState<ProjectTaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DrawerTab>("activity");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchTask = useCallback(async () => {
    if (!taskid) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ProjectTaskDetail>(
        `/api/projects/${projectid}/tasks/${taskid}`
      );
      setTask(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load task");
    } finally {
      setLoading(false);
    }
  }, [taskid, projectid]);

  useEffect(() => {
    if (taskid) {
      setActiveTab("activity");
      void fetchTask();
    } else {
      setTask(null);
      setError(null);
    }
  }, [taskid, fetchTask]);

  const patchTask = useCallback(
    async (patch: Record<string, string | null>) => {
      if (!task) return;
      setSaving(true);
      setSaveError(null);
      try {
        const updated = await apiFetch<ProjectTaskDetail>(
          `/api/projects/${projectid}/tasks/${task.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(patch),
          }
        );
        setTask(updated);
        onTaskUpdated?.();
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setSaving(false);
      }
    },
    [task, projectid, onTaskUpdated]
  );

  const handleNameCommit = (name: string) => {
    void patchTask({ name });
  };

  const handleStatusChange = (status: string) => {
    void patchTask({ status });
  };

  const handlePriorityChange = (priority: string) => {
    void patchTask({ priority });
  };

  const handleDepsChanged = () => {
    void fetchTask();
    onTaskUpdated?.();
  };

  // Backdrop click closes drawer
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Escape key closes drawer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!taskid) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60"
        onClick={handleBackdropClick}
      />

      {/* Panel */}
      <div className="relative z-50 flex flex-col w-full max-w-[480px] h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500 dark:text-indigo-400" />
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 p-6">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
            <button
              type="button"
              onClick={() => void fetchTask()}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && task && (
          <>
            {/* Header */}
            <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 px-5 py-4">
              <div className="flex items-start gap-2 mb-3">
                <EditableName
                  value={task.name}
                  onCommit={handleNameCommit}
                  saving={saving}
                />
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close task drawer"
                  className="flex-shrink-0 p-1 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Blocked badge */}
              {task.isblocked && (
                <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-2 py-1 w-fit">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Blocked
                </div>
              )}

              {/* Meta badges row */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Status */}
                <InlineSelect
                  label="Status"
                  value={task.status}
                  options={STATUS_OPTIONS}
                  onChange={handleStatusChange}
                  disabled={saving}
                  badgeClass={statusBadgeClass(task.status)}
                />

                {/* Priority */}
                <InlineSelect
                  label="Priority"
                  value={task.priority}
                  options={PRIORITY_OPTIONS}
                  onChange={handlePriorityChange}
                  disabled={saving}
                  badgeClass={priorityBadgeClass(task.priority)}
                />

                {/* Issue type */}
                {task.issuetype && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium capitalize bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    <IssueTypeIcon type={task.issuetype} />
                    {task.issuetype}
                  </span>
                )}

                {/* Effort */}
                {task.effort && (
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium uppercase ${effortBadgeClass(task.effort)}`}
                  >
                    {task.effort}
                  </span>
                )}
              </div>

              {/* Save error */}
              {saveError && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {saveError}
                </p>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
              {/* Scope link */}
              {task.scopetitle && (
                <div className="flex items-center gap-2 text-sm">
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 text-indigo-400 dark:text-indigo-500" />
                  <span className="text-gray-500 dark:text-gray-400 text-xs">Scope:</span>
                  <span className="text-indigo-600 dark:text-indigo-400 font-medium truncate">
                    {task.scopetitle}
                  </span>
                </div>
              )}

              {/* Assignee */}
              <div className="flex items-center gap-2 text-sm">
                <User className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                <span className="text-gray-500 dark:text-gray-400 text-xs">Assignee:</span>
                <span className="text-gray-800 dark:text-gray-200 text-sm">
                  {task.assignedtoname ?? "Unassigned"}
                </span>
              </div>

              {/* Due date */}
              {task.duedate && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                  <span className="text-gray-500 dark:text-gray-400 text-xs">Due:</span>
                  <span className="text-gray-800 dark:text-gray-200 text-sm">
                    {formatDate(task.duedate)}
                  </span>
                </div>
              )}

              {/* Description */}
              {task.description && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
                    Description
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {task.description}
                  </p>
                </div>
              )}

              {/* Divider before tabs content */}
              <div className="border-t border-gray-100 dark:border-gray-800" />

              {/* Tab content */}
              {activeTab === "activity" && (
                <TaskDrawerActivity taskid={task.id} projectid={projectid} />
              )}
              {activeTab === "time" && (
                <TaskDrawerTime
                  taskid={task.id}
                  timeentriescount={task.timeentriescount}
                />
              )}
              {activeTab === "dependencies" && (
                <TaskDrawerDeps
                  taskid={task.id}
                  projectid={projectid}
                  blockedby={task.blockedby}
                  blocking={task.blocking}
                  onDepsChanged={handleDepsChanged}
                />
              )}
              {activeTab === "notes" && (
                <TaskDrawerNotes taskid={task.id} notescount={task.notescount} />
              )}
            </div>

            {/* Tab bar — fixed at bottom */}
            <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              <nav className="flex" aria-label="Task detail tabs">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 py-3 text-xs font-medium transition-colors border-t-2 ${
                      activeTab === tab.key
                        ? "border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/10"
                        : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
