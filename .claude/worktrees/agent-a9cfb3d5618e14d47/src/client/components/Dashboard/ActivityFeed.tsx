import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n'; // [SCOPE 052]

interface Activity {
  auditid: string;
  action: string;
  changedby?: string;
  description?: string | null;
  timestamp: string;
}

export default function ActivityFeed() {
  const { t } = useTranslation();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/company/dashboard/activity?limit=10', {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch activity feed');
        }

        const data = await response.json();
        setActivities(data.data?.activities || []);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch activity feed:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load activity feed'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, []);

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          📝 {t("dashboard.panelActivity")}
        </h3>
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        📝 {t("dashboard.panelActivity")}
      </h3>
      {loading ? (
        <p className="text-gray-600 text-sm">{t("dashboard.loadingActivities")}</p>
      ) : activities.length === 0 ? (
        <p className="text-gray-600 text-sm">{t("dashboard.noActivity")}</p>
      ) : (
        <div className="space-y-3">
          {activities.map((activity) => (
            <div
              key={activity.auditid}
              className="pb-3 border-b last:border-b-0"
            >
              <div className="flex justify-between items-start mb-1">
                <p className="font-medium text-gray-900 text-sm">
                  {activity.action}
                </p>
                <span className="text-xs text-gray-500">
                  {new Date(activity.timestamp).toLocaleTimeString()}
                </span>
              </div>
              {activity.description && (
                <p className="text-gray-600 text-sm">{activity.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
