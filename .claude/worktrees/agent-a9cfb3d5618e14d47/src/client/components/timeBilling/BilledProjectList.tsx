import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Clock, DollarSign, ListChecks } from "lucide-react";
import { Button } from "~/client/components/ui/Button";
import { Checkbox } from "~/client/components/ui/Checkbox";
import { useTranslation } from "~/client/i18n";
import type { ProjectTimeSummary, TimeCategory } from "~/shared/types/timeBilling";
import type { LineTarget, TimeBillingCustomer } from "./api";
import { ProjectTimeLines } from "./ProjectTimeLines";

// [SCOPE 005 / T015] BEGIN — BilledProjectList: projects with "Bill this project", no-client warning and lines (FR-002, FR-003, FR-014)
// MODIFIED-BY: [SCOPE 005 / T025] — sorted by name, "Billable" label, and a clock at each row's right edge that opens the start-timer window (Amendment C)
interface BilledProjectListProps {
  projects: ProjectTimeSummary[];
  customers: TimeBillingCustomer[];
  timerRunning: boolean;
  /** The project the running timer is on, so its clock shows as running. */
  timerProjectId: string | null;
  /** Project ids with a billed-flag or Customer change in flight. */
  pending: ReadonlySet<string>;
  onToggleBilled: (project: ProjectTimeSummary, billed: boolean) => void;
  onSetCustomer: (project: ProjectTimeSummary, customerid: string | null) => void;
  onAddEntry: (target: LineTarget, category: TimeCategory) => void;
  onStartTimer: (target: LineTarget) => void;
  /** The row's clock: opens the window that picks a line and starts the timer. */
  onOpenTimer: (project: ProjectTimeSummary) => void;
  onShowEntries: (project: ProjectTimeSummary) => void;
  onEditRates: (project: ProjectTimeSummary) => void;
}

export function BilledProjectList(props: BilledProjectListProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Own and engaged client projects arrive as two runs; one list by name reads as a directory.
  const sorted = useMemo(
    () => [...props.projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [props.projects],
  );

  if (sorted.length === 0) {
    return <p className="text-sm text-slate-500 py-6 text-center">{t("timeBilling.projects.none")}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {sorted.map((p) => {
        const expanded = open.has(p.projectid);
        const busy = props.pending.has(p.projectid);
        const timerHere = props.timerProjectId === p.projectid;
        return (
          <li key={p.projectid} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <div className="flex flex-wrap items-center gap-3 p-3">
              <button
                type="button"
                onClick={() => toggleOpen(p.projectid)}
                className="flex items-center gap-1 font-medium text-slate-900 dark:text-slate-100"
                aria-expanded={expanded}
              >
                {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                {p.name}
              </button>
              {p.engaged && (
                <span className="rounded bg-indigo-50 dark:bg-indigo-900/40 px-2 py-0.5 text-xs text-indigo-700 dark:text-indigo-300">
                  {t("timeBilling.projects.clientProject", { client: p.clientname ?? "" })}
                </span>
              )}
              <span className="ml-auto text-sm tabular-nums text-slate-600 dark:text-slate-300">
                {t("timeBilling.projects.hours", { hours: p.totalHours })}
              </span>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={p.billed}
                  disabled={busy}
                  onCheckedChange={(checked) => props.onToggleBilled(p, checked)}
                  aria-label={t("timeBilling.projects.billThis")}
                />
                {t("timeBilling.projects.billThis")}
              </label>
              <Button size="sm" variant="outline" onClick={() => props.onShowEntries(p)}>
                <ListChecks className="w-3.5 h-3.5 mr-1" />
                {t("timeBilling.projects.entries")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => props.onEditRates(p)}>
                <DollarSign className="w-3.5 h-3.5 mr-1" />
                {t("timeBilling.projects.rates")}
              </Button>
              <Button
                size="sm"
                variant={timerHere ? "default" : "outline"}
                disabled={props.timerRunning}
                onClick={() => props.onOpenTimer(p)}
                title={
                  timerHere
                    ? t("timeBilling.timer.runningHere")
                    : props.timerRunning
                      ? t("timeBilling.timer.alreadyRunning")
                      : t("timeBilling.timer.start")
                }
                aria-label={t("timeBilling.timer.start")}
              >
                <Clock className={timerHere ? "w-4 h-4 animate-pulse" : "w-4 h-4"} />
              </Button>
            </div>

            {(p.billed || p.engaged) && (
              <div className="flex flex-wrap items-center gap-3 px-3 pb-3 text-sm">
                {p.engaged ? (
                  <label className="flex items-center gap-2">
                    <span className="text-slate-600 dark:text-slate-300">{t("timeBilling.projects.client")}</span>
                    <select
                      className="h-8 rounded-md border border-slate-300 dark:border-slate-600 bg-background text-foreground px-2"
                      value={p.customerid ?? ""}
                      disabled={busy}
                      onChange={(e) => props.onSetCustomer(p, e.target.value === "" ? null : e.target.value)}
                    >
                      <option value="">{t("timeBilling.projects.noClient")}</option>
                      {props.customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  p.customername && (
                    <span className="text-slate-600 dark:text-slate-300">
                      {t("timeBilling.projects.billedTo", { client: p.customername })}
                    </span>
                  )
                )}
                {p.needsClient && (
                  <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                    {t("timeBilling.projects.assignClient")}
                  </span>
                )}
              </div>
            )}

            {expanded && (
              <div className="border-t border-slate-200 dark:border-slate-700 px-3 pb-3">
                <ProjectTimeLines
                  project={p}
                  timerRunning={props.timerRunning}
                  onAddEntry={props.onAddEntry}
                  onStartTimer={props.onStartTimer}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
// [SCOPE 005 / T015] END
