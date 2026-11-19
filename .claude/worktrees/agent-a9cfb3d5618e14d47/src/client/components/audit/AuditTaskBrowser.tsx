import React, { useState, useEffect } from "react";
import { AuditFindingDetail } from "./AuditFindingDetail.js";

interface ComplianceTask {
  id: string;
  framework: string;
  category: string;
  controlreference: string | null;
  priority: "critical" | "high" | "medium" | "low";
  tasktype: string;
  title: string;
  description: string;
  requirementtext: string | null;
  checkmethod: string | null;
  suggestedfix: string | null;
  isautomated: boolean;
  createdat: string;
}

interface AuditTaskBrowserProps {
  enabledFrameworks?: string[];
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  low: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};

const FRAMEWORK_COLORS: Record<string, string> = {
  SOC2: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  HIPAA: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  HITRUST: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  GDPR: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

export const AuditTaskBrowser: React.FC<AuditTaskBrowserProps> = ({ enabledFrameworks }) => {
  const [tasks, setTasks] = useState<ComplianceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<ComplianceTask | null>(null);

  // Filters
  const [filterFramework, setFilterFramework] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    loadTasks();
  }, [filterFramework, filterCategory, filterPriority]);

  const loadTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ limit: "100" });
      if (filterFramework) params.set("framework", filterFramework);
      if (filterCategory) params.set("category", filterCategory);
      if (filterPriority) params.set("priority", filterPriority);

      const response = await fetch(`/api/audit/tasks?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to load tasks");
      const data = await response.json();
      setTasks(data.data ?? []);
    } catch (err) {
      setError("Failed to load compliance tasks");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Derive unique categories from loaded tasks
  const categories = Array.from(new Set(tasks.map((t) => t.category))).sort();

  // Client-side text search
  const filtered = tasks.filter((t) => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      (t.controlreference ?? "").toLowerCase().includes(q)
    );
  });

  // Summary counts by framework
  const frameworkCounts = filtered.reduce<Record<string, number>>((acc, t) => {
    acc[t.framework] = (acc[t.framework] ?? 0) + 1;
    return acc;
  }, {});

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/6" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Compliance Task Browser
        </h2>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {filtered.length} task{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-sm">
          {error}
        </div>
      )}

      {/* Framework summary badges */}
      {Object.keys(frameworkCounts).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(frameworkCounts).map(([fw, count]) => (
            <span
              key={fw}
              className={`px-2 py-1 rounded text-xs font-medium ${FRAMEWORK_COLORS[fw] ?? "bg-gray-100 text-gray-700"}`}
            >
              {fw}: {count}
            </span>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search tasks..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="flex-1 min-w-[180px] border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <select
          value={filterFramework}
          onChange={(e) => setFilterFramework(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Frameworks</option>
          {(enabledFrameworks ?? ["SOC2", "HIPAA", "HITRUST", "GDPR"]).map((fw) => (
            <option key={fw} value={fw}>{fw}</option>
          ))}
        </select>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {(filterFramework || filterCategory || filterPriority || searchText) && (
          <button
            onClick={() => {
              setFilterFramework("");
              setFilterCategory("");
              setFilterPriority("");
              setSearchText("");
            }}
            className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded"
          >
            Clear
          </button>
        )}
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">
          {tasks.length === 0
            ? "No compliance tasks found. Upload a compliance document and extract tasks first."
            : "No tasks match the current filters."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => (
            <div
              key={task.id}
              className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
            >
              {/* Task header row */}
              <button
                type="button"
                onClick={() => toggleExpand(task.id)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {/* Priority badge */}
                <span
                  className={`flex-shrink-0 mt-0.5 px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                    PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.low
                  }`}
                >
                  {task.priority}
                </span>

                {/* Framework badge */}
                <span
                  className={`flex-shrink-0 mt-0.5 px-2 py-0.5 rounded text-xs font-medium ${
                    FRAMEWORK_COLORS[task.framework] ?? "bg-gray-100 text-gray-700"
                  }`}
                >
                  {task.framework}
                </span>

                {/* Control reference */}
                {task.controlreference && (
                  <span className="flex-shrink-0 mt-0.5 px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    {task.controlreference}
                  </span>
                )}

                {/* Title */}
                <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white">
                  {task.title}
                </span>

                {/* Check method indicator */}
                <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500">
                  {task.isautomated ? "⚙ auto" : "👁 manual"}
                </span>

                {/* Expand chevron */}
                <span className="flex-shrink-0 text-gray-400 dark:text-gray-500 text-xs">
                  {expandedId === task.id ? "▲" : "▼"}
                </span>
              </button>

              {/* Expanded detail */}
              {expandedId === task.id && (
                <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                      Description
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{task.description}</p>
                  </div>

                  {task.requirementtext && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                        Requirement
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 italic">
                        {task.requirementtext}
                      </p>
                    </div>
                  )}

                  {task.suggestedfix && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                        Suggested Fix
                      </p>
                      <pre className="text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-2 text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                        {task.suggestedfix}
                      </pre>
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
                    <span>Category: <strong className="text-gray-600 dark:text-gray-300">{task.category}</strong></span>
                    <span>Type: <strong className="text-gray-600 dark:text-gray-300">{task.tasktype}</strong></span>
                    {task.checkmethod && (
                      <span>Check: <strong className="text-gray-600 dark:text-gray-300">{task.checkmethod}</strong></span>
                    )}
                  </div>

                  <button
                    onClick={() => setSelectedTask(task)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    View full detail →
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Full detail modal */}
      {selectedTask && (
        <AuditFindingDetail
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
};
