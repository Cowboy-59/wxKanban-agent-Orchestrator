/**
 * ActivityFeed Component
 * T032 - Admin dashboard activity feed widget
 * Shows recent team and project activity
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/client/components/ui/Card';
import { Button } from '~/client/components/ui/Button';
import { LoadingSpinner } from '~/client/components/ui/LoadingSpinner';
import { useTranslation } from '../../i18n';

interface ActivityItem {
  id: string;
  type: 'user_joined' | 'project_created' | 'task_completed' | 'time_logged' | 'invoice_generated' | 'subscription_changed';
  description: string;
  userName?: string;
  userId?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface ActivityFeedProps {
  activities?: ActivityItem[];
  isLoading?: boolean;
  onViewAll?: () => void;
  maxItems?: number;
}


const activityIcons: Record<string, string> = {
  user_joined: '👋',
  project_created: '📁',
  task_completed: '✅',
  time_logged: '⏱️',
  invoice_generated: '📄',
  subscription_changed: '💳',
};

const activityColors: Record<string, string> = {
  user_joined: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  project_created: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  task_completed: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  time_logged: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  invoice_generated: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  subscription_changed: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
};

export function ActivityFeed({
  activities = [],
  isLoading = false,
  onViewAll,
  maxItems = 10,
}: ActivityFeedProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("activityFeed.title")}</CardTitle>
          <CardDescription>{t("activityFeed.loading")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <LoadingSpinner size="md" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const displayActivities = activities.slice(0, maxItems);

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle>{t("activityFeed.title")}</CardTitle>
          <CardDescription>{t("activityFeed.subtitle")}</CardDescription>
        </div>
        {onViewAll && activities.length > maxItems && (
          <Button variant="ghost" size="sm" onClick={onViewAll}>
            {t("activityFeed.viewAll")}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {displayActivities.length === 0 ? (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            <p className="text-4xl mb-2">📭</p>
            <p>{t("activityFeed.empty")}</p>
            <p className="text-sm mt-1">{t("activityFeed.emptyHint")}</p>
          </div>
        ) : (
          <div className="space-y-0">
            {displayActivities.map((activity, index) => (
              <div
                key={activity.id}
                className={`flex items-start gap-3 py-3 ${
                  index !== displayActivities.length - 1 ? 'border-b border-slate-200 dark:border-slate-700' : ''
                }`}
              >
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm ${activityColors[activity.type]}`}>
                  {activityIcons[activity.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-900 dark:text-slate-100">
                    {activity.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {activity.userName && <span>{t("activityFeed.byUser", { name: activity.userName })}</span>}
                    <span>•</span>
                    <span>{formatTimestamp(activity.timestamp, t)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatTimestamp(
  timestamp: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t("activityFeed.justNow");
  if (diffMins < 60) return t("activityFeed.minutesAgo", { count: diffMins });
  if (diffHours < 24) return t("activityFeed.hoursAgo", { count: diffHours });
  if (diffDays < 7) return t("activityFeed.daysAgo", { count: diffDays });
  return date.toLocaleDateString();
}

export default ActivityFeed;
