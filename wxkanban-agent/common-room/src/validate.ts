// The one contract validator (SPEC-159 FR-001): the same checks for the local room, the mailbox
// and YappChatt. Nothing here touches the clock, a file or the network; the caller passes the
// receiver's time, sequence number and sender stamp in.

import {
  BODY_MAX_CHARS,
  CONTRACT_VERSION,
  KINDS,
  SENDER_KINDS,
  SOURCES,
  TARGETS,
  type ContractResult,
  type MessageKind,
  type MessageSource,
  type MessageTarget,
  type Refusal,
  type RefusalCode,
  type RoomMessage,
  type SenderStamp,
} from "./contract";

// [SCOPE 159 / T002] BEGIN — Refusal counter (FR-001, FR-021)
/** Counts refusals by code, so "refused and counted" is something a test can read. */
export class RefusalCounter {
  private readonly counts = new Map<RefusalCode, number>();

  record(code: RefusalCode): void {
    this.counts.set(code, (this.counts.get(code) ?? 0) + 1);
  }

  count(code: RefusalCode): number {
    return this.counts.get(code) ?? 0;
  }

  total(): number {
    let sum = 0;
    for (const n of this.counts.values()) sum += n;
    return sum;
  }

  snapshot(): Partial<Record<RefusalCode, number>> {
    const out: Partial<Record<RefusalCode, number>> = {};
    for (const [code, n] of this.counts) out[code] = n;
    return out;
  }
}
// [SCOPE 159 / T002] END

// [SCOPE 159 / T002] BEGIN — Validation helpers
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const t = Date.parse(value);
  return !Number.isNaN(t) && new Date(t).toISOString() === value;
}

function refuse<T>(code: RefusalCode, detail: string, counter?: RefusalCounter): ContractResult<T> {
  counter?.record(code);
  return { ok: false, refusal: { code, detail } };
}

function versionRefusal(sent: unknown): Refusal {
  const shown = typeof sent === "string" && sent.length > 0 ? sent : "(none)";
  return {
    code: "version_mismatch",
    detail: `contract version mismatch: the message says "${shown}", this receiver speaks "${CONTRACT_VERSION}"`,
  };
}
// [SCOPE 159 / T002] END

// [SCOPE 159 / T002] BEGIN — Inbound check and receiver stamping (FR-001)
/** What the receiver knows and the sender must not be trusted to say. */
export interface ReceiveContext {
  /** The receiver's own clock reading: the server for the mailbox, the bridge for the local room. */
  now: Date;
  /** The next per-Project sequence number, assigned by the receiver. */
  nextSeq: number;
  /** Who sent it, worked out by the receiver from the connection, never from the message. */
  sender: SenderStamp;
  /** When set, a message for any other Project is refused. */
  expectedProjectId?: string;
  counter?: RefusalCounter;
}

/** Fields a sender may not set. They are ignored when present, except `sender`, which is refused. */
const RECEIVER_OWNED = ["seq", "sentAt", "deliveredAt", "ackedAt", "expiresAt"] as const;

/**
 * Check a message that arrived from a sender and, when it passes, return it with the
 * receiver's own seq, sentAt and sender stamped on. A `sender` in the body is refused and
 * counted. A `sentAt`, `seq`, `deliveredAt`, `ackedAt` or `expiresAt` in the body is ignored.
 */
export function receiveMessage(raw: unknown, ctx: ReceiveContext): ContractResult<RoomMessage> {
  const { counter } = ctx;
  if (!isRecord(raw)) return refuse("not_an_object", "a message must be a JSON object", counter);

  if (raw["contractVersion"] !== CONTRACT_VERSION) {
    const r = versionRefusal(raw["contractVersion"]);
    return refuse("version_mismatch", r.detail, counter);
  }
  if ("sender" in raw) {
    return refuse(
      "sender_in_body",
      "a message may not carry its own sender; the receiver stamps it",
      counter,
    );
  }
  if (typeof raw["projectId"] !== "string" || raw["projectId"].length === 0) {
    return refuse("bad_project", "projectId must be a non-empty string", counter);
  }
  if (ctx.expectedProjectId !== undefined && raw["projectId"] !== ctx.expectedProjectId) {
    return refuse("bad_project", "the message is for a different Project", counter);
  }
  if (!oneOf(SOURCES, raw["source"])) {
    return refuse("bad_source", `source must be one of ${SOURCES.join(", ")}`, counter);
  }
  if (!oneOf(TARGETS, raw["to"])) {
    return refuse("bad_to", `to must be one of ${TARGETS.join(", ")}`, counter);
  }
  if (!oneOf(KINDS, raw["kind"])) {
    return refuse("bad_kind", `kind must be one of ${KINDS.join(", ")}`, counter);
  }
  const body = raw["body"];
  if (typeof body !== "string" || body.length === 0) {
    return refuse("body_missing", "body must be a non-empty string", counter);
  }
  if (body.length > BODY_MAX_CHARS) {
    return refuse(
      "body_too_long",
      `body is ${body.length} characters; the limit is ${BODY_MAX_CHARS}`,
      counter,
    );
  }

  const message: RoomMessage = {
    contractVersion: CONTRACT_VERSION,
    seq: ctx.nextSeq,
    projectId: raw["projectId"],
    source: raw["source"] as MessageSource,
    to: raw["to"] as MessageTarget,
    kind: raw["kind"] as MessageKind,
    body,
    sender: { ...ctx.sender },
    sentAt: ctx.now.toISOString(),
    deliveredAt: null,
    ackedAt: null,
    expiresAt: null,
  };
  return { ok: true, value: message };
}

/** Which receiver-owned fields a raw message carried, so a caller can note they were ignored. */
export function ignoredFields(raw: unknown): string[] {
  if (!isRecord(raw)) return [];
  return RECEIVER_OWNED.filter((f) => f in raw);
}
// [SCOPE 159 / T002] END

// [SCOPE 159 / T002] BEGIN — Stored-message check (FR-001, FR-078)
function senderStampError(value: unknown): string | null {
  if (!isRecord(value)) return "sender must be an object";
  if (!oneOf(SENDER_KINDS, value["kind"])) return `sender.kind must be one of ${SENDER_KINDS.join(", ")}`;
  if (typeof value["id"] !== "string" || value["id"].length === 0) return "sender.id must be a non-empty string";
  for (const key of ["run", "unit", "persona", "model"] as const) {
    const v = value[key];
    if (v !== undefined && typeof v !== "string") return `sender.${key} must be a string when present`;
  }
  return null;
}

function nullableDate(value: unknown): boolean {
  return value === null || isIsoDate(value);
}

/**
 * Check a message that is already stamped, such as a line read back from the local journal or
 * the run log. Every field must be present and of the right type; the version must match.
 */
export function parseStoredMessage(raw: unknown, counter?: RefusalCounter): ContractResult<RoomMessage> {
  if (!isRecord(raw)) return refuse("not_an_object", "a message must be a JSON object", counter);
  if (raw["contractVersion"] !== CONTRACT_VERSION) {
    const r = versionRefusal(raw["contractVersion"]);
    return refuse("version_mismatch", r.detail, counter);
  }
  if (typeof raw["seq"] !== "number" || !Number.isInteger(raw["seq"]) || raw["seq"] < 1) {
    return refuse("bad_field", "seq must be a whole number of at least 1", counter);
  }
  if (typeof raw["projectId"] !== "string" || raw["projectId"].length === 0) {
    return refuse("bad_project", "projectId must be a non-empty string", counter);
  }
  if (!oneOf(SOURCES, raw["source"])) return refuse("bad_source", `source must be one of ${SOURCES.join(", ")}`, counter);
  if (!oneOf(TARGETS, raw["to"])) return refuse("bad_to", `to must be one of ${TARGETS.join(", ")}`, counter);
  if (!oneOf(KINDS, raw["kind"])) return refuse("bad_kind", `kind must be one of ${KINDS.join(", ")}`, counter);
  const body = raw["body"];
  if (typeof body !== "string" || body.length === 0) return refuse("body_missing", "body must be a non-empty string", counter);
  if (body.length > BODY_MAX_CHARS) {
    return refuse("body_too_long", `body is ${body.length} characters; the limit is ${BODY_MAX_CHARS}`, counter);
  }
  const senderError = senderStampError(raw["sender"]);
  if (senderError) return refuse("bad_field", senderError, counter);
  if (!isIsoDate(raw["sentAt"])) return refuse("bad_field", "sentAt must be an ISO date string", counter);
  for (const key of ["deliveredAt", "ackedAt", "expiresAt"] as const) {
    if (!nullableDate(raw[key])) return refuse("bad_field", `${key} must be an ISO date string or null`, counter);
  }
  return { ok: true, value: raw as unknown as RoomMessage };
}
// [SCOPE 159 / T002] END
