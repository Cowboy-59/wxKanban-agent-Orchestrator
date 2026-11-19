// [SCOPE 084 / T006] BEGIN — FeatureCard: one feature's description + plan-aware status
import { Link } from "react-router-dom";
import { ArrowRight, Check, Lock, ShieldCheck } from "lucide-react";
import { useTranslation } from "~/client/i18n"; // [SCOPE 052] help i18n
import { availabilityFor, type HelpFeature, type Plan, type PlanId } from "~/shared/help/catalog";

interface FeatureCardProps {
  feature: HelpFeature;
  selectedPlan: PlanId;
  plans: Plan[];
}

export function FeatureCard({ feature, selectedPlan, plans }: FeatureCardProps) {
  const { t } = useTranslation();
  // Translate-with-fallback: catalog content is authored in helpCatalog.*; if a key
  // is missing, translate() returns the key itself, so fall back to the English datum.
  const tf = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };
  const availability = availabilityFor(feature, selectedPlan);
  const included = availability.status === "included";
  const unlockingLabel = availability.unlockingPlan
    ? tf(`helpCatalog.plan.${availability.unlockingPlan}.label`, plans.find((p) => p.id === availability.unlockingPlan)?.label ?? "")
    : undefined;
  const title = tf(`helpCatalog.feature.${feature.id}.title`, feature.title);
  const description = tf(`helpCatalog.feature.${feature.id}.description`, feature.description);
  const howTo = tf(`helpCatalog.feature.${feature.id}.howTo`, feature.howTo);

  return (
    <Link
      to={`/help/${feature.id}`}
      className={`group rounded-xl border p-4 flex flex-col gap-2 transition-colors hover:border-indigo-400 dark:hover:border-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 ${
        included
          ? "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          : "border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-900/10"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
          {title}
          {feature.adminOnly && (
            <span
              title={t("helpCatalog.ui.adminOnly")}
              className="inline-flex items-center gap-0.5 text-[10px] uppercase font-semibold tracking-wide text-slate-500 dark:text-slate-400"
            >
              <ShieldCheck className="w-3 h-3" /> {t("helpCatalog.ui.admin")}
            </span>
          )}
        </h4>
        {included ? (
          <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <Check className="w-3.5 h-3.5" /> {t("helpCatalog.ui.included")}
          </span>
        ) : (
          <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <Lock className="w-3.5 h-3.5" /> {unlockingLabel || t("helpCatalog.ui.upgrade")}
          </span>
        )}
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{description}</p>

      {included && availability.note && (
        <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">{availability.note}</p>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">
        <span className="font-semibold text-slate-600 dark:text-slate-300">{t("helpCatalog.ui.howToLabel")}</span> {howTo}
      </p>

      {!included && unlockingLabel && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("helpCatalog.ui.availableFromPrefix")}<span className="font-semibold">{unlockingLabel}</span>{t("helpCatalog.ui.availableFromSuffix")}
        </p>
      )}

      <span className="mt-auto pt-1 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
        {t("helpCatalog.ui.howToUseIt")}
        <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
// [SCOPE 084 / T006] END
