import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AggregatedTask,
  ConnectionSyncStatus,
  TaskFilters,
  fetchSyncStatus,
  triggerSync,
  useTasks,
} from "../../hooks/useTasks";
import { useTranslation } from "../../i18n"; // [SCOPE 052]

const SOURCE_LABEL: Record<string, { label: string; color: string }> = {
  jira: { label: "Jira", color: "bg-blue-600 text-white" },
  monday: { label: "Monday", color: "bg-purple-600 text-white" },
  asana: { label: "Asana", color: "bg-red-600 text-white" },
  trello: { label: "Trello", color: "bg-cyan-600 text-white" },
  internal: { label: "Internal", color: "bg-gray-600 text-white" },
};

const PRIORITY_STYLE: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  medium:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

const STATUS_STYLE: Record<string, string> = {
  open: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  in_progress:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  completed:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  orphaned: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "unknown";
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

function TaskCard({ task }: { task: AggregatedTask }) {
  const sourceKey =
    task.sourcepmssystem ??
    (task.sourceoforigin === "internal" ? "internal" : "internal");
  const source = SOURCE_LABEL[sourceKey] ?? SOURCE_LABEL.internal;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm leading-snug flex-1">
          {task.name}
        </h3>
        <span
          className={`px-2 py-0.5 rounded text-xs font-semibold ${source.color}`}
        >
          {source.label}
        </span>
      </div>

      {task.projectname && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Project: {task.projectname}
        </p>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <span
          className={`px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLE[task.priority] ?? ""}`}
        >
          {task.priority}
        </span>
        <span
          className={`px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[task.status] ?? ""}`}
        >
          {task.status.replace("_", " ")}
        </span>
        {task.duedate && (
          <span className="px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
            Due {new Date(task.duedate).toLocaleDateString()}
          </span>
        )}
      </div>

      {task.externalid && (
        <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">
          {task.externalid}
        </p>
      )}
    </div>
  );
}

export default function TasksPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [filters, setFilters] = useState<TaskFilters>({
    sort: "updatedat",
    order: "desc",
  });
  const [syncStatus, setSyncStatus] = useState<ConnectionSyncStatus[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const { tasks, count, isLoading, error, refetch } = useTasks(filters);

  useEffect(() => {
    fetchSyncStatus().then(setSyncStatus).catch(() => {});
  }, []);

  const lastSync = useMemo(() => {
    const ts = syncStatus
      .map((s) => s.lastsyncsat)
      .filter((t): t is string => Boolean(t))
      .map((t) => new Date(t).getTime());
    if (ts.length === 0) return null;
    return new Date(Math.max(...ts)).toISOString();
  }, [syncStatus]);

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const results = await triggerSync();
      const total = results.reduce(
        (acc, r) => ({
          added: acc.added + r.added,
          updated: acc.updated + r.updated,
          errors: acc.errors + r.errors.length,
        }),
        { added: 0, updated: 0, errors: 0 },
      );
      setSyncMessage(
        `Sync complete — ${total.added} added, ${total.updated} updated${
          total.errors ? `, ${total.errors} error(s)` : ""
        }`,
      );
      const fresh = await fetchSyncStatus();
      setSyncStatus(fresh);
      await refetch();
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  const setFilter = <K extends keyof TaskFilters>(
    key: K,
    value: TaskFilters[K] | "",
  ) => {
    setFilters((f) => ({ ...f, [key]: value === "" ? undefined : value }));
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => navigate("/dashboard")}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-3"
          >
            ← {t("tasks.back")}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {t("tasks.title")}
              </h1>
              <span
                className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300"
                data-testid="task-count"
              >
                {count}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t("tasks.lastSync")} {formatRelative(lastSync)}
              </span>
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold text-sm py-1.5 px-3 rounded transition"
              >
                {isSyncing ? (
                  <>
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    {t("tasks.syncing")}
                  </>
                ) : (
                  t("tasks.syncNow")
                )}
              </button>
            </div>
          </div>
          {syncMessage && (
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              {syncMessage}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <select
            value={filters.source ?? ""}
            onChange={(e) =>
              setFilter("source", e.target.value as TaskFilters["source"])
            }
            className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
          >
            <option value="">{t("tasks.allSources")}</option>
            <option value="jira">Jira</option>
            <option value="monday">Monday</option>
            <option value="asana">Asana</option>
            <option value="trello">Trello</option>
            <option value="internal">Internal</option>
          </select>
          <select
            value={filters.priority ?? ""}
            onChange={(e) =>
              setFilter(
                "priority",
                e.target.value as TaskFilters["priority"],
              )
            }
            className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
          >
            <option value="">{t("tasks.allPriorities")}</option>
            <option value="critical">{t("tasks.priorityCritical")}</option>
            <option value="high">{t("tasks.priorityHigh")}</option>
            <option value="medium">{t("tasks.priorityMedium")}</option>
            <option value="low">{t("tasks.priorityLow")}</option>
          </select>
          <select
            value={filters.status ?? ""}
            onChange={(e) =>
              setFilter("status", e.target.value as TaskFilters["status"])
            }
            className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
          >
            <option value="">{t("tasks.allStatuses")}</option>
            <option value="open">{t("tasks.statusOpen")}</option>
            <option value="in_progress">{t("tasks.statusInProgress")}</option>
            <option value="completed">{t("tasks.statusCompleted")}</option>
            <option value="orphaned">{t("tasks.statusOrphaned")}</option>
          </select>
          <div className="flex gap-2">
            <select
              value={filters.sort ?? "updatedat"}
              onChange={(e) =>
                setFilter("sort", e.target.value as TaskFilters["sort"])
              }
              className="flex-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
            >
              <option value="updatedat">{t("tasks.sortUpdated")}</option>
              <option value="duedate">{t("tasks.sortDue")}</option>
              <option value="priority">{t("tasks.sortPriority")}</option>
              <option value="name">{t("tasks.sortTitle")}</option>
            </select>
            <button
              onClick={() =>
                setFilter(
                  "order",
                  filters.order === "asc" ? "desc" : "asc",
                )
              }
              className="px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm"
              title={`Currently sorting ${filters.order ?? "desc"}ending`}
            >
              {filters.order === "asc" ? "↑" : "↓"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
            <p className="text-sm text-red-700 dark:text-red-400">✗ {error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            {t("tasks.loading")}
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-lg">
            <p className="text-gray-900 dark:text-white font-semibold mb-1">
              {t("tasks.noTasks")}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("tasks.connectHint1")}{" "}
              <button
                onClick={() => navigate("/integrations")}
                className="text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {t("tasks.integrations")}
              </button>{" "}
              {t("tasks.connectHint2")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tasks.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
