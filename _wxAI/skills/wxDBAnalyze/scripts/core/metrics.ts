// [SCOPE 121 / T015] BEGIN — Measured-or-unknown metric type
/**
 * The sentinel for a metric that was never measured.
 *
 * This exists because on a database with a large fraction of never-analyzed
 * tables, most statistics are absent rather than zero. Collapsing the two
 * would let "nobody has ever looked at this table" render as "this table is
 * fine" — the failure this whole design is built against.
 *
 * M1 (SCOPE-121 final fix wave, Minor): this doc comment used to hardcode
 * "218 of this database's 259 tables" — a one-time production census that
 * does not belong in `core/`, the declared engine-neutral layer. The number
 * is deleted rather than corrected; the principle it illustrates does not
 * depend on any particular count.
 */
export const UNKNOWN = "unknown" as const;

export type Measured<T> = T | typeof UNKNOWN;

export function isKnown<T>(value: Measured<T>): value is T {
  return value !== UNKNOWN;
}

/**
 * Render a metric for operator-facing prose. An unknown metric renders as a
 * sentence saying so and MUST NOT contain a digit — a reader skimming for
 * numbers must not mistake it for a measurement.
 */
export function describeMeasured<T>(
  value: Measured<T>,
  format: (known: T) => string,
): string {
  return isKnown(value)
    ? format(value)
    : "unknown (this table has never been analyzed, so no statistics exist)";
}
// [SCOPE 121 / T015] END
