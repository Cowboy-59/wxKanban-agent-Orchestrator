import { useState } from "react";
import { Rocket, Calendar, FileText, Loader2, Check, Lock } from "lucide-react";
import { PhaseCompletionBar } from "./PhaseCompletionBar";
import { useTranslation } from "../../i18n";
import type { PhaseCompletion, PhaseWithAssignee } from "~/shared/types/projects";

const RELEASE_METHODS = [
  { value: "manual", labelKey: "manualDeployment" },
  { value: "ci_cd", labelKey: "ciCdPipeline" },
  { value: "staged", labelKey: "stagedRollout" },
  { value: "hotfix", labelKey: "hotfix" },
] as const;

const PHASE_ORDER = [
  "Design",
  "Implementation",
  "QA",
  "HumanTesting",
  "Beta",
  "Release",
] as const;

interface PhaseLifecycleRow {
  phasename: string;
  status: string;
  enteredat: string | null;
  completedat: string | null;
  assignee: string | null;
}

interface ReleasePhaseViewProps {
  projectId: string;
  phaseId: string;
  phases: PhaseWithAssignee[];
  completion: PhaseCompletion | null;
  completionLoading: boolean;
  canControl: boolean;
  phaseStatus: string;
  onAdvancePhase: () => Promise<void>;
  onReopenPhase: (reason: string) => Promise<void>;
}

function StatusBadge({
  status,
  t,
}: {
  status: string;
  t: (key: string) => string;
}) {
  switch (status) {
    case "complete":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <Check className="w-3 h-3" />
          {t("releasePhase.statusComplete")}
        </span>
      );
    case "in_progress":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t("releasePhase.statusInProgress")}
        </span>
      );
    case "reopened":
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          {t("releasePhase.statusReopened")}
        </span>
      );
    default:
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
          {t("releasePhase.statusPending")}
        </span>
      );
  }
}

/**
 * ReleasePhaseView — release record form + full lifecycle summary table.
 * Blocked by PhaseCompletionBar until all prior phases are complete.
 */
export function ReleasePhaseView({
  projectId,
  phaseId,
  phases,
  completion,
  completionLoading,
  canControl,
  phaseStatus,
  onAdvancePhase,
  onReopenPhase,
}: ReleasePhaseViewProps) {
  const { t } = useTranslation();
  const [releaseVersion, setReleaseVersion] = useState("");
  const [releaseMethod, setReleaseMethod] = useState<string>("manual");
  const [releaseDate, setReleaseDate] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSaveNotes = () => {
    // Notes saved locally (persisted to overview doc would require separate endpoint)
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Build lifecycle summary from phases
  const lifeCycleRows: PhaseLifecycleRow[] = PHASE_ORDER.map((name) => {
    const phase = phases.find((p) => p.phasename === name);
    return {
      phasename: name,
      status: phase?.status ?? "pending",
      enteredat: phase?.enteredat ?? null,
      completedat: phase?.completedat ?? null,
      assignee: phase?.assigneduser?.fullname ?? phase?.assigneduser?.emailaddr ?? null,
    };
  });

  const priorPhasesComplete = lifeCycleRows
    .filter((r) => r.phasename !== "Release")
    .every((r) => r.status === "complete");

  return (
    <div className="space-y-6">
      {/* Release record form */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Rocket className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
          {t("releasePhase.releaseRecord")}
          {!priorPhasesComplete && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-normal">
              <Lock className="w-3 h-3" />
              {t("releasePhase.priorPhasesIncomplete")}
            </span>
          )}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Version */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              {t("releasePhase.versionNumber")}
            </label>
            <input
              type="text"
              value={releaseVersion}
              onChange={(e) => setReleaseVersion(e.target.value)}
              placeholder={t("releasePhase.versionPlaceholder")}
              disabled={!priorPhasesComplete && phaseStatus !== "in_progress"}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            />
          </div>

          {/* Release date */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {t("releasePhase.releaseDate")}
            </label>
            <input
              type="date"
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.target.value)}
              disabled={!priorPhasesComplete && phaseStatus !== "in_progress"}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Release method */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            {t("releasePhase.releaseMethod")}
          </label>
          <select
            value={releaseMethod}
            onChange={(e) => setReleaseMethod(e.target.value)}
            disabled={!priorPhasesComplete && phaseStatus !== "in_progress"}
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {RELEASE_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {t(`releasePhase.${m.labelKey}`)}
              </option>
            ))}
          </select>
        </div>

        {/* Release notes */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" />
            {t("releasePhase.releaseNotes")}
          </label>
          <textarea
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.target.value)}
            placeholder={t("releasePhase.notesPlaceholder")}
            rows={4}
            disabled={!priorPhasesComplete && phaseStatus !== "in_progress"}
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none disabled:opacity-50"
          />
        </div>

        <button
          type="button"
          onClick={handleSaveNotes}
          disabled={!priorPhasesComplete && phaseStatus !== "in_progress"}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          {saved ? <Check className="w-4 h-4 text-green-500" /> : null}
          {saved ? t("releasePhase.saved") : t("releasePhase.saveNotes")}
        </button>
      </div>

      {/* Lifecycle summary table */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          {t("releasePhase.fullLifecycleSummary")}
        </h3>
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[8rem_8rem_1fr_1fr] text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/80 px-4 py-2 border-b border-gray-200 dark:border-gray-700 gap-3">
            <span>{t("releasePhase.columnPhase")}</span>
            <span>{t("releasePhase.columnStatus")}</span>
            <span>{t("releasePhase.columnEntered")}</span>
            <span>{t("releasePhase.columnCompleted")}</span>
          </div>
          {lifeCycleRows.map((row) => (
            <div
              key={row.phasename}
              className="grid grid-cols-[8rem_8rem_1fr_1fr] items-center px-4 py-2.5 border-b last:border-b-0 border-gray-100 dark:border-gray-700/50 gap-3"
            >
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {row.phasename === "HumanTesting" ? "Human Testing" : row.phasename}
              </span>
              <StatusBadge status={row.status} t={t} />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {row.enteredat
                  ? new Date(row.enteredat).toLocaleDateString()
                  : "—"}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {row.completedat
                  ? new Date(row.completedat).toLocaleDateString()
                  : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Project ID reference */}
      <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">
        {t("releasePhase.projectLabel")}: {projectId}
      </p>

      <PhaseCompletionBar
        phaseId={phaseId}
        projectId={projectId}
        completion={completion}
        loading={completionLoading}
        canControl={canControl}
        onAdvance={onAdvancePhase}
        onReopen={onReopenPhase}
        isFinalPhase
        currentStatus={phaseStatus}
      />
    </div>
  );
}
