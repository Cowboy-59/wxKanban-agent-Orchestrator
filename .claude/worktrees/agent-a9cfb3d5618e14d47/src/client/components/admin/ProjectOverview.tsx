import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  FolderKanban, 
  Users, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  Filter,
  ArrowUpDown
} from "lucide-react";

interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  currentphase: string;
  status: string;
  createdat: string;
  hourlyrate: number | null;
  taskcount: number;
  completedtaskcount: number;
  inprogresstaskcount: number;
  opentaskcount: number;
  percentcomplete: number;
  assignedcount: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * ProjectOverview — Admin project summary grid with stats
 * Displays: project name | assigned members | task count | status | % complete
 */
export function ProjectOverview() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<"name" | "createdat" | "currentphase">("createdat");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
        sortBy,
        sortOrder,
      });

      if (statusFilter) {
        params.append("status", statusFilter);
      }

      const response = await fetch(`/api/projects/admin/projects?${params}`, {
        credentials: "include",
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Failed to fetch projects");
      }

      const data = await response.json();
      setProjects(data.projects);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [pagination.page, statusFilter, sortBy, sortOrder]);

  const handleSort = (field: "name" | "createdat" | "currentphase") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
      ARCHIVE: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
      BRANCHED: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    };
    return styles[status] || "bg-slate-100 text-slate-800";
  };

  const getPhaseBadge = (phase: string) => {
    const styles: Record<string, string> = {
      Design: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      Implementation: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
      QA: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
      Beta: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
      Release: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    };
    return styles[phase] || "bg-slate-100 text-slate-800";
  };

  if (loading && projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <FolderKanban className="w-5 h-5 text-indigo-500" />
          Project Overview
        </h2>
        <div className="flex items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              <option value="">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVE">Archived</option>
              <option value="BRANCHED">Branched</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Projects Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    Project
                    {sortBy === "name" && <ArrowUpDown className="w-3 h-3" />}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Phase
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <div className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    Team
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Tasks
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Progress
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => handleSort("createdat")}
                >
                  <div className="flex items-center gap-1">
                    Created
                    {sortBy === "createdat" && <ArrowUpDown className="w-3 h-3" />}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {projects.map((project) => (
                <tr 
                  key={project.id} 
                  className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/admin/projects/${project.id}`)}
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {project.name}
                      </p>
                      {project.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                          {project.description}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getPhaseBadge(project.currentphase)}`}>
                      {project.currentphase}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(project.status)}`}>
                      {project.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-sm text-slate-700 dark:text-slate-300">
                      <Users className="w-4 h-4 text-slate-400" />
                      {project.assignedcount}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-slate-700 dark:text-slate-300">
                      <span className="font-medium">{project.taskcount}</span>
                      <span className="text-slate-400 text-xs ml-1">
                        ({project.completedtaskcount} done, {project.inprogresstaskcount} in progress, {project.opentaskcount} open)
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden w-24">
                        <div 
                          className="h-full bg-indigo-500 rounded-full transition-all"
                          style={{ width: `${project.percentcomplete}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400 w-8">
                        {project.percentcomplete}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                    {new Date(project.createdat).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/projects/${project.id}`);
                      }}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
              {projects.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                    <FolderKanban className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                    <p>No projects found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to{" "}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
              {pagination.total} projects
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                disabled={pagination.page === 1}
                className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Previous
              </button>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                disabled={pagination.page === pagination.totalPages}
                className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
