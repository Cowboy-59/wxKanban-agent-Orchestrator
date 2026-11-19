/**
 * EngagementsWidget — compact dashboard summary
 * Spec 037 — T052 followup (Layer 1 admin dashboard widget)
 *
 * Renders on /admin/dashboard. Shows up to 3 active engagements (Client side
 * and Consulting side combined, with role labels) with one-click open and a
 * "View all" link to the Team Members page where the full panel lives.
 *
 * Stays silent (returns null) when the user has zero engagements — keeps the
 * dashboard uncluttered for tenants who haven't started using consultants.
 */

import { useEffect, useState } from "react";
import { Briefcase, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "../../i18n";

interface EngagementRow {
  id: string;
  state: "active" | "paused" | "disabled" | "ended";
  role: "client" | "consulting";
  counterpartyCompanyName: string;
  acceptedAt: string;
}

// [SCOPE 037 / T052] BEGIN — EngagementsWidget
export function EngagementsWidget() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [rows, setRows] = useState<EngagementRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/engagements?includeEnded=false", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          setLoading(false);
          return;
        }
        const data = (await r.json()) as { engagements: EngagementRow[] };
        // Most recently accepted first.
        const sorted = [...data.engagements].sort(
          (a, b) =>
            new Date(b.acceptedAt).getTime() -
            new Date(a.acceptedAt).getTime(),
        );
        setRows(sorted);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Stay silent on zero engagements — dashboard stays clean.
  if (loading) return null;
  if (rows.length === 0) return null;

  const top = rows.slice(0, 3);
  const clientCount = rows.filter((r) => r.role === "client").length;
  const consultingCount = rows.filter((r) => r.role === "consulting").length;

  const stateBadge = (state: EngagementRow["state"]) =>
    ({
      active: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
      paused: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
      disabled: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
      ended: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
    })[state];

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            {t("engagementsWidget.title")}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {clientCount > 0 &&
              (clientCount === 1
                ? t("engagementsWidget.clientFirms", { count: clientCount })
                : t("engagementsWidget.clientFirmsPlural", {
                    count: clientCount,
                  }))}
            {clientCount > 0 && consultingCount > 0 && " · "}
            {consultingCount > 0 &&
              (consultingCount === 1
                ? t("engagementsWidget.clientsServed", {
                    count: consultingCount,
                  })
                : t("engagementsWidget.clientsServedPlural", {
                    count: consultingCount,
                  }))}
          </p>
        </div>
        <button
          onClick={() => navigate("/admin/team")}
          className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 inline-flex items-center gap-1"
        >
          {t("engagementsWidget.viewAll")} <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="space-y-2">
        {top.map((r) => (
          <button
            key={r.id}
            onClick={() => navigate(`/engagements/${r.id}`)}
            className="w-full text-left flex items-center justify-between gap-3 p-2 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${r.role === "client" ? "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300" : "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"}`}
                >
                  {r.role === "client"
                    ? t("engagementsWidget.roleHiring")
                    : t("engagementsWidget.roleServing")}
                </span>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {r.counterpartyCompanyName}
                </p>
              </div>
            </div>
            <span
              className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded ${stateBadge(r.state)}`}
            >
              {r.state}
            </span>
          </button>
        ))}
      </div>

      {rows.length > 3 && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 text-center">
          {t("engagementsWidget.moreCount", { count: rows.length - 3 })}
        </p>
      )}
    </div>
  );
}
// [SCOPE 037 / T052] END
