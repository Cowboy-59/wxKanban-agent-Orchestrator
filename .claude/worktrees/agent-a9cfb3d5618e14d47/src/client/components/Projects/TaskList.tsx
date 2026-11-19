import { useState } from "react";
import {
  Plus,
  Loader2,
  CheckCircle,
  Circle,
  Clock,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import type { ProjectTask } from "~/shared/types/projects";
import { useTranslation } from "../../i18n";

type TaskStatus = "open" | "in_progress" | "completed" | "orphaned";
type TaskPriority = "low" | "medium" | "high" | "critical";

interface TaskListProps {
  tasks: ProjectTask[];
  loading?: boolean;
  /** Phase determines which extra columns to show */
  phase: "Implementation" | "QA" | "HumanTesting" | "Beta";
  /** Whether the current user can create/edit tasks in this phase */
  canEdit: boolean;
  onStatusChange: (taskId: string, status: string) => Promise<void>;
  onCreateTask: (name: string, description?: string) => Promise<void>;
  /** For Beta phase: opening requires ADMIN approval dialog handled externally */
  onCreateTaskBeta?: () => void;
}

const PRIORITY_LABEL_KEYS: Record<string, string> = {
  low: "taskList.priorityLow",
  medium: "taskList.priorityMed",
  high: "taskList.priorityHigh",
  critical: "taskList.priorityCrit",
};

const PRIORITY_CLASSES: Record<string, string> = {
  low: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_OPTION_VALUES: TaskStatus[] = ["open", "in_progress", "completed", "orphaned"];

const STATUS_LABEL_KEYS: Record<string, string> = {
  open: "taskList.statusOpen",
  in_progress: "taskList.statusInProgress",
  completed: "taskList.statusCompleted",
  orphaned: "taskList.statusDismissed",
};

function normalizeType(t: string | null): string {
  return (t?.trim() || "task").toLowerCase();
}

function typeLabel(t: string): string {
  const map: Record<string, string> = {
    bug: "Bug",
    feature: "Feature",
    enhancement: "Enhancement",
    task: "Task",
  };
  return map[t] ?? t;
}

const RESULT_LABEL_KEYS: Record<string, string> = {
  pass: "taskList.resultPass",
  fail: "taskList.resultFail",
  blocked: "taskList.resultBlocked",
};

function TaskStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400 flex-shrink-0" />;
    case "in_progress":
      return <Loader2 className="w-4 h-4 text-indigo-500 dark:text-indigo-400 animate-spin flex-shrink-0" />;
    case "orphaned":
      return <AlertCircle className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />;
    default:
      return <Circle className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />;
  }
}

interface NewTaskFormProps {
  onSubmit: (name: string, description?: string) => Promise<void>;
  onCancel: () => void;
}

function NewTaskForm({ onSubmit, onCancel }: NewTaskFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(name.trim(), description.trim() || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("taskList.createError"));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border border-indigo-200 dark:border-indigo-700 rounded-lg p-3 bg-indigo-50/50 dark:bg-indigo-900/10 space-y-2">
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <input
        type="text"
        required
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("taskList.taskNamePlaceholder")}
        disabled={submitting}
        className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("taskList.descriptionPlaceholder")}
        disabled={submitting}
        className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          disabled={!name.trim() || submitting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-md transition-colors"
        >
          {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
          {t("taskList.addTaskButton")}
        </button>
      </div>
    </form>
  );
}

/**
 * TaskList — reusable task table for Implementation/QA/HumanTesting/Beta phases.
 * Columns vary by phase: QA shows result, HumanTesting/Beta show raised-by.
 */
export function TaskList({
  tasks,
  loading = false,
  phase,
  canEdit,
  onStatusChange,
  onCreateTask,
  onCreateTaskBeta,
}: TaskListProps) {
  const { t } = useTranslation();
  const [showNewForm, setShowNewForm] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const priorityLabel = (p: string) =>
    PRIORITY_LABEL_KEYS[p] ? t(PRIORITY_LABEL_KEYS[p]) : p;
  const statusLabel = (s: string) =>
    STATUS_LABEL_KEYS[s] ? t(STATUS_LABEL_KEYS[s]) : s.replace("_", " ");
  const resultLabel = (value: string) =>
    RESULT_LABEL_KEYS[value] ? t(RESULT_LABEL_KEYS[value]) : t("taskList.resultNone");

  const typeSummary = (() => {
    const summary = new Map<string, { open: number; closed: number; total: number }>();
    const isOpen = (status: string) => status === "open" || status === "in_progress";
    for (const t of tasks) {
      const key = normalizeType(t.issuetype);
      if (!summary.has(key)) summary.set(key, { open: 0, closed: 0, total: 0 });
      const bucket = summary.get(key)!;
      bucket.total += 1;
      if (isOpen(t.status)) bucket.open += 1; else bucket.closed += 1;
    }
    return [...summary.entries()].sort((a, b) => b[1].total - a[1].total);
  })();

  const showResultColumn = phase === "QA";
  const showRaisedBy = phase === "HumanTesting" || phase === "Beta";

  const handleStatusChange = async (taskId: string, status: string) => {
    setUpdatingId(taskId);
    try {
      await onStatusChange(taskId, status);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleAddClick = () => {
    if (phase === "Beta" && onCreateTaskBeta) {
      onCreateTaskBeta();
    } else {
      setShowNewForm(true);
    }
  };

  const handleNewTaskSubmit = async (name: string, description?: string) => {
    await onCreateTask(name, description);
    setShowNewForm(false);
  };

  const activeTasks = tasks.filter((t) => t.status !== "orphaned");

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Type summary pills */}
      {typeSummary.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {typeSummary.map(([type, counts]) => (
            <span
              key={type}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 text-gray-700 dark:text-gray-200"
            >
              <span className="font-semibold capitalize">{typeLabel(type)}</span>
              <span className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                <span className="text-green-600 dark:text-green-400">{t("taskList.countOpen", { n: counts.open })}</span>
                <span aria-hidden="true">·</span>
                <span className="text-gray-500 dark:text-gray-400">{t("taskList.countClosed", { n: counts.closed })}</span>
                <span aria-hidden="true">·</span>
                <span className="text-gray-500 dark:text-gray-400">{t("taskList.countTotal", { n: counts.total })}</span>
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Add task button / form */}
      {canEdit && !showNewForm && (
        <button
          type="button"
          onClick={handleAddClick}
          className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t("taskList.addTask")}
        </button>
      )}

      {showNewForm && (
        <NewTaskForm
          onSubmit={handleNewTaskSubmit}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {/* Empty state */}
      {activeTasks.length === 0 && !showNewForm && (
        <div className="text-center py-8 text-gray-400 dark:text-gray-500">
          <Circle className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{t("taskList.noTasks")}</p>
        </div>
      )}

      {/* Task rows */}
      {activeTasks.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          {/* Table header */}
          <div className={`grid text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/80 px-4 py-2 border-b border-gray-200 dark:border-gray-700 ${
            showResultColumn
              ? "grid-cols-[1rem_1fr_6rem_6rem_5rem]"
              : showRaisedBy
              ? "grid-cols-[1rem_1fr_7rem_5rem]"
              : "grid-cols-[1rem_1fr_6rem_5rem]"
          } gap-3`}>
            <span />
            <span>{t("taskList.colTask")}</span>
            {showResultColumn && <span>{t("taskList.colResult")}</span>}
            {showRaisedBy && <span>{t("taskList.colRaisedBy")}</span>}
            <span>{t("taskList.colPriority")}</span>
            <span>{t("taskList.colStatus")}</span>
          </div>

          {/* Task rows */}
          {activeTasks.map((task) => (
            <div
              key={task.id}
              className={`grid items-center px-4 py-2.5 border-b last:border-b-0 border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                showResultColumn
                  ? "grid-cols-[1rem_1fr_6rem_6rem_5rem]"
                  : showRaisedBy
                  ? "grid-cols-[1rem_1fr_7rem_5rem]"
                  : "grid-cols-[1rem_1fr_6rem_5rem]"
              } gap-3`}
            >
              {/* Status icon */}
              <TaskStatusIcon status={updatingId === task.id ? "in_progress" : task.status} />

              {/* Name + description */}
              <div className="min-w-0">
                <p className={`text-sm font-medium truncate ${
                  task.status === "completed"
                    ? "line-through text-gray-400 dark:text-gray-500"
                    : "text-gray-900 dark:text-white"
                }`}>
                  {task.name}
                </p>
                {task.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {task.description}
                  </p>
                )}
                {task.duedate && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {new Date(task.duedate).toLocaleDateString()}
                  </p>
                )}
              </div>

              {/* Result column (QA only) */}
              {showResultColumn && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit ${
                  task.results === "pass"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : task.results === "fail"
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    : task.results === "blocked"
                    ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    : "text-gray-400 dark:text-gray-500"
                }`}>
                  {resultLabel(task.results ?? "")}
                </span>
              )}

              {/* Raised by (HumanTesting/Beta) */}
              {showRaisedBy && (
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {task.assignedtoname ?? "—"}
                </span>
              )}

              {/* Priority badge */}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit ${
                PRIORITY_CLASSES[task.priority as TaskPriority] ?? PRIORITY_CLASSES.medium
              }`}>
                {priorityLabel(task.priority)}
              </span>

              {/* Status dropdown */}
              {canEdit ? (
                <div className="relative">
                  <select
                    value={task.status}
                    onChange={(e) => handleStatusChange(task.id, e.target.value)}
                    disabled={updatingId === task.id}
                    className="appearance-none w-full pl-2 pr-5 py-1 border border-gray-200 dark:border-gray-600 rounded-md text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 cursor-pointer"
                  >
                    {STATUS_OPTION_VALUES.map((value) => (
                      <option key={value} value={value}>
                        {statusLabel(value)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-1 top-1.5 w-3 h-3 text-gray-400 pointer-events-none" />
                </div>
              ) : (
                <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                  {statusLabel(task.status)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
