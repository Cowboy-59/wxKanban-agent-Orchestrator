import { userInfo } from "os";
import pino, { type DestinationStream, type Logger } from "pino";
import type { RoomLinkInfo } from "../../../core/yappchatt";
import { redactSecrets } from "./redact";

// [SCOPE 144 / T024] BEGIN — Room Link alert and outage notice (FR-015, FR-017, FR-018)
//
// The bridge side of the Room Link reconnect. The client counts failed reconnects in a row and
// stamps the outage start and end; this module turns those into the words the developer and the
// room see, and into one structured Pino record each. Nothing here sends email or a push.
//
// Pino lines go to stderr, the same as the handoff log: the Cockpit parses stdout for the
// `[bridge] ready` line and the `[room-link]` lines below, and JSON must not be interleaved there.
// The record fields are an allow-list — times, counts, a masked reason — so the session cookie
// cannot reach a log line through a wrong object.

/** FR-015: an outage longer than this gets one room post and one terminal line on reconnect. */
export const ROOM_LINK_NOTICE_AFTER_MS = 5 * 60_000;

/** The retry interval once the backoff has reached its cap (mirrors the client's 15 s cap). */
const RETRY_CAP_SECONDS = 15;
const REASON_MAX = 200;

/** A Pino logger for Room Link events, writing JSON lines to stderr unless given a stream. */
export function createRoomLinkLogger(dest?: DestinationStream): Logger {
  return pino(
    { base: { component: "room-link" }, timestamp: pino.stdTimeFunctions.isoTime },
    dest ?? pino.destination({ dest: 2, sync: true }),
  );
}

/** HH:MM in the agent's local time. */
export function hhmm(at: Date): string {
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

/** A reason safe to print: secrets masked, capped at 200 characters. */
export function maskReason(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  const masked = redactSecrets(reason).text;
  return masked.length > REASON_MAX ? masked.slice(0, REASON_MAX) : masked;
}

/** Whole minutes between two ISO times, rounded to the nearest minute. */
function outageMinutes(startIso: string, endIso: string): number {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000);
}

/**
 * FR-015: the notice for an outage that has just ended, or undefined when it lasted 5 minutes or
 * less (a short drop is not worth a post).
 */
export function formatOutageNotice(startIso: string, endIso: string): string | undefined {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end) || end - start <= ROOM_LINK_NOTICE_AFTER_MS) return undefined;
  const n = outageMinutes(startIso, endIso);
  return (
    `Room link was down ${n} min (${hhmm(new Date(start))} to ${hhmm(new Date(end))}). ` +
    "Messages posted in that time may not have reached the agent; repeat anything that needs an answer."
  );
}

/** FR-017: the one terminal line raised on the 5th failed reconnect in a row. */
export function formatRoomLinkAlert(link: RoomLinkInfo): string {
  const since = Date.parse(link.since);
  const sinceText = Number.isNaN(since) ? "" : ` since ${hhmm(new Date(since))}`;
  const reason = maskReason(link.reason);
  return (
    `[room-link] ALERT: the room link has been down${sinceText}; ${link.failures} reconnects failed in a row` +
    `${reason ? ` (${reason})` : ""}. Still retrying every ${RETRY_CAP_SECONDS} s.`
  );
}

/** The developer who started the agent — the alert's owner. Best effort; never throws. */
export function roomLinkOwner(): string | undefined {
  try {
    const name = userInfo().username;
    return name && /^[A-Za-z0-9._@-]{1,64}$/.test(name) ? name : undefined;
  } catch {
    return undefined;
  }
}

/** FR-017: one structured error record for the alert, allow-listed fields only. */
export function logRoomLinkAlert(logger: Logger, link: RoomLinkInfo, owner: string | undefined): void {
  const safe: Record<string, string | number> = { event: "alert", roomLink: "error", failures: link.failures };
  if (!Number.isNaN(Date.parse(link.since))) safe.since = new Date(link.since).toISOString();
  const reason = maskReason(link.reason);
  if (reason) safe.reason = reason;
  if (owner) safe.owner = owner;
  logger.error(safe, "room link down: reconnects keep failing");
}

/** FR-015: one structured info record for an outage that has just ended. */
export function logRoomLinkOutage(logger: Logger, startIso: string, endIso: string, noticed: boolean): void {
  logger.info(
    {
      event: "restored",
      outageStartedAt: new Date(startIso).toISOString(),
      outageEndedAt: new Date(endIso).toISOString(),
      minutes: outageMinutes(startIso, endIso),
      noticed,
    },
    "room link restored",
  );
}
// [SCOPE 144 / T024] END
