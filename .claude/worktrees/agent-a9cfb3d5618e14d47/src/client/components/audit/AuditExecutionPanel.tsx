import React, { useState, useEffect } from "react";

interface AuditExecution {
  id: string;
  executiontype: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  triggeredby: string;
  startedat: string | null;
  completedat: string | null;
  featurescope: string | null;
  totaltasks: number;
  passedtasks: number;
  failedtasks: number;
  warningtasks: number;
  resultsummary: Record<string, unknown> | null;
}

export const AuditExecutionPanel: React.FC = () => {
  const [executions, setExecutions] = useState<AuditExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState<AuditExecution | null>(null);
  const [results, setResults] = useState<unknown[]>([]);

  useEffect(() => {
    loadExecutions();
  }, []);

  const loadExecutions = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/audit/executions?limit=20", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to load executions");
      const data = await response.json();
      setExecutions(data.data);
    } catch (err) {
      setError("Failed to load audit executions");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerAudit = async () => {
    try {
      setTriggering(true);
      setError(null);

      const response = await fetch("/api/audit/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to trigger audit");
      }

      const data = await response.json();
      
      // Add new execution to list
      setExecutions((prev) => [data.data, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger audit");
    } finally {
      setTriggering(false);
    }
  };

  const handleViewResults = async (execution: AuditExecution) => {
    setSelectedExecution(execution);
    try {
      const response = await fetch(`/api/audit/executions/${execution.id}/results`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to load results");
      const data = await response.json();
      setResults(data.data);
    } catch (err) {
      console.error(err);
      setResults([]);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "running":
        return "bg-blue-100 text-blue-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "cancelled":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-yellow-100 text-yellow-800";
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString();
  };

  if (loading) {
    return <div className="p-4">Loading executions...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Audit Executions</h2>
        <button
          onClick={handleTriggerAudit}
          disabled={triggering}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {triggering ? "Triggering..." : "Run New Audit"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Type</th>
              <th className="px-4 py-2 text-left">Started</th>
              <th className="px-4 py-2 text-left">Completed</th>
              <th className="px-4 py-2 text-center">Tasks</th>
              <th className="px-4 py-2 text-center">Results</th>
              <th className="px-4 py-2 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {executions.map((execution) => (
              <tr key={execution.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(execution.status)}`}>
                    {execution.status}
                  </span>
                </td>
                <td className="px-4 py-2 capitalize">{execution.executiontype}</td>
                <td className="px-4 py-2">{formatDate(execution.startedat)}</td>
                <td className="px-4 py-2">{formatDate(execution.completedat)}</td>
                <td className="px-4 py-2 text-center">
                  {execution.totaltasks > 0 ? (
                    <span className="text-xs">
                      <span className="text-green-600">{execution.passedtasks}</span>/
                      <span className="text-red-600">{execution.failedtasks}</span>/
                      <span className="text-yellow-600">{execution.warningtasks}</span>
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-2 text-center">
                  {execution.resultsummary ? (
                    <span className="text-xs text-gray-600">
                      {Object.entries(execution.resultsummary)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(", ")}
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => handleViewResults(execution)}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {executions.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No audit executions yet. Click "Run New Audit" to start.
        </div>
      )}

      {/* Results Modal */}
      {selectedExecution && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[80vh] overflow-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Audit Results</h3>
                <button
                  onClick={() => setSelectedExecution(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <div className="mb-4">
                <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(selectedExecution.status)}`}>
                  {selectedExecution.status}
                </span>
                <span className="ml-2 text-sm text-gray-600">
                  {formatDate(selectedExecution.startedat)}
                </span>
              </div>

              <div className="space-y-2">
                {results.length === 0 ? (
                  <p className="text-gray-500">No detailed results available</p>
                ) : (
                  results.map((result: unknown, idx) => {
                    const r = result as {
                      id: string;
                      taskid: string;
                      status: string;
                      severity: string;
                      finding: string;
                      filereference?: string;
                    };
                    return (
                      <div
                        key={r.id || idx}
                        className={`p-3 rounded border-l-4 ${
                          r.status === "pass"
                            ? "border-green-500 bg-green-50"
                            : r.severity === "critical"
                            ? "border-red-500 bg-red-50"
                            : r.severity === "high"
                            ? "border-orange-500 bg-orange-50"
                            : "border-yellow-500 bg-yellow-50"
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                              r.status === "pass"
                                ? "bg-green-200 text-green-800"
                                : r.severity === "critical"
                                ? "bg-red-200 text-red-800"
                                : r.severity === "high"
                                ? "bg-orange-200 text-orange-800"
                                : "bg-yellow-200 text-yellow-800"
                            }`}>
                              {r.status === "pass" ? "PASS" : r.severity?.toUpperCase()}
                            </span>
                            <p className="mt-1 text-sm">{r.finding}</p>
                            {r.filereference && (
                              <p className="text-xs text-gray-500 mt-1">
                                File: {r.filereference}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
