/**
 * DailyDigestPreview Component
 * T031 - Admin dashboard widget showing daily digest preview
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/client/components/ui/Card';
import { Button } from '~/client/components/ui/Button';
import { LoadingSpinner } from '~/client/components/ui/LoadingSpinner';
import { useTranslation } from "../../i18n";

interface DigestItem {
  type: 'task_completed' | 'time_logged' | 'project_update' | 'user_activity';
  title: string;
  description: string;
  timestamp: string;
  userName?: string;
}

interface DailyDigestPreviewProps {
  items?: DigestItem[];
  isLoading?: boolean;
  onConfigure?: () => void;
  onViewFull?: () => void;
}


const typeIcons: Record<string, string> = {
  task_completed: '✅',
  time_logged: '⏱️',
  project_update: '📊',
  user_activity: '👤',
};

export function DailyDigestPreview({
  items = [],
  isLoading = false,
  onConfigure,
  onViewFull,
}: DailyDigestPreviewProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("dailyDigest.title")}</CardTitle>
          <CardDescription>{t("dailyDigest.loadingActivity")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <LoadingSpinner size="md" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle>{t("dailyDigest.title")}</CardTitle>
          <CardDescription>{t("dailyDigest.subtitle")}</CardDescription>
        </div>
        <div className="flex gap-2">
          {onConfigure && (
            <Button variant="outline" size="sm" onClick={onConfigure}>
              {t("dailyDigest.configure")}
            </Button>
          )}
          {onViewFull && (
            <Button variant="ghost" size="sm" onClick={onViewFull}>
              {t("dailyDigest.viewAll")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            <p className="text-4xl mb-2">📭</p>
            <p>{t("dailyDigest.noActivity")}</p>
            <p className="text-sm mt-1">{t("dailyDigest.activityWillAppear")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.slice(0, 5).map((item, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <span className="text-xl flex-shrink-0">{typeIcons[item.type]}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">
                    {item.title}
                  </p>
                  <p className="text-slate-600 dark:text-slate-400 text-sm mt-0.5">
                    {item.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-500">
                    {item.userName && <span>{t("dailyDigest.byUser", { name: item.userName })}</span>}
                    <span>•</span>
                    <span>{formatTime(item.timestamp, t)}</span>
                  </div>
                </div>
              </div>
            ))}
            {items.length > 5 && (
              <p className="text-center text-sm text-slate-500 dark:text-slate-400 pt-2">
                {t("dailyDigest.moreItems", { count: items.length - 5 })}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatTime(
  timestamp: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return t('dailyDigest.justNow');
  if (diffMins < 60) return t('dailyDigest.minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('dailyDigest.hoursAgo', { count: diffHours });
  return date.toLocaleDateString();
}

export default DailyDigestPreview;
