import { useState } from "react";
import { X, Check, Clock3 } from "lucide-react";
import { useTranslation } from "../../i18n"; // [SCOPE 052]

interface BillablePromptModalProps {
  entryid: string;
  taskName: string;
  elapsedSeconds: number;
  onClose: () => void;
  onSubmitted: () => void;
}

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, "0")}:${m
    .toString()
    .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * BillablePromptModal — opens after a manual timer is stopped (FR-004).
 * Captures billable Y/N and optional notes, then PATCHes the entry.
 */
export function BillablePromptModal({
  entryid,
  taskName,
  elapsedSeconds,
  onClose,
  onSubmitted,
}: BillablePromptModalProps) {
  const { t } = useTranslation();
  const [billable, setBillable] = useState(true);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/time-tracking/entries/${entryid}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billable,
          description: notes.trim() || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || t("workhub.saveEntryError"));
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
          <div className="flex items-center gap-2">
            <Clock3 className="w-4 h-4 text-emerald-700" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("workhub.saveTimeEntry")}
            </h2>
          </div>
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
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("workhub.duration")}</p>
            <p className="text-lg font-mono text-emerald-700 dark:text-emerald-400">
              {formatElapsed(elapsedSeconds)}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {t("workhub.billableQ")}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBillable(true)}
                className={`flex-1 px-3 py-2 text-sm rounded-md border ${
                  billable
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700"
                }`}
              >
                {billable ? <Check className="w-3 h-3 inline mr-1" /> : null}
                {t("workhub.billable")}
              </button>
              <button
                type="button"
                onClick={() => setBillable(false)}
                className={`flex-1 px-3 py-2 text-sm rounded-md border ${
                  !billable
                    ? "bg-slate-600 text-white border-slate-600"
                    : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700"
                }`}
              >
                {!billable ? <Check className="w-3 h-3 inline mr-1" /> : null}
                {t("workhub.nonBillable")}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              {t("workhub.notesOptional")}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
              placeholder={t("workhub.notesPlaceholder")}
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
              disabled={submitting}
              className="px-3 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? t("workhub.saving") : t("workhub.saveEntry")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
