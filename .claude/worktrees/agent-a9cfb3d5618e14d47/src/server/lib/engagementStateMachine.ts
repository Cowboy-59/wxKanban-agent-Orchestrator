/**
 * Engagement State Machine
 * Spec 037 — Consultants Management (Engagement Core), FR-004
 *
 * Centralizes the allowed-transition table so handlers can't drift on
 * lifecycle rules. Allowed transitions:
 *   - active   ↔ paused
 *   - active   ↔ disabled
 *   - any → ended  (terminal; ended is irreversible)
 *
 * Pure module — no DB, no I/O. Just the transition function and helpers.
 * Audit logging + DB writes live in the route handlers that call this.
 */

// [SCOPE 037 / T017] BEGIN — engagement state + transition types
export type EngagementState = "active" | "paused" | "disabled" | "ended";

export type EngagementTransition =
  | "pause"
  | "resume"
  | "disable"
  | "enable"
  | "end";

export const ALL_STATES: readonly EngagementState[] = [
  "active",
  "paused",
  "disabled",
  "ended",
] as const;

export const ALL_TRANSITIONS: readonly EngagementTransition[] = [
  "pause",
  "resume",
  "disable",
  "enable",
  "end",
] as const;
// [SCOPE 037 / T017] END

// [SCOPE 037 / T017] BEGIN — allowed-transition table
/**
 * Result of looking up a transition: `null` means disallowed.
 * The table is exhaustive — every (state, transition) pair has an entry.
 */
const ALLOWED_TRANSITIONS: Record<
  EngagementState,
  Record<EngagementTransition, EngagementState | null>
> = {
  active: {
    pause: "paused",
    resume: null, // not paused
    disable: "disabled",
    enable: null, // not disabled
    end: "ended",
  },
  paused: {
    pause: null, // already paused
    resume: "active",
    disable: null, // must resume first
    enable: null,
    end: "ended",
  },
  disabled: {
    pause: null, // must enable first
    resume: null,
    disable: null, // already disabled
    enable: "active",
    end: "ended",
  },
  ended: {
    pause: null,
    resume: null,
    disable: null,
    enable: null,
    end: null, // terminal
  },
};
// [SCOPE 037 / T017] END

// [SCOPE 037 / T017] BEGIN — InvalidTransitionError
export class InvalidTransitionError extends Error {
  readonly currentState: EngagementState;
  readonly attemptedTransition: EngagementTransition;

  constructor(
    currentState: EngagementState,
    attemptedTransition: EngagementTransition,
  ) {
    super(
      `Cannot ${attemptedTransition} an engagement in state '${currentState}'`,
    );
    this.name = "InvalidTransitionError";
    this.currentState = currentState;
    this.attemptedTransition = attemptedTransition;
  }
}
// [SCOPE 037 / T017] END

// [SCOPE 037 / T017] BEGIN — applyTransition
/**
 * Returns the new state after applying the transition, or throws
 * InvalidTransitionError if the transition is not allowed from the current state.
 *
 * Pure: no DB, no audit, no side effects.
 */
export function applyTransition(
  current: EngagementState,
  transition: EngagementTransition,
): EngagementState {
  const next = ALLOWED_TRANSITIONS[current][transition];
  if (next === null) {
    throw new InvalidTransitionError(current, transition);
  }
  return next;
}
// [SCOPE 037 / T017] END

// [SCOPE 037 / T017] BEGIN — isTerminal
export function isTerminal(state: EngagementState): boolean {
  return state === "ended";
}
// [SCOPE 037 / T017] END

// [SCOPE 037 / T017] BEGIN — isWriteBlocked
/**
 * Returns true if Consulting Members are blocked from writing in this state.
 * Used by the engagement-context write-block guard (FR-004 AC2).
 *
 * - active  → writes allowed
 * - paused  → writes blocked, reads allowed
 * - disabled → writes blocked, reads allowed
 * - ended   → writes blocked, history readable
 */
export function isWriteBlocked(state: EngagementState): boolean {
  return state !== "active";
}
// [SCOPE 037 / T017] END

// [SCOPE 037 / T017] BEGIN — transitionToAction (mapping for audit logs)
/**
 * Maps a transition verb to the canonical audit-action enum value used in
 * companyauditlogs entries.
 */
export function transitionToAuditAction(
  transition: EngagementTransition,
): "ENGAGEMENT_PAUSED"
  | "ENGAGEMENT_RESUMED"
  | "ENGAGEMENT_DISABLED"
  | "ENGAGEMENT_ENABLED"
  | "ENGAGEMENT_ENDED" {
  switch (transition) {
    case "pause":
      return "ENGAGEMENT_PAUSED";
    case "resume":
      return "ENGAGEMENT_RESUMED";
    case "disable":
      return "ENGAGEMENT_DISABLED";
    case "enable":
      return "ENGAGEMENT_ENABLED";
    case "end":
      return "ENGAGEMENT_ENDED";
  }
}
// [SCOPE 037 / T017] END
