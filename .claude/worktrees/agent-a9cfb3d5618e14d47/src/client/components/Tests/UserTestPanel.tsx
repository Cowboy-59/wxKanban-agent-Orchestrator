import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle,
  XCircle,
  Loader2,
  ShieldAlert,
  RotateCcw,
  Plus,
  ExternalLink,
  User as UserIcon,
} from "lucide-react";
import { useTranslation } from "../../i18n";
import {
  testApi,
  type TestItemRow,
  type TestPlanRow,
  type TestCycleRow,
  type RetestRow,
} from "./testApi";
import { AddTestDialog } from "./AddTestDialog";
import { ScopePicker } from "./TestSuitePanel";

interface UserTestPanelProps {
  projectId: string;
  specId?: string;
  canEdit: boolean;
}

// [SCOPE 111 / T033..T036] BEGIN — The tester's surface
//
// Replaces the flat task list in User Testing. A tester is shown WHAT TO DO —
// preconditions, numbered steps with the expected result beside each action,
// postconditions — rather than a task title they have to interpret. Before the
// set is released it says so plainly, because an empty list that might mean
// "nothing to do" or "not ready yet" is worse than either.
export function UserTestPanel({ projectId, specId, canEdit }: UserTestPanelProps) {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<TestPlanRow[]>([]);
  const [items, setItems] = useState<TestItemRow[]>([]);
  const [retests, setRetests] = useState<RetestRow[]>([]);
  const [cycle, setCycle] = useState<TestCycleRow | null>(null);
  const [unreleased, setUnreleased] = useState(0);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Same scope filter as the QA panel — a tester with sixty released tests
  // across a dozen scopes needs to work one scope at a time.
  const [scopeFilter, setScopeFilter] = useState<string>("all");

  const load = useCallback(async () => {
    try {
      setError(null);
      const [{ plans: planRows }, { current }] = await Promise.all([
        testApi.listPlans(projectId, specId),
        testApi.cycles(projectId),
      ]);
      setPlans(planRows);
      setCycle(current);

      const released: TestItemRow[] = [];
      let pending = 0;
      const inView = planRows.filter((p) => scopeFilter === "all" || p.id === scopeFilter);
      for (const plan of inView) {
        const { items: rows } = await testApi.listItems(plan.id, { executor: "human" });
        for (const row of rows) {
          if (row.released) released.push(row);
          else pending += 1;
        }
      }
      setUnreleased(pending);

      const { retests: marks } = await testApi.retests(current.id);
      setRetests(marks);

      // Retest items first — they are the shortest path back to a promotable
      // release — then required, then the rest.
      const markedIds = new Set(marks.filter((m) => !m.resolution).map((m) => m.itemid));
      released.sort((a, b) => {
        const rank = (i: TestItemRow) =>
          markedIds.has(i.id) ? 0 : i.forceresolved ? 1 : 2;
        return rank(a) - rank(b) || a.itemkey.localeCompare(b.itemkey);
      });
      setItems(released);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("userTest.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [projectId, specId, scopeFilter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const retestFor = (itemId: string) =>
    retests.find((m) => m.itemid === itemId && !m.resolution) ?? null;

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-4 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("userTest.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Counts here are the HUMAN set — a tester does not care how many
          machine items a scope carries. */}
      <ScopePicker
        plans={plans}
        value={scopeFilter}
        onChange={setScopeFilter}
        countOf={(p) => p.humancount}
      />

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Not released yet — say why, rather than showing an ambiguous empty list. */}
      {items.length === 0 && unreleased > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {t("userTest.notReleasedTitle")}
          </p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            {t("userTest.notReleasedBody", { count: unreleased })}
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t("userTest.summary", {
              required: items.filter((i) => i.forceresolved).length,
              optional: items.filter((i) => !i.forceresolved).length,
              version: cycle?.version ?? "",
            })}
          </p>
          {canEdit && plans[0] && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Plus className="w-3.5 h-3.5" />
              {t("userTest.addTest")}
            </button>
          )}
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <TestCard
            key={item.id}
            item={item}
            retest={retestFor(item.id)}
            expanded={openItemId === item.id}
            canEdit={canEdit}
            onToggle={() => setOpenItemId(openItemId === item.id ? null : item.id)}
            onChanged={load}
          />
        ))}
      </div>

      {adding && plans[0] && (
        <AddTestDialog
          planId={plans[0].id}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function TestCard({
  item,
  retest,
  expanded,
  canEdit,
  onToggle,
  onChanged,
}: {
  item: TestItemRow;
  retest: RetestRow | null;
  expanded: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [filed, setFiled] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [dismissReason, setDismissReason] = useState("");

  const record = async (passed: boolean) => {
    // FR-024 — a failure without a reason is refused here as well as server
    // side, so the tester finds out before losing what they typed.
    if (!passed && !notes.trim()) {
      setLocalError(t("userTest.failNeedsReason"));
      return;
    }
    setBusy(true);
    setLocalError(null);
    try {
      const res = await testApi.signoff(item.id, passed, notes.trim() || undefined);
      if (res.bugreportid) setFiled(res.bugreportid);
      else onChanged();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : t("userTest.signoffFailed"));
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async () => {
    if (!retest || !dismissReason.trim()) return;
    setBusy(true);
    try {
      await testApi.dismissRetest(retest.id, dismissReason.trim());
      onChanged();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : t("userTest.dismissFailed"));
    } finally {
      setBusy(false);
    }
  };

  const steps = item.detail?.steps ?? [];

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60"
      >
        <span className="mt-0.5 flex-shrink-0">
          {item.lastresultstatus === "pass" && !retest ? (
            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
          ) : retest ? (
            <RotateCcw className="w-4 h-4 text-amber-500" />
          ) : (
            <span className="block h-4 w-4 rounded-full border-2 border-gray-300 dark:border-gray-600" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-900 dark:text-white">{item.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-mono text-gray-400 dark:text-gray-500">{item.itemkey}</span>
            {item.forceresolved ? (
              <span className="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-300">
                <ShieldAlert className="w-3 h-3" />
                {t("userTest.required")}
              </span>
            ) : (
              <span className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-gray-500 dark:text-gray-400">
                {t("userTest.optional")}
              </span>
            )}
            {item.origin === "user" && (
              <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400">
                <UserIcon className="w-3 h-3" />
                {t("userTest.testerAuthored")}
              </span>
            )}
          </div>

          {/* A Retest is NOT the same as never-tested — the tester did this
              before and is being asked again, so the reason is shown with it. */}
          {retest && (
            <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-2.5 py-2">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                {t("userTest.retestTitle")}
              </p>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                {retest.reason === "broad"
                  ? t("userTest.retestBroad")
                  : retest.reason === "undetermined"
                    ? t("userTest.retestUndetermined")
                    : t("userTest.retestImpact", {
                        path: retest.triggerpath ?? "",
                        hops: retest.pathlength ?? 0,
                      })}
              </p>
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700/60 px-4 py-3 space-y-3">
          {(item.detail?.preconditions?.length ?? 0) > 0 && (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t("userTest.preconditions")}
              </h4>
              <ul className="mt-1 space-y-0.5">
                {item.detail.preconditions?.map((p, i) => (
                  <li key={i} className="text-sm text-gray-700 dark:text-gray-300">
                    • {p}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {steps.length > 0 && (
            <section className="overflow-x-auto">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t("userTest.steps")}
              </h4>
              <table className="mt-1 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                    <th className="w-8 py-1">#</th>
                    <th className="py-1">{t("userTest.action")}</th>
                    <th className="py-1">{t("userTest.expected")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {steps.map((s) => (
                    <tr key={s.step} className="align-top">
                      <td className="py-1.5 text-gray-400">{s.step}</td>
                      <td className="py-1.5 pr-3 text-gray-800 dark:text-gray-200">{s.action}</td>
                      <td className="py-1.5 text-gray-600 dark:text-gray-400">{s.expected}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {(item.detail?.postconditions?.length ?? 0) > 0 && (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t("userTest.postconditions")}
              </h4>
              <ul className="mt-1 space-y-0.5">
                {item.detail.postconditions?.map((p, i) => (
                  <li key={i} className="text-sm text-gray-700 dark:text-gray-300">
                    • {p}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {filed ? (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2">
              <p className="text-sm text-red-800 dark:text-red-200">{t("userTest.bugFiled")}</p>
              <a
                href={`/projects?tab=bugs&report=${filed}`}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-300 underline"
              >
                {t("userTest.viewBug")}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ) : (
            canEdit && (
              <div className="space-y-2">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder={t("userTest.notesPlaceholder")}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
                {localError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{localError}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void record(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    {t("userTest.pass")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void record(false)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    {t("userTest.fail")}
                  </button>
                  {retest && !dismissing && (
                    <button
                      type="button"
                      onClick={() => setDismissing(true)}
                      className="rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      {t("userTest.dismissRetest")}
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {t("userTest.failHint")}
                </p>

                {/* Dismissal keeps the ORIGINAL signoff standing — it is not a
                    fresh pass, and never renders as one. */}
                {retest && dismissing && (
                  <div className="space-y-1.5 rounded-lg border border-gray-200 dark:border-gray-600 p-2.5">
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      {t("userTest.dismissExplain")}
                    </p>
                    <input
                      value={dismissReason}
                      onChange={(e) => setDismissReason(e.target.value)}
                      placeholder={t("userTest.dismissPlaceholder")}
                      className="w-full rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-xs text-gray-900 dark:text-white"
                    />
                    <button
                      type="button"
                      disabled={busy || !dismissReason.trim()}
                      onClick={() => void dismiss()}
                      className="rounded-md bg-gray-800 dark:bg-gray-200 px-2.5 py-1 text-xs font-semibold text-white dark:text-gray-900 disabled:opacity-50"
                    >
                      {t("userTest.confirmDismiss")}
                    </button>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
// [SCOPE 111 / T033..T036] END
