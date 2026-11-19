import { TaskList } from "./TaskList";
import { PhaseCompletionBar } from "./PhaseCompletionBar";
import { UserTestPanel } from "../Tests/UserTestPanel";
import type { PhaseCompletion, ProjectTask } from "~/shared/types/projects";
import { useTranslation } from "../../i18n";

interface HumanTestingPhaseViewProps {
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
 * HumanTestingPhaseView — renders feedback/task list with raised-by column.
 */
export function HumanTestingPhaseView({
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
}: HumanTestingPhaseViewProps) {
  const { t } = useTranslation();
  const openCount = tasks.filter((t) => t.status === "open" || t.status === "in_progress").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t("humanTestingPhase.feedbackItems")}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {t("humanTestingPhase.issuesRaisedByTesters")}
          </p>
        </div>
        {!tasksLoading && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {t("humanTestingPhase.openCount", { count: openCount })}
          </span>
        )}
      </div>

      {/* [SCOPE 111 / T033] The released human set — criteria, not titles. Sits
          above the feedback list because it is the work the phase is FOR. */}
      <UserTestPanel projectId={projectId} canEdit={canEdit} />

      <TaskList
        tasks={tasks}
        loading={tasksLoading}
        phase="HumanTesting"
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
