interface ProjectSummaryProps {
  metrics: {
    totalProjects: number;
    activeProjects: number;
  };
}

import { useTranslation } from "../../i18n"; // [SCOPE 052]

export default function ProjectSummary({ metrics }: ProjectSummaryProps) {
  const { t } = useTranslation();
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 {t("dashboard.panelProjects")}</h3>
      <div className="space-y-4">
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-600">{t("dashboard.totalProjects")}</span>
            <span className="text-2xl font-bold text-purple-600">
              {metrics.totalProjects}
            </span>
          </div>
        </div>
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-600">{t("dashboard.active")}</span>
            <span className="text-2xl font-bold text-indigo-600">
              {metrics.activeProjects}
            </span>
          </div>
          {metrics.totalProjects > 0 && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-indigo-600 h-2 rounded-full"
                style={{
                  width: `${(metrics.activeProjects / metrics.totalProjects) * 100}%`,
                }}
              ></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
