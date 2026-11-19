import React, { useState, useEffect } from "react";
import { AuditFindingDetail } from "./AuditFindingDetail.js";

interface AuditResult {
  id: string;
  executionid: string;
  taskid: string;
  filepath: string | null;
  linenumber: number | null;
  codesnippet: string | null;
  resultstatus: string;
  resultdetails: string | null;
  suggestedfix: string | null;
  severity: string | null;
  createdat: string;
}

interface ComplianceTask {
  id: string;
  framework: string;
  category: string;
  controlreference: string | null;
  priority: string;
  tasktype: string;
  title: string;
  description: string;
  requirementtext: string | null;
  checkmethod: string | null;
  suggestedfix: string | null;
  isautomated: boolean;
}

interface ResultWithTask extends AuditResult {
  task?: ComplianceTask;
}

interface AuditResultsViewerProps {
  executionId: string;
}

const STATUS_ICON: Record<string, string> = {
  pass: "✓",
  fail: "✗",
  needs_review: "⚠",
  not_applicable: "—",
};

const STATUS_COLORS: Record<string, string> = {
  pass: "text-green-600 dark:text-green-400",
  fail: "text-red-600 dark:text-red-400",
  needs_review: "text-yellow-600 dark:text-yellow-400",
  not_applicable: "text-gray-400 dark:text-gray-500",
};

const STATUS_ROW_COLORS: Record<string, string> = {
  pass: "border-l-4 border-green-400 bg-green-50 dark:bg-green-900/10",
  fail: "border-l-4 border-red-400 bg-red-50 dark:bg-red-900/10",
  needs_review: "border-l-4 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/10",
  not_applicable: "border-l-4 border-gray-300 dark:border-gray-600",
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  low: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low", ""];

export const AuditResultsViewer: React.FC<AuditResultsViewerProps> = ({ executionId }) => {
  const [results, setResults] = useState<ResultWithTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedPair, setSelectedPair] = useState<{ result: AuditResult; task: ComplianceTask } | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");

  useEffect(() => {
    loadResults();
  }, [executionId]);

  const loadResults = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/audit/executions/${executionId}/results`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to load results");
      const data = await response.json();
      setResults(data.data ?? []);
    } catch (err) {
      setError("Failed to load audit results");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Summary counts
  const counts = results.reduce(
    (acc, r) => {
      const s = r.resultstatus;
      if (s === "pass") acc.pass++;
      else if (s === "fail") acc.fail++;
      else if (s === "needs_review") acc.review++;
      else acc.other++;
      return acc;
    },
    { pass: 0, fail: 0, review: 0, other: 0 },
  );

  const total = results.length;
  const overallScore = total > 0 ? Math.round((counts.pass / total) * 100) : 0;

  // Apply filters
  const filtered = results.filter((r) => {
    if (filterStatus && r.resultstatus !== filterStatus) return false;
    if (filterSeverity && r.severity !== filterSeverity) return false;
    return true;
  });

  // Sort by severity order then status
  const sorted = [...filtered].sort((a, b) => {
    const si = SEVERITY_ORDER.indexOf(a.severity ?? "");
    const sj = SEVERITY_ORDER.indexOf(b.severity ?? "");
    if (si !== sj) return si - sj;
    // fails first
    if (a.resultstatus === "fail" && b.resultstatus !== "fail") return -1;
    if (b.resultstatus === "fail" && a.resultstatus !== "fail") return 1;
    return 0;
  });

  if (loading) {
    return (
      <div className="p-4 text-sm text-gray-500 dark:text-gray-400 animate-pulse">
        Loading results...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap items-center gap-6">
          {/* Score */}
          <div className="text-center">
            <div
              className={`text-3xl font-bold ${
                overallScore >= 70
                  ? "text-green-600 dark:text-green-400"
                  : overallScore >= 40
                  ? "text-yellow-600 dark:text-yellow-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {overallScore}%
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Compliance Score</div>
          </div>

          <div className="h-10 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block" />

          {/* Counts */}
          <div className="flex gap-4 flex-wrap">
            <div className="text-center">
              <div className="text-xl font-semibold text-green-600 dark:text-green-400">
                {counts.pass}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Pass</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-semibold text-red-600 dark:text-red-400">
                {counts.fail}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Fail</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-semibold text-yellow-600 dark:text-yellow-400">
                {counts.review}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Review</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-semibold text-gray-500 dark:text-gray-400">
                {total}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex-1 min-w-[120px]">
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 dark:bg-green-400 rounded-full transition-all"
                style={{ width: `${overallScore}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Statuses</option>
          <option value="pass">Pass</option>
          <option value="fail">Fail</option>
          <option value="needs_review">Needs Review</option>
          <option value="not_applicable">Not Applicable</option>
        </select>

        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <span className="text-sm text-gray-500 dark:text-gray-400 self-center">
          {filtered.length} of {total} results
        </span>
      </div>

      {/* Results list */}
      {sorted.length === 0 ? (
        <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
          No results match the current filters.
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((result) => {
            const isExpanded = expandedId === result.id;
            const statusColor = STATUS_COLORS[result.resultstatus] ?? STATUS_COLORS.not_applicable;
            const rowColor = STATUS_ROW_COLORS[result.resultstatus] ?? "";

            return (
              <div
                key={result.id}
                className={`rounded-lg overflow-hidden ${rowColor}`}
              >
                {/* Result row */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : result.id)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  {/* Status icon */}
                  <span className={`flex-shrink-0 text-lg font-bold leading-none mt-0.5 ${statusColor}`}>
                    {STATUS_ICON[result.resultstatus] ?? "?"}
                  </span>

                  {/* Task info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      {result.severity && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs font-semibold uppercase ${
                            SEVERITY_BADGE[result.severity] ?? SEVERITY_BADGE.low
                          }`}
                        >
                          {result.severity}
                        </span>
                      )}
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {(result as ResultWithTask).task?.title ?? `Task ${result.taskid.slice(0, 8)}`}
                      </span>
                    </div>
                    {result.filepath && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                        {result.filepath}
                        {result.linenumber != null && `:${result.linenumber}`}
                      </p>
                    )}
                  </div>

                  <span className="flex-shrink-0 text-gray-400 dark:text-gray-500 text-xs">
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-black/10 dark:border-white/10 space-y-3">
                    {result.resultdetails && (
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {result.resultdetails}
                      </p>
                    )}

                    {result.codesnippet && (
                      <pre className="text-xs bg-gray-900 dark:bg-black text-green-300 rounded p-3 overflow-x-auto whitespace-pre-wrap font-mono border border-gray-700">
                        {result.codesnippet}
                      </pre>
                    )}

                    {result.suggestedfix && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                          Suggested Fix
                        </p>
                        <pre className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2 text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                          {result.suggestedfix}
                        </pre>
                      </div>
                    )}

                    {(result as ResultWithTask).task && (
                      <button
                        onClick={() =>
                          setSelectedPair({
                            result,
                            task: (result as ResultWithTask).task!,
                          })
                        }
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        View full requirement →
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Full finding detail modal */}
      {selectedPair && (
        <AuditFindingDetail
          task={selectedPair.task}
          result={selectedPair.result}
          onClose={() => setSelectedPair(null)}
        />
      )}
    </div>
  );
};
