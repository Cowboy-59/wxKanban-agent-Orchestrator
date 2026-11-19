/**
 * SysAdmin Dashboard - Platform-level administration interface
 *
 * This dashboard provides cross-tenant visibility and control for the
 * platform administrator (SYSADMIN role). All data is live from
 * /api/sysadmin/{metrics,companies,users,health}.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import InfrastructureHealthPanel from "./SysAdmin/InfrastructureHealthPanel"; // [SCOPE 078 / T008]
import {
  LayoutDashboard,
  Building2,
  Users,
  Activity,
  Settings,
  Shield,
  TrendingUp,
  AlertCircle,
  Search,
  CheckCircle2,
  XCircle,
  PauseCircle,
  ArrowRight,
  CreditCard,
  Database,
  Server,
  Mail,
  MessageSquare,
  FileText,
  Eye,
  Pencil,
  Trash2,
  Megaphone,
  Gift, // [SCOPE 023 / T110] Invitations tab
  AlertTriangle,
  Ban, // [SCOPE 131 / T017] cancel subscription
  Undo2, // [SCOPE 131 / T017] undo a pending cancellation
  X
} from "lucide-react";
// [SCOPE 131 / T017] The same typed-confirmation dialog the customer sees, with
// operator-voiced copy. Shared rather than forked so the two confirmation gates
// cannot drift apart.
import CancelSubscriptionDialog from "../components/billing/CancelSubscriptionDialog";
import type { ClassValue } from "clsx";

// Utility for tailwind class merging
function cn(...inputs: ClassValue[]) {
  return inputs.filter(Boolean).join(" ");
}

// Types — shapes returned by /api/sysadmin/*
interface Company {
  id: string;
  name: string;
  contactemail: string;
  subscriptionstatus: string;
  activeflag: boolean;
  billingplan: string;
  maxusers: number;
  userCount: number;
  mrr: number;
  // [SCOPE 131 / T017] Lifecycle stamps. GET /api/sysadmin/companies selects the
  // whole companies row, so these already arrive — they were simply undeclared.
  // `cancelrequestedat` set with `cancelledat` still null is the pending window,
  // the only state in which a cancellation can still be reversed.
  cancelrequestedat?: string | null;
  cancelledat?: string | null;
  pausedat?: string | null;
}

interface User {
  id: string;
  emailaddr: string;
  fullname: string | null;
  companyName: string;
  usertype: string;
  active: boolean;
  lastloginedat: string | null;
}

interface PlatformMetrics {
  totalCompanies: number;
  activeCompanies: number;
  trialCompanies: number;
  suspendedCompanies: number;
  totalUsers: number;
  activeUsers: number;
  mrr: number;
  churnRate: number;
  timestamp: string;
}

interface HealthStatus {
  database: string;
  api: string;
  email: string;
  payments: string;
  queue: string;
  timestamp: string;
}

// Derive the display status for a company from its DB flags.
function companyStatus(
  company: Company,
): "ACTIVE" | "SUSPENDED" | "TRIAL" | "CANCELLED" | "PENDING" | "PENDING_INACTIVE" {
  if (!company.activeflag) return "SUSPENDED";
  const s = (company.subscriptionstatus || "").toUpperCase();
  if (s === "TRIAL") return "TRIAL";
  if (s === "PENDING_INACTIVE") return "PENDING_INACTIVE"; // [SCOPE 067] payment failed (grace)
  if (s === "PENDING") return "PENDING";
  if (s === "CANCELLED" || s === "CANCELED") return "CANCELLED";
  return "ACTIVE";
}

// Map a raw /health value to the HealthIndicator status vocabulary.
function healthState(value: string | undefined): "healthy" | "warning" | "critical" {
  if (value === "healthy" || value === "warning" || value === "critical") return value;
  return "warning";
}

// Components
function StatCard({
  label,
  value,
  subtext,
  icon,
  color = "indigo"
}: {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ReactNode;
  color?: "indigo" | "emerald" | "amber" | "rose" | "blue";
}) {
  const colorClasses = {
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            {label}
          </p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            {value}
          </p>
          {subtext && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {subtext}
            </p>
          )}
        </div>
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", colorClasses[color])}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    SUSPENDED: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
    TRIAL: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    PENDING: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
    PENDING_INACTIVE: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    CANCELLED: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-400"
  };
  const labels: Record<string, string> = { PENDING_INACTIVE: "PAYMENT FAILED" };

  return (
    <span className={cn(
      "px-2.5 py-0.5 rounded-full text-xs font-medium",
      styles[status as keyof typeof styles] || styles.CANCELLED
    )}>
      {labels[status] || status}
    </span>
  );
}

function HealthIndicator({ status, label }: { status: string; label: string }) {
  const icons = {
    healthy: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
    warning: <AlertCircle className="w-4 h-4 text-amber-500" />,
    critical: <XCircle className="w-4 h-4 text-rose-500" />
  };

  return (
    <div className="flex items-center gap-2">
      {icons[status as keyof typeof icons] || icons.healthy}
      <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
      <span className={cn(
        "text-xs px-2 py-0.5 rounded-full",
        status === "healthy" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
        status === "warning" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
        status === "critical" && "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
      )}>
        {status}
      </span>
    </div>
  );
}

// Full company record returned by GET /api/sysadmin/companies/:id
interface CompanyDetail {
  id: string;
  name: string;
  contactemail: string;
  phone: string | null;
  billingplan: string;
  subscriptionstatus: string;
  activeflag: boolean;
  maxusers: number;
  hourlyrate: string | null;
  billingemail: string | null;
  vatnumber: string | null; // [SCOPE 002 / T076] FR-012b
  createdat: string | null;
  updatedat: string | null;
  userCount: number;
  users: {
    id: string;
    email: string;
    fullName: string | null;
    usertype: string;
    active: boolean;
    lastLoginAt: string | null;
  }[];
  subscription: {
    stripesubscriptionid: string | null;
    stripecustomerid: string | null;
    planname: string | null;
    planamount: string | null;
    overageamount: string | null;
    status: string | null;
    currentperiodstart: string | null;
    currentperiodend: string | null;
    canceledat: string | null;
  } | null;
}

const BILLING_PLANS = ["SINGLE_USER", "SMALL_BUSINESS", "CONSULTANT", "ENTERPRISE"] as const;

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// Read-only company detail view.
function CompanyDetailModal({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sysadmin/companies/${companyId}`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load company");
        const data = (await res.json()) as CompanyDetail;
        if (!cancelled) setDetail(data);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  return (
    <ModalShell title="Company Details" onClose={onClose}>
      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {!error && !detail && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
      {detail && (
        <div className="space-y-4">
          <div>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{detail.name}</p>
            <StatusBadge status={detail.activeflag ? (detail.subscriptionstatus || "ACTIVE") : "SUSPENDED"} />
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500 dark:text-slate-400">Contact email</dt>
            <dd className="text-slate-900 dark:text-slate-100 break-all">{detail.contactemail || "—"}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Billing email</dt>
            <dd className="text-slate-900 dark:text-slate-100 break-all">{detail.billingemail || "—"}</dd>
            {/* [SCOPE 002 / T076] FR-012b */}
            <dt className="text-slate-500 dark:text-slate-400">VAT number</dt>
            <dd className="text-slate-900 dark:text-slate-100 break-all">{detail.vatnumber || "—"}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Phone</dt>
            <dd className="text-slate-900 dark:text-slate-100">{detail.phone || "—"}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Plan</dt>
            <dd className="text-slate-900 dark:text-slate-100">{detail.billingplan}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Seats</dt>
            <dd className="text-slate-900 dark:text-slate-100">{detail.userCount} / {detail.maxusers}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Hourly rate</dt>
            <dd className="text-slate-900 dark:text-slate-100">{detail.hourlyrate ? `$${detail.hourlyrate}` : "—"}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Created</dt>
            <dd className="text-slate-900 dark:text-slate-100">{detail.createdat ? new Date(detail.createdat).toLocaleDateString() : "—"}</dd>
          </dl>

          {/* Stripe subscription — from companysubscriptions, not the company row */}
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
              Stripe Subscription
            </p>
            {detail.subscription ? (
              <dl className="grid grid-cols-[7rem,1fr] gap-x-3 gap-y-1.5 text-sm bg-slate-50 dark:bg-slate-700/30 rounded-lg p-3">
                <dt className="text-slate-500 dark:text-slate-400">Subscription ID</dt>
                <dd className="text-slate-900 dark:text-slate-100 font-mono text-xs break-all select-all">
                  {detail.subscription.stripesubscriptionid || "—"}
                </dd>
                <dt className="text-slate-500 dark:text-slate-400">Customer ID</dt>
                <dd className="text-slate-900 dark:text-slate-100 font-mono text-xs break-all select-all">
                  {detail.subscription.stripecustomerid || "—"}
                </dd>
                <dt className="text-slate-500 dark:text-slate-400">Status</dt>
                <dd className="text-slate-900 dark:text-slate-100">{detail.subscription.status || "—"}</dd>
                <dt className="text-slate-500 dark:text-slate-400">Amount</dt>
                <dd className="text-slate-900 dark:text-slate-100">
                  {detail.subscription.planname ? `${detail.subscription.planname} · ` : ""}
                  ${detail.subscription.planamount ?? "0.00"}
                  {Number(detail.subscription.overageamount ?? 0) > 0 ? ` (+$${detail.subscription.overageamount} overage)` : ""}
                </dd>
                <dt className="text-slate-500 dark:text-slate-400">Period end</dt>
                <dd className="text-slate-900 dark:text-slate-100">
                  {detail.subscription.currentperiodend ? new Date(detail.subscription.currentperiodend).toLocaleDateString() : "—"}
                </dd>
              </dl>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/30 rounded-lg p-3">
                No Stripe subscription on record (created manually or via seed — no Stripe checkout completed).
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
              Users ({detail.users.length})
            </p>
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-200 dark:divide-slate-700 max-h-48 overflow-y-auto">
              {detail.users.length === 0 && (
                <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No users.</p>
              )}
              {detail.users.map((u) => (
                <div key={u.id} className="flex items-center justify-between px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-900 dark:text-slate-100 truncate">{u.fullName || u.email}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{u.email}</p>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 ml-2 shrink-0">{u.usertype}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// Editable company profile form.
function EditCompanyModal({ companyId, onClose, onSaved }: { companyId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<{
    name: string; contactemail: string; phone: string; billingplan: string; maxusers: string; billingemail: string;
    vatnumber: string; // [SCOPE 002 / T076] FR-012b
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sysadmin/companies/${companyId}`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load company");
        const d = (await res.json()) as CompanyDetail;
        if (!cancelled) setForm({
          name: d.name ?? "",
          contactemail: d.contactemail ?? "",
          phone: d.phone ?? "",
          billingplan: d.billingplan ?? "SINGLE_USER",
          maxusers: String(d.maxusers ?? 5),
          billingemail: d.billingemail ?? "",
          vatnumber: d.vatnumber ?? "", // [SCOPE 002 / T076]
        });
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sysadmin/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name.trim(),
          contactemail: form.contactemail.trim(),
          phone: form.phone.trim() || null,
          billingplan: form.billingplan,
          maxusers: Number(form.maxusers),
          billingemail: form.billingemail.trim() || null,
          vatnumber: form.vatnumber.trim() || null, // [SCOPE 002 / T076]
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Failed to save");
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const field = "w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-slate-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const label = "block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1";

  return (
    <ModalShell title="Edit Company" onClose={onClose}>
      {!form && !error && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
      {form && (
        <div className="space-y-3">
          <div>
            <label className={label}>Name</label>
            <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className={label}>Contact email</label>
            <input className={field} value={form.contactemail} onChange={(e) => setForm({ ...form, contactemail: e.target.value })} />
          </div>
          <div>
            <label className={label}>Billing email</label>
            <input className={field} value={form.billingemail} onChange={(e) => setForm({ ...form, billingemail: e.target.value })} />
          </div>
          {/* [SCOPE 002 / T076] FR-012b */}
          <div>
            <label className={label}>VAT number</label>
            <input className={field} value={form.vatnumber} maxLength={50} placeholder="DE123456789" onChange={(e) => setForm({ ...form, vatnumber: e.target.value })} />
          </div>
          <div>
            <label className={label}>Phone</label>
            <input className={field} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Plan</label>
              <select className={field} value={form.billingplan} onChange={(e) => setForm({ ...form, billingplan: e.target.value })}>
                {BILLING_PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Max users</label>
              <input type="number" min={1} className={field} value={form.maxusers} onChange={(e) => setForm({ ...form, maxusers: e.target.value })} />
            </div>
          </div>
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
      {error && !form && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </ModalShell>
  );
}

// Main Dashboard Component
export default function SysAdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"overview" | "companies" | "users" | "system">("overview");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewCompanyId, setViewCompanyId] = useState<string | null>(null);
  const [editCompanyId, setEditCompanyId] = useState<string | null>(null);
  // [SCOPE 131 / T017] BEGIN — operator-initiated cancellation state.
  const [cancelTarget, setCancelTarget] = useState<Company | null>(null);
  const [cancelling, setCancelling] = useState(false);
  // Period end for the confirmation. It lives on companysubscriptions, not on the
  // companies row the list is built from, so it is fetched when the dialog opens.
  // Null renders as words rather than a blank where a date belongs.
  const [cancelPeriodEnd, setCancelPeriodEnd] = useState<string | null>(null);
  // [SCOPE 131 / T017] END
  // [SCOPE 064 / T003] Marketing summary headline numbers for the overview card.
  const [marketingSummary, setMarketingSummary] = useState<{
    audience: number | null;
    leads: number | null;
    campaigns: number | null;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [metricsRes, companiesRes, usersRes, healthRes] = await Promise.all([
        fetch("/api/sysadmin/metrics", { credentials: "include" }),
        fetch("/api/sysadmin/companies?limit=200", { credentials: "include" }),
        fetch("/api/sysadmin/users?limit=200", { credentials: "include" }),
        fetch("/api/sysadmin/health", { credentials: "include" })
      ]);

      if (metricsRes.status === 401) { navigate("/login"); return; }
      if (metricsRes.status === 403) { navigate("/dashboard"); return; }
      if (!metricsRes.ok || !companiesRes.ok || !usersRes.ok) {
        throw new Error("Failed to load platform data");
      }

      const metricsData = (await metricsRes.json()) as PlatformMetrics;
      const companiesData = (await companiesRes.json()) as { companies: Company[] };
      const usersData = (await usersRes.json()) as { users: User[] };
      const healthData = healthRes.ok ? ((await healthRes.json()) as HealthStatus) : null;

      setMetrics(metricsData);
      setCompanies(companiesData.companies ?? []);
      setUsers(usersData.users ?? []);
      setHealth(healthData);
    } catch (err) {
      setError((err as Error).message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { loadData(); }, [loadData]);

  // [SCOPE 064 / T003] Marketing summary — best-effort; the overview endpoint is
  // itself fail-open, so a failure just leaves the card showing "—".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/sysadmin/marketing/overview", { credentials: "include" });
        if (!res.ok) return;
        const o = (await res.json()) as {
          audience?: { total?: number } | null;
          leads?: { total?: number } | null;
          campaigns?: { total?: number } | null;
        };
        if (cancelled) return;
        setMarketingSummary({
          audience: o.audience?.total ?? null,
          leads: o.leads?.total ?? null,
          campaigns: o.campaigns?.total ?? null,
        });
      } catch { /* leave null → card shows — */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── SysAdmin actions ───────────────────────────────────────────────────────
  async function changeCompanyStatus(company: Company, status: "ACTIVE" | "SUSPENDED") {
    if (status === "SUSPENDED" &&
        !window.confirm(`Suspend ${company.name}? Its users will lose access until reactivated.`)) {
      return;
    }
    setBusyId(company.id);
    try {
      const res = await fetch(`/api/sysadmin/companies/${company.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Failed to update company status");
      }
      await loadData();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  // [SCOPE 067] Email a company's billing/admin contact a Stripe Portal restart link.
  async function sendRestartLink(company: Company) {
    setBusyId(company.id);
    try {
      const res = await fetch(`/api/sysadmin/companies/${company.id}/restart-link`, {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !(body as { success?: boolean }).success) {
        const reason = (body as { reason?: string; error?: string }).reason;
        throw new Error(
          reason === "no_stripe_customer"
            ? "No Stripe customer on file for this company"
            : (body as { error?: string }).error ?? reason ?? "Failed to send restart link",
        );
      }
      alert(`Restart link sent to ${(body as { to?: string }).to}`);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  // [SCOPE 131 / T017] BEGIN — cancel a subscription on a company's behalf (SPEC-131 Amendment C)
  /**
   * Opens the confirmation and, in parallel, resolves the date access actually
   * ends. The dialog is usable before that lands; the date fills in when it does.
   */
  function openCancelDialog(company: Company) {
    setCancelTarget(company);
    setCancelPeriodEnd(null);
    void (async () => {
      try {
        const res = await fetch(`/api/sysadmin/companies/${company.id}`, { credentials: "include" });
        if (!res.ok) return;
        const body = (await res.json()) as { subscription?: { currentperiodend?: string | null } | null };
        setCancelPeriodEnd(body.subscription?.currentperiodend ?? null);
      } catch {
        // Non-fatal: the confirmation falls back to describing the date in words.
      }
    })();
  }

  /**
   * Runs the SPEC-131 engine with the actor recorded as SYSADMIN: Stripe
   * `cancel_at_period_end`, access preserved to period end, the customer emailed.
   *
   * Deliberately NOT the Suspend or Delete path in the same row — those change
   * local status only and never contact Stripe, so a company "cancelled" that way
   * keeps being billed. The server re-checks the typed name before calling
   * Stripe, so a failure here means nothing changed anywhere.
   */
  async function cancelSubscription(company: Company, confirmName: string) {
    setCancelling(true);
    try {
      const res = await fetch(`/api/sysadmin/companies/${company.id}/cancel-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ confirmName }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((body as { error?: string }).error ?? "Failed to cancel subscription");
      }
      const effective = (body as { data?: { effectiveDate?: string | null } }).data?.effectiveDate;
      const ends = effective
        ? new Date(effective).toLocaleDateString()
        : "the end of the current billing period";
      setCancelTarget(null);
      alert(`Cancellation scheduled for ${company.name}. Access continues until ${ends}, and they have been emailed.`);
      await loadData();
    } catch (err) {
      // The dialog stays open so the reason is read with the typed name still in
      // place, rather than dismissing and leaving only an alert behind.
      alert((err as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  /**
   * Clears a pending cancellation. Ships with the cancel rather than later, for
   * the reason SPEC-131 gives for the customer-side un-cancel: without it an
   * operator mis-click is only fixable in the database.
   */
  async function resumeSubscription(company: Company) {
    if (!window.confirm(`Clear the pending cancellation for ${company.name}? Billing continues as normal.`)) {
      return;
    }
    setBusyId(company.id);
    try {
      const res = await fetch(`/api/sysadmin/companies/${company.id}/resume-subscription`, {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((body as { error?: string }).error ?? "Failed to reverse the cancellation");
      }
      alert(`Pending cancellation cleared. ${company.name} continues as normal.`);
      await loadData();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }
  // [SCOPE 131 / T017] END

  async function changeUserActive(u: User, active: boolean) {
    if (!active &&
        !window.confirm(`Disable ${u.emailaddr}? They will not be able to log in.`)) {
      return;
    }
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/sysadmin/users/${u.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ active }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Failed to update user");
      }
      await loadData();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteCompany(company: Company) {
    if (!window.confirm(
      `Delete ${company.name}? This soft-deletes the company and its data (30-day retention) and cannot be undone from here.`
    )) {
      return;
    }
    setBusyId(company.id);
    try {
      const res = await fetch(`/api/sysadmin/companies/${company.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: "Deleted by SysAdmin" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Failed to delete company");
      }
      await loadData();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function resetPassword(u: User) {
    if (!window.confirm(`Send a password reset for ${u.emailaddr}?`)) return;
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/sysadmin/users/${u.id}/reset-password`, {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((body as { error?: string }).error ?? "Failed to reset password");
      }
      const temp = (body as { tempPassword?: string }).tempPassword;
      alert(temp
        ? `Temporary password (dev only): ${temp}`
        : (body as { message?: string }).message ?? "Password reset sent");
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const filteredCompanies = useMemo(() => companies.filter((company) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      company.name.toLowerCase().includes(q) ||
      (company.contactemail ?? "").toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || companyStatus(company) === statusFilter;
    return matchesSearch && matchesStatus;
  }), [companies, searchQuery, statusFilter]);

  const filteredUsers = useMemo(() => users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      (u.emailaddr ?? "").toLowerCase().includes(q) ||
      (u.fullname ?? "").toLowerCase().includes(q)
    );
  }), [users, searchQuery]);

  const formatMrr = (value: number) =>
    `$${(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  SysAdmin
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Platform Administration
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {user?.email}
                </p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                  SYSADMIN
                </p>
              </div>
              <button
                onClick={() => void logout()}
                className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {[
              { id: "overview", label: "Overview", icon: LayoutDashboard },
              { id: "companies", label: "Companies", icon: Building2 },
              { id: "users", label: "Users", icon: Users },
              { id: "system", label: "System Health", icon: Activity }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={cn(
                  "flex items-center gap-2 py-4 text-sm font-medium border-b-2 transition-colors",
                  activeTab === tab.id
                    ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
            {/* [SCOPE 043 / T006] User Feedback triage surface (separate route) */}
            <button
              onClick={() => navigate("/sysadmin/feedback")}
              className="flex items-center gap-2 py-4 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              Feedback
            </button>
            {/* [SCOPE 046 / T005] Marketing lead funnel (separate route) */}
            <button
              onClick={() => navigate("/sysadmin/marketing")}
              className="flex items-center gap-2 py-4 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors"
            >
              <Megaphone className="w-4 h-4" />
              Marketing
            </button>
            {/* [SCOPE 044 / T007] Landing-page Docs management (separate route) */}
            <button
              onClick={() => navigate("/sysadmin/docs")}
              className="flex items-center gap-2 py-4 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Docs
            </button>
            {/* [SCOPE 023 / T110] Invite-bound promotional signups (separate route) */}
            <button
              onClick={() => navigate("/sysadmin/signup-invitations")}
              className="flex items-center gap-2 py-4 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors"
            >
              <Gift className="w-4 h-4" />
              Invitations
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading && (
          <div className="text-center py-16 text-sm text-slate-500 dark:text-slate-400">
            Loading platform data…
          </div>
        )}

        {!loading && error && (
          <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl p-4 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard
                    label="Total Companies"
                    value={metrics?.totalCompanies ?? 0}
                    subtext={`${metrics?.activeCompanies ?? 0} active`}
                    icon={<Building2 className="w-5 h-5" />}
                    color="indigo"
                  />
                  <StatCard
                    label="Total Users"
                    value={(metrics?.totalUsers ?? 0).toLocaleString()}
                    subtext={`${metrics?.activeUsers ?? 0} active`}
                    icon={<Users className="w-5 h-5" />}
                    color="blue"
                  />
                  <StatCard
                    label="Monthly Revenue"
                    value={formatMrr(metrics?.mrr ?? 0)}
                    subtext="MRR"
                    icon={<CreditCard className="w-5 h-5" />}
                    color="emerald"
                  />
                  <StatCard
                    label="Churn Rate"
                    value={`${metrics?.churnRate ?? 0}%`}
                    subtext={`${metrics?.trialCompanies ?? 0} in trial`}
                    icon={<TrendingUp className="w-5 h-5" />}
                    color="amber"
                  />
                </div>

                {/* [SCOPE 067] Needs attention — companies with a failed payment */}
                {(() => {
                  const failing = companies.filter((c) => companyStatus(c) === "PENDING_INACTIVE");
                  if (failing.length === 0) return null;
                  return (
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-orange-300 dark:border-orange-800/60 p-5">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-4">
                        <AlertTriangle className="w-4 h-4 text-orange-500" />
                        Needs attention — payment failed ({failing.length})
                      </h3>
                      <div className="space-y-2">
                        {failing.map((company) => (
                          <div key={company.id} className="flex items-center justify-between gap-3 p-3 bg-orange-50 dark:bg-orange-900/10 rounded-lg">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{company.name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{company.contactemail}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                disabled={busyId === company.id}
                                onClick={() => sendRestartLink(company)}
                                className="text-xs px-2.5 py-1 rounded-md border border-orange-400 text-orange-600 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/30 disabled:opacity-50"
                              >
                                Send restart link
                              </button>
                              <button
                                disabled={busyId === company.id}
                                onClick={() => changeCompanyStatus(company, "SUSPENDED")}
                                className="text-xs px-2.5 py-1 rounded-md border border-rose-400 text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/30 disabled:opacity-50"
                              >
                                Inactivate
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-indigo-500" />
                        Recent Companies
                      </h3>
                      <button
                        onClick={() => setActiveTab("companies")}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        View all <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="space-y-3">
                      {companies.length === 0 && (
                        <p className="text-sm text-slate-500 dark:text-slate-400">No companies yet.</p>
                      )}
                      {companies.slice(0, 5).map((company) => (
                        <div key={company.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{company.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{company.contactemail}</p>
                          </div>
                          <StatusBadge status={companyStatus(company)} />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-indigo-500" />
                        System Health
                      </h3>
                      <button
                        onClick={() => setActiveTab("system")}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        Details <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="space-y-3">
                      <HealthIndicator status={healthState(health?.database)} label="Database" />
                      <HealthIndicator status={healthState(health?.api)} label="API" />
                      <HealthIndicator status={healthState(health?.email)} label="Email Service" />
                      <HealthIndicator status={healthState(health?.payments)} label="Payments" />
                      <HealthIndicator status={healthState(health?.queue)} label="Job Queue" />
                    </div>
                  </div>
                </div>

                {/* [SCOPE 064 / T003] Marketing summary card */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Megaphone className="w-4 h-4 text-indigo-500" />
                      Marketing
                    </h3>
                    <button
                      onClick={() => navigate("/sysadmin/marketing/overview")}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      View marketing <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {(
                      [
                        ["Audience", marketingSummary?.audience],
                        ["Leads", marketingSummary?.leads],
                        ["Campaigns", marketingSummary?.campaigns],
                      ] as [string, number | null | undefined][]
                    ).map(([label, value]) => (
                      <div key={label} className="text-center">
                        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                          {value == null ? "—" : value.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Companies Tab */}
            {activeTab === "companies" && (
              <div className="space-y-6">
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search companies..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">All Status</option>
                      <option value="ACTIVE">Active</option>
                      <option value="TRIAL">Trial</option>
                      <option value="SUSPENDED">Suspended</option>
                    </select>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Company</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Plan</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Users</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">MRR</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {filteredCompanies.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                            No companies match your filters.
                          </td>
                        </tr>
                      )}
                      {filteredCompanies.map((company) => (
                        <tr key={company.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{company.name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{company.contactemail}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={companyStatus(company)} />
                            {/* [SCOPE 131 / T017] A pending cancellation changes no
                                status — the company stays ACTIVE to period end — so
                                without this the row looks untouched after cancelling. */}
                            {company.cancelrequestedat && !company.cancelledat && (
                              <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                                cancellation pending
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-slate-700 dark:text-slate-300">{company.billingplan}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-slate-700 dark:text-slate-300">
                              {company.userCount} / {company.maxusers}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-slate-700 dark:text-slate-300">
                              {formatMrr(company.mrr)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setViewCompanyId(company.id)}
                                className="p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 rounded"
                                title="View"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditCompanyId(company.id)}
                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded"
                                title="Edit"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              {companyStatus(company) === "SUSPENDED" ? (
                                <button
                                  onClick={() => changeCompanyStatus(company, "ACTIVE")}
                                  disabled={busyId === company.id}
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded disabled:opacity-40"
                                  title="Activate"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => changeCompanyStatus(company, "SUSPENDED")}
                                  disabled={busyId === company.id}
                                  className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded disabled:opacity-40"
                                  title="Suspend"
                                >
                                  <PauseCircle className="w-4 h-4" />
                                </button>
                              )}
                              {/* [SCOPE 131 / T017] BEGIN — cancel the subscription for real.
                                  Distinct from Suspend to its left, which flips local
                                  status without contacting Stripe. Hidden once a
                                  cancellation is pending or already effective: the
                                  server would answer 409, so offering it would be
                                  offering a dead end. */}
                              {!company.cancelrequestedat && !company.cancelledat &&
                                companyStatus(company) !== "CANCELLED" && (
                                <button
                                  onClick={() => openCancelDialog(company)}
                                  disabled={busyId === company.id}
                                  className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded disabled:opacity-40"
                                  title="Cancel subscription (Stripe, at period end)"
                                >
                                  <Ban className="w-4 h-4" />
                                </button>
                              )}
                              {company.cancelrequestedat && !company.cancelledat && (
                                <button
                                  onClick={() => resumeSubscription(company)}
                                  disabled={busyId === company.id}
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded disabled:opacity-40"
                                  title="Undo the pending cancellation"
                                >
                                  <Undo2 className="w-4 h-4" />
                                </button>
                              )}
                              {/* [SCOPE 131 / T017] END */}
                              <button
                                onClick={() => deleteCompany(company)}
                                disabled={busyId === company.id}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded disabled:opacity-40"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Users Tab */}
            {activeTab === "users" && (
              <div className="space-y-6">
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">User</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Company</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Role</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {filteredUsers.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                            No users match your search.
                          </td>
                        </tr>
                      )}
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{u.fullname || "—"}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{u.emailaddr}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-slate-700 dark:text-slate-300">{u.companyName}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-slate-700 dark:text-slate-300">{u.usertype}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-xs font-medium",
                              u.active
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-400"
                            )}>
                              {u.active ? "Active" : "Disabled"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => resetPassword(u)}
                                disabled={busyId === u.id}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded disabled:opacity-40"
                                title="Reset Password"
                              >
                                <Settings className="w-4 h-4" />
                              </button>
                              {u.active ? (
                                <button
                                  onClick={() => changeUserActive(u, false)}
                                  disabled={busyId === u.id}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded disabled:opacity-40"
                                  title="Disable"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => changeUserActive(u, true)}
                                  disabled={busyId === u.id}
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded disabled:opacity-40"
                                  title="Enable"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* System Health Tab */}
            {activeTab === "system" && (
              <div className="space-y-6">
                {/* [SCOPE 078 / T008] Infrastructure Health Monitor — capacity warnings + solutions */}
                <InfrastructureHealthPanel />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                      <Database className="w-4 h-4 text-indigo-500" />
                      Database
                    </h3>
                    <HealthIndicator status={healthState(health?.database)} label="PostgreSQL" />
                  </div>

                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                      <Server className="w-4 h-4 text-indigo-500" />
                      API Server
                    </h3>
                    <HealthIndicator status={healthState(health?.api)} label="Express API" />
                  </div>

                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-indigo-500" />
                      Email Service
                    </h3>
                    <HealthIndicator status={healthState(health?.email)} label="Mailgun" />
                  </div>

                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-indigo-500" />
                      Payments
                    </h3>
                    <HealthIndicator status={healthState(health?.payments)} label="Stripe" />
                  </div>

                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-indigo-500" />
                      Job Queue
                    </h3>
                    <HealthIndicator status={healthState(health?.queue)} label="Background Jobs" />
                  </div>
                </div>

                {health?.timestamp && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Last checked: {new Date(health.timestamp).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {viewCompanyId && (
        <CompanyDetailModal companyId={viewCompanyId} onClose={() => setViewCompanyId(null)} />
      )}
      {editCompanyId && (
        <EditCompanyModal
          companyId={editCompanyId}
          onClose={() => setEditCompanyId(null)}
          onSaved={() => { setEditCompanyId(null); loadData(); }}
        />
      )}

      {/* [SCOPE 131 / T017] BEGIN — operator-voiced confirmation. The wording is
          overridden because the shared defaults address the customer ("You keep
          full access until…"), which is wrong when cancelling a subscription that
          is not yours. The typed-name gate and the server check are unchanged. */}
      {cancelTarget && (
        <CancelSubscriptionDialog
          open={cancelTarget !== null}
          onOpenChange={(open) => { if (!open) setCancelTarget(null); }}
          companyName={cancelTarget.name}
          effectiveDate={cancelPeriodEnd ? new Date(cancelPeriodEnd).toLocaleDateString() : null}
          submitting={cancelling}
          onConfirm={(confirmName) => cancelSubscription(cancelTarget, confirmName)}
          copy={{
            title: `Cancel ${cancelTarget.name}'s subscription`,
            body: cancelPeriodEnd
              ? `Stripe will be set to cancel at the end of the period this company has already paid for. They keep full access until ${new Date(cancelPeriodEnd).toLocaleDateString()}, and they will be emailed about it.`
              : `Stripe will be set to cancel at the end of the period this company has already paid for. They keep full access until then, and they will be emailed about it.`,
            undoNote: "Recorded against your operator account, not the customer's. You can undo it from this list at any time before it takes effect.",
            typeLabel: `Type the company name — ${cancelTarget.name} — to confirm.`,
            placeholder: cancelTarget.name,
            mismatch: "That does not match the company name.",
            keep: "Leave it active",
            confirm: "Cancel this subscription",
          }}
        />
      )}
      {/* [SCOPE 131 / T017] END */}
    </div>
  );
}
