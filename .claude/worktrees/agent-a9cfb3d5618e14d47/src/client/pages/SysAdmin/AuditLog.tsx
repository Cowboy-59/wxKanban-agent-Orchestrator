import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "~/client/context/AuthContext";
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui";

// [SCOPE 147 / T007] BEGIN — one SysAdmin action record as GET /api/sysadmin/audit returns it
type AuditRecord = {
  id: string;
  timestamp: string;
  action: string;
  changedby: string | null;
  actoremail: string | null;
  previousvalue: Record<string, unknown> | null;
  newvalue: {
    target?: { type?: string; id?: string | null; name?: string | null };
    route?: { method?: string; path?: string };
    after?: unknown;
    ids?: unknown[];
    count?: number;
  } | null;
  description: string | null;
};

type Filters = { action: string; targetType: string; targetId: string; actor: string; from: string; to: string };
const EMPTY: Filters = { action: "", targetType: "", targetId: "", actor: "", from: "", to: "" };
const PAGE = 50;
// [SCOPE 147 / T007] END

// [SCOPE 147 / T007] BEGIN — render a before/after value compactly
function show(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}
// [SCOPE 147 / T007] END

// [SCOPE 147 / T007] BEGIN — /sysadmin/audit: read-only list of SysAdmin action records (FR-007)
export default function SysAdminAuditLog() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const isSysAdmin = user?.usertype === "SYSADMIN";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (applied.action) params.set("action", applied.action);
      if (applied.targetType) params.set("targetType", applied.targetType);
      if (applied.targetId) params.set("targetId", applied.targetId);
      if (applied.actor) params.set("actor", applied.actor);
      if (applied.from) params.set("from", new Date(`${applied.from}T00:00:00Z`).toISOString());
      if (applied.to) params.set("to", new Date(`${applied.to}T23:59:59Z`).toISOString());
      const res = await fetch(`/api/sysadmin/audit?${params.toString()}`, { credentials: "include" });
      if (res.status === 401) {
        navigate("/login");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Failed to load the audit trail (${res.status})`);
      }
      const body = (await res.json()) as { data?: AuditRecord[] };
      setRows(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the audit trail");
    } finally {
      setLoading(false);
    }
  }, [applied, offset, navigate]);

  useEffect(() => {
    if (isSysAdmin) void load();
  }, [isSysAdmin, load]);

  if (!isSysAdmin) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Audit trail</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">System Administrator access required.</p>
      </div>
    );
  }

  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement>) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Audit trail</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Every change a System Administrator made, newest first. Records cannot be edited or removed.
        </p>
      </div>

      <form
        className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setApplied(filters);
        }}
      >
        <label className="text-xs text-gray-600 dark:text-gray-400">
          Action
          <Input placeholder="sysadmin_company_status_changed" value={filters.action} onChange={set("action")} />
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          Target type
          <Input placeholder="company" value={filters.targetType} onChange={set("targetType")} />
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          Target id
          <Input value={filters.targetId} onChange={set("targetId")} />
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          Actor (user id)
          <Input value={filters.actor} onChange={set("actor")} />
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          From
          <Input type="date" value={filters.from} onChange={set("from")} />
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          To
          <Input type="date" value={filters.to} onChange={set("to")} />
        </label>
        <div className="md:col-span-6 flex gap-2">
          <Button type="submit">Apply filters</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFilters(EMPTY);
              setApplied(EMPTY);
              setOffset(0);
            }}
          >
            Clear
          </Button>
        </div>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500" aria-live="polite">
          Loading…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No SysAdmin actions match these filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When (UTC)</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const t = r.newvalue?.target;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{r.timestamp.replace("T", " ").slice(0, 19)}</TableCell>
                    <TableCell>{r.actoremail ?? r.changedby ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.action}</TableCell>
                    <TableCell>
                      {t?.type ?? "—"} {t?.name ? `· ${t.name}` : ""}
                      {t?.id && <div className="font-mono text-xs text-gray-500">{t.id}</div>}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left text-xs text-indigo-600 dark:text-indigo-400 underline"
                        aria-expanded={open === r.id}
                        onClick={() => setOpen(open === r.id ? null : r.id)}
                      >
                        {open === r.id ? "Hide" : "Before → after"}
                      </button>
                      {open === r.id && (
                        <div className="mt-1 text-xs font-mono space-y-1">
                          <div>before: {show(r.previousvalue)}</div>
                          <div>after: {show(r.newvalue?.after ?? (r.newvalue?.ids ? { ids: r.newvalue.ids, count: r.newvalue.count } : null))}</div>
                          <div className="text-gray-500">
                            {r.newvalue?.route?.method} {r.newvalue?.route?.path}
                          </div>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex gap-2 items-center">
        <Button type="button" variant="outline" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
          Newer
        </Button>
        <Button type="button" variant="outline" disabled={rows.length < PAGE || loading} onClick={() => setOffset(offset + PAGE)}>
          Older
        </Button>
        <span className="text-xs text-gray-500">
          Showing {rows.length === 0 ? 0 : offset + 1}–{offset + rows.length}
        </span>
      </div>
    </div>
  );
}
// [SCOPE 147 / T007] END
