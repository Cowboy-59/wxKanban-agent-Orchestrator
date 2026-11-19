// Company Theme Profiles — ADMIN screen (clone of StackProfilesPage). Lists the
// up-to-3 company default themes (web/desktop/mobile) with a swatch preview and a
// Clear action. Admins SET a company theme from a project's Theme tab via
// "Save as company theme". Reads/writes /api/admin/theme-profiles (ADMIN-gated +
// tenant-isolated server-side).
import { useState, useEffect, useCallback } from "react";
import { AppShell } from "../../components/layout/AppShell";
import { useAuth } from "../../context/AuthContext";
import { APP_TYPES, APP_TYPE_LABELS, type AppType } from "../../../shared/stack-defaults";
import { hslTripletToHex, type ProjectTheme } from "../../../shared/theme-tokens";

interface ThemeProfile {
  id: string;
  apptype: string;
  theme: ProjectTheme;
  updatedat: string;
}

// [SCOPE 062 / T014] BEGIN — Admin `ThemeProfilesPage` (clone `StackProfilesPage`)
export default function ThemeProfilesPage() {
  const { user } = useAuth();
  const isAdmin = user?.usertype === "ADMIN";

  const [profiles, setProfiles] = useState<ThemeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const res = await fetch("/api/admin/theme-profiles", { credentials: "include" });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "Failed to load theme profiles");
      }
      const data = (await res.json()) as { profiles: ThemeProfile[] };
      setProfiles(data.profiles);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Failed to load theme profiles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleClear = async (apptype: string) => {
    setActionError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/theme-profiles/${encodeURIComponent(apptype)}`, {
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Company Theme Profiles</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Set a company-wide default theme per application type. New projects of that type
            inherit it unless they set their own. One profile per type (Web / Desktop / Mobile);
            a project that has its own theme always wins. To set one, open a project&apos;s
            <span className="font-medium"> Theme</span> tab and choose
            <span className="font-medium"> Save as company theme</span>.
          </p>
        </div>

        {actionError && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
            {actionError}
          </p>
        )}

        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-100">Profiles</h2>
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
                    <div className="flex items-center gap-3">
                      {profile && (
                        <div className="flex gap-1">
                          {(["primary", "secondary", "accent", "background"] as const).map((tk) => (
                            <span
                              key={tk}
                              className="h-5 w-5 rounded-full border border-slate-300 dark:border-slate-600"
                              style={{ backgroundColor: hslTripletToHex(profile.theme.light[tk]) }}
                            />
                          ))}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          {APP_TYPE_LABELS[t]}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {profile
                            ? `Set — updated ${new Date(profile.updatedat).toLocaleDateString()}`
                            : "Not set (projects fall back to the wxKanban default)"}
                        </p>
                      </div>
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
                        Save a {APP_TYPE_LABELS[t]} theme from a project
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
// [SCOPE 062 / T014] END
