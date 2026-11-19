import { TaskList } from "./TaskList";
import { PhaseCompletionBar } from "./PhaseCompletionBar";
import type { PhaseCompletion, ProjectTask } from "~/shared/types/projects";
import { useTranslation } from "../../i18n";

interface ImplementationPhaseViewProps {
  projectId: string;
  phaseId: string;
  tasks: ProjectTask[];
  tasksLoading: boolean;
  completion: PhaseCompletion | null;
  completionLoading: boolean;
  canEdit: boolean;
  canControl: boolean;
  phaseStatus: string;
  onStatusChange: (taskId: string, status: string) => Promise<void>;
  onCreateTask: (name: string, description?: string) => Promise<void>;
  onAdvancePhase: () => Promise<void>;
  onReopenPhase: (reason: string) => Promise<void>;
}

/**
 * ImplementationPhaseView — renders task list + completion bar for Implementation.
 */
export function ImplementationPhaseView({
  projectId,
  phaseId,
  tasks,
  tasksLoading,
  completion,
  completionLoading,
  canEdit,
  canControl,
  phaseStatus,
  onStatusChange,
  onCreateTask,
  onAdvancePhase,
  onReopenPhase,
}: ImplementationPhaseViewProps) {
  const { t } = useTranslation();
  const openCount = tasks.filter((t) => t.status === "open" || t.status === "in_progress").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t("implementationPhase.tasksHeading")}</h3>
        {!tasksLoading && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {t("implementationPhase.openCount", { n: openCount })}
          </span>
        )}
      </div>

      <TaskList
        tasks={tasks}
        loading={tasksLoading}
        phase="Implementation"
        canEdit={canEdit}
        onStatusChange={onStatusChange}
        onCreateTask={onCreateTask}
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
