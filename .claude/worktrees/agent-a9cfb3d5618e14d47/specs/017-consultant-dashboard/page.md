# Consultant Dashboard — design

**Scope**: SCOPE-017 — a single-pane home for a consultant: projects, time, earnings, customers, external PM connections.
**Specs**: SPEC-017 (all 13 FRs; this screen covers FR-001, FR-004, FR-005, FR-006 entry point, FR-008, FR-013)
**Route**: `/dashboard/consultant` · **Audience**: Consultant (TEAM role) on desktop/tablet ≥1024px · **Status**: `partially implemented — path (c) shipped 2026-07-31`
**Theme source**: `src/client/styles/index.css` (live theme profile not queried — app not running during this pass)

> **Scope decision, 2026-07-31.** SCOPE-020's Work Hub is already in production and covers FR-002
> (time tracking), FR-003 (project/task status) and FR-009 (time drill-down). This dashboard therefore
> **orients**; the Work Hub **executes**. It does not draw a second timer. `tasks.md`, `spec.md` and
> `plan.md` were reconciled with this decision on 2026-07-31 — see *Outstanding before implement*.
>
> **What is actually built (path (c), 2026-07-31).** The full design below is four tiles and a
> 7/5 split. What shipped is the subset that needs **no new tables**: three tiles (Today, This
> week, Period earnings), the exceptions band fed by overdue tasks only, and Active projects at
> full width. The **Connections tile** and the **Customers rail** are absent — they depend on the
> missing `customers` table (plan.md Gate 5, resolved as: build the dashboard now, scope the
> customer layer separately). The design below is the target; restore those two regions when the
> customer layer lands.
>
> Three design assumptions were corrected by the real data:
>
> - **The hourly rate is not a single company figure.** `projecttimeentries.entryrate` is a
>   per-entry snapshot, so the tile shows the **blended rate actually earned this period**, or
>   "no billable time yet". This resolves open question 2 below.
> - **Task statuses are `open` / `in_progress` / `completed`**, not todo/in-progress/done.
> - **Priority has four values** (`low`/`medium`/`high`/`critical`), not three. The priority pill
>   was dropped from the shipped row as low-value next to the due date.

## Purpose

A consultant opens this screen first thing and answers three questions without clicking: where do I stand on time and money, what is broken or late, and what am I working on. Everything that *does* work — starting a timer, moving a task, logging against a task — happens one click away in the Work Hub. "Done" is the consultant leaving this screen within about ten seconds, either reassured or pointed at the one thing that needs them.

## Layout

Four stacked bands inside a `max-w-84rem` centred page:

1. **Header** — greeting, date, billing period; secondary *Add customer*, primary *Open Work Hub*.
2. **Ledger** — four stat tiles: Today, This week, Period earnings, Connections.
3. **Exceptions** — a conditional band, rendered **only when it has content**.
4. **Body** — a 7/5 split: Active projects (main) | Customers (rail).

The split is a **container query** (`@container dash (width >= 62rem)`), not a media query, so the region responds to its own width rather than the viewport's. If this screen is later dropped into a narrower shell — a split pane, a modal, an embedded panel — it reflows correctly with no breakpoint rewrite.

The exceptions band's conditional presence is the design's one structural bet. A dashboard that permanently renders "0 alerts" trains the eye to skip that rectangle within a week; a region that only ever appears when something is wrong keeps its signal. Tufte's data-ink argument applied at the scale of a region rather than a mark.

## Hierarchy

1. **The four numbers.** Glanceable facts requiring no decision. Largest type on the page (`1.625rem`, `tabular-nums`, `-0.02em`).
2. **The exceptions band.** The only region that demands action, and the only one carrying a warning tint.
3. **Active projects.** The standing spine — widest column, longest dwell.
4. **Customers.** Administrative; the rail, quieter type, smaller controls.

The single primary action is **Open Work Hub** — deliberately the loudest control on the page even though it navigates away, because under the scope decision this screen's job is to hand off.

**Two regions the spec implies that this design deliberately does not build:**

- **No deadline panel.** FR-001 wants next-7-day deadlines highlighted. Due dates sit inline on each project row, and anything overdue escalates into the exceptions band. A separate chronological list would restate the same dates in a different order — two readings of one fact, after which neither list can be trusted alone.
- **No connection-health panel.** FR-013 wants a health summary widget. The tile carries the roll-up ("4 of 6 healthy"), each customer row carries its own state, failures escalate to the band. Connections belong to customers, so they are shown there.

## Components

| Region | Component | Variant | Why |
| --- | --- | --- | --- |
| Stat tiles | `Card` | — | Four peer surfaces; the card border is the only division needed |
| Panels (projects, customers) | `Card` + `CardHeader` | — | Header row carries title, count and one ghost action |
| Header actions | `Button` | `default` (Work Hub), `outline` (Add customer) | One primary; everything else recedes |
| Row actions | `Button` | `outline` / `ghost`, `size="sm"` | `sm` = `h-9 px-3`, correct for a 44px-tall row |
| Loading | `Skeleton` | — | Import from `./ui/Skeleton` — **not in the barrel** |
| Project completion | plain `div` bar | — | **Not `Progress`** — see note below |
| Exceptions / status | plain elements + tokens | — | No shadcn `Badge` or `Alert` exists in this repo |

**`Progress` is deliberately unused.** [src/client/components/ui/Progress.tsx](src/client/components/ui/Progress.tsx) hardcodes `bg-slate-700` (track) and `bg-blue-600` (fill), so it ignores the theme in both light and dark. Using it would put two untokenised colours into a token-pure screen. The design uses a 5px token-styled bar instead. Fixing `Progress` to use `bg-muted` / `bg-primary` is a worthwhile separate change — it would touch every existing consumer, so it is not folded in here.

**`Badge` and `Alert` do not exist** in [src/client/components/ui/](src/client/components/ui/). The pills and the exceptions band are composed from tokens directly rather than introducing two new shared components inside a screen design.

## Tokens

| Surface | Tokens |
| --- | --- |
| Page | `bg-background` / `text-foreground` |
| Tiles, panels | `bg-card` / `text-card-foreground`, `border-border` |
| Tile label, meta, secondary text | `text-muted-foreground` |
| Primary button | `bg-primary` / `text-primary-foreground` |
| Outline button | `border-input`, `bg-background`, hover `bg-accent` / `text-accent-foreground` |
| Row hover | `bg-accent/50` |
| Progress track / fill | `bg-muted` / `bg-primary` |
| Panel footer | `bg-muted/40` |
| Focus ring | `ring-ring`, 2px, 2px offset |

### Tokens added to the theme

The theme ships **no green and no amber**. FR-013 requires green/yellow/red health status, so three status tokens are proposed. Contrast measured against `--card` in each mode, and against a 10% tint of themselves on card (the pill/band backgrounds).

| Token | Light | Dark | Contrast on card (L / D) | On 10% tint (L / D) | Promoted to |
| --- | --- | --- | --- | --- | --- |
| `--success` | `142 76% 26%` | `142 69% 58%` | 5.83:1 / 11.45:1 | 5.05:1 / 9.89:1 | `index.css` — `:root`, `.dark`, `@theme inline` |
| `--warning` | `32 95% 33%` | `38 92% 60%` | 5.21:1 / 10.83:1 | 4.55:1 / 9.47:1 | `index.css` — `:root`, `.dark`, `@theme inline` |
| `--danger` | `0 74% 42%` | `0 84% 68%` | 6.41:1 / 6.65:1 | 5.41:1 / 6.08:1 | `index.css` — `:root`, `.dark`, `@theme inline` |

All clear WCAG AA (4.5:1) in both modes on both backgrounds. `@theme inline` needs `--color-success`, `--color-warning`, `--color-danger` mapped, or the Tailwind classes generate zero CSS in v4.

**Promoted 2026-07-31**, approved by the user. All three are live in `src/client/styles/index.css` at all three required sites — `:root` (light), `.dark`, and the `@theme inline` mapping. They are now available app-wide as `text-success` / `bg-warning` / `border-danger` etc.

### Existing tokens this design would change

**None applied.** One recommendation, left as a recommendation:

| Token | Now | Measures | Blast radius |
| --- | --- | --- | --- |
| `--destructive` | L `0 84.2% 60.2%`, D `0 62.8% 30.6%` | **3.76:1 light, 2.00:1 dark** against card | Every destructive button, every error message app-wide |

`--destructive` fails AA as text in both modes. It is why `--danger` was proposed as a separate token rather than reusing it.

**Partly resolved 2026-07-31, and the original recommendation here was wrong.** Measuring the token against *both* jobs it actually performs — it is used ~20 times as text and ~10 times as a button fill — shows light mode can serve both and dark mode cannot:

| Value | As text on card | White text on it (fill) |
|---|---|---|
| Light was `0 84.2% 60.2%` | 3.76 ✗ | 3.59 ✗ |
| **Light now `0 74% 42%`** | **6.41 ✓** | **6.12 ✓** |
| Dark `0 62.8% 30.6%` (unchanged) | 2.00 ✗ | 9.56 ✓ |
| Dark alternative `0 84% 68%` | 6.65 ✓ | 2.87 ✗ |

The light value was changed — a strict improvement to both roles, and it fixed a defect nobody had measured: white text on a destructive button was failing AA. The dark value was **left alone**, because it is correct for a fill and no single value satisfies both.

So `--danger` does **not** fold into `--destructive`; they do different jobs and both are needed. The remaining work is migrating the ~20 `text-destructive` usages to `--danger`, which measures 6.65:1 on the dark card.

## States

- **Loading** — skeletons matching the final geometry: four tiles, three project rows, three customer rows. The header renders immediately (it needs no data), so the page never flashes empty. `role="status"` with an off-screen "Loading your dashboard".
- **Empty** — designed, not deferred. Folder icon, "No projects assigned yet", one sentence explaining that the dashboard fills in once there is a customer and a project to bill against, then **Add your first customer** (primary) and **Open Work Hub** (secondary). Two exits, so the screen is never a wall.
- **Error** — recoverable, `role="alert"`. States the cause ("timed out after 10 seconds") and, critically, that **time entries are safe and nothing was lost** — that is the consultant's actual fear when a billing screen fails. **Retry** primary, **Open Work Hub instead** secondary, so a failed dashboard never blocks the day's work.
- **Success** — not a form; no success state. Data refreshes in place via TanStack Query invalidation.

## Responsive

| Width | Behaviour |
| --- | --- |
| ≥ 62rem container | 7/5 split; tiles in one row of four |
| < 62rem container | Single column; Customers moves below Projects |
| Tiles | `repeat(auto-fit, minmax(min(15rem, 100%), 1fr))` — 4 → 2 → 1 with no breakpoints |
| Project row | Title wraps (`text-wrap: pretty`); the **Open** button never wraps and stays right-aligned |
| Project meta | Wraps to a second line; counts use `&nbsp;` so "9 to do" never breaks mid-phrase |
| Exceptions row | Action drops below the description; the status dot and label never separate |

Meets FR-005's 1024px floor and continues to degrade sensibly below it. Mobile is out of scope per the spec, but nothing here breaks at 640px.

## Accessibility

- **Heading order** — `h1` (greeting) → `h2` per panel and for the exceptions band. No skips.
- **Status is never colour alone** — every dot is paired with a text label ("1 warning", "Monday.com error", "All healthy"). Satisfies the dataviz status rule and works in forced-colors mode.
- **Contrast** — body/heading text `text-foreground` on `bg-card`: 17.9:1 light, 16.6:1 dark. `text-muted-foreground`: 4.75:1 light, 7.80:1 dark. Status tokens as tabled above, 4.55:1 worst case.
- **Focus** — `:focus-visible` 2px `ring-ring` at 2px offset on every interactive element. Tab order follows DOM: header actions → tile region (non-interactive) → exceptions actions → project rows → customer rows → Add customer.
- **Async** — `aria-live` via `role="status"` on the loading region, `role="alert"` on the error box.
- **Needs a live audit** — the 44px touch-target requirement for tablet (FR-005) on `size="sm"` row buttons; `h-9` is 36px, which is under the 44px guideline. Either the rows use default-size buttons on coarse pointers, or the whole row becomes the hit target. Flagged, not resolved.

## Motion

| Element | Duration | Easing | Reduced-motion |
| --- | --- | --- | --- |
| Project bars grow from 0 | 450ms | `cubic-bezier(.2,.7,.3,1)` | Not rendered; bars appear at final width |
| Skeleton pulse | 1.6s loop | `ease-in-out` | Static |
| Row hover tint | 150ms | `ease` | Instant |

Everything is inside `@media (prefers-reduced-motion: no-preference)`, with a global `reduce` block killing all animation and transition. Bars animate once on load only — never on refetch, which would make a background poll look like a data change.

## Open questions

1. **Route.** SPEC-017 specifies `/consultant/dashboard`; the app's convention is `/dashboard/*` (`/dashboard/team`, `/dashboard/work-hub`). This design assumes **`/dashboard/consultant`** for consistency. If the spec's path is preferred, it is a one-line change in `App.tsx`.
2. **Hourly rate cardinality.** FR-004 says the rate comes from company settings (one rate); FR-009 says billing uses "company-configured rates and minimum time rules" (possibly per project). The tile shows a single `$145/hr`. If rates are per-project, that line becomes a range or is dropped.
3. **Touch targets** — see Accessibility.

## Outstanding before implement

1. ✅ **`tasks.md` reconciled 2026-07-31.** `T019/020/021/050/057/059/094/123` retired as shipped by SCOPE-020; `T051/052/054/056/058` folded into sibling tasks. 135 tasks → 125 active. Recorded as Gate 1 in `plan.md`.
2. ✅ **Table names corrected 2026-07-31.** `externalconnections`, `credentialauditlogs`, `synchistory`, `connectionhealth`, with all columns concatenated — applied across `spec.md`, `tasks.md`, `data-model.md` and `research.md`. The false "snake_case" assertion in `plan.md`'s Constitution Check, which caused the error, has been corrected.
3. ⛔ **Schema application is manual — still open.** Per SCOPE-117 there is no migration ledger, `drizzle-kit push` is prohibited, and the local `.env` `DATABASE_URL` points at production. `T001`–`T009a` require reviewed SQL applied **by hand**, verified with `npm run db:drift`, and recorded in `specs/117-production-schema-integrity/schema-change-log.md`. Recorded as Gate 2 in `plan.md`.

## Implementation notes

- Data comes from `GET /api/consultant/dashboard` (FR-001, FR-004), `GET /api/consultant/customers` (FR-006) and `GET /api/consultant/dashboard/connection-health` (FR-013) — three queries, not one per widget, to hold the 3-second budget.
- Follow the shipped Work Hub's patterns: `AppShell`, `apiFetchJson`, TanStack Query, `useTranslation` for every string (SCOPE-052 — no bare literals).
- The Work Hub link targets `/dashboard/work-hub`.
- `Skeleton` and `Progress` are **not** exported from `src/client/components/ui/index.ts`; import from the file paths directly.

## TSX

Artifact for the orchestrator. `wxkanban-agent implement 017/<task>` places this in `src/` with the authorship fence — do not paste it in by hand, and do not add fence comments to it.

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, FolderOpen, Plus } from "lucide-react";
import { AppShell } from "../components/layout/AppShell";
import { Button } from "../components/ui/Button";
import { Skeleton } from "../components/ui/Skeleton";
import { apiFetchJson } from "../lib/apiFetch";
import { useTranslation } from "../i18n";

type HealthState = "healthy" | "warning" | "error";

interface DashboardProject {
  id: string;
  name: string;
  customername: string;
  completionpercent: number;
  todocount: number;
  inprogresscount: number;
  donecount: number;
  nextduedate: string | null;
  isoverdue: boolean;
  priority: "high" | "medium" | "low";
}

interface DashboardCustomer {
  id: string;
  name: string;
  connectioncount: number;
  health: HealthState | null;
  healthlabel: string | null;
}

interface DashboardAlert {
  id: string;
  kind: "overduetask" | "connectionerror";
  what: string;
  where: string;
  actionlabel: string;
  actionhref: string;
}

interface DashboardSummary {
  todayseconds: number;
  todayentrycount: number;
  weekseconds: number;
  weekbillableseconds: number;
  periodearnings: number;
  hourlyrate: number;
  unbilledseconds: number;
  periodstart: string;
  periodend: string;
  connectionshealthy: number;
  connectionstotal: number;
  connectionswarning: number;
  connectionserror: number;
  projects: DashboardProject[];
  customers: DashboardCustomer[];
  alerts: DashboardAlert[];
}

function formatHours(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

const HEALTH_TEXT: Record<HealthState, string> = {
  healthy: "text-[hsl(var(--success))]",
  warning: "text-[hsl(var(--warning))]",
  error: "text-[hsl(var(--danger))]",
};

const HEALTH_DOT: Record<HealthState, string> = {
  healthy: "bg-[hsl(var(--success))]",
  warning: "bg-[hsl(var(--warning))]",
  error: "bg-[hsl(var(--danger))]",
};

function StatusLine({ state, label }: { state: HealthState; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${HEALTH_TEXT[state]}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${HEALTH_DOT[state]}`} aria-hidden="true" />
      {label}
    </span>
  );
}

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

function DueBadge({ project, t }: { project: DashboardProject; t: (k: string, v?: object) => string }) {
  if (!project.nextduedate) return null;
  const due = new Date(project.nextduedate).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  const tone = project.isoverdue
    ? "text-[hsl(var(--danger))] border-[hsl(var(--danger)/0.4)] bg-[hsl(var(--danger)/0.1)]"
    : "text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-px text-[11px] font-medium ${tone}`}>
      {project.isoverdue ? t("consultantdash.dueOverdue", { date: due }) : t("consultantdash.due", { date: due })}
    </span>
  );
}

function ProjectRow({
  project,
  t,
}: {
  project: DashboardProject;
  t: (k: string, v?: object) => string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-border px-4 py-3.5 first:border-t-0 hover:bg-accent/50">
      <p className="min-w-0 text-sm font-medium tracking-[-0.005em] [text-wrap:pretty]">
        {project.name}
        <span className="text-xs font-normal text-muted-foreground"> · {project.customername}</span>
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
        <DueBadge project={project} t={t} />
        <span className="inline-flex items-center rounded-full border border-border px-1.5 py-px text-[11px] font-medium">
          {t(`consultantdash.priority.${project.priority}`)}
        </span>
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

function DashboardSkeleton() {
  return (
    <>
      <p className="sr-only" role="status">
        Loading your dashboard
      </p>
      <div className="mb-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(15rem,100%),1fr))]">
        {[0, 1, 2, 3].map((i) => (
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

export default function ConsultantDashboardPage() {
  const { t } = useTranslation();

  const summaryQuery = useQuery({
    queryKey: ["consultant-dashboard"],
    queryFn: () => apiFetchJson<DashboardSummary>("/api/consultant/dashboard"),
  });

  const data = summaryQuery.data;
  const hasProjects = (data?.projects.length ?? 0) > 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-[84rem] px-5 pb-16 pt-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.015em] [text-wrap:balance]">
              {t("consultantdash.greeting")}
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
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/dashboard/consultant/customers">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("consultantdash.addCustomer")}
              </Link>
            </Button>
            <Button asChild>
              <Link to="/dashboard/work-hub">
                {t("consultantdash.openWorkHub")}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
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
              <Button onClick={() => summaryQuery.refetch()}>{t("consultantdash.retry")}</Button>
              <Button asChild variant="outline">
                <Link to="/dashboard/work-hub">{t("consultantdash.openWorkHubInstead")}</Link>
              </Button>
            </div>
          </div>
        ) : null}

        {data && !hasProjects ? (
          <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
            <div className="mx-auto mb-3.5 grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">
              <FolderOpen className="h-5 w-5" />
            </div>
            <h2 className="mb-1.5 text-base font-semibold">{t("consultantdash.emptyTitle")}</h2>
            <p className="mx-auto mb-5 max-w-[34rem] text-[13px] text-muted-foreground [text-wrap:pretty]">
              {t("consultantdash.emptyBody")}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link to="/dashboard/consultant/customers">{t("consultantdash.addFirstCustomer")}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/dashboard/work-hub">{t("consultantdash.openWorkHub")}</Link>
              </Button>
            </div>
          </div>
        ) : null}

        {data && hasProjects ? (
          <>
            <div className="mb-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(15rem,100%),1fr))]">
              <StatTile label={t("consultantdash.today")} value={formatHours(data.todayseconds)}>
                {t("consultantdash.entryCount", { count: data.todayentrycount })}
              </StatTile>
              <StatTile label={t("consultantdash.thisWeek")} value={formatHours(data.weekseconds)}>
                <span className="font-semibold tabular-nums text-foreground">
                  {formatHours(data.weekbillableseconds)}
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
                {t("consultantdash.atRate", { rate: data.hourlyrate })} ·{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatHours(data.unbilledseconds)}
                </span>{" "}
                {t("consultantdash.unbilled")}
              </StatTile>
              <StatTile
                label={t("consultantdash.connections")}
                value={
                  <>
                    {data.connectionshealthy}
                    <span className="text-sm font-medium text-muted-foreground">
                      {" "}
                      {t("consultantdash.ofTotalHealthy", { total: data.connectionstotal })}
                    </span>
                  </>
                }
              >
                <span className="flex flex-wrap gap-3">
                  {data.connectionswarning > 0 ? (
                    <StatusLine
                      state="warning"
                      label={t("consultantdash.warningCount", { count: data.connectionswarning })}
                    />
                  ) : null}
                  {data.connectionserror > 0 ? (
                    <StatusLine
                      state="error"
                      label={t("consultantdash.errorCount", { count: data.connectionserror })}
                    />
                  ) : null}
                  {data.connectionswarning === 0 && data.connectionserror === 0 ? (
                    <StatusLine state="healthy" label={t("consultantdash.allHealthy")} />
                  ) : null}
                </span>
              </StatTile>
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
                  <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--warning))]" aria-hidden="true" />
                  {t("consultantdash.needsAttention", { count: data.alerts.length })}
                </h2>
                {data.alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex flex-wrap items-center gap-2 border-t border-[hsl(var(--warning)/0.2)] py-1.5 text-[13px] first-of-type:border-t-0"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${HEALTH_DOT.error}`}
                      aria-hidden="true"
                    />
                    <span className="font-medium">{alert.what}</span>
                    <span className="text-muted-foreground">{alert.where}</span>
                    <Button asChild variant="ghost" size="sm" className="ml-auto">
                      <Link to={alert.actionhref}>{alert.actionlabel}</Link>
                    </Button>
                  </div>
                ))}
              </section>
            ) : null}

            <div className="[container:dash/inline-size]">
              <div className="grid grid-cols-1 items-start gap-4 [@container_dash_(width>=62rem)]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
                <section aria-labelledby="dash-projects" className="rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <h2 id="dash-projects" className="text-[13px] font-bold">
                      {t("consultantdash.activeProjects")}
                    </h2>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {data.projects.length}
                    </span>
                  </div>
                  {data.projects.map((project) => (
                    <ProjectRow key={project.id} project={project} t={t} />
                  ))}
                </section>

                <section aria-labelledby="dash-customers" className="rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <h2 id="dash-customers" className="text-[13px] font-bold">
                      {t("consultantdash.customers")}
                    </h2>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {data.customers.length}
                    </span>
                  </div>
                  {data.customers.map((customer) => (
                    <div
                      key={customer.id}
                      className="flex items-center gap-2.5 border-t border-border px-4 py-3 first:border-t-0 hover:bg-accent/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium">{customer.name}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {customer.health && customer.healthlabel ? (
                            <>
                              <StatusLine state={customer.health} label={customer.healthlabel} />
                              <span>
                                · {t("consultantdash.connectionCount", { count: customer.connectioncount })}
                              </span>
                            </>
                          ) : (
                            t("consultantdash.noConnections")
                          )}
                        </p>
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/dashboard/consultant/customers/${customer.id}`}>
                          {customer.connectioncount > 0
                            ? t("consultantdash.manage")
                            : t("consultantdash.addConnection")}
                        </Link>
                      </Button>
                    </div>
                  ))}
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
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
```

## Revision history

| Date | Change |
| --- | --- |
| 2026-07-31 | Initial design. Scoped as an overview home after SCOPE-020's Work Hub was found to already ship FR-002/003/009; three status tokens proposed; `Progress` rejected for hardcoded colours; `--destructive` contrast defect recorded. |
| 2026-07-31 | Status tokens promoted to `index.css`. Path (c) implemented and verified: `consultantDashboard.ts`, `ConsultantDashboardPage.tsx`, `/dashboard/consultant`, `appnav.myDay`. Connections tile and Customers rail deferred with the customer layer. Rate corrected to a blended per-period figure after `entryrate` was found to be a per-entry snapshot. |
