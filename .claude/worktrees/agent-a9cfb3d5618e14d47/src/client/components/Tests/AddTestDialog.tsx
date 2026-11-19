import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "../../i18n";
import { testApi } from "./testApi";

interface AddTestDialogProps {
  planId: string;
  onClose: () => void;
  onCreated: () => void;
}

interface DraftStep {
  action: string;
  expected: string;
}

/** Words that describe a feeling rather than an observation. An expected result
 * built from these cannot be checked by anyone but its author, which is exactly
 * what makes a test worthless six months later. */
const VAGUE = ["works", "correct", "as expected", "looks right", "fine", "ok", "valid", "good"];

// [SCOPE 111 / T035] BEGIN — A tester adds a test from real use
//
// The point of this dialog is that the tester found something the AI could not
// derive from the specification — an order of operations nobody wrote down, a
// value that breaks a screen. It is captured to the SAME standard as a generated
// item, because a test recorded as "check it works" proves nothing later.
export function AddTestDialog({ planId, onClose, onCreated }: AddTestDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [preconditions, setPreconditions] = useState("");
  const [postconditions, setPostconditions] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([{ action: "", expected: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vagueSteps = steps
    .map((s, i) => ({ i, bad: VAGUE.some((w) => s.expected.trim().toLowerCase() === w) }))
    .filter((s) => s.bad)
    .map((s) => s.i + 1);

  const submit = async () => {
    setError(null);
    if (!title.trim()) return setError(t("addTest.needTitle"));
    const filled = steps.filter((s) => s.action.trim());
    if (filled.length === 0) return setError(t("addTest.needStep"));
    if (filled.some((s) => !s.expected.trim())) return setError(t("addTest.needExpected"));

    setBusy(true);
    try {
      await testApi.addItem(planId, {
        title: title.trim(),
        gate: "ui-flow",
        detail: {
          preconditions: preconditions.split("\n").map((s) => s.trim()).filter(Boolean),
          postconditions: postconditions.split("\n").map((s) => s.trim()).filter(Boolean),
          steps: filled.map((s, i) => ({
            step: i + 1,
            action: s.action.trim(),
            expected: s.expected.trim(),
          })),
          testData: [],
          flow: null,
          exemptions: [],
        },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("addTest.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white dark:bg-gray-800 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {t("addTest.title")}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("addTest.intro")}</p>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t("addTest.whatHappened")}
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("addTest.titlePlaceholder")}
              className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t("addTest.setup")}
            </span>
            <textarea
              value={preconditions}
              onChange={(e) => setPreconditions(e.target.value)}
              rows={2}
              placeholder={t("addTest.setupPlaceholder")}
              className="mt-1 w-full resize-none rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white"
            />
          </label>

          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t("addTest.steps")}
            </span>
            <div className="mt-1 space-y-2">
              {steps.map((step, i) => (
                <div key={i} className="flex gap-2">
                  <span className="mt-2 w-4 text-xs text-gray-400">{i + 1}</span>
                  <input
                    value={step.action}
                    onChange={(e) => {
                      const next = [...steps];
                      next[i] = { ...next[i], action: e.target.value };
                      setSteps(next);
                    }}
                    placeholder={t("addTest.actionPlaceholder")}
                    className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white"
                  />
                  <input
                    value={step.expected}
                    onChange={(e) => {
                      const next = [...steps];
                      next[i] = { ...next[i], expected: e.target.value };
                      setSteps(next);
                    }}
                    placeholder={t("addTest.expectedPlaceholder")}
                    className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white"
                  />
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                      className="text-gray-300 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSteps([...steps, { action: "", expected: "" }])}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400"
            >
              <Plus className="w-3 h-3" />
              {t("addTest.addStep")}
            </button>

            {/* Guidance, not a hard block — a tester who insists still gets
                their test recorded, which beats losing the observation. */}
            {vagueSteps.length > 0 && (
              <p className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                {t("addTest.vagueWarning", { steps: vagueSteps.join(", ") })}
              </p>
            )}
          </div>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t("addTest.after")}
            </span>
            <textarea
              value={postconditions}
              onChange={(e) => setPostconditions(e.target.value)}
              rows={2}
              placeholder={t("addTest.afterPlaceholder")}
              className="mt-1 w-full resize-none rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white"
            />
          </label>

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300"
          >
            {t("addTest.cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {t("addTest.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
// [SCOPE 111 / T035] END
