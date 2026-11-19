import { useEffect, useState } from 'react';
import { RefreshCw, ChevronDown, ChevronRight, ClipboardList, ExternalLink } from 'lucide-react';
import { useTranslation } from '../../i18n'; // [SCOPE 052]

interface ProjectTaskSummary {
  id: string;
  name: string;
  opencount: number;
  inprogresscount: number;
  totalpending: number;
}

export default function PendingTasksSummaryPanel() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ProjectTaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/pending-tasks/summary', { credentials: 'include' });
      if (!res.ok) throw new Error(t("dashboard.failedToFetch", { status: res.status }));
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dashboard.failedToLoadPendingTasks"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const totalPending = projects.reduce((sum, p) => sum + p.totalpending, 0);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          <ClipboardList className="w-4 h-4 text-indigo-500" />
          {t("dashboard.panelPendingTasks")}
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">
            ({totalPending})
          </span>
        </button>
        <button
          onClick={fetchSummary}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="space-y-1">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          {loading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("dashboard.loading")}</p>
          ) : projects.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("dashboard.noActiveProjects")}</p>
          ) : (
            <>
              {/* Column headers */}
              <div className="grid grid-cols-12 gap-2 px-3 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                <div className="col-span-6">{t("dashboard.colProject")}</div>
                <div className="col-span-2 text-center">{t("dashboard.colOpen")}</div>
                <div className="col-span-2 text-center">{t("dashboard.colInProgress")}</div>
                <div className="col-span-2 text-center">{t("dashboard.total")}</div>
              </div>

              {projects.map((p) => (
                <a
                  key={p.id}
                  href={`/admin/projects/${p.id}/pending-tasks`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`grid grid-cols-12 gap-2 px-3 py-2 rounded-lg border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-colors ${
                    p.totalpending === 0 ? 'opacity-50' : ''
                  }`}
                >
                  <div className="col-span-6 flex items-center gap-1 text-sm text-slate-900 dark:text-slate-100 truncate">
                    {p.name}
                    <ExternalLink className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                  </div>
                  <div className="col-span-2 text-center text-sm text-slate-700 dark:text-slate-300">
                    {p.opencount}
                  </div>
                  <div className="col-span-2 text-center text-sm text-slate-700 dark:text-slate-300">
                    {p.inprogresscount}
                  </div>
                  <div className="col-span-2 text-center text-sm font-medium text-slate-900 dark:text-slate-100">
                    {p.totalpending}
                  </div>
                </a>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
