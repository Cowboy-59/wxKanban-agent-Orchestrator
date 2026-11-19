import pino, { type DestinationStream, type Logger } from "pino";

// [SCOPE 149 / T008] BEGIN — handoff audit lines with Pino, never the content (FR-017)
//
// One structured line per handoff event. The fields are an allow-list: an event name, the
// handoff's created-at time, counts, and a short fixed reason code. There is deliberately no
// field that can carry summary text or a file name, so a caller cannot leak content by
// passing the wrong object — anything outside the allow-list is dropped before Pino sees it.
//
// Lines go to stderr. The Cockpit matches the agent's `[bridge] ready` and
// `[project-agent] refused` lines on stdout, and the writer prints its one result line on
// stdout; neither may be interleaved with JSON log lines.

export type HandoffEvent = "queued" | "posted" | "replaced" | "expired" | "masked" | "ignored" | "denied";

export interface HandoffLogFields {
  /** The handoff's own created-at time (ISO), when known. */
  createdAt?: string;
  /** How many items the writer masked. */
  masked?: number;
  /** Size of the summary in characters. */
  chars?: number;
  /** A short fixed code (e.g. `oversize`, `symlink`, `stale`), never free text. */
  reason?: string;
  /** For `denied`: the tool name the handoff turn tried (a tool name, not its input). */
  tool?: string;
}

const REASON_RE = /^[a-z][a-z0-9_-]{0,39}$/;
const TOOL_RE = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;

/** A Pino logger for handoff events, writing JSON lines to stderr unless given a stream. */
export function createHandoffLogger(dest?: DestinationStream): Logger {
  return pino(
    { base: { component: "handoff" }, timestamp: pino.stdTimeFunctions.isoTime },
    dest ?? pino.destination({ dest: 2, sync: true }),
  );
}

/** Log one handoff event with allow-listed fields only. */
export function logHandoff(logger: Logger, event: HandoffEvent, fields: HandoffLogFields = {}): void {
  const safe: Record<string, string | number> = { event, at: new Date().toISOString() };
  if (typeof fields.createdAt === "string" && !Number.isNaN(Date.parse(fields.createdAt))) {
    safe.createdAt = new Date(fields.createdAt).toISOString();
  }
  if (typeof fields.masked === "number" && Number.isFinite(fields.masked)) safe.masked = Math.max(0, Math.trunc(fields.masked));
  if (typeof fields.chars === "number" && Number.isFinite(fields.chars)) safe.chars = Math.max(0, Math.trunc(fields.chars));
  if (typeof fields.reason === "string" && REASON_RE.test(fields.reason)) safe.reason = fields.reason;
  if (typeof fields.tool === "string" && TOOL_RE.test(fields.tool)) safe.tool = fields.tool;
  logger.info(safe, `handoff ${event}`);
}
// [SCOPE 149 / T008] END
