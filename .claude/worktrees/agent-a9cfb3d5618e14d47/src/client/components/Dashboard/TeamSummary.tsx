interface TeamSummaryProps {
  metrics: Array<{ role: string; count: number }>;
}

import { useTranslation } from "../../i18n"; // [SCOPE 052]

export default function TeamSummary({ metrics }: TeamSummaryProps) {
  const { t } = useTranslation();
  const totalUsers = metrics.reduce((sum, m) => sum + m.count, 0);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        👨‍💼 {t("dashboard.panelTeamSummary")}
      </h3>
      <div className="space-y-3">
        {metrics.map((role) => (
          <div key={role.role}>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium text-gray-700">
                {role.role}
              </span>
              <span className="text-sm font-bold text-gray-900">
                {role.count}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full"
                style={{
                  width: `${totalUsers > 0 ? (role.count / totalUsers) * 100 : 0}%`,
                }}
              ></div>
            </div>
          </div>
        ))}
        <div className="pt-3 border-t">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">{t("dashboard.total")}</span>
            <span className="text-xl font-bold text-gray-900">
              {totalUsers}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
