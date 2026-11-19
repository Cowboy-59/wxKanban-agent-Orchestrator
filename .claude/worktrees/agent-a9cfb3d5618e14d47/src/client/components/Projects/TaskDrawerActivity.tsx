import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, MessageSquare } from "lucide-react";
import type { TaskActivityEntry } from "~/shared/types/projects";

interface Props {
  taskid: string;
  projectid: string;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("wxkanban_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const ACTIVITY_TYPE_CLASSES: Record<string, string> = {
  status_change: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  comment: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  assignment: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  priority_change: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  dependency_added: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  dependency_removed: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  created: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

function activityTypeBadgeClass(type: string): string {
  return ACTIVITY_TYPE_CLASSES[type] ?? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
}

function formatType(type: string): string {
  return type.replace(/_/g, " ");
}

export function TaskDrawerActivity({ taskid, projectid }: Props) {
  const [entries, setEntries] = useState<TaskActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectid}/tasks/${taskid}/activity`,
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
        throw new Error(body.error ?? `Request failed: ${res.status}`);
      }
      const data = (await res.json()) as { entries: TaskActivityEntry[] };
      setEntries(data.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity");
    } finally {
      setLoading(false);
    }
  }, [taskid, projectid]);

  useEffect(() => {
    void fetchActivity();
  }, [fetchActivity]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
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

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-gray-400 dark:text-gray-500">
        <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">No activity yet.</p>
      </div>
    );
  }

  return (
    <ol className="relative border-l border-gray-200 dark:border-gray-700 ml-2 space-y-4">
      {entries.map((entry) => (
        <li key={entry.id} className="ml-4">
          <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-gray-300 dark:bg-gray-600 border-2 border-white dark:border-gray-900" />
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {entry.actorname}
            </span>
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium capitalize ${activityTypeBadgeClass(entry.type)}`}
            >
              {formatType(entry.type)}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
              {relativeTime(entry.createdat)}
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{entry.description}</p>
        </li>
      ))}
    </ol>
  );
}
