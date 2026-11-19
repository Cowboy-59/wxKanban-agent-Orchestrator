// [SCOPE 061] BEGIN — captured-error report DTO (the POST /api/errors payload)
// Shared by the client capture module and the server intake. The client sends
// what it can observe; the server enriches (environment, userId, appVersion),
// computes the fingerprint + deterministic severity, and writes to the sink.

/** Where in the stack the error was trapped — drives deterministic severity. */
export type CapturedErrorKind =
  // client
  | "errorBoundary"
  | "windowError"
  | "unhandledRejection"
  | "apiFetch"
  // server
  | "serverHandler"
  | "uncaughtException"
  | "unhandledRejectionServer";

/** The wire payload a capturer POSTs to /api/errors. All optional fields are
 *  best-effort — the intake must accept partial/malformed input without failing. */
export interface CapturedErrorInput {
  source: "client" | "server";
  kind: CapturedErrorKind;
  /** error class/name, e.g. "TypeError" */
  name: string;
  message: string;
  /** raw stack trace */
  stack?: string;
  /** React component stack (ErrorBoundary only) */
  componentStack?: string;
  /** route/url where it occurred */
  route?: string;
  /** HTTP status for apiFetch failures */
  status?: number;
  /** client-reported APP_VERSION (server overrides with its own when present) */
  appVersion?: string;
}

/** Severity assigned deterministically at intake (no AI in v1). */
export type CapturedErrorSeverity = "low" | "medium" | "high" | "critical";
// [SCOPE 061] END
