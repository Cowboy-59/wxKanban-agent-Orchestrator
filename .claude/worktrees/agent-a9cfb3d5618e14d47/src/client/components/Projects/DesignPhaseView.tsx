import { SpecList } from "./SpecList";
import { PhaseCompletionBar } from "./PhaseCompletionBar";
import { useTranslation } from "../../i18n";
import type { PhaseCompletion, ProjectScope } from "~/shared/types/projects";

interface DesignPhaseViewProps {
  projectId: string;
  phaseId: string;
  specs: ProjectScope[];
  specsLoading: boolean;
  completion: PhaseCompletion | null;
  completionLoading: boolean;
  canEdit: boolean;
  canApprove?: boolean;
  canControl: boolean;
  phaseStatus: string;
  onCreateSpec: (title: string, content?: string) => Promise<void>;
  onUpdateSpec: (specId: string, updates: { title?: string; content?: string }) => Promise<void>;
  onSubmitScope?: (specId: string) => Promise<void>;
  onApproveScope?: (specId: string, action: "approve" | "decline") => Promise<void>;
  onOpenChat?: (specId: string) => void;
  onAdvancePhase: () => Promise<void>;
  onReopenPhase: (reason: string) => Promise<void>;
}

/**
 * DesignPhaseView — renders scope list + completion bar for the Design phase.
 */
export function DesignPhaseView({
  projectId,
  phaseId,
  specs,
  specsLoading,
  completion,
  completionLoading,
  canEdit,
  canApprove = false,
  canControl,
  phaseStatus,
  onCreateSpec,
  onUpdateSpec,
  onSubmitScope,
  onApproveScope,
  onOpenChat,
  onAdvancePhase,
  onReopenPhase,
}: DesignPhaseViewProps) {
  const { t } = useTranslation();
  const clarifiedCount = specs.filter((s) =>
    ["clarified", "planned", "tasks_generated", "implemented", "qa_passed", "human_tested", "beta_cleared", "released"].includes(s.status)
  ).length;

  return (
    <div className="space-y-6">
      {/* Spec count summary */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {t("designPhase.specifications")}
        </h3>
        {!specsLoading && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {t("designPhase.clarifiedCount", { clarified: clarifiedCount, total: specs.length })}
          </span>
        )}
      </div>

      <SpecList
        specs={specs}
        loading={specsLoading}
        canEdit={canEdit}
        canApprove={canApprove}
        onCreateSpec={onCreateSpec}
        onUpdateSpec={onUpdateSpec}
        onSubmitScope={onSubmitScope}
        onApproveScope={onApproveScope}
        onOpenChat={onOpenChat}
      />

      <PhaseCompletionBar
        phaseId={phaseId}
        projectId={projectId}
        completion={completion}
        loading={completionLoading}
        canControl={canControl}
        onAdvance={onAdvancePhase}
        onReopen={onReopenPhase}
        currentStatus={phaseStatus}
      />
    </div>
  );
}
