import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, FileText, Info } from "lucide-react";
import { RoleLock } from "~/client/components/admin/RoleLock";
import { AppShell } from "~/client/components/layout/AppShell";
import { UpgradeLock } from "~/client/components/admin/UpgradeLock";
import { Button } from "~/client/components/ui/Button";
import { useAuth } from "~/client/context/AuthContext";
import { useTranslation } from "~/client/i18n";
import type { ProjectTimeSummary, TimeCategory, TimeLine } from "~/shared/types/timeBilling";
import {
  PROJECT_LINE_LABEL_KEYS,
  fetchTeam,
  rangeQuery,
  tbFetch,
  weekOf,
  type DateRange,
  type LineTarget,
  type TimeBillingCustomer,
  type TimeBillingProjectsResponse,
  type TimeBillingStatus,
  type TimeEntryView,
} from "~/client/components/timeBilling/api";
import { BilledProjectList } from "~/client/components/timeBilling/BilledProjectList";
import { EntriesDialog } from "~/client/components/timeBilling/EntriesDialog";
import { ProjectRatesDialog } from "~/client/components/timeBilling/ProjectRatesDialog";
import { RangeFilter } from "~/client/components/timeBilling/RangeFilter";
import { StartTimerDialog } from "~/client/components/timeBilling/StartTimerDialog";
import { StatementDialog } from "~/client/components/timeBilling/StatementDialog";
import { TimeEntryDialog } from "~/client/components/timeBilling/TimeEntryDialog";
import { TimerPanel, type RunningTimerView } from "~/client/components/timeBilling/TimerPanel";

// [SCOPE 005 / T014] BEGIN — TimeBillingPage: /admin/time-billing behind the plan and ADMIN locks (FR-001)
export default function TimeBillingPage() {
  const { t } = useTranslation();
  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Clock className="w-6 h-6 text-indigo-500" />
          {t("timeBilling.page.title")}
        </h1>
        <UpgradeLock
          requiredPlan="SMALL_BUSINESS"
          featureName={t("adminDashboard.timeBilling")}
          featureDescription={t("adminDashboard.timeBillingDesc")}
        >
          <RoleLock requiredUsertype="ADMIN" featureName={t("adminDashboard.timeBilling")}>
            <TimeBillingWorkspace />
          </RoleLock>
        </UpgradeLock>
      </div>
    </AppShell>
  );
}
// [SCOPE 005 / T014] END

// [SCOPE 005 / T015] BEGIN — TimeBillingWorkspace: range, project lines, timer and dialogs wired to the API (FR-002 to FR-009, FR-014)
// MODIFIED-BY: [SCOPE 005 / T025] — the project row's clock opens StartTimerDialog (Amendment C, FR-006)
// MODIFIED-BY: [SCOPE 005 / T027] — the timer label names the DBA, Management and Meetings lines (Amendment D)
function TimeBillingWorkspace() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<DateRange>(() => ({ ...weekOf(new Date()), includeInvoiced: false }));
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const [entryDialog, setEntryDialog] = useState<{ target: LineTarget | null; category: TimeCategory; entry: TimeEntryView | null } | null>(null);
  const [entriesProject, setEntriesProject] = useState<ProjectTimeSummary | null>(null);
  const [ratesProject, setRatesProject] = useState<ProjectTimeSummary | null>(null);
  const [statementOpen, setStatementOpen] = useState(false);
  const [timerProject, setTimerProject] = useState<ProjectTimeSummary | null>(null);

  const rangeValid = range.from <= range.to;
  const projectsQuery = useQuery({
    queryKey: ["time-billing", "projects", range],
    queryFn: () => tbFetch<TimeBillingProjectsResponse>(`/projects?${rangeQuery(range)}`),
    enabled: rangeValid,
  });
  const statusQuery = useQuery({
    queryKey: ["time-billing", "status"],
    queryFn: () => tbFetch<TimeBillingStatus>("/status"),
  });
  const timerQuery = useQuery({
    queryKey: ["time-billing", "timer"],
    queryFn: () => tbFetch<{ timer: RunningTimerView | null }>("/timer"),
  });
  const customersQuery = useQuery({
    queryKey: ["time-billing", "customers"],
    queryFn: () => tbFetch<{ customers: TimeBillingCustomer[] }>("/customers"),
  });
  const teamQuery = useQuery({ queryKey: ["team"], queryFn: fetchTeam });

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
    void queryClient.invalidateQueries({ queryKey: ["time-billing"] });
  }, [queryClient]);

  const projects = useMemo(() => projectsQuery.data?.projects ?? [], [projectsQuery.data]);
  const customers = customersQuery.data?.customers ?? [];
  const timer = timerQuery.data?.timer ?? null;
  const hasEngaged = projects.some((p) => p.engaged);

  const withPending = async (projectid: string, action: () => Promise<unknown>) => {
    setPending((prev) => new Set(prev).add(projectid));
    setError(null);
    try {
      await action();
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("timeBilling.page.actionFailed"));
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(projectid);
        return next;
      });
    }
  };

  const startTimer = async (target: LineTarget) => {
    setError(null);
    try {
      await tbFetch("/timer/start", {
        method: "POST",
        body: { projectid: target.projectid, line: target.line, specid: target.specid, workdate: new Date().toLocaleDateString("en-CA") },
      });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("timeBilling.page.actionFailed"));
    }
  };

  const timerLabel = useMemo(() => {
    if (!timer) return "";
    const p = projects.find((x) => x.projectid === timer.entry.projectid);
    // [SCOPE 005 / T027] project lines, including DBA / Management / Meetings, label through one map
    const projectLine = timer.entry.line as TimeLine;
    const line =
      projectLine !== "scope" && projectLine in PROJECT_LINE_LABEL_KEYS
        ? t(PROJECT_LINE_LABEL_KEYS[projectLine])
        : (() => {
            const s = p?.scopes.find((x) => x.specid === timer.entry.specid);
            return s?.specnumber ? `${s.specnumber} ${s.title}` : t("timeBilling.lines.scope");
          })();
    return `${p?.name ?? ""} · ${line} · ${t("timeBilling.lines.developer")}`;
  }, [timer, projects, t]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
      <div className="flex flex-col gap-4 min-w-0">
        {statusQuery.data && !statusQuery.data.agentRunsAvailable && (
          <p className="flex items-start gap-2 rounded-md bg-slate-100 dark:bg-slate-800 p-3 text-sm text-slate-700 dark:text-slate-300">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            {t("timeBilling.page.manualOnly")}
          </p>
        )}
        {hasEngaged && (
          <p className="flex items-start gap-2 rounded-md bg-indigo-50 dark:bg-indigo-950/40 p-3 text-sm text-indigo-800 dark:text-indigo-200">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            {t("timeBilling.page.engagedManual")}
          </p>
        )}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <RangeFilter value={range} onChange={setRange} />
          <Button onClick={() => setStatementOpen(true)}>
            <FileText className="w-4 h-4 mr-2" />
            {t("timeBilling.page.generateStatement")}
          </Button>
        </div>

        {projectsQuery.data && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t("timeBilling.page.billedTotal", { hours: projectsQuery.data.billedTotalHours })}
          </p>
        )}
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        {projectsQuery.isLoading ? (
          <p className="text-sm text-slate-500">{t("timeBilling.common.loading")}</p>
        ) : projectsQuery.isError ? (
          <p className="text-sm text-red-600">
            {projectsQuery.error instanceof Error ? projectsQuery.error.message : t("timeBilling.page.loadFailed")}
          </p>
        ) : (
          <BilledProjectList
            projects={projects}
            customers={customers}
            timerRunning={timer !== null}
            timerProjectId={timer?.entry.projectid ?? null}
            pending={pending}
            onToggleBilled={(p, billed) =>
              void withPending(p.projectid, () => tbFetch(`/projects/${p.projectid}/billed`, { method: "PATCH", body: { billed } }))
            }
            onSetCustomer={(p, customerid) =>
              void withPending(p.projectid, () => tbFetch(`/projects/${p.projectid}/customer`, { method: "PATCH", body: { customerid } }))
            }
            onAddEntry={(target, category) => setEntryDialog({ target, category, entry: null })}
            onStartTimer={(target) => void startTimer(target)}
            onOpenTimer={setTimerProject}
            onShowEntries={setEntriesProject}
            onEditRates={setRatesProject}
          />
        )}
      </div>

      <aside className="xl:sticky xl:top-4 self-start">
        <TimerPanel timer={timer} lineLabel={timerLabel} onStopped={refresh} />
      </aside>

      <TimeEntryDialog
        open={entryDialog !== null}
        onOpenChange={(open) => !open && setEntryDialog(null)}
        target={entryDialog?.target ?? null}
        category={entryDialog?.category ?? "developer"}
        entry={entryDialog?.entry ?? null}
        team={teamQuery.data ?? []}
        currentUserId={user?.userid ?? ""}
        onSaved={refresh}
      />
      <EntriesDialog
        open={entriesProject !== null}
        onOpenChange={(open) => !open && setEntriesProject(null)}
        project={entriesProject}
        range={range}
        version={version}
        onEdit={(entry) => setEntryDialog({ target: null, category: entry.category, entry })}
        onChanged={refresh}
      />
      <ProjectRatesDialog
        open={ratesProject !== null}
        onOpenChange={(open) => !open && setRatesProject(null)}
        project={ratesProject}
      />
      <StartTimerDialog
        open={timerProject !== null}
        onOpenChange={(open) => !open && setTimerProject(null)}
        project={timerProject}
        onStart={startTimer}
      />
      <StatementDialog
        open={statementOpen}
        onOpenChange={setStatementOpen}
        customers={customers}
        onGenerated={refresh}
        onCustomersChanged={refresh}
      />
    </div>
  );
}
// [SCOPE 005 / T015] END
