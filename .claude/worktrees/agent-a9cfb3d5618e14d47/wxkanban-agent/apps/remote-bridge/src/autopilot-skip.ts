import { execFile } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

// [SCOPE 154 / T004] BEGIN — skip cascade via scope-impact.mjs (FR-003, SCOPE-132 FR-094)
// MODIFIED-BY: [SCOPE 154 / T007] — adds UnitRunRecord/recordUnitOutcome, the per-unit done/failed/parked line
//
// When a scope in the startup list is skipped (a parked gate, a failed unit, or the owner's own
// choice — decided by T005/T007, not here), its dependents must not quietly keep running against
// work that never landed. `_wxAI/impact/scope-impact.mjs` already knows a scope's dependents (it
// is the same script `/wxBrainstorm`'s Change Impact step uses); this module runs it for the
// skipped scope, classifies each dependent as already-touched ("partly worked") or untouched
// ("skipped") via `project.scope_stage`, posts the cascade for the owner's "keep" decision, and
// persists the choice so a dependent still partly worked is re-listed on the next run (FR-003
// acceptance criteria) rather than silently dropped.

export interface ScopeImpactDependent {
  scope: string;
  title: string;
  file: string;
}

export interface ScopeImpactResult {
  scope: string;
  found: boolean;
  title?: string;
  dependents: ScopeImpactDependent[];
}

/** Runs `_wxAI/impact/scope-impact.mjs <num> --json` in `root` and parses its result. */
export type ScopeImpactRunner = (scopeNum: string) => Promise<ScopeImpactResult>;

export function nodeScopeImpactRunner(root: string): ScopeImpactRunner {
  return (scopeNum) =>
    new Promise((resolve, reject) => {
      execFile(
        process.execPath,
        [join(root, "_wxAI", "impact", "scope-impact.mjs"), scopeNum, "--json"],
        { cwd: root },
        (err, stdout) => {
          if (err && !stdout) {
            reject(err);
            return;
          }
          try {
            resolve(JSON.parse(stdout) as ScopeImpactResult);
          } catch {
            reject(new Error("scope-impact.mjs returned unparsable output"));
          }
        },
      );
    });
}

export interface DependentStatus {
  scope: string;
  title: string;
  status: "skipped" | "partly-worked";
}

/** A dependent still in Design (or whose stage cannot be read) has had no work land; anything past that is partly worked. */
export async function classifyDependents(
  dependents: ScopeImpactDependent[],
  stageOf: (scopeNum: string) => Promise<string | undefined>,
): Promise<DependentStatus[]> {
  const out: DependentStatus[] = [];
  for (const d of dependents) {
    const stage = await stageOf(d.scope);
    out.push({ scope: d.scope, title: d.title, status: stage && stage !== "Design" ? "partly-worked" : "skipped" });
  }
  return out;
}

/** The room/K.A.I.N. post for a skip (FR-003). No dependents: posts with no dependent list. */
export function formatSkipCascade(scopeNum: string, title: string, dependents: DependentStatus[]): string {
  if (dependents.length === 0) {
    return `Autopilot is skipping SCOPE-${scopeNum} — ${title}. No dependent scopes are affected.`;
  }
  const lines = [
    `Autopilot is skipping SCOPE-${scopeNum} — ${title}. ${dependents.length} dependent scope${dependents.length === 1 ? "" : "s"} affected:`,
    "",
    ...dependents.map(
      (d, i) => `${i + 1}. SCOPE-${d.scope} — ${d.title} (${d.status === "partly-worked" ? "partly worked" : "skipped"})`,
    ),
    "",
    'Reply "keep <scope numbers>" for the ones safe to keep, or "keep none" to skip them all too.',
  ];
  return lines.join("\n");
}

const KEEP_RE = /^keep\s+(.+)$/i;

/** Parses the owner's reply to a cascade post. `undefined` means the text was not a keep reply at all. */
export function parseKeepReply(text: string): string[] | undefined {
  const t = text.trim();
  if (/^keep\s+none$/i.test(t)) return [];
  const m = KEEP_RE.exec(t);
  if (!m) return undefined;
  const nums = m[1]
    .split(/[,\s]+/)
    .map((s) => s.replace(/\D/g, ""))
    .filter(Boolean);
  return nums.length ? nums : undefined;
}

export interface AutopilotSkipRecord {
  scope: string;
  title: string;
  status: "skipped" | "partly-worked";
  dependents: DependentStatus[];
  /** Set once the owner answers; a partly-worked record with no answer yet is re-listed next run. */
  keptDependents?: string[];
}

// [SCOPE 154 / T007] A per-unit done/failed/parked line, so every unit ends with one explicit
// record in the run state (FR-006 acceptance), not just an in-memory outcome that vanishes
// when the process exits.
export interface UnitRunRecord {
  scope: string;
  title: string;
  status: "done" | "failed" | "parked";
  error?: string;
  waitingDependents?: { scope: string; title: string }[];
}

// [SCOPE 154 / T003] One entry per scope the startup list posted (FR-002), in build order. Its
// `status` starts "waiting"; the Cockpit view (T014) overlays the real-time status from `skips`/
// `units` on top of it by scope, so this list is never re-written after it is first posted.
export interface StartupListItem {
  scope: string;
  title: string;
  status: "waiting" | "in-progress" | "done" | "failed" | "skipped";
}

export interface AutopilotRunState {
  mode: "autopilot";
  skips: AutopilotSkipRecord[];
  units?: UnitRunRecord[];
  // [SCOPE 154 / T003] BEGIN — "where things stand right now", read by the Cockpit (T014)
  /** The startup list posted at run start (FR-002), in build order. */
  startupList?: StartupListItem[];
  /** The scope of the unit currently running, if any. */
  currentScope?: string;
  /**
   * The current unit's step label. The bridge spawns one unattended session per unit that runs
   * validateScope -> createSpecs -> implement internally (autopilot-unit-runner.ts) with no
   * external signal for which of the three is active at any instant, so this is set to "running"
   * for the unit's whole duration rather than guessing a phase name. The literal phase names
   * remain valid values of this field for whichever future task adds that visibility.
   */
  currentStep?: "validateScope" | "createSpecs" | "implement" | "running" | string;
  /** ISO timestamp the current step began; elapsed time is derived from this, never stored separately. */
  stepStartedAt?: string;
  // [SCOPE 154 / T003] END
}

/** Reuses the docs/GOD-State*.json shape/location convention (T004), under its own file name. */
export const AUTOPILOT_STATE_PATH = "docs/GOD-State-Autopilot.json";

export function loadAutopilotState(root: string, path: string = AUTOPILOT_STATE_PATH): AutopilotRunState {
  try {
    const parsed = JSON.parse(readFileSync(join(root, path), "utf8")) as Partial<AutopilotRunState>;
    return {
      mode: "autopilot",
      skips: Array.isArray(parsed.skips) ? parsed.skips : [],
      units: Array.isArray(parsed.units) ? parsed.units : undefined,
      // [SCOPE 154 / T003] Carried through on every load so a skip/unit-outcome write downstream
      // never silently drops the posted startup list or the in-flight step markers.
      startupList: Array.isArray(parsed.startupList) ? parsed.startupList : undefined,
      currentScope: typeof parsed.currentScope === "string" ? parsed.currentScope : undefined,
      currentStep: typeof parsed.currentStep === "string" ? parsed.currentStep : undefined,
      stepStartedAt: typeof parsed.stepStartedAt === "string" ? parsed.stepStartedAt : undefined,
    };
  } catch {
    return { mode: "autopilot", skips: [] };
  }
}

export function saveAutopilotState(root: string, state: AutopilotRunState, path: string = AUTOPILOT_STATE_PATH): void {
  writeFileSync(join(root, path), JSON.stringify(state, null, 2), "utf8");
}

/**
 * Records (or replaces) one scope's cascade. Status is partly-worked if any dependent is.
 * MODIFIED-BY: [SCOPE 154 / T003] — spreads `state` instead of rebuilding `{mode, skips}`, so a
 * skip no longer silently drops `units`/`startupList`/`currentScope`/`currentStep`/`stepStartedAt`
 * that were already on the loaded state.
 */
export function recordSkipCascade(
  state: AutopilotRunState,
  scope: string,
  title: string,
  dependents: DependentStatus[],
): AutopilotRunState {
  const skips = state.skips.filter((s) => s.scope !== scope);
  const status: AutopilotSkipRecord["status"] = dependents.some((d) => d.status === "partly-worked") ? "partly-worked" : "skipped";
  skips.push({ scope, title, status, dependents });
  return { ...state, mode: "autopilot", skips };
}

/**
 * The owner's answer to a cascade post — which dependents stay, which skip along with the parent.
 * MODIFIED-BY: [SCOPE 154 / T003] — spreads `state` for the same reason as recordSkipCascade above.
 */
export function applyKeepDecision(state: AutopilotRunState, scope: string, keep: string[]): AutopilotRunState {
  return { ...state, mode: "autopilot", skips: state.skips.map((s) => (s.scope === scope ? { ...s, keptDependents: keep } : s)) };
}

/** A partly-worked cascade with no owner answer yet — re-listed on the next run (FR-003 acceptance). */
export function pendingPartialSkips(state: AutopilotRunState): AutopilotSkipRecord[] {
  return state.skips.filter((s) => s.status === "partly-worked" && !s.keptDependents);
}

/** [SCOPE 154 / T007] Records (or replaces) one unit's outcome, so the run state always carries its latest line. */
export function recordUnitOutcome(state: AutopilotRunState, record: UnitRunRecord): AutopilotRunState {
  const units = (state.units ?? []).filter((u) => u.scope !== record.scope);
  units.push(record);
  return { ...state, units };
}

// [SCOPE 154 / T003] BEGIN — persists "where things stand right now" for the Cockpit (FR-002/FR-014)
/**
 * Persists the startup list exactly as posted to the room (FR-002), each item "waiting". Written
 * once, when the list is posted; never re-written afterwards — the Cockpit view overlays the real
 * status from `skips`/`units` on top of it by scope as the run proceeds.
 */
export function recordStartupList(state: AutopilotRunState, scopes: { num: string; title: string }[]): AutopilotRunState {
  return { ...state, startupList: scopes.map((s) => ({ scope: s.num, title: s.title, status: "waiting" as const })) };
}

/**
 * Marks the unit about to run as the run's current step, with a fresh start time elapsed-time is
 * derived from. `step` is "running" in practice today — see `AutopilotRunState.currentStep`'s own
 * comment for why the literal validateScope/createSpecs/implement phase cannot yet be told apart.
 */
export function recordCurrentStep(
  state: AutopilotRunState,
  scope: string,
  step: AutopilotRunState["currentStep"],
  startedAt: string = new Date().toISOString(),
): AutopilotRunState {
  return { ...state, currentScope: scope, currentStep: step, stepStartedAt: startedAt };
}

/** Clears the "current step" markers once the run ends, so a finished run never shows a stale one. */
export function clearCurrentStep(state: AutopilotRunState): AutopilotRunState {
  return { ...state, currentScope: undefined, currentStep: undefined, stepStartedAt: undefined };
}
// [SCOPE 154 / T003] END

export interface SkipCascadeOptions {
  root: string;
  scopeNum: string;
  title: string;
  scopeImpact?: ScopeImpactRunner;
  stageOf?: (scopeNum: string) => Promise<string | undefined>;
  statePath?: string;
  /** Test seams; default to the real docs/GOD-State-Autopilot.json file under `root`. */
  loadState?: (root: string, path?: string) => AutopilotRunState;
  saveState?: (root: string, state: AutopilotRunState, path?: string) => void;
}

/** Runs the whole cascade for one skipped scope: impact lookup, classification, post, and persistence. */
export async function runSkipCascade(opts: SkipCascadeOptions): Promise<{ message: string; state: AutopilotRunState }> {
  const impact = opts.scopeImpact ?? nodeScopeImpactRunner(opts.root);
  const result = await impact(opts.scopeNum);
  const dependents = result.found ? await classifyDependents(result.dependents, opts.stageOf ?? (async () => undefined)) : [];
  const message = formatSkipCascade(opts.scopeNum, opts.title, dependents);
  const load = opts.loadState ?? loadAutopilotState;
  const save = opts.saveState ?? saveAutopilotState;
  const state = recordSkipCascade(load(opts.root, opts.statePath), opts.scopeNum, opts.title, dependents);
  save(opts.root, state, opts.statePath);
  return { message, state };
}
// [SCOPE 154 / T004] END
