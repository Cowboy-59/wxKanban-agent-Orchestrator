interface CompanyMetricsProps {
  metrics: {
    totalUsers: number;
    usersByRole: Array<{ role: string; count: number }>;
    activeUsers: number;
  };
}

import { useTranslation } from "../../i18n"; // [SCOPE 052]

export default function CompanyMetrics({ metrics }: CompanyMetricsProps) {
  const { t } = useTranslation();
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">👥 {t("dashboard.panelCompany")}</h3>
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">{t("dashboard.totalUsers")}</span>
          <span className="text-2xl font-bold text-blue-600">
            {metrics.totalUsers}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600">{t("dashboard.activeUsers")}</span>
          <span className="text-2xl font-bold text-green-600">
            {metrics.activeUsers}
          </span>
        </div>
        <div className="pt-2 border-t">
          <p className="text-sm font-semibold text-gray-900 mb-2">{t("dashboard.byRole")}</p>
          <div className="space-y-1">
            {metrics.usersByRole.map((role) => (
              <div key={role.role} className="flex justify-between text-sm">
                <span className="text-gray-600">{role.role}</span>
                <span className="font-medium">{role.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
