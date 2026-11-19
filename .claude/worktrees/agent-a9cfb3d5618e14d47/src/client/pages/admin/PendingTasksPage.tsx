import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ScopeTaskGroup from '../../components/tasks/ScopeTaskGroup';
import { RefreshCw, Filter, ArrowLeft } from 'lucide-react';

interface TaskRow {
  id: string;
  name: string;
  priority: string;
  status: string;
  assignee: string | null;
  duedate: string | null;
}

interface ScopeGroup {
  id: string | null;
  specnumber: string | null;
  title: string;
  status: string | null;
  tasks: TaskRow[];
}

interface PendingTasksData {
  project: {
    id: string;
    name: string;
    currentphase: string;
    totalpending: number;
  };
  scopes: ScopeGroup[];
  unscopedtasks: TaskRow[];
}

export default function PendingTasksPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<PendingTasksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('both');
  const [showCompleted, setShowCompleted] = useState(false);

  const fetchData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);
      if (statusFilter !== 'both') params.set('status', statusFilter);
      if (showCompleted) params.set('showcompleted', 'true');

      const res = await fetch(
        `/api/admin/pending-tasks/projects/${id}?${params.toString()}`,
        { credentials: 'include' },
      );
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id, priorityFilter, statusFilter, showCompleted]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <a
              href="/admin/dashboard"
              className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <ArrowLeft className="w-5 h-5" />
            </a>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {data?.project.name || 'Loading...'}
              </h1>
              {data?.project && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Phase: {data.project.currentphase} &middot; {data.project.totalpending} pending task{data.project.totalpending !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 flex-wrap">
            <Filter className="w-4 h-4 text-slate-500 dark:text-slate-400" />

            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-600 dark:text-slate-400">Priority:</label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="text-sm px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              >
                <option value="all">All</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-600 dark:text-slate-400">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-sm px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              >
                <option value="both">Open + In Progress</option>
                <option value="open">Open / Todo only</option>
                <option value="in_progress">In Progress only</option>
              </select>
            </div>

            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
              />
              Show completed
            </label>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        ) : data ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            {/* Scoped tasks */}
            {data.scopes.map((scope) => (
              <ScopeTaskGroup
                key={scope.id || 'null'}
                specnumber={scope.specnumber}
                title={scope.title}
                status={scope.status}
                tasks={scope.tasks}
              />
            ))}

            {/* Unscoped tasks */}
            {data.unscopedtasks.length > 0 && (
              <ScopeTaskGroup
                specnumber={null}
                title="Unscoped Tasks"
                status={null}
                tasks={data.unscopedtasks}
              />
            )}

            {/* Empty state */}
            {data.scopes.length === 0 && data.unscopedtasks.length === 0 && (
              <p className="text-center text-slate-500 dark:text-slate-400 py-8">
                No matching tasks found.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
