import { AppShell } from "../components/layout/AppShell";
import { useAuth } from "../context/AuthContext";
import { Clock, FolderKanban, CheckSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardProjectGrid } from "../components/Dashboard/DashboardProjectGrid";
import { apiFetch } from "../lib/apiFetch";
import { formatBillingPlan } from "../lib/billingPlan";
import { useTranslation } from "~/client/i18n";
import type { ProjectCard } from "~/shared/types/projects";

/**
 * Team Member Dashboard — task-focused view for TEAM_MEMBER users.
 */
export default function TeamDashboard() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await apiFetch("/api/projects");
        if (!response.ok) {
          throw new Error("Failed to fetch projects");
        }
        const data = await response.json();
        setProjects(data.projects || []);
      } catch {
        setProjects([]);
      } finally {
        setProjectsLoading(false);
      }
    };

    void fetchProjects();
  }, []);

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t("teamDashboard.title")}
            <span className="ml-2 text-slate-400 dark:text-slate-500 font-normal">—</span>
            <span className="ml-2 text-indigo-600 dark:text-indigo-400 font-semibold">
              {formatBillingPlan(user?.billingplan)}
            </span>
            {user?.companyname && (
              <>
                <span className="ml-2 text-slate-400 dark:text-slate-500 font-normal">·</span>
                <span className="ml-2 text-slate-700 dark:text-slate-200 font-semibold">
                  {user.companyname}
                </span>
              </>
            )}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t("teamDashboard.welcomeBack", { email: user?.email })}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                <FolderKanban className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{t("teamDashboard.assignedProjects")}</span>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{projects.length}</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{t("teamDashboard.openTasks")}</span>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {projects.reduce((sum, p) => sum + (p.opentaskcount || 0), 0)}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm sm:col-span-2 xl:col-span-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{t("teamDashboard.hoursThisWeek")}</span>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">0.0</p>
          </div>
        </div>

        {/* Project grid — shared with AdminDashboard per spec 002 FR-106.
            Read-only here: no onNewProject or onEditProject callbacks. */}
        <DashboardProjectGrid
          projects={projects}
          isLoading={projectsLoading}
          emptyStateMessage={t("teamDashboard.noProjectsAssigned")}
        />

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("teamDashboard.workHubTitle")}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t("teamDashboard.workHubDescription")}
            </p>
          </div>
          <Link
            to="/dashboard/work-hub"
            className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {t("teamDashboard.openWorkHub")}
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
