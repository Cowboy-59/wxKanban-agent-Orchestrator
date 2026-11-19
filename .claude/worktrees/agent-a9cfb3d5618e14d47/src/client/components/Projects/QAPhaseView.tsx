import { TaskList } from "./TaskList";
import { PhaseCompletionBar } from "./PhaseCompletionBar";
import { TestSuitePanel } from "../Tests/TestSuitePanel";
import { useTranslation } from "../../i18n";
import type { PhaseCompletion, ProjectTask } from "~/shared/types/projects";

interface QAPhaseViewProps {
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
 * QAPhaseView — renders task list with result column + completion bar for QA.
 */
export function QAPhaseView({
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
}: QAPhaseViewProps) {
  const { t } = useTranslation();
  const passCount = tasks.filter((t) => t.results === "pass").length;
  const failCount = tasks.filter((t) => t.results === "fail").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t("qaPhase.testTasks")}</h3>
        {!tasksLoading && tasks.length > 0 && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-green-600 dark:text-green-400">{t("qaPhase.passCount", { n: passCount })}</span>
            <span className="text-red-500 dark:text-red-400">{t("qaPhase.failCount", { n: failCount })}</span>
          </div>
        )}
      </div>

      {/* [SCOPE 111 / T029] The generated suite, its live run, and the cycle it
          belongs to. The task list stays below it — QA still carries ordinary
          work items alongside the tests. */}
      <TestSuitePanel
        projectId={projectId}
        canControl={canControl}
        isAdmin={canControl}
      />

      <TaskList
        tasks={tasks}
        loading={tasksLoading}
        phase="QA"
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
