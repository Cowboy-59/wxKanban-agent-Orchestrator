import { useState } from "react";
import { AlertCircle, X, Loader2 } from "lucide-react";
import { TaskList } from "./TaskList";
import { PhaseCompletionBar } from "./PhaseCompletionBar";
import { useTranslation } from "../../i18n";
import type { PhaseCompletion, ProjectTask } from "~/shared/types/projects";

interface BetaPhaseViewProps {
  projectId: string;
  phaseId: string;
  tasks: ProjectTask[];
  tasksLoading: boolean;
  completion: PhaseCompletion | null;
  completionLoading: boolean;
  canEdit: boolean;
  canControl: boolean;
  isAdmin: boolean;
  phaseStatus: string;
  onStatusChange: (taskId: string, status: string) => Promise<void>;
  onCreateTask: (name: string, description?: string) => Promise<void>;
  onAdvancePhase: () => Promise<void>;
  onReopenPhase: (reason: string) => Promise<void>;
}

/**
 * BetaPhaseApprovalDialog — shown before creating a task in Beta phase.
 * ADMIN must explicitly approve new task creation.
 */
function BetaApprovalDialog({
  onApprove,
  onCancel,
}: {
  onApprove: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70" onClick={onCancel} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                {t("betaPhase.approvalTitle")}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {t("betaPhase.approvalBody")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onApprove}
            className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {t("betaPhase.approveAndCreate")}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * BetaPhaseView — same as HumanTesting but new tasks require ADMIN approval dialog.
 */
export function BetaPhaseView({
  projectId,
  phaseId,
  tasks,
  tasksLoading,
  completion,
  completionLoading,
  canEdit,
  canControl,
  isAdmin,
  phaseStatus,
  onStatusChange,
  onCreateTask,
  onAdvancePhase,
  onReopenPhase,
}: BetaPhaseViewProps) {
  const { t } = useTranslation();
  const [showApproval, setShowApproval] = useState(false);
  const [approvedCreate, setApprovedCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleBetaCreateTask = () => {
    if (!isAdmin) return;
    setShowApproval(true);
  };

  const handleApprove = () => {
    setShowApproval(false);
    setApprovedCreate(true);
  };

  const handleApprovedCreate = async (name: string, description?: string) => {
    setCreating(true);
    try {
      await onCreateTask(name, description);
      setApprovedCreate(false);
    } finally {
      setCreating(false);
    }
  };

  const openCount = tasks.filter((t) => t.status === "open" || t.status === "in_progress").length;

  return (
    <div className="space-y-6">
      {showApproval && (
        <BetaApprovalDialog
          onApprove={handleApprove}
          onCancel={() => setShowApproval(false)}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t("betaPhase.feedbackTitle")}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {t("betaPhase.feedbackHint")}
          </p>
        </div>
        {!tasksLoading && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {t("betaPhase.openCount", { count: openCount })}
          </span>
        )}
      </div>

      {creating && (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("betaPhase.creatingApprovedTask")}
        </div>
      )}

      <TaskList
        tasks={tasks}
        loading={tasksLoading}
        phase="Beta"
        canEdit={canEdit && isAdmin}
        onStatusChange={onStatusChange}
        onCreateTask={approvedCreate ? handleApprovedCreate : onCreateTask}
        onCreateTaskBeta={handleBetaCreateTask}
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
