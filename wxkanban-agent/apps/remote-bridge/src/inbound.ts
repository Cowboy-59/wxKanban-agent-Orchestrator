// The one inbound shape (SPEC-159 FR-003, FR-017). Every source (today's room, the local worker
// room) is turned into an InboundMessage before the bridge's one handler sees it. Pure: no I/O.

import type { RoomMessage } from "../../../common-room/src/index";
import { resolveCommand } from "./command-set"; // [SCOPE 159 / T022]

// [SCOPE 159 / T004] BEGIN — One inbound message shape and the devplan-list rule (FR-003, FR-017)
// MODIFIED-BY: [SCOPE 159 / T022] — the list's answers come from the one command list; a lane message is marked (FR-095)
export type InboundSource = "yappchatt" | "local";

export interface InboundMessage {
  source: InboundSource;
  /** The text the bridge acts on (supervisor tag already removed). */
  text: string;
  /** Display name of the author. */
  from: string;
  /** True for every worker and agent message, from every source (FR-003). */
  fromAgent: boolean;
  /** The poster's user id, when a person posted on a channel that knows it. */
  authorId?: string;
  /** A message the room replayed after a drop: discussion only. */
  replayed?: boolean;
  /** The Room's own flag for an agent-authored post (YappChatt isagent). */
  roomAgent?: boolean;
  /** Local-room seq, when the message came from the journal. */
  seq?: number;
  /** A listed command from the local session's command lane (.wxai/command/). It never settles a push or gated action (FR-095). */
  viaCommandLane?: boolean;
}

/** The only texts that answer a waiting devplan list: the list's answer commands (go, go debug, no, skip <num>). */
export function isListAnswer(text: string): boolean {
  return resolveCommand(text)?.kind === "answer";
}

/**
 * Does a waiting devplan list take this message as its answer?
 * New path: only go, no or skip. Old path (the one-release switch, FR-017): anything, as before.
 * CANCEL REMOTE never answers it.
 */
export function listTakesMessage(text: string, oldPath: boolean): boolean {
  if (text.trim().toUpperCase() === "CANCEL REMOTE") return false;
  return oldPath ? true : isListAnswer(text);
}

/** A worker or agent message as the session sees it: labeled so it is never taken for the owner. */
export function labelFromAgent(m: InboundMessage): string {
  return `[from-agent ${m.from}] ${m.text}`;
}

/** Turn a journaled local-room message into an inbound message. Always from-agent. */
export function fromLocalRoom(m: RoomMessage): InboundMessage {
  const who = m.sender.kind === "user" ? m.sender.id : `${m.sender.kind}:${m.sender.id}`;
  return {
    source: "local",
    text: m.body,
    from: who,
    fromAgent: m.sender.kind !== "user",
    authorId: m.sender.kind === "user" ? m.sender.id : undefined,
    seq: m.seq,
  };
}

/** The one-release switch for the old room-only path: option first, then WXAI_OLD_INBOUND=1. */
export function oldInboundPathOn(option: boolean | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (option !== undefined) return option;
  return env.WXAI_OLD_INBOUND === "1";
}
// [SCOPE 159 / T004] END
