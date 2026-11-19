import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Play,
  Clock,
  AlertTriangle,
  ShieldAlert,
  Bot,
  User as UserIcon,
} from "lucide-react";
import { useTranslation } from "../../i18n";
import { testApi, scopeLabel, type TestItemRow, type TestPlanRow, type TestCycleRow } from "./testApi";
import { RegressionView } from "./RegressionView";
import type { TestRunSnapshot } from "~/shared/types/tests";

/** How often the live view asks the server what the runner is doing. */
const POLL_MS = 2000;

interface TestSuitePanelProps {
  projectId: string;
  specId?: string;
  canControl: boolean;
  isAdmin: boolean;
}

// [SCOPE 111 / T029..T031] BEGIN — QA suite panel, live run view, cycle header
//
// Replaces the flat task list in the QA phase. Shows the MACHINE set only — the
// human set exists but is deliberately withheld until the release is promoted
// to UAT, and is surfaced here as a count so the team can see it is there
// without being able to act on it.
export function TestSuitePanel({ projectId, specId, canControl, isAdmin }: TestSuitePanelProps) {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<TestPlanRow[]>([]);
  const [items, setItems] = useState<TestItemRow[]>([]);
  const [cycle, setCycle] = useState<TestCycleRow | null>(null);
  const [humanPending, setHumanPending] = useState(0);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<TestRunSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "outstanding" | "forced" | "failing">("all");
  // Scope filter. A project can carry a suite per scope, and a flat list across
  // a hundred of them answers nobody's question — the useful question is always
  // "what is outstanding for THIS scope".
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [skipTesting, setSkipTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [{ plans: planRows }, { current }, { skiptesting }] = await Promise.all([
        testApi.listPlans(projectId, specId),
        testApi.cycles(projectId),
        testApi.getSkipTesting(projectId),
      ]);
      setPlans(planRows);
      setCycle(current);
      setSkipTesting(skiptesting);

      const machine: TestItemRow[] = [];
      let pendingHuman = 0;
      // Only fetch the scope in view. Loading every plan's items to then hide
      // most of them is what makes a hundred-scope project feel broken.
      const inView = planRows.filter((p) => scopeFilter === "all" || p.id === scopeFilter);
      for (const plan of inView) {
        const { items: rows } = await testApi.listItems(plan.id);
        for (const row of rows) {
          if (row.executor === "machine") machine.push(row);
          else if (!row.released) pendingHuman += 1;
        }
      }
      setItems(machine);
      setHumanPending(pendingHuman);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("testSuite.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [projectId, specId, scopeFilter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll ONLY while a run is open. A finished or stalled run stops the timer —
  // an indefinite poll against a dead run is just load with no information.
  useEffect(() => {
    if (!activeRunId) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const { snapshot: snap } = await testApi.runSnapshot(activeRunId);
        if (cancelled) return;
        setSnapshot(snap);
        if (snap.status !== "running") {
          setActiveRunId(null);
          void load();
        }
      } catch {
        /* transient — the next tick retries */
      }
    };

    void tick();
    const handle = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [activeRunId, load]);

  const startRun = async (gate: string) => {
    try {
      setError(null);
      const ids = items.filter((i) => i.gate === gate).map((i) => i.id);
      if (ids.length === 0) {
        setError(t("testSuite.noItemsForGate", { gate }));
        return;
      }
      const { run } = await testApi.startRun({ projectId, specId, gate, itemIds: ids });
      setActiveRunId(run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("testSuite.runFailed"));
    }
  };

  const visible = items.filter((item) => {
    if (filter === "outstanding") return !item.lastresultstatus;
    if (filter === "forced") return item.forceresolved;
    if (filter === "failing") return item.lastresultstatus === "fail";
    return true;
  });

  const gates = Array.from(new Set(items.map((i) => i.gate))).sort();

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-4 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("testSuite.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* [SCOPE 111 / Amendment A] Loud when testing is off. This sits ABOVE
          everything — a project whose release gate is disabled should never
          have to be discovered by reading a settings page. */}
      {skipTesting && (
        <div className="rounded-xl border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            {t("testSuite.skipBannerTitle")}
          </p>
          <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-200">
            {t("testSuite.skipBannerBody")}
          </p>
        </div>
      )}

      <CycleHeader cycle={cycle} humanPending={humanPending} />

      <ScopePicker plans={plans} value={scopeFilter} onChange={setScopeFilter} />

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {activeRunId && snapshot ? (
        <LiveRunView snapshot={snapshot} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {canControl &&
            gates.map((gate) => (
              <button
                key={gate}
                type="button"
                onClick={() => void startRun(gate)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                {t("testSuite.runGate", { gate })}
              </button>
            ))}
          <div className="ml-auto flex gap-1">
            {(["all", "outstanding", "forced", "failing"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-md px-2 py-1 text-xs transition-colors ${
                  filter === key
                    ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                    : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                {t(`testSuite.filter.${key}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60 overflow-hidden">
        {visible.length === 0 ? (
          <p className="p-4 text-sm text-gray-500 dark:text-gray-400">{t("testSuite.empty")}</p>
        ) : (
          visible.map((item) => (
            <ItemRow key={item.id} item={item} isAdmin={isAdmin} onChanged={load} />
          ))
        )}
      </div>

      {/* The pre-UAT comparison. Shown once a cycle exists — a release is
          promoted on the strength of this, so it belongs beside the suite
          rather than on a separate screen someone has to remember to open. */}
      {cycle && !activeRunId && <RegressionView cycleId={cycle.id} />}

      {isAdmin && (
        <SkipTestingControl
          projectId={projectId}
          value={skipTesting}
          onChanged={load}
        />
      )}

      {plans.length > 0 && isAdmin && (
        <ForceScopeControls plans={plans} onChanged={load} />
      )}
    </div>
  );
}

/**
 * Scope filter (SCOPE-111 — "which scope am I looking at?").
 *
 * Exported because the tester's panel needs the identical control; two pickers
 * that drift apart would be worse than one shared one.
 */
export function ScopePicker({
  plans,
  value,
  onChange,
  countOf,
}: {
  plans: TestPlanRow[];
  value: string;
  onChange: (v: string) => void;
  /** Which count to show per scope; defaults to total items. */
  countOf?: (plan: TestPlanRow) => number | undefined;
}) {
  const { t } = useTranslation();

  // Nothing to filter — don't show a control that can only have one answer.
  if (plans.length <= 1) return null;

  const total = plans.reduce((n, p) => n + (countOf?.(p) ?? p.itemcount ?? 0), 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label
        htmlFor="scope-filter"
        className="text-xs font-medium text-gray-500 dark:text-gray-400"
      >
        {t("testSuite.scopeFilter")}
      </label>
      <select
        id="scope-filter"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-md"
      >
        <option value="all">{t("testSuite.allScopes", { count: total })}</option>
        {plans.map((plan) => {
          const n = countOf?.(plan) ?? plan.itemcount ?? 0;
          return (
            <option key={plan.id} value={plan.id}>
              {scopeLabel(plan)} ({n})
            </option>
          );
        })}
      </select>
    </div>
  );
}

/**
 * The cycle header. When a version bump withdraws signoffs this is where the
 * team learns why — work disappearing with no explanation reads as a defect.
 */
function CycleHeader({ cycle, humanPending }: { cycle: TestCycleRow | null; humanPending: number }) {
  const { t } = useTranslation();
  if (!cycle) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-4 py-2.5">
      <span className="text-sm font-semibold text-gray-900 dark:text-white">
        {t("testSuite.cycle", { version: cycle.version })}
      </span>
      <span className="rounded-full bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-700 dark:text-gray-300">
        {t(`testSuite.cycleStatus.${cycle.status}`)}
      </span>
      {humanPending > 0 && (
        <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
          {t("testSuite.humanPending", { count: humanPending })}
        </span>
      )}
    </div>
  );
}

/**
 * The live run. On start it renders the FULL declared list with every item
 * pending — showing what is about to happen, not only what already has, which
 * is the difference between watching a run and receiving a verdict.
 */
function LiveRunView({ snapshot }: { snapshot: TestRunSnapshot }) {
  const { t } = useTranslation();
  const stalled = snapshot.status === "stalled";

  return (
    <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/10 overflow-hidden">
      <div className="flex items-center gap-3 border-b border-indigo-100 dark:border-indigo-800/60 px-4 py-2.5">
        {stalled ? (
          <AlertTriangle className="w-4 h-4 text-amber-500" />
        ) : (
          <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
        )}
        <span className="text-sm font-semibold text-gray-900 dark:text-white">
          {stalled ? t("testSuite.runStalled") : t("testSuite.runRunning")}
        </span>
        <span className="ml-auto text-xs text-gray-600 dark:text-gray-300">
          {t("testSuite.runTotals", {
            passed: snapshot.totals.passed,
            failed: snapshot.totals.failed,
            total: snapshot.totals.total,
          })}
        </span>
      </div>

      <ul className="max-h-80 overflow-y-auto divide-y divide-indigo-100/70 dark:divide-indigo-900/40">
        {snapshot.items.map((item) => {
          const current = item.itemid === snapshot.currentitemid;
          return (
            <li
              key={item.itemid}
              className={`flex items-start gap-3 px-4 py-2 ${
                current ? "bg-indigo-100/70 dark:bg-indigo-900/30" : ""
              }`}
            >
              <span className="mt-0.5 flex-shrink-0">
                {item.status === "pass" ? (
                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                ) : item.status === "fail" ? (
                  <XCircle className="w-4 h-4 text-red-500" />
                ) : current ? (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                ) : (
                  <Clock className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-900 dark:text-white">
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                    {item.itemkey}
                  </span>{" "}
                  {item.title}
                </p>
                {item.requirementid && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{item.requirementid}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ItemRow({
  item,
  isAdmin,
  onChanged,
}: {
  item: TestItemRow;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const toggleForce = async () => {
    setBusy(true);
    try {
      // Cycles override → inherit → override, so an admin can always get back
      // to "whatever the scope says" rather than being stuck on an explicit value.
      const next = item.forcetest === null ? !item.forceresolved : null;
      await testApi.setItemForce(item.id, next);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <span className="mt-0.5 flex-shrink-0">
        {item.lastresultstatus === "pass" ? (
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
        ) : item.lastresultstatus === "fail" ? (
          <XCircle className="w-4 h-4 text-red-500" />
        ) : (
          <Clock className="w-4 h-4 text-gray-300 dark:text-gray-600" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-900 dark:text-white">
          <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{item.itemkey}</span>{" "}
          {item.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          {item.requirementid && (
            <span className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-gray-600 dark:text-gray-300">
              {item.requirementid}
            </span>
          )}
          <span className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-gray-600 dark:text-gray-300">
            {item.gate}
          </span>
          <span className="text-gray-400 dark:text-gray-500">{item.priority}</span>
          <span className="text-gray-400 dark:text-gray-500">{item.risktier}</span>
          {item.origin === "user" ? (
            <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400">
              <UserIcon className="w-3 h-3" />
              {t("testSuite.origin.user")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-gray-400 dark:text-gray-500">
              <Bot className="w-3 h-3" />
              {t("testSuite.origin.ai")}
            </span>
          )}
          {item.forceresolved && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-300">
              <ShieldAlert className="w-3 h-3" />
              {t("testSuite.required")}
            </span>
          )}
        </div>
      </div>

      {isAdmin && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleForce()}
          title={
            item.forcetest === null
              ? t("testSuite.forceInherited")
              : t("testSuite.forceOverridden")
          }
          className="flex-shrink-0 rounded-md border border-gray-200 dark:border-gray-600 px-2 py-1 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          {item.forcetest === null ? t("testSuite.inherit") : t("testSuite.override")}
        </button>
      )}
    </div>
  );
}

/**
 * [SCOPE 111 / Amendment A] The project-level testing opt-out.
 *
 * Turning this on disables the release gate for EVERY scope at once, so it asks
 * for confirmation rather than toggling on a single click, and states the
 * consequence in the confirmation instead of a vague "are you sure?".
 */
function SkipTestingControl({
  projectId,
  value,
  onChanged,
}: {
  projectId: string;
  value: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const apply = async (next: boolean) => {
    setBusy(true);
    try {
      await testApi.setSkipTesting(projectId, next);
      setConfirming(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {t("testSuite.skipTitle")}
      </p>

      {value ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-amber-700 dark:text-amber-300">
            {t("testSuite.skipOn")}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void apply(false)}
            className="rounded-md bg-gray-800 dark:bg-gray-200 px-2.5 py-1 text-xs font-semibold text-white dark:text-gray-900 disabled:opacity-50"
          >
            {t("testSuite.skipReEnable")}
          </button>
        </div>
      ) : confirming ? (
        <div className="space-y-2">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {t("testSuite.skipConfirm")}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void apply(true)}
              className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {t("testSuite.skipConfirmYes")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md px-2.5 py-1 text-xs text-gray-600 dark:text-gray-300"
            >
              {t("testSuite.skipCancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {t("testSuite.skipOff")}
          </span>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-md border border-gray-200 dark:border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {t("testSuite.skipTurnOn")}
          </button>
        </div>
      )}

      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {t("testSuite.skipHint")}
      </p>
    </div>
  );
}

function ForceScopeControls({
  plans,
  onChanged,
}: {
  plans: TestPlanRow[];
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {t("testSuite.forceScopeTitle")}
      </p>
      <div className="space-y-1.5">
        {plans.map((plan) => (
          <label key={plan.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={plan.forcetest}
              onChange={async (e) => {
                await testApi.setPlanForce(plan.id, e.target.checked);
                onChanged();
              }}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            {t("testSuite.forceScopeLabel", { count: plan.itemcount })}
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {t("testSuite.forceScopeHint")}
      </p>
    </div>
  );
}
// [SCOPE 111 / T029..T031] END
