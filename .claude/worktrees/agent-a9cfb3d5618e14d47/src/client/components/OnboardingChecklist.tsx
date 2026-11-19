import React from 'react';
import { Check, Circle, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  actionPath: string;
  actionLabel: string;
}

interface OnboardingChecklistProps {
  items: ChecklistItem[];
  loading?: boolean;
}

/**
 * OnboardingChecklist Component
 * Displays a checklist of onboarding tasks with progress tracking
 */
export const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({
  items,
  loading = false,
}) => {
  const navigate = useNavigate();

  const completedCount = items.filter(item => item.completed).length;
  const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0;

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
        <div className="animate-pulse">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded mb-6"></div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-200 dark:bg-slate-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
          Getting Started
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {completedCount}/{items.length}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-start gap-4 p-4 rounded-lg border transition-all ${
              item.completed
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <div className="flex-shrink-0 mt-0.5">
              {item.completed ? (
                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full border-2 border-slate-300 dark:border-slate-500 flex items-center justify-center">
                  <Circle className="w-3 h-3 text-slate-300 dark:text-slate-500" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h4
                className={`font-medium ${
                  item.completed
                    ? 'text-green-800 dark:text-green-200 line-through'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {item.title}
              </h4>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {item.description}
              </p>
            </div>

            {!item.completed && (
              <button
                onClick={() => navigate(item.actionPath)}
                className="flex-shrink-0 flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                {item.actionLabel}
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {completedCount === items.length && (
        <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <p className="text-sm text-green-800 dark:text-green-200 text-center font-medium">
            🎉 Congratulations! You've completed all onboarding tasks.
          </p>
        </div>
      )}
    </div>
  );
};

export default OnboardingChecklist;
