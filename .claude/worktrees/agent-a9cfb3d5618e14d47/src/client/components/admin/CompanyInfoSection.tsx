import { useState, useEffect, useCallback } from "react";

/**
 * Spec 023 Chunk H — company information editor for the admin Settings page.
 * Reads/writes the existing GET/PUT /api/admin/settings contract
 * (name, billingEmail, invoiceBillingEmail, billingAddress, billingPhone, vatNumber).
 * [SCOPE 002 / T074] vatNumber — SPEC-002 Amendment A, FR-012b.
 */

interface CompanyInfo {
  name: string;
  billingEmail: string;
  invoiceBillingEmail: string;
  billingAddress: string;
  billingPhone: string;
  vatNumber: string; // [SCOPE 002 / T074] FR-012b
}

const EMPTY: CompanyInfo = {
  name: "",
  billingEmail: "",
  invoiceBillingEmail: "",
  billingAddress: "",
  billingPhone: "",
  vatNumber: "", // [SCOPE 002 / T074] FR-012b
};

const inputClass =
  "w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100";
const labelClass = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400";

export default function CompanyInfoSection() {
  const [form, setForm] = useState<CompanyInfo>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", { credentials: "include" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to load company information");
      }
      const data = (await res.json()) as Partial<CompanyInfo>;
      setForm({ ...EMPTY, ...data });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load company information");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save company information");
      }
      setMessage("Company information saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save company information");
    } finally {
      setSaving(false);
    }
  };

  const set =
    (key: keyof CompanyInfo) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-1 text-base font-semibold text-slate-800 dark:text-slate-100">
        Company Information
      </h2>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Update your company details and billing contact information.
      </p>

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : (
        <form onSubmit={handleSave} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {error && (
            <div className="sm:col-span-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {error}
            </div>
          )}
          {message && (
            <div className="sm:col-span-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300">
              {message}
            </div>
          )}

          <div className="sm:col-span-2">
            <label className={labelClass}>Company Name</label>
            <input type="text" value={form.name} onChange={set("name")} className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Billing Email</label>
            <input type="email" value={form.billingEmail} onChange={set("billingEmail")} className={inputClass} />
            <p className="mt-1 text-xs text-slate-400">General contact email for the company.</p>
          </div>

          <div>
            <label className={labelClass}>Consultant Invoice Email</label>
            <input
              type="email"
              value={form.invoiceBillingEmail}
              onChange={set("invoiceBillingEmail")}
              placeholder="ap@yourcompany.com"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-400">Where B2B invoices are delivered.</p>
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Billing Address</label>
            <textarea
              value={form.billingAddress}
              onChange={set("billingAddress")}
              rows={2}
              className={`${inputClass} resize-none`}
            />
          </div>

          <div>
            <label className={labelClass}>Billing Phone</label>
            <input type="tel" value={form.billingPhone} onChange={set("billingPhone")} className={inputClass} />
          </div>

          {/* [SCOPE 002 / T074] FR-012b — VAT registration number, as entered */}
          <div>
            <label className={labelClass}>VAT Number</label>
            <input
              type="text"
              value={form.vatNumber}
              onChange={set("vatNumber")}
              maxLength={50}
              placeholder="DE123456789"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-400">Optional. Include the country prefix.</p>
          </div>

          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              {saving ? "Saving…" : "Save Company Info"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
