import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Check, X, Minus, Loader2, RefreshCw, Workflow, FileSearch } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type PhaseStatus = "pending" | "active" | "complete" | "blocked" | "deferred";

type ScopeStatus =
  | "draft"
  | "in_review"
  | "pending_clarification"
  | "clarified"
  | "tasks_generated"
  | "planned"
  | "implemented"
  | "qa_passed"
  | "human_tested"
  | "beta_cleared"
  | "released"
  | "deferred";

interface ScopeRow {
  id: string;
  specnumber: string;
  title: string;
  status: string;
  isoptional: boolean;
  phases: Record<string, PhaseStatus>;
}

interface MatrixData {
  scopes: ScopeRow[];
  phases: string[];
}

interface Props {
  projectid: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PHASE_ABBREV: Record<string, string> = {
  Design: "Design",
  Implementation: "Impl.",
  QA: "QA",
  HumanTesting: "Human",
  Beta: "Beta",
  Release: "Release",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("wxkanban_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchMatrix(projectid: string): Promise<MatrixData> {
  const res = await fetch(`/api/projects/${projectid}/scopes/matrix`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<MatrixData>;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PhaseCell({ status }: { status: PhaseStatus | undefined }) {
  if (!status || status === "pending") {
    return (
      <span
        className="inline-block w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700"
        title="Pending"
        aria-label="Pending"
      />
    );
  }

  if (status === "active") {
    return (
      <span
        className="inline-block w-3 h-3 rounded-full bg-blue-500 animate-pulse"
        title="Active"
        aria-label="Active"
      />
    );
  }

  if (status === "complete") {
    return (
      <span aria-label="Complete" title="Complete">
        <Check className="w-4 h-4 text-green-500 dark:text-green-400" />
      </span>
    );
  }

  if (status === "blocked") {
    return (
      <span aria-label="Blocked" title="Blocked">
        <X className="w-4 h-4 text-red-500 dark:text-red-400" />
      </span>
    );
  }

  // deferred
  return (
    <span aria-label="Deferred" title="Deferred">
      <Minus className="w-4 h-4 text-gray-400 dark:text-gray-500" />
    </span>
  );
}

const SCOPE_STATUS_BADGE: Record<ScopeStatus, string> = {
  draft:
    "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  in_review:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  pending_clarification:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  clarified:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  tasks_generated:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  planned:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  implemented:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  qa_passed:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  human_tested:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  beta_cleared:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  released:
    "bg-green-200 text-green-800 dark:bg-green-900/50 dark:text-green-300 font-bold",
  deferred:
    "bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500 line-through",
};

const SCOPE_STATUS_LABEL: Record<ScopeStatus, string> = {
  draft: "Draft",
  in_review: "In Review",
  pending_clarification: "Needs Clarification",
  clarified: "Clarified",
  tasks_generated: "Tasks Generated",
  planned: "Planned",
  implemented: "Implemented",
  qa_passed: "QA Passed",
  human_tested: "Human Tested",
  beta_cleared: "Beta Cleared",
  released: "Released",
  deferred: "Deferred",
};

function isScopeStatus(value: string): value is ScopeStatus {
  return value in SCOPE_STATUS_LABEL;
}

function ScopeStatusPill({ status }: { status: string }) {
  const knownStatus = isScopeStatus(status) ? status : "draft";
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${SCOPE_STATUS_BADGE[knownStatus]}`}
    >
      {SCOPE_STATUS_LABEL[knownStatus]}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * ScopeMatrixView — grid of scopes (rows) × project phases (columns),
 * showing each scope's progress through each lifecycle phase.
 */
export function ScopeMatrixView({ projectid }: Props) {
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMatrix(projectid);
      setData(result);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scope matrix");
    } finally {
      setLoading(false);
    }
  }, [projectid]);

  // Trigger initial load on first render
  if (!loaded && !loading && !error) {
    void load();
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400 dark:text-gray-500" />
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────

  if (error && !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    );
  }

  const phases = data?.phases ?? [];
  const scopes = data?.scopes ?? [];

  // ── Empty state ────────────────────────────────────────────────────────────

  const isEmpty = loaded && scopes.length === 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {scopes.length > 0
            ? `${scopes.length} scope${scopes.length === 1 ? "" : "s"}`
            : ""}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          title="Refresh scope matrix"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Error banner (while showing stale data) */}
      {error && data && (
        <p className="text-xs text-red-600 dark:text-red-400 px-1">{error}</p>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="text-center py-10">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No scopes yet. Create a scope in the Design phase.
          </p>
        </div>
      )}

      {/* Matrix table */}
      {!isEmpty && scopes.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="min-w-full table-fixed border-collapse">
            <colgroup>
              {/* Scope column — fixed width */}
              <col style={{ width: "200px", minWidth: "160px" }} />
              {/* Phase columns — equal width */}
              {phases.map((phase) => (
                <col key={phase} style={{ width: `${Math.floor(760 / phases.length)}px` }} />
              ))}
            </colgroup>

            {/* Header */}
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-r border-gray-100 dark:border-gray-700">
                  Scope
                </th>
                {phases.map((phase) => (
                  <th
                    key={phase}
                    className="py-3 px-4 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-r border-gray-100 dark:border-gray-700 last:border-r-0"
                  >
                    {PHASE_ABBREV[phase] ?? phase}
                  </th>
                ))}
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {scopes.map((scope, index) => {
                const isEven = index % 2 === 0;
                return (
                  <tr
                    key={scope.id}
                    className={[
                      "group transition-colors",
                      isEven
                        ? "bg-white dark:bg-gray-900"
                        : "bg-gray-50 dark:bg-gray-800/50",
                      "hover:bg-blue-50 dark:hover:bg-blue-900/20",
                    ].join(" ")}
                  >
                    {/* Scope column */}
                    <td className="py-3 px-4 border-r border-gray-100 dark:border-gray-700 align-top max-w-[200px]">
                      <div className="space-y-0.5">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-xs font-mono text-gray-400 dark:text-gray-500 flex-shrink-0">
                            {scope.specnumber}
                          </span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white leading-snug truncate">
                            {scope.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <ScopeStatusPill status={scope.status} />
                          {scope.isoptional && (
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              (optional)
                            </span>
                          )}
                          {/* [SCOPE 059 / T007] Process flow link */}
                          <Link
                            to={`/projects/${projectid}/specs/${scope.id}/process-flow`}
                            title="Process flow"
                            className="text-gray-400 hover:text-indigo-600 dark:text-gray-500 dark:hover:text-indigo-400 transition-colors"
                          >
                            <Workflow className="w-3.5 h-3.5" />
                          </Link>
                          {/* [SCOPE 060 / T013] Scope analysis link */}
                          <Link
                            to={`/projects/${projectid}/specs/${scope.id}/scope-analysis`}
                            title="Scope analysis"
                            className="text-gray-400 hover:text-indigo-600 dark:text-gray-500 dark:hover:text-indigo-400 transition-colors"
                          >
                            <FileSearch className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>
                    </td>

                    {/* Phase cells */}
                    {phases.map((phase) => {
                      const phaseStatus = scope.phases[phase] as PhaseStatus | undefined;
                      return (
                        <td
                          key={phase}
                          className="py-3 px-4 text-center align-middle border-r border-gray-100 dark:border-gray-700 last:border-r-0"
                        >
                          <div className="flex items-center justify-center">
                            <PhaseCell status={phaseStatus} />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
