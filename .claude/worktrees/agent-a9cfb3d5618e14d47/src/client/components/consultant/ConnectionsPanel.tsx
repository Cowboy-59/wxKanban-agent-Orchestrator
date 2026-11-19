import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plug, Users } from "lucide-react";
import { Button } from "../ui/Button";
import { ConnectionFormDialog } from "./ConnectionFormDialog"; // [SCOPE 017 / T071]
import { apiFetchJson } from "../../lib/apiFetch";
import { useTranslation } from "../../i18n";

// SPEC-017 FR-010 — the connection list for one customer.
//
// Metadata is visible to everyone in the company; SECRETS are not. The server
// returns `cansecrets` / `canedit` / `candelete` per row and this component
// renders those, rather than re-deriving anything from a role. A consultant can
// see that a colleague's Jira connection is failing without being able to read
// that colleague's token — which is the whole point of the PERSONAL scope.

interface ConnectionRow {
  id: string;
  name: string;
  systemtype: string;
  apiendpoint: string;
  credentialscope: string;
  status: string;
  healthstatus: string | null;
  healthcheckedat: string | null;
  lastsyncat: string | null;
  cansecrets: boolean;
  canedit: boolean;
  candelete: boolean;
}

const HEALTH_TONE: Record<string, string> = {
  healthy: "border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]",
  warning: "border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.1)] text-[hsl(var(--warning))]",
  error: "border-[hsl(var(--danger)/0.4)] bg-[hsl(var(--danger)/0.1)] text-[hsl(var(--danger))]",
};

// [SCOPE 017 / T111] BEGIN — connection list for a customer (FR-010)
// MODIFIED-BY: [SCOPE 017 / T071] — the Add button was rendered with no onClick;
// it now opens ConnectionFormDialog.
export function ConnectionsPanel({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const query = useQuery({
    queryKey: ["customer-connections", customerId],
    queryFn: () =>
      apiFetchJson<{ connections: ConnectionRow[] }>(
        `/api/consultant/customers/${customerId}/connections`,
      ),
    enabled: Boolean(customerId),
  });

  const testConnection = useMutation({
    mutationFn: (id: string) =>
      apiFetchJson(`/api/consultant/connections/${id}/test`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customer-connections", customerId] });
      await queryClient.invalidateQueries({ queryKey: ["connection-health"] });
    },
  });

  const connections: ConnectionRow[] = query.data?.connections ?? [];

  return (
    <div className="border-t border-border px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
          {t("connections.heading")}
        </h3>
        <span className="text-xs tabular-nums text-muted-foreground">
          {connections.length}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => setAddOpen(true)}
        >
          {t("connections.add")}
        </Button>
      </div>

      <ConnectionFormDialog
        open={addOpen}
        customerId={customerId}
        onClose={() => setAddOpen(false)}
      />

      {connections.length === 0 ? (
        <p className="py-3 text-xs text-muted-foreground">{t("connections.none")}</p>
      ) : (
        connections.map((c: ConnectionRow) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center gap-2 border-t border-border py-2.5 text-[13px] first-of-type:border-t-0"
          >
            <Plug className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium">{c.name}</span>
            <span className="text-xs text-muted-foreground">{c.systemtype}</span>

            {/* Scope badge — neutral ink. PERSONAL is not a warning state, it is
                simply whose credential this is. */}
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px text-[11px] font-medium text-muted-foreground">
              {c.credentialscope === "TEAM" ? (
                <Users className="h-2.5 w-2.5" aria-hidden="true" />
              ) : (
                <Lock className="h-2.5 w-2.5" aria-hidden="true" />
              )}
              {t(`connections.scope.${c.credentialscope}`)}
            </span>

            {c.healthstatus && c.healthstatus !== "unknown" ? (
              <span
                className={`inline-flex items-center rounded-full border px-1.5 py-px text-[11px] font-medium ${
                  HEALTH_TONE[c.healthstatus] ?? "border-border text-muted-foreground"
                }`}
              >
                {t(`connections.health.${c.healthstatus}`)}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-border px-1.5 py-px text-[11px] font-medium text-muted-foreground">
                {t("connections.health.unknown")}
              </span>
            )}

            <div className="ml-auto flex gap-1.5">
              {/* Test requires the ability to read the credential — a reachability
                  check that used someone else's secret would be a leak by proxy. */}
              {c.cansecrets ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={testConnection.isPending}
                  onClick={() => testConnection.mutate(c.id)}
                >
                  {t("connections.test")}
                </Button>
              ) : (
                <span className="self-center text-[11px] italic text-muted-foreground">
                  {t("connections.notYours")}
                </span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
// [SCOPE 017 / T111] END
