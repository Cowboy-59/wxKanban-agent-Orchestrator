// [SCOPE 047 / T004] Company-Wide Stack Profiles — ADMIN screen.
// Lists the up-to-3 company profiles (web/desktop/mobile) and lets an ADMIN
// promote a project's captured stack/style, replace, or clear each one.
// Reads/writes /api/admin/stack-profiles (ADMIN-gated + tenant-isolated server-side).
import { useState, useEffect, useCallback } from "react";
import { AppShell } from "../../components/layout/AppShell";
import { useAuth } from "../../context/AuthContext";
import { APP_TYPES, APP_TYPE_LABELS, type AppType } from "~/shared/stack-defaults";

interface StackProfile {
  id: string;
  apptype: string;
  content: string;
  updatedat: string;
}

interface PromotableProject {
  projectId: string;
  projectName: string;
  apptype: AppType | null;
}

// [SCOPE 057 / T004] BEGIN — Company-Wide Stack Profiles admin screen
export default function StackProfilesPage() {
  const { user } = useAuth();
  const isAdmin = user?.usertype === "ADMIN";

  const [profiles, setProfiles] = useState<StackProfile[]>([]);
  const [promotable, setPromotable] = useState<PromotableProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const [pRes, prRes] = await Promise.all([
        fetch("/api/admin/stack-profiles", { credentials: "include" }),
        fetch("/api/admin/stack-profiles/promotable", { credentials: "include" }),
      ]);
      if (!pRes.ok) {
        const d = (await pRes.json()) as { error?: string };
        throw new Error(d.error ?? "Failed to load stack profiles");
      }
      const pData = (await pRes.json()) as { profiles: StackProfile[] };
      setProfiles(pData.profiles);
      if (prRes.ok) {
        const prData = (await prRes.json()) as { projects: PromotableProject[] };
        setPromotable(prData.projects.filter((p) => p.apptype !== null));
      }
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Failed to load stack profiles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;
    setActionError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/stack-profiles/promote", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProject }),
      });
      const d = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Promote failed");
      setSelectedProject("");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Promote failed");
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async (apptype: string) => {
    setActionError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/stack-profiles/${encodeURIComponent(apptype)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const d = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Clear failed");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Clear failed");
    } finally {
      setBusy(false);
    }
  };

  const profileFor = (t: AppType) => profiles.find((p) => p.apptype === t);

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl p-6">
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
            This page requires Administrator access.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-8 p-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Company Stack Profiles
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Set a company-wide default stack &amp; style per application type. New projects
            of that type inherit it unless they capture their own. One profile per type
            (Web / Desktop / Mobile). A project that has its own stack always wins.
          </p>
        </div>

        {/* Promote */}
        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">
            Promote a project&apos;s stack to company-wide
          </h2>
          <form onSubmit={handlePromote} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Project (must have a captured Stack &amp; Style)
              </label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              >
                <option value="">Select a project…</option>
                {promotable.map((p) => (
                  <option key={p.projectId} value={p.projectId}>
                    {p.projectName} — {p.apptype ? APP_TYPE_LABELS[p.apptype] : "?"}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={busy || !selectedProject}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              {busy ? "Promoting…" : "Promote"}
            </button>
          </form>
          {promotable.length === 0 && !loading && (
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              No projects with a captured Stack &amp; Style yet. Run <code>/buildstack</code> on a
              project first.
            </p>
          )}
          {actionError && (
            <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {actionError}
            </p>
          )}
        </section>

        {/* Profiles per app type */}
        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-100">
            Profiles
          </h2>
          {loading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
          ) : pageError ? (
            <div className="flex items-center justify-between rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
              <span>{pageError}</span>
              <button type="button" onClick={() => void load()} className="ml-4 underline hover:no-underline">
                Retry
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {APP_TYPES.map((t: AppType) => {
                const profile = profileFor(t);
                return (
                  <div
                    key={t}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {APP_TYPE_LABELS[t]}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {profile
                          ? `Set — updated ${new Date(profile.updatedat).toLocaleDateString()}`
                          : "Not set"}
                      </p>
                    </div>
                    {profile ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleClear(t)}
                        className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        Clear
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        Promote a {APP_TYPE_LABELS[t]} project above
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
// [SCOPE 057 / T004] END
