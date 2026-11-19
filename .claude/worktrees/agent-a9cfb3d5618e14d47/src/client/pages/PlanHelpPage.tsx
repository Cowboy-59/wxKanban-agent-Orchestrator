// [SCOPE 084 / T006] BEGIN — PlanHelpPage: subscription-aware in-app Help
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "~/client/i18n";
import { AppShell } from "../components/layout/AppShell";
import { TierSelector } from "../components/help/TierSelector";
import { HelpCatalog } from "../components/help/HelpCatalog";
import { useAuth } from "../context/AuthContext";
import { useProjects } from "../lib/hooks/useProjects";
import type { ProjectCard } from "~/shared/types/projects";
import {
  PLANS,
  HELP_FEATURES,
  CATEGORIES,
  type Plan,
  type HelpFeature,
  type PlanId,
} from "~/shared/help/catalog";

interface HelpCatalogResponse {
  plan: PlanId;
  plans: Plan[];
  categories: string[];
  features: HelpFeature[];
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("wxkanban_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function PlanHelpPage() {
  const { t } = useTranslation();
  // Fall back to the compiled-in catalog so the page always renders, even if the
  // fetch fails; the API is only strictly needed to learn the viewer's own plan.
  const [data, setData] = useState<HelpCatalogResponse>({
    plan: "SINGLE_USER",
    plans: PLANS,
    categories: CATEGORIES,
    features: HELP_FEATURES,
  });
  const [selected, setSelected] = useState<PlanId | null>(null);
  const [loading, setLoading] = useState(true);

  // Admin-only: regenerate the stored doctype='help' doc (all 6 languages) for the
  // company's projects. Mirrors the ProjectLifecycle regenerate action (spec 084).
  const { user } = useAuth();
  const isAdmin = user?.usertype === "ADMIN" || user?.usertype === "SYSADMIN";
  const { data: projects } = useProjects();
  const [regenerating, setRegenerating] = useState(false);
  const [regenMsg, setRegenMsg] = useState<string | null>(null);

  async function handleRegenerate() {
    const list = (projects ?? []) as ProjectCard[];
    if (!list.length) {
      setRegenMsg("No projects to regenerate.");
      return;
    }
    setRegenerating(true);
    setRegenMsg(null);
    let ok = 0;
    for (const p of list) {
      try {
        const res = await fetch("/api/admin/help/regenerate", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ projectId: p.id }),
        });
        if (res.ok) ok += 1;
      } catch {
        /* continue with the rest */
      }
    }
    setRegenerating(false);
    setRegenMsg(`Regenerated Help (6 languages) for ${ok} project${ok === 1 ? "" : "s"}.`);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/help/catalog", {
          credentials: "include",
          headers: authHeaders(),
        });
        if (res.ok) {
          const body = (await res.json()) as HelpCatalogResponse;
          if (alive) {
            setData(body);
            setSelected(body.plan);
          }
        }
      } catch {
        // keep compiled-in fallback
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const viewerPlan = data.plan;
  const activePlan = selected ?? viewerPlan;
  const viewerLabel = useMemo(
    () => data.plans.find((p) => p.id === viewerPlan)?.label ?? t("planHelp.yourPlan"),
    [data.plans, viewerPlan],
  );

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("planHelp.title")}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t("planHelp.subtitlePrefix")}{" "}
              <span className="font-semibold text-slate-800 dark:text-slate-200">{viewerLabel}</span>{" "}
              {t("planHelp.subtitleSuffix")}
            </p>
          </div>
          {isAdmin && (
            <div className="flex flex-col items-end gap-1 shrink-0">
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={regenerating}
                title="Regenerate the stored Help document (all 6 languages) for your projects"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? "animate-spin" : ""}`} />
                {regenerating ? "Regenerating…" : "Regenerate"}
              </button>
              {regenMsg && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400 max-w-[16rem] text-right">{regenMsg}</span>
              )}
            </div>
          )}
        </header>

        <TierSelector
          plans={data.plans}
          selected={activePlan}
          onSelect={setSelected}
          viewerPlan={viewerPlan}
        />

        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> {t("planHelp.included")}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> {t("planHelp.upgradeRequired")}
          </span>
          {loading && <span className="ml-auto animate-pulse">{t("planHelp.loading")}</span>}
        </div>

        <HelpCatalog
          categories={data.categories}
          features={data.features}
          plans={data.plans}
          selectedPlan={activePlan}
        />
      </div>
    </AppShell>
  );
}

export default PlanHelpPage;
// [SCOPE 084 / T006] END
