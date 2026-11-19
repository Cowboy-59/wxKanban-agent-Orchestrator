import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  FolderKanban,
  Plus,
  Search,
  SortAsc,
  SortDesc,
  FolderOpen,
} from "lucide-react";
import { AppShell } from "~/client/components/layout/AppShell";
import { ProjectCard } from "~/client/components/Projects/ProjectCard";
import { ProjectDetailPanel } from "~/client/components/Projects/ProjectDetailPanel";
import { CreateProjectModal } from "~/client/components/Projects/CreateProjectModal";
import { useAuth } from "~/client/context/AuthContext";
import { useProjects } from "~/client/lib/hooks/useProjects";
import { useTranslation } from "~/client/i18n"; // [SCOPE 052]

type SortField = "updatedat" | "createdat" | "name";
type SortDir = "asc" | "desc";

const PHASE_FILTERS = [
  { key: null, label: "All" },
  { key: "Design", label: "Design" },
  { key: "Implementation", label: "Implementation" },
  { key: "QA", label: "QA Testing" },
  { key: "HumanTesting", label: "Human Testing" },
  { key: "Beta", label: "Beta Release" },
  { key: "Release", label: "Release" },
] as const;

function ProjectListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 flex items-center gap-4 animate-pulse"
        >
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-40" />
              <div className="h-4 bg-gray-100 dark:bg-gray-700/60 rounded-full w-16" />
            </div>
            <div className="h-2.5 bg-gray-100 dark:bg-gray-700/60 rounded w-64" />
          </div>
          <div className="w-4 h-4 bg-gray-100 dark:bg-gray-700 rounded" />
        </div>
      ))}
    </div>
  );
}

export default function ProjectListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const location = useLocation();

  const { user } = useAuth();
  const isAdmin = user?.usertype === "ADMIN";

  // Non-admins see only their assigned projects by default; this toggles to all
  // company projects. Admins always see everything, so the toggle is hidden.
  const [showAll, setShowAll] = useState(false);

  const { data: allProjects = [], isLoading: loading, error, refetch } = useProjects(showAll);

  const [showCreateModal, setShowCreateModal] = useState(false);

  // Auto-open create modal when on /projects/new route
  useEffect(() => {
    if (location.pathname === '/projects/new') {
      setShowCreateModal(true);
    }
  }, [location.pathname]);
  const [searchQuery, setSearchQuery] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("updatedat");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  const handleProjectCreated = (project: { id: string; name: string }) => {
    navigate(`/projects/${project.id}`);
  };

  const filtered = allProjects
    .filter((p) => {
      if (phaseFilter && !(p.activePhases ?? []).includes(phaseFilter)) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const valA = sortField === "name" ? a.name.toLowerCase() : a[sortField];
      const valB = sortField === "name" ? b.name.toLowerCase() : b[sortField];
      const cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const expandedProject = expandedProjectId
    ? filtered.find((p) => p.id === expandedProjectId) ?? null
    : null;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <FolderKanban className="w-6 h-6 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">
                {t("projects.title")}
              </h1>
              {!loading && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {allProjects.length === 0
                    ? t("projects.noProjects")
                    : allProjects.length === 1
                      ? t("projects.countOne")
                      : t("projects.count", { count: allProjects.length })}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isAdmin && (
              <button
                type="button"
                onClick={() => setShowAll((prev) => !prev)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={showAll ? "Show only projects assigned to you" : "Show all projects in your organization"}
              >
                {showAll ? t("projects.myProjects") : t("projects.showAll")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t("projects.newProject")}
            </button>
          </div>
        </div>

        {/* Phase filter + search/sort — hidden when expanded */}
        {!expandedProject && (
          <>
            <div className="flex items-center gap-1.5 flex-wrap">
              {PHASE_FILTERS.map(({ key, label }) => (
                <button
                  key={String(key)}
                  type="button"
                  onClick={() => setPhaseFilter(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    phaseFilter === key
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("projects.searchPlaceholder")}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <span className="hidden sm:inline mr-1">{t("projects.sort")}</span>
                {(["updatedat", "createdat", "name"] as SortField[]).map((field) => {
                  const labels: Record<SortField, string> = {
                    updatedat: t("projects.sortUpdated"),
                    createdat: t("projects.sortCreated"),
                    name: t("projects.sortName"),
                  };
                  const active = sortField === field;
                  return (
                    <button
                      key={field}
                      type="button"
                      onClick={() => toggleSort(field)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md border transition-colors ${
                        active
                          ? "border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400"
                      }`}
                    >
                      {labels[field]}
                      {active && (sortDir === "asc" ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />)}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3">
            <p className="text-sm text-red-700 dark:text-red-400">
              {error instanceof Error ? error.message : t("projects.loadError")}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-sm font-medium text-red-700 dark:text-red-400 underline underline-offset-2 hover:no-underline"
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && <ProjectListSkeleton />}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && !expandedProject && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FolderOpen className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
            {searchQuery || phaseFilter ? (
              <>
                <p className="text-base font-medium text-gray-500 dark:text-gray-400">
                  {t("projects.noMatch")}
                </p>
                <button
                  type="button"
                  onClick={() => { setSearchQuery(""); setPhaseFilter(null); }}
                  className="mt-2 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {t("projects.clearFilters")}
                </button>
              </>
            ) : (
              <>
                <p className="text-base font-medium text-gray-500 dark:text-gray-400">
                  {t("projects.noProjects")}
                </p>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {t("projects.createFirst")}
                </button>
              </>
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
        {!loading && !expandedProject && filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map((project) => (
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

      <CreateProjectModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleProjectCreated}
      />
    </AppShell>
  );
}
