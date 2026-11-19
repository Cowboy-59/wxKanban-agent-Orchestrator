import { useState, useEffect, useCallback } from "react";
import { AppShell } from "../../components/layout/AppShell";
import SettingRow from "../../components/admin/SettingRow";
import BillingSubscriptionPanel from "../../components/billing/BillingSubscriptionPanel";
import CompanyInfoSection from "../../components/admin/CompanyInfoSection";
import { TimeBillingSettings } from "../../components/timeBilling/TimeBillingSettings"; // [SCOPE 005 / T018]
import { useAuth } from "../../context/AuthContext";
import type { Setting, SettingType } from "~/shared/types/settings";

const SETTING_TYPES: SettingType[] = ["boolean", "default", "report_header", "image"];

const EMPTY_FORM = {
  name: "",
  type: "default" as SettingType,
  value: "",
  description: "",
};

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.usertype === "ADMIN";
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [formState, setFormState] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const res = await fetch("/api/settings", { credentials: "include" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to load settings");
      }
      const data = (await res.json()) as { settings: Setting[] };
      setSettings(data.settings);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const body: Setting = {
        name: formState.name,
        type: formState.type,
        value: formState.value,
        ...(formState.description ? { description: formState.description } : {}),
      };
      const res = await fetch("/api/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string; setting?: Setting };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create setting");
      }
      setFormState(EMPTY_FORM);
      await loadSettings();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create setting");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (name: string, value: string, description?: string) => {
    const res = await fetch(`/api/settings/${encodeURIComponent(name)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value, description }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Update failed");
    await loadSettings();
  };

  const handleDelete = async (name: string) => {
    const res = await fetch(`/api/settings/${encodeURIComponent(name)}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Delete failed");
    await loadSettings();
  };

  const valueInput = () => {
    if (formState.type === "boolean") {
      return (
        <select
          value={formState.value}
          onChange={(e) => setFormState((s) => ({ ...s, value: e.target.value }))}
          required
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        >
          <option value="">Select…</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }
    if (formState.type === "report_header") {
      return (
        <textarea
          value={formState.value}
          onChange={(e) => setFormState((s) => ({ ...s, value: e.target.value }))}
          required
          rows={3}
          placeholder="Report header text"
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        />
      );
    }
    if (formState.type === "image") {
      return (
        <input
          type="url"
          value={formState.value}
          onChange={(e) => setFormState((s) => ({ ...s, value: e.target.value }))}
          required
          placeholder="https://… or upload to S3 first"
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        />
      );
    }
    return (
      <input
        type="text"
        value={formState.value}
        onChange={(e) => setFormState((s) => ({ ...s, value: e.target.value }))}
        required
        placeholder="Value"
        className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
      />
    );
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-8 p-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Company Settings
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage application-wide settings for your company. All settings are encrypted at rest.
          </p>
        </div>

        {/* Company information (admin only) */}
        {isAdmin && <CompanyInfoSection />}

        {/* Spec 023 Chunk H.5 — billing / card update (admin only) */}
        {isAdmin && (
          <section>
            <h2 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-100">
              Billing &amp; Subscription
            </h2>
            <BillingSubscriptionPanel />
          </section>
        )}

        {/* [SCOPE 005 / T018] Time & Billing rates and ACH details (admin only; the API also refuses others) */}
        {isAdmin && <TimeBillingSettings />}

        {/* Create form */}
        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">
            Add Setting
          </h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Name <span className="text-slate-400">(snake_case, max 64 chars)</span>
              </label>
              <input
                type="text"
                value={formState.name}
                onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
                required
                pattern="^[a-z0-9_]{1,64}$"
                title="Lowercase letters, numbers, underscores only (1-64 chars)"
                placeholder="e.g. maintenance_mode"
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Type
              </label>
              <select
                value={formState.type}
                onChange={(e) =>
                  setFormState((s) => ({
                    ...s,
                    type: e.target.value as SettingType,
                    value: "",
                  }))
                }
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              >
                {SETTING_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Value
              </label>
              {valueInput()}
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Description <span className="text-slate-400">(optional)</span>
              </label>
              <input
                type="text"
                value={formState.description}
                onChange={(e) => setFormState((s) => ({ ...s, description: e.target.value }))}
                maxLength={255}
                placeholder="Human-readable label"
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              />
            </div>

            {formError && (
              <div className="sm:col-span-2">
                <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  {formError}
                </p>
              </div>
            )}

            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
              >
                {submitting ? "Adding…" : "Add Setting"}
              </button>
            </div>
          </form>
        </section>

        {/* Settings list */}
        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-100">
            Current Settings{" "}
            <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
              ({settings.length})
            </span>
          </h2>

          {loading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
          ) : pageError ? (
            <div className="flex items-center justify-between rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
              <span>{pageError}</span>
              <button
                type="button"
                onClick={() => void loadSettings()}
                className="ml-4 underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          ) : settings.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">
              No settings yet. Add one above.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {settings.map((s) => (
                <SettingRow
                  key={s.name}
                  setting={s}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
