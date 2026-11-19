import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Download, CheckCircle2, X, Loader2, FileText, TrendingUp } from "lucide-react";
import { useAuth } from "../../context/AuthContext.js";

// ── Types matching the actual API response ──────────────────────────────────
// listReports returns (AuditReportMetadata & { document: WxKanbanDocument })

interface AuditReportRow {
  id: string;
  documentid: string;
  executionid: string;
  frameworks: string[] | null;
  featurescope: string | null;
  executiondate: string | null;
  overallcompliance: string | null; // decimal returned as string
  criticalfindings: number;
  highfindings: number;
  mediumfindings: number;
  lowfindings: number;
  remediationstatus: "open" | "in_progress" | "completed" | "waived" | string;
  reviewedby: string | null;
  reviewdate: string | null;
  approved: boolean;
  createdat: string;
  document: {
    id: string;
    title: string;
    description: string | null;
    filecontent: string | null;
    framework: string | null;
    documenttype: string;
    status: string;
  };
}

interface TrendPoint {
  date: string;
  overallCompliance: number;
  criticalFindings: number;
  highFindings: number;
}

interface ComplianceReportViewerProps {
  enabledFrameworks?: string[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const FRAMEWORK_BADGE: Record<string, string> = {
  SOC2:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  HIPAA:   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  HITRUST: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  GDPR:    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
};

const REMEDIATION_BADGE: Record<string, string> = {
  open:         "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  in_progress:  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  completed:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  waived:       "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
};

// ── Main component ──────────────────────────────────────────────────────────

export const ComplianceReportViewer: React.FC<ComplianceReportViewerProps> = ({
  enabledFrameworks,
}) => {
  const { user } = useAuth();
  const isAdmin = user?.usertype === "ADMIN";

  const [reports, setReports] = useState<AuditReportRow[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "approved" | "pending">("all");
  const [selected, setSelected] = useState<AuditReportRow | null>(null);
  const [approving, setApproving] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (filter !== "all") {
        params.set("approved", filter === "approved" ? "true" : "false");
      }

      const [reportsRes, trendsRes] = await Promise.all([
        fetch(`/api/audit/reports?${params}`, { credentials: "include" }),
        fetch(`/api/audit/trends?days=30`, { credentials: "include" }),
      ]);
      if (!reportsRes.ok) throw new Error("Failed to load reports");
      if (!trendsRes.ok) throw new Error("Failed to load trends");

      const reportsJson = await reportsRes.json();
      const trendsJson = await trendsRes.json();
      setReports(reportsJson.data ?? []);
      setTrends(trendsJson.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleApprove = async (id: string) => {
    try {
      setApproving(id);
      const res = await fetch(`/api/audit/reports/${id}/approve`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to approve report");
      void loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to approve report");
    } finally {
      setApproving(null);
    }
  };

  const handleDownload = async (report: AuditReportRow) => {
    try {
      const res = await fetch(`/api/audit/reports/${report.id}/download`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.document.title.replace(/\s+/g, "_")}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    }
  };

  // Filter reports by the framework allowlist when provided
  const filteredReports = useMemo(() => {
    if (!enabledFrameworks || enabledFrameworks.length === 0) return reports;
    return reports.filter((r) => {
      const fws = r.frameworks ?? [];
      if (fws.length === 0) return true; // generic reports always shown
      return fws.some((fw) => enabledFrameworks.includes(fw));
    });
  }, [reports, enabledFrameworks]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Compliance Reports
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {filteredReports.length} report{filteredReports.length !== 1 ? "s" : ""} · 30-day trend
          </p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded px-3 py-1.5 text-sm"
        >
          <option value="all">All Reports</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending Approval</option>
        </select>
      </div>

      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-sm">
          {error}
        </div>
      )}

      {/* Trend chart */}
      <TrendChart trends={trends} />

      {/* Report table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Loading reports…
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No compliance reports yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr className="text-left text-gray-700 dark:text-gray-300">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Scope</th>
                <th className="px-4 py-2 font-medium">Frameworks</th>
                <th className="px-4 py-2 font-medium">Score</th>
                <th className="px-4 py-2 font-medium">Findings</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium w-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredReports.map((report) => (
                <tr
                  key={report.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
                  onClick={() => setSelected(report)}
                >
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {report.executiondate
                      ? new Date(report.executiondate).toLocaleDateString()
                      : new Date(report.createdat).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">
                    <div className="font-medium">{report.document.title}</div>
                    {report.featurescope && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {report.featurescope}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(report.frameworks ?? []).map((fw) => (
                        <span
                          key={fw}
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            FRAMEWORK_BADGE[fw] || "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {fw}
                        </span>
                      ))}
                      {(!report.frameworks || report.frameworks.length === 0) && (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <ScoreBadge score={report.overallcompliance} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {report.criticalfindings > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                          {report.criticalfindings}C
                        </span>
                      )}
                      {report.highfindings > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                          {report.highfindings}H
                        </span>
                      )}
                      {report.criticalfindings + report.highfindings === 0 && (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {report.approved ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        <CheckCircle2 className="w-3 h-3" />
                        Approved
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          REMEDIATION_BADGE[report.remediationstatus] ||
                          "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {report.remediationstatus.replace("_", " ")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleDownload(report)}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-colors"
                        title="Download report"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {isAdmin && !report.approved && (
                        <button
                          type="button"
                          onClick={() => handleApprove(report.id)}
                          disabled={approving === report.id}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded"
                        >
                          {approving === report.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3" />
                          )}
                          Approve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <ReportDetailModal report={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
};

// ── Score badge ──────────────────────────────────────────────────────────────

const ScoreBadge: React.FC<{ score: string | null }> = ({ score }) => {
  if (score === null || score === undefined) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  const n = parseFloat(score);
  const tone =
    n >= 90 ? "text-emerald-600 dark:text-emerald-400"
    : n >= 75 ? "text-blue-600 dark:text-blue-400"
    : n >= 50 ? "text-yellow-600 dark:text-yellow-400"
    : "text-red-600 dark:text-red-400";
  return <span className={`font-semibold ${tone}`}>{n.toFixed(1)}%</span>;
};

// ── Trend chart (inline SVG sparkline) ───────────────────────────────────────

const TrendChart: React.FC<{ trends: TrendPoint[] }> = ({ trends }) => {
  if (trends.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <TrendingUp className="w-4 h-4" />
          No trend data yet — run an audit to start building history.
        </div>
      </div>
    );
  }

  const width = 600;
  const height = 80;
  const padX = 20;
  const padY = 10;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const xs = trends.map((_, i) => padX + (i / Math.max(trends.length - 1, 1)) * innerW);
  const ys = trends.map(
    (t) => padY + innerH - (Math.max(0, Math.min(100, t.overallCompliance)) / 100) * innerH,
  );

  const points = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  const latest = trends[trends.length - 1];
  const first = trends[0];
  const delta = latest.overallCompliance - first.overallCompliance;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          <TrendingUp className="w-4 h-4 text-indigo-500" />
          Compliance score · last 30 days
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {latest.overallCompliance.toFixed(1)}%
          {delta !== 0 && (
            <span
              className={`ml-2 font-medium ${
                delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              }`}
            >
              {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}
            </span>
          )}
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-20" preserveAspectRatio="none">
        <line
          x1={padX} y1={padY + innerH * 0.5}
          x2={width - padX} y2={padY + innerH * 0.5}
          stroke="currentColor" strokeOpacity="0.1" strokeDasharray="2 4"
          className="text-gray-400"
        />
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          points={points}
          className="text-indigo-500 dark:text-indigo-400"
        />
        {xs.map((x, i) => (
          <circle
            key={i}
            cx={x} cy={ys[i]} r="2.5"
            fill="currentColor"
            className="text-indigo-500 dark:text-indigo-400"
          />
        ))}
      </svg>
    </div>
  );
};

// ── Report detail modal ──────────────────────────────────────────────────────

const ReportDetailModal: React.FC<{ report: AuditReportRow; onClose: () => void }> = ({
  report,
  onClose,
}) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    onClick={onClose}
  >
    <div
      className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {report.document.title}
          </h3>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
            {report.featurescope && <span>{report.featurescope}</span>}
            {report.executiondate && (
              <span>· {new Date(report.executiondate).toLocaleString()}</span>
            )}
            <ScoreBadge score={report.overallcompliance} />
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="overflow-y-auto p-6">
        <pre className="bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 p-4 rounded text-xs whitespace-pre-wrap font-mono">
          {report.document.filecontent ?? "(report content empty)"}
        </pre>
      </div>
    </div>
  </div>
);
