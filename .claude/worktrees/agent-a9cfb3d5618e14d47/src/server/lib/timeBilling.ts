/**
 * Time and Billing arithmetic (SPEC-005). Pure functions: no database, no clock, no logging,
 * so the page, the agent pull and the statement all round and price time the same way.
 *
 * Durations are integer minutes (projecttimeentries.duration). Money is integer cents, so a
 * statement row's amount and the total never pick up floating-point drift (FR-009: every
 * row's amount = hours × rate, and the total = the sum of the rows).
 */

// [SCOPE 005 / T003] BEGIN — rounding constants and defaults (FR-005, FR-007, FR-008)
export const QUARTER_HOUR_MINUTES = 15;
export const QUARTER_HOUR_SECONDS = QUARTER_HOUR_MINUTES * 60;
/** Company default Developer rate when `companies.hourlyrate` is NULL (FR-008). */
export const DEFAULT_DEVELOPER_RATE = "150.00";
/** Company default Resource rate when `companies.resourcerate` is NULL (FR-008). */
export const DEFAULT_RESOURCE_RATE = "50.00";
// [SCOPE 005 / T003] END

// [SCOPE 005 / T003] BEGIN — roundUpToQuarterHour (FR-005)
/**
 * Round minutes up to the next 15 (0:07 → 15, 1:38 → 105, 1:45 → 105, 0 → 0).
 * A negative correction (FR-011) rounds away from zero by the same rule (−0:07 → −15),
 * so a correction never bills less than the entry it reverses.
 */
export function roundUpToQuarterHour(minutes: number): number {
  if (!Number.isFinite(minutes)) {
    throw new RangeError("minutes must be a finite number");
  }
  if (minutes === 0) return 0;
  const sign = minutes < 0 ? -1 : 1;
  return sign * Math.ceil(Math.abs(minutes) / QUARTER_HOUR_MINUTES) * QUARTER_HOUR_MINUTES;
}
// [SCOPE 005 / T003] END

// [SCOPE 005 / T003] BEGIN — roundSecondsUpToQuarterHour (FR-007)
/**
 * Agent runs are summed in seconds per day, per line, per model, then rounded ONCE
 * (FR-007): 40 runs totalling 1 h 32 m (5,520 s) give 105 minutes, not 40 × 15.
 * Returns minutes. Negative input is a caller bug, not a correction.
 */
export function roundSecondsUpToQuarterHour(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError("seconds must be a finite, non-negative number");
  }
  return Math.ceil(seconds / QUARTER_HOUR_SECONDS) * QUARTER_HOUR_MINUTES;
}
// [SCOPE 005 / T003] END

// [SCOPE 005 / T003] BEGIN — minutesToHours (FR-003, FR-009)
/** Minutes as decimal hours with two places, for display and statements: 105 → "1.75". */
export function minutesToHours(minutes: number): string {
  return (minutes / 60).toFixed(2);
}
// [SCOPE 005 / T003] END

// [SCOPE 005 / T003] BEGIN — rate resolution (FR-008)
export interface RateSource {
  /** Developer rate: companies.hourlyrate or companyprojects.hourlyrate (numeric as string). */
  hourlyrate: string | null;
  /** Resource rate: companies.resourcerate or companyprojects.resourcerate. */
  resourcerate: string | null;
}

export interface ResolvedRates {
  developer: string;
  resource: string;
}

/**
 * The rates in force for a project: the project's override wins over the company default,
 * and a company with neither set falls back to 150.00 / 50.00. The result is snapshotted
 * onto each entry (entryrate) when it is created, so a later rate change never alters it.
 */
export function resolveRates(company: RateSource, project: RateSource | null): ResolvedRates {
  return {
    developer: firstRate(project?.hourlyrate, company.hourlyrate) ?? DEFAULT_DEVELOPER_RATE,
    resource: firstRate(project?.resourcerate, company.resourcerate) ?? DEFAULT_RESOURCE_RATE,
  };
}

function firstRate(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    if (c !== null && c !== undefined && c.trim() !== "") {
      return normalizeRate(c);
    }
  }
  return null;
}

/** Validate and normalize a rate to two decimals ("150" → "150.00"). Rejects negatives. */
export function normalizeRate(rate: string): string {
  const cents = rateToCents(rate);
  return (cents / 100).toFixed(2);
}
// [SCOPE 005 / T003] END

// [SCOPE 005 / T003] BEGIN — money in cents (FR-009)
/** "150.00" → 15000. Throws on anything that is not a non-negative amount with ≤ 2 decimals. */
export function rateToCents(rate: string): number {
  const m = /^\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(rate);
  if (!m) {
    throw new RangeError("rate must be a non-negative amount with at most 2 decimals");
  }
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/**
 * hours × rate in cents, rounded half away from zero to the cent. Minutes are multiples of
 * 15, so this is (quarter hours × rate cents) / 4 and is exact except for rates whose cents
 * are not divisible by 4.
 */
export function amountCents(minutes: number, rate: string): number {
  const raw = (minutes * rateToCents(rate)) / 60;
  return Math.sign(raw) * Math.round(Math.abs(raw));
}

/** 123456 → "1234.56"; −10000 → "-100.00". */
export function centsToAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}${(Math.abs(cents) / 100).toFixed(2)}`;
}
// [SCOPE 005 / T003] END
