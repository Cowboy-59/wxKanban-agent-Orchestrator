import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTranslation } from "../../i18n";

type BillingPlan = "FREE" | "SMALL_BUSINESS" | "CONSULTANT" | "ENTERPRISE";

const TIER_ORDER: Record<BillingPlan, number> = {
  FREE: 1,
  SMALL_BUSINESS: 2,
  CONSULTANT: 3,
  ENTERPRISE: 4,
};

const PLAN_LABELS: Record<BillingPlan, string> = {
  FREE: "Free",
  SMALL_BUSINESS: "Small Business",
  CONSULTANT: "Consultant",
  ENTERPRISE: "Enterprise",
};

interface UpgradeLockProps {
  requiredPlan: BillingPlan;
  featureName: string;
  featureDescription?: string;
  children: ReactNode;
}

/**
 * Wraps a section in a tier gate. If the user's plan meets the requirement,
 * renders children normally. Otherwise renders a locked state with upgrade CTA.
 */
export function UpgradeLock({
  requiredPlan,
  featureName,
  featureDescription,
  children,
}: UpgradeLockProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const currentPlan = (user?.billingplan ?? "FREE") as BillingPlan;
  const currentTier = TIER_ORDER[currentPlan] ?? 1;
  const requiredTier = TIER_ORDER[requiredPlan];

  if (currentTier >= requiredTier) {
    return <>{children}</>;
  }

  return (
    <div className="relative rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 p-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
          <Lock className="w-5 h-5 text-slate-500 dark:text-slate-400" />
        </div>
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-300">{featureName}</p>
          {featureDescription && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{featureDescription}</p>
          )}
        </div>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
          {t("upgradeLock.requiresPlan", { plan: PLAN_LABELS[requiredPlan] })}
        </span>
        <Link
          to="/settings/billing/upgrade"
          className="mt-1 inline-flex items-center px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition"
        >
          {t("upgradeLock.upgradePlan")}
        </Link>
      </div>
    </div>
  );
}
