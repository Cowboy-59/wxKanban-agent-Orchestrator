import { join } from "path";
import { pathToFileURL } from "url";
import { detectsGatedAction, formatProductionPark } from "./autopilot-guard";
import { nodeScopeImpactRunner, type ScopeImpactDependent, type UnitRunRecord } from "./autopilot-skip";

// [SCOPE 154 / T005] BEGIN — unattended validateScope→createSpecs→implement pipeline (FR-004)
// MODIFIED-BY: [SCOPE 154 / T006] — preflight park for a unit whose own text names a gated action
// MODIFIED-BY: [SCOPE 154 / T007] — failed-unit posting, dependents marked waiting, run-state recording
// MODIFIED-BY: [SCOPE 154 / T013] — nodeLedgerWriter: persists a live-answered gate back to the ledger
//

// FR-004 asks for a fresh session and a dedicated worktree per scope, reusing G.O.D.'s
// one-session-per-unit drive (SCOPE-136 FR-014/FR-015). That drive, and `validateScope` itself,
// exist only as hosted prompt methodologies for an interactive AI session to follow
// (`project.get_command_prompt`) — there is no non-interactive `validateScope` handler and no
// git-worktree-creation code anywhere in `_wxAI/` or `wxkanban-agent/` to build on, and
// CLAUDE.md's own rule ("G.O.D. runs buildscope → implementation ... never an ad-hoc Workflow or
// Agent fan-out") rules out inventing a parallel multi-session spawner here. So this module
// sequences the units and resolves gates against `decisions/ledger.yaml` (the half of FR-004 that
// is genuinely a library concern); the per-unit session/worktree mechanics are the caller's
// `runUnit` — in practice, the live attached AI session running the real skills in order, under
// the bridge's one-agent-per-tree lock (`agent-mode.ts`'s `acquireWorktreeLock`).

export interface PipelineUnit {
  num: string;
  title: string;
  /** The unit's own task/FR/acceptance text, scanned for a gated action before it ever runs (FR-005). */
  text?: string;
}

export interface GateResolution {
  decision: string;
  rationale?: string;
  ledgerId: string;
}

export interface ParkedGate {
  project: string;
  scope: string;
  question: string;
  blocks: string;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

interface LedgerEntry {
  id?: string;
  scope?: string;
  question?: string;
  decision?: string;
  rationale?: string;
}

interface LedgerModule {
  readLedger: (root: string) => LedgerEntry[];
  isAnswerEligible: (entry: LedgerEntry, all: LedgerEntry[]) => boolean;
}

interface LedgerWriterModule {
  appendEntry: (root: string, entry: Record<string, unknown>, approvedBy: string) => { id: string };
}

/** A gate the scope text or decisions/ledger.yaml already answers (FR-004 acceptance). */
export type GateResolver = (scopeNum: string, question: string) => Promise<GateResolution | undefined>;

/** Looks the question up in `decisions/ledger.yaml`, via the askgate ledger's own eligibility rule. */
export function nodeLedgerResolver(root: string): GateResolver {
  return async (scopeNum, question) => {
    const mod = (await import(pathToFileURL(join(root, "_wxAI", "askgate", "ledger.mjs")).href)) as LedgerModule;
    const entries = mod.readLedger(root);
    const scopeTag = `SCOPE-${scopeNum}`;
    const match = entries.find(
      (e) =>
        typeof e.scope === "string" &&
        typeof e.question === "string" &&
        typeof e.decision === "string" &&
        typeof e.id === "string" &&
        (e.scope.includes(scopeTag) || norm(e.scope) === norm(scopeTag)) &&
        norm(e.question) === norm(question) &&
        mod.isAnswerEligible(e, entries),
    );
    if (!match) return undefined;
    return { decision: match.decision as string, rationale: match.rationale, ledgerId: match.id as string };
  };
}

/** Persists a live-answered gate (FR-013 round trip) so a later identical question resolves from
 * the ledger alone. `approvedBy` must be the human who answered — the ledger's own validation
 * (`_wxAI/askgate/ledger.mjs`'s `AGENT_APPROVERS`) rejects "kain"/the agent as an approver. */
export type LedgerWriter = (scopeNum: string, question: string, decision: string, approvedBy: string) => Promise<GateResolution>;

export function nodeLedgerWriter(root: string): LedgerWriter {
  return async (scopeNum, question, decision, approvedBy) => {
    const mod = (await import(pathToFileURL(join(root, "_wxAI", "askgate", "ledger.mjs")).href)) as LedgerWriterModule;
    const entry = mod.appendEntry(
      root,
      {
        scope: `SCOPE-${scopeNum}`,
        question,
        decision,
        kind: "Agreed",
        evidence: "confirmed",
        source: "Autopilot live gate round trip (SCOPE-154 T005c/T013)",
      },
      approvedBy,
    );
    return { decision, ledgerId: entry.id };
  };
}

export interface GateOutcome {
  kind: "answered" | "parked";
  resolution?: GateResolution;
  parked?: ParkedGate;
}

/** FR-004: answer a gate from the ledger when it already covers it; otherwise park it as one line. */
export async function resolveGate(
  project: string,
  scopeNum: string,
  question: string,
  blocks: string,
  resolver: GateResolver,
): Promise<GateOutcome> {
  const resolution = await resolver(scopeNum, question);
  if (resolution) return { kind: "answered", resolution };
  return { kind: "parked", parked: { project, scope: `SCOPE-${scopeNum}`, question, blocks } };
}

/** The one-line park post (FR-004 acceptance): project, scope, question, what it blocks — never guessed. */
export function formatParkedGate(g: ParkedGate): string {
  return `Parked — ${g.project} / ${g.scope}: "${g.question}" (blocks ${g.blocks}). No approved design answers it; left for the owner.`;
}

export interface UnitRunResult {
  ok: boolean;
  parkedGates?: ParkedGate[];
  error?: string;
}

export type RunUnitFn = (unit: PipelineUnit, ctx: { resolveGate: GateResolver }) => Promise<UnitRunResult>;

export interface WaitingDependent {
  scope: string;
  title: string;
}

export interface UnitOutcome {
  scope: PipelineUnit;
  status: "done" | "parked" | "failed";
  parkedGates?: ParkedGate[];
  error?: string;
  waitingDependents?: WaitingDependent[];
}

/** Looks up a failed unit's dependents (FR-006), reusing the same scope-impact lookup as the skip cascade (T004). */
export type DependentsResolver = (scopeNum: string) => Promise<WaitingDependent[]>;

/** Wraps `nodeScopeImpactRunner` (autopilot-skip.ts) into the `{scope, title}` shape FR-006 needs. */
export function nodeDependentsResolver(root: string): DependentsResolver {
  const impact = nodeScopeImpactRunner(root);
  return async (scopeNum) => {
    const result = await impact(scopeNum);
    return result.found ? result.dependents.map((d: ScopeImpactDependent) => ({ scope: d.scope, title: d.title })) : [];
  };
}

/** The short failure line to the room/K.A.I.N. (FR-006 acceptance). */
export function formatUnitFailed(unit: PipelineUnit, error: string | undefined, waiting: WaitingDependent[]): string {
  const base = `Failed — SCOPE-${unit.num}: ${unit.title}.${error ? ` ${error}.` : ""}`;
  if (waiting.length === 0) return base;
  const names = waiting.map((w) => `SCOPE-${w.scope} (${w.title})`).join(", ");
  return `${base} Marked waiting: ${names}.`;
}

export interface PipelineOptions {
  units: PipelineUnit[];
  /** Drives validateScope→createSpecs→implement for one unit; owns the session/worktree mechanics. */
  runUnit: RunUnitFn;
  gateResolver?: GateResolver;
  post?: (text: string) => void | Promise<void>;
  /** FR-006: resolves a failed unit's dependents, so they can be marked waiting. Defaults to none found. */
  dependentsOf?: DependentsResolver;
  /** FR-006: persists every unit's done/failed/parked line. Defaults to no-ops (callers that don't need a run state). */
  recordOutcome?: (record: UnitRunRecord) => void | Promise<void>;
  /**
   * [SCOPE 154 / T003] Called with the unit about to run, before the gated-action guard check and
   * before `runUnit`, so a caller tracking "where things stand right now" (bridge.ts's Autopilot
   * run state, read by the Cockpit) can mark it current even for a unit that ends up parked.
   * Optional and unused by the plain `pipeline-agent` command this module is also shared with.
   */
  onUnitStart?: (unit: PipelineUnit) => void | Promise<void>;
}

/**
 * Runs the remaining units one at a time (FR-004) — never in parallel, since each is its own
 * fresh session. A unit that parks or fails does not stop the run; the next unit still gets tried.
 */
export async function runPipeline(opts: PipelineOptions): Promise<UnitOutcome[]> {
  const outcomes: UnitOutcome[] = [];
  const resolver = opts.gateResolver ?? (async () => undefined);
  const dependentsOf = opts.dependentsOf ?? (async () => []);
  const recordOutcome = opts.recordOutcome ?? (() => {});

  for (const unit of opts.units) {
    await opts.onUnitStart?.(unit); // [SCOPE 154 / T003]
    const guarded = unit.text ? detectsGatedAction({ num: unit.num, title: unit.title, text: unit.text }) : undefined;
    if (guarded) {
      const outcome: UnitOutcome = { scope: unit, status: "parked", parkedGates: [] };
      outcomes.push(outcome);
      await opts.post?.(formatProductionPark(guarded));
      await recordOutcome({ scope: unit.num, title: unit.title, status: "parked" });
      continue;
    }
    let outcome: UnitOutcome;
    try {
      const result = await opts.runUnit(unit, { resolveGate: resolver });
      if (result.ok) {
        outcome = { scope: unit, status: "done" };
      } else if (result.parkedGates?.length) {
        outcome = { scope: unit, status: "parked", parkedGates: result.parkedGates };
        for (const g of result.parkedGates) await opts.post?.(formatParkedGate(g));
      } else {
        const waiting = await dependentsOf(unit.num);
        outcome = { scope: unit, status: "failed", error: result.error, waitingDependents: waiting };
        await opts.post?.(formatUnitFailed(unit, result.error, waiting));
      }
    } catch (err) {
      const message = (err as Error).message;
      const waiting = await dependentsOf(unit.num);
      outcome = { scope: unit, status: "failed", error: message, waitingDependents: waiting };
      await opts.post?.(formatUnitFailed(unit, message, waiting));
    }
    outcomes.push(outcome);
    await recordOutcome({
      scope: unit.num,
      title: unit.title,
      status: outcome.status,
      error: outcome.error,
      waitingDependents: outcome.waitingDependents,
    });
  }
  return outcomes;
}
// [SCOPE 154 / T005] END
