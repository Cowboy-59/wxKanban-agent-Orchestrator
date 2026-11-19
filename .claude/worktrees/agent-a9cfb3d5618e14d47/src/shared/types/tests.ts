// [SCOPE 111 / T011] BEGIN — Shared contract for the Test Suite Lifecycle
// Used by the services, the routes, the MCP tools and the client so the three
// surfaces describe the same thing.

/** Who runs an item. An item belongs to exactly one set. */
export type TestExecutor = "machine" | "human";

/** Who authored an item — independent of who runs it. */
export type TestOrigin = "ai" | "user";

export type TestGateName = "smoke" | "crud" | "ui-flow" | "unit";

export type TestResultStatus = "pass" | "fail" | "skip" | "blocked" | "unresolved";

export type TestSignoffType = "ai" | "user";

export type TestSignoffStatus = "passed" | "failed" | "waived";

export type TestRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  /** Derived, never stored: a run silent past the stall interval. */
  | "stalled";

export type TestCycleStatus = "open" | "uat" | "production" | "superseded";

export type TestRetestReason = "impact" | "undetermined" | "broad";

export type TestRetestResolution = "signoff" | "dismissed";

/** What a gate requires before it will let a release move. */
export type GateRequirement = "ai" | "user" | "all";

export interface TestGateBlocker {
  itemid: string;
  itemkey: string;
  title: string;
  executor: TestExecutor;
  specid: string | null;
  requirementid: string | null;
  /** Why this item is blocking, in words the completion bar can render. */
  why: "unsigned" | "failing" | "retest-outstanding";
}

export interface TestGateVerdict {
  passed: boolean;
  requirement: GateRequirement;
  cycleid: string | null;
  version: string | null;
  /**
   * Forced items standing in the way. Empty when genuinely passed — but NOT
   * emptied when `skipped` is true: the caller still gets the list of what
   * would have blocked, so a skipped release never looks like a clean one.
   */
  blocking: TestGateBlocker[];
  /** Unforced items still outstanding — reported, never blocking (FR-038). */
  outstandingUnforced: number;
  /**
   * [SCOPE 111 / Amendment A] The project has testing switched off. `passed`
   * is true so nothing is obstructed, and this flag is what every surface must
   * render instead of a green tick.
   */
  skipped?: boolean;
  /** How many forced items were bypassed by the skip. 0 when not skipped. */
  bypassedCount?: number;
  /**
   * [SCOPE 123] Items of this requirement in scope, forced or not. Lets the
   * per-scope stage advance tell "no machine tests exist" from "every machine
   * test is clear" — a scope with none stops in QA.
   */
  inscopetotal?: number;
}

export interface TestRunSnapshotItem {
  itemid: string;
  itemkey: string;
  title: string;
  requirementid: string | null;
  gate: string;
  status: TestResultStatus | "pending";
  evidence: string | null;
  durationms: number | null;
}

export interface TestRunSnapshot {
  runid: string;
  status: TestRunStatus;
  gate: string | null;
  environment: string;
  runnertype: string;
  isregression: boolean;
  startedat: string;
  endedat: string | null;
  lastheartbeatat: string;
  currentitemid: string | null;
  totals: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    blocked: number;
  };
  /** The ordered list declared at start — present before anything has run. */
  items: TestRunSnapshotItem[];
}

export interface RegressionEntry {
  itemid: string;
  itemkey: string;
  title: string;
  /** The cycle/version this item last passed in — bounds the change window. */
  lastPassedVersion: string | null;
  lastPassedCycleId: string | null;
}

export interface RegressionReport {
  cycleid: string;
  version: string;
  stillPassing: RegressionEntry[];
  /** The only true regressions: passed at their last execution, now failing. */
  newlyFailing: RegressionEntry[];
  /** Never green — outstanding new work, not a regression. */
  neverPassed: RegressionEntry[];
}

/**
 * What the runner posts. Reachability is computed by the runner (the only party
 * holding the code); what it means for testing is decided here.
 */
export interface ImpactGraphPayload {
  /** Must match the cycle under test, or the request is refused. */
  commitsha: string;
  changedFiles: string[];
  /**
   * Transitive dependents per changed file, with a representative path.
   * Omitted only when `broad` is true — never truncated silently.
   */
  dependents?: Array<{
    changedFile: string;
    dependentPath: string;
    path: string[];
  }>;
  /**
   * FR-049b3 — changes that carry NO import edges, declared explicitly.
   *
   * A migration, a config or env change, static content, or a dependency bump
   * changes behaviour but nothing imports it, so the transitive walk above
   * reaches nothing from it and the change reads as affecting no tests. That is
   * the single place under-marking actually happens, and an under-mark ships a
   * defect under a green human signoff with no recovery.
   *
   * The runner classifies these because it is the only party holding the code
   * (FR-049b1a); the application decides what each one means for testing. An
   * edgeless changed file that the runner does NOT classify is treated as
   * unresolvable and fails safe to marking, so forgetting to classify one can
   * never read as "nothing was affected".
   */
  edgeless?: Array<{
    /** Repo-relative path of the changed file. */
    path: string;
    kind: EdgelessChangeKind;
    /**
     * For `migration` — the tables the statement actually alters. This is what
     * makes a migration mappable: an item is reached when one of its subjects
     * covers one of these tables. Empty or absent means the runner could not
     * determine them, which fails safe to marking every human item.
     */
    tables?: string[];
    /** Human-readable note carried into the Retest mark's chain. */
    note?: string;
  }>;
  /**
   * Set when the dependent set would be oversized. Every human item is then
   * marked; the application never infers "nothing was affected" from silence.
   */
  broad?: boolean;
  broadReason?: string;
}

/**
 * FR-049b3 — the categories of change that have no import edges.
 *
 * `migration` is separated from the rest because it is the only one that can be
 * mapped precisely (via the tables it alters) and the one with the highest
 * consequence when missed — a column or constraint change reaches every screen
 * that reads it, through code that never mentions the migration file.
 */
export type EdgelessChangeKind =
  | "migration"
  | "config"
  | "env"
  | "static"
  | "dependency";

export interface ImpactResult {
  cycleid: string;
  applied: boolean;
  broad: boolean;
  markedCount: number;
  /** Human signoffs that survived — the number that matters to a team. */
  survivedCount: number;
  marks: Array<{
    itemid: string;
    itemkey: string;
    reason: TestRetestReason;
    triggerpath: string | null;
    reachedSubjectPath: string | null;
    pathlength: number | null;
  }>;
}
// [SCOPE 111 / T011] END
