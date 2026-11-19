interface TaskRow {
  id: string;
  name: string;
  priority: string;
  status: string;
  assignee: string | null;
  duedate: string | null;
}

interface ScopeTaskGroupProps {
  specnumber: string | null;
  title: string;
  status: string | null;
  tasks: TaskRow[];
}

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400' },
  implementing: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  tasks_generated: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-400' },
  planned: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400' },
  released: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
};

const PRIORITY_BADGE: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
  high: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400' },
  medium: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400' },
  low: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400' },
};

const TASK_STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  open: { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-700 dark:text-slate-300' },
  in_progress: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  completed: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
};

export default function ScopeTaskGroup({ specnumber, title, status, tasks }: ScopeTaskGroupProps) {
  const scopeStatus = STATUS_BADGE[status || 'draft'] || STATUS_BADGE.draft;

  return (
    <div className="mb-6">
      {/* Scope heading */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200 dark:border-slate-700">
        {specnumber && (
          <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
            [{specnumber}]
          </span>
        )}
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </span>
        {status && (
          <span className={`text-xs px-1.5 py-0.5 rounded ${scopeStatus.bg} ${scopeStatus.text}`}>
            {status}
          </span>
        )}
        <span className="text-xs text-slate-500 dark:text-slate-400 ml-auto">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Task table */}
      {tasks.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 italic px-2">No matching tasks</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                <th className="text-left py-1 px-2 font-medium">Task</th>
                <th className="text-center py-1 px-2 font-medium w-20">Priority</th>
                <th className="text-center py-1 px-2 font-medium w-24">Status</th>
                <th className="text-left py-1 px-2 font-medium w-32">Assignee</th>
                <th className="text-left py-1 px-2 font-medium w-28">Due Date</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const priBadge = PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.medium;
                const statusBadge = TASK_STATUS_BADGE[task.status] || TASK_STATUS_BADGE.open;
                return (
                  <tr
                    key={task.id}
                    className="border-t border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30"
                  >
                    <td className="py-2 px-2 text-slate-900 dark:text-slate-100">{task.name}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${priBadge.bg} ${priBadge.text}`}>
                        {task.priority}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${statusBadge.bg} ${statusBadge.text}`}>
                        {task.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-slate-600 dark:text-slate-400 text-xs truncate">
                      {task.assignee || '—'}
                    </td>
                    <td className="py-2 px-2 text-slate-600 dark:text-slate-400 text-xs">
                      {task.duedate ? new Date(task.duedate).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
