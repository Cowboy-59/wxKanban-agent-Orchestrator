import React, { useEffect, useCallback } from "react";

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
}

interface AuditFindingDetailProps {
  task: ComplianceTask;
  result?: AuditResult;
  onClose: () => void;
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

const STATUS_COLORS: Record<string, string> = {
  pass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  fail: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  needs_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  not_applicable: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
};

export const AuditFindingDetail: React.FC<AuditFindingDetailProps> = ({
  task,
  result,
  onClose,
}) => {
  // Close on ESC key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {
      /* ignore */
    });
  };

  const suggestedFix = result?.suggestedfix ?? task.suggestedfix;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0 pr-4">
            <span
              className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                FRAMEWORK_COLORS[task.framework] ?? "bg-gray-100 text-gray-700"
              }`}
            >
              {task.framework}
            </span>
            {task.controlreference && (
              <span className="px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {task.controlreference}
              </span>
            )}
            <span
              className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.low
              }`}
            >
              {task.priority}
            </span>
            {result && (
              <span
                className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                  STATUS_COLORS[result.resultstatus] ?? STATUS_COLORS.not_applicable
                }`}
              >
                {result.resultstatus.replace("_", " ")}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Title */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white leading-snug">
              {task.title}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {task.category} · {task.tasktype} ·{" "}
              {task.isautomated ? "⚙ Automated check" : "👁 Manual review"}
            </p>
          </div>

          {/* Description */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Description
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{task.description}</p>
          </div>

          {/* Requirement text */}
          {task.requirementtext && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Regulatory Requirement
              </p>
              <blockquote className="border-l-4 border-indigo-400 dark:border-indigo-600 pl-3 text-sm text-gray-700 dark:text-gray-300 italic">
                {task.requirementtext}
              </blockquote>
            </div>
          )}

          {/* Result details (if from an execution) */}
          {result?.resultdetails && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Audit Finding
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{result.resultdetails}</p>
            </div>
          )}

          {/* Code location */}
          {result?.filepath && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Code Location
              </p>
              <p className="text-sm font-mono text-gray-700 dark:text-gray-300">
                {result.filepath}
                {result.linenumber != null && (
                  <span className="text-gray-400 dark:text-gray-500">
                    {" "}
                    : line {result.linenumber}
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Code snippet */}
          {result?.codesnippet && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Code Snippet
                </p>
                <button
                  onClick={() => handleCopy(result.codesnippet!)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Copy
                </button>
              </div>
              <pre className="text-xs bg-gray-900 dark:bg-black text-green-300 rounded p-3 overflow-x-auto whitespace-pre-wrap font-mono border border-gray-700">
                {result.codesnippet}
              </pre>
            </div>
          )}

          {/* Suggested fix */}
          {suggestedFix && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Suggested Fix
                </p>
                <button
                  onClick={() => handleCopy(suggestedFix)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Copy
                </button>
              </div>
              <pre className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                {suggestedFix}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
