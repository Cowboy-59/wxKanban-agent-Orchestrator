/**
 * SCOPE-078 / T008 — Infrastructure Health Monitor panel (SysAdmin System Health tab).
 * Reads /api/sysadmin/infra-health (RDS/App Runner capacity checks) and shows warnings urgent-first,
 * each with its recommended solution. Green "all passing" when healthy; flags a possibly-stopped
 * monitor; a manual "Re-evaluate now" button triggers an immediate sweep.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Clock,
} from "lucide-react";

type Status = "ok" | "caution" | "urgent";

interface InfraCheck {
  checkkey: string;
  resource: string;
  status: Status;
  title: string;
  detail: string | null;
  solution: string | null;
  evaluatedat: string | null;
}

interface InfraHealth {
  checks: InfraCheck[];
  overall: Status;
  lastChecked: string | null;
  stale: boolean;
}

// [SCOPE 078 / T008] BEGIN — InfrastructureHealthPanel
const STATUS_STYLE: Record<Status, { card: string; badge: string; label: string }> = {
  urgent: {
    card: "border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    label: "Urgent",
  },
  caution: {
    card: "border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    label: "Caution",
  },
  ok: {
    card: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/15",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    label: "OK",
  },
};

function fmtWhen(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown" : d.toLocaleString();
}

export default function InfrastructureHealthPanel() {
  const [data, setData] = useState<InfraHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        refresh ? "/api/sysadmin/infra-health/refresh" : "/api/sysadmin/infra-health",
        { method: refresh ? "POST" : "GET", credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as InfraHealth);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const overall = data?.overall ?? "ok";
  const warnings = (data?.checks ?? []).filter((c) => c.status !== "ok");

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-500" />
          Infrastructure Health
          {data && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[overall].badge}`}>
              {STATUS_STYLE[overall].label}
            </span>
          )}
        </h3>
        <button
          onClick={() => void load(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Re-evaluate
        </button>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">Could not load: {error}</p>}

      {data && (
        <>
          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mb-3">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Last checked: {fmtWhen(data.lastChecked)}
            </span>
          </div>

          {data.stale && (
            <div className="mb-3 flex items-start gap-2 text-sm rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Monitor may not be running — the latest evaluation is stale. Check that
                <code className="mx-1">INFRA_HEALTH_ENABLED=true</code> and the agent is alive.
              </span>
            </div>
          )}

          {warnings.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              All infrastructure checks passing.
            </div>
          ) : (
            <ul className="space-y-3">
              {warnings.map((c) => {
                const s = STATUS_STYLE[c.status];
                return (
                  <li key={c.checkkey} className={`rounded-lg border p-3 ${s.card}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4" />
                        {c.title}
                      </span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${s.badge}`}>{s.label}</span>
                    </div>
                    {c.detail && (
                      <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{c.detail}</p>
                    )}
                    {c.solution && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                        <span className="font-semibold">Solution: </span>
                        {c.solution}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
// [SCOPE 078 / T008] END
