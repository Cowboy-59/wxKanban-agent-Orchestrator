import { useQuery } from "@tanstack/react-query";
import {
  Database,
  Server,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plug,
  Clock,
  Table2,
} from "lucide-react";
import { useTranslation } from "../../i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TableCheck {
  exists: boolean;
  rowcount?: number;
}

interface SchemaDrift {
  table: string;
  missingColumns: string[];
}

interface DiagnosticsResponse {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  server: {
    uptimeSeconds: number;
    uptimeHuman: string;
    memoryMB: number;
    nodeVersion: string;
    env: string;
    diagLatencyMs: number;
  };
  database: {
    status: "ok" | "error";
    latencyMs: number;
    error: string | null;
    tables: Record<string, TableCheck>;
    missingTables: string[];
    rowCounts: Record<string, number>;
  };
  schema: {
    drift: SchemaDrift[];
    driftCount: number;
    healthy: boolean;
  };
  integrations: {
    pmConnected: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("wxkanban_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchDiagnostics(): Promise<DiagnosticsResponse> {
  const res = await fetch("/api/admin/diagnostics", {
    credentials: "include",
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<DiagnosticsResponse>;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: "ok" | "degraded" | "error" }) {
  if (status === "ok") return <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />;
  if (status === "degraded") return <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />;
  return <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />;
}

function StatusBadge({ status }: { status: "ok" | "degraded" | "error" }) {
  const cls =
    status === "ok"
      ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
      : status === "degraded"
      ? "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400"
      : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400";
  return (
    <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${cls}`}>
      {status}
    </span>
  );
}

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm border-b border-slate-100 dark:border-slate-700 last:border-0">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-slate-900 dark:text-slate-100 ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SystemHealth() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["admin", "diagnostics"],
    queryFn: fetchDiagnostics,
    staleTime: 60_000,
    retry: 1,
  });

  const lastChecked = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : null;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Server className="w-4 h-4 text-indigo-500" />
          {t("systemHealth.title")}
          {data && (
            <span className="ml-1">
              <StatusDot status={data.status} />
            </span>
          )}
        </h3>
        <div className="flex items-center gap-3">
          {lastChecked && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {t("systemHealth.checked", { time: lastChecked })}
            </span>
          )}
          <button
            onClick={() => { void refetch(); }}
            disabled={isFetching}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
            {t("systemHealth.refresh")}
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
          {t("systemHealth.runningDiagnostics")}
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 py-2">
          <XCircle className="w-4 h-4 shrink-0" />
          {(error as Error).message}
        </div>
      )}

      {/* Data */}
      {data && (
        <div className="space-y-5">
          {/* Overall status */}
          <div className="flex items-center gap-3">
            <StatusBadge status={data.status} />
            {data.status === "ok" && (
              <span className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                {t("systemHealth.allSystemsOperational")}
              </span>
            )}
            {data.status === "degraded" && (
              <span className="text-sm text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {t("systemHealth.driftOrMissingDetected")}
              </span>
            )}
            {data.status === "error" && (
              <span className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" />
                {t("systemHealth.databaseUnreachable")}
              </span>
            )}
          </div>

          {/* Grid: DB + Server side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Database */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                {t("systemHealth.database")}
              </p>
              <div>
                <Row
                  label={t("systemHealth.status")}
                  value={<StatusBadge status={data.database.status} />}
                />
                <Row label={t("systemHealth.latency")} value={`${data.database.latencyMs}ms`} />
                {data.database.error && (
                  <Row
                    label={t("systemHealth.errorLabel")}
                    value={
                      <span className="text-red-600 dark:text-red-400 text-xs truncate max-w-[160px] block">
                        {data.database.error}
                      </span>
                    }
                  />
                )}
                {Object.entries(data.database.rowCounts).map(([table, count]) => (
                  <Row key={table} label={t("systemHealth.tableRows", { table })} value={count.toLocaleString()} />
                ))}
              </div>
            </div>

            {/* Server */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {t("systemHealth.server")}
              </p>
              <div>
                <Row label={t("systemHealth.uptime")} value={data.server.uptimeHuman} />
                <Row label={t("systemHealth.memory")} value={`${data.server.memoryMB} MB`} />
                <Row label="Node" value={data.server.nodeVersion} mono />
                <Row label={t("systemHealth.env")} value={data.server.env} mono />
                <Row label={t("systemHealth.diagTime")} value={`${data.server.diagLatencyMs}ms`} />
              </div>
            </div>
          </div>

          {/* Integrations row */}
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <Plug className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {data.integrations.pmConnected}
              </span>{" "}
              {data.integrations.pmConnected !== 1
                ? t("systemHealth.pmIntegrationsConnected")
                : t("systemHealth.pmIntegrationConnected")}
            </span>
          </div>

          {/* Schema drift */}
          {data.schema.driftCount > 0 && (
            <div className="rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 p-3">
              <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                {data.schema.driftCount !== 1
                  ? t("systemHealth.schemaDriftTables", { count: data.schema.driftCount })
                  : t("systemHealth.schemaDriftTable", { count: data.schema.driftCount })}
              </p>
              <div className="space-y-1">
                {data.schema.drift.map((d) => (
                  <div key={d.table} className="text-xs text-yellow-800 dark:text-yellow-300">
                    <span className="font-mono font-semibold">{d.table}</span>
                    {` — ${t("systemHealth.missing")}: `}
                    <span className="font-mono">{d.missingColumns.join(", ")}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-yellow-700 dark:text-yellow-500 mt-2">
                {t("systemHealth.run")}{" "}
                <code className="bg-yellow-100 dark:bg-yellow-900/40 px-1 rounded">npm run db:generate && npm run db:migrate</code>{" "}
                {t("systemHealth.toFix")}
              </p>
            </div>
          )}

          {/* Missing tables */}
          {data.database.missingTables.length > 0 && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Table2 className="w-3.5 h-3.5" />
                {t("systemHealth.missingTables", { count: data.database.missingTables.length })}
              </p>
              <p className="font-mono text-xs text-red-700 dark:text-red-300">
                {data.database.missingTables.join(", ")}
              </p>
              <p className="text-xs text-red-600 dark:text-red-500 mt-2">
                {t("systemHealth.run")}{" "}
                <code className="bg-red-100 dark:bg-red-900/40 px-1 rounded">npm run db:migrate</code>{" "}
                {t("systemHealth.toCreateMissingTables")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
