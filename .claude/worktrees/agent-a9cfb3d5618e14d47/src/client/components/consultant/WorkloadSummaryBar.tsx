import { useTranslation } from "../../i18n"; // [SCOPE 052]

interface WorkloadSummaryBarProps {
  total: number;
  pastDue: number;
  aging30Plus: number;
  complianceAttention?: number;
}

/**
 * WorkloadSummaryBar — extracted from ConsultantWorkHubPage inline counters.
 * Shows total / past due / 30+ day aging / compliance attention.
 */
export function WorkloadSummaryBar({
  total,
  pastDue,
  aging30Plus,
  complianceAttention = 0,
}: WorkloadSummaryBarProps) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">{t("workhub.summaryTotal")}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
          {total}
        </p>
      </div>
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-4">
        <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-400">
          {t("workhub.summaryPastDue")}
        </p>
        <p className="text-2xl font-bold text-amber-800 dark:text-amber-300 mt-1">
          {pastDue}
        </p>
      </div>
      <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-950/20 p-4">
        <p className="text-xs uppercase tracking-wide text-rose-700 dark:text-rose-400">
          {t("workhub.summaryAging")}
        </p>
        <p className="text-2xl font-bold text-rose-800 dark:text-rose-300 mt-1">
          {aging30Plus}
        </p>
      </div>
      <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/20 p-4">
        <p className="text-xs uppercase tracking-wide text-indigo-700 dark:text-indigo-400">
          {t("workhub.compliance")}
        </p>
        <p className="text-2xl font-bold text-indigo-800 dark:text-indigo-300 mt-1">
          {complianceAttention}
        </p>
      </div>
    </div>
  );
}
