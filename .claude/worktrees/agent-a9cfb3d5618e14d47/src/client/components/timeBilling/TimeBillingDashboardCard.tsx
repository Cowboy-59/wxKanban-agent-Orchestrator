import { Link } from "react-router-dom";
import { ArrowRight, Clock } from "lucide-react";
import { RoleLock } from "~/client/components/admin/RoleLock";
import { UpgradeLock } from "~/client/components/admin/UpgradeLock";
import { useTranslation } from "~/client/i18n";

// [SCOPE 005 / T014] BEGIN — TimeBillingDashboardCard: the Admin Dashboard card links to the page (FR-001)
/** Replaces the placeholder card: Business plan and up, ADMIN only, a link to /admin/time-billing. */
export function TimeBillingDashboardCard() {
  const { t } = useTranslation();
  return (
    <UpgradeLock
      requiredPlan="SMALL_BUSINESS"
      featureName={t("adminDashboard.timeBilling")}
      featureDescription={t("adminDashboard.timeBillingDesc")}
    >
      <RoleLock requiredUsertype="ADMIN" featureName={t("adminDashboard.timeBilling")}>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-500" />
            {t("adminDashboard.timeBilling")}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t("adminDashboard.timeBillingDesc")}</p>
          <Link
            to="/admin/time-billing"
            className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
          >
            {t("timeBilling.page.open")}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </RoleLock>
    </UpgradeLock>
  );
}
// [SCOPE 005 / T014] END
