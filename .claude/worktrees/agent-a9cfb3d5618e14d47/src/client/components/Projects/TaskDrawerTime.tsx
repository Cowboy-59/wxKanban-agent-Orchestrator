import { Clock } from "lucide-react";

interface Props {
  taskid: string;
  timeentriescount: number;
}

export function TaskDrawerTime({ timeentriescount }: Props) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-5 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
        <Clock className="w-4 h-4 flex-shrink-0 text-indigo-500 dark:text-indigo-400" />
        <span className="text-sm font-medium">
          {timeentriescount === 1
            ? "1 time entry recorded for this task."
            : `${timeentriescount} time entries recorded for this task.`}
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 ml-6">
        Open the Time tab to log time.
      </p>
    </div>
  );
}
