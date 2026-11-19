import { useEffect, useState } from "react";
import { X, Cpu, Hand, Clock3, AlertTriangle, PauseCircle, FileText } from "lucide-react";
import { useTranslation } from "../../i18n"; // [SCOPE 052]

interface TimeLog {
  id: string;
  starttime: string;
  endtime: string | null;
  duration: number | null;
  billable: boolean;
  notes: string | null;
  completionnotesummary: string | null;
  source: string;
  aispecsessionid: string | null;
  invoiced: boolean;
}

interface OverrideHistoryEntry {
  id: string;
  status: string;
  reason: string | null;
  userid: string;
  resolvedat: string | null;
  createdat: string;
}

interface TaskDetail {
  task: {
    id: string;
    name: string;
    status: string;
    priority: string;
    projectname: string;
    sourcepmssystem: string | null;
    externalid: string | null;
  };
  timelogs: TimeLog[];
  overrideHistory: OverrideHistoryEntry[];
  syncState: {
    lastsyncstatus: string | null;
    lastsyncedat: string | null;
    lastsyncerror: string | null;
    retrycount: number;
  } | null;
}

interface TimeLogDrawerProps {
  taskid: string;
  onClose: () => void;
}

function formatDuration(min: number | null): string {
  if (min === null) return "running";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

/**
 * TimeLogDrawer — slide-out panel showing time entries + override history
 * for a single task. Loads from GET /api/consultant-hub/tasks/:taskid.
 */
export function TimeLogDrawer({ taskid, onClose }: TimeLogDrawerProps) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/consultant-hub/tasks/${taskid}`,
          { credentials: "include" },
        );
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error || t("workhub.loadDetailError"));
        }
        if (!cancelled) {
          setDetail(body as TaskDetail);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("workhub.unknownError"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskid]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 h-full overflow-y-auto shadow-2xl border-l border-slate-200 dark:border-slate-700">
        <div className="sticky top-0 bg-white dark:bg-slate-900 flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("workhub.taskActivity")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {loading ? (
            <p className="text-sm text-slate-500">{t("workhub.loadingActivity")}</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : detail ? (
            <>
              <section>
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                  {t("workhub.task")}
                </p>
                <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {detail.task.name}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {detail.task.projectname} • {detail.task.status} • {detail.task.priority}
                  {detail.task.sourcepmssystem
                    ? ` • ${detail.task.sourcepmssystem} #${detail.task.externalid ?? ""}`
                    : ""}
                </p>
              </section>

              <section>
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                  {t("workhub.timeEntries", { count: detail.timelogs.length })}
                </p>
                {detail.timelogs.length === 0 ? (
                  <p className="text-xs text-slate-500">{t("workhub.noTimeEntries")}</p>
                ) : (
                  <ul className="space-y-2">
                    {detail.timelogs.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {entry.source === "ai" ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 text-[10px] font-semibold">
                                <Cpu className="w-3 h-3" />
                                {t("workhub.aiBadge")}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[10px] font-semibold">
                                <Hand className="w-3 h-3" />
                                {t("workhub.manualBadge")}
                              </span>
                            )}
                            <span className="text-slate-700 dark:text-slate-200">
                              {entry.duration === null ? t("workhub.running") : formatDuration(entry.duration)}
                            </span>
                            {entry.billable ? (
                              <span className="text-emerald-600 font-medium">{t("workhub.billable")}</span>
                            ) : (
                              <span className="text-slate-500">{t("workhub.nonBillable")}</span>
                            )}
                            {entry.invoiced ? (
                              <span className="text-purple-600 font-medium">{t("workhub.invoiced")}</span>
                            ) : null}
                          </div>
                          <span className="text-[10px] text-slate-500">
                            {new Date(entry.starttime).toLocaleString()}
                          </span>
                        </div>
                        {entry.notes ? (
                          <p className="text-slate-600 dark:text-slate-400 mt-1">{entry.notes}</p>
                        ) : null}
                        {entry.completionnotesummary ? (
                          <p className="text-slate-700 dark:text-slate-300 mt-1 flex items-start gap-1">
                            <FileText className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <span className="italic">{entry.completionnotesummary}</span>
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                  {t("workhub.statusHistory", { count: detail.overrideHistory.length })}
                </p>
                {detail.overrideHistory.length === 0 ? (
                  <p className="text-xs text-slate-500">{t("workhub.noStateChanges")}</p>
                ) : (
                  <ul className="space-y-2">
                    {detail.overrideHistory.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          {entry.status === "blocked" ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          ) : entry.status === "suspended" ? (
                            <PauseCircle className="w-3.5 h-3.5 text-purple-600" />
                          ) : (
                            <Clock3 className="w-3.5 h-3.5 text-emerald-600" />
                          )}
                          <span className="font-semibold capitalize text-slate-800 dark:text-slate-200">
                            {entry.status}
                          </span>
                          <span className="text-[10px] text-slate-500 ml-auto">
                            {new Date(entry.createdat).toLocaleString()}
                          </span>
                        </div>
                        {entry.reason ? (
                          <p className="text-slate-600 dark:text-slate-400 mt-1">{entry.reason}</p>
                        ) : null}
                        {entry.resolvedat ? (
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {t("workhub.resolved", { time: new Date(entry.resolvedat).toLocaleString() })}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {detail.syncState ? (
                <section>
                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                    {t("workhub.pmSyncState")}
                  </p>
                  <div className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs">
                    <p className="text-slate-700 dark:text-slate-300">
                      {t("workhub.syncStatus")}{" "}
                      <span className="font-semibold">
                        {detail.syncState.lastsyncstatus ?? t("workhub.syncUnknown")}
                      </span>
                    </p>
                    {detail.syncState.lastsyncedat ? (
                      <p className="text-slate-500 mt-0.5">
                        {t("workhub.lastSyncLabel", { time: new Date(detail.syncState.lastsyncedat).toLocaleString() })}
                      </p>
                    ) : null}
                    {detail.syncState.retrycount > 0 ? (
                      <p className="text-amber-600 mt-0.5">
                        {t("workhub.retries", { count: detail.syncState.retrycount })}
                      </p>
                    ) : null}
                    {detail.syncState.lastsyncerror ? (
                      <p className="text-red-600 mt-0.5">
                        {t("workhub.errorLabel", { message: detail.syncState.lastsyncerror })}
                      </p>
                    ) : null}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
