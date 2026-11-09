// [SCOPE 154 / T015] BEGIN — the waiting Autopilot question: timings, pass-through words, posts (FR-015)
// A unit session's live gate question (T013) used to wait forever on the next room message, and
// took whatever that message was as the answer — including the owner's own `status`. This module
// holds the pieces of the fix that need no bridge state: when the question is re-posted and parked,
// which words are never answers, and the exact lines the room sees.

/** The second (last-call) post of a waiting question, after it was first asked. */
export const AUTOPILOT_QUESTION_LAST_CALL_MS = 10 * 60_000;

/** An unanswered question parks itself this long after it was first asked. */
export const AUTOPILOT_QUESTION_PARK_MS = 15 * 60_000;

/** A question the bridge is holding: still waiting, or parked unanswered and kept for `status`. */
export interface AutopilotQuestion {
  scopeNum: string;
  question: string;
  askedAt: Date;
}

/** The question the bridge is waiting on right now — resolved by the owner's reply, PARK, or the 15-minute auto-park. */
export interface PendingAutopilotQuestion extends AutopilotQuestion {
  resolve: (answer: { decision: string; from: string } | undefined) => void;
  /** Re-opened by STATUS from the parked list (not asked live by a running unit). */
  broughtBack?: boolean;
}

/** Just the question, without the resolver — what the parked list keeps. */
export function toAutopilotQuestion(q: AutopilotQuestion): AutopilotQuestion {
  return { scopeNum: q.scopeNum, question: q.question, askedAt: q.askedAt };
}

const PASS_THROUGH = new Set(["STATUS", "PAUSE", "RESUME", "VERBOSE", "CONCISE", "STOP"]);

/** Control words that keep their meaning while a question waits — never recorded as its answer. */
export function isQuestionPassThrough(text: string): boolean {
  return PASS_THROUGH.has(text.trim().toUpperCase());
}

/** The first post of a waiting question. */
export function formatQuestionAsked(q: AutopilotQuestion): string {
  return [
    `Autopilot — SCOPE-${q.scopeNum} needs input:`,
    ``,
    `  "${q.question}"`,
    ``,
    `Reply with the answer, or PARK to leave it for the owner later.`,
  ].join("\n");
}

/** The second and last post, 10 minutes in. */
export function formatQuestionLastCall(q: AutopilotQuestion): string {
  return [
    `Autopilot — last call, SCOPE-${q.scopeNum} is still waiting on you:`,
    ``,
    `  "${q.question}"`,
    ``,
    `Reply with the answer, or PARK. It parks by itself in 5 minutes and the run moves on; after that, reply "status" to bring it back.`,
  ].join("\n");
}

/** Posted when the 15 minutes run out. */
export function formatQuestionAutoParked(q: AutopilotQuestion): string {
  return `Autopilot — no answer in 15 minutes, so SCOPE-${q.scopeNum}'s question is parked and the run moves on. Reply "status" to bring it back.`;
}

/** Posted when `status` re-opens a parked question. */
export function formatQuestionBroughtBack(q: AutopilotQuestion): string {
  return [
    `Autopilot — parked question from SCOPE-${q.scopeNum}:`,
    ``,
    `  "${q.question}"`,
    ``,
    `Reply with the answer, or PARK to leave it parked.`,
  ].join("\n");
}

/** Posted when `status` arrives while a question is still waiting: the question again, as asked. */
export function formatQuestionReminder(q: AutopilotQuestion): string {
  return [
    `Autopilot — SCOPE-${q.scopeNum} is waiting on you:`,
    ``,
    `  "${q.question}"`,
    ``,
    `Reply with the answer, or PARK.`,
  ].join("\n");
}

/** The heartbeat's extra line while a question waits. */
export function formatQuestionHeartbeatLine(q: AutopilotQuestion): string {
  return `Waiting on your answer — SCOPE-${q.scopeNum}: "${q.question}" Reply with the answer, or PARK.`;
}
// [SCOPE 154 / T015] END
