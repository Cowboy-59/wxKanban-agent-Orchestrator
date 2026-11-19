import { useState } from "react";
import { CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import type { PhaseCompletion } from "~/shared/types/projects";
import { useTranslation } from "../../i18n";

interface PhaseCompletionBarProps {
  phaseId: string;
  projectId: string;
  completion: PhaseCompletion | null;
  loading?: boolean;
  /** Whether the current user can advance/reopen this phase */
  canControl: boolean;
  onAdvance: () => Promise<void>;
  onReopen: (reason: string) => Promise<void>;
  /** Whether this is the last phase (Release) — changes button label */
  isFinalPhase?: boolean;
  currentStatus: string;
}

/**
 * PhaseCompletionBar — rendered below each phase view.
 *
 * Shows per-criterion pass/fail status and an "Advance Phase" button
 * that is disabled until all criteria pass.
 */
export function PhaseCompletionBar({
  completion,
  loading = false,
  canControl,
  onAdvance,
  onReopen,
  isFinalPhase = false,
  currentStatus,
}: PhaseCompletionBarProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [showReopenForm, setShowReopenForm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAdvance = async () => {
    setActionError(null);
    setAdvancing(true);
    try {
      await onAdvance();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("phaseCompletionBar.advanceFailed"));
    } finally {
      setAdvancing(false);
    }
  };

  const handleReopen = async () => {
    if (!reopenReason.trim()) return;
    setActionError(null);
    setReopening(true);
    try {
      await onReopen(reopenReason.trim());
      setShowReopenForm(false);
      setReopenReason("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("phaseCompletionBar.reopenFailed"));
    } finally {
      setReopening(false);
    }
  };

  const isComplete = currentStatus === "complete";
  const isReopened = currentStatus === "reopened";

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400 dark:text-gray-500" />
        <span className="text-sm text-gray-500 dark:text-gray-400">{t("phaseCompletionBar.checkingCriteria")}</span>
      </div>
    );
  }

  if (!completion) return null;

  const passCount = completion.criteria.filter((c) => c.passed).length;
  const totalCount = completion.criteria.length;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          {completion.canAdvance ? (
            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
          ) : (
            <XCircle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          )}
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {isComplete
              ? t("phaseCompletionBar.phaseComplete")
              : isReopened
              ? t("phaseCompletionBar.phaseReopened")
              : completion.canAdvance
              ? t("phaseCompletionBar.readyToAdvance")
              : t("phaseCompletionBar.criteriaMet", { pass: passCount, total: totalCount })}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title={expanded ? t("phaseCompletionBar.collapse") : t("phaseCompletionBar.expand")}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Criteria list */}
      {expanded && (
        <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
          {completion.criteria.map((criterion, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-2.5">
              {criterion.passed ? (
                <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400 dark:text-red-500 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${
                  criterion.passed
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-600 dark:text-gray-400"
                }`}>
                  {criterion.label}
                </p>
                {criterion.detail && !criterion.passed && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    {criterion.detail}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action footer */}
      {canControl && !isComplete && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 space-y-2">
          {actionError && (
            <p className="text-xs text-red-600 dark:text-red-400">{actionError}</p>
          )}

          {/* Advance button */}
          {!isReopened && (
            <button
              type="button"
              onClick={handleAdvance}
              disabled={!completion.canAdvance || advancing}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                completion.canAdvance && !advancing
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
              }`}
            >
              {advancing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
              {advancing
                ? t("phaseCompletionBar.advancing")
                : isFinalPhase
                ? t("phaseCompletionBar.markAsReleased")
                : t("phaseCompletionBar.advancePhase")}
            </button>
          )}

          {/* Reopen form */}
          {isReopened && !showReopenForm && (
            <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
              {t("phaseCompletionBar.reopenedForRevisions")}
            </p>
          )}

          {/* Reopen reverts a COMPLETED phase. It is invalid for the active
              (in_progress) phase — offering it there caused a 500. */}
          {isComplete || isReopened || currentStatus === "in_progress" ? null : (
            <button
              type="button"
              onClick={() => setShowReopenForm((v) => !v)}
              className="w-full text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors underline underline-offset-2"
            >
              {showReopenForm ? t("phaseCompletionBar.cancelReopen") : t("phaseCompletionBar.reopenPhase")}
            </button>
          )}

          {showReopenForm && (
            <div className="space-y-2">
              <textarea
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder={t("phaseCompletionBar.reopenReasonPlaceholder")}
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              />
              <button
                type="button"
                onClick={handleReopen}
                disabled={!reopenReason.trim() || reopening}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              >
                {reopening && <Loader2 className="w-4 h-4 animate-spin" />}
                {reopening ? t("phaseCompletionBar.reopening") : t("phaseCompletionBar.confirmReopen")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
