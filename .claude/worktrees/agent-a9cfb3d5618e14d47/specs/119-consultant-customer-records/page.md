# Customers — design

**Scope**: SCOPE-119 — a consultant's own record of a client, including clients who are not wxKanban tenants.
**Specs**: SPEC-119 (FR-001 CRUD, FR-002 list, FR-003 archive, FR-004 tenant link, FR-005 engagement visibility, FR-006 projects, FR-007 access control, FR-011 transfer)
**Route**: `/dashboard/consultant/customers` · **Audience**: Consultant (owner) and Company Admin (read-only) · **Status**: `designed — not implemented`
**Theme source**: `src/client/styles/index.css` (app not running; live profile not queried)

> **Designed against the shipped API, not against guesses.** T004–T010 were built before this design
> pass, so every field below maps to a real response shape: the list returns `name, company, email,
> clientcompanyid, archivedat, projectcount`; the detail adds `projects[]`, `engagements[]` and
> `canedit`. Nothing here needs an endpoint that does not exist.

## Purpose

A consultant opens this screen to answer two questions: *who are my clients*, and *what do I know about this one*. It is an address book with billing details attached — deliberately not a CRM. Done is finding a client and their tax ID in a few seconds, or adding a new one without wondering whether doing so emailed anybody.

## Layout

Master-detail on a single route: a customer rail (`minmax(17rem, 22rem)`) beside a detail pane, split by a **container query** at 58rem rather than a media query, so the region responds to its own width and survives being placed in a narrower shell later.

Below 58rem the rail stacks above the detail. Above it, the rail is `position: sticky` at the page top so a long detail pane never strands the list off-screen.

**One route, not two pages.** The record is small — seven fields, a link, a short project list. Making a consultant navigate away and back to compare two clients' billing addresses is a poor trade for a URL. The cost is real and stated under Open questions.

## Hierarchy

1. **The selected customer's name** — 1.125rem, the largest thing on screen.
2. **Contact & billing** — what the consultant actually came for.
3. **The wxKanban account link** — present, explained, deliberately quiet.
4. **Projects** — context, not the point of the screen.

The rail is intentionally recessive: 13px names, 11px subtitles, no bold. It is an index, not competing content. The primary action, *Add customer*, sits in the page header rather than the rail — it creates a record, it does not filter the list.

### The hard problem: making the tenant link unmistakably inert

FR-004 says linking grants nothing. But "Meridian Group Holdings Ltd — linked account", sitting above engagement history, can easily read as *this client can see my data*. A security misreading is the worst failure this screen can produce, so three moves work against it:

- The link sits in a **recessed card** (`bg-muted/45`), not a bordered highlight — visually a note, not a control panel.
- Its badge reads **"linked account"** in neutral muted ink. No green, no lock, no shield. Status colours are reserved for *state*, and a link is not a state.
- One sentence says it outright: *"it grants you no access to their data, and grants them no access to yours."*

Blunt beats elegant when the failure mode is someone believing they shared something. Engagements sit below, read-only, captioned **"Managed in Engagements"** — the SCOPE-037 boundary stated in the interface rather than only in the spec.

## Components

| Region | Component | Variant | Why |
|---|---|---|---|
| Rail, detail pane | `Card` | — | Two peer surfaces; the border is the only division needed |
| Search | `Input` | `type="search"` | Native clear affordance, real search semantics |
| Archived filter | `Button` | `outline`, `aria-pressed` | A two-state toggle, not a dropdown — there is exactly one filter |
| Rail rows | `<button>` + `aria-current` | — | Real buttons, so keyboard and AT get selection semantics rather than styled divs |
| Header actions | `Button` | `outline` (Edit), `outline`+danger token (Archive) | Archive is reversible; a filled red button would promise consequences it does not have |
| Add customer | `Button` | `default` | The one primary action |
| Badges | token-composed | — | No `Badge` component exists in this repo |
| Loading | `Skeleton` | — | Import from `./ui/Skeleton` — not in the barrel |

**No delete anywhere.** FR-003 forbids it and the API has no route for it. Archive is the only destructive-*looking* action and it is styled as an outline, not a fill.

## Tokens

| Surface | Tokens |
|---|---|
| Page | `bg-background` / `text-foreground` |
| Rail, detail, cards | `bg-card`, `border-border` |
| Rail subtitles, field labels, captions | `text-muted-foreground` |
| Selected row | `bg-accent` + a 3px inset `bg-primary` bar |
| Row hover | `bg-accent/50` |
| Tenant-link card | `bg-muted/45`, `border-border` |
| Search input | `border-input`, `bg-background` |
| Engagement active | `--success` |
| Archived banner | `--warning` at 12% on card |
| Archive action | `--danger` |
| Focus ring | `ring-ring`, 2px, 2px offset |

### Tokens added to the theme

**None.** This design introduced no new tokens. It uses `--success`, `--warning` and `--danger`, which were proposed and promoted during the SCOPE-017 pass on 2026-07-31 and are already live in `index.css` at all three sites.

### Existing tokens this design would change

**None applied.** The standing recommendation from SCOPE-017 still holds: `--destructive` measures **3.76:1 light and 2.00:1 dark**, failing AA as text in both modes and failing even the 3:1 non-text floor in dark. That is why Archive uses `--danger` rather than `--destructive`. Fixing `--destructive` repaints every destructive button app-wide and remains the user's call.

## States

- **Loading** — skeletons in both panes matching the final geometry, so the split does not reflow when data lands. `role="status"` with an off-screen "Loading customers".
- **Empty** — designed, and doing real work. It says a customer record *sends no invitation and grants no access*, because that is the misconception most likely to bite on first use. One CTA: *Add your first customer*.
- **Error** — `role="alert"`, states that **nothing was changed and billing details are safe**, then *Retry*. On a screen holding tax IDs, "did I just lose that?" is the actual fear.
- **Archived customer** — a `--warning` banner across the detail pane with a *Restore* action, so an archived record can never be mistaken for a live one.
- **No selection** — on wide screens the first customer is selected by default; there is no empty right pane to explain.

## Responsive

| Width | Behaviour |
|---|---|
| ≥ 58rem container | Rail + detail side by side; rail sticky |
| < 58rem container | Rail stacks above detail; sticky released |
| Rail row | Name truncates with ellipsis — a 52-character client name must never wrap the row to two lines and destroy the list's rhythm |
| Contact & billing | `auto-fit / minmax(14rem, 1fr)` — 2 columns, then 1, no breakpoints |
| Detail header actions | Wrap below the name; never overlap it |
| Engagement row | Date drops below on narrow widths; the state badge never separates from its label |

## Accessibility

- **Heading order** — `h1` Customers → `h2` Customer list (visually hidden) → `h2` selected customer → `h3` per section. No skips.
- **Selection** — rail rows are `<button>` with `aria-current="true"`, and the selected row carries a 3px inset bar *as well as* a tint. Never colour alone.
- **Search** — labelled via `aria-label`; the archived toggle uses `aria-pressed`.
- **Async** — `role="status"` on loading, `role="alert"` on error.
- **Contrast** — `text-foreground` on `bg-card` 17.9:1 light / 16.6:1 dark; `text-muted-foreground` 4.75:1 / 7.80:1; `--success` 5.83:1 / 11.45:1; `--warning` 5.21:1 / 10.83:1; `--danger` 6.41:1 / 6.65:1. All clear AA.
- **Needs a live audit** — rail rows at `.625rem` vertical padding land near 40px tall; below the 44px touch guideline for tablet. Either pad the rows on coarse pointers or accept it as a desktop-first surface.

## Motion

| Element | Duration | Easing | Reduced-motion |
|---|---|---|---|
| Row hover / selection tint | 120ms | `ease` | Instant |
| Skeleton pulse | 1.6s loop | `ease-in-out` | Static |

Nothing else animates. Switching customers is an instant content swap — a transition there would make a fast scan feel sluggish, and there is no spatial relationship worth animating.

## Open questions

1. **No per-customer URL.** Master-detail means `/dashboard/consultant/customers` covers every customer; you cannot link a colleague to one. A `?id=` query parameter would fix it cheaply and is the obvious upgrade if it ever matters.
2. ~~**Can a Company Admin unlink?**~~ **RESOLVED 2026-07-31 — a Company Admin can both link and unlink.** A wrong link is a factual error in the company's records, and the Admin is the person positioned to correct it in either direction. An earlier draft made this asymmetric (unlink only); that was overruled, and rightly — an Admin who can remove a wrong link but not set the right one can only leave the record blank, which is a worse end state than the error.

   The Admin is **not** unconstrained: the engagement check is company-scoped, so an Admin can only link to a company their own company already has an Engagement with — the same bar the owner faces.

   `clientcompanyid` now has **exactly one write path in each direction**, `POST /customers/:id/link` and `/unlink`, both open to owner and Admin and both audit-logged when the actor is not the owner. `PATCH` deliberately **refuses** the field: two authorities over one value, with different permission rules, is how one of them quietly stops enforcing the engagement check.
3. **Rail row height vs the 44px touch target** — see Accessibility.

## Not designed — bounded scope

Two surfaces this scope implies and this design does **not** cover:

- **The create/edit form.** Read mode is drawn; the form is its own pass, including the client-company picker for FR-004 (which may only offer companies the consultant already has an Engagement with).
- **The transfer dialog** behind *Transfer owner* (FR-011), including the bulk offboarding path.

## TSX

Artifact for the orchestrator. `wxkanban-agent implement 119/T012` places this in `src/` with the authorship fence — do not paste it in by hand, and do not add fence comments to it.

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Info, Plus, Users } from "lucide-react";
import { AppShell } from "../components/layout/AppShell";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Skeleton } from "../components/ui/Skeleton";
import { apiFetchJson } from "../lib/apiFetch";
import { useTranslation } from "../i18n";

interface CustomerListRow {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  clientcompanyid: string | null;
  archivedat: string | null;
  projectcount: number;
}

interface CustomerDetail {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  billingaddress: string | null;
  taxid: string | null;
  clientcompanyid: string | null;
  archivedat: string | null;
}

interface DetailProject {
  id: string;
  name: string;
  status: string;
}

interface DetailEngagement {
  id: string;
  state: string;
  createdat: string;
  acceptedat: string | null;
  endedat: string | null;
}

interface DetailResponse {
  customer: CustomerDetail;
  projects: DetailProject[];
  engagements: DetailEngagement[];
  // The server decides what the caller may do; the client never re-derives
  // authorization from a role string. The three permissions are genuinely
  // different shapes — a Company Admin may manage the tenant link and transfer
  // ownership on a record they do not own, but may not edit its detail.
  canedit: boolean;
  canmanagelink: boolean;
  cantransfer: boolean;
}

function Field({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation();
  return (
    <div>
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        {label}
      </span>
      {value ? (
        <span className="whitespace-pre-line text-sm">{value}</span>
      ) : (
        <span className="text-sm italic text-muted-foreground">{t("customers.notRecorded")}</span>
      )}
    </div>
  );
}

function EngagementRow({ engagement }: { engagement: DetailEngagement }) {
  const { t } = useTranslation();
  const isActive = engagement.state === "active";
  const isEnded = engagement.endedat !== null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-border py-1.5 text-xs first-of-type:border-t-0">
      <span
        className={`h-[0.45rem] w-[0.45rem] shrink-0 rounded-full ${
          isActive ? "bg-[hsl(var(--success))]" : "bg-muted-foreground"
        }`}
        aria-hidden="true"
      />
      <span
        className={`inline-flex items-center rounded-full border px-1.5 py-px text-[11px] font-medium ${
          isActive
            ? "border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]"
            : "border-border text-muted-foreground opacity-85"
        }`}
      >
        {t(`customers.engagementState.${isEnded ? "ended" : engagement.state}`)}
      </span>
      <span className="ml-auto tabular-nums text-muted-foreground">
        {new Date(engagement.createdat).toLocaleDateString(undefined, {
          month: "short",
          year: "numeric",
        })}
        {engagement.endedat
          ? ` – ${new Date(engagement.endedat).toLocaleDateString(undefined, {
              month: "short",
              year: "numeric",
            })}`
          : ""}
      </span>
    </div>
  );
}

export default function ConsultantCustomersPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [includearchived, setIncludeArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["consultant-customers", search, includearchived],
    queryFn: () =>
      apiFetchJson<{ customers: CustomerListRow[] }>(
        `/api/consultant/customers?search=${encodeURIComponent(search)}&includearchived=${includearchived}`,
      ),
  });

  const rows = listQuery.data?.customers ?? [];
  const activeId = selectedId ?? rows[0]?.id ?? null;

  const detailQuery = useQuery({
    queryKey: ["consultant-customer", activeId],
    queryFn: () => apiFetchJson<DetailResponse>(`/api/consultant/customers/${activeId}`),
    enabled: Boolean(activeId),
  });

  const detail = detailQuery.data;

  return (
    <AppShell>
      <div className="mx-auto max-w-[84rem] px-5 pb-12 pt-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.015em]">
              {t("customers.title")}
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("customers.subtitle")}</p>
          </div>
          {!listQuery.isError ? (
            <Button>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t("customers.add")}
            </Button>
          ) : null}
        </div>

        {listQuery.isError ? (
          <div
            role="alert"
            className="rounded-lg border border-[hsl(var(--danger)/0.4)] bg-[hsl(var(--danger)/0.1)] p-5 text-center"
          >
            <h2 className="mb-1.5 text-[15px] font-semibold text-[hsl(var(--danger))]">
              {t("customers.errorTitle")}
            </h2>
            <p className="mx-auto mb-4 max-w-[32rem] text-[13px] text-muted-foreground">
              {t("customers.errorBody")}
            </p>
            <Button onClick={() => void listQuery.refetch()}>{t("customers.retry")}</Button>
          </div>
        ) : null}

        {listQuery.isLoading ? (
          <>
            <p className="sr-only" role="status">
              {t("customers.loading")}
            </p>
            <div className="grid gap-4 [container:cust/inline-size] [@container_cust_(width>=58rem)]:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
              <div className="rounded-lg border border-border bg-card p-2.5">
                <Skeleton className="h-8 w-full" />
                {[0, 1, 2].map((i) => (
                  <div key={i} className="px-1 py-2.5">
                    <Skeleton className="h-3.5 w-3/5" />
                    <Skeleton className="mt-1.5 h-2.5 w-2/5" />
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="mt-2 h-3 w-32" />
                <Skeleton className="mt-6 h-16 w-full" />
              </div>
            </div>
          </>
        ) : null}

        {!listQuery.isLoading && !listQuery.isError && rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-6 py-14 text-center">
            <div className="mx-auto mb-3.5 grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">
              <Users className="h-5 w-5" />
            </div>
            <h2 className="mb-1.5 text-base font-semibold">{t("customers.emptyTitle")}</h2>
            <p className="mx-auto mb-5 max-w-[32rem] text-[13px] text-muted-foreground [text-wrap:pretty]">
              {t("customers.emptyBody")}
            </p>
            <Button>{t("customers.addFirst")}</Button>
          </div>
        ) : null}

        {!listQuery.isLoading && !listQuery.isError && rows.length > 0 ? (
          <div className="[container:cust/inline-size]">
            <div className="grid grid-cols-1 items-start gap-4 [@container_cust_(width>=58rem)]:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
              <section
                aria-labelledby="cust-list"
                className="rounded-lg border border-border bg-card [@container_cust_(width>=58rem)]:sticky [@container_cust_(width>=58rem)]:top-[3.25rem]"
              >
                <h2 id="cust-list" className="sr-only">
                  {t("customers.listHeading")}
                </h2>
                <div className="flex gap-2 border-b border-border p-2.5">
                  <Input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("customers.searchPlaceholder")}
                    aria-label={t("customers.searchLabel")}
                    className="h-8 text-[13px]"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    aria-pressed={includearchived}
                    onClick={() => setIncludeArchived((v) => !v)}
                    className={includearchived ? "bg-accent text-accent-foreground" : ""}
                  >
                    {t("customers.archived")}
                  </Button>
                </div>

                {rows.map((row: CustomerListRow) => (
                  <button
                    key={row.id}
                    type="button"
                    aria-current={row.id === activeId ? "true" : undefined}
                    onClick={() => setSelectedId(row.id)}
                    className={`grid w-full grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 border-t border-border px-3 py-2.5 text-left transition-colors first:border-t-0 hover:bg-accent/50 ${
                      row.id === activeId ? "bg-accent shadow-[inset_3px_0_0_hsl(var(--primary))]" : ""
                    }`}
                  >
                    <span className="truncate text-[13px] font-medium">{row.name}</span>
                    <span className="row-span-2 self-center text-[11px] tabular-nums text-muted-foreground">
                      {row.projectcount}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {row.archivedat
                        ? t("customers.archivedOn", {
                            date: new Date(row.archivedat).toLocaleDateString(),
                          })
                        : [row.company, row.clientcompanyid ? t("customers.linked") : null]
                            .filter(Boolean)
                            .join(" · ")}
                    </span>
                  </button>
                ))}
              </section>

              <section aria-labelledby="cust-detail" className="rounded-lg border border-border bg-card">
                {detail ? (
                  <>
                    {detail.customer.archivedat ? (
                      <div className="flex flex-wrap items-center gap-2 border-b border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.12)] px-3.5 py-2 text-[13px]">
                        <span>{t("customers.archivedBanner")}</span>
                        {detail.canedit ? (
                          <Button variant="outline" size="sm" className="ml-auto">
                            {t("customers.restore")}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="border-b border-border px-4.5 py-4">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0">
                          <h2 id="cust-detail" className="text-lg font-semibold tracking-[-0.01em]">
                            {detail.customer.name}
                          </h2>
                          {detail.customer.company ? (
                            <p className="mt-0.5 text-[13px] text-muted-foreground">
                              {detail.customer.company}
                            </p>
                          ) : null}
                        </div>
                        <div className="ml-auto flex flex-wrap gap-1.5">
                          {detail.canedit ? (
                            <>
                              <Button variant="outline" size="sm">
                                {t("customers.edit")}
                              </Button>
                              {!detail.customer.archivedat ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="border-[hsl(var(--danger)/0.4)] text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.1)]"
                                >
                                  {t("customers.archive")}
                                </Button>
                              ) : null}
                            </>
                          ) : null}
                          {detail.cantransfer ? (
                            <Button variant="outline" size="sm">
                              {t("customers.transferOwner")}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="px-4.5 py-4">
                      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                        {t("customers.contactBilling")}
                      </h3>
                      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(14rem,100%),1fr))]">
                        <Field label={t("customers.email")} value={detail.customer.email} />
                        <Field label={t("customers.phone")} value={detail.customer.phone} />
                        <Field label={t("customers.taxid")} value={detail.customer.taxid} />
                        <Field
                          label={t("customers.billingaddress")}
                          value={detail.customer.billingaddress}
                        />
                      </div>
                    </div>

                    {detail.customer.clientcompanyid ? (
                      <div className="border-t border-border px-4.5 py-4">
                        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                          {t("customers.wxkanbanAccount")}
                        </h3>
                        <div className="rounded-md border border-border bg-muted/45 px-3.5 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">
                              {t("customers.linkedAccount")}
                            </span>
                            {detail.canmanagelink ? (
                              <Button variant="ghost" size="sm" className="ml-auto">
                                {t("customers.unlink")}
                              </Button>
                            ) : null}
                          </div>
                          <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                            <span>{t("customers.linkDisclaimer")}</span>
                          </p>
                        </div>

                        <h3 className="mb-3 mt-4 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                          {t("customers.engagements")}
                        </h3>
                        {detail.engagements.length > 0 ? (
                          <>
                            {detail.engagements.map((e: DetailEngagement) => (
                              <EngagementRow key={e.id} engagement={e} />
                            ))}
                            <p className="mt-2.5 text-[11px] text-muted-foreground">
                              {t("customers.engagementsManagedElsewhere")}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {t("customers.noEngagements")}
                          </p>
                        )}
                      </div>
                    ) : null}

                    <div className="border-t border-border px-4.5 py-4">
                      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                        {t("customers.projectsCount", { count: detail.projects.length })}
                      </h3>
                      {detail.projects.length > 0 ? (
                        detail.projects.map((p: DetailProject) => (
                          <div
                            key={p.id}
                            className="flex items-center gap-2 border-t border-border py-1.5 text-[13px] first-of-type:border-t-0"
                          >
                            <Link to={`/projects/${p.id}`} className="font-medium hover:underline">
                              {p.name}
                            </Link>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">{t("customers.noProjects")}</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="p-4">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="mt-6 h-16 w-full" />
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
```

## Revision history

| Date | Change |
|---|---|
| 2026-07-31 | Initial design. Master-detail on one route; tenant link deliberately recessed with an explicit "grants nothing" disclaimer; no delete anywhere; Archive styled with `--danger` outline rather than `--destructive`, which fails AA. No new tokens introduced. Create/edit form and transfer dialog named as separate passes. |
| 2026-07-31 | **Open question 2 resolved — a Company Admin can unlink.** Authorization moved off the client entirely: the detail response returns explicit permission flags, so the UI renders what the server permits rather than re-deriving it from a role string. `POST /customers/:id/unlink` added, audit-logged when the actor is not the owner. |
| 2026-07-31 | **Symmetry restored — an Admin can link as well as unlink.** The asymmetry above was overruled: an Admin able to remove a wrong link but not set the right one can only leave the record blank, which is worse than the error. `POST /customers/:id/link` added with the same company-scoped engagement check the owner faces. `canunlink` → `canmanagelink`. **`PATCH` now refuses `clientcompanyid` entirely** — link/unlink are the single write path in each direction, so the engagement check cannot be bypassed through the general update route. FR-004 and FR-007 amended in both documents; tests S6b–S6e rewritten, S6e guarding the single-path rule. |
