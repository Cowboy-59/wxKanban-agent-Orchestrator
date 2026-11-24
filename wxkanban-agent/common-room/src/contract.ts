// Agent common room: the message contract (SPEC-159 FR-001, FR-091).
// This file imports nothing. The bridge and any other consumer use only what is exported from
// this module; the module never imports bridge internals or a database client (see
// scripts/check-imports.mjs, which fails the build on either).

// [SCOPE 159 / T002] BEGIN — Room message contract: version, shape and limits (FR-001, FR-091)
/** The version of the message contract. A message that names a different version is refused. */
export const CONTRACT_VERSION = "1.0.0";

/** The longest body a message may carry, in characters. A longer body is refused, never cut. */
export const BODY_MAX_CHARS = 4000;

export const SOURCES = ["local", "mailbox", "yappchatt"] as const;
export const TARGETS = ["agent", "kain", "peer", "worker"] as const;
export const KINDS = ["direction", "reply", "gate", "notice", "progress"] as const;
export const SENDER_KINDS = ["user", "worker", "manager", "kain", "agent", "system"] as const;

export type MessageSource = (typeof SOURCES)[number];
export type MessageTarget = (typeof TARGETS)[number];
export type MessageKind = (typeof KINDS)[number];
export type SenderKind = (typeof SENDER_KINDS)[number];

/**
 * Who sent a message, as worked out by whoever RECEIVED it. A sender never supplies this
 * (FR-001): a message that arrives with a sender in it is refused.
 */
export interface SenderStamp {
  kind: SenderKind;
  id: string;
  run?: string;
  unit?: string;
  persona?: string;
  model?: string;
}

/** The one message shape for every lane (local room, mailbox, YappChatt). */
export interface RoomMessage {
  contractVersion: string;
  seq: number;
  projectId: string;
  source: MessageSource;
  to: MessageTarget;
  kind: MessageKind;
  body: string;
  sender: SenderStamp;
  sentAt: string;
  deliveredAt: string | null;
  ackedAt: string | null;
  expiresAt: string | null;
}

/** Why a message was refused. Every refusal is counted (see RefusalCounter). */
export type RefusalCode =
  | "not_an_object"
  | "version_mismatch"
  | "sender_in_body"
  | "bad_project"
  | "bad_source"
  | "bad_to"
  | "bad_kind"
  | "body_missing"
  | "body_too_long"
  | "bad_field";

export interface Refusal {
  code: RefusalCode;
  detail: string;
}

export type ContractResult<T> = { ok: true; value: T } | { ok: false; refusal: Refusal };
// [SCOPE 159 / T002] END
