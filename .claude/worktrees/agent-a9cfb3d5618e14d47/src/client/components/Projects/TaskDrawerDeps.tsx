import { useState } from "react";
import { Loader2, AlertCircle, Link2, ArrowDown, ArrowUp } from "lucide-react";

interface TaskRef {
  id: string;
  name: string;
  status: string;
}

interface Props {
  taskid: string;
  projectid: string;
  blockedby: TaskRef[];
  blocking: TaskRef[];
  onDepsChanged: () => void;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("wxkanban_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "in_progress":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    default:
      return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
  }
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function TaskRefItem({ task }: { task: TaskRef }) {
  return (
    <li className="flex items-center justify-between gap-2 py-1.5 border-b last:border-b-0 border-gray-100 dark:border-gray-700/50">
      <span className="text-sm text-gray-800 dark:text-gray-200 truncate flex-1 min-w-0">
        {task.name}
      </span>
      <span
        className={`inline-block flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-medium capitalize ${statusBadgeClass(task.status)}`}
      >
        {formatStatus(task.status)}
      </span>
    </li>
  );
}

export function TaskDrawerDeps({ taskid, projectid, blockedby, blocking, onDepsChanged }: Props) {
  const [blockedbyid, setBlockedbyid] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);

  const handleAdd = async () => {
    const trimmed = blockedbyid.trim();
    if (!trimmed) return;
    setAdding(true);
    setAddError(null);
    setAddSuccess(false);
    try {
      const res = await fetch(
        `/api/projects/${projectid}/tasks/${taskid}/dependencies`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({ blockedbyid: trimmed }),
        }
      );
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `Request failed: ${res.status}`);
      }
      setBlockedbyid("");
      setAddSuccess(true);
      onDepsChanged();
      setTimeout(() => setAddSuccess(false), 2000);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add dependency");
    } finally {
      setAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      void handleAdd();
    }
  };

  return (
    <div className="space-y-5">
      {/* Blocked by section */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <ArrowDown className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Blocked by
          </h4>
          <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
            {blockedby.length}
          </span>
        </div>
        {blockedby.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic">
            Not blocked by any task.
          </p>
        ) : (
          <ul className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-700/50 px-3">
            {blockedby.map((task) => (
              <TaskRefItem key={task.id} task={task} />
            ))}
          </ul>
        )}
      </div>

      {/* Blocking section */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <ArrowUp className="w-3.5 h-3.5 text-orange-500 dark:text-orange-400" />
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Blocking
          </h4>
          <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
            {blocking.length}
          </span>
        </div>
        {blocking.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic">
            Not blocking any task.
          </p>
        ) : (
          <ul className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-700/50 px-3">
            {blocking.map((task) => (
              <TaskRefItem key={task.id} task={task} />
            ))}
          </ul>
        )}
      </div>

      {/* Add dependency form */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Link2 className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Add dependency
          </h4>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
          Enter the task ID (UUID) that blocks this task.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={blockedbyid}
            onChange={(e) => setBlockedbyid(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Task UUID..."
            disabled={adding}
            className="flex-1 min-w-0 px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={adding || !blockedbyid.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-md transition-colors"
          >
            {adding && <Loader2 className="w-3 h-3 animate-spin" />}
            Add
          </button>
        </div>

        {addSuccess && (
          <p className="mt-1.5 text-xs text-green-600 dark:text-green-400">
            Dependency added successfully.
          </p>
        )}

        {addError && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{addError}</span>
          </div>
        )}
      </div>
    </div>
  );
}
