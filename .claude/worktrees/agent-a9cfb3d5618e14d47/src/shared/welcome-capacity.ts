// [SCOPE 109 / T004] BEGIN — pure join-link capacity arithmetic
/**
 * SPEC-109 FR-004 / FR-009. Kept pure and dependency-free so both the server and
 * the client can agree on what "low" and "exhausted" mean, and so the boundary
 * behaviour is unit-testable without a database connection.
 */

/** Below this many remaining uses, the SysAdmin is warned. */
export const LOW_CAPACITY_THRESHOLD = 10;

export interface CapacityView {
  capacity: number;
  consumed: number;
  remaining: number;
  /** Running low, but not yet blocked. Strictly between 0 and the threshold. */
  low: boolean;
  /** Nothing left — sends are blocked rather than issuing an unusable link. */
  exhausted: boolean;
}

export function capacityView(msg: {
  linkcapacity: number;
  linkconsumed: number;
}): CapacityView {
  const remaining = Math.max(0, msg.linkcapacity - msg.linkconsumed);
  return {
    capacity: msg.linkcapacity,
    consumed: msg.linkconsumed,
    remaining,
    // Exhausted is NOT also "low" — they are distinct states with different UI
    // and different behaviour (warn vs block).
    low: remaining > 0 && remaining < LOW_CAPACITY_THRESHOLD,
    exhausted: remaining <= 0,
  };
}
// [SCOPE 109 / T004] END
