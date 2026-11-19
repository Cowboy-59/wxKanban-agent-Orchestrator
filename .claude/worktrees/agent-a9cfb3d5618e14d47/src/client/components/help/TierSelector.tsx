// [SCOPE 084 / T006] BEGIN — TierSelector: pick a public plan to view Help against
import { useTranslation } from "~/client/i18n"; // [SCOPE 052] help i18n
import type { Plan, PlanId } from "~/shared/help/catalog";

interface TierSelectorProps {
  plans: Plan[];
  selected: PlanId;
  onSelect: (plan: PlanId) => void;
  viewerPlan?: PlanId;
}

export function TierSelector({ plans, selected, onSelect, viewerPlan }: TierSelectorProps) {
  const { t } = useTranslation();
  const tf = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="tablist" aria-label={t("helpCatalog.ui.subscriptionPlan")}>
      {plans.map((plan) => {
        const active = plan.id === selected;
        const isViewer = plan.id === viewerPlan;
        return (
          <button
            key={plan.id}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(plan.id)}
            className={`text-left rounded-xl border px-4 py-3 transition-colors ${
              active
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 ring-1 ring-indigo-500"
                : "border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 bg-white dark:bg-slate-900"
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{tf(`helpCatalog.plan.${plan.id}.label`, plan.label)}</span>
              {isViewer && (
                <span className="text-[10px] uppercase font-semibold tracking-wide text-indigo-600 dark:text-indigo-400">
                  {t("helpCatalog.ui.yourPlan")}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{plan.price}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500">{tf(`helpCatalog.plan.${plan.id}.userLimit`, plan.userLimit)}</div>
          </button>
        );
      })}
    </div>
  );
}
// [SCOPE 084 / T006] END
