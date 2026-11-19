/**
 * Boundary parsing for query-string parameters.
 *
 * Query values arrive as untyped strings. Passing one straight into a Drizzle
 * comparison against a UUID column makes Postgres reject it with 22P02
 * ("invalid input syntax for type uuid"), which surfaces as a 500 rather than a
 * 400 — a client mistake reported as a server fault.
 *
 * UI filters also use the sentinel "all" to mean "no filter". That sentinel must
 * be resolved here, at the boundary, and never reach the query layer.
 */

import { z } from "zod";

// [SCOPE 117 / T002] BEGIN — UUID filter sentinel set
/**
 * Values a filter dropdown may send to mean "no filter applied".
 * Compared case-insensitively.
 */
export const UUID_FILTER_SENTINELS = ["all", "any", ""] as const;
// [SCOPE 117 / T002] END

// [SCOPE 117 / T002] BEGIN — Optional UUID query-filter parser
const uuidSchema = z.string().uuid();

export type UuidFilterResult =
  | { ok: true; value: string | undefined }
  | { ok: false; message: string };

/**
 * Parse an optional UUID filter from a query parameter.
 *
 * Returns `{ ok: true, value: undefined }` when the parameter is absent or is a
 * "no filter" sentinel, `{ ok: true, value }` for a well-formed UUID, and
 * `{ ok: false }` for anything else so the caller can answer 400 instead of
 * letting Postgres raise 22P02 behind a 500.
 */
export function parseUuidFilter(raw: unknown, paramName: string): UuidFilterResult {
  if (raw === undefined || raw === null) {
    return { ok: true, value: undefined };
  }

  if (typeof raw !== "string") {
    return { ok: false, message: `${paramName} must be a single value` };
  }

  const trimmed = raw.trim();
  if ((UUID_FILTER_SENTINELS as readonly string[]).includes(trimmed.toLowerCase())) {
    return { ok: true, value: undefined };
  }

  const parsed = uuidSchema.safeParse(trimmed);
  if (!parsed.success) {
    return { ok: false, message: `${paramName} must be a valid UUID or "all"` };
  }

  return { ok: true, value: parsed.data };
}
// [SCOPE 117 / T002] END

// [SCOPE 117 / T002] BEGIN — Required UUID query-parameter parser
/**
 * Parse a UUID query parameter that must be present and well-formed.
 * Sentinels are NOT accepted — use `parseUuidFilter` for optional filters.
 */
export function parseRequiredUuid(raw: unknown, paramName: string): UuidFilterResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, message: `${paramName} is required` };
  }

  const parsed = uuidSchema.safeParse(raw.trim());
  if (!parsed.success) {
    return { ok: false, message: `${paramName} must be a valid UUID` };
  }

  return { ok: true, value: parsed.data };
}
// [SCOPE 117 / T002] END
