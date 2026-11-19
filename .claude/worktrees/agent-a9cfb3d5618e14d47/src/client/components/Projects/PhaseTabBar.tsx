import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle, Circle, Loader2, RefreshCw } from "lucide-react";
import type { PhaseWithAssignee } from "~/shared/types/projects";
import { useTranslation } from "../../i18n";

const PHASE_ORDER = [
  "Design",
  "Implementation",
  "QA",
  "HumanTesting",
  "Beta",
  "Release",
] as const;

const PHASE_SLUGS: Record<string, string> = {
  Design: "design",
  Implementation: "implementation",
  QA: "qa",
  HumanTesting: "human-testing",
  Beta: "beta",
  Release: "release",
};

// Maps the phasename enum → shared `phase.*` i18n key. The phasename VALUE stays
// English (data/route key); only the displayed label is localized.
const PHASE_I18N_KEY: Record<string, string> = {
  Design: "phase.design",
  Implementation: "phase.implementation",
  QA: "phase.qa",
  HumanTesting: "phase.humanTesting",
  Beta: "phase.beta",
  Release: "phase.release",
};

function getInitials(fullname: string | null, emailaddr: string | null): string {
  if (fullname) {
    const parts = fullname.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return fullname.slice(0, 2).toUpperCase();
  }
  if (emailaddr) return emailaddr.slice(0, 2).toUpperCase();
  return "??";
}

function PhaseStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "complete":
      return <CheckCircle className="w-3.5 h-3.5 text-green-500 dark:text-green-400 flex-shrink-0" />;
    case "in_progress":
      return <Loader2 className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 animate-spin flex-shrink-0" />;
    case "reopened":
      return <RefreshCw className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 flex-shrink-0" />;
    default:
      return <Circle className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />;
  }
}

interface PhaseTabBarProps {
  projectId: string;
  phases: PhaseWithAssignee[];
  /** The phasename of the currently viewed phase (e.g. "Design") */
  activePhase: string;
}

/**
 * PhaseTabBar — horizontal scrollable tab bar for the 6 project phases.
 *
 * Each tab shows phase name, assigned user avatar, and status icon.
 * Clicking a tab navigates to `/projects/:id/phase/:slug`.
 */
export function PhaseTabBar({ projectId, phases, activePhase }: PhaseTabBarProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { phaseSlug } = useParams<{ phaseSlug?: string }>();

  // Build a lookup from phasename → PhaseWithAssignee
  const phaseMap = new Map<string, PhaseWithAssignee>(
    phases.map((p) => [p.phasename, p])
  );

  const handleTabClick = (phasename: string) => {
    const slug = PHASE_SLUGS[phasename];
    if (slug) {
      navigate(`/projects/${projectId}/phase/${slug}`);
    }
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div className="flex overflow-x-auto scrollbar-none">
        {PHASE_ORDER.map((phasename) => {
          const phase = phaseMap.get(phasename);
          const slug = PHASE_SLUGS[phasename];
          const isActive =
            activePhase === phasename ||
            phaseSlug === slug;

          const isComplete = phase?.status === "complete";
          const isInProgress = phase?.status === "in_progress";
          const isReopened = phase?.status === "reopened";
          const user = phase?.assigneduser ?? null;

          return (
            <button
              key={phasename}
              type="button"
              onClick={() => handleTabClick(phasename)}
              className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 border-b-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset ${
                isActive
                  ? "border-indigo-500 text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-900/10"
                  : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
              } ${
                isComplete
                  ? "opacity-80"
                  : ""
              }`}
            >
              {/* Status icon */}
              {phase ? (
                <PhaseStatusIcon status={phase.status} />
              ) : (
                <Circle className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
              )}

              {/* Phase label */}
              <span>{PHASE_I18N_KEY[phasename] ? t(PHASE_I18N_KEY[phasename]) : phasename}</span>

              {/* Assigned user avatar */}
              {user && (
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold flex-shrink-0 ${
                    isInProgress || isReopened
                      ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
                      : isComplete
                      ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                  }`}
                  title={user.fullname ?? user.emailaddr ?? t("phaseTabBar.assignedUser")}
                >
                  {getInitials(user.fullname, user.emailaddr)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
