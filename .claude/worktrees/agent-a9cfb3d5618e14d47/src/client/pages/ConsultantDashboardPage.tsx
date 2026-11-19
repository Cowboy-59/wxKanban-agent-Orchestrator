import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, FolderOpen, Plus } from "lucide-react";
import { AppShell } from "../components/layout/AppShell";
import { Button } from "../components/ui/Button";
import { Skeleton } from "../components/ui/Skeleton";
import { apiFetchJson } from "../lib/apiFetch";
import { useTranslation } from "../i18n";

// Consultant Dashboard (FR-001, FR-004, FR-005, FR-008)
//
// The consultant's home. It ORIENTS — ledger, exceptions, projects — and hands
// off to the Work Hub (SCOPE-020) for all execution. It deliberately does not
// draw a timer or a task queue; those already ship at /dashboard/work-hub, and
// a second copy would be a second source of truth for the same clock.
//
// Design of record: specs/017-consultant-dashboard/page.md
//
// This is path (c) of plan.md Gate 5 — the design's Connections tile and
// Customers rail are absent because the `customers` table does not exist. The
// four-tile / 7-5 split layout in page.md is the full form, restored when the
// customer layer lands.

interface DashboardProject {
  id: string;
  name: string;
  todocount: number;
  inprogresscount: number;
  donecount: number;
  completionpercent: number;
  nextduedate: string | null;
  isoverdue: boolean;
  priority: string;
}

// [SCOPE 119 / T013] Shape returned by GET /api/consultant/customers
interface DashboardCustomer {
  id: string;
  name: string;
  company: string | null;
  projectcount: number;
}

// [SCOPE 017 / T112] Shape of GET /api/consultant/dashboard/connection-health
interface ConnectionHealthSummary {
  total: number;
  healthy: number;
  warning: number;
  error: number;
  unknown: number;
}

interface DashboardAlert {
  id: string;
  kind: "overduetask";
  what: string;
  where: string;
  actionlabel: string;
  actionhref: string;
}

interface DashboardSummary {
  todayminutes: number;
  todayentrycount: number;
  weekminutes: number;
  weekbillableminutes: number;
  periodearnings: number;
  avghourlyrate: number | null;
  unbilledminutes: number;
  periodstart: string;
  periodend: string;
  projects: DashboardProject[];
  alerts: DashboardAlert[];
}

// [SCOPE 017 / T047] BEGIN — Format minutes as Nh MMm
function formatHours(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.max(0, Math.round(totalMinutes % 60));
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}
// [SCOPE 017 / T047] END

// [SCOPE 017 / T047] BEGIN — Ledger stat tile
function StatTile({
  label,
  value,
  children,
}: {
  label: string;
  value: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3.5">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </p>
      <p className="text-[1.625rem] font-semibold leading-tight tracking-[-0.02em] tabular-nums">
        {value}
      </p>
      {children ? <div className="mt-1 text-xs text-muted-foreground">{children}</div> : null}
    </div>
  );
}
// [SCOPE 017 / T047] END

// [SCOPE 017 / T047] BEGIN — Project row with completion bar and inline due badge
function ProjectRow({ project }: { project: DashboardProject }) {
  const { t } = useTranslation();
  const due = project.nextduedate
    ? new Date(project.nextduedate).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      })
    : null;

  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-border px-4 py-3.5 first:border-t-0 hover:bg-accent/50">
      <p className="min-w-0 text-sm font-medium tracking-[-0.005em] [text-wrap:pretty]">
        {project.name}
      </p>
      <Button asChild variant="outline" size="sm" className="row-span-2 self-center">
        <Link to={`/projects/${project.id}`}>{t("consultantdash.open")}</Link>
      </Button>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs tabular-nums text-muted-foreground">
        <span className="font-semibold text-foreground">{project.completionpercent}%</span>
        <span>
          {t("consultantdash.taskCounts", {
            todo: project.todocount,
            inprogress: project.inprogresscount,
            done: project.donecount,
          })}
        </span>
        {due ? (
          <span
            className={
              project.isoverdue
                ? "inline-flex items-center rounded-full border border-[hsl(var(--danger)/0.4)] bg-[hsl(var(--danger)/0.1)] px-1.5 py-px text-[11px] font-medium text-[hsl(var(--danger))]"
                : "inline-flex items-center rounded-full border border-border px-1.5 py-px text-[11px] font-medium"
            }
          >
            {project.isoverdue
              ? t("consultantdash.dueOverdue", { date: due })
              : t("consultantdash.due", { date: due })}
          </span>
        ) : null}
      </div>
      <div
        className="col-span-full mt-2 h-[5px] overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={project.completionpercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("consultantdash.completionOf", { name: project.name })}
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${project.completionpercent}%` }}
        />
      </div>
    </div>
  );
}
// [SCOPE 017 / T047] END

// [SCOPE 017 / T047] BEGIN — Loading skeleton matching final geometry
function DashboardSkeleton() {
  return (
    <>
      <p className="sr-only" role="status">
        Loading
      </p>
      <div className="mb-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(15rem,100%),1fr))]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-card px-4 py-3.5">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="my-2 h-7 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border-t border-border px-4 py-3.5 first:border-t-0">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="mt-2 h-3 w-3/4" />
            <Skeleton className="mt-2 h-[5px] w-full" />
          </div>
        ))}
      </div>
    </>
  );
}
// [SCOPE 017 / T047] END

// [SCOPE 017 / T047] BEGIN — Consultant Dashboard page — orients; the Work Hub executes
// [SCOPE 119 / T013] MODIFIED-BY — restored the Customers rail and the 7/5 split
export default function ConsultantDashboardPage() {
  const { t } = useTranslation();

  const summaryQuery = useQuery({
    queryKey: ["consultant-dashboard"],
    queryFn: () => apiFetchJson<DashboardSummary>("/api/consultant/dashboard"),
  });

  // [SCOPE 119 / T013] A second query rather than folding customers into the
  // summary payload: the design budgets three queries for this screen, and the
  // customers endpoint already exists and is owner-scoped server-side.
  const customersQuery = useQuery({
    queryKey: ["consultant-customers", "", false],
    queryFn: () =>
      apiFetchJson<{ customers: DashboardCustomer[] }>(
        "/api/consultant/customers?search=&includearchived=false",
      ),
  });

  // [SCOPE 017 / T112] The fourth tile the design always specified. It was absent
  // in path (c) because the connection tables did not exist; they do now.
  const healthQuery = useQuery({
    queryKey: ["connection-health"],
    queryFn: () =>
      apiFetchJson<ConnectionHealthSummary>("/api/consultant/dashboard/connection-health"),
  });

  const data = summaryQuery.data;
  const health = healthQuery.data;
  const customers: DashboardCustomer[] = customersQuery.data?.customers ?? [];
  const hasProjects = (data?.projects.length ?? 0) > 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-[84rem] px-5 pb-16 pt-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.015em] [text-wrap:balance]">
              {t("consultantdash.title")}
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <Button asChild>
            <Link to="/dashboard/work-hub">
              {t("consultantdash.openWorkHub")}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {summaryQuery.isLoading ? <DashboardSkeleton /> : null}

        {summaryQuery.isError ? (
          <div
            role="alert"
            className="rounded-lg border border-[hsl(var(--danger)/0.4)] bg-[hsl(var(--danger)/0.1)] p-5 text-center"
          >
            <h2 className="mb-1.5 text-[15px] font-semibold text-[hsl(var(--danger))]">
              {t("consultantdash.errorTitle")}
            </h2>
            <p className="mx-auto mb-4 max-w-[34rem] text-[13px] text-muted-foreground">
              {t("consultantdash.errorBody")}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => void summaryQuery.refetch()}>
                {t("consultantdash.retry")}
              </Button>
              <Button asChild variant="outline">
                <Link to="/dashboard/work-hub">{t("consultantdash.openWorkHubInstead")}</Link>
              </Button>
            </div>
          </div>
        ) : null}

        {data ? (
          <>
            <div className="mb-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(15rem,100%),1fr))]">
              <StatTile label={t("consultantdash.today")} value={formatHours(data.todayminutes)}>
                {t("consultantdash.entryCount", { count: data.todayentrycount })}
              </StatTile>
              <StatTile label={t("consultantdash.thisWeek")} value={formatHours(data.weekminutes)}>
                <span className="font-semibold tabular-nums text-foreground">
                  {formatHours(data.weekbillableminutes)}
                </span>{" "}
                {t("consultantdash.billable")}
              </StatTile>
              <StatTile
                label={t("consultantdash.periodEarnings")}
                value={data.periodearnings.toLocaleString(undefined, {
                  style: "currency",
                  currency: "USD",
                })}
              >
                {data.avghourlyrate !== null
                  ? t("consultantdash.atAvgRate", { rate: data.avghourlyrate })
                  : t("consultantdash.noBillableYet")}
                {" · "}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatHours(data.unbilledminutes)}
                </span>{" "}
                {t("consultantdash.unbilled")}
              </StatTile>

              {/* [SCOPE 017 / T112] Connections tile (FR-013). Rendered only when
                  there ARE connections — a tile reading "0 of 0 healthy" is a
                  permanent dead region, and the design's argument about the
                  exceptions band applies equally here. */}
              {health && health.total > 0 ? (
                <StatTile
                  label={t("consultantdash.connections")}
                  value={
                    <>
                      {health.healthy}
                      <span className="text-sm font-medium text-muted-foreground">
                        {" "}
                        {t("consultantdash.ofTotalHealthy", { total: health.total })}
                      </span>
                    </>
                  }
                >
                  <span className="flex flex-wrap gap-3">
                    {health.warning > 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-[hsl(var(--warning))]">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--warning))]"
                          aria-hidden="true"
                        />
                        {t("consultantdash.warningCount", { count: health.warning })}
                      </span>
                    ) : null}
                    {health.error > 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-[hsl(var(--danger))]">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--danger))]"
                          aria-hidden="true"
                        />
                        {t("consultantdash.errorCount", { count: health.error })}
                      </span>
                    ) : null}
                    {health.warning === 0 && health.error === 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-[hsl(var(--success))]">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--success))]"
                          aria-hidden="true"
                        />
                        {t("consultantdash.allHealthy")}
                      </span>
                    ) : null}
                  </span>
                </StatTile>
              ) : null}
            </div>

            {data.alerts.length > 0 ? (
              <section
                aria-labelledby="dash-alerts"
                className="mb-5 rounded-lg border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.1)] px-4 py-3"
              >
                <h2
                  id="dash-alerts"
                  className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.04em]"
                >
                  <AlertTriangle
                    className="h-3.5 w-3.5 text-[hsl(var(--warning))]"
                    aria-hidden="true"
                  />
                  {t("consultantdash.needsAttention", { count: data.alerts.length })}
                </h2>
                {data.alerts.map((alert: DashboardAlert) => (
                  <div
                    key={alert.id}
                    className="flex flex-wrap items-center gap-2 border-t border-[hsl(var(--warning)/0.2)] py-1.5 text-[13px] first-of-type:border-t-0"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--danger))]"
                      aria-hidden="true"
                    />
                    <span className="font-medium">{alert.what}</span>
                    <span className="text-muted-foreground">{alert.where}</span>
                    <Button asChild variant="ghost" size="sm" className="ml-auto">
                      <Link to={alert.actionhref}>{t("consultantdash.openInWorkHub")}</Link>
                    </Button>
                  </div>
                ))}
              </section>
            ) : null}

            {hasProjects ? (
              // [SCOPE 119 / T013] The 7/5 split from the approved design, restored
              // now that customers exist. Path (c) shipped this as a full-width
              // projects panel because there was no customer layer to put beside it.
              // Container query, not a media query — the region responds to its own
              // width. The Connections tile is still absent: SPEC-017's connection
              // layer does not exist yet, so it would have nothing to count.
              <div className="[container:dash/inline-size]">
                <div className="grid grid-cols-1 items-start gap-4 [@container_dash_(width>=62rem)]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
                  <section
                    aria-labelledby="dash-projects"
                    className="rounded-lg border border-border bg-card"
                  >
                    <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                      <h2 id="dash-projects" className="text-[13px] font-bold">
                        {t("consultantdash.activeProjects")}
                      </h2>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {data.projects.length}
                      </span>
                    </div>
                    {data.projects.map((project: DashboardProject) => (
                      <ProjectRow key={project.id} project={project} />
                    ))}
                  </section>

                  <section
                    aria-labelledby="dash-customers"
                    className="rounded-lg border border-border bg-card"
                  >
                    <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                      <h2 id="dash-customers" className="text-[13px] font-bold">
                        {t("consultantdash.customers")}
                      </h2>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {customers.length}
                      </span>
                    </div>

                    {customers.map((customer: DashboardCustomer) => (
                      <div
                        key={customer.id}
                        className="flex items-center gap-2.5 border-t border-border px-4 py-3 first:border-t-0 hover:bg-accent/50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium">{customer.name}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {t("consultantdash.projectCount", { count: customer.projectcount })}
                          </p>
                        </div>
                        <Button asChild variant="outline" size="sm">
                          <Link to="/dashboard/consultant/customers">
                            {t("consultantdash.manage")}
                          </Link>
                        </Button>
                      </div>
                    ))}

                    {customers.length === 0 && !customersQuery.isLoading ? (
                      <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                        {t("consultantdash.noCustomers")}
                      </p>
                    ) : null}

                    <div className="border-t border-border bg-muted/40 px-4 py-2.5">
                      <Button asChild variant="ghost" size="sm">
                        <Link to="/dashboard/consultant/customers">
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                          {t("consultantdash.addCustomer")}
                        </Link>
                      </Button>
                    </div>
                  </section>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
                <div className="mx-auto mb-3.5 grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">
                  <FolderOpen className="h-5 w-5" />
                </div>
                <h2 className="mb-1.5 text-base font-semibold">
                  {t("consultantdash.emptyTitle")}
                </h2>
                <p className="mx-auto mb-5 max-w-[34rem] text-[13px] text-muted-foreground [text-wrap:pretty]">
                  {t("consultantdash.emptyBody")}
                </p>
                <Button asChild variant="outline">
                  <Link to="/dashboard/work-hub">{t("consultantdash.openWorkHub")}</Link>
                </Button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
// [SCOPE 017 / T047] END
