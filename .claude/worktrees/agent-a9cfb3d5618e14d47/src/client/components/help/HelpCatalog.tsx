// [SCOPE 084 / T006] BEGIN — HelpCatalog: features grouped by category, plan-aware
import { FeatureCard } from "./FeatureCard";
import { useTranslation } from "~/client/i18n"; // [SCOPE 052] help i18n
import type { HelpFeature, Plan, PlanId } from "~/shared/help/catalog";

interface HelpCatalogProps {
  categories: string[];
  features: HelpFeature[];
  plans: Plan[];
  selectedPlan: PlanId;
}

// Maps a catalog category string → its helpCatalog.category.<slug> i18n key.
const CATEGORY_KEY: Record<string, string> = {
  "Core workspace": "coreWorkspace",
  "Development lifecycle": "developmentLifecycle",
  "Integrations": "integrations",
  "Team & collaboration": "teamCollaboration",
  "Time, billing & consulting": "timeBillingConsulting",
  "Admin & configuration": "adminConfiguration",
  "Security & compliance": "securityCompliance",
  "Enterprise & support": "enterpriseSupport",
};

export function HelpCatalog({ categories, features, plans, selectedPlan }: HelpCatalogProps) {
  const { t } = useTranslation();
  const categoryLabel = (category: string) => {
    const slug = CATEGORY_KEY[category];
    if (!slug) return category;
    const v = t(`helpCatalog.category.${slug}`);
    return v === `helpCatalog.category.${slug}` ? category : v;
  };
  const groups = categories
    .map((category) => ({ category, items: features.filter((f) => f.category === category) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.category}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            {categoryLabel(group.category)}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.items.map((feature) => (
              <FeatureCard key={feature.id} feature={feature} selectedPlan={selectedPlan} plans={plans} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
// [SCOPE 084 / T006] END
