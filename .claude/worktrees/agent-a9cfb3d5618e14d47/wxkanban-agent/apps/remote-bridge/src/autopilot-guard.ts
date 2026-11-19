import { scanTextForGatedActions, type GatedAction } from "./override-gate";

// [SCOPE 154 / T006] BEGIN — never-push / never-production reuse (FR-005, SCOPE-132 FR-096)
//
// The push/production-write gate (FR-010, FR-025) and the one-agent-per-tree lock (FR-026)
// already decide every push and every production write — this adds no new case to either.
// What is missing for Autopilot specifically is the unattended half: that gate suspends and
// waits up to 23 hours for an operator's answer (override-gate.ts T035), which is fine in a
// live session but would stall an unattended run on a unit nobody is watching. So a unit
// whose own task text names a push or a production-targeting command is parked, untouched,
// before `runUnit` is ever called — it never reaches the gate at all. The gate itself is
// untouched; this is a preflight filter in front of it.

export interface GuardedUnit {
  num: string;
  title: string;
  /** Whatever text describes the unit's own work before it runs: task detail, FR text, acceptance criteria. */
  text: string;
}

export interface ProductionParkReason {
  scope: string;
  title: string;
  actions: GatedAction[];
}

const ACTION_LABEL: Record<GatedAction, string> = {
  gitpush: "a git push",
  prodatawrite: "a write against the production database",
};

/** Detects whether a unit's own text names a gated action, reusing the existing gate's patterns. */
export function detectsGatedAction(unit: GuardedUnit): ProductionParkReason | undefined {
  const actions = scanTextForGatedActions(unit.text);
  if (actions.length === 0) return undefined;
  return { scope: `SCOPE-${unit.num}`, title: unit.title, actions };
}

/** The one-line park post (FR-005 acceptance): named, untouched, and why. */
export function formatProductionPark(reason: ProductionParkReason): string {
  const names = reason.actions.map((a) => ACTION_LABEL[a]).join(" and ");
  return (
    `Parked — ${reason.scope}: ${reason.title}. Its own task names ${names}; ` +
    `this run never pushes and never writes to production, so it is left untouched for the owner.`
  );
}
// [SCOPE 154 / T006] END
