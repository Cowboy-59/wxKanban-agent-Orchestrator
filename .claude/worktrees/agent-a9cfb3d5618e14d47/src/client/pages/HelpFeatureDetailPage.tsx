// [SCOPE 084 / T006] BEGIN — HelpFeatureDetailPage: the underlying "how to use it" page
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Lock, ShieldCheck } from "lucide-react";
import { useTranslation } from "~/client/i18n"; // [SCOPE 052] help i18n
import { AppShell } from "../components/layout/AppShell";
import { availabilityFor, type PlanId } from "~/shared/help/catalog";
import { getLocalizedHelp, HELP_UI, HELP_LOCALES, type HelpLocale } from "~/shared/help/i18n";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("wxkanban_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// The app locale (e.g. "fr-FR") maps 1:1 to a HelpLocale; anything we don't have
// Help translations for falls back to English.
function toHelpLocale(locale: string): HelpLocale {
  return (HELP_LOCALES as readonly string[]).includes(locale) ? (locale as HelpLocale) : "en-US";
}

export function HelpFeatureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale, t } = useTranslation();
  const helpLocale = toHelpLocale(locale);
  // Localized content (feature copy, article body, guide steps, category labels)
  // + localized chrome. Same source the standalone-page / stored-doc generators use.
  const { features, plans, articles, guides, categoryLabel } = getLocalizedHelp(helpLocale);
  const ui = HELP_UI[helpLocale];

  const feature = features.find((f) => f.id === id);
  const [viewerPlan, setViewerPlan] = useState<PlanId | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/help/catalog", { credentials: "include", headers: authHeaders() });
        if (res.ok) {
          const body = (await res.json()) as { plan: PlanId };
          if (alive) setViewerPlan(body.plan);
        }
      } catch {
        /* non-critical */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const article = id ? articles[id] : undefined;
  const rich = !!article;
  const steps = (id && guides[id]) || (feature ? [feature.howTo] : []);
  // HELP_UI.backAllHelp bakes in a "← "; we render our own icon, so strip it.
  const backLabel = ui.backAllHelp.replace(/^←\s*/, "");

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          to="/help"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
        >
          <ArrowLeft className="w-4 h-4" /> {backLabel}
        </Link>

        {!feature ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Topic not found
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              <Link to="/help" className="text-indigo-600 dark:text-indigo-400">{backLabel}</Link>
            </p>
          </div>
        ) : (
          <>
            <header className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                {categoryLabel(feature.category)}
              </div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                {feature.title}
                {feature.adminOnly && (
                  <span className="inline-flex items-center gap-1 text-[11px] uppercase font-semibold tracking-wide text-slate-500 dark:text-slate-400">
                    <ShieldCheck className="w-3.5 h-3.5" /> {ui.adminTag}
                  </span>
                )}
              </h1>
              <p className="text-slate-600 dark:text-slate-300">{feature.description}</p>
            </header>

            {/* Per-plan availability */}
            <section className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50">
                {ui.availabilityByPlan}
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {plans.map((p) => {
                  const a = availabilityFor(feature, p.id);
                  const included = a.status === "included";
                  const isViewer = viewerPlan === p.id;
                  return (
                    <li
                      key={p.id}
                      className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                        isViewer ? "bg-indigo-50/60 dark:bg-indigo-900/20" : ""
                      }`}
                    >
                      <span className="text-slate-700 dark:text-slate-200">
                        {p.label}
                        {isViewer && (
                          <span className="ml-2 text-[10px] uppercase font-semibold text-indigo-600 dark:text-indigo-400">
                            {t("helpCatalog.ui.yourPlan")}
                          </span>
                        )}
                      </span>
                      {included ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                          <Check className="w-4 h-4" /> {ui.included}{a.note ? ` · ${a.note}` : ""}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
                          <Lock className="w-3.5 h-3.5" /> {ui.notIncluded}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            {rich && article ? (
              <>
                {article.overview && (
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{ui.overview}</h2>
                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{article.overview}</p>
                  </section>
                )}

                {!!article.whatYouSee?.length && (
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{ui.whatYoullSee}</h2>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                      {article.whatYouSee.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </section>
                )}

                {!!article.controls?.length && (
                  <section className="space-y-3">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{ui.controlsOptions}</h2>
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                      {article.controls.map((c, i) => (
                        <div key={i} className="px-4 py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(120px,190px)_1fr] gap-1 sm:gap-3">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            {c.label}
                            {c.adminOnly && <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 font-semibold">{ui.adminTag}</span>}
                          </div>
                          <div className="text-sm text-slate-600 dark:text-slate-300">
                            {c.does}
                            {c.planNote && <span className="text-amber-700 dark:text-amber-400"> · {c.planNote}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {!!article.tasks?.length && (
                  <section className="space-y-4">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{ui.commonTasks}</h2>
                    {article.tasks.map((task, ti) => (
                      <div key={ti} className="space-y-2">
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{task.title}</h3>
                        <ol className="space-y-1.5">
                          {task.steps.map((s, si) => (
                            <li key={si} className="flex gap-3">
                              <span className="flex-none w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold grid place-items-center mt-0.5">{si + 1}</span>
                              <span className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{s}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </section>
                )}

                {!!article.tips?.length && (
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{ui.tips}</h2>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                      {article.tips.map((tip, i) => <li key={i}>{tip}</li>)}
                    </ul>
                  </section>
                )}
              </>
            ) : (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{ui.howToUseHeading}</h2>
                <ol className="space-y-2">
                  {steps.map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="flex-none w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold grid place-items-center mt-0.5">{i + 1}</span>
                      <span className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

export default HelpFeatureDetailPage;
// [SCOPE 084 / T006] END
