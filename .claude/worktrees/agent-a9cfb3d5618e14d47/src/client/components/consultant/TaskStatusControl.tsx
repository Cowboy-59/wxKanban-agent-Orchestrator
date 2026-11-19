import { useState } from "react";
import { X, AlertTriangle, PauseCircle } from "lucide-react";
import { useTranslation } from "../../i18n"; // [SCOPE 052]

type StatusChoice = "blocked" | "suspended";

interface TaskStatusControlProps {
  taskid: string;
  taskName: string;
  initialStatus: StatusChoice;
  onClose: () => void;
  onSubmitted: () => void;
}

/**
 * TaskStatusControl — modal that captures a required reason when marking
 * a task blocked or suspended (FR-007). Replaces window.prompt().
 */
export function TaskStatusControl({
  taskid,
  taskName,
  initialStatus,
  onClose,
  onSubmitted,
}: TaskStatusControlProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<StatusChoice>(initialStatus);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length === 0) {
      setError(t("workhub.reasonRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/consultant-hub/tasks/${taskid}/state`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason: reason.trim() }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || t("workhub.updateStateError"));
      }
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("workhub.unknownError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("workhub.changeStatus")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("workhub.task")}</p>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {taskName}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {t("workhub.newStatus")}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStatus("blocked")}
                className={`flex-1 px-3 py-2 text-sm rounded-md border flex items-center justify-center gap-1.5 ${
                  status === "blocked"
                    ? "bg-amber-600 text-white border-amber-600"
                    : "bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-400 border-amber-300"
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                {t("workhub.blocked")}
              </button>
              <button
                type="button"
                onClick={() => setStatus("suspended")}
                className={`flex-1 px-3 py-2 text-sm rounded-md border flex items-center justify-center gap-1.5 ${
                  status === "suspended"
                    ? "bg-purple-600 text-white border-purple-600"
                    : "bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-400 border-purple-300"
                }`}
              >
                <PauseCircle className="w-3.5 h-3.5" />
                {t("workhub.suspended")}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
              <strong>{t("workhub.blocked")}</strong>: {t("workhub.blockedDesc")}
              <strong className="ml-2">{t("workhub.suspended")}</strong>: {t("workhub.suspendedDesc")}
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              {t("workhub.reason")} <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              required
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
              placeholder={t("workhub.reasonPlaceholder")}
            />
          </div>

          {error ? (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
            >
              {t("workhub.cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting || reason.trim().length === 0}
              className="px-3 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? t("workhub.saving") : t("workhub.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
