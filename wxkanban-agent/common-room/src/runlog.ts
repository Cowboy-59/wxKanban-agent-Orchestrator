// The run log line format (SPEC-159 FR-078): one JSON object per line, versioned, and read back
// with the same contract validator as a live message. This file only formats and parses; masking
// (T016) happens before a line is formatted, and writing the file is the caller's job.

import { type ContractResult, type Refusal, type RoomMessage } from "./contract";
import { parseStoredMessage } from "./validate";

// [SCOPE 159 / T002] BEGIN — Run log line format (FR-078)
/** The version of the run log line format. It is separate from the message contract version. */
export const RUN_LOG_FORMAT_VERSION = 1;

export interface RunLogLine {
  logVersion: number;
  loggedAt: string;
  message: RoomMessage;
}

/** One run log line, without a trailing newline. */
export function formatRunLogLine(message: RoomMessage, loggedAt: Date): string {
  const line: RunLogLine = {
    logVersion: RUN_LOG_FORMAT_VERSION,
    loggedAt: loggedAt.toISOString(),
    message,
  };
  return JSON.stringify(line);
}

function logRefusal(detail: string): ContractResult<RunLogLine> {
  return { ok: false, refusal: { code: "bad_field", detail } };
}

/** Read one run log line back. A different log version is refused and names both versions. */
export function parseRunLogLine(line: string): ContractResult<RunLogLine> {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return logRefusal("the line is not valid JSON");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return logRefusal("the line is not a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  if (obj["logVersion"] !== RUN_LOG_FORMAT_VERSION) {
    return logRefusal(
      `run log version mismatch: the line says "${String(obj["logVersion"])}", this reader speaks "${RUN_LOG_FORMAT_VERSION}"`,
    );
  }
  const loggedAt = obj["loggedAt"];
  if (typeof loggedAt !== "string" || Number.isNaN(Date.parse(loggedAt))) {
    return logRefusal("loggedAt must be an ISO date string");
  }
  const message = parseStoredMessage(obj["message"]);
  if (!message.ok) return message;
  return { ok: true, value: { logVersion: RUN_LOG_FORMAT_VERSION, loggedAt, message: message.value } };
}

export interface RunLogReadResult {
  lines: RunLogLine[];
  refused: Array<{ lineNumber: number; refusal: Refusal }>;
}

/** Read a whole run log file's text. Blank lines are skipped; bad lines are listed, not thrown. */
export function parseRunLog(text: string): RunLogReadResult {
  const result: RunLogReadResult = { lines: [], refused: [] };
  const rows = text.split(/\r?\n/);
  rows.forEach((row, index) => {
    if (row.trim().length === 0) return;
    const parsed = parseRunLogLine(row);
    if (parsed.ok) result.lines.push(parsed.value);
    else result.refused.push({ lineNumber: index + 1, refusal: parsed.refusal });
  });
  return result;
}
// [SCOPE 159 / T002] END
