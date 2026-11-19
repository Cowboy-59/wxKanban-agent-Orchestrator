import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  Clock3,
  Cpu,
  Filter,
  FolderKanban,
  Hand,
  ListTree,
  PauseCircle,
  Play,
  Square,
} from "lucide-react";
import { AppShell } from "../components/layout/AppShell";
import { apiFetchJson } from "../lib/apiFetch";
import { useTranslation } from "../i18n"; // [SCOPE 052]
import { BillablePromptModal } from "../components/consultant/BillablePromptModal";
import { TaskStatusControl } from "../components/consultant/TaskStatusControl";
import { TimeLogDrawer } from "../components/consultant/TimeLogDrawer";
import { WorkloadSummaryBar } from "../components/consultant/WorkloadSummaryBar";

type HubTask = {
  id: string;
  projectid: string;
  projectname: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  duedate: string | null;
  createdat: string;
  sources: string[];
  externalid: string | null;
  complianceattention?: boolean;
};

type HubResponse = {
  success: boolean;
  filters: { projectid: string };
  counters: {
    total: number;
    pastDue: number;
    aging30Plus: number;
    complianceAttention: number;
  };
  projects: Array<{ id: string; name: string }>;
  tasks: HubTask[];
};

type ActiveTimerResponse = {
  success: boolean;
  activeTimer: {
    id: string;
    taskid: string;
    projectid: string;
    starttime: string;
    elapsedSeconds: number;
  } | null;
};

type InvoicePreviewResponse = {
  success: boolean;
  data: {
    entryCount: number;
    totalHours: number;
    entries: Array<{
      id: string;
      taskid: string;
      taskname: string;
      projectid: string;
      date: string;
      durationMinutes: number;
      billable: boolean;
      notes: string | null;
      source: string;
    }>;
  };
};

type ComplianceFlagsResponse = {
  success: boolean;
  count: number;
  flags: Array<{
    id: string;
    taskid: string;
    taskname: string;
    projectid: string;
    projectname: string;
    ruletype: string;
    flaggedat: string;
  }>;
};

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

const INACTIVITY_THRESHOLD_SECONDS = 8 * 3600; // FR-011

export default function ConsultantWorkHubPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [invoiceStartDate, setInvoiceStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  });
  const [invoiceEndDate, setInvoiceEndDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );

  // Modal/drawer state
  const [statusModalTask, setStatusModalTask] = useState<{
    taskid: string;
    name: string;
    status: "blocked" | "suspended";
  } | null>(null);
  const [timelogDrawerTaskId, setTimelogDrawerTaskId] = useState<string | null>(null);
  const [billableModal, setBillableModal] = useState<{
    entryid: string;
    taskName: string;
    elapsedSeconds: number;
  } | null>(null);
  const [inactivityDismissed, setInactivityDismissed] = useState(false);

  const hubQuery = useQuery({
    queryKey: ["consultant-work-hub", projectFilter],
    queryFn: () =>
      apiFetchJson<HubResponse>(
        `/api/consultant-hub/tasks?projectid=${encodeURIComponent(projectFilter)}`,
      ),
  });

  const activeTimerQuery = useQuery({
    queryKey: ["active-timer"],
    queryFn: () => apiFetchJson<ActiveTimerResponse>("/api/time-tracking/active"),
    refetchInterval: 1000,
  });

  const activeTimer = activeTimerQuery.data?.activeTimer ?? null;

  // Reset inactivity dismissal whenever a new timer starts
  useEffect(() => {
    if (activeTimer) {
      setInactivityDismissed(false);
    }
  }, [activeTimer?.id]);

  const startTimerMutation = useMutation({
    mutationFn: async (task: HubTask) => {
      return apiFetchJson("/api/time-tracking/start", {
        method: "POST",
        body: JSON.stringify({
          projectid: task.projectid,
          taskid: task.id,
          description: `Work session for ${task.name}`,
          billable: true,
        }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["active-timer"] });
    },
  });

  const stopTimerMutation = useMutation({
    mutationFn: async (entryid: string) => {
      return apiFetchJson<{
        success: boolean;
        timeentry: { id: string; duration: number };
      }>(`/api/time-tracking/stop/${entryid}`, { method: "POST" });
    },
    onSuccess: async (data, entryid) => {
      // Open the billable prompt modal (FR-004 stop-time prompt)
      const task = hubQuery.data?.tasks.find((t) => t.id === activeTimer?.taskid);
      const elapsed = activeTimer
        ? Math.max(
            0,
            Math.floor((Date.now() - new Date(activeTimer.starttime).getTime()) / 1000),
          )
        : 0;
      setBillableModal({
        entryid,
        taskName: task?.name ?? t("workhub.activeTask"),
        elapsedSeconds: elapsed,
      });
      await queryClient.invalidateQueries({ queryKey: ["active-timer"] });
    },
  });

  const invoicePreviewQuery = useQuery({
    queryKey: ["consultant-invoice-preview", projectFilter, invoiceStartDate, invoiceEndDate],
    queryFn: () =>
      apiFetchJson<InvoicePreviewResponse>(
        `/api/consultant-hub/invoice-preview?projectid=${encodeURIComponent(
          projectFilter,
        )}&startDate=${encodeURIComponent(invoiceStartDate)}&endDate=${encodeURIComponent(invoiceEndDate)}`,
      ),
  });

  const complianceFlagsQuery = useQuery({
    queryKey: ["consultant-compliance-flags"],
    queryFn: () =>
      apiFetchJson<ComplianceFlagsResponse>("/api/consultant-hub/compliance-flags"),
  });

  const timerTaskName = useMemo(() => {
    if (!activeTimer || !hubQuery.data?.tasks) {
      return t("workhub.activeTask");
    }
    const match = hubQuery.data.tasks.find((task) => task.id === activeTimer.taskid);
    return match?.name ?? t("workhub.activeTask");
  }, [activeTimer, hubQuery.data?.tasks]);

  const nowSeconds = activeTimer?.starttime
    ? Math.floor((Date.now() - new Date(activeTimer.starttime).getTime()) / 1000)
    : 0;

  const showInactivityPrompt =
    !!activeTimer &&
    nowSeconds > INACTIVITY_THRESHOLD_SECONDS &&
    !inactivityDismissed;

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {t("workhub.title")}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("workhub.subtitle")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <select
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="all">{t("workhub.allProjects")}</option>
              {(hubQuery.data?.projects ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {activeTimer ? (
          <div className="rounded-xl border border-emerald-300/60 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Clock3 className="w-4 h-4 text-emerald-700" />
              <div>
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                  {t("workhub.timerRunning")}
                </p>
                <p className="text-xs text-emerald-700/90 dark:text-emerald-400">
                  {timerTaskName} • {formatDuration(nowSeconds)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => stopTimerMutation.mutate(activeTimer.id)}
              disabled={stopTimerMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              <Square className="w-3.5 h-3.5" />
              {t("workhub.stopTimer")}
            </button>
          </div>
        ) : null}

        {showInactivityPrompt ? (
          <div className="rounded-xl border border-amber-400/70 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {t("workhub.inactivityTitle")}
                </p>
                <p className="text-xs text-amber-700/90 dark:text-amber-400">
                  {t("workhub.inactivityBody")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => activeTimer && stopTimerMutation.mutate(activeTimer.id)}
                className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800"
              >
                {t("workhub.stopTimer")}
              </button>
              <button
                type="button"
                onClick={() => setInactivityDismissed(true)}
                className="rounded-md border border-amber-400 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300"
              >
                {t("workhub.keepRunning")}
              </button>
            </div>
          </div>
        ) : null}

        <WorkloadSummaryBar
          total={hubQuery.data?.counters.total ?? 0}
          pastDue={hubQuery.data?.counters.pastDue ?? 0}
          aging30Plus={hubQuery.data?.counters.aging30Plus ?? 0}
          complianceAttention={hubQuery.data?.counters.complianceAttention ?? 0}
        />

        {hubQuery.isLoading ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-sm text-slate-500">
            {t("workhub.loadingQueue")}
          </div>
        ) : hubQuery.isError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {t("workhub.loadError")}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <FolderKanban className="w-4 h-4" />
              {t("workhub.assignedQueue")}
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(hubQuery.data?.tasks ?? []).length === 0 ? (
                <p className="px-4 py-10 text-sm text-slate-500 text-center">
                  {t("workhub.noTasks")}
                </p>
              ) : (
                (hubQuery.data?.tasks ?? []).map((task) => {
                  const canStart = !activeTimer;
                  const isTaskActiveTimer = activeTimer?.taskid === task.id;
                  return (
                    <div
                      key={task.id}
                      className="px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {task.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {task.projectname} • {task.status} • {task.priority}
                        </p>
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          {task.sources.map((src) => (
                            <span
                              key={src}
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                src === "internal"
                                  ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                                  : "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                              }`}
                            >
                              {src}
                            </span>
                          ))}
                          {task.complianceattention ? (
                            <span className="inline-flex items-center rounded bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 font-semibold">
                              {t("workhub.compliance")}
                            </span>
                          ) : null}
                        </div>
                        {task.description ? (
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                            {task.description}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setTimelogDrawerTaskId(task.id)}
                          className="rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300 inline-flex items-center gap-1"
                          title="View time entries and history"
                        >
                          <ListTree className="w-3 h-3" />
                          {t("workhub.activity")}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setStatusModalTask({
                              taskid: task.id,
                              name: task.name,
                              status: "blocked",
                            })
                          }
                          className="rounded-md border border-amber-300 px-2 py-1 text-[11px] text-amber-700 inline-flex items-center gap-1"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          {t("workhub.blocked")}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setStatusModalTask({
                              taskid: task.id,
                              name: task.name,
                              status: "suspended",
                            })
                          }
                          className="rounded-md border border-purple-300 px-2 py-1 text-[11px] text-purple-700 inline-flex items-center gap-1"
                        >
                          <PauseCircle className="w-3 h-3" />
                          {t("workhub.suspended")}
                        </button>

                        {isTaskActiveTimer ? (
                          <button
                            type="button"
                            onClick={() => activeTimer && stopTimerMutation.mutate(activeTimer.id)}
                            disabled={stopTimerMutation.isPending}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-white hover:bg-slate-900"
                          >
                            <Square className="w-3 h-3" />
                            {t("workhub.stop")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startTimerMutation.mutate(task)}
                            disabled={!canStart || startTimerMutation.isPending}
                            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                          >
                            <Play className="w-3 h-3" />
                            {t("workhub.startTimer")}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {t("workhub.billablePreview")}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("workhub.complianceFlaggedTasks", { count: hubQuery.data?.counters.complianceAttention ?? 0 })}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <input
              type="date"
              value={invoiceStartDate}
              onChange={(event) => setInvoiceStartDate(event.target.value)}
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
            />
            <input
              type="date"
              value={invoiceEndDate}
              onChange={(event) => setInvoiceEndDate(event.target.value)}
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
            />
          </div>

          <div className="text-xs text-slate-600 dark:text-slate-300">
            {invoicePreviewQuery.isLoading
              ? t("workhub.loadingPreview")
              : invoicePreviewQuery.isError
                ? t("workhub.previewError")
                : t("workhub.previewSummary", {
                    count: invoicePreviewQuery.data?.data.entryCount ?? 0,
                    hours: invoicePreviewQuery.data?.data.totalHours ?? 0,
                  })}
          </div>

          {(invoicePreviewQuery.data?.data.entries ?? []).length > 0 ? (
            <div className="text-xs text-slate-500 space-y-1">
              <p>{t("workhub.sourceBreakdown")}</p>
              <ul className="ml-4 list-disc">
                <li>
                  <Hand className="w-3 h-3 inline mr-1" />
                  {t("workhub.manual")}{" "}
                  {invoicePreviewQuery.data!.data.entries.filter((e) => e.source === "manual").length}
                </li>
                <li>
                  <Cpu className="w-3 h-3 inline mr-1" />
                  {t("workhub.ai")}{" "}
                  {invoicePreviewQuery.data!.data.entries.filter((e) => e.source === "ai").length}
                </li>
              </ul>
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {t("workhub.complianceReviewPanel")}
            </p>
            {complianceFlagsQuery.isLoading ? (
              <p className="text-xs text-slate-500">{t("workhub.loadingFlags")}</p>
            ) : complianceFlagsQuery.isError ? (
              <p className="text-xs text-red-600">{t("workhub.flagsError")}</p>
            ) : (complianceFlagsQuery.data?.flags.length ?? 0) === 0 ? (
              <p className="text-xs text-slate-500">{t("workhub.noFlags")}</p>
            ) : (
              <div className="space-y-2">
                {(complianceFlagsQuery.data?.flags ?? []).slice(0, 6).map((flag) => (
                  <div
                    key={flag.id}
                    className="text-xs text-slate-700 dark:text-slate-300 flex items-center justify-between gap-2"
                  >
                    <span className="truncate">
                      {flag.taskname} • {flag.ruletype}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(flag.flaggedat).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {statusModalTask ? (
        <TaskStatusControl
          taskid={statusModalTask.taskid}
          taskName={statusModalTask.name}
          initialStatus={statusModalTask.status}
          onClose={() => setStatusModalTask(null)}
          onSubmitted={() =>
            queryClient.invalidateQueries({ queryKey: ["consultant-work-hub"] })
          }
        />
      ) : null}

      {timelogDrawerTaskId ? (
        <TimeLogDrawer
          taskid={timelogDrawerTaskId}
          onClose={() => setTimelogDrawerTaskId(null)}
        />
      ) : null}

      {billableModal ? (
        <BillablePromptModal
          entryid={billableModal.entryid}
          taskName={billableModal.taskName}
          elapsedSeconds={billableModal.elapsedSeconds}
          onClose={() => setBillableModal(null)}
          onSubmitted={() =>
            queryClient.invalidateQueries({ queryKey: ["consultant-invoice-preview"] })
          }
        />
      ) : null}
    </AppShell>
  );
}
