/**
 * Database error serialization for logging.
 *
 * Drizzle wraps every failed query in a `DrizzleQueryError` whose `message` is
 * always the literal SQL plus bound parameters — "Failed query: select ...".
 * The actual PostgresError, carrying the code that identifies the fault, is on
 * `.cause`.
 *
 * Logging only `error.message` therefore discards the one field that matters:
 * 42P01 (missing relation), 22P02 (bad uuid input) and a connection drop all
 * produce the same log line. On 2026-07-30 that cost a multi-hour investigation
 * in which the logged SQL had to be replayed against production by hand to
 * recover the error codes.
 */

// [SCOPE 117 / T004] BEGIN — Postgres error shape
/**
 * The fields postgres-js exposes on a PostgresError that are safe to log.
 * Deliberately excludes anything carrying row data or bound parameter values.
 */
export interface SerializedDbError {
  message: string;
  /** Postgres SQLSTATE, e.g. "42P01", "22P02". */
  code?: string;
  /** Postgres severity, e.g. "ERROR". */
  severity?: string;
  /** Postgres detail line, when present. */
  detail?: string;
  /** Schema object the error refers to, when Postgres reports it. */
  table?: string;
  column?: string;
  constraint?: string;
  /** Postgres internal routine that raised it — useful for narrowing. */
  routine?: string;
}
// [SCOPE 117 / T004] END

// [SCOPE 117 / T004] BEGIN — Database error serializer
const PG_FIELDS = [
  "code",
  "severity",
  "detail",
  "table",
  "column",
  "constraint",
  "routine",
] as const;

/**
 * Serialize an unknown thrown value for structured logging, unwrapping
 * `error.cause` so the Postgres SQLSTATE reaches the log record.
 *
 * Never includes bound parameter values: those can carry customer data, and the
 * SQLSTATE plus the relation name is enough to identify the fault.
 */
/**
 * Drizzle formats its wrapper message as "Failed query: <sql>\nparams: <values>".
 * The bound values can carry customer data (emails, names, notes), so everything
 * from the params marker onward is dropped before the message is logged. The SQL
 * itself is retained — it identifies the failing statement without the payload.
 */
function stripBoundParams(message: string): string {
  const marker = message.indexOf("\nparams:");
  return marker === -1 ? message : message.slice(0, marker);
}

export function serializeDbError(error: unknown): SerializedDbError {
  if (!(error instanceof Error)) {
    return { message: typeof error === "string" ? error : "Unknown error" };
  }

  // Drizzle puts the real PostgresError on .cause; fall back to the error
  // itself when a driver throws directly. Read via an index type because the
  // project's tsconfig lib predates ES2022, where Error.cause was added.
  const cause: unknown = (error as { cause?: unknown }).cause ?? error;
  const out: SerializedDbError = { message: stripBoundParams(error.message) };

  if (cause && typeof cause === "object") {
    const record = cause as Record<string, unknown>;
    for (const field of PG_FIELDS) {
      const value = record[field];
      if (typeof value === "string" && value.length > 0) {
        out[field] = value;
      }
    }
    // Surface the underlying message too when it differs from the wrapper.
    const causeMessage = record.message;
    if (typeof causeMessage === "string" && causeMessage !== error.message) {
      out.detail = out.detail ?? stripBoundParams(causeMessage);
    }
  }

  return out;
}
// [SCOPE 117 / T004] END
