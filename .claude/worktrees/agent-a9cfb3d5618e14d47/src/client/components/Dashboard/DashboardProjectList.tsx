import { useState } from "react";
import { FolderKanban, Plus, FolderOpen } from "lucide-react";
import { ProjectCard } from "~/client/components/Projects/ProjectCard";
import { ProjectDetailPanel } from "~/client/components/Projects/ProjectDetailPanel";
import { useProjects } from "~/client/lib/hooks/useProjects";
import { useAuth } from "~/client/context/AuthContext";
import { useNavigate } from "react-router-dom";

interface DashboardProjectListProps {
  title?: string;
  showCreateButton?: boolean;
  maxProjects?: number;
  emptyStateMessage?: string;
  className?: string;
}

export function DashboardProjectList({
  title = "Projects",
  showCreateButton = true,
  maxProjects,
  emptyStateMessage = "No projects found",
  className = "",
}: DashboardProjectListProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.usertype === "ADMIN" || user?.usertype === "TEAM_MANAGER";
  
  const { data: allProjects = [], isLoading: loading, error, refetch } = useProjects();
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  // Limit projects if maxProjects is specified
  const projects = maxProjects ? allProjects.slice(0, maxProjects) : allProjects;

  const expandedProject = expandedProjectId
    ? projects.find((p) => p.id === expandedProjectId) ?? null
    : null;

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <FolderKanban className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h3>
            {!loading && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {allProjects.length === 0
                  ? "No projects yet"
                  : `${allProjects.length} project${allProjects.length !== 1 ? "s" : ""}`}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {isAdmin && showCreateButton && (
            <button
              type="button"
              onClick={() => navigate('/projects/new')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
          >
            View All
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Error */}
        {error && !loading && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3">
            <p className="text-sm text-red-700 dark:text-red-400">
              {error instanceof Error ? error.message : "Could not load projects"}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-sm font-medium text-red-700 dark:text-red-400 underline underline-offset-2 hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="bg-slate-100 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-4 py-3 flex items-center gap-4 animate-pulse"
              >
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-4 bg-slate-200 dark:bg-slate-600 rounded w-40" />
                    <div className="h-4 bg-slate-200 dark:bg-slate-600 rounded-full w-16" />
                  </div>
                  <div className="h-2.5 bg-slate-200 dark:bg-slate-600 rounded w-64" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && projects.length === 0 && !expandedProject && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FolderOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-4" />
            <p className="text-base font-medium text-slate-500 dark:text-slate-400">
              {emptyStateMessage}
            </p>
            {isAdmin && showCreateButton && (
              <button
                type="button"
                onClick={() => navigate('/projects/new')}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create your first project
              </button>
            )}
          </div>
        )}

        {/* Expanded single-project view */}
        {!loading && expandedProject && (
          <ProjectDetailPanel
            projectId={expandedProject.id}
            projectName={expandedProject.name}
            currentPhase={expandedProject.currentphase}
            onBack={() => setExpandedProjectId(null)}
            onOpen={() => navigate(`/projects/${expandedProject.id}`)}
          />
        )}

        {/* Collapsed project list */}
        {!loading && !expandedProject && projects.length > 0 && (
          <div className="space-y-2">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isSelected={false}
                onClick={() => setExpandedProjectId(project.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
