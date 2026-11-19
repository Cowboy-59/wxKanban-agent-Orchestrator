/**
 * Autopilot release gate — SPEC-154 (SCOPE-132 Amendment H), FR-012.
 *
 * Autopilot is specified, but must not be switchable in any environment until every prerequisite
 * is independently verified BUILT, not merely specified. The gate fails closed — a prerequisite
 * that is not confirmed built keeps the switch unexposed.
 *
 * Descoped 2026-11-07 (SCOPE-154, with Andy): FR-012/FR-103 originally named a third prerequisite,
 * `rollingSummaryBuilt` (SCOPE-132 Amendment G piece A, the masked rolling summary/mailbox). T008/T009's
 * heartbeat derives its content from `AutopilotRunState`, never from Amendment G piece A — so Autopilot
 * does not actually depend on that mechanism at runtime. It was named as an independent release
 * criterion in the original spec text regardless of that; removed here as that criterion turned out
 * not to describe a real dependency of this feature. Amendment G piece A remains specified and may
 * still be built on its own schedule — it is just no longer a precondition for the Autopilot switch.
 *
 * Re-closed 2026-11-08 (SCOPE-154, owner-flagged): the two prerequisites above only cover whether the
 * switch is SAFE to expose (handoff guard, API-key stripping). Neither one checks whether a "go" reply
 * actually runs anything. It doesn't: `bridge.ts`'s `resolvePendingAutopilotGo()` obtains the approved
 * scope list from `AutopilotSchedule.confirmGo()`, posts a "starting on N scopes" message, and never
 * calls `runPipeline` (autopilot-pipeline.ts) — which, repo-wide, is only ever invoked from its own unit
 * tests. Added `pipelineWired` below as a third, independent prerequisite so the gate fails closed again
 * until that call is actually wired in (T005) and covered by a full-flow test (T013).
 */

// [SCOPE 154 / T012] BEGIN — release gate (FR-012)
// MODIFIED-BY: [SCOPE 154 / T012b] — rollingSummaryBuilt removed; not an actual runtime dependency (see header)
// MODIFIED-BY: [SCOPE 154 / T012c] — pipelineWired added; resolvePendingAutopilotGo never calls runPipeline (see header)
export interface AutopilotReleasePrerequisites {
  /** SPEC-149: bridge.ts's HandoffTurnGuard, arming/disarming a context-only turn on [HANDOFF]. */
  handoffGuardFixed: boolean;
  /** SCOPE-102 FR-013: ANTHROPIC_API_KEY stripped from the child session's environment. */
  apiKeyStrippedFromChildSession: boolean;
  /** FR-004: bridge.ts's resolvePendingAutopilotGo() actually invokes runPipeline with the approved scopes. */
  pipelineWired: boolean;
}

/** Pure: open only when every prerequisite is confirmed built. One unconfirmed prerequisite closes it. */
export function isAutopilotReleaseGateOpen(prereqs: AutopilotReleasePrerequisites): boolean {
  return prereqs.handoffGuardFixed && prereqs.apiKeyStrippedFromChildSession && prereqs.pipelineWired;
}

/**
 * Verified by code inspection, 2026-11-07 (SCOPE-154 T012; re-verified same day, SCOPE-102 T014):
 * - handoffGuardFixed: true — `HandoffTurnGuard` (wxkanban-agent/apps/remote-bridge/src/handoff-turn.ts)
 *   is wired into `bridge.ts` (arm/disarm around a [HANDOFF] turn, SPEC-149 T007).
 * - apiKeyStrippedFromChildSession: true — `buildChildEnv()` (wxkanban-agent/apps/remote-bridge/src/
 *   child-env.ts, SCOPE-102 T014/FR-013) strips `ANTHROPIC_API_KEY` from the env object passed to
 *   the Agent SDK's `query()` unless `WXKANBAN_REMOTE_USE_API_KEY=1` is set deliberately. Wired into
 *   both spawn sites named in SCOPE-132 FR-103: `session.ts:143` (the room/Autopilot session) and
 *   `triage-run.ts:223` (the one-shot triage session). `workers/ai/ai-client.ts` is a different
 *   surface (this project's own in-house AI client, calling providers directly over HTTP) and is
 *   out of scope for FR-013, which only concerns the Agent SDK child session's own environment.
 *
 * Re-verified 2026-11-08 (owner-flagged defect, same day — wired same day):
 * - pipelineWired: true — `bridge.ts`'s `resolvePendingAutopilotGo()` now calls
 *   `runAutopilotPipeline()`, which calls `runPipeline()` (autopilot-pipeline.ts) with a `runUnit`
 *   built by `createAutopilotUnitRunner()` (autopilot-unit-runner.ts, SCOPE-154 T005b — one fresh
 *   unattended Agent SDK session per scope) and `recordOutcome` persisting each `UnitRunRecord` via
 *   `autopilot-skip.ts`. Covered end to end by
 *   `wxkanban-agent/tests/unit/bridge-autopilot-pipeline.test.ts` (T013): drives the real
 *   `say("go")` message path with only the unit runner, schedule, and skip-persistence mocked, and
 *   asserts both scopes run in order, each outcome is persisted, a final summary is posted, and a
 *   second "go" while a run is in flight is rejected rather than starting a concurrent run.
 *
 * Re-verify this object whenever any mechanism changes — the gate must be reopened or reclosed
 * deliberately, never by a stale default flipping true on its own.
 */
export const AUTOPILOT_RELEASE_PREREQUISITES: AutopilotReleasePrerequisites = {
  handoffGuardFixed: true,
  apiKeyStrippedFromChildSession: true,
  pipelineWired: true,
};

export const AUTOPILOT_RELEASE_GATE_OPEN = isAutopilotReleaseGateOpen(AUTOPILOT_RELEASE_PREREQUISITES);
// [SCOPE 154 / T012] END
