// [SCOPE 063 / T010] BEGIN — per-project Bug Reports tab (install + customer triage)
// Project-scoped clone of the SysAdmin Feedback triage surface: list + detail,
// status transitions, internal notes, an AI-suggested-fix panel, and "create
// task". The empty state hosts the one-click Install action, which seeds the
// bug-trapping scope into this project and reveals the ingest endpoint + a
// one-time token. Visible to any project member; uses the Bearer auth pattern.
import { useCallback, useEffect, useState } from "react";
import { Loader2, Bug, Sparkles, ClipboardCopy, RefreshCw } from "lucide-react";

function authHeaders(json = false): Record<string, string> {
  const token = localStorage.getItem("wxkanban_token");
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const STATUSES = ["new", "triaged", "needsinfo", "inprogress", "resolved", "declined"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_STYLE: Record<string, string> = {
  new: "bg-blue-500/15 text-blue-500",
  triaged: "bg-indigo-500/15 text-indigo-500",
  needsinfo: "bg-amber-500/15 text-amber-600",
  inprogress: "bg-purple-500/15 text-purple-500",
  resolved: "bg-emerald-500/15 text-emerald-600",
  declined: "bg-rose-500/15 text-rose-500",
};

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  triaged: "Triaged",
  needsinfo: "Needs info",
  inprogress: "In progress",
  resolved: "Resolved",
  declined: "Declined",
};

// [SCOPE 063 fix] Status filter chips. `filter` is the ?status= value sent to the
// API: null = default (hides resolved), 'all' = everything, else the exact status.
type StatusCounts = Record<string, number>;
const FILTER_CHIPS: Array<{ key: string; label: string; filter: string | null }> = [
  { key: "active", label: "Active", filter: null },
  ...STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s], filter: s as string })),
  { key: "all", label: "All", filter: "all" },
];

interface ReportRow {
  id: string;
  type: string;
  title: string;
  severity: string | null;
  status: string;
  source: string;
  occurrencecount: number;
  lastoccurredat: string | null;
  createdat: string;
  suggestedsolution: string | null;
  suggestedat: string | null;
  linkedtaskid: string | null;
}

interface ReportDetail extends ReportRow {
  details: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  internalnotes: string | null;
  suggestedsolutionrationale: string | null;
  declinereason: string | null;
}

interface InstallResult {
  alreadyInstalled: boolean;
  specnumber: string;
  ingestEndpoint: string;
  ingestToken: string | null;
}

export default function BugReportsTabView({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName?: string;
}) {
  const [items, setItems] = useState<ReportRow[]>([]);
  const [counts, setCounts] = useState<StatusCounts>({});
  // [SCOPE 063 fix] null = "Active" (hides resolved); 'all' = everything; else a status.
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [install, setInstall] = useState<InstallResult | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const res = await fetch(`/api/projects/${projectId}/bug-reports${qs}`, {
        credentials: "include",
        headers: authHeaders(),
      });
      const data = (await res.json()) as { items?: ReportRow[]; counts?: StatusCounts; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load bug reports");
      setItems(data.items ?? []);
      if (data.counts) setCounts(data.counts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openReport(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/bug-reports/${id}`, {
        credentials: "include",
        headers: authHeaders(),
      });
      const data = (await res.json()) as { report?: ReportDetail; error?: string };
      if (!res.ok || !data.report) throw new Error(data.error ?? "Failed to load report");
      setSelected(data.report);
      setNoteDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
    }
  }

  async function installTrapping() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/bug-trapping/install`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(true),
      });
      const data = (await res.json()) as InstallResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Install failed");
      setInstall(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Install failed");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: Status) {
    if (!selected) return;
    let declineReason: string | undefined;
    if (status === "declined") {
      declineReason = window.prompt("Reason for declining?") ?? undefined;
      if (!declineReason) return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/bug-reports/${selected.id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: authHeaders(true),
        body: JSON.stringify({ status, declineReason }),
      });
      const data = (await res.json()) as { report?: ReportDetail; error?: string };
      if (!res.ok || !data.report) throw new Error(data.error ?? "Failed to set status");
      setSelected(data.report);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set status");
    } finally {
      setBusy(false);
    }
  }

  async function suggest(force = false) {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/bug-reports/${selected.id}/suggest${force ? "?force=true" : ""}`,
        { method: "POST", credentials: "include", headers: authHeaders(true) },
      );
      const data = (await res.json()) as { report?: ReportDetail; suggested?: boolean; throttled?: boolean };
      if (data.report) setSelected(data.report);
      if (data.suggested === false && !data.throttled) {
        setError("The AI suggestion service was unavailable — try again shortly.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suggestion failed");
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!selected || !noteDraft.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/bug-reports/${selected.id}/note`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(true),
        body: JSON.stringify({ note: noteDraft.trim() }),
      });
      const data = (await res.json()) as { report?: ReportDetail; error?: string };
      if (!res.ok || !data.report) throw new Error(data.error ?? "Failed to add note");
      setSelected(data.report);
      setNoteDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add note");
    } finally {
      setBusy(false);
    }
  }

  async function createTask() {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/bug-reports/${selected.id}/create-task`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(true),
      });
      const data = (await res.json()) as { taskId?: string; created?: boolean; error?: string };
      if (!res.ok || !data.taskId) throw new Error(data.error ?? "Failed to create task");
      await openReport(selected.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create task");
    } finally {
      setBusy(false);
    }
  }

  if (loading && items.length === 0 && Object.keys(counts).length === 0) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading bug reports…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
          <Bug className="h-4 w-4" /> Bug Reports
        </h3>
        <button
          type="button"
          onClick={installTrapping}
          disabled={busy}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Install / get endpoint
        </button>
      </div>

      {/* [SCOPE 063 fix] Status filter chips — each a link with a live count.
          "Active" (default) hides resolved; click a status to see just those. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTER_CHIPS.map((chip) => {
          const active = statusFilter === chip.filter;
          const n = chip.key === "active" ? counts.active : chip.key === "all" ? counts.total : counts[chip.key];
          const tone = chip.filter && chip.filter !== "all" ? STATUS_STYLE[chip.filter] : "bg-gray-200/70 text-gray-700 dark:bg-gray-700 dark:text-gray-200";
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setStatusFilter(chip.filter)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                active ? `${tone} ring-1 ring-current` : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {chip.label}
              {typeof n === "number" && <span className="ml-1 opacity-70">{n}</span>}
            </button>
          );
        })}
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
      </div>

      {error && <p className="text-sm text-rose-500">{error}</p>}

      {install && <InstallPanel install={install} onDismiss={() => setInstall(null)} />}

      {items.length === 0 && (counts.total ?? 0) > 0 ? (
        // [SCOPE 063 fix] Reports exist, just none in this filter.
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-6 text-sm text-gray-500">
          No reports with this status. Pick another above{" "}
          <button type="button" onClick={() => setStatusFilter(null)} className="underline hover:text-gray-700 dark:hover:text-gray-300">
            (back to Active)
          </button>
          .
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-6 text-sm text-gray-500">
          <p className="font-medium text-gray-700 dark:text-gray-300">No bug reports yet.</p>
          <p className="mt-1">
            Click <span className="font-medium">Install / get endpoint</span> to seed the bug-trapping
            scope into {projectName ?? "this project"} and reveal the ingest endpoint + token. Once your
            app is reporting errors, they appear here grouped and de-duplicated, ready to triage.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-1.5 lg:col-span-1 max-h-[65vh] overflow-y-auto">
            {items.map((it) => (
              <button
                key={it.id}
                onClick={() => openReport(it.id)}
                className={`w-full rounded-md border p-2 text-left text-xs transition-colors ${
                  selected?.id === it.id
                    ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/30"
                    : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-gray-800 dark:text-gray-200">{it.title}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${STATUS_STYLE[it.status] ?? ""}`}>
                    {it.status}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-500">
                  {it.severity && <span>{it.severity}</span>}
                  <span>×{it.occurrencecount}</span>
                  {it.suggestedat && <Sparkles className="h-3 w-3 text-amber-500" />}
                  {it.linkedtaskid && <span className="text-emerald-600">task ✓</span>}
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2">
            {!selected ? (
              <p className="p-4 text-sm text-gray-500">Select a report to triage.</p>
            ) : (
              <div className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">{selected.title}</h4>
                  <p className="mt-1 text-xs text-gray-500">
                    {selected.severity ?? "?"} · ×{selected.occurrencecount} · {selected.source}
                  </p>
                </div>

                {/* Status transitions */}
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      disabled={busy || selected.status === s}
                      onClick={() => setStatus(s)}
                      className={`rounded-full px-2 py-0.5 text-[11px] disabled:opacity-50 ${
                        selected.status === s ? STATUS_STYLE[s] : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {/* Error detail */}
                {selected.details && (
                  <pre className="max-h-40 overflow-auto rounded bg-gray-50 dark:bg-gray-900 p-2 text-[11px] text-gray-700 dark:text-gray-300">
                    {String((selected.details as Record<string, unknown>).message ?? "")}
                    {"\n"}
                    {String((selected.details as Record<string, unknown>).stack ?? "")}
                  </pre>
                )}

                {/* AI suggestion */}
                <div className="rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-900/10 p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                      <Sparkles className="h-3.5 w-3.5" /> AI-suggested fix
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        disabled={busy}
                        onClick={() => suggest(false)}
                        className="rounded bg-amber-600 px-2 py-1 text-[11px] text-white hover:bg-amber-500 disabled:opacity-50"
                      >
                        {selected.suggestedsolution ? "Refresh" : "Suggest fix"}
                      </button>
                      {selected.suggestedsolution && (
                        <button
                          disabled={busy}
                          onClick={() => suggest(true)}
                          title="Force a fresh suggestion"
                          className="rounded border border-amber-400 px-2 py-1 text-[11px] text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {selected.suggestedsolution ? (
                    <div className="mt-2 space-y-1">
                      <p className="whitespace-pre-wrap text-xs text-gray-800 dark:text-gray-200">{selected.suggestedsolution}</p>
                      {selected.suggestedsolutionrationale && (
                        <p className="text-[11px] italic text-gray-500">{selected.suggestedsolutionrationale}</p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-gray-500">No suggestion yet.</p>
                  )}
                  <div className="mt-2">
                    {selected.linkedtaskid ? (
                      <span className="text-[11px] text-emerald-600">✓ Task created from this report</span>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={createTask}
                        className="rounded bg-indigo-600 px-2 py-1 text-[11px] text-white hover:bg-indigo-500 disabled:opacity-50"
                      >
                        Create task from this report
                      </button>
                    )}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Internal notes</label>
                  {selected.internalnotes && (
                    <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-gray-50 dark:bg-gray-900 p-2 text-[11px] text-gray-600 dark:text-gray-400">
                      {selected.internalnotes}
                    </pre>
                  )}
                  <div className="mt-1 flex gap-1.5">
                    <input
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Add a note…"
                      className="flex-1 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs"
                    />
                    <button
                      disabled={busy || !noteDraft.trim()}
                      onClick={addNote}
                      className="rounded-md bg-gray-700 px-2 py-1 text-xs text-white hover:bg-gray-600 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InstallPanel({ install, onDismiss }: { install: InstallResult; onDismiss: () => void }) {
  const copy = (v: string) => void navigator.clipboard?.writeText(v);
  return (
    <div className="rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-900/10 p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-indigo-700 dark:text-indigo-300">
          {install.alreadyInstalled ? "Bug-trapping already installed" : "Bug-trapping installed"} (scope {install.specnumber})
        </span>
        <button onClick={onDismiss} className="text-xs text-gray-500 hover:text-gray-700">dismiss</button>
      </div>
      <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
        Point your app's error capture at this endpoint, using the token below as <code>WXKANBAN_ERROR_INGEST_TOKEN</code>.
      </p>
      <FieldRow label="Ingest endpoint" value={install.ingestEndpoint} onCopy={copy} />
      {install.ingestToken ? (
        <>
          <FieldRow label="Ingest token (shown once)" value={install.ingestToken} onCopy={copy} mono />
          <p className="mt-1 text-[11px] text-rose-500">Copy this token now — it cannot be shown again.</p>
        </>
      ) : (
        <p className="mt-2 text-[11px] text-gray-500">
          An ingest token already exists for this project — reuse the one in your kit's <code>.env</code>, or revoke &amp; re-issue from settings.
        </p>
      )}
    </div>
  );
}

function FieldRow({ label, value, onCopy, mono }: { label: string; value: string; onCopy: (v: string) => void; mono?: boolean }) {
  return (
    <div className="mt-2">
      <span className="text-[11px] font-medium text-gray-500">{label}</span>
      <div className="mt-0.5 flex items-center gap-1.5">
        <code className={`flex-1 truncate rounded bg-white dark:bg-gray-900 px-2 py-1 text-[11px] ${mono ? "font-mono" : ""}`}>{value}</code>
        <button onClick={() => onCopy(value)} className="rounded p-1 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700" title="Copy">
          <ClipboardCopy className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
// [SCOPE 063 / T010] END
