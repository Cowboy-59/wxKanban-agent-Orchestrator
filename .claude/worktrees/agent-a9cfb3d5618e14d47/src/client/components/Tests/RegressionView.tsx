import { useEffect, useState } from "react";
import { CheckCircle, TrendingDown, CircleDashed, Loader2 } from "lucide-react";
import { useTranslation } from "../../i18n";
import { testApi } from "./testApi";
import type { RegressionReport, RegressionEntry } from "~/shared/types/tests";

interface RegressionViewProps {
  cycleId: string;
}

// [SCOPE 111 / T032] BEGIN — The pre-UAT three-way comparison
//
// The split is the whole point. Without it, four brand-new red tests read as
// four regressions and bury the one that actually broke. "Newly failing" means
// the item passed THE LAST TIME IT RAN and does not now — measured against its
// own last execution, not against whatever the previous cycle happened to hold,
// so an item skipped for three versions is still judged fairly.
export function RegressionView({ cycleId }: RegressionViewProps) {
  const { t } = useTranslation();
  const [report, setReport] = useState<RegressionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { regression } = await testApi.regression(cycleId);
        if (!cancelled) setReport(regression);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("regression.failed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cycleId, t]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-4 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("regression.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t("regression.title", { version: report.version })}
        </h3>
        {report.newlyFailing.length > 0 && (
          <span className="rounded-full bg-red-100 dark:bg-red-900/40 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
            {t("regression.blocking", { count: report.newlyFailing.length })}
          </span>
        )}
      </div>

      {/* Regressions first: they are what stops the release, and they are a
          different kind of problem from work that was never finished. */}
      <Group
        tone="danger"
        icon={<TrendingDown className="w-4 h-4" />}
        title={t("regression.newlyFailing")}
        hint={t("regression.newlyFailingHint")}
        entries={report.newlyFailing}
        showLastPassed
      />
      <Group
        tone="muted"
        icon={<CircleDashed className="w-4 h-4" />}
        title={t("regression.neverPassed")}
        hint={t("regression.neverPassedHint")}
        entries={report.neverPassed}
      />
      <Group
        tone="ok"
        icon={<CheckCircle className="w-4 h-4" />}
        title={t("regression.stillPassing")}
        entries={report.stillPassing}
        collapsedByDefault
      />
    </div>
  );
}

function Group({
  tone,
  icon,
  title,
  hint,
  entries,
  showLastPassed = false,
  collapsedByDefault = false,
}: {
  tone: "danger" | "muted" | "ok";
  icon: React.ReactNode;
  title: string;
  hint?: string;
  entries: RegressionEntry[];
  showLastPassed?: boolean;
  collapsedByDefault?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(!collapsedByDefault);

  const toneClasses =
    tone === "danger"
      ? "border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
      : tone === "ok"
        ? "border-gray-200 dark:border-gray-700 text-green-700 dark:text-green-400"
        : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400";

  if (entries.length === 0) return null;

  return (
    <div className={`rounded-xl border ${toneClasses.split(" ").slice(0, 2).join(" ")} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <span className={toneClasses.split(" ").slice(2).join(" ")}>{icon}</span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">({entries.length})</span>
      </button>

      {hint && open && (
        <p className="px-4 pb-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      )}

      {open && (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
          {entries.map((entry) => (
            <li key={entry.itemid} className="px-4 py-2">
              <p className="text-sm text-gray-800 dark:text-gray-200">
                <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                  {entry.itemkey}
                </span>{" "}
                {entry.title}
              </p>
              {/* Naming the version it last passed in bounds the change window
                  without anyone reconstructing it from run history. */}
              {showLastPassed && entry.lastPassedVersion && (
                <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">
                  {t("regression.lastPassed", { version: entry.lastPassedVersion })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
// [SCOPE 111 / T032] END
