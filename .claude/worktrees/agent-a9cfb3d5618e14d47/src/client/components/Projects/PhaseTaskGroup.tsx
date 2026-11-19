import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Circle,
  Star,
  Bug,
  User,
} from "lucide-react";
import type { ProjectTask } from "~/shared/types/projects";
import { useTranslation } from "../../i18n";

interface Props {
  projectid: string;
  phaseid: string;
  onTaskClick: (taskid: string) => void;
}

interface ScopeGroup {
  scopeid: string | null;
  scopenumber: string | null;
  scopetitle: string | null;
  scopestatus: string | null;
  tasks: ProjectTask[];
  taskcount: number;
  completedcount: number;
}

interface GroupedTasksResponse {
  groups: ScopeGroup[];
  unscopedtasks: ProjectTask[];
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("wxkanban_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
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

function scopeStatusBadgeClass(status: string | null): string {
  if (!status) return "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400";
  switch (status) {
    case "implemented":
    case "qa_passed":
    case "human_tested":
    case "beta_cleared":
    case "released":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "in_review":
    case "clarified":
    case "planned":
    case "tasks_generated":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "pending_clarification":
      return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "deferred":
      return "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400";
    default:
      return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
  }
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function IssueTypeIcon({ type }: { type: string | null }) {
  switch (type) {
    case "bug":
      return <Bug className="w-3.5 h-3.5 text-red-400 dark:text-red-500 flex-shrink-0" />;
    case "feature":
      return <Star className="w-3.5 h-3.5 text-yellow-400 dark:text-yellow-500 flex-shrink-0" />;
    default:
      return <Circle className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />;
  }
}

// --- Task row ---

function TaskRow({
  task,
  onClick,
}: {
  task: ProjectTask;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left group"
    >
      <IssueTypeIcon type={task.issuetype} />

      {/* Name */}
      <span
        className={`flex-1 min-w-0 text-sm truncate ${
          task.status === "completed"
            ? "line-through text-gray-400 dark:text-gray-500"
            : "text-gray-800 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white"
        }`}
      >
        {task.name}
      </span>

      {/* Assignee */}
      <span className="hidden sm:flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 w-28 truncate">
        <User className="w-3 h-3" />
        {task.assignedtoname ?? t("phaseTaskGroup.unassigned")}
      </span>

      {/* Priority badge */}
      <span
        className={`hidden sm:inline-block flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-medium capitalize ${priorityBadgeClass(task.priority)}`}
      >
        {task.priority}
      </span>

      {/* Status badge */}
      <span
        className={`flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-medium capitalize ${statusBadgeClass(task.status)}`}
      >
        {formatStatus(task.status)}
      </span>
    </button>
  );
}

// --- Scope group ---

function ScopeGroupSection({
  group,
  onTaskClick,
}: {
  group: ScopeGroup;
  onTaskClick: (taskid: string) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  const progressPct =
    group.taskcount > 0
      ? Math.round((group.completedcount / group.taskcount) * 100)
      : 0;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      {/* Group header */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
        )}

        {/* Scope number */}
        {group.scopenumber && (
          <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400 flex-shrink-0">
            #{group.scopenumber}
          </span>
        )}

        {/* Scope title */}
        <span className="flex-1 min-w-0 text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
          {group.scopetitle ?? t("phaseTaskGroup.unnamedScope")}
        </span>

        {/* Scope status badge */}
        {group.scopestatus && (
          <span
            className={`hidden sm:inline-block flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-medium capitalize ${scopeStatusBadgeClass(group.scopestatus)}`}
          >
            {formatStatus(group.scopestatus)}
          </span>
        )}

        {/* Progress counter */}
        <span className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {group.completedcount}/{group.taskcount}
        </span>
      </button>

      {/* Progress bar */}
      {group.taskcount > 0 && (
        <div className="h-0.5 bg-gray-200 dark:bg-gray-700">
          <div
            className="h-full bg-indigo-500 dark:bg-indigo-400 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* Tasks */}
      {expanded && group.tasks.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
          {group.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onClick={() => onTaskClick(task.id)}
            />
          ))}
        </div>
      )}

      {expanded && group.tasks.length === 0 && (
        <div className="px-4 py-4 text-sm text-gray-400 dark:text-gray-500 text-center italic">
          {t("phaseTaskGroup.noTasksInScope")}
        </div>
      )}
    </div>
  );
}

// --- Main component ---

export function PhaseTaskGroup({ projectid, phaseid, onTaskClick }: Props) {
  const { t } = useTranslation();
  const [data, setData] = useState<GroupedTasksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectid}/phases/${phaseid}/tasks/grouped`,
        {
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
        }
      );
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(
          body.error ??
            t("phaseTaskGroup.requestFailed", { status: res.status })
        );
      }
      const json = (await res.json()) as GroupedTasksResponse;
      setData(json);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("phaseTaskGroup.failedToLoad")
      );
    } finally {
      setLoading(false);
    }
  }, [projectid, phaseid, t]);

  useEffect(() => {
    void fetchGroups();
  }, [fetchGroups]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-500 dark:text-indigo-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!data) return null;

  const hasGroups = data.groups.length > 0;
  const hasUnscoped = data.unscopedtasks.length > 0;

  if (!hasGroups && !hasUnscoped) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
        <Circle className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">{t("phaseTaskGroup.noTasksInPhase")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Scoped groups */}
      {data.groups.map((group) => (
        <ScopeGroupSection
          key={group.scopeid ?? "null"}
          group={group}
          onTaskClick={onTaskClick}
        />
      ))}

      {/* Unscoped tasks */}
      {hasUnscoped && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
              {t("phaseTaskGroup.unscopedTasks")}
            </span>
            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
              {data.unscopedtasks.length}
            </span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {data.unscopedtasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onClick={() => onTaskClick(task.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
