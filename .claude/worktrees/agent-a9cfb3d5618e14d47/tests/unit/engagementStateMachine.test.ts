/**
 * engagementStateMachine — pure unit tests
 * Spec 037 — SC-6: 100% branch coverage of the allowed-transition table.
 *
 * Pure module, no DB. Exhaustively walks every (state, transition) pair
 * to verify allowed vs disallowed; also exercises isTerminal, isWriteBlocked,
 * and transitionToAuditAction.
 */

import { describe, it, expect } from "vitest";
import {
  applyTransition,
  isTerminal,
  isWriteBlocked,
  transitionToAuditAction,
  InvalidTransitionError,
  ALL_STATES,
  ALL_TRANSITIONS,
  type EngagementState,
  type EngagementTransition,
} from "../../src/server/lib/engagementStateMachine";

// Truth table — every (current, transition) → expected next state (or null = disallowed).
// Matches FR-004 AC4: allowed transitions are
//   active ↔ paused, active ↔ disabled, any → ended
const EXPECTED: Record<
  EngagementState,
  Record<EngagementTransition, EngagementState | null>
> = {
  active: {
    pause: "paused",
    resume: null,
    disable: "disabled",
    enable: null,
    end: "ended",
  },
  paused: {
    pause: null,
    resume: "active",
    disable: null,
    enable: null,
    end: "ended",
  },
  disabled: {
    pause: null,
    resume: null,
    disable: null,
    enable: "active",
    end: "ended",
  },
  ended: {
    pause: null,
    resume: null,
    disable: null,
    enable: null,
    end: null,
  },
};

describe("engagementStateMachine", () => {
  describe("applyTransition — every (state, transition) pair", () => {
    for (const current of ALL_STATES) {
      for (const transition of ALL_TRANSITIONS) {
        const expected = EXPECTED[current][transition];
        if (expected !== null) {
          it(`${current} → ${transition} → ${expected}`, () => {
            expect(applyTransition(current, transition)).toBe(expected);
          });
        } else {
          it(`${current} → ${transition} → throws InvalidTransitionError`, () => {
            expect(() => applyTransition(current, transition)).toThrow(
              InvalidTransitionError,
            );
            try {
              applyTransition(current, transition);
            } catch (err) {
              expect(err).toBeInstanceOf(InvalidTransitionError);
              const e = err as InvalidTransitionError;
              expect(e.currentState).toBe(current);
              expect(e.attemptedTransition).toBe(transition);
            }
          });
        }
      }
    }
  });

  describe("isTerminal", () => {
    it("returns true ONLY for 'ended'", () => {
      expect(isTerminal("active")).toBe(false);
      expect(isTerminal("paused")).toBe(false);
      expect(isTerminal("disabled")).toBe(false);
      expect(isTerminal("ended")).toBe(true);
    });
  });

  describe("isWriteBlocked", () => {
    it("returns false ONLY for 'active' — paused/disabled/ended all block writes", () => {
      expect(isWriteBlocked("active")).toBe(false);
      expect(isWriteBlocked("paused")).toBe(true);
      expect(isWriteBlocked("disabled")).toBe(true);
      expect(isWriteBlocked("ended")).toBe(true);
    });
  });

  describe("transitionToAuditAction", () => {
    it("maps each transition to its canonical audit action", () => {
      expect(transitionToAuditAction("pause")).toBe("ENGAGEMENT_PAUSED");
      expect(transitionToAuditAction("resume")).toBe("ENGAGEMENT_RESUMED");
      expect(transitionToAuditAction("disable")).toBe("ENGAGEMENT_DISABLED");
      expect(transitionToAuditAction("enable")).toBe("ENGAGEMENT_ENABLED");
      expect(transitionToAuditAction("end")).toBe("ENGAGEMENT_ENDED");
    });
  });

  describe("InvalidTransitionError shape", () => {
    it("carries the originating state and attempted transition", () => {
      try {
        applyTransition("ended", "resume");
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidTransitionError);
        const e = err as InvalidTransitionError;
        expect(e.name).toBe("InvalidTransitionError");
        expect(e.currentState).toBe("ended");
        expect(e.attemptedTransition).toBe("resume");
        expect(e.message).toContain("Cannot resume");
        expect(e.message).toContain("ended");
      }
    });
  });

  describe("Lifecycle round-trips (FR-004 AC4)", () => {
    it("active → paused → active is reversible", () => {
      expect(applyTransition("active", "pause")).toBe("paused");
      expect(applyTransition("paused", "resume")).toBe("active");
    });

    it("active → disabled → active is reversible", () => {
      expect(applyTransition("active", "disable")).toBe("disabled");
      expect(applyTransition("disabled", "enable")).toBe("active");
    });

    it("any state → ended is one-way (terminal)", () => {
      for (const start of ["active", "paused", "disabled"] as const) {
        expect(applyTransition(start, "end")).toBe("ended");
      }
      // From ended, NOTHING transitions back.
      for (const transition of ALL_TRANSITIONS) {
        expect(() => applyTransition("ended", transition)).toThrow(
          InvalidTransitionError,
        );
      }
    });

    it("paused cannot transition directly to disabled (must resume first)", () => {
      expect(() => applyTransition("paused", "disable")).toThrow(
        InvalidTransitionError,
      );
    });

    it("disabled cannot transition directly to paused (must enable first)", () => {
      expect(() => applyTransition("disabled", "pause")).toThrow(
        InvalidTransitionError,
      );
    });
  });
});
