import { FileText } from "lucide-react";

interface Props {
  taskid: string;
  notescount: number;
}

export function TaskDrawerNotes({ notescount }: Props) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-5 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
        <FileText className="w-4 h-4 flex-shrink-0 text-indigo-500 dark:text-indigo-400" />
        <span className="text-sm font-medium">
          {notescount === 1
            ? "1 note on this task."
            : `${notescount} notes on this task.`}
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 ml-6">
        Note management coming soon.
      </p>
    </div>
  );
}
