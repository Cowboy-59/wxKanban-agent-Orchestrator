interface FinancialSummaryProps {
  metrics: {
    revenueThisMonth: string;
    invoicesThisMonth: number;
    outstandingInvoices: number;
  };
}

import { useTranslation } from "../../i18n"; // [SCOPE 052]

export default function FinancialSummary({
  metrics,
}: FinancialSummaryProps) {
  const { t } = useTranslation();
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">💰 {t("dashboard.panelFinancials")}</h3>
      <div className="space-y-3">
        <div>
          <span className="text-gray-600 text-sm">{t("dashboard.revenue")}</span>
          <p className="text-2xl font-bold text-green-600">
            ${metrics.revenueThisMonth}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-2 border-t">
          <div>
            <p className="text-gray-600 text-sm">{t("dashboard.invoices")}</p>
            <p className="text-xl font-bold text-gray-900">
              {metrics.invoicesThisMonth}
            </p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">{t("dashboard.outstanding")}</p>
            <p className="text-xl font-bold text-orange-600">
              {metrics.outstandingInvoices}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
