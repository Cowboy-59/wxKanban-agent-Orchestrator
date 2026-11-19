import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  FolderKanban,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
  Calendar,
  User,
  FileText,
  TrendingUp,
} from "lucide-react";

interface Task {
  id: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  issuetype: string;
  createdat: string;
  updatedat: string;
  assignedto: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface Phase {
  id: string;
  phasename: string;
  phasenumber: number;
  status: string;
  entryat: string | null;
  completedat: string | null;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  currentphase: string;
  status: string;
  createdat: string;
  updatedat: string;
  hourlyrate: number | null;
  allocatedhours: number | null;
  pmsystems: string | null;
}

interface TimeSummary {
  totalhours: string;
  billablehours: string;
  entrycount: number;
}

interface ProgressData {
  date: string;
  completed: number;
}

interface ProjectDetail {
  success: boolean;
  project: Project;
  tasks: Task[];
  phases: Phase[];
  timesummary: TimeSummary;
  progressbydate: ProgressData[];
}

/**
 * ProjectDrillDownPage — Task-level project detail page for admins
 * Shows task list, progress timeline, time tracking, and admin notes
 */
export function ProjectDrillDownPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"tasks" | "timeline" | "time">("tasks");
  const [taskFilter, setTaskFilter] = useState<string>("all");

  useEffect(() => {
    fetchProjectDetails();
  }, [id]);

  const fetchProjectDetails = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/admin/projects/${id}`, {
        credentials: "include",
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Failed to fetch project details");
      }

      const projectData = await response.json();
      setData(projectData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      open: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300",
      "in_progress": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
      completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
      orphaned: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    };
    return styles[status] || "bg-slate-100 text-slate-800";
  };

  const getPriorityBadge = (priority: string) => {
    const styles: Record<string, string> = {
      low: "bg-slate-100 text-slate-800",
      medium: "bg-blue-100 text-blue-800",
      high: "bg-amber-100 text-amber-800",
      critical: "bg-red-100 text-red-800",
    };
    return styles[priority] || "bg-slate-100 text-slate-800";
  };

  const filteredTasks = data?.tasks.filter((task) => {
    if (taskFilter === "all") return true;
    return task.status === taskFilter;
  }) || [];

  const taskStats = {
    total: data?.tasks.length || 0,
    completed: data?.tasks.filter((t) => t.status === "completed").length || 0,
    inProgress: data?.tasks.filter((t) => t.status === "in_progress").length || 0,
    open: data?.tasks.filter((t) => t.status === "open").length || 0,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <button
          onClick={() => navigate("/admin/projects")}
          className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Projects
        </button>
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          <p className="text-red-700 dark:text-red-400">{error || "Project not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Back Navigation */}
      <button
        onClick={() => navigate("/admin/projects")}
        className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Projects
      </button>

      {/* Project Header */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <FolderKanban className="w-6 h-6 text-indigo-500" />
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {data.project.name}
              </h1>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                data.project.status === "ACTIVE"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300"
              }`}>
                {data.project.status}
              </span>
            </div>
            {data.project.description && (
              <p className="text-slate-600 dark:text-slate-400 max-w-2xl">
                {data.project.description}
              </p>
            )}
            <div className="flex items-center gap-4 mt-3 text-sm text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Created {new Date(data.project.createdat).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1">
                <TrendingUp className="w-4 h-4" />
                Current Phase: {data.project.currentphase}
              </span>
              {data.project.hourlyrate && (
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  ${data.project.hourlyrate}/hr
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
              <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {taskStats.total}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Total Tasks</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {taskStats.completed}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Completed</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {data.timesummary.totalhours}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Hours Logged</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {new Set(data.tasks.map((t) => t.assignedto?.id).filter(Boolean)).size}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Team Members</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <div className="flex gap-6">
          {[
            { id: "tasks", label: "Tasks", icon: FileText },
            { id: "timeline", label: "Timeline", icon: Calendar },
            { id: "time", label: "Time Tracking", icon: Clock },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        {activeTab === "tasks" && (
          <div className="p-6">
            {/* Task Filter */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm text-slate-500 dark:text-slate-400">Filter:</span>
              <select
                value={taskFilter}
                onChange={(e) => setTaskFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                <option value="all">All Tasks</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
              <span className="text-sm text-slate-500 dark:text-slate-400 ml-auto">
                Showing {filteredTasks.length} of {data.tasks.length} tasks
              </span>
            </div>

            {/* Tasks Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                      Task
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                      Priority
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                      Assignee
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {filteredTasks.map((task) => (
                    <tr key={task.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {task.name}
                        </p>
                        {task.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                            {task.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(task.status)}`}>
                          {task.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getPriorityBadge(task.priority)}`}>
                          {task.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {task.assignedto ? (
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-slate-400" />
                            <span className="text-sm text-slate-700 dark:text-slate-300">
                              {task.assignedto.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                        {new Date(task.updatedat).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {filteredTasks.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                        No tasks found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "timeline" && (
          <div className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Project Phases
            </h3>
            <div className="space-y-4">
              {data.phases.map((phase) => (
                <div
                  key={phase.id}
                  className={`flex items-center gap-4 p-4 rounded-lg border ${
                    phase.status === "active"
                      ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800"
                      : phase.status === "completed"
                      ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                      : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center text-sm font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600">
                    {phase.phasenumber}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {phase.phasename}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {phase.status === "completed" && phase.completedat
                        ? `Completed on ${new Date(phase.completedat).toLocaleDateString()}`
                        : phase.status === "active"
                        ? "Currently active"
                        : "Pending"}
                    </p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    phase.status === "active"
                      ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400"
                      : phase.status === "completed"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300"
                  }`}>
                    {phase.status}
                  </span>
                </div>
              ))}
            </div>

            {/* Progress Chart */}
            {data.progressbydate.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
                  Task Completion (Last 30 Days)
                </h3>
                <div className="h-48 flex items-end gap-2">
                  {data.progressbydate.map((day) => (
                    <div
                      key={day.date}
                      className="flex-1 flex flex-col items-center gap-1"
                    >
                      <div
                        className="w-full bg-indigo-500 rounded-t-sm"
                        style={{ height: `${Math.max(day.completed * 10, 4)}px` }}
                      />
                      <span className="text-xs text-slate-500 dark:text-slate-400 rotate-45 origin-left">
                        {new Date(day.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "time" && (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">Total Hours</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {data.timesummary.totalhours}
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">Billable Hours</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {data.timesummary.billablehours}
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">Time Entries</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {data.timesummary.entrycount}
                </p>
              </div>
            </div>

            {data.project.allocatedhours && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    Budget Utilization
                  </span>
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {Math.round((parseFloat(data.timesummary.totalhours) / data.project.allocatedhours) * 100)}%
                  </span>
                </div>
                <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full"
                    style={{
                      width: `${Math.min((parseFloat(data.timesummary.totalhours) / data.project.allocatedhours) * 100, 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {data.timesummary.totalhours} of {data.project.allocatedhours} hours used
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
