import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Info, Plus, Users } from "lucide-react";
import { AppShell } from "../components/layout/AppShell";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Skeleton } from "../components/ui/Skeleton";
import { apiFetchJson } from "../lib/apiFetch";
import { useTranslation } from "../i18n";
import { CustomerFormDialog, type CustomerFormValues } from "../components/consultant/CustomerFormDialog"; // [SCOPE 119 / T016]
import { CustomerTransferDialog } from "../components/consultant/CustomerTransferDialog"; // [SCOPE 119 / T017]
import { ConnectionsPanel } from "../components/consultant/ConnectionsPanel"; // [SCOPE 017 / T111]

// Design of record: specs/119-consultant-customer-records/page.md
//
// Master-detail on ONE route. The tenant-link card is deliberately recessed and
// carries an explicit "grants nothing" disclaimer — a consultant misreading the
// link as shared access is the worst failure this screen can produce.

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
  // The SERVER decides what the caller may do. The client never re-derives
  // authorization from a role string — these three are genuinely different
  // shapes, because a Company Admin may manage the link and transfer ownership
  // on a record they do not own, but may not edit its detail.
  canedit: boolean;
  canmanagelink: boolean;
  cantransfer: boolean;
}

// [SCOPE 119 / T012] BEGIN — labelled read-only field with a designed empty value
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
// [SCOPE 119 / T012] END

// [SCOPE 119 / T012] BEGIN — read-only engagement row (FR-005)
function EngagementRow({ engagement }: { engagement: DetailEngagement }) {
  const { t } = useTranslation();
  const isEnded = engagement.endedat !== null;
  const isActive = !isEnded && engagement.state === "active";
  const label = isEnded ? "ended" : engagement.state;
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
        {t(`customers.engagementState.${label}`)}
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
// [SCOPE 119 / T012] END

// [SCOPE 119 / T012] BEGIN — loading skeleton matching the final split geometry
function CustomersSkeleton() {
  const { t } = useTranslation();
  return (
    <>
      <p className="sr-only" role="status">
        {t("customers.loading")}
      </p>
      <div className="grid grid-cols-1 gap-4 [container:cust/inline-size] [@container_cust_(width>=58rem)]:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
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
  );
}
// [SCOPE 119 / T012] END

// [SCOPE 119 / T012] BEGIN — Customers — master-detail on one route (FR-001..FR-007)
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

  const rows: CustomerListRow[] = listQuery.data?.customers ?? [];
  // Default to the first row so a wide screen never shows an empty right pane.
  const activeId = selectedId ?? rows[0]?.id ?? null;

  const detailQuery = useQuery({
    queryKey: ["consultant-customer", activeId],
    queryFn: () => apiFetchJson<DetailResponse>(`/api/consultant/customers/${activeId}`),
    enabled: Boolean(activeId),
  });

  const detail = detailQuery.data;

  // [SCOPE 119 / T016,T017] Dialog state and the row actions the design draws.
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<CustomerFormValues | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const refreshAll = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ["consultant-customers"] });
    await queryClient.invalidateQueries({ queryKey: ["consultant-customer"] });
  };

  // archive / restore / unlink are all POSTs with no body — one mutation, three paths.
  const rowAction = useMutation({
    mutationFn: (action: "archive" | "restore" | "unlink") =>
      apiFetchJson(`/api/consultant/customers/${activeId}/${action}`, { method: "POST" }),
    onSuccess: refreshAll,
  });

  const openEdit = (): void => {
    if (!detail) return;
    setFormInitial({
      id: detail.customer.id,
      name: detail.customer.name,
      company: detail.customer.company ?? "",
      email: detail.customer.email ?? "",
      phone: detail.customer.phone ?? "",
      billingaddress: detail.customer.billingaddress ?? "",
      taxid: detail.customer.taxid ?? "",
    });
    setFormOpen(true);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-[84rem] px-5 pb-12 pt-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.015em]">{t("customers.title")}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("customers.subtitle")}</p>
          </div>
          {!listQuery.isError ? (
            <Button
              onClick={() => {
                setFormInitial(null);
                setFormOpen(true);
              }}
            >
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

        {listQuery.isLoading ? <CustomersSkeleton /> : null}

        {!listQuery.isLoading && !listQuery.isError && rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-6 py-14 text-center">
            <div className="mx-auto mb-3.5 grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">
              <Users className="h-5 w-5" />
            </div>
            <h2 className="mb-1.5 text-base font-semibold">{t("customers.emptyTitle")}</h2>
            <p className="mx-auto mb-5 max-w-[32rem] text-[13px] text-muted-foreground [text-wrap:pretty]">
              {t("customers.emptyBody")}
            </p>
            <Button onClick={() => { setFormInitial(null); setFormOpen(true); }}>{t("customers.addFirst")}</Button>
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setSearch(e.target.value)
                    }
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
                      row.id === activeId
                        ? "bg-accent shadow-[inset_3px_0_0_hsl(var(--primary))]"
                        : ""
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
                          <Button variant="outline" size="sm" className="ml-auto" onClick={() => rowAction.mutate("restore")}>
                            {t("customers.restore")}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="border-b border-border px-4 py-4">
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
                              <Button variant="outline" size="sm" onClick={openEdit}>
                                {t("customers.edit")}
                              </Button>
                              {!detail.customer.archivedat ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="border-[hsl(var(--danger)/0.4)] text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.1)]"
                                  onClick={() => rowAction.mutate("archive")}
                                >
                                  {t("customers.archive")}
                                </Button>
                              ) : null}
                            </>
                          ) : null}
                          {detail.cantransfer ? (
                            <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)}>
                              {t("customers.transferOwner")}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="px-4 py-4">
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
                      <div className="border-t border-border px-4 py-4">
                        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                          {t("customers.wxkanbanAccount")}
                        </h3>
                        {/* Recessed, neutral badge, explicit disclaimer — three
                            deliberate moves so this never reads as shared access. */}
                        <div className="rounded-md border border-border bg-muted/45 px-3.5 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">
                              {t("customers.linkedAccount")}
                            </span>
                            {detail.canmanagelink ? (
                              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => rowAction.mutate("unlink")}>
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

                    {/* [SCOPE 017 / T111] SPEC-017 connection manager mounts here, as page.md said it would. */}
                    <ConnectionsPanel customerId={detail.customer.id} />

                    <div className="border-t border-border px-4 py-4">
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

      {/* [SCOPE 119 / T016] Create and edit. Select the new record on create so the
          consultant lands on what they just made rather than back on the list. */}
      <CustomerFormDialog
        open={formOpen}
        initial={formInitial}
        onClose={(savedId?: string) => {
          setFormOpen(false);
          setFormInitial(null);
          if (savedId) setSelectedId(savedId);
        }}
      />

      {/* [SCOPE 119 / T017] Ownership transfer — the way out of ON DELETE RESTRICT. */}
      <CustomerTransferDialog
        open={transferOpen}
        customerId={activeId}
        customerName={detail?.customer.name ?? ""}
        currentOwnerId={null}
        onClose={() => setTransferOpen(false)}
      />
    </AppShell>
  );
}
// [SCOPE 119 / T012] END
